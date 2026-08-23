-- =====================================================================
-- Mock Exam v2 · M1 ROLLBACK — undoes 20260823a_mock_exam_integrity_events.sql
-- =====================================================================
-- STATUS: ⚠️ NOT APPLIED, AND MUST NOT BE RUN CASUALLY. This is the rollback
--         for a migration that IS now live in production (applied 2026-08-23,
--         version 20260823043358). Running it drops a live table. It lives here
--         beside its migration, matching 20260804_streak_server_side_rollback.sql
--         and 20260815z_support_rollback.sql; the CLI does not replay this
--         directory (see docs/supabase-migrations.md), so its presence here is
--         documentation, not scheduling.
--
--         Exercised for real during staging validation on 2026-08-23: it was
--         observed REFUSING on a non-empty table, then proceeding under the
--         explicit confirmation below, then running on an empty table with no
--         flag — leaving every exam_practice_sessions row intact each time.
--
--         Revision 3. Written against forward-migration revision 4, and
--         CORRECTED BY STAGING VALIDATION: section 3's checklist said to expect
--         "the original 14 columns" on exam_practice_sessions. It has 13. The
--         14 came from miscounting an earlier privileges query, whose row set
--         included one table-level grant row alongside the 13 per-column rows.
--         Harmless in itself, but a checklist with a wrong expected value is
--         worse than no checklist — it trains the operator to wave through a
--         mismatch. Found by running the rollback for real; see
--         docs/roadmap/mock-exam-v2-m1-staging-validation.md.
--
--         Revision 2. Written against forward-migration revision 4.
--
--         Rev 4 changed the forward DDL for the first time (confidence became
--         NOT NULL, its mapping exhaustive, plus a domain CHECK). NOTHING IN
--         THIS FILE NEEDED TO CHANGE AS A RESULT, and that is worth stating
--         rather than leaving as a silent non-event: all three additions live
--         INSIDE exam_integrity_events, and `drop table` removes a table's
--         columns, constraints and generated expressions with it. There is no
--         new standalone object — no separate constraint on a pre-existing
--         table, no new function, no new index outside the dropped table — for
--         this rollback to undo.
--
--         The one statement here that touches a pre-existing production table is
--         still section 3's column drop on exam_practice_sessions, and rev 4 did
--         not alter that column.
--
-- Shipped WITH the forward migration rather than promised by it. A rollback
-- composed at the moment something has gone wrong is not a rollback.
--
-- =====================================================================
-- READ THIS BEFORE RUNNING: THIS FILE DESTROYS DATA
-- =====================================================================
-- Dropping exam_integrity_events destroys every integrity event ever recorded.
-- Those rows are an audit trail: if any enforcement decision, Admin review, or
-- student appeal has referred to them, this erases the evidence behind it.
--
-- The forward migration deliberately made those rows unmodifiable. Dropping the
-- table is the one action that defeats that guarantee, so it is gated below
-- rather than left as a bare DROP.
--
-- THE GUARD
-- ---------
-- Section 0 counts the rows and ABORTS if any exist, unless the operator has
-- explicitly declared the loss acceptable in the same session:
--
--     begin;
--     set local si.confirm_integrity_data_loss = 'yes';
--     \i 20260823a_mock_exam_integrity_events_rollback.sql
--
-- On an empty table — the overwhelmingly likely case, a mistake caught right
-- after applying — no flag is needed and the rollback simply runs.
--
-- This is not ceremony. The realistic reason to run this file is "M1 was applied
-- and we changed our minds", which happens minutes later with zero rows. The
-- dangerous case is running it months later out of habit, and the guard exists
-- for exactly that.
--
-- WHAT SURVIVES
-- -------------
-- Every exam_practice_sessions ROW survives. Only the attempt_id COLUMN is
-- dropped, so sessions, scores, mistakes, weakness signals, mastery and reports
-- are all untouched. The Weakness Analyzer pipeline never read attempt_id and is
-- unaffected in both directions.
--
-- WHAT IS NOT RECOVERABLE
-- -----------------------
--   * All exam_integrity_events rows.
--   * The attempt_id values on saved sessions — which means that even if M1 is
--     re-applied later, sessions saved in between can never be re-linked to the
--     events they belonged to. Re-applying restores the SCHEMA, never the
--     LINKAGE.
--
-- If either matters, archive first:
--     create table exam_integrity_events_archive_20260823 as
--       select * from public.exam_integrity_events;
--     create table eps_attempt_archive_20260823 as
--       select id, attempt_id from public.exam_practice_sessions
--        where attempt_id is not null;
-- Both are outside this file on purpose: an archive that runs automatically is
-- an archive nobody knows exists.
--
-- ATOMICITY
-- ---------
-- `begin;` first, `commit;` last, nothing after — same construction as the
-- forward migration. Every drop below lands or none does.
-- =====================================================================

