// P4 — the calculator socket, and the end of a lie.
//
// Before P4, mock-exam.html rendered the literal string "Calculator Allowed" in
// three places, for every exam, reading no policy at all — so an EST Math 1
// student was told a calculator was allowed when the real policy is part 2
// only. This suite pins two things: the copy now comes from the registry, and
// with zero providers registered NOTHING anywhere offers an in-app calculator.
//
// Runs the real shipped module against the real registry. No policy fact is
// restated here; if a test knew the policy independently of the registry it
// could stay green while the two disagreed.
import { suite } from './_assert.mjs';
import { read, slice, evalSnippet } from './_source.mjs';

const t = suite('exam-calculator');

function makeCalc() {
  const root = {};
  evalSnippet(read('exam-registry.js'), { globalThis: root, window: root }, []);
  evalSnippet(read('exam-calculator.js'), { globalThis: root, window: root }, []);
  root.SiExamCalculator._reset();
  return { C: root.SiExamCalculator, R: root.SiExamRegistry };
}

// ───────────────────────────────────────────────────────────────────────────
t.section('Zero providers: the normal state, held everywhere');

{
  const { C, R } = makeCalc();
  t.is('no provider is registered', C.providerCount(), 0);
  t.ok('no exam has an in-app calculator',
    R.EXAM_CODES.every(c => C.isInAppAvailable(c) === false));
  t.ok('describe() reports inApp:false for every exam',
    R.EXAM_CODES.every(c => C.describe(c).inApp === false));

  // ── UPDATED 2026-08-28: the logic moved out of the frozen page ──────────
  //
  // This block once asserted that mock-exam.html contained no calculator
  // control of any kind, by grepping for names like `btnCalc` and `calcModal`.
  // That guarantee is gone by design. Two of its three greps would have kept
  // passing purely because the new code uses different names, which is the
  // vacuous-assertion failure this project audited for.
  //
  // What it tests now is the arrangement that replaced it: the frozen page
  // holds no calculator logic at all, and the reusable layer holds all of it.
  const page = read('mock-exam.html');
  const launcher = read('exam-calculator-launcher.js');

  // 1. The frozen page decides nothing. Every one of these would be a decision
  //    it had taken, and each is a reason to have to unfreeze it again.
  //
  //    Tested against the page's CODE. Comments are stripped, because prose
  //    explaining where the logic went is not logic; and `<script src>` lines
  //    are stripped, because a page cannot load a module without naming its
  //    file. Those two are the floor, and a test that fails on the floor tells
  //    you nothing. Everything else is a genuine opinion the page must not hold.
  const pageCode = page
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/<script src="[^"]*"[^>]*><\/script>/g, '');
  for (const [what, re] of [
    ['availability', /inApp/],
    ['the provider registry', /getProvider|providerCount/],
    ['mounting a provider', /\.mount\(/],
    ['the verification override', /desmos-check/],
    ['the workspace\'s styling', /\.xw-[a-z]/],
    ['which provider is used', /desmos|Desmos/i],
    ['the API key', /apiKey|SI_DESMOS_CONFIG/],
  ]) {
    t.ok(`the exam page holds no opinion about ${what}`, !re.test(pageCode));
  }

  // 2. Its entire share is script tags, one slot, and the Supabase handoff.
  t.ok('the page renders a slot rather than a control',
    /data-si-calculator-slot/.test(page));
  t.ok('and hands over its Supabase client rather than a second one being made',
    /globalThis\.SI_EXAM_SUPABASE = sb;/.test(page));

  // 3. The launcher is gated on the POLICY, not on anything it decides itself.
  // The production rule and the test override are separate functions, and the
  // only thing that may open the control is one of exactly those two.
  const policy = slice(launcher, 'function policyAllows(code) {', 'function available(code) {',
                       'policyAllows');
  const avail = slice(launcher, 'function available(code) {', 'function injectStyle',
                      'available');
  t.ok('the production rule is describe().inApp', /describe\(code\)/.test(policy)
    && /inApp/.test(policy));
  t.ok('availability is the policy or a declared override, and nothing else',
    /policyAllows\(code\)/.test(avail) && /overridden\(\)/.test(avail)
    && !/EXAM_CODES|isInAppAvailable|apiKey|localStorage/.test(avail));

  // THE OVERRIDES ARE A CLOSED LIST. There are two — the query-string flag a
  // verifier types, and reviewer mode, which exams.html turns on for an account
  // RLS actually served the Spine to. Both are internal evaluation under API
  // Terms §2.a and both label the control TEST. A third way in would be a way a
  // student could reach the calculator without a policy naming a provider,
  // which is the one thing this gate exists to stop, so the set is asserted
  // rather than left to grow.
  const over = slice(launcher, 'function overridden() {', 'function available(code) {',
                     'overridden');
  t.ok('the overrides are exactly the typed flag and reviewer mode',
    /checkMode\(\)/.test(over) && /reviewer/.test(over)
    && !/policyAllows|inApp|apiKey|localStorage|role|is_admin/.test(over));

  // Reviewer mode is set BY THE PAGE, never inferred here: only the page knows
  // who is looking, and the launcher must not grow its own opinion about roles.
  const setrev = slice(launcher, 'function setReviewer(on) {', 'function overridden',
                       'setReviewer');
  t.ok('reviewer mode is set by the page and reads no role itself',
    !/profiles|role|is_admin|supabase|fetch/.test(setrev));

  // And the exam page turns it on only once RLS has answered — a non-empty
  // library is the database's verdict, where the page's own role read is not.
  const exams = read('exams.html');
  t.ok('exams.html enables reviewer mode from the RLS answer, after the empty check',
    exams.indexOf('setReviewer(true)') > exams.indexOf("if (!forms.length)"));
  t.ok('and mock-exam.html, which is frozen, does not enable it at all',
    !/setReviewer/.test(read('mock-exam.html')));

  // The override is an EXACT match on '1' — never a truthy test, which would
  // make ?desmos-check=0 turn it on.
  const check = slice(launcher, 'function checkMode() {', 'function policyAllows',
                      'checkMode');
  t.ok('the override is an exact match on "1"', /q === '1'/.test(check));
  t.ok('and "0" clears it rather than merely failing to set it',
    /=== '0'/.test(check) && /removeItem/.test(check));
  // sessionStorage, not localStorage: a verification mode must not outlive the
  // tab it was switched on in. Tested against CODE — the comment above the
  // implementation names localStorage to explain why it is not used, and prose
  // explaining a choice is not the choice.
  const launcherCode = launcher.split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');
  t.ok('the override is remembered per TAB, never persistently',
    /sessionStorage/.test(launcherCode) && !/localStorage/.test(launcherCode));

  // 4. The key is never a literal, and never reaches a log. Both are enforced
  //    repo-wide by scripts/validate-desmos-activation.mjs; asserted here too
  //    because these two files are where a well-meant debug line would land.
  for (const f of ['exam-calculator-launcher.js', 'exam-calculator-config.js']) {
    const src = read(f);
    t.ok(`${f} logs no configuration value`,
      !/console\.\w+\([^)]*\b(cfg|config|apiKey|token|tok)\b/.test(src));
  }
}

