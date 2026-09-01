-- =====================================================================
-- Rollback for 20260901c + 20260901d — and this one IS a clean undo
-- =====================================================================
-- STATUS: 🟡 PREPARED, deliberately unapplied.
--
-- One file for both forward migrations on purpose: dropping a table takes its
-- policies, its triggers and its grants with it, so a separate "undo the RLS"
-- step would only ever produce the worst possible intermediate state — six
-- tables carrying data with their access rules removed.
--
-- Unlike 20260901y (the enum, which cannot truly be undone), this restores the
-- prior state exactly. Nothing outside these six tables is touched: no
-- platform exam table, no shared validator, no enum label. The five validators
-- these tables borrow — exam_stimulus_shape_ok, exam_stimulus_spec_ok,
-- exam_question_choices_ok, exam_question_answer_ok — are NOT dropped here.
-- They belong to the platform exam system and were only referenced.
--
-- ⚠️ THIS DESTROYS STUDENT WORK if any exists. teacher_exam_attempts and
-- teacher_exam_responses are records of sittings that actually happened, and
-- the guards in 20260901c refuse to delete them one row at a time precisely
-- because they are records. Dropping the table is the one door left, so the
-- check below refuses to open it silently.
-- =====================================================================

begin;

do $$
declare v_attempts integer := 0;
begin
  if to_regclass('public.teacher_exam_attempts') is not null then
    execute 'select count(*) from teacher_exam_attempts' into v_attempts;
  end if;
  if v_attempts > 0 then
    raise exception
      'rollback 3b refused: % sitting(s) exist. Dropping these tables destroys student work — '
      'decide that explicitly, not by running a rollback script.', v_attempts;
  end if;
end $$;

-- Children first, though the cascade on each FK would handle it: naming the
-- order makes the dependency graph readable a year from now.
drop table if exists teacher_exam_responses;
drop table if exists teacher_exam_attempts;
drop table if exists teacher_exam_access;
drop table if exists teacher_exam_questions;
drop table if exists teacher_exam_stimuli;
drop table if exists teacher_exams;

drop function if exists teacher_exam_is_staff(uuid);
drop function if exists teacher_exams_guard();
drop function if exists teacher_exam_content_guard();
drop function if exists teacher_exam_stimulus_same_exam();
drop function if exists teacher_exam_access_guard();
drop function if exists teacher_exam_attempts_guard();
drop function if exists teacher_exam_responses_guard();

-- ── verification ──────────────────────────────────────────────────────
do $$
declare v_left text;
begin
  select string_agg(c.relname, ', ') into v_left
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname like 'teacher\_exam%';
  if v_left is not null then
    raise exception 'rollback 3b: tables remain: %', v_left;
  end if;

  select string_agg(p.proname, ', ') into v_left
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname like 'teacher\_exam%';
  if v_left is not null then
    raise exception 'rollback 3b: functions remain: %', v_left;
  end if;

  -- The borrowed validators must SURVIVE. Dropping them would silently
  -- unguard exam_stimuli and exam_questions, which is a far worse outcome
  -- than an incomplete rollback.
  select string_agg(x.n, ', ') into v_left
    from unnest(array['exam_stimulus_shape_ok', 'exam_stimulus_spec_ok',
                      'exam_question_choices_ok', 'exam_question_answer_ok',
                      'exam_answer_matches']) as x(n)
   where not exists (select 1 from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
                      where ns.nspname = 'public' and p.proname = x.n);
  if v_left is not null then
    raise exception 'rollback 3b: it destroyed shared platform validators: %', v_left;
  end if;
end $$;

commit;
