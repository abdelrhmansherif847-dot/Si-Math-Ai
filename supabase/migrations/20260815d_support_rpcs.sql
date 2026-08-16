-- =====================================================================
-- Help & Support · 4 of 6 — the RPC boundary
-- =====================================================================
-- STATUS: ⛔ PREPARED — NOT YET APPLIED. Awaiting owner approval.
--         Revision 6. Revision 2 reconciled this file against APPROVED
--         20260815a rev 4, 20260815b rev 4 and 20260815c rev 3; revision 3
--         made the per-student meeting ceiling race-safe and applied it to
--         BOTH booking doors; revision 4 moved its advisory lock into an
--         explicit support namespace — see section 0b. Revision 5 changed NO
--         executable SQL: it repaired the pg_locks verification, which could
--         not have falsified the namespacing claim it was written to test
--         (signed-vs-unsigned key representation, missing objsubid assertion,
--         unscoped post-commit check). See the VERIFICATION block.
--
--         REVISION 6 IS TWO TOKENS, AND WITHOUT THEM THIS FILE COULD NOT BE
--         APPLIED AT ALL. Revisions 2-5 wrote, in both booking handlers:
--
--             get stacked diagnostics v_constraint = pg_exception_constraint;
--
--         PG_EXCEPTION_CONSTRAINT is not a GET STACKED DIAGNOSTICS item and
--         never has been. The item that carries the violated constraint's name
--         is CONSTRAINT_NAME; the PG_EXCEPTION_* items are DETAIL, HINT and
--         CONTEXT only. PL/pgSQL validates a function body at CREATE FUNCTION
--         time, so this was not a latent runtime bug waiting for a race — it
--         is a parse error, and applying this migration failed outright:
--
--             ERROR: unrecognized GET DIAGNOSTICS item at or near
--                    "pg_exception_constraint"
--
--         on support_book_meeting(), and again on
--         admin_support_schedule_for_student(). Five revisions of review read
--         past it because both handlers read correctly in English; only
--         executing the file found it. That is the lesson worth keeping: a
--         migration reviewed but never run is a migration whose syntax nobody
--         has checked.
--
--         Nothing else changed. The advisory lock, the capacity helper, every
--         function body, every grant and the whole VERIFICATION block are
--         byte-identical to revision 5.
-- DEPENDS ON: 20260815a — tables, and the four triggers that now own most of
--                         what revision 1 of this file did by hand
--             20260815b — support_setting_int(), support_slot_is_open(), and
--                         the privilege model this file follows
--             20260815c — support_touch_ticket(), which maintains
--                         last_message_at when these functions insert messages
--
-- WHY REVISION 1 HAD TO BE REWRITTEN, NOT PATCHED
-- -----------------------------------------------
-- It was written against revision 1 of the schema and referenced columns that
-- no longer exist: 8 uses of support_tickets.escalation_state and 9 of
-- support_meeting_slots.claimed_by / claimed_at. It would not have applied at
-- all. Beyond that it duplicated work the approved schema now does in triggers,
-- and duplicated logic is the thing this whole review has been removing.
--
-- WHAT THE SCHEMA NOW DOES, SO THIS FILE DOES NOT
-- -----------------------------------------------
--   support_meetings_guard()          ticket ownership, the staff-or-granted
--                                     authorisation rule, slot temporal
--                                     validity, provider assignment, and
--                                     slot_id/provider immutability
--   support_meetings_consume_grant()  spends meeting_granted on a successful
--                                     insert — this file must NOT clear it
--   support_tickets_guard()           legal status transitions, and the
--                                     staff-only rule on granting
--   support_set_updated_at()          updated_at on all three tables
--   one_per_slot / one_live_per_ticket  the two booking races
--
-- So booking is now an INSERT plus error translation, not a five-statement
-- dance. The authorisation rule lives on the row, where it holds for callers
-- that do not exist yet; these functions are the front door, not the lock.
--
-- WHAT THIS FILE STILL OWNS
-- -------------------------
-- Only what a policy or a trigger genuinely cannot express: the per-student
-- meeting cap, which spans rows the caller cannot see; writing sender_role =
-- 'agent', which RLS pins to 'student' for direct writes; the stamping of
-- resolved_at / closed_at with a status change; and error messages a student
-- can act on.
--
-- PRIVILEGE MODEL — the explicit form established in 20260815b rev 4
-- ------------------------------------------------------------------
-- This project's default ACL for functions in public (pg_default_acl, grantor
-- postgres) is  postgres=X | anon=X | authenticated=X | service_role=X,  so a
-- new function is created callable by any logged-in user and `revoke from anon`
-- does not change that. Every function below therefore states its own model:
--
--   support_require_agent      owner only     — internal; called only from
--                                               inside other definer functions
--   everything else            authenticated  — these ARE the client API;
--                                               each enforces its own role rule
--
-- The agent functions are granted to `authenticated` on purpose: a support
-- agent IS an authenticated user, and the role check happens INSIDE the
-- function via support_require_agent(). Granting by role at the privilege layer
-- instead would put the authorisation in two places that could disagree.
-- =====================================================================

