-- =====================================================================
-- Teacher Partner Program — 4 of 4: the payment hooks
-- =====================================================================
-- STATUS: 🟢 APPLIED 2026-08-31 as version 20260831152640, with explicit owner approval.
-- DEPENDS ON: 20260831b, 20260831c
--
-- ⚠️  THIS FILE REDEFINES THE THREE FUNCTIONS THAT GRANT EVERY PLAN ON THE
--     PLATFORM. Read this header before applying it.
--
-- WHAT IT CHANGES
-- ---------------
-- Each function below is the CURRENT PRODUCTION DEFINITION, reproduced
-- verbatim, with exactly one line added:
--
--     perform public.record_purchase_event(<kind>, <id>, <user>, <plan_code>);
--
--   approve_payment_request  +2 lines (the pack branch and the subscription
--                                      branch each return separately)
--   activate_subscription    +1 line
--   activate_credit_pack     +1 line
--
-- Nothing else differs. Verified mechanically, not by eye: strip the four
-- ADDED lines from this file and each remaining body hashes to exactly what
-- production held on 2026-08-31. tests/referral-payment-hooks.test.mjs does
-- that strip and fails on any drift.
--
--   approve_payment_request  md5 d1dd67130e32a31866738bf9b674bd09  4409 bytes
--   activate_subscription    md5 5d48d50c9a1f70294aee003b719d8d20  3491 bytes
--   activate_credit_pack     md5 c66e349c7c0bd449f0ee7254f36215cd  1370 bytes
--
-- Note the last one: pg_proc reports length(prosrc) = 1366 because length()
-- counts CHARACTERS and that body carries two em-dashes, three bytes each.
-- Compare md5, which is unambiguous, rather than a length.
--
-- THE FRESH DIFF WAS RUN, and all three were byte-identical to the audit at
-- the moment of applying. Re-run it before any future re-application: if one of
-- the three has moved since, this file would silently REVERT it, which is the
-- single largest risk in the whole program.
--
-- WHY THE LINE IS ALL THAT IS ADDED
-- ---------------------------------
-- record_purchase_event() takes no amount. It resolves the authoritative price
-- from plan_definitions itself, so no caller can pass a wrong one and no
-- caller computes anything. Every rule — first purchase, attribution locking,
-- tier, rounding, freezing — lives behind the trigger in 20260831c. These three
-- functions only announce that a purchase succeeded.
--
-- It cannot break a payment: record_purchase_event() and the trigger both wrap
-- their work in exception blocks that write to referral_award_skips and return.
--
-- PLACEMENT
-- ---------
-- The line sits immediately before each SUCCESSFUL return, after the state
-- change is complete. Every early `return ... 'ok', false` path is left
-- untouched, so a failed or rejected activation announces nothing.
-- =====================================================================

begin;