t.section('Policy → copy: the registry is the source, per exam');

{
  const { C } = makeCalc();
  // These assert the MAPPING (state + wording family), with the inputs coming
  // from the live registry — not a re-declaration of the policy table.
  t.is('DSAT: provided on test day (byod:false)', C.describe('SAT_FULL').state, 'provided');
  t.is('DSAT text', C.describe('SAT_FULL').text, 'Calculator provided on test day');
  t.is('EST Math 1: bring your own', C.describe('EST_MATH_1').state, 'byod');
  t.is('EST Math 1 text', C.describe('EST_MATH_1').text, 'Calculator allowed — bring your own');
  t.is('EST Math 2 L1: bring your own', C.describe('EST_MATH_2_L1').state, 'byod');
  t.is('ACT: bring your own', C.describe('ACT_MATH').state, 'byod');
  t.is('PRACTICE: byod', C.describe('PRACTICE').state, 'byod');
  t.is('unknown exam yields null, not a guessed badge', C.describe('NOPE'), null);

  // The detail is the registry's own note, passed through untouched.
  const { R } = makeCalc();
  t.ok('detail === registry note for every exam',
    R.EXAM_CODES.every(c => C.describe(c).detail === R.calculatorPolicy(c).note));

  // Every current exam allows a calculator somewhere, so no 'warn' today; but
  // the mapping must handle a future allowed:false without a code change.
  t.ok('current exams all render info tone',
    R.EXAM_CODES.every(c => C.describe(c).tone === 'info'));
}

t.section('No badge claims live enforcement, for any exam');

