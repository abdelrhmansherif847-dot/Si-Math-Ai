-- =====================================================================
-- Help & Support · 1 of 6 — enums, tables, constraints, indexes, invariants
-- =====================================================================
-- STATUS: ⛔ PREPARED — NOT YET APPLIED. Awaiting owner approval.
--         Spec: docs/engineering/support-system.md (to be written).
--         Revision 4, answering owner review of revision 3.
--
-- WHY THIS EXISTS
-- ---------------
-- The platform has no support channel. settings.html §9 ships "Contact
-- Support" and "Report a Problem" as disabled buttons with a comment saying
-- there is no address, form or channel anywhere on the site. This is that
-- channel.
--
-- THE ISOLATION RULE THIS FILE ENFORCES BY CONSTRUCTION
-- ----------------------------------------------------
-- Support data must never reach the academic side. That is a schema property
-- here, not a convention: no table below carries a foreign key into
-- question_records, mastery_records, weakness_signals, chat_sessions,
-- focus_plans, focus_tasks, study_plans or session_questions. The only shared
-- reference is auth.users / profiles, which every table in the database shares.
--
-- The database already refuses the worst case on its own:
--   weakness_signals_source_check CHECK (source IN ('AI_CHAT','MOCK_EXAM',
--   'FOCUS_PRACTICE'))
-- so a support-sourced weakness signal cannot be inserted at all. This
-- migration deliberately does NOT touch that constraint. A companion CI test
-- pins it so a future migration cannot widen it unnoticed.
--
-- =====================================================================
-- IDENTITY REFERENCE CONVENTION — verified, not assumed
-- =====================================================================
-- Two parents are used, and the split is a rule rather than an accident:
--
--   auth.users  for SUBJECT columns — who the row is *about*, and who must
--               take it with them when the account is deleted:
--                 tickets.user_id, messages.sender_id,
--                 attachments.uploaded_by, meetings.user_id,
--                 meetings.created_by
--
--   profiles    for STAFF ATTRIBUTION columns — who *acted*, where the admin
--               UI must render a human name and where departure should blank
--               the field rather than destroy the row:
--                 articles.updated_by, tickets.assigned_to,
--                 slots.host_id, slots.created_by
--
-- WHY THE SPLIT. Clients cannot read auth.users at all — it is not exposed
-- through PostgREST — so an FK to auth.users hands the admin UI a uuid it has
-- no way to resolve into a name. profiles carries full_name, email and role,
-- which is exactly what the queue renders. Conversely, subject columns point at
-- auth.users because identity is the ACCOUNT, not the profile row: an admin can
-- write to profiles, and a profile row deleted by hand must never silently take
-- a student's support history with it.
--
-- WHY THIS IS SAFE — the profile row is guaranteed to exist. Verified against
-- production on 2026-08-15, not assumed:
--
--   * trigger  on_auth_user_created  AFTER INSERT ON auth.users
--              → handle_new_user(), SECURITY DEFINER, which inserts the
--                profiles row. It carries NO exception handler, so a failure
--                aborts the auth.users insert: profile creation is atomic with
--                account creation, and a user without a profile cannot exist.
--   * measured: 27 auth.users, 27 profiles, 0 users without a profile.
--   * measured: 3 staff profiles (role <> 'user'), 0 of them orphaned.
--
-- All four profiles-referencing columns are written only by agent RPCs in
-- 20260815d, so every value they can hold belongs to a staff account, and every
-- staff account provably has a profile row. The FK cannot fail.
--
-- =====================================================================
-- TICKET LIFECYCLE — the product policy, stated rather than implied
-- =====================================================================
-- STATUS, allowed transitions (enforced by trigger, not left to callers):
--
--   open             → in_progress | closed
--   in_progress      → awaiting_student | resolved | closed
--   awaiting_student → in_progress | resolved | closed
--   resolved         → in_progress (reopen) | closed
--   closed           → TERMINAL. Nothing leaves it.
--
-- DIRECT CLOSE IS ALLOWED, EXPLICITLY. A ticket may reach 'closed' from any
-- live state without passing through 'resolved'. This is a product decision,
-- taken because spam, duplicates and "never mind, I sorted it" are ordinary and
-- forcing a fictitious resolution on them would make 'resolved' meaningless as
-- a metric. A closed ticket therefore has closed_at always, and resolved_at
-- only if it genuinely was resolved first.
--
-- 'closed' being terminal is the other half of that decision: a mis-closed
-- ticket is not reopened, a new one is opened. To allow staff reopen instead,
-- add ('closed' → 'in_progress') to the guard below — one line, deliberately
-- not taken by default.
--
-- =====================================================================
-- MEETING AUTHORISATION — two facts, each stored exactly once
-- =====================================================================
-- Revision 3 carried a support_escalation_state enum on the ticket whose values
-- 'scheduled', 'completed' and 'cancelled' ASSERTED FACTS ABOUT ANOTHER TABLE.
-- A column that makes claims about rows it does not own will eventually lie:
-- the database could reach escalation_state = 'completed' while the meeting was
-- still scheduled, or 'scheduled' with no meeting at all, and no constraint
-- would notice. Bolting cross-table checks onto the ticket trigger would only
-- have replaced the drift with a permanent write-order convention.
--
-- So the column was split into the two independent facts it conflated:
--
--   support_tickets.meeting_granted   boolean
--       An AGENT'S DECISION and nothing else. It asserts "a meeting has been
--       authorised and not yet used". It says nothing about any other table, so
--       it cannot contradict one.
--
--   support_meetings.status
--       The SOLE AUTHORITY on whether a meeting exists and what became of it.
--       There is no second copy anywhere.
--
-- THE GRANT LIFECYCLE — every meeting is preceded by a deliberate decision:
--
--   false  --(staff grants; students cannot)-->  true
--   true   --(a meeting row is created)-------->  false      [consumed]
--   cancelled meeting: the grant STAYS false. Another meeting needs another
--                      explicit staff decision. This is intentional.
--
-- DISPLAY STATE IS DERIVED, NEVER STORED. Both front-ends compute it from the
-- two facts above, through ONE shared helper rather than two private copies of
-- the mapping:
--
--   no meeting & !granted  → not escalated      live meeting     → scheduled
--   no meeting &  granted  → eligible to book   latest completed → completed
--                                               latest cancelled → cancelled
--
-- Presentation is the one place convention is acceptable: a front-end that gets
-- this wrong shows a wrong label, it cannot corrupt data.
--
-- WHAT THE DATABASE NOW REFUSES, rather than merely discouraging:
--   * a student creating a meeting without a live grant on their OWN ticket
--     → support_meetings_guard(), on the row, for every writer
--   * two live meetings on one ticket
--     → support_meetings_one_live_per_ticket_idx
--   * a non-agent setting meeting_granted true
--     → support_tickets_guard()
--   * a meeting whose user_id is not the ticket's owner
--     → support_meetings_guard(), for agents too
--
-- =====================================================================
-- SLOT OCCUPANCY — one meeting per time window, in every ordering
-- =====================================================================
-- A slot row IS a time window. The rule is that a window can be consumed once.
--
--   support_meetings_one_per_slot_idx  UNIQUE (slot_id) WHERE status <> 'cancelled'
--
-- Read it as: a slot may carry at most one meeting that was not called off.
-- 'scheduled', 'completed' and 'no_show' all OCCUPY the slot; only 'cancelled'
-- releases it.
--
-- WHY NOT `WHERE status = 'scheduled'` (revision 2, wrong). That predicate made
-- the slot reusable the moment its meeting stopped being scheduled — so an
-- agent marking a 10:00–10:30 meeting 'completed' at 10:15 freed that window,
-- and a second student could book 10:00–10:30 at 10:16. A no_show did the same
-- thing, faster. Occupancy is not the same question as "is it still upcoming".
--
-- WHY NOT A PLAIN UNIQUE (slot_id) — "one meeting ever". A cancelled meeting
-- never happened, so burning the window would force agents to create a DUPLICATE
-- slot for the same real time. Two slot rows for one window destroys the very
-- invariant this index exists to provide: each would accept its own meeting, and
-- two students would arrive at the same time. Reuse after cancellation is what
-- keeps one row = one window true.
--
-- WHY THE PER-TICKET INDEX USES A DIFFERENT PREDICATE. Per-slot is
-- `<> 'cancelled'` because a time window is consumed permanently. Per-ticket is
-- `= 'scheduled'` because a ticket may legitimately have several meetings over
-- its life — just never two open at once. Different questions, different
-- predicates, both deliberate.
--
-- WHY IT HOLDS IN ANY TRANSITION ORDER. The indexes are evaluated by the
-- database on every insert and every status update, so:
--   * two concurrent bookings      → one commits, one raises unique_violation
--   * cancel-then-rebook           → allowed; the cancelled row is outside the
--                                    predicate and the new row is the only one in
--   * un-cancelling (cancelled → scheduled) while a live meeting exists
--                                  → refused, because it would put two rows in
--   * completed/no_show            → still inside the predicate, so the window
--                                    stays consumed for good
-- No ordering of these produces two live meetings in one window.
--
-- ROLLBACK: 20260815z_support_rollback.sql (drops in dependency order).
-- Nothing outside this feature references these objects, so revert is total.
-- =====================================================================

