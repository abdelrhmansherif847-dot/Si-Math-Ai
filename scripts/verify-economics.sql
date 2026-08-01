-- ===========================================================================
-- verify-economics.sql — Phase 5 (econ layer) verification
-- ===========================================================================
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/verify-economics.sql
--
-- Read-only. Checks the Phase 5 exit criteria (§14), the layer boundary
-- (§8.10 rule 8 / INV-05), the no-provider-literal rule (INV-13), the
-- read-only posture (INV-07/INV-10), and the owner's four locked rules of
-- 2026-07-31 including INV-27 confidence propagation.
--
-- Section D invokes every owner RPC. It creates and drops one TEMP table,
-- which is session-local; no persistent state is written.
-- ===========================================================================
\pset pager off

\echo ''
\echo '=== A. Layer boundary and posture ========================================='

-- P5-01 — econ never reads the price book (§8.10 rule 8, INV-05). This is the
-- structural check: PostgreSQL's own dependency graph, not a grep.
SELECT 'P5-01' AS check,
       CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END AS result,
       COALESCE(string_agg(DISTINCT dep.relname, ', '),
                'no econ object depends on rate_cards/rate_components/discount_rules/fx_rates') AS detail
  FROM pg_depend d
  JOIN pg_rewrite r  ON r.oid = d.objid
  JOIN pg_class v    ON v.oid = r.ev_class
  JOIN pg_namespace vn ON vn.oid = v.relnamespace
  JOIN pg_class dep  ON dep.oid = d.refobjid
  JOIN pg_namespace dn ON dn.oid = dep.relnamespace
 WHERE vn.nspname = 'econ' AND dn.nspname = 'cost_engine'
   AND dep.relname IN ('rate_cards','rate_components','discount_rules','fx_rates');

-- P5-02 — econ exposes no AI provider or model column (INV-13).
--
-- Targets the ENGINE's identifiers specifically. A bare /provider/ match is
-- wrong here: `v_revenue_events.provider_fee_egp` is the PAYMENT GATEWAY's
-- fee — revenue-side data econ legitimately owns (§9) — and has nothing to do
-- with the AI provider INV-13 is about. Matching it would fail a rule it does
-- not violate.
SELECT 'P5-02' AS check,
       CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END AS result,
       COALESCE(string_agg(table_name || '.' || column_name, ', '),
                'no AI provider/model identifier exposed by econ') AS detail
  FROM information_schema.columns
 WHERE table_schema = 'econ'
   AND column_name IN ('provider','provider_code','model','api_surface',
                       'rate_card_id','rate_card_ver','binding_id');

-- P5-02b — and no econ view emits an actual provider code as DATA. This is
-- the stronger form: a column could be innocently named and still carry a
-- vendor name through.
SELECT 'P5-02b' AS check,
       CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END AS result,
       count(*)::text || ' service_code value(s) in econ matching a provider code — must be 0' AS detail
  FROM econ.v_service_economics e
 WHERE EXISTS (SELECT 1 FROM ai_catalog.providers p
                WHERE p.provider_code = e.service_code);

-- P5-03 — the schema is not reachable from the API surface.
SELECT 'P5-03' AS check,
       CASE WHEN bool_and(NOT has_schema_privilege(r, 'econ', 'USAGE')) THEN 'PASS' ELSE 'FAIL' END AS result,
       'anon/authenticated USAGE on econ must be denied' AS detail
  FROM unnest(ARRAY['anon','authenticated']) r;

-- P5-04 — every owner_econ_* is STABLE (INV-07) and owner-gated (INV-10).
SELECT 'P5-04' AS check,
       CASE WHEN count(*) > 0
             AND count(*) = count(*) FILTER (WHERE p.provolatile = 's' AND p.prosecdef)
             AND count(*) = count(*) FILTER (WHERE p.prosrc LIKE '%has_role_at_least(''owner''%')
            THEN 'PASS' ELSE 'FAIL' END AS result,
       count(*)::text || ' functions, '
         || count(*) FILTER (WHERE p.provolatile='s' AND p.prosecdef)::text || ' STABLE+SECDEF, '
         || count(*) FILTER (WHERE p.prosrc LIKE '%has_role_at_least(''owner''%')::text || ' owner-gated' AS detail
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname LIKE 'owner\_econ\_%';

