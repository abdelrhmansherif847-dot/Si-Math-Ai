// Confidence redesign — the client half.
//
// Confidence stops being a 1-5 dial the student never touched and becomes a
// statement of intent they make deliberately:
//
//   OFF (default)  "I need help solving this."       -> the 1-5 is hidden
//   ON             "I already tried. Check my work." -> the 1-5 appears
//
// The number means STUDENT SELF-CONFIDENCE. It has never meant Zero's
// confidence in its own answer, and nothing here may start implying that.
//
// ─────────────────────────────────────────────────────────────────────────
// THE ONE SUBTLETY, AND WHY THERE ARE TWO READERS
//
// `confidence` is read by two consumers that want different things when the
// student has said nothing:
//
//   • the REQUEST PAYLOAD  -> must send null. Today it sends a fabricated 3,
//     which is why 81.7% of question_records.confidence_before is the literal
//     value 3 — a self-assessment no student ever gave.
//
//   • the WEAKNESS/MASTERY engines -> must keep seeing 3. They use it as a
//     neutral prior: weight = (6-c)/5 gives 0.6, and the image/short-text path
//     fires a topic signal on `conf <= 3`. Handing them null instead would drop
//     the weight to 0.5 and silently switch that signal off for the ~82% of
//     traffic that never touches the control.
//
// So: two readers, two answers, both honest. `payloadConfidence()` reports what
// the student actually said; `signalConfidence()` reports the prior the
// analytics have always used. C6 is the section that pins this apart.
import { suite } from './_assert.mjs';
import { read, slice } from './_source.mjs';
import vm from 'node:vm';

const t = suite('confidence-toggle-client');
const CHAT = read('chat.html');

const SRC = slice(CHAT,
  '// ── Confidence mode ───────────────────────────────────────────────────',
  '// ── end confidence mode',
  'confidence mode');

// A DOM thin enough to be obviously fake, rich enough that render() runs.
function makeEl(id) {
  const cls = new Set();
  return {
    id, _text: '', innerHTML: '', dataset: {}, style: {},
    classList: {
      add: (c) => cls.add(c), remove: (c) => cls.delete(c),
      toggle: (c, on) => (on === undefined ? (cls.has(c) ? cls.delete(c) : cls.add(c)) : (on ? cls.add(c) : cls.delete(c))),
      contains: (c) => cls.has(c),
    },
    get textContent() { return this._text; }, set textContent(v) { this._text = v; },
    addEventListener() {}, blur() {}, querySelectorAll: () => [],
  };
}
const els = {};
const getEl = (id) => (els[id] ||= makeEl(id));
const dots = [1, 2, 3, 4, 5].map((n) => { const d = makeEl('dot' + n); d.dataset.c = String(n); return d; });

const sandbox = {
  window: {}, console,
  document: {
    getElementById: getEl,
    querySelectorAll: (sel) => (/conf-dot/.test(sel) ? dots : []),
    querySelector: (sel) => (/conf-dot\.on/.test(sel) ? dots.find((d) => d.classList.contains('on')) || null : null),
    addEventListener() {},
  },
  localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
};
vm.createContext(sandbox);
vm.runInContext(`
${SRC}
  window.__api = { confidenceModeOn, setConfidenceMode, pickConfidence,
                   selectedConfidenceValue, payloadConfidence, signalConfidence,
                   shouldShowRating };
`, sandbox);
const { confidenceModeOn, setConfidenceMode, pickConfidence,
        selectedConfidenceValue, payloadConfidence, signalConfidence,
        shouldShowRating } = sandbox.window.__api;

// ───────────────────────────────────────────────────────────────────────────
t.section('C1. OFF is the default — the student opts IN to being checked');
{
  t.is('mode starts off', confidenceModeOn(), false);
  t.is('so the rating is hidden', shouldShowRating(), false);
  t.is('and the payload carries no self-assessment', payloadConfidence(), null);
}

t.section('C2. The 1-5 controls appear only when ON');
{
  setConfidenceMode(true);
  t.is('ON reveals the rating', shouldShowRating(), true);
  setConfidenceMode(false);
  t.is('OFF hides it again', shouldShowRating(), false);
}

