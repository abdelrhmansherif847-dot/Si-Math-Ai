-- =====================================================================
-- Phase 7 · M1 — owner_cost_reprice: refusal contract + scenario grammar
-- =====================================================================
-- STATUS: ✅ APPLIED to production as version 20260801205515
--         (name: aiecon_p7_m1_reprice_refusal_contract).
--         Corrected 2026-08-25: this file said "NOT YET APPLIED — awaiting
--         owner approval" while public.owner_cost_reprice was live. NOTE that
--         20260801211727 (aiecon_p7_m1_fix_reprice_anon_revoke) was applied
--         after it, so this file alone is not the current state.
--
-- WHY THIS EXISTS
-- ---------------
-- `owner_cost_reprice()` silently under-reports cost when a swap target has
-- no rate card. Measured on production 2026-08-01 in an owner session:
--
--     owner_cost_reprice('{"include_internal":true,
--                          "swap_model_from":"gpt-4o",
--                          "swap_model_to":"claude-sonnet-4"}')
--       actual_total    = 0.22961425
--       simulated_total = 0.06758175   <- 70.6% "saving", entirely fictional
--       calls_counted   = 76           <- all 76 counted, only 52 priced
--
-- Mechanism: `resolve_rate_card()` returns NULL for an unpriced target;
-- `price_units(NULL, units)` finds no rate component, sets `bad_unit` and
-- returns `gross_usd = NULL`; the outer `sum()` SKIPS those NULLs. The 24
-- gpt-4o rows ($0.16203250) vanish from the total while still being counted
-- in `calls`. The number looks trustworthy precisely because the call count
-- is right.
--
-- `price_units` already reported the failure through `bad_unit`. The old
-- function threw that signal away. This migration stops discarding it.
--
-- DESIGN RULE (owner decision D-B): any scenario that cannot be priced in
-- full must refuse to execute, state the reason, and return no partial cost.
-- A row-set return type has nowhere to put a refusal, so the function is
-- DROPped and recreated returning a single `jsonb` document.
--
-- SCOPE
-- -----
--   1. cost_engine.apply_discounts(numeric, jsonb)   NEW
--   2. cost_engine.price_units(uuid, jsonb, jsonb)   NEW  (3-arg overload)
--   3. cost_engine.price_units(uuid, jsonb)          REPLACED -> delegates
--   4. public.owner_cost_reprice(jsonb)              DROP + CREATE
--
-- NOT in scope: `routing` (deferred by the Phase 7 plan — a scenario carrying
-- it is REFUSED, not silently ignored); cost_engine.run_pricing (untouched);
-- every econ object (untouched); admin.html (untouched, no UI in this
-- milestone).
--
-- BLAST RADIUS (measured 2026-08-01, not assumed)
-- -----------------------------------------------
--   client references to owner_cost_reprice ... 0 (all .html/.js)
--   verification-script references ............ 0
--   pg_depend dependents ...................... 0
--   rows it has ever written .................. 0 (STABLE — cannot write)
--
-- PRE-APPLY PROBE: 35/35 PASS (22 functional + 13 branch coverage), run in a
-- rolled-back transaction against production data. The body below is the body
-- that was probed; only comments and whitespace differ.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. cost_engine.apply_discounts — the discount fold, as a value
-- ---------------------------------------------------------------------
-- Mirrors run_pricing's inline loop exactly: ordered application, each step
-- clamped to [0, remaining], total rounded to 8dp. Takes an ORDERED jsonb
-- array so the caller owns priority; returns the TOTAL discount.
--
-- KNOWN DUPLICATION: run_pricing still carries its own inline copy of this
-- fold. Refactoring the pricing writer to call this helper is correct but is
-- deliberately OUT of M1 scope — it would widen the blast radius into the
-- object that writes cost_facts. Recorded as a follow-up.
--
-- Note an unrecognised discount_type folds to 0 here, matching the engine.
-- owner_cost_reprice never relies on that: it REFUSES an unknown type up
-- front, so a typo can never quietly become "no discount".
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION cost_engine.apply_discounts(p_gross numeric, p_rules jsonb)
RETURNS numeric LANGUAGE plpgsql STABLE AS $fn$
DECLARE r jsonb; v_running numeric := p_gross; v_total numeric := 0; v_step numeric;
BEGIN
  IF p_gross IS NULL THEN RETURN NULL; END IF;          -- INV-23: unknown stays unknown
  FOR r IN SELECT e.value FROM jsonb_array_elements(COALESCE(p_rules,'[]'::jsonb)) AS e LOOP
    v_step := CASE r->>'discount_type' WHEN 'percent' THEN v_running*(r->>'value')::numeric/100
                WHEN 'fixed_usd' THEN (r->>'value')::numeric ELSE 0 END;
    v_step := least(greatest(v_step,0), v_running);
    v_running := v_running - v_step; v_total := v_total + v_step;
  END LOOP;
  RETURN round(v_total,8);
