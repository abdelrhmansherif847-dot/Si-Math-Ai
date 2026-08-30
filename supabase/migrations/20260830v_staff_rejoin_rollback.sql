-- =====================================================================
-- ROLLBACK for 20260830j — the assistant re-application allowance, undone
-- =====================================================================
-- STATUS: 🟡 PREPARED, deliberately NOT APPLIED. Running it is its own
--         approval, exactly like running the forward migration.
--
-- WHAT IT RESTORES
-- ----------------
--   * workspace_staff_guard()  -> the body from 20260830h, byte-for-byte. That
--     body was verified identical to production before 20260830j was written
--     (2426 bytes, md5 4e098f6a6bff50b5ef21e71fd800a707), so this really is a
--     restore rather than a third version.
--   * staff_join_workspace()   -> the body from 20260830c. Production held the
--     same logic with two comment lines removed (884 bytes live vs 1034 in the
--     file; comment-stripped comparison: identical). This restores the
--     documented version, whose behaviour is the behaviour that was running.
--
-- WHAT RUNNING IT COSTS
-- ---------------------
-- The defect comes back: a removed assistant re-entering the staff code is told
-- "pending" while their row stays "removed", and waits for an application that
-- was never filed. Roll back only if 20260830j itself causes a problem —
-- and note that any assistant already re-applied under 20260830j keeps their
-- 'pending' row, which the restored guard handles normally (the teacher can
-- still approve or remove it). No data is migrated either way.
--
-- SAFE TO RUN AT ANY TIME. Both functions own no data and are referenced by no
-- policy or foreign key.
-- =====================================================================

begin;

-- ── 1 · the guard, exactly as 20260830h left it ─────────────────────────
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

-- ── 2 · staff_join_workspace, exactly as 20260830c defined it ──────────
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

revoke all on function staff_join_workspace(text) from public, anon, authenticated;
grant execute on function staff_join_workspace(text) to authenticated;

commit;
