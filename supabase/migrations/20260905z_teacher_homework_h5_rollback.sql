-- =====================================================================
-- Rollback for 20260905a — Teacher Homework H5
-- =====================================================================
-- STATUS: 🟡 PREPARED, deliberately unapplied.
--
-- ⚠️ THIS ROLLBACK HAS A WINDOW, AND IT CLOSES AT THE FIRST SITTING.
-- ---------------------------------------------------------------------
-- Written before the apply rather than discovered after it.
--
--   1 · THE FIRST STARTED ATTEMPT closes it. This file refuses while any row
--       exists in teacher_homework_attempts, because removing the RPCs would
--       strand a student mid-paper with no way to finish and no way to be
--       cleared: an attempt can never be deleted (the H2 guard), and S-2
--       deliberately has no terminal state. That is not a rollback, it is an
--       abandonment with a database row attached.
--
--   2 · THE H4 WINDOW IS SEPARATE and already open on its own terms:
--       20260904z refuses while any homework code is retired, and this file
--       does not touch that.
--
-- WHAT THIS RESTORES, AND WHY THAT IS THE RISKY PART
-- ---------------------------------------------------------------------
-- 20260905a REDEFINED FOUR live functions. Undoing it means putting the H4
-- bodies back byte-for-byte, not approximately — the hazard 20260831e is
-- remembered for. The four bodies below are copied verbatim from their H2/H4
-- sources, and §4 asserts each md5 equals the value H4 left live:
--     teacher_homework_attempts_guard    dacf16fdbce357a20975d566b3035680
--     teacher_homework_responses_guard   c5db8f0336d0460c0ad1eb534bbbfc0b
--     student_my_homework                04198136c9609eb8e73baeb747d13dd3
--     teacher_homework_students          01b0386d8a03c5d54d734f7a565c23ee
-- It also RESTORES THE GRANT H5 revoked, because a rollback that leaves the
-- student read boundary half-moved is not a rollback.
-- If any assertion fails, this file has restored something that is not H4 and
-- must not be committed.
-- =====================================================================

begin;

-- ── 1 · refuse while any sitting exists ───────────────────────────────
do $$
declare v_attempts integer := 0; v_responses integer := 0;
begin
  if to_regclass('public.teacher_homework_attempts') is not null then
    execute 'select count(*) from teacher_homework_attempts' into v_attempts;
  end if;
  if to_regclass('public.teacher_homework_responses') is not null then
    execute 'select count(*) from teacher_homework_responses' into v_responses;
  end if;
  if v_attempts > 0 then
    raise exception
      'rollback H5 refused: % attempt(s) and % answer(s) exist. Removing the RPCs strands every '
      'unsubmitted sitting permanently — an attempt can never be deleted and S-2 gives it no terminal '
      'state. Decide that explicitly, not by running a rollback script.',
      v_attempts, v_responses;
  end if;
end $$;

-- ── 2 · drop what H5 added ────────────────────────────────────────────
-- Triggers before their functions, and both before the tables they sit on
-- survive this rollback — teacher_homework_responses is an H2 table.
drop trigger if exists teacher_homework_verdict_state_trg on teacher_homework_responses;
drop trigger if exists teacher_homework_responses_verdict_trg on teacher_homework_responses;
drop function if exists teacher_homework_verdict_state_guard();
drop function if exists teacher_homework_verdict_guard();

drop function if exists student_homework_paper(uuid);
drop function if exists student_homework_start(uuid);
drop function if exists student_homework_save(uuid, uuid, text);
drop function if exists student_homework_submit(uuid);
drop function if exists teacher_homework_review(uuid, uuid);
drop function if exists teacher_homework_can_resume(uuid);

-- ── 3 · restore the four H4 bodies, verbatim ──────────────────────────

-- 20260902b's body: no INSERT branch, and the trigger goes back to two verbs.
create or replace function teacher_homework_attempts_guard()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $fn$
begin
  if tg_op = 'DELETE' then
    raise exception 'teacher_homework_attempts: an attempt is a record and is never deleted'
      using errcode = '42501';
  end if;
  if new.id is distinct from old.id
     or new.user_id is distinct from old.user_id
     or new.homework_id is distinct from old.homework_id
     or new.started_at is distinct from old.started_at then
    raise exception 'teacher_homework_attempts: whose attempt, of what, from when — all immutable'
      using errcode = '22000';
  end if;
  if old.status <> 'in_progress' then
    raise exception 'teacher_homework_attempts: this attempt is already % and is final', old.status
      using errcode = '22000';
  end if;
  return new;
