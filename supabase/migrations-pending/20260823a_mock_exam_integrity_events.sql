-- =====================================================================
-- Mock Exam v2 · M1 — Integrity Audit Foundation (append-only)
-- =====================================================================
-- STATUS: ⛔ PREPARED — NOT YET APPLIED. Awaiting owner approval.
--         Revision 4. ⚠️ THE FIRST REVISION THAT CHANGES DDL. `confidence`
--         becomes NOT NULL, its CASE becomes exhaustive with no catch-all, and
--         a domain CHECK closes the vocabulary — so an event_type added to the
--         CHECK without being classified can no longer be recorded at all.
--         Approved deliberately: see "FAIL-LOUD CLASSIFICATION" below.
--         Revisions 1-3 are otherwise unchanged.
--
--         Revision 3. DOCUMENTATION ONLY, like revision 2 — no DDL,
--         constraint, policy or grant differs from revision 1. Revision 3
--         corrects an immutability claim that was stronger than PostgreSQL
--         supports (see "WHAT APPEND-ONLY MEANS HERE"), and cross-references
--         the event_type CHECK and the confidence mapping so neither can be
--         edited without the other being seen.
--         Revision 2 was DOCUMENTATION ONLY — no DDL, no constraint,
--         no policy and no grant differs from revision 1. It resolves an
--         ambiguity review caught (two columns named attempt_id with different
--         nullability, described as if one rule covered both) and states the
--         governing principle for metadata beside the validator that enforces
--         it, and inside the column COMMENT so it reaches the database too.
-- DEPENDS ON: nothing. First migration of the Mock Exam v2 series.
-- FOLLOWED BY: M2 (mock_exam_restrictions + pending-review flagging).
--              M2 is NOT approved and is NOT written.
--
-- Plan: docs/roadmap/mock-exam-v2-implementation-plan.md §2, Migration 1.
--
-- WHAT THIS IS
-- ------------
-- One append-only table recording integrity-relevant events that occur while a
-- student is sitting a mock exam, plus the minimal linkage needed to associate
-- those events with the session row the existing save flow writes at the END of
-- the exam.
--
-- WHAT THIS IS NOT
-- ----------------
-- It enforces nothing. No student is warned, flagged or restricted by anything
-- in this file. There is no trigger that acts on an event, because enforcement
-- is M2's subject and M2 is unapproved. This migration is storage and access
-- control only, and applying it changes no student's experience.
--
-- THE HONEST LIMIT, RECORDED IN THE SCHEMA ITSELF
-- -----------------------------------------------
-- Every row here is CLIENT-REPORTED. A browser cannot detect a screenshot, and
-- a phone photographing the screen is invisible to it; a determined student can
-- also suppress or forge what is reported. So this table is an AUDIT TRAIL AND A
-- DETERRENT, never proof, and it must never be presented to an Admin as proof.
-- That is precisely why enforcement (M2) routes to human review rather than to
-- an automatic ban. See docs/roadmap/mock-exam-v2-investigation.md §3.
--
-- =====================================================================
-- FOUR DESIGN CHANGES FROM THE APPROVED PLAN, AND WHY
-- =====================================================================
-- The plan sketched columns that writing the thing properly showed to be wrong.
-- Each change makes the table MORE append-only, not less.
--
-- 1. NO session_id COLUMN. The plan had both `attempt_id` and a nullable
--    `session_id` to be backfilled at save time. Backfilling means UPDATE, and a
--    row that can be updated is not append-only. Since attempt_id is also being
--    written onto exam_practice_sessions (§7 below), the join already exists
--    through that column and session_id would be a redundant second copy that
--    costs us the write-once property. Dropped.
--
-- 2. NO counted_as_strike / action_taken COLUMNS. Those are enforcement
--    JUDGEMENTS, not facts about the event, and they arrive after the row is
--    written — again requiring UPDATE. They belong to M2's review record. This
--    table states what happened; M2 states what was decided about it. Keeping
--    fact and judgement apart is what lets this table be genuinely write-once.
--
-- 3. confidence IS A GENERATED COLUMN, NOT CLIENT INPUT. The client writes these
--    rows. If confidence were an ordinary column, a student could report a copy
--    as low-confidence and dodge the classification entirely, or report a tab
--    switch as high-confidence and manufacture strikes against themselves. The
--    database derives it from event_type instead, so it cannot be supplied,
--    cannot disagree with the event, and cannot be tampered with afterwards.
--
--    The MAPPING (which event is high-confidence) lives here in the schema
--    deliberately: it is a security classification, and changing it should
--    require a reviewed migration. The THRESHOLDS (how many strikes before
--    review) live in system_settings, which is admin-editable through
--    admin-actions → update_system_setting. Classification is structural;
--    thresholds are policy. They are stored differently on purpose.
--
-- 4. FAIL-LOUD CLASSIFICATION (revision 4). The mapping originally ended in
--    `else 'low'`. That is a SAFE default — a new event type could never
--    accidentally strike a student — but it is a SILENT one: widen the
--    event_type CHECK without touching the mapping and the new detector's
--    events are filed as low confidence forever, unable to contribute to
--    enforcement, with nothing anywhere reporting that it happened. The
--    security feature would fail open, quietly, which is the worst way to fail.
--
--    So there is no default now. Both branches are exhaustive, `confidence` is
--    NOT NULL, and an unclassified type yields NULL and is rejected outright
--    with SQLSTATE 23502.
--
--    The rejected alternatives, for the record: `else 'high'` would be
--    fail-aggressive — an unclassified event striking students is worse than
--    one being ignored. Keeping `else 'low'` and relying on a code-review
--    convention would be relying on someone remembering. The principle adopted
--    instead is simply: IF THE SYSTEM DOES NOT UNDERSTAND AN EVENT, IT MUST NOT
--    RECORD IT AS THOUGH IT DID.
--
--    Note what this does NOT do — it cannot make an unknown type strike anyone.
--    The row never exists, so there is nothing for M2 to count. Fail-loud here
--    means "refuse to store", never "escalate".
--
-- =====================================================================
-- TWO COLUMNS ARE CALLED attempt_id. THEY HAVE DIFFERENT NULLABILITY.
-- =====================================================================
-- This migration creates a column of that name on each of two tables, and they
-- are NOT interchangeable. Stating it once, plainly, because describing them
-- together as "attempt_id" is how a reviewer ends up believing one rule applies
-- to both:
--
--   exam_integrity_events.attempt_id      uuid NOT NULL
--   exam_practice_sessions.attempt_id     uuid NULL
--
-- WHY THE EVENT COLUMN IS NOT NULL
-- --------------------------------
-- An integrity event exists only because an exam was being sat. An event with no
-- attempt is not a weaker record, it is an unreviewable one: it cannot be placed
-- in a session, cannot be ordered against other events, and cannot be shown to an
-- Admin as part of any coherent picture. There is also never a moment when the
-- client has an event but no attempt_id — the id is minted at exam start, before
-- any event can occur, so a null here could only ever mean a bug. NOT NULL turns
-- that bug into a rejected insert instead of a row nobody can act on.
--
-- WHY THE SESSION COLUMN IS NULL-ABLE
-- -----------------------------------
-- The session row is written at the END of the flow by doSave(), and four
-- distinct situations produce a session with no attempt_id — all of them normal:
--   * every exam_practice_sessions row that already exists predates this column;
--   * a client running an older cached build saves without one;
--   * the 23505 idempotency-recovery path adopts an already-committed winner row
--     rather than writing a new one;
--   * and any future save path that has no attempt in hand.
-- A NOT NULL here would mean inventing values for historical rows and would give
-- an audit feature the power to break a student's save. It gets neither.
--
-- THE ASYMMETRY IS THE DESIGN, NOT A COMPROMISE
-- ---------------------------------------------
-- Read together the two rules say: every event belongs to an attempt, but not
-- every attempt produces a saved session. That is simply true of exams — a
-- student can abandon one at any point, and an attempt abandoned immediately
-- after a copy event is exactly the shape review most cares about. The linkage
-- therefore has to tolerate one side being absent forever, while the other side
-- is never absent at all.
--
-- =====================================================================
-- ATOMICITY
-- =====================================================================
-- `begin;` is the first executable statement and `commit;` the last, with
-- nothing after it — the same construction used by 20260802h and 20260802f,
-- both of which committed successfully on this database. If the runner opens a
-- transaction of its own, the inner BEGIN is a no-op with a warning and the
-- COMMIT closes the outer one; since no statement follows, nothing can run
-- outside a transaction under either reading.
--
-- =====================================================================
-- VERIFIED AGAINST THE LIVE DATABASE BEFORE WRITING (2026-08-23)
-- =====================================================================
--   * PostgreSQL 17.6 — GENERATED ALWAYS AS ... STORED is supported.
--   * public.has_role_at_least(user_role) EXISTS and is SECURITY DEFINER.
--     user_role is the enum user < admin < super_admin < owner. This is the
--     modern admin predicate; the legacy inline
--       exists (select 1 from profiles where id = auth.uid() and is_admin)
--     is deliberately NOT copied, per 20260815b's reasoning.
--   * exam_practice_sessions grants are TABLE-LEVEL (relacl set, zero columns
--     carry their own attacl), so the new attempt_id column inherits
--     INSERT/SELECT automatically and the existing save flow keeps working
--     without a column grant. This was checked precisely because profiles DOES
--     carry 26 column-level ACLs — the hardening pattern exists in this database
--     and would have silently broken the save with "permission denied for
--     column attempt_id".
--   * pg_default_acl grants arwdDxtm on every NEW TABLE to anon, authenticated
--     and service_role, and EXECUTE on every NEW FUNCTION to the same. A new
--     table is therefore FULLY WRITABLE BY anon THE MOMENT IT IS CREATED unless
--     explicitly revoked. §5 and §6 revoke; this is the same trap
--     20260804_streak_server_side_revoke_anon.sql documented for functions.
-- =====================================================================

