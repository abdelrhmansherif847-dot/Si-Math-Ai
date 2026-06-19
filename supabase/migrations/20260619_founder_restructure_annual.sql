-- Founder Restructure — Annual-only, first 50 students
--
-- Decisions (locked in by product owner):
--   • Drop Founder Monthly entirely
--   • Founder = Annual only, 1499 EGP/year, 50 spots total
--   • Permanent badge + direct feedback channel + beta features
--   • Locked renewal price forever (re-grants at 1499 EGP/year for life)
--   • No lifetime/free access — must renew annually
--
-- See unit-economics audit (2026-06-19) for rationale.

-- 1. Deactivate Founder Monthly
update public.pricing_settings
set active = false
where plan_code = 'FOUNDER_MONTHLY';

-- 2. Founder Annual: 1499 EGP, 42000 credits/yr (3500/mo equivalent), 3 devices
insert into public.pricing_settings
  (plan_code, display_name, billing_cycle, price_egp, credits_granted, device_limit, daily_limit, is_founder, active, sort_order)
values
  ('FOUNDER_ANNUAL', 'Founder Annual', 'annual', 1499, 42000, 3, null, true, true, 1)
on conflict (plan_code) do update
  set display_name    = excluded.display_name,
      billing_cycle   = excluded.billing_cycle,
      price_egp       = excluded.price_egp,
      credits_granted = excluded.credits_granted,
      device_limit    = excluded.device_limit,
      daily_limit     = excluded.daily_limit,
      is_founder      = excluded.is_founder,
      active          = excluded.active,
      sort_order      = excluded.sort_order;

-- 3. Manual-payment plan_definitions
insert into public.plan_definitions (plan_code, display_name, credits_granted, period_days, amount_egp)
values ('FOUNDER_ANNUAL', 'Founder Annual', 3500, 365, 1499)
on conflict (plan_code) do update
  set display_name    = excluded.display_name,
      credits_granted = excluded.credits_granted,
      period_days     = excluded.period_days,
      amount_egp      = excluded.amount_egp;

-- 4. approve_payment_request: handle Founder slot check + decrement + is_founder=true
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
begin
  select is_admin into _is_admin from public.profiles where id = _caller_id;
  if not _is_admin then
    raise exception 'Unauthorized: admins only';
  end if;

  select * into _req from public.payment_requests where id = request_id;
  if not found then
    raise exception 'Payment request not found';
  end if;
  if _req.status <> 'pending' then
    raise exception 'Payment request is already %', _req.status;
  end if;

  select * into _plan_def from public.plan_definitions where plan_code = _req.plan_code;
  if not found then
    raise exception 'Unknown plan_code: %', _req.plan_code;
  end if;

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
  set status      = 'approved',
      reviewed_at = _now,
      reviewed_by = _caller_id
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

-- 5. Allow FOUNDER_ANNUAL in subscriptions check constraint
alter table public.subscriptions drop constraint if exists subscriptions_plan_type_check;
alter table public.subscriptions add constraint subscriptions_plan_type_check
  check (plan_type in ('FREE','PRO_MONTHLY','PRO_QUARTERLY','PRO_ANNUAL','FOUNDER_MONTHLY','FOUNDER_ANNUAL'));
