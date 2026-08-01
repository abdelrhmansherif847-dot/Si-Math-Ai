-- ===========================================================================
-- Phase 6 M4.3 — service → provider → model quality metrics for Section 9
-- ===========================================================================
-- STATUS: ✅ APPLIED 2026-08-01 as version 20260801135335, on individual owner
--         approval (CLAUDE.md §3). M4.3 Release Gate V1-V8 all PASS; Economics
--         suite 18/18; Cost Engine 25 PASS + 1 WARN (P4-31, pre-existing).
--         Post-apply: cost reconciles to $0.22961425 at all three levels,
--         service shares total exactly 100.00%, columns 1-8 bit-identical to
--         the pre-migration signature. See phase-6-m4-3-release-report.md.
--
-- WHY A DROP + RECREATE (owner-approved, 2026-08-01)
--   Section 9 needs tokens, latency and success/failure at service → provider →
--   model grain. owner_cost_service_breakdown() already produces exactly that
--   grain, but exposes none of those measures, and its p_service_code is
--   REQUIRED — making it a per-service drill-down when Section 9 needs an
--   all-services overview.
--
--   The owner ruled: extend this function rather than add a second one. Two
--   overlapping service→provider→model surfaces could silently diverge, which
--   is the hazard M4.2 hit. One canonical surface is preferable.
--
--   CREATE OR REPLACE cannot widen a RETURNS TABLE, so an explicit DROP is
--   required. Without it the migration reports success while the RPC keeps its
--   old 8-column shape — a failure this project has hit twice.
--
--   SAFETY OF THE DROP: nothing consumes this function. Verified 2026-08-01 —
--   admin.html references only owner_cost_metrics among the owner_cost_* RPCs,
--   and admin.html is not deployed. Columns 1-8 keep their names, types,
--   positions and meaning; 14 are APPENDED.
--
-- ON THE PARAMETER CHANGE — p_service_code becomes optional
--   Was `p_service_code text` (required). Becomes `text DEFAULT NULL`, where
--   NULL means ALL services. Existing call sites that pass a service code
--   behave identically; the default only ADDS the overview case. This is a
--   widening of accepted input, never a narrowing.
--
--   p_include_internal keeps its `false` default deliberately. Section 9 is a
--   diagnostic surface and its panel passes `true`, but changing the DEFAULT
--   would silently alter what every other caller sees — a business-metric
--   caller would start counting internal traffic without asking. INV-25 is a
--   default, not a suggestion.
--
-- SECTION 9 IS A DIAGNOSTIC SURFACE (owner decision, 2026-08-01)
--   It reports ALL observed AI telemetry including internal traffic, it is
--   labelled diagnostic in the panel, and its numbers never feed any
--   owner_econ_* business KPI. INV-25 continues to govern business metrics
--   only. This is the same principle already locked for the Coverage panel.
--
--   Served through owner_cost_* ONLY. Section 9 exposes provider_code and
--   model, which INV-13 / P5-02 forbid in the `econ` schema — so no econ object
--   is touched, and no provider or model identifier enters econ. This is not a
--   workaround: owner_cost_facts and this function already exposed both from
--   `public` before M4.3.
--
-- ON THE TELEMETRY JOIN — LEFT, and it is load-bearing
--   cost_facts is the MONEY record; ai_model_calls is telemetry. The join runs
--   cost_facts -> ai_model_calls, LEFT, so a cost fact whose telemetry row no
--   longer exists still reports its money. That is not hypothetical: §Phase 8
--   plans a retention policy for ai_model_calls, at which point an INNER join
--   would start silently dropping historical cost from a health panel.
--
--   Fan-out is impossible: ai_model_calls.id is the PRIMARY KEY, so the join
--   cannot duplicate a fact and inflate cost. Verified 2026-08-01: 0 calls with
--   more than one current fact, 0 facts whose telemetry is missing.
--
--   Consequence, handled deliberately: a fact with no telemetry row has NULL
--   success. It is therefore counted in NEITHER success_calls NOR failed_calls,
--   and success_rate_pct divides by the calls whose outcome is KNOWN — not by
--   all calls. Unknown is not failure (INV-26).
--
-- ON CONFIDENCE — the cost layer maps its own classes
--   The inline CASE below duplicates what econ.cost_confidence() does. That is
--   deliberate, not an oversight: the cost layer must not depend on econ, and
--   owner_cost_metrics() already carries the same inline mapping. Reaching into
--   econ from a cost-facing RPC would invert the layer dependency.
--
--   max(), not min(): 'invoice_verified' sorts before 'list_price', so min()
--   would report the BEST card and overstate the book.
--
-- WHAT IS DELIBERATELY OMITTED — cost per question at model grain
--   §Section 9 lists "Avg cost per request / per question" at service →
--   provider → model grain. Cost per REQUEST is provided: a call belongs to
--   exactly one request, so the figure is well defined at every level.
--
--   Cost per QUESTION is NOT provided at this grain, and is NOT blocked either.
--   The distinction matters:
--
--     a BLOCKED metric says "not computable YET" and implies it will resolve
--     an OMITTED metric says "not meaningful at this grain" and never will
--
--   Work items carry service_mix keyed by SERVICE CODE, and a question spans
--   several models. There is no allocation of a question's cost to a specific
--   model, so a per-model cost-per-question is undefined — not data-limited.
--   Shipping it blocked would promise a resolution the architecture cannot
--   deliver, so it is omitted and documented instead.
--
--   Cost per question IS available where it is defined: at service grain via
--   econ.v_operation_service_mix / owner_econ_lesson_economics, and per work
--   item in cost_engine.question_cost_facts.
--
-- ON TYPES — every trap in this function, named
--   sum(integer)                     -> bigint   (tokens)          no cast
--   count(*) / count(DISTINCT ...)   -> bigint                     no cast
--   avg(integer)                     -> numeric  (latency, tokens) no cast
--   bigint / bigint TRUNCATES, so success_rate_pct multiplies by 100.0 first,
--   making the expression numeric before the division.
--   Verified by the mandatory pre-apply type probe before this file was
--   committed. No defensive casts: every declared type is what the body
--   actually yields, so a future change that alters a type raises 42804 and
--   P5-17 catches it rather than truncating silently.
--
-- ROLLBACK
--   DROP FUNCTION IF EXISTS public.owner_cost_service_breakdown(text,date,date,boolean);
--   then re-apply the 8-column definition from
--   20260731_aiecon_p4_cost_engine.sql.
-- ===========================================================================