begin;

-- =====================================================================
-- 1. METADATA VALIDATOR — the bound that keeps metadata from becoming a
--    dumping ground
-- =====================================================================
-- ---------------------------------------------------------------------
-- THE GOVERNING PRINCIPLE
--
--   Metadata must describe the security event itself and must never be
--   sufficient to reconstruct student activity, exam content, copied
--   content, or a device fingerprint.
--
-- Every key below is admissible only because it survives that test, and any
-- future key must be argued against it before it is added. The test is
-- deliberately about SUFFICIENCY, not intent: a field that is innocuous alone
-- but that combines with the others to rebuild a picture of what the student
-- did fails it just as surely as storing the text outright.
-- ---------------------------------------------------------------------
--
-- A free jsonb column on a client-written table is an open invitation to
-- accumulate whatever the frontend happens to have lying around. This function
-- is the CHECK that stops that, and it is deliberately a whitelist: a key that
-- is not named here cannot be stored at all, so widening what we collect
-- requires editing this function in a reviewed migration.
--
-- THE THREE PERMITTED KEYS, and why each is genuinely necessary:
--
--   selection_length  integer  How MANY characters a copy event covered.
--                              Distinguishes a stray Ctrl+C on a 3-character
--                              accidental selection from copying a whole
--                              question. An Admin reviewing a flagged attempt
--                              needs that difference to judge fairly. Stores a
--                              COUNT — never the selected text, never the
--                              clipboard contents.
--
--   hidden_ms         integer  How long the tab was hidden. Two seconds is a
--                              notification; four minutes is not. This is a
--                              low-confidence event that will never strike, and
--                              the duration is the whole reason it is worth
--                              logging at all — without it the row says only
--                              "something happened", which cannot be reviewed.
--
--   blurred_ms        integer  Same reasoning for window focus loss.
--
-- EXPLICITLY NEVER STORED, and unstorable because the whitelist rejects them:
--   keystrokes · clipboard contents · selected or copied text · screen content
--   · question content · URLs · user agent · IP address · device fingerprint
--   · screen dimensions · timezone · locale · geolocation · camera · microphone
--
-- The device fingerprint deserves naming twice: mock-exam.html already computes
-- one for the device guard, so it is sitting right there in scope at the moment
-- an event is reported. It must not be attached to integrity events. Different
-- purpose, different lawful basis, and combining them would turn an event log
-- into device tracking.
create or replace function public.exam_integrity_metadata_ok(m jsonb)
returns boolean
language sql
immutable
parallel safe
as $$
  select m is not null
     and jsonb_typeof(m) = 'object'
     -- Hard size ceiling regardless of shape. 256 bytes is far more than three
     -- small integers need, and far less than anything interesting can hide in.
     and length(m::text) <= 256
     -- Whitelist: no other key may exist.
     and not exists (
           select 1 from jsonb_each(m) as kv(k, v)
           where kv.k not in ('selection_length', 'hidden_ms', 'blurred_ms')
         )
     -- Every value must be a number. Checked in its own EXISTS rather than
     -- OR-ed with the cast below, because SQL does not promise short-circuit
     -- evaluation and a cast of a non-number would error instead of failing.
     and not exists (
           select 1 from jsonb_each(m) as kv(k, v)
           where jsonb_typeof(kv.v) <> 'number'
         )
     -- ...and non-negative. Durations and lengths have no negative meaning.
     and not exists (
           select 1 from jsonb_each(m) as kv(k, v)
           where jsonb_typeof(kv.v) = 'number' and (kv.v)::numeric < 0
         );