-- ── 1. Enums ────────────────────────────────────────────────────────────────
-- Categories are an enum rather than free text because the student picker and
-- the admin queue filter both read them; a typo in a filter is a ticket nobody
-- sees. Adding a category later is `alter type ... add value`, which is a
-- one-line migration and does not rewrite the table.

create type public.support_category as enum (
  'account',        -- login, password, email, device limits
  'technical',      -- something is broken
  'mock_exam',      -- exam engine, scoring, a lost attempt
  'billing',        -- subscription, payment, credits
  'platform_help',  -- how do I use X
  'other'
);

create type public.support_ticket_status as enum (
  'open',             -- submitted, no agent has picked it up
  'in_progress',      -- an agent is on it, or the student replied
  'awaiting_student', -- the agent answered and needs something back
  'resolved',         -- settled; still reopenable by replying
  'closed'            -- terminal
);

create type public.support_sender_role as enum ('student', 'agent', 'system');

-- The sole authority on a meeting's lifecycle. Nothing mirrors these values.
create type public.support_meeting_status as enum (
  'scheduled', 'completed', 'cancelled', 'no_show'
);

-- ── 2. Metadata and guard functions ────────────────────────────────────────
--
-- SECURITY POSTURE, stated per function rather than applied by habit. A trigger
-- function that needs no privilege must not carry one, because a definer
-- function is a standing grant that survives every later change to the tables
-- it can reach.
--
--   support_set_updated_at          INVOKER — touches only NEW
--   support_tickets_guard           INVOKER — reads only OLD/NEW; its one call
--                                             elevates on its own
--   support_meetings_guard          DEFINER — must read slot and ticket rows the
--                                             caller may not be permitted to see
--   support_meetings_consume_grant  DEFINER — must update a ticket the caller
--                                             holds no UPDATE on
--
-- All four pin search_path. For the definers it is a requirement: without it a
-- caller-controlled search_path can redirect an unqualified name inside a
-- function running with owner rights. For the two invokers it is hygiene, and
-- costs nothing.

