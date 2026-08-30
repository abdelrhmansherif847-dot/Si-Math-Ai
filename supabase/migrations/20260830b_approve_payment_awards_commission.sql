-- ===========================================================================
-- 20260830b_approve_payment_awards_commission.sql
-- ===========================================================================
-- STATUS: PREPARED — NOT APPLIED. Requires 20260830a to be applied first.
--
-- Adds the referral hook to approve_payment_request, the single choke point
-- through which every paid activation passes — packs and subscriptions alike.
--
-- This is a CREATE OR REPLACE of a function on the live payment path, so the
-- body below is the CURRENT production definition reproduced verbatim, with
-- exactly two lines added (both marked "-- REFERRAL HOOK"). Diff this against
-- the deployed definition before applying:
--
--   select pg_get_functiondef(oid) from pg_proc
--    where proname = 'approve_payment_request';
--
-- award_referral_commission is a no-op when the student has no attribution, so
-- on a platform with no referral codes issued this migration changes nothing
-- observable. It fails closed in the other direction too: the award is inside
-- the same transaction as the activation, so a commission cannot exist for a
-- payment that did not activate.
-- ===========================================================================

begin;

create or replace function public.approve_payment_request(request_id uuid, admin_note text default null::text)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
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
  _one_time         boolean;
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

    -- REFERRAL HOOK: a pack is a paid purchase and can be a student's first.
    perform public.award_referral_commission(_req.user_id, request_id, _req.plan_code, _req.amount_egp);

    return json_build_object(
      'ok',            true,
      'kind',          'pack',
      'user_id',       _req.user_id,
      'plan_code',     _req.plan_code,
      'credits_added', _plan_def.credits_granted
    );
  end if;

  _one_time := (_plan_def.kind = 'lifetime')
            or (_plan_def.kind = 'custom' and coalesce(_plan_def.period_days, 0) = 0);

  _is_founder_plan := coalesce(_plan_def.is_founder, false);

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

  if _one_time then
    _expires_at := null;
  else
    if coalesce(_plan_def.period_days, 0) <= 0 then
      raise exception 'Plan % is a % plan with period_days = %; it cannot be approved without a period',
        _plan_def.plan_code, _plan_def.kind, _plan_def.period_days;
    end if;
    _expires_at := _now + (_plan_def.period_days || ' days')::interval;
  end if;

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

  -- plan_code keeps the exact code; plan_type gets the legacy category the
  -- CHECK constraint permits. Was: _req.plan_code for both.
  insert into public.subscriptions (user_id, plan_code, plan_type, status, active, current_period_end, created_at)
  values (_req.user_id, _req.plan_code, public.legacy_plan_type(_req.plan_code), 'active', true, _expires_at, _now)
  on conflict (user_id) do update
    set plan_code          = excluded.plan_code,
        plan_type          = excluded.plan_type,
        status             = 'active',
        active             = true,
        current_period_end = excluded.current_period_end;

  -- REFERRAL HOOK: no-op unless this student was attributed to a teacher, and
  -- UNIQUE(student_user_id) means a renewal cannot award a second commission.
  perform public.award_referral_commission(_req.user_id, request_id, _req.plan_code, _req.amount_egp);

  return json_build_object(
    'ok',              true,
    'kind',            _plan_def.kind,
    'user_id',         _req.user_id,
    'plan_code',       _req.plan_code,
    'credits_granted', _plan_def.credits_granted,
    'expires_at',      _expires_at,
    'never_expires',   _one_time,
    'is_founder',      _is_founder_plan,
    'founder_slots_remaining', case when _is_founder_plan then _slots_remain - 1 else null end
  );
end;
$function$;

commit;
