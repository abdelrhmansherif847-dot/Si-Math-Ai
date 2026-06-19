-- Manual Payment V1
-- Creates payment_requests table, approval/rejection RPCs, and storage bucket policy

-- ── 1. payment_requests table ────────────────────────────────────────────────
create table if not exists public.payment_requests (
  id                uuid        primary key default gen_random_uuid(),
  user_id           uuid        not null references auth.users(id) on delete cascade,
  plan_code         text        not null,
  plan_label        text        not null,
  amount_egp        numeric     not null,
  method            text        not null check (method in ('vodafone_cash','instapay')),
  reference_note    text        not null,
  screenshot_url    text        not null,
  status            text        not null default 'pending'
                                check (status in ('pending','approved','rejected')),
  rejection_reason  text,
  created_at        timestamptz not null default now(),
  reviewed_at       timestamptz,
  reviewed_by       uuid
);

-- Indexes
create index if not exists payment_requests_user_id_idx   on public.payment_requests(user_id);
create index if not exists payment_requests_status_idx    on public.payment_requests(status);
create index if not exists payment_requests_created_at_idx on public.payment_requests(created_at desc);

-- ── 2. RLS ───────────────────────────────────────────────────────────────────
alter table public.payment_requests enable row level security;

-- Students: insert their own, read their own
create policy "Users can insert own payment requests"
  on public.payment_requests for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can read own payment requests"
  on public.payment_requests for select
  to authenticated
  using (
    auth.uid() = user_id
    or exists (
      select 1 from public.profiles
      where id = auth.uid() and is_admin = true
    )
  );

-- Admins: full access
create policy "Admins can update payment requests"
  on public.payment_requests for update
  to authenticated
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and is_admin = true
    )
  );

-- ── 3. Storage bucket for payment proofs ─────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'payment-proofs',
  'payment-proofs',
  false,
  10485760, -- 10 MB
  array['image/jpeg','image/png','image/webp','image/heic','image/gif']
)
on conflict (id) do nothing;

-- Storage RLS: owner can upload, admins can read all
create policy "Users can upload own payment proofs"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'payment-proofs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can read own payment proofs"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'payment-proofs'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or exists (
        select 1 from public.profiles
        where id = auth.uid() and is_admin = true
      )
    )
  );

-- ── 4. Plan metadata helper ───────────────────────────────────────────────────
-- Maps plan_code → (credits, period_days)
create table if not exists public.plan_definitions (
  plan_code       text    primary key,
  display_name    text    not null,
  credits_granted integer not null default 0,
  period_days     integer not null default 30,
  amount_egp      numeric not null default 0
);

insert into public.plan_definitions (plan_code, display_name, credits_granted, period_days, amount_egp) values
  ('PRO_MONTHLY', 'Pro Monthly', 500, 30,  199),
  ('PRO_ANNUAL',  'Pro Annual',  750, 365, 1499)
on conflict (plan_code) do nothing;

-- ── 5. approve_payment_request RPC ───────────────────────────────────────────
create or replace function public.approve_payment_request(
  request_id  uuid,
  admin_note  text default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  _caller_id    uuid := auth.uid();
  _is_admin     boolean;
  _req          public.payment_requests%rowtype;
  _plan_def     public.plan_definitions%rowtype;
  _expires_at   timestamptz;
  _now          timestamptz := now();
begin
  -- Verify caller is admin
  select is_admin into _is_admin
  from public.profiles where id = _caller_id;
  if not _is_admin then
    raise exception 'Unauthorized: admins only';
  end if;

  -- Load request
  select * into _req from public.payment_requests where id = request_id;
  if not found then
    raise exception 'Payment request not found';
  end if;
  if _req.status <> 'pending' then
    raise exception 'Payment request is already %', _req.status;
  end if;

  -- Load plan definition
  select * into _plan_def from public.plan_definitions where plan_code = _req.plan_code;
  if not found then
    raise exception 'Unknown plan_code: %', _req.plan_code;
  end if;

  _expires_at := _now + (_plan_def.period_days || ' days')::interval;

  -- Mark request as approved
  update public.payment_requests
  set status      = 'approved',
      reviewed_at = _now,
      reviewed_by = _caller_id
  where id = request_id;

  -- Write plan to profiles (the critical write that was missing)
  update public.profiles
  set plan_code                = _req.plan_code,
      subscription_credits     = _plan_def.credits_granted,
      credits_balance          = coalesce(pack_credits, 0) + _plan_def.credits_granted,
      subscription_expires_at  = _expires_at,
      upgrade_requested        = false,
      upgrade_note             = null
  where id = _req.user_id;

  -- Upsert subscriptions record
  insert into public.subscriptions (user_id, plan_code, plan_type, status, current_period_end, created_at)
  values (_req.user_id, _req.plan_code, 'SUBSCRIPTION', 'active', _expires_at, _now)
  on conflict (user_id) do update
    set plan_code          = excluded.plan_code,
        plan_type          = excluded.plan_type,
        status             = 'active',
        current_period_end = excluded.current_period_end;

  return json_build_object(
    'ok',              true,
    'user_id',         _req.user_id,
    'plan_code',       _req.plan_code,
    'credits_granted', _plan_def.credits_granted,
    'expires_at',      _expires_at
  );
end;
$$;

revoke all on function public.approve_payment_request(uuid, text) from public;
grant execute on function public.approve_payment_request(uuid, text) to authenticated;

-- ── 6. reject_payment_request RPC ────────────────────────────────────────────
create or replace function public.reject_payment_request(
  request_id uuid,
  reason     text default 'Payment could not be verified'
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  _caller_id uuid := auth.uid();
  _is_admin  boolean;
  _req       public.payment_requests%rowtype;
begin
  select is_admin into _is_admin
  from public.profiles where id = _caller_id;
  if not _is_admin then
    raise exception 'Unauthorized: admins only';
  end if;

  select * into _req from public.payment_requests where id = request_id;
  if not found then
    raise exception 'Payment request not found';
  end if;
  if _req.status <> 'pending' then
    raise exception 'Request already %', _req.status;
  end if;

  update public.payment_requests
  set status           = 'rejected',
      rejection_reason = reason,
      reviewed_at      = now(),
      reviewed_by      = _caller_id
  where id = request_id;

  -- Clear the pending flag on profiles so student can re-submit
  update public.profiles
  set upgrade_requested = false,
      upgrade_note      = null
  where id = _req.user_id;

  return json_build_object('ok', true, 'user_id', _req.user_id, 'reason', reason);
end;
$$;

revoke all on function public.reject_payment_request(uuid, text) from public;
grant execute on function public.reject_payment_request(uuid, text) to authenticated;