t.section('C3. OFF sends null — never a fabricated number');
{
  setConfidenceMode(false);
  t.is('no self-assessment is reported', payloadConfidence(), null);

  // Even after the student has picked a value and switched back off.
  setConfidenceMode(true);
  pickConfidence(5);
  setConfidenceMode(false);
  t.is('a stale pick does not leak into an OFF request', payloadConfidence(), null);
}

t.section('C4. ON sends exactly what the student chose');
{
  setConfidenceMode(true);
  for (const n of [1, 2, 3, 4, 5]) {
    pickConfidence(n);
    t.is(`picked ${n} -> payload ${n}`, payloadConfidence(), n);
  }
}

t.section('C5. Switching OFF and back ON keeps the chosen value visible');
{
  // The brief: do not visually delete the selection unless the request
  // contract needs it. It does not — the payload is gated on the MODE, so the
  // remembered number is harmless while OFF and saves a re-pick.
  setConfidenceMode(true);
  pickConfidence(2);
  setConfidenceMode(false);
  t.is('the value survives the round trip', selectedConfidenceValue(), 2);
  setConfidenceMode(true);
  t.is('and is still what gets sent', payloadConfidence(), 2);
}

t.section('C6. THE TWO READERS — weakness analytics must not silently drift');
{
  // This is the section that would go red if someone "simplified" the two
  // readers into one. Handing null to the weakness engines changes the weight
  // from 0.6 to 0.5 and switches off the `conf <= 3` topic signal for every
  // OFF turn — i.e. for most traffic.
  setConfidenceMode(false);
  t.is('payload reports the truth: nothing was said', payloadConfidence(), null);
  t.is('signals keep the neutral prior they have always used', signalConfidence(), 3);

  const weight = (c) => (c ? Math.max(0.2, (6 - c) / 5) : 0.5);
  t.is('so the weakness weight is unchanged from today', weight(signalConfidence()), 0.6);
  t.ok('and the image/short-text topic signal still fires', signalConfidence() <= 3);

  // When ON, the student's real number drives both.
  setConfidenceMode(true);
  pickConfidence(5);
  t.is('ON: payload is the real value', payloadConfidence(), 5);
  t.is('ON: signals see the real value too', signalConfidence(), 5);
  t.is('and a confident student produces the lowest weakness weight',
    weight(signalConfidence()), 0.2);
}

t.section('C7. Nothing is persisted — every load starts OFF');
{
  t.ok('the confidence mode never writes to storage',
    !/localStorage\.setItem/.test(SRC), SRC);
  t.ok('and never reads it back',
    !/localStorage\.getItem/.test(SRC), SRC);
  t.ok('the mode is initialised to false at module scope, not from storage',
    /(let|var)\s+confidenceMode\s*=\s*false/.test(SRC), SRC.slice(0, 600));
}

t.section('C8. The label states whose confidence this is');
{
  // "Your confidence" was ambiguous enough that the column it feeds is 81.7%
  // untouched default. The ON state must ask about the student's own attempt.
  const markup = slice(CHAT, '<div class="conf-bar"', '</div>\n\n      <div class="hint-bar"', 'conf markup');
  t.ok('the rating asks about the student\'s OWN answer',
    /your (own )?(answer|attempt|solution|work)/i.test(markup), markup);
  t.ok('it never presents the number as Zero\'s confidence',
    !/zero'?s confidence|confidence in the answer|how correct/i.test(markup), markup);
  t.ok('the toggle explains what ON means',
    /already (tried|solved|attempted)|check my|check your/i.test(markup), markup);
}

t.section('C9. The payload wiring — attempt_check rides with the value');
{
  t.ok('confidence is sourced from the gated reader',
    /confidence:\s*payloadConfidence\(\)/.test(CHAT), 'payload must call payloadConfidence()');
  t.ok('attempt_check is sent alongside it',
    /attempt_check:\s*confidenceModeOn\(\)/.test(CHAT), 'attempt_check must be sent');
  t.ok('the weakness engines still read their own source, not the payload one',
    /signalConfidence\(\)/.test(CHAT), 'SignalEngine must use signalConfidence()');
}

t.done();
