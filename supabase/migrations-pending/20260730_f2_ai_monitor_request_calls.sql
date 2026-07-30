-- ===========================================================================
-- AI Monitor F2 — per-request provider-call attribution
-- ===========================================================================
-- ⛔ NOT APPLIED — and DEFERRED as of 2026-07-30, not merely awaiting approval.
--
--    Do not apply this on the strength of the design argument below. The design
--    review reached a different conclusion than "is this contract sound?":
--    THERE IS NO REPRESENTATIVE DATA TO VALIDATE IT AGAINST.
--
--    Measured 2026-07-30:
--      • 64 delivery failures in question_records, newest 2026-07-18 13:07
--      • oldest row in ai_model_calls        2026-07-29 11:15
--      • delivery failures with ANY ledger row ................. 0
--      • failed provider calls in the ledger ................... 0
--
--    The ledger began 11 days after the most recent delivery failure, so this
--    function would return an empty set for every row the failures panel
--    currently shows. Applying it could not be verified end-to-end — which is
--    the exact condition that produced the "model (inferred)" guess this work
--    exists to replace.
--
--    An alternative shape was also considered and rejected as a substitute: a
--    server-owned LIMIT-bounded feed of recent failed calls, which needs no
--    uuid[] parameter and no cap. It has the cleaner contract, but it does NOT
--    solve this problem. Delivery failure (student received a fallback) and
--    failed provider call (an OpenAI call returned non-2xx) are different sets,
--    neither containing the other: a retried call fails then succeeds → ledger
--    failure, no delivery failure; a tutor returning valid JSON with no answer
--    field → delivery failure, no ledger failure. Only question_records knows
--    about delivery failures, so a ledger-driven feed would silently change what
--    the panel means rather than enrich it. The aggregate ledger view already
--    exists as the "Failed provider calls" panel.
--
--    REVISIT when either trigger fires — both are already visible on the
--    dashboard, so this needs no new tooling to notice:
--      (1) a delivery failure occurs WITH ledger coverage — settles whether this
--          function has real join targets; or
--      (2) the first failed provider call appears — settles whether the
--          server-owned feed deserves its own panel.
--    Then design against the real rows rather than the hypothesis, and re-open
--    the A-vs-B choice; the staged shape below is a starting point, not a
--    decision.
--
--    To approve after a trigger fires: move to supabase/migrations/ and apply
--    per docs/supabase-migrations.md, then wire the UI (see "UI" below).
--
-- Proposal: docs/roadmap/ai-monitor-telemetry-access-proposal.md (F2, §11)
-- Follows:  20260730_ai_monitor_call_telemetry_rpcs.sql — same pattern, same
--           owner floor, same revoke discipline.
--
-- WHY
--   The audit removed a "model (inferred)" column from the OpenAI Health
--   failures table because it guessed the serving model from whether the
--   question carried an image, and printed the guess as data. ai_model_calls
--   now records the truth: a `tutor` service call per request, carrying the
--   real model and a question_record_id.
--
--   Measured 2026-07-30: 5 tutor calls, 5 distinct question_record_ids, 0 calls
--   with a NULL question_record_id, and models spanning BOTH gpt-4o and
--   gpt-4o-mini. So the model genuinely varies per request — the removed column
--   was guessing at something real and variable, and this can now show it
--   truthfully instead.
--
-- HOW THIS DIFFERS FROM THE TWO EXISTING RPCs — read before approving
--   The existing functions are aggregates. This one returns PER-ROW data, which
--   is a deliberate widening of grain and the only reason this is a separate
--   review rather than an amendment. It is acceptable because:
--
--     • It is bounded by an explicit id list. The caller must already possess
--       the question_record_ids, which come from rows the dashboard is already
--       displaying. It cannot be used to enumerate the table.
--     • A hard cap of 100 ids per call is enforced in-function, so the bound is
--       not merely conventional.
--     • The column set is still fixed and typed (P1): no prompt_tokens, no
--       completion_tokens, no units, no user_id, no session_id.
--     • Same owner floor and the same 42501 → HTTP 403 refusal semantics (P3).
--
--   It adds question_record_id to the page's overall column surface — a 10th
--   column. That identifier is already visible in the Question Inspector, so it
--   discloses nothing the page does not already show.
--
-- UI (not included here; wire only after this is applied)
--   OpenAI Health → "Recent AI Tutor Failures": replace the removed
--   "model (inferred)" column with the real serving model, and show which
--   stage failed. Must render the owner-only refusal through the existing
--   no_access availability state, exactly as the other two RPCs do — never as
--   an empty cell.
--
-- Target project: igvkyxkmjnkzscqgommj
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.ai_monitor_request_calls(
  p_question_record_ids uuid[]
)
RETURNS TABLE (
  question_record_id uuid,
  service_code       text,
  stage              text,
  provider           text,
  model              text,
  success            boolean,
  http_status        smallint,
  error_code         text,
  latency_ms         integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  IF NOT COALESCE(public.has_role_at_least('owner'::public.user_role), false) THEN
    RAISE EXCEPTION 'forbidden: ai_monitor_request_calls requires role owner'
      USING ERRCODE = '42501';
  END IF;

  -- An empty or NULL list is a legitimate no-op, not an error: the caller had
  -- no rows to annotate.
  v_count := COALESCE(array_length(p_question_record_ids, 1), 0);
  IF v_count = 0 THEN
    RETURN;
  END IF;

  -- Bound the request explicitly. Without this the "bounded by an id list"
  -- property would rely on the client behaving, which is not a property.
  IF v_count > 100 THEN
    RAISE EXCEPTION
      'ai_monitor_request_calls accepts at most 100 question_record_ids per call (got %)', v_count
      USING ERRCODE = '22023';   -- invalid_parameter_value
  END IF;

  RETURN QUERY
  SELECT
    c.question_record_id,
    c.service_code,
    c.stage,
    c.provider,
    c.model,
    c.success,
    c.http_status,
    c.error_code,
    c.latency_ms
  FROM public.ai_model_calls c
  WHERE c.question_record_id = ANY (p_question_record_ids)
  ORDER BY c.question_record_id, c.started_at;
END;
$$;

-- Privileges — same discipline as the two applied RPCs. REVOKE FROM PUBLIC is
-- mandatory: PostgreSQL grants EXECUTE to PUBLIC on creation and PostgREST
-- publishes every public-schema function as /rest/v1/rpc/<name>.
REVOKE ALL   ON FUNCTION public.ai_monitor_request_calls(uuid[]) FROM PUBLIC;
REVOKE ALL   ON FUNCTION public.ai_monitor_request_calls(uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.ai_monitor_request_calls(uuid[]) TO authenticated;

COMMENT ON FUNCTION public.ai_monitor_request_calls(uuid[]) IS
  'AI Monitor: provider calls for specific question records, for per-request '
  'model attribution. Requires role owner (raises SQLSTATE 42501 otherwise). '
  'Per-row grain, bounded to 100 ids per call. Returns no token counts and no '
  'user identifiers.';

-- ===========================================================================
-- Post-apply verification
--   -- 1. anon must not be able to execute it
--   SELECT has_function_privilege('anon',
--            'public.ai_monitor_request_calls(uuid[])', 'EXECUTE');  -- expect false
--
--   -- 2. the guard must raise, not return empty
--   SELECT * FROM public.ai_monitor_request_calls(ARRAY[]::uuid[]);
--   -- expect: ERROR 42501 forbidden (when not owner)
--
--   -- 3. the return type must contain no token column
--   SELECT count(*) FROM information_schema.parameters
--    WHERE specific_schema='public' AND parameter_mode='OUT'
--      AND specific_name LIKE 'ai_monitor_request_calls%'
--      AND parameter_name IN ('prompt_tokens','completion_tokens','units','user_id','session_id');
--   -- expect: 0
--
--   -- 4. the cap must be enforced
--   -- call with 101 ids as owner → expect ERROR 22023
-- ===========================================================================
