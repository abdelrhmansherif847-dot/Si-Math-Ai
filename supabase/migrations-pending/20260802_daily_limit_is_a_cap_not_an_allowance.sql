-- ===========================================================================
-- daily_limit is a CAP, not a free allowance
-- ===========================================================================
-- ⛔ NOT APPLIED. Requires explicit owner approval per CLAUDE.md §3.
--
-- ── THE DEFECT ─────────────────────────────────────────────────────────────
-- consume_credits branches on:
--
--     IF v_daily_limit IS NOT NULL AND NOT v_always_charge THEN
--       ...
--       IF v_daily_used < v_daily_limit THEN
--         v_cost := 0;                     -- ← the whole problem
--
-- The comment above that branch says "FREE plan path". The condition says
-- "any plan that has a daily_limit". Those were the same thing for fourteen
-- months because FREE was the only plan carrying one, so the difference was
-- invisible.
--
-- Plan Catalog V2 ended that. HERO was authored on 2026-08-02 with
-- daily_limit = 200, and the branch read it as "the first 200 operations each
-- day are free". A student on a 1,949 EGP plan holding 25,000 credits was
-- charged nothing per message; the credits would only begin to move on the
-- 201st message of a day. Observed in production: 5 turns, 5 ai_usage_logs
-- rows, credits_used = 0 on every one, balance unchanged at 25,000.
--
-- ── THE PRODUCT RULE (owner, 2026-08-02) ───────────────────────────────────
-- daily_limit is a maximum, never an allowance:
--
--   FREE (zero-price tier)  daily_limit is a HARD daily cap. Operations cost
--                           no credits, because the plan costs nothing and
--                           grants nothing. 15/day, then the limit response.
--                           A student who bought a pack may continue on those
--                           credits — that is what pricing.html sells, and one
--                           FREE student is holding 20,000 of them.
--
--   PAID plans              Every chargeable message deducts credits from
--                           message #1. The credit BALANCE is the real limit.
--                           daily_limit never blocks — it is a soft usage
--                           target the UI displays (184/200) and may warn on.
--
-- ── WHAT DECIDES "FREE TIER" ───────────────────────────────────────────────
-- Not `plan_code = 'FREE'`. Hardcoding a code is what Plan Catalog V2 exists to
-- stop, and it would leave a future authored trial plan behaving like a paid
-- one. The test is economic and reads from the catalogue:
--
--     coalesce(amount_egp, 0) = 0 AND coalesce(credits_granted, 0) = 0
--
-- A plan that takes no money and grants no credits has nothing to spend, so its
-- operations must be free and its daily_limit must be the thing that bounds
-- them. Verified against all 11 rows in plan_definitions — it selects FREE and
-- nothing else:
--
--   FREE                 0 EGP /      0 credits  -> free tier, cap 15
--   HERO             1,949 EGP / 25,000 credits  -> paid, 200 is a soft target
--   PRO_MONTHLY        349 EGP /  3,500 credits  -> paid
--   PRO_QUARTERLY      899 EGP / 10,500 credits  -> paid
--   PRO_ANNUAL       2,999 EGP / 42,000 credits  -> paid
--   FOUNDER_MONTHLY    249 EGP /  5,000 credits  -> paid
--   FOUNDER_ANNUAL   1,499 EGP / 42,000 credits  -> paid
--   PRO_QUARTERLY_COPY 1,000 EGP / 12,000 credits -> paid
--   PACK_*                                        -> never reach this path
--
-- An unknown or NULL plan_code resolves to NOT free tier, so it takes the paid
-- path. That is the fail-safe direction: charge rather than give away, and it
-- matches today's behaviour for such a user exactly (a NULL daily_limit already
-- sent them down the paid path).
--
-- ── BLAST RADIUS (measured 2026-08-02) ─────────────────────────────────────
--   FREE students ............... 15, of whom 12 hold a zero balance.
--                                 UNAFFECTED — their path is unchanged.
--   HERO students ............... 1, holding 25,000 credits. Starts paying
--                                 5 credits per CHAT_TEXT, ~5,000 messages.
--   PRO_* / FOUNDER_* ........... 5. UNAFFECTED — they carry daily_limit NULL,
--                                 so they were already on the paid path.
--   Rows rewritten .............. 0. Behaviour only.
--
-- The only account whose billing changes is the one plan the owner authored
-- with a daily_limit. That is the bug, and it is the whole of the fix.
--
-- ── WHY NOT JUST CLEAR HERO's daily_limit ──────────────────────────────────
-- It would stop the immediate loss and leave the trap armed: the next plan
-- authored with a "daily message limit" — a field the dashboard offers on every
-- plan — silently becomes free again. The semantics are what is wrong.
--
-- Target project: igvkyxkmjnkzscqgommj
-- Rebased on the live definition, verified 2026-08-02 (the 8-argument form with
-- the idempotency key, version 20260802173710). Everything below is that body
-- with one DECLARE, one lookup and one branch condition changed; all three are
-- marked.
-- ===========================================================================