-- DROP first: CREATE OR REPLACE cannot widen a RETURNS TABLE.
DROP FUNCTION IF EXISTS public.owner_cost_service_breakdown(text,date,date,boolean);

CREATE FUNCTION public.owner_cost_service_breakdown(
  p_service_code     text    DEFAULT NULL,   -- NULL = all services (was required)
  p_from             date    DEFAULT NULL,
  p_to               date    DEFAULT NULL,
  p_include_internal boolean DEFAULT false
)
RETURNS TABLE (
  -- positions 1-8: unchanged in name, type, position and meaning
  level                text,
  service_code         text,
  provider_code        text,
  model                text,
  total_cost_usd       numeric,
  calls                bigint,
  priced_calls         bigint,
  unpriced_calls       bigint,
  -- positions 9-22: appended for Section 9
  requests             bigint,
  prompt_tokens        bigint,
  completion_tokens    bigint,
  total_tokens         bigint,
  avg_tokens_per_call  numeric,
  avg_latency_ms       numeric,
  success_calls        bigint,
  failed_calls         bigint,
  success_rate_pct     numeric,
  cost_per_request_usd numeric,
  cost_share_pct       numeric,
  internal_calls       bigint,
  external_calls       bigint,
  confidence           text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, cost_engine, ai_catalog
AS $$
DECLARE
  v_from timestamptz := COALESCE(p_from, '-infinity'::date)::timestamptz;
  v_to   timestamptz := COALESCE(p_to + 1, 'infinity'::date)::timestamptz;
BEGIN
  IF NOT COALESCE(public.has_role_at_least('owner'::public.user_role), false) THEN
    RAISE EXCEPTION 'forbidden: owner_cost_service_breakdown requires role owner'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH scoped AS (
    -- LEFT, from the money record outward. See header.
    SELECT f.service_code, f.provider_code, f.model, f.request_id,
           f.net_cost_usd, f.pricing_status, f.price_confidence, f.is_internal,
           c.prompt_tokens, c.completion_tokens, c.latency_ms, c.success
      FROM cost_engine.cost_facts f
      LEFT JOIN public.ai_model_calls c ON c.id = f.call_id
     WHERE f.is_current
       AND (p_service_code IS NULL OR f.service_code = p_service_code)
       AND f.occurred_at >= v_from AND f.occurred_at < v_to
       AND (p_include_internal OR NOT f.is_internal)
  )
  SELECT 'service'::text, s.service_code, NULL::text, NULL::text,
         sum(s.net_cost_usd), count(*)::bigint,
         count(*) FILTER (WHERE s.pricing_status <> 'unpriced')::bigint,
         count(*) FILTER (WHERE s.pricing_status =  'unpriced')::bigint,
         count(DISTINCT s.request_id)::bigint,
         sum(s.prompt_tokens)::bigint,
         sum(s.completion_tokens)::bigint,
         sum(s.prompt_tokens + s.completion_tokens)::bigint,
         round(avg(s.prompt_tokens + s.completion_tokens), 1),
         round(avg(s.latency_ms), 0),
         count(*) FILTER (WHERE s.success)::bigint,
         count(*) FILTER (WHERE NOT s.success)::bigint,
         -- Denominator is calls whose outcome is KNOWN. A fact whose telemetry
         -- was pruned must not be counted as a failure (INV-26).
         round(100.0 * count(*) FILTER (WHERE s.success)
               / NULLIF(count(*) FILTER (WHERE s.success IS NOT NULL), 0), 2),
         round(sum(s.net_cost_usd) / NULLIF(count(DISTINCT s.request_id), 0), 8),
         round(100.0 * sum(s.net_cost_usd)
               / NULLIF(sum(sum(s.net_cost_usd)) OVER (), 0), 2),
         count(*) FILTER (WHERE s.is_internal)::bigint,
         count(*) FILTER (WHERE NOT s.is_internal)::bigint,
         CASE max(s.price_confidence)
           WHEN 'invoice_verified' THEN 'actual'
           WHEN 'list_price'       THEN 'modeled'
           ELSE NULL
         END
    FROM scoped s GROUP BY s.service_code
  UNION ALL
  SELECT 'provider'::text, s.service_code, s.provider_code, NULL::text,
         sum(s.net_cost_usd), count(*)::bigint,
         count(*) FILTER (WHERE s.pricing_status <> 'unpriced')::bigint,
         count(*) FILTER (WHERE s.pricing_status =  'unpriced')::bigint,
         count(DISTINCT s.request_id)::bigint,
         sum(s.prompt_tokens)::bigint,
         sum(s.completion_tokens)::bigint,
         sum(s.prompt_tokens + s.completion_tokens)::bigint,
         round(avg(s.prompt_tokens + s.completion_tokens), 1),
         round(avg(s.latency_ms), 0),
         count(*) FILTER (WHERE s.success)::bigint,
         count(*) FILTER (WHERE NOT s.success)::bigint,
         round(100.0 * count(*) FILTER (WHERE s.success)
               / NULLIF(count(*) FILTER (WHERE s.success IS NOT NULL), 0), 2),
         round(sum(s.net_cost_usd) / NULLIF(count(DISTINCT s.request_id), 0), 8),
         round(100.0 * sum(s.net_cost_usd)
               / NULLIF(sum(sum(s.net_cost_usd)) OVER (), 0), 2),
         count(*) FILTER (WHERE s.is_internal)::bigint,
         count(*) FILTER (WHERE NOT s.is_internal)::bigint,
         CASE max(s.price_confidence)
           WHEN 'invoice_verified' THEN 'actual'
           WHEN 'list_price'       THEN 'modeled'
           ELSE NULL
         END
    FROM scoped s GROUP BY s.service_code, s.provider_code
  UNION ALL
  SELECT 'model'::text, s.service_code, s.provider_code, s.model,
         sum(s.net_cost_usd), count(*)::bigint,
         count(*) FILTER (WHERE s.pricing_status <> 'unpriced')::bigint,
         count(*) FILTER (WHERE s.pricing_status =  'unpriced')::bigint,
         count(DISTINCT s.request_id)::bigint,
         sum(s.prompt_tokens)::bigint,
         sum(s.completion_tokens)::bigint,
         sum(s.prompt_tokens + s.completion_tokens)::bigint,
         round(avg(s.prompt_tokens + s.completion_tokens), 1),
         round(avg(s.latency_ms), 0),
         count(*) FILTER (WHERE s.success)::bigint,
         count(*) FILTER (WHERE NOT s.success)::bigint,
         round(100.0 * count(*) FILTER (WHERE s.success)
               / NULLIF(count(*) FILTER (WHERE s.success IS NOT NULL), 0), 2),
         round(sum(s.net_cost_usd) / NULLIF(count(DISTINCT s.request_id), 0), 8),
         round(100.0 * sum(s.net_cost_usd)
               / NULLIF(sum(sum(s.net_cost_usd)) OVER (), 0), 2),
         count(*) FILTER (WHERE s.is_internal)::bigint,
         count(*) FILTER (WHERE NOT s.is_internal)::bigint,
         CASE max(s.price_confidence)
           WHEN 'invoice_verified' THEN 'actual'
           WHEN 'list_price'       THEN 'modeled'
           ELSE NULL
         END
    FROM scoped s GROUP BY s.service_code, s.provider_code, s.model
  ORDER BY 1, 3 NULLS FIRST, 4 NULLS FIRST;
END;
$$;

REVOKE ALL ON FUNCTION public.owner_cost_service_breakdown(text,date,date,boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.owner_cost_service_breakdown(text,date,date,boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.owner_cost_service_breakdown(text,date,date,boolean) TO authenticated;

COMMENT ON FUNCTION public.owner_cost_service_breakdown(text,date,date,boolean) IS
  'Service -> provider -> model cost AND quality for AI Service & Model '
  'Analytics (Phase 6 M4.3, Section 9). Requires role owner. The canonical '
  'service-grain surface — deliberately the only one, so no second overlapping '
  'definition can diverge. p_service_code NULL returns all services; passing a '
  'code behaves exactly as before. Section 9 is a DIAGNOSTIC surface: its panel '
  'passes p_include_internal := true and its numbers never feed an owner_econ_* '
  'business KPI, so INV-25 continues to govern business metrics only. Served '
  'through owner_cost_* because it exposes provider_code and model, which '
  'INV-13/P5-02 forbid in econ. Telemetry is LEFT JOINed from the money record, '
  'so a cost fact whose telemetry was pruned still reports its cost, and its '
  'unknown outcome is excluded from success_rate_pct rather than counted as a '
  'failure. Cost per QUESTION is deliberately absent at this grain: work items '
  'are keyed by service, a question spans models, so the figure is undefined '
  'rather than merely unavailable.';
