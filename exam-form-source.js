// Exam Form Source — reading a form out of the Question Spine.
//
// WHAT THIS FILE IS FOR
// ---------------------
// One place that turns exam_forms → exam_form_sections → exam_questions →
// exam_stimuli into the object exam-delivery.js sits. Nothing else in the
// surface talks to those tables.
//
// NO PARALLEL MODEL. The shape it returns mirrors the rows, renamed to
// camelCase and nothing else: no derived fields, no reordering of content, no
// second source of truth about what a question is. What you review is what is
// stored, which is the entire reason for reading the Spine instead of shipping
// a payload inside a page.
//
// ⛔ WHO CAN READ THIS, AND WHO MUST NOT
// --------------------------------------
// All four tables are RLS-gated to `has_role_at_least('admin')`. A signed-in
// student holds the SELECT grant and sees ZERO rows — measured, not assumed:
// see docs/engineering/dsat-form-a-import.md §5. So this module is safe to load
// on a page a student can reach; it simply returns nothing for them.
//
// It reads `correct_answer`, because a REVIEW surface has to mark the exam. The
// M3 migration already names what the student path must be instead:
//
//     "student-facing access is a separately approved, published-only read
//      model that must exclude this column"
//
// `withAnswers: false` returns the same form without the key, so the delivery
// engine can be driven from a source that never held it. That is not the
// student path — it is the shape of the seam where the student path will go,
// and it is exercised so the seam is real rather than promised.
//
// DEPENDENCY-FREE by house rule. The Supabase client is passed in; this file
// creates nothing and imports nothing.
(function (root) {
  'use strict';

  function fail(where, error) {
    var e = new Error('exam-form-source: ' + where + ' — ' +
                      ((error && error.message) || 'unknown error'));
    e.cause = error;
    throw e;
  }

  /** Every form in the Spine, newest first. Empty for a non-admin, not an error. */
  async function listForms(sb) {
    var r = await sb.from('exam_forms')
      .select('id, code, exam_code, title, status, created_at, published_at')
      .order('created_at', { ascending: false });
    if (r.error) fail('listing forms', r.error);
    return (r.data || []).map(function (f) {
      return { id: f.id, code: f.code, examCode: f.exam_code, title: f.title,
               status: f.status, createdAt: f.created_at, publishedAt: f.published_at };
    });
  }

  /**
   * loadForm(sb, code, opts) -> the object exam-delivery.create() takes.
   * Four queries, not one per question: a 66-question form must not be 66 round
   * trips, and the joins are cheap to do here.
   */
  async function loadForm(sb, code, opts) {
    opts = opts || {};
    var withAnswers = opts.withAnswers !== false;

    var fr = await sb.from('exam_forms')
      .select('id, code, exam_code, title, status, published_at')
      .eq('code', code).maybeSingle();
    if (fr.error) fail('reading form ' + code, fr.error);
    if (!fr.data) {
      // Indistinguishable, deliberately, from "you may not read it": RLS
      // returns no row either way and the surface must not guess which.
      throw new Error('exam-form-source: no form ' + JSON.stringify(code) +
                      ' is readable by this account');
    }
    var form = fr.data;

    var sr = await sb.from('exam_form_sections')
      .select('id, ordinal, variant_id, label, question_count, duration_minutes, calculator_allowed')
      .eq('form_id', form.id)
      .order('ordinal', { ascending: true })
      .order('variant_id', { ascending: true, nullsFirst: true });
    if (sr.error) fail('reading sections', sr.error);
    var sections = sr.data || [];

    var str = await sb.from('exam_stimuli')
      .select('id, kind, label, body, spec, media_ref, media_kind')
      .eq('form_id', form.id);
    if (str.error) fail('reading stimuli', str.error);
    var stimuli = {};
    (str.data || []).forEach(function (s) { stimuli[s.id] = s; });

    var cols = ['id', 'section_id', 'ordinal', 'prompt', 'question_format', 'choices',
                'explanation', 'difficulty', 'topic_id', 'subtopic_id', 'stimulus_id', 'reading'];
    if (withAnswers) cols.splice(6, 0, 'correct_answer');
    var qr = await sb.from('exam_questions')
      .select(cols.join(', '))
      .in('section_id', sections.map(function (s) { return s.id; }))
      .order('ordinal', { ascending: true });
    if (qr.error) fail('reading questions', qr.error);

    var bySection = {};
    (qr.data || []).forEach(function (q) {
      (bySection[q.section_id] = bySection[q.section_id] || []).push({
        id: q.id, ordinal: q.ordinal, prompt: q.prompt,
        format: q.question_format, choices: q.choices || null,
        correctAnswer: withAnswers ? q.correct_answer : null,
        explanation: q.explanation || null, difficulty: q.difficulty || null,
        topicId: q.topic_id, subtopicId: q.subtopic_id || null,
        reading: q.reading || null,
        // Attached, not embedded: one stimulus row can be referenced by two
        // questions, and both get the SAME object. renderForQuestion() then
        // draws it two ways from the two readings, which is the property the
        // reading column exists for.
        stimulus: q.stimulus_id ? stimuli[q.stimulus_id] || null : null,
      });
    });

    return {
      id: form.id, code: form.code, examCode: form.exam_code, title: form.title,
      status: form.status, publishedAt: form.published_at,
      withAnswers: withAnswers,
      sections: sections.map(function (s) {
        return {
          id: s.id, ordinal: s.ordinal, variantId: s.variant_id, label: s.label,
          questionCount: s.question_count, durationMinutes: s.duration_minutes,
          // The per-section calculator gate, straight off the row. The column is
          // NOT NULL DEFAULT true, so a false here is a deliberate authoring act.
          calculatorAllowed: s.calculator_allowed !== false,
          questions: (bySection[s.id] || []).sort(function (a, b) { return a.ordinal - b.ordinal; }),
        };
      }),
    };
  }

  root.SiExamFormSource = { listForms: listForms, loadForm: loadForm };
}(typeof globalThis !== 'undefined' ? globalThis : this));
