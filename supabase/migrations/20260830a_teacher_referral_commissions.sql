-- ===========================================================================
-- 20260830a_teacher_referral_commissions.sql
-- ===========================================================================
-- STATUS: PREPARED — NOT APPLIED.
--
-- Per CLAUDE.md §3 this file is inert until someone reviews it, approves it
-- explicitly, and runs it. Writing it is not applying it.
--
-- Teacher referral with commission on a student's FIRST paid purchase only.
--
-- Design notes, because the constraints carry the business rules rather than
-- application code carrying them:
--
--   • "First paid purchase only" is UNIQUE(student_user_id) on
--     referral_commissions. A second commission for the same student is
--     impossible at the storage layer, so a renewal cannot pay out even if a
--     future edit to the award function forgets the rule. If lifetime
--     commission is ever wanted, drop one constraint instead of rewriting a
--     payout path.
--
--   • "Attributed once, to one teacher" is PRIMARY KEY(student_user_id) on
--     referral_attributions. First touch wins structurally; a second teacher's
--     code cannot overwrite the first.
--
--   • "Once per purchase" is UNIQUE(payment_request_id). Re-approving a request
--     cannot double-award.
--
--   • Rates live in commission_tiers as data, not in code — the same principle
--     that makes plan_definitions the single source of truth for prices.
--
--   • rate_bps and tier_at_award are FROZEN into each commission row. Crossing
--     into a higher tier tomorrow must not silently restate what was earned
--     yesterday.
--
--   • The award hook goes in approve_payment_request, which is already the only
--     route to a paid state for both packs and subscriptions. There is no other
--     path, so attribution cannot be bypassed.
--
-- Nothing here moves money. status tracks accrual for admin review only.
-- ===========================================================================

begin;

-- ── 1. Referral codes ──────────────────────────────────────────────────────
create table if not exists public.referral_codes (
  code            text primary key,
  teacher_user_id uuid not null references public.profiles(id) on delete cascade,
  label           text,
  active          boolean not null default true,
  created_at      timestamptz not null default now(),
  constraint referral_codes_code_shape check (code ~ '^[A-Z0-9][A-Z0-9_-]{2,31}$')
);
comment on table public.referral_codes is
  'Referral codes owned by teachers. A teacher may hold several so campaigns stay separable. Codes are stored upper-case; attribute_referral() upper-cases on the way in.';

create index if not exists referral_codes_teacher_idx
  on public.referral_codes(teacher_user_id) where active;

-- ── 2. Attribution — one row per student, ever ─────────────────────────────
create table if not exists public.referral_attributions (
  student_user_id uuid primary key references public.profiles(id) on delete cascade,
  code            text not null references public.referral_codes(code),
  teacher_user_id uuid not null references public.profiles(id) on delete cascade,
  attributed_at   timestamptz not null default now(),
  source          text not null default 'manual_code'
    check (source in ('signup_link','manual_code','admin'))
);
comment on table public.referral_attributions is
  'First-touch attribution. The primary key IS the business rule: a student can be attributed to exactly one teacher, once, and a later code cannot overwrite it.';

create index if not exists referral_attributions_teacher_idx
  on public.referral_attributions(teacher_user_id);

-- ── 3. Commission tiers — rates as data ────────────────────────────────────
create table if not exists public.commission_tiers (
  min_students int primary key check (min_students >= 1),
  rate_bps     int not null check (rate_bps between 0 and 10000),
  label        text
);
comment on table public.commission_tiers is
  'Commission rate by the teacher''s cumulative count of paid students. rate_bps is basis points: 1000 = 10%, 1250 = 12.5%, 1500 = 15%.';

insert into public.commission_tiers (min_students, rate_bps, label) values
  (1,  1000, '1-9 paid students'),
  (10, 1250, '10-29 paid students'),
  (30, 1500, '30+ paid students')
on conflict (min_students) do update
  set rate_bps = excluded.rate_bps, label = excluded.label;

-- ── 4. Commissions ─────────────────────────────────────────────────────────
create table if not exists public.referral_commissions (
  id                 uuid primary key default gen_random_uuid(),
  teacher_user_id    uuid not null references public.profiles(id) on delete restrict,
  student_user_id    uuid not null references public.profiles(id) on delete restrict,
  payment_request_id uuid not null references public.payment_requests(id) on delete restrict,
  plan_code          text not null,
  gross_amount_egp   numeric(12,2) not null check (gross_amount_egp >= 0),
  rate_bps           int not null check (rate_bps between 0 and 10000),
  tier_at_award      int not null,
  student_number     int not null,
  commission_egp     numeric(12,2) not null check (commission_egp >= 0),
  status             text not null default 'accrued'
    check (status in ('accrued','approved','paid','reversed')),
  created_at         timestamptz not null default now(),
  -- The two rules that must never be violated, enforced by the database.
  constraint referral_commissions_one_per_student unique (student_user_id),
  constraint referral_commissions_one_per_payment unique (payment_request_id)
);
comment on constraint referral_commissions_one_per_student on public.referral_commissions is
  'FIRST paid purchase only. Renewals cannot pay out. Drop this constraint to enable lifetime commission.';

