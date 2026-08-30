-- =====================================================================
-- ROLLBACK for 20260830k — workspace creation returns to admin-and-above
-- =====================================================================
-- STATUS: 🟡 PREPARED, deliberately NOT APPLIED. 20260830k went live on
--         2026-08-30 (schema_migrations 20260830235339), so this is now a live
--         way back rather than a hypothetical one; running it is its own
--         approval, exactly like running the forward migration.
--
-- Restores teacher_create_workspace() to the body from 20260830h, byte-for-byte
-- — the version that gates on has_role_at_least('admin'). That body was
-- verified identical to production before 20260830k was written.
--
-- WHAT RUNNING IT COSTS: the two super_admin accounts can create workspaces
-- again, and therefore decide who is a Teacher. No data is migrated either way;
-- workspaces already created keep their teachers and their codes.
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

revoke all on function teacher_create_workspace(uuid, text) from public, anon, authenticated;
grant execute on function teacher_create_workspace(uuid, text) to authenticated;

commit;