-- updated_at is maintained by the database, not by callers. Three tables carry
-- the column and at least eleven RPCs will write to them; "every future writer
-- remembers" is not a mechanism, it is a hope, and the first one that forgets
-- produces a timestamp that lies without anything failing.
--
-- Declared here, in the same migration as the tables, because a table whose
-- metadata contract is added later has a window in which its own audit column
-- is wrong.
create or replace function public.support_set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

comment on function public.support_set_updated_at() is
  'BEFORE UPDATE: stamps updated_at. SECURITY INVOKER — touches only NEW and needs no privilege.';

revoke all on function public.support_set_updated_at() from anon;

-- The ticket lifecycle guard. Rejects any status transition not in the table
-- above, so the state machine is a property of the database rather than a
-- diagram the RPCs are trusted to honour. Also holds the one authorisation rule
-- that belongs to the ticket: granting a meeting is a staff act.
--
-- SECURITY INVOKER, deliberately. It reads no table: OLD and NEW are supplied
-- by the trigger, and public.has_role_at_least() is ITSELF security definer, so
-- it elevates on its own behalf and returns the right answer for a caller with
-- no privilege on profiles. Marking this function definer would grant it owner
-- rights it never uses. The call is schema-qualified so the pinned search_path
-- is belt and braces rather than the only defence.
--
-- auth.uid() reads the JWT claim, not the executing role, so the staff check
-- below identifies the real actor even when this fires inside a SECURITY
-- DEFINER function such as support_meetings_consume_grant().
create or replace function public.support_tickets_guard()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  if new.status is distinct from old.status then
    if not (
         (old.status = 'open'             and new.status in ('in_progress', 'closed'))
      or (old.status = 'in_progress'      and new.status in ('awaiting_student', 'resolved', 'closed'))
      or (old.status = 'awaiting_student' and new.status in ('in_progress', 'resolved', 'closed'))
      or (old.status = 'resolved'         and new.status in ('in_progress', 'closed'))
    ) then
      raise exception 'illegal ticket status transition: % -> %', old.status, new.status
        using errcode = '23514';
    end if;
  end if;

  -- GRANTING is staff-only, enforced here rather than only inside the RPC that
  -- does it, so a student who reaches this column by any route is refused by
  -- the database itself.
  --
  -- CONSUMING (true -> false) is deliberately NOT gated: it runs inside the
  -- student's own booking transaction, from support_meetings_consume_grant().
  -- Gating it would make booking impossible for the only people who book.
  if new.meeting_granted and not old.meeting_granted
     and not public.has_role_at_least('admin') then
    raise exception 'granting a meeting requires a support agent role'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.support_tickets_guard() is
  'BEFORE UPDATE on support_tickets: enforces the documented status transitions and makes granting a meeting staff-only. SECURITY INVOKER — reads no table; has_role_at_least() elevates itself.';

