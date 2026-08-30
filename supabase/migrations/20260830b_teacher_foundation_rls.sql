-- =====================================================================
-- Teacher & Assistant Foundation · 2 of 4 — predicates and every policy
-- =====================================================================
-- STATUS: ✅ APPLIED 2026-08-30 to igvkyxkmjnkzscqgommj with explicit owner
--         approval, recorded as schema_migrations version 20260830183010
--         `teacher_foundation_rls`. Revision 1. Applied body differed only in
--         header text and the omitted outer transaction (see 20260830a).
--         Verified after apply: `anon` holds NO privilege of any kind on the
--         four tables, `authenticated` holds SELECT only, four SELECT policies
--         exist and zero write policies, and teacher_can_see_student() guards
--         no table outside this system.
-- DEPENDS ON: 20260830a (enums, tables, guards, RLS enabled with no policy)
--
-- WHAT THIS OPENS
-- ---------------
-- Reads, and only reads. There is NO insert, update or delete policy on any of
-- the four tables, and the SQL privileges below withhold those verbs from
-- `authenticated` outright — so a client write does not fail a policy check,
-- it fails before one is considered. Every mutation in this system goes
-- through a named SECURITY DEFINER RPC in 20260830c, because every one of them
-- has a cross-row invariant (resolve a code, write an audit row, refuse if the
-- caller is staff) that a WITH CHECK cannot express.
--
-- THE ONE PREDICATE THAT MATTERS
-- ------------------------------
-- teacher_can_see_student(uuid) is the single derivation of teacher visibility
-- in the entire platform:
--
--     an ACTIVE staff row  ->  in a workspace  ->  with an ACTIVE, unexpired
--     link  ->  to THAT student
--
-- Everything a teacher will ever be allowed to see must route through it. It
-- is defined now, while it guards nothing, so that the first feature that needs
-- it cannot invent a second, looser answer to the same question.
--
-- IT IS DELIBERATELY UNUSED IN THIS PHASE. No academic table gains a policy
-- here — not question_records, not mastery_records, not weakness_*, not
-- focus_*, not exam_*, not profiles. T1 ships identity and consent with no
-- analytics at all (docs/roadmap/teacher-intelligence-layer.md §10), and
-- tests/teacher-access-scope.test.mjs fails the build if a teacher predicate
-- appears on a student's academic tables.
--
-- WHY THE HELPERS ARE SECURITY DEFINER
-- ------------------------------------
-- A policy on workspace_staff that consulted workspace_staff through RLS would
-- recurse. A definer helper reads the row as the table owner, returns a
-- boolean about the CALLER and nothing else, and terminates. Each is pinned to
-- `search_path = pg_catalog, public` so an unqualified name inside it cannot be
-- resolved through a caller-controlled path.
--
-- PRIVILEGE MODEL — STATED PER FUNCTION, NEVER INHERITED
-- -----------------------------------------------------
-- This project has a DEFAULT ACL for functions in `public` granting EXECUTE to
-- anon and authenticated, so a new function is callable by anyone logged in
-- unless revoked. 20260804_streak_server_side_revoke_anon.sql and revision 3 of
-- 20260815b are both records of getting this wrong, in opposite directions. So:
-- revoke from public, anon, authenticated — then grant back deliberately.
-- All three helpers ARE granted to authenticated, because a policy expression
-- is evaluated as the calling user and an ungranted helper turns every read
-- into 42501.
-- =====================================================================

begin;

-- ── 1 · predicates ───────────────────────────────────────────────────────

create or replace function workspace_is_active_staff(p_workspace uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
      from workspace_staff s
      join teacher_workspaces w on w.id = s.workspace_id
     where s.workspace_id = p_workspace
       and s.user_id = auth.uid()
       and s.status = 'active'
       and w.is_active
  );
$$;

comment on function workspace_is_active_staff(uuid) is
  'True when the caller is active staff (owner or assistant) of an active '
  'workspace. Returns a fact about the CALLER only.';

create or replace function workspace_is_owner(p_workspace uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
      from teacher_workspaces w
     where w.id = p_workspace
       and w.owner_id = auth.uid()
       and w.is_active
  );
$$;

comment on function workspace_is_owner(uuid) is
  'True when the caller owns the workspace. The owner is the teacher; '
  'assistants never satisfy this.';