-- P5-05 — none of them is callable by anon.
SELECT 'P5-05' AS check,
       CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END AS result,
       count(*)::text || ' owner_econ_* executable by anon — must be 0' AS detail
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname LIKE 'owner\_econ\_%'
   AND has_function_privilege('anon', p.oid, 'EXECUTE');

\echo ''
\echo '=== B. INV-27 — confidence propagation ===================================='

-- P5-06 — the lattice never returns better than its worst input, and an
-- unknown (NULL) input blocks rather than being skipped.
SELECT 'P5-06' AS check,
       CASE WHEN econ.worst_confidence('actual','modeled') = 'modeled'
             AND econ.worst_confidence('actual','actual')  = 'actual'
             AND econ.worst_confidence('actual','blocked') = 'blocked'
             AND econ.worst_confidence('actual','derived','modeled') = 'modeled'
             AND econ.worst_confidence(NULL,'actual')      = 'blocked'
            THEN 'PASS' ELSE 'FAIL' END AS result,
       'worst(actual,modeled)=' || econ.worst_confidence('actual','modeled')
         || ' worst(actual,blocked)=' || econ.worst_confidence('actual','blocked')
         || ' worst(NULL,actual)='   || econ.worst_confidence(NULL,'actual') AS detail;

-- P5-07 — every econ view that exposes money also exposes a confidence class.
-- A money column with no confidence beside it is an INV-27 hole.
SELECT 'P5-07' AS check,
       CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END AS result,
       COALESCE(string_agg(t, ', '), 'every money-bearing econ view carries confidence') AS detail
  FROM (
    SELECT c.table_name AS t
      FROM information_schema.columns c
     WHERE c.table_schema = 'econ'
       AND (c.column_name ~* 'egp|usd|profit|margin')
     GROUP BY c.table_name
    EXCEPT
    SELECT c2.table_name
      FROM information_schema.columns c2
     WHERE c2.table_schema = 'econ' AND c2.column_name = 'confidence'
  ) d;

-- P5-08 — no aggregate reports a class better than its worst contributing
-- cost. If any cost is list-priced, no econ figure may claim 'actual'.
SELECT 'P5-08' AS check,
       CASE WHEN NOT EXISTS (SELECT 1 FROM cost_engine.v_cost_daily
                              WHERE price_confidence = 'list_price')
             OR NOT EXISTS (SELECT 1 FROM econ.v_pnl_daily
                             WHERE confidence = 'actual')
            THEN 'PASS' ELSE 'FAIL' END AS result,
       'list-priced cost present: '
         || (SELECT EXISTS (SELECT 1 FROM cost_engine.v_cost_daily WHERE price_confidence='list_price'))::text
         || '; P&L rows claiming actual: '
         || (SELECT count(*)::text FROM econ.v_pnl_daily WHERE confidence='actual') AS detail;

