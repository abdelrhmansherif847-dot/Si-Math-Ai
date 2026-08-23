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

  // The page must render no calculator control of any kind.
  const page = read('mock-exam.html');
  t.ok('no calculator button exists in the page',
    !/btnCalc|calculator-btn|openCalculator|id="calc/i.test(page));
  t.ok('no calculator panel or modal exists in the page',
    !/calcPanel|calculator-panel|calcModal/i.test(page));
  t.ok('the page never calls mount()', !/SiExamCalculator[.?]*\.getProvider|\.mount\(/.test(page));
}

t.section('Policy → copy: the registry is the source, per exam');

{
  const { C } = makeCalc();
  // These assert the MAPPING (state + wording family), with the inputs coming
  // from the live registry — not a re-declaration of the policy table.
  t.is('DSAT: provided on test day (byod:false)', C.describe('SAT_FULL').state, 'provided');
  t.is('DSAT text', C.describe('SAT_FULL').text, 'Calculator provided on test day');
  t.is('EST Math 1: partial', C.describe('EST_MATH_1').state, 'partial');
  t.is('EST Math 1 text is the honest qualified one',
    C.describe('EST_MATH_1').text, 'Calculator permitted during designated portions');
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

t.section('The partial state claims no live enforcement');

{
  const { C } = makeCalc();
  const d = C.describe('EST_MATH_1');
  // The system has no section model. The wording must not pretend it knows
  // which portion is running or that anything is being enforced.
  t.ok('no "now"/"currently"/"this section" claim in the partial text',
    !/\bnow\b|currently|this section|enabled|disabled/i.test(d.text));
  t.ok('the registry note carries the specifics (part 2, BYOD)',
    /part 2/i.test(d.detail) && /bring their own/i.test(d.detail));
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
  t.ok('the load guard does NOT require the calculator module',
    !/!window\.SiExamCalculator/.test(page));

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
