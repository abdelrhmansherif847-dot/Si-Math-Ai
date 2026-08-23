// P5 — integrity detection and recording, and the boundary around it.
//
// The one invariant that outranks every proof here: P5 DETECTS AND RECORDS
// ONLY. It must not warn, pause, terminate, score, flag, penalize or otherwise
// change the exam. Most of this suite therefore asserts absences — no timer
// reference, no confidence field, no state write, no await — because the
// dangerous failure is not a missing event; it is an event that DOES something.
//
// Every assertion runs the REAL shipped module against fake DOM targets and a
// recording fake supabase client. The G6 disclosure is pinned character-for-
// character against the approved wording, so the copy students see cannot
// drift from what was reviewed.
import { suite } from './_assert.mjs';
import { read, slice, evalSnippet } from './_source.mjs';

const t = suite('exam-integrity');

// ── Fakes ──────────────────────────────────────────────────────────────────
function makeTarget() {
  const ls = {};
  return {
    addEventListener: (type, fn) => { (ls[type] = ls[type] || []).push(fn); },
    removeEventListener: (type, fn) => { ls[type] = (ls[type] || []).filter(f => f !== fn); },
    fire: (type, ev) => { (ls[type] || []).slice().forEach(f => f(ev || {})); },
    count: (type) => (ls[type] || []).length,
  };
}

/** Sandbox with the real module. `mode` injects failure shapes. */
function makeIntegrity(mode = 'ok') {
  const rows = [];
  const root = makeTarget();                    // root doubles as `window`
  const doc = makeTarget();
  doc.visibilityState = 'visible';
  root.document = doc;
  root.getSelection = () => ({ toString: () => 'x = 5' });   // 5 chars
  root.console = { warn() {} };

  const sb = {
    from(table) {
      return {
        insert(row) {
          if (mode === 'throw-insert') throw new Error('network down');
          rows.push({ table, row });
          if (mode === 'reject-insert') {
            return { then(_ok, err) { if (err) err(new Error('RLS refused')); } };
          }
          return { then(ok) { if (ok) ok({ data: null, error: null }); } };
        },
      };
    },
  };

  evalSnippet(read('exam-registry.js'), { globalThis: root, window: root }, []);
  evalSnippet(read('exam-integrity.js'), { globalThis: root, window: root, console: root.console }, []);
  const I = root.SiExamIntegrity;
  I._reset();

  let clock = 1_000_000;
  I.configure({ owns: () => true, now: () => clock });
  const tick = (ms) => { clock += ms; };

  const begin = (over = {}) => I.begin({
    sb, userId: 'u-1', attemptId: 'att-1', examCode: 'SAT_FULL',
    examStartedAt: new Date(clock).toISOString(), ...over,
  });

  return { I, R: root.SiExamRegistry, root, doc, sb, rows, begin, tick, setClock: (v) => { clock = v; } };
}

// ───────────────────────────────────────────────────────────────────────────
t.section('G6 — the disclosure, pinned character-for-character');

{
  const { I } = makeIntegrity();
  // The APPROVED wording, including the review's one change ("based on these
  // events alone"). Any edit to the shipped copy turns this suite red.
  t.is('title', I.NOTICE.title, 'Exam integrity notice');
  t.is('paragraph 1 — the exhaustive event list', I.NOTICE.paragraphs[0],
    'To keep mock exams fair, Si Math AI records a small set of technical events '
    + 'while an exam is running: when text is copied, when printing is attempted, '
    + 'when the right-click menu is opened, and when the exam tab is hidden or '
    + 'loses focus.');
  t.is('paragraph 2 — interruptions are not violations', I.NOTICE.paragraphs[1],
    'Ordinary interruptions — a notification, an incoming call, switching apps for '
    + 'a moment — are <b>not</b> treated as violations by themselves.');
  t.is('paragraph 3 — the approved wording change', I.NOTICE.paragraphs[2],
    'No penalty is applied automatically based on these events alone. Any concern '
    + 'is reviewed by a person before any action is taken.');
  t.is('paragraph 4 — what is and is never stored', I.NOTICE.paragraphs[3],
    'What is stored is minimal: the type of event, when it happened, and — for some '
    + 'events — a duration or a character count. <b>Never</b> your keystrokes, '
    + 'your screen contents, or the text you copied.');
  t.ok('the rejected absolute wording ("ever") is gone',
    !I.NOTICE.paragraphs[2].includes('ever applied'));

  const page = read('mock-exam.html');
  t.ok('the page renders the notice FROM the module (single source)',
    /window\.SiExamIntegrity\?\.NOTICE/.test(page));
  t.ok('the page hardcodes none of the disclosure copy',
    !page.includes('No penalty is applied automatically'));
  t.ok('the notice renders on SELECT, before the start bar',
    page.indexOf('SiExamIntegrity?.NOTICE') < page.indexOf('<div class="exam-start-bar">'));
}

