// Drift guard for business constants that exist in more than one place.
//
// Full consolidation is not possible today: two of the four rank tables live in
// mock-exam.html and focus.html, which are FROZEN. This suite is the safe
// alternative — it cannot remove the duplication, but it makes any future
// divergence fail loudly instead of silently showing a student a different rank
// on different pages. See PRODUCTION-READINESS.md §5.
import { suite } from './_assert.mjs';
import { read, REPO } from './_source.mjs';
import { readdirSync } from 'node:fs';
import { resolve } from 'node:path';

const t = suite('constants-drift');

// ── Rank thresholds ────────────────────────────────────────────────────────
// Canonical: assets/ranks.js. chat.html, progress.html and profile.html now
// consume it. mock-exam.html still carries its own table because that file is
// FROZEN, and public.rank_for_xp() is authoritative for server-side writes —
// both are guarded here so a future edit to any of them fails loudly.
function normalise(pairs) {
  return pairs.sort((a, b) => a.min - b.min).map(r => `${r.min}:${r.name}`).join(' | ');
}
function ranksFromJs(file, re) {
  const m = read(file).match(re);
  if (!m) return null;
  return normalise([...m[0].matchAll(/name:\s*'([^']+)'[^}]*?min:\s*(\d+)|min:\s*(\d+)[^}]*?name:\s*'([^']+)'/g)]
    .map(x => ({ name: x[1] ?? x[4], min: +(x[2] ?? x[3]) })));
}
const canonical = ranksFromJs('assets/ranks.js', /var RANKS = \[[\s\S]*?\];/);
const guarded = {
  'mock-exam.html (frozen copy)': ranksFromJs('mock-exam.html', /const RANK_THRESHOLDS = \[[\s\S]*?\];/),
};
const sqlSrc = read('supabase/migrations/20260624_focus_xp.sql');
guarded['rank_for_xp (SQL)'] = normalise(
  [...sqlSrc.matchAll(/WHEN p_xp >=\s*(\d+) THEN '([^']+)'/g)]
    .map(m => ({ min: +m[1], name: m[2] }))
    .concat([{ min: 0, name: 'Beginner' }]));

t.section('Rank thresholds agree with assets/ranks.js');
const EXPECTED = '0:Beginner | 100:Learner | 300:Solver | 600:Scholar | 1000:Expert | 1500:Master | 2500:Elite Scholar';
t.ok('canonical table extracted from assets/ranks.js', canonical !== null);
t.is('canonical table is the expected ladder', canonical, EXPECTED);
for (const [where, val] of Object.entries(guarded)) {
  t.ok(`${where} extracted`, val !== null);
  t.is(`${where} matches assets/ranks.js`, val, canonical);
}