END; $fn$;

COMMENT ON FUNCTION cost_engine.apply_discounts(numeric, jsonb) IS
  'Ordered discount fold. p_rules is an ORDERED jsonb array of '
  '{discount_type, value}; each step is clamped to [0, remaining]. '
  'Returns total discount, 8dp. Mirrors run_pricing.';


-- ---------------------------------------------------------------------
-- 2. cost_engine.price_units — 3-arg overload with rate overrides
-- ---------------------------------------------------------------------
-- p_overrides: {"<unit_code>": <unit_price>} for THIS rate card. An override
-- replaces `unit_price` in EVERY band of that unit, preserving `per_qty` and
-- the tier boundaries. On a single-band card (every card in production today)
-- that is exact; on a tiered card it deliberately flattens the tier prices —
-- a stated modelling choice, not a silent approximation.
--
-- The body is the existing 2-arg implementation plus the override lookup; the
-- 2-arg entry point below delegates here, so exactly ONE implementation of
-- unit pricing exists.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION cost_engine.price_units(
  p_rate_card_id uuid, p_units jsonb, p_overrides jsonb,
  OUT gross_usd numeric, OUT all_zero boolean, OUT bad_unit text)
RETURNS record LANGUAGE plpgsql STABLE AS $fn$
DECLARE r_unit record; r_band record; v_qty numeric; v_billable numeric; v_unit_sum numeric;
  v_portion numeric; v_min_qty numeric; v_found boolean; v_override numeric; v_price numeric;
