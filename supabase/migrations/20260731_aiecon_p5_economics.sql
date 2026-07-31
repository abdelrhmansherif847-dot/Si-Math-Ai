-- ===========================================================================
-- AI Economics — Phase 5: the `econ` analytics layer
-- ===========================================================================
-- STATUS: PREPARED, NOT APPLIED. Requires individual owner approval before
--         apply_migration (CLAUDE.md §3).
--
-- Architecture: docs/roadmap/ai-economics.md §9 (frozen r4, amended r4.1).
-- Review:       docs/roadmap/phase-5-implementation-review.md
-- Verification: scripts/verify-economics.sql
--
-- WHAT THIS IS
--   Economics answers the business question. It consumes Cost Engine outputs
--   for everything cost-shaped and owns everything revenue-shaped (§9).
--
-- OWNER RULES, LOCKED 2026-07-31
--   1. Revenue and cost may be displayed independently.
--   2. Profit, margin, ROI and break-even remain BLOCKED whenever a required
--      input is incomplete.
--   3. A blocked metric states an explicit reason. Never a guess. Never 0.
--   4. Blocked metrics unblock AUTOMATICALLY once the inputs arrive — no code
--      change. This is why every block reason is DERIVED FROM DATA at query
--      time and nothing is hardcoded: insert an FX rate, run recompute, and
--      the same SQL starts returning numbers.
--
-- INV-27 (r4.1): confidence propagates monotonically downward and is never
--   upgraded by aggregation. Every derived figure carries the WORST class
--   among its inputs.
--
-- LAYER BOUNDARY (§8.10 rule 8, INV-05)
--   econ reads ONLY published engine views — `v_cost_by_*`, `v_cost_daily`,
--   `v_cost_facts_current`. It never references rate_cards, rate_components,
--   discount_rules or fx_rates. Note in particular how "is there an FX rate?"
--   is answered WITHOUT touching fx_rates: a fact with a USD cost and a NULL
--   EGP cost IS the missing-bridge signal, and it is visible in the published
--   views. That is the boundary working, not a workaround.
--
-- NO PROVIDER OR MODEL LITERAL APPEARS BELOW (§8.10 rule 10, INV-13).
--
-- ROLLBACK
--   DROP SCHEMA econ CASCADE;
--   DROP FUNCTION IF EXISTS public.owner_econ_pnl(date,date,boolean);
--   DROP FUNCTION IF EXISTS public.owner_econ_revenue(date,date);
--   DROP FUNCTION IF EXISTS public.owner_econ_credit_flow(date,date);
--   DROP FUNCTION IF EXISTS public.owner_econ_service_economics(date,date,boolean);
--   DROP FUNCTION IF EXISTS public.owner_econ_package_economics(date,date);
--   DROP FUNCTION IF EXISTS public.owner_econ_student_economics(date,date,integer);
--   DROP FUNCTION IF EXISTS public.owner_econ_coverage();
--   (the cost_engine view changes in §1 are additive and may be left in place)
-- ===========================================================================

-- ── 1. Publish price_confidence on the engine's rollups (INV-27) ──────────
-- econ cannot honour confidence propagation unless the published views carry
-- it. Columns are APPENDED so CREATE OR REPLACE VIEW accepts them. No
-- existing column changes position, type or meaning.
--
-- Call-grain rollups take the worst confidence over contributing cost facts;
-- work-item rollups take it over Question Cost facts, which already carry the
-- worst of their own contributors (Phase 4).
CREATE OR REPLACE VIEW cost_engine.v_cost_daily AS
  SELECT f.occurred_at::date AS occurred_on, f.is_internal,
         sum(f.net_cost_usd) AS total_cost_usd, sum(f.net_cost_egp) AS total_cost_egp,
         count(*) AS calls, count(DISTINCT f.request_id) AS requests,
         count(*) FILTER (WHERE f.pricing_status <> 'unpriced') AS priced_calls,
         count(*) FILTER (WHERE f.pricing_status =  'unpriced') AS unpriced_calls,
         round(100.0 * count(*) FILTER (WHERE f.pricing_status <> 'unpriced')
               / NULLIF(count(*),0), 2) AS coverage_pct,
         max(f.price_confidence) AS price_confidence
    FROM cost_engine.cost_facts f WHERE f.is_current
   GROUP BY f.occurred_at::date, f.is_internal;

