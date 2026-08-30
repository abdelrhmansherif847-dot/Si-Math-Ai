-- =====================================================================
-- Workspace creation becomes the platform Owner's alone
-- =====================================================================
-- STATUS: 🟡 PREPARED — NOT APPLIED. Dry-run only.
--         Apply with explicit owner approval, per CLAUDE.md §3.
-- DEPENDS ON: 20260830c (teacher_create_workspace), 20260830h ('teacher')
--
-- WHY
-- ---
-- teacher_create_workspace() is gated `has_role_at_least('admin')`. Measured on
-- production 2026-08-30, THREE accounts satisfy that gate: one `owner` and two
-- `super_admin`. The product decision is that provisioning is the platform
-- Owner's alone, because creating a workspace is what makes an account a
-- Teacher, and "is this account really a teacher?" is a judgement that has no
-- automated answer yet (teacher-intelligence-layer.md §15, open question 7).
--
-- WHY IT CANNOT BE DONE IN THE PAGE
-- ---------------------------------
-- admin.html hides the panel with `data-role-min` and a `role === 'owner'`
-- branch — BOTH of which set element.style.display and nothing else. All 16
-- gated sections work this way. Hiding a card does not stop anyone calling the
-- RPC, so an Owner-only rule that lives only in the page is not a rule. This
-- migration is what makes it true.
--
-- WHAT CHANGES, EXACTLY
-- ---------------------
-- One line of one function:
--
--     -  if not has_role_at_least('admin'::user_role) then
--     +  if current_user_role() <> 'owner'::user_role then
--
-- Everything else in the body is reproduced from 20260830h verbatim. The
-- function keeps its signature, its SECURITY DEFINER, its pinned search_path
-- and its ACL, so nothing else in the system observes a change.
--
-- current_user_role() rather than has_role_at_least('owner') because they are
-- not the same statement: has_role_at_least asks "at least this rung", and
-- there is no rung above owner today — but if one is ever added, the >= form
-- would silently admit it. `= owner` says what is meant.
--
-- WHAT DOES NOT CHANGE
-- --------------------
--   * No platform role is created, renamed or granted. A Teacher is still an
--     account with a workspace, and gets no admin rights of any kind.
--   * RLS is untouched. admins (all three accounts) can still READ
--     teacher_workspaces, workspace_staff, workspace_students and the audit
--     log — those policies carry `OR has_role_at_least('admin')` and are not
--     part of this decision. Only CREATION narrows.
--   * teacher_rotate_join_code, teacher_set_staff_status, teacher_roster and
--     every other workspace RPC keep their existing gates.
--
-- THE COST, STATED
-- ----------------
-- With this applied, if the Owner account is unavailable, nobody can create a
-- class. That is the accepted trade of making provisioning a single person's
-- judgement.
--
-- DEPLOY ORDER IS SAFE IN BOTH DIRECTIONS
-- ---------------------------------------
-- The admin.html panel ships with the static site on merge; this is applied by
-- hand. Before it is applied, the panel is still Owner-only in practice because
-- only the Owner is shown it, and a super_admin calling the RPC directly would
-- succeed — exactly as they can today, so nothing regresses. After it is
-- applied, such a call is refused by the database and the page reports what the
-- server said. Neither order breaks anything.
-- =====================================================================

begin;

create or replace function teacher_create_workspace(p_owner uuid, p_name text)
returns uuid
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_id uuid;
  v_try int := 0;
begin
  -- THE ONE CHANGE. Provisioning is the platform Owner's alone: creating a
  -- workspace is what makes an account a Teacher, and that judgement is not
  -- delegated. `= owner` rather than `>= owner` — see the header.
  if current_user_role() <> 'owner'::user_role then
    raise exception 'teacher_create_workspace: platform owner only' using errcode = '42501';
  end if;
  if p_owner is null or not exists (select 1 from auth.users u where u.id = p_owner) then
    raise exception 'teacher_create_workspace: unknown owner' using errcode = '22000';
  end if;

  loop
    v_try := v_try + 1;
    begin
      insert into teacher_workspaces (owner_id, name, student_join_code, staff_join_code, created_by)
      values (p_owner, btrim(p_name), workspace_new_code(), workspace_new_code(), auth.uid())
      returning id into v_id;
      exit;
    exception when unique_violation then
      if v_try >= 5 then raise; end if;   -- code collision; try another pair
    end;
  end loop;

  insert into workspace_staff (workspace_id, user_id, staff_role, status, activated_at, activated_by)
  values (v_id, p_owner, 'teacher', 'active', now(), auth.uid());

  insert into workspace_audit_log (workspace_id, actor_id, action, subject_id, meta)
  values (v_id, auth.uid(), 'workspace_created', p_owner, jsonb_build_object('name', btrim(p_name)));

  return v_id;
end;
$$;

comment on function teacher_create_workspace(uuid, text) is
  'Creates a teaching workspace for an existing account and makes that account '
  'its active teacher, minting both join codes. PLATFORM OWNER ONLY. Creating '
  'the workspace is what grants the teaching relationship — no user_role is '
  'written and no admin right is granted.';

-- ── privileges restated, not widened ─────────────────────────────────────
-- create or replace preserves the ACL, so these change nothing. Authorization
-- is inside the body, never in who may call it (20260830b's rule).
revoke all on function teacher_create_workspace(uuid, text) from public, anon, authenticated;
grant execute on function teacher_create_workspace(uuid, text) to authenticated;

commit;