revoke all on function public.support_tickets_guard() from anon;

-- The meeting guard: everything that must be true of a meeting row, checked on
-- the row itself so it holds for every writer — the student RPC, the agent's
-- direct-schedule RPC, and any caller that has not been written yet.
--
-- ON INSERT it enforces, in order:
--   1. the ticket exists, and the meeting belongs to that ticket's owner
--      (an agent booking for the wrong student is a typo, not a feature)
--   2. AUTHORISATION — an agent may schedule directly; anyone else must be the
--      ticket's owner AND hold a live grant. This is the escalation rule, and
--      it lives in the database rather than in an RPC's good manners.
--   3. TEMPORAL VALIDITY — the slot exists, is active, and has not started.
--      A CHECK constraint cannot express this: now() is not IMMUTABLE and
--      Postgres rejects it in a CHECK. A trigger is the only layer that can.
--      There is NO agent override: booking into the past or into a withdrawn
--      slot is a data-entry error either way, and an agent who needs an unusual
--      time creates a slot for it.
--   4. provider is ASSIGNED from the slot, never taken from the caller.
--
-- ON UPDATE it enforces immutability of slot_id and provider. provider is not a
-- mirror of the slot — it records WHAT WAS ACTUALLY PROVISIONED, because
-- provider_ref holds that provider's join URL and the adapter that must later
-- cancel it has to know which system created it. So an agent editing a slot's
-- provider afterwards cannot corrupt meetings already booked against it, and a
-- direct UPDATE of the meeting's own provider is refused outright. Rescheduling
-- is cancel + book, which releases the old window and preserves the history.
--
-- SECURITY DEFINER is required: it reads support_meeting_slots and
-- support_tickets, whose RLS shows a student only the rows that would pass. As
-- invoker the lookups would return nothing for an invalid slot and the checks
-- would appear to work while actually enforcing RLS visibility rather than
-- validity — and would silently stop enforcing anything the day a policy
-- changed.
create or replace function public.support_meetings_guard()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_owner    uuid;
  v_granted  boolean;
  v_active   boolean;
  v_starts   timestamptz;
  v_provider text;
begin
  if tg_op = 'UPDATE' then
    if new.slot_id is distinct from old.slot_id then
      raise exception 'slot_immutable: cancel this meeting and book another'
        using errcode = '23514';
    end if;
    if new.provider is distinct from old.provider then
      raise exception 'provider_immutable: it records what was provisioned, not what the slot says now'
        using errcode = '23514';
    end if;
    return new;
  end if;

  select t.user_id, t.meeting_granted
    into v_owner, v_granted
  from public.support_tickets t
  where t.id = new.ticket_id;

  if not found then
    raise exception 'ticket_not_found: %', new.ticket_id using errcode = '23503';
  end if;

  if new.user_id is distinct from v_owner then
    raise exception 'meeting_user_mismatch: a meeting belongs to the ticket''s owner'
      using errcode = '23514';
  end if;

  if not public.has_role_at_least('admin') then
    if v_owner is distinct from auth.uid() then
      raise exception 'not_your_ticket' using errcode = '42501';
    end if;
    if not v_granted then
      raise exception 'not_granted: a support agent must authorise a meeting for this ticket first'
        using errcode = '42501';
    end if;
  end if;

  select s.active, s.starts_at, s.provider
    into v_active, v_starts, v_provider
  from public.support_meeting_slots s
  where s.id = new.slot_id;

  if not found then
    raise exception 'slot_not_found: %', new.slot_id using errcode = '23503';
  end if;

  if not v_active then
    raise exception 'slot_inactive: that time has been withdrawn' using errcode = '23514';
  end if;

  if v_starts <= now() then
    raise exception 'slot_expired: that time has already started' using errcode = '23514';
  end if;

  new.provider := v_provider;

  return new;
