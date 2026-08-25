#!/usr/bin/env node
/**
 * preflight-exam-form.mjs — emit a READ-ONLY query that reports every reason a
 * form is not yet publishable, all at once.
 *
 *   node scripts/preflight-exam-form.mjs ESTM1-2026-A EST_MATH_1
 *
 * WHY THIS EXISTS
 * ---------------
 * publish_exam_form() raises on the FIRST failure it meets. With fifty
 * questions that means fifty round trips to find twelve problems, each one
 * aborting the transaction. Worse, there is no way to ask "is this form ready?"
 * without attempting to publish it — and publication is irreversible, so the
 * only available rehearsal is the real thing.
 *
 * This closes that gap without touching the database: it prints SQL. Nothing
 * here writes, and nothing here is a migration — there is no new function, no
 * new privilege surface, no deploy. The operator runs the emitted query and
 * reads the rows.
 *
 * ⚠️  ADVISORY MIRROR, NOT AN AUTHORITY  ⚠️
 * publish_exam_form() in the database is the only authority on whether a form
 * may be published. This query re-implements its checks, and two
 * implementations of one rule can drift. A clean pre-flight means "expect the
 * gate to accept this", never "the gate will accept this". If the gate's rules
 * change, the checks below must change with them — see §8 of
 * supabase/migrations/20260824a_question_spine.sql.
 *
 * THE CHECKS THE GATE DOES NOT MAKE
 * ---------------------------------
 * Three findings are WARNINGs, and none of them affects eligibility.
 *
 * `explanation` — the gate is genuinely silent about it: a form of fifty
 * questions with no explanations publishes cleanly. Making explanations
 * mandatory is an operational standard for Si Math AI, and enforcing it here
 * keeps that standard visible without quietly changing the M3 contract
 * through the back door.
 *
 * `stimulus-orphan` — M4 deliberately left this out of publish_exam_form():
 * a stimulus no question references is untidiness, not a hazard, and keeping
 * it out of the gate meant a security-critical function stayed untouched.
 * This is where that decision gets paid for.
 *
 * `stimulus-media-exception` — every use of the SVG escape hatch is printed
 * with its written reason. The exception is only narrow while someone is
 * actually reading the reasons; unread, it quietly becomes the way visuals
 * get done.
 *
 * The repo has no package.json and no Postgres driver, so this emits SQL rather
 * than running it — the same shape as scripts/gen-registry-seed.mjs.
 */
import { expectationFor } from './gen-exam-expectation.mjs';

/** Single-quote a string for SQL. Doubling quotes is the whole escape. */
const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";

/**
 * The SOURCE half of the query: where the facts come from.
 *
 * Split from the checks below on purpose. Everything after this reads only
 * params / form / expected_modules / slots / sect / qs / stim, never a table
 * directly, so tests/exam-preflight.test.mjs can swap synthetic rows in for
 * these seven and exercise the REAL check SQL rather than a paraphrase of it. That is the same
 * reasoning behind tests/_source.mjs: a test that re-implements the code under
 * test can agree with itself while production is wrong.
 */
export function sourceCTEs(formCode, examCode) {
  const expectation = expectationFor(examCode);   // throws on typo / dynamic exam
  return `with params as (
  select ${q(formCode)}::text as form_code,
         ${q(JSON.stringify(expectation))}::jsonb as expected
),
form as (
  select f.* from public.exam_forms f, params p where f.code = p.form_code
),
expected_modules as (
  select (m ->> 'ordinal')::int          as ordinal,
         (m ->> 'questions')::int        as questions,
         (m ->> 'durationMinutes')::int  as duration_minutes,
         coalesce(m -> 'variants', '[]'::jsonb) as variants
    from params p, jsonb_array_elements(p.expected -> 'modules') m
),
-- One row per (ordinal, variant) slot the expectation demands. A module with
-- no variants is one slot; a module with two variants is two, and each needs
-- its own complete section — this is why SAT_FULL needs 66 questions, not 44.
slots as (
  select ordinal, questions, duration_minutes, null::text as variant_id
    from expected_modules where jsonb_array_length(variants) = 0
  union all
  select em.ordinal, em.questions, em.duration_minutes, v
    from expected_modules em, jsonb_array_elements_text(em.variants) v
),
sect as (
  select s.* from public.exam_form_sections s join form f on f.id = s.form_id
),
qs as (
  select x.*, s.ordinal as sec_ordinal, s.variant_id as sec_variant,
         s.question_count
    from public.exam_questions x join sect s on s.id = x.section_id
),
stim as (
  select st.* from public.exam_stimuli st join form f on f.id = st.form_id
)`;
}

