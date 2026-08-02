-- ===========================================================================
-- refund_ai_credit becomes server-only
-- ===========================================================================
-- STATUS: ✅ APPLIED to igvkyxkmjnkzscqgommj on 2026-08-02, owner-approved
--         individually (CLAUDE.md §3). Version 20260802174206.
--
--         POST-APPLY VERIFICATION — 4/4 PASS against live data:
--           authenticated EXECUTE ......... false  (was true — this is the fix)
--           anon EXECUTE .................. false  (unchanged)
--           service_role EXECUTE .......... true
--           service-role branch in body ... present
--         The paired grant on consume_credits was re-checked in the same query
--         and is intact (authenticated=true, anon=false).
--
--         ⚠️ APPLIED AHEAD OF ITS STATED PREREQUISITE, knowingly. The intended
--         order was: idempotency migration → deploy v96 → verify → merge the
--         site → apply this. It was applied at the owner's explicit direction
--         before the v96 deploy, which leaves one gap for as long as the
--         PRE-v96 chat.html is the live site: that page calls
--         refund_ai_credit from the browser on an out-of-scope turn or a failed
--         call, and those calls now return `permission denied`. Students are
--         charged for redirects and failures until v96 + the new chat.html are
--         live — a daily slot for FREE users, the per-operation credits for
--         paid ones. Nothing else regresses, and the gap closes on deploy.
--         Recorded here rather than in a commit message because the file is
--         where someone reading the schema history will look.
--
--         MEASURED at apply time: ai_usage_logs held ZERO rows with a
--         client_request_id, i.e. ai-tutor v96 had never served a request --
--         only v96 sends that key. The running function was platform version
--         134 (deployed 2026-08-02T04:47:29Z, sha256 03441f52...), which is
--         v95 source. CLAUDE.md recorded 133 / c3f5fff1 and was one deploy
--         stale; corrected there.
--
-- ── WHAT THIS CLOSES ───────────────────────────────────────────────────────
-- consume_credits() derives a FREE student's daily usage by counting rows:
--
--     SELECT COUNT(*) INTO v_daily_used
--     FROM ai_usage_logs
--     WHERE user_id = p_user_id
--       AND created_at >= date_trunc('day', now() AT TIME ZONE 'UTC');
--
-- refund_ai_credit() DELETEs the row:
--
--     DELETE FROM ai_usage_logs
--     WHERE id = p_log_id AND user_id = auth.uid()
--     RETURNING user_id, credits_used INTO v_user_id, v_credits;
--
-- So every refund rewinds the daily counter by one. The function is granted to
-- `authenticated` (measured 2026-08-02: has_function_privilege('authenticated',
-- 'public.refund_ai_credit(uuid)', 'EXECUTE') = true; anon = false), and its
-- only authorization check is that the row belongs to the caller.
--
-- A student can therefore call it on their OWN log ids, from the browser
-- console, with no tooling — and the FREE tier's rows are the cheapest possible
-- target, because they carry credits_used = 0 and the function has an explicit
-- branch for them:
--
--     IF v_credits IS NULL OR v_credits = 0 THEN
--       RETURN jsonb_build_object('ok', true, 'refunded', 0,
--                                 'reason', 'no_credits_were_charged');
--
-- The row is already deleted by then. "Nothing to restore" is true about the
-- credits and false about the quota. 807 of the 1,177 rows in ai_usage_logs are
-- zero-credit rows (measured 2026-08-02) — that is what the FREE daily cap is
-- made of, and any of them can be erased by the student they belong to.
--
-- This was the SECOND way free students could exceed their limit. The first —
-- that the Edge Function never charged at all — is fixed in v96 and needs no
-- migration. This one does, because the grant is the vulnerability.
--
-- ── WHAT THIS DOES ─────────────────────────────────────────────────────────
--   1. Adds a service-role branch to refund_ai_credit, mirroring AUTHZ-01 in
--      consume_credits: a caller with no JWT (auth.uid() IS NULL — only
--      service_role reaches this) may reverse any log row; an end user, if the
--      grant is ever restored, still only reaches their own.
--   2. Revokes EXECUTE from `authenticated`. After this, the only party that
--      can rewind a usage row is the Edge Function, and only for a turn it
--      observed fail.
--
-- Deliberately NOT in scope: changing the DELETE to a soft-delete
-- (`refunded_at`), which would let a refunded turn keep its daily slot without
-- keeping its credits. v96 gets that outcome without a schema change — it
-- simply does not refund a zero-credit turn on the out-of-scope path, because
-- there are no credits to return and the only effect would be the rewind. If a
-- later feature needs "return the credits, keep the slot" for a PAID turn, that
-- is when the column earns its place.
--
-- ── BLAST RADIUS (measured 2026-08-02, not assumed) ────────────────────────
--   callers of refund_ai_credit in .html/.js .. 0 as of v96. Asserted in CI by
--                                               tests/entitlement-gate.test.mjs
--                                               ("No shipped page can invoke
--                                               refund_ai_credit"), over every
--                                               root *.html and *.js, not just
--                                               the page that used to call it
--   other SQL functions calling it ............ 0
--   rows affected ............................. 0 (grants and body only)
--   REFUND transactions to date ............... 3
--
-- An earlier draft of this header recorded two surviving call sites and asked
-- the reviewer to accept the consequences of breaking them. Both were removed
-- instead, which is why this migration now takes nothing away:
--
--   • drainRefundQueue() replayed a pre-v96 localStorage queue through this RPC
--     once per page load. It is now discardLegacyRefundQueue(), which deletes
--     the queue without calling anything. A "legacy" call site is still a live
--     call site, and its input was client-controlled localStorage.
--
--   • The Study Planner charged before generating and refunded if its local
--     engine threw. It now BUILDS THE PLAN FIRST and charges after, so the
--     failure it was refunding cannot occur after a charge. The planner makes
--     no provider call (window.StudyPlanner.buildStudyPlan is pure client-side
--     computation), so ordering the work before the paywall costs nothing.
--
-- Its charge is still issued from the browser and is still skippable by a
-- determined caller — a paywall on a local feature, not a gate in front of
-- spend, and unable to touch the FREE cap because STUDY_PLAN is always_charge.
-- That is INFRA-5 in docs/engineering/infrastructure-backlog.md and is a
-- revenue question rather than the cost/quota one v96 fixes.
--
-- Target project: igvkyxkmjnkzscqgommj
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. Service-role branch (mirrors AUTHZ-01 in consume_credits)
-- ---------------------------------------------------------------------------
-- Only the DELETE predicate changes. Every other line is the live body,
-- verbatim — verified against pg_get_functiondef on 2026-08-02.
create or replace function public.refund_ai_credit(p_log_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  v_user_id     uuid;
  v_credits     INTEGER;
  v_tx          RECORD;
  v_sub_refund  INTEGER := 0;
  v_pack_refund INTEGER := 0;
  v_new_total   INTEGER;
BEGIN
  -- Atomically claim the usage-log row. The DELETE row-lock makes exactly one
  -- concurrent caller succeed; the rest get NOT FOUND. This closes the
  -- double-refund window that a bare SELECT-then-DELETE left open.
  --
  -- Dual-authorization (mirrors AUTHZ-01 in consume_credits): an end user
  -- (auth.uid() not null) may only reverse their own row. The Edge Function
  -- acts as service_role (auth.uid() IS NULL) and may reverse any row — it is
  -- the party that observed the failure, and after §2 below it is the only
  -- party that can call this at all.
  DELETE FROM ai_usage_logs
  WHERE id = p_log_id
    AND (auth.uid() IS NULL OR user_id = auth.uid())
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

-- ---------------------------------------------------------------------------
-- 2. The client loses the ability to rewind its own quota
-- ---------------------------------------------------------------------------
-- `anon` was already revoked by 20260730_sec08a_rpc_grant_hygiene.sql, which
-- deliberately RETAINED authenticated ("see review note 3") because the browser
-- was the only refunder at the time. v96 moved that job to the server, so the
-- reason for the retention is gone.
revoke execute on function public.refund_ai_credit(uuid) from public, anon, authenticated;
grant  execute on function public.refund_ai_credit(uuid) to service_role;

comment on function public.refund_ai_credit(uuid) is
  'Server-only since 2026-08-02. Reverses one ai_usage_logs row and restores its credits. Callable by service_role only: the DELETE removes the row that consume_credits counts for the FREE daily cap, so a client-callable refund is a client-callable quota reset. Issued by the ai-tutor Edge Function (v96+) on failures it observed.';

commit;

-- ===========================================================================
-- VERIFICATION (run after applying)
-- ===========================================================================
--   -- expect: authenticated=false, anon=false, service_role=true
--   SELECT has_function_privilege('authenticated','public.refund_ai_credit(uuid)','EXECUTE') AS authenticated,
--          has_function_privilege('anon',         'public.refund_ai_credit(uuid)','EXECUTE') AS anon,
--          has_function_privilege('service_role', 'public.refund_ai_credit(uuid)','EXECUTE') AS service_role;
--
--   -- expect: true (the service-role branch is live)
--   SELECT pg_get_functiondef(p.oid) LIKE '%auth.uid() IS NULL OR user_id = auth.uid()%'
--     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--    WHERE n.nspname = 'public' AND p.proname = 'refund_ai_credit';
--
--   -- Behavioural, as a signed-in student (should now fail):
--   --   select public.refund_ai_credit('<one of your own log ids>');
--   --   → ERROR: permission denied for function refund_ai_credit
--
-- ── Rollback ───────────────────────────────────────────────────────────────
--   grant execute on function public.refund_ai_credit(uuid) to authenticated;
--   -- and, to restore the pre-migration body, drop the `auth.uid() IS NULL OR`
--   -- clause from the DELETE predicate above.
-- ===========================================================================
