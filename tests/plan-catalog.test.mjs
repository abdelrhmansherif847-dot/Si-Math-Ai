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
import { read, slice, inlineScripts, syntaxError, evalSnippet } from './_source.mjs';

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
                   credits_granted: 0, billing_cycle: 'none' } },
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
    { ROWS: rows, NEWP: NEW, esc: x => String(x), founderSlotsLeft: 12, selectPlan: () => {} },
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

t.done();
