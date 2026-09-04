-- =====================================================================
-- Rollback for the whole H2 package: 20260902b + 20260902c + 20260902d
-- =====================================================================
-- STATUS: 🟡 PREPARED, deliberately unapplied. The package it undoes went LIVE
--         on 2026-09-03 as versions 20260903123333 / 123410 / 123458, so this is
--         now a real undo of live schema rather than a hypothetical one. It was
--         rehearsed in an aborting transaction before the apply and returned
--         every hash to its exact pre-package value.
--
-- One file for all three forward migrations on purpose: dropping a table takes
-- its policies, its triggers and its grants with it, so a separate "undo the
-- RLS" step would only ever produce the worst possible intermediate state. It
-- is also safe on a PARTIALLY applied package — every drop is `if exists` and
-- every count is guarded by to_regclass — which is what makes b + c + d
-- behave as one unit even though they are applied as three statements.
--
-- Unlike 20260902z (the labels, which cannot truly be undone), this restores
-- the prior state exactly. Nothing outside these six tables and their seven
-- functions is touched: no exam table, no shared validator, no enum label.
-- The four validators these tables borrow — exam_stimulus_shape_ok,
-- exam_stimulus_spec_ok, exam_question_choices_ok, exam_question_answer_ok —
-- are NOT dropped here. They belong to the platform exam system.
--
-- ⚠️ THIS DESTROYS STUDENT WORK if any exists. teacher_homework_attempts are
-- records of work that actually happened, teacher_homework_responses are the
-- answers themselves, and teacher_homework_access rows are records of students
-- who attached; the guards refuse to delete any of the three one row at a time
-- precisely because they are records. Dropping the table is the one door left,
-- so the check below refuses to open it silently.
-- =====================================================================

begin;

do $$
declare v_attempts integer := 0; v_access integer := 0; v_answers integer := 0;
begin
  if to_regclass('public.teacher_homework_attempts') is not null then
    execute 'select count(*) from teacher_homework_attempts' into v_attempts;
  end if;
  if to_regclass('public.teacher_homework_access') is not null then
    execute 'select count(*) from teacher_homework_access' into v_access;
  end if;
  if to_regclass('public.teacher_homework_responses') is not null then
    execute 'select count(*) from teacher_homework_responses' into v_answers;
  end if;
  if v_attempts > 0 or v_access > 0 or v_answers > 0 then
    raise exception
      'rollback H2 refused: % attempt(s), % attachment(s) and % answer(s) exist. Dropping these tables '
      'destroys student work — decide that explicitly, not by running a rollback script.',
      v_attempts, v_access, v_answers;
  end if;
end $$;

-- Children first, though the cascade on each FK would handle it. The answer
-- record goes before the attempts and questions its composite keys point at.
drop table if exists teacher_homework_responses;
drop table if exists teacher_homework_attempts;
drop table if exists teacher_homework_access;
drop table if exists teacher_homework_questions;
drop table if exists teacher_homework_stimuli;
drop table if exists teacher_homework;

drop function if exists teacher_homework_is_staff(uuid);
drop function if exists teacher_homework_guard();
drop function if exists teacher_homework_content_guard();
drop function if exists teacher_homework_stimulus_same_homework();
drop function if exists teacher_homework_access_guard();
drop function if exists teacher_homework_attempts_guard();
drop function if exists teacher_homework_responses_guard();

-- ── verification ──────────────────────────────────────────────────────
do $$
declare v_left text; v_n integer;
begin
  select string_agg(c.relname, ', ') into v_left
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname like 'teacher\_homework%';
  if v_left is not null then
    raise exception 'rollback H2: tables remain: %', v_left;
  end if;

  select string_agg(p.proname, ', ') into v_left
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname like 'teacher\_homework%';
  if v_left is not null then
    raise exception 'rollback H2: functions remain: %', v_left;
  end if;

  -- The borrowed validators must SURVIVE, and so must every teacher_exam table:
  -- this undoes H2 and nothing beside it.
  select string_agg(x.n, ', ') into v_left
    from unnest(array['exam_stimulus_shape_ok', 'exam_stimulus_spec_ok',
                      'exam_question_choices_ok', 'exam_question_answer_ok',
                      'exam_answer_matches']) as x(n)
   where not exists (select 1 from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
                      where ns.nspname = 'public' and p.proname = x.n);
  if v_left is not null then
    raise exception 'rollback H2: it destroyed shared platform validators: %', v_left;
  end if;

  select count(*) into v_n from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname like 'teacher\_exam%' and c.relkind = 'r';
  if v_n <> 6 then
    raise exception 'rollback H2: the six teacher_exam tables are not all present (%)', v_n;
  end if;
end $$;

commit;
