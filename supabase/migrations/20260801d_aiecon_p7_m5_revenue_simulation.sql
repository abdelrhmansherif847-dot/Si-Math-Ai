-- =====================================================================
-- Phase 7 · M5 — owner_econ_simulate(): revenue-side (packages) simulation
-- =====================================================================
-- STATUS: ⛔ PREPARED — NOT YET APPLIED. Awaiting owner approval of the
--         M5 engineering review.
--
-- OWNER RULINGS THIS IMPLEMENTS (2026-08-01)
-- ------------------------------------------
--   1. `operations` REFUSES with a MEASURED reason rather than producing an
--      incomplete simulation. It must not simulate only the subset that happens
--      to match today's data.
--   2. The staff exclusion is NOT implemented. The compatibility review
--      (docs/roadmap/phase-7-m5-compatibility-review.md) found that existing
--      consumers DO depend on the current behaviour — 6 revenue RPCs are wired
--      into admin.html, two tiles read "Total Revenue" = 8542 EGP, and 4 econ
--      views depend on the revenue views. So the default is UNCHANGED: total
--      revenue is the basis, and all three figures are returned explicitly.
--   3. `owner_econ_simulate` is EXTENDED, not replaced. One canonical Section 10
--      surface; the existing API contract is preserved.
--
-- CREATE OR REPLACE on an unchanged signature: no DROP, therefore no default-ACL
-- reset. The M1 privilege lesson still applies as a POST-APPLY VERIFICATION —
-- the revokes below are harmless and idempotent, and the gate checks grants.
--
-- WHY `operations` REFUSES — measured on production 2026-08-01
-- ------------------------------------------------------------
--   CONSUME rows ............................... 373 across 7 users
--   reference_id resolving to question_records .   0 of 373
--   FK credit_transactions -> credit_costs ..... none (join is on FREE TEXT)
--   rows mapping to no feature .................  16  ("AI_CHAT_MESSAGE (pack:5)")
--   rows charged <> current credit_cost ........   1  (CHAT_TEXT charged 30, now 5)
--   identity re-charge reproduces .............. 356 of 373  -> conservation FAILS
--   AI_CHAT_MESSAGE (348) vs CHAT_TEXT (7) ..... two names, one operation
--
-- The last line is decisive. §11's own worked example is {"CHAT_TEXT": 8}. On
-- production that re-charges 7 of 373 rows — 1.9% — and silently leaves 348
-- untouched. A confident number computed from almost nothing is the exact defect
-- class M1 exists to eliminate, so `operations` refuses instead.
--
-- The refusal is MEASURED, not hardcoded (the M4 pattern): when the feature
-- namespace is repaired, the refusal lifts by itself with no edit here.
--
-- WHAT `packages` DOES — and why it is trustworthy
-- ------------------------------------------------
--   revenue events ......... 8, all via payment_requests, all subscriptions
--   recorded gross ......... 8542 EGP
--   same at list price ..... 8542 EGP   variance 0  -> identity CONSERVES exactly
--
-- But that equality is a MEASURED FACT, not a structural guarantee:
-- econ.v_revenue_events takes its amount from payment_requests.amount_egp —
-- what was actually PAID — not from plan_definitions.amount_egp. The first
-- discount or price change breaks the equality. Per Lesson 5 this is measured on
-- every run and refused when it does not hold, never assumed.
--
-- SCOPE: 1 function replaced in place. No view, no table, no cost_engine object.
-- No econ->cost_engine edge added, so INV-05 and P5-01 are untouched.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.owner_econ_simulate(p_scenario jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public','econ','cost_engine','ai_catalog' AS $fn$
DECLARE
  c_allowed  constant text[] := ARRAY['basis_window','service_swap','model_swap',
                                      'rate_override','discounts','fx','include_internal',
                                      'packages','operations','demand'];
  c_cost_keys constant text[] := ARRAY['basis_window','service_swap','model_swap',
                                       'rate_override','discounts','fx','include_internal'];
  v_scn   jsonb := COALESCE(p_scenario,'{}'::jsonb);
  v_bad   text[];
  v_cost_scn jsonb := '{}'::jsonb;
  v_pkg   jsonb;
  v_k text; v_v text; v_elast numeric; v_incl boolean;
  v_from timestamptz; v_to timestamptz;
  r_cost jsonb;
  v_cost_users bigint; v_cost_users_ext bigint;
  v_rev_users bigint; v_shared_users bigint; v_shared_ext bigint; v_shared_days bigint;
  v_rev_rows bigint;
  v_profit_reason text; v_profit_detail text;
  v_notes text[] := ARRAY[]::text[];
  -- revenue
  v_rev_actual numeric; v_rev_sim numeric; v_rev_list numeric;
  v_rev_ext numeric; v_rev_staff numeric; v_rev_variance numeric;
  v_by_plan jsonb;
  v_credits_actual numeric;
  -- operations gate
  v_unmappable bigint; v_diverged bigint; v_ambiguous text;
  v_credits_reason text; v_credits_detail text;
BEGIN
  IF NOT COALESCE(public.has_role_at_least('owner'::public.user_role), false) THEN
    RAISE EXCEPTION 'forbidden: owner_econ_simulate requires role owner' USING ERRCODE='42501';
  END IF;
  IF jsonb_typeof(v_scn) <> 'object' THEN
    RETURN jsonb_build_object('ok',false,'reason','invalid_scenario','simulated',true,'run_id',NULL);
  END IF;
  SELECT array_agg(k ORDER BY k) INTO v_bad
    FROM jsonb_object_keys(v_scn) AS k WHERE k <> ALL (c_allowed);
  IF v_bad IS NOT NULL THEN
    RETURN jsonb_build_object('ok',false,'reason','unsupported_scenario_key','keys',to_jsonb(v_bad),
      'supported',to_jsonb(c_allowed),'simulated',true,'run_id',NULL);
  END IF;

  -- ── RULING 3 (M4): non-zero elasticity refused, never ignored ────────────
  IF v_scn ? 'demand' THEN
    IF jsonb_typeof(v_scn->'demand') <> 'object' THEN
      RETURN jsonb_build_object('ok',false,'reason','invalid_demand','simulated',true,'run_id',NULL);
    END IF;
    BEGIN v_elast := COALESCE((v_scn#>>'{demand,elasticity}')::numeric, 0);
    EXCEPTION WHEN others THEN
      RETURN jsonb_build_object('ok',false,'reason','invalid_demand','simulated',true,'run_id',NULL); END;
    IF v_elast <> 0 THEN
      RETURN jsonb_build_object('ok',false,'reason','elasticity_unsupported','elasticity',v_elast,
        'detail','demand is held constant; no demand model is supported by the current data',
        'simulated',true,'run_id',NULL);
    END IF;
  END IF;

  -- ── Measure the credit-namespace health ONCE; used by two paths ──────────
  SELECT count(*) INTO v_unmappable
    FROM public.credit_transactions ct
   WHERE ct.transaction_type='CONSUME'
     AND NOT EXISTS (SELECT 1 FROM public.credit_costs cc WHERE cc.feature_name = ct.description);
  SELECT count(*) INTO v_diverged
    FROM public.credit_transactions ct
    JOIN public.credit_costs cc ON cc.feature_name = ct.description
   WHERE ct.transaction_type='CONSUME' AND -ct.credits <> cc.credit_cost;
  -- two active features sharing a credit_cost AND both actually consumed
  SELECT string_agg(DISTINCT a.feature_name||'/'||b.feature_name, ', ') INTO v_ambiguous
    FROM public.credit_costs a
    JOIN public.credit_costs b
      ON b.credit_cost = a.credit_cost AND b.feature_name > a.feature_name
     AND a.active AND b.active
   WHERE EXISTS (SELECT 1 FROM public.credit_transactions t
                  WHERE t.transaction_type='CONSUME' AND t.description = a.feature_name)
     AND EXISTS (SELECT 1 FROM public.credit_transactions t
                  WHERE t.transaction_type='CONSUME' AND t.description = b.feature_name);

  IF v_unmappable > 0 THEN
    v_credits_reason := 'unmappable_credit_transactions';
    v_credits_detail := format('%s CONSUME row(s) carry a description that matches no credit_costs feature; the feature key is free text with no foreign key', v_unmappable);
  ELSIF v_ambiguous IS NOT NULL THEN
    v_credits_reason := 'ambiguous_feature_namespace';
    v_credits_detail := format('two active features share a credit cost and both are consumed (%s); an operations override would move only one of them', v_ambiguous);
  ELSIF v_diverged > 0 THEN
    v_credits_reason := 'credit_charge_history_diverged';
    v_credits_detail := format('%s CONSUME row(s) were charged differently from the current credit_cost, so an identity re-charge cannot reproduce history', v_diverged);
  END IF;

  -- ── RULING 1: `operations` REFUSES on measured evidence ──────────────────
  --    Never a partial simulation of the subset that happens to match.
  IF v_scn ? 'operations' THEN
    IF v_credits_reason IS NULL THEN
      -- namespace is healthy but the simulation itself is still unbuilt
      RETURN jsonb_build_object('ok',false,'reason','operations_simulation_not_implemented',
        'detail','the credit feature namespace is now clean; operations simulation can be built',
        'simulated',true,'run_id',NULL);
    END IF;
    RETURN jsonb_build_object('ok',false,'reason',v_credits_reason,'detail',v_credits_detail,
      'measured',jsonb_build_object(
        'consume_rows',(SELECT count(*) FROM public.credit_transactions WHERE transaction_type='CONSUME'),
        'unmappable_rows',v_unmappable,'diverged_rows',v_diverged,
        'ambiguous_features',COALESCE(v_ambiguous,'none')),
      'simulated',true,'run_id',NULL);
  END IF;

  -- ── Validate `packages` ─────────────────────────────────────────────────
  v_pkg := COALESCE(v_scn->'packages','{}'::jsonb);
  IF jsonb_typeof(v_pkg) <> 'object' THEN
    RETURN jsonb_build_object('ok',false,'reason','invalid_packages','simulated',true,'run_id',NULL);
  END IF;
  FOR v_k, v_v IN SELECT e.key, e.value FROM jsonb_each_text(v_pkg) AS e LOOP
    IF NOT EXISTS (SELECT 1 FROM public.plan_definitions pd WHERE pd.plan_code = v_k) THEN
      RETURN jsonb_build_object('ok',false,'reason','unknown_plan_in_packages','plan_code',v_k,
        'known_plans',(SELECT to_jsonb(array_agg(pd.plan_code ORDER BY pd.plan_code)) FROM public.plan_definitions pd),
        'simulated',true,'run_id',NULL);
    END IF;
    BEGIN
      IF v_v::numeric < 0 THEN
        RETURN jsonb_build_object('ok',false,'reason','invalid_package_price','plan_code',v_k,'simulated',true,'run_id',NULL);
      END IF;
    EXCEPTION WHEN others THEN
      RETURN jsonb_build_object('ok',false,'reason','invalid_package_price','plan_code',v_k,'simulated',true,'run_id',NULL); END;
  END LOOP;

  -- ── Cost side: delegate, propagate refusals (RULING 4, M4) ──────────────
  FOREACH v_k IN ARRAY c_cost_keys LOOP
    IF v_scn ? v_k THEN v_cost_scn := jsonb_set(v_cost_scn, ARRAY[v_k], v_scn->v_k); END IF;
  END LOOP;
  r_cost := public.owner_cost_reprice(v_cost_scn);
  IF NOT COALESCE((r_cost->>'ok')::boolean, false) THEN
    RETURN jsonb_build_object('ok',false,'stage','cost','reason',r_cost->>'reason',
      'cost_refusal',r_cost,'simulated',true,'run_id',NULL);
  END IF;
  v_incl := COALESCE((r_cost#>>'{basis,include_internal}')::boolean, false);
  v_from := (r_cost#>>'{basis,from}')::timestamptz;
  v_to   := (r_cost#>>'{basis,to}')::timestamptz;

  -- ── Revenue: measure the identity precondition BEFORE simulating ────────
  --    Recorded amount must equal the plan list price for every event in the
  --    window, or an identity re-price silently disagrees with recorded revenue.
  SELECT sum(e.gross_amount_egp), sum(pd.amount_egp), count(*)
    INTO v_rev_actual, v_rev_list, v_rev_rows
    FROM econ.v_revenue_events e
    LEFT JOIN public.plan_definitions pd ON pd.plan_code = e.plan_code
   WHERE e.recognized_from >= v_from AND e.recognized_from < v_to;
  v_rev_actual := COALESCE(v_rev_actual,0);
  v_rev_variance := COALESCE(v_rev_actual,0) - COALESCE(v_rev_list,0);

  IF v_rev_rows = 0 THEN
    RETURN jsonb_build_object('ok',false,'reason','no_revenue_events_in_window',
      'from',v_from,'to',v_to,'simulated',true,'run_id',NULL);
  END IF;
  IF EXISTS (SELECT 1 FROM econ.v_revenue_events e
              LEFT JOIN public.plan_definitions pd ON pd.plan_code = e.plan_code
             WHERE e.recognized_from >= v_from AND e.recognized_from < v_to
               AND (pd.plan_code IS NULL OR e.gross_amount_egp IS DISTINCT FROM pd.amount_egp)) THEN
    RETURN jsonb_build_object('ok',false,'reason','recorded_revenue_differs_from_list_price',
      'detail','revenue is sourced from the amount actually paid, not the plan list price; an identity re-price would disagree with recorded revenue',
      'recorded_egp',v_rev_actual,'list_price_egp',v_rev_list,'variance_egp',v_rev_variance,
      'events',v_rev_rows,'simulated',true,'run_id',NULL);
  END IF;

  -- Re-price: scenario price where named, plan list price otherwise. Volume
  -- held constant — 3 PRO_MONTHLY purchases stay 3 purchases.
  SELECT sum(g.sim_egp),
         jsonb_agg(jsonb_build_object(
           'plan_code',    g.plan_code,
           'purchases',    g.purchases,
           'actual_egp',   round(g.actual_egp,4),
           'simulated_egp',round(g.sim_egp,4),
           'delta_egp',    round(g.sim_egp - g.actual_egp,4))
         ORDER BY g.plan_code)
    INTO v_rev_sim, v_by_plan
    FROM (SELECT e.plan_code,
                 count(*)                 AS purchases,
                 sum(e.gross_amount_egp)  AS actual_egp,
                 sum(COALESCE((v_pkg->>e.plan_code)::numeric, pd.amount_egp)) AS sim_egp
            FROM econ.v_revenue_events e
            JOIN public.plan_definitions pd ON pd.plan_code = e.plan_code
           WHERE e.recognized_from >= v_from AND e.recognized_from < v_to
           GROUP BY e.plan_code) g;

  -- staff / external split, reported but NOT applied (compatibility review)
  SELECT COALESCE(sum(e.gross_amount_egp) FILTER (WHERE NOT (p.role IN ('owner','admin') OR p.is_admin)),0),
         COALESCE(sum(e.gross_amount_egp) FILTER (WHERE (p.role IN ('owner','admin') OR p.is_admin)),0)
    INTO v_rev_ext, v_rev_staff
    FROM econ.v_revenue_events e
    LEFT JOIN public.profiles p ON p.id = e.user_id
   WHERE e.recognized_from >= v_from AND e.recognized_from < v_to;

  SELECT COALESCE(-sum(ct.credits),0) INTO v_credits_actual
    FROM public.credit_transactions ct
   WHERE ct.transaction_type='CONSUME'
     AND ct.created_at >= v_from AND ct.created_at < v_to;

  -- inert package overrides are NOTED, not refused (the M1 precedent)
  FOR v_k IN SELECT jsonb_object_keys(v_pkg) LOOP
    IF NOT EXISTS (SELECT 1 FROM econ.v_revenue_events e
                    WHERE e.plan_code = v_k AND e.recognized_from >= v_from AND e.recognized_from < v_to) THEN
      v_notes := v_notes || ('package_override_inert: '||v_k);
    END IF;
  END LOOP;

  -- ── Cost/revenue overlap — unchanged from M4, still gates profit ────────
  SELECT count(DISTINCT f.user_id), count(DISTINCT f.user_id) FILTER (WHERE NOT f.is_internal)
    INTO v_cost_users, v_cost_users_ext
    FROM cost_engine.cost_facts f
   WHERE f.is_current AND f.occurred_at >= v_from AND f.occurred_at < v_to
     AND (v_incl OR NOT f.is_internal) AND f.user_id IS NOT NULL;
  SELECT count(DISTINCT e.user_id) INTO v_rev_users
    FROM econ.v_revenue_events e
   WHERE e.user_id IS NOT NULL AND e.recognized_from < v_to
     AND (e.recognized_from + make_interval(days => GREATEST(COALESCE(e.period_days,1),1))) > v_from;
  SELECT count(*) INTO v_shared_users FROM (
    SELECT DISTINCT f.user_id FROM cost_engine.cost_facts f
     WHERE f.is_current AND f.occurred_at >= v_from AND f.occurred_at < v_to
       AND (v_incl OR NOT f.is_internal) AND f.user_id IS NOT NULL
    INTERSECT
    SELECT DISTINCT e.user_id FROM econ.v_revenue_events e
     WHERE e.user_id IS NOT NULL AND e.recognized_from < v_to
       AND (e.recognized_from + make_interval(days => GREATEST(COALESCE(e.period_days,1),1))) > v_from) s;
  SELECT count(*) INTO v_shared_ext FROM (
    SELECT DISTINCT f.user_id FROM cost_engine.cost_facts f
     WHERE f.is_current AND f.occurred_at >= v_from AND f.occurred_at < v_to
       AND NOT f.is_internal AND f.user_id IS NOT NULL
    INTERSECT
    SELECT DISTINCT e.user_id FROM econ.v_revenue_events e
     WHERE e.user_id IS NOT NULL AND e.recognized_from < v_to
       AND (e.recognized_from + make_interval(days => GREATEST(COALESCE(e.period_days,1),1))) > v_from) s;
  SELECT count(*) INTO v_shared_days FROM (
    SELECT DISTINCT f.occurred_at::date AS d FROM cost_engine.cost_facts f
     WHERE f.is_current AND f.occurred_at >= v_from AND f.occurred_at < v_to AND NOT f.is_internal
    INTERSECT
    SELECT DISTINCT g.d::date FROM econ.v_revenue_events e
      CROSS JOIN LATERAL generate_series(e.recognized_from,
        e.recognized_from + make_interval(days => GREATEST(COALESCE(e.period_days,1),1) - 1),
        interval '1 day') AS g(d)
     WHERE e.user_id IS NOT NULL AND g.d >= v_from AND g.d < v_to) s;

  IF v_shared_ext = 0 OR v_shared_days = 0 THEN
    v_profit_reason := 'disjoint_cost_and_revenue_populations';
    v_profit_detail := format(
      'cost covers %s user(s) (%s external) and revenue covers %s user(s) in this window; %s shared external user(s), %s shared external day(s) - profit would compare unrelated populations',
      v_cost_users, v_cost_users_ext, v_rev_users, v_shared_ext, v_shared_days);
  ELSE
    v_profit_reason := 'revenue_and_cost_currencies_unreconciled';
    v_profit_detail := format(
      'cost and revenue overlap on %s external user(s) and %s day(s); profit additionally requires an FX rate to reconcile USD cost with EGP revenue',
      v_shared_ext, v_shared_days);
  END IF;

  v_notes := v_notes || ARRAY(SELECT jsonb_array_elements_text(COALESCE(r_cost->'notes','[]'::jsonb)));

  RETURN jsonb_build_object(
    'ok', true, 'simulated', true, 'run_id', NULL, 'milestone', 'M5',
    'basis', (r_cost->'basis') || jsonb_build_object(
      'cost_users', v_cost_users, 'cost_users_external', v_cost_users_ext,
      'revenue_users', v_rev_users, 'revenue_events', v_rev_rows,
      'shared_users', v_shared_users, 'shared_users_external', v_shared_ext,
      'shared_days_external', v_shared_days,
      'purchase_volume','held_constant'),
    'scenario_echo', v_scn, 'notes', to_jsonb(v_notes),
    'cost', jsonb_build_object(
      'actual_usd',(r_cost#>>'{totals,actual_cost_usd}')::numeric,
      'simulated_usd',(r_cost#>>'{totals,simulated_cost_usd}')::numeric,
      'delta_usd',(r_cost#>>'{totals,delta_usd}')::numeric,
      'delta_pct',(r_cost#>>'{totals,delta_pct}')::numeric,
      'actual_egp',(r_cost#>>'{totals,actual_cost_egp}')::numeric,
      'simulated_egp',(r_cost#>>'{totals,simulated_cost_egp}')::numeric,
      'fx_rate',(r_cost#>>'{totals,fx_rate}')::numeric,
      'fx_source',r_cost#>>'{totals,fx_source}',
      'egp_blocked_reason',r_cost#>>'{totals,egp_blocked_reason}',
      'by_service',COALESCE(r_cost->'by_service','[]'::jsonb),
      'calls',(r_cost#>>'{basis,calls}')::bigint,
      'population',CASE WHEN v_incl THEN 'includes_internal' ELSE 'external_only' END,
      'confidence','modeled'),
    'revenue', jsonb_build_object(
      'actual_egp', round(v_rev_actual,4),
      'simulated_egp', round(v_rev_sim,4),
      'delta_egp', round(v_rev_sim - v_rev_actual,4),
      'delta_pct', CASE WHEN v_rev_actual=0 THEN NULL
                        ELSE round((v_rev_sim - v_rev_actual)/v_rev_actual*100,4) END,
      'purchases', v_rev_rows,
      'by_plan', COALESCE(v_by_plan,'[]'::jsonb),
      -- compatibility review: default UNCHANGED, all three published
      'population','all_purchases',
      'total_revenue_egp', round(v_rev_actual,4),
      'external_revenue_egp', round(v_rev_ext,4),
      'staff_revenue_egp', round(v_rev_staff,4),
      'confidence','modeled',
      'credits_consumed_actual', v_credits_actual,
      'credits_consumed_simulated', NULL,
      'credits_block_reason', COALESCE(v_credits_reason,'operations_simulation_not_implemented'),
      'credits_block_detail', COALESCE(v_credits_detail,
        'the credit feature namespace is clean; operations simulation can be built')),
    'profit', jsonb_build_object('value',NULL,'margin_pct',NULL,'confidence','blocked',
      'block_reason',v_profit_reason,'detail',v_profit_detail));
END; $fn$;

-- Idempotent and harmless on CREATE OR REPLACE (no ACL reset without a DROP),
-- kept so a from-scratch replay is correct in one pass. Grants are verified
-- after apply regardless — the M1 lesson.
REVOKE ALL ON FUNCTION public.owner_econ_simulate(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.owner_econ_simulate(jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.owner_econ_simulate(jsonb) TO authenticated;

COMMENT ON FUNCTION public.owner_econ_simulate(jsonb) IS
  'Owner-only Section 10 simulator (M5: cost + packages revenue). Delegates cost to owner_cost_reprice() and never re-implements provider pricing. `packages` re-prices purchases with volume held constant; an identity re-price must reproduce recorded revenue exactly, and the recorded-vs-list-price precondition is MEASURED every run and refused when it breaks. `operations` REFUSES with a measured reason (unmappable_credit_transactions / ambiguous_feature_namespace / credit_charge_history_diverged) rather than simulating the subset that happens to match. Revenue basis is TOTAL, unchanged per the M5 compatibility review; total/external/staff are all returned. PROFIT IS ALWAYS BLOCKED and never computed. STABLE: cannot write.';
