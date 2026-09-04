-- =====================================================================
-- Rollback for 20260904a — Teacher Homework H4
-- =====================================================================
-- STATUS: 🟡 PREPARED, deliberately unapplied.
--         20260904a is LIVE as of 2026-09-03 (version 20260903203209), so
--         this file is now the live undo and its window is OPEN: at the
--         post-apply measurement teacher_homework_retired_codes held 0 rows
--         and teacher_homework_access held 0. The window closes on the
--         first rotation or draft deletion — see below.
--
-- ⚠️ THIS ROLLBACK HAS A WINDOW, AND THE WINDOW CLOSES ON ITS OWN.
-- ---------------------------------------------------------------------
-- Written here before the apply rather than discovered after it, because two
-- ordinary events close it and neither is reversible:
--
--   1 · THE FIRST CODE ROTATION *OR* THE FIRST DRAFT DELETION closes this
--       rollback completely. Both retire a code, and dropping
--       teacher_homework_retired_codes releases every code it holds back into
--       circulation — which is exactly the hazard 20260904a exists to prevent,
--       and worse than never having fixed it, because a teacher who rotated a
--       leaked code would have been told the old one was dead. Deleting a
--       draft is the ordinary authoring action of the two, so in practice this
--       window closes early and by accident rather than by decision. That is
--       the trade the invariant costs, and it is stated here rather than
--       discovered. This file REFUSES while any reservation exists.
--
--   2 · THE FIRST STUDENT ATTACHMENT closes the H2 rollback, not this one.
--       teacher_homework_access rows are student records, and 20260902y
--       already refuses while any exist. This file does not touch that table
--       and does not need to: dropping the attach RPC stops new attachments
--       and strands none. But once a student has attached, the schema
--       underneath H4 can no longer be removed by script either.
--
-- The limiter table is the one part that is always safe to drop: its rows are
-- transient counters with a one-hour meaning, and losing them costs a caller
-- at most one hour of a rate limit they were not near anyway.
--
-- WHAT THIS RESTORES, AND WHY THAT IS THE RISKY PART
-- ---------------------------------------------------------------------
-- 20260904a REDEFINED three live functions from 20260903b. Undoing it means
-- putting the H3 bodies back byte-for-byte, not approximately — the hazard
-- 20260831e is remembered for. The three bodies below are copied verbatim from
-- 20260903b, and §3 asserts each md5 equals the value H3 installed:
--     teacher_homework_create      c9c6e06c2f8c7978dd3dc871dfd1f13f
--     teacher_homework_rotate_code 58cedf72a23d0adcaac12ca27fd41c86
--     teacher_homework_delete      7f3c8934a08ef9a749717fc2d52ff26a
-- If any assertion fails, this file has restored something that is not H3 and
-- must not be committed.
-- =====================================================================

begin;

-- ── 1 · refuse while any reservation exists ───────────────────────────
do $$
declare v_codes integer := 0; v_access integer := 0;
begin
  if to_regclass('public.teacher_homework_retired_codes') is not null then
    execute 'select count(*) from teacher_homework_retired_codes' into v_codes;
  end if;
  if to_regclass('public.teacher_homework_access') is not null then
    execute 'select count(*) from teacher_homework_access' into v_access;
  end if;

  if v_codes > 0 then
    raise exception
      'rollback H4 refused: % retired homework code(s) are reserved. Dropping the table returns them '
      'to circulation, so a student holding an old code could be attached to a different paper — the '
      'exact failure 20260904a prevents. Decide that explicitly, not by running a rollback script.',
      v_codes;
  end if;

  -- Not a refusal: attachments are not destroyed by this file. Said out loud
  -- so whoever runs it knows what survives.
  if v_access > 0 then
    raise notice
      'rollback H4: % student attachment(s) exist. They are NOT deleted — this file only removes the '
      'ability to make new ones. Note that 20260902y (the H2 undo) is already closed by them.',
      v_access;
  end if;
end $$;

-- ── 2 · drop what H4 added ────────────────────────────────────────────
-- The code guard first, and explicitly: it sits on teacher_homework, which is
-- an H2 table that SURVIVES this rollback, so unlike the guards on the two H4
-- tables it is not carried away by a DROP TABLE. Trigger before function —
-- the function cannot be dropped while a trigger depends on it.
drop trigger if exists teacher_homework_code_guard_trg on teacher_homework;
drop function if exists teacher_homework_code_guard();

drop function if exists student_attach_homework(text);
drop function if exists teacher_homework_can_open(uuid);
drop function if exists student_my_homework();
drop function if exists teacher_homework_students(uuid);
drop function if exists teacher_homework_code_available(text);

drop table if exists teacher_homework_attach_attempts;
drop table if exists teacher_homework_retired_codes;

drop function if exists teacher_homework_attach_attempts_guard();
drop function if exists teacher_homework_retired_codes_guard();

-- ── 3 · restore the three H3 bodies, verbatim from 20260903b ──────────

