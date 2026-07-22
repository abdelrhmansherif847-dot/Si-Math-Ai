-- ===========================================================================
-- refund_ai_credit — concurrent double-refund fix + version control
-- ===========================================================================
-- STATUS: owner-approved production hardening. Target project igvkyxkmjnkzscqgommj.
--
-- Two goals, one CREATE OR REPLACE:
--   1. FIX a concurrent double-refund race. The previous body SELECTed the
--      usage-log row (no lock), refunded, then DELETEd it last. Two concurrent
--      refunds of the same log_id (e.g. two tabs draining the shared
--      localStorage refund queue) could both pass the SELECT and each credit the
--      user → over-credit + credits_balance drift.
--   2. VERSION-CONTROL the function. It previously existed only in the live DB
--      with no migration, so the schema could not be fully recreated from source.
--      This migration is now its canonical, replayable source.
--
-- The fix: DELETE the log row FIRST, atomically, with RETURNING. DELETE takes a
-- row lock, so under READ COMMITTED exactly one concurrent caller can claim a
-- given log_id; the loser sees zero rows (NOT FOUND) and returns log_not_found
-- before touching profiles. Single-call idempotency is preserved — the deleted
-- row is the refund token, so a repeat call is a no-op (log_not_found).
--
-- Everything else — return shape ({ok, refunded, sub_refund, pack_refund,
-- balance_after}), the free-plan short-circuit, bucket accounting from the
-- CONSUME transaction description, the REFUND ledger row, and the least-
-- privilege grant — is behaviourally identical to the prior live definition.
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.refund_ai_credit(p_log_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id     uuid;
  v_credits     INTEGER;
  v_tx          RECORD;
  v_sub_refund  INTEGER := 0;
  v_pack_refund INTEGER := 0;
  v_new_total   INTEGER;
BEGIN
  -- Atomically claim the caller's own usage-log row. The DELETE row-lock makes
  -- exactly one concurrent caller succeed; the rest get NOT FOUND. This closes
  -- the double-refund window that a bare SELECT-then-DELETE left open.
  DELETE FROM ai_usage_logs
  WHERE id = p_log_id AND user_id = auth.uid()
  RETURNING user_id, credits_used INTO v_user_id, v_credits;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'log_not_found');
  END IF;

  -- Free plan / nothing charged: the row is already removed, nothing to restore.
  IF v_credits IS NULL OR v_credits = 0 THEN
    RETURN jsonb_build_object('ok', true, 'refunded', 0, 'reason', 'no_credits_were_charged');
  END IF;

  -- Determine which buckets were originally deducted, from the CONSUME
  -- transaction description ('… (sub:N pack:M)' | '(pack:N)' | no suffix).
  SELECT * INTO v_tx
  FROM credit_transactions
  WHERE reference_id = p_log_id AND transaction_type = 'CONSUME'
  ORDER BY created_at DESC LIMIT 1;

  IF v_tx IS NOT NULL THEN
    IF v_tx.description LIKE '%(sub:% pack:%)%' THEN
      v_sub_refund  := (regexp_match(v_tx.description, 'sub:(\d+)'))[1]::INTEGER;
      v_pack_refund := (regexp_match(v_tx.description, 'pack:(\d+)'))[1]::INTEGER;
    ELSIF v_tx.description LIKE '%(pack:%)%' THEN
      v_pack_refund := (regexp_match(v_tx.description, 'pack:(\d+)'))[1]::INTEGER;
    ELSE
      v_sub_refund := v_credits;
    END IF;
  ELSE
    -- No transaction record — restore all to subscription_credits (safe default).
    v_sub_refund := v_credits;
  END IF;

  -- Restore credits to the correct buckets and keep credits_balance in lockstep.
  UPDATE profiles
  SET subscription_credits = subscription_credits + v_sub_refund,
      pack_credits         = pack_credits + v_pack_refund,
      credits_balance      = credits_balance + v_credits
  WHERE id = v_user_id
  RETURNING credits_balance INTO v_new_total;

  -- Ledger the refund.
  INSERT INTO credit_transactions
    (user_id, transaction_type, credits, balance_after, reference_type, reference_id, description)
  VALUES
    (v_user_id, 'REFUND', v_credits, v_new_total,
     'AI_USAGE', p_log_id, 'Refund: AI call failed after credit deduction');

  RETURN jsonb_build_object(
    'ok',            true,
    'refunded',      v_credits,
    'sub_refund',    v_sub_refund,
    'pack_refund',   v_pack_refund,
    'balance_after', v_new_total
  );
END;
$function$;

-- Least-privilege grant: end users refund only their own logs (auth.uid() guard
-- inside); service_role bypasses. Idempotent to re-assert; required so a
-- from-scratch recreate produces a callable function.
REVOKE ALL ON FUNCTION public.refund_ai_credit(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.refund_ai_credit(uuid) TO authenticated;