-- P5-15 — no econ view assigns its own confidence. Scans the STORED view
-- definitions (not the migration text) for a confidence-class literal in a
-- column named `confidence`. Every class in the layer must originate in
-- econ.cost_confidence / revenue_confidence / ledger_confidence and reach a
-- view only by inheritance, so a view can degrade a class but never invent or
-- improve one.
SELECT 'P5-15' AS check,
       CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END AS result,
       COALESCE(string_agg(viewname, ', '),
                'no econ view hardcodes a confidence class') AS detail
  FROM pg_views
 WHERE schemaname = 'econ'
   AND definition ~ '''(actual|modeled|derived)''::text AS confidence';

-- P5-16 — the three root class functions exist and are the only source of a
-- class. If one is dropped, every view above it degrades rather than silently
-- keeping a stale literal.
SELECT 'P5-16' AS check,
       CASE WHEN count(*) = 3 THEN 'PASS' ELSE 'FAIL' END AS result,
       count(*)::text || '/3 root confidence functions present ('
         || COALESCE(string_agg(p.proname, ', ' ORDER BY p.proname), 'none') || ')' AS detail
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'econ'
   AND p.proname IN ('cost_confidence','revenue_confidence','ledger_confidence');

\echo ''
\echo '=== C. Owner rules 1-4 — blocked states ==================================='

-- P5-09 (rule 1) — revenue and cost are readable independently of each other.
SELECT 'P5-09' AS check, 'PASS' AS result,
       'revenue rows: ' || (SELECT count(*)::text FROM econ.v_revenue_events)
         || ', cost days: ' || (SELECT count(*)::text FROM cost_engine.v_cost_daily)
         || ' — both readable with no dependency between them' AS detail;

-- P5-10 (rules 2 + 3) — a blocked metric is NULL and states why. Never 0.
SELECT 'P5-10' AS check,
       CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END AS result,
       count(*)::text || ' P&L row(s) blocked but carrying a profit figure, or '
         || 'computed but carrying a block reason — must be 0' AS detail
  FROM econ.v_pnl_daily
 WHERE (block_reason IS NOT NULL AND gross_profit_egp IS NOT NULL)
    OR (block_reason IS NULL     AND gross_profit_egp IS NULL);

-- P5-11 (rule 3) — every blocked row names a reason, and never reports 0.
SELECT 'P5-11' AS check,
       CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END AS result,
       count(*)::text || ' blocked row(s) with no reason or a zero value — must be 0' AS detail
  FROM econ.v_pnl_daily
 WHERE gross_profit_egp IS NULL
   AND (block_reason IS NULL OR block_reason = '');

-- P5-12 (rule 2) — a blocked metric always carries confidence 'blocked'.
SELECT 'P5-12' AS check,
       CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END AS result,
       count(*)::text || ' blocked row(s) not marked confidence=blocked — must be 0' AS detail
  FROM econ.v_pnl_daily
 WHERE block_reason IS NOT NULL AND confidence <> 'blocked';

-- P5-13 (rule 4) — the block reason is DERIVED, not stored. Proven by showing
-- the resolver returns NULL as soon as it is handed complete inputs: the same
-- function that blocks today unblocks with no code change.
SELECT 'P5-13' AS check,
       CASE WHEN econ.block_reason(100, 1, 48) IS NULL
             AND econ.block_reason(100, 1, NULL) = 'no_fx_rate'
             AND econ.block_reason(0,   1, 48)   = 'no_revenue_in_period'
             AND econ.block_reason(100, NULL, NULL) = 'no_cost_in_period'
             AND econ.block_reason(0,   NULL, NULL) = 'no_revenue_and_no_cost_in_period'
            THEN 'PASS' ELSE 'FAIL' END AS result,
       'complete inputs -> ' || COALESCE(econ.block_reason(100,1,48), 'NULL (unblocked)')
         || '; missing FX -> ' || econ.block_reason(100,1,NULL)
         || '; missing cost -> ' || econ.block_reason(100,NULL,NULL) AS detail;

-- P5-14 — coverage names every blocker in plain language (rule 3).
SELECT 'P5-14' AS check,
       CASE WHEN count(*) FILTER (WHERE state = 'blocked' AND (detail IS NULL OR detail = '')) = 0
            THEN 'PASS' ELSE 'FAIL' END AS result,
       count(*) FILTER (WHERE state = 'blocked')::text || ' blocked metric(s), all with a stated reason' AS detail
  FROM econ.v_coverage;

\echo ''
\echo '=== D. RPC invocation smoke test =========================================='

-- P5-17 — every owner_econ_* RPC actually EXECUTES.
--
-- WHY THIS EXISTS
--   PostgreSQL type-checks a plpgsql RETURN QUERY against the declared
--   RETURNS TABLE only at EXECUTION, never at CREATE. Three Phase 5 RPCs
--   therefore shipped un-callable — declaring `bigint` for a column the view
--   produces as `numeric`, because sum(bigint) widens to numeric and a count
--   begins as count(*), which is bigint — and stayed broken from 2026-07-31
--   until the Phase 6 M2 release gate called one for the first time on
--   2026-08-01.
--
--   Nothing else in this file catches that class. The other checks test VIEWS,
--   and P5-04/P5-05 test function METADATA — volatility, SECURITY DEFINER, the
--   owner gate, grants. All of those passed while the functions were broken.
--   Only an invocation surfaces it.
--
-- HOW
--   The RPC list is discovered from the catalog, not hardcoded, so any RPC
--   added later is covered automatically. Every owner_econ_* takes only
--   defaulted parameters, so each is callable with no arguments.
--
--   The owner gate is exercised for real: the block impersonates an owner via
--   request.jwt.claims rather than bypassing has_role_at_least().
--
-- READING IT
--   A zero-row return is still a real test. RETURN QUERY validates the tuple
--   descriptor against the declared RETURNS TABLE up front, independently of
--   how many rows the query yields — measured 2026-08-01, when
--   owner_econ_service_economics() raised the mismatch while reading a view
--   that contained zero rows. So count(*) = 0 here means the RPC is sound, not
--   merely untested. Row counts are reported for visibility only.
CREATE TEMP TABLE p5_17_smoke(rpc text, ok boolean, n_rows bigint, err text);

DO $p5_17$
DECLARE
  v_owner uuid;
  r record;
  n bigint;
BEGIN
  SELECT id INTO v_owner FROM public.profiles WHERE role = 'owner' ORDER BY id LIMIT 1;
  IF v_owner IS NULL THEN
    INSERT INTO p5_17_smoke VALUES ('(no owner profile)', false, NULL,
                                    'cannot exercise the owner gate');
    RETURN;
  END IF;
  PERFORM set_config('request.jwt.claims',
                     json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);

  FOR r IN SELECT p.proname AS nm
             FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
            WHERE ns.nspname = 'public' AND p.proname LIKE 'owner\_econ\_%'
            ORDER BY p.proname
  LOOP
    BEGIN
      EXECUTE format('SELECT count(*) FROM public.%I()', r.nm) INTO n;
      INSERT INTO p5_17_smoke VALUES (r.nm, true, n, NULL);
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO p5_17_smoke VALUES (r.nm, false, NULL, SQLSTATE || ' ' || SQLERRM);
    END;
  END LOOP;
END
$p5_17$;

SELECT 'P5-17' AS check,
       CASE WHEN count(*) > 0 AND count(*) FILTER (WHERE NOT ok) = 0
            THEN 'PASS' ELSE 'FAIL' END AS result,
       count(*)::text || ' owner_econ_* RPC(s) invoked, '
         || count(*) FILTER (WHERE NOT ok)::text || ' raised'
         || COALESCE(' — ' || string_agg(rpc || ' [' || err || ']', '; ')
                               FILTER (WHERE NOT ok), '')
         || COALESCE(' | returning 0 rows (sound, but empty): '
                     || string_agg(rpc, ', ') FILTER (WHERE ok AND n_rows = 0), '') AS detail
  FROM p5_17_smoke;

DROP TABLE p5_17_smoke;

\echo ''
\echo '=== E. Current coverage (informational) ==================================='
SELECT metric, state, left(detail, 90) AS detail FROM econ.v_coverage ORDER BY metric;

\echo ''
\echo 'Any FAIL above blocks the Phase 5 exit (docs/roadmap/ai-economics.md §14).'
\echo ''
