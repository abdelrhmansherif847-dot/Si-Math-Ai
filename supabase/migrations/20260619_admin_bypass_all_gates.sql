-- Admin bypass: profiles.is_admin = true → never hits any quota, paywall, or expiry
--
-- Already bypassed (verified):
--   • consume_credits  — IF v_is_admin THEN ... cost=0 (chat / OCR / verification)
--   • deviceGuard JS in every page  — _ap.is_admin → return true
--
-- Patched here:
--   • can_register_device          — admin → unlimited devices
--   • enforce_my_subscription_expiry — admin → never expire / never downgrade

create or replace function public.can_register_device(p_user_id uuid, p_fingerprint text)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_is_admin     boolean;
  v_plan_code    text;
  v_device_limit integer;
  v_device_count integer;
begin
  select is_admin into v_is_admin from public.profiles where id = p_user_id;
  if v_is_admin then return true; end if;

  select plan_code into v_plan_code from public.profiles where id = p_user_id;

  select device_limit into v_device_limit
  from public.pricing_settings
  where plan_code = v_plan_code and active = true;

  if v_device_limit is null then v_device_limit := 2; end if;

  select count(*) into v_device_count
  from public.user_devices
  where user_id = p_user_id
    and is_active = true
    and device_fingerprint != p_fingerprint;

  return v_device_count < v_device_limit;
end;
$$;

create or replace function public.enforce_my_subscription_expiry()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  _uid  uuid := auth.uid();
  _prof public.profiles%rowtype;
  _now  timestamptz := now();
begin
  if _uid is null then
    return json_build_object('ok', false, 'reason', 'unauthenticated');
  end if;

  select * into _prof from public.profiles where id = _uid;
  if not found then
    return json_build_object('ok', false, 'reason', 'no_profile');
  end if;

  if _prof.is_admin then
    return json_build_object('ok', true, 'expired', false, 'reason', 'admin');
  end if;

  if _prof.is_founder then
    return json_build_object('ok', true, 'expired', false, 'reason', 'founder');
  end if;

  if _prof.plan_code is null or _prof.plan_code = 'FREE' then
    return json_build_object('ok', true, 'expired', false, 'reason', 'already_free');
  end if;

  if _prof.subscription_expires_at is null then
    return json_build_object('ok', true, 'expired', false, 'reason', 'no_expiry_set');
  end if;

  if _prof.subscription_expires_at > _now then
    return json_build_object(
      'ok',         true,
      'expired',    false,
      'plan_code',  _prof.plan_code,
      'expires_at', _prof.subscription_expires_at
    );
  end if;

  update public.profiles
  set plan_code               = 'FREE',
      subscription_credits    = 0,
      credits_balance         = coalesce(pack_credits, 0),
      subscription_expires_at = null
  where id = _uid;

  update public.subscriptions
  set status = 'inactive',
      active = false
  where user_id = _uid;

  return json_build_object(
    'ok',            true,
    'expired',       true,
    'previous_plan', _prof.plan_code,
    'expired_at',    _prof.subscription_expires_at
  );
end;
$$;
