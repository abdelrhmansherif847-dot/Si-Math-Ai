-- =====================================================================
-- Help & Support · 2 of 6 — read/write helpers and every RLS policy
-- =====================================================================
-- STATUS: ⛔ PREPARED — NOT YET APPLIED. Awaiting owner approval.
--         Revision 4. Revision 2 reconciled this file against the APPROVED
--         revision 4 of 20260815a_support_enums_tables.sql; revision 3 closed
--         the attachment lifecycle bypass found in review — see section 7,
--         where support_attachments_insert_own now also requires
--         support_student_can_post() on the parent ticket.
-- DEPENDS ON: 20260815a (tables, enums, guards, triggers)
--
-- WHY THIS EXISTS
-- ---------------
-- 20260815a left the six tables RLS-enabled with no policy, i.e. closed. This
-- opens exactly the doors that should be open and no others.
--
-- =====================================================================
-- THE CARRY-FORWARD REQUIREMENT FROM MIGRATION 1's APPROVAL
-- =====================================================================
-- Migration 1 was approved on condition that this file gives a student NO
-- direct UPDATE path that can manipulate support_tickets.meeting_granted.
-- Stated plainly, and verifiable by reading section 4 below:
--
--   * There is NO student UPDATE policy on support_tickets. None. A student's
--     UPDATE matches no policy at all and is refused before any column is
--     considered — so this is stronger than protecting one column, it is the
--     absence of the whole verb.
--   * The only UPDATE-capable policy on that table is support_tickets_admin_all,
--     which requires has_role_at_least('admin') in BOTH using and with check.
--   * The student INSERT policy pins meeting_granted = false, so a ticket
--     cannot be born already granted.
--   * Grant CREATION therefore has exactly one route — an agent — and it is
--     additionally re-checked by support_tickets_guard() in Migration 1, which
--     rejects false -> true from a non-agent even if a policy were widened by
--     mistake later.
--   * Grant CONSUMPTION (true -> false) is not reachable by a student either:
--     it happens inside support_meetings_consume_grant(), a SECURITY DEFINER
--     AFTER INSERT trigger that runs in the student's transaction without
--     granting the student anything.
--
-- The layering is deliberate. RLS removes the verb; the guard polices the
-- value. Either alone would be enough today; together, widening one without
-- the other does not open the door.
--
-- ADMIN PREDICATE
-- ---------------
-- Every staff branch uses has_role_at_least('admin'), the security-definer
-- helper already in the database, which reads the user_role enum
-- (user < admin < super_admin < owner). The legacy inline form that
-- payment_requests uses —
--     exists (select 1 from profiles where id = auth.uid() and is_admin)
-- — is NOT copied. It re-reads a table RLS is already evaluating, and it drifts
-- from the role enum the rest of the platform moved to.
--
-- WHAT A STUDENT CAN WRITE DIRECTLY, AND WHY THAT IS SAFE
-- -------------------------------------------------------
-- Three writes only: open a ticket, post a message on their own ticket, and
-- attach a screenshot to a message they wrote. Each is single-row and fully
-- expressible as a WITH CHECK, which is the same reasoning chat_sessions uses.
-- Everything with a cross-row invariant — booking, status changes, meeting
-- grants — is an RPC in 20260815d, because a policy cannot express "and
-- atomically do this in another table".
--
-- The second and third share ONE lifecycle rule, support_student_can_post().
-- They have to: a door that is shut for messages and open for the attachments
-- beside them is not shut. See section 7.
--
-- THE THREE HELPER FUNCTIONS
-- --------------------------
-- They are declared here rather than in the RPC migration because the policies
-- in this file call them. All three are read-only predicates, not actions, and
-- all three are SECURITY DEFINER for the same reason: a policy must be able to
-- consult a fact the caller is not permitted to read directly. Their
-- search_path is pinned to pg_catalog, public — matching Migration 1 — because
-- an unqualified name inside a definer function is otherwise resolvable by a
-- caller-controlled path.
--
-- EXECUTE PRIVILEGES — STATED, NOT INHERITED
-- ------------------------------------------
-- Revision 3 wrote only `revoke ... from anon` for each helper and called the
-- job done. It was not: this project defines a DEFAULT ACL for functions in
-- `public` (pg_default_acl, grantor postgres) of
--
--     postgres=X | anon=X | authenticated=X | service_role=X
--
-- so every new function is created with an EXPLICIT grant to `authenticated`.
-- Revoking `anon` leaves that grant untouched, and all three SECURITY DEFINER
-- helpers would have been directly callable by any logged-in student. The most
-- exposed was support_setting_int(), which takes an arbitrary key and reads
-- system_settings with owner rights, bypassing that table's RLS.
--
-- Note the default ACL has no PUBLIC entry — a defined default ACL REPLACES the
-- built-in one, which is why the mechanism here is the explicit `authenticated`
-- grant rather than PUBLIC inheritance. The revokes below name `public` anyway,
-- so the file is correct on a database that does not carry this project's
-- default ACL, rather than correct only against observed state.
--
-- This is the same class of mistake as
-- 20260804_streak_server_side_revoke_anon.sql, in the opposite direction: that
-- migration revoked from PUBLIC expecting it to cover anon and it did not.
-- This one revoked from anon expecting it to cover authenticated. The lesson
-- that file records is that the grant model here must be stated per function,
-- which is what the three blocks below now do.
--
--   support_setting_int        owner only     (reached only via a definer call)
--   support_student_can_post   authenticated  (an RLS policy calls it)
--   support_slot_is_open       authenticated  (an RLS policy calls it)
--
-- The two grants are REQUIRED, not permissive: an RLS policy expression is
-- evaluated with the caller's privileges, so a student who cannot EXECUTE the
-- function cannot satisfy the policy that calls it, and their INSERT fails with
-- 42501 instead of working. service_role keeps its default grant throughout —
-- it is the backend key, and admin tooling runs as it.
-- =====================================================================

