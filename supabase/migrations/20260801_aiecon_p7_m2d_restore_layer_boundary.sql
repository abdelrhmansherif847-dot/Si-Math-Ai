-- ===========================================================================
-- Phase 7 M2d — restore INV-05 and the read-only namespace rule
-- ===========================================================================
-- STATUS: ✅ APPLIED 2026-08-01 as aiecon_p7_m2d_restore_layer_boundary, on
--         owner approval of the M2d engineering review.
--         Pre-apply: type probe, dependency check, namespace check and a DIRECT
--         execution probe of the new writer — 11/11 PASS.
--         Post-apply: P5-01 PASS (0 price-book edges of 44), P5-04 PASS (15
--         functions, 15 STABLE+SECDEF). Economics 17 PASS + 1 VACUOUS; Cost
--         Engine 20 PASS + 5 VACUOUS + 1 WARN — no regression.
--
-- WHY THIS EXISTS
--   The M2 Release Gate's Economics regression suite failed twice, and both
--   failures were caused by M2 itself. Neither verification check is changed —
--   the architecture is corrected and the tests stay exactly as written.
--
--   P5-01 FAIL — econ.v_breakeven_inputs joined cost_engine.fx_rates directly.
--   fx_rates is inside INV-05 / §8.10 rule 8's forbidden set, and worse than
--   the dependency edge: econ was IMPLEMENTING FX POLICY, which belongs to the
--   engine. The correct pattern already existed and was not followed —
--   v_pnl_daily never touches fx_rates, it consumes
--   cost_engine.v_cost_daily.total_cost_egp.
--
--   P5-04 FAIL — owner_econ_set_platform_cost is VOLATILE, but P5-04 asserts
--   every owner_econ_* is STABLE. Measured across the project: owner_econ_* and
--   owner_cost_* have been read-only without exception. The writer leaves the
--   namespace rather than the rule being relaxed.
--
-- SCOPE — EXACTLY THE TWO CAUSES, NOTHING MORE (owner instruction)
--   1. cost_engine.to_egp()            — new FX utility, engine owns the policy
--   2. econ.v_breakeven_inputs         — consumes it; no fx_rates reference
--   3. owner_write_platform_cost()     — the writer, renamed out of owner_econ_
--   4. owner_econ_set_platform_cost()  — dropped
--
--   The P5-01 function-call blind spot is NOT addressed here. It is recorded as
--   a separate Verification Framework Enhancement by owner decision.
--
-- WHAT econ MAY KNOW AFTER THIS (owner decision 1, verbatim condition)
--   econ knows nothing about fx_rates, the conversion policy, month matching or
--   rate lookup. It passes an amount and a month, and receives a value or NULL.
--
-- ROLLBACK
--   DROP FUNCTION IF EXISTS public.owner_write_platform_cost(date,text,numeric,text,text,text);
--   -- restore the old writer from 20260801_aiecon_p7_m2c_...sql (its qualified body)
--   CREATE OR REPLACE VIEW econ.v_breakeven_inputs AS <M2b body, with the fx_rates join>;
--   DROP FUNCTION IF EXISTS cost_engine.to_egp(numeric,date);
--   No column type changes, so CREATE OR REPLACE suffices in both directions.
--   ⚠ Rolling back RESTORES the INV-05 violation. Forward-fix is the correct path.
-- ===========================================================================

-- ── 1. The engine owns FX conversion ──────────────────────────────────────
-- Month-of-occurrence policy (§8.7), identical to cost_engine.run_pricing:
--   WHERE fx.rate_date = date_trunc('month', <when>)::date
-- Stated in exactly one place now, instead of being re-implemented in econ.
--
-- Returns NULL when no rate covers the month. That NULL is load-bearing: it is
-- what lets a caller detect an unconvertible amount and refuse to report a
-- partial total (owner ruling ④ — no FX shortcut, no estimated rate).
--
-- Deliberately does NOT read platform_cost_entries. It converts a number, so
-- §9.4's "platform cost stays outside the Cost Engine" holds as well.
CREATE OR REPLACE FUNCTION cost_engine.to_egp(
  p_amount numeric,
  p_month  date
)
RETURNS numeric
LANGUAGE sql
STABLE
SET search_path = cost_engine, public
AS $$
  SELECT p_amount * fx.usd_to_egp
    FROM cost_engine.fx_rates fx
   WHERE fx.rate_date = date_trunc('month', p_month)::date;
$$;

COMMENT ON FUNCTION cost_engine.to_egp(numeric,date) IS
  'Convert a USD amount to EGP using the rate for that calendar month (§8.7 '
  'month-of-occurrence policy). Returns NULL when no rate covers the month — '
  'callers must treat NULL as unconvertible and refuse to report a partial '
  'total, never substitute an estimate. Exists so the FX policy lives in the '
  'engine and econ can consume a converted value without reading the price book '
  '(INV-05 / §8.10 rule 8).';