end;
$$;

comment on function public.support_meetings_guard() is
  'BEFORE INSERT OR UPDATE on support_meetings. INSERT: ticket ownership, the staff-or-granted authorisation rule, slot temporal validity, and provider assigned from the slot. UPDATE: slot_id and provider are immutable. SECURITY DEFINER because the slot and ticket rows may be invisible to the caller under RLS.';

revoke all on function public.support_meetings_guard() from anon;

-- The grant is spent by the act of booking, and only once a meeting row has
-- actually been written — AFTER INSERT, so a failed insert leaves the grant
-- intact and the student can try another slot.
--
-- This is the ONLY synchronisation between the two tables, and it runs one way:
-- meetings are the source, the grant is a permission being spent. The ticket
-- never learns anything about the meeting's status, which is exactly why the
-- drift this design replaced cannot recur.
--
-- The guarded WHERE means an agent scheduling directly for a student who holds
-- no grant is a no-op here rather than an error: their authority came from
-- their role, not from a grant.
--
-- NOT restored on cancellation, by owner decision: every meeting must be
-- preceded by a deliberate support decision, so a student whose meeting was
-- called off needs a fresh grant before booking again.
--
-- SECURITY DEFINER is required: a student holds no UPDATE on support_tickets,
-- and this must run inside their booking transaction.
create or replace function public.support_meetings_consume_grant()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  update public.support_tickets
     set meeting_granted = false
   where id = new.ticket_id
     and meeting_granted;

  return null;  -- AFTER trigger; the return value is discarded
end;
$$;

comment on function public.support_meetings_consume_grant() is
  'AFTER INSERT on support_meetings: spends the ticket''s meeting grant. One-way (meetings -> ticket); never restored on cancellation. SECURITY DEFINER because students hold no UPDATE on support_tickets.';

revoke all on function public.support_meetings_consume_grant() from anon;

-- ── 3. Help centre articles ────────────────────────────────────────────────
-- Stored in the database rather than in docs/knowledge/, deliberately. Support
-- copy changes when a payment provider or an exam flow changes — an
-- operational cadence. Routing it through the frozen knowledge layer would put
-- "how do I reset my password" behind that layer's governance gates. The public
-- marketing faq.html stays exactly as it is and is generated from
-- docs/knowledge/faq-data.mjs as before.

create table public.support_articles (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  category    public.support_category not null,
  question    text not null,
  answer_md   text not null,
  sort_order  integer not null default 100,
  published   boolean not null default false,
  updated_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint support_articles_slug_chk     check (slug ~ '^[a-z0-9][a-z0-9-]{1,79}$'),
  constraint support_articles_question_chk check (length(btrim(question))  between 3 and 200),
  constraint support_articles_answer_chk   check (length(btrim(answer_md)) between 3 and 8000)
);

create index support_articles_published_idx
  on public.support_articles (category, sort_order, id)
  where published;

create trigger support_articles_set_updated_at
  before update on public.support_articles
  for each row execute function public.support_set_updated_at();

comment on table public.support_articles is
  'Help centre Q&A. Admin-editable without a deploy. Distinct from the public marketing FAQ in docs/knowledge/faq-data.mjs.';

-- ── 4. Tickets ─────────────────────────────────────────────────────────────

create table public.support_tickets (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  category        public.support_category not null,
  subject         text not null,
  status          public.support_ticket_status not null default 'open',
  -- An agent's authorisation for ONE meeting, and nothing more. It asserts no
  -- fact about support_meetings, so it cannot contradict it. Set true only by
  -- staff; spent automatically when a meeting row is created; never restored
  -- by cancellation. See MEETING AUTHORISATION in the header.
  meeting_granted boolean not null default false,
  assigned_to     uuid references public.profiles(id) on delete set null,
  -- Maintained by the trigger in 20260815c. Drives BOTH the student's list and
  -- the agent queue, so it is a stored column rather than a subquery: the queue
  -- is the hottest read in the feature and must not aggregate messages per row.
  last_message_at timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  resolved_at     timestamptz,
  closed_at       timestamptz,
  constraint support_tickets_subject_chk check (length(btrim(subject)) between 3 and 160),

  -- STAMP CONSISTENCY. These encode the lifecycle policy documented in the
  -- header; they do not invent it.
  --
  -- resolved_at is set exactly when the ticket is resolved, and RETAINED
  -- through 'closed' so a ticket that was resolved before closing keeps that
  -- fact. A live ticket that is not resolved must not carry a resolution date.
  constraint support_tickets_resolved_stamp_chk check (
    case status
      when 'resolved' then resolved_at is not null
      when 'closed'   then true            -- may or may not have been resolved first
      else                 resolved_at is null
    end
  ),
  -- closed_at is set exactly when closed, both directions.
  constraint support_tickets_closed_stamp_chk check (
    (status = 'closed') = (closed_at is not null)
  )
);

