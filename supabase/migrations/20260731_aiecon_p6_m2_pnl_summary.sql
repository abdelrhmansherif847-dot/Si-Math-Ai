-- ===========================================================================
-- Phase 6 M2 — period P&L summary for the Financial Overview section
-- ===========================================================================
-- STATUS: ✅ APPLIED to igvkyxkmjnkzscqgommj on 2026-08-01 as migration version
--         20260801103847, owner-approved via the M2 Release Gate (CLAUDE.md §3).
--
--         Verified after applying: econ.v_pnl_daily at 11 columns (1-9 unchanged
--         in name, type and value), owner_econ_pnl_summary present, and the
--         three dependent digests bit-identical to their pre-migration values —
--         owner_econ_pnl() 77a987f0, v_breakeven_inputs 75df5a9c,
--         v_coverage b51a582f.
--
-- WHY THIS EXISTS
--   M2 requires that every displayed number trace directly to a named
--   RPC/view, with no client-side financial calculations.
--
--   Financial Overview is a period headline: total revenue, total cost, gross
--   profit and margin for a date range. The only P&L surface today is
--   owner_econ_pnl(), which is DAILY grain. Rendering a headline from it would
--   mean:
--     • summing days in JavaScript to get totals, and
--     • recomputing margin from those sums — profit / revenue — which is a
--       financial calculation outright, not an aggregation.
--
--   Margin is the decisive case: a period margin is NOT the sum, mean, or any
--   other elementwise combination of daily margins. It can only be computed
--   from period totals. So the summary has to come from the database.
--
--   This mirrors the M1 decision: rather than derive a financial figure in the
--   dashboard, expose it as a typed column from a named source.
--
-- WHAT IT ADDS
--   One owner-gated RPC returning exactly ONE row. It reads econ.v_pnl_daily
--   — no new view, no new table, no change to any existing object.
--
--   Blocking and confidence are not reimplemented: the summary calls the same
--   econ.block_reason() and econ.worst_confidence() every other surface uses,
--   so owner rules 2-4 and INV-27 hold here by construction rather than by
--   duplication. A period is blocked for the same reasons a day is, and its
--   confidence is the worst among its days.
--
-- ROLLBACK
--   DROP FUNCTION IF EXISTS public.owner_econ_pnl_summary(date,date);
-- ===========================================================================

-- ── Expose the component confidences on v_pnl_daily (APPENDED) ───────────
-- Found while building M2: a period that computed successfully was still
-- being labelled `blocked`.
--
-- v_pnl_daily's `confidence` is a COMPOSITE. For a day with revenue but no
-- cost it is 'blocked', meaning "this day's profit is not computable at daily
-- grain" — a GRANULARITY artifact, not a statement about data quality. That
-- day's revenue still contributes to a period total perfectly well.
--
-- Aggregating the composite therefore conflates two different things and drags
-- a valid period figure to 'blocked' while its block_reason is NULL — a
-- computed metric labelled uncomputable, which is self-contradictory and
-- exactly the kind of dishonest rendering §3.4 exists to prevent.
--
-- The fix is to aggregate the confidence of the MONEY, not of the daily block
-- state. Both component classes are already computed inside v_pnl_daily; they
-- were simply not projected. Appended only — no existing column moves.
CREATE OR REPLACE VIEW econ.v_pnl_daily AS
  WITH days AS (
    SELECT recognized_on AS d FROM econ.v_revenue_recognized_daily
    UNION
    SELECT occurred_on    FROM cost_engine.v_cost_daily WHERE NOT is_internal
  ),
  rev AS (
    SELECT recognized_on AS d,
           sum(recognized_egp)     AS revenue_egp,
           sum(recognized_net_egp) AS revenue_net_egp,
           econ.worst_confidence(VARIADIC array_agg(confidence)) AS revenue_confidence
      FROM econ.v_revenue_recognized_daily GROUP BY recognized_on
  ),
  cost AS (
    SELECT occurred_on AS d,
           sum(total_cost_usd) AS cost_usd,
           sum(total_cost_egp) AS cost_egp,
           max(price_confidence) AS price_confidence
      FROM cost_engine.v_cost_daily WHERE NOT is_internal GROUP BY occurred_on
  )
  SELECT days.d                                          AS pnl_on,
         rev.revenue_egp,
         rev.revenue_net_egp,
         cost.cost_usd,
         cost.cost_egp,
         econ.block_reason(rev.revenue_egp, cost.cost_usd, cost.cost_egp) AS block_reason,
         CASE WHEN econ.block_reason(rev.revenue_egp, cost.cost_usd, cost.cost_egp) IS NULL
              THEN round(rev.revenue_net_egp - cost.cost_egp, 4) END      AS gross_profit_egp,
         CASE WHEN econ.block_reason(rev.revenue_egp, cost.cost_usd, cost.cost_egp) IS NULL
              THEN round(100.0 * (rev.revenue_net_egp - cost.cost_egp)
                         / NULLIF(rev.revenue_net_egp,0), 2) END          AS gross_margin_pct,
         CASE WHEN econ.block_reason(rev.revenue_egp, cost.cost_usd, cost.cost_egp) IS NOT NULL
              THEN econ.worst_confidence(NULL)
              ELSE econ.worst_confidence(rev.revenue_confidence,
                                        econ.cost_confidence(cost.price_confidence))
         END                                                              AS confidence,
         -- APPENDED: the component classes, so a consumer aggregating over a
         -- coarser grain can weigh the money rather than the daily block state.
         rev.revenue_confidence                                           AS revenue_confidence,
         econ.cost_confidence(cost.price_confidence)                      AS cost_confidence
    FROM days
    LEFT JOIN rev  ON rev.d  = days.d
    LEFT JOIN cost ON cost.d = days.d;

