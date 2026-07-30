-- ===========================================================================
-- AI Monitor — read access to ai_model_calls via owner-gated RPCs
-- ===========================================================================
-- STATUS: owner-approved 2026-07-30 (CLAUDE.md §3, approved individually).
-- Proposal:  docs/roadmap/ai-monitor-telemetry-access-proposal.md
-- Decision:  option 3 (§5.3) — SECURITY DEFINER RPC. Q2 resolved as `owner`.
--
-- WHAT THIS IS
--   Two read-only functions that let AI Monitor replace derived call counts
--   with measured ones, and give it a provider-failure signal that does not
--   depend on question_records.
--
-- WHAT THIS DELIBERATELY DOES NOT DO
--   • No RLS policy is added to public.ai_model_calls.
--   • No grant is added to public.ai_model_calls.
--   The table stays service-role only. Its `rls_enabled_no_policy` advisor
--   notice is its correct steady state, not an oversight. All client read
--   access goes through the two functions below and nowhere else.
--
-- INTERFACE PROPERTIES (proposal §3 — the reason an RPC was chosen)
--   P1 explicit return type      — a column not named below is unreturnable.
--   P2 fails closed on evolution — a new ai_model_calls column reaches no
--                                  client until this signature is edited.
--   P3 explicit forbidden        — an unauthorised call RAISEs SQLSTATE 42501,
--                                  which PostgREST maps to HTTP 403. It does
--                                  NOT return an empty set, so "cannot see"
--                                  is never mistaken for "no data".
--   P4 centralised authorization — one guard clause per function, at entry.
--   P5 house consistency         — matches the 23 existing SECURITY DEFINER
--                                  functions and INV-04 (dashboards consume
--                                  RPCs, not tables).
--
-- COLUMN SURFACE — 9 of the table's 23 columns are read, and only in aggregate:
--   service_code, stage, provider, model, success, http_status, error_code,
--   latency_ms, started_at
-- Never read and never returned: prompt_tokens, completion_tokens, units,
--   user_id, session_id, question_record_id, call_uid, request_id,
--   client_request_id, meta, id, created_at, operation, api_surface.
-- Token columns are omitted because no AI Monitor panel reads them (proposal
-- §2), which also keeps this surface clear of the spend-reconstruction
-- question in Appendix A. Adding one later is one reviewed edit here — that is
-- P1 working as intended, not an exception to it.
--
-- AUTHORIZATION
--   Floor is `owner`. NOTE: ai-monitor.html currently admits `super_admin` as
--   well as `owner`, so a super_admin viewing the page will receive 403 from
--   these functions. That is intended and must be rendered as an explicit
--   "requires owner" state — never as an empty panel. See §"Follow-up" in the
--   proposal.
--
--   The guard is COALESCE-wrapped. has_role_at_least() is STABLE and returns
--   boolean; today user_role_level(NULL) yields 0 so it returns false rather
--   than NULL for an anonymous caller, and a bare `IF NOT ...` would fire
--   correctly. The COALESCE is defense-in-depth: if user_role_level ever
--   returns NULL for an unknown role, `NOT NULL` is NULL, `IF NULL THEN` does
--   not execute, and the guard would silently pass. Cheap insurance against a
--   change in a function this one does not own.
--
--   EXECUTE is revoked from PUBLIC. This is mandatory, not belt-and-braces:
--   PostgreSQL grants EXECUTE to PUBLIC by default and PostgREST publishes
--   every public-schema function as /rest/v1/rpc/<name>, so without the
--   revoke these would be callable by `anon`. Two existing functions in this
--   database are in exactly that state (admin_credits_overview,
--   admin_set_credit_cost) — their in-body gates hold, so it is not a live
--   bypass, but only one of the two intended layers is present. Both layers
--   are present here.
--
-- Target project: igvkyxkmjnkzscqgommj
-- ===========================================================================