CREATE OR REPLACE VIEW cost_engine.v_cost_by_service AS
  SELECT f.service_code                                        AS dimension_key,
         COALESCE(s.display_name, f.service_code)               AS display_name,
         COALESCE(f.service_category, s.category)               AS category,
         f.is_internal,
         f.occurred_at::date                                    AS occurred_on,
         sum(f.net_cost_usd)                                    AS total_cost_usd,
         sum(f.net_cost_egp)                                    AS total_cost_egp,
         count(*)                                               AS calls,
         count(DISTINCT f.request_id)                           AS requests,
         sum(COALESCE((c.units->>'input_token')::bigint,0)
           + COALESCE((c.units->>'cached_input_token')::bigint,0)
           + COALESCE((c.units->>'output_token')::bigint,0))    AS units,
         count(*) FILTER (WHERE f.pricing_status <> 'unpriced') AS priced_calls,
         count(*) FILTER (WHERE f.pricing_status =  'unpriced') AS unpriced_calls,
         round(100.0 * count(*) FILTER (WHERE f.pricing_status <> 'unpriced')
               / NULLIF(count(*),0), 2)                         AS coverage_pct,
         round(avg(c.latency_ms) FILTER (WHERE f.success))::integer AS avg_latency_ms,
         round(100.0 * count(*) FILTER (WHERE f.success)
               / NULLIF(count(*),0), 2)                         AS success_rate,
         sum(f.net_cost_usd) FILTER (WHERE NOT f.success)       AS failed_cost_usd,
         s.cost_target_usd,
         max(f.price_confidence)                                AS price_confidence
    FROM cost_engine.cost_facts f
    JOIN public.ai_model_calls c ON c.id = f.call_id
    LEFT JOIN ai_catalog.services s ON s.service_code = f.service_code
   WHERE f.is_current
   GROUP BY f.service_code, s.display_name, f.service_category, s.category,
            f.is_internal, f.occurred_at::date, s.cost_target_usd;

CREATE OR REPLACE VIEW cost_engine.v_cost_by_package AS
  SELECT q.plan_code AS dimension_key, q.is_internal, q.occurred_at::date AS occurred_on,
         sum(q.total_cost_usd) AS total_cost_usd, count(*) AS work_items,
         sum(q.call_count) AS calls, sum(q.unpriced_call_count) AS unpriced_calls,
         max(q.cost_completeness) AS cost_completeness,
         sum(q.total_cost_egp) AS total_cost_egp,
         max(q.price_confidence) AS price_confidence
    FROM cost_engine.question_cost_facts q WHERE q.is_current
   GROUP BY q.plan_code, q.is_internal, q.occurred_at::date;

CREATE OR REPLACE VIEW cost_engine.v_cost_by_student AS
  SELECT q.user_id AS dimension_key, q.is_internal, q.occurred_at::date AS occurred_on,
         sum(q.total_cost_usd) AS total_cost_usd, sum(q.total_cost_egp) AS total_cost_egp,
         count(*) AS work_items, sum(q.call_count) AS calls,
         sum(q.unpriced_call_count) AS unpriced_calls,
         max(q.cost_completeness) AS cost_completeness,
         max(q.price_confidence) AS price_confidence
    FROM cost_engine.question_cost_facts q WHERE q.is_current
   GROUP BY q.user_id, q.is_internal, q.occurred_at::date;

CREATE OR REPLACE VIEW cost_engine.v_cost_by_lesson AS
  SELECT q.subtopic_id AS dimension_key, q.is_internal, q.occurred_at::date AS occurred_on,
         sum(q.total_cost_usd) AS total_cost_usd, count(*) AS work_items,
         sum(q.call_count) AS calls, sum(q.unpriced_call_count) AS unpriced_calls,
         max(q.cost_completeness) AS cost_completeness,
         sum(q.total_cost_egp) AS total_cost_egp,
         max(q.price_confidence) AS price_confidence
    FROM cost_engine.question_cost_facts q WHERE q.is_current
   GROUP BY q.subtopic_id, q.is_internal, q.occurred_at::date;

CREATE OR REPLACE VIEW cost_engine.v_cost_by_operation AS
  SELECT q.operation AS dimension_key, q.is_internal, q.occurred_at::date AS occurred_on,
         sum(q.total_cost_usd) AS total_cost_usd, count(*) AS work_items,
         sum(q.call_count) AS calls, sum(q.unpriced_call_count) AS unpriced_calls,
         max(q.cost_completeness) AS cost_completeness,
         sum(q.total_cost_egp) AS total_cost_egp,
         max(q.price_confidence) AS price_confidence
    FROM cost_engine.question_cost_facts q WHERE q.is_current
   GROUP BY q.operation, q.is_internal, q.occurred_at::date;

-- ── 2. Schema and hardening ───────────────────────────────────────────────
CREATE SCHEMA IF NOT EXISTS econ;

COMMENT ON SCHEMA econ IS
  'AI Economics analytics (§9). Reads published Cost Engine views only — never '
  'rate cards, discounts or FX (§8.10 rule 8, INV-05). Contains no provider or '
  'model name (INV-13). Not exposed to PostgREST; owner access is via '
  'public.owner_econ_* RPCs.';

