-- ===========================================================================
-- Phase 6 M3 — period credit summary for the Credits Analytics headline
-- ===========================================================================
-- STATUS: ⛔ PREPARED, NOT APPLIED. Owner-approved 2026-08-01 as one additional
--         owner RPC for M3 (CLAUDE.md §3 still requires individual approval to
--         apply). Owner instruction: stop after the engineering review; do not
--         apply, do not begin the Release Gate.
--
--         Applied together with 20260801_aiecon_p6_m3_operation_mix.sql. Two
--         files rather than one so each RPC's rationale stays self-contained;
--         both are unapplied and land in the same gate.
--
-- WHY THIS EXISTS
--   Section 4's KPIs — Credits Sold, Granted, Consumed, Remaining liability,
--   average per student, burn rate, runway, cost per credit — are all PERIOD
--   AGGREGATES over a daily ledger.
--
--   owner_econ_credit_flow() returns daily × transaction-type rows. Producing
--   the headline from it in the dashboard would mean summing those rows in
--   JavaScript: a financial calculation in the client, which INV-03 forbids.
--   It is the same problem owner_econ_pnl_summary() was created to solve in
--   M2, and it has the same answer — aggregate on the server.
--
-- WHAT IT ADDS
--   One owner-gated read RPC returning exactly ONE row. No new table, no new
--   view, no change to any existing object.
--
--   The totals are computed from econ.v_credit_flow — the SAME view the panel
--   renders as its table — so the headline and the table below it reconcile by
--   construction rather than by coincidence. Only the distinct-user count
--   reads credit_transactions directly, because summing daily distinct users
--   would double-count anyone active on more than one day.
--
-- LEDGER SEMANTICS (measured, not assumed)
--   credit_transactions carries exactly four types, verified 2026-08-01:
--     CONSUME       373 events, -1,908   (negative: credits leaving)
--     ADMIN_ADJUST   13 events, +17,000  (may be negative — clawbacks exist)
--     GRANT           3 events, +77,500
--     REFUND          3 events, +15
--
--   There is NO purchase type. Credits bought with money are not written to
--   this ledger as a distinct type, so "Credits Sold" CANNOT come from it —
--   it comes from econ.v_revenue_events.credits_granted, the approved-payment
--   surface. Sold and granted are therefore different columns from different
--   sources, exactly as §Section 4 specifies ("Credits Granted (non-revenue)").
--
-- ON INTEGER DIVISION — a real trap, avoided explicitly
--   credit_transactions.credits, profiles.credits_balance and
--   v_revenue_events.credits_granted are all `integer`, so every sum() here
--   yields `bigint`. In PostgreSQL `bigint / bigint` performs INTEGER
--   division and truncates: 1908/7 would return 272, not 272.57.
--
--   Every ratio below therefore casts its numerator to numeric first. This is
--   the same family of defect as M2's bigint/numeric mismatch — a silent type
--   behaviour that produces a plausible wrong number rather than an error.
--
-- ON MEASURED ZERO vs UNKNOWN (INV-23, INV-26)
--   A period with no CONSUME rows genuinely consumed zero credits; that is a
--   measured zero and is reported as 0. A ratio whose denominator is zero is
--   NOT zero — it is undefined, and is reported as NULL with a stated reason.
--
-- ON THE QUESTION DENOMINATOR — a locked architectural decision, not a gap
--   OWNER DECISION, 2026-08-01. avg_credits_per_question is intentionally
--   BLOCKED, and will stay blocked until external question work items exist.
--   It is not an unfinished feature and must not be "completed" by swapping in
--   a different denominator.
--
--   The Economics layer has exactly ONE definition of a question: the cost
--   work item, external-only (INV-25). It is what
--   econ.v_student_economics.questions and econ.v_package_economics.questions
--   already count, so every "questions" figure on the dashboard divides and
--   reports the same population.
--
--   public.question_records holds 1,196 rows and would populate this KPI
--   immediately — and that is exactly why it is rejected. Adopting it would put
--   TWO different definitions of "question" on one dashboard: the one Section 4
--   divides by, and the one Sections 5-8 report. A number that looks right and
--   is measured against a different population than its neighbours is worse
--   than a number that is honestly absent.
--
--   Measured 2026-08-01: 27 'question' + 6 'unattributed' work items, ALL
--   internal, zero external. So the denominator is a measured zero and the KPI
--   blocks with `no_external_question_work_items`.
--
--   This unblocks with NO code change the moment external traffic is priced
--   and allocated — the same data-derived unblocking as every other metric
--   here (owner rule 4).
--
-- ON liability_credits_now
--   Deliberately named `_now`. It is sum(profiles.credits_balance), a
--   POINT-IN-TIME snapshot of outstanding liability, and it ignores p_from and
--   p_to entirely — there is no historical balance ledger to reconstruct it
--   per period. Conflating a snapshot with a period aggregate is precisely the
--   error M2 found in v_pnl_daily's composite confidence, so the column name
--   carries the distinction rather than relying on documentation.
--
-- CONFIDENCE (INV-27)
--   Never assigned, always derived. Credit metrics inherit
--   econ.ledger_confidence() via v_credit_flow, combined worst-first with the
--   revenue confidence backing credits_sold. cost_per_credit additionally
--   inherits the price-card confidence and carries its own class, because it
--   is the only cost-derived figure here and must not drag the credit metrics
--   down (owner rule 1 — revenue and cost display independently).
--
-- ROLLBACK
--   DROP FUNCTION IF EXISTS public.owner_econ_credit_summary(date,date);
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.owner_econ_credit_summary(
  p_from date DEFAULT NULL,
  p_to   date DEFAULT NULL
)
RETURNS TABLE (
  period_from                date,
  period_to                  date,
  credits_sold               bigint,
  credits_granted            bigint,
  credits_refunded           bigint,
  credits_consumed           bigint,
  net_change                 bigint,
  liability_credits_now      bigint,
  active_users               bigint,
  avg_credits_per_user       numeric,
  avg_daily_burn             numeric,
  runway_days                numeric,
  cost_per_credit_usd        numeric,
  cost_block_reason          text,
  confidence                 text,
  cost_per_credit_confidence text,
  -- Appended: avg credits per question. See "ON THE QUESTION DENOMINATOR".
  questions_external               bigint,
  avg_credits_per_question         numeric,
  question_block_reason            text,
  avg_credits_per_question_conf    text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, econ, cost_engine, ai_catalog
AS $$
BEGIN
  IF NOT COALESCE(public.has_role_at_least('owner'::public.user_role), false) THEN
    RAISE EXCEPTION 'forbidden: owner_econ_credit_summary requires role owner'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH flow AS (
    -- Same view the panel renders, so headline and table cannot disagree.
    SELECT * FROM econ.v_credit_flow f
     WHERE (p_from IS NULL OR f.flow_on >= p_from)
       AND (p_to   IS NULL OR f.flow_on <= p_to)
  ),
  led AS (
    SELECT min(f.flow_on) AS d_from,
           max(f.flow_on) AS d_to,
           COALESCE(sum(f.net_credits) FILTER
                    (WHERE f.transaction_type IN ('GRANT','ADMIN_ADJUST')), 0) AS granted,
           COALESCE(sum(f.net_credits) FILTER
                    (WHERE f.transaction_type = 'REFUND'), 0)                  AS refunded,
           -- CONSUME rows are negative; negate so the KPI reads as a positive
           -- quantity of credits burned.
           COALESCE(-sum(f.net_credits) FILTER
                    (WHERE f.transaction_type = 'CONSUME'), 0)                 AS consumed,
           COALESCE(sum(f.net_credits), 0)                                     AS net_chg,
           econ.worst_confidence(VARIADIC array_agg(f.confidence))             AS conf
      FROM flow f
  ),
  usr AS (
    -- Distinct across the whole period: summing daily distinct users would
    -- double-count anyone active on more than one day.
    SELECT count(DISTINCT ct.user_id) AS n
      FROM public.credit_transactions ct
     WHERE ct.transaction_type = 'CONSUME'
       AND (p_from IS NULL OR ct.created_at::date >= p_from)
       AND (p_to   IS NULL OR ct.created_at::date <= p_to)
  ),
  sold AS (
    -- Not from the ledger: there is no purchase transaction type.
    SELECT COALESCE(sum(r.credits_granted), 0)                     AS credits,
           econ.worst_confidence(VARIADIC array_agg(r.confidence)) AS conf
      FROM econ.v_revenue_events r
     WHERE (p_from IS NULL OR r.recognized_from::date >= p_from)
       AND (p_to   IS NULL OR r.recognized_from::date <= p_to)
  ),
  liab AS (
    -- Snapshot, period-independent by construction. See header.
    SELECT COALESCE(sum(p.credits_balance), 0) AS credits FROM public.profiles p
  ),
  cost AS (
    SELECT COALESCE(sum(c.total_cost_usd) FILTER (WHERE NOT c.is_internal), 0) AS ext_usd,
           -- max(), not min(): 'invoice_verified' sorts before 'list_price',
           -- so min() would report the BEST card and overstate the book.
           econ.cost_confidence(max(c.price_confidence) FILTER (WHERE NOT c.is_internal)) AS conf
      FROM cost_engine.v_cost_daily c
     WHERE (p_from IS NULL OR c.occurred_on >= p_from)
       AND (p_to   IS NULL OR c.occurred_on <= p_to)
  ),
  qwi AS (
    -- The Economics layer's ONE definition of a question: the external cost
    -- work item. Never public.question_records — see header.
    SELECT count(*) FILTER (WHERE NOT v.is_internal
                              AND v.work_item_type = 'question') AS ext_items
      FROM cost_engine.v_question_cost_current v
     WHERE v.is_current
       AND (p_from IS NULL OR v.occurred_at::date >= p_from)
       AND (p_to   IS NULL OR v.occurred_at::date <= p_to)
  ),
  calc AS (
    SELECT led.*, usr.n AS users, sold.credits AS sold_credits, sold.conf AS sold_conf,
           liab.credits AS liability, cost.ext_usd, cost.conf AS cost_conf,
           qwi.ext_items,
           CASE WHEN qwi.ext_items = 0 AND led.consumed = 0
                  THEN 'no_external_question_work_items_and_no_credits_consumed'
                WHEN qwi.ext_items = 0 THEN 'no_external_question_work_items'
                WHEN led.consumed = 0  THEN 'no_credits_consumed_in_period'
                ELSE NULL END AS question_block,
           -- Calendar span, so idle days still dilute the burn rate.
           CASE WHEN led.d_from IS NULL THEN 0
                ELSE (led.d_to - led.d_from) + 1 END AS n_days,
           CASE WHEN cost.ext_usd = 0 AND led.consumed = 0
                  THEN 'no_credits_consumed_and_no_external_ai_cost_in_period'
                WHEN led.consumed = 0 THEN 'no_credits_consumed_in_period'
                WHEN cost.ext_usd = 0 THEN 'no_external_ai_cost_in_period'
                ELSE NULL END AS cost_block
      FROM led, usr, sold, liab, cost, qwi
  )
  SELECT c.d_from,
         c.d_to,
         c.sold_credits,                -- sum(integer) -> bigint already
         -- ::bigint REQUIRED here, and caught by the pre-apply type probe.
         -- v_credit_flow.net_credits is itself sum(integer) -> bigint, so
         -- summing it again is sum(bigint) -> NUMERIC. Same mechanism that
         -- broke three RPCs in M2. A credit count is integral, so the cast is
         -- exact and bigint is the honest published type.
         c.granted::bigint,
         c.refunded::bigint,
         c.consumed::bigint,
         c.net_chg::bigint,
         c.liability,                   -- sum(integer) -> bigint already
         c.users,
         -- ::numeric on every numerator: bigint/bigint truncates.
         CASE WHEN c.users > 0
              THEN round(c.consumed::numeric / c.users, 2) END,
         CASE WHEN c.n_days > 0
              THEN round(c.consumed::numeric / c.n_days, 2) END,
         CASE WHEN c.n_days > 0 AND c.consumed > 0
              THEN round(c.liability::numeric
                         / (c.consumed::numeric / c.n_days), 1) END,
         CASE WHEN c.cost_block IS NULL
              THEN round(c.ext_usd / c.consumed::numeric, 8) END,
         c.cost_block,
         -- Credit metrics: ledger ∧ revenue. Never the cost class — a missing
         -- FX rate must not make a counted credit less certain (rule 1).
         econ.worst_confidence(c.conf, c.sold_conf),
         CASE WHEN c.cost_block IS NOT NULL
              THEN econ.worst_confidence(NULL)   -- resolves to 'blocked'
              ELSE econ.worst_confidence(c.conf, c.sold_conf, c.cost_conf) END,
         -- Appended: avg credits per question, blocked by architecture until
         -- external work items exist. The denominator is published alongside
         -- so the blocked state evidences itself rather than asserting.
         c.ext_items,
         CASE WHEN c.question_block IS NULL
              THEN round(c.consumed::numeric / c.ext_items, 2) END,
         c.question_block,
         -- Both sides are COUNTED facts — consumed credits from the ledger,
         -- questions from allocation — so this inherits the ledger class only.
         -- Not the cost class: an unpriced call must not make a counted
         -- question less certain (same reasoning as cost_per_credit, rule 1).
         CASE WHEN c.question_block IS NOT NULL
              THEN econ.worst_confidence(NULL)   -- resolves to 'blocked'
              ELSE econ.worst_confidence(c.conf) END
    FROM calc c;
END;
$$;

REVOKE ALL ON FUNCTION public.owner_econ_credit_summary(date,date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.owner_econ_credit_summary(date,date) FROM anon;
GRANT EXECUTE ON FUNCTION public.owner_econ_credit_summary(date,date) TO authenticated;

COMMENT ON FUNCTION public.owner_econ_credit_summary(date,date) IS
  'Period credit headline for Credits Analytics (Phase 6 M3, Section 4). '
  'Requires role owner. Returns exactly one row. Exists because the Section 4 '
  'KPIs are period aggregates over a daily ledger, and aggregating them in the '
  'dashboard would be a financial calculation in the client (INV-03). Totals '
  'come from econ.v_credit_flow — the same view the panel tabulates — so the '
  'headline reconciles with the table by construction. credits_sold comes from '
  'econ.v_revenue_events instead, because the ledger has no purchase type. '
  'liability_credits_now is a point-in-time snapshot and ignores the date '
  'range. Confidence is derived, never assigned (INV-27).';
