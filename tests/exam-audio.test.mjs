// P3 — the proctor's voice.
//
// The eight proofs P3 was required to demonstrate, plus the one invariant that
// outranks all of them: audio observes, it never drives. A speech failure, an
// unsupported browser, a suspended engine or an outright exception must produce
// silence and nothing else — never a stalled tick, never a changed view.
//
// Every assertion runs the REAL shipped module against a stubbed speech engine,
// and the schedule always comes from the REAL registry. Nothing here restates a
// timing rule; if a test knew the marks independently it could pass while the
// registry and the page disagreed, which is the whole failure mode P3 was told
// to avoid.
import { suite } from './_assert.mjs';
import { read, slice, evalSnippet } from './_source.mjs';

const t = suite('exam-audio');

/** A sandbox with a recording speech engine. `mode` injects failure. */
function makeAudio(mode = 'ok') {
  const spoken = [];
  const root = {};
  evalSnippet(read('exam-registry.js'), { globalThis: root, window: root }, []);

  const engine = {
    speak(u) {
      if (mode === 'throw-speak') throw new Error('speech blocked by policy');
      spoken.push(u && u.text);
    },
    cancel() { if (mode === 'throw-cancel') throw new Error('cancel failed'); },
  };
  const env = {
    globalThis: root, window: root, console: { warn() {} },
    localStorage: { getItem: () => (mode === 'pref-off' ? 'off' : null), setItem() {}, removeItem() {} },
  };
  if (mode !== 'unsupported') {
    env.speechSynthesis = engine;
    env.SpeechSynthesisUtterance = function (text) { this.text = text; };
    root.speechSynthesis = engine;
    root.SpeechSynthesisUtterance = env.SpeechSynthesisUtterance;
  }
  root.localStorage = env.localStorage;
  root.console = env.console;

  evalSnippet(read('exam-audio.js'), env, []);
  const A = root.SiExamAudio;
  A._reset();
  A.configure({ owns: () => true });
  return { A, R: root.SiExamRegistry, spoken };
}

/** Drive a block from `from` down to `to`, one simulated tick per second. */
function runTicks(A, from, to) {
  const keys = [];
  for (let sec = from; sec >= to; sec--) {
    const k = A.announceIfDue(sec);
    if (k) keys.push({ sec, key: k });
  }
  return keys;
}

// ───────────────────────────────────────────────────────────────────────────
t.section('PROOF 1 — the registry is the only timing source');

{
  const { A, R } = makeAudio();
  const src = read('exam-audio.js');
  const page = read('mock-exam.html');

  t.ok('exam-audio.js contains no second-based timing constant',
    !/\b(300|180|60|1050|2100|600)\b/.test(src.replace(/\/\/.*$/gm, '')));
  t.ok('the page derives the schedule from scheduleFor()',
    /window\.SiExamRegistry\.scheduleFor\(s\.exam\.code, s\.moduleOrdinal, s\.timerTotal\)/.test(page));
  t.ok('the page defines no marks of its own',
    !/atRemainingSec\s*[:=]/.test(page));

  // What the page passes IS what the registry produces.
  const sched = R.scheduleFor('SAT_FULL', 1, 2100);
  t.is('registry marks for a DSAT module', sched.map(m => m.atRemainingSec), [1050, 300, 180, 60, 0]);
  A.armBlock('sess', 1, sched, 2100);
  t.is('the bus fires exactly those, in that order',
    runTicks(A, 2100, 0).map(x => x.sec), [1050, 300, 180, 60, 0]);
}

t.section('PROOF 2 — at most one announcement per mark');

{
  const { A, R, spoken } = makeAudio();
  A.armBlock('sess', 1, R.scheduleFor('SAT_FULL', 1, 2100), 2100);
  const fires = runTicks(A, 2100, 0);
  t.is('five marks crossed => five announcements', fires.length, 5);
  t.is('and five utterances spoken', spoken.length, 5);

  // Re-tick the same seconds: nothing may fire twice.
  const again = runTicks(A, 2100, 0);
  t.is('replaying every tick produces no further announcement', again.length, 0);
  t.is('and no further utterance', spoken.length, 5);

  const uniq = new Set(fires.map(f => f.key));
  t.is('every key is distinct', uniq.size, fires.length);
}

t.section('PROOF 3 — pause/resume cannot duplicate an announcement');

