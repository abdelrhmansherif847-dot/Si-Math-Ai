-- ===========================================================================
-- Phase 7 M2b — Net Profit & Net Margin (monthly)
-- ===========================================================================
-- STATUS: ⛔ PREPARED, NOT APPLIED. Requires individual owner approval before
--         apply_migration (CLAUDE.md §3). Applied only after the owner approves
--         the M2 engineering review. Depends on M2a.
--
-- DESIGN OF RECORD: docs/roadmap/phase-7-m2-design-document.md §10–§12
--
-- MONTHLY ONLY — AND WHY THERE IS NO DAILY VERSION (owner ruling ⑤)
--   Revenue is daily (383 distinct days). AI cost is per-call (3 days).
--   Platform cost is MONTHLY by definition. Placing a monthly invoice on a day
--   requires choosing an allocation rule — equal per day, revenue-weighted, or
--   AI-cost-weighted — and every one of them silently asserts something untrue.
--   Weighting by AI cost claims platform spend scales with usage; it does not,
--   which is exactly why §9.4 puts it outside the Cost Engine.
--
--   Each rule is a modelling choice, none is a measurement, so a daily net
--   profit would be an artefact of whichever rule was picked. INV-26 forbids
--   that. Where data is not measured daily, no daily measurement is invented.
--
--   econ.v_pnl_daily is therefore NOT touched by this migration. It keeps its
--   11 columns, its types and its values exactly.
--
-- WHY A SIBLING RESOLVER, NOT AN EXTENDED block_reason() (owner decision D1)
--   econ.block_reason() is called by four surfaces — v_pnl_daily,
--   v_breakeven_inputs, owner_econ_pnl and owner_econ_pnl_summary. Adding a
--   parameter would force every one of them to be re-verified to serve a single
--   new consumer. econ.net_block_reason() has ZERO blast radius, keeps gross
--   and net blocking visibly distinct as §9.4 requires, and COMPOSES rather
--   than duplicates: it calls block_reason() first and only adds the reasons
--   that function cannot express.
--
-- FX — MONTH-OF-OCCURRENCE, THE ENGINE'S OWN POLICY (§8.7)
--   cost_engine.run_pricing resolves FX with
--     WHERE fx.rate_date = date_trunc('month', occurred_at)::date
--   so fx_rates.rate_date is already a first-of-month key. period_month is too,
--   making the join exact. No new FX policy is invented here.
--
--   NO PARTIAL CONVERSION (owner ruling ④). If ANY current entry in a month is
--   USD with no rate covering that month, platform_cost_egp for that month is
--   NULL and net profit is BLOCKED. A partially converted total would be a
--   number that looks complete and is not — the same failure the M1 reprice
--   defect exhibits.
--
--   CONSEQUENCE, DELIBERATE: with cost_engine.fx_rates empty, net profit stays
--   blocked on every month even after this table is fully populated. That is
--   correct behaviour, not a bug, and owner ruling ④ confirmed it twice.
--
-- ROLLBACK
--   CREATE OR REPLACE VIEW econ.v_breakeven_inputs AS <prior 8-column body>;
--   DROP FUNCTION public.owner_econ_net_profit_series(date,date);
--   DROP FUNCTION public.owner_econ_net_profit_summary(date,date);
--   DROP FUNCTION econ.net_block_reason(numeric,numeric,numeric,numeric,bigint,bigint);
--   The prior view body changes no column types, so CREATE OR REPLACE suffices
--   in both directions — no DROP VIEW is required and no dependent breaks.
-- ===========================================================================

