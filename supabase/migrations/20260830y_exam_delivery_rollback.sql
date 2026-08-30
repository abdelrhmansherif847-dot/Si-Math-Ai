-- =====================================================================
-- Mock delivery — rollback
-- =====================================================================
-- STATUS: ⛔ NOT APPLIED, and only to be run if delivery is being withdrawn.
--         20260830e and 20260830f went live on 2026-08-30, so this is now the
--         real withdrawal path rather than a hypothetical one.
-- Written alongside the forward migrations, on the same principle the teacher
-- foundation used: a rollback written later is a rollback written under pressure.
--
-- DESTRUCTIVE, and asymmetric — read this before running it.
--
-- Dropping exam_responses destroys the per-item evidence, which is the entire
-- point of the delivery layer and is NOT recoverable from anywhere else: the
-- session totals and exam_mistakes rows survive, but "which item, what they
-- chose, how long they took" exists only here.
--
-- What it deliberately does NOT touch:
--   * exam_practice_sessions rows written by exam_submit(). They are the
--     student's history and the streak reads them. The attempt_id column simply
--     becomes a dangling reference to nothing.
--   * exam_mistakes rows, and therefore every weakness_signal derived from
--     them. Withdrawing delivery must not rewrite what the analyzer already
--     concluded about a student.
-- =====================================================================

begin;

drop function if exists exam_submit(uuid);
drop function if exists exam_save_response(uuid, uuid, text, integer, boolean);
drop function if exists exam_start(uuid, text);
drop function if exists exam_available_sections();

drop table if exists exam_responses;
drop table if exists exam_attempts;

drop function if exists exam_answer_matches(text, text, text);

commit;
