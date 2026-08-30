-- =====================================================================
-- Workspace vocabulary: the teaching 'owner' becomes 'teacher'
-- =====================================================================
-- STATUS: ✅ APPLIED 2026-08-30 to igvkyxkmjnkzscqgommj with explicit owner
--         approval, recorded as schema_migrations version 20260830214819
--         `workspace_owner_to_teacher`. Applied body differed only in header
--         text and the omitted outer transaction.
--         Verified in production: workspace_staff_role reads teacher,
--         assistant; the index is workspace_staff_one_teacher_idx with
--         predicate WHERE (staff_role = 'teacher'::workspace_staff_role);
--         no teaching function still carries the old literal; user_role still
--         reads user, admin, super_admin, owner; and change_user_role still
--         holds its 3 PLATFORM 'owner' literals, unchanged. Behaviour re-run
--         9 of 9 against the live functions — see the DRY RUN note below,
--         which the post-apply run reproduced exactly.
-- DEPENDS ON: 20260830a (enum, tables, guards), 20260830c (RPCs)
--
-- WHY
-- ---
-- "Owner" meant two unrelated things. `user_role.owner` is the PLATFORM owner —
-- one account, the top administrative authority. `workspace_staff.staff_role =
-- 'owner'` meant the TEACHER of a class. The second meaning is renamed here so
-- the word belongs to the platform alone.
--
-- WHAT IS DELIBERATELY NOT TOUCHED
-- --------------------------------
--   * change_user_role(). It contains 'owner' three times (measured, not
--     guessed — an earlier draft of this header said four) and every one of
--     them is the PLATFORM role: it is the function that refuses to grant or demote
--     platform Owner. A global find-and-replace across 'owner' would have
--     broken the platform's role-safety function while "fixing" naming. This
--     migration names its three targets and touches nothing else.
--   * user_role, profiles.role, and every admin predicate.
--   * workspace_is_owner() and teacher_workspaces.owner_id — the same teaching
--     sense, deliberately deferred. Renaming the function means rewriting the
--     five function bodies that call it, and transcription is the main risk in
--     a change like this; neither name crosses into the browser or the data.
--     Recorded as follow-up work, not forgotten.
--
-- WHY IT IS SAFE NOW, AND ONLY NOW
-- --------------------------------
-- workspace_staff holds ZERO rows using this value (0 workspaces, 0 staff), so
-- the rename migrates no data and affects no live user. It will never be
-- cheaper. Measured 2026-08-30.
--
-- WHAT A RENAME DOES AND DOES NOT CARRY
-- -------------------------------------
--   * The partial unique index survives automatically: index predicates are
--     stored parsed, referencing the enum value rather than its label, so
--     `where staff_role = 'owner'` becomes `= 'teacher'` on its own. Only the
--     index NAME is changed below, and that is cosmetic.
--   * Function bodies do NOT survive. They are stored as text and re-parsed at
--     execution, so a body still saying 'owner' would fail at run time with an
--     invalid enum value. The three functions holding the literal are therefore
--     replaced in this same transaction. Their bodies are reproduced from
--     20260830a/20260830c unchanged except for the named substitutions.
--
-- CLIENT COMPATIBILITY
-- --------------------
-- teacher.html accepts BOTH 'teacher' and 'owner' before this runs, so the
-- static site (which deploys on merge) and the database (which is applied by
-- hand) cannot skew in either order. The tolerance is removed in a later
-- release, once this migration is applied.
--
-- DRY RUN, 2026-08-30
-- -------------------
-- Executed against igvkyxkmjnkzscqgommj inside a transaction that was rolled
-- back: 13 structural and behavioural checks passed. The enum reads
-- teacher/assistant; the index predicate followed the value on its own
-- (`WHERE (staff_role = 'teacher'::workspace_staff_role)`); change_user_role
-- and the user_role enum are byte-for-byte untouched; no teaching function
-- still carries the old literal; and the authority model still holds — a new
-- workspace mints a 'teacher' staff row, an assistant still joins pending and
-- still cannot self-approve, the teacher can still approve, staff_role is still
-- immutable, and both the teacher and the approved assistant still read the
-- weakness surface.
-- =====================================================================

begin;

-- ── 1 · the value itself ─────────────────────────────────────────────────
alter type workspace_staff_role rename value 'owner' to 'teacher';

-- ── 2 · the index name (its predicate followed the value on its own) ─────
alter index workspace_staff_one_owner_idx rename to workspace_staff_one_teacher_idx;

-- ── 3 · the three function bodies that carry the literal ─────────────────
-- Reproduced verbatim from 20260830a / 20260830c. The ONLY differences are:
--   workspace_staff_guard      2 x  staff_role = 'owner'  ->  'teacher'
--   teacher_create_workspace   1 x  the inserted staff_role value
--   teacher_my_workspaces      1 x  staff_role = 'owner'  ->  'teacher'

create or replace function workspace_staff_guard()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_owner uuid;
begin
  select owner_id into v_owner from teacher_workspaces where id = new.workspace_id;

  if tg_op = 'INSERT' then
    if new.staff_role = 'teacher' then
      -- The owner row is born with the workspace and belongs to its owner.
      if new.user_id is distinct from v_owner then
        raise exception 'workspace_staff: the owner row must belong to the workspace owner'
          using errcode = '22000';
      end if;
    else
      -- An assistant joins for themselves, and arrives pending.
      if new.user_id is distinct from auth.uid() then
        raise exception 'workspace_staff: an assistant row can only be created by that assistant'
          using errcode = '42501';
      end if;
      if new.status <> 'pending' then
        raise exception 'workspace_staff: an assistant is always born pending'
          using errcode = '22000';
      end if;
    end if;
    if exists (select 1 from workspace_students ws
               where ws.workspace_id = new.workspace_id
                 and ws.student_id = new.user_id
                 and ws.status = 'active') then
      raise exception 'workspace_staff: this account is an enrolled student in this workspace'
        using errcode = '22000';
    end if;
    return new;
  end if;

  -- UPDATE ------------------------------------------------------------------
  if new.workspace_id is distinct from old.workspace_id
     or new.user_id is distinct from old.user_id
     or new.staff_role is distinct from old.staff_role then
    raise exception 'workspace_staff: workspace_id, user_id and staff_role are immutable'
      using errcode = '22000';
  end if;

  if new.status is distinct from old.status then
    if old.staff_role = 'teacher' then
      raise exception 'workspace_staff: the owner row cannot change status'
        using errcode = '42501';
    end if;
    -- Activation is the whole safety gate on the staff code. Only the owner.
    if auth.uid() is distinct from v_owner then
      raise exception 'workspace_staff: only the workspace owner can change staff status'
        using errcode = '42501';
    end if;
    if new.status = 'active' then
      new.activated_at := coalesce(new.activated_at, now());
      new.activated_by := auth.uid();
    elsif new.status = 'removed' then
      new.removed_at := coalesce(new.removed_at, now());
      new.removed_by := auth.uid();
    end if;
  end if;

  return new;
end;
$$;

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
  values (v_id, p_owner, 'teacher', 'active', now(), auth.uid());

  insert into workspace_audit_log (workspace_id, actor_id, action, subject_id, meta)
  values (v_id, auth.uid(), 'workspace_created', p_owner, jsonb_build_object('name', btrim(p_name)));

  return v_id;
end;
$$;

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
         case when s.staff_role = 'teacher' then w.staff_join_code end,
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

commit;