-- ── 1. Per-service / per-model call health ────────────────────────────────
-- Grain: one row per (service_code, stage, provider, model) in the window.
--
-- successes + failures = calls, always: `success IS TRUE` and
-- `success IS NOT TRUE` partition the rows, so a NULL success cannot fall
-- between the two counters and silently break the sum.
--
-- Latency is measured over SUCCESSFUL calls only, and over those with a
-- non-null latency_ms. A failed call's latency is a timeout or an error
-- round-trip; mixing those in makes a p95 useless as a responsiveness figure.
-- Consumers displaying these columns must say so.
--
-- percentile_disc (nearest-rank), not percentile_cont: it returns a latency
-- that actually occurred, and it matches how ai-monitor.html already computes
-- its pipeline-latency p95, so the two cannot disagree by method.
CREATE OR REPLACE FUNCTION public.ai_monitor_call_health(
  p_since timestamptz DEFAULT NULL
)
RETURNS TABLE (
  service_code   text,
  stage          text,
  provider       text,
  model          text,
  calls          bigint,
  successes      bigint,
  failures       bigint,
  latency_avg_ms integer,
  latency_p50_ms integer,
  latency_p95_ms integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT COALESCE(public.has_role_at_least('owner'::public.user_role), false) THEN
    RAISE EXCEPTION 'forbidden: ai_monitor_call_health requires role owner'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    c.service_code,
    c.stage,
    c.provider,
    c.model,
    count(*)                                     AS calls,
    count(*) FILTER (WHERE c.success IS TRUE)     AS successes,
    count(*) FILTER (WHERE c.success IS NOT TRUE) AS failures,
    round(avg(c.latency_ms) FILTER (
      WHERE c.success IS TRUE AND c.latency_ms IS NOT NULL))::integer
                                                 AS latency_avg_ms,
    percentile_disc(0.50) WITHIN GROUP (ORDER BY c.latency_ms) FILTER (
      WHERE c.success IS TRUE AND c.latency_ms IS NOT NULL)
                                                 AS latency_p50_ms,
    percentile_disc(0.95) WITHIN GROUP (ORDER BY c.latency_ms) FILTER (
      WHERE c.success IS TRUE AND c.latency_ms IS NOT NULL)
                                                 AS latency_p95_ms
  FROM public.ai_model_calls c
  WHERE p_since IS NULL OR c.started_at >= p_since
  GROUP BY c.service_code, c.stage, c.provider, c.model
  ORDER BY count(*) DESC, c.service_code, c.stage;
END;
$$;

-- ── 2. Provider failure breakdown ─────────────────────────────────────────
-- Grain: one row per (http_status, error_code, service_code, model).
-- Only failed calls. `success IS NOT TRUE` matches the failures counter in
-- ai_monitor_call_health exactly, so the two functions agree on what a
-- failure is.
CREATE OR REPLACE FUNCTION public.ai_monitor_call_failures(
  p_since timestamptz DEFAULT NULL
)
RETURNS TABLE (
  http_status  smallint,
  error_code   text,
  service_code text,
  model        text,
  failures     bigint,
  last_seen    timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT COALESCE(public.has_role_at_least('owner'::public.user_role), false) THEN
    RAISE EXCEPTION 'forbidden: ai_monitor_call_failures requires role owner'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    c.http_status,
    c.error_code,
    c.service_code,
    c.model,
    count(*)            AS failures,
    max(c.started_at)   AS last_seen
  FROM public.ai_model_calls c
  WHERE c.success IS NOT TRUE
    AND (p_since IS NULL OR c.started_at >= p_since)
  GROUP BY c.http_status, c.error_code, c.service_code, c.model
  ORDER BY count(*) DESC, max(c.started_at) DESC;
END;
$$;

-- ── 3. Privileges ─────────────────────────────────────────────────────────
-- REVOKE FROM PUBLIC first: PostgreSQL grants EXECUTE to PUBLIC on function
-- creation, and PostgREST would otherwise expose these to `anon`.
-- The `anon` revokes are redundant once PUBLIC is revoked; they are kept as an
-- explicit statement of intent and are idempotent.
REVOKE ALL ON FUNCTION public.ai_monitor_call_health(timestamptz)   FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ai_monitor_call_health(timestamptz)   FROM anon;
REVOKE ALL ON FUNCTION public.ai_monitor_call_failures(timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ai_monitor_call_failures(timestamptz) FROM anon;

GRANT EXECUTE ON FUNCTION public.ai_monitor_call_health(timestamptz)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.ai_monitor_call_failures(timestamptz) TO authenticated;

-- ── 4. Documentation carried in the database ──────────────────────────────
COMMENT ON FUNCTION public.ai_monitor_call_health(timestamptz) IS
  'AI Monitor: per-service/model call health over a window. Requires role owner '
  '(raises SQLSTATE 42501 otherwise). Reads 8 columns of ai_model_calls in '
  'aggregate; returns no token counts and no user identifiers. successes + '
  'failures = calls. Latency columns cover SUCCESSFUL calls with a non-null '
  'latency_ms only, using percentile_disc (nearest-rank). p_since NULL = all time.';

COMMENT ON FUNCTION public.ai_monitor_call_failures(timestamptz) IS
  'AI Monitor: failed provider calls grouped by status/error/service/model. '
  'Requires role owner (raises SQLSTATE 42501 otherwise). A failure is '
  'success IS NOT TRUE, matching the failures counter in ai_monitor_call_health. '
  'Returns no token counts and no user identifiers. p_since NULL = all time.';
