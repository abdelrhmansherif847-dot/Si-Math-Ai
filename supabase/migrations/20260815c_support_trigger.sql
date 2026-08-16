-- =====================================================================
-- Help & Support · 3 of 6 — the ticket-touch trigger
-- =====================================================================
-- STATUS: ⛔ PREPARED — NOT YET APPLIED. Awaiting owner approval.
--         Revision 3. Revision 2 reconciled this file against the APPROVED
--         revision 4 of 20260815a and the approved 20260815b; revision 3 makes
--         last_message_at monotonic — see LAST_MESSAGE_AT below.
-- DEPENDS ON: 20260815a — support_tickets/support_messages, and TWO triggers
--                         this file's UPDATE now passes through:
--                           support_tickets_guard_transitions (validates the
--                             status edge this function makes)
--                           support_tickets_set_updated_at   (stamps updated_at,
--                             so this function must NOT)
--             20260815b — the absence of a student UPDATE policy on
--                         support_tickets, which is why this runs as definer
--
-- WHY THIS EXISTS
-- ---------------
-- Two facts about a ticket are consequences of its conversation, not choices a
-- client should make:
--
--   last_message_at  — the sort key for BOTH the student's list and the agent
--                      queue. If a client forgets to bump it, the ticket sinks
--                      and nobody sees it. That is a silent failure, and the
--                      student experiences it as being ignored.
--   status           — a student replying to an awaiting_student ticket has,
--                      by definition, moved it back to in_progress. Asking two
--                      separate front-ends to agree on that is how the two
--                      disagree.
--
-- So the database derives both from the message insert. There is one writer.
--
-- WHY SECURITY DEFINER
-- --------------------
-- A student has no UPDATE policy on support_tickets — 20260815b deliberately
-- grants none, and that absence is the carry-forward condition Migration 1 was
-- approved under. This trigger therefore cannot run with the caller's
-- privileges; it runs as owner, with search_path pinned, and touches exactly
-- three columns on exactly the ticket the message was inserted into. It cannot
-- be called directly: a trigger function is only reachable through its event.
--
-- WHAT THIS FILE NO LONGER DOES — RECONCILED IN REVISION 2
-- --------------------------------------------------------
-- Revision 1 set `updated_at = now()` by hand in all three branches. Revision 4
-- of 20260815a introduced support_set_updated_at() as a BEFORE UPDATE trigger
-- on this very table, precisely so that no writer has to remember. Keeping the
-- manual assignment would be harmless at runtime — the BEFORE trigger overwrites
-- it either way — but it would contradict the contract in the same repository:
-- the next person to read it would reasonably conclude that writers ARE expected
-- to stamp the column, and the first one who then forgets produces a timestamp
-- that lies. The assignment is removed. updated_at is the database's job now, in
-- one place.
--
-- LAST_MESSAGE_AT IS MONOTONIC — RAISED IN REVISION 3
-- ---------------------------------------------------
-- All three branches write it through greatest(), not by assignment. Plain
-- assignment let the sort key move BACKWARDS, by two independent routes:
--
--   1. now() is TRANSACTION START time, not statement time, so a transaction
--      that began earlier can commit later and legitimately carry the earlier
--      created_at:
--
--        T1 begins 10:00:00                          (created_at 10:00:00)
--        T2 begins 10:00:01, inserts, commits        last_message_at = 10:00:01
--        T1 inserts — blocks on the FOR UPDATE below,
--                     then proceeds                  last_message_at = 10:00:00
--
--      The row lock serialises the two triggers correctly; what it cannot do is
--      make the later writer hold the later timestamp.
--
--   2. support_messages.created_at is DEFAULTED, not constrained. Any writer
--      supplying an explicit older value — an agent RPC recording a note, a
--      backfill — drags the key backwards with no concurrency at all.
--
-- Either way the ticket sinks below tickets that have been quiet longer, in the
-- very queue this trigger exists to keep honest, and the student experiences it
-- as being ignored. greatest() closes both routes at once. last_message_at is
-- NOT NULL, so there is no null case to reason about.
--
-- EVERY TRANSITION HERE IS LEGAL UNDER THE GUARD
-- ----------------------------------------------
-- This function UPDATEs support_tickets, so support_tickets_guard() runs before
-- each of the writes below and would raise on an illegal edge. Checked against
-- the guard's table in 20260815a:
--
--   awaiting_student → in_progress   permitted
--   resolved         → in_progress   permitted (the reopen path)
--   open             → in_progress   permitted
--   (no status change)               the guard's status block does not fire
--
-- If a future edit adds a branch here, it must appear in that table too, or the
-- message insert will fail at runtime rather than silently misfile the ticket.
--
-- WHAT IT DOES NOT DO
-- -------------------
-- It does not close tickets, and it does not expire anything. No interval has
-- been chosen for auto-close, and this file will not invent one. Only an agent
-- moves a ticket to 'closed'. It also never touches meeting_granted: the grant
-- is spent by support_meetings_consume_grant() when a meeting row is created,
-- and a conversation is not a booking.
-- =====================================================================

