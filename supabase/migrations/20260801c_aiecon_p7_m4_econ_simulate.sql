-- =====================================================================
-- Phase 7 · M4 — public.owner_econ_simulate(): cost-side simulator
-- =====================================================================
-- STATUS: ⛔ PREPARED — NOT YET APPLIED. Awaiting owner approval of the
--         M4 engineering review (docs/roadmap/phase-7-m4-engineering-review.md).
--
-- OWNER RULINGS THIS IMPLEMENTS (2026-08-01)
-- ------------------------------------------
--   1. Profit must remain BLOCKED, never computed. Cost and Revenue are
--      returned independently, each with its own confidence. When the cost and
--      revenue populations/windows are disjoint, profit blocks with
--      `disjoint_cost_and_revenue_populations`. No estimate, no approximation.
--   2. M4 ships the COST-SIDE simulator only, with the correctly blocked
--      profit state. Revenue-side simulation is deferred to M5.
--   3. A non-zero `demand.elasticity` is REFUSED with `elasticity_unsupported`.
--      Never ignored silently; no demand model is invented.
--
-- The governing rule, restated: every computed value must be backed by real
-- supporting data, and every unsupported scenario must fail explicitly rather
-- than produce a plausible-looking number.
--
-- WHAT THIS IS
-- ------------
-- Section 10's business surface. It does NOT re-implement provider pricing —
-- §11 is explicit that "Economics never re-implements provider pricing to run a
-- scenario". The cost side is delegated wholesale to `owner_cost_reprice()`,
-- which M1 rebuilt with a refusal contract. This function composes that answer
-- with the revenue and profit states.
--
-- THE BLOCK REASON IS MEASURED, NOT HARDCODED
-- -------------------------------------------
-- It would have been shorter to hardcode "profit is blocked". That would be a
-- lie the moment the data changes. Instead the function MEASURES the overlap
-- between the cost population and the revenue population in the same window,
-- and reports the reason that is actually true:
--
--   0 shared EXTERNAL users, or 0 shared external days
--                                   -> disjoint_cost_and_revenue_populations
--   external overlap exists         -> revenue_simulation_not_implemented (M5)
--
-- The overlap that gates profit is the EXTERNAL one, because profit is a
-- business metric and INV-25 excludes internal traffic from business metrics.
-- That distinction is not academic here. Measured on production 2026-08-01:
--
--   cost users .................. 1   (0 external — the owner's own account)
--   revenue users ............... 7
--   shared users (all) .......... 1   <- the OWNER, who has cost and a
--                                        recognized subscription in-window
--   shared users (external) ..... 0   <- what actually gates profit
--
-- Gating on the all-users overlap would report the two populations as connected
-- when the only thing connecting them is internal testing traffic. Both numbers
-- are returned in `basis` so neither is hidden.
--
-- A NOTE ON HOW THIS WAS FOUND: the M4 investigation published "0 shared users,
-- 0 shared days". That figure compared EXTERNAL credit transactions against ALL
-- cost facts — two different populations — and the pre-apply probe caught it by
-- measuring what the function actually measures. The corrected reading is above;
-- the investigation's conclusion (profit cannot be computed honestly) survives
-- unchanged, but its arithmetic did not.
--
-- SCOPE
-- -----
--   1. public.owner_econ_simulate(jsonb)  NEW
--
-- Nothing else is touched. No econ view, no cost_engine object, no table.
-- `owner_cost_reprice` is CALLED, not modified.
--
-- LAYER BOUNDARY (INV-05, the M2d lesson)
-- ---------------------------------------
-- This function lives in `public`, not `econ`. It reads `econ.v_revenue_events`
-- for the revenue population and calls `public.owner_cost_reprice()` for cost.
-- It adds NO econ->cost_engine edge: no econ object is created or modified, so
-- `P5-01` is untouched. It never reads the price book (`rate_cards`,
-- `rate_components`, `discount_rules`, `fx_rates`) — `owner_cost_reprice` owns
-- that, as it should.
--
-- INV-25: `include_internal` defaults to FALSE, as every business surface does.
-- On today's data that makes an unqualified call refuse with
-- `no_cost_facts_in_window` — which is correct and honest, not a defect. A
-- diagnostic run passes `include_internal: true` explicitly, the Section 9
-- precedent from Phase 6 M4.3.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.owner_econ_simulate(p_scenario jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public','econ','cost_engine','ai_catalog' AS $fn$
DECLARE
  -- Full Section 10 grammar. `packages` and `operations` are ACCEPTED as keys
  -- so the caller gets a precise "deferred to M5" answer rather than the blunt
  -- `unsupported_scenario_key`. `routing` is absent here exactly as it is in
  -- owner_cost_reprice — deferred, therefore refused, never silently ignored.
  c_allowed  constant text[] := ARRAY['basis_window','service_swap','model_swap',
                                      'rate_override','discounts','fx','include_internal',
                                      'packages','operations','demand'];
  c_cost_keys constant text[] := ARRAY['basis_window','service_swap','model_swap',
                                       'rate_override','discounts','fx','include_internal'];
  v_scn   jsonb := COALESCE(p_scenario,'{}'::jsonb);
  v_bad   text[];
  v_cost_scn jsonb := '{}'::jsonb;
  v_k text;
  v_elast numeric;
  v_incl boolean;
  v_from timestamptz; v_to timestamptz;
  r_cost jsonb;
  v_cost_users bigint; v_cost_users_ext bigint;
  v_rev_users bigint; v_shared_users bigint; v_shared_ext bigint; v_shared_days bigint;
  v_rev_rows bigint;
  v_profit_reason text; v_profit_detail text;
  v_notes jsonb;
BEGIN
  -- 0. Owner gate. owner_cost_reprice re-checks it independently on the inner
  --    call; that redundancy is deliberate defense in depth.
  IF NOT COALESCE(public.has_role_at_least('owner'::public.user_role), false) THEN
    RAISE EXCEPTION 'forbidden: owner_econ_simulate requires role owner' USING ERRCODE='42501';
  END IF;

  IF jsonb_typeof(v_scn) <> 'object' THEN
    RETURN jsonb_build_object('ok',false,'reason','invalid_scenario','simulated',true,'run_id',NULL);
  END IF;

  -- 1. Unknown keys refuse. Same rule as M1: silently ignoring a knob the
  --    caller set is the same defect class as silently under-pricing a swap.
  SELECT array_agg(k ORDER BY k) INTO v_bad
    FROM jsonb_object_keys(v_scn) AS k WHERE k <> ALL (c_allowed);
  IF v_bad IS NOT NULL THEN
    RETURN jsonb_build_object('ok',false,'reason','unsupported_scenario_key','keys',to_jsonb(v_bad),
      'supported',to_jsonb(c_allowed),'simulated',true,'run_id',NULL);
  END IF;

  -- 2. RULING 2 — revenue-side keys are deferred to M5, so they REFUSE.
  --    Accepting them and quietly doing nothing would report a cost-only answer
  --    as though the package/operation overrides had been honoured.
  IF v_scn ? 'packages' OR v_scn ? 'operations' THEN
    RETURN jsonb_build_object('ok',false,'reason','revenue_simulation_not_implemented',
      'keys',to_jsonb(ARRAY(SELECT k FROM unnest(ARRAY['packages','operations']) k WHERE v_scn ? k)),
      'detail','revenue-side simulation is deferred to M5; M4 simulates cost only',
      'simulated',true,'run_id',NULL);
  END IF;

  -- 3. RULING 3 — a non-zero elasticity is refused, never ignored. There is no
  --    basis to estimate elasticity from the current population, and inventing
  --    a demand model is exactly what this architecture forbids.
  IF v_scn ? 'demand' THEN
    IF jsonb_typeof(v_scn->'demand') <> 'object' THEN
      RETURN jsonb_build_object('ok',false,'reason','invalid_demand','simulated',true,'run_id',NULL);
    END IF;
    BEGIN
      v_elast := COALESCE((v_scn#>>'{demand,elasticity}')::numeric, 0);
    EXCEPTION WHEN others THEN
      RETURN jsonb_build_object('ok',false,'reason','invalid_demand','simulated',true,'run_id',NULL);
    END;
    IF v_elast <> 0 THEN
      RETURN jsonb_build_object('ok',false,'reason','elasticity_unsupported','elasticity',v_elast,
        'detail','demand is held constant; no demand model is supported by the current data',
        'simulated',true,'run_id',NULL);
    END IF;
  END IF;

  -- 4. Build the cost scenario: pass through exactly the keys the engine owns.
  FOREACH v_k IN ARRAY c_cost_keys LOOP
    IF v_scn ? v_k THEN v_cost_scn := jsonb_set(v_cost_scn, ARRAY[v_k], v_scn->v_k); END IF;
  END LOOP;

  -- 5. Delegate the cost side. A refusal from the engine is PROPAGATED, not
  --    swallowed and not converted into a partial answer.
  r_cost := public.owner_cost_reprice(v_cost_scn);
  IF NOT COALESCE((r_cost->>'ok')::boolean, false) THEN
    RETURN jsonb_build_object('ok',false,'stage','cost','reason',r_cost->>'reason',
      'cost_refusal',r_cost,'simulated',true,'run_id',NULL);
  END IF;

  -- 6. Resolve the effective window from the engine's own basis, so the overlap
  --    is measured against exactly the rows that were priced.
  v_incl := COALESCE((r_cost#>>'{basis,include_internal}')::boolean, false);
  v_from := (r_cost#>>'{basis,from}')::timestamptz;
  v_to   := (r_cost#>>'{basis,to}')::timestamptz;

  -- 7. MEASURE the populations. This is the part that must not be hardcoded.
  SELECT count(DISTINCT f.user_id),
         count(DISTINCT f.user_id) FILTER (WHERE NOT f.is_internal)
    INTO v_cost_users, v_cost_users_ext
    FROM cost_engine.cost_facts f
   WHERE f.is_current AND f.occurred_at >= v_from AND f.occurred_at < v_to
     AND (v_incl OR NOT f.is_internal) AND f.user_id IS NOT NULL;

  -- Revenue recognition spans [recognized_from, recognized_from + period_days),
  -- so a subscription bought before the window can still be recognized inside
  -- it. Matching on the span, not the start date, is the honest comparison.
  SELECT count(*), count(DISTINCT e.user_id) INTO v_rev_rows, v_rev_users
    FROM econ.v_revenue_events e
   WHERE e.user_id IS NOT NULL
     AND e.recognized_from < v_to
     AND (e.recognized_from + make_interval(days => GREATEST(COALESCE(e.period_days,1),1))) > v_from;

  -- Overlap is measured TWICE: once over whatever the cost basis included, and
  -- once over EXTERNAL users only. The second one is what gates profit.
  --
  -- Why: profit is a business metric, and INV-25 excludes internal traffic from
  -- business metrics. Measured on production 2026-08-01, the two differ and the
  -- difference is the whole point — 1 user has both cost and recognized revenue,
  -- and that user is the OWNER's own account. Gating on the all-users overlap
  -- would report the populations as connected when the only thing connecting
  -- them is internal testing traffic.
  SELECT count(*) INTO v_shared_users FROM (
    SELECT DISTINCT f.user_id FROM cost_engine.cost_facts f
     WHERE f.is_current AND f.occurred_at >= v_from AND f.occurred_at < v_to
       AND (v_incl OR NOT f.is_internal) AND f.user_id IS NOT NULL
    INTERSECT
    SELECT DISTINCT e.user_id FROM econ.v_revenue_events e
     WHERE e.user_id IS NOT NULL AND e.recognized_from < v_to
       AND (e.recognized_from + make_interval(days => GREATEST(COALESCE(e.period_days,1),1))) > v_from
  ) s;

  SELECT count(*) INTO v_shared_ext FROM (
    SELECT DISTINCT f.user_id FROM cost_engine.cost_facts f
     WHERE f.is_current AND f.occurred_at >= v_from AND f.occurred_at < v_to
       AND NOT f.is_internal AND f.user_id IS NOT NULL
    INTERSECT
    SELECT DISTINCT e.user_id FROM econ.v_revenue_events e
     WHERE e.user_id IS NOT NULL AND e.recognized_from < v_to
       AND (e.recognized_from + make_interval(days => GREATEST(COALESCE(e.period_days,1),1))) > v_from
  ) s;

  SELECT count(*) INTO v_shared_days FROM (
    SELECT DISTINCT f.occurred_at::date AS d FROM cost_engine.cost_facts f
     WHERE f.is_current AND f.occurred_at >= v_from AND f.occurred_at < v_to
       AND NOT f.is_internal
    INTERSECT
    SELECT DISTINCT g.d::date FROM econ.v_revenue_events e
      CROSS JOIN LATERAL generate_series(
        e.recognized_from,
        e.recognized_from + make_interval(days => GREATEST(COALESCE(e.period_days,1),1) - 1),
        interval '1 day') AS g(d)
     WHERE e.user_id IS NOT NULL AND g.d >= v_from AND g.d < v_to
  ) s;

  -- 8. RULING 1 — profit blocks, and the reason states what is actually true.
  --    Both branches are reachable and both are measured, never assumed.
  IF v_shared_ext = 0 OR v_shared_days = 0 THEN
    v_profit_reason := 'disjoint_cost_and_revenue_populations';
    v_profit_detail := format(
      'cost covers %s user(s) (%s external) and revenue covers %s user(s) in this window; %s shared external user(s), %s shared external day(s) — profit would compare unrelated populations',
      v_cost_users, v_cost_users_ext, v_rev_users, v_shared_ext, v_shared_days);
  ELSE
    v_profit_reason := 'revenue_simulation_not_implemented';
    v_profit_detail := format(
      'cost and revenue overlap on %s external user(s) and %s day(s), but revenue-side simulation is deferred to M5',
      v_shared_ext, v_shared_days);
  END IF;

  v_notes := COALESCE(r_cost->'notes','[]'::jsonb);

  -- 9. Assemble. `profit.value` and `profit.margin_pct` are NULL on every path
  --    of this function — there is no branch that computes them.
  RETURN jsonb_build_object(
    'ok', true, 'simulated', true, 'run_id', NULL, 'milestone', 'M4',
    'basis', (r_cost->'basis') || jsonb_build_object(
      'cost_users', v_cost_users, 'cost_users_external', v_cost_users_ext,
      'revenue_users', v_rev_users, 'revenue_events', v_rev_rows,
      'shared_users', v_shared_users, 'shared_users_external', v_shared_ext,
      'shared_days_external', v_shared_days),
    'scenario_echo', v_scn,
    'notes', v_notes,
    'cost', jsonb_build_object(
      'actual_usd',     (r_cost#>>'{totals,actual_cost_usd}')::numeric,
      'simulated_usd',  (r_cost#>>'{totals,simulated_cost_usd}')::numeric,
      'delta_usd',      (r_cost#>>'{totals,delta_usd}')::numeric,
      'delta_pct',      (r_cost#>>'{totals,delta_pct}')::numeric,
      'actual_egp',     (r_cost#>>'{totals,actual_cost_egp}')::numeric,
      'simulated_egp',  (r_cost#>>'{totals,simulated_cost_egp}')::numeric,
      'fx_rate',        (r_cost#>>'{totals,fx_rate}')::numeric,
      'fx_source',       r_cost#>>'{totals,fx_source}',
      'egp_blocked_reason', r_cost#>>'{totals,egp_blocked_reason}',
      'by_service',     COALESCE(r_cost->'by_service','[]'::jsonb),
      'calls',          (r_cost#>>'{basis,calls}')::bigint,
      'population',     CASE WHEN v_incl THEN 'includes_internal' ELSE 'external_only' END,
      'confidence',     'modeled'),
    'revenue', jsonb_build_object(
      'value', NULL, 'confidence', 'blocked',
      'block_reason', 'revenue_simulation_not_implemented',
      'detail', 'revenue-side simulation is deferred to M5; M4 simulates cost only',
      'events_in_window', v_rev_rows, 'users_in_window', v_rev_users),
    'profit', jsonb_build_object(
      'value', NULL, 'margin_pct', NULL, 'confidence', 'blocked',
      'block_reason', v_profit_reason, 'detail', v_profit_detail));
END; $fn$;

-- BOTH revokes. A newly created function receives Supabase's default
-- privileges, which grant EXECUTE to `anon` DIRECTLY — and REVOKE ... FROM
-- PUBLIC does not remove a direct role grant. This is the M1 lesson, applied
-- here at write time instead of being caught by P4-06 after apply.
REVOKE ALL ON FUNCTION public.owner_econ_simulate(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.owner_econ_simulate(jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.owner_econ_simulate(jsonb) TO authenticated;

COMMENT ON FUNCTION public.owner_econ_simulate(jsonb) IS
  'Owner-only Section 10 simulator (M4: cost side only). Delegates cost to '
  'owner_cost_reprice() and never re-implements provider pricing. Returns cost '
  'and revenue independently, each with its own confidence. PROFIT IS ALWAYS '
  'BLOCKED and is never computed or estimated: the block reason is MEASURED '
  'from the actual overlap between the cost and revenue populations, so it '
  'reports disjoint_cost_and_revenue_populations while they do not overlap and '
  'revenue_simulation_not_implemented once they do. Refuses packages/operations '
  '(deferred to M5) and any non-zero demand.elasticity. STABLE: cannot write.';
