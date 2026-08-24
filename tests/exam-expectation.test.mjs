// gen-exam-expectation.mjs — the CI pin the Question Spine migration promised.
//
// supabase/migrations/20260824a_question_spine.sql documents the publish gate
// as validating against an expectation that "comes from the repo's generator
// over exam-registry.js, never typed by hand", and says "a CI test pins the
// generator". This is that test. Until it existed, the promise was a comment.
//
// WHAT THIS GUARDS
// ----------------
// publish_exam_form() freezes the expectation it validated into
// exam_forms.published_structure, and a published form is immutable. So a wrong
// number here is not a bug that gets fixed later — it is a wrong number
// permanently recorded as the structure a real student's exam was verified
// against. Every module figure below is pinned literally for that reason: if
// the registry changes, this suite must go red and a human must decide whether
// the change was intended.
//
// This imports the REAL generator rather than re-deriving expectations from the
// registry. A test that recomputes what the code computes agrees with itself
// even when both are wrong — the failure mode tests/_source.mjs was written to
// avoid. The literals below are the independent side of the comparison.
//
// Every assertion could fail. Per docs/roadmap/verification-framework-audit.md:
// a green check is only evidence if it could have gone red.
import { suite } from './_assert.mjs';
import { expectationFor, totalAuthoredQuestions, EXAM_CODES }
  from '../scripts/gen-exam-expectation.mjs';

const t = suite('exam-expectation');

/** Run fn and return its thrown message, or null if it did not throw. */
function threw(fn) {
  try { fn(); return null; } catch (e) { return e.message; }
}

// ── The pinned expectations ────────────────────────────────────────────────
//
// Hand-written from the registry ONCE, reviewed, and frozen here. Not generated
// — that would make the comparison circular.
const PINNED = {
  SAT_MODULE_1:  { exam_code: 'SAT_MODULE_1',
    modules: [{ ordinal: 1, questions: 22, durationMinutes: 35, variants: [] }] },
  SAT_MODULE_2:  { exam_code: 'SAT_MODULE_2',
    modules: [{ ordinal: 1, questions: 22, durationMinutes: 35, variants: [] }] },
  SAT_FULL:      { exam_code: 'SAT_FULL',
    modules: [{ ordinal: 1, questions: 22, durationMinutes: 35, variants: [] },
              { ordinal: 2, questions: 22, durationMinutes: 35, variants: ['standard', 'advanced'] }] },
  EST_MATH_1:    { exam_code: 'EST_MATH_1',
    modules: [{ ordinal: 1, questions: 50, durationMinutes: 75, variants: [] }] },
  EST_MATH_2_L1: { exam_code: 'EST_MATH_2_L1',
    modules: [{ ordinal: 1, questions: 40, durationMinutes: 60, variants: [] }] },
  ACT_MATH:      { exam_code: 'ACT_MATH',
    modules: [{ ordinal: 1, questions: 45, durationMinutes: 50, variants: [] }] },
};

t.section('Every authorable exam produces exactly the pinned expectation');

for (const [code, expected] of Object.entries(PINNED)) {
  t.is(`${code} expectation matches the pin`, expectationFor(code), expected);
}

// The registry knows seven codes; six are authorable and PRACTICE is not. If a
// code is ever added, this fails and forces a decision rather than letting the
// new exam sit silently unpinned.
t.is('the registry declares exactly the seven known codes', EXAM_CODES,
  ['SAT_MODULE_1', 'SAT_MODULE_2', 'SAT_FULL', 'EST_MATH_1', 'EST_MATH_2_L1', 'ACT_MATH', 'PRACTICE']);
t.is('every code is either pinned above or PRACTICE',
  EXAM_CODES.filter((c) => !(c in PINNED)), ['PRACTICE']);

// ── The two failure modes the design requires to stay distinct ─────────────
t.section('A typo and a dynamic exam fail differently');

// modulesOf() returns [] for both, so a generator built on it alone would turn
// a typo into an empty expectation. These two assertions are the reason the
// generator reads get() and isDynamic() instead.
const typoMsg = threw(() => expectationFor('EST_MATH1'));
const dynMsg  = threw(() => expectationFor('PRACTICE'));

