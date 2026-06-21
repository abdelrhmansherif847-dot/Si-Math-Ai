-- Inline subscription-expiry enforcement inside consume_credits.
-- Closes the bypass window where expired subscription_credits remained
-- spendable until the user's next page navigation. Admins and Founders
-- are preserved unchanged (admin bypass at top; founders skip expiry
-- via is_founder check, matching enforce_my_subscription_expiry).

CREATE OR REPLACE FUNCTION public.consume_credits(
  p_user_id    uuid,
  p_feature    text,
  p_model_name text DEFAULT NULL::text,
  p_prompt_tok integer DEFAULT 0,
  p_comp_tok   integer DEFAULT 0,
  p_cost_usd   numeric DEFAULT 0,
  p_session_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_cost          INTEGER;
  v_sub_credits   INTEGER;
  v_pack_credits  INTEGER;
  v_total         INTEGER;
  v_sub_deduct    INTEGER;
  v_pack_deduct   INTEGER;
  v_new_sub       INTEGER;
  v_new_pack      INTEGER;
  v_new_total     INTEGER;
  v_plan_code     TEXT;
  v_daily_limit   INTEGER;
  v_daily_used    INTEGER;
  v_log_id        UUID;
  v_is_admin      BOOLEAN;
  v_is_founder    BOOLEAN;
  v_expires_at    TIMESTAMPTZ;
  v_was_expired   BOOLEAN := false;
BEGIN
  SELECT is_admin INTO v_is_admin FROM profiles WHERE id = p_user_id;
  IF v_is_admin THEN
    INSERT INTO ai_usage_logs
      (user_id, feature, model_name, credits_used,
       prompt_tokens, completion_tokens, total_tokens,
       estimated_cost_usd, session_id)
    VALUES
      (p_user_id, p_feature, p_model_name, 0,
       p_prompt_tok, p_comp_tok, p_prompt_tok + p_comp_tok,
       p_cost_usd, p_session_id)
    RETURNING id INTO v_log_id;
    RETURN jsonb_build_object(
      'ok', true, 'credits_used', 0,
      'subscription_credits', 0, 'pack_credits', 0,
      'balance_after', 0, 'log_id', v_log_id
    );
  END IF;

  SELECT credit_cost INTO v_cost
  FROM credit_costs
  WHERE feature_name = p_feature AND active = true;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'feature_not_found');
  END IF;

  SELECT subscription_credits, pack_credits, plan_code,
         is_founder, subscription_expires_at
    INTO v_sub_credits, v_pack_credits, v_plan_code,
         v_is_founder, v_expires_at
    FROM profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'user_not_found');
  END IF;

  IF NOT v_is_founder
     AND v_plan_code IS NOT NULL
     AND v_plan_code <> 'FREE'
     AND v_expires_at IS NOT NULL
     AND v_expires_at <= now()
  THEN
    UPDATE profiles
       SET plan_code               = 'FREE',
           subscription_credits    = 0,
           credits_balance         = COALESCE(pack_credits, 0),
           subscription_expires_at = NULL
     WHERE id = p_user_id;

    UPDATE subscriptions
       SET status = 'inactive', active = false
     WHERE user_id = p_user_id;

    v_sub_credits := 0;
    v_plan_code   := 'FREE';
    v_was_expired := true;
  END IF;

  v_total := v_sub_credits + v_pack_credits;

  SELECT daily_limit INTO v_daily_limit
  FROM pricing_settings
  WHERE plan_code = v_plan_code AND active = true;

  IF v_daily_limit IS NOT NULL THEN
    SELECT COUNT(*) INTO v_daily_used
    FROM ai_usage_logs
    WHERE user_id = p_user_id
      AND created_at >= date_trunc('day', now() AT TIME ZONE 'UTC');

    IF v_daily_used < v_daily_limit THEN
      v_cost := 0; v_sub_deduct := 0; v_pack_deduct := 0;
      v_new_sub := v_sub_credits; v_new_pack := v_pack_credits;

    ELSIF v_pack_credits >= v_cost THEN
      v_sub_deduct := 0; v_pack_deduct := v_cost;
      v_new_sub := v_sub_credits; v_new_pack := v_pack_credits - v_pack_deduct;
      UPDATE profiles
      SET pack_credits = v_new_pack, credits_balance = v_sub_credits + v_new_pack
      WHERE id = p_user_id;

    ELSE
      RETURN jsonb_build_object(
        'ok', false, 'reason', 'daily_limit_reached',
        'daily_used', v_daily_used, 'daily_limit', v_daily_limit,
        'pack_credits', v_pack_credits,
        'was_expired', v_was_expired
      );
    END IF;

  ELSE
    IF v_total < v_cost THEN
      RETURN jsonb_build_object(
        'ok', false, 'reason', 'insufficient_credits',
        'balance', v_total, 'required', v_cost,
        'was_expired', v_was_expired
      );
    END IF;

    IF v_sub_credits >= v_cost THEN
      v_sub_deduct := v_cost; v_pack_deduct := 0;
    ELSE
      v_sub_deduct := v_sub_credits; v_pack_deduct := v_cost - v_sub_credits;
    END IF;

    v_new_sub  := v_sub_credits  - v_sub_deduct;
    v_new_pack := v_pack_credits - v_pack_deduct;

    UPDATE profiles
    SET subscription_credits = v_new_sub, pack_credits = v_new_pack,
        credits_balance = v_new_sub + v_new_pack
    WHERE id = p_user_id;
  END IF;

  v_new_total := v_new_sub + v_new_pack;

  INSERT INTO ai_usage_logs
    (user_id, feature, model_name, credits_used,
     prompt_tokens, completion_tokens, total_tokens,
     estimated_cost_usd, session_id)
  VALUES
    (p_user_id, p_feature, p_model_name, v_cost,
     p_prompt_tok, p_comp_tok, p_prompt_tok + p_comp_tok,
     p_cost_usd, p_session_id)
  RETURNING id INTO v_log_id;

  IF v_cost > 0 THEN
    INSERT INTO credit_transactions
      (user_id, transaction_type, credits, balance_after,
       reference_type, reference_id, description)
    VALUES
      (p_user_id, 'CONSUME', -v_cost, v_new_total,
       'AI_USAGE', v_log_id,
       p_feature
       || CASE WHEN v_pack_deduct > 0 AND v_sub_deduct > 0
            THEN ' (sub:' || v_sub_deduct || ' pack:' || v_pack_deduct || ')'
          WHEN v_pack_deduct > 0
            THEN ' (pack:' || v_pack_deduct || ')'
            ELSE '' END);
  END IF;

  RETURN jsonb_build_object(
    'ok', true, 'credits_used', v_cost,
    'subscription_credits', v_new_sub, 'pack_credits', v_new_pack,
    'balance_after', v_new_total, 'log_id', v_log_id,
    'was_expired', v_was_expired
  );
END;
$function$;
