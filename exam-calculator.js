// Exam Calculator — the socket, and the truth about calculator policy.
//
// Mock Exam v2, Phase 4.
//
// WHAT THIS FILE IS FOR, AND WHY IT IS SO SMALL
// ---------------------------------------------
// Two jobs, and deliberately not a third.
//
//   1. Turn the registry's calculator descriptor into an accurate sentence.
//   2. Hold a provider registry that is EMPTY, so a licensed calculator can be
//      registered later without touching the exam lifecycle.
//
// It does NOT open a panel, mount a modal, trap focus or bind Escape. There is
// no provider, so there is nothing to open; building the machinery to open
// nothing would be speculative UI for a hypothetical future, and this project
// keeps deciding not to do that.
//
// THE PROBLEM THIS ACTUALLY FIXES
// -------------------------------
// mock-exam.html rendered the literal string "Calculator Allowed" in three
// places, unconditionally, for every exam. It read no policy at all. So a
// student sitting EST Math 1 — where a calculator is permitted in part 2 ONLY —
// was told, flatly, "Calculator Allowed". P1 encoded the real policy; nothing
// consumed it. This file is what makes the screen agree with the registry.
//
// `provider: null` IS THE NORMAL STATE, NOT AN ERROR
// ---------------------------------------------------
// Every exam has `provider: null` today, and will until a licensed calculator
// is both registered AND named by an exam's policy. So the socket's ordinary
// path is the one where nothing renders — the student is told the test-day
// policy and offered no in-app tool, because there is none.
//
// A CORRECTION, RECORDED RATHER THAN QUIETLY DROPPED
// --------------------------------------------------
// This comment used to say the socket would stay empty "until a written Desmos
// agreement exists", citing mock-exam-v2-investigation.md §7. That was wrong,
// and wrong in a way that mattered: §7 reasoned from the desmos.com WEBSITE
// Terms of Service, which govern the public website and do prohibit framing and
// mirroring it. Embedding is governed by a different document — the Desmos API
// Terms of Service (v1.0, 11 July 2025) — which grants exactly the licence §7
// concluded did not exist:
//
//   §5.a "Desmos Studio grants you a non-exclusive, revocable, non-transferable,
//        non-sublicensable (except for use by your End Users of the
//        Applications), limited license to: (i) access and use the Software
//        Service solely for the purpose of incorporating Content into the
//        Applications..."
//
//   §3.a "Prior to any use of the Software Services outside of the Trial Tier
//        Usage Limits, including as part of any commercial Application, you
//        agree to: (a) upgrade to an appropriate paid plan via our self-service
//        pathway or (b) contact us via email to partnerships@desmos.com and
//        enter into a written Commercial Addendum to these Terms."
//
// So a written agreement is ONE of two routes, not the only one, and a
// self-service paid plan is the other. What still gates activation is a paid
// API key, not a signature. Full record: docs/engineering/desmos-integration.md.
//
// The prohibitions that DO survive, and that this codebase honours:
//   - the public website may not be framed or mirrored (website ToS) — so the
//     integration loads the official API script, never desmos.com in an iframe;
//   - §5.b(iii) forbids removing, altering or obscuring Desmos branding on the
//     Software Service or Content — so nothing of ours is drawn over the
//     calculator's own surface;
//   - §6.b licenses the Marks to IDENTIFY the tool inside the product, and not
//     for marketing or promotion without written consent.
//
// WHAT IT MUST NEVER BECOME
// -------------------------
// A dependency. The timer, scoring, saving, mistakes and the Weakness Analyzer
// must all work identically whether this file loads or not.
(function (root) {
  'use strict';

  // ── Provider registry — starts empty, and stays the only way in ────────────
  //
  // A provider supplies an in-app calculator. The registry starts empty; a
  // provider module registers itself when it loads. Registration is NOT the
  // same as availability: `isInAppAvailable()` also requires the exam's own
  // policy to name that provider, and no exam does. So a registered provider
  // still shows a student nothing until an exam asks for it by name.
  var PROVIDERS = {};

  /**
   * Register an in-app calculator provider.
   *
   * Exists so a future licensed integration is a registration rather than a
   * redesign. Nothing calls it today. A provider must supply `mount(el, opts)`
   * and `unmount()`; anything else is rejected rather than half-accepted,
   * because a provider that cannot unmount would leak across exams.
   */
  function registerProvider(id, impl) {
    try {
      if (!id || !impl || typeof impl.mount !== 'function' || typeof impl.unmount !== 'function') {
        return false;
      }
      PROVIDERS[id] = impl;
      return true;
    } catch (e) { return false; }
  }

  function getProvider(id) {
    try { return (id && PROVIDERS[id]) || null; } catch (e) { return null; }
  }

  function providerCount() {
    try { return Object.keys(PROVIDERS).length; } catch (e) { return 0; }
  }

  function policyFor(code) {
    try {
      return (root.SiExamRegistry && root.SiExamRegistry.calculatorPolicy(code)) || null;
    } catch (e) { return null; }
  }

  /**
   * Does Si Math AI render a calculator for this exam right now?
   *
   * Requires BOTH a policy naming a provider AND that provider actually being
   * registered. Today the first half is never true, so this is always false —
   * which is correct, not a gap.
   */
  function isInAppAvailable(code) {
    try {
      var p = policyFor(code);
      if (!p || !p.allowed || !p.provider) return false;
      return !!getProvider(p.provider);
    } catch (e) { return false; }
  }

  // ── Policy → the sentence a student reads ──────────────────────────────────
  //
  // Four states, each describing TEST DAY, because that is what a student
  // practising for test day needs to know. None of them claims Si Math AI
  // provides a tool; the absence of a button says that, and saying it twice in
  // a badge would be noise.
  //
  // The 'partial' wording is the careful one. EST Math 1 permits a calculator in
  // part 2 only, and this system has no section model — it cannot know which
  // part is running, and must not imply that it does. "During designated
  // portions" is true and makes no claim about live enforcement. A real
  // section-level policy waits for the Question Spine.
  var TEXT = {
    none:      'No calculator permitted',
    partial:   'Calculator permitted during designated portions',
    byod:      'Calculator allowed — bring your own',
    provided:  'Calculator provided on test day',
  };

  /**
   * What the UI should say about `code`, as data.
   *
   * Returns {show, state, text, detail, tone, inApp} or null for an unknown
   * exam. Rendering stays in the page; deciding stays here, so the decision is
   * testable without a DOM.
   *
   * `detail` is the registry's own `note` — the longer, factual description of
   * the real test-day experience. It is passed through untouched rather than
   * paraphrased, so there is exactly one place calculator facts are written.
   */
  function describe(code) {
    try {
      var p = policyFor(code);
      if (!p) return null;

      var state, text;
      if (!p.allowed) {
        state = 'none';     text = TEXT.none;
      } else if (p.scope === 'partial') {
        state = 'partial';  text = TEXT.partial;
      } else if (p.byod) {
        state = 'byod';     text = TEXT.byod;
      } else {
        state = 'provided'; text = TEXT.provided;
      }

      return {
        show: true,
        state: state,
        text: text,
        detail: p.note || '',
        // 'warn' only when a calculator is forbidden — the one case that must
        // not be rendered in the reassuring green the badge uses by default.
        tone: state === 'none' ? 'warn' : 'info',
        // Always false today. When a licensed provider is registered this
        // becomes true and the page may offer a control; until then it is what
        // guarantees no button appears.
        inApp: isInAppAvailable(code),
      };
    } catch (e) { return null; }
  }

  root.SiExamCalculator = {
    TEXT: TEXT,

    registerProvider: registerProvider,
    getProvider: getProvider,
    providerCount: providerCount,

    policyFor: policyFor,
    isInAppAvailable: isInAppAvailable,
    describe: describe,

    // Test seam only — never called by the page.
    _reset: function () { PROVIDERS = {}; },
  };
}(typeof globalThis !== 'undefined' ? globalThis : this));
