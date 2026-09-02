-- =====================================================================
-- Teacher Homework, increment H2.2 — RLS, grants, and the answer-key boundary
-- =====================================================================
-- STATUS: 🟡 PREPARED, not applied. Apply only with explicit owner approval
--         (CLAUDE.md §3), and only together with 20260902b. Rollback: 20260902y.
--
-- Same discipline as 20260901d: RLS on, table privileges STRIPPED and granted
-- back deliberately, SELECT only for clients, anon nothing anywhere. After this
-- migration every one of the five tables is readable by exactly the people who
-- should read it and WRITABLE BY NOBODY: no INSERT, UPDATE or DELETE grant to
-- any client role, and no RPC exists yet.
--
-- THE ONE BOUNDARY THAT MATTERS MOST
-- ----------------------------------
-- teacher_homework_questions.correct_answer must never reach a student
-- through a table read. It is protected three times over: no student-facing
-- policy on the questions or stimuli tables; clients hold SELECT only; H5's
-- open RPC will select a NAMED COLUMN LIST that omits it. Decision 1 then
-- decides, per homework and only after submission, whether the RPC reveals it.
-- =====================================================================

begin;

-- ── 1 · one authority for "is the caller staff of this homework's class" ──
-- SECURITY DEFINER because it reads teacher_homework, which is itself under
-- RLS. Role-blind: teacher and active assistant alike (decision 5).
create or replace function teacher_homework_is_staff(p_homework uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $fn$
  select exists (
    select 1 from teacher_homework h
     where h.id = p_homework
       and workspace_is_active_staff(h.workspace_id)
  );
$fn$;

revoke all on function teacher_homework_is_staff(uuid) from public, anon, authenticated;
grant execute on function teacher_homework_is_staff(uuid) to authenticated, service_role;

comment on function teacher_homework_is_staff(uuid) is
  'Is the caller ACTIVE staff of the workspace that owns this homework? '
  'Teacher and active assistant alike — parity is a locked decision, so this '
  'is role-blind on purpose and must stay that way.';

-- ── 2 · RLS on, privileges stripped ───────────────────────────────────
alter table teacher_homework           enable row level security;
alter table teacher_homework_stimuli   enable row level security;
alter table teacher_homework_questions enable row level security;
alter table teacher_homework_access    enable row level security;
alter table teacher_homework_attempts  enable row level security;

revoke all on table teacher_homework           from anon, authenticated;
revoke all on table teacher_homework_stimuli   from anon, authenticated;
revoke all on table teacher_homework_questions from anon, authenticated;
revoke all on table teacher_homework_access    from anon, authenticated;
revoke all on table teacher_homework_attempts  from anon, authenticated;

grant select on table teacher_homework           to authenticated;
grant select on table teacher_homework_stimuli   to authenticated;
grant select on table teacher_homework_questions to authenticated;
grant select on table teacher_homework_access    to authenticated;
grant select on table teacher_homework_attempts  to authenticated;

-- ── 3 · policies ──────────────────────────────────────────────────────

-- 3.1 · the paper. Staff of its workspace, and platform admins. Students are
-- deliberately absent: what a student needs to SEE about a homework (title,
-- due date, whether they may open it) is shaped by H4's RPC.
create policy teacher_homework_staff_read on teacher_homework
  for select to authenticated
  using (workspace_is_active_staff(workspace_id) or has_role_at_least('admin'::user_role));

-- 3.2 · content. Staff and admins ONLY — no student policy exists, and one
-- must never be added: teacher_homework_questions carries correct_answer.
create policy teacher_homework_stimuli_staff_read on teacher_homework_stimuli
  for select to authenticated
  using (teacher_homework_is_staff(homework_id) or has_role_at_least('admin'::user_role));

create policy teacher_homework_questions_staff_read on teacher_homework_questions
  for select to authenticated
  using (teacher_homework_is_staff(homework_id) or has_role_at_least('admin'::user_role));

-- 3.3 · attachments. Staff see who attached; a student sees their OWN row.
create policy teacher_homework_access_staff_read on teacher_homework_access
  for select to authenticated
  using (teacher_homework_is_staff(homework_id) or has_role_at_least('admin'::user_role));

create policy teacher_homework_access_own_read on teacher_homework_access
  for select to authenticated
  using (student_id = auth.uid());

-- 3.4 · attempts. The student's own, plus staff of the homework.
create policy teacher_homework_attempts_own_read on teacher_homework_attempts
  for select to authenticated
  using (user_id = auth.uid());

create policy teacher_homework_attempts_staff_read on teacher_homework_attempts
  for select to authenticated
  using (teacher_homework_is_staff(homework_id) or has_role_at_least('admin'::user_role));

-- ── 4 · verification ──────────────────────────────────────────────────
-- Every assertion below names what would breach it, so each one could go red.
do $$
declare
  v_bad text;
  v_n   integer;
  TH constant text[] := array['teacher_homework', 'teacher_homework_stimuli', 'teacher_homework_questions',
                              'teacher_homework_access', 'teacher_homework_attempts'];
begin
  -- 4.1 RLS is on everywhere.
  select string_agg(c.relname, ', ') into v_bad
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = any (TH) and not c.relrowsecurity;
  if v_bad is not null then
    raise exception 'H2.2: RLS is not enabled on %', v_bad;
  end if;

  -- 4.2 all five tables exist (so 4.1 cannot pass by matching nothing)
  select count(*) into v_n from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = any (TH) and c.relkind = 'r';
  if v_n <> 5 then
    raise exception 'H2.2: expected 5 teacher-homework tables, found %', v_n;
  end if;

  -- 4.3 NO client write privilege anywhere.
  select string_agg(distinct g.table_name || '.' || g.privilege_type || '->' || g.grantee, ', ')
    into v_bad
    from information_schema.role_table_grants g
   where g.table_schema = 'public' and g.table_name = any (TH)
     and g.grantee in ('anon', 'authenticated')
     and g.privilege_type <> 'SELECT';
  if v_bad is not null then
    raise exception 'H2.2: a client role holds a write privilege: %', v_bad;
  end if;

  -- 4.4 anon holds nothing at all
  select string_agg(distinct g.table_name, ', ') into v_bad
    from information_schema.role_table_grants g
   where g.table_schema = 'public' and g.table_name = any (TH) and g.grantee = 'anon';
  if v_bad is not null then
    raise exception 'H2.2: anon can read %', v_bad;
  end if;

  -- 4.5 authenticated CAN read all five
  select count(distinct g.table_name) into v_n
    from information_schema.role_table_grants g
   where g.table_schema = 'public' and g.table_name = any (TH)
     and g.grantee = 'authenticated' and g.privilege_type = 'SELECT';
  if v_n <> 5 then
    raise exception 'H2.2: authenticated can read only % of 5 tables', v_n;
  end if;

  -- 4.6 THE ANSWER KEY. Every policy on the questions OR stimuli table must
  -- route through the staff helper, and none may mention the caller's own id.
  -- Both halves matter: a student-shaped predicate that ALSO named
  -- has_role_at_least() would slip past a test that only asked whether a
  -- staff word was present, so this asks the question from both sides.
  select string_agg(c.relname || '.' || p.polname, ', ') into v_bad
    from pg_policy p join pg_class c on c.oid = p.polrelid
   where c.relname in ('teacher_homework_questions', 'teacher_homework_stimuli')
     and (pg_get_expr(p.polqual, p.polrelid) !~ 'teacher_homework_is_staff'
          or pg_get_expr(p.polqual, p.polrelid) ~ 'auth\.uid');
  if v_bad is not null then
    raise exception 'H2.2: a non-staff policy exists on content: %', v_bad;
  end if;

  -- 4.7 every policy is SELECT.
  select string_agg(c.relname || '.' || p.polname, ', ') into v_bad
    from pg_policy p join pg_class c on c.oid = p.polrelid
   where c.relname = any (TH) and p.polcmd <> 'r';
  if v_bad is not null then
    raise exception 'H2.2: a non-SELECT policy exists: %', v_bad;
  end if;

  -- 4.8 exactly seven policies, so 4.6/4.7 cannot pass on an empty set
  select count(*) into v_n from pg_policy p join pg_class c on c.oid = p.polrelid where c.relname = any (TH);
  if v_n <> 7 then
    raise exception 'H2.2: expected 7 policies, found %', v_n;
  end if;

  -- 4.9 the staff helper is role-blind (decision 5).
  if (select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'teacher_homework_is_staff') ~ 'staff_role' then
    raise exception 'H2.2: teacher_homework_is_staff() tests staff_role — assistant parity is locked';
  end if;
end $$;

commit;
