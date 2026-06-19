-- Unify subscriptions and credit packs under approve_payment_request
-- Packs identified by plan_definitions.kind = 'pack' (or plan_code prefix 'PACK_')
-- → grant pack_credits (no expiry), no plan/subscription change

alter table public.plan_definitions
  add column if not exists kind text not null default 'subscription'
    check (kind in ('subscription', 'pack'));

-- Insert pack definitions mirroring credit_packs
insert into public.plan_definitions (plan_code, display_name, credits_granted, period_days, amount_egp, kind)
values
  ('PACK_STARTER', 'Starter Pack',  500,  0,  69, 'pack'),
  ('PACK_VALUE',   'Value Pack',   1000,  0, 129, 'pack'),
  ('PACK_POWER',   'Power Pack',   2000,  0, 249, 'pack')
on conflict (plan_code) do update
  set display_name    = excluded.display_name,
      credits_granted = excluded.credits_granted,
      amount_egp      = excluded.amount_egp,
      period_days     = excluded.period_days,
      kind            = excluded.kind;

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
  _caller_id        uuid := auth.uid();
  _is_admin         boolean;
  _req              public.payment_requests%rowtype;
  _plan_def         public.plan_definitions%rowtype;
  _expires_at       timestamptz;
  _now              timestamptz := now();
  _is_founder_plan  boolean;
  _slots_remain     integer;
  _existing_pack    integer;
begin
  select is_admin into _is_admin from public.profiles where id = _caller_id;
  if not _is_admin then
    raise exception 'Unauthorized: admins only';
  end if;

  select * into _req from public.payment_requests where id = request_id;
  if not found then raise exception 'Payment request not found'; end if;
  if _req.status <> 'pending' then raise exception 'Payment request is already %', _req.status; end if;

  select * into _plan_def from public.plan_definitions where plan_code = _req.plan_code;
  if not found then raise exception 'Unknown plan_code: %', _req.plan_code; end if;

  -- ── BRANCH: credit pack (one-time top-up, no subscription change) ───────────
  if _plan_def.kind = 'pack' then
    update public.payment_requests
    set status = 'approved', reviewed_at = _now, reviewed_by = _caller_id
    where id = request_id;

    select coalesce(pack_credits, 0) into _existing_pack from public.profiles where id = _req.user_id;

    update public.profiles
    set pack_credits      = _existing_pack + _plan_def.credits_granted,
        credits_balance   = coalesce(subscription_credits, 0) + _existing_pack + _plan_def.credits_granted,
        upgrade_requested = false,
        upgrade_note      = null
    where id = _req.user_id;

    return json_build_object(
      'ok',            true,
      'kind',          'pack',
      'user_id',       _req.user_id,
      'plan_code',     _req.plan_code,
      'credits_added', _plan_def.credits_granted
    );
  end if;

  -- ── BRANCH: subscription ────────────────────────────────────────────────────
  _is_founder_plan := (_req.plan_code = 'FOUNDER_ANNUAL');

  if _is_founder_plan then
    select coalesce(value::int, 0) into _slots_remain
    from public.system_settings where key = 'founder_slots_remaining';
    if _slots_remain <= 0 then
      raise exception 'No Founder slots remaining. Cannot approve Founder plan.';
    end if;
    update public.system_settings
      set value = (_slots_remain - 1)::text
      where key = 'founder_slots_remaining';
  end if;

  _expires_at := _now + (_plan_def.period_days || ' days')::interval;

  update public.payment_requests
  set status = 'approved', reviewed_at = _now, reviewed_by = _caller_id
  where id = request_id;

  update public.profiles
  set plan_code               = _req.plan_code,
      subscription_credits    = _plan_def.credits_granted,
      credits_balance         = coalesce(pack_credits, 0) + _plan_def.credits_granted,
      subscription_expires_at = _expires_at,
      upgrade_requested       = false,
      upgrade_note            = null,
      is_founder              = coalesce(is_founder, false) or _is_founder_plan
  where id = _req.user_id;

  insert into public.subscriptions (user_id, plan_code, plan_type, status, active, current_period_end, created_at)
  values (_req.user_id, _req.plan_code, _req.plan_code, 'active', true, _expires_at, _now)
  on conflict (user_id) do update
    set plan_code          = excluded.plan_code,
        plan_type          = excluded.plan_type,
        status             = 'active',
        active             = true,
        current_period_end = excluded.current_period_end;

  return json_build_object(
    'ok',              true,
    'kind',            'subscription',
    'user_id',         _req.user_id,
    'plan_code',       _req.plan_code,
    'credits_granted', _plan_def.credits_granted,
    'expires_at',      _expires_at,
    'is_founder',      _is_founder_plan,
    'founder_slots_remaining', case when _is_founder_plan then _slots_remain - 1 else null end
  );
end;
$$;

revoke all on function public.approve_payment_request(uuid, text) from public;
grant execute on function public.approve_payment_request(uuid, text) to authenticated;