/**
 * The CHECK half: every rule, as a pure function of the seven source CTEs above.
 * A constant, so the CI suite runs these exact bytes against synthetic data.
 */
export const CHECKS_SQL = `,
findings as (
  -- ── form level ──────────────────────────────────────────────────────────
  select 'ERROR'::text as severity, 'form-exists'::text as check_name, 1 as sort_key,
         'no form with code ' || p.form_code as detail
    from params p where not exists (select 1 from form)
  union all
  select 'ERROR', 'form-status', 2,
         'form status is ' || f.status || ' — publishing is allowed only from ''review'''
    from form f where f.status <> 'review'
  union all
  select 'ERROR', 'exam-code', 3,
         'form exam_code is ' || f.exam_code || ' but the expectation is for '
           || (p.expected ->> 'exam_code')
    from form f, params p
   where f.exam_code is distinct from (p.expected ->> 'exam_code')

  -- ── section level ───────────────────────────────────────────────────────
  union all
  select 'ERROR', 'slot-match', 4,
         'ordinal ' || m.ordinal || ' variant ' || coalesce(m.variant_id, '(none)')
           || ' — expected exactly one section with ' || m.questions || ' questions / '
           || m.duration_minutes || ' min; found ' || m.n
    from (
      select sl.ordinal, sl.variant_id, sl.questions, sl.duration_minutes,
             (select count(*) from sect s
               where s.ordinal = sl.ordinal
                 and s.variant_id is not distinct from sl.variant_id
                 and s.question_count = sl.questions
                 and s.duration_minutes = sl.duration_minutes) as n
        from slots sl
    ) m
   where m.n <> 1
  union all
  select 'ERROR', 'section-count', 5,
         'form has ' || (select count(*) from sect) || ' section(s) but the expectation defines '
           || (select count(*) from slots) || ' slot(s)'
   where exists (select 1 from form)
     and (select count(*) from sect) <> (select count(*) from slots)
  union all
  select 'ERROR', 'section-unexpected', 6,
         'section at ordinal ' || s.ordinal || ' is not defined by the expectation'
    from sect s
   where not exists (select 1 from expected_modules em where em.ordinal = s.ordinal)
  union all
  select 'ERROR', 'variant-mixing', 7,
         'ordinal ' || s.ordinal || ' expects no variants but the section carries '
           || s.variant_id
    from sect s join expected_modules em on em.ordinal = s.ordinal
   where jsonb_array_length(em.variants) = 0 and s.variant_id is not null
  union all
  select 'ERROR', 'variant-mixing', 7,
         'ordinal ' || s.ordinal || ' expects variants ' || em.variants::text
           || ' but a NULL-variant section is present (mixing)'
    from sect s join expected_modules em on em.ordinal = s.ordinal
   where jsonb_array_length(em.variants) > 0 and s.variant_id is null
  union all
  select 'ERROR', 'variant-unknown', 8,
         'ordinal ' || s.ordinal || ' carries variant ' || s.variant_id
           || ' which the expectation does not allow (' || em.variants::text || ')'
    from sect s join expected_modules em on em.ordinal = s.ordinal
   where jsonb_array_length(em.variants) > 0
     and s.variant_id is not null
     and not (em.variants ? s.variant_id)

  -- ── question level ──────────────────────────────────────────────────────
  union all
  -- Every question-level check reads the qs CTE rather than exam_questions
  -- directly, so the whole findings block is a pure function of (params, form,
  -- sect, qs). tests/exam-preflight.test.mjs relies on that: it substitutes
  -- synthetic rows for those four CTEs and asserts on the SAME findings SQL.
  select 'ERROR', 'question-count', 9,
         'section ordinal ' || s.ordinal || ' variant ' || coalesce(s.variant_id, '(none)')
           || ' holds ' || (select count(*) from qs x where x.section_id = s.id)
           || ' question row(s); question_count is ' || s.question_count
    from sect s
   where (select count(*) from qs x where x.section_id = s.id) <> s.question_count
  union all
  -- More actionable than the gate's "not contiguous 1..n": names each gap.
  select 'ERROR', 'question-ordinal-missing', 10,
         'section ordinal ' || s.ordinal || ' variant ' || coalesce(s.variant_id, '(none)')
           || ' is missing question ordinal ' || g
    from sect s, generate_series(1, s.question_count) g
   where not exists (select 1 from qs x where x.section_id = s.id and x.ordinal = g)
  union all
  select 'ERROR', 'question-ordinal-range', 11,
         'section ordinal ' || x.sec_ordinal || ' has a question at ordinal ' || x.ordinal
           || ', beyond question_count ' || x.question_count
    from qs x where x.ordinal > x.question_count
  union all
  select 'ERROR', 'question-status', 12,
         'question ' || x.ordinal || ' (section ordinal ' || x.sec_ordinal || ') has status '
           || x.status || ' — every question must be ''approved'''
    from qs x where x.status <> 'approved'
  union all
  select 'ERROR', 'question-difficulty', 13,
         'question ' || x.ordinal || ' (section ordinal ' || x.sec_ordinal
           || ') has no difficulty'
    from qs x where x.difficulty is null
  union all
  select 'ERROR', 'question-attestation', 14,
         'question ' || x.ordinal || ' (section ordinal ' || x.sec_ordinal
           || ') is missing originality attestation'
    from qs x
   where x.originality_attested_at is null or x.originality_attested_by is null

  -- ── operational standard, NOT enforced by the publish gate ──────────────
  union all
  select 'WARNING', 'question-explanation', 15,
         'question ' || x.ordinal || ' (section ordinal ' || x.sec_ordinal
           || ') has no explanation — Si Math AI standard; publish_exam_form() does not check this'
    from qs x where x.explanation is null or btrim(x.explanation) = ''

  -- A stimulus no question references shows the student nothing. The publish
  -- gate deliberately does not refuse it: it is untidiness, not a hazard, and
  -- keeping it out of the gate left a security-critical function untouched.
  -- Surfacing it here is where that decision gets paid for.
  union all
  select 'WARNING', 'stimulus-orphan', 16,
         'stimulus ' || st.kind || coalesce(' (' || st.label || ')', '')
           || ' is referenced by no question in this form'
    from stim st
   where not exists (select 1 from qs x where x.stimulus_id = st.id)

  -- The SVG exception is meant to be rare and justified. Printing every use
  -- with its written reason puts the reviewer in a position to judge whether
  -- it really could not have been native — which is the only thing standing
  -- between "narrow exception" and "the way we do visuals now".
  union all
  select 'WARNING', 'stimulus-media-exception', 17,
         'figure' || coalesce(' (' || st.label || ')', '')
           || ' uses the SVG exception rather than a native visual — stated reason: '
           || st.media_reason
    from stim st
   where st.media_ref is not null
)
select r.severity, r.check_name, r.detail
  from (
    select severity, check_name, sort_key, detail from findings
    union all
    select 'OK', 'eligible', 0,
           'no blocking violations — publish_exam_form() is expected to accept this form'
     where not exists (select 1 from findings where severity = 'ERROR')
  ) r
 order by (r.severity = 'WARNING'), r.sort_key, r.detail;
`;