create or replace function public.support_touch_ticket()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_status public.support_ticket_status;
begin
  select status into v_status
  from public.support_tickets
  where id = new.ticket_id
  for update;

  if not found then
    -- The FK makes this unreachable; failing loudly beats a silent no-op if it
    -- ever becomes reachable.
    raise exception 'support_touch_ticket: ticket % not found', new.ticket_id;
  end if;

  -- Status transitions. Each is the only reading of the event that makes sense;
  -- everything else deliberately leaves status alone.
  --
  --   student writes on 'awaiting_student' → in_progress  (they answered)
  --   student writes on 'resolved'         → in_progress  (the reopen path)
  --   student writes on 'open'             → open         (no agent yet; a
  --                                                        student adding
  --                                                        detail has not
  --                                                        assigned anyone)
  --   agent   writes on 'open'             → in_progress  (someone picked it up)
  --
  -- 'closed' is absent from every branch. A student cannot post there — both
  -- support_messages_insert_own and support_attachments_insert_own require
  -- support_student_can_post(), which refuses a closed ticket — and an agent's
  -- reply goes through admin_support_reply(), which sets status explicitly. An
  -- agent who does append to a closed ticket falls to the else branch: the note
  -- is recorded, last_message_at moves, and the ticket stays closed, which is
  -- what "terminal" has to mean if it means anything.

  if new.sender_role = 'student' and v_status in ('awaiting_student', 'resolved') then
    update public.support_tickets
       set status          = 'in_progress',
           -- Cleared with the transition. A stale resolved_at would misreport
           -- when the ticket was last settled, and any reopen-window policy
           -- configured later would read a date that no longer means anything.
           -- support_tickets_resolved_stamp_chk requires this to be null for
           -- every status except 'resolved' and 'closed', so it is also what
           -- makes the write legal.
           resolved_at     = null,
           last_message_at = greatest(support_tickets.last_message_at, new.created_at)
     where id = new.ticket_id;

  elsif new.sender_role = 'agent' and v_status = 'open' then
    update public.support_tickets
       set status          = 'in_progress',
           last_message_at = greatest(support_tickets.last_message_at, new.created_at)
     where id = new.ticket_id;

  else
    update public.support_tickets
       set last_message_at = greatest(support_tickets.last_message_at, new.created_at)
     where id = new.ticket_id;
  end if;

  return null;  -- AFTER trigger; the return value is discarded
end;
$$;

comment on function public.support_touch_ticket() is
  'AFTER INSERT on support_messages: maintains last_message_at and derives the status transitions that follow from who wrote. SECURITY DEFINER because students hold no UPDATE on support_tickets. Does not stamp updated_at — support_set_updated_at() owns that column.';

