-- ===========================================================================
-- Phase 5 defect fix — RPC count columns declared bigint, body yields numeric
-- ===========================================================================
-- Owner-approved 2026-08-01 (CLAUDE.md §3), following the M2 Release Gate
-- failure at V7.
--
-- THE DEFECT
--   Three owner RPCs declare a count column as `bigint`, but the view feeding
--   them produces `numeric`.
--
--   The mechanism is PostgreSQL's sum() return types, which are NOT uniform:
--
--     sum(smallint) -> bigint     sum(bigint)  -> numeric
--     sum(integer)  -> bigint     sum(numeric) -> numeric
--
--   A count starts life as count(*), which is bigint. Summing it therefore
--   crosses the bigint -> numeric boundary, and the aggregate widens:
--
--     cost_engine.v_cost_by_service : count(*)      AS calls     -> bigint
--     econ.v_service_economics      : sum(s.calls)  AS calls     -> NUMERIC
--     econ.v_package_economics      : sum(work_items) AS questions -> NUMERIC
--     econ.v_student_economics      : sum(work_items) AS questions -> NUMERIC
--
--   (It is specifically sum-of-a-count that widens. A sum over a plain
--   integer column stays bigint and would not have tripped this.)
--
--   PostgreSQL accepts a RETURN QUERY row-type mismatch at CREATE time and
--   raises only at EXECUTION:
--
--     ERROR: 42804: structure of query does not match function result type
--     DETAIL: Returned type numeric does not match expected type bigint
--
--   So all three functions have been un-callable since Phase 5 was applied
--   (293e10a, 2026-07-31) while appearing healthy to every static check. This
--   is the same latent-defect class as the owner_cost_metrics ambiguity bug in
--   Phase 4: only a real invocation surfaces it.
--
--   It went unnoticed because nothing called them. scripts/verify-economics.sql
--   tests the VIEWS, and P5-04/P5-05 test function METADATA — volatility,
--   SECURITY DEFINER, the owner gate, grants — but no check ever invoked an
--   RPC. Phase 6 M1 wired up only owner_econ_coverage(). M2's AI Cost
--   Analytics panel is the first consumer ever to call
--   owner_econ_service_economics(), which is how the gate caught it.
--
--   scripts/verify-economics.sql gains P5-17 in the same change: a smoke test
--   that EXECUTES every owner_econ_* RPC, so this class cannot escape again.
--
-- THE FIX
--   Cast to bigint in the function body. A sum of counts IS a count, so bigint
--   is the honest published type and the cast is exact — these values can
--   never carry a fractional part.
--
--   Casting in the body rather than widening the declaration to numeric keeps
--   each signature byte-identical, so CREATE OR REPLACE suffices: no DROP, no
--   contract change, no grant churn. (Widening would have required DROP
--   FUNCTION, since CREATE OR REPLACE cannot change a RETURNS TABLE type.)
--
--   Nothing else changes. Same gate, same search_path, same volatility, same
--   ordering, same projection — one cast per function.
--
-- SAFETY
--   No table, no data, no view, no index, no grant. Three function bodies.
--   No consumer can regress: none of the three has ever returned a row.
--
-- ROLLBACK
--   Re-apply the Phase 5 definitions of these three functions from
--   20260731_aiecon_p5_economics.sql. (That restores the defect, so rollback
--   is only meaningful as part of a full Phase 5 revert.)
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.owner_econ_service_economics(
  p_from date DEFAULT NULL::date,
  p_to   date DEFAULT NULL::date
)
RETURNS TABLE (
  service_code       text,
  display_name       text,
  category           text,
  cost_usd           numeric,
  cost_egp           numeric,
  calls              bigint,
  units              numeric,
  cost_share_pct     numeric,
  monthly_budget_usd numeric,
  confidence         text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, econ, cost_engine, ai_catalog
AS $$
BEGIN
  IF NOT COALESCE(public.has_role_at_least('owner'::public.user_role), false) THEN
    RAISE EXCEPTION 'forbidden: owner_econ_service_economics requires role owner' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT v.service_code, v.display_name, v.category, v.cost_usd, v.cost_egp,
         v.calls::bigint,   -- sum() yields numeric; a call count is an integer
         v.units, v.cost_share_pct, v.monthly_budget_usd, v.confidence
    FROM econ.v_service_economics v
   WHERE (p_from IS NULL OR v.last_seen  >= p_from)
     AND (p_to   IS NULL OR v.first_seen <= p_to)
   ORDER BY v.cost_usd DESC NULLS LAST;
END;
$$;

CREATE OR REPLACE FUNCTION public.owner_econ_package_economics()
RETURNS TABLE (
  plan_code       text,
  revenue_egp     numeric,
  revenue_net_egp numeric,
  cost_usd        numeric,
  cost_egp        numeric,
  questions       bigint,
  profit_egp      numeric,
  margin_pct      numeric,
  block_reason    text,
  confidence      text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, econ, cost_engine, ai_catalog
AS $$
BEGIN
  IF NOT COALESCE(public.has_role_at_least('owner'::public.user_role), false) THEN
    RAISE EXCEPTION 'forbidden: owner_econ_package_economics requires role owner' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT v.plan_code, v.revenue_egp, v.revenue_net_egp, v.cost_usd, v.cost_egp,
         v.questions::bigint,   -- sum() yields numeric; a work-item count is an integer
         v.profit_egp, v.margin_pct, v.block_reason, v.confidence
    FROM econ.v_package_economics v
   ORDER BY v.revenue_egp DESC NULLS LAST, v.plan_code;
END;
$$;

CREATE OR REPLACE FUNCTION public.owner_econ_student_economics(
  p_limit integer DEFAULT 100
)
RETURNS TABLE (
  user_id              uuid,
  revenue_egp          numeric,
  cost_usd             numeric,
  cost_egp             numeric,
  questions            bigint,
  cost_completeness    text,
  profit_egp           numeric,
  cost_exceeds_revenue boolean,
  block_reason         text,
  confidence           text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, econ, cost_engine, ai_catalog
AS $$
BEGIN
  IF NOT COALESCE(public.has_role_at_least('owner'::public.user_role), false) THEN
    RAISE EXCEPTION 'forbidden: owner_econ_student_economics requires role owner' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT v.user_id, v.revenue_egp, v.cost_usd, v.cost_egp,
         v.questions::bigint,   -- sum() yields numeric; a work-item count is an integer
         v.cost_completeness, v.profit_egp, v.cost_exceeds_revenue,
         v.block_reason, v.confidence
    FROM econ.v_student_economics v
   ORDER BY v.cost_usd DESC NULLS LAST, v.revenue_egp DESC NULLS LAST
   LIMIT COALESCE(p_limit, 100);
END;
$$;