REVOKE ALL ON SCHEMA econ FROM PUBLIC;
REVOKE ALL ON SCHEMA econ FROM anon, authenticated;
GRANT USAGE ON SCHEMA econ TO service_role;

-- ── 3. The confidence lattice (INV-27) ────────────────────────────────────
-- blocked < modeled < derived < actual. Combination is min(): a figure is
-- only as trustworthy as its weakest input, and aggregation can never
-- improve it.
CREATE OR REPLACE FUNCTION econ.confidence_rank(p_class text)
RETURNS integer
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE p_class
           WHEN 'actual'  THEN 3
           WHEN 'derived' THEN 2
           WHEN 'modeled' THEN 1
           ELSE 0                      -- 'blocked', NULL, anything unknown
         END;
$$;

CREATE OR REPLACE FUNCTION econ.worst_confidence(VARIADIC p_classes text[])
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  -- NULL is NOT skipped. An unknown input is an unknown figure, so it ranks
  -- at 0 alongside 'blocked' and drags the result down with it. Skipping
  -- NULLs would let a missing input silently upgrade the aggregate, which is
  -- precisely what INV-27 forbids.
  SELECT COALESCE(
    (SELECT c FROM unnest(p_classes) c
      ORDER BY econ.confidence_rank(c), c
      LIMIT 1),
    'blocked');
$$;

-- Translate the engine's price_confidence into a confidence class.
CREATE OR REPLACE FUNCTION econ.cost_confidence(p_price_confidence text)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE p_price_confidence
           WHEN 'invoice_verified' THEN 'actual'
           WHEN 'list_price'       THEN 'modeled'
           ELSE 'blocked'
         END;
$$;

-- ── 4. The block-reason resolver — owner rules 2, 3 and 4 ─────────────────
-- Entirely a function of the DATA PRESENT. Nothing about the current gaps is
-- hardcoded, so each reason disappears on its own the moment its input
-- arrives: land an overlapping cost period and 'no_cost_in_period' stops
-- firing; insert an FX rate and run recompute and 'no_fx_rate' stops firing.
-- No code change, no redeploy (rule 4).
--
-- Returns NULL when nothing blocks the metric.
CREATE OR REPLACE FUNCTION econ.block_reason(
  p_revenue_egp  numeric,
  p_cost_usd     numeric,
  p_cost_egp     numeric
)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE
    WHEN COALESCE(p_revenue_egp,0) = 0 AND p_cost_usd IS NULL
      THEN 'no_revenue_and_no_cost_in_period'
    WHEN COALESCE(p_revenue_egp,0) = 0
      THEN 'no_revenue_in_period'
    WHEN p_cost_usd IS NULL
      THEN 'no_cost_in_period'
    -- Cost exists in USD but has no EGP figure: no FX rate covers its month.
    -- Detected through the published views alone — econ never reads fx_rates.
    WHEN p_cost_egp IS NULL
      THEN 'no_fx_rate'
    ELSE NULL
  END;
$$;

COMMENT ON FUNCTION econ.block_reason(numeric,numeric,numeric) IS
  'Owner rules 2-4 (2026-07-31). Returns NULL when a revenue-and-cost metric '
  'can be computed, else the explicit reason it cannot. Derived from the data '
  'present, never hardcoded, so a metric unblocks automatically once its '
  'inputs exist. Never returns a guess and never implies 0.';

-- ── 5. Revenue (§9.2, §9.3) — econ owns everything revenue-shaped ─────────
-- Dropped first, in dependency order. CREATE OR REPLACE VIEW cannot change a
-- column's TYPE, so a re-apply that alters one would fail — or, worse, leave
-- the old definition in place while the migration appears to succeed.
DROP VIEW IF EXISTS econ.v_coverage;
DROP VIEW IF EXISTS econ.v_breakeven_inputs;
DROP VIEW IF EXISTS econ.v_operation_service_mix;
DROP VIEW IF EXISTS econ.v_lesson_economics;
DROP VIEW IF EXISTS econ.v_student_economics;
DROP VIEW IF EXISTS econ.v_package_economics;
DROP VIEW IF EXISTS econ.v_service_economics;
DROP VIEW IF EXISTS econ.v_pnl_daily;
DROP VIEW IF EXISTS econ.v_credit_flow;
DROP VIEW IF EXISTS econ.v_revenue_recognized_daily;
DROP VIEW IF EXISTS econ.v_revenue_events;