$$;

comment on function public.exam_integrity_metadata_ok(jsonb) is
  'CHECK helper for exam_integrity_events.metadata. Whitelist of three numeric '
  'keys (selection_length, hidden_ms, blurred_ms), 256-byte ceiling. Widening '
  'what integrity logging collects requires editing this function in a reviewed '
  'migration — that is the point of it.';

-- =====================================================================
-- 2. THE TABLE
-- =====================================================================
create table public.exam_integrity_events (
  id           uuid        primary key default gen_random_uuid(),

  -- References auth.users, not profiles: the event belongs to the account, and
  -- deleting the account must take its integrity log with it (see §6 on why
  -- DELETE is deliberately left possible).
  user_id      uuid        not null references auth.users (id) on delete cascade,

  -- Client-minted at exam START. See §7 for the full lifecycle and why this,
  -- rather than a session id, is what an in-progress exam can possibly carry.
  attempt_id   uuid        not null,

  -- The registry code the student was sitting ('SAT_FULL', 'ACT_MATH', ...).
  -- Deliberately NOT constrained to a list of codes: exam-registry.js is the
  -- single source of truth for what exams exist, and duplicating that list here
  -- would create exactly the drift Phase 1 just removed. Bounded for sanity only.
  exam_code    text        not null,

  event_type   text        not null,

  -- DERIVED, never supplied. See design change 3 in the header.
  --
  -- ⚠️ FAIL-LOUD. Both lists are exhaustive and there is NO catch-all branch.
  -- An event_type that appears in the CHECK below but in NEITHER list here
  -- produces NULL, which the NOT NULL rejects — so the INSERT fails outright
  -- with SQLSTATE 23502 instead of the event being quietly filed as 'low'.
  --
  -- IF YOU ARE READING THIS BECAUSE OF A 23502 ON `confidence`: you added an
  -- event_type to exam_integrity_events_event_type_check without classifying it
  -- here. Decide, explicitly, whether it is high or low confidence and add it to
  -- the matching branch. That decision is the whole point of the failure.
  --
  -- WHY FAIL-LOUD RATHER THAN A SAFE DEFAULT: a silent 'low' is a security event
  -- that can never contribute to enforcement, and nobody would ever notice —
  -- the feature fails open and quietly. A silent 'high' would be worse still,
  -- striking students over an event nobody classified. Neither default is
  -- acceptable for a security classification, so there is no default. If the
  -- system does not understand an event, it refuses to record it as though it
  -- did.
  --
  -- Note the failure is contained: it can only be reached by a migration that
  -- widens the event_type domain, so it surfaces in development and staging,
  -- never on a student's first encounter with a new detector.
  confidence   text        not null
                           generated always as (
                             case
                               when event_type in ('copy', 'print', 'fullscreen_exit')
                                 then 'high'
                               when event_type in ('visibility_hidden', 'window_blur', 'context_menu')
                                 then 'low'
                               else null   -- deliberately unmapped -> NOT NULL rejects the row
                             end
                           ) stored,

  -- Milliseconds from the start of the exam. Chosen over a client wall-clock
  -- timestamp on purpose: it answers the question review actually asks — WHEN IN
  -- THE EXAM did this happen — while leaking neither the device clock nor its
  -- timezone. Nullable because a client that cannot compute it must still be
  -- able to report the event.
  elapsed_ms   integer,

  -- Server time at insert. The only trustworthy timestamp on the row, and the
  -- reason elapsed_ms can be untrusted without costing us an ordering.
  occurred_at  timestamptz not null default now(),

  metadata     jsonb       not null default '{}'::jsonb,

  constraint exam_integrity_events_event_type_check check (
    event_type in (
      -- ⚠️ ADDING A TYPE HERE IS HALF A CHANGE, AND THE DATABASE ENFORCES THAT.
      -- The generated `confidence` column above maps event_type -> high/low and
      -- does NOT update itself. Since rev 4 that mapping has no catch-all: a
      -- type added to this list and not to that one yields NULL, and the NOT
      -- NULL on `confidence` rejects every insert of it with SQLSTATE 23502.
      --
      -- So this is not a convention a reviewer has to remember. Widen this list
      -- alone and the new event type cannot be recorded at all — loudly, in
      -- development, before any student ever triggers it.
      --
      -- HIGH confidence: deliberate, unambiguous, reliably detectable.
      'copy',
      'print',
      'fullscreen_exit',
      -- LOW confidence: fires for entirely innocent reasons — a notification, an
      -- incoming call, a screen lock, a second monitor, an OS dialog. Recorded
      -- for context during review. M2 must never let these strike.
      'visibility_hidden',
      'window_blur',
      'context_menu'
    )
  ),

  -- Second half of the fail-loud pair. NOT NULL catches an UNMAPPED type; this
  -- catches a MIS-mapped one — a future edit that classifies something as
  -- 'medium', or simply misspells 'high'. A CHECK alone could not do the first
  -- job, because a CHECK evaluating to NULL passes; NOT NULL alone could not do
  -- the second. Together the vocabulary is closed.
  constraint exam_integrity_events_confidence_domain_check check (
    confidence in ('high', 'low')
  ),

  constraint exam_integrity_events_exam_code_check check (
    char_length(exam_code) between 1 and 40
  ),

  -- 24 hours. No mock exam runs longer; anything beyond it is a broken client.
  constraint exam_integrity_events_elapsed_check check (
    elapsed_ms is null or (elapsed_ms >= 0 and elapsed_ms <= 86400000)
  ),

  constraint exam_integrity_events_metadata_check check (
    public.exam_integrity_metadata_ok(metadata)
  )
);

