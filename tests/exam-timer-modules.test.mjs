// P2 — the DSAT module state machine.
//
// The point of this phase is NOT that a second screen exists. It is that
// tickTimer() used to do five things at once — stop the heartbeat, release tab
// ownership, clear persisted state, stamp endedAt, go to RESULTS — all of which
// are right for the end of an EXAM and wrong for the end of a MODULE. Doing them
// at a boundary would let a sibling tab claim the sitting, lose the whole exam on
// a refresh, and record a finish time 35 minutes early.
//
// So most of this suite is about what must NOT happen at a module boundary.
//
// It runs the REAL shipped functions, sliced out of mock-exam.html and executed
// against stub storage — not a paraphrase of them. tests/_source.mjs exists for
// exactly this, and a paraphrase here would be worthless: the bugs this guards
// against live in which side effect fires where.
import { suite } from './_assert.mjs';
import { read, slice, evalSnippet } from './_source.mjs';

const t = suite('exam-timer-modules');

// ── Build a sandbox holding the real persistence + module-exit code ─────────
function makeEnv() {
  const store = {};
  const root = {};
  // evalSnippet spreads `globals` into a NEW sandbox object, so reassigning a
  // seeded global from out here would never reach the vm context. `s` is
  // therefore ONE object whose properties are mutated in place — the same
  // identity the page's own code holds.
  const S = {};
  evalSnippet(read('exam-registry.js'), { globalThis: root, window: root }, []);

  const env = {
    window: root,
    localStorage: {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: k => { delete store[k]; },
    },
    setInterval: () => 1,
    clearInterval: () => {},
    setTimeout: (fn) => { fn(); return 1; },   // run deferred work immediately
    crypto: { randomUUID: () => 'test-tab-0000' },
    EXAM_CONFIGS: root.SiExamRegistry.compat(),
    s: S,
    render: () => { env.__renders++; },
    __renders: 0,
    __store: store,
  };

  const persistence = slice(read('mock-exam.html'),
    '// ─── TIMER PERSISTENCE ─', '// ─── STEP INDICATOR ─', 'persistence block');
  const moduleExit = slice(read('mock-exam.html'),
    'function finishCurrentModule(afterMs) {', 'function tickTimer() {', 'finishCurrentModule');

  const api = evalSnippet(persistence + '\n' + moduleExit, env,
    ['saveTimerState', 'restoreTimerState', 'clearTimerState', 'finishCurrentModule',
     'readActiveTab', 'claimActiveTab']);
  return { env, api, R: root.SiExamRegistry, store, S };
}

/** Replace every property of the shared state object, preserving its identity. */
function setState(S, next) {
  Object.keys(S).forEach(k => delete S[k]);
  Object.assign(S, next);
  return S;
}

// A sitting in progress, as the page would hold it.
function startSitting(S, R, code, practiceQuestions = 0, EXAM_CONFIGS = null) {
  const plan = R.buildModulePlan(code, practiceQuestions);
  return setState(S, {
    view: 'TIMER', exam: EXAM_CONFIGS[code],
    modulePlan: plan, moduleOrdinal: plan[0].ordinal,
    timerTotal: plan[0].durationSec, timerSec: plan[0].durationSec,
    timerRunning: true, timerInterval: null, pausedAt: null,
    examStartedAt: '2026-08-23T10:00:00.000Z',
    moduleStartedAt: '2026-08-23T10:00:00.000Z',
    endedAt: null, practiceQuestions, tabId: 'test-tab-0000', heartbeatInterval: null,
  });
}

// ───────────────────────────────────────────────────────────────────────────
t.section('A module boundary must NOT do any of the five terminal things');

{
  const { env, api, R, store, S } = makeEnv();
  const s = startSitting(S, R, 'SAT_FULL', 0, env.EXAM_CONFIGS);
  api.saveTimerState();
  s.timerSec = 0;
  api.finishCurrentModule(0);           // module 1 expires

  t.is('goes to TRANSITION, not RESULTS', s.view, 'TRANSITION');
  t.is('endedAt is NOT stamped', s.endedAt, null);
  t.ok('persisted state is NOT cleared', store['simath_mock_timer'] != null);
  t.is('moduleStartedAt is cleared — module 2 has not begun', s.moduleStartedAt, null);
  t.is('still on module 1 until the student advances', s.moduleOrdinal, 1);
  t.is('the clock is stopped', s.timerRunning, false);
  t.is('examStartedAt is untouched', s.examStartedAt, '2026-08-23T10:00:00.000Z');
}

t.section('The final module DOES do all five');

