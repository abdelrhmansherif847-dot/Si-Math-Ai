-- =====================================================================
-- A removed assistant can apply again — and the RPC stops lying
-- =====================================================================
-- STATUS: ✅ APPLIED 2026-08-30 to igvkyxkmjnkzscqgommj with explicit owner
--         approval, recorded as schema_migrations version 20260830232358
--         `staff_rejoin`. Applied body differed only in header text and the
--         omitted outer transaction (apply_migration supplies its own).
--         Verified after apply: BOTH live bodies are byte-for-byte identical to
--         this file — workspace_staff_guard 3056 bytes md5
--         6d126d06b33ef40c0b4cf36a40d61952, staff_join_workspace 1941 bytes md5
--         a7a18f39f88cafc8f2955adbac2399a9. Both SECURITY DEFINER with
--         search_path pinned; `anon` can execute neither. 15 of 15 behavioural
--         checks re-run against the LIVE functions, the four guard conditions
--         among them — docs/engineering/staff-rejoin-verification.md §10.
-- DEPENDS ON: 20260830a (tables, guards), 20260830c (staff_join_workspace),
--             20260830h (staff_role reads 'teacher' | 'assistant')
--
-- THE DEFECT, MEASURED
-- --------------------
-- staff_join_workspace() ended with `on conflict (workspace_id, user_id) do
-- nothing` and then returned `{"status":"pending"}` unconditionally. Measured
-- against production on 2026-08-30: after a teacher removes an assistant,
-- re-entering the staff code returns **"pending" while the row is still
-- "removed"**. teacher.html then shows the waiting-for-approval screen for an
-- application that was never filed, and the assistant waits forever. The call
-- also wrote a 'staff_joined' audit row describing something that did not
-- happen.
--
-- The same shape hit callers who were already `pending` (told "pending", true
-- by luck) and already `active` (told "pending", simply false) — including the
-- teacher of the class pasting their own staff code.
--
-- WHY THE RPC ALONE CANNOT FIX IT
-- -------------------------------
-- This was established, not assumed. Retrying the status change inside a
-- SECURITY DEFINER context — so the table privilege was the definer's and only
-- the trigger could object — produced:
--
--     REFUSED: workspace_staff: only the workspace owner can change staff status
--
-- workspace_staff_guard refuses ANY status change by anyone but the workspace
-- owner. So a truthful re-application needs a narrow, named allowance in the
-- guard as well. That is the whole reason this migration touches a trigger.
--
-- THE ALLOWANCE, AND ITS LIMITS
-- -----------------------------
-- Exactly one new transition is permitted:
--
--     removed  ->  pending,  by the account named on the row itself
--
-- and nothing else. It cannot reach 'active': that remains the workspace
-- owner's alone, and it is the entire safety gate on the staff code. Applying
-- again grants NOTHING — 'pending' is an application, and teacher_roster(),
-- teacher_student_card() and teacher_student_weaknesses() all refuse a pending
-- assistant exactly as before.
--
-- This mirrors the rule workspace_students_guard has always had: a student may
-- restore their own link because re-consent is still consent. An assistant may
-- re-apply because re-applying is still applying. Neither can approve itself.
--
-- WHY THE LIFECYCLE COLUMNS ARE CLEARED
-- -------------------------------------
-- Not tidiness — correctness. The approval path sets
-- `activated_at := coalesce(new.activated_at, now())`, so a re-approved row
-- that kept its old activated_at would report the FIRST approval as the time of
-- the second. Clearing activated_at/by and removed_at/by returns the row to the
-- shape of a fresh application, which is what it now is. The history is not
-- lost: workspace_audit_log holds staff_joined / staff_removed / staff_activated
-- in order, and that is where history belongs. `created_at` is deliberately
-- NOT reset — it is when this account first applied here, and that is true.
--
-- WHAT IS REPRODUCED VERBATIM
-- ---------------------------
-- workspace_staff_guard is copied from 20260830h with ONE inserted block and no
-- other edit — the error message strings included, unchanged, so the diff is
-- reviewable at a glance. (Two of them still say "owner row" where the value is
-- now 'teacher'. That wording is a leftover from 20260830h and is deliberately
-- NOT corrected here: it is a user-visible string change, unrelated to this
-- defect. Recorded as follow-up.)
--
-- A NOTE ON WHAT PRODUCTION ACTUALLY HELD
-- ---------------------------------------
-- The live staff_join_workspace body was 884 bytes; the body in 20260830c is
-- 1034. The difference is TWO COMMENT LINES and nothing else — verified by
-- stripping comments from both and comparing: identical. The applied revision
-- simply carried no comments. Recorded because a rollback has to restore what
-- was really running, and 20260830v does.
-- =====================================================================

begin;

-- ── 1 · the guard: one new transition, named ─────────────────────────────
-- Reproduced from 20260830h. The ONLY change is the re-application block
-- marked NEW below.

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

    -- NEW · RE-APPLICATION, and the only status change an assistant may make
    -- for themselves. removed -> pending, by the account named on the row.
    -- It grants nothing: 'pending' is an application, not access, and only the
    -- workspace owner can turn it into 'active' (below). The same reasoning as
    -- workspace_students_guard's re-consent rule.
    if old.status = 'removed'
       and new.status = 'pending'
       and new.user_id = auth.uid() then
      new.activated_at := null;
      new.activated_by := null;
      new.removed_at   := null;
      new.removed_by   := null;
      return new;
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

-- ── 2 · the RPC: say what actually happened ──────────────────────────────

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
  v_row workspace_staff%rowtype;
  v_status workspace_staff_status;
  v_applied boolean := false;
begin
  if auth.uid() is null then
    raise exception 'staff_join_workspace: sign in first' using errcode = '42501';
  end if;

  select * into w from teacher_workspaces where staff_join_code = v_norm and is_active;
  if not found then
    raise exception 'staff_join_workspace: that code did not match a class' using errcode = '22023';
  end if;

  select * into v_row from workspace_staff
   where workspace_id = w.id and user_id = auth.uid();

  if not found then
    -- A first application. The guard still refuses anything but
    -- assistant/pending, and refuses it outright if this account is an
    -- enrolled student in this workspace.
    insert into workspace_staff (workspace_id, user_id, staff_role, status)
    values (w.id, auth.uid(), 'assistant', 'pending');
    v_status  := 'pending';
    v_applied := true;

  elsif v_row.status = 'removed' then
    -- Re-application. Permitted by the guard for this transition only.
    update workspace_staff set status = 'pending' where id = v_row.id;
    v_status  := 'pending';
    v_applied := true;

  else
    -- Already pending, already active, or the teacher of this class pasting
    -- their own staff code. Nothing changes — and the caller is told what is
    -- true instead of the word 'pending'.
    v_status := v_row.status;
  end if;

  -- The audit log records what HAPPENED. The previous version wrote
  -- 'staff_joined' on every call, including calls that changed nothing.
  if v_applied then
    insert into workspace_audit_log (workspace_id, actor_id, action, subject_id)
    values (w.id, auth.uid(), 'staff_joined', auth.uid());
  end if;

  return jsonb_build_object('workspace_id', w.id, 'name', w.name, 'status', v_status);
end;
$$;

-- ── 3 · privileges are unchanged, and restated rather than assumed ───────
-- create or replace preserves the existing ACL, so these lines change nothing.
-- They are here so the privilege of a rewritten function is visible in the
-- migration that rewrote it, per 20260830b's rule.
revoke all on function staff_join_workspace(text) from public, anon, authenticated;
grant execute on function staff_join_workspace(text) to authenticated;

commit;