{
  const { C, R } = makeCalc();
  // The system has no section model and enforces nothing. No badge may pretend
  // it knows which portion is running or that a rule is being applied. This was
  // written for the one exam that used to be 'partial'; it is asserted across
  // every exam now, which is strictly stronger and survives the policy change
  // that made the original target disappear.
  t.ok('no exam badge claims live enforcement', R.EXAM_CODES.every((c) => {
    const d = C.describe(c);
    return d && !/\bnow\b|currently|this section|enabled|disabled/i.test(d.text);
  }));
  // The correctness this replaced: EST Math 1's note told students a calculator
  // was permitted in part 2 only. It no longer may.
  const est = C.describe('EST_MATH_1');
  t.ok('EST Math 1 no longer claims a part-2-only calculator', !/part 2/i.test(est.detail));
  t.ok('EST Math 1 still says the student brings their own', /bring their own/i.test(est.detail));
}

t.section('The three badges are registry-driven — the hardcoded copy is gone');

{
  const page = read('mock-exam.html');
  // The literal that lied is gone from every template (one comment documents it).
  const templates = page.split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');
  t.is('hardcoded "Calculator Allowed" appears in ZERO code lines',
    (templates.match(/Calculator Allowed/g) || []).length, 0);
  t.is('calcBadge() is called at exactly the three historic sites',
    (page.match(/\$\{calcBadge\(/g) || []).length, 3);
  t.ok('the badge escapes the registry note into the tooltip',
    /title="\$\{esc\(d\.detail\)\}"/.test(page));
  t.ok('the badge builder consults describe(), nothing else',
    /window\.SiExamCalculator\?\.describe\(code\)/.test(page));
}

t.section('Provider registration works, is validated, and changes nothing today');

{
  const { C } = makeCalc();
  t.is('a provider without unmount is rejected',
    C.registerProvider('bad', { mount() {} }), false);
  t.is('a provider without mount is rejected',
    C.registerProvider('bad2', { unmount() {} }), false);
  t.is('null ids are rejected', C.registerProvider(null, { mount() {}, unmount() {} }), false);

  t.is('a valid provider registers',
    C.registerProvider('test-calc', { mount() {}, unmount() {} }), true);
  t.is('and is retrievable', typeof C.getProvider('test-calc'), 'object');

  // Registration alone must NOT light anything up: availability also requires
  // the REGISTRY policy to name that provider, and no policy does.
  const { R } = makeCalc();
  const { C: C2 } = makeCalc();
  C2.registerProvider('desmos-graphing', { mount() {}, unmount() {} });
  t.ok('registering a provider no policy names leaves every exam without one',
    R.EXAM_CODES.every(c => C2.isInAppAvailable(c) === false));
}

t.section('The socket is optional — never a dependency of the exam lifecycle');

{
  const page = read('mock-exam.html');
  // Every call site is optional-chained, so the page works if the file 404s.
  const lines = page.split('\n').filter(l => l.includes('SiExamCalculator'));
  t.ok('every page call site tolerates the module being absent',
    lines.length > 0 && lines.every(l => l.includes('SiExamCalculator?.')));
  // `(?<!!)` because a DOUBLE negation is a coercion, not a guard: `!!x?.y` is
  // the tolerant form this rule wants, and matching it reported the opposite of
  // the truth. Only a single `!` in front is a load guard.
  t.ok('the load guard does NOT require the calculator module',
    !/(?<!!)!window\.SiExamCalculator/.test(page));

  // The lifecycle knows nothing of it.
  for (const [fn, end] of [
    ['function tickTimer() {', 'function updateTimerDOM'],
    ['function finishCurrentModule(afterMs) {', 'function tickTimer() {'],
    ['async function doSave() {', 'function htmlSaving'],
  ]) {
    t.ok(`${fn.slice(9, 30)}… never touches the calculator`,
      !/SiExamCalculator/.test(slice(page, fn, end, fn)));
  }

  // And the module itself touches no exam state, storage or pipeline.
  const code = read('exam-calculator.js').split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');
  t.ok('the module reads no exam state object',
    !/\bs\.(timerSec|timerRunning|view|modulePlan|exam)\b/.test(code));
  t.ok('the module touches no storage or persistence',
    !/localStorage|simath_mock/.test(code));
  t.ok('the module knows nothing of saving or the analyzer',
    !/supabase|exam_mistakes|ExamMistakesLogger|MasteryEngine|weakness/i.test(code));
}

t.done();