-- THE predicate. Read the header before widening it.
create or replace function teacher_can_see_student(p_student uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
      from workspace_students ws
      join workspace_staff st on st.workspace_id = ws.workspace_id
      join teacher_workspaces w on w.id = ws.workspace_id
     where ws.student_id = p_student
       and ws.status = 'active'
       and (ws.expires_at is null or ws.expires_at > now())
       and st.user_id = auth.uid()
       and st.status = 'active'
       and w.is_active
  );
$$;

comment on function teacher_can_see_student(uuid) is
  'The single derivation of teacher visibility: active staff -> shared '
  'workspace -> active, unexpired link -> this student. Every future '
  'teacher-facing read must route through this and nothing else. Guards no '
  'academic table in this phase, by design (T1).';

revoke all on function workspace_is_active_staff(uuid) from public, anon, authenticated;
revoke all on function workspace_is_owner(uuid)        from public, anon, authenticated;
revoke all on function teacher_can_see_student(uuid)   from public, anon, authenticated;

grant execute on function workspace_is_active_staff(uuid) to authenticated;
grant execute on function workspace_is_owner(uuid)        to authenticated;
grant execute on function teacher_can_see_student(uuid)   to authenticated;

-- ── 2 · table privileges — the verbs a client may even attempt ───────────
-- SELECT only. Withholding INSERT/UPDATE/DELETE at the privilege level means a
-- client write is refused before RLS is consulted, which is stronger than
-- having no policy for it. service_role keeps its defaults; the definer RPCs
-- run as owner and are unaffected.
--
-- THIS REVOKE IS LOAD-BEARING, and the apply of 20260830a proved it. Measured
-- between the two migrations, `anon` and `authenticated` each held
-- DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE on all four
-- brand-new tables — the same DEFAULT ACL trap the function grants have, one
-- level up. In that window the tables were closed by RLS alone (enabled, zero
-- policies, so deny-all), which is why 20260830a is safe to apply on its own.
-- But a future table added without this revoke would be one permissive policy
-- away from a client-writable roster.

revoke all on table teacher_workspaces  from anon, authenticated;
revoke all on table workspace_staff     from anon, authenticated;
revoke all on table workspace_students  from anon, authenticated;
revoke all on table workspace_audit_log from anon, authenticated;

grant select on table teacher_workspaces  to authenticated;
grant select on table workspace_staff     to authenticated;
grant select on table workspace_students  to authenticated;
grant select on table workspace_audit_log to authenticated;

-- ── 3 · policies ─────────────────────────────────────────────────────────
-- Staff branches use has_role_at_least('admin'), the security-definer helper
-- the platform standardised on. The legacy inline
-- `exists (select 1 from profiles where id = auth.uid() and is_admin)` form is
-- not copied: it re-reads a table RLS is already evaluating and drifts from the
-- role enum.

-- teacher_workspaces: visible to its own staff, and to admins.
-- Students do NOT read this table — they see their teachers through
-- student_my_teachers() in 20260830c, which returns a named column list.
create policy teacher_workspaces_staff_read on teacher_workspaces
  for select to authenticated
  using (workspace_is_active_staff(id) or has_role_at_least('admin'::user_role));

-- workspace_staff: your own row (so a pending assistant can see they are
-- pending), every row of a workspace you are active staff of, and admins.
create policy workspace_staff_read on workspace_staff
  for select to authenticated
  using (
    user_id = auth.uid()
    or workspace_is_active_staff(workspace_id)
    or has_role_at_least('admin'::user_role)
  );

-- workspace_students: the student always sees their own links — §8.2 principle
-- 5, nothing about a student that the student cannot see. Staff see the roster
-- of their own workspace. Admins see all.
create policy workspace_students_read on workspace_students
  for select to authenticated
  using (
    student_id = auth.uid()
    or workspace_is_active_staff(workspace_id)
    or has_role_at_least('admin'::user_role)
  );

-- workspace_audit_log: the owner of the workspace, and admins. An assistant
-- does not read the audit trail of the workspace they work in.
create policy workspace_audit_owner_read on workspace_audit_log
  for select to authenticated
  using (workspace_is_owner(workspace_id) or has_role_at_least('admin'::user_role));

commit;