-- Two channels. `payment_requests` is the live one (manual review + approval).
-- `payments` is the automated provider channel, present and unioned so it
-- contributes the moment it starts completing — rule 4 again.
CREATE OR REPLACE VIEW econ.v_revenue_events AS
  SELECT pr.id                                   AS revenue_event_id,
         'payment_request'::text                 AS channel,
         pr.user_id,
         pr.plan_code,
         COALESCE(pr.plan_label, pd.display_name) AS plan_label,
         pd.kind                                 AS plan_kind,
         COALESCE(pd.period_days, 0)             AS period_days,
         pd.credits_granted,
         pr.amount_egp                           AS gross_amount_egp,
         0::numeric                              AS provider_fee_egp,
         pr.amount_egp                           AS net_amount_egp,
         COALESCE(pr.reviewed_at, pr.created_at) AS recognized_from,
         'actual'::text                          AS confidence
    FROM public.payment_requests pr
    LEFT JOIN public.plan_definitions pd ON pd.plan_code = pr.plan_code
   WHERE pr.status = 'approved'
  UNION ALL
  SELECT p.id,
         'payment_provider',
         p.user_id,
         p.metadata->>'plan_code',
         pd2.display_name,
         pd2.kind,
         COALESCE(pd2.period_days, 0),
         COALESCE(p.credits_to_grant, pd2.credits_granted),
         p.amount_egp,
         COALESCE(p.provider_fee_egp, 0),
         p.amount_egp - COALESCE(p.provider_fee_egp, 0),
         p.created_at,
         'actual'
    FROM public.payments p
    LEFT JOIN public.plan_definitions pd2 ON pd2.plan_code = p.metadata->>'plan_code'
   WHERE p.status = 'completed';

-- Deferred recognition (§9.3): a subscription's revenue is spread evenly
-- across its period; a pack (period_days = 0) is recognized on the spot.
-- generate_series produces one row per day of the period.
CREATE OR REPLACE VIEW econ.v_revenue_recognized_daily AS
  -- ::date, not the timestamptz generate_series returns, so the grain is a
  -- calendar day and joins to cost_daily cleanly.
  SELECT d.recognized_on::date AS recognized_on,
         r.plan_code,
         r.plan_kind,
         sum(r.daily_amount_egp)      AS recognized_egp,
         sum(r.daily_net_egp)         AS recognized_net_egp,
         count(DISTINCT r.revenue_event_id) AS revenue_events,
         count(DISTINCT r.user_id)    AS paying_users,
         'actual'::text               AS confidence
    FROM (
      SELECT e.revenue_event_id, e.user_id, e.plan_code, e.plan_kind,
             e.recognized_from,
             greatest(COALESCE(e.period_days,0), 1)                    AS days,
             e.gross_amount_egp / greatest(COALESCE(e.period_days,0),1) AS daily_amount_egp,
             e.net_amount_egp   / greatest(COALESCE(e.period_days,0),1) AS daily_net_egp
        FROM econ.v_revenue_events e
    ) r
    CROSS JOIN LATERAL generate_series(
      r.recognized_from::date,
      r.recognized_from::date + (r.days - 1),
      interval '1 day'
    ) AS d(recognized_on)
   GROUP BY d.recognized_on::date, r.plan_code, r.plan_kind;

-- ── 6. Credit flow (§9.2) — sold vs granted vs consumed vs refunded ───────
CREATE OR REPLACE VIEW econ.v_credit_flow AS
  SELECT ct.created_at::date              AS flow_on,
         ct.transaction_type,
         count(*)                          AS events,
         sum(ct.credits)                   AS net_credits,
         sum(ct.credits) FILTER (WHERE ct.credits > 0) AS credits_in,
         sum(ct.credits) FILTER (WHERE ct.credits < 0) AS credits_out,
         count(DISTINCT ct.user_id)        AS users,
         'actual'::text                    AS confidence
    FROM public.credit_transactions ct
   GROUP BY ct.created_at::date, ct.transaction_type;