create trigger support_messages_touch_ticket
  after insert on public.support_messages
  for each row
  execute function public.support_touch_ticket();

-- PRIVILEGE NOTE — deliberately NOT the explicit revoke/grant model that
-- 20260815b uses for its three helpers, and this is the reason, recorded so the
-- difference is not re-flagged as the same defect.
--
-- That model exists because this project's default ACL for functions in public
-- (pg_default_acl, grantor postgres) is
--     postgres=X | anon=X | authenticated=X | service_role=X
-- so an ordinary function is created directly callable by any logged-in user,
-- and revoking anon alone leaves that open. Those three helpers are ordinary
-- callable functions, so the grant matters there.
--
-- This one is not. support_touch_ticket() is `returns trigger`, and `trigger`
-- is a pseudo-type that cannot appear in an expression: Postgres refuses the
-- call with "trigger functions can only be called as triggers" whatever the
-- grants say. The EXECUTE privilege here is INERT — not merely unused, but
-- unusable — so the revoke below is hygiene rather than a control, and the same
-- is true of all four trigger functions in 20260815a.
--
-- If this function is ever changed to return something other than `trigger`,
-- that reasoning evaporates and it needs 20260815b's explicit model instead.
revoke all on function public.support_touch_ticket() from anon;

-- ── VERIFICATION (run after apply) ─────────────────────────────────────────
--   -- as a student, on a ticket sitting in awaiting_student:
--   insert into support_messages (ticket_id, sender_id, sender_role, body)
--   values ('<ticket>', auth.uid(), 'student', 'here is the screenshot');
--   select status, resolved_at, last_message_at, updated_at
--   from support_tickets where id = '<ticket>';
--   -- expect: in_progress, null, = the message's created_at, and updated_at
--   --         MOVED even though this function never assigns it — that is
--   --         support_set_updated_at() doing its job, and the check would go
--   --         red if the BEFORE UPDATE trigger were ever dropped.
--
--   -- the reopen path, end to end:
--   select admin_support_set_status('<ticket>', 'resolved');   -- as an agent
--   insert into support_messages (...) values ('<ticket>', auth.uid(), 'student', 'still broken');
--   select status, resolved_at from support_tickets where id = '<ticket>';
--   -- expect: in_progress, null
--
--   -- a closed ticket refuses the student at the POLICY, not here:
--   select admin_support_set_status('<ticket>', 'closed');
--   insert into support_messages (...) values ('<ticket>', auth.uid(), 'student', 'hello');
--   -- expect: new row violates row-level security policy for table
--   --         "support_messages"   (not a support_touch_ticket error)
--
--   -- every branch is legal under the guard. This must NOT raise:
--   --   an illegal edge would surface as
--   --   ERROR illegal ticket status transition: <old> -> <new>
--
--   -- MONOTONICITY, the revision 3 fix. Deterministic, no concurrency needed:
--   select last_message_at from support_tickets where id = '<ticket>';   -- note it
--   insert into support_messages (ticket_id, sender_id, sender_role, body, created_at)
--     values ('<ticket>', auth.uid(), 'agent', 'a backdated note', now() - interval '2 days');
--   select last_message_at from support_tickets where id = '<ticket>';
--   -- expect: UNCHANGED. Under plain assignment it would have jumped two days
--   -- backwards and sunk the ticket in the queue, so this check could go red.
--
--   -- and a normal forward message still moves it:
--   insert into support_messages (ticket_id, sender_id, sender_role, body)
--     values ('<ticket>', auth.uid(), 'agent', 'a current note');
--   -- expect: last_message_at = that message's created_at
--
--   -- the trigger function cannot be invoked directly, whatever the grants:
--   select public.support_touch_ticket();
--   -- expect: ERROR trigger functions can only be called as triggers
--   -- (this is why the revoke above is hygiene, not a control)
--
--   select has_function_privilege('anon',
--     'public.support_touch_ticket()', 'execute');   -- expect false
