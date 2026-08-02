-- ===========================================================================
-- consume_credits becomes idempotent per client_request_id
-- ===========================================================================
-- ⛔ NOT APPLIED. Requires explicit owner approval per CLAUDE.md §3.
--
-- APPLY THIS **FIRST**, BEFORE DEPLOYING ai-tutor v96. It is additive and
-- backward-compatible — the new parameter has a DEFAULT, so today's callers
-- (chat.html via credit-config.js, passing seven named arguments) keep working
-- unchanged and get exactly today's behaviour. There is no window in which it
-- breaks the running system, which is why it can go ahead of the deploy rather
-- than after it.
--
-- ── THE DEFECT ─────────────────────────────────────────────────────────────
-- v96 moves the charge into the Edge Function, so **every HTTP request that
-- reaches the gate charges**. That is correct, and it introduces a duplicate-
-- charge path that did not exist before, because the browser used to charge
-- once per logical send and then retry only the invocation:
--
--   chat.html askAI() retries ONCE, automatically, on a transport-only failure
--   (no HTTP status — the cold-start / CORS-preflight 503 class), reusing the
--   SAME payload and therefore the SAME client_request_id.
--
-- If the first request reached the function, charged, and was mid-OpenAI when
-- the client saw the transport error, the retry charges a second time. The
-- existing CAI-P1 idempotency pre-flight cannot catch it: that reads
-- question_records, which is not written until AFTER the model call. There is a
-- 10-30 second window per request in which a retry double-charges.
--
-- MEASURED 2026-08-02:
--   question_records .. uniq_question_records_user_request UNIQUE (user_id,
--                       client_request_id) WHERE client_request_id IS NOT NULL
--                       — so the ANSWER is deduplicated
--   ai_usage_logs .... no client_request_id column, no unique index beyond the
--                       primary key — so the CHARGE is not
--
-- The answer was made idempotent and the charge was not, because until v96 the
-- charge did not happen here.
--
-- ── WHAT THIS DOES ─────────────────────────────────────────────────────────
--   1. ai_usage_logs gains a nullable client_request_id + a partial unique
--      index, mirroring the one question_records already carries.
--   2. consume_credits gains p_client_request_id (DEFAULT NULL) and returns the
--      EXISTING charge instead of making a second one when that key has already
--      been charged. The reply carries `idempotent_replay: true`.
--
-- Passing NULL — every caller that has not been updated — behaves exactly as
-- today. Idempotency is opt-in per call site.
--
-- ── WHY THE CHECK SITS WHERE IT DOES ───────────────────────────────────────
-- After the `SELECT … FROM profiles … FOR UPDATE`, not before it. That lock is
-- the serialization point for a given student: a concurrent call for the same
-- user blocks there until the first commits, so by the time the check runs the
-- winner's row is visible. Checking before the lock lets both callers past it.
--
-- The unique index is the hard guarantee behind that reasoning rather than a
-- second implementation of it. If the ordering argument is ever wrong — a path
-- that skips the lock, a future refactor, the admin branch which never takes it
-- — the INSERT raises unique_violation, and the handler reverses this call's
-- deduction and returns the winner's decision. Two mechanisms, one outcome, and
-- the cheap one does the work in the common case.
--
-- ── WHY DROP AND RECREATE ──────────────────────────────────────────────────
-- CREATE OR REPLACE cannot add a parameter: a different argument list creates an
-- OVERLOAD, and a seven-argument call would then match two candidates and fail
-- with "function is not unique". The old signature must go.
--
-- That means the grants go with it, and Supabase's default privileges hand
-- EXECUTE to `public` (hence `anon`) at CREATE time. This is the exact trap that
-- caught 20260802_plan_catalog_single_source.sql and needed
-- 20260802b_plan_rpc_grant_hygiene.sql to clean up. §3 below restores the
-- intended grants explicitly, in the same transaction, so there is no window in
-- which anon can call this.
--
-- ── BLAST RADIUS (measured 2026-08-02) ─────────────────────────────────────
--   rows in ai_usage_logs ...................... 1,177 (all get NULL — no
--                                                behaviour change, no backfill)
--   callers passing 7 args ..................... credit-config.js (chat.html
--                                                Study Planner, and every other
--                                                page's charge) — unaffected
--   callers passing 8 args ..................... ai-tutor v96 only
--   SQL functions calling consume_credits ...... 0
--   grants before ............................. authenticated=true, anon=false
--   grants after (asserted in §4) ............. authenticated=true, anon=false
--
-- Target project: igvkyxkmjnkzscqgommj
-- Rebased on the LIVE definition, verified 2026-08-02:
--   md5(pg_get_functiondef) = 036fc71fbf2a8a710a97264a11dfa5b8, 5,832 bytes,
--   carrying the AUTHZ-01 guard and the always_charge branch. Everything below
--   is that body plus the idempotency additions, which are marked.
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. The key
-- ---------------------------------------------------------------------------
alter table public.ai_usage_logs
  add column if not exists client_request_id uuid;

comment on column public.ai_usage_logs.client_request_id is
  'Idempotency key for one logical student send. Mirrors question_records.client_request_id: that one deduplicates the ANSWER, this one deduplicates the CHARGE. NULL for callers that do not supply one (behaviour is then exactly as before).';

-- Partial, matching uniq_question_records_user_request. NULLs are unconstrained,
-- so unkeyed callers are unaffected.
create unique index if not exists uniq_ai_usage_logs_user_request
  on public.ai_usage_logs (user_id, client_request_id)
  where client_request_id is not null;

-- ---------------------------------------------------------------------------
-- 2. consume_credits, with the idempotency key
-- ---------------------------------------------------------------------------
drop function if exists public.consume_credits(uuid, text, text, integer, integer, numeric, uuid);

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
  v_prior_id      UUID;       -- NEW (idempotency)
  v_prior_credits INTEGER;    -- NEW (idempotency)
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
    -- NEW: admins retry too, and a duplicate row would trip the index below.
    -- This branch never takes the profiles lock, so the handler is the only
    -- protection against two concurrent admin calls sharing a key.
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

  -- ── Idempotency replay (NEW) ─────────────────────────────────────────────
  -- Deliberately AFTER the FOR UPDATE above: that lock serializes concurrent
  -- calls for this student, so the winner's row is committed and visible by the
  -- time a duplicate gets here. Before the lock, both callers would pass.
  --
  -- Returns the ORIGINAL charge — same log_id, same credits_used — so a retry
  -- is indistinguishable from the first call to everything downstream,
  -- including the refund handle the Edge Function holds.
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

  -- NEW: the insert is wrapped so a duplicate key cannot leave the student
  -- charged. The FOR UPDATE lock should already have prevented reaching here
  -- with a duplicate; this is the guarantee rather than the expectation.
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
    -- Another call for this key won. Put back exactly what this call took —
    -- the deduction above is in the outer transaction and does NOT roll back
    -- with this sub-block — then return the winner's decision.
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

-- ---------------------------------------------------------------------------
-- 3. Restore the grants the DROP removed
-- ---------------------------------------------------------------------------
-- CREATE grants EXECUTE to `public` by default, which is how `anon` acquires it.
-- Revoke first, then grant what is intended — the state
-- 20260730_sec08a_rpc_grant_hygiene.sql established for the old signature.
revoke execute on function
  public.consume_credits(uuid, text, text, integer, integer, numeric, uuid, uuid)
  from public, anon;
grant execute on function
  public.consume_credits(uuid, text, text, integer, integer, numeric, uuid, uuid)
  to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Assert the end state inside the transaction — roll back if it is wrong
-- ---------------------------------------------------------------------------
-- A grant mistake here is silent and serious, so it aborts rather than warns.
do $$
begin
  if has_function_privilege('anon',
       'public.consume_credits(uuid,text,text,integer,integer,numeric,uuid,uuid)', 'EXECUTE') then
    raise exception 'anon can execute consume_credits — refusing to commit';
  end if;
  if not has_function_privilege('authenticated',
       'public.consume_credits(uuid,text,text,integer,integer,numeric,uuid,uuid)', 'EXECUTE') then
    raise exception 'authenticated LOST execute on consume_credits — refusing to commit';
  end if;
end $$;

commit;

-- ===========================================================================
-- VERIFICATION (run after applying)
-- ===========================================================================
--   -- 1. Old seven-argument callers still resolve (this is credit-config.js).
--   --    Expect a normal charge result, NOT "function is not unique".
--   SELECT public.consume_credits(
--            '<test user uuid>'::uuid, 'CHAT_TEXT', null, 0, 0, 0, null);
--
--   -- 2. The same key charges once. Expect: first call ok with a log_id,
--   --    second call ok with the SAME log_id and idempotent_replay = true,
--   --    and exactly ONE row.
--   SELECT public.consume_credits('<uid>'::uuid, 'CHAT_TEXT', null, 0,0,0, null,
--                                 '11111111-1111-4111-8111-111111111111'::uuid);
--   SELECT public.consume_credits('<uid>'::uuid, 'CHAT_TEXT', null, 0,0,0, null,
--                                 '11111111-1111-4111-8111-111111111111'::uuid);
--   SELECT count(*) FROM ai_usage_logs
--    WHERE client_request_id = '11111111-1111-4111-8111-111111111111';   -- 1
--
--   -- 3. Grants
--   SELECT has_function_privilege('authenticated',
--            'public.consume_credits(uuid,text,text,integer,integer,numeric,uuid,uuid)','EXECUTE') AS authenticated,
--          has_function_privilege('anon',
--            'public.consume_credits(uuid,text,text,integer,integer,numeric,uuid,uuid)','EXECUTE') AS anon;
--   -- expect true, false
--
-- ── Rollback ───────────────────────────────────────────────────────────────
-- Restore the seven-argument body from
-- supabase/migrations/20260721_study_plan_always_charge.sql, then:
--   drop function if exists public.consume_credits(uuid,text,text,integer,integer,numeric,uuid,uuid);
--   drop index if exists public.uniq_ai_usage_logs_user_request;
--   alter table public.ai_usage_logs drop column if exists client_request_id;
--   revoke execute on function public.consume_credits(uuid,text,text,integer,integer,numeric,uuid) from public, anon;
--   grant  execute on function public.consume_credits(uuid,text,text,integer,integer,numeric,uuid) to authenticated;
-- ===========================================================================
