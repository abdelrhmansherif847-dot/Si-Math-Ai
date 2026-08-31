-- =====================================================================
-- Teacher Partner Program — 1 of 4: the tables
-- =====================================================================
-- STATUS: 🟡 PREPARED — NOT APPLIED. Dry-run only.
--         Apply with explicit owner approval, per CLAUDE.md §3.
-- APPLY ORDER: b (tables) -> c (engine) -> d (rpcs) -> e (payment hooks)
-- ROLLBACK:    20260831y, which unhooks e before dropping anything.
--
-- WHAT THIS IS
-- ------------
-- A commission layer on the classroom system that already exists. It adds NO
-- teacher role, NO second user system and NO duplicate student relationship:
-- a teacher is still the holder of an active workspace_staff row with
-- staff_role = 'teacher', exactly as 20260830a/h define it.
--
-- THE ORGANISING RULE
-- -------------------
-- The business rules are carried by CONSTRAINTS, not by application code. A
-- rule written in a function can be forgotten by the next function; a rule
-- written as a unique index cannot be violated by anything, including a bug
-- nobody has written yet.
--
--   referral_attributions.student_user_id  PRIMARY KEY  -> one teacher per student
--   referral_commissions.student_user_id   UNIQUE       -> one first purchase, ever
--   referral_commissions(source_kind, source_id) UNIQUE -> one award per payment
--   purchase_events(source_kind, source_id)      UNIQUE -> one event per payment
--
-- WHY BASIS POINTS
-- ----------------
-- 12.5% is 1250, exactly. Stored as 0.125 in a float it is not exactly
-- anything, and the first disputed payout becomes an argument about binary
-- fractions. Rates are integers; money is numeric; nothing here is a float.
-- =====================================================================

begin;

-- ── 1 · rates: the single configurable source ────────────────────────────
create table if not exists referral_commission_rates (
  id                 smallint primary key,
  min_paid_students  integer not null check (min_paid_students >= 1),
  max_paid_students  integer          check (max_paid_students is null
                                             or max_paid_students >= min_paid_students),
  rate_bps           integer not null check (rate_bps between 0 and 10000),
  label              text    not null,
  updated_at         timestamptz not null default now(),
  updated_by         uuid references auth.users(id)
);

comment on table referral_commission_rates is
  'The commission ladder, and the only place it lives. Changing a rate is one '
  'UPDATE: no schema change, no deploy, and no effect on commissions already '
  'awarded, because every award freezes its own rate. Bands are validated as a '
  'SET by referral_rates_guard() — contiguous, non-overlapping, starting at 1 '
  'and ending open-ended — so a student count can never fall between two rates '
  'or match two.';

insert into referral_commission_rates (id, min_paid_students, max_paid_students, rate_bps, label)
values (1,  1,  9,    1000, '10%'),
       (2, 10, 29,    1250, '12.5%'),
       (3, 30, null,  1500, '15%')
on conflict (id) do nothing;

/* A ladder is only meaningful as a whole, so it is validated as a whole. A
   per-row CHECK cannot see a gap between rows, and a gap is the failure that
   would silently award 0% to somebody. */
create or replace function referral_rates_guard()
returns trigger
language plpgsql
as $$
declare
  r          record;
  v_expected int := 1;
  v_open     int := 0;
begin
  for r in select * from referral_commission_rates order by min_paid_students loop
    if r.min_paid_students <> v_expected then
      raise exception 'referral rate bands must be contiguous from 1: expected a band starting at %, found %',
        v_expected, r.min_paid_students using errcode = '23514';
    end if;
    if r.max_paid_students is null then
      v_open := v_open + 1;
      v_expected := null;
    else
      v_expected := r.max_paid_students + 1;
    end if;
  end loop;

  if v_open <> 1 then
    raise exception 'exactly one referral rate band must be open-ended (max_paid_students null); found %', v_open
      using errcode = '23514';
  end if;
  return null;
end;
$$;

drop trigger if exists referral_rates_guard_trg on referral_commission_rates;
create constraint trigger referral_rates_guard_trg
  after insert or update or delete on referral_commission_rates
  deferrable initially deferred
  for each row execute function referral_rates_guard();