-- ── 1. Settings reader ─────────────────────────────────────────────────────
-- Product policy lives in system_settings, which students cannot read. This is
-- security definer so a policy can consult it on their behalf.
--
-- ABSENT, EMPTY AND MALFORMED ALL MEAN "NO LIMIT". That is the whole point: no
-- interval has been chosen for reopening or auto-closing, and inventing one
-- would be a product decision taken by accident. A typo in the settings table
-- must not silently start closing students' tickets either, so anything that is
-- not a plain non-negative integer reads as unset.

create or replace function public.support_setting_int(p_key text)
returns integer
language sql
stable
security definer
set search_path = pg_catalog, public
-- THE {1,6} BOUND IS LOAD-BEARING, not cosmetic. `^[0-9]+$` alone accepts a
-- digit string of any length and then casts it, which breaks the contract this
-- comment makes, in two different ways:
--
--   * '99999999999' matches the regex and overflows int4 on the cast →
--     22003 numeric_value_out_of_range, raised out of a STABLE function that is
--     called from inside an RLS policy. A student's INSERT would fail with a
--     numeric error naming nothing they can act on, and "malformed means no
--     limit" would be false.
--   * a value large enough to survive the cast still reaches
--     make_interval(days => …) in support_student_can_post() below, and
--     now() - 2,000,000 years underflows timestamptz → 22008.
--
-- Six digits caps the value at 999,999: comfortably inside int4, and
-- now() - 999,999 days lands around 700 BC, well inside the timestamptz range.
-- It is also ~2,700 years, so no real reopen window or meeting cap is excluded
-- by it. The bound is what makes this function TOTAL — there is no input,
-- however hostile, for which it raises instead of returning NULL.
as $$
  select case when v ~ '^[0-9]{1,6}$' then v::integer else null end
  from (
    select nullif(btrim(value), '') as v
    from public.system_settings
    where key = p_key
  ) s;
$$;

