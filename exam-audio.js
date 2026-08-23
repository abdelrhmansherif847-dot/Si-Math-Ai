// Exam Audio — the proctor's voice, and nothing else.
//
// Mock Exam v2, Phase 3. See docs/roadmap/mock-exam-v2-p2-design.md §3 for the
// original shape and the P3 investigation report for what was actually found.
//
// WHAT THIS IS
// ------------
// The first consumer of the announcement schedule P1 already built. The registry
// owns WHEN announcements happen (`announcements.marks`, `scheduleFor()`); this
// file owns only WHETHER it can safely speak and WHAT the words are. No timing
// rule is duplicated here, and none may be added — if a mark needs changing it
// changes in exam-registry.js.
//
// WHY speechSynthesis AND NOT AudioContext
// ----------------------------------------
// The whole P3 payload is spoken sentences. An AudioContext would buy gain
// nodes, ducking and buffer scheduling for a phase that plays no buffers and has
// nothing to duck against — infrastructure with no consumer, which is the thing
// this project keeps deciding not to build. `speechSynthesis` needs no assets,
// no .gitattributes change, no decode step and no network fetch. If prerecorded
// audio ever lands, it becomes a second emitter behind this same interface.
//
// THE ABSOLUTE INVARIANT
// ----------------------
// AUDIO OBSERVES; IT NEVER DRIVES. Nothing in this file touches timer state,
// view state, module state, saving, scoring, mistakes or the Weakness Analyzer.
// Every public method is total: it catches everything, returns a value, and
// never throws — so a caller in the timer path needs no guard of its own and can
// never be delayed. A browser with no speech support, a blocked autoplay policy,
// a suspended engine or an outright exception all produce exactly one outcome:
// silence. Silence is a working exam; a stalled timer is a ruined attempt.
//
// NOTHING HERE IS AWAITED. `speechSynthesis.speak()` is fire-and-forget by
// design, which is precisely why it suits a 1 Hz tick.
(function (root) {
  'use strict';

  // Student preference — a STABLE INTEGRATION POINT, not an unfinished edge.
  //
  // Set this to 'off' and every announcement falls silent. Nothing in the
  // product writes it today, so announcements default ON, and that is a recorded
  // decision rather than an omission: the control belongs in settings.html, and
  // opening settings.html would have turned an audio-bus phase into a settings
  // phase. See "AUDIO PREFERENCE UI" in
  // docs/roadmap/mock-exam-v2-implementation-plan.md — it is a separate
  // enhancement on top of a finished bus, and when it is built NOTHING in this
  // file needs to change.
  //
  // Known consequence in the meantime: a student who does not want spoken
  // announcements cannot turn them off.
  var PREF_KEY = 'simath_exam_announcements';

  // ── The words ──────────────────────────────────────────────────────────────
  //
  // Keys come from the registry's `announcements.marks` and its `halfway` /
  // `timeUp` flags. A key with no phrase here is simply not spoken — an unknown
  // key must never become an invented sentence.
  //
  // The three-minute wording is the one the specification called for by name:
  // it has to tell the student to check for blanks and guess rather than leave
  // anything empty, because on every exam Si Math AI simulates there is no
  // penalty for a wrong answer and leaving a blank is strictly worse.
  var PHRASES = {
    ten_minutes:   'Ten minutes remaining.',
    five_minutes:  'Five minutes remaining.',
    three_minutes: 'Three minutes remaining. Please make sure you have answered every question. '
                 + 'If you are unsure, make your best guess and do not leave any questions unanswered.',
    one_minute:    'One minute remaining.',
    halfway:       'You are halfway through this section.',
    time_up:       'Time is up. Please stop working.',
  };

  // ── Internal state ─────────────────────────────────────────────────────────
  var unlocked   = false;   // a real user gesture has primed the engine
  var armedKey   = null;    // "<sessionKey>|<ordinal>" — which block is armed
  var schedule   = [];      // the registry's marks for the armed block
  var fired      = null;    // Set of atRemainingSec already spoken in this block
  var ownsFn     = null;    // caller-supplied tab-ownership predicate

  function supported() {
    return typeof root.speechSynthesis !== 'undefined'
        && typeof root.SpeechSynthesisUtterance !== 'undefined';
  }

  function enabled() {
    try {
      var v = root.localStorage && root.localStorage.getItem(PREF_KEY);
      return v !== 'off';          // absent or anything else => on
    } catch (e) { return true; }    // storage blocked is not a reason to be silent
  }

  /** True only when this tab currently owns the sitting. Fails CLOSED. */
  function owns() {
    if (typeof ownsFn !== 'function') return false;
    try { return !!ownsFn(); } catch (e) { return false; }
  }

  function say(text) {
    if (!text || !supported() || !enabled()) return false;
    try {
      var u = new root.SpeechSynthesisUtterance(text);
      u.rate = 0.95;               // a shade under default: proctors do not rush
      u.volume = 1;
      root.speechSynthesis.speak(u);   // fire-and-forget, never awaited
      return true;
    } catch (e) {
      // Blocked, suspended, unsupported voice, anything at all: stay silent.
      try { root.console && root.console.warn('[exam-audio] speak failed:', e && e.message); } catch (_) {}
      return false;
    }
  }

  // ── Public API — every method is total and never throws ────────────────────

  /**
   * Prime the speech engine from inside a REAL user gesture.
   *
   * iOS Safari will not speak later unless `speak()` has been called once during
   * a genuine gesture, and the gesture must still be live — which means the
   * SYNCHRONOUS part of a handler, before any await. The exam's Start button is
   * `async` and performs eight awaited round-trips before the exam begins, so
   * unlocking where the exam starts would be far too late; it has to happen in
   * the handler's synchronous head.
   *
   * Speaks a single space rather than an empty string: some engines discard an
   * empty utterance without counting it as the priming call.
   */
  function unlock() {
    if (unlocked || !supported() || !enabled()) return unlocked;
    try {
      root.speechSynthesis.speak(new root.SpeechSynthesisUtterance(' '));
      unlocked = true;
    } catch (e) { /* stay locked; the exam does not care */ }
    return unlocked;
  }

  /** Supply the tab-ownership predicate. Kept injectable so this file never
   *  learns about localStorage keys, and so a test can drive it directly. */
  function configure(opts) {
    try { if (opts && typeof opts.owns === 'function') ownsFn = opts.owns; } catch (e) {}
  }

  /**
   * Arm the announcements for one block.
   *
   * IDEMPOTENT PER BLOCK. The TIMER view re-renders for reasons that have
   * nothing to do with starting a module, and re-arming would wipe the fired
   * set and let an announcement repeat. Arming is therefore keyed by
   * "<sessionKey>|<ordinal>" and a repeat call for the same block is a no-op.
   *
   * PRE-FIRING THE PAST is what makes a refresh safe without persisting
   * anything. A student who restores with 4:30 left has already heard the
   * five-minute warning; every mark at or above the current remaining time is
   * seeded as already-spoken, so only genuinely future marks can fire. That
   * keeps P2's persistence format untouched, which it is: this file writes
   * nothing to the timer blob.
   *
   * `sched` MUST come from exam-registry.js. This module derives no timing.
   */
  function armBlock(sessionKey, ordinal, sched, remainingSec) {
    try {
      var key = String(sessionKey) + '|' + String(ordinal);
      if (key === armedKey) return false;      // same block, keep what has fired
      armedKey = key;
      schedule = Array.isArray(sched) ? sched.slice() : [];
      fired = {};
      for (var i = 0; i < schedule.length; i++) {
        // Already passed at arm time => treat as spoken.
        if (typeof remainingSec === 'number' && schedule[i].atRemainingSec >= remainingSec) {
          fired[schedule[i].atRemainingSec] = true;
        }
      }
      return true;
    } catch (e) { armedKey = null; schedule = []; fired = {}; return false; }
  }

  /** Forget the armed block. Called when a block ends so nothing lingers. */
  function disarm() {
    try { armedKey = null; schedule = []; fired = {}; } catch (e) {}
  }

  /**
   * Called once per timer tick with the seconds remaining in the current block.
   *
   * Cheap by construction: an in-memory scan of at most a handful of marks, with
   * NO storage access, NO ownership check and NO speech unless a mark is
   * actually due. The ownership read happens only at the moment an announcement
   * would be spoken, which is the rule P3 was given — a 1 Hz localStorage poll
   * for the benefit of audio would be a real cost for no benefit.
   *
   * Returns the key spoken, or null. Never throws.
   */
  function announceIfDue(remainingSec) {
    try {
      if (!armedKey || !schedule.length) return null;
      if (typeof remainingSec !== 'number') return null;

      var due = null;
      for (var i = 0; i < schedule.length; i++) {
        var m = schedule[i];
        if (fired[m.atRemainingSec]) continue;
        if (remainingSec <= m.atRemainingSec) {
          // Most-recently-passed wins if several are crossed at once (a long
          // background stall), so the student hears "one minute" and not
          // "ten minutes" after the tab wakes up.
          if (!due || m.atRemainingSec < due.atRemainingSec) due = m;
          // Everything else crossed is consumed silently rather than queued —
          // a burst of stale warnings is worse than none.
          fired[m.atRemainingSec] = true;
        }
      }
      if (!due) return null;

      // Ownership is checked HERE, once, and only because something is due.
      if (!owns()) return null;

      // Returns the key only when a phrase was ACTUALLY spoken. The mark is
      // consumed either way above, so an unsupported engine never queues a
      // backlog — it just stays silent.
      return say(PHRASES[due.key]) ? due.key : null;
    } catch (e) { return null; }
  }

  /** Stop anything mid-sentence — used when a block or the exam ends. */
  function cancel() {
    try { if (supported()) root.speechSynthesis.cancel(); } catch (e) {}
  }

  // ── Ambient channel: declared, inert, and deliberately empty ───────────────
  // P3 ships no ambient audio: no assets, no timers, no controls, nothing
  // scheduled. This exists so a future phase has an obvious place to land
  // rather than reshaping the bus, and it is a stub on purpose — an inert
  // extension point costs nothing, whereas an unused scheduler costs a
  // maintenance burden and invites someone to wire it up by accident.
  var ambient = {
    available: function () { return false; },
    start: function () { return false; },
    stop: function () { return false; },
  };

  root.SiExamAudio = {
    PREF_KEY: PREF_KEY,
    PHRASES: PHRASES,

    supported: supported,
    enabled: enabled,
    isUnlocked: function () { return unlocked; },

    unlock: unlock,
    configure: configure,
    armBlock: armBlock,
    disarm: disarm,
    announceIfDue: announceIfDue,
    cancel: cancel,

    ambient: ambient,

    // Test seam only — never called by the page.
    _reset: function () { unlocked = false; armedKey = null; schedule = []; fired = {}; ownsFn = null; },
  };
}(typeof globalThis !== 'undefined' ? globalThis : this));
