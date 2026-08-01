-- ===========================================================================
-- Phase 6 M4.2 — extend student economics for Section 8
-- ===========================================================================
-- STATUS: ⛔ PREPARED, NOT APPLIED. Requires individual owner approval before
--         apply_migration (CLAUDE.md §3). Owner instruction for M4.2: end at
--         implementation + engineering review; no apply, no Release Gate.
--
-- WHY A DROP + RECREATE (owner Decision 3, 2026-08-01)
--   Section 8 needs credits consumed, usage rate and an anomaly flag alongside
--   the revenue/cost/profit this RPC already returns. CREATE OR REPLACE cannot
--   WIDEN a RETURNS TABLE ("cannot change return type of existing function"),
--   so an explicit DROP is required first. Without it the migration appears to
--   succeed while the RPC silently keeps its old 10-column shape — a failure
--   this project has hit twice (Phase 6 M1 coverage split, Phase 5 view chain).
--
--   The owner ruled: extend this function rather than add a second student RPC.
--   Two partially-overlapping student surfaces could silently diverge, which is
--   the same "two definitions of one thing" hazard the M3 ADR rejected for the
--   question denominator. One canonical source is preferable.
--
--   SAFETY OF THE DROP: nothing consumes this function today. Section 8 is its
--   first consumer and admin.html is not deployed. The 10 existing columns keep
--   their names, types, positions and meaning; 9 columns are APPENDED.
--
-- WHAT IT ADDS (appended, positions 11-19)
--   credits_consumed            credits burned in the period
--   active_days                 distinct days the student consumed anything
--   period_days                 the denominator — see below
--   avg_daily_usage             credits_consumed / period_days
--   avg_cost_per_question_usd   cost_usd / questions, blocked when cost is absent
--   credits_confidence          ledger class, INDEPENDENT of the cost class
--   usage_anomaly               statistical outlier flag — blocked, see below
--   usage_anomaly_reason        why it is blocked
--   usage_anomaly_confidence    'blocked' while unavailable
--
-- OWNER DECISION 4 — the denominator is the CALENDAR SPAN, and this is locked
--   avg_daily_usage divides by period_days = (last ledger day - first ledger
--   day + 1) across the scoped ledger — the SAME denominator for every student,
--   not each student's own active-day count.
--
--   Measured 2026-08-01: the ledger spans 44 calendar days while individual
--   students were active on only 1-9 days. Dividing by active days would report
--   a burst rate ("credits per day they showed up"), which flatters a student
--   who used the product once and heavily. Dividing by the calendar span
--   reports a sustained rate, which is what a burn figure means.
--
--   This matches owner_econ_credit_summary().avg_daily_burn exactly, so the
--   per-student rates sum consistently with the platform rate. DO NOT change
--   this to active-days later without revisiting that consistency — it is a
--   locked decision, not an incidental choice.
--
-- OWNER DECISION 1 — NO personally identifiable information
--   This RPC exposes user_id and nothing else identifying. It does NOT read
--   profiles.full_name or profiles.email, and must not.
--
--   Section 8 is an owner dashboard but it is an ECONOMICS dashboard, not a
--   CRM. If a student ever needs to be identified, that belongs in a separate
--   drill-down flow outside the economics layer. The pseudonymous UUID is the
--   stable identifier here, matching what owner_cost_metrics('student')
--   already returns.
--
-- OWNER DECISION 2 — the statistical anomaly ships BLOCKED, and unblocks itself
--   The architecture asks for a >3-sigma abnormal-usage flag. Measured
--   2026-08-01 the population is n=7, mean 272.57, stddev 483.62 — a standard
--   deviation LARGER than the mean — with a 3-sigma threshold at 1,723 against
--   an observed max of 1,355. The flag could never fire, and at n=7 the
--   statistic is noise wearing the costume of rigour.
--
--   So usage_anomaly is NULL with usage_anomaly_reason =
--   'insufficient_population' and confidence 'blocked' until the population
--   supports it. The threshold is n >= 30: the conventional point at which a
--   sample standard deviation is treated as a usable estimator. It is evaluated
--   FROM DATA on every call, so the metric unblocks automatically with no code
--   change the moment the population reaches it (owner rule 4).
--
--   The deterministic indicator ships now and is unaffected:
--   cost_exceeds_revenue is exact, needs no population, and already exists.
--
-- ON TYPES — every trap in this function, named
--   v_student_economics.questions      sum(bigint)  -> numeric  -> ::bigint
--   sum(credit_transactions.credits)   sum(integer) -> bigint   -> no cast
--   count(DISTINCT day)                             -> bigint   -> no cast
--   bigint / bigint performs INTEGER DIVISION and truncates, so every ratio
--   casts its numerator to numeric first. Verified by the mandatory pre-apply
--   type probe before this file was committed.
--
-- ROLLBACK
--   DROP FUNCTION IF EXISTS public.owner_econ_student_economics(integer);
--   then re-apply the 10-column definition from
--   20260801_aiecon_p5_fix_rpc_count_types.sql.
-- ===========================================================================

-- DROP first: CREATE OR REPLACE cannot widen a RETURNS TABLE. Without this the
-- migration reports success while the RPC keeps its old shape.
DROP FUNCTION IF EXISTS public.owner_econ_student_economics(integer);