t.ok('an unknown code throws', typoMsg !== null);
t.ok('a dynamic exam throws', dynMsg !== null);
t.ok('the unknown-code message names the problem as an unknown code',
  typoMsg !== null && typoMsg.includes('unknown exam code'));
t.ok('the dynamic message names the problem as a dynamic exam',
  dynMsg !== null && dynMsg.includes('dynamic exam has no fixed structure'));
t.ok('the two messages are not interchangeable', typoMsg !== dynMsg);
t.ok('the unknown-code message lists the valid codes so the typo is obvious',
  typoMsg !== null && typoMsg.includes('EST_MATH_1'));

// Empty string and null are typos too, not a request for a default.
t.ok('an empty code throws rather than defaulting', threw(() => expectationFor('')) !== null);
t.ok('a null code throws rather than defaulting', threw(() => expectationFor(null)) !== null);

// ── The shape the DB gate actually consumes ────────────────────────────────
t.section('Output shape matches publish_exam_form()\'s reader');

const est = expectationFor('EST_MATH_1');
t.is('the envelope carries exactly exam_code and modules',
  Object.keys(est).sort(), ['exam_code', 'modules']);
t.is('a module carries exactly the four keys the gate reads',
  Object.keys(est.modules[0]).sort(), ['durationMinutes', 'ordinal', 'questions', 'variants']);

// The gate iterates variants with jsonb_array_elements_text() and tests
// membership with `v_variants ? sec.variant_id` — both string operations. The
// registry stores objects. If this conversion regressed, the gate would compare
// a variant_id against the JSON text of an object and reject every SAT_FULL
// form with a message blaming the form.
const satVariants = expectationFor('SAT_FULL').modules[1].variants;
t.is('SAT_FULL module 2 variants are the id STRINGS, not objects',
  satVariants, ['standard', 'advanced']);
t.ok('every variant entry is a string',
  satVariants.every((v) => typeof v === 'string'));
t.is('a module with no variants gets an empty array, never undefined',
  est.modules[0].variants, []);

// ── The counting trap ──────────────────────────────────────────────────────
t.section('A variant module needs one FULL question set per variant');

// registry.totalQuestions('SAT_FULL') is 44 — the length of a student's sitting.
// The AUTHOR must write 66, because each variant is its own section and the
// gate requires every section complete. Conflating the two produces a form that
// fails the gate after 44 questions of work.
t.is('SAT_FULL: 66 questions to author, not the 44 a student sits',
  totalAuthoredQuestions('SAT_FULL'), 66);
t.is('EST_MATH_1: 50 to author', totalAuthoredQuestions('EST_MATH_1'), 50);
t.is('EST_MATH_2_L1: 40 to author', totalAuthoredQuestions('EST_MATH_2_L1'), 40);
t.is('ACT_MATH: 45 to author', totalAuthoredQuestions('ACT_MATH'), 45);
t.is('SAT_MODULE_1: 22 to author', totalAuthoredQuestions('SAT_MODULE_1'), 22);
t.is('SAT_MODULE_2: 22 to author', totalAuthoredQuestions('SAT_MODULE_2'), 22);

// ── Determinism ────────────────────────────────────────────────────────────
t.section('The same exam always yields byte-identical JSON');

// The expectation is embedded in SQL and stored forever in published_structure.
// Key order or module order drifting between calls would make two publications
// of the same structure look different in the historical record.
t.is('two calls produce identical JSON',
  JSON.stringify(expectationFor('SAT_FULL')),
  JSON.stringify(expectationFor('SAT_FULL')));
t.is('modules come back sorted by ordinal',
  expectationFor('SAT_FULL').modules.map((m) => m.ordinal), [1, 2]);

// A caller mutating the result must not poison the next caller.
const first = expectationFor('EST_MATH_1');
first.modules[0].questions = 1;
t.is('a mutated result does not affect the next call',
  expectationFor('EST_MATH_1').modules[0].questions, 50);

t.done();
