-- =====================================================================
-- Teacher & Assistant Foundation · 3 of 4 — every write, and the read surface
-- =====================================================================
-- STATUS: ✅ APPLIED 2026-08-30 to igvkyxkmjnkzscqgommj with explicit owner
--         approval, recorded as schema_migrations version 20260830183143
--         `teacher_foundation_rpcs`. Revision 1. Applied body differed only in
--         header text and the omitted outer transaction (see 20260830a).
--         Verified after apply: all 11 functions are SECURITY DEFINER with
--         search_path pinned, `anon` can execute none of them, `authenticated`
--         can execute all 11. End-to-end flow proven under simulated JWTs —
--         docs/engineering/teacher-foundation-verification.md.
-- DEPENDS ON: 20260830a (tables, guards), 20260830b (predicates, policies)
--
-- WHY EVERY MUTATION IS AN RPC
-- ----------------------------
-- 20260830b grants clients SELECT and nothing else, so there is no client
-- write path to withhold — there was never one. Each mutation below has an
-- invariant a WITH CHECK cannot express: resolve a join code without exposing
-- the code table, refuse a caller who is staff in the same workspace, and
-- write the audit row in the SAME transaction as the change it describes. An
-- audit trail written by a second statement the client could skip is not an
-- audit trail.
--
-- THE READ SURFACE IS A COLUMN LIST, NOT A POLICY
-- -----------------------------------------------
-- teacher_roster() and teacher_student_card() are the ONLY way a teacher sees
-- anything about a student, and they name their columns:
--
--     student_id, full_name, exam_type, joined_at, status
--
-- That is the entire approved surface for this phase. What is missing is the
-- design:
--   * NO email. A teacher does not need an address to teach someone, and
--     handing one over turns a roster into a contact list.
--   * NO plan_code, credits_balance, is_founder, xp, rank. Direction record
--     §8.4 — a teacher must never see which student's family can afford what.
--   * NO academic anything. No mastery, no weakness, no question history, no
--     exam results, no streak. T1 is identity and consent (§10); insights
--     arrive later, through teacher_can_see_student(), with their evidence
--     attached (§6.3).
-- Adding a column here is therefore a deliberate, reviewable act rather than a
-- side effect of widening a policy — which is the whole reason the read is
-- shaped like this. tests/teacher-access-scope.test.mjs asserts the list.
--
-- RE-JOINING AFTER REMOVAL — a recorded trade-off
-- -----------------------------------------------
-- A link ended by the student ('revoked') can be restored by the student.
-- A link ended by the teacher ('removed') can ALSO be restored, but only by the
-- student entering the join code again — a fresh act of consent, with a code
-- the teacher controls and can rotate. The alternative (a teacher-side
-- restore) was rejected because it would re-open access to a student's data
-- without the student doing anything. A teacher who wants someone to stay off
-- the roster rotates the code.
--
-- PRIVILEGE MODEL
-- ---------------
-- Same rule as 20260830b: revoke from public, anon, authenticated, then grant
-- to authenticated deliberately. Authorization lives INSIDE each function
-- (owner check, admin check, guard trigger), never in who may call it.
-- =====================================================================

begin;

-- ── 1 · workspace creation — admin only, deliberately ────────────────────
-- Self-serve creation is not shipped, because "is this account really a
-- teacher?" is open question 7 in docs/roadmap/teacher-intelligence-layer.md
-- §15 and answering it here by accident would let any account start collecting
-- student grants. Until that question is answered by a person, a person
-- creates the workspace.

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
  if not has_role_at_least('admin'::user_role) then
    raise exception 'teacher_create_workspace: admin only' using errcode = '42501';
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
  values (v_id, p_owner, 'owner', 'active', now(), auth.uid());

  insert into workspace_audit_log (workspace_id, actor_id, action, subject_id, meta)
  values (v_id, auth.uid(), 'workspace_created', p_owner, jsonb_build_object('name', btrim(p_name)));

  return v_id;
