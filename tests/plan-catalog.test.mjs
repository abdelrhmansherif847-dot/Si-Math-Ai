// Guard for the plan catalogue: name, price and credits must live in exactly
// one place — public.plan_definitions — and reach every page from there.
//
// Before 20260802_plan_catalog_single_source.sql those three facts were stored
// in three tables (pricing_settings, plan_definitions, credit_packs) with
// nothing enforcing agreement, and five pages carried their own copies of plan
// names, prices and codes on top of that. The consolidation removed the
// duplication; this suite is what stops it coming back — a page that
// reintroduces its own plan table fails here rather than quietly showing a
// student a name or a price the owner already changed.
import { suite } from './_assert.mjs';
import { read, slice, inlineScripts, syntaxError, evalSnippet, REPO } from './_source.mjs';
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const t = suite('plan-catalog');

// These checks look for patterns that must not exist in shipped CODE. Comments
// explaining why a pattern was removed contain the pattern verbatim, so they
// have to be stripped first — otherwise documenting the bug re-triggers the
// guard against it. `//` is only treated as a comment when it does not follow a
// colon, so protocol-relative URLs and https:// survive.
function codeOnly(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

// Pages that render a plan name, price or credit figure.
const PLAN_PAGES = [
  'admin.html', 'pricing.html', 'manual-payment.html',
  'settings.html', 'profile.html', 'dashboard.html',
  'devices.html', 'login.html',
];

// ── No page keeps its own copy of the catalogue ────────────────────────────
t.section('No page carries a second copy of a plan name');

// A literal { PRO_MONTHLY: 'Pro Monthly', ... } style map — the exact shape
// that used to live in profile.html, dashboard.html and admin.html.
// The optional closing quote matters: settings.html wrote its map with QUOTED
// keys ('PRO_MONTHLY':'Pro Plan'), and an earlier version of this pattern
// required a bare key, so it sailed through the guard for a full review cycle.
// The trailing [A-Z][a-z] is what makes this a NAME map rather than any map
// keyed by plan_code. A plan_code mapped to a CSS class ('FREE':'free') or to
// another code ('pro' ? 'PRO_MONTHLY' : 'FREE') is fine — neither is a copy of
// a value the owner can edit. A plan_code mapped to Title Case prose
// ('PRO_MONTHLY':'Pro Plan') is exactly the duplication being guarded against.
const NAME_MAP = /\b(?:PRO_MONTHLY|PRO_ANNUAL|PRO_QUARTERLY|FOUNDER_ANNUAL|FOUNDER_MONTHLY|FREE)['"]?\s*:\s*['"][A-Z][a-z]/;
for (const f of PLAN_PAGES) {
  t.ok(`${f} declares no plan_code → display-name map`, !NAME_MAP.test(codeOnly(read(f))));
}

// The pack name → plan_code map in manual-payment.html was the sharpest edge:
// renaming a pack produced a plan_code that plan_definitions does not have, so
// approve_payment_request() raised "Unknown plan_code" and the student's
// payment could not be approved at all.
t.section('Packs resolve by key, not by name');
const mp = codeOnly(read('manual-payment.html'));
t.ok('manual-payment.html has no packCodeMap', !/packCodeMap/.test(mp));
t.ok('manual-payment.html reads plan_code from the pack row', /p\.plan_code\s*\|\|/.test(mp));
t.ok('no page compares a pack name to decide the BEST VALUE badge',
  !PLAN_PAGES.some(f => /name\s*===\s*['"]Value Pack['"]/.test(codeOnly(read(f)))));
t.ok('pricing.html reads is_best_value rather than a fixed card index',
  /is_best_value/.test(read('pricing.html')));

// ── No page hardcodes a price or a credit grant ────────────────────────────
t.section('No page hardcodes a live price or credit grant');
// The production catalogue as of the consolidation. These numbers must appear
// in NO page: every one of them is editable from the Owner Dashboard, so a page
// that spells one out is a page that will eventually lie.
const LIVE_PRICES  = [349, 899, 2999, 1499, 199, 649];
const LIVE_CREDITS = [3500, 10500, 42000];
for (const f of PLAN_PAGES) {
  const src = codeOnly(read(f));
  // Only look at code and text, not at colours (#f5b942), CSS lengths or the
  // millisecond timeouts that legitimately share these digits.
  const suspicious = [...LIVE_PRICES, ...LIVE_CREDITS].filter(n => {
    const re = new RegExp(`(?<![\\w#.\\-])${n}(?![\\w.])\\s*(?:EGP|egp|credits?)`, 'i');
    return re.test(src);
  });
  t.is(`${f} quotes no live price or credit amount inline`, suspicious, []);
}

// ── The shared module keeps the DB authoritative ───────────────────────────
t.section('plan-catalog.js keeps the DB authoritative');
const pc = read('plan-catalog.js');
t.ok('reads the catalogue from plan_definitions', /plan_definitions/.test(pc));
t.ok('documents that the DB is the single source of truth',
  /single source of truth/i.test(pc));
t.ok('holds no fallback table of plan names',
  !NAME_MAP.test(codeOnly(pc)));
t.ok('derives a placeholder name from the plan_code instead',
  /function humanize/.test(pc));

// The derivation has to actually work, or the pre-load state renders raw codes.
// Run the real shipped module, not a paraphrase of it.
const win = {};
evalSnippet(pc, { window: win }, []);
const humanize = win.PlanCatalog && win.PlanCatalog.humanize;
t.ok('module attaches PlanCatalog to window', typeof humanize === 'function');
if (typeof humanize === 'function') {
  t.is('humanize(PRO_MONTHLY)', humanize('PRO_MONTHLY'), 'Pro Monthly');
  t.is('humanize(FOUNDER_ANNUAL)', humanize('FOUNDER_ANNUAL'), 'Founder Annual');
  t.is('humanize(PACK_STARTER)', humanize('PACK_STARTER'), 'Pack Starter');
  t.is('humanize(null) is empty, not "null"', humanize(null), '');
  // Unloaded catalogue must degrade, never throw or invent a price.
  t.is('name() falls back to the derived label', win.PlanCatalog.name('PRO_ANNUAL'), 'Pro Annual');
  t.is('price() is null until loaded', win.PlanCatalog.price('PRO_ANNUAL'), null);
  t.is('credits() is null until loaded', win.PlanCatalog.credits('PRO_ANNUAL'), null);
  t.is('subscriptions() is empty until loaded', win.PlanCatalog.subscriptions(), []);
  t.is('isLoaded() is false until loaded', win.PlanCatalog.isLoaded(), false);
}

// ── Pages that render plan names actually load the catalogue ───────────────
t.section('Pages that show a plan name load the catalogue');
for (const f of ['profile.html', 'dashboard.html', 'admin.html']) {
  const src = read(f);
  t.ok(`${f} includes plan-catalog.js`, /<script src="plan-catalog\.js"><\/script>/.test(src));
  t.ok(`${f} calls PlanCatalog.load`, /PlanCatalog\.load\(sb\)/.test(src));
  t.ok(`${f} renders the name through PlanCatalog.name`, /PlanCatalog\.name\(/.test(src));
}

// ── The Owner Dashboard writes through the guarded RPC ─────────────────────
t.section('Owner Dashboard edits go through admin_update_plan');
const admin = codeOnly(read('admin.html'));
t.ok('Plans & Packs saves via the admin_update_plan RPC', /rpc\('admin_update_plan'/.test(admin));
t.ok('Plans & Packs reads via the admin_plan_catalog RPC', /rpc\('admin_plan_catalog'/.test(admin));
t.ok('the dashboard never writes plan tables directly',
  !/from\('(?:plan_definitions|pricing_settings|credit_packs)'\)\s*\.\s*(?:update|insert|upsert|delete)/.test(admin));
t.ok('plan_code is not editable from the dashboard', !/p_plan_code:\s*[^,\n]*name/i.test(admin));

// ── Every page still parses ────────────────────────────────────────────────
t.section('Edited pages still parse');
for (const f of PLAN_PAGES.concat(['plan-catalog.js'])) {
  const src = read(f);
  const blocks = f.endsWith('.js') ? [src] : inlineScripts(src);
  const errs = blocks.map((b, i) => syntaxError(b, `${f}#${i}`)).filter(Boolean);
  t.is(`${f} has no syntax errors`, errs, []);
}

// ── The migration is the only place the consolidation is defined ───────────
t.section('The consolidation migration says what it does');
// Applied 2026-08-02, so it lives in migrations/. The pending path is still
// tried, so this suite keeps working if the file is ever staged again.
let mig = '';
for (const p of ['supabase/migrations/20260802_plan_catalog_single_source.sql',
                 'supabase/migrations-pending/20260802_plan_catalog_single_source.sql']) {
  try { mig = read(p); break; } catch { /* try the next location */ }
}
t.ok('the consolidation migration exists', !!mig);
if (mig) {
  t.ok('it turns pricing_settings into a view', /create view public\.pricing_settings/.test(mig));
  t.ok('it turns credit_packs into a view', /create view public\.credit_packs/.test(mig));
  t.ok('it keeps the old tables for rollback', /rename to pricing_settings_legacy/.test(mig));
  t.ok('it aborts if the three copies have diverged', /diverged/i.test(mig));
  t.ok('it carries a rollback script', /ROLLBACK \(run only if/.test(mig));
  t.ok('admin_update_plan cannot change plan_code or kind',
    !/set[\s\S]{0,400}?\bplan_code\s*=\s*coalesce/i.test(mig));
}

// ── A plan the owner adds tomorrow renders correctly, with no code change ──
// Every assertion below runs the REAL shipped rendering code against a plan
// that follows none of the naming conventions the pages used to rely on: no
// PRO_ prefix, no _QUARTERLY suffix, on a quarterly cycle. Each one failed
// before the branches were moved onto catalogue columns.
t.section('A newly added plan renders correctly everywhere');
{
  const NEW = {
    plan_code: 'SCHOLAR_TERM', display_name: 'Scholar Term', kind: 'subscription',
    price_egp: 749, credits_granted: 9000, billing_cycle: 'quarterly',
    device_limit: 3, daily_limit: null, is_founder: false, active: true, sort_order: 9,
  };
  const catalog = {
    name: c => (c === NEW.plan_code ? NEW.display_name : c),
    get:  c => (c === NEW.plan_code ? NEW : null),
  };

  // profile.html — a paying student on this plan must not be shown as free.
  const profBadge = evalSnippet(
    slice(read('profile.html'), 'const planCode = (profile.plan_code', '  let html = `', 'profile badge'),
    { profile: { plan_code: NEW.plan_code, is_founder: false, subscription_expires_at: null },
      escHtml: x => String(x), PlanCatalog: catalog }, ['planBadge']
  ).planBadge.replace(/<[^>]*>/g, '');
  t.ok('profile.html names the new plan instead of showing the free badge',
    profBadge.includes('Scholar Term'));

  // dashboard.html — same student, hero badge.
  const dashBadge = evalSnippet(
    slice(read('dashboard.html'), 'var pc = (prof.plan_code', 'heroBadges.innerHTML = badge;', 'dash badge')
      .replace('if (!heroBadges) return;', ''),
    { prof: { plan_code: NEW.plan_code, is_founder: false }, esc: x => String(x),
      PlanCatalog: catalog, document: { getElementById: () => ({}) } }, ['badge']
  ).badge.replace(/<[^>]*>/g, '');
  t.ok('dashboard.html names the new plan instead of showing the free badge',
    dashBadge.includes('Scholar Term'));
  t.ok('dashboard.html does not offer a paying student an upgrade link',
    !dashBadge.includes('Upgrade'));

  // pricing.html — period and per-day figures come from billing_cycle.
  const pr = read('pricing.html');
  const priced = evalSnippet(
    slice(pr, 'function cycleLabel(cycle, code)', 'function openModal(', 'cycle helpers') +
    slice(pr, 'function buildPlanFeatures(plan)', '\nasync function loadPage', 'features') + `
      const feats = buildPlanFeatures(P);
      const cyc = cycleLabel(P.billing_cycle, P.plan_code);
      const perDay = Math.round(P.credits_granted / cycleDays(P.billing_cycle, P.plan_code));
      const freeF = buildPlanFeatures(F);`,
    { P: NEW, F: { plan_code: 'FREE', price_egp: 0, daily_limit: 15, device_limit: 2,
                   credits_granted: 0, billing_cycle: 'none' },
      // The page consults window.PlanCatalog when it is present; an empty
      // window exercises the fallback path instead.
      window: {} },
    ['feats', 'cyc', 'perDay', 'freeF']);
  t.is('pricing.html prices the new plan per its billing_cycle', priced.cyc, '/ 3 months');
  t.ok('pricing.html states the real credit period',
    priced.feats[0].text.includes('9,000 credits / 3 months'));
  t.is('pricing.html divides per-day credits by the real period', priced.perDay, Math.round(9000 / 91));
  t.is('pricing.html still detects the free tier by price', priced.freeF[0].text, '15 AI messages per day');

  // manual-payment.html — checkout card, entry-plan reference, Founder styling.
  const rows = [
    { plan_code: 'PRO_MONTHLY', display_name: 'Pro Monthly', price_egp: 349, credits_granted: 3500, billing_cycle: 'monthly', is_founder: false, device_limit: 3 },
    NEW,
    { plan_code: 'FOUNDER_ANNUAL', display_name: 'Founder Annual', price_egp: 1499, credits_granted: 42000, billing_cycle: 'annual', is_founder: true, device_limit: 3 },
    { plan_code: 'PRO_ANNUAL', display_name: 'Pro Annual', price_egp: 2999, credits_granted: 42000, billing_cycle: 'annual', is_founder: false, device_limit: 3 },
  ];
  const co = evalSnippet(
    slice(read('manual-payment.html'), 'let planByCode = {};', 'function selectKind(', 'checkout') + `
      planRows = ROWS; ROWS.forEach(p => planByCode[p.plan_code] = p);
      const cardNew = renderPlanCard(NEWP, {});
      const featsNew = featuresFor(NEWP);
      const cardFounder = renderPlanCard(ROWS[2], {});`,
    { ROWS: rows, NEWP: NEW, esc: x => String(x), founderSlotsLeft: 12, selectPlan: () => {},
      window: {} },
    ['cardNew', 'featsNew', 'cardFounder']);
  t.ok('checkout renders a card for the new plan', co.cardNew.includes('Scholar Term'));
  t.ok('checkout labels its cycle QUARTERLY', co.cardNew.includes('QUARTERLY'));
  t.ok('checkout prices it per 3 months', co.cardNew.includes('EGP / 3 months'));
  t.is('checkout names the real entry plan in its features', co.featsNew[0], 'Everything in Pro Monthly');
  t.ok('checkout states the real credit period',
    co.featsNew.some(f => f.includes('9,000 credits / 3 months')));
  t.ok('Founder styling follows is_founder, not a literal code', co.cardFounder.includes('FOUNDER'));
  t.ok('Founder discount is computed against the annual plan',
    co.cardFounder.includes('50% off Pro Annual'));
}

// ── device_limit is a plan column, not a constant ──────────────────────────
t.section('No page assumes a device limit');
// can_register_device() enforces pricing_settings.device_limit. Four pages used
// to hardcode "FREE ? 2 : 3", so a plan with any other limit made the UI and
// the server disagree — and made the admin panel accuse innocent students.
for (const f of ['admin.html', 'devices.html', 'login.html']) {
  const src = codeOnly(read(f));
  const bare = /===?\s*'FREE'\s*\)?\s*\?\s*2\s*:\s*3/.test(src);
  const derived = /device_limit/.test(src);
  t.ok(`${f} reads device_limit from the catalogue`, derived);
  t.ok(`${f} keeps the 2-or-3 literal only as a guarded fallback`,
    !bare || /PlanCatalog\.get\(/.test(src));
}

// ── Feature entitlement is a catalogue question, not a list of codes ───────
t.section('Focus D1/D2 entitlement is catalogue-driven');
{
  // focus.html gated D1 signal writes and D2 focus mastery on a hardcoded array
  // of four plan codes, so a plan added in Owner → Plans & Packs silently
  // withheld those features from students who had paid for it. Run the real
  // gate, not a paraphrase.
  const gate = slice(read('focus.html'), '// Live-stage eligibility gate.', '// Task-clear emit.', 'D1 gate');
  const CAT = {
    FREE:            { kind: 'subscription', price_egp: 0,    active: true  },
    PRO_MONTHLY:     { kind: 'subscription', price_egp: 349,  active: true  },
    PRO_QUARTERLY:   { kind: 'subscription', price_egp: 899,  active: true  },
    PRO_ANNUAL:      { kind: 'subscription', price_egp: 2999, active: true  },
    FOUNDER_ANNUAL:  { kind: 'subscription', price_egp: 1499, active: true  },
    FOUNDER_MONTHLY: { kind: 'subscription', price_egp: 249,  active: false },
    SCHOLAR_TERM:    { kind: 'subscription', price_egp: 749,  active: true  },
    PACK_VALUE:      { kind: 'pack',         price_egp: 349,  active: true  },
  };
  const cat = loaded => ({ isLoaded: () => loaded, get: c => CAT[c] || null });
  const run = (code, uid, loaded, live = true) =>
    evalSnippet(gate + '\nconst R = d1UserEligible();', {
      window: { _planCode: code, _uid: uid, PlanCatalog: cat(loaded) },
      PlanCatalog: cat(loaded), D1_LIVE_ENABLED: live,
    }, ['R']).R;

  // Parity with the array this replaced — nobody's access may change.
  const OLD = ['FOUNDER_ANNUAL', 'PRO_MONTHLY', 'PRO_QUARTERLY', 'PRO_ANNUAL'];
  for (const c of ['FREE', 'PRO_MONTHLY', 'PRO_QUARTERLY', 'PRO_ANNUAL', 'FOUNDER_ANNUAL'])
    t.is(`${c} decides exactly as the old list did`, run(c, 'u1', true), OLD.includes(c));

  // The point of the change.
  t.ok('a plan added tomorrow is eligible with no code edit', run('SCHOLAR_TERM', 'u1', true) === true);
  t.ok('a retired paid plan keeps grandfathered access', run('FOUNDER_MONTHLY', 'u1', true) === true);

  // It must not become a way in.
  t.ok('FREE is never eligible', run('FREE', 'u1', true) === false);
  t.ok('FREE is never eligible even with no catalogue', run('FREE', 'u1', false) === false);
  t.ok('a credit pack is not a subscription', run('PACK_VALUE', 'u1', true) === false);
  t.ok('an unknown code is refused when the catalogue is loaded', run('BOGUS', 'u1', true) === false);
  t.ok('no user id is refused (RLS could not be satisfied)', run('PRO_ANNUAL', null, true) === false);
  t.ok('a null plan_code is refused', run(null, 'u1', true) === false);
  t.ok('the D1_LIVE_ENABLED kill switch still wins', run('PRO_ANNUAL', 'u1', true, false) === false);

  // A failed catalogue read must not silently switch the feature off.
  for (const c of ['PRO_MONTHLY', 'FOUNDER_ANNUAL', 'SCHOLAR_TERM'])
    t.ok(`${c} keeps access when the catalogue is unavailable`, run(c, 'u1', false) === true);
}

// ── Nowhere in the repo may hand-maintain a list of plan codes ─────────────
t.section('No hardcoded plan-code list survives anywhere');
{
  // An array literal holding a plan code is a list someone has to remember to
  // edit when a plan is added. focus.html's D1_ELIGIBLE_PLANS was the last one.
  const LIST = /\[[^\]\n]*?['"](?:PRO_[A-Z_]+|FOUNDER_[A-Z_]+|PACK_[A-Z_]+)['"][^\]\n]*?\]/;
  const SKIP = new Set(['.git', 'node_modules', 'supabase', 'docs', 'scripts', 'tests']);
  const walk = (dir, out = []) => {
    for (const e of readdirSync(dir)) {
      if (SKIP.has(e) || e.startsWith('.')) continue;
      const full = join(dir, e);
      if (statSync(full).isDirectory()) walk(full, out);
      else if (/\.(html|js|mjs)$/.test(e)) out.push(relative(REPO, full));
    }
    return out;
  };
  const offenders = walk(REPO).filter(f => LIST.test(codeOnly(read(f))));
  t.is('no production file hand-maintains a plan-code list', offenders, []);
}

// ── Authoring: a plan is a record, not a code change ──────────────────────
t.section('The Owner Dashboard can author a whole plan');
{
  const admin = read('admin.html');
  // Every field the owner asked to configure must actually be on the form.
  // This list IS the spec; a field quietly dropped fails here.
  const FIELDS = {
    'plan name': 'pbName', 'internal plan code': 'pbCode', 'plan type': 'pbKind',
    'billing cycle': 'pbCycle', 'price': 'pbPrice', 'currency': 'pbCurrency',
    'credits': 'pbCredits', 'device limit': 'pbDevices', 'display order': 'pbOrder',
    'active/inactive': 'pbActive', 'badge': 'pbBadge', 'badge text': 'pbBadgeText',
    'theme colour': 'pbTheme', 'accent colour': 'pbAccent', 'icon': 'pbIcon',
    'short description': 'pbShort', 'full description': 'pbFull',
    'feature list': 'pbFeatures', 'CTA text': 'pbCtaText', 'CTA destination': 'pbCtaHref',
    'visibility': 'pbVisibility',
  };
  for (const [label, id] of Object.entries(FIELDS)) {
    t.ok(`the form has a ${label} field`, new RegExp(`id="${id}"`).test(admin));
  }

  // The vocabularies the owner asked for.
  for (const k of ['subscription', 'pack', 'lifetime', 'custom'])
    t.ok(`plan type offers ${k}`, new RegExp(`<option value="${k}"`).test(admin));
  for (const c of ['monthly', 'quarterly', 'semiannual', 'annual', 'one_time', 'custom'])
    t.ok(`billing cycle offers ${c}`, new RegExp(`<option value="${c}"`).test(admin));
  for (const b of ['best_value', 'most_popular', 'new', 'limited', 'custom'])
    t.ok(`badge offers ${b}`, new RegExp(`<option value="${b}"`).test(admin));
  for (const v of ['public', 'hidden', 'internal'])
    t.ok(`visibility offers ${v}`, new RegExp(`<option value="${v}"`).test(admin));

  // Unlimited features, with the four operations the owner asked for.
  t.ok('features can be added', /function pbAddFeature/.test(admin));
  t.ok('features can be edited', /function pbFeatureEdit/.test(admin));
  t.ok('features can be removed', /function pbRemoveFeature/.test(admin));
  t.ok('features can be reordered', /function pbMoveFeature/.test(admin));
  t.ok('the feature list has no fixed size', !/pbState\.features\.length\s*[<>]=?\s*\d/.test(codeOnly(admin)));

  // Lifecycle and preview.
  // These three go through the shared pbLifecycle() helper rather than three
  // literal sb.rpc() calls, so the assertion looks for the RPC name itself.
  t.ok('a plan can be duplicated', /'admin_duplicate_plan'/.test(admin));
  t.ok('a plan can be archived', /'admin_archive_plan'/.test(admin));
  t.ok('an archived plan can be restored', /'admin_restore_plan'/.test(admin));
  t.ok('every lifecycle call is dispatched through one guarded helper',
    /async function pbLifecycle/.test(admin));
  t.ok('the card is previewed before saving', /id="pbPreview"/.test(admin) && /function pbRender/.test(admin));
  t.ok('saving goes through the guarded authoring RPC', /rpc\('admin_upsert_plan'/.test(admin));

  // Create must not silently become edit — the defect the probe caught.
  t.ok('the form declares create vs update explicitly',
    /mode:\s*pbState\.editing\s*\?\s*'update'\s*:\s*'create'/.test(admin));
  // plan_code is the join key: editable while creating, frozen once saved.
  t.ok('plan_code is frozen when editing an existing plan',
    /pbEl\('pbCode'\)\.disabled = editing/.test(admin));
}

// ── The catalogue module carries the authoring surface ────────────────────
t.section('plan-catalog.js exposes the authored metadata');
{
  const w = {};
  evalSnippet(read('plan-catalog.js'), { window: w }, []);
  const P = w.PlanCatalog;
  for (const fn of ['badge', 'features', 'periodLabel', 'formatPrice', 'icon',
                    'themeColor', 'accentColor', 'ctaText', 'ctaHref', 'plans', 'ofKind'])
    t.ok(`PlanCatalog.${fn} exists`, typeof P[fn] === 'function');

  // Every non-pack kind counts as a plan, or a lifetime plan silently vanishes
  // from anything reasoning about "the plans on offer".
  t.is('planKinds spans every non-pack kind', P.planKinds().sort(),
    ['custom', 'lifetime', 'subscription']);

  // Unloaded must degrade, never throw.
  t.is('badge() on an unknown plan is null', P.badge('NOPE'), null);
  t.is('features() on an unknown plan is empty', P.features('NOPE'), []);
  t.is('formatPrice() on an unknown plan is empty', P.formatPrice('NOPE'), '');
  t.is('periodLabel() on an unknown plan is empty', P.periodLabel('NOPE'), '');
}

// ── Visibility is enforced by the pages, not just stored ──────────────────
t.section('Hidden and archived plans stay off the public pages');
for (const f of ['pricing.html', 'manual-payment.html', 'settings.html']) {
  const src = codeOnly(read(f));
  t.ok(`${f} filters on visibility`, /visibility\s*===?\s*'public'|visibility === undefined/.test(src));
  t.ok(`${f} excludes archived plans`, /archived_at/.test(src));
}

// ── Authored copy wins, and its absence is not a blank card ───────────────
t.section('Authored content overrides, absence falls back');
for (const f of ['pricing.html', 'manual-payment.html']) {
  const src = read(f);
  t.ok(`${f} prefers the plan's own feature list`,
    /Array\.isArray\(p(lan|ack)\.features\)\s*&&\s*p(lan|ack)\.features\.length/.test(src));
}
t.ok('pricing.html renders the authored badge', /plan\.badge_text/.test(read('pricing.html')));
t.ok('pricing.html renders the authored icon', /plan\.icon/.test(read('pricing.html')));
t.ok('pricing.html renders the authored CTA', /plan\.cta_href/.test(read('pricing.html')));
t.ok('pricing.html honours the plan currency', /plan\.currency/.test(read('pricing.html')));

// ── The authoring migration says what it does ─────────────────────────────
t.section('The authoring migration is present and honest');
{
  let m = '';
  for (const p of ['supabase/migrations/20260802d_plan_catalog_v2_authoring.sql',
                   'supabase/migrations-pending/20260802d_plan_catalog_v2_authoring.sql']) {
    try { m = read(p); break; } catch { /* next */ }
  }
  t.ok('the authoring migration exists', !!m);
  if (m) {
    t.ok('it widens the plan kinds', /'lifetime'[\s\S]{0,40}'custom'/.test(m));
    t.ok('it widens the billing cycles', /semiannual/.test(m));
    t.ok('it makes is_best_value generated from badge',
      /generated always as \(badge = 'best_value'\) stored/.test(m));
    t.ok('it teaches fulfilment the new kinds', /_one_time/.test(m));
    t.ok('it states that currency is quoted, not settled',
      /Currency is a presentation field|quoted.*settled|settled in EGP/i.test(m));
    t.ok('it records the create-vs-update defect the probe found', /mode/.test(m) && /silently UPDATED a live plan/i.test(m));
    t.ok('it carries a rollback', /ROLLBACK/.test(m));
    t.ok('archiving never deletes', /Deleting is never offered/i.test(m));
  }
}

// ── The cycle vocabulary must not go stale on the pages ──────────────────
t.section('Every billing cycle the database accepts is understood by the pages');
{
  // The database learned `semiannual` before the pages did, so a semiannual
  // plan was advertised "/ month" and its per-day credit figure divided by 30
  // instead of 182. Caught by comparing the dashboard preview against the
  // rendered card. Both now delegate to plan-catalog.js, which owns the one
  // definition — this asserts every cycle survives the round trip.
  const winPC = {};
  evalSnippet(read('plan-catalog.js'), { window: winPC }, []);
  const pr = read('pricing.html');
  const helpers = slice(pr, 'function cycleLabel(cycle, code)', 'function openModal(', 'cycle helpers');

  const run = (cycle, win) => evalSnippet(
    helpers + '\nconst L = cycleLabel(C, null);\nconst D = cycleDays(C, null, null);',
    { C: cycle, window: win }, ['L', 'D']);

  const EXPECT = {
    monthly:    { label: '/ month',    days: 30  },
    quarterly:  { label: '/ 3 months', days: 91  },
    semiannual: { label: '/ 6 months', days: 182 },
    annual:     { label: '/ year',     days: 365 },
    one_time:   { label: '',           days: 30  },
    custom:     { label: '',           days: 30  },
  };
  for (const [cycle, want] of Object.entries(EXPECT)) {
    // With the module loaded — the path a browser actually takes.
    t.is(`${cycle} label, module path`, run(cycle, winPC).L, want.label);
    // And without it — the fallback for a page that loads before the module.
    t.is(`${cycle} label, fallback path`, run(cycle, {}).L, want.label);
  }
  t.is('semiannual divides by 182, not 30', run('semiannual', winPC).D, 182);
  t.is("a plan's own period_days wins over any named cycle",
    evalSnippet(helpers + '\nconst D = cycleDays("custom", null, 200);', { window: winPC }, ['D']).D, 200);

  // The module is the single definition; the pages must actually consult it.
  for (const f of ['pricing.html', 'manual-payment.html']) {
    t.ok(`${f} loads plan-catalog.js`, /<script src="plan-catalog\.js"><\/script>/.test(read(f)));
    t.ok(`${f} delegates the cycle vocabulary to it`,
      /window\.PlanCatalog\.(periodLabel|monthsIn)/.test(read(f)));
  }
  t.is('the module knows semiannual', winPC.PlanCatalog.monthsIn('semiannual'), 6);
  t.is('the module gives no period for a one-time cycle',
    winPC.PlanCatalog.periodLabel({ billing_cycle: 'one_time' }), '');
}

// ── subscriptions.plan_type is not a plan_code ─────────────────────────────
// subscriptions_plan_type_check permits six legacy codes and nothing else, so
// writing a plan_code into plan_type works only while every plan happens to be
// one of those six. Plan Catalog V2 ended that: the owner authored HERO
// (semiannual, 182 days) and approving it raised
//   new row for relation "subscriptions" violates check constraint
//   "subscriptions_plan_type_check"
//
// The column is nullable, nothing reads it, and plan_code on the same row
// carries the exact value — so the client writes nothing and the server writes
// a mapped category. These guard both halves.
t.section('plan_type is never written as a raw plan_code');

const SUBS_WRITERS = readdirSync(REPO)
  .filter(f => /\.(html|js)$/.test(f) && f !== 'knowledge-graph.json');

for (const f of SUBS_WRITERS) {
  const src = read(f);
  if (!/from\('subscriptions'\)/.test(src)) continue;
  // A page may SELECT plan_type (pricing.html does, and ignores the value).
  // Assigning to it is the defect: `plan_type: <something>` in an object literal.
  const writes = [...src.matchAll(/plan_type\s*:\s*[^,\n}]+/g)].map(m => m[0].trim());
  t.is(`${f} assigns no plan_type`, writes, []);
}

// Admin's plan editor writes plan_definitions.daily_limit etc, not this column —
// so the check above must not be vacuous. Prove the pattern would fire.
t.ok('the check would catch the original defect',
  /plan_type\s*:\s*[^,\n}]+/.test('plan_type: selectedPlanCode,'));

t.done();