-- ── 7. P&L (§9.2) — the view rules 2-4 exist for ──────────────────────────
-- Revenue and cost stand side by side unconditionally (rule 1). Gross profit
-- and margin are computed ONLY when the inputs allow it, and otherwise carry
-- NULL plus an explicit reason (rules 2, 3).
--
-- Internal traffic is excluded from cost here (INV-25): a P&L reports the
-- business, and admin testing has no revenue to earn against it.
CREATE OR REPLACE VIEW econ.v_pnl_daily AS
  WITH days AS (
    SELECT recognized_on AS d FROM econ.v_revenue_recognized_daily
    UNION
    SELECT occurred_on    FROM cost_engine.v_cost_daily WHERE NOT is_internal
  ),
  rev AS (
    SELECT recognized_on AS d,
           sum(recognized_egp)     AS revenue_egp,
           sum(recognized_net_egp) AS revenue_net_egp
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
         -- INV-27: revenue is actual, cost is only as good as its rate card,
         -- and a blocked metric is 'blocked'. Never better than the worst.
         CASE WHEN econ.block_reason(rev.revenue_egp, cost.cost_usd, cost.cost_egp) IS NOT NULL
              THEN 'blocked'
              ELSE econ.worst_confidence('actual', econ.cost_confidence(cost.price_confidence))
         END                                                              AS confidence
    FROM days
    LEFT JOIN rev  ON rev.d  = days.d
    LEFT JOIN cost ON cost.d = days.d;

-- ── 8. Service economics (§9.2) — cost-only, so never blocked ─────────────
-- "Which capability should we optimize?" needs no revenue, so it answers
-- fully today (rule 1).
CREATE OR REPLACE VIEW econ.v_service_economics AS
  SELECT s.dimension_key                       AS service_code,
         s.display_name,
         s.category,
         sum(s.total_cost_usd)                 AS cost_usd,
         sum(s.total_cost_egp)                 AS cost_egp,
         sum(s.calls)                          AS calls,
         sum(s.units)                          AS units,
         round(100.0 * sum(s.total_cost_usd)
               / NULLIF(sum(sum(s.total_cost_usd)) OVER (), 0), 2) AS cost_share_pct,
         min(s.occurred_on)                    AS first_seen,
         max(s.occurred_on)                    AS last_seen,
         max(s.cost_target_usd)                AS monthly_budget_usd,
         econ.cost_confidence(max(s.price_confidence)) AS confidence
    FROM cost_engine.v_cost_by_service s
   WHERE NOT s.is_internal
   GROUP BY s.dimension_key, s.display_name, s.category;

-- ── 9. Package economics (§9.2) ───────────────────────────────────────────
CREATE OR REPLACE VIEW econ.v_package_economics AS
  WITH rev AS (
    SELECT plan_code, sum(recognized_egp) AS revenue_egp,
           sum(recognized_net_egp) AS revenue_net_egp,
           count(DISTINCT paying_users) AS plan_days
      FROM econ.v_revenue_recognized_daily GROUP BY plan_code
  ),
  cost AS (
    SELECT dimension_key AS plan_code,
           sum(total_cost_usd) AS cost_usd,
           sum(total_cost_egp) AS cost_egp,
           sum(work_items)     AS questions,
           max(price_confidence) AS price_confidence
      FROM cost_engine.v_cost_by_package WHERE NOT is_internal
     GROUP BY dimension_key
  )
  SELECT COALESCE(rev.plan_code, cost.plan_code) AS plan_code,
         rev.revenue_egp,
         rev.revenue_net_egp,
         cost.cost_usd,
         cost.cost_egp,
         cost.questions,
         econ.block_reason(rev.revenue_egp, cost.cost_usd, cost.cost_egp) AS block_reason,
         CASE WHEN econ.block_reason(rev.revenue_egp, cost.cost_usd, cost.cost_egp) IS NULL
              THEN round(rev.revenue_net_egp - cost.cost_egp, 4) END AS profit_egp,
         CASE WHEN econ.block_reason(rev.revenue_egp, cost.cost_usd, cost.cost_egp) IS NULL
              THEN round(100.0 * (rev.revenue_net_egp - cost.cost_egp)
                         / NULLIF(rev.revenue_net_egp,0), 2) END     AS margin_pct,
         CASE WHEN econ.block_reason(rev.revenue_egp, cost.cost_usd, cost.cost_egp) IS NOT NULL
              THEN 'blocked'
              ELSE econ.worst_confidence('actual', econ.cost_confidence(cost.price_confidence))
         END                                                          AS confidence
    FROM rev FULL JOIN cost ON cost.plan_code = rev.plan_code;

-- ── 10. Student economics (§9.2) ──────────────────────────────────────────
CREATE OR REPLACE VIEW econ.v_student_economics AS
  WITH rev AS (
    SELECT user_id, sum(net_amount_egp) AS revenue_egp
      FROM econ.v_revenue_events GROUP BY user_id
  ),
  cost AS (
    SELECT dimension_key AS user_id,
           sum(total_cost_usd) AS cost_usd,
           sum(total_cost_egp) AS cost_egp,
           sum(work_items)     AS questions,
           max(cost_completeness) AS cost_completeness,
           max(price_confidence)  AS price_confidence
      FROM cost_engine.v_cost_by_student WHERE NOT is_internal
     GROUP BY dimension_key
  )
  SELECT COALESCE(rev.user_id, cost.user_id) AS user_id,
         rev.revenue_egp,
         cost.cost_usd,
         cost.cost_egp,
         cost.questions,
         cost.cost_completeness,
         econ.block_reason(rev.revenue_egp, cost.cost_usd, cost.cost_egp) AS block_reason,
         CASE WHEN econ.block_reason(rev.revenue_egp, cost.cost_usd, cost.cost_egp) IS NULL
              THEN round(rev.revenue_egp - cost.cost_egp, 4) END AS profit_egp,
         -- The abnormal-usage flag (§9 section 8) is itself a comparison of
         -- revenue against cost, so it is blocked on the same inputs rather
         -- than silently reporting 'not abnormal'.
         CASE WHEN econ.block_reason(rev.revenue_egp, cost.cost_usd, cost.cost_egp) IS NULL
              THEN (cost.cost_egp > rev.revenue_egp) END          AS cost_exceeds_revenue,
         CASE WHEN econ.block_reason(rev.revenue_egp, cost.cost_usd, cost.cost_egp) IS NOT NULL
              THEN 'blocked'
              ELSE econ.worst_confidence('actual', econ.cost_confidence(cost.price_confidence))
         END                                                       AS confidence
    FROM rev FULL JOIN cost ON cost.user_id = rev.user_id;

-- ── 11. Lesson economics and operation/service mix (§9.2) ─────────────────
-- Both are cost-and-volume only, so both answer fully today.
CREATE OR REPLACE VIEW econ.v_lesson_economics AS
  SELECT l.dimension_key AS subtopic_id,
         sum(l.total_cost_usd) AS cost_usd,
         sum(l.total_cost_egp) AS cost_egp,
         sum(l.work_items)     AS questions,
         round(sum(l.total_cost_usd) / NULLIF(sum(l.work_items),0), 8) AS cost_per_question_usd,
         max(l.cost_completeness) AS cost_completeness,
         econ.cost_confidence(max(l.price_confidence)) AS confidence
    FROM cost_engine.v_cost_by_lesson l
   WHERE NOT l.is_internal AND l.dimension_key IS NOT NULL
   GROUP BY l.dimension_key;

CREATE OR REPLACE VIEW econ.v_operation_service_mix AS
  SELECT q.operation,
         svc.key                        AS service_code,
         sum((svc.value)::numeric)      AS cost_usd,
         count(*)                       AS work_items,
         econ.cost_confidence(max(q.price_confidence)) AS confidence
    FROM cost_engine.v_question_cost_current q
    CROSS JOIN LATERAL jsonb_each(q.service_mix) AS svc(key, value)
   WHERE NOT q.is_internal AND q.operation IS NOT NULL
   GROUP BY q.operation, svc.key;

-- ── 12. Break-even inputs (§9.2, §12) ─────────────────────────────────────
-- Blocked on the same inputs as profit, plus platform costs, which have no
-- source table yet (§9.4). Reported as a reason, never assumed to be zero.
CREATE OR REPLACE VIEW econ.v_breakeven_inputs AS
  WITH m AS (
    SELECT date_trunc('month', pnl_on)::date AS month,
           sum(revenue_net_egp) AS revenue_egp,
           sum(cost_usd)        AS ai_cost_usd,
           sum(cost_egp)        AS ai_cost_egp,
           max(confidence)      AS confidence
      FROM econ.v_pnl_daily GROUP BY 1
  )
  SELECT m.month,
         m.revenue_egp,
         m.ai_cost_usd,
         m.ai_cost_egp,
         NULL::numeric AS platform_cost_egp,
         COALESCE(
           econ.block_reason(m.revenue_egp, m.ai_cost_usd, m.ai_cost_egp),
           'no_platform_cost_source'      -- §9.4 has no table yet
         ) AS block_reason,
         NULL::numeric AS breakeven_questions,
         'blocked'::text AS confidence
    FROM m;

-- ── 13. Coverage — what is blocked, and exactly why (rule 3) ──────────────
CREATE OR REPLACE VIEW econ.v_coverage AS
  SELECT 'revenue'::text AS metric, 'available'::text AS state,
         (SELECT count(*)::text FROM econ.v_revenue_events) || ' revenue events; EGP '
         || COALESCE((SELECT round(sum(net_amount_egp),2)::text FROM econ.v_revenue_events),'0') AS detail
  UNION ALL
  SELECT 'ai_cost', 'available',
         COALESCE((SELECT 'USD ' || round(sum(total_cost_usd),8)::text
                     FROM cost_engine.v_cost_daily), 'no cost facts')
  UNION ALL
  SELECT 'currency_bridge',
         CASE WHEN EXISTS (SELECT 1 FROM cost_engine.v_cost_daily
                            WHERE total_cost_usd IS NOT NULL AND total_cost_egp IS NULL)
              THEN 'blocked' ELSE 'available' END,
         CASE WHEN EXISTS (SELECT 1 FROM cost_engine.v_cost_daily
                            WHERE total_cost_usd IS NOT NULL AND total_cost_egp IS NULL)
              THEN 'cost has no EGP figure: no FX rate covers its month. '
                   'Revenue is EGP-only, so profit cannot be computed in any currency.'
              ELSE 'cost carries EGP; revenue and cost are comparable' END
  UNION ALL
  SELECT 'revenue_cost_overlap',
         CASE WHEN EXISTS (SELECT 1 FROM econ.v_pnl_daily
                            WHERE revenue_egp IS NOT NULL AND cost_usd IS NOT NULL)
              THEN 'available' ELSE 'blocked' END,
         CASE WHEN EXISTS (SELECT 1 FROM econ.v_pnl_daily
                            WHERE revenue_egp IS NOT NULL AND cost_usd IS NOT NULL)
              THEN 'at least one day has both revenue and cost'
              ELSE 'no day has both revenue and cost — every P&L figure is blocked' END
  UNION ALL
  SELECT 'platform_costs', 'blocked',
         'no source table for platform spend (§9.4); net profit and break-even '
         'cannot be computed'
  UNION ALL
  SELECT 'price_confidence',
         CASE WHEN EXISTS (SELECT 1 FROM cost_engine.v_cost_daily WHERE price_confidence <> 'invoice_verified')
              THEN 'modeled' ELSE 'actual' END,
         CASE WHEN EXISTS (SELECT 1 FROM cost_engine.v_cost_daily WHERE price_confidence <> 'invoice_verified')
              THEN 'some cost rests on unverified list prices — every derived '
                   'figure is modeled (INV-27)'
              ELSE 'all cost is invoice-verified' END;

-- ── 14. Owner-gated read RPCs (§9, INV-07, INV-10) ────────────────────────
CREATE OR REPLACE FUNCTION public.owner_econ_pnl(
  p_from date DEFAULT NULL,
  p_to   date DEFAULT NULL
)
RETURNS TABLE (
  pnl_on           date,
  revenue_egp      numeric,
  revenue_net_egp  numeric,
  cost_usd         numeric,
  cost_egp         numeric,
  gross_profit_egp numeric,
  gross_margin_pct numeric,
  block_reason     text,
  confidence       text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, econ, cost_engine, ai_catalog
AS $$
BEGIN
  IF NOT COALESCE(public.has_role_at_least('owner'::public.user_role), false) THEN
    RAISE EXCEPTION 'forbidden: owner_econ_pnl requires role owner' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT v.pnl_on, v.revenue_egp, v.revenue_net_egp, v.cost_usd, v.cost_egp,
         v.gross_profit_egp, v.gross_margin_pct, v.block_reason, v.confidence
    FROM econ.v_pnl_daily v
   WHERE (p_from IS NULL OR v.pnl_on >= p_from)
     AND (p_to   IS NULL OR v.pnl_on <= p_to)
   ORDER BY v.pnl_on;
END;
$$;

CREATE OR REPLACE FUNCTION public.owner_econ_revenue(
  p_from date DEFAULT NULL,
  p_to   date DEFAULT NULL
)
RETURNS TABLE (
  recognized_on date, plan_code text, plan_kind text,
  recognized_egp numeric, recognized_net_egp numeric,
  revenue_events bigint, paying_users bigint, confidence text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, econ, cost_engine, ai_catalog
AS $$
BEGIN
  IF NOT COALESCE(public.has_role_at_least('owner'::public.user_role), false) THEN
    RAISE EXCEPTION 'forbidden: owner_econ_revenue requires role owner' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT v.recognized_on, v.plan_code, v.plan_kind, v.recognized_egp,
         v.recognized_net_egp, v.revenue_events, v.paying_users, v.confidence
    FROM econ.v_revenue_recognized_daily v
   WHERE (p_from IS NULL OR v.recognized_on >= p_from)
     AND (p_to   IS NULL OR v.recognized_on <= p_to)
   ORDER BY v.recognized_on, v.plan_code;
END;
$$;

CREATE OR REPLACE FUNCTION public.owner_econ_service_economics(
  p_from date DEFAULT NULL,
  p_to   date DEFAULT NULL
)
RETURNS TABLE (
  service_code text, display_name text, category text,
  cost_usd numeric, cost_egp numeric, calls bigint, units numeric,
  cost_share_pct numeric, monthly_budget_usd numeric, confidence text
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
         v.calls, v.units, v.cost_share_pct, v.monthly_budget_usd, v.confidence
    FROM econ.v_service_economics v
   WHERE (p_from IS NULL OR v.last_seen  >= p_from)
     AND (p_to   IS NULL OR v.first_seen <= p_to)
   ORDER BY v.cost_usd DESC NULLS LAST;
END;
$$;

CREATE OR REPLACE FUNCTION public.owner_econ_package_economics()
RETURNS TABLE (
  plan_code text, revenue_egp numeric, revenue_net_egp numeric,
  cost_usd numeric, cost_egp numeric, questions bigint,
  profit_egp numeric, margin_pct numeric, block_reason text, confidence text
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
         v.questions, v.profit_egp, v.margin_pct, v.block_reason, v.confidence
    FROM econ.v_package_economics v
   ORDER BY v.revenue_egp DESC NULLS LAST, v.plan_code;
END;
$$;

CREATE OR REPLACE FUNCTION public.owner_econ_student_economics(
  p_limit integer DEFAULT 100
)
RETURNS TABLE (
  user_id uuid, revenue_egp numeric, cost_usd numeric, cost_egp numeric,
  questions bigint, cost_completeness text, profit_egp numeric,
  cost_exceeds_revenue boolean, block_reason text, confidence text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, econ, cost_engine, ai_catalog
AS $$
BEGIN
  IF NOT COALESCE(public.has_role_at_least('owner'::public.user_role), false) THEN
    RAISE EXCEPTION 'forbidden: owner_econ_student_economics requires role owner' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT v.user_id, v.revenue_egp, v.cost_usd, v.cost_egp, v.questions,
         v.cost_completeness, v.profit_egp, v.cost_exceeds_revenue,
         v.block_reason, v.confidence
    FROM econ.v_student_economics v
   ORDER BY v.cost_usd DESC NULLS LAST, v.revenue_egp DESC NULLS LAST
   LIMIT COALESCE(p_limit, 100);
END;
$$;

CREATE OR REPLACE FUNCTION public.owner_econ_credit_flow(
  p_from date DEFAULT NULL,
  p_to   date DEFAULT NULL
)
RETURNS TABLE (
  flow_on date, transaction_type text, events bigint,
  net_credits bigint, credits_in bigint, credits_out bigint,
  users bigint, confidence text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, econ, cost_engine, ai_catalog
AS $$
BEGIN
  IF NOT COALESCE(public.has_role_at_least('owner'::public.user_role), false) THEN
    RAISE EXCEPTION 'forbidden: owner_econ_credit_flow requires role owner' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT v.flow_on, v.transaction_type, v.events, v.net_credits,
         v.credits_in, v.credits_out, v.users, v.confidence
    FROM econ.v_credit_flow v
   WHERE (p_from IS NULL OR v.flow_on >= p_from)
     AND (p_to   IS NULL OR v.flow_on <= p_to)
   ORDER BY v.flow_on DESC, v.transaction_type;
END;
$$;

-- The honest-numbers surface: what is available, what is blocked, and why.
CREATE OR REPLACE FUNCTION public.owner_econ_coverage()
RETURNS TABLE (metric text, state text, detail text)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, econ, cost_engine, ai_catalog
AS $$
BEGIN
  IF NOT COALESCE(public.has_role_at_least('owner'::public.user_role), false) THEN
    RAISE EXCEPTION 'forbidden: owner_econ_coverage requires role owner' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY SELECT v.metric, v.state, v.detail FROM econ.v_coverage v ORDER BY v.metric;
END;
$$;

-- ── 15. Grants ────────────────────────────────────────────────────────────
REVOKE ALL ON ALL TABLES IN SCHEMA econ FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA econ FROM anon, authenticated;
GRANT SELECT ON ALL TABLES IN SCHEMA econ TO service_role;

REVOKE ALL ON FUNCTION public.owner_econ_pnl(date,date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.owner_econ_pnl(date,date) FROM anon;
REVOKE ALL ON FUNCTION public.owner_econ_revenue(date,date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.owner_econ_revenue(date,date) FROM anon;
REVOKE ALL ON FUNCTION public.owner_econ_service_economics(date,date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.owner_econ_service_economics(date,date) FROM anon;
REVOKE ALL ON FUNCTION public.owner_econ_package_economics() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.owner_econ_package_economics() FROM anon;
REVOKE ALL ON FUNCTION public.owner_econ_student_economics(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.owner_econ_student_economics(integer) FROM anon;
REVOKE ALL ON FUNCTION public.owner_econ_credit_flow(date,date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.owner_econ_credit_flow(date,date) FROM anon;
REVOKE ALL ON FUNCTION public.owner_econ_coverage() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.owner_econ_coverage() FROM anon;

GRANT EXECUTE ON FUNCTION public.owner_econ_pnl(date,date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.owner_econ_revenue(date,date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.owner_econ_service_economics(date,date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.owner_econ_package_economics() TO authenticated;
GRANT EXECUTE ON FUNCTION public.owner_econ_student_economics(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.owner_econ_credit_flow(date,date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.owner_econ_coverage() TO authenticated;

REVOKE ALL ON FUNCTION econ.block_reason(numeric,numeric,numeric) FROM PUBLIC;
REVOKE ALL ON FUNCTION econ.worst_confidence(text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION econ.confidence_rank(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION econ.cost_confidence(text) FROM PUBLIC;

COMMENT ON FUNCTION public.owner_econ_pnl(date,date) IS
  'Daily P&L (§9.2). Requires role owner. Revenue and cost are always '
  'returned; gross_profit_egp and gross_margin_pct are NULL with an explicit '
  'block_reason whenever an input is missing, and become available '
  'automatically once it arrives. confidence is never better than the worst '
  'contributing input (INV-27).';