-- ── 1. The sibling block resolver (owner decision D1) ─────────────────────
CREATE OR REPLACE FUNCTION econ.net_block_reason(
  p_revenue_egp        numeric,
  p_ai_cost_usd        numeric,
  p_ai_cost_egp        numeric,
  p_platform_cost_egp  numeric,
  p_entries_in_period  bigint,
  p_unconvertible      bigint
)
RETURNS text
LANGUAGE sql
STABLE
SET search_path = econ, public
AS $$
  SELECT CASE
    -- 1. Net inherits every reason gross is blocked for. Composed, not copied.
    WHEN econ.block_reason(p_revenue_egp, p_ai_cost_usd, p_ai_cost_egp) IS NOT NULL
      THEN econ.block_reason(p_revenue_egp, p_ai_cost_usd, p_ai_cost_egp)
    -- 2. No table, or no current entry anywhere.
    WHEN NOT econ.platform_cost_available()
      THEN 'no_platform_cost_source'
    -- 3. Entries exist, but none for this month.
    WHEN COALESCE(p_entries_in_period, 0) = 0
      THEN 'no_platform_cost_in_period'
    -- 4. Entries exist for this month but at least one cannot be converted.
    WHEN COALESCE(p_unconvertible, 0) > 0
      THEN 'no_fx_for_platform_cost'
    -- 5. Defensive: a NULL total with no named cause must still block, never
    --    silently become zero (INV-23).
    WHEN p_platform_cost_egp IS NULL
      THEN 'no_platform_cost_in_period'
    ELSE NULL
  END;
$$;

COMMENT ON FUNCTION econ.net_block_reason(numeric,numeric,numeric,numeric,bigint,bigint) IS
  'Why NET profit is blocked for a period. Composes econ.block_reason() — net '
  'inherits every gross reason — then adds the platform-cost reasons that '
  'function cannot express. A sibling rather than an extension so the four '
  'existing block_reason() callers are untouched (owner decision D1).';

