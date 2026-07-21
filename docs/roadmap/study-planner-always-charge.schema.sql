-- ============================================================================
-- PROPOSED MIGRATION — STUDY_PLAN is always a paid feature (20 credits)
-- ============================================================================
-- ⛔ STATUS: PROPOSED — NOT APPLIED. Awaiting individual approval (CLAUDE.md §3).
--
-- Goal: a Study Plan must cost EXACTLY 20 credits for every user, regardless of
-- subscription tier or remaining daily free allowance. Today consume_credits
-- treats all features uniformly under a plan's daily_limit, so a FREE user under
-- their 15/day cap gets a Study Plan for 0 credits (it consumes a daily slot).
--
-- Fix (data-driven, minimal, non-destructive):
--   1. Add credit_costs.always_charge (boolean, default false). Future features
--      can opt into "always paid" via config, not code.
--   2. Set always_charge = true for STUDY_PLAN.
--   3. consume_credits: the daily-free-allowance branch is taken only when the
--      feature is NOT always_charge. Always-charge features fall through to the
--      existing paid path (deduct cost from subscription then pack; return
--      insufficient_credits if the balance is short). EXACTLY ONE other line of
--      the function changes (the credit_costs SELECT also reads always_charge);
--      every other line is byte-identical to the live definition (which
--      includes the AUTHZ-01 dual-authorization guard).
--
-- Behaviour after this migration:
--   • STUDY_PLAN  → always deducts 20 (or insufficient_credits). Admins remain
--     free via the admin short-circuit at the top (unchanged).
--   • Every other feature (AI_CHAT_MESSAGE, …) → UNCHANGED: FREE users still get
--     the daily free allowance; paid plans still deduct the per-feature cost.
--
-- On approval: move to supabase/migrations/<date>_study_plan_always_charge.sql,
-- apply, then regression-test (STUDY_PLAN charges 20 across tiers; AI_CHAT_MESSAGE
-- still free under the FREE daily cap) before declaring done.
-- Target project: igvkyxkmjnkzscqgommj
-- ============================================================================

-- 1. Add the flag (additive; existing rows default to false → no behaviour change).
ALTER TABLE public.credit_costs
  ADD COLUMN IF NOT EXISTS always_charge boolean NOT NULL DEFAULT false;

-- 2. STUDY_PLAN is always paid.
UPDATE public.credit_costs SET always_charge = true WHERE feature_name = 'STUDY_PLAN';

-- 3. consume_credits — always-charge features bypass the daily-free allowance.
CREATE OR REPLACE FUNCTION public.consume_credits(p_user_id uuid, p_feature text, p_model_name text DEFAULT NULL::text, p_prompt_tok integer DEFAULT 0, p_comp_tok integer DEFAULT 0, p_cost_usd numeric DEFAULT 0, p_session_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
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
  v_always_charge BOOLEAN := false;
BEGIN
  -- ── Dual-authorization guard (Phase B · AUTHZ-01) ─────────────────────────
  -- End users (JWT present → auth.uid() not null) may spend ONLY their own
  -- credits. The Edge Function / server acts as service_role (auth.uid() IS
  -- NULL) and may consume on behalf of any user.
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'forbidden_user_mismatch');
  END IF;

  -- Admin bypass: admins always get free unlimited access
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

  SELECT credit_cost, always_charge INTO v_cost, v_always_charge
  FROM credit_costs
  WHERE feature_name = p_feature AND active = true;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'feature_not_found');
  END IF;

  -- Extended profile read: also fetch is_founder + subscription_expires_at
  -- so inline expiry enforcement can run within the FOR UPDATE lock.
  SELECT subscription_credits, pack_credits, plan_code,
         is_founder, subscription_expires_at
    INTO v_sub_credits, v_pack_credits, v_plan_code,
         v_is_founder, v_expires_at
    FROM profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'user_not_found');
  END IF;

  -- ── Inline subscription expiry enforcement ───────────────────────────────
  -- Mirrors enforce_my_subscription_expiry semantics. Closes the bypass
  -- window where an expired user could spend subscription_credits until
  -- their next page navigation. Founders preserved (lifetime access by
  -- product decision); admins already short-circuited above.
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

  -- FREE plan path (skipped for always-charge features → they are always paid)
  IF v_daily_limit IS NOT NULL AND NOT v_always_charge THEN
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

  -- Paid plan path
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

-- ── Rollback (manual) ───────────────────────────────────────────────────────
-- Restore the previous consume_credits body (drop the `AND NOT v_always_charge`
-- clause and the always_charge SELECT/DECLARE), then optionally:
--   UPDATE public.credit_costs SET always_charge = false WHERE feature_name = 'STUDY_PLAN';
--   ALTER TABLE public.credit_costs DROP COLUMN IF EXISTS always_charge;