create index support_tickets_user_idx
  on public.support_tickets (user_id, last_message_at desc);

-- The agent queue. Partial, because a closed ticket is never in it and the
-- closed rows will eventually outnumber the live ones many times over.
create index support_tickets_queue_idx
  on public.support_tickets (status, last_message_at)
  where status <> 'closed';

create index support_tickets_assignee_idx
  on public.support_tickets (assigned_to, last_message_at desc)
  where assigned_to is not null;

-- An agent's follow-up list: authorised, not yet booked.
create index support_tickets_granted_idx
  on public.support_tickets (last_message_at)
  where meeting_granted;

create trigger support_tickets_guard_transitions
  before update on public.support_tickets
  for each row execute function public.support_tickets_guard();

create trigger support_tickets_set_updated_at
  before update on public.support_tickets
  for each row execute function public.support_set_updated_at();

comment on table public.support_tickets is
  'One support issue. Carries NO reference to any academic table — support must never influence weakness analysis, mastery or the learning profile.';

-- ── 5. Messages ────────────────────────────────────────────────────────────

create table public.support_messages (
  id          uuid primary key default gen_random_uuid(),
  ticket_id   uuid not null references public.support_tickets(id) on delete cascade,
  sender_id   uuid not null references auth.users(id) on delete cascade,
  -- Never client-chosen. The RLS insert policy in 20260815b pins this to
  -- 'student' for anyone writing directly; only the agent RPC writes 'agent'.
  sender_role public.support_sender_role not null,
  body        text not null,
  created_at  timestamptz not null default now(),
  constraint support_messages_body_chk check (length(btrim(body)) between 1 and 4000)
);

create index support_messages_thread_idx
  on public.support_messages (ticket_id, created_at);

-- ── 6. Attachments ─────────────────────────────────────────────────────────
-- Mirrors the shape manual-payment.html already proves against the
-- payment-proofs bucket. The MIME allow-list is narrow on purpose: a support
-- attachment is a screenshot, and every additional accepted type is a parser
-- the platform did not ask for.

create table public.support_attachments (
  id           uuid primary key default gen_random_uuid(),
  message_id   uuid not null references public.support_messages(id) on delete cascade,
  storage_path text not null unique,
  mime_type    text not null,
  byte_size    integer not null,
  uploaded_by  uuid not null references auth.users(id) on delete cascade,
  created_at   timestamptz not null default now(),
  constraint support_attachments_mime_chk check (
    mime_type in ('image/png', 'image/jpeg', 'image/webp')
  ),
  -- 5 MB. The storage bucket carries the same limit in 20260815e; this one
  -- exists because a row can be written without the object being re-checked.
  constraint support_attachments_size_chk check (byte_size > 0 and byte_size <= 5242880)
);

create index support_attachments_message_idx
  on public.support_attachments (message_id);

-- ── 7. Meeting slots ───────────────────────────────────────────────────────
-- Provider-neutral availability, created by agents in advance. A student never
-- proposes a time; they claim one of these.
--
-- THE SLOT HOLDS NO CLAIM COLUMNS. Revision 1 carried claimed_by/claimed_at and
-- a CHECK requiring them to agree — which the claimed_by FK's ON DELETE SET
-- NULL could not honour, because a referential action can null one column and
-- not the other. Relaxing that CHECK would have left stale claim metadata on a
-- slot that reads as open. Both are wrong.
--
-- The claim is instead DERIVED from support_meetings, which is where it always
-- belonged: a slot is taken exactly when a non-cancelled meeting references it.
-- That removes the duplicated state rather than trying to keep two copies of it
-- honest, so there is nothing left for account deletion to desynchronise — the
-- meeting row cascades away with the account and the slot is open again, with
-- no residue and no cleanup step. The claim's timestamp is the meeting's
-- created_at, which is the same fact stored once.