{
  const { A, R, spoken } = makeAudio();
  A.armBlock('sess', 1, R.scheduleFor('SAT_FULL', 1, 2100), 2100);
  runTicks(A, 2100, 295);                       // crosses 1050 and 300
  const afterFirst = spoken.length;
  t.is('two marks spoken so far', afterFirst, 2);

  // A pause changes no seconds; resuming re-ticks the same values.
  runTicks(A, 295, 295);
  runTicks(A, 300, 295);                        // the exact seconds again
  t.is('pausing and resuming speaks nothing new', spoken.length, afterFirst);

  // Re-arming the SAME block (a re-render) must not reset what fired.
  A.armBlock('sess', 1, R.scheduleFor('SAT_FULL', 1, 2100), 295);
  runTicks(A, 300, 295);
  t.is('re-arming the same block is a no-op', spoken.length, afterFirst);
}

t.section('PROOF 4 — module 1 announcements cannot leak or replay into module 2');

{
  const { A, R, spoken } = makeAudio();
  const sched1 = R.scheduleFor('SAT_FULL', 1, 2100);
  A.armBlock('sess', 1, sched1, 2100);
  runTicks(A, 2100, 0);
  t.is('module 1 speaks its five', spoken.length, 5);

  // Module 2: same durations, same mark values, different block.
  const sched2 = R.scheduleFor('SAT_FULL', 2, 2100);
  t.is('module 2 has identical mark values', sched2.map(m => m.atRemainingSec), sched1.map(m => m.atRemainingSec));
  A.armBlock('sess', 2, sched2, 2100);
  const m2 = runTicks(A, 2100, 0);
  t.is('module 2 speaks its own five, not module 1\'s residue', m2.length, 5);
  t.is('ten in total across the sitting', spoken.length, 10);

  // And module 1's marks are genuinely gone, not merely unreachable.
  A.armBlock('sess', 2, sched2, 2100);
  t.is('re-arming module 2 mid-sitting does not replay it', runTicks(A, 2100, 0).length, 0);
}

t.section('PROOF 4b — a restore mid-block does not replay what was already heard');

{
  const { A, R, spoken } = makeAudio();
  // Fresh page, restored with 4:30 left: 1050 and 300 are already in the past.
  A.armBlock('sess', 1, R.scheduleFor('SAT_FULL', 1, 2100), 270);
  const fires = runTicks(A, 270, 0);
  t.is('only genuinely future marks fire', fires.map(f => f.key), ['three_minutes', 'one_minute', 'time_up']);
  t.ok('the five-minute warning is NOT repeated', !spoken.some(x => /Five minutes/.test(x)));
}

t.section('PROOF 5 — a non-owner tab emits nothing');

{
  const { A, R, spoken } = makeAudio();
  A.configure({ owns: () => false });
  A.armBlock('sess', 1, R.scheduleFor('SAT_FULL', 1, 2100), 2100);
  const fires = runTicks(A, 2100, 0);
  t.is('no announcement is returned', fires.length, 0);
  t.is('and nothing is spoken', spoken.length, 0);

  // Ownership is consulted only when a mark is due, never per tick.
  let calls = 0;
  const { A: A2, R: R2 } = makeAudio();
  A2.configure({ owns: () => { calls++; return true; } });
  A2.armBlock('sess', 1, R2.scheduleFor('SAT_FULL', 1, 2100), 2100);
  runTicks(A2, 2100, 0);
  t.is('ownership read once per due mark, not once per tick (2101 ticks)', calls, 5);

  // A throwing predicate must fail CLOSED — silence, not a crash, not a leak.
  const { A: A3, R: R3, spoken: sp3 } = makeAudio();
  A3.configure({ owns: () => { throw new Error('storage blocked'); } });
  A3.armBlock('sess', 1, R3.scheduleFor('SAT_FULL', 1, 2100), 2100);
  t.is('a throwing ownership check yields silence', runTicks(A3, 2100, 0).length, 0);
  t.is('and speaks nothing', sp3.length, 0);
}

t.section('PROOF 6 — audio failure cannot break timer progression');