-- ── 2 · one referral code per teacher ────────────────────────────────────
create table if not exists referral_codes (
  teacher_user_id uuid primary key references auth.users(id) on delete restrict,
  code            text not null unique,
  active          boolean not null default true,
  created_at      timestamptz not null default now()
);

comment on table referral_codes is
  'One code per teacher — the PRIMARY KEY says so. Keyed by USER, not by '
  'workspace, because teacher_workspaces has no unique constraint on owner_id '
  'and one teacher may run several classes. A separate namespace from '
  'student_join_code on purpose: reusing the classroom code would make every '
  'classroom join look like a referral, and a classroom student is explicitly '
  'not commission-eligible. ON DELETE RESTRICT, like every table here that '
  'touches money.';

create index if not exists referral_codes_code_idx on referral_codes (code) where active;

-- ── 3 · attribution: last touch until paid, then permanent ───────────────
create table if not exists referral_attributions (
  student_user_id uuid primary key references auth.users(id) on delete restrict,
  teacher_user_id uuid not null    references auth.users(id) on delete restrict,
  code            text not null,
  source          text not null check (source in ('signup_link','code_entry','admin')),
  attributed_at   timestamptz not null default now(),
  locked_at       timestamptz,
  locked_reason   text,
  note            text,
  check (teacher_user_id <> student_user_id)
);

comment on table referral_attributions is
  'Which teacher a student is credited to. PRIMARY KEY(student_user_id) makes '
  '"one teacher per student" structural rather than conventional. While '
  'locked_at is null the row may be re-pointed by a later code — last touch '
  'wins for a student who has not yet paid. The first successful purchase sets '
  'locked_at, and from then on only an audited admin action can move it. The '
  'guard trigger, not convention, enforces that.';

create index if not exists referral_attributions_teacher_idx
  on referral_attributions (teacher_user_id, attributed_at desc);

-- ── 4 · the canonical purchase ledger ────────────────────────────────────
/* The platform has two payment paths that share no table (see 20260831e), so
   until now there was no single answer to "has this student ever bought
   anything?". Both paths now write one row here, and everything downstream —
   first-purchase, attribution locking, commission — reads this and nothing
   else. A future third payment path joins by writing one line. */
create table if not exists purchase_events (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete restrict,
  source_kind  text not null check (source_kind in ('payment_request','payment')),
  source_id    uuid not null,
  plan_code    text not null,
  plan_kind    text,
  gross_egp    numeric(12,2) check (gross_egp is null or gross_egp >= 0),
  occurred_at  timestamptz not null default now(),
  unique (source_kind, source_id)
);

comment on table purchase_events is
  'One row per SUCCESSFULLY ACTIVATED purchase, from either payment path. The '
  'single canonical event the commission engine listens to, so a commission '
  'cannot be skipped depending on which path was used. gross_egp is resolved '
  'server-side from plan_definitions and is NULL when the plan cannot be '
  'priced — five legacy payments carry free-text reference_ids like "Simath" '
  'rather than plan codes. A NULL price still counts as a purchase (so it '
  'still blocks a later first-purchase commission) but can never award one.';

comment on column purchase_events.gross_egp is
  'The authoritative catalogue price at activation. NEVER payment_requests.'
  'amount_egp, which is a direct client insert with no trigger and no CHECK — '
  'a commission computed from it would be a payout the payer types.';

create index if not exists purchase_events_user_idx on purchase_events (user_id, occurred_at);