comment on table public.exam_integrity_events is
  'Append-only audit trail of integrity-relevant events during a mock exam. '
  'CLIENT-REPORTED and therefore evidence, never proof: a browser cannot detect '
  'screenshots, and reports can be suppressed or forged. Enforcement lives in '
  'M2 and routes to human review. No student-readable path by design.';

comment on column public.exam_integrity_events.attempt_id is
  'NOT NULL. Client-minted uuid identifying one exam attempt, generated at exam '
  'start and held in the timer state so it survives a refresh. Every event '
  'belongs to an attempt — one without is unreviewable, and since the id is '
  'minted before any event can occur, a null could only mean a bug. Joins to '
  'exam_practice_sessions.attempt_id, which is NULLABLE, because not every '
  'attempt produces a saved session.';

comment on column public.exam_integrity_events.confidence is
  'GENERATED from event_type — never client-supplied, so it cannot be '
  'mislabelled to dodge or manufacture enforcement. high = copy, print, '
  'fullscreen_exit; low = visibility_hidden, window_blur, context_menu. '
  'FAIL-LOUD: both lists are exhaustive with no catch-all, so an event_type '
  'added to the CHECK but left unclassified yields NULL and is rejected by NOT '
  'NULL (23502) rather than defaulting. A 23502 here means someone widened the '
  'event_type domain without classifying the new type. Changing this mapping is '
  'a schema change on purpose; strike THRESHOLDS live in system_settings.';

