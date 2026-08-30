-- =====================================================================
-- my_experience() — one caller-scoped answer to "which product am I in?"
-- =====================================================================
-- STATUS: 🟡 PREPARED — NOT APPLIED. Dry-run only.
--         Apply with explicit owner approval, one migration at a time, per
--         CLAUDE.md §3.
-- DEPENDS ON: 20260830a (workspace_staff, teacher_workspaces),
--             20260830h (staff_role reads 'teacher' | 'assistant')
--
-- WHY THIS EXISTS
-- ---------------
-- Three surfaces already answer "who is this account?" and they answer it
-- differently:
--
--   login.html   reads profiles.onboarding_completed and routes everyone to
--                dashboard.html — a teacher lands in the learning product
--   nav.js       reads profiles.role for the Admin section, then calls
--                teacher_my_workspaces() and counts ANY row that is not
--                'removed' as teaching — so a PENDING assistant, who cannot
--                read a single roster row, is shown a Teaching link
--   teacher.html picks the first active workspace it is handed
--
-- Three readings of the same identity is two too many. This function is the
-- single one, and the pages become its consumers.
--
-- WHAT IT IS NOT
-- --------------
-- **Routing is not a security boundary, and this function is not an
-- authorization check.** It answers "where does this account belong by
-- default?" — nothing more. Every actual permission is still enforced where it
-- was before: RLS on the four workspace tables, the three predicates in
-- 20260830b, and the authorization inside each RPC in 20260830c/d. A client
-- that ignores this function, lies about its answer, or calls it not at all
-- gains exactly nothing. That is the property that makes it safe to hand a
-- routing hint to the browser at all.
--
-- Consequently it takes NO arguments. There is no p_user uuid to pass, so
-- there is no version of this call that asks about somebody else, and no
-- caller can be tricked into asking. auth.uid() or nothing.
--
-- THE CONTRACT
-- ------------
--   {
--     "primary":           "staff" | "student",
--     "can_staff":         boolean,
--     "can_student":       boolean,          -- always true; see below
--     "platform_role":     "user" | "admin" | "super_admin" | "owner",
--     "staff_memberships": [ { workspace_id, name, staff_role, status } ],
--     "pending_count":     integer
--   }
--
-- Six keys, always all six, always these types. A consumer never has to test
-- for a missing key.
--
-- FOUR RULES, AND THE REASON FOR EACH
-- -----------------------------------
--   1. can_staff is ACTIVE staff membership, in an ACTIVE workspace. Not
--      "has a row". A PENDING assistant is an application, not a colleague:
--      teacher_roster() and teacher_student_weaknesses() both refuse them, so
--      routing them to the staff surface would show a page of permission
--      errors. They stay in the Student experience and are told, by
--      pending_count, that they are waiting. This is the nav.js defect above,
--      fixed at the source rather than in one of its readers.
--
--   2. can_student is unconditionally true. A teacher who is also studying is
--      still a student, and the learning product is never taken away from an
--      account because it acquired a teaching relationship. There is no
--      "teacher account" — there are accounts with teaching relationships.
--
--   3. platform_role never sets `primary`. Being an admin, super_admin or the
--      platform owner is an administrative capability, reached from the Admin
--      section; it is not a home. An admin who teaches nothing is a student
--      here, which is what they were before this function existed. The value
--      is reported so nav.js can render the Admin section from the same call,
--      and it comes from current_user_role() — the SAME read has_role_at_least()
--      enforces with — so the sidebar cannot promise a page the database will
--      then refuse.
--
--   4. Being a teacher is still a RELATIONSHIP, never a user_role value. This
--      function derives it from workspace_staff every time it is called, and
--      writes nothing anywhere. There is no state to go stale, and revoking a
--      membership changes the answer on the next call.
--
-- PRIVILEGE MODEL
-- ---------------
-- Same rule as 20260830b/c, for the same reason: this project has a DEFAULT
-- ACL granting EXECUTE on new public functions to anon and authenticated. So
-- revoke from public, anon, authenticated — then grant to authenticated only.
-- `anon` must not hold it: it would answer with the signed-out shape, which is
-- harmless, but a function that is callable by everyone is one refactor away
-- from being a function that answers about everyone.
-- =====================================================================

begin;

create or replace function my_experience()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  v_uid         uuid  := auth.uid();
  v_memberships jsonb := '[]'::jsonb;
  v_active      int   := 0;
  v_pending     int   := 0;
  v_role        text;
begin
  -- No identity, no opinion. An unidentified caller is routed to the learning
  -- product, which is where every page sends them today. Nothing is granted by
  -- saying so: can_student is a routing default, not a permission.
  if v_uid is null then
    return jsonb_build_object(
      'primary',           'student',
      'can_staff',         false,
      'can_student',       true,
      'platform_role',     'user',
      'staff_memberships', '[]'::jsonb,
      'pending_count',     0);
  end if;

  -- One pass over the caller's OWN staff rows. `status <> 'removed'` keeps a
  -- pending application visible (rule 1 needs to report it); `w.is_active`
  -- matches workspace_is_active_staff() exactly, so a deactivated workspace
  -- cannot route anyone into a surface its own predicate would then close.
  select coalesce(
           jsonb_agg(
             jsonb_build_object(
               'workspace_id', s.workspace_id,
               'name',         w.name,
               'staff_role',   s.staff_role::text,
               'status',       s.status::text)
             order by w.created_at, w.id),
           '[]'::jsonb),
         count(*) filter (where s.status = 'active'),
         count(*) filter (where s.status = 'pending')
    into v_memberships, v_active, v_pending
    from workspace_staff s
    join teacher_workspaces w on w.id = s.workspace_id
   where s.user_id = v_uid
     and s.status <> 'removed'
     and w.is_active;

  -- The same read has_role_at_least() enforces with. Deliberately not a fresh
  -- select on profiles: two reads of one fact are two chances to disagree.
  v_role := current_user_role()::text;

  return jsonb_build_object(
    'primary',           case when v_active > 0 then 'staff' else 'student' end,
    'can_staff',         v_active > 0,
    'can_student',       true,
    'platform_role',     coalesce(v_role, 'user'),
    'staff_memberships', v_memberships,
    'pending_count',     v_pending);
end;
$$;

comment on function my_experience() is
  'The single answer to "which product does the CALLER belong in?". Returns a '
  'six-key jsonb: primary, can_staff, can_student, platform_role, '
  'staff_memberships, pending_count. Takes no arguments and reports on '
  'auth.uid() only. A routing hint, NEVER an authorization check — every '
  'permission is enforced by RLS and by the RPCs, unchanged.';

-- ── privileges ───────────────────────────────────────────────────────────
revoke all on function my_experience() from public, anon, authenticated;
grant execute on function my_experience() to authenticated;

commit;
