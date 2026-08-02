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
import { read, inlineScripts, syntaxError, evalSnippet } from './_source.mjs';

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
];

// ── No page keeps its own copy of the catalogue ────────────────────────────
t.section('No page carries a second copy of a plan name');

// A literal { PRO_MONTHLY: 'Pro Monthly', ... } style map — the exact shape
// that used to live in profile.html, dashboard.html and admin.html.
const NAME_MAP = /\b(?:PRO_MONTHLY|PRO_ANNUAL|PRO_QUARTERLY|FOUNDER_ANNUAL|FREE)\s*:\s*['"]/;
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

t.done();