comment on column public.exam_integrity_events.elapsed_ms is
  'Milliseconds from exam start. Preferred over a client wall-clock timestamp: '
  'it answers when-in-the-exam without leaking the device clock or timezone.';

comment on column public.exam_integrity_events.metadata is
  'PRINCIPLE: metadata must describe the security event itself and must never be '
  'sufficient to reconstruct student activity, exam content, copied content, or '
  'a device fingerprint. '
  'Bounded by exam_integrity_metadata_ok(): only selection_length, hidden_ms '
  'and blurred_ms, all non-negative numbers, 256 bytes max. Never keystrokes, '
  'clipboard or selected text, screen content, user agent, IP, or the device '
  'fingerprint mock-exam.html computes for the device guard.';

-- =====================================================================
-- 3. INDEXES
-- =====================================================================
-- Admin review of one student, newest first — the main read path.
create index exam_integrity_events_user_time_idx
  on public.exam_integrity_events (user_id, occurred_at desc);

-- Everything that happened in one attempt, and the join to a saved session.
create index exam_integrity_events_attempt_idx
  on public.exam_integrity_events (attempt_id);

-- Partial: only high-confidence events can ever matter to enforcement, and they
-- are a small minority of rows. M2 will count against exactly this predicate.
create index exam_integrity_events_high_conf_idx
  on public.exam_integrity_events (user_id, occurred_at desc)
  where confidence = 'high';

