// Exam Integrity — detection and recording, and absolutely nothing else.
//
// Mock Exam v2, Phase 5. First (and only) writer of the exam_integrity_events
// table that M1 applied to production on 2026-08-23.
//
// THE ABSOLUTE BOUNDARY
// ---------------------
// P5 DETECTS AND RECORDS. IT DOES NOT WARN, PAUSE, TERMINATE, SCORE, FLAG,
// PENALIZE OR ENFORCE. Nothing in this file touches timer state, view state,
// module state, saving, scoring, mistakes or the Weakness Analyzer — it holds no
// reference to any of them, which a test asserts by scanning this source. Its
// entire observable output is rows appearing in a table only admins can read.
// Enforcement, warnings and review belong to M2 and later, behind their own
// approvals.
//
// Detection is also NOT proof. Every row is client-reported: a browser cannot
// detect screenshots, a phone camera is invisible to it, and a hostile client
// can suppress or forge reports. M1's own table comment says the same. This is
// an audit trail and a deterrent — which is exactly why nothing automatic ever
// hangs off it.
//
// THE DATABASE IS THE SOLE AUTHORITY ON CONFIDENCE
// ------------------------------------------------
// This file sends `event_type` and bounded metadata only. It never sends a
// `confidence` value — it cannot: the column is GENERATED, and production
// rejects a supplied value with 428C9. Classification (high = copy, print,
// fullscreen_exit; low = the rest) lives in the schema, where the client cannot
// mislabel an event to dodge or manufacture anything.
//
// PRE-P6 CONTEXT — RECORDED SO IT IS NOT REDISCOVERED WRONGLY LATER
// -----------------------------------------------------------------
// Until the Question Spine (P6) exists, the exam page displays NO question
// content: a `copy` on today's page copies the timer, nothing more. Rows written
// before P6 therefore must NOT later be interpreted as evidence that a student
// copied exam-question content — there was none on screen to copy. P5 builds the
// plumbing; the high-confidence events acquire their full meaning only when
// questions render.
//
// FULLSCREEN IS DORMANT, DELIBERATELY. `fullscreen_exit` exists in M1's schema
// but the exam never enters fullscreen, so it cannot fire and P5 adds no
// fullscreen UX — that would be a student-facing change deserving its own
// decision, not an integrity feature arriving through the back door.
//
// FAILURE MODEL: everything here is total and fire-and-forget. A network drop,
// a refused insert, a throwing ownership check, a missing API — all produce
// silence and nothing else. No retry queue: this is best-effort evidence, and a
// retry storm in an exam tab would be a real cost for a log that is explicitly
// not proof.
(function (root) {
  'use strict';

  // ── Storm protection — NOT behaviour, NOT silencing policy ─────────────────
  //
  // These two limits exist to protect the database and the client from event
  // storms (a notification flap can fire visibility/blur many times a minute),
  // and for no other reason. They are not a judgement about which events
  // matter, and they must never affect the exam: reaching the cap changes
  // exactly one thing — further INSERTs stop. The timer, the attempt, the UI
  // and every state transition continue identically, which the test suite
  // asserts by verifying this module holds no reference to any of them.
  var DEBOUNCE_MS = 5000;           // at most one event per type per 5 s
  var MAX_EVENTS_PER_LOAD = 25;     // hard ceiling per page load

  // ── The disclosure (G6) — approved verbatim; the page renders THIS object ──
  //
  // Single source of truth for the student-facing notice. mock-exam.html
  // renders these strings by reference and a test compares them against the
  // approved wording character-for-character, so the copy shown to students
  // cannot drift from what was reviewed. The <b> tags are display markup within
  // approved copy, not user input.
  var NOTICE = {
    title: 'Exam integrity notice',
    paragraphs: [
      'To keep mock exams fair, Si Math AI records a small set of technical events '
        + 'while an exam is running: when text is copied, when printing is attempted, '
        + 'when the right-click menu is opened, and when the exam tab is hidden or '
        + 'loses focus.',
      'Ordinary interruptions — a notification, an incoming call, switching apps for '
        + 'a moment — are <b>not</b> treated as violations by themselves.',
      'No penalty is applied automatically based on these events alone. Any concern '
        + 'is reviewed by a person before any action is taken.',
      'What is stored is minimal: the type of event, when it happened, and — for some '
        + 'events — a duration or a character count. <b>Never</b> your keystrokes, '
        + 'your screen contents, or the text you copied.',
    ],
  };

  // ── Internal state ─────────────────────────────────────────────────────────
  var active     = false;
  var ctx        = null;     // { sb, userId, attemptId, examCode, startedAtMs }
  var lastByType = {};       // per page load, per event type — debounce clock
  var sentCount  = 0;        // per page load — the storm cap counts against this
  var hiddenAt   = null;     // when the tab went hidden (duration measured on return)
  var blurredAt  = null;     // when the window lost focus
  var bound      = false;
  var handlers   = {};
  var ownsFn     = null;     // injected tab-ownership predicate (P3's pattern)
  var nowFn      = null;     // injectable clock, for deterministic tests

  function noop() {}

  function now() {
    try { return typeof nowFn === 'function' ? nowFn() : Date.now(); }
    catch (e) { return Date.now(); }
  }

  /** True only when this tab owns the sitting. FAILS CLOSED — no predicate, or
   *  a throwing one, means "do not write", never "write anyway". */
  function owns() {
    if (typeof ownsFn !== 'function') return false;
    try { return !!ownsFn(); } catch (e) { return false; }
  }

  function parseStartMs(iso) {
    try {
      var ms = Date.parse(iso);
      return isNaN(ms) ? null : ms;
    } catch (e) { return null; }
  }

  /** Milliseconds since exam start, clamped to M1's CHECK bounds; null when the
   *  start time is unknown. Diagnostic only — the server's occurred_at is the
   *  authoritative clock, which is exactly why M1 designed it that way. */
  function elapsedMs(atMs) {
    if (!ctx || ctx.startedAtMs == null) return null;
    var e = Math.round(atMs - ctx.startedAtMs);
    if (!(e >= 0)) return 0;
    return e > 86400000 ? 86400000 : e;
  }

  /** Client-side mirror of M1's metadata whitelist: only the three approved
   *  keys, only non-negative numbers. The DATABASE enforces this regardless —
   *  mirroring it here just avoids sending inserts guaranteed to be refused. */
  function cleanMeta(meta) {
    var out = {};
    if (!meta || typeof meta !== 'object') return out;
    var KEYS = ['selection_length', 'hidden_ms', 'blurred_ms'];
    for (var i = 0; i < KEYS.length; i++) {
      var v = meta[KEYS[i]];
      if (typeof v === 'number' && isFinite(v) && v >= 0) out[KEYS[i]] = Math.round(v);
    }
    return out;
  }

  /**
   * Record one event. Total, synchronous, fire-and-forget.
   *
   * Order matters and is deliberate:
   *   1. active check       — detection is scoped to a running TIMER view;
   *   2. cap                — storm protection before anything else spends work;
   *   3. debounce per type  — one event per type per DEBOUNCE_MS;
   *   4. ownership          — checked LAST and only for an event that would
   *                           actually be written, mirroring P3's rule: never a
   *                           per-event localStorage read for storms the cap and
   *                           debounce already discarded.
   *
   * The INSERT is never awaited and both promise arms are consumed, so neither
   * a slow network nor a refused row can reach the caller — the surrounding
   * event handler returns immediately either way.
   */
  function record(type, meta) {
    try {
      if (!active || !ctx) return false;
      var t = now();
      if (sentCount >= MAX_EVENTS_PER_LOAD) return false;
      var last = lastByType[type];
      if (typeof last === 'number' && (t - last) < DEBOUNCE_MS) return false;
      if (!owns()) return false;

      lastByType[type] = t;
      sentCount++;

      var q = ctx.sb.from('exam_integrity_events').insert({
        user_id:    ctx.userId,
        attempt_id: ctx.attemptId,
        exam_code:  ctx.examCode,
        event_type: type,
        elapsed_ms: elapsedMs(t),
        metadata:   cleanMeta(meta),
      });
      if (q && typeof q.then === 'function') q.then(noop, noop);
      return true;
    } catch (e) { return false; }
  }

  // ── Detectors ──────────────────────────────────────────────────────────────
  //
  // Durations are measured ON RETURN: visibility_hidden is written when the tab
  // becomes visible again, carrying the real hidden_ms, because the table is
  // append-only and a row cannot be written first and finished later. The cost
  // is stated plainly: a student who hides the tab and never comes back logs no
  // event — and an abandoned attempt is itself the visible signal, per M1's own
  // design notes.

  function onCopy() {
    var len = null;
    try {
      var sel = root.getSelection && root.getSelection();
      if (sel) len = String(sel.toString()).length;
    } catch (e) {}
    record('copy', typeof len === 'number' ? { selection_length: len } : {});
  }

  function onBeforePrint() { record('print', {}); }

  function onContextMenu() { record('context_menu', {}); }

  function onVisibilityChange() {
    try {
      var d = root.document;
      if (!d) return;
      if (d.visibilityState === 'hidden') {
        if (hiddenAt == null) hiddenAt = now();
      } else if (hiddenAt != null) {
        var dur = now() - hiddenAt;
        hiddenAt = null;
        record('visibility_hidden', { hidden_ms: dur });
      }
    } catch (e) {}
  }

  function onBlur() { try { if (blurredAt == null) blurredAt = now(); } catch (e) {} }

  function onFocus() {
    try {
      if (blurredAt == null) return;
      var dur = now() - blurredAt;
      blurredAt = null;
      record('window_blur', { blurred_ms: dur });
    } catch (e) {}
  }

  function bind() {
    if (bound) return;
    try {
      var d = root.document;
      handlers = {
        copy: onCopy, contextmenu: onContextMenu, visibilitychange: onVisibilityChange,
        beforeprint: onBeforePrint, blur: onBlur, focus: onFocus,
      };
      if (d && d.addEventListener) {
        d.addEventListener('copy', handlers.copy);
        d.addEventListener('contextmenu', handlers.contextmenu);
        d.addEventListener('visibilitychange', handlers.visibilitychange);
      }
      if (root.addEventListener) {
        root.addEventListener('beforeprint', handlers.beforeprint);
        root.addEventListener('blur', handlers.blur);
        root.addEventListener('focus', handlers.focus);
      }
      bound = true;
    } catch (e) {}
  }

  function unbind() {
    if (!bound) return;
    try {
      var d = root.document;
      if (d && d.removeEventListener) {
        d.removeEventListener('copy', handlers.copy);
        d.removeEventListener('contextmenu', handlers.contextmenu);
        d.removeEventListener('visibilitychange', handlers.visibilitychange);
      }
      if (root.removeEventListener) {
        root.removeEventListener('beforeprint', handlers.beforeprint);
        root.removeEventListener('blur', handlers.blur);
        root.removeEventListener('focus', handlers.focus);
      }
    } catch (e) {}
    bound = false;
    handlers = {};
  }

  // ── Public API — every method is total and never throws ────────────────────

  /** Inject the tab-ownership predicate (and, in tests, a clock). This module
   *  never learns localStorage keys — same injection pattern as exam-audio. */
  function configure(opts) {
    try {
      if (opts && typeof opts.owns === 'function') ownsFn = opts.owns;
      if (opts && typeof opts.now === 'function') nowFn = opts.now;
    } catch (e) {}
  }

  /**
   * Start detection for one attempt. Idempotent per attemptId — the TIMER view
   * re-renders for reasons unrelated to starting an exam, and a repeat call for
   * the same attempt must not disturb anything.
   *
   * Whether an exam is SUBJECT to detection at all is not decided here: the
   * page consults exam-registry.js (integrityLoggingEnabled) before calling
   * begin(). Policy lives in the registry as data; this module only executes.
   */
  function begin(opts) {
    try {
      if (!opts || !opts.sb || !opts.userId || !opts.attemptId || !opts.examCode) return false;
      if (active && ctx && ctx.attemptId === opts.attemptId) return false;
      ctx = {
        sb: opts.sb,
        userId: String(opts.userId),
        attemptId: String(opts.attemptId),
        examCode: String(opts.examCode).slice(0, 40),
        startedAtMs: parseStartMs(opts.examStartedAt),
      };
      hiddenAt = null;
      blurredAt = null;
      active = true;
      bind();
      return true;
    } catch (e) { return false; }
  }

  /** Stop detection. Pending half-measured durations are discarded — a blur
   *  that spans leaving the TIMER view (module boundary, exam end) is not an
   *  in-exam event and must not be written as one. */
  function end() {
    try {
      active = false;
      ctx = null;
      hiddenAt = null;
      blurredAt = null;
      unbind();
    } catch (e) {}
  }

  root.SiExamIntegrity = {
    NOTICE: NOTICE,
    DEBOUNCE_MS: DEBOUNCE_MS,
    MAX_EVENTS_PER_LOAD: MAX_EVENTS_PER_LOAD,

    configure: configure,
    begin: begin,
    end: end,
    isActive: function () { return active; },

    // Test seam only — never called by the page.
    _reset: function () {
      end();
      lastByType = {}; sentCount = 0; ownsFn = null; nowFn = null;
    },
    _sentCount: function () { return sentCount; },
  };
}(typeof globalThis !== 'undefined' ? globalThis : this));