end;
$fn$;

drop trigger if exists teacher_homework_attempts_guard_trg on teacher_homework_attempts;
create trigger teacher_homework_attempts_guard_trg
  before delete or update on teacher_homework_attempts
  for each row execute function teacher_homework_attempts_guard();

-- 20260902b's body: last_answered_at was NOT frozen.
create or replace function teacher_homework_responses_guard()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $fn$
declare v_status text;
begin
  if tg_op = 'DELETE' then
    raise exception 'teacher_homework_responses: an answer is a record and is never deleted'
      using errcode = '42501';
  end if;

  if new.attempt_id is distinct from old.attempt_id
     or new.question_id is distinct from old.question_id
     or new.homework_id is distinct from old.homework_id
     or new.ordinal is distinct from old.ordinal then
    raise exception 'teacher_homework_responses: which item of which attempt is immutable'
      using errcode = '22000';
  end if;

  -- Graded once, and never re-graded: once is_correct holds a verdict, no later
  -- code path can quietly rewrite it.
  if old.is_correct is not null and new.is_correct is distinct from old.is_correct then
    raise exception 'teacher_homework_responses: this item is already graded'
      using errcode = '42501';
  end if;

  -- A submitted paper cannot be edited. H5 must therefore grade BEFORE it flips
  -- the attempt to submitted — the order teacher_exam_submit() already uses.
  -- Fails closed on an unreadable parent, which is why this is SECURITY DEFINER.
  if new.answer is distinct from old.answer then
    select status into v_status from teacher_homework_attempts where id = new.attempt_id;
    if v_status is null or v_status <> 'in_progress' then
      raise exception 'teacher_homework_responses: this attempt is % and its answers are final',
        coalesce(v_status, '(unknown)') using errcode = '42501';
    end if;
  end if;

  return new;
end;
$fn$;