create table public.support_meeting_slots (
  id         uuid primary key default gen_random_uuid(),
  starts_at  timestamptz not null,
  ends_at    timestamptz not null,
  provider   text not null default 'zoom',
  host_id    uuid references public.profiles(id) on delete set null,
  active     boolean not null default true,
  -- Attribution only. Nullable + SET NULL, never NOT NULL + RESTRICT:
  -- profiles_id_fkey cascades from auth.users, so RESTRICT would make an agent
  -- who ever created a slot undeletable — the cascade would hit this
  -- constraint and abort the account deletion.
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint support_slots_window_chk   check (ends_at > starts_at),
  constraint support_slots_provider_chk check (provider ~ '^[a-z][a-z0-9_]{1,31}$')
);

-- Candidate slots. Whether each is free is answered by the partial unique index
-- on support_meetings below, via NOT EXISTS.
create index support_slots_active_idx
  on public.support_meeting_slots (starts_at)
  where active;

-- ── 8. Meetings ────────────────────────────────────────────────────────────
-- provider_ref is jsonb rather than typed columns so the schema does not encode
-- one vendor's vocabulary. Zoom fills {join_url, meeting_id, passcode,
-- host_url}; another provider fills its own keys in the same column, with no
-- migration and no client change.
--
-- An EMPTY provider_ref means "link pending": booking commits in Postgres, and
-- the provider API call happens immediately afterwards from the Edge Function.
-- Postgres cannot make that call, and holding a transaction open across a
-- network round-trip would be worse than the problem it solves.

create table public.support_meetings (
  id           uuid primary key default gen_random_uuid(),
  ticket_id    uuid not null references public.support_tickets(id) on delete cascade,
  -- Immutable after insert (support_meetings_guard). Rescheduling is
  -- cancel + book, which releases the old window and keeps the history.
  slot_id      uuid not null references public.support_meeting_slots(id) on delete restrict,
  user_id      uuid not null references auth.users(id) on delete cascade,
  -- Assigned from the slot at insert and immutable thereafter. This records
  -- WHAT WAS PROVISIONED — provider_ref holds that system's join URL — so it is
  -- deliberately not a live mirror of the slot's current provider.
  provider     text not null,
  provider_ref jsonb not null default '{}'::jsonb,
  -- THE sole authority on this meeting's lifecycle. Nothing mirrors it.
  status       public.support_meeting_status not null default 'scheduled',
  -- Who performed the booking: the student, or an agent acting for them. SET
  -- NULL rather than CASCADE — this is attribution, not ownership. CASCADE
  -- would mean deleting one agent's account silently deletes the meetings that
  -- agent booked for OTHER students. Ownership is user_id, which cascades.
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint support_meetings_ref_chk check (jsonb_typeof(provider_ref) = 'object')
);

-- ONE MEETING PER TIME WINDOW. See SLOT OCCUPANCY in the header for why the
-- predicate is `<> 'cancelled'` rather than `= 'scheduled'`, and why a plain
-- UNIQUE would be worse than either. Cancellation is the only outcome that did
-- not consume the window, so it is the only one that releases it.
create unique index support_meetings_one_per_slot_idx
  on public.support_meetings (slot_id)
  where status <> 'cancelled';

-- ONE LIVE MEETING PER TICKET. Different predicate, different question: a
-- ticket may have several meetings across its life, but never two open at once.
-- Belt and braces beside the grant, which is spent on the first booking — this
-- also catches an agent scheduling directly twice.
create unique index support_meetings_one_live_per_ticket_idx
  on public.support_meetings (ticket_id)
  where status = 'scheduled';

create index support_meetings_ticket_idx on public.support_meetings (ticket_id);
create index support_meetings_user_idx   on public.support_meetings (user_id, status);

-- Work an agent must chase: a scheduled meeting whose provider link never
-- arrived. Without this the failure is invisible until a student asks.
create index support_meetings_pending_link_idx
  on public.support_meetings (created_at)
  where status = 'scheduled' and provider_ref = '{}'::jsonb;

create trigger support_meetings_guard_row
  before insert or update on public.support_meetings
  for each row execute function public.support_meetings_guard();

create trigger support_meetings_set_updated_at
  before update on public.support_meetings
  for each row execute function public.support_set_updated_at();