create or replace function teacher_homework_create(p_workspace uuid, p_title text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $fn$
declare v_id uuid; v_code text; v_con text; i int;
begin
  if auth.uid() is null then
    raise exception 'teacher_homework_create: sign in first' using errcode = '42501';
  end if;
  if not workspace_is_active_staff(p_workspace) then
    raise exception 'teacher_homework_create: you are not active staff of that class'
      using errcode = '42501';
  end if;

  for i in 1..10 loop
    begin
      v_code := teacher_homework_new_code();
      insert into teacher_homework (workspace_id, title, homework_code, created_by)
      values (p_workspace, btrim(p_title), v_code, auth.uid())
      returning id into v_id;
      exit;
    exception when unique_violation then
      get stacked diagnostics v_con = constraint_name;
      -- Only a code collision is retryable. Anything else unique is a real
      -- error and must not be swallowed by a loop that looks like a retry.
      if v_con is distinct from 'teacher_homework_homework_code_key' then
        raise;
      end if;
      if i = 10 then
        raise exception 'teacher_homework_create: could not allocate a free homework code'
          using errcode = '53400';
      end if;
    end;
  end loop;

  insert into workspace_audit_log (workspace_id, actor_id, action, subject_id, meta)
  values (p_workspace, auth.uid(), 'homework_created', null, jsonb_build_object('homework_id', v_id));

  return jsonb_build_object('homework_id', v_id, 'homework_code', v_code);
end;
$fn$;

create or replace function teacher_homework_rotate_code(p_homework uuid)
returns text
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $fn$
declare v_status text; v_ws uuid; v_code text; v_con text; i int;
begin
  if not teacher_homework_is_staff(p_homework) then
    raise exception 'teacher_homework_rotate_code: no such homework, or you are not staff of its class'
      using errcode = '42501';
  end if;
  select status, workspace_id into v_status, v_ws from teacher_homework where id = p_homework;
  if v_status = 'closed' then
    raise exception 'teacher_homework_rotate_code: this homework is closed' using errcode = '22023';
  end if;

  for i in 1..10 loop
    begin
      v_code := teacher_homework_new_code();
      update teacher_homework set homework_code = v_code where id = p_homework;
      exit;
    exception when unique_violation then
      get stacked diagnostics v_con = constraint_name;
      if v_con is distinct from 'teacher_homework_homework_code_key' then raise; end if;
      if i = 10 then
        raise exception 'teacher_homework_rotate_code: could not allocate a free homework code'
          using errcode = '53400';
      end if;
    end;
  end loop;

  insert into workspace_audit_log (workspace_id, actor_id, action, subject_id, meta)
  values (v_ws, auth.uid(), 'homework_code_rotated', null, jsonb_build_object('homework_id', p_homework));

  return v_code;
end;
$fn$;

create or replace function teacher_homework_delete(p_homework uuid)
returns void
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $fn$
declare v_status text; v_attached int; v_attempts int;
begin
  if not teacher_homework_is_staff(p_homework) then
    raise exception 'teacher_homework_delete: no such homework, or you are not staff of its class'
      using errcode = '42501';
  end if;
  select status into v_status from teacher_homework where id = p_homework;
  -- Only a draft may be deleted. The two non-draft statuses get DIFFERENT
  -- messages because they call for different actions: a published paper should
  -- be closed, and a closed one is simply final. 3c's teacher_exam_delete()
  -- (LIVE, 20260901e) says "close it, do not delete it" for both, so a teacher
  -- deleting a closed exam is told to close it again. That wording was not
  -- copied here; the live defect is recorded in §15.16b instead.
  if v_status = 'published' then
    raise exception 'teacher_homework_delete: this homework is published — close it, do not delete it'
      using errcode = '42501';
  elsif v_status <> 'draft' then
    raise exception 'teacher_homework_delete: this homework is % and can no longer be deleted', v_status
      using errcode = '42501';
  end if;
  -- The H2 guard refuses a non-draft delete too. Asking here as well turns a
  -- trigger's message into one the caller can act on; the guard remains the
  -- thing that cannot be bypassed.

  -- Student rows make this not a draft anyone may discard. The guards refuse
  -- it anyway — an attachment and an attempt are each "a record and never
  -- deleted", and an answer is held by a RESTRICT — but a raw trigger message
  -- names none of that, so ask first and say what is in the way. The guards
  -- remain the thing that cannot be bypassed. (A response cannot exist without
  -- an attempt, so counting attempts covers all three.)
  select count(*) into v_attached from teacher_homework_access where homework_id = p_homework;
  select count(*) into v_attempts from teacher_homework_attempts where homework_id = p_homework;
  if v_attached > 0 or v_attempts > 0 then
    raise exception
      'teacher_homework_delete: % student(s) hold this homework and % have started it — it can no longer be deleted',
      v_attached, v_attempts using errcode = '42501';
  end if;

  -- CHILDREN FIRST, and not by cascade. Measured on production (§15.16a):
  -- PostgreSQL deletes the parent row before running the referential cascade,
  -- so the content guard fires with the parent already gone, reads a NULL
  -- status and fails closed — which is exactly what it is for, and which made
  -- every draft carrying so much as one question undeletable. Removing the
  -- content while the parent is still present and still a draft lets the guard
  -- evaluate the real status and permit the write. Questions before stimuli:
  -- the stimulus foreign key is ON DELETE RESTRICT.
  delete from teacher_homework_questions where homework_id = p_homework;
  delete from teacher_homework_stimuli where homework_id = p_homework;
  delete from teacher_homework where id = p_homework;
end;
$fn$;

revoke all on function teacher_homework_delete(uuid)         from public, anon, authenticated;
grant execute on function teacher_homework_delete(uuid)      to authenticated;
revoke all on function teacher_homework_create(uuid, text)   from public, anon, authenticated;
revoke all on function teacher_homework_rotate_code(uuid)    from public, anon, authenticated;
grant execute on function teacher_homework_create(uuid, text) to authenticated;
grant execute on function teacher_homework_rotate_code(uuid)  to authenticated;

-- ── 4 · verification ──────────────────────────────────────────────────
do $$
declare v_left text; v_n integer;
begin
  -- 4.1 nothing H4 added survives
  select string_agg(x.n, ', ') into v_left
    from unnest(array['student_attach_homework','teacher_homework_can_open','student_my_homework',
                      'teacher_homework_students','teacher_homework_code_available',
                      'teacher_homework_retired_codes_guard','teacher_homework_attach_attempts_guard',
                      'teacher_homework_code_guard']) as x(n)
   where exists (select 1 from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
                  where ns.nspname = 'public' and p.proname = x.n);
  if v_left is not null then
    raise exception 'rollback H4: functions remain: %', v_left;
  end if;
  select string_agg(c.relname, ', ') into v_left
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relname in ('teacher_homework_retired_codes','teacher_homework_attach_attempts');
  if v_left is not null then
    raise exception 'rollback H4: tables remain: %', v_left;
  end if;

  -- 4.2 THE RESTORED BODIES ARE H3'S, byte for byte. An approximate restore is
  --     the failure mode 20260831e is remembered for.
  if (select md5(p.prosrc) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'teacher_homework_create')
     <> 'c9c6e06c2f8c7978dd3dc871dfd1f13f' then
    raise exception 'rollback H4: teacher_homework_create() was NOT restored to its 20260903b body';
  end if;
  if (select md5(p.prosrc) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'teacher_homework_rotate_code')
     <> '58cedf72a23d0adcaac12ca27fd41c86' then
    raise exception 'rollback H4: teacher_homework_rotate_code() was NOT restored to its 20260903b body';
  end if;
  if (select md5(p.prosrc) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'teacher_homework_delete')
     <> '7f3c8934a08ef9a749717fc2d52ff26a' then
    raise exception 'rollback H4: teacher_homework_delete() was NOT restored to its 20260903b body';
  end if;

  -- 4.3 H2 and the rest of H3 are untouched: six tables, nine policies, and
  --     the fifteen H3 functions still present
  select count(*) into v_n from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname like 'teacher\_homework%' and c.relkind = 'r';
  if v_n <> 6 then
    raise exception 'rollback H4: expected the six H2 tables back, found %', v_n;
  end if;
  select count(*) into v_n from pg_policy p join pg_class c on c.oid = p.polrelid
   where c.relname like 'teacher\_homework%';
  if v_n <> 9 then
    raise exception 'rollback H4: expected 9 H2 policies, found %', v_n;
  end if;
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname like 'teacher\_homework%';
  if v_n <> 22 then
    raise exception 'rollback H4: expected 22 homework functions (7 H2 + 15 H3), found %', v_n;
  end if;

  if (select md5(p.prosrc) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'teacher_homework_is_staff')
     <> '63ef7fa28bf3a0c48bd6658abd11009a' then
    raise exception 'rollback H4: it disturbed teacher_homework_is_staff()';
  end if;

  -- teacher_homework carries H2's ONE trigger again, unchanged. The guard H4
  -- added sat on a table that survives, so failing to remove it would leave a
  -- rollback that looks complete and is not.
  select count(*) into v_n from pg_trigger tg join pg_class c on c.oid = tg.tgrelid
   where c.relname = 'teacher_homework' and not tg.tgisinternal;
  if v_n <> 1 then
    raise exception 'rollback H4: teacher_homework carries % trigger(s); H2 left exactly one', v_n;
  end if;
  if (select pg_get_triggerdef(tg.oid) from pg_trigger tg join pg_class c on c.oid = tg.tgrelid
       where c.relname = 'teacher_homework' and not tg.tgisinternal)
     !~ 'BEFORE DELETE OR UPDATE ON public\.teacher_homework' then
    raise exception 'rollback H4: the trigger left on teacher_homework is not H2''s';
  end if;
  if (select md5(p.prosrc) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'teacher_homework_guard')
     <> '19bbc18c825edce8b3c9a03c75f9fecb' then
    raise exception 'rollback H4: it disturbed teacher_homework_guard()';
  end if;
end $$;

commit;