t.section('Registry policy — explicit, data-driven, fail-closed');

{
  const { R } = makeIntegrity();
  t.ok('every real exam is subject to logging',
    R.EXAM_CODES.filter(c => c !== 'PRACTICE').every(c => R.integrityLoggingEnabled(c)));
  t.is('PRACTICE is excluded by policy', R.integrityLoggingEnabled('PRACTICE'), false);
  t.is('an unknown exam is NOT logged (fail closed)', R.integrityLoggingEnabled('NOPE'), false);
  t.ok('PRACTICE carries the exclusion as data on its entry',
    /code: 'PRACTICE'[\s\S]{0,2000}integrity: \{ log: false \}/.test(read('exam-registry.js')));

  const page = read('mock-exam.html');
  t.ok('the page routes through the registry policy, not a hardcoded code check',
    /window\.SiExamRegistry\.integrityLoggingEnabled\(s\.exam\.code\)/.test(page));
  t.ok('no PRACTICE exception is hardcoded in integrity wiring',
    !/SiExamIntegrity[\s\S]{0,200}PRACTICE|PRACTICE[\s\S]{0,200}SiExamIntegrity/.test(page));
}

t.section('attempt_id plumbing');

{
  const page = read('mock-exam.html');
  t.ok('minted once at exam start', /s\.attemptId\s+= makeTabId\(\);/.test(page));
  t.ok('persisted in the timer blob', /attemptId:\s+s\.attemptId,/.test(page));
  t.ok('restored, minting fresh for a legacy blob',
    /s\.attemptId\s+= saved\.attemptId \|\| makeTabId\(\);/.test(page));
  t.ok('sent by doSave', /attempt_id: s\.attemptId \|\| null/.test(page));
  t.ok('doSave is otherwise unchanged — idempotency key still present and first',
    /idempotency_key: idempotencyKey,/.test(page));
  t.ok('cleared on reset', /attemptId: null, userId: null,/.test(page));

  // Functional round-trip through the REAL persistence code (sliced, as P2 does).
  const store = {};
  const S = {};
  const root2 = {};
  evalSnippet(read('exam-registry.js'), { globalThis: root2, window: root2 }, []);
  const env = {
    window: root2,
    localStorage: {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: k => { delete store[k]; },
    },
    crypto: { randomUUID: () => 'minted-fresh' },
    EXAM_CONFIGS: root2.SiExamRegistry.compat(),
    s: S,
  };
  const persistence = slice(read('mock-exam.html'),
    '// ─── TIMER PERSISTENCE ─', '// ─── STEP INDICATOR ─', 'persistence');
  const api = evalSnippet(persistence, env, ['saveTimerState', 'restoreTimerState']);

  Object.assign(S, {
    view: 'TIMER', exam: env.EXAM_CONFIGS.SAT_FULL,
    modulePlan: root2.SiExamRegistry.buildModulePlan('SAT_FULL'),
    moduleOrdinal: 1, moduleVariantId: null, moduleStartedAt: null,
    timerTotal: 2100, timerSec: 1500, timerRunning: true, pausedAt: null,
    examStartedAt: '2026-08-23T10:00:00.000Z', practiceQuestions: 0,
    attemptId: 'att-persist-1', userId: 'u-1', tabId: 'tab-1',
  });
  api.saveTimerState();
  Object.keys(S).forEach(k => delete S[k]);
  api.restoreTimerState();
  t.is('attemptId survives a refresh round-trip', S.attemptId, 'att-persist-1');

  // Legacy blob: no attemptId field at all.
  const blob = JSON.parse(store['simath_mock_timer']);
  delete blob.attemptId;
  store['simath_mock_timer'] = JSON.stringify(blob);
  Object.keys(S).forEach(k => delete S[k]);
  api.restoreTimerState();
  t.is('a legacy blob gets a fresh mint, not undefined', S.attemptId, 'minted-fresh');
}