-- ── 0. Staff guard ─────────────────────────────────────────────────────────
-- One definition, so an added function cannot quietly ship with a weaker check
-- than its neighbours. Not callable by clients: it is reached only from inside
-- the definer functions below, which run as the owner.

create or replace function public.support_require_agent()
returns void
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  if not public.has_role_at_least('admin') then
    raise exception 'forbidden: support agent role required'
      using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.support_require_agent() from public, anon, authenticated;

-- ── 0b. The per-student meeting ceiling ────────────────────────────────────
-- RAISED IN REVISION 3. Revision 2 inlined this as a count-then-insert inside
-- support_book_meeting() with nothing serialising the two halves, which is a
-- textbook check-then-act race:
--
--   cap = 1, one student holding grants on two different tickets
--     T1  count → 0            T2  count → 0
--     T1  INSERT meeting A     T2  INSERT meeting B
--     both commit → 2 scheduled meetings for a student capped at 1
--
-- Neither unique index catches it. support_meetings_one_per_slot_idx is keyed
-- by slot and the two bookings take different slots;
-- support_meetings_one_live_per_ticket_idx is keyed by ticket and the two
-- bookings are on different tickets. There is no per-USER uniqueness to lean
-- on, and there cannot be: "at most N" is not expressible as a unique index for
-- N > 1. So the serialisation has to be explicit.
--
-- A TRANSACTION-SCOPED ADVISORY LOCK, keyed by the student, is the mechanism.
-- Taken before the count, so the count is re-read under it; held to commit, so
-- the INSERT that follows is inside the same critical section. Concurrent
-- bookings for ONE student queue; bookings for different students never touch
-- each other. Nothing is locked that another feature reads, unlike taking
-- `FOR UPDATE` on the student's profiles row.
--
-- THE NAMESPACE IS EXPLICIT — RAISED IN REVISION 4.
-- Revision 3 used the single-key form, pg_advisory_xact_lock(bigint), whose
-- argument lands in the ONE global 64-bit advisory space this database has.
-- That is correct today and was never a race: a collision there costs
-- contention, never a breached cap. But it makes support's lock key a squatter
-- in a space every future feature also draws from, and the next subsystem to
-- hash a value into it inherits an invisible dependency on what support
-- happens to hash to.
--
-- The two-key form partitions that space:
--
--     pg_advisory_xact_lock(SUPPORT_LOCK_NS, hashtext(p_user_id::text))
--                           └ key1: int4    └ key2: int4
--
--   key1 = 20260815 — a fixed constant CLAIMED BY THE SUPPORT SUBSYSTEM for
--          advisory locking. The value is this migration's date stamp: within
--          int4, and distinctive enough that no unrelated feature arrives at it
--          by picking a small number. Recorded here as the claim.
--   key2 = hashtext(user id) — deterministic per student, int4 as the two-key
--          form requires. hashtext may return a negative integer; advisory
--          locks accept any int4, so that is fine.
--
-- Collisions are now confined to support's own key2 space: two students whose
-- ids hash alike serialise with each other and with nothing else in the
-- database. The cost of a collision is still contention, never incorrectness —
-- but its blast radius is now this subsystem instead of the whole instance.
--
-- If support ever needs a SECOND lock class, it reuses key1 = 20260815 and
-- derives key2 differently — and whatever does that must not collide with the
-- per-student derivation above, which is why there is exactly one
-- pg_advisory_xact_lock call in this file and it lives here.
--
-- WHEN NO CAP IS CONFIGURED — the setting ships empty — this returns before
-- taking any lock. There is no invariant to protect, so there is nothing to
-- serialise, and the common path pays nothing.
--
-- THE CAP IS A PER-STUDENT PRODUCT RULE, AND BOTH BOOKING DOORS ENFORCE IT.
-- Revision 2 checked it only on the student's own path, so an agent using
-- admin_support_schedule_for_student() could exceed it without even racing. A
-- ceiling that one door ignores is not a ceiling — and the setting's own
-- description says "per student", not "per student booking through the
-- self-service path". An agent who genuinely needs to exceed it raises the
-- setting or cancels an existing meeting; both are visible, deliberate acts,
-- which a silent bypass is not.
--
-- To make agent scheduling exempt instead, drop the call from
-- admin_support_schedule_for_student() — one line, and a product decision, not
-- a cleanup.

