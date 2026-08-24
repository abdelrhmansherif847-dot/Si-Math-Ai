-- =====================================================================
-- Mock Exam v2 · M3 ROLLBACK — undoes 20260824a_question_spine.sql
-- =====================================================================
-- STATUS: ⛔ PREPARED — NOT YET APPLIED. Awaiting owner approval.
--         Revision 1, written against forward-migration revision 1.
--
-- Shipped WITH the forward migration, per the M1 rule: a rollback composed at
-- the moment something has gone wrong is not a rollback.
--
-- =====================================================================
-- READ THIS BEFORE RUNNING: THIS FILE DESTROYS AUTHORED CONTENT
-- =====================================================================
-- Dropping the spine destroys every authored form, section and question —
-- including PUBLISHED forms, which the forward migration deliberately made
-- immutable precisely because they are the historical record of what students
-- were examined against. If any attempt data ever references a published form,
-- running this erases the content that gave those attempts meaning.
--
-- THE GUARD (M1 pattern): section 0 counts rows and ABORTS if any exist,
-- unless the operator declares the loss in the same transaction:
--
--     begin;
--     set local si.confirm_spine_data_loss = 'yes';
--     \i 20260824a_question_spine_rollback.sql
--
-- On empty tables — the realistic case, a mistake caught right after applying
-- — no flag is needed and the rollback simply runs.
--
-- WHAT SURVIVES: taxonomy_topics and taxonomy_subtopics rows are untouched;
-- only the support UNIQUE constraint added in §0 of the forward file is
-- removed. Nothing else in the database references the spine (delivery,
-- attempts and M4 do not exist).
--
-- WHAT IS NOT RECOVERABLE: every form, section and question, including
-- published_structure snapshots. Re-applying M3 restores the schema, never
-- the content.
--
-- ATOMICITY: begin; first, commit; last, nothing after.
-- =====================================================================

begin;

-- =====================================================================
-- 0. DATA-LOSS GUARD
-- =====================================================================
do $$
declare
  v_forms     bigint := 0;
  v_questions bigint := 0;
  v_published bigint := 0;
  v_confirm   text;
begin
  if to_regclass('public.exam_forms') is not null then
    execute 'select count(*) from public.exam_forms' into v_forms;
    execute 'select count(*) from public.exam_forms where status in (''published'',''retired'')'
      into v_published;
  end if;
  if to_regclass('public.exam_questions') is not null then
    execute 'select count(*) from public.exam_questions' into v_questions;
  end if;

  v_confirm := coalesce(current_setting('si.confirm_spine_data_loss', true), '');

  if (v_forms > 0 or v_questions > 0) and v_confirm <> 'yes' then
    raise exception
      'M3 rollback refused: % form(s) (% published/retired) and % question(s) would be '
      'destroyed. If that is intended, re-run with '
      '"set local si.confirm_spine_data_loss = ''yes'';" in the same transaction. '
      'Published forms are the historical record of what students were examined '
      'against — archive before destroying. See this file''s header.',
      v_forms, v_published, v_questions
      using errcode = 'raise_exception';
  end if;

  raise notice 'M3 rollback proceeding: dropping % form(s), % question(s).',
    v_forms, v_questions;
end
$$;

-- =====================================================================
-- 1. TABLES — children first; each drop removes its own triggers, policies,
--    indexes and constraints with it
-- =====================================================================
drop table if exists public.exam_questions;
drop table if exists public.exam_form_sections;
drop table if exists public.exam_forms;

-- =====================================================================
-- 2. FUNCTIONS — nothing references them once the tables are gone
-- =====================================================================
drop function if exists public.publish_exam_form(uuid, jsonb);
drop function if exists public.exam_content_frozen_guard();
drop function if exists public.exam_forms_guard();
drop function if exists public.exam_questions_touch();
drop function if exists public.exam_question_choices_ok(text, jsonb);

-- =====================================================================
-- 3. THE TAXONOMY SUPPORT CONSTRAINT — the one touch on an existing table
-- =====================================================================
-- Additive on the way in, subtractive on the way out. Taxonomy DATA is
-- untouched in both directions.
alter table public.taxonomy_subtopics
  drop constraint if exists taxonomy_subtopics_id_topic_uq;

commit;

-- =====================================================================
-- VERIFICATION — run AFTER rolling back, expect every line to report ok
-- =====================================================================
-- 1. select to_regclass('public.exam_forms');          -- NULL
--    select to_regclass('public.exam_form_sections');  -- NULL
--    select to_regclass('public.exam_questions');      -- NULL
-- 2. The five functions are gone:
--      select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--       where n.nspname='public' and proname in
--       ('publish_exam_form','exam_content_frozen_guard','exam_forms_guard',
--        'exam_questions_touch','exam_question_choices_ok');   -- 0 rows
-- 3. Taxonomy intact, constraint gone:
--      select count(*) from public.taxonomy_topics;      -- 5, unchanged
--      select count(*) from public.taxonomy_subtopics;   -- 33, unchanged
--      select conname from pg_constraint
--       where conname='taxonomy_subtopics_id_topic_uq';  -- 0 rows
-- 4. Nothing else changed: exam_practice_sessions, exam_mistakes,
--    exam_integrity_events and the analyzer tables report the same counts as
--    before the rollback.