{
  // The bus is total: every entry point returns rather than throwing.
  for (const mode of ['throw-speak', 'throw-cancel', 'unsupported', 'pref-off']) {
    const { A, R } = makeAudio(mode);
    let threw = null;
    try {
      A.unlock();
      A.armBlock('sess', 1, R.scheduleFor('SAT_FULL', 1, 2100), 2100);
      for (let sec = 2100; sec >= 0; sec--) A.announceIfDue(sec);
      A.cancel();
      A.disarm();
      A.announceIfDue(null);
      A.announceIfDue(undefined);
      A.armBlock(null, null, null, null);
    } catch (e) { threw = e; }
    t.is(`[${mode}] no public method throws`, threw, null);
  }

  // The page never awaits audio from the timer path.
  const page = read('mock-exam.html');
  const tick = slice(page, 'function tickTimer() {', 'function updateTimerDOM', 'tick');
  t.ok('tickTimer does not await audio', !/await[\s\S]{0,40}SiExamAudio/.test(tick));
  t.ok('tickTimer guards the audio call', /try \{ window\.SiExamAudio\?\.announceIfDue/.test(tick));
  const fcm = slice(page, 'function finishCurrentModule(afterMs) {', 'function tickTimer() {', 'fcm');
  t.ok('finishCurrentModule does not await audio', !/await[\s\S]{0,40}SiExamAudio/.test(fcm));
  t.ok('no audio call anywhere in the page is awaited', !/await\s+window\.SiExamAudio/.test(page));
}

t.section('PROOF 7 — an unsupported engine leaves the exam fully functional');

{
  const { A, R } = makeAudio('unsupported');
  t.is('supported() reports false', A.supported(), false);
  t.is('unlock() reports not unlocked rather than throwing', A.unlock(), false);
  t.is('arming still succeeds', A.armBlock('sess', 1, R.scheduleFor('SAT_FULL', 1, 2100), 2100), true);
  // Marks are still consumed, so nothing queues up to fire later.
  t.is('ticks return null throughout', runTicks(A, 2100, 0).length, 0);

  const { A: off, R: Roff, spoken } = makeAudio('pref-off');
  off.armBlock('sess', 1, Roff.scheduleFor('SAT_FULL', 1, 2100), 2100);
  runTicks(off, 2100, 0);
  t.is('a student who turned announcements off hears nothing', spoken.length, 0);
  t.is('enabled() reflects the preference', off.enabled(), false);
}

t.section('PROOF 8 — timing, scoring, saving, mistakes and the analyzer are untouched');

{
  const page = read('mock-exam.html');
  // Line-scoped, not proximity-scoped. A character-window regex cannot tell
  // "audio wrote this" from "audio happens to sit next to this" — and it did
  // not: unlock() is inserted directly above `s.timerRunning = true` in the
  // resume handler, which is adjacent code, not a write by audio.
  const audioLines = page.split('\n').filter(l => l.includes('SiExamAudio'));
  t.ok('every audio call site is a call and nothing else',
    audioLines.length > 0 && audioLines.every(l =>
      !/\bs\.(timerSec|timerRunning|timerTotal|view|moduleOrdinal|modulePlan|endedAt)\s*=[^=]/.test(l)));

  // Comments legitimately NAME what the file does not touch, so scan the code.
  const audioCode = read('exam-audio.js').split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');
  t.ok('exam-audio.js never touches persistence',
    !/simath_mock_timer|simath_mock_active_tab|saveTimerState/.test(audioCode));
  t.ok('exam-audio.js CODE knows nothing of supabase, saving or the analyzer',
    !/supabase|\bsb\b|exam_mistakes|ExamMistakesLogger|MasteryEngine|weakness/i.test(audioCode));
  t.ok('...and it references no exam state object at all',
    !/\bs\.(timerSec|timerRunning|view|exam|modulePlan)\b/.test(audioCode));
  t.ok('doSave is unchanged by P3', !/SiExamAudio/.test(slice(page, 'async function doSave() {', 'function htmlSaving', 'doSave')));
}

t.section('Ambient stays inert, and the phrases say what they must');

{
  const { A } = makeAudio();
  t.is('ambient reports unavailable', A.ambient.available(), false);
  t.is('starting it is a no-op', A.ambient.start(), false);
  t.ok('no audio asset path exists anywhere', !/\.mp3|\.ogg|\.wav|assets\/exam/.test(read('exam-audio.js')));
  t.ok('the 3-minute warning tells the student to guess rather than leave blanks',
    /best guess/i.test(A.PHRASES.three_minutes) && /not leave any questions unanswered/i.test(A.PHRASES.three_minutes));
  t.ok('every registry key used by a fixed exam has a phrase', (() => {
    const { R } = makeAudio();
    return R.EXAM_CODES.filter(c => c !== 'PRACTICE').every(c =>
      R.scheduleFor(c, 1).every(m => typeof A.PHRASES[m.key] === 'string' && A.PHRASES[m.key].length > 0));
  })());
}

t.done();