-- =====================================================================
-- 4. ROW LEVEL SECURITY
-- =====================================================================
alter table public.exam_integrity_events enable row level security;

-- A student may record their own events and nothing else. The WITH CHECK pins
-- user_id to the caller, so one student cannot write events against another.
create policy exam_integrity_events_insert_own
  on public.exam_integrity_events
  for insert to authenticated
  with check (user_id = auth.uid());

-- Admin read. There is deliberately NO student SELECT policy: per the approved
-- decision there is no student-facing integrity log, and exposing the detection
-- rules to the people being detected would defeat them. A student under review
-- is told so in plain language by the UI, without the internals.
--
-- Note this is stronger than filtering rows: a student's SELECT matches no
-- policy at all, so it returns nothing regardless of what they ask for.
create policy exam_integrity_events_admin_read
  on public.exam_integrity_events
  for select to authenticated
  using (public.has_role_at_least('admin'));

-- NO UPDATE POLICY AND NO DELETE POLICY EXIST, AND THAT IS THE POINT.
-- An UPDATE or DELETE from any client role matches no policy and is refused
-- before a single column is considered. This is the absence of the verb, not a
-- restriction on it — the same construction 20260815b uses for support tickets.

-- =====================================================================
-- 5. TABLE PRIVILEGES — the second append-only layer
-- =====================================================================
-- REQUIRED, not belt-and-braces: pg_default_acl on this database grants
-- arwdDxtm on every new table to anon, authenticated and service_role at
-- creation time. Without these statements the table is fully writable — and
-- deletable — by anon the moment it exists, with only RLS in the way.
revoke all on table public.exam_integrity_events from anon;
revoke all on table public.exam_integrity_events from authenticated;

-- Exactly two verbs for a signed-in student, both then narrowed by RLS above:
-- INSERT (own rows only) and SELECT (which yields nothing unless admin).
grant insert, select on table public.exam_integrity_events to authenticated;

-- anon gets nothing. Sitting an exam requires an account.
-- service_role keeps its default grants: admin-actions reads through it, and
-- retention/erasure needs DELETE (see §6).

-- Same trap for functions — ALTER DEFAULT PRIVILEGES granted anon EXECUTE.
revoke all on function public.exam_integrity_metadata_ok(jsonb) from anon;

-- =====================================================================
-- 6. APPEND-ONLY, ENFORCED IN THE DATABASE — and the one door left open
-- =====================================================================
-- Layers one and two (RLS with no UPDATE policy; revoked privileges) stop every
-- client. Neither stops service_role or postgres, both of which bypass RLS. This
-- trigger does, so a mistaken UPDATE from a backend script fails loudly instead
-- of silently rewriting history.
create or replace function public.exam_integrity_events_no_update()
returns trigger
language plpgsql
as $$
begin
  raise exception
    'exam_integrity_events is append-only: UPDATE is not permitted (row %)', old.id
    using errcode = '42501';
end;
$$;

create trigger exam_integrity_events_block_update
  before update on public.exam_integrity_events
  for each row execute function public.exam_integrity_events_no_update();

revoke all on function public.exam_integrity_events_no_update() from anon;