begin;

create or replace function public.consume_credits(
  p_user_id           uuid,
  p_feature           text,
  p_model_name        text    default null,
  p_prompt_tok        integer default 0,
  p_comp_tok          integer default 0,
  p_cost_usd          numeric default 0,
  p_session_id        uuid    default null,
  p_client_request_id uuid    default null
)
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
  v_prior_id      UUID;
  v_prior_credits INTEGER;
  v_is_free_tier  BOOLEAN := false;   -- NEW: decides which limit semantics apply
BEGIN
  -- Dual-authorization guard (Phase B / AUTHZ-01)
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'forbidden_user_mismatch');
  END IF;

  -- Admin bypass: admins always get free unlimited access
  SELECT is_admin INTO v_is_admin FROM profiles WHERE id = p_user_id;
  IF v_is_admin THEN
    IF p_client_request_id IS NOT NULL THEN
      SELECT id INTO v_prior_id FROM ai_usage_logs
       WHERE user_id = p_user_id AND client_request_id = p_client_request_id
       LIMIT 1;
      IF v_prior_id IS NOT NULL THEN
        RETURN jsonb_build_object(
          'ok', true, 'credits_used', 0,
          'subscription_credits', 0, 'pack_credits', 0,
          'balance_after', 0, 'log_id', v_prior_id, 'idempotent_replay', true
        );
      END IF;
    END IF;

    BEGIN
      INSERT INTO ai_usage_logs
        (user_id, feature, model_name, credits_used,
         prompt_tokens, completion_tokens, total_tokens,
         estimated_cost_usd, session_id, client_request_id)
      VALUES
        (p_user_id, p_feature, p_model_name, 0,
         p_prompt_tok, p_comp_tok, p_prompt_tok + p_comp_tok,
         p_cost_usd, p_session_id, p_client_request_id)
      RETURNING id INTO v_log_id;
    EXCEPTION WHEN unique_violation THEN
      SELECT id INTO v_log_id FROM ai_usage_logs
       WHERE user_id = p_user_id AND client_request_id = p_client_request_id
       LIMIT 1;
      RETURN jsonb_build_object(
        'ok', true, 'credits_used', 0,
        'subscription_credits', 0, 'pack_credits', 0,
        'balance_after', 0, 'log_id', v_log_id, 'idempotent_replay', true
      );
    END;

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

  SELECT subscription_credits, pack_credits, plan_code,
         is_founder, subscription_expires_at
    INTO v_sub_credits, v_pack_credits, v_plan_code,
         v_is_founder, v_expires_at
    FROM profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'user_not_found');
  END IF;

  -- Idempotency replay (after the FOR UPDATE — that lock is the serialization
  -- point, so a duplicate sees the winner's committed row).
  IF p_client_request_id IS NOT NULL THEN
    SELECT id, credits_used INTO v_prior_id, v_prior_credits
      FROM ai_usage_logs
     WHERE user_id = p_user_id AND client_request_id = p_client_request_id
     LIMIT 1;
    IF v_prior_id IS NOT NULL THEN
      RETURN jsonb_build_object(
        'ok', true,
        'credits_used',         v_prior_credits,
        'subscription_credits', v_sub_credits,
        'pack_credits',         v_pack_credits,
        'balance_after',        v_sub_credits + v_pack_credits,
        'log_id',               v_prior_id,
        'idempotent_replay',    true
      );
    END IF;
  END IF;

  -- Inline subscription expiry enforcement
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

  -- ── NEW: is this a free tier? ────────────────────────────────────────────
  -- Economic test, read from the catalogue, not a hardcoded plan_code. A plan
  -- that charges nothing and grants nothing has no credits to spend, so its
  -- operations are free and daily_limit is what bounds them. Every other plan
  -- pays from message #1 and its daily_limit does not gate anything.
  --
  -- Runs AFTER the expiry block on purpose: an expired subscriber has just been
  -- moved to FREE, and must be evaluated as the plan they are on now.
  SELECT coalesce(amount_egp, 0) = 0 AND coalesce(credits_granted, 0) = 0
    INTO v_is_free_tier
    FROM plan_definitions
   WHERE plan_code = v_plan_code;
  v_is_free_tier := coalesce(v_is_free_tier, false);   -- unknown plan → pays

  -- ── FREE-TIER path ───────────────────────────────────────────────────────
  -- CHANGED: the guard was `v_daily_limit IS NOT NULL AND NOT v_always_charge`,
  -- which caught every plan carrying a daily_limit — including paid ones. It
  -- now also requires the plan to be a free tier.
  IF v_is_free_tier AND v_daily_limit IS NOT NULL AND NOT v_always_charge THEN
    SELECT COUNT(*) INTO v_daily_used
    FROM ai_usage_logs
    WHERE user_id = p_user_id
      AND created_at >= date_trunc('day', now() AT TIME ZONE 'UTC');

    IF v_daily_used < v_daily_limit THEN
      -- Within the free tier's daily cap: costs nothing.
      v_cost := 0; v_sub_deduct := 0; v_pack_deduct := 0;
      v_new_sub := v_sub_credits; v_new_pack := v_pack_credits;

    ELSIF v_pack_credits >= v_cost THEN
      -- Over the cap, but the student bought credits. They continue on those.
      -- pricing.html sells exactly this ("Buy a pack to continue after the
      -- daily limit") and one FREE student is holding 20,000 credits, so this
      -- branch stays.
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

  -- ── PAID path ────────────────────────────────────────────────────────────
  -- Reached from message #1 for every paying plan, whatever its daily_limit.
  -- The balance is the limit; daily_limit is a display/monitoring number the
  -- UI renders and this function deliberately ignores.
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

  BEGIN
    INSERT INTO ai_usage_logs
      (user_id, feature, model_name, credits_used,
       prompt_tokens, completion_tokens, total_tokens,
       estimated_cost_usd, session_id, client_request_id)
    VALUES
      (p_user_id, p_feature, p_model_name, v_cost,
       p_prompt_tok, p_comp_tok, p_prompt_tok + p_comp_tok,
       p_cost_usd, p_session_id, p_client_request_id)
    RETURNING id INTO v_log_id;
  EXCEPTION WHEN unique_violation THEN
    IF v_cost > 0 THEN
      UPDATE profiles
         SET subscription_credits = subscription_credits + v_sub_deduct,
             pack_credits         = pack_credits + v_pack_deduct,
             credits_balance      = credits_balance + v_cost
       WHERE id = p_user_id;
    END IF;

    SELECT id, credits_used INTO v_prior_id, v_prior_credits
      FROM ai_usage_logs
     WHERE user_id = p_user_id AND client_request_id = p_client_request_id
     LIMIT 1;
    SELECT subscription_credits, pack_credits INTO v_new_sub, v_new_pack
      FROM profiles WHERE id = p_user_id;

    RETURN jsonb_build_object(
      'ok', true,
      'credits_used',         v_prior_credits,
      'subscription_credits', v_new_sub,
      'pack_credits',         v_new_pack,
      'balance_after',        v_new_sub + v_new_pack,
      'log_id',               v_prior_id,
      'idempotent_replay',    true
    );
  END;

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

comment on column public.plan_definitions.daily_limit is
  'Maximum AI operations per UTC day. On a ZERO-PRICE plan (amount_egp = 0 and credits_granted = 0) it is a hard cap and operations cost no credits. On a PAID plan it is a SOFT usage target: the UI shows today''s usage against it and may warn, but consume_credits never blocks on it — the credit balance is the real limit. It is NOT a free daily allowance; treating it as one made a 1,949 EGP plan free for its first 200 messages a day (2026-08-02).';

-- Assert the predicate still selects the free tier and nothing else.
do $$
declare v_bad text;
begin
  select string_agg(plan_code || ' (' || amount_egp || ' EGP / ' || credits_granted || ' credits)', ', ')
    into v_bad
  from plan_definitions
  where kind <> 'pack'
    and (coalesce(amount_egp,0) = 0 and coalesce(credits_granted,0) = 0)
    and plan_code <> 'FREE';
  if v_bad is not null then
    raise notice 'Other zero-price plans will also be treated as a free tier: %', v_bad;
  end if;

  if not exists (select 1 from plan_definitions
                  where plan_code='FREE'
                    and coalesce(amount_egp,0)=0 and coalesce(credits_granted,0)=0) then
    raise exception 'FREE is no longer zero-price/zero-grant — it would start charging. Refusing to commit.';
  end if;
end $$;

commit;

-- ===========================================================================
-- VERIFICATION (run after applying)
-- ===========================================================================
--   -- FREE student, under the cap: still free
--   SELECT public.consume_credits('<free uid>','CHAT_TEXT',null,0,0,0,null,gen_random_uuid());
--   -- expect ok:true, credits_used: 0
--
--   -- HERO student: now charged from message #1
--   SELECT public.consume_credits('6b9a2f4b-...','CHAT_TEXT',null,0,0,0,null,gen_random_uuid());
--   -- expect ok:true, credits_used: 5, balance_after 24995 (was 25000)
--
--   -- FREE student at 15/15 with no credits: blocked
--   -- expect ok:false, reason: daily_limit_reached
--
--   -- PRO_MONTHLY (daily_limit NULL): unchanged, charged as before
--
-- ── Rollback ───────────────────────────────────────────────────────────────
-- Restore the body from supabase/migrations/20260802e_consume_credits_idempotency.sql
-- (drop v_is_free_tier, its SELECT, and the `v_is_free_tier AND` in the branch
-- guard). Rolling back makes every plan with a daily_limit free again up to it.
-- ===========================================================================