begin;

-- =====================================================================
-- 0. DATA-LOSS GUARD
-- =====================================================================
do $$
declare
  v_events   bigint := 0;
  v_linked   bigint := 0;
  v_confirm  text;
begin
  -- to_regclass so this block is safe to run even if the forward migration was
  -- never applied, or was already rolled back. A rollback that errors on a
  -- half-applied state is not much of a rollback either.
  if to_regclass('public.exam_integrity_events') is not null then
    execute 'select count(*) from public.exam_integrity_events' into v_events;
  end if;

  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name   = 'exam_practice_sessions'
       and column_name  = 'attempt_id'
  ) then
    execute 'select count(*) from public.exam_practice_sessions where attempt_id is not null'
      into v_linked;
  end if;

  v_confirm := coalesce(current_setting('si.confirm_integrity_data_loss', true), '');

  if (v_events > 0 or v_linked > 0) and v_confirm <> 'yes' then
    raise exception
      'M1 rollback refused: % integrity event(s) and % linked session(s) would be '
      'destroyed. If that is intended, re-run with '
      '"set local si.confirm_integrity_data_loss = ''yes'';" in the same '
      'transaction. Consider archiving first — see this file''s header.',
      v_events, v_linked
      using errcode = 'raise_exception';
  end if;

  raise notice
    'M1 rollback proceeding: dropping % integrity event(s); clearing attempt_id on % session(s).',
    v_events, v_linked;
end
$$;

-- =====================================================================
-- 1. THE TABLE — takes its trigger, policies, indexes and constraints with it
-- =====================================================================
-- DROP TABLE removes dependent triggers, RLS policies and indexes; they are not
-- dropped individually here because doing so would only add ways for this file
-- to fail on a partially-applied state.
drop table if exists public.exam_integrity_events;

-- =====================================================================
-- 2. FUNCTIONS
-- =====================================================================
-- After the table is gone nothing references either. Dropped in dependency
-- order regardless, so a partial run behaves.
drop function if exists public.exam_integrity_events_no_update();
drop function if exists public.exam_integrity_metadata_ok(jsonb);

-- =====================================================================
-- 3. THE LINKAGE COLUMN ON exam_practice_sessions
-- =====================================================================
-- The only statement in this file that touches a pre-existing production table.
-- It removes a column that M1 added and nothing before M1 ever read: the timer,
-- the save flow, the self-report flow, exam-mistakes-logger.js,
-- regenerate-reports.js and mastery-updater.js none of them reference
-- attempt_id, so dropping it cannot affect them.
--
-- Index first, explicitly, rather than relying on the column drop to cascade —
-- clearer intent, and it keeps the statement meaningful if the column was
-- already removed by hand.
drop index if exists public.exam_practice_sessions_attempt_idx;

alter table public.exam_practice_sessions
  drop column if exists attempt_id;

commit;

-- =====================================================================
-- VERIFICATION — run AFTER rolling back, expect every line to report ok
-- =====================================================================
-- 1. The table is gone:
--      select to_regclass('public.exam_integrity_events');   -- expect: NULL
--
-- 2. Both functions are gone:
--      select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--       where n.nspname = 'public'
--         and proname in ('exam_integrity_metadata_ok','exam_integrity_events_no_update');
--      -- expect: 0 rows
--
-- 3. The column is gone and the table is otherwise intact:
--      select column_name from information_schema.columns
--       where table_schema='public' and table_name='exam_practice_sessions'
--       order by ordinal_position;
--      -- expect: the original 13 columns, no attempt_id
--
-- 4. NO SESSION WAS LOST — the assertion that matters most here:
--      select count(*) from public.exam_practice_sessions;
--      -- expect: exactly the count from before the rollback
--
-- 5. The save flow still works end to end:
--      -- take one mock exam in the UI; it should save with no error
--
-- 6. The Weakness Analyzer pipeline is untouched:
--      select count(*) from public.weakness_signals where source = 'MOCK_EXAM';
--      -- expect: unchanged