-- DELETE IS DELIBERATELY *NOT* BLOCKED BY A TRIGGER, AND THIS IS LOAD-BEARING.
--
-- A symmetric BEFORE DELETE trigger would look tidier and would be a serious
-- bug. Three things need DELETE to keep working:
--
--   1. ON DELETE CASCADE from auth.users. A raising trigger would make deleting
--      a user account fail outright — the cascade would hit the exception and
--      abort. Closing an account would become impossible.
--   2. Data-protection erasure. These students are largely minors; a request to
--      erase must be satisfiable.
--   3. Retention pruning. Behavioural event logs should not be kept forever.
--
-- So DELETE is closed to every client (no policy, no privilege) and open to
-- service_role.
--
-- =====================================================================
-- WHAT "APPEND-ONLY" MEANS HERE — AND WHAT IT DOES NOT
-- =====================================================================
-- Revision 2 of this file said "no actor can ever ALTER a recorded event".
-- That was STRONGER THAN THE POSTGRESQL PRIVILEGE MODEL SUPPORTS, and review
-- was right to catch it. The accurate claim:
--
--   No application or client path can update or delete an integrity event.
--   Privileged database administration can still perform exceptional
--   maintenance if explicitly authorised.
--
-- This is protection against ordinary application and backend mistakes. It is
-- NOT cryptographic immutability, and nothing here should be described to an
-- Admin, a student, or an auditor as if it were.
--
-- WHO CAN UPDATE A ROW, verified against this database on 2026-08-23 rather
-- than assumed:
--
--   anon                  NO. No RLS policy and no privilege — blocked twice.
--   authenticated         NO. No UPDATE policy and no UPDATE grant — blocked
--                         twice, before any column is considered.
--   service_role          NO — and this one is worth stating precisely, because
--                         it is the role Edge Functions and admin-actions run
--                         as, i.e. the realistic accident. It has BYPASSRLS, so
--                         RLS does not stop it, but triggers fire for it like
--                         any other role. It cannot disable the trigger: it is
--                         NOT the table owner and NOT a member of postgres —
--                         the membership runs the other way, postgres is a
--                         member of service_role. It cannot use replica mode
--                         either: session_replication_role has
--                         context = 'superuser', service_role is not one, and
--                         pg_parameter_acl is empty so no SET grant exists.
--   postgres              YES, BUT ONLY DELIBERATELY. It runs migrations and
--                         owns the table (51 public tables today), and an owner
--                         may ALTER TABLE ... DISABLE TRIGGER or DROP TRIGGER.
--                         The trigger cannot be a boundary against the role
--                         that is allowed to remove it. Note postgres is NOT a
--                         superuser here (rolsuper = false), so it cannot take
--                         the replica-mode route — it has to issue explicit
--                         DDL, which is visible and auditable.
--   supabase_admin        YES. The platform superuser. Outside anything this
--                         migration can constrain, by definition.
--
-- The practical reading: the trigger's job is to stop a backend script or an
-- Edge Function from rewriting history by mistake, and it does that completely.
-- Changing a recorded event requires a deliberate, privileged DDL act by a
-- human with owner or superuser rights — which is exactly the "exceptional
-- maintenance if explicitly authorised" case, and should leave a trail of its
-- own outside this table.
--
-- ON HARDENING FURTHER, AND WHY THIS FILE DOES NOT:
-- ALTER TABLE ... ENABLE ALWAYS TRIGGER would make the trigger fire even under
-- session_replication_role = 'replica'. It is not included, because it would
-- close a door only supabase_admin can open, and supabase_admin can equally
-- drop the trigger. It would buy protection against an accidental replica-mode
-- session and nothing more, so it is recorded here as an option rather than
-- adopted as security theatre.
--
-- What this table DOES guarantee, and what actually matters for review:
-- no student can alter their own record, no student can delete one, and no
-- application code path can do either on their behalf.

-- =====================================================================
-- 7. THE LINKAGE COLUMN ON exam_practice_sessions (NULLABLE — see the header
--    block "TWO COLUMNS ARE CALLED attempt_id")
-- =====================================================================
-- THE PROBLEM THIS SOLVES, which is a real property of the existing code:
-- mock-exam.html INSERTs its exam_practice_sessions row inside doSave(), at the
-- very END of the flow — after the timer has run, after the score is entered,
-- after mistakes are logged. Integrity events happen DURING the exam, when no
-- session row exists and no session id can. There is simply nothing to
-- reference at the moment an event occurs.
--
-- THE LIFECYCLE:
--   1. Exam start   — the client mints attempt_id (crypto.randomUUID) and puts
--                     it in the persisted timer state, so it survives a refresh,
--                     a tab close, or the multi-tab ownership handover.
--   2. During       — every integrity event is written carrying that attempt_id.
--   3. Save         — doSave() writes the same attempt_id onto the
--                     exam_practice_sessions row it creates.
--   4. Review       — Admin joins events to the session on attempt_id.
--
-- Nothing is ever backfilled, which is what keeps §6 true.
--
-- WHY *THIS* COLUMN IS NULLABLE (the events column is NOT NULL — they differ):
--   * Every exam_practice_sessions row that already exists predates this column.
--     A NOT NULL would require inventing values for historical rows.
--   * A client running an older cached build saves without one.
--   * An exam ABANDONED before saving produces events and never produces a
--     session row at all. Those events are still worth having — an attempt
--     abandoned right after a copy event is exactly the shape review cares about
--     — so the linkage has to tolerate one side being absent, permanently.
--   * The 23505 idempotency-recovery path in doSave() adopts an already-committed
--     winner row and skips its downstream writes; a nullable column cannot make
--     that path fail.
--
-- SAFE FOR THE EXISTING SAVE FLOW: additive, nullable, no default, no backfill,
-- no rewrite of the table. Verified that exam_practice_sessions carries
-- table-level rather than column-level grants, so authenticated INSERT covers
-- the new column automatically (see the header).
alter table public.exam_practice_sessions
  add column if not exists attempt_id uuid;