-- ── 5 · the commission ledger ────────────────────────────────────────────
create table if not exists referral_commissions (
  id                  uuid primary key default gen_random_uuid(),
  student_user_id     uuid not null unique references auth.users(id) on delete restrict,
  teacher_user_id     uuid not null        references auth.users(id) on delete restrict,
  purchase_event_id   uuid not null        references purchase_events(id) on delete restrict,
  source_kind         text not null,
  source_id           uuid not null,
  plan_code           text not null,

  -- frozen at award. A later tier change must never restate history.
  gross_egp           numeric(12,2) not null check (gross_egp > 0),
  rate_bps            integer       not null check (rate_bps between 0 and 10000),
  tier_label          text          not null,
  paid_count_at_award integer       not null check (paid_count_at_award >= 1),
  commission_egp      numeric(12,2) not null check (commission_egp >= 0),

  -- payout accounting. Gross commission is recorded separately from any future
  -- withholding, which is not yet knowable — see 20260831d.
  withholding_egp     numeric(12,2) check (withholding_egp is null or withholding_egp >= 0),
  net_payable_egp     numeric(12,2) check (net_payable_egp  is null or net_payable_egp  >= 0),

  status              text not null default 'pending'
                      check (status in ('pending','approved','paid','reversed')),
  awarded_at          timestamptz not null default now(),
  approved_at         timestamptz, approved_by uuid references auth.users(id),
  paid_at             timestamptz, paid_by     uuid references auth.users(id),
  reversed_at         timestamptz, reversed_by uuid references auth.users(id),
  reversal_reason     text,

  unique (source_kind, source_id)
);

comment on table referral_commissions is
  'The money. Two constraints carry the two rules the brief calls structural: '
  'UNIQUE(student_user_id) means a teacher can never be paid twice for one '
  'student, and UNIQUE(source_kind, source_id) means one approval can never '
  'award twice however many times the engine fires. Neither is enforced by '
  'code that could be bypassed. gross_egp, rate_bps, tier_label, '
  'paid_count_at_award and commission_egp are FROZEN at award: when a teacher '
  'crosses from 10% to 12.5%, history does not rewrite itself. Rows are never '
  'deleted — a reversal sets status and keeps the record, because a number '
  'that vanishes from somebody''s earnings is worse than one marked withdrawn.';

comment on column referral_commissions.commission_egp is
  'round(gross_egp * rate_bps / 10000, 2) — numeric, half-up. EGP 349 at 1250 '
  'bps is 43.625 exactly, stored as 43.63 because that is what gets paid. '
  'gross_egp and rate_bps are on the row, so the exact figure is recomputable '
  'forever and no dispute rests on this column alone.';

create index if not exists referral_commissions_teacher_idx
  on referral_commissions (teacher_user_id, status, awarded_at desc);

-- ── 6 · why an award did NOT happen ──────────────────────────────────────
/* An award that silently does not happen is indistinguishable from a system
   that does not work. Every skip that is not simply "this student was never
   referred" leaves a row here, so an admin can see it and act. */
create table if not exists referral_award_skips (
  id           bigserial primary key,
  occurred_at  timestamptz not null default now(),
  user_id      uuid,
  source_kind  text,
  source_id    uuid,
  reason       text not null,
  detail       jsonb
);

comment on table referral_award_skips is
  'Diagnostic, not accounting. Records every reason a purchase did not produce '
  'a commission other than the ordinary one (the student was never referred), '
  'including any exception the engine caught. The engine catches rather than '
  'raises because a student''s plan must never fail to activate over an '
  'accounting row.';

-- ── 7 · audit ────────────────────────────────────────────────────────────
create table if not exists referral_audit_log (
  id          bigserial primary key,
  actor_id    uuid references auth.users(id),
  action      text not null,
  subject_id  uuid,
  created_at  timestamptz not null default now(),
  meta        jsonb
);

comment on table referral_audit_log is
  'Mirrors workspace_audit_log''s shape. Every admin write in this system — '
  'approve, mark paid, reverse, reassign — leaves a row. Nothing here is '
  'silently mutable.';

-- ── 8 · attribution guard: last touch until paid, immutable after ────────
create or replace function referral_attributions_guard()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'referral_attributions: rows are never deleted' using errcode = '42501';
  end if;

  if tg_op = 'UPDATE' then
    -- Only the SECURITY DEFINER RPCs may write. current_setting is set by them
    -- and is transaction-local, so a direct client UPDATE cannot forge it.
    if coalesce(current_setting('si.referral_rpc', true), '') <> 'on' then
      raise exception 'referral_attributions: use attribute_referral() or admin_reassign_referral()'
        using errcode = '42501';
    end if;
    if old.student_user_id <> new.student_user_id then
      raise exception 'referral_attributions: the student is the key and cannot change'
        using errcode = '42501';
    end if;
    if old.locked_at is not null and new.locked_at is null then
      raise exception 'referral_attributions: an attribution cannot be unlocked'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists referral_attributions_guard_trg on referral_attributions;
