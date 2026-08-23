// Exam Registry — the single source of truth for what a mock exam IS.
//
// Mock Exam v2, Phase 1a. See docs/roadmap/mock-exam-v2-implementation-plan.md.
//
// WHY THIS FILE EXISTS
// --------------------
// Every exam configuration lived as one object literal inside mock-exam.html, a
// ~101 KB page that was frozen. Adding an exam, correcting a name, or teaching
// the timer about DSAT's two modules all meant editing that file. The numbers in
// it were right; the place they lived was not.
//
// Moving them here buys three things the literal could not:
//
//   1. Exams become DATA. A new exam is a new entry, not a code change.
//   2. Totals are DERIVED. `duration` and `questions` are computed from the
//      module list, so a two-module exam cannot claim a total that disagrees
//      with its parts — a whole class of drift that simply cannot occur now.
//   3. Policies get room to be honest. `calculator: true` could not express
//      "permitted, but only in part 2, and you bring your own device". The
//      calculator descriptor can.
//
// PHASE 1a CONTRACT: NOTHING CONSUMES THIS YET.
// mock-exam.html is untouched in this phase. `compat()` exists so that when it
// IS wired up (Phase 1b), the diff in that file is: delete one object literal,
// add one script tag. tests/exam-registry.test.mjs reads the real literal out of
// mock-exam.html and asserts compat() reproduces it field-for-field, with the
// one approved exception recorded below. That test is what makes the swap safe.
//
// THE ONE APPROVED DIFFERENCE FROM TODAY'S PRODUCTION VALUES
// ----------------------------------------------------------
// EST was labelled "Emirates Standardized Test". EST is the *Egyptian Scholastic
// Test* — the SAT/ACT-equivalent used for admission to Egyptian universities,
// which is what Si Math AI's students actually sit. The old string was shown to
// students on the exam card. Corrected here, once, at the source.
//
// NOT A BUILD ARTEFACT. Authored by hand; no generator, no sync step. Unlike
// taxonomy.js there is no second copy to drift from.
(function (root) {
  'use strict';

  // ── Calculator policy vocabulary ───────────────────────────────────────────
  //
  // `allowed`  — may a calculator be used at all.
  // `scope`    — 'exam'    permitted throughout
  //              'partial' permitted for part of the exam only (see `note`)
  //              'none'    not permitted
  // `byod`     — true when test day has NO on-screen calculator and the student
  //              brings their own approved device. This is the distinction a
  //              boolean could not carry: "a calculator is allowed" and "we
  //              should show you one" are different claims.
  // `provider` — which calculator Si Math AI itself renders. **null is a valid,
  //              supported state and the current state of every exam.** Desmos
  //              is separately licensed and MUST NOT be embedded, iframed,
  //              framed or mirrored without a written agreement, and no other
  //              calculator may be presented as a Desmos or DSAT equivalent.
  //              Phase 4 builds the socket; it registers no providers.
  // `note`     — factual, student-facing-ready description of the real test-day
  //              experience. Honesty is the product requirement here: a student
  //              practising against the wrong calculator builds wrong habits.
  var CALC_SCOPES = ['exam', 'partial', 'none'];

  // ── Ambience default ───────────────────────────────────────────────────────
  // OFF. Ambient exam-hall sound is opt-in through an explicitly chosen
  // "Realistic Exam Environment", never a default imposed on every student.
  // Background noise during a timed high-stakes task is actively harmful for
  // students with ADHD, autism, sensory or auditory processing differences, and
  // it competes directly with screen-reader speech. Encoded as data so the
  // decision cannot be quietly reversed by a UI edit.
  var DEFAULT_AMBIENCE_ENABLED = false;

  // Below this, a halfway announcement is noise rather than information — on a
  // 6-minute practice block "three minutes remaining" already says it.
  var HALFWAY_MIN_SEC = 600;

  // ── The exams ──────────────────────────────────────────────────────────────
  //
  // `modules` is always an array for a fixed-length exam, even when there is
  // only one. A single shape means the timer state machine never branches on
  // "is this the modular one" — it walks a list of length 1 or 2.
  //
  // `modules: null` marks a DYNAMIC exam whose length comes from student input
  // at start time (Practice Timer: questions × 1.5 min). Totals are unknowable
  // until then, which is exactly why production reports them as null.
  var EXAMS = [
    {
      code: 'SAT_MODULE_1',
      examType: 'SAT',
      displayName: 'SAT Math — Module 1',
      shortName: 'Module 1',
      org: 'College Board · Digital SAT',
      scoreMin: 200,
      scoreMax: 800,
      modules: [
        { ordinal: 1, label: 'Module 1', questions: 22, durationMinutes: 35 },
      ],
      calculator: {
        allowed: true, scope: 'exam', byod: false, provider: null,
        note: 'The Digital SAT provides a built-in Desmos calculator inside Bluebook, '
            + 'available on every Math question. Si Math AI does not include it.',
      },
      announcements: {
        perModule: true,
        halfway: true,
        marks: [
          { atRemainingSec: 300, key: 'five_minutes' },
          { atRemainingSec: 180, key: 'three_minutes' },
          { atRemainingSec: 60,  key: 'one_minute' },
        ],
        timeUp: true,
      },
      ambience: { eligible: true },
    },

    {
      code: 'SAT_MODULE_2',
      examType: 'SAT',
      displayName: 'SAT Math — Module 2',
      shortName: 'Module 2',
      org: 'College Board · Digital SAT',
      scoreMin: 200,
      scoreMax: 800,
      // Ordinal 1: this is a standalone practice session that happens to drill
      // Module 2's content. Ordinal is a position WITHIN THIS SESSION, not a
      // position within the real exam — otherwise a one-module session would
      // start at index 2 and every loop would need a special case.
      modules: [
        { ordinal: 1, label: 'Module 2', questions: 22, durationMinutes: 35 },
      ],
      calculator: {
        allowed: true, scope: 'exam', byod: false, provider: null,
        note: 'The Digital SAT provides a built-in Desmos calculator inside Bluebook, '
            + 'available on every Math question. Si Math AI does not include it.',
      },
      announcements: {
        perModule: true,
        halfway: true,
        marks: [
          { atRemainingSec: 300, key: 'five_minutes' },
          { atRemainingSec: 180, key: 'three_minutes' },
          { atRemainingSec: 60,  key: 'one_minute' },
        ],
        timeUp: true,
      },
      ambience: { eligible: true },
    },

    {
      code: 'SAT_FULL',
      examType: 'SAT',
      displayName: 'Full SAT Math',
      shortName: 'Full SAT',
      org: 'College Board · Digital SAT (Both Modules)',
      scoreMin: 200,
      scoreMax: 800,
      // The real Digital SAT Math section is two SEPARATELY TIMED 35-minute
      // modules, not one 70-minute block. Production currently runs it as a
      // single countdown; Phase 2 teaches the timer to walk this list. The data
      // is correct here first so Phase 2 is a state-machine change only.
      //
      // Totals stay 44 questions / 70 minutes either way — derived, not typed.
      modules: [
        { ordinal: 1, label: 'Module 1', questions: 22, durationMinutes: 35 },
        // ADAPTIVE SLOT. On test day the Digital SAT routes every student to one
        // of two Module 2 forms based on Module 1. Both are 22 questions and 35
        // minutes, which is why routing changes NO timing — the timer state
        // machine is untouched by any of this.
        //
        // Note there is deliberately NO per-variant `label`. The module's own
        // label ('Module 2') is what a student sees either way, so no screen can
        // leak which path was taken. That matters doubly while routing is inert:
        // naming a path would imply a measurement we are not making.
        { ordinal: 2, label: 'Module 2', questions: 22, durationMinutes: 35,
          variants: [{ id: 'standard' }, { id: 'advanced' }] },
      ],
      calculator: {
        allowed: true, scope: 'exam', byod: false, provider: null,
        note: 'The Digital SAT provides a built-in Desmos calculator inside Bluebook, '
            + 'available on every Math question. Si Math AI does not include it.',
      },
      announcements: {
        // Per module: on a two-module exam, "three minutes remaining" has to
        // mean three minutes of THIS module. A session-level schedule would
        // announce it once, 38 minutes into a 70-minute session, which is wrong
        // twice over.
        perModule: true,
        halfway: true,
        marks: [
          { atRemainingSec: 300, key: 'five_minutes' },
          { atRemainingSec: 180, key: 'three_minutes' },
          { atRemainingSec: 60,  key: 'one_minute' },
        ],
        timeUp: true,
      },
      ambience: { eligible: true },
    },

    {
      code: 'EST_MATH_1',
      examType: 'EST',
      displayName: 'EST Math 1',
      shortName: 'EST Math 1',
      org: 'Egyptian Scholastic Test (EST)',
      scoreMin: 200,
      scoreMax: 800,
      modules: [
        { ordinal: 1, label: 'EST Math 1', questions: 50, durationMinutes: 75 },
      ],
      calculator: {
        // 'partial', not 'exam': EST Math 1 permits a calculator in part 2 only.
        // The part boundary is NOT modelled as two modules here, deliberately —
        // doing so would change production timer behaviour, and the exact split
        // has not been verified against an authoritative EST source. Recording
        // the policy honestly costs nothing; inventing a boundary would not.
        allowed: true, scope: 'partial', byod: true, provider: null,
        note: 'EST Math 1 permits a calculator in part 2 only. Students bring their own '
            + 'approved calculator on test day. The part boundary is not modelled yet.',
      },
      announcements: {
        perModule: false,
        halfway: true,
        marks: [
          { atRemainingSec: 600, key: 'ten_minutes' },
          { atRemainingSec: 300, key: 'five_minutes' },
          { atRemainingSec: 180, key: 'three_minutes' },
          { atRemainingSec: 60,  key: 'one_minute' },
        ],
        timeUp: true,
      },
      ambience: { eligible: true },
    },

    {
      code: 'EST_MATH_2_L1',
      examType: 'EST',
      displayName: 'EST Math 2 — Level 1',
      shortName: 'EST Math 2 L1',
      org: 'Egyptian Scholastic Test (EST)',
      scoreMin: 200,
      scoreMax: 800,
      modules: [
        { ordinal: 1, label: 'EST Math 2 — Level 1', questions: 40, durationMinutes: 60 },
      ],
      calculator: {
        allowed: true, scope: 'exam', byod: true, provider: null,
        note: 'Students bring their own approved calculator on test day.',
      },
      announcements: {
        perModule: false,
        halfway: true,
        marks: [
          { atRemainingSec: 600, key: 'ten_minutes' },
          { atRemainingSec: 300, key: 'five_minutes' },
          { atRemainingSec: 180, key: 'three_minutes' },
          { atRemainingSec: 60,  key: 'one_minute' },
        ],
        timeUp: true,
      },
      ambience: { eligible: true },
    },

    {
      code: 'ACT_MATH',
      examType: 'ACT',
      displayName: 'ACT Math',
      shortName: 'ACT Math',
      org: 'ACT Inc.',
      scoreMin: 1,
      scoreMax: 36,
      modules: [
        { ordinal: 1, label: 'ACT Math', questions: 45, durationMinutes: 50 },
      ],
      calculator: {
        allowed: true, scope: 'exam', byod: true, provider: null,
        note: 'The ACT permits 4-function, scientific and graphing calculators but bans '
            + 'CAS models. On paper the student brings their own; the online ACT provides '
            + 'a built-in Desmos calculator.',
      },
      announcements: {
        perModule: false,
        halfway: true,
        marks: [
          { atRemainingSec: 300, key: 'five_minutes' },
          { atRemainingSec: 180, key: 'three_minutes' },
          { atRemainingSec: 60,  key: 'one_minute' },
        ],
        timeUp: true,
      },
      ambience: { eligible: true },
    },

    {
      code: 'PRACTICE',
      examType: 'PRACTICE',
      displayName: 'Practice Timer',
      shortName: 'Practice',
      org: 'General Practice & Drills',
      scoreMin: 0,
      scoreMax: 9999,
      // Dynamic: length is questions × PRACTICE_MINUTES_PER_QUESTION, and the
      // question count comes from the student at start time. Totals are null
      // until then — which is what production already reports.
      modules: null,
      calculator: {
        allowed: true, scope: 'exam', byod: true, provider: null,
        note: '',
      },
      announcements: {
        perModule: false,
        halfway: true,
        marks: [
          { atRemainingSec: 300, key: 'five_minutes' },
          { atRemainingSec: 180, key: 'three_minutes' },
          { atRemainingSec: 60,  key: 'one_minute' },
        ],
        timeUp: true,
      },
      ambience: { eligible: true },
    },
  ];

  // Practice pacing target. mock-exam.html holds the same 1.5 today; this is
  // where it belongs, and Phase 1b removes the duplicate.
  var PRACTICE_MINUTES_PER_QUESTION = 1.5;

  // ── Adaptive routing — gated, and currently inert ──────────────────────────
  //
  // WHAT THE REAL DSAT DOES: multistage adaptive testing at the MODULE level.
  // Module 1 is mixed difficulty and identical for everyone; only Module 2
  // adapts, between two forms, and the lower path carries a real score
  // consequence.
  //
  // WHAT COLLEGE BOARD DOES NOT PUBLISH: the routing threshold. The widely
  // repeated "about 70% of Module 1 correct routes up" is reverse-engineered by
  // tutors, not an official rule. So this file implements NO threshold. Inventing
  // one and running it would mean telling students we had applied the College
  // Board algorithm when we had applied a guess.
  //
  // WHAT SI MATH AI CANNOT MEASURE YET: anything. The Mock Exam delivers no
  // questions and captures no answers, so at the moment routing must happen the
  // platform knows only how much time was used — which is not performance. The
  // Question Engine (Phase 6) is what changes that.
  //
  // So the socket is built and the plug is not. `selectNextModule` accepts a
  // performance signal in its final shape and, today, always returns the default
  // path. When a measured signal and an approved threshold both exist, ONE
  // branch below changes and nothing else does.

  // THE WHITELIST. Adaptive is opt-in per exam code, never opt-out. An exam added
  // to this file in future is non-adaptive unless someone edits this line on
  // purpose — which is the entire point of it being a list of codes rather than
  // a property on a module.
  var ADAPTIVE_EXAM_CODES = ['SAT_FULL'];

  function isAdaptiveExam(code) {
    return ADAPTIVE_EXAM_CODES.indexOf(code) !== -1;
  }

  /** The variant a module falls back to. First declared wins; never null-ish. */
  function defaultVariantId(mod) {
    return (mod && mod.variants && mod.variants.length) ? mod.variants[0].id : null;
  }

  /**
   * Which module runs next, and on which variant.
   *
   * `performance` describes Module 1 as {source, correct, total}, where source is
   * 'unavailable' | 'self_reported' | 'measured'. It is an OBJECT rather than a
   * bare count on purpose: a bare number cannot distinguish "we do not know" from
   * "they scored zero", and a null coerced to 0 would route every student down —
   * silently, and in the punishing direction.
   *
   * Returns {module, variantId, reason}. `reason` is diagnostic, never shown to a
   * student.
   */
  function selectNextModule(examCode, plan, currentOrdinal, performance) {
    var next = nextModule(plan, currentOrdinal);

    // ── THE GATE ── first statement, whitelist, no exceptions.
    if (!isAdaptiveExam(examCode)) {
      return { module: next, variantId: null, reason: 'not_adaptive' };
    }
    if (!next || !next.variants || !next.variants.length) {
      return { module: next, variantId: null, reason: 'no_variants' };
    }

    var perf = performance || { source: 'unavailable' };
    var known = (perf.source === 'measured' || perf.source === 'self_reported')
                && typeof perf.correct === 'number' && perf.correct >= 0;

    if (!known) {
      // No evidence. Take the standard path — never route a student down on
      // nothing. The asymmetry is deliberate: wrongly routing a strong student
      // down caps their practice score and teaches them something false, while
      // wrongly routing a weaker student up costs only a harder module.
      return { module: next, variantId: defaultVariantId(next), reason: 'no_performance_source' };
    }

    // A real signal exists — and still no approved threshold to apply to it.
    // This branch is where routing will live once a number is agreed; until then
    // it must behave exactly like the branch above rather than guess.
    return { module: next, variantId: defaultVariantId(next), reason: 'no_approved_threshold' };
  }

  // ── Internal helpers ───────────────────────────────────────────────────────

  function deepFreeze(o) {
    if (!o || typeof o !== 'object' || Object.isFrozen(o)) return o;
    Object.getOwnPropertyNames(o).forEach(function (k) { deepFreeze(o[k]); });
    return Object.freeze(o);
  }

  // The canonical table is frozen: it is shared by every consumer on the page,
  // and a stray write to one page's copy of an exam config would silently
  // change another's. (`compat()` is deliberately NOT frozen — see below.)
  deepFreeze(EXAMS);

  var BY_CODE = {};
  EXAMS.forEach(function (e) { BY_CODE[e.code] = e; });

  function get(code) {
    return BY_CODE[code] || null;
  }

  function isDynamic(code) {
    var e = get(code);
    return !!e && e.modules === null;
  }

  function sum(list, field) {
    var n = 0;
    for (var i = 0; i < list.length; i++) n += list[i][field];
    return n;
  }

  /** Total questions, or null for a dynamic exam. DERIVED from the modules. */
  function totalQuestions(code) {
    var e = get(code);
    if (!e) return null;
    return e.modules === null ? null : sum(e.modules, 'questions');
  }

  /** Total minutes, or null for a dynamic exam. DERIVED from the modules. */
  function totalDurationMinutes(code) {
    var e = get(code);
    if (!e) return null;
    return e.modules === null ? null : sum(e.modules, 'durationMinutes');
  }

  /** Minutes a dynamic exam runs for, given the student's question count. */
  function practiceDurationMinutes(questionCount) {
    var q = Math.max(0, parseInt(questionCount, 10) || 0);
    return Math.ceil(q * PRACTICE_MINUTES_PER_QUESTION);
  }

  // ── Announcement schedules ─────────────────────────────────────────────────
  //
  // Built from policy rather than typed out per exam, because a typed schedule
  // goes stale the moment a duration changes, and because the interesting rules
  // are conditional: a mark that is not INSIDE the block must not fire.
  //
  // "Five minutes remaining" on a five-minute block would fire at t=0, before
  // the student has read a question. `atRemainingSec < durationSec` is a strict
  // comparison for exactly that reason.
  //
  // Returns entries ordered as the student meets them (most remaining first).
  function buildAnnouncementSchedule(durationSec, ann) {
    if (!ann || !(durationSec > 0)) return [];
    var out = [];
    var seen = {};

    function push(atRemainingSec, key) {
      if (seen[atRemainingSec]) return;      // a halfway/mark collision is one announcement
      seen[atRemainingSec] = true;
      out.push({ atRemainingSec: atRemainingSec, key: key });
    }

    var marks = ann.marks || [];
    for (var i = 0; i < marks.length; i++) {
      if (marks[i].atRemainingSec < durationSec) push(marks[i].atRemainingSec, marks[i].key);
    }

    // Halfway is added AFTER the marks so that when it lands on one, the mark's
    // more specific wording wins ("five minutes remaining" beats "halfway").
    if (ann.halfway && durationSec >= HALFWAY_MIN_SEC) {
      push(Math.floor(durationSec / 2), 'halfway');
    }

    if (ann.timeUp) push(0, 'time_up');

    out.sort(function (a, b) { return b.atRemainingSec - a.atRemainingSec; });
    return out;
  }

  /**
   * The schedule for one block of an exam.
   *
   * `moduleOrdinal` selects the module on a per-module exam (DSAT). For a
   * session-level exam the whole session is one block. For a dynamic exam pass
   * `durationSecOverride`, since its length is not known until the student says.
   */
  function scheduleFor(code, moduleOrdinal, durationSecOverride) {
    var e = get(code);
    if (!e) return [];

    if (durationSecOverride != null) {
      return buildAnnouncementSchedule(durationSecOverride, e.announcements);
    }
    if (e.modules === null) return [];       // dynamic: caller must supply the duration

    var durationSec;
    if (e.announcements && e.announcements.perModule) {
      var m = modulesOf(code).filter(function (x) { return x.ordinal === (moduleOrdinal || 1); })[0];
      if (!m) return [];
      durationSec = m.durationMinutes * 60;
    } else {
      durationSec = totalDurationMinutes(code) * 60;
    }
    return buildAnnouncementSchedule(durationSec, e.announcements);
  }

  /** The module list, always an array — empty for a dynamic exam. */
  function modulesOf(code) {
    var e = get(code);
    if (!e || e.modules === null) return [];
    return e.modules;
  }

  /** The calculator descriptor, or null for an unknown code. */
  function calculatorPolicy(code) {
    var e = get(code);
    return e ? e.calculator : null;
  }

  /**
   * Does Si Math AI itself render a calculator for this exam?
   *
   * False for every exam today and that is CORRECT, not a gap: no calculator
   * provider is licensed. Phase 4's panel asks this question; when the answer is
   * false it shows `calculator.note` instead of a calculator.
   */
  function hasRenderableCalculator(code) {
    var c = calculatorPolicy(code);
    return !!(c && c.allowed && c.provider);
  }

  // ── Compatibility view ─────────────────────────────────────────────────────
  //
  // Reproduces the exact shape mock-exam.html's `EXAM_CONFIGS` literal has
  // today, so Phase 1b is a two-line swap in the one unfrozen file rather than a
  // refactor of a 101 KB page.
  //
  // Built ONCE and returned by reference on every call, because the literal it
  // replaces is a single `const`: `EXAM_CONFIGS.PRACTICE` is read repeatedly and
  // assigned to `s.exam`, so handing back a fresh object each time would change
  // object identity where production has stability. Nothing mutates these (the
  // page only ever reads fields off `s.exam`), which is why the compat table is
  // the one structure here left unfrozen — matching the mutable literal exactly
  // rather than tightening behaviour under a compatibility shim.
  //
  // `duration` and `questions` are DERIVED. Every other field is verbatim.
  var COMPAT = null;

  function compat() {
    if (COMPAT) return COMPAT;
    COMPAT = {};
    EXAMS.forEach(function (e) {
      COMPAT[e.code] = {
        code: e.code,
        examType: e.examType,
        displayName: e.displayName,
        shortName: e.shortName,
        org: e.org,
        duration: totalDurationMinutes(e.code),
        questions: totalQuestions(e.code),
        calculator: e.calculator.allowed,
        scoreMin: e.scoreMin,
        scoreMax: e.scoreMax,
      };
    });
    return COMPAT;
  }


  // ── Module plans — the state machine's decisions, as pure functions ────────
  //
  // P2 puts these here rather than in mock-exam.html for the same reason P1 put
  // the exam table here: a pure function is testable without a DOM, a localStorage
  // or a running timer. mock-exam.html is left holding wiring only.
  //
  // A PLAN is the frozen shape of one sitting: what blocks run, in what order,
  // each with its own clock. Every exam has one, including single-block exams —
  // a one-entry plan is what keeps every non-DSAT exam on exactly the code path
  // it uses today.

  /**
   * The plan for one sitting of `code`.
   *
   * Fixed exams read their modules from the table above. A dynamic exam
   * (Practice Timer) has no modules until the student says how many questions,
   * so its single block is built from that.
   *
   * Returns [] for an unknown code — never null, so callers can `.length` it.
   */
  function buildModulePlan(code, practiceQuestions) {
    var e = get(code);
    if (!e) return [];

    if (e.modules === null) {
      var q = Math.max(0, parseInt(practiceQuestions, 10) || 0);
      return [{
        ordinal: 1,
        label: e.shortName,
        questions: q || null,
        durationSec: practiceDurationMinutes(q) * 60,
      }];
    }

    return e.modules.map(function (m) {
      var block = {
        ordinal: m.ordinal,
        label: m.label,
        questions: m.questions,
        durationSec: m.durationMinutes * 60,
      };
      // Only carried when the module actually has them, so every other exam's
      // plan is byte-identical to what it was before adaptive existed.
      if (m.variants) block.variants = m.variants;
      return block;
    });
  }

  /** One block of a plan, or null. */
  function moduleAt(plan, ordinal) {
    if (!plan || !plan.length) return null;
    for (var i = 0; i < plan.length; i++) if (plan[i].ordinal === ordinal) return plan[i];
    return null;
  }

  /**
   * Is this the last block?
   *
   * The single most consequential question in the timer: a true answer ends the
   * EXAM (stamp endedAt, clear persisted state, release tab ownership), a false
   * one ends only a MODULE (keep all three). Unknown ordinals answer `true`,
   * so a corrupted plan ends the exam rather than stranding a student in a
   * transition they can never leave.
   */
  function isLastModule(plan, ordinal) {
    if (!plan || !plan.length) return true;
    var last = plan[plan.length - 1];
    return ordinal >= last.ordinal;
  }

  /** The block after `ordinal`, or null when there is none. */
  function nextModule(plan, ordinal) {
    if (isLastModule(plan, ordinal)) return null;
    for (var i = 0; i < plan.length; i++) if (plan[i].ordinal > ordinal) return plan[i];
    return null;
  }

  /**
   * The clock a module starts with.
   *
   * ALWAYS that module's own full duration — never whatever the previous block
   * had left on it. That "never" IS the no-leakage rule: on test day, finishing
   * module 1 early buys you nothing in module 2.
   *
   * It lives here as a function rather than as a line inside a click handler so
   * a test can hold it directly. A handler that needs a DOM cannot be unit
   * tested, and a test that re-implements what the handler does would pass while
   * the handler leaked — which is the exact failure this repository's
   * tests/_source.mjs warns about.
   */
  function moduleStartState(plan, ordinal) {
    var m = moduleAt(plan, ordinal);
    if (!m) return null;
    return { moduleOrdinal: m.ordinal, timerTotal: m.durationSec, timerSec: m.durationSec };
  }

  /**
   * Recover {plan, ordinal, phase} from a persisted timer blob.
   *
   * THE LEGACY RULE: a blob written before P2 has no `v` and no plan. It is
   * given a ONE-BLOCK plan built from its own recorded timerTotal, so a student
   * who began a 70-minute Full SAT before this shipped finishes the 70-minute
   * exam they started. They are never teleported mid-sitting into a two-module
   * structure that did not exist when they began.
   *
   * `phase` is 'MODULE' or 'TRANSITION'. Anything unrecognised resolves to
   * 'MODULE': the failure mode of guessing wrong there is a student sent back to
   * a running clock, which is recoverable, rather than parked on a transition
   * screen for an exam that has already finished, which is not.
   */
  function restoreModulePlan(saved, cfg) {
    var legacy = {
      plan: [{
        ordinal: 1,
        label: (cfg && cfg.shortName) || 'Exam',
        questions: (cfg && cfg.questions) || null,
        durationSec: (saved && saved.timerTotal) || 0,
      }],
      ordinal: 1,
      phase: 'MODULE',
      legacy: true,
    };
    if (!saved || saved.v !== 2) return legacy;
    if (!Array.isArray(saved.modulePlan) || saved.modulePlan.length === 0) return legacy;

    var ordinal = parseInt(saved.moduleOrdinal, 10);
    if (!(ordinal > 0)) ordinal = saved.modulePlan[0].ordinal;
    // An ordinal naming no block in the plan cannot be honoured; fall back to
    // the first rather than leaving the timer pointing at nothing.
    if (!moduleAt(saved.modulePlan, ordinal)) ordinal = saved.modulePlan[0].ordinal;

    return {
      plan: saved.modulePlan,
      ordinal: ordinal,
      phase: saved.phase === 'TRANSITION' ? 'TRANSITION' : 'MODULE',
      legacy: false,
    };
  }

  root.SiExamRegistry = {
    EXAMS: EXAMS,
    EXAM_CODES: EXAMS.map(function (e) { return e.code; }),
    CALC_SCOPES: CALC_SCOPES,
    DEFAULT_AMBIENCE_ENABLED: DEFAULT_AMBIENCE_ENABLED,
    HALFWAY_MIN_SEC: HALFWAY_MIN_SEC,
    PRACTICE_MINUTES_PER_QUESTION: PRACTICE_MINUTES_PER_QUESTION,

    get: get,
    all: function () { return EXAMS; },
    isDynamic: isDynamic,
    modulesOf: modulesOf,
    totalQuestions: totalQuestions,
    totalDurationMinutes: totalDurationMinutes,
    practiceDurationMinutes: practiceDurationMinutes,

    buildAnnouncementSchedule: buildAnnouncementSchedule,
    scheduleFor: scheduleFor,

    calculatorPolicy: calculatorPolicy,
    hasRenderableCalculator: hasRenderableCalculator,

    buildModulePlan: buildModulePlan,
    moduleAt: moduleAt,
    isLastModule: isLastModule,
    nextModule: nextModule,
    moduleStartState: moduleStartState,
    ADAPTIVE_EXAM_CODES: ADAPTIVE_EXAM_CODES,
    isAdaptiveExam: isAdaptiveExam,
    selectNextModule: selectNextModule,
    restoreModulePlan: restoreModulePlan,

    compat: compat,
  };
}(typeof globalThis !== 'undefined' ? globalThis : this));