-- 20260904a's body: can_open alone, with no resume arm.
create or replace function student_my_homework()
returns table (
  homework_id     uuid,
  title           text,
  workspace_name  text,
  status          text,
  due_at          timestamptz,
  reveal_answers  boolean,
  attached_at     timestamptz,
  attempt_status  text,
  submitted_at    timestamptz,
  late            boolean,
  can_open        boolean
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $fn$
begin
  if auth.uid() is null then
    raise exception 'student_my_homework: sign in first' using errcode = '42501';
  end if;
  return query
    select h.id, h.title, w.name, h.status, h.due_at, h.reveal_answers,
           a.attached_at, t.status, t.submitted_at, t.late,
           teacher_homework_can_open(h.id)
      from teacher_homework_access a
      join teacher_homework h        on h.id = a.homework_id
      join teacher_workspaces w      on w.id = h.workspace_id
      left join teacher_homework_attempts t
             on t.homework_id = h.id and t.user_id = auth.uid()
     where a.student_id = auth.uid()
     order by (t.status is distinct from 'submitted') desc,
              h.due_at asc nulls last,
              a.attached_at desc;
end;
$fn$;

-- 20260904a's body: six columns, no counts and no membership signal.
drop function if exists teacher_homework_students(uuid);
create or replace function teacher_homework_students(p_homework uuid)
returns table (
  student_id     uuid,
  student_name   text,
  attached_at    timestamptz,
  attempt_status text,
  submitted_at   timestamptz,
  late           boolean
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $fn$
begin
  if not teacher_homework_is_staff(p_homework) then
    raise exception 'teacher_homework_students: no such homework, or you are not staff of its class'
      using errcode = '42501';
  end if;
  return query
    select a.student_id, coalesce(p.full_name, 'Student'), a.attached_at,
           t.status, t.submitted_at, t.late
      from teacher_homework_access a
      left join profiles p on p.id = a.student_id
      left join teacher_homework_attempts t
             on t.homework_id = a.homework_id and t.user_id = a.student_id
     where a.homework_id = p_homework
     order by coalesce(p.full_name, 'Student') asc, a.attached_at asc;
end;
$fn$;

revoke all on function student_my_homework()           from public, anon, authenticated;
revoke all on function teacher_homework_students(uuid) from public, anon, authenticated;
grant execute on function student_my_homework()        to authenticated;
grant execute on function teacher_homework_students(uuid) to authenticated;

-- ── 4 · restore the grant H5 revoked ──────────────────────────────────
-- A rollback that leaves the student read boundary half-moved is not a
-- rollback: with the RPCs gone and the grant still revoked, staff would lose
-- every path to the questions they authored.
grant select on teacher_homework_questions to authenticated;

-- ── 5 · verification ──────────────────────────────────────────────────
do $$
declare v_left text; v_n integer;
begin
  -- 5.1 nothing H5 added survives
  select string_agg(x.n, ', ') into v_left
    from unnest(array['teacher_homework_can_resume','student_homework_paper','student_homework_start',
                      'student_homework_save','student_homework_submit','teacher_homework_review',
                      'teacher_homework_verdict_guard','teacher_homework_verdict_state_guard']) as x(n)
   where exists (select 1 from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
                  where ns.nspname = 'public' and p.proname = x.n);
  if v_left is not null then
    raise exception 'rollback H5: functions remain: %', v_left;
  end if;
  select count(*) into v_n from pg_trigger tg join pg_class c on c.oid = tg.tgrelid
   where c.relname = 'teacher_homework_responses' and not tg.tgisinternal;
  if v_n <> 1 then
    raise exception 'rollback H5: teacher_homework_responses carries % trigger(s); H2 left exactly one', v_n;
  end if;
  if (select pg_get_triggerdef(tg.oid) from pg_trigger tg join pg_class c on c.oid = tg.tgrelid
       where c.relname = 'teacher_homework_attempts' and not tg.tgisinternal)
     !~ 'BEFORE DELETE OR UPDATE ON public\.teacher_homework_attempts' then
    raise exception 'rollback H5: the attempts trigger is not back to H2''s two verbs';
  end if;

  -- 5.2 THE RESTORED BODIES ARE H4'S, byte for byte
  if (select md5(p.prosrc) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'teacher_homework_attempts_guard')
     <> 'dacf16fdbce357a20975d566b3035680' then
    raise exception 'rollback H5: teacher_homework_attempts_guard() was NOT restored';
  end if;
  if (select md5(p.prosrc) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'teacher_homework_responses_guard')
     <> 'c5db8f0336d0460c0ad1eb534bbbfc0b' then
    raise exception 'rollback H5: teacher_homework_responses_guard() was NOT restored';
  end if;
  if (select md5(p.prosrc) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'student_my_homework')
     <> '04198136c9609eb8e73baeb747d13dd3' then
    raise exception 'rollback H5: student_my_homework() was NOT restored';
  end if;
  if (select md5(p.prosrc) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'teacher_homework_students')
     <> '01b0386d8a03c5d54d734f7a565c23ee' then
    raise exception 'rollback H5: teacher_homework_students() was NOT restored';
  end if;

  -- 5.3 the grant is back, and the policy never left
  if not has_table_privilege('authenticated', 'teacher_homework_questions', 'select') then
    raise exception 'rollback H5: the direct SELECT on teacher_homework_questions was not restored';
  end if;

  -- 5.4 H2, H3 and H4 are otherwise untouched
  select count(*) into v_n from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname like 'teacher\_homework%' and c.relkind = 'r';
  if v_n <> 8 then
    raise exception 'rollback H5: expected the eight H4 tables, found %', v_n;
  end if;
  select count(*) into v_n from pg_policy p join pg_class c on c.oid = p.polrelid
   where c.relname like 'teacher\_homework%';
  if v_n <> 9 then
    raise exception 'rollback H5: expected 9 homework policies, found %', v_n;
  end if;
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and (p.proname like 'teacher\_homework%' or p.proname like 'student\_homework%'
          or p.proname in ('student_attach_homework','student_my_homework'));
  if v_n <> 30 then
    raise exception 'rollback H5: expected the 30 H4 homework functions, found %', v_n;
  end if;
  if (select md5(p.prosrc) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'teacher_homework_can_open')
     <> '9ef8d477bede57132177ca896ab4a2f9' then
    raise exception 'rollback H5: it disturbed teacher_homework_can_open()';
  end if;
  if (select md5(p.prosrc) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'teacher_homework_code_guard')
     <> 'f54ea68a1b3ef3de5475e92c601a51dc' then
    raise exception 'rollback H5: it disturbed H4''s code guard';
  end if;
end $$;

commit;
