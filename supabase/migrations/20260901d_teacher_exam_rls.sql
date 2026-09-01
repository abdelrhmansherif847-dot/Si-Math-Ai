-- =====================================================================
-- Teacher Exams, increment 3b.2 — RLS, grants, and the answer-key boundary
-- =====================================================================
-- STATUS: 🟢 APPLIED 2026-09-01 as version 20260901161844.
--
-- Verified live: 9 policies, all SELECT; SELECT-only for authenticated on all
-- six tables; anon holds nothing anywhere; no client role holds any write
-- privilege. Acting as the real signed-in student, teacher_exam_questions
-- returned ZERO rows while their own access row, sitting and answers returned
-- one each — so the answer-key boundary is measured, not asserted.
--
-- Same discipline as 20260830b: RLS on, table privileges STRIPPED and granted
-- back deliberately, SELECT only for clients. A policy filters rows a role may
-- already touch, so the revoke is what makes the grant mean anything.
--
-- After this migration every one of the six tables is readable by exactly the
-- people who should read it and WRITABLE BY NOBODY. There is no INSERT,
-- UPDATE or DELETE grant to any client role, and no RPC exists yet. That is
-- not an oversight — it is the whole point of splitting 3b from 3c: the
-- boundary is provable before anything can write through it.
--
-- THE ONE BOUNDARY THAT MATTERS MOST
-- ----------------------------------
-- teacher_exam_questions.correct_answer must never reach a student. It is
-- protected three times over, and each layer is independently sufficient:
--   1. no student-facing policy exists on that table at all;
--   2. clients hold SELECT only, so even a policy mistake cannot let them write;
--   3. 3e's start RPC will select a NAMED COLUMN LIST that omits it, exactly
--      as exam_start() already does for platform papers.
-- Locked decision 3 goes further: students never see the answer key or the
-- explanation, not even after submitting.
-- =====================================================================

begin;