comment on column public.exam_practice_sessions.attempt_id is
  'Client-minted uuid for one exam attempt, matching '
  'exam_integrity_events.attempt_id. Nullable: rows predating Mock Exam v2 have '
  'none, older clients send none, and an abandoned exam produces events with no '
  'session row at all. Never backfilled.';

-- Partial index: the join key for review, skipping every historical row.
--
-- NOT UNIQUE, deliberately. A unique constraint would be better data hygiene and
-- would catch two sessions claiming one attempt — but if it ever fired it would
-- fire inside doSave(), turning a data-quality problem into a student losing
-- their saved exam. An audit feature must not be able to break the save path.
create index if not exists exam_practice_sessions_attempt_idx
  on public.exam_practice_sessions (attempt_id)
  where attempt_id is not null;

commit;

-- =====================================================================
-- VERIFICATION — run AFTER applying, expect every line to report ok
-- =====================================================================
-- 1. Append-only holds against the table owner, not just clients:
--      insert into public.exam_integrity_events
--        (user_id, attempt_id, exam_code, event_type)
--        values ('<a real auth.users id>', gen_random_uuid(), 'SAT_FULL', 'copy');
--      update public.exam_integrity_events set exam_code = 'X';
--      -- expect: ERROR 42501 exam_integrity_events is append-only
--
-- 2. confidence is derived and cannot be supplied:
--      insert into public.exam_integrity_events
--        (user_id, attempt_id, exam_code, event_type, confidence) ...
--      -- expect: ERROR 428C9 cannot insert a non-DEFAULT value into column
--      select event_type, confidence from public.exam_integrity_events;
--      -- expect: copy -> high, visibility_hidden -> low
--
-- 3. FAIL-LOUD classification — the rev 4 behaviour, and the one check that
--    would have silently passed before it:
--      -- a) both mapped branches resolve
--      select event_type, confidence from public.exam_integrity_events;
--      -- expect: copy -> high, window_blur -> low
--
--      -- b) an unmapped type cannot be recorded. Simulate a careless future
--      --    migration IN A TRANSACTION YOU ROLL BACK:
--      begin;
--        alter table public.exam_integrity_events
--          drop constraint exam_integrity_events_event_type_check;
--        alter table public.exam_integrity_events
--          add constraint exam_integrity_events_event_type_check
--          check (event_type in ('copy','print','fullscreen_exit',
--                                'visibility_hidden','window_blur','context_menu',
--                                'screenshot_attempt'));
--        insert into public.exam_integrity_events
--          (user_id, attempt_id, exam_code, event_type)
--          values ('<id>', gen_random_uuid(), 'SAT_FULL', 'screenshot_attempt');
--        -- EXPECT: ERROR 23502 null value in column "confidence" ... not-null
--        -- If this INSERT SUCCEEDS, fail-loud is broken — do not ship.
--      rollback;
--
-- 4. metadata whitelist bites:
--      ... metadata => '{"user_agent":"x"}'   -- expect: CHECK violation 23514
--      ... metadata => '{"hidden_ms":-1}'     -- expect: CHECK violation 23514
--      ... metadata => '{"hidden_ms":4200}'   -- expect: ok
--
-- 5. anon holds no privileges:
--      select grantee, privilege_type from information_schema.role_table_grants
--       where table_name = 'exam_integrity_events';
--      -- expect: NO anon rows; authenticated has INSERT and SELECT only
--
-- 6. The save flow still works — the point of the whole linkage:
--      insert into public.exam_practice_sessions (user_id, exam_type, attempt_id)
--        values ('<id>', 'SAT_FULL', '<same attempt_id>');
--      -- expect: ok, and joining the two on attempt_id returns the events
--
-- 7. Cascade still deletes (proves §6's open door is really open):
--      -- on a disposable test account only:
--      delete from auth.users where id = '<test id>';
--      -- expect: ok, and its integrity events are gone with it