-- ── 1 · approve_payment_request — the live manual-payment path ───────────
CREATE OR REPLACE FUNCTION public.approve_payment_request(request_id uuid, admin_note text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

    perform public.record_purchase_event('payment_request', request_id, _req.user_id, _req.plan_code);  -- ADDED 20260831e

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

  perform public.record_purchase_event('payment_request', request_id, _req.user_id, _req.plan_code);  -- ADDED 20260831e

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

-- ── 2 · activate_subscription — the legacy/admin-actions path ────────────
CREATE OR REPLACE FUNCTION public.activate_subscription(p_payment_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_payment         RECORD;
  v_plan            RECORD;
  v_end_date        TIMESTAMPTZ;
  v_sub_id          UUID;
  v_new_sub_cred    INTEGER;
  v_already_founder BOOLEAN;
  v_founder_result  JSONB;
BEGIN
  SELECT * INTO v_payment FROM payments WHERE id = p_payment_id AND status = 'COMPLETED';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'payment_not_found_or_not_completed');
  END IF;

  IF v_payment.payment_type != 'SUBSCRIPTION' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_a_subscription_payment');
  END IF;

  SELECT * INTO v_plan FROM pricing_settings WHERE plan_code = v_payment.reference_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'plan_not_found');
  END IF;

  v_end_date := CASE v_plan.billing_cycle
    WHEN 'monthly'    THEN now() + INTERVAL '1 month'
    WHEN 'quarterly'  THEN now() + INTERVAL '3 months'
    WHEN 'semiannual' THEN now() + INTERVAL '6 months'
    WHEN 'annual'     THEN now() + INTERVAL '1 year'
    WHEN 'one_time'   THEN NULL
    WHEN 'custom'     THEN CASE WHEN COALESCE(v_plan.period_days, 0) > 0
                                THEN now() + (v_plan.period_days || ' days')::interval
                                ELSE NULL END
    ELSE NULL
  END;

  UPDATE subscriptions
  SET status = 'EXPIRED', active = false, updated_at = now()
  WHERE user_id = v_payment.user_id AND status = 'ACTIVE';

  -- plan_code keeps the exact code; plan_type gets the mapped legacy category.
  -- Was: (v_payment.user_id, v_plan.plan_code, v_plan.plan_code, 'ACTIVE', ...)
  INSERT INTO subscriptions
    (user_id, plan_code, plan_type, status, active,
     start_date, end_date, current_period_end,
     auto_renew, credits_granted, payment_id)
  VALUES
    (v_payment.user_id, v_plan.plan_code, public.legacy_plan_type(v_plan.plan_code), 'ACTIVE', true,
     now(), v_end_date, v_end_date,
     false, v_plan.credits_granted, p_payment_id)
  RETURNING id INTO v_sub_id;

  UPDATE profiles
  SET
    plan_code               = v_plan.plan_code,
    plan                    = lower(v_plan.plan_code),
    subscription_credits    = subscription_credits + v_plan.credits_granted,
    credits_balance         = (subscription_credits + v_plan.credits_granted) + pack_credits,
    subscription_expires_at = v_end_date,
    upgrade_requested       = false,
    upgrade_note            = null
  WHERE id = v_payment.user_id
  RETURNING subscription_credits INTO v_new_sub_cred;

  INSERT INTO credit_transactions
    (user_id, transaction_type, credits, balance_after,
     reference_type, reference_id, description)
  SELECT
    v_payment.user_id, 'GRANT', v_plan.credits_granted,
    subscription_credits + pack_credits,
    'SUBSCRIPTION', v_sub_id,
    'Credits granted for ' || v_plan.display_name
  FROM profiles WHERE id = v_payment.user_id;

  IF v_plan.is_founder THEN
    SELECT is_founder INTO v_already_founder FROM profiles WHERE id = v_payment.user_id;
    IF NOT v_already_founder THEN
      v_founder_result := claim_founder_slot(v_payment.user_id, p_payment_id);
      IF NOT (v_founder_result->>'ok')::BOOLEAN THEN
        RETURN jsonb_build_object('ok', false,
          'reason', 'founder_slot_unavailable:' || (v_founder_result->>'reason'));
      END IF;
    END IF;
  END IF;

  PERFORM public.record_purchase_event('payment', p_payment_id, v_payment.user_id, v_plan.plan_code);  -- ADDED 20260831e

  RETURN jsonb_build_object(
    'ok', true, 'subscription_id', v_sub_id, 'plan_code', v_plan.plan_code,
    'credits_granted', v_plan.credits_granted, 'expires_at', v_end_date);
END;
$function$;

-- ── 3 · activate_credit_pack — the legacy/admin-actions pack path ────────
CREATE OR REPLACE FUNCTION public.activate_credit_pack(p_payment_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_payment  RECORD;
  v_new_pack INTEGER;
  v_total    INTEGER;
BEGIN
  SELECT * INTO v_payment
  FROM payments
  WHERE id = p_payment_id AND status = 'COMPLETED';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'payment_not_found_or_not_completed');
  END IF;

  IF v_payment.payment_type != 'CREDIT_PACK' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_a_credit_pack_payment');
  END IF;

  -- Credits go into pack_credits — never expire
  UPDATE profiles
  SET
    pack_credits      = pack_credits + v_payment.credits_to_grant,
    credits_balance   = subscription_credits + (pack_credits + v_payment.credits_to_grant),
    upgrade_requested = false,
    upgrade_note      = null
  WHERE id = v_payment.user_id
  RETURNING pack_credits, subscription_credits + pack_credits INTO v_new_pack, v_total;

  -- Log GRANT transaction
  INSERT INTO credit_transactions
    (user_id, transaction_type, credits, balance_after,
     reference_type, reference_id, description)
  VALUES
    (v_payment.user_id, 'GRANT', v_payment.credits_to_grant, v_total,
     'CREDIT_PACK', p_payment_id, 'Credit pack purchase — credits never expire');

  PERFORM public.record_purchase_event('payment', p_payment_id, v_payment.user_id, v_payment.reference_id);  -- ADDED 20260831e

  RETURN jsonb_build_object(
    'ok',              true,
    'credits_granted', v_payment.credits_to_grant,
    'pack_credits',    v_new_pack,
    'balance_after',   v_total
  );
END;
$function$;

/* The ACLs are NOT restated here. CREATE OR REPLACE preserves the existing
   privileges of a function, and these three already carry theirs — restating
   them would be a second, silent change in a file whose whole claim is that it
   changes one thing. */

commit;
