-- Subscription expiry enforcement (Manual Payment V1)
-- Any authenticated user can call enforce_my_subscription_expiry() — it checks
-- their own profile and downgrades them to FREE if subscription_expires_at has
-- passed. Idempotent: no-op for Free users, Founders (lifetime), unexpired plans.

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

  -- Founders are lifetime — never expire
  if _prof.is_founder then
    return json_build_object('ok', true, 'expired', false, 'reason', 'founder');
  end if;

  -- Already Free — nothing to enforce
  if _prof.plan_code is null or _prof.plan_code = 'FREE' then
    return json_build_object('ok', true, 'expired', false, 'reason', 'already_free');
  end if;

  -- No expiry recorded — defensive no-op (shouldn't happen for paid plans)
  if _prof.subscription_expires_at is null then
    return json_build_object('ok', true, 'expired', false, 'reason', 'no_expiry_set');
  end if;

  -- Still valid
  if _prof.subscription_expires_at > _now then
    return json_build_object(
      'ok',         true,
      'expired',    false,
      'plan_code',  _prof.plan_code,
      'expires_at', _prof.subscription_expires_at
    );
  end if;

  -- EXPIRED — downgrade to FREE
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

revoke all on function public.enforce_my_subscription_expiry() from public;
grant execute on function public.enforce_my_subscription_expiry() to authenticated;
