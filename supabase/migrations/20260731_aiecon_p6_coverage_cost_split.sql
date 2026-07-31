-- ===========================================================================
-- Phase 6 M1 — expose the AI Cost split on the coverage board
-- ===========================================================================
-- STATUS: PREPARED, NOT APPLIED. Requires owner approval (CLAUDE.md §3).
--
-- WHY THIS EXISTS (the "new evidence" the M1 scope allows for)
--   The locked Phase 6 presentation decision (2026-07-31,
--   docs/roadmap/phase-6-coverage-scope-decision.md) requires the AI Cost
--   panel to render THREE numeric figures:
--
--       External:                                   $X
--       Internal (excluded from business metrics):  $Y
--       Total Observed:                             $Z
--
--   econ.v_coverage exposes none of them. It returns (metric, state, detail)
--   where `detail` is prose — 'USD 0.22961425'. There is no split anywhere in
--   the published surface.
--
--   The two alternatives were both rejected:
--     • Parsing the prose string in JavaScript — fragile, and the rendered
--       number would not trace to a typed column.
--     • Computing Internal = Total − External in the dashboard — this derives
--       a displayed figure by arithmetic the engine never returned, which
--       INV-03 forbids ("no cost arithmetic beyond display formatting") and
--       which fails the §14 Phase 6 exit criterion that every rendered number
--       trace to a named engine or econ view.
--
--   So the split has to come from the view. This is the minimal change that
--   provides it.
--
-- WHAT CHANGES
--   econ.v_coverage gains three APPENDED numeric columns. (metric, state,
--   detail) keep their position, type and meaning exactly.
--   public.owner_econ_coverage() returns them too. Nothing consumes that RPC
--   yet — Phase 6 M1 is its first consumer — so no contract is broken.
--
--   No new table. No new RPC. No data change. No behavioural change to any
--   metric: this is a diagnostic surface only (INV-25 governs metrics, and
--   the internal figure is explanatory metadata, never a KPI).
--
-- ROLLBACK
--   Re-apply the Phase 5 definitions of econ.v_coverage and
--   public.owner_econ_coverage() from 20260731_aiecon_p5_economics.sql.
-- ===========================================================================

DROP VIEW IF EXISTS econ.v_coverage;

CREATE VIEW econ.v_coverage AS
  SELECT 'revenue'::text AS metric, 'available'::text AS state,
         (SELECT count(*)::text FROM econ.v_revenue_events) || ' revenue events; EGP '
         || COALESCE((SELECT round(sum(net_amount_egp),2)::text FROM econ.v_revenue_events),'0') AS detail,
         NULL::numeric AS value_external,
         NULL::numeric AS value_internal,
         NULL::numeric AS value_total
  UNION ALL
  -- The AI Cost row is the one that carries the split. External leads because
  -- it is the figure business metrics consume; internal is explanatory
  -- metadata; total is a reconciliation line (locked decision, rules 1-3).
  SELECT 'ai_cost', 'available',
         COALESCE((SELECT 'USD ' || round(sum(total_cost_usd),8)::text
                     FROM cost_engine.v_cost_daily), 'no cost facts'),
         COALESCE((SELECT sum(total_cost_usd) FROM cost_engine.v_cost_daily
                    WHERE NOT is_internal), 0),
         COALESCE((SELECT sum(total_cost_usd) FROM cost_engine.v_cost_daily
                    WHERE is_internal), 0),
         COALESCE((SELECT sum(total_cost_usd) FROM cost_engine.v_cost_daily), 0)
  UNION ALL
  SELECT 'currency_bridge',
         CASE WHEN EXISTS (SELECT 1 FROM cost_engine.v_cost_daily
                            WHERE total_cost_usd IS NOT NULL AND total_cost_egp IS NULL)
              THEN 'blocked' ELSE 'available' END,
         CASE WHEN EXISTS (SELECT 1 FROM cost_engine.v_cost_daily
                            WHERE total_cost_usd IS NOT NULL AND total_cost_egp IS NULL)
              THEN 'cost has no EGP figure: no FX rate covers its month. '
                   'Revenue is EGP-only, so profit cannot be computed in any currency.'
              ELSE 'cost carries EGP; revenue and cost are comparable' END,
         NULL, NULL, NULL
  UNION ALL
  SELECT 'revenue_cost_overlap',
         CASE WHEN EXISTS (SELECT 1 FROM econ.v_pnl_daily
                            WHERE revenue_egp IS NOT NULL AND cost_usd IS NOT NULL)
              THEN 'available' ELSE 'blocked' END,
         CASE WHEN EXISTS (SELECT 1 FROM econ.v_pnl_daily
                            WHERE revenue_egp IS NOT NULL AND cost_usd IS NOT NULL)
              THEN 'at least one day has both revenue and cost'
              ELSE 'no day has both revenue and cost — every P&L figure is blocked' END,
         NULL, NULL, NULL
  UNION ALL
  SELECT 'platform_costs', 'blocked',
         'no source table for platform spend (§9.4); net profit and break-even '
         'cannot be computed',
         NULL, NULL, NULL
  UNION ALL
  SELECT 'price_confidence',
         -- max(), not min(): 'invoice_verified' < 'list_price' alphabetically,
         -- so min() would report the BEST card and overstate the whole book.
         econ.cost_confidence(
           (SELECT max(price_confidence) FROM cost_engine.v_cost_daily)),
         CASE WHEN EXISTS (SELECT 1 FROM cost_engine.v_cost_daily WHERE price_confidence <> 'invoice_verified')
              THEN 'some cost rests on unverified list prices — every derived '
                   'figure is modeled (INV-27)'
              ELSE 'all cost is invoice-verified' END,
         NULL, NULL, NULL;

-- DROP first: CREATE OR REPLACE FUNCTION cannot widen a RETURNS TABLE
-- ("cannot change return type of existing function"). Without this the view
-- gains the split, the RPC silently keeps its 3-column shape, and the
-- dashboard renders the old row — a migration that appears to succeed while
-- delivering half the change.
DROP FUNCTION IF EXISTS public.owner_econ_coverage();

CREATE FUNCTION public.owner_econ_coverage()
RETURNS TABLE (
  metric         text,
  state          text,
  detail         text,
  value_external numeric,
  value_internal numeric,
  value_total    numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, econ, cost_engine, ai_catalog
AS $$
BEGIN
  IF NOT COALESCE(public.has_role_at_least('owner'::public.user_role), false) THEN
    RAISE EXCEPTION 'forbidden: owner_econ_coverage requires role owner' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT v.metric, v.state, v.detail, v.value_external, v.value_internal, v.value_total
    FROM econ.v_coverage v ORDER BY v.metric;
END;
$$;

REVOKE ALL ON FUNCTION public.owner_econ_coverage() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.owner_econ_coverage() FROM anon;
GRANT EXECUTE ON FUNCTION public.owner_econ_coverage() TO authenticated;

GRANT SELECT ON econ.v_coverage TO service_role;

COMMENT ON VIEW econ.v_coverage IS
  'Diagnostic surface (Phase 6 presentation decision, 2026-07-31). Reports ALL '
  'observed data, unlike business metrics which exclude internal traffic '
  '(INV-25). The ai_cost row carries value_external / value_internal / '
  'value_total; external is the primary figure, internal is explanatory '
  'metadata and never a KPI. Other rows leave the numeric columns NULL.';