BEGIN
  gross_usd := 0; all_zero := true; bad_unit := NULL;
  FOR r_unit IN SELECT key AS unit_code, (value #>> '{}')::numeric AS qty
                  FROM jsonb_each(COALESCE(p_units,'{}'::jsonb)) ORDER BY key LOOP
    v_qty := COALESCE(r_unit.qty,0);
    SELECT COALESCE(max(rc.min_qty),0), count(*)>0 INTO v_min_qty, v_found
      FROM cost_engine.rate_components rc
     WHERE rc.rate_card_id=p_rate_card_id AND rc.unit_code=r_unit.unit_code;
    -- No component for a unit the call actually consumed. Signal it; NEVER 0.
    IF NOT v_found THEN bad_unit := r_unit.unit_code; gross_usd := NULL; all_zero := false; RETURN; END IF;
    v_override := NULLIF(COALESCE(p_overrides,'{}'::jsonb) ->> r_unit.unit_code, '')::numeric;
    v_billable := greatest(v_qty, v_min_qty); v_unit_sum := 0;
    FOR r_band IN SELECT rc.unit_price, rc.per_qty, rc.tier_from, rc.tier_to
                    FROM cost_engine.rate_components rc
                   WHERE rc.rate_card_id=p_rate_card_id AND rc.unit_code=r_unit.unit_code
                   ORDER BY COALESCE(rc.tier_from,0), rc.id LOOP
      v_price := COALESCE(v_override, r_band.unit_price);
      v_portion := greatest(0, least(v_billable, COALESCE(r_band.tier_to, v_billable))-COALESCE(r_band.tier_from,0));
      v_unit_sum := v_unit_sum + (v_portion*v_price/r_band.per_qty);
      IF v_price <> 0 THEN all_zero := false; END IF;
    END LOOP;
    gross_usd := gross_usd + v_unit_sum;
  END LOOP;
  gross_usd := round(gross_usd,8);
END; $fn$;

COMMENT ON FUNCTION cost_engine.price_units(uuid, jsonb, jsonb) IS
  'Price a units bag against a rate card, with optional per-unit price '
  'overrides {unit_code: unit_price}. An override replaces unit_price in every '
  'band of that unit, preserving per_qty and tier boundaries. bad_unit is set '
  'and gross_usd is NULL when the card has no component for a unit present in '
  'the bag — callers MUST treat that as unpriceable, never as 0.';


-- ---------------------------------------------------------------------
-- 3. cost_engine.price_units (2-arg) — now a thin delegation
-- ---------------------------------------------------------------------
-- Same signature, same OUT names and types, same behaviour: a pure refactor
-- so that no second copy of the pricing loop exists. run_pricing calls this
-- entry point and is otherwise untouched.
--
-- Probe T0 re-priced all 76 production facts through this path and compared
-- against the recorded gross_cost_usd: 0 mismatches, 0 bad_unit.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION cost_engine.price_units(
  p_rate_card_id uuid, p_units jsonb,
  OUT gross_usd numeric, OUT all_zero boolean, OUT bad_unit text)
RETURNS record LANGUAGE sql STABLE AS $fn$
  SELECT pu.gross_usd, pu.all_zero, pu.bad_unit
    FROM cost_engine.price_units(p_rate_card_id, p_units, '{}'::jsonb) pu;
$fn$;


-- ---------------------------------------------------------------------
-- 4. public.owner_cost_reprice — DROP + CREATE with a refusal contract
-- ---------------------------------------------------------------------
-- Returns ONE jsonb document, never a row set:
--   success  {ok:true, simulated, run_id:null, confidence:'modeled',
--             basis{...}, scenario_echo, notes[], totals{...}, by_service[]}
--   refusal  {ok:false, reason, <reason-specific fields>, simulated, run_id}
--
-- REFUSAL vs NOTE — the line this milestone draws:
--   REFUSE when the answer would be WRONG (a row cannot be priced, a baseline
--          cannot be stated, a knob cannot be honoured).
--   NOTE   when the answer is RIGHT but the scenario was partly inert (a swap
--          that matched no row). Nothing is dropped, so nothing is hidden.
--
-- Half-open basis window [from, to), matching run_pricing's convention.
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.owner_cost_reprice(jsonb);

CREATE FUNCTION public.owner_cost_reprice(p_scenario jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public','cost_engine','ai_catalog' AS $fn$
DECLARE
  -- M1 grammar. `routing` is intentionally absent: it is deferred, so a
  -- scenario carrying it is refused rather than silently ignored.
  c_allowed constant text[] := ARRAY['basis_window','service_swap','model_swap','rate_override','discounts','fx','include_internal'];
  c_disc_ok constant text[] := ARRAY['percent','fixed_usd'];
  v_scn jsonb := COALESCE(p_scenario,'{}'::jsonb);
  v_bad text[]; v_from timestamptz; v_to timestamptz; v_incl boolean;
  v_swap_svc jsonb; v_swap_mdl jsonb; v_over jsonb; v_disc_scn jsonb;
  v_fx_scn numeric; v_has_disc boolean; v_k text; v_v text;
  v_notes text[] := ARRAY[]::text[];
  r record; v_card uuid; v_gross numeric; v_zero boolean; v_badunit text;
  v_over_map jsonb; v_rules jsonb; v_discount numeric; v_net numeric;
  v_by_svc jsonb := '{}'::jsonb; v_act_tot numeric := 0; v_sim_tot numeric := 0;
  v_rows bigint := 0; v_prev jsonb;
  v_fx_rate numeric; v_fx_src text; v_fx_block text; v_months int; v_months_r int;
BEGIN
  -- 0. Owner gate (unchanged from the previous definition)
  IF NOT COALESCE(public.has_role_at_least('owner'::public.user_role), false) THEN
    RAISE EXCEPTION 'forbidden: owner_cost_reprice requires role owner' USING ERRCODE='42501'; END IF;
  IF jsonb_typeof(v_scn) <> 'object' THEN
    RETURN jsonb_build_object('ok',false,'reason','invalid_scenario','simulated',true,'run_id',NULL); END IF;

  -- 1. Unknown keys are refused. Silently ignoring a knob the caller set is
  --    the same class of defect as silently under-pricing a swap.
  SELECT array_agg(k ORDER BY k) INTO v_bad FROM jsonb_object_keys(v_scn) AS k WHERE k <> ALL (c_allowed);
  IF v_bad IS NOT NULL THEN
    RETURN jsonb_build_object('ok',false,'reason','unsupported_scenario_key','keys',to_jsonb(v_bad),
      'supported',to_jsonb(c_allowed),'simulated',true,'run_id',NULL); END IF;

  -- 2. Parse and validate every key before touching data
  v_incl := COALESCE((v_scn->>'include_internal')::boolean,false);
  v_swap_svc := COALESCE(v_scn->'service_swap','{}'::jsonb);
  v_swap_mdl := COALESCE(v_scn->'model_swap','{}'::jsonb);
  v_over := COALESCE(v_scn->'rate_override','{}'::jsonb);
  v_has_disc := v_scn ? 'discounts'; v_disc_scn := COALESCE(v_scn->'discounts','[]'::jsonb);
  BEGIN
    v_from := COALESCE((v_scn#>>'{basis_window,from}')::timestamptz,'-infinity'::timestamptz);
    v_to := COALESCE((v_scn#>>'{basis_window,to}')::timestamptz,'infinity'::timestamptz);
  EXCEPTION WHEN others THEN
    RETURN jsonb_build_object('ok',false,'reason','invalid_basis_window','simulated',true,'run_id',NULL); END;
  IF v_from >= v_to THEN
    RETURN jsonb_build_object('ok',false,'reason','invalid_basis_window','simulated',true,'run_id',NULL); END IF;

  FOR v_k IN SELECT jsonb_object_keys(v_swap_svc) LOOP
    IF NOT EXISTS (SELECT 1 FROM ai_catalog.services s WHERE s.service_code=v_k) THEN
      RETURN jsonb_build_object('ok',false,'reason','unknown_service_in_swap','service_code',v_k,'simulated',true,'run_id',NULL); END IF;
    IF COALESCE(v_swap_svc#>>ARRAY[v_k,'provider'],'')='' OR COALESCE(v_swap_svc#>>ARRAY[v_k,'model'],'')='' THEN
      RETURN jsonb_build_object('ok',false,'reason','invalid_service_swap','service_code',v_k,'simulated',true,'run_id',NULL); END IF;
  END LOOP;
  FOR v_k IN SELECT jsonb_object_keys(v_swap_mdl) LOOP
    IF COALESCE(v_swap_mdl->>v_k,'')='' THEN
      RETURN jsonb_build_object('ok',false,'reason','invalid_model_swap','model',v_k,'simulated',true,'run_id',NULL); END IF;
  END LOOP;
  -- rate_override keys are provider:model:unit_code, values non-negative numeric
  FOR v_k, v_v IN SELECT e.key, e.value FROM jsonb_each_text(v_over) AS e LOOP
    IF split_part(v_k,':',1)='' OR split_part(v_k,':',2)='' OR split_part(v_k,':',3)='' OR v_k LIKE '%:%:%:%' THEN
      RETURN jsonb_build_object('ok',false,'reason','invalid_rate_override_key','key',v_k,'simulated',true,'run_id',NULL); END IF;
    BEGIN
      IF v_v::numeric < 0 THEN
        RETURN jsonb_build_object('ok',false,'reason','invalid_rate_override_value','key',v_k,'simulated',true,'run_id',NULL); END IF;
    EXCEPTION WHEN others THEN
      RETURN jsonb_build_object('ok',false,'reason','invalid_rate_override_value','key',v_k,'simulated',true,'run_id',NULL); END;
  END LOOP;
  IF jsonb_typeof(v_disc_scn) <> 'array' THEN
    RETURN jsonb_build_object('ok',false,'reason','invalid_discounts','simulated',true,'run_id',NULL); END IF;
  -- an unrecognised discount_type would fold to zero; refuse instead
  FOR v_k IN SELECT COALESCE(e.value->>'discount_type','(missing)') FROM jsonb_array_elements(v_disc_scn) AS e LOOP
    IF v_k <> ALL (c_disc_ok) THEN
      RETURN jsonb_build_object('ok',false,'reason','invalid_discount_type','discount_type',v_k,'simulated',true,'run_id',NULL); END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_disc_scn) AS e
              WHERE (e.value->>'value') IS NULL OR (e.value->>'value') !~ '^-?[0-9]+(\.[0-9]+)?$') THEN
    RETURN jsonb_build_object('ok',false,'reason','invalid_discount_value','simulated',true,'run_id',NULL); END IF;
  IF v_scn ? 'fx' THEN
    BEGIN v_fx_scn := (v_scn#>>'{fx,usd_to_egp}')::numeric; EXCEPTION WHEN others THEN v_fx_scn := NULL; END;
    IF v_fx_scn IS NULL OR v_fx_scn <= 0 THEN
      RETURN jsonb_build_object('ok',false,'reason','invalid_fx','simulated',true,'run_id',NULL); END IF;
  END IF;

  -- 3. Basis population — refuse rather than report against a partial basis
  SELECT count(*) INTO v_rows FROM cost_engine.cost_facts f
   WHERE f.is_current AND f.occurred_at>=v_from AND f.occurred_at<v_to AND (v_incl OR NOT f.is_internal);
  IF v_rows=0 THEN
    RETURN jsonb_build_object('ok',false,'reason','no_cost_facts_in_window','include_internal',v_incl,'simulated',true,'run_id',NULL); END IF;

  -- A fact with no actual cost means no baseline can be stated (INV-26).
  IF EXISTS (SELECT 1 FROM cost_engine.cost_facts f
              WHERE f.is_current AND f.occurred_at>=v_from AND f.occurred_at<v_to AND (v_incl OR NOT f.is_internal)
                AND (f.net_cost_usd IS NULL OR f.pricing_status NOT IN ('priced','zero_rated'))) THEN
    RETURN jsonb_build_object('ok',false,'reason','unpriced_facts_in_window',
      'unpriced_calls',(SELECT count(*) FROM cost_engine.cost_facts f
        WHERE f.is_current AND f.occurred_at>=v_from AND f.occurred_at<v_to AND (v_incl OR NOT f.is_internal)
          AND (f.net_cost_usd IS NULL OR f.pricing_status NOT IN ('priced','zero_rated'))),
      'simulated',true,'run_id',NULL); END IF;

  -- Telemetry holds the units. The old INNER JOIN dropped factless calls
  -- silently. Today a FK + NOT NULL make this unreachable; it guards the
  -- Phase 8 `ai_model_calls` retention policy, which must relax that FK.
  IF EXISTS (SELECT 1 FROM cost_engine.cost_facts f LEFT JOIN public.ai_model_calls c ON c.id=f.call_id
              WHERE f.is_current AND f.occurred_at>=v_from AND f.occurred_at<v_to AND (v_incl OR NOT f.is_internal)
                AND (c.id IS NULL OR c.units IS NULL)) THEN
    RETURN jsonb_build_object('ok',false,'reason','telemetry_missing_for_facts',
      'affected_calls',(SELECT count(*) FROM cost_engine.cost_facts f LEFT JOIN public.ai_model_calls c ON c.id=f.call_id
        WHERE f.is_current AND f.occurred_at>=v_from AND f.occurred_at<v_to AND (v_incl OR NOT f.is_internal)
          AND (c.id IS NULL OR c.units IS NULL)),'simulated',true,'run_id',NULL); END IF;

  -- 4. Re-price every row. Every row, or none.
  --    Target precedence: service_swap beats model_swap beats identity.
  FOR r IN
    SELECT f.service_code, f.provider_code, f.model, f.api_surface, f.operation, f.occurred_at, f.net_cost_usd, c.units,
           COALESCE(v_swap_svc#>>ARRAY[f.service_code,'provider'], f.provider_code) AS tgt_provider,
           COALESCE(v_swap_svc#>>ARRAY[f.service_code,'model'], v_swap_mdl->>f.model, f.model) AS tgt_model,
           COALESCE(v_swap_svc#>>ARRAY[f.service_code,'api_surface'], f.api_surface) AS tgt_surface,
           (v_swap_svc ? f.service_code) AS by_service_swap,
           (NOT (v_swap_svc ? f.service_code) AND v_swap_mdl ? f.model) AS by_model_swap
      FROM cost_engine.cost_facts f JOIN public.ai_model_calls c ON c.id=f.call_id
     WHERE f.is_current AND f.occurred_at>=v_from AND f.occurred_at<v_to AND (v_incl OR NOT f.is_internal)
     ORDER BY f.id
  LOOP
    v_card := cost_engine.resolve_rate_card(r.tgt_provider, r.tgt_model, r.tgt_surface, r.occurred_at);
    -- THE DEFECT THIS MILESTONE EXISTS TO KILL, half 1: no card for the target.
    IF v_card IS NULL THEN
      RETURN jsonb_build_object('ok',false,'reason','no_rate_card_for_target',
        'target',jsonb_build_object('provider',r.tgt_provider,'model',r.tgt_model,'api_surface',r.tgt_surface),
        'via',CASE WHEN r.by_service_swap THEN 'service_swap' WHEN r.by_model_swap THEN 'model_swap' ELSE 'basis' END,
        'service_code',r.service_code,
        'affected_calls',(SELECT count(*) FROM cost_engine.cost_facts f2
          WHERE f2.is_current AND f2.occurred_at>=v_from AND f2.occurred_at<v_to AND (v_incl OR NOT f2.is_internal)
            AND COALESCE(v_swap_svc#>>ARRAY[f2.service_code,'model'], v_swap_mdl->>f2.model, f2.model)=r.tgt_model),
        'affected_cost_usd',(SELECT round(sum(f2.net_cost_usd),8) FROM cost_engine.cost_facts f2
          WHERE f2.is_current AND f2.occurred_at>=v_from AND f2.occurred_at<v_to AND (v_incl OR NOT f2.is_internal)
            AND COALESCE(v_swap_svc#>>ARRAY[f2.service_code,'model'], v_swap_mdl->>f2.model, f2.model)=r.tgt_model),
        'simulated',true,'run_id',NULL); END IF;

    -- overrides that apply to this target
    SELECT jsonb_object_agg(split_part(e.key,':',3), e.value::numeric) INTO v_over_map
      FROM jsonb_each_text(v_over) AS e
     WHERE split_part(e.key,':',1)=r.tgt_provider AND split_part(e.key,':',2)=r.tgt_model;
    v_over_map := COALESCE(v_over_map,'{}'::jsonb);
    -- an override naming a unit this card lacks would apply to nothing
    FOR v_k IN SELECT jsonb_object_keys(v_over_map) LOOP
      IF NOT EXISTS (SELECT 1 FROM cost_engine.rate_components rc WHERE rc.rate_card_id=v_card AND rc.unit_code=v_k) THEN
        RETURN jsonb_build_object('ok',false,'reason','rate_override_unknown_unit','unit_code',v_k,'simulated',true,'run_id',NULL); END IF;
    END LOOP;

    SELECT pu.gross_usd, pu.all_zero, pu.bad_unit INTO v_gross, v_zero, v_badunit
      FROM cost_engine.price_units(v_card, r.units, v_over_map) pu;
    -- THE DEFECT THIS MILESTONE EXISTS TO KILL, half 2: card exists but is
    -- missing a unit this call consumed. bad_unit means unpriceable, not 0.
    IF v_badunit IS NOT NULL OR v_gross IS NULL THEN
      RETURN jsonb_build_object('ok',false,'reason','unpriceable_units_for_target','unit_code',v_badunit,
        'target',jsonb_build_object('provider',r.tgt_provider,'model',r.tgt_model,'api_surface',r.tgt_surface),
        'service_code',r.service_code,'simulated',true,'run_id',NULL); END IF;

    -- Discounts: a scenario list REPLACES the stored rules when `discounts` is
    -- present (even as []); absent means "keep today's rules". Scenario
    -- discounts scope against the TARGET provider/model — what you would buy.
    IF v_has_disc THEN
      SELECT jsonb_agg(e.value ORDER BY e.ordinality) INTO v_rules
        FROM jsonb_array_elements(v_disc_scn) WITH ORDINALITY AS e(value, ordinality)
       WHERE COALESCE(e.value->>'scope_provider', r.tgt_provider)=r.tgt_provider
         AND COALESCE(e.value->>'scope_service', r.service_code)=r.service_code
         AND COALESCE(e.value->>'scope_model', r.tgt_model)=r.tgt_model
         AND COALESCE(e.value->>'scope_operation', COALESCE(r.operation,''))=COALESCE(r.operation,'');
    ELSE
      SELECT jsonb_agg(jsonb_build_object('discount_type',d.discount_type,'value',d.value) ORDER BY d.priority,d.id) INTO v_rules
        FROM cost_engine.discount_rules d
       WHERE (d.scope_provider IS NULL OR d.scope_provider=r.tgt_provider)
         AND (d.scope_service IS NULL OR d.scope_service=r.service_code)
         AND (d.scope_model IS NULL OR d.scope_model=r.tgt_model)
         AND (d.scope_operation IS NULL OR d.scope_operation=r.operation)
         AND d.effective_from<=r.occurred_at AND (d.effective_to IS NULL OR r.occurred_at<d.effective_to);
    END IF;
    v_discount := cost_engine.apply_discounts(v_gross, COALESCE(v_rules,'[]'::jsonb));
    v_net := greatest(round(v_gross-v_discount,8),0);

    -- Defensive: unreachable today. It exists so that if a future edit
    -- reintroduces a NULL pricing path, the function REFUSES instead of
    -- quietly summing around it the way the original did.
    IF v_net IS NULL THEN
      RETURN jsonb_build_object('ok',false,'reason','internal_pricing_gap','service_code',r.service_code,'simulated',true,'run_id',NULL); END IF;

    v_act_tot := v_act_tot + r.net_cost_usd; v_sim_tot := v_sim_tot + v_net;
    v_prev := COALESCE(v_by_svc->r.service_code, jsonb_build_object('calls',0,'actual',0,'sim',0));
    v_by_svc := jsonb_set(v_by_svc, ARRAY[r.service_code], jsonb_build_object(
      'calls',(v_prev->>'calls')::bigint+1,'actual',(v_prev->>'actual')::numeric+r.net_cost_usd,
      'sim',(v_prev->>'sim')::numeric+v_net));
  END LOOP;

  -- 5. Inert-scenario notes — the answer is right, but say so out loud
  FOR v_k IN SELECT jsonb_object_keys(v_swap_svc) LOOP
    IF NOT EXISTS (SELECT 1 FROM cost_engine.cost_facts f WHERE f.is_current AND f.occurred_at>=v_from
                     AND f.occurred_at<v_to AND (v_incl OR NOT f.is_internal) AND f.service_code=v_k) THEN
      v_notes := v_notes || ('service_swap_inert: '||v_k); END IF;
  END LOOP;
  FOR v_k IN SELECT jsonb_object_keys(v_swap_mdl) LOOP
    IF NOT EXISTS (SELECT 1 FROM cost_engine.cost_facts f WHERE f.is_current AND f.occurred_at>=v_from
                     AND f.occurred_at<v_to AND (v_incl OR NOT f.is_internal) AND f.model=v_k
                     AND NOT (v_swap_svc ? f.service_code)) THEN
      v_notes := v_notes || ('model_swap_inert: '||v_k); END IF;
  END LOOP;

  -- 6. EGP. A scenario rate is a hypothesis and may be used; a missing real
  --    rate is NEVER invented (owner ruling: no FX shortcut).
  IF v_fx_scn IS NOT NULL THEN v_fx_rate := v_fx_scn; v_fx_src := 'scenario';
  ELSE
    SELECT count(DISTINCT date_trunc('month',f.occurred_at)::date), count(DISTINCT fx.rate_date) INTO v_months, v_months_r
      FROM cost_engine.cost_facts f
      LEFT JOIN cost_engine.fx_rates fx ON fx.rate_date=date_trunc('month',f.occurred_at)::date
     WHERE f.is_current AND f.occurred_at>=v_from AND f.occurred_at<v_to AND (v_incl OR NOT f.is_internal);
    IF v_months=1 AND v_months_r=1 THEN
      SELECT fx.usd_to_egp INTO v_fx_rate FROM cost_engine.fx_rates fx
       WHERE fx.rate_date=(SELECT date_trunc('month',min(f.occurred_at))::date FROM cost_engine.cost_facts f
                            WHERE f.is_current AND f.occurred_at>=v_from AND f.occurred_at<v_to AND (v_incl OR NOT f.is_internal));
      v_fx_src := 'fx_rates';
    ELSIF v_months>1 THEN v_fx_block := 'window_spans_multiple_months_supply_fx';
    ELSE v_fx_block := 'no_fx_rate'; END IF;
  END IF;

  -- 7. Assemble
  v_act_tot := round(v_act_tot,8); v_sim_tot := round(v_sim_tot,8);
  RETURN jsonb_build_object('ok',true,'simulated',true,'run_id',NULL,'confidence','modeled',
    'basis',jsonb_build_object('from',v_from,'to',v_to,'window_bounds','[from, to)','calls',v_rows,
      'services',(SELECT count(*) FROM jsonb_object_keys(v_by_svc)),'include_internal',v_incl,
      'unit_quantities','held_constant','demand','held_constant'),
    'scenario_echo',v_scn,'notes',to_jsonb(v_notes),
    'totals',jsonb_build_object('actual_cost_usd',v_act_tot,'simulated_cost_usd',v_sim_tot,
      'delta_usd',round(v_sim_tot-v_act_tot,8),
      'delta_pct',CASE WHEN v_act_tot=0 THEN NULL ELSE round((v_sim_tot-v_act_tot)/v_act_tot*100,4) END,
      'actual_cost_egp',CASE WHEN v_fx_rate IS NULL THEN NULL ELSE round(v_act_tot*v_fx_rate,4) END,
      'simulated_cost_egp',CASE WHEN v_fx_rate IS NULL THEN NULL ELSE round(v_sim_tot*v_fx_rate,4) END,
      'fx_rate',v_fx_rate,'fx_source',v_fx_src,'egp_blocked_reason',v_fx_block),
    'by_service',COALESCE((SELECT jsonb_agg(jsonb_build_object('service_code',e.key,'calls',(e.value->>'calls')::bigint,
      'actual_cost_usd',round((e.value->>'actual')::numeric,8),
      'simulated_cost_usd',round((e.value->>'sim')::numeric,8),
      'delta_usd',round((e.value->>'sim')::numeric-(e.value->>'actual')::numeric,8))
      ORDER BY (e.value->>'actual')::numeric DESC) FROM jsonb_each(v_by_svc) AS e),'[]'::jsonb));
END; $fn$;

-- BOTH revokes are required. DROP+CREATE re-applies Supabase's default
-- privileges, which grant EXECUTE to `anon` DIRECTLY — and REVOKE ... FROM
-- PUBLIC does not remove a direct role grant. Revoking only from PUBLIC left
-- owner_cost_reprice executable by anon and failed P4-06 on the first gate
-- run; shipped as 20260801_..._fix_reprice_anon_revoke and folded in here.
-- This mirrors the Phase 4 pattern used for every other owner_cost_* function.
REVOKE ALL ON FUNCTION public.owner_cost_reprice(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.owner_cost_reprice(jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.owner_cost_reprice(jsonb) TO authenticated;

COMMENT ON FUNCTION public.owner_cost_reprice(jsonb) IS
  'Owner-only cost simulator. Returns a single jsonb document: {ok:true, basis, '
  'totals, by_service, notes} or {ok:false, reason, ...}. REFUSES any scenario '
  'it cannot price in full — it never returns a partial cost and never drops a '
  'row from the total. STABLE: cannot write cost_facts or service_bindings. '
  'Every result is simulated=true, run_id=NULL, confidence=modeled.';