-- AFTER, not BEFORE: the grant is spent only once the row actually exists, so a
-- failed insert leaves the student free to try another slot.
create trigger support_meetings_consume_grant
  after insert on public.support_meetings
  for each row execute function public.support_meetings_consume_grant();

comment on table public.support_meetings is
  'A claimed slot; the row IS the claim, and status is the sole authority on its lifecycle. slot_id and provider are immutable after insert.';

-- ── 9. RLS on, policies deliberately absent ────────────────────────────────
-- Enabled here so no window exists in which these tables are readable. With no
-- policy attached, every non-service-role read and write is denied. The next
-- migration opens exactly the doors that should be open.

alter table public.support_articles       enable row level security;
alter table public.support_tickets        enable row level security;
alter table public.support_messages       enable row level security;
alter table public.support_attachments    enable row level security;
alter table public.support_meeting_slots  enable row level security;
alter table public.support_meetings       enable row level security;

-- ── 10. Revoke anon ────────────────────────────────────────────────────────
-- This project carries ALTER DEFAULT PRIVILEGES granting new objects to anon,
-- authenticated and service_role, so a new table arrives with a real anon
-- grant. RLS would deny anon anyway once policies exist, but a grant that is
-- only neutralised by a policy is one `alter table ... disable row level
-- security` away from being live. See 20260804_streak_server_side_revoke_anon.sql,
-- which exists because this was found after the fact.

revoke all on table public.support_articles      from anon;
revoke all on table public.support_tickets       from anon;
revoke all on table public.support_messages      from anon;
revoke all on table public.support_attachments   from anon;
revoke all on table public.support_meeting_slots from anon;
revoke all on table public.support_meetings      from anon;

-- ── VERIFICATION (run after apply) ─────────────────────────────────────────
--   select relname, relrowsecurity,
--          (select count(*) from pg_policies p where p.tablename = c.relname)
--   from pg_class c join pg_namespace n on n.oid = c.relnamespace
--   where n.nspname = 'public' and relname like 'support%';
--   -- expect: 6 rows, relrowsecurity = true, policy count = 0 (until 'b')
--
--   -- no escalation enum survives anywhere:
--   select typname from pg_type where typname like '%escalation%';   -- expect 0 rows
--
--   -- the status machine refuses an illegal edge:
--   update support_tickets set status = 'awaiting_student' where status = 'open';
--   -- expect: ERROR illegal ticket status transition: open -> awaiting_student
--
--   -- a student cannot grant themselves a meeting:
--   update support_tickets set meeting_granted = true where user_id = auth.uid();
--   -- expect: ERROR granting a meeting requires a support agent role
--
--   -- a student cannot book without a grant:
--   insert into support_meetings (ticket_id, slot_id, user_id, provider, created_by)
--     values ('<own ungranted ticket>', '<free slot>', auth.uid(), 'zoom', auth.uid());
--   -- expect: ERROR not_granted: a support agent must authorise a meeting first
--
--   -- the grant is spent by booking, and not returned by cancelling:
--   --   grant -> meeting_granted = true
--   --   book  -> meeting_granted = false
--   --   cancel the meeting; meeting_granted stays false   (owner decision)
--
--   -- two live meetings on one ticket:
--   -- expect: ERROR duplicate key ... support_meetings_one_live_per_ticket_idx
--
--   -- a completed meeting does NOT free its window:
--   update support_meetings set status = 'completed' where id = '<m>';
--   -- a second insert on the same slot now raises
--   --   duplicate key ... support_meetings_one_per_slot_idx
--   -- while the same test after status = 'cancelled' succeeds.
--
--   -- provider and slot cannot drift after insert:
--   update support_meetings set provider = 'meet' where id = '<m>';
--   -- expect: ERROR provider_immutable
--   update support_meetings set slot_id  = '<other>' where id = '<m>';
--   -- expect: ERROR slot_immutable
--
--   -- past and retired slots are refused at the database, not the UI:
--   -- expect: ERROR slot_expired / ERROR slot_inactive
--
--   -- security posture of the four functions:
--   select proname, prosecdef, proconfig from pg_proc p
--   join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public' and proname in
--     ('support_set_updated_at','support_tickets_guard',
--      'support_meetings_guard','support_meetings_consume_grant');
--   -- expect: prosecdef = false, false, true, true; proconfig pinned on all four
--
--   select conname, pg_get_constraintdef(oid) from pg_constraint
--   where conrelid = 'public.weakness_signals'::regclass and conname like '%source%';
--   -- expect: UNCHANGED, still the three academic sources