create trigger referral_attributions_guard_trg
  before update or delete on referral_attributions
  for each row execute function referral_attributions_guard();

-- ── 9 · commissions are append-and-transition, never delete ──────────────
create or replace function referral_commissions_guard()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'referral_commissions: accounting rows are never deleted' using errcode = '42501';
  end if;

  if coalesce(current_setting('si.referral_rpc', true), '') <> 'on' then
    raise exception 'referral_commissions: use the admin commission RPCs' using errcode = '42501';
  end if;

  -- The frozen columns are frozen. Not by convention — here.
  if new.gross_egp      <> old.gross_egp
  or new.rate_bps       <> old.rate_bps
  or new.tier_label     <> old.tier_label
  or new.commission_egp <> old.commission_egp
  or new.paid_count_at_award <> old.paid_count_at_award
  or new.student_user_id <> old.student_user_id
  or new.teacher_user_id <> old.teacher_user_id then
    raise exception 'referral_commissions: the award is frozen; only status and payout fields may change'
      using errcode = '42501';
  end if;

  if old.status = 'paid' and new.status <> 'paid' and new.status <> 'reversed' then
    raise exception 'referral_commissions: a paid commission can only be reversed' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists referral_commissions_guard_trg on referral_commissions;
create trigger referral_commissions_guard_trg
  before update or delete on referral_commissions
  for each row execute function referral_commissions_guard();

-- ── 10 · RLS: clients read, and only their own. Every write is an RPC ────
alter table referral_commission_rates enable row level security;
alter table referral_codes            enable row level security;
alter table referral_attributions     enable row level security;
alter table purchase_events           enable row level security;
alter table referral_commissions      enable row level security;
alter table referral_award_skips      enable row level security;
alter table referral_audit_log        enable row level security;

-- The ladder is public to signed-in users: the Partner page has to show it.
drop policy if exists referral_rates_read on referral_commission_rates;
create policy referral_rates_read on referral_commission_rates
  for select to authenticated using (true);

drop policy if exists referral_codes_read on referral_codes;
create policy referral_codes_read on referral_codes
  for select to authenticated
  using (teacher_user_id = auth.uid() or has_role_at_least('admin'));

/* A teacher sees the students credited to them; a student sees their own row.
   Deliberately NOT symmetric with the commission table below. */
drop policy if exists referral_attributions_read on referral_attributions;
create policy referral_attributions_read on referral_attributions
  for select to authenticated
  using (teacher_user_id = auth.uid() or student_user_id = auth.uid() or has_role_at_least('admin'));

drop policy if exists purchase_events_read on purchase_events;
create policy purchase_events_read on purchase_events
  for select to authenticated
  using (user_id = auth.uid() or has_role_at_least('admin'));

/* The teacher and admins only. A student is NOT shown what their teacher earned
   from them: the brief did not ask for it, and disclosing it is a product and
   possibly a legal decision, not a default. One policy line reverses this if
   the answer is that they should see it. */
drop policy if exists referral_commissions_read on referral_commissions;
create policy referral_commissions_read on referral_commissions
  for select to authenticated
  using (teacher_user_id = auth.uid() or has_role_at_least('admin'));

drop policy if exists referral_skips_read on referral_award_skips;
create policy referral_skips_read on referral_award_skips
  for select to authenticated using (has_role_at_least('admin'));

drop policy if exists referral_audit_read on referral_audit_log;
create policy referral_audit_read on referral_audit_log
  for select to authenticated using (has_role_at_least('admin'));

-- No INSERT / UPDATE / DELETE policy exists on any table above, deliberately:
-- with RLS on and no write policy, a client write is refused whatever the
-- client believes. Writes arrive only through the SECURITY DEFINER RPCs in
-- 20260831c and 20260831d.

revoke all on referral_commission_rates, referral_codes, referral_attributions,
              purchase_events, referral_commissions, referral_award_skips,
              referral_audit_log
  from public, anon, authenticated;
grant select on referral_commission_rates, referral_codes, referral_attributions,
                purchase_events, referral_commissions, referral_award_skips,
                referral_audit_log
  to authenticated;

commit;