create or replace function public.support_assert_meeting_capacity(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_cap    integer := public.support_setting_int('support.max_active_meetings_per_student');
  v_active integer;
begin
  if v_cap is null then
    return;
  end if;

  -- key1 = 20260815: the support subsystem's claimed advisory namespace.
  -- key2 = hashtext(student): deterministic, per student, int4.
  -- Taken BEFORE the count below and held to commit, so the count and the
  -- caller's INSERT are one critical section.
  perform pg_advisory_xact_lock(20260815, hashtext(p_user_id::text));

  select count(*) into v_active
  from public.support_meetings
  where user_id = p_user_id and status = 'scheduled';

  if v_active >= v_cap then
    raise exception 'meeting_limit_reached: at most % scheduled meeting(s) at a time', v_cap
      using errcode = '42501';
  end if;
end;
$$;

comment on function public.support_assert_meeting_capacity(uuid) is
  'Enforces support.max_active_meetings_per_student under a transaction-scoped advisory lock keyed by the student, so the count and the INSERT that follows are one critical section. No-op when the setting is unset.';

revoke all on function public.support_assert_meeting_capacity(uuid) from public, anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- STUDENT-CALLABLE
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Book a meeting ──────────────────────────────────────────────────────
-- Reduced to its essentials by the approved schema. It no longer checks the
-- grant (support_meetings_guard does), no longer claims the slot (occupancy is
-- derived), no longer moves the ticket (there is no escalation column) and no
-- longer clears the grant (support_meetings_consume_grant does, AFTER the row
-- exists). What remains is the cap, the insert, and turning two unique
-- violations into sentences a student can act on.
--
-- provider is taken from the slot in the INSERT ... SELECT rather than passed
-- as a placeholder. The guard assigns it authoritatively either way, but a
-- function that fabricates a value only to have it overwritten reads as though
-- the caller's value matters, and one day someone will believe it.
--
-- provider_ref stays '{}' — "link pending". Postgres cannot call the meeting
-- provider's API, and holding this transaction open across a network round-trip
-- would be worse than the problem it solves. The Edge Function fills it after
-- commit; support_meetings_pending_link_idx makes any gap visible to agents.

create or replace function public.support_book_meeting(
  p_ticket_id uuid,
  p_slot_id   uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_meeting    uuid;
  v_constraint text;
begin
  -- The cap spans rows the caller cannot see, which is why it is here and not
  -- in a policy, and it is a check-then-act, which is why it is serialised.
  -- Both concerns live in the helper — see its header for the race this
  -- replaced. The advisory lock it takes is held to commit, so the INSERT
  -- below is inside the same critical section as the count.
  perform public.support_assert_meeting_capacity(auth.uid());

  begin
    insert into public.support_meetings
      (ticket_id, slot_id, user_id, provider, created_by)
    select p_ticket_id, p_slot_id, auth.uid(), s.provider, auth.uid()
    from public.support_meeting_slots s
    where s.id = p_slot_id
    returning id into v_meeting;
  exception
    when unique_violation then
      -- Which index fired decides which sentence the student reads.
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint = 'support_meetings_one_per_slot_idx' then
        raise exception 'slot_unavailable: that time is no longer free'
          using errcode = '55006';
      elsif v_constraint = 'support_meetings_one_live_per_ticket_idx' then
        raise exception 'meeting_already_scheduled: this ticket already has a meeting booked'
          using errcode = '55006';
      else
        raise;
      end if;
  end;

  -- Zero rows means the slot id matched nothing. The guard never ran, so it had
  -- no chance to say so.
  if v_meeting is null then
    raise exception 'slot_not_found: %', p_slot_id using errcode = '23503';
  end if;

  return v_meeting;
end;
$$;

revoke all on function public.support_book_meeting(uuid, uuid) from public, anon;
grant  execute on function public.support_book_meeting(uuid, uuid) to authenticated;

-- ── 2. Cancel own meeting ──────────────────────────────────────────────────
-- Cancelling releases the slot by derivation: support_meetings_one_per_slot_idx
-- excludes 'cancelled', so the window returns to the pool with no second write.
--
-- THE GRANT IS NOT RESTORED. Owner decision, recorded in 20260815a's header:
-- every meeting must be preceded by a deliberate support decision, so a student
-- whose meeting is called off needs a fresh grant before booking again. This
-- function deliberately does not touch meeting_granted, and a future edit that
-- adds `set meeting_granted = true` here would reverse a product decision, not
-- fix an oversight.

create or replace function public.support_cancel_meeting(p_meeting_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_id uuid;
begin
  update public.support_meetings
     set status = 'cancelled'
   where id = p_meeting_id
     and user_id = auth.uid()
     and status = 'scheduled'
  returning id into v_id;

  if v_id is null then
    raise exception 'meeting_not_cancellable: not yours, or not currently scheduled'
      using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.support_cancel_meeting(uuid) from public, anon;
grant  execute on function public.support_cancel_meeting(uuid) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- AGENT-ONLY  (granted to authenticated; the role check is inside each one)
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 3. Reply ───────────────────────────────────────────────────────────────
-- The only writer of sender_role = 'agent'. RLS pins direct inserts to
-- 'student', so this function is what makes an agent's message an agent's
-- message. last_message_at follows from support_touch_ticket().

create or replace function public.admin_support_reply(
  p_ticket_id  uuid,
  p_body       text,
  p_set_status public.support_ticket_status default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_message uuid;
begin
  perform public.support_require_agent();

  insert into public.support_messages (ticket_id, sender_id, sender_role, body)
  values (p_ticket_id, auth.uid(), 'agent', p_body)
  returning id into v_message;

  if p_set_status is not null then
    perform public.admin_support_set_status(p_ticket_id, p_set_status);
  end if;

  return v_message;
end;
$$;

revoke all on function public.admin_support_reply(uuid, text, public.support_ticket_status) from public, anon;
grant  execute on function public.admin_support_reply(uuid, text, public.support_ticket_status) to authenticated;

-- ── 4. Set status ──────────────────────────────────────────────────────────
-- Stamps resolved_at / closed_at with the transition, because
-- support_tickets_resolved_stamp_chk and support_tickets_closed_stamp_chk
-- require the timestamps to agree with the state.
--
-- It does NOT carry its own table of legal transitions. support_tickets_guard()
-- owns that, and an illegal edge raises from there — one definition, not two
-- that can drift apart.

create or replace function public.admin_support_set_status(
  p_ticket_id uuid,
  p_status    public.support_ticket_status
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  perform public.support_require_agent();

  update public.support_tickets
     set status      = p_status,
         resolved_at = case
                         when p_status = 'resolved' then coalesce(resolved_at, now())
                         when p_status = 'closed'   then resolved_at
                         else null
                       end,
         closed_at   = case when p_status = 'closed' then coalesce(closed_at, now()) else null end
   where id = p_ticket_id;

  if not found then
    raise exception 'ticket_not_found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.admin_support_set_status(uuid, public.support_ticket_status) from public, anon;
grant  execute on function public.admin_support_set_status(uuid, public.support_ticket_status) to authenticated;

-- ── 5. Assign ──────────────────────────────────────────────────────────────
-- Validates that the target holds a staff role, so a ticket cannot be assigned
-- into a black hole. NULL clears the assignment.

create or replace function public.admin_support_assign(
  p_ticket_id uuid,
  p_agent_id  uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  perform public.support_require_agent();

  if p_agent_id is not null
     and not exists (
       select 1 from public.profiles pr
       where pr.id = p_agent_id
         and public.user_role_level(pr.role) >= public.user_role_level('admin'::public.user_role)
     ) then
    raise exception 'not_an_agent: %', p_agent_id using errcode = '42501';
  end if;

  update public.support_tickets
     set assigned_to = p_agent_id
   where id = p_ticket_id;

  if not found then
    raise exception 'ticket_not_found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.admin_support_assign(uuid, uuid) from public, anon;
grant  execute on function public.admin_support_assign(uuid, uuid) to authenticated;

-- ── 6. Grant a meeting — the escalation door ───────────────────────────────
-- Sets meeting_granted, which support_tickets_guard() permits only for an
-- agent. Refuses while a meeting is already live: the grant would be
-- unspendable, because support_meetings_one_live_per_ticket_idx allows one
-- scheduled meeting per ticket, and a grant that cannot be used is a promise
-- the UI would show and the database would refuse.

create or replace function public.admin_support_grant_meeting(p_ticket_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  perform public.support_require_agent();

  update public.support_tickets t
     set meeting_granted = true
   where t.id = p_ticket_id
     and not t.meeting_granted
     and not exists (
       select 1 from public.support_meetings m
       where m.ticket_id = t.id and m.status = 'scheduled'
     );

  if not found then
    raise exception 'grant_not_applicable: ticket missing, already granted, or a meeting is already scheduled'
      using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.admin_support_grant_meeting(uuid) from public, anon;
grant  execute on function public.admin_support_grant_meeting(uuid) to authenticated;

-- ── 7. Revoke a grant ──────────────────────────────────────────────────────
-- Withdraws an unspent grant. A grant already spent on a meeting is not
-- reachable here — cancel the meeting instead, which is a different act with a
-- different audit trail.

create or replace function public.admin_support_revoke_meeting(p_ticket_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  perform public.support_require_agent();

  update public.support_tickets
     set meeting_granted = false
   where id = p_ticket_id
     and meeting_granted;

  if not found then
    raise exception 'revoke_not_applicable: no unspent grant on this ticket'
      using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.admin_support_revoke_meeting(uuid) from public, anon;
grant  execute on function public.admin_support_revoke_meeting(uuid) to authenticated;

-- ── 8. Schedule directly for a student ─────────────────────────────────────
-- The second door, per the owner decision: an agent books on the student's
-- behalf without first granting and waiting. No grant is required — the guard's
-- staff branch authorises it, and support_meetings_consume_grant's guarded
-- WHERE makes the consume a no-op when there was no grant to spend.

create or replace function public.admin_support_schedule_for_student(
  p_ticket_id uuid,
  p_slot_id   uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_user       uuid;
  v_meeting    uuid;
  v_constraint text;
begin
  perform public.support_require_agent();

  select user_id into v_user from public.support_tickets where id = p_ticket_id;
  if v_user is null then
    raise exception 'ticket_not_found' using errcode = 'P0002';
  end if;

  -- The ceiling is a per-STUDENT rule, so it binds this door too, and the lock
  -- is keyed by the student — v_user, never auth.uid(), which here is the
  -- agent. Revision 2 omitted this entirely: an agent could exceed the cap
  -- without even racing for it.
  perform public.support_assert_meeting_capacity(v_user);

  begin
    insert into public.support_meetings
      (ticket_id, slot_id, user_id, provider, created_by)
    select p_ticket_id, p_slot_id, v_user, s.provider, auth.uid()
    from public.support_meeting_slots s
    where s.id = p_slot_id
    returning id into v_meeting;
  exception
    when unique_violation then
      get stacked diagnostics v_constraint = constraint_name;
      if v_constraint = 'support_meetings_one_per_slot_idx' then
        raise exception 'slot_unavailable: that time is already taken'
          using errcode = '55006';
      elsif v_constraint = 'support_meetings_one_live_per_ticket_idx' then
        raise exception 'meeting_already_scheduled: this ticket already has a meeting booked'
          using errcode = '55006';
      else
        raise;
      end if;
  end;

  if v_meeting is null then
    raise exception 'slot_not_found: %', p_slot_id using errcode = '23503';
  end if;

  return v_meeting;
end;
$$;

revoke all on function public.admin_support_schedule_for_student(uuid, uuid) from public, anon;
grant  execute on function public.admin_support_schedule_for_student(uuid, uuid) to authenticated;

-- ── 9. Create or edit a slot ───────────────────────────────────────────────
-- jsonb payload, matching the admin_upsert_plan(jsonb) convention already in
-- the database. Refuses to move a window someone is holding: the student was
-- told a time, and silently changing it is worse than refusing.
--
-- Occupancy is asked of support_slot_is_open() from 20260815b rather than
-- re-derived here — one definition of "taken", shared with the RLS policy that
-- decides what a student may see.

create or replace function public.admin_support_upsert_slot(p_slot jsonb)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_id uuid := nullif(p_slot->>'id', '')::uuid;
begin
  perform public.support_require_agent();

  if v_id is null then
    insert into public.support_meeting_slots
      (starts_at, ends_at, provider, host_id, active, created_by)
    values (
      (p_slot->>'starts_at')::timestamptz,
      (p_slot->>'ends_at')::timestamptz,
      coalesce(nullif(p_slot->>'provider', ''), 'zoom'),
      nullif(p_slot->>'host_id', '')::uuid,
      coalesce((p_slot->>'active')::boolean, true),
      auth.uid()
    )
    returning id into v_id;
    return v_id;
  end if;

  update public.support_meeting_slots s
     set starts_at = coalesce((p_slot->>'starts_at')::timestamptz, s.starts_at),
         ends_at   = coalesce((p_slot->>'ends_at')::timestamptz,   s.ends_at),
         provider  = coalesce(nullif(p_slot->>'provider', ''),     s.provider),
         host_id   = coalesce(nullif(p_slot->>'host_id', '')::uuid, s.host_id),
         active    = coalesce((p_slot->>'active')::boolean,        s.active)
   where s.id = v_id
     and public.support_slot_is_open(s.id);

  if not found then
    raise exception 'slot_locked: missing, or a meeting is booked against it'
      using errcode = '42501';
  end if;

  return v_id;
end;
$$;

revoke all on function public.admin_support_upsert_slot(jsonb) from public, anon;
grant  execute on function public.admin_support_upsert_slot(jsonb) to authenticated;

-- ── 10. Retire a slot ──────────────────────────────────────────────────────
-- Sets active = false rather than deleting: support_meetings.slot_id is ON
-- DELETE RESTRICT, and a retired window still has to explain the meetings that
-- referenced it. Same refusal as above, same reason.

create or replace function public.admin_support_cancel_slot(p_slot_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  perform public.support_require_agent();

  update public.support_meeting_slots
     set active = false
   where id = p_slot_id
     and public.support_slot_is_open(id);

  if not found then
    raise exception 'slot_locked: missing, or a meeting is booked against it — cancel the meeting instead'
      using errcode = '42501';
  end if;
end;
$$;

revoke all on function public.admin_support_cancel_slot(uuid) from public, anon;
grant  execute on function public.admin_support_cancel_slot(uuid) to authenticated;

-- ── 11. Create or edit a help-centre article ───────────────────────────────

create or replace function public.admin_support_upsert_article(p_article jsonb)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_id uuid;
begin
  perform public.support_require_agent();

  insert into public.support_articles
    (slug, category, question, answer_md, sort_order, published, updated_by)
  values (
    p_article->>'slug',
    (p_article->>'category')::public.support_category,
    p_article->>'question',
    p_article->>'answer_md',
    coalesce((p_article->>'sort_order')::integer, 100),
    coalesce((p_article->>'published')::boolean, false),
    auth.uid()
  )
  on conflict (slug) do update
    set category   = excluded.category,
        question   = excluded.question,
        answer_md  = excluded.answer_md,
        sort_order = excluded.sort_order,
        published  = excluded.published,
        updated_by = excluded.updated_by
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.admin_support_upsert_article(jsonb) from public, anon;
grant  execute on function public.admin_support_upsert_article(jsonb) to authenticated;

-- ── VERIFICATION (run after apply) ─────────────────────────────────────────
--   -- PRIVILEGE MODEL. anon false everywhere; authenticated false ONLY for the
--   -- internal guard:
--   select p.proname,
--          has_function_privilege('anon',          p.oid, 'execute') as anon,
--          has_function_privilege('authenticated', p.oid, 'execute') as authed
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public'
--     and (p.proname like 'support[_]%' or p.proname like 'admin[_]support[_]%')
--   order by 1;
--   -- expect: anon = false for all; authed = false ONLY for
--   --         support_require_agent and support_setting_int.
--
--   -- THE ESCALATION RULE, as a student, on an ungranted own ticket:
--   select support_book_meeting('<own ticket>', '<free future slot>');
--   -- expect: ERROR not_granted  (raised by support_meetings_guard, not here —
--   --         this file no longer checks it, and that is the point)
--
--   -- as a student, on someone else's ticket:
--   -- expect: ERROR not_your_ticket
--
--   -- the grant is spent by booking and NOT returned by cancelling:
--   select admin_support_grant_meeting('<ticket>');          -- as agent
--   select meeting_granted from support_tickets where id = '<ticket>';  -- true
--   select support_book_meeting('<ticket>', '<slot>');       -- as student
--   select meeting_granted from support_tickets where id = '<ticket>';  -- FALSE
--   select support_cancel_meeting('<meeting>');              -- as student
--   select meeting_granted from support_tickets where id = '<ticket>';  -- still FALSE
--
--   -- and the cancelled slot is bookable again once a new grant exists:
--   select support_slot_is_open('<slot>');                   -- expect true
--
--   -- TWO STUDENTS racing for the last slot — tests one_per_slot_idx:
--   -- expect: one uuid, one ERROR slot_unavailable  (never two meetings)
--
--   -- ONE STUDENT racing themselves — tests the CAP, which no index protects.
--   -- This is the case revision 2 got wrong; run it in two psql sessions.
--   --   setup, as an agent:
--   update system_settings set value = '1'
--     where key = 'support.max_active_meetings_per_student';
--   select admin_support_grant_meeting('<ticket A>');   -- same student
--   select admin_support_grant_meeting('<ticket B>');   -- two live grants
--   --   then, concurrently, as that student:
--   --     session 1:  begin;
--   --                 select support_book_meeting('<ticket A>', '<free slot 1>');
--   --                 -- succeeds, returns a uuid; DO NOT COMMIT YET
--   --     session 2:  begin;
--   --                 select support_book_meeting('<ticket B>', '<free slot 2>');
--   --                 -- BLOCKS on the advisory lock, which is the fix working
--   --     session 1:  commit;
--   --     session 2:  -- unblocks, re-counts under the lock, sees 1 >= 1
--   --                 -- expect: ERROR meeting_limit_reached
--   --                 rollback;
--   --
--   -- Under revision 2 both sessions saw count = 0 and BOTH committed, leaving
--   -- a capped-at-1 student holding two scheduled meetings. The invariant, as
--   -- an assertion that must hold at every instant:
--   select user_id, count(*) from support_meetings where status = 'scheduled'
--   group by 1 having count(*) > (select value::int from system_settings
--                                 where key = 'support.max_active_meetings_per_student');
--   -- expect: 0 rows, always
--
--   -- THE AGENT DOOR OBEYS THE SAME CEILING (revision 3; revision 2 skipped it):
--   --   with cap = 1 and the student already holding one scheduled meeting,
--   select admin_support_schedule_for_student('<ticket B>', '<free slot 2>');
--   -- expect: ERROR meeting_limit_reached
--   -- If the product decision changes to "agents may exceed the cap", this
--   -- case must be deleted along with the call in that function — the two go
--   -- together, and neither is a cleanup.
--
--   -- no cap configured means no lock is taken at all:
--   update system_settings set value = '' where key = 'support.max_active_meetings_per_student';
--   -- bookings proceed with no serialisation; nothing to protect, nothing to pay
--
--   -- ── THE ADVISORY NAMESPACE (revision 4) ────────────────────────────────
--   -- 1. Exactly ONE place in the support surface takes an advisory lock, so
--   --    "all capacity locks share the namespace" is true by construction
--   --    rather than by convention:
--   select p.proname
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public'
--     and (p.proname like 'support[_]%' or p.proname like 'admin[_]support[_]%')
--     and p.prosrc ~ 'pg_advisory';
--   -- expect exactly 1 row: support_assert_meeting_capacity
--
--   -- 2. That one call uses the two-key form with the claimed namespace, and
--   --    the single-key global form appears nowhere:
--   select p.prosrc ~ 'pg_advisory_xact_lock\(20260815,'      as uses_support_ns,
--          p.prosrc ~ 'pg_advisory_xact_lock\([^,)]*\)'       as uses_global_form
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public' and p.proname = 'support_assert_meeting_capacity';
--   -- expect: uses_support_ns = true, uses_global_form = false
--
--   -- 3. The lock is REALLY in that namespace, on the right key, in the right
--   --    FORM, and REALLY transaction-scoped.
--   --
--   --    THREE THINGS THIS QUERY HAS TO GET RIGHT, each of which an earlier
--   --    draft of it got wrong:
--   --
--   --    (a) REPRESENTATION. hashtext() returns a SIGNED int4; pg_locks.objid
--   --        is an oid, which is UNSIGNED 32-bit. The same 32 bits print
--   --        differently, so comparing them raw invites a false negative on
--   --        exactly the students whose hash is negative — an intermittent
--   --        "failure" that is really a display artefact. Measured on this
--   --        database:
--   --            pg_advisory_xact_lock(20260815, -12345)
--   --              → classid 20260815, objid 4294954951
--   --            (-12345)::oid = 4294954951
--   --        So the expectation is cast to oid, and then both sides agree for
--   --        positive and negative hashes alike.
--   --
--   --    (b) FORM. objsubid distinguishes the two advisory lock shapes: 1 for
--   --        the single-key bigint form, 2 for the two-key form. Asserting
--   --        objsubid = 2 is what actually proves the NAMESPACE is real. With
--   --        the single-key form classid holds the high 32 bits of the key,
--   --        which could be any value at all — including, by coincidence,
--   --        something that looks like a namespace. Measured above: 2.
--   --
--   --    (c) SCOPE. pg_locks is cluster-wide and shows every session's locks,
--   --        so `where locktype = 'advisory'` alone is both flaky — an
--   --        unrelated lock elsewhere breaks it — and weak, because it never
--   --        names the lock it claims to be testing. Filter by backend and by
--   --        the exact key.
--   --
--   begin;
--   select support_book_meeting('<granted ticket>', '<free slot>');
--   select l.classid, l.objid, l.objsubid, l.mode, l.granted
--   from pg_locks l
--   where l.locktype = 'advisory'
--     and l.pid      = pg_backend_pid()
--     and l.classid  = 20260815
--     and l.objid    = hashtext('<student uuid>'::text)::oid
--     and l.objsubid = 2;
--   -- expect: exactly 1 row, mode = ExclusiveLock, granted = true
--   commit;
--   -- the SAME predicate, after commit — not "no advisory locks anywhere":
--   select count(*) from pg_locks l
--   where l.locktype = 'advisory'
--     and l.pid      = pg_backend_pid()
--     and l.classid  = 20260815
--     and l.objid    = hashtext('<student uuid>'::text)::oid
--     and l.objsubid = 2;
--   -- expect: 0 — THIS lock released by COMMIT, proven by name rather than by
--   --         the absence of every advisory lock in the cluster
--
--   -- 4. The agent door locks by the STUDENT, not by the agent. As an agent,
--   --    inside a transaction, schedule for a student and run the SAME query.
--   --    It must match with the student's uuid and must NOT match with the
--   --    agent's — that is the assertion that catches a v_user/auth.uid()
--   --    mix-up in admin_support_schedule_for_student, which is the most
--   --    plausible way this fix could be subtly wrong:
--   select hashtext('<student uuid>'::text)::oid as expect_this_objid,
--          hashtext('<agent   uuid>'::text)::oid as must_not_match;
--
--   -- granting while a meeting is live:
--   select admin_support_grant_meeting('<ticket with live meeting>');
--   -- expect: ERROR grant_not_applicable
--
--   -- editing a booked slot:
--   select admin_support_upsert_slot(jsonb_build_object('id','<booked slot>','starts_at',now()+interval '3 days'));
--   -- expect: ERROR slot_locked
--
--   -- no function in this file references a column the schema dropped:
--   select proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--   where n.nspname='public' and p.prosrc ~ '(escalation_state|claimed_by|claimed_at)';
--   -- expect: 0 rows