end;
$$;

-- ── 2 · join codes ───────────────────────────────────────────────────────

create or replace function teacher_rotate_join_code(p_workspace uuid, p_kind text)
returns text
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_code text;
begin
  if not workspace_is_owner(p_workspace) then
    raise exception 'teacher_rotate_join_code: workspace owner only' using errcode = '42501';
  end if;
  if p_kind not in ('student', 'staff') then
    raise exception 'teacher_rotate_join_code: kind must be student or staff' using errcode = '22000';
  end if;

  v_code := workspace_new_code();
  if p_kind = 'student' then
    update teacher_workspaces set student_join_code = v_code where id = p_workspace;
  else
    update teacher_workspaces set staff_join_code = v_code where id = p_workspace;
  end if;

  insert into workspace_audit_log (workspace_id, actor_id, action, meta)
  values (p_workspace, auth.uid(), 'join_code_rotated', jsonb_build_object('kind', p_kind));

  return v_code;
end;
$$;

-- ── 3 · the student side — consent, and withdrawing it ───────────────────

create or replace function student_join_workspace(p_code text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  w teacher_workspaces%rowtype;
  v_norm text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
begin
  if auth.uid() is null then
    raise exception 'student_join_workspace: sign in first' using errcode = '42501';
  end if;

  select * into w from teacher_workspaces where student_join_code = v_norm and is_active;
  if not found then
    -- One message for "wrong code" and "inactive workspace" on purpose: the
    -- difference is not the student's business and telling them turns this
    -- into an oracle for which codes exist.
    raise exception 'student_join_workspace: that code did not match a class' using errcode = '22023';
  end if;

  -- The guard in 20260830a re-checks the consent rule; this is the friendly
  -- message for the same refusal.
  if exists (select 1 from workspace_staff s
             where s.workspace_id = w.id and s.user_id = auth.uid() and s.status <> 'removed') then
    raise exception 'student_join_workspace: you are staff in this class' using errcode = '22000';
  end if;

  insert into workspace_students (workspace_id, student_id, status)
  values (w.id, auth.uid(), 'active')
  on conflict (workspace_id, student_id) do update
    set status = 'active'
  where workspace_students.status <> 'active';

  insert into workspace_audit_log (workspace_id, actor_id, action, subject_id)
  values (w.id, auth.uid(), 'student_joined', auth.uid());

  return jsonb_build_object('workspace_id', w.id, 'name', w.name);
end;
$$;

create or replace function student_leave_workspace(p_workspace uuid)
returns void
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
begin
  -- The WHERE clause is the authorization: a student can only ever reach their
  -- own row, and the guard refuses a 'revoked' written by anyone else.
  update workspace_students
     set status = 'revoked'
   where workspace_id = p_workspace
     and student_id = auth.uid()
     and status = 'active';

  if not found then
    raise exception 'student_leave_workspace: no active link to end' using errcode = '22023';
  end if;

  insert into workspace_audit_log (workspace_id, actor_id, action, subject_id)
  values (p_workspace, auth.uid(), 'student_left', auth.uid());
end;
$$;

-- What the student sees about who can see them. §8.2 principle 5.
create or replace function student_my_teachers()
returns table (
  workspace_id uuid,
  workspace_name text,
  teacher_name text,
  joined_at timestamptz,
  status workspace_link_status
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select w.id, w.name, coalesce(p.full_name, 'Teacher'), ws.joined_at, ws.status
    from workspace_students ws
    join teacher_workspaces w on w.id = ws.workspace_id
    left join profiles p on p.id = w.owner_id
   where ws.student_id = auth.uid()
   order by (ws.status = 'active') desc, ws.joined_at desc;
$$;

-- ── 4 · the assistant side ───────────────────────────────────────────────

create or replace function staff_join_workspace(p_code text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  w teacher_workspaces%rowtype;
  v_norm text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
begin
  if auth.uid() is null then
    raise exception 'staff_join_workspace: sign in first' using errcode = '42501';
  end if;

  select * into w from teacher_workspaces where staff_join_code = v_norm and is_active;
  if not found then
    raise exception 'staff_join_workspace: that code did not match a class' using errcode = '22023';
  end if;

  -- Arrives pending and sees nothing until the owner activates it. A leaked
  -- staff code therefore grants no visibility of any student by itself.
  insert into workspace_staff (workspace_id, user_id, staff_role, status)
  values (w.id, auth.uid(), 'assistant', 'pending')
  on conflict (workspace_id, user_id) do nothing;

  insert into workspace_audit_log (workspace_id, actor_id, action, subject_id)
  values (w.id, auth.uid(), 'staff_joined', auth.uid());

  return jsonb_build_object('workspace_id', w.id, 'name', w.name, 'status', 'pending');
end;
$$;

create or replace function teacher_set_staff_status(p_staff uuid, p_status workspace_staff_status)
returns void
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_ws uuid;
  v_user uuid;
begin
  select workspace_id, user_id into v_ws, v_user from workspace_staff where id = p_staff;
  if v_ws is null then
    raise exception 'teacher_set_staff_status: no such staff row' using errcode = '22023';
  end if;
  if not workspace_is_owner(v_ws) then
    raise exception 'teacher_set_staff_status: workspace owner only' using errcode = '42501';
  end if;
  if p_status not in ('active', 'removed') then
    raise exception 'teacher_set_staff_status: status must be active or removed' using errcode = '22000';
  end if;

  update workspace_staff set status = p_status where id = p_staff;

  insert into workspace_audit_log (workspace_id, actor_id, action, subject_id)
  values (v_ws, auth.uid(),
          case when p_status = 'active' then 'staff_activated'::workspace_audit_action
               else 'staff_removed'::workspace_audit_action end,
          v_user);
end;
$$;

-- ── 5 · the teacher side ─────────────────────────────────────────────────

create or replace function teacher_remove_student(p_workspace uuid, p_student uuid)
returns void
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
begin
  -- Owner only. An assistant works with the roster; they do not change who is
  -- on it. The guard enforces the same rule a second time on the row itself.
  if not workspace_is_owner(p_workspace) then
    raise exception 'teacher_remove_student: workspace owner only' using errcode = '42501';
  end if;

  update workspace_students
     set status = 'removed'
   where workspace_id = p_workspace
     and student_id = p_student
     and status = 'active';

  if not found then
    raise exception 'teacher_remove_student: no active link to remove' using errcode = '22023';
  end if;

  insert into workspace_audit_log (workspace_id, actor_id, action, subject_id)
  values (p_workspace, auth.uid(), 'student_removed', p_student);
end;
$$;

-- Page bootstrap. Codes are scoped: any active staff member may share the
-- student code (they run the class too), but only the owner sees the staff
-- code, because that one decides who gets to look at students.
create or replace function teacher_my_workspaces()
returns table (
  workspace_id uuid,
  name text,
  staff_role workspace_staff_role,
  staff_status workspace_staff_status,
  student_join_code text,
  staff_join_code text,
  student_count integer
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select w.id,
         w.name,
         s.staff_role,
         s.status,
         case when s.status = 'active' then w.student_join_code end,
         case when s.staff_role = 'owner' then w.staff_join_code end,
         case when s.status = 'active'
              then (select count(*)::int from workspace_students ws
                     where ws.workspace_id = w.id and ws.status = 'active')
              else 0 end
    from workspace_staff s
    join teacher_workspaces w on w.id = s.workspace_id
   where s.user_id = auth.uid()
     and s.status <> 'removed'
     and w.is_active
   order by w.created_at;
$$;

-- THE READ SURFACE. Five columns. See the header before adding a sixth.
-- exam_type is included because a teacher cannot teach a student without
-- knowing which exam they are sitting; it is a stated intention, not a
-- measurement, and it is the only field here the student did not choose to
-- share by name.
create or replace function teacher_roster(p_workspace uuid)
returns table (
  student_id uuid,
  full_name text,
  exam_type text,
  joined_at timestamptz,
  status workspace_link_status
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if not workspace_is_active_staff(p_workspace) then
    raise exception 'teacher_roster: not staff of this workspace' using errcode = '42501';
  end if;

  return query
    select ws.student_id,
           coalesce(p.full_name, 'Student'),
           p.exam_type,
           ws.joined_at,
           ws.status
      from workspace_students ws
      left join profiles p on p.id = ws.student_id
     where ws.workspace_id = p_workspace
     order by (ws.status = 'active') desc, coalesce(p.full_name, '') asc;
end;
$$;

-- One student, from the teacher's side. Deliberately the same five facts plus
-- the workspace they share. The insight fields a teacher will eventually want
-- are absent because the evidence to compute them honestly does not exist yet
-- (docs/roadmap/teacher-intelligence-layer.md §5) — the page says so in words
-- rather than showing an empty chart.
create or replace function teacher_student_card(p_workspace uuid, p_student uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v jsonb;
begin
  if not workspace_is_active_staff(p_workspace) then
    raise exception 'teacher_student_card: not staff of this workspace' using errcode = '42501';
  end if;

  select jsonb_build_object(
           'student_id', ws.student_id,
           'full_name',  coalesce(p.full_name, 'Student'),
           'exam_type',  p.exam_type,
           'joined_at',  ws.joined_at,
           'status',     ws.status,
           'workspace',  w.name
         )
    into v
    from workspace_students ws
    join teacher_workspaces w on w.id = ws.workspace_id
    left join profiles p on p.id = ws.student_id
   where ws.workspace_id = p_workspace
     and ws.student_id = p_student;

  if v is null then
    raise exception 'teacher_student_card: no such student in this workspace' using errcode = '22023';
  end if;
  return v;
end;
$$;

-- ── 6 · privileges ───────────────────────────────────────────────────────

revoke all on function teacher_create_workspace(uuid, text)                    from public, anon, authenticated;
revoke all on function teacher_rotate_join_code(uuid, text)                     from public, anon, authenticated;
revoke all on function student_join_workspace(text)                            from public, anon, authenticated;
revoke all on function student_leave_workspace(uuid)                           from public, anon, authenticated;
revoke all on function student_my_teachers()                                   from public, anon, authenticated;
revoke all on function staff_join_workspace(text)                              from public, anon, authenticated;
revoke all on function teacher_set_staff_status(uuid, workspace_staff_status)   from public, anon, authenticated;
revoke all on function teacher_remove_student(uuid, uuid)                       from public, anon, authenticated;
revoke all on function teacher_my_workspaces()                                  from public, anon, authenticated;
revoke all on function teacher_roster(uuid)                                     from public, anon, authenticated;
revoke all on function teacher_student_card(uuid, uuid)                         from public, anon, authenticated;

grant execute on function teacher_create_workspace(uuid, text)                  to authenticated;
grant execute on function teacher_rotate_join_code(uuid, text)                  to authenticated;
grant execute on function student_join_workspace(text)                          to authenticated;
grant execute on function student_leave_workspace(uuid)                         to authenticated;
grant execute on function student_my_teachers()                                 to authenticated;
grant execute on function staff_join_workspace(text)                            to authenticated;
grant execute on function teacher_set_staff_status(uuid, workspace_staff_status) to authenticated;
grant execute on function teacher_remove_student(uuid, uuid)                    to authenticated;
grant execute on function teacher_my_workspaces()                               to authenticated;
grant execute on function teacher_roster(uuid)                                  to authenticated;
grant execute on function teacher_student_card(uuid, uuid)                      to authenticated;

commit;