-- ── 2. Extend econ.v_breakeven_inputs ─────────────────────────────────────
-- STRICTLY ADDITIVE with one qualification the owner accepted (decision D6):
-- columns 1-8 keep their names, types and order; platform_cost_egp changes from
-- a hardcoded NULL::numeric to a real value, but ONLY once current entries
-- exist. That value change is the purpose of Phase 7, not a breaking change.
-- Four columns are appended. block_reason and confidence keep their exact
-- current meaning — gross stays separately labelled and separately blocked,
-- because §9.4 forbids silently reporting gross as net.
CREATE OR REPLACE VIEW econ.v_breakeven_inputs AS
WITH m AS (
  SELECT date_trunc('month', p.pnl_on::timestamptz)::date AS month,
         sum(p.revenue_net_egp)                           AS revenue_egp,
         sum(p.cost_usd)                                  AS ai_cost_usd,
         sum(p.cost_egp)                                  AS ai_cost_egp,
         econ.worst_confidence(VARIADIC array_agg(p.confidence)) AS confidence
    FROM econ.v_pnl_daily p
   GROUP BY date_trunc('month', p.pnl_on::timestamptz)::date
),
-- Current platform entries only. Reading the view, never the table, is the
-- structural guard against double-counting superseded revisions.
plat AS (
  SELECT c.period_month,
         count(*)::bigint AS entries_in_period,
         count(*) FILTER (
           WHERE c.currency = 'USD' AND fx.usd_to_egp IS NULL
         )::bigint        AS unconvertible,
         -- NO PARTIAL CONVERSION: if any row is unconvertible the whole month's
         -- total is NULL, because sum() would otherwise quietly omit it and
         -- return a smaller number that looks complete.
         CASE WHEN count(*) FILTER (WHERE c.currency = 'USD' AND fx.usd_to_egp IS NULL) > 0
              THEN NULL::numeric
              ELSE sum(CASE WHEN c.currency = 'EGP' THEN c.amount
                            ELSE c.amount * fx.usd_to_egp END)
         END              AS platform_cost_egp
    FROM econ.v_platform_costs_current c
    LEFT JOIN cost_engine.fx_rates fx
           ON fx.rate_date = c.period_month     -- §8.7 month-of-occurrence
   GROUP BY c.period_month
)
SELECT m.month,
       m.revenue_egp,
       m.ai_cost_usd,
       m.ai_cost_egp,
       p.platform_cost_egp,
       COALESCE(
         econ.block_reason(m.revenue_egp, m.ai_cost_usd, m.ai_cost_egp),
         CASE WHEN NOT econ.platform_cost_available()
              THEN 'no_platform_cost_source' ELSE NULL END
       ) AS block_reason,
       NULL::numeric AS breakeven_questions,
       CASE WHEN COALESCE(
                   econ.block_reason(m.revenue_egp, m.ai_cost_usd, m.ai_cost_egp),
                   CASE WHEN NOT econ.platform_cost_available()
                        THEN 'no_platform_cost_source' ELSE NULL END
                 ) IS NOT NULL
            THEN econ.worst_confidence(VARIADIC ARRAY[NULL::text])
            ELSE m.confidence
       END AS confidence,
       -- ── appended by Phase 7 M2b ──────────────────────────────────────────
       CASE WHEN econ.net_block_reason(m.revenue_egp, m.ai_cost_usd, m.ai_cost_egp,
                                       p.platform_cost_egp,
                                       p.entries_in_period, p.unconvertible) IS NULL
            THEN round(m.revenue_egp - m.ai_cost_egp - p.platform_cost_egp, 4)
            ELSE NULL::numeric
       END AS net_profit_egp,
       -- Margin is undefined at zero revenue: NULL with a reason, never 0
       -- (INV-23). It also can never be assembled from daily margins (M2).
       CASE WHEN econ.net_block_reason(m.revenue_egp, m.ai_cost_usd, m.ai_cost_egp,
                                       p.platform_cost_egp,
                                       p.entries_in_period, p.unconvertible) IS NULL
            THEN round(100.0 * (m.revenue_egp - m.ai_cost_egp - p.platform_cost_egp)
                       / NULLIF(m.revenue_egp, 0), 2)
            ELSE NULL::numeric
       END AS net_margin_pct,
       econ.net_block_reason(m.revenue_egp, m.ai_cost_usd, m.ai_cost_egp,
                             p.platform_cost_egp,
                             p.entries_in_period, p.unconvertible) AS net_block_reason,
       CASE WHEN econ.net_block_reason(m.revenue_egp, m.ai_cost_usd, m.ai_cost_egp,
                                       p.platform_cost_egp,
                                       p.entries_in_period, p.unconvertible) IS NOT NULL
            THEN econ.worst_confidence(VARIADIC ARRAY[NULL::text])
            -- an owner-entered invoice figure is 'actual'; INV-27 means net can
            -- never be more confident than its worst contributing input
            ELSE econ.worst_confidence(VARIADIC ARRAY[m.confidence, 'actual'])
       END AS net_confidence
  FROM m
  LEFT JOIN plat p ON p.period_month = m.month;