t.section('Consolidated pages hold no second copy');
for (const f of ['chat.html', 'progress.html', 'profile.html'])
  t.ok(`${f} declares no rank table of its own`, !/RANK_THRESHOLDS = \[|RANKS = \[/.test(read(f)));

// ── Generated-copy drift ───────────────────────────────────────────────────
t.section('Generated copies are byte-identical to their source');
const TAX_BANNER = '/* AUTO-GENERATED from taxonomy.core.js by scripts/sync-taxonomy.mjs — DO NOT EDIT. */\n';
const taxSrc = read('taxonomy.core.js');
for (const copy of ['taxonomy.js', 'supabase/functions/_shared/taxonomy.core.js'])
  t.ok(`${copy} in sync with taxonomy.core.js`, read(copy) === TAX_BANNER + taxSrc);

const SP_BANNER = '/* AUTO-GENERATED from supabase/functions/_shared/study-planner.core.js by scripts/sync-study-planner.mjs — DO NOT EDIT. */\n';
t.ok('study-planner.js in sync with the engine',
  read('study-planner.js') === SP_BANNER + read('supabase/functions/_shared/study-planner.core.js'));

t.section('The drift gate itself cannot self-repair');
// sync-study-planner.mjs used to write at module load, so importing it from the
// validator regenerated the file before the comparison — a gate that could
// never fail. The write must stay behind a direct-invocation guard.
const sync = read('scripts/sync-study-planner.mjs');
t.ok('sync write is guarded by a direct-invocation check', /const isMain =|if \(isMain\)/.test(sync));
t.ok('no unguarded top-level writeFileSync', !/^writeFileSync\(/m.test(sync));

// ── Credit cost fallback ───────────────────────────────────────────────────
t.section('Credit config keeps the DB authoritative');
const cc = read('credit-config.js');
t.ok('static costs are documented as a fallback only', /fallback used only before the live|DB is always authoritative/i.test(cc));
t.ok('a live config loader exists', /credit_costs/.test(cc));

// ── The daily free allowance is never a literal ────────────────────────────
// The FREE plan's daily_limit moved from 10 to 15. Three places in the frontend
// kept saying 10, because each held its own copy: the chat usage counter
// (`isPaid()?200:10`), its over-limit upsell (`daily_limit || 10`), and the
// pricing page's packs blurb ("their 10 daily messages"). The counter was the
// worst of the three — a free student watched a bar fill at 10 while the server
// let them through to 15.
//
// So this section does NOT assert that the pages say 15. Asserting the new
// number would reproduce the original defect one value later. It asserts the
// pages hold NO number at all and read plan_definitions.daily_limit instead,
// which is the same column consume_credits enforces.
t.section('The daily free allowance is read, never typed');

// Comments discuss the old literals on purpose; only shipped output counts.
const stripComments = (src) => src
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:'"`\\])\/\/[^\n]*/g, '$1');

const chatSrc    = read('chat.html');
const pricingSrc = read('pricing.html');
const catalogSrc = read('plan-catalog.js');
const chatOut    = stripComments(chatSrc);
const pricingOut = stripComments(pricingSrc);

t.ok('the catalogue exposes the per-plan daily limit',
  /dailyLimit:\s*dailyLimitOf/.test(catalogSrc) && /function dailyLimitOf/.test(catalogSrc));
t.ok('chat.html loads the plan catalogue',
  /<script src="plan-catalog\.js">/.test(chatSrc));
t.ok('the usage counter resolves its ceiling from the catalogue',
  /PlanCatalog\.dailyLimit\(/.test(chatOut));

t.ok('no hardcoded paid/free ceiling pair survives',
  !/isPaid\(\)\s*\?\s*\d+\s*:\s*\d+/.test(chatOut));
t.ok('no `daily_limit || <number>` fallback survives',
  !/daily_limit\s*\|\|\s*\d/.test(chatOut) && !/daily_limit\s*\|\|\s*\d/.test(pricingOut));
t.ok('the usageMax placeholder is not a number',
  !/id="usageMax">\s*\d/.test(chatSrc));

// The rendered-copy check. Catches a new literal written in prose, which is how
// the pricing-page sentence went stale in the first place.
for (const [label, out] of [['chat.html', chatOut], ['pricing.html', pricingOut]]) {
  const hits = [...out.matchAll(/\b\d+\s+(?:free|daily)\s+(?:messages?|questions?|analyses)/gi)]
    .map(m => m[0]);
  t.is(`${label} quotes no literal daily allowance`, hits, []);
}

// Red-capable by construction: this is the exact string that was live.
t.ok('the check would catch the original defect',
  /\b\d+\s+(?:free|daily)\s+(?:messages?|questions?|analyses)/i
    .test('Free plan users get their 10 daily messages first'));

// ── What daily_limit MEANS must not drift between server and pages ─────────
// consume_credits treated "has a daily_limit" as "that many free operations a
// day". FREE was the only plan with one, so nobody noticed until HERO — a
// 1,949 EGP plan — was authored with 200 and became free for its first 200
// messages daily.
//
// The rule now depends on whether the PLAN is a zero-price tier, and that test
// exists in three places: the SQL, chat.html's counter and pricing.html's copy.
// If they disagree, the page advertises one set of rules while the server
// enforces another — which is the whole shape of the original bug.
t.section('The free-tier test is the same on the server and in the pages');

const migDirs = ['supabase/migrations', 'supabase/migrations-pending'];
const migFile = migDirs.flatMap(d => {
  try { return readdirSync(resolve(REPO, d)).map(f => `${d}/${f}`); }
  catch { return []; }
}).filter(f => f.endsWith('.sql') && read(f).includes('v_is_free_tier'));

t.is('exactly one migration defines the free-tier predicate', migFile.length, 1);
if (migFile.length === 1) {
  const sql = read(migFile[0]);
  t.ok('the SQL keys on zero price AND zero grant',
    /coalesce\(amount_egp,\s*0\)\s*=\s*0\s+and\s+coalesce\(credits_granted,\s*0\)\s*=\s*0/i.test(sql));
  t.ok('the free-tier branch requires it (not just "has a daily_limit")',
    /IF\s+v_is_free_tier\s+AND\s+v_daily_limit\s+IS\s+NOT\s+NULL/i.test(sql));
  t.ok('an unknown plan falls to the PAID path, not the free one',
    /v_is_free_tier\s*:=\s*coalesce\(v_is_free_tier,\s*false\)/i.test(sql));
}

// Both pages must apply price === 0 AND credits === 0 — not price alone, which
// is what pricing.html used to do.
//
// EVERY definition, not "at least one". pricing.html declares isFreeTier twice
// (the feature copy and the usage widget); an earlier version of this check
// used a single .test() and stayed green when one of them was reverted to the
// price-only form. Collect them all and require each to name credits_granted.
for (const f of ['chat.html', 'pricing.html']) {
  const src = stripComments(read(f));
  const defs = [...src.matchAll(/isFreeTier[^\n]*?=[^\n;]+/g)].map(m => m[0]);
  t.ok(`${f} defines the free-tier test at least once`, defs.length > 0);
  const priceOnly = defs.filter(d => /price_egp/.test(d) && !/credits_granted/.test(d));
  t.is(`${f}: every free-tier test names credits_granted`, priceOnly, []);
}

t.ok('chat.html resolves the free-tier test from the catalogue, not a plan_code',
  !/planCode\s*===\s*['"]FREE['"]/.test(stripComments(chatSrc)));

// The paid meaning has to be stated where a paid student sees the number,
// otherwise "3 / 200" reads as a cap that will block them.
t.ok('the chat counter explains a paid plan\'s number',
  /suggested daily pace/i.test(chatSrc));
t.ok('the pricing usage note explains a paid plan\'s number',
  /suggested daily pace|not a limit/i.test(pricingSrc));
t.ok('the Owner Dashboard says which meaning applies',
  /hard cap/i.test(read('admin.html')) && /suggested daily pace/i.test(read('admin.html')));

t.done();
