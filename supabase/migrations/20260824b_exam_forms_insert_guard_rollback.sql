-- =====================================================================
-- Mock Exam v2 · B1 ROLLBACK — undoes 20260824b_exam_forms_insert_guard.sql
-- =====================================================================
-- STATUS: ⚠️ NOT APPLIED. Shipped WITH the forward migration, per the M1 rule
--         that a rollback composed at the moment something has gone wrong is
--         not a rollback.
--
-- Revision 1, written against forward-migration revision 1.
--
-- =====================================================================
-- WHAT RUNNING THIS COSTS
-- =====================================================================
-- Unlike the M3 rollback, this destroys NO data. It drops one trigger and one
-- function, both created by the forward file; exam_forms and every other table
-- are untouched, so no guard is needed and no confirmation flag exists.
--
-- What it DOES restore is the defect: with this trigger gone, any service_role
-- INSERT can create a form at status='published', bypassing publish_exam_form()
-- entirely, and the resulting row is permanent — un-deletable, un-correctable,
-- and its code burned forever. Do not run this to "unblock" an authoring
-- script. If a legitimate INSERT is being refused, the fix is to widen the
-- guard in a reviewed change, not to remove it.
--
-- THE ONE CASE THIS IS FOR: the forward migration is applied and something
-- unforeseen depends on inserting a non-draft form, and that must be unblocked
-- before the proper fix can be reviewed.
--
-- ORDER MATTERS: the trigger is dropped before the function it calls. Dropping
-- the function first would fail on the dependency (or, with CASCADE, silently
-- take the trigger with it — which is the same outcome by a less legible
-- route, so it is spelled out).
-- =====================================================================

begin;

drop trigger if exists exam_forms_insert_guard_row on public.exam_forms;
drop function if exists public.exam_forms_insert_guard();

commit;

-- =====================================================================
-- VERIFICATION — run AFTER rolling back
-- =====================================================================
-- 1. The trigger is gone and the ORIGINAL guard is untouched:
--      select t.tgname,
--             case when (t.tgtype::int & 4)>0 then 'INSERT ' else '' end ||
--             case when (t.tgtype::int & 16)>0 then 'UPDATE ' else '' end ||
--             case when (t.tgtype::int & 8)>0 then 'DELETE ' else '' end as fires_on
--        from pg_trigger t join pg_class c on c.oid=t.tgrelid
--       where not t.tgisinternal and c.relname='exam_forms';
--    -- exactly one row: exam_forms_guard_row  UPDATE DELETE
--
-- 2. The function is gone:
--      select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--       where n.nspname='public' and proname='exam_forms_insert_guard';   -- 0
--
-- 3. Nothing else moved — publish_exam_form and the other four M3 functions
--    are still present, and exam_forms still holds the same rows:
--      select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--       where n.nspname='public' and proname in
--       ('publish_exam_form','exam_content_frozen_guard','exam_forms_guard',
--        'exam_questions_touch','exam_question_choices_ok');              -- 5
--      select count(*) from public.exam_forms;   -- unchanged by this file
--
-- 4. The defect is back (this is the POINT of the warning above) — on a
--    disposable code, in a non-production database only:
--      insert into public.exam_forms (code, exam_code, title, status)
--      values ('ROLLBACK-PROOF', 'EST_MATH_1', 'bypass works again', 'published');
--    -- succeeds, and the row can never be removed. Never run step 4 in
--    -- production: it permanently burns that form code.