-- ── 2. econ consumes a ready value; no fx_rates reference remains ─────────
-- Columns are IDENTICAL to M2b in name, type and order — only the expression
-- behind platform_cost_egp changes. CREATE OR REPLACE therefore cannot break
-- the two dependents (owner_econ_net_profit_series / _summary), and both are
-- re-executed in the probe rather than assumed safe.
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
plat AS (
  SELECT c.period_month,
         count(*)::bigint AS entries_in_period,
         -- "unconvertible" is simply: the engine returned NULL for it. econ does
         -- not inspect rates, months or policy to decide this.
         count(*) FILTER (
           WHERE c.currency = 'USD'
             AND cost_engine.to_egp(c.amount, c.period_month) IS NULL
         )::bigint        AS unconvertible,
         -- NO PARTIAL CONVERSION: one unconvertible entry makes the whole
         -- month NULL, because sum() would otherwise quietly omit it and return
         -- a smaller number that looks complete.
         CASE WHEN count(*) FILTER (
                    WHERE c.currency = 'USD'
                      AND cost_engine.to_egp(c.amount, c.period_month) IS NULL) > 0
              THEN NULL::numeric
              ELSE sum(CASE WHEN c.currency = 'EGP' THEN c.amount
                            ELSE cost_engine.to_egp(c.amount, c.period_month) END)
         END              AS platform_cost_egp
    FROM econ.v_platform_costs_current c
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
       CASE WHEN econ.net_block_reason(m.revenue_egp, m.ai_cost_usd, m.ai_cost_egp,
                                       p.platform_cost_egp,
                                       p.entries_in_period, p.unconvertible) IS NULL
            THEN round(m.revenue_egp - m.ai_cost_egp - p.platform_cost_egp, 4)
            ELSE NULL::numeric
       END AS net_profit_egp,
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
            ELSE econ.worst_confidence(VARIADIC ARRAY[m.confidence, 'actual'])
       END AS net_confidence
  FROM m
  LEFT JOIN plat p ON p.period_month = m.month;

-- ── 3. The writer, in a namespace that says it mutates ────────────────────
-- owner_econ_* = read-only reporting
-- owner_cost_* = read-only reporting
-- owner_write_* = mutations                     ← new, and the only writer
--
-- Body is byte-identical to the M2c-qualified version; only the name changes.
-- Every column reference stays qualified with `e` (the 42702 fix), and the
-- supersede-before-insert order stays (the 23505 fix).
CREATE OR REPLACE FUNCTION public.owner_write_platform_cost(
  p_period_month  date,
  p_category      text,
  p_amount        numeric,
  p_currency      text DEFAULT 'USD',
  p_note          text DEFAULT NULL,
  p_change_reason text DEFAULT NULL
)
RETURNS TABLE (
  id              uuid,
  period_month    date,
  category        text,
  amount          numeric,
  currency        text,
  revision_number integer,
  superseded_id   uuid
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, econ
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_old   public.platform_cost_entries%rowtype;
  v_new   public.platform_cost_entries%rowtype;
  v_cat   text := lower(btrim(p_category));
BEGIN
  IF NOT COALESCE(public.has_role_at_least('owner'::public.user_role), false) THEN
    RAISE EXCEPTION 'forbidden: owner_write_platform_cost requires role owner'
      USING ERRCODE = '42501';
  END IF;

  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'owner_write_platform_cost requires an authenticated actor'
      USING ERRCODE = '42501';
  END IF;

  -- QUALIFIED: RETURNS TABLE output names are variables and would shadow the
  -- columns otherwise (the 42702 defect found at the M2 gate).
  SELECT e.* INTO v_old
    FROM public.platform_cost_entries e
   WHERE e.period_month = p_period_month AND e.category = v_cat AND e.is_current;

  IF v_old.id IS NOT NULL AND p_change_reason IS NULL THEN
    RAISE EXCEPTION
      'correcting an existing platform cost requires p_change_reason: financial figures are not changed without a recorded reason'
      USING ERRCODE = '23514';
  END IF;

  -- ORDER IS LOAD-BEARING: supersede BEFORE insert. pce_one_current is a
  -- PARTIAL unique index, enforced immediately and not deferrable.
  IF v_old.id IS NOT NULL THEN
    UPDATE public.platform_cost_entries e
       SET is_current = false, superseded_at = now(), superseded_by = v_actor
     WHERE e.id = v_old.id;
  END IF;

  INSERT INTO public.platform_cost_entries
    (period_month, category, amount, currency, note,
     revision_number, supersedes_id, created_by, change_reason)
  VALUES
    (p_period_month, v_cat, p_amount, p_currency, p_note,
     COALESCE(v_old.revision_number, 0) + 1, v_old.id, v_actor, p_change_reason)
  RETURNING * INTO v_new;

  RETURN QUERY
  SELECT v_new.id, v_new.period_month, v_new.category, v_new.amount,
         v_new.currency, v_new.revision_number, v_old.id;
END;
$$;

REVOKE ALL ON FUNCTION public.owner_write_platform_cost(date,text,numeric,text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.owner_write_platform_cost(date,text,numeric,text,text,text) FROM anon;
GRANT EXECUTE ON FUNCTION public.owner_write_platform_cost(date,text,numeric,text,text,text) TO authenticated;

COMMENT ON FUNCTION public.owner_write_platform_cost(date,text,numeric,text,text,text) IS
  'Record or correct a platform cost for a month. Requires role owner. VOLATILE '
  'by necessity — the one deliberate writer in AI Economics, writing a cost '
  'INPUT and never product pricing (§9.4). Named owner_write_* rather than '
  'owner_econ_* so the project rule holds without exception: owner_econ_* and '
  'owner_cost_* are read-only, owner_write_* mutates. A correction never '
  'overwrites — it inserts a new revision, marks the previous row '
  'is_current=false, and must state p_change_reason.';

-- ── 4. Remove the writer from the read-only namespace ─────────────────────
-- Safe, and measured rather than assumed: no function references it,
-- admin.html does not reference it, and it has written 0 rows. It was broken by
-- 42702 from creation until M2c, so nothing can depend on it.
DROP FUNCTION IF EXISTS public.owner_econ_set_platform_cost(date,text,numeric,text,text,text);