/**
 * The pre-flight query for one form code and one exam code.
 * Pure string building — no I/O, so the CI suite can assert on the result.
 */
export function preflightSQL(formCode, examCode) {
  return `-- ============================================================================
-- PRE-FLIGHT — form ${formCode} (${examCode})
-- READ-ONLY. No INSERT, UPDATE, DELETE or DDL. Safe to run against production.
--
-- Zero ERROR rows  → publish_exam_form() is expected to accept this form.
-- WARNING rows     → Si Math AI operational standards; the gate ignores these.
--
-- ADVISORY ONLY: the gate in the database is the authority. Generated by
-- scripts/preflight-exam-form.mjs from exam-registry.js — do not edit by hand.
-- ============================================================================
${sourceCTEs(formCode, examCode)}${CHECKS_SQL}`;
}

// ── CLI ────────────────────────────────────────────────────────────────────
import { pathToFileURL } from 'node:url';
const isCLI = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isCLI) {
  const [formCode, examCode] = process.argv.slice(2);
  if (!formCode || !examCode) {
    console.error('usage: node scripts/preflight-exam-form.mjs <FORM_CODE> <EXAM_CODE>');
    console.error('example: node scripts/preflight-exam-form.mjs ESTM1-2026-A EST_MATH_1');
    process.exit(1);
  }
  try {
    process.stdout.write(preflightSQL(formCode, examCode));
  } catch (e) {
    console.error(`error: ${e.message}`);
    process.exit(1);
  }
}