-- ── 1 · one authority for "is the caller staff of this exam's workspace" ──
-- SECURITY DEFINER because it reads teacher_exams, which is itself under RLS:
-- a policy on teacher_exams that called a non-definer function selecting from
-- teacher_exams would recurse. It is a policy helper, not an API, but clients
-- must be able to execute it because policies evaluate as the calling user —
-- the same reason workspace_is_active_staff() is granted to authenticated.
create or replace function teacher_exam_is_staff(p_exam uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $fn$
  select exists (
    select 1 from teacher_exams e
     where e.id = p_exam
       and workspace_is_active_staff(e.workspace_id)
  );
$fn$;

revoke all on function teacher_exam_is_staff(uuid) from public, anon, authenticated;
grant execute on function teacher_exam_is_staff(uuid) to authenticated, service_role;

comment on function teacher_exam_is_staff(uuid) is
  'Is the caller ACTIVE staff of the workspace that owns this exam? Teacher and '
  'active assistant alike — academic parity is a locked decision, so this is '
  'role-blind on purpose and must stay that way. It is the single authority '
  'behind every staff-side policy below.';

-- ── 2 · RLS on, privileges stripped ───────────────────────────────────
alter table teacher_exams          enable row level security;
alter table teacher_exam_stimuli   enable row level security;
alter table teacher_exam_questions enable row level security;
alter table teacher_exam_access    enable row level security;
alter table teacher_exam_attempts  enable row level security;
alter table teacher_exam_responses enable row level security;

revoke all on table teacher_exams          from anon, authenticated;
revoke all on table teacher_exam_stimuli   from anon, authenticated;
revoke all on table teacher_exam_questions from anon, authenticated;
revoke all on table teacher_exam_access    from anon, authenticated;
revoke all on table teacher_exam_attempts  from anon, authenticated;
revoke all on table teacher_exam_responses from anon, authenticated;

-- SELECT only, and only for a signed-in user. anon gets nothing anywhere.
grant select on table teacher_exams          to authenticated;
grant select on table teacher_exam_stimuli   to authenticated;
grant select on table teacher_exam_questions to authenticated;
grant select on table teacher_exam_access    to authenticated;
grant select on table teacher_exam_attempts  to authenticated;
grant select on table teacher_exam_responses to authenticated;

-- ── 3 · policies ──────────────────────────────────────────────────────

-- 3.1 · the paper. Staff of its workspace, and platform admins.
-- Students are deliberately absent: what a student needs to SEE about an exam
-- (its title, its duration, whether they may sit it) is shaped by 3d's RPC,
-- which can answer without handing over the row. Locked: students have no
-- direct content reads.
create policy teacher_exams_staff_read on teacher_exams
  for select to authenticated
  using (workspace_is_active_staff(workspace_id) or has_role_at_least('admin'::user_role));

-- 3.2 · content. Staff and admins ONLY — no student policy exists, and one
-- must never be added: teacher_exam_questions carries correct_answer.
create policy teacher_exam_stimuli_staff_read on teacher_exam_stimuli
  for select to authenticated
  using (teacher_exam_is_staff(exam_id) or has_role_at_least('admin'::user_role));

create policy teacher_exam_questions_staff_read on teacher_exam_questions
  for select to authenticated
  using (teacher_exam_is_staff(exam_id) or has_role_at_least('admin'::user_role));

-- 3.3 · access. Staff see the queue for their exam; a student sees their OWN
-- request and no one else's. The queue cannot be served from
-- workspace_audit_log instead, because that table's policy is
-- workspace_is_owner() — an assistant cannot read it, and assistants have
-- approval parity. So this policy is load-bearing, not convenience.
create policy teacher_exam_access_staff_read on teacher_exam_access
  for select to authenticated
  using (teacher_exam_is_staff(exam_id) or has_role_at_least('admin'::user_role));

create policy teacher_exam_access_own_read on teacher_exam_access
  for select to authenticated
  using (student_id = auth.uid());

-- 3.4 · sittings. The student's own, plus staff of the exam — which is the one
-- shape with no platform analogue, because platform papers have no teacher.
create policy teacher_exam_attempts_own_read on teacher_exam_attempts
  for select to authenticated
  using (user_id = auth.uid());

create policy teacher_exam_attempts_staff_read on teacher_exam_attempts
  for select to authenticated
  using (teacher_exam_is_staff(exam_id) or has_role_at_least('admin'::user_role));

create policy teacher_exam_responses_own_read on teacher_exam_responses
  for select to authenticated
  using (exists (select 1 from teacher_exam_attempts a
                  where a.id = teacher_exam_responses.attempt_id
                    and a.user_id = auth.uid()));

create policy teacher_exam_responses_staff_read on teacher_exam_responses
  for select to authenticated
  using (exists (select 1 from teacher_exam_attempts a
                  where a.id = teacher_exam_responses.attempt_id
                    and (teacher_exam_is_staff(a.exam_id)
                         or has_role_at_least('admin'::user_role))));

-- ── 4 · verification ──────────────────────────────────────────────────
-- Every assertion below names what would breach it, so each one could go red.
do $$
declare
  v_bad text;
  v_n   integer;
  TE constant text[] := array['teacher_exams', 'teacher_exam_stimuli', 'teacher_exam_questions',
                              'teacher_exam_access', 'teacher_exam_attempts', 'teacher_exam_responses'];
begin
  -- 4.1 RLS is on everywhere. A table with policies but RLS off is wide open.
  select string_agg(c.relname, ', ') into v_bad
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = any (TE) and not c.relrowsecurity;
  if v_bad is not null then
    raise exception '3b.2: RLS is not enabled on %', v_bad;
  end if;

  -- 4.2 all six tables exist (so 4.1 cannot pass by matching nothing)
  select count(*) into v_n from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = any (TE) and c.relkind = 'r';
  if v_n <> 6 then
    raise exception '3b.2: expected 6 teacher-exam tables, found %', v_n;
  end if;

  -- 4.3 NO client write privilege anywhere. This is the central claim of 3b.
  select string_agg(distinct g.table_name || '.' || g.privilege_type || '->' || g.grantee, ', ')
    into v_bad
    from information_schema.role_table_grants g
   where g.table_schema = 'public' and g.table_name = any (TE)
     and g.grantee in ('anon', 'authenticated')
     and g.privilege_type <> 'SELECT';
  if v_bad is not null then
    raise exception '3b.2: a client role holds a write privilege: %', v_bad;
  end if;

  -- 4.4 anon holds nothing at all, not even SELECT
  select string_agg(distinct g.table_name, ', ') into v_bad
    from information_schema.role_table_grants g
   where g.table_schema = 'public' and g.table_name = any (TE) and g.grantee = 'anon';
  if v_bad is not null then
    raise exception '3b.2: anon can read %', v_bad;
  end if;

  -- 4.5 authenticated CAN read all six (or 4.3/4.4 would pass vacuously)
  select count(distinct g.table_name) into v_n
    from information_schema.role_table_grants g
   where g.table_schema = 'public' and g.table_name = any (TE)
     and g.grantee = 'authenticated' and g.privilege_type = 'SELECT';
  if v_n <> 6 then
    raise exception '3b.2: authenticated can read only % of 6 tables', v_n;
  end if;

  -- 4.6 THE ANSWER KEY. No policy on the questions table may mention a
  -- student-shaped predicate. Staff and admin only, by construction.
  select string_agg(p.polname, ', ') into v_bad
    from pg_policy p join pg_class c on c.oid = p.polrelid
   where c.relname = 'teacher_exam_questions'
     and pg_get_expr(p.polqual, p.polrelid) !~ 'teacher_exam_is_staff|has_role_at_least';
  if v_bad is not null then
    raise exception '3b.2: a non-staff policy exists on teacher_exam_questions: %', v_bad;
  end if;

  -- 4.7 every policy is SELECT. A write policy without a write grant is inert
  -- today and a loaded gun the moment someone grants INSERT.
  select string_agg(c.relname || '.' || p.polname, ', ') into v_bad
    from pg_policy p join pg_class c on c.oid = p.polrelid
   where c.relname = any (TE) and p.polcmd <> 'r';
  if v_bad is not null then
    raise exception '3b.2: a non-SELECT policy exists: %', v_bad;
  end if;

  -- 4.8 the staff helper is role-blind. If it ever grew a staff_role test,
  -- assistant parity would be gone and nothing else would notice.
  if (select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'teacher_exam_is_staff') ~ 'staff_role' then
    raise exception '3b.2: teacher_exam_is_staff() tests staff_role — assistant parity is locked';
  end if;
end $$;

commit;