CREATE FUNCTION public.owner_econ_student_economics(
  p_limit integer DEFAULT 100
)
RETURNS TABLE (
  -- positions 1-10: unchanged in name, type, position and meaning
  user_id                   uuid,
  revenue_egp               numeric,
  cost_usd                  numeric,
  cost_egp                  numeric,
  questions                 bigint,
  cost_completeness         text,
  profit_egp                numeric,
  cost_exceeds_revenue      boolean,
  block_reason              text,
  confidence                text,
  -- positions 11-19: appended
  credits_consumed          bigint,
  active_days               bigint,
  period_days               bigint,
  avg_daily_usage           numeric,
  avg_cost_per_question_usd numeric,
  credits_confidence        text,
  usage_anomaly             boolean,
  usage_anomaly_reason      text,
  usage_anomaly_confidence  text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, econ, cost_engine, ai_catalog
AS $$
BEGIN
  IF NOT COALESCE(public.has_role_at_least('owner'::public.user_role), false) THEN
    RAISE EXCEPTION 'forbidden: owner_econ_student_economics requires role owner'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH consumption AS (
    -- Credits burned per student. No PII: user_id only (Decision 1).
    SELECT ct.user_id,
           COALESCE(-sum(ct.credits), 0)          AS credits_consumed,
           count(DISTINCT ct.created_at::date)    AS active_days,
           econ.worst_confidence(VARIADIC array_agg(DISTINCT
             econ.ledger_confidence(ct.transaction_type))) AS credits_conf
      FROM public.credit_transactions ct
     WHERE ct.transaction_type = 'CONSUME'
     GROUP BY ct.user_id
  ),
  span AS (
    -- Decision 4: ONE calendar span shared by every student, matching
    -- owner_econ_credit_summary().avg_daily_burn. Not per-student active days.
    --
    -- ::bigint is REQUIRED and was caught by the pre-apply probe: date - date
    -- yields INTEGER in PostgreSQL, not bigint, so this column would otherwise
    -- raise 42804 against its bigint declaration. Widening integer -> bigint is
    -- lossless, and bigint keeps it consistent with the other count columns.
    SELECT CASE WHEN min(ct.created_at::date) IS NULL THEN 0
                ELSE (max(ct.created_at::date) - min(ct.created_at::date)) + 1
           END::bigint AS period_days
      FROM public.credit_transactions ct
  ),
  population AS (
    -- Decision 2: evaluated from data every call, so the metric unblocks
    -- automatically once the population is large enough. n >= 30 is the
    -- conventional threshold for treating a sample stddev as usable.
    SELECT count(*)                    AS n_students,
           avg(c.credits_consumed)     AS mean_consumed,
           stddev_samp(c.credits_consumed) AS sd_consumed
      FROM consumption c
  ),
  scoped AS (
    SELECT v.*,
           COALESCE(c.credits_consumed, 0) AS credits_consumed,
           COALESCE(c.active_days, 0)      AS active_days,
           c.credits_conf
      FROM econ.v_student_economics v
      LEFT JOIN consumption c ON c.user_id = v.user_id
     ORDER BY v.cost_usd DESC NULLS LAST, v.revenue_egp DESC NULLS LAST
     LIMIT COALESCE(p_limit, 100)
  )
  SELECT s.user_id,
         s.revenue_egp,
         s.cost_usd,
         s.cost_egp,
         s.questions::bigint,          -- sum(bigint) -> numeric; a count is integral
         s.cost_completeness,
         s.profit_egp,
         s.cost_exceeds_revenue,       -- the deterministic anomaly flag (Decision 2)
         s.block_reason,
         s.confidence,
         s.credits_consumed,
         s.active_days,
         sp.period_days,
         -- ::numeric first: bigint / bigint truncates.
         CASE WHEN sp.period_days > 0
              THEN round(s.credits_consumed::numeric / sp.period_days, 2) END,
         CASE WHEN s.cost_usd IS NOT NULL AND s.questions > 0
              THEN round(s.cost_usd / s.questions::numeric, 8) END,
         -- Ledger class only. A missing FX rate must not make a counted credit
         -- less certain (owner rule 1, as in owner_econ_credit_summary).
         COALESCE(s.credits_conf, econ.worst_confidence(NULL)),
         CASE WHEN p.n_students >= 30 AND p.sd_consumed IS NOT NULL AND p.sd_consumed > 0
              THEN s.credits_consumed::numeric > p.mean_consumed + (3 * p.sd_consumed)
         END,
         CASE WHEN p.n_students < 30 THEN 'insufficient_population'
              WHEN p.sd_consumed IS NULL OR p.sd_consumed = 0
                   THEN 'no_variance_in_population'
              ELSE NULL END,
         CASE WHEN p.n_students >= 30 AND p.sd_consumed IS NOT NULL AND p.sd_consumed > 0
              THEN COALESCE(s.credits_conf, econ.worst_confidence(NULL))
              ELSE econ.worst_confidence(NULL) END   -- resolves to 'blocked'
    FROM scoped s, span sp, population p;
END;
$$;

REVOKE ALL ON FUNCTION public.owner_econ_student_economics(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.owner_econ_student_economics(integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.owner_econ_student_economics(integer) TO authenticated;

COMMENT ON FUNCTION public.owner_econ_student_economics(integer) IS
  'Per-student economics and consumption for Section 8 (Phase 6 M4.2). '
  'Requires role owner. The canonical per-student surface — deliberately the '
  'only one, so no second overlapping definition can diverge from it. Exposes '
  'user_id and NO personally identifying field: this is an economics dashboard, '
  'not a CRM (owner Decision 1, 2026-08-01). avg_daily_usage divides by the '
  'shared calendar span, matching owner_econ_credit_summary().avg_daily_burn '
  '(Decision 4). The statistical usage_anomaly is blocked with '
  'insufficient_population until n >= 30 and unblocks from data with no code '
  'change; the deterministic cost_exceeds_revenue indicator ships now '
  '(Decision 2). Credit confidence is independent of cost confidence (INV-27).';