{
  const { env, api, R, store, S } = makeEnv();
  const s = startSitting(S, R, 'SAT_FULL', 0, env.EXAM_CONFIGS);
  s.moduleOrdinal = 2;                  // pretend module 2 is running
  s.timerSec = 0;
  api.saveTimerState();
  api.finishCurrentModule(0);

  t.is('goes to RESULTS', s.view, 'RESULTS');
  t.ok('endedAt IS stamped', typeof s.endedAt === 'string' && s.endedAt.length > 0);
  t.is('persisted state IS cleared', store['simath_mock_timer'], undefined);
  t.is('tab ownership IS released', store['simath_mock_active_tab'], undefined);
}

t.section('No time leaks between modules');

{
  const { env, api, R, S } = makeEnv();
  const s = startSitting(S, R, 'SAT_FULL', 0, env.EXAM_CONFIGS);
  s.timerSec = 500;                     // student ends module 1 early
  api.finishCurrentModule(0);
  t.is('leftover time is preserved for display on the boundary', s.timerSec, 500);

  // The REAL function the page calls — not a re-implementation of it. A test
  // that re-derived the next clock here would pass even if the page leaked.
  const next = R.nextModule(s.modulePlan, s.moduleOrdinal);
  const st = R.moduleStartState(s.modulePlan, next.ordinal);

  t.is('module 2 starts at its own full 35:00', st.timerSec, 2100);
  t.is('and its total is its own, not the sitting\'s', st.timerTotal, 2100);
  t.ok('the 500 unused seconds did NOT carry over', st.timerSec === 2100);
  t.ok('moduleStartState never reads live state — same answer whatever is left',
    JSON.stringify(R.moduleStartState(s.modulePlan, 2)) === JSON.stringify(st));
  t.is('an unknown ordinal yields null rather than a guessed clock',
    R.moduleStartState(s.modulePlan, 99), null);

  // And the page must actually route through it.
  t.ok('afterTransition() takes its clock from moduleStartState()',
    /const _st = window\.SiExamRegistry\.moduleStartState\(/.test(read('mock-exam.html')));
  t.ok('it does not assign the next clock inline any more',
    !/s\.timerSec\s+= next\.durationSec/.test(read('mock-exam.html')));
}

// ───────────────────────────────────────────────────────────────────────────
t.section('Refresh during TRANSITION returns to TRANSITION');

{
  const { env, api, R, S } = makeEnv();
  const s = startSitting(S, R, 'SAT_FULL', 0, env.EXAM_CONFIGS);
  s.timerSec = 300;
  api.finishCurrentModule(0);           // now on the boundary, state persisted

  setState(S, { view: 'SELECT', exam: null, tabId: null });   // simulate a fresh page
  const restored = api.restoreTimerState();

  t.is('restore reports the transition phase', restored, 'transition');
  t.is('view is TRANSITION', S.view, 'TRANSITION');
  t.is('module 2 was NOT auto-started', S.moduleOrdinal, 1);
  t.is('the clock is not running', S.timerRunning, false);
  t.is('the exam did NOT end', S.endedAt, undefined);
  t.is('moduleStartedAt stays null until the student presses Begin', S.moduleStartedAt, null);
  t.is('the plan survived the round trip', S.modulePlan.length, 2);
}

t.section('Refresh during a module');

{
  const { env, api, R, S } = makeEnv();
  const s = startSitting(S, R, 'SAT_FULL', 0, env.EXAM_CONFIGS);
  s.moduleOrdinal = 2; s.timerTotal = 2100; s.timerSec = 1800;
  s.moduleStartedAt = '2026-08-23T10:40:00.000Z';
  api.saveTimerState();

  setState(S, { view: 'SELECT', exam: null, tabId: null });
  const restored = api.restoreTimerState();

  t.is('restores as running', restored, 'running');
  t.is('back into module 2, not module 1', S.moduleOrdinal, 2);
  t.ok('remaining time is module-scoped (<= 2100)', S.timerSec <= 1800 && S.timerSec > 1700);
  t.is('module 2 keeps its own start stamp', S.moduleStartedAt, '2026-08-23T10:40:00.000Z');
  t.is('the exam start stamp is the sitting-level one', S.examStartedAt, '2026-08-23T10:00:00.000Z');
}

t.section('Legacy in-flight blob finishes under the rules it started with');

{
  const { env, api, store, S } = makeEnv();
  // Exactly what a pre-P2 build wrote: no v, no plan, 70 minutes in one block.
  store['simath_mock_timer'] = JSON.stringify({
    examCode: 'SAT_FULL', timerTotal: 4200, timerSec: 3000,
    startedAt: '2026-08-23T09:00:00.000Z', practiceQuestions: 0,
    savedAt: Date.now(), timerRunning: true, pausedAt: null,
  });
  setState(S, { view: 'SELECT', exam: null, tabId: null });
  const restored = api.restoreTimerState();

  t.is('restores as a running module', restored, 'running');
  t.is('synthesised as ONE block, not retro-fitted into two', S.modulePlan.length, 1);
  t.is('that block is the full 70 minutes they started', S.modulePlan[0].durationSec, 4200);
  t.ok('so it ends the exam directly, with no transition',
    S.modulePlan.length === 1);

  const { R } = makeEnv();
  t.ok('isLastModule agrees — a one-block plan is always terminal',
    R.isLastModule(S.modulePlan, 1));
}

// ───────────────────────────────────────────────────────────────────────────
t.section('Non-DSAT exams are untouched');

for (const code of ['SAT_MODULE_1', 'SAT_MODULE_2', 'EST_MATH_1', 'EST_MATH_2_L1', 'ACT_MATH']) {
  const { env, api, R, store, S } = makeEnv();
  const s = startSitting(S, R, code, 0, env.EXAM_CONFIGS);
  t.is(`${code}: one-entry plan`, s.modulePlan.length, 1);

  s.timerSec = 0;
  api.finishCurrentModule(0);
  t.is(`${code}: expiry goes straight to RESULTS`, s.view, 'RESULTS');
  t.ok(`${code}: endedAt stamped`, typeof s.endedAt === 'string');
  t.is(`${code}: state cleared`, store['simath_mock_timer'], undefined);
}

{
  const { env, api, R, S } = makeEnv();
  const s = startSitting(S, R, 'PRACTICE', 20, env.EXAM_CONFIGS);
  t.is('PRACTICE: one block', s.modulePlan.length, 1);
  t.is('PRACTICE: 20 q x 1.5 min = 30 min, exactly as before P2', s.timerTotal, 1800);
  s.timerSec = 0;
  api.finishCurrentModule(0);
  t.is('PRACTICE: goes to RESULTS', s.view, 'RESULTS');
}

t.section('SAT_MODULE_1 and SAT_MODULE_2 remain separately sittable');

{
  const { R } = makeEnv();
  t.is('SAT_MODULE_1 is a standalone 22q/35min sitting',
    [R.totalQuestions('SAT_MODULE_1'), R.totalDurationMinutes('SAT_MODULE_1')], [22, 35]);
  t.is('SAT_MODULE_2 likewise',
    [R.totalQuestions('SAT_MODULE_2'), R.totalDurationMinutes('SAT_MODULE_2')], [22, 35]);
}

// ───────────────────────────────────────────────────────────────────────────
t.section('duration_minutes: the silent corruption this phase had to prevent');

{
  const { R } = makeEnv();
  const src = read('mock-exam.html');
  t.ok('doSave no longer derives duration from the module clock alone',
    !/duration_minutes: Math\.round\(s\.timerTotal \/ 60\),/.test(src));
  t.ok('it reads the sitting total from the registry',
    /duration_minutes: window\.SiExamRegistry\.totalDurationMinutes/.test(src));

  // The values that actually get written.
  const dur = (code, timerTotalSec) => R.totalDurationMinutes(code) ?? Math.round(timerTotalSec / 60);
  t.is('SAT_FULL saves 70, not the running module\'s 35', dur('SAT_FULL', 2100), 70);
  t.is('ACT_MATH unchanged at 50', dur('ACT_MATH', 3000), 50);
  t.is('EST_MATH_1 unchanged at 75', dur('EST_MATH_1', 4500), 75);
  t.is('PRACTICE falls back to the live clock', dur('PRACTICE', 1800), 30);
}

t.section('Page wiring is present');

{
  const src = read('mock-exam.html');
  t.ok('TRANSITION is routed by render()', /case 'TRANSITION':/.test(src));
  t.ok('TRANSITION shares TIMER\'s progress step', /TRANSITION: 1/.test(src));
  t.ok('the heartbeat survives the boundary',
    /s\.view !== 'TIMER' && s\.view !== 'TRANSITION'\) stopHeartbeat\(\)/.test(src));
  t.ok('saveTimerState persists during TRANSITION',
    /s\.view !== 'TIMER' && s\.view !== 'TRANSITION'\) \|\| !s\.exam\) return/.test(src));
  t.ok('both exits route through finishCurrentModule',
    (src.match(/finishCurrentModule\(/g) || []).length >= 3);
  t.ok('the transition screen carries no score or answer language',
    !/\bscore\b|\bcorrect\b|\banswers\b/i.test(
      slice(src, 'function htmlTransition() {', 'function afterTransition() {', 'transition view')));
}

t.done();
