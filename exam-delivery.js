// Exam Delivery — the state machine behind a question-based exam.
//
// WHAT THIS FILE IS FOR
// ---------------------
// Everything about sitting an exam that is not drawing: which question you are
// on, what you have answered, which module comes next, when a module is over,
// and — where the form has variants — which one you are routed to.
//
// It holds NO DOM and NO network. That is not tidiness: the first version of
// this experience lived inside one generated preview page, where the flow could
// only be checked by looking at it. Here the flow is a function of its inputs,
// so tests/exam-delivery.test.mjs can sit a whole 66-question exam in Node and
// assert what happened.
//
// THE SHAPE IT TAKES IS THE SHAPE OF THE ROWS
// -------------------------------------------
// `form` mirrors exam_forms → exam_form_sections → exam_questions, with the
// stimulus attached to the question that references it. There is deliberately
// no second model: a page that reshaped the rows on the way in would be a place
// for the two to disagree, and the whole point of reading the Spine is that
// what you review is what is stored.
//
// WHAT IT REFUSES TO DECIDE
// -------------------------
// The routing THRESHOLD is not in here and not in exam-registry.js, because
// nobody has set one. The registry says so in as many words — routing is
// adaptive-READY and inert, and "naming a path would imply a measurement we are
// not making". So `route` is supplied by the caller, every time, and a caller
// that supplies nothing gets the first variant and an honest flag saying the
// route was not chosen. Inventing a cut score here would bury a
// standard-setting decision in a state machine.
//
// DEPENDENCY-FREE by house rule: the same bytes run in the browser and under CI.
(function (root) {
  'use strict';

  /** A section's stable key. Ordinal alone is not unique once variants exist. */
  function keyOf(sec) {
    return sec.ordinal + (sec.variantId ? ':' + sec.variantId : '');
  }

  /** Ordinals in order, each with the sections that could fill it. */
  function stagesOf(form) {
    var byOrdinal = {}, order = [];
    (form.sections || []).forEach(function (s) {
      if (!byOrdinal[s.ordinal]) { byOrdinal[s.ordinal] = []; order.push(s.ordinal); }
      byOrdinal[s.ordinal].push(s);
    });
    order.sort(function (a, b) { return a - b; });
    return order.map(function (o) {
      var opts = byOrdinal[o].slice().sort(function (a, b) {
        return String(a.variantId || '').localeCompare(String(b.variantId || ''));
      });
      return { ordinal: o, options: opts };
    });
  }

  /**
   * create(form, opts) -> session
   *
   *   opts.route(result, stage) -> variantId | null
   *       Called once per variant-bearing stage, with the PREVIOUS stage's
   *       result. Returning null (or omitting `route`) takes the first variant
   *       and marks the session `routeChosen: false`.
   *   opts.now() -> ms                     for a deterministic clock in tests
   */
  function create(form, opts) {
    opts = opts || {};
    var now = opts.now || function () { return Date.now(); };
    var stages = stagesOf(form);
    if (!stages.length) throw new Error('exam-delivery: form has no sections');

    var si = 0;                    // stage index
    var section = null;            // the section actually being sat
    var idx = 0;                   // 0-based question index within it
    var phase = 'MODULE';          // MODULE | BREAK | DONE
    var answers = {};              // 'key:ordinal' -> value
    var flags = {};                // 'key:ordinal' -> true
    var seen = {};                 // 'key:ordinal' -> true
    var results = [];              // one per completed stage
    var routeChosen = true;
    var deadline = 0;

    function enter(sec) {
      section = sec; idx = 0; phase = 'MODULE';
      deadline = now() + (sec.durationMinutes || 0) * 60000;
      mark();
    }
    function questions() { return (section && section.questions) || []; }
    function q() { return questions()[idx] || null; }
    function slot(question) { return keyOf(section) + ':' + question.ordinal; }
    function mark() { var c = q(); if (c) seen[slot(c)] = true; }

    function pickFor(stage) {
      if (stage.options.length === 1) return stage.options[0];
      var want = opts.route ? opts.route(results[results.length - 1] || null, stage) : null;
      if (!want) routeChosen = false;
      var found = want && stage.options.filter(function (s) { return s.variantId === want; })[0];
      return found || stage.options[0];
    }

    enter(pickFor(stages[0]));

    /** Correct answers are compared as trimmed strings — grid-in is free text. */
    function isCorrect(question, given) {
      if (given === undefined || given === null || given === '') return false;
      return String(given).trim() === String(question.correctAnswer).trim();
    }

    function scoreOf(sec) {
      var right = 0;
      (sec.questions || []).forEach(function (question) {
        if (isCorrect(question, answers[keyOf(sec) + ':' + question.ordinal])) right++;
      });
      return { sectionKey: keyOf(sec), ordinal: sec.ordinal, variantId: sec.variantId || null,
               correct: right, total: (sec.questions || []).length };
    }

    var api = {
      /** Everything a surface needs to draw one screen. Never a live reference. */
      state: function () {
        var question = q();
        return {
          phase: phase,
          formCode: form.code || null,
          stageIndex: si,
          stageCount: stages.length,
          section: section && { id: section.id, ordinal: section.ordinal,
                                variantId: section.variantId || null, label: section.label,
                                durationMinutes: section.durationMinutes,
                                calculatorAllowed: section.calculatorAllowed !== false },
          index: idx,
          number: idx + 1,
          total: questions().length,
          question: question,
          answer: question ? (answers[slot(question)] === undefined ? null : answers[slot(question)]) : null,
          flagged: question ? !!flags[slot(question)] : false,
          remainingSec: Math.max(0, Math.round((deadline - now()) / 1000)),
          isLast: idx === questions().length - 1,
          routeChosen: routeChosen,
          // WITHHELD UNTIL THE EXAM IS OVER, by the state machine rather than by
          // the surface remembering not to print it. On test day a student
          // learns neither their Module 1 score nor which Module 2 they were
          // given, and a break screen that leaked either would teach them to
          // read their own routing — which is a different exam from the one
          // being simulated. A page cannot show what it is not given.
          results: phase === 'DONE' ? results.slice() : [],
        };
      },

      /** The navigator's four states, keyed 1..n — exam-chrome.js's shape. */
      navStates: function () {
        var out = {}, key = section ? keyOf(section) : '';
        questions().forEach(function (question, i) {
          var s = key + ':' + question.ordinal;
          out[i + 1] = flags[s] ? 'flagged'
                     : (answers[s] !== undefined && answers[s] !== '') ? 'answered'
                     : seen[s] ? 'unseen' : 'unseen';
        });
        return out;
      },

      answer: function (value) {
        var question = q(); if (!question) return;
        if (value === null || value === undefined || value === '') delete answers[slot(question)];
        else answers[slot(question)] = value;
      },
      toggleFlag: function () {
        var question = q(); if (!question) return;
        if (flags[slot(question)]) delete flags[slot(question)];
        else flags[slot(question)] = true;
      },
      jump: function (n) {
        if (n >= 1 && n <= questions().length) { idx = n - 1; mark(); }
      },
      next: function () { if (idx < questions().length - 1) { idx++; mark(); } },
      prev: function () { if (idx > 0) { idx--; mark(); } },

      /**
       * End the module. The BREAK screen deliberately carries no score and no
       * route: on test day a student learns neither, and showing either here
       * would teach them to read their own routing.
       */
      finishSection: function () {
        if (phase !== 'MODULE') return;
        results.push(scoreOf(section));
        phase = (si + 1 < stages.length) ? 'BREAK' : 'DONE';
      },
      /** Leave the break. Routing happens here, on the completed result. */
      beginNextSection: function () {
        if (phase !== 'BREAK') return;
        si++;
        enter(pickFor(stages[si]));
      },
      /** Time ran out. Identical to finishing — the clock is not a penalty. */
      expire: function () { api.finishSection(); },

      /** Marking, for review. Never shown while a module is running. */
      review: function () {
        var rows = [];
        (form.sections || []).forEach(function (sec) {
          var wasSat = results.some(function (r) { return r.sectionKey === keyOf(sec); })
                    || (section && keyOf(section) === keyOf(sec));
          if (!wasSat) return;
          (sec.questions || []).forEach(function (question) {
            var given = answers[keyOf(sec) + ':' + question.ordinal];
            rows.push({ sectionKey: keyOf(sec), ordinal: question.ordinal,
                        label: sec.label, variantId: sec.variantId || null,
                        question: question,
                        given: given === undefined ? null : given,
                        correct: isCorrect(question, given) });
          });
        });
        return rows;
      },

      _stages: function () { return stages; },
      _keyOf: keyOf,
    };
    return api;
  }

  root.SiExamDelivery = { create: create, keyOf: keyOf, stagesOf: stagesOf };
}(typeof globalThis !== 'undefined' ? globalThis : this));