t.section('Recording — the row sent matches the M1 contract exactly');

{
  const { I, doc, rows, begin } = makeIntegrity();
  begin();
  doc.fire('copy');
  t.is('one row written', rows.length, 1);
  const r = rows[0];
  t.is('to the right table', r.table, 'exam_integrity_events');
  t.is('field set is EXACTLY the six M1 accepts — no confidence, ever',
    Object.keys(r.row).sort(),
    ['attempt_id', 'elapsed_ms', 'event_type', 'exam_code', 'metadata', 'user_id']);
  t.is('event_type', r.row.event_type, 'copy');
  t.is('copy carries a character COUNT, never the text', r.row.metadata, { selection_length: 5 });
  t.is('elapsed_ms clamped and numeric', r.row.elapsed_ms, 0);
  t.ok('module source never mentions confidence — the DB is the sole classifier',
    !/confidence/.test(read('exam-integrity.js').replace(/\/\/.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')));
}

t.section('Durations are measured on return');

{
  const { doc, root, rows, begin, tick } = makeIntegrity();
  begin();

  doc.visibilityState = 'hidden'; doc.fire('visibilitychange');
  t.is('going hidden writes nothing yet', rows.length, 0);
  tick(4200);
  doc.visibilityState = 'visible'; doc.fire('visibilitychange');
  t.is('returning writes ONE visibility_hidden', rows.length, 1);
  t.is('carrying the real duration', rows[0].row.metadata, { hidden_ms: 4200 });

  tick(6000);
  root.fire('blur');
  tick(900);
  root.fire('focus');
  t.is('blur/focus likewise', rows.length, 2);
  t.is('with blurred_ms', rows[1].row.metadata, { blurred_ms: 900 });
}

{
  const { I, doc, rows, begin, tick } = makeIntegrity();
  begin();
  doc.visibilityState = 'hidden'; doc.fire('visibilitychange');
  tick(3000);
  I.end();                                    // leave TIMER mid-hidden
  doc.visibilityState = 'visible'; doc.fire('visibilitychange');
  t.is('a duration spanning the end of detection is DISCARDED, not written', rows.length, 0);
}

t.section('Debounce and the storm cap — protection, never behaviour');

{
  const { doc, rows, begin, tick } = makeIntegrity();
  begin();
  doc.fire('copy'); doc.fire('copy'); doc.fire('copy');
  t.is('three copies inside 5s write once', rows.length, 1);
  tick(5001);
  doc.fire('copy');
  t.is('after the debounce window a new one writes', rows.length, 2);
  doc.fire('contextmenu');
  t.is('debounce is per TYPE — a different type is independent', rows.length, 3);
}

{
  const { I, doc, rows, begin, tick } = makeIntegrity();
  begin();
  for (let i = 0; i < 40; i++) { doc.fire('copy'); doc.fire('contextmenu'); tick(5001); }
  t.is('the cap stops inserts at exactly MAX_EVENTS_PER_LOAD', rows.length, I.MAX_EVENTS_PER_LOAD);
  t.is('which is the approved 25', I.MAX_EVENTS_PER_LOAD, 25);
  t.is('and the approved debounce is 5000ms', I.DEBOUNCE_MS, 5000);
  t.ok('the module is still active after the cap — nothing about the exam changed',
    I.isActive());

  // The structural guarantee that the cap CANNOT affect the exam: the module
  // holds no reference to any timer or exam state whatsoever.
  const src = read('exam-integrity.js').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  t.ok('module code holds no timer/view/module-state reference',
    !/\bs\.(timerSec|timerRunning|timerTotal|view|moduleOrdinal|modulePlan|endedAt)\b/.test(src)
    && !/tickTimer|finishCurrentModule|saveTimerState|render\(/.test(src));
  t.ok('module code never touches the analyzer or save pipeline',
    !/exam_mistakes|ExamMistakesLogger|MasteryEngine|weakness|exam_practice_sessions/i.test(src));
  t.ok('module writes to exactly one table, the M1 table',
    (src.match(/from\('exam_integrity_events'\)/g) || []).length === 1
    && (src.match(/\.from\(/g) || []).length === 1);
}

t.section('Ownership — write-time only, fail closed');

{
  const { I, doc, rows, begin } = makeIntegrity();
  I.configure({ owns: () => false });
  begin();
  doc.fire('copy');
  t.is('a non-owner tab writes nothing', rows.length, 0);
}

{
  const { I, doc, rows, begin, tick } = makeIntegrity();
  let calls = 0;
  I.configure({ owns: () => { calls++; return true; } });
  begin();
  // 10 raw events, but debounce lets only the first through.
  for (let i = 0; i < 10; i++) doc.fire('copy');
  t.is('ownership consulted once — only for the event that would write', calls, 1);
  tick(5001); doc.fire('copy');
  t.is('and once more for the next real write', calls, 2);
}

{
  const { I, doc, rows, begin } = makeIntegrity();
  I.configure({ owns: () => { throw new Error('storage blocked'); } });
  begin();
  doc.fire('copy');
  t.is('a throwing predicate fails CLOSED — silence', rows.length, 0);
}

t.section('Failure isolation — every failure is silence');

{
  for (const mode of ['throw-insert', 'reject-insert']) {
    const { doc, root, begin } = makeIntegrity(mode);
    let threw = null;
    try {
      begin();
      doc.fire('copy');
      doc.visibilityState = 'hidden'; doc.fire('visibilitychange');
      doc.visibilityState = 'visible'; doc.fire('visibilitychange');
      root.fire('beforeprint');
    } catch (e) { threw = e; }
    t.is(`[${mode}] no handler throws`, threw, null);
  }

  const { I } = makeIntegrity();
  let threw = null;
  try {
    I.begin(null); I.begin({}); I.end(); I.end();
    I.configure(null); I.configure({ owns: 'not-a-function' });
  } catch (e) { threw = e; }
  t.is('junk inputs never throw', threw, null);

  const page = read('mock-exam.html');
  t.ok('no integrity call in the page is awaited', !/await\s+window\.SiExamIntegrity/.test(page));
  t.ok('every page call site is guarded',
    page.split('\n').filter(l => l.includes('SiExamIntegrity'))
      .every(l => /try|\?\.|function|\/\//.test(l)));
}

t.section('Lifecycle — TIMER-only, idempotent, clean teardown');

{
  const { I, doc, rows, begin, tick } = makeIntegrity();
  t.is('begin is refused without required context', begin({ userId: null }), false);
  t.is('a proper begin succeeds', begin(), true);
  t.is('re-begin for the SAME attempt is a no-op', begin(), false);
  t.ok('active while begun', I.isActive());

  doc.fire('copy');
  t.is('records while active', rows.length, 1);

  I.end();
  t.ok('inactive after end', !I.isActive());
  tick(6000);
  doc.fire('copy');
  t.is('after end, events no longer record — listeners removed', rows.length, 1);
  t.is('listeners genuinely unbound from the document', doc.count('copy'), 0);

  const page = read('mock-exam.html');
  t.ok('render() ends detection on every non-TIMER view',
    /if \(s\.view !== 'TIMER'\) \{ try \{ window\.SiExamIntegrity\?\.end\(\); \} catch \(_\) \{\} \}/.test(page));
  t.ok('afterTimer starts it', /startIntegrityForAttempt\(\);/.test(page));
}

t.section('All six M1 event types are reachable; nothing beyond them exists');

{
  const { doc, root, rows, begin, tick } = makeIntegrity();
  begin();
  doc.fire('copy'); tick(5001);
  root.fire('beforeprint'); tick(5001);
  doc.fire('contextmenu'); tick(5001);
  doc.visibilityState = 'hidden'; doc.fire('visibilitychange');
  tick(100);
  doc.visibilityState = 'visible'; doc.fire('visibilitychange');
  tick(5001);
  root.fire('blur'); tick(50); root.fire('focus');

  t.is('the five reachable types each wrote once',
    rows.map(r => r.row.event_type).sort(),
    ['context_menu', 'copy', 'print', 'visibility_hidden', 'window_blur']);

  const src = read('exam-integrity.js');
  t.ok('fullscreen stays dormant — no fullscreen API anywhere',
    !/requestFullscreen|fullscreenchange|fullscreenElement/.test(src));
  t.ok('metadata keys are only the three M1 accepts',
    rows.every(r => Object.keys(r.row.metadata)
      .every(k => ['selection_length', 'hidden_ms', 'blurred_ms'].includes(k))));
}

t.done();