create index if not exists referral_commissions_teacher_idx
  on public.referral_commissions(teacher_user_id, created_at desc);

-- ── 5. Student claims a code ───────────────────────────────────────────────
create or replace function public.attribute_referral(p_code text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  _uid     uuid := auth.uid();
  _code    text := upper(trim(coalesce(p_code, '')));
  _teacher uuid;
begin
  if _uid is null then
    return jsonb_build_object('ok', false, 'reason', 'not_authenticated');
  end if;

  select teacher_user_id into _teacher
  from public.referral_codes where code = _code and active;

  if _teacher is null then
    return jsonb_build_object('ok', false, 'reason', 'unknown_code');
  end if;

  if _teacher = _uid then
    return jsonb_build_object('ok', false, 'reason', 'own_code');
  end if;

  -- First touch wins. An existing attribution is reported, never replaced.
  insert into public.referral_attributions (student_user_id, code, teacher_user_id, source)
  values (_uid, _code, _teacher, 'manual_code')
  on conflict (student_user_id) do nothing;

  return (
    select jsonb_build_object(
      'ok', true,
      'already_attributed', a.code <> _code,
      'code', a.code,
      'attributed_at', a.attributed_at)
    from public.referral_attributions a where a.student_user_id = _uid
  );
end;
$function$;

revoke all on function public.attribute_referral(text) from public, anon;
grant execute on function public.attribute_referral(text) to authenticated;

-- ── 6. The award helper ────────────────────────────────────────────────────
-- Called from approve_payment_request for both packs and subscriptions. Silent
-- and side-effect-free when the student has no attribution or has already had a
-- commission awarded — the ON CONFLICT makes a double-award impossible rather
-- than merely unlikely.
create or replace function public.award_referral_commission(
  p_student_user_id    uuid,
  p_payment_request_id uuid,
  p_plan_code          text,
  p_amount_egp         numeric
) returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  _teacher  uuid;
  _prior    int;
  _number   int;
  _tier     int;
  _rate     int;
begin
  select teacher_user_id into _teacher
  from public.referral_attributions where student_user_id = p_student_user_id;

  if _teacher is null then return; end if;

  select count(*) into _prior
  from public.referral_commissions
  where teacher_user_id = _teacher and status <> 'reversed';

  _number := _prior + 1;

  select min_students, rate_bps into _tier, _rate
  from public.commission_tiers
  where min_students <= _number
  order by min_students desc
  limit 1;

  if _rate is null then return; end if;

  insert into public.referral_commissions (
    teacher_user_id, student_user_id, payment_request_id, plan_code,
    gross_amount_egp, rate_bps, tier_at_award, student_number, commission_egp)
  values (
    _teacher, p_student_user_id, p_payment_request_id, p_plan_code,
    coalesce(p_amount_egp, 0), _rate, _tier, _number,
    round(coalesce(p_amount_egp, 0) * _rate / 10000.0, 2))
  on conflict do nothing;   -- first purchase only; once per payment
end;
$function$;

revoke all on function public.award_referral_commission(uuid, uuid, text, numeric)
  from public, anon, authenticated;

-- ── 7. RLS ─────────────────────────────────────────────────────────────────
alter table public.referral_codes         enable row level security;
alter table public.referral_attributions  enable row level security;
alter table public.commission_tiers       enable row level security;
alter table public.referral_commissions   enable row level security;

-- A teacher sees their own codes; anyone authenticated may read an active code
-- to validate it before claiming. Writes are admin-only.
create policy referral_codes_read_own on public.referral_codes
  for select to authenticated
  using (teacher_user_id = auth.uid()
         or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));

-- A student sees their own attribution; a teacher sees students attributed to them.
create policy referral_attributions_read on public.referral_attributions
  for select to authenticated
  using (student_user_id = auth.uid() or teacher_user_id = auth.uid()
         or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));

create policy commission_tiers_read on public.commission_tiers
  for select to authenticated using (true);

-- A teacher sees their own commissions. Nobody but an admin sees anyone else's.
create policy referral_commissions_read on public.referral_commissions
  for select to authenticated
  using (teacher_user_id = auth.uid()
         or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));

-- No INSERT/UPDATE/DELETE policy on any of the four tables: every write goes
-- through a SECURITY DEFINER function. A client-writable commission table is a
-- client-writable payout.

commit;