comment on function public.support_setting_int(text) is
  'Reads an integer product-policy setting. Absent, empty, non-numeric or out of the 0-999999 band all return NULL, which every caller treats as "no limit". Total: never raises.';

-- PRIVILEGE MODEL — see the header. This one is NOT granted to authenticated:
-- it is reached only from inside support_student_can_post(), which is SECURITY
-- DEFINER and therefore calls it as the owner. Left executable by students it
-- would be an arbitrary-key reader of system_settings that bypasses that
-- table's RLS.
revoke all on function public.support_setting_int(text) from public, anon, authenticated;

-- ── 2. Can this student post on this ticket? ───────────────────────────────
-- Ownership, plus the closed rule, plus the reopen window IF one is ever
-- configured. With support.reopen_window_days unset — which is how it ships —
-- a resolved ticket can always be reopened by replying to it. Setting a value
-- later changes behaviour with no migration and no code change.

create or replace function public.support_student_can_post(p_ticket_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select exists (
    select 1
    from public.support_tickets t
    where t.id = p_ticket_id
      and t.user_id = auth.uid()
      and t.status <> 'closed'
      and (
        t.status <> 'resolved'
        or t.resolved_at is null
        or public.support_setting_int('support.reopen_window_days') is null
        or t.resolved_at > now() - make_interval(
             days => public.support_setting_int('support.reopen_window_days'))
      )
  );
$$;

comment on function public.support_student_can_post(uuid) is
  'Ticket is the caller''s own, is not closed, and (if support.reopen_window_days is configured) is still inside the reopen window.';

-- PRIVILEGE MODEL — granted to authenticated because RLS policy expressions are
-- evaluated with the CALLER's privileges, so a student invoking the message or
-- attachment INSERT policy must hold EXECUTE on this function or the policy
-- itself raises 42501. Safe to grant: every branch is scoped to auth.uid()
-- internally, so calling it with another student's ticket id returns false
-- rather than disclosing anything.
revoke all on function public.support_student_can_post(uuid) from public, anon;
grant  execute on function public.support_student_can_post(uuid) to authenticated;

-- ── 3. Is this slot still free? ────────────────────────────────────────────
-- NEW IN THIS REVISION, and it exists because revision 4 of Migration 1 moved
-- slot occupancy out of the slot row and into support_meetings. That was the
-- right move — it is why account deletion no longer leaves stale claim
-- metadata — but it creates a visibility problem that a policy alone cannot
-- solve:
--
--   Occupancy now lives in support_meetings, and a student may read only their
--   OWN meeting rows. A NOT EXISTS written by the student therefore finds no
--   occupying meeting for a slot booked by SOMEONE ELSE, and every taken slot
--   reads as free. The student picks one, and the unique index rejects the
--   booking with an error they did nothing to deserve.
--
-- SECURITY DEFINER is what fixes it: this function sees every meeting, so it
-- answers the occupancy question truthfully regardless of who is asking.
--
-- It discloses exactly one bit — whether that window is taken — and never by
-- whom, which is the minimum a slot picker needs in order to be honest. It
-- mirrors support_meetings_one_per_slot_idx exactly: 'cancelled' releases a
-- window, every other status keeps it.

create or replace function public.support_slot_is_open(p_slot_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select not exists (
    select 1
    from public.support_meetings m
    where m.slot_id = p_slot_id
      and m.status <> 'cancelled'
  );
$$;

comment on function public.support_slot_is_open(uuid) is
  'True when no non-cancelled meeting occupies the slot. SECURITY DEFINER because occupancy lives in support_meetings, where a student can see only their own rows and would read every other student''s booking as free.';

-- PRIVILEGE MODEL — granted to authenticated for the same reason: the slot
-- visibility policy calls it, and a policy runs with the caller's privileges.
-- Safe to grant: it returns one bit that the policy already exposes — whether a
-- window is taken — and never who took it.
revoke all on function public.support_slot_is_open(uuid) from public, anon;
grant  execute on function public.support_slot_is_open(uuid) to authenticated;

-- ── 4. support_articles ────────────────────────────────────────────────────
-- Drafts are real: an agent can stage an article before students see it.

create policy support_articles_read_published
  on public.support_articles for select to authenticated
  using (published or has_role_at_least('admin'));

create policy support_articles_admin_all
  on public.support_articles for all to authenticated
  using (has_role_at_least('admin'))
  with check (has_role_at_least('admin'));

-- ── 5. support_tickets ─────────────────────────────────────────────────────
-- THIS SECTION CARRIES THE APPROVAL CONDITION. See the header.

create policy support_tickets_read_own
  on public.support_tickets for select to authenticated
  using (user_id = auth.uid() or has_role_at_least('admin'));

-- The WITH CHECK pins every field a student must not choose. meeting_granted is
-- the one that matters most: without pinning it a student could open a ticket
-- already authorised and book a meeting without an agent ever seeing the issue,
-- which is the single rule this whole feature exists to enforce.
create policy support_tickets_insert_own
  on public.support_tickets for insert to authenticated
  with check (
    user_id = auth.uid()
    and status = 'open'
    and meeting_granted = false
    and assigned_to is null
    and resolved_at is null
    and closed_at is null
  );

-- DELIBERATELY NO STUDENT UPDATE POLICY — and no student DELETE policy either.
--
-- This is the carry-forward requirement from Migration 1's approval. A student
-- holds no UPDATE verb on this table at all, so meeting_granted is not merely
-- protected, it is unreachable. Reopening a resolved ticket happens by posting
-- a message, which the trigger in 20260815c turns into a status change: status
-- stays a consequence of the conversation rather than a field two clients can
-- disagree about, and the student never needs UPDATE to achieve it.
--
-- If a future migration ever adds a student UPDATE policy here, it MUST also
-- exclude meeting_granted, status, assigned_to, resolved_at and closed_at from
-- what that policy permits. support_tickets_guard() would still refuse a
-- false -> true grant, but it is the second line, not the first.
create policy support_tickets_admin_all
  on public.support_tickets for all to authenticated
  using (has_role_at_least('admin'))
  with check (has_role_at_least('admin'));

-- ── 6. support_messages ────────────────────────────────────────────────────

create policy support_messages_read_own
  on public.support_messages for select to authenticated
  using (
    has_role_at_least('admin')
    or exists (
      select 1 from public.support_tickets t
      where t.id = support_messages.ticket_id and t.user_id = auth.uid()
    )
  );

-- sender_role is pinned to 'student' here. An agent reply goes through
-- admin_support_reply(), which is the only writer of 'agent', and 'system' is
-- reserved for server-written notices.
create policy support_messages_insert_own
  on public.support_messages for insert to authenticated
  with check (
    sender_id = auth.uid()
    and sender_role = 'student'
    and public.support_student_can_post(ticket_id)
  );

create policy support_messages_admin_all
  on public.support_messages for all to authenticated
  using (has_role_at_least('admin'))
  with check (has_role_at_least('admin'));

-- ── 7. support_attachments ─────────────────────────────────────────────────

create policy support_attachments_read_own
  on public.support_attachments for select to authenticated
  using (
    has_role_at_least('admin')
    or exists (
      select 1
      from public.support_messages m
      join public.support_tickets t on t.id = m.ticket_id
      where m.id = support_attachments.message_id and t.user_id = auth.uid()
    )
  );

-- TWO conditions, and the second was missing until this revision.
--
--   1. AUTHORSHIP — the attachment hangs off a student message the caller
--      actually wrote, so it cannot be grafted onto an agent's message or onto
--      someone else's thread.
--   2. LIFECYCLE — the parent ticket must STILL accept student content, judged
--      by the same rule as a message.
--
-- Without (2) the policy checked authorship history and nothing else, so a
-- student could post a message while the ticket was live, wait for it to be
-- closed, and then keep inserting attachments onto that old message forever.
-- The message door was shut and the attachment door beside it was not — a
-- write path around the lifecycle, reached without touching any status column.
--
-- support_student_can_post() is REUSED rather than reimplemented here. The
-- closed rule and the reopen-window rule are one policy decision, and a second
-- copy of them is a second thing to forget when support.reopen_window_days is
-- eventually set. One helper, two call sites, one behaviour.
create policy support_attachments_insert_own
  on public.support_attachments for insert to authenticated
  with check (
    uploaded_by = auth.uid()
    and exists (
      select 1 from public.support_messages m
      where m.id = support_attachments.message_id
        and m.sender_id = auth.uid()
        and m.sender_role = 'student'
        and public.support_student_can_post(m.ticket_id)
    )
  );

create policy support_attachments_admin_all
  on public.support_attachments for all to authenticated
  using (has_role_at_least('admin'))
  with check (has_role_at_least('admin'));

-- ── 8. support_meeting_slots ───────────────────────────────────────────────
-- RECONCILED FOR REVISION 4. The previous draft read
--     claimed_by = auth.uid() or (active and claimed_by is null and ...)
-- against columns revision 4 deleted. That draft would not have applied at all:
-- it references support_meeting_slots.claimed_by, which no longer exists.
--
-- What a student may see, and why each branch is here:
--   * a genuinely free, active, future slot   — the picker
--   * a slot they themselves hold             — so their booked time is visible
-- and nothing else. The rows other students hold are simply not returned, so
-- the page cannot be read as a roster of who is in trouble this week.
--
-- The middle branch calls support_slot_is_open() rather than writing the NOT
-- EXISTS inline: an inline subquery would be evaluated under the caller's own
-- RLS on support_meetings and would report every other student's booking as
-- free. See section 3.

create policy support_slots_read_bookable
  on public.support_meeting_slots for select to authenticated
  using (
    has_role_at_least('admin')
    or (active and starts_at > now() and public.support_slot_is_open(id))
    or exists (
      select 1 from public.support_meetings m
      where m.slot_id = support_meeting_slots.id
        and m.user_id = auth.uid()
        and m.status <> 'cancelled'
    )
  );

-- No student INSERT/UPDATE/DELETE. A student never writes a slot: booking
-- writes a support_meetings row, and occupancy is derived from it.
create policy support_slots_admin_all
  on public.support_meeting_slots for all to authenticated
  using (has_role_at_least('admin'))
  with check (has_role_at_least('admin'));

-- ── 9. support_meetings ────────────────────────────────────────────────────
--
-- A NOTE ON WHY THERE IS NO STUDENT INSERT POLICY, even though Migration 1's
-- support_meetings_guard() is perfectly capable of authorising a student's
-- booking on its own. Booking stays an RPC because it must also read the slot
-- catalogue and fail with a message a student can act on; the guard is the
-- backstop that makes the rule true for every writer, not the front door.
-- Adding a student INSERT policy later would not break the escalation rule —
-- the guard would still demand a live grant — but it is not needed, so it is
-- not granted.

create policy support_meetings_read_own
  on public.support_meetings for select to authenticated
  using (user_id = auth.uid() or has_role_at_least('admin'));

create policy support_meetings_admin_all
  on public.support_meetings for all to authenticated
  using (has_role_at_least('admin'))
  with check (has_role_at_least('admin'));

-- ── VERIFICATION (run after apply) ─────────────────────────────────────────
--   select tablename, cmd, count(*) from pg_policies
--   where schemaname = 'public' and tablename like 'support%'
--   group by 1,2 order by 1,2;
--   -- expect 15 policies across the 6 tables
--
--   -- THE APPROVAL CONDITION, as a query. Must return zero rows:
--   select policyname, tablename, cmd, roles from pg_policies
--   where schemaname = 'public' and tablename = 'support_tickets'
--     and cmd in ('UPDATE','ALL')
--     and qual not like '%has_role_at_least%';
--   -- zero rows = no non-staff policy can update support_tickets, so a student
--   -- has no direct path to meeting_granted at all.
--
--   -- as a STUDENT session, each of these must be refused:
--   update support_tickets set meeting_granted = true where user_id = auth.uid();
--   -- expect: 0 rows updated (no policy grants UPDATE), NOT a guard error —
--   -- the verb is missing before the value is ever inspected
--
--   insert into support_tickets (user_id, category, subject, meeting_granted)
--     values (auth.uid(), 'other', 'trying it on', true);
--   -- expect: new row violates row-level security policy
--
--   update support_meeting_slots set active = false;
--   -- expect: 0 rows
--
--   -- THE LIFECYCLE HOLE THIS REVISION CLOSES. Runnable end to end:
--   --   1. as a STUDENT, on a live ticket, post a message and note its id:
--   insert into support_messages (ticket_id, sender_id, sender_role, body)
--     values ('<live ticket>', auth.uid(), 'student', 'here is the error')
--   returning id;                                      -- expect: succeeds
--   --   2. as an AGENT, close that ticket:
--   select admin_support_set_status('<live ticket>', 'closed');
--   --   3. as the SAME STUDENT, try to attach to that still-own message:
--   insert into support_attachments
--     (message_id, storage_path, mime_type, byte_size, uploaded_by)
--   values ('<message from step 1>', auth.uid()||'/x/1.png', 'image/png', 1024, auth.uid());
--   -- expect: ERROR new row violates row-level security policy
--   --         for table "support_attachments"
--   --
--   -- BEFORE this revision step 3 SUCCEEDED: the policy checked only that the
--   -- student wrote the message, never that the ticket still accepted content.
--   -- Re-run the same three steps with the ticket left open at step 2 and step
--   -- 3 must succeed, or the fix has over-corrected.
--
--   -- the same rule, at the resolved boundary once a reopen window is set:
--   --   with support.reopen_window_days = '7', an attachment onto a message in
--   --   a ticket resolved 8 days ago is refused; 6 days ago it is accepted.
--   --   Both follow from support_student_can_post(), not from a second copy of
--   --   the rule living in the attachment policy.
--
--   -- a slot another student has booked must not appear as bookable:
--   select count(*) from support_meeting_slots where starts_at > now();
--   -- expect: free slots only; compare against an admin session's count
--
--   -- THE PRIVILEGE MODEL, as a query. anon must be false everywhere;
--   -- authenticated must be false for the settings reader and true for the two
--   -- the policies call, or those policies raise 42501 for every student:
--   select p.proname,
--          has_function_privilege('anon',          p.oid, 'execute') as anon,
--          has_function_privilege('authenticated', p.oid, 'execute') as authed,
--          array_to_string(p.proacl, ' | ') as acl
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public' and p.proname in
--     ('support_setting_int','support_student_can_post','support_slot_is_open');
--   -- expect:
--   --   support_setting_int        anon=false  authed=FALSE
--   --   support_student_can_post   anon=false  authed=TRUE
--   --   support_slot_is_open       anon=false  authed=TRUE
--   -- and no 'PUBLIC=X' (an ACL entry with an empty grantee) in any acl.
--
--   -- the grants are load-bearing, so this must SUCCEED as a student:
--   insert into support_messages (ticket_id, sender_id, sender_role, body)
--     values ('<own live ticket>', auth.uid(), 'student', 'privilege smoke test');
--   -- if support_student_can_post were left ungranted this raises
--   --   ERROR: permission denied for function support_student_can_post
--
--   -- support_setting_int must NOT be reachable directly as a student:
--   select support_setting_int('usd_to_egp_rate');
--   -- expect: ERROR permission denied for function support_setting_int
--   -- while a student's message insert still works, because the call inside
--   -- support_student_can_post() runs as the owner.
--
--   -- the reader is TOTAL — none of these may raise, all must return NULL:
--   --   (set the value, then call, as an owner session)
--   --   ''  '  '  'abc'  '12.5'  '-3'  '99999999999999999999'
--   select support_setting_int('support.reopen_window_days');