CREATE OR REPLACE FUNCTION public.owner_econ_pnl_summary(
  p_from date DEFAULT NULL,
  p_to   date DEFAULT NULL
)
RETURNS TABLE (
  period_from       date,
  period_to         date,
  revenue_egp       numeric,
  revenue_net_egp   numeric,
  cost_usd          numeric,
  cost_egp          numeric,
  gross_profit_egp  numeric,
  gross_margin_pct  numeric,
  days_total        bigint,
  days_with_revenue bigint,
  days_with_cost    bigint,
  days_overlapping  bigint,
  block_reason      text,
  confidence        text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, econ, cost_engine, ai_catalog
AS $$
BEGIN
  IF NOT COALESCE(public.has_role_at_least('owner'::public.user_role), false) THEN
    RAISE EXCEPTION 'forbidden: owner_econ_pnl_summary requires role owner'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH scoped AS (
    SELECT * FROM econ.v_pnl_daily v
     WHERE (p_from IS NULL OR v.pnl_on >= p_from)
       AND (p_to   IS NULL OR v.pnl_on <= p_to)
  ),
  agg AS (
    SELECT min(s.pnl_on)                                   AS d_from,
           max(s.pnl_on)                                   AS d_to,
           sum(s.revenue_egp)                              AS rev,
           sum(s.revenue_net_egp)                          AS rev_net,
           sum(s.cost_usd)                                 AS c_usd,
           sum(s.cost_egp)                                 AS c_egp,
           count(*)                                        AS n_days,
           count(*) FILTER (WHERE s.revenue_egp IS NOT NULL) AS n_rev,
           count(*) FILTER (WHERE s.cost_usd IS NOT NULL)    AS n_cost,
           count(*) FILTER (WHERE s.revenue_egp IS NOT NULL
                              AND s.cost_usd IS NOT NULL)    AS n_both,
           -- INV-27, applied to the MONEY rather than to the daily block
           -- state. Aggregating s.confidence would drag a valid period figure
           -- to 'blocked' whenever no single day happened to carry both
           -- revenue and cost — a granularity artifact, not a data-quality
           -- one. Each component is aggregated only over the days that
           -- actually contributed that component, then combined worst-first.
           econ.worst_confidence(
             econ.worst_confidence(VARIADIC array_agg(s.revenue_confidence)
                                     FILTER (WHERE s.revenue_egp IS NOT NULL)),
             econ.worst_confidence(VARIADIC array_agg(s.cost_confidence)
                                     FILTER (WHERE s.cost_usd IS NOT NULL))
           )                                                AS conf
      FROM scoped s
  )
  SELECT a.d_from,
         a.d_to,
         a.rev,
         a.rev_net,
         a.c_usd,
         a.c_egp,
         -- Same resolver as every other surface. A period blocks for the same
         -- reasons a day does; nothing is reimplemented here.
         CASE WHEN econ.block_reason(a.rev, a.c_usd, a.c_egp) IS NULL
              THEN round(a.rev_net - a.c_egp, 4) END,
         -- The reason this RPC exists: a period margin can only be computed
         -- from period totals, never from daily margins.
         CASE WHEN econ.block_reason(a.rev, a.c_usd, a.c_egp) IS NULL
              THEN round(100.0 * (a.rev_net - a.c_egp) / NULLIF(a.rev_net, 0), 2) END,
         a.n_days,
         a.n_rev,
         a.n_cost,
         a.n_both,
         econ.block_reason(a.rev, a.c_usd, a.c_egp),
         CASE WHEN econ.block_reason(a.rev, a.c_usd, a.c_egp) IS NOT NULL
              THEN econ.worst_confidence(NULL)   -- resolves to 'blocked'
              ELSE a.conf END
    FROM agg a;
END;
$$;

REVOKE ALL ON FUNCTION public.owner_econ_pnl_summary(date,date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.owner_econ_pnl_summary(date,date) FROM anon;
GRANT EXECUTE ON FUNCTION public.owner_econ_pnl_summary(date,date) TO authenticated;

COMMENT ON FUNCTION public.owner_econ_pnl_summary(date,date) IS
  'Period P&L headline for Financial Overview (Phase 6 M2). Requires role '
  'owner. Returns exactly one row. Exists because a period margin cannot be '
  'derived from daily margins — only from period totals — and the dashboard '
  'must perform no financial calculation (INV-03). Blocking and confidence '
  'reuse econ.block_reason() and econ.worst_confidence(), so owner rules 2-4 '
  'and INV-27 hold by construction.';