-- ── 3. Net profit SERIES — one row per month (owner decision D5) ──────────
CREATE OR REPLACE FUNCTION public.owner_econ_net_profit_series(
  p_from date DEFAULT NULL,
  p_to   date DEFAULT NULL
)
RETURNS TABLE (
  month             date,
  revenue_egp       numeric,
  ai_cost_egp       numeric,
  platform_cost_egp numeric,
  net_profit_egp    numeric,
  net_margin_pct    numeric,
  net_block_reason  text,
  net_confidence    text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, econ
AS $$
BEGIN
  IF NOT COALESCE(public.has_role_at_least('owner'::public.user_role), false) THEN
    RAISE EXCEPTION 'forbidden: owner_econ_net_profit_series requires role owner'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT b.month, b.revenue_egp, b.ai_cost_egp, b.platform_cost_egp,
         b.net_profit_egp, b.net_margin_pct, b.net_block_reason, b.net_confidence
    FROM econ.v_breakeven_inputs b
   WHERE (p_from IS NULL OR b.month >= date_trunc('month', p_from)::date)
     AND (p_to   IS NULL OR b.month <= date_trunc('month', p_to)::date)
   ORDER BY b.month;
END;
$$;

REVOKE ALL ON FUNCTION public.owner_econ_net_profit_series(date,date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.owner_econ_net_profit_series(date,date) FROM anon;
GRANT EXECUTE ON FUNCTION public.owner_econ_net_profit_series(date,date) TO authenticated;

COMMENT ON FUNCTION public.owner_econ_net_profit_series(date,date) IS
  'Monthly net profit and net margin series. Requires role owner. Monthly by '
  'necessity: platform cost has no daily grain and is never allocated across '
  'days (owner ruling ⑤).';

-- ── 4. Net profit SUMMARY — exactly one row (owner decision D5) ───────────
-- Two explicit RPCs rather than one with a grain parameter (owner decision D5).
--
-- The summary is NOT the series aggregated in the client. M2 established the
-- rule: a period margin is not the sum, mean, or any elementwise combination of
-- monthly margins — it can only be computed from period TOTALS. Blocking is
-- resolved from those same totals, so a period blocks for the same reasons a
-- month does.
CREATE OR REPLACE FUNCTION public.owner_econ_net_profit_summary(
  p_from date DEFAULT NULL,
  p_to   date DEFAULT NULL
)
RETURNS TABLE (
  months_covered    bigint,
  revenue_egp       numeric,
  ai_cost_usd       numeric,
  ai_cost_egp       numeric,
  platform_cost_egp numeric,
  net_profit_egp    numeric,
  net_margin_pct    numeric,
  net_block_reason  text,
  net_confidence    text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, econ
AS $$
BEGIN
  IF NOT COALESCE(public.has_role_at_least('owner'::public.user_role), false) THEN
    RAISE EXCEPTION 'forbidden: owner_econ_net_profit_summary requires role owner'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH scoped AS (
    SELECT * FROM econ.v_breakeven_inputs b
     WHERE (p_from IS NULL OR b.month >= date_trunc('month', p_from)::date)
       AND (p_to   IS NULL OR b.month <= date_trunc('month', p_to)::date)
  ),
  t AS (
    SELECT count(*)::bigint                       AS months_covered,
           sum(s.revenue_egp)                     AS revenue_egp,
           sum(s.ai_cost_usd)                     AS ai_cost_usd,
           sum(s.ai_cost_egp)                     AS ai_cost_egp,
           sum(s.platform_cost_egp)               AS platform_cost_egp,
           -- a period is blocked if ANY month in it is blocked; the worst
           -- reason is reported rather than an arbitrary one
           count(*) FILTER (WHERE s.net_block_reason IS NOT NULL)::bigint AS blocked_months,
           min(s.net_block_reason)                AS a_block_reason,
           econ.worst_confidence(VARIADIC array_agg(s.net_confidence)) AS net_confidence
      FROM scoped s
  )
  SELECT t.months_covered, t.revenue_egp, t.ai_cost_usd, t.ai_cost_egp,
         t.platform_cost_egp,
         CASE WHEN t.blocked_months = 0
              THEN round(t.revenue_egp - t.ai_cost_egp - t.platform_cost_egp, 4)
              ELSE NULL::numeric END,
         CASE WHEN t.blocked_months = 0
              THEN round(100.0 * (t.revenue_egp - t.ai_cost_egp - t.platform_cost_egp)
                         / NULLIF(t.revenue_egp, 0), 2)
              ELSE NULL::numeric END,
         CASE WHEN t.months_covered = 0 THEN 'no_months_in_period'
              WHEN t.blocked_months > 0 THEN t.a_block_reason
              ELSE NULL END,
         t.net_confidence
    FROM t;
END;
$$;

REVOKE ALL ON FUNCTION public.owner_econ_net_profit_summary(date,date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.owner_econ_net_profit_summary(date,date) FROM anon;
GRANT EXECUTE ON FUNCTION public.owner_econ_net_profit_summary(date,date) TO authenticated;

COMMENT ON FUNCTION public.owner_econ_net_profit_summary(date,date) IS
  'Period net profit and net margin as exactly one row. Requires role owner. '
  'Computed from period TOTALS, never by aggregating monthly margins — a period '
  'margin is not any elementwise combination of monthly margins. A period is '
  'blocked if any month within it is blocked.';
