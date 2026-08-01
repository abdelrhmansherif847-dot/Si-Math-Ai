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
--
-- ---------------------------------------------------------------------------
-- READING THE RESULTS — three verdicts, not two (added 2026-08-01)
--
--   PASS      the assertion examined >= 1 candidate row and found no violation
--   VACUOUS   the assertion examined ZERO candidate rows — it proved NOTHING
--   FAIL      a violation was found
--
-- WHY VACUOUS EXISTS. Phase 6 caught the same defect three milestones running:
-- a check that passes because its input is empty, printing PASS
-- indistinguishably from one that examined 383 rows. M4.1 compared zero rows,
-- M4.2 compared only rows that were present (and so could not see an absent
-- one), M4.3 found P5-02b reading a view that holds no rows at all.
--
--   A green check is only evidence if it could have gone red.
--
-- VACUOUS is deliberately NOT a failure. An empty population is frequently the
-- correct state of this system — no unpriced facts, no shared-cost requests,
-- no external traffic yet — and failing on it would train everyone to ignore
-- the suite. It is a statement that the check abstained, so a reader can tell
-- load-bearing passes from empty ones. Only FAIL blocks.
--
-- Every count-based check now reports its EXAMINED POPULATION in `detail`
-- ("3 of 383 ..."), so the denominator is visible even when the verdict is
-- PASS.
--
-- See docs/roadmap/verification-framework-audit.md for the full audit.
-- ===========================================================================
\pset pager off

\echo ''
\echo '=== A. Layer boundary and posture ========================================='

-- P5-01 — econ never reads the price book (§8.10 rule 8, INV-05). This is the
-- structural check: PostgreSQL's own dependency graph, not a grep.
-- Reports the examined population: the old form filtered to the violating set
-- in its WHERE clause, so a PASS could not distinguish "econ reads cost_engine
-- 44 times and never touches the price book" from "econ reads cost_engine not
-- at all". Those are very different facts.
SELECT 'P5-01' AS check,
       CASE WHEN t.examined = 0   THEN 'VACUOUS'
            WHEN t.violations = 0 THEN 'PASS'
            ELSE 'FAIL' END AS result,
       t.violations::text || ' price-book dependency edge(s) of '
         || t.examined::text || ' econ->cost_engine edge(s) examined'
         || CASE WHEN t.examined = 0
                 THEN ' — VACUOUS: econ depends on no cost_engine object at all'
                 WHEN t.violations = 0
                 THEN ' — econ never reads rate_cards/rate_components/discount_rules/fx_rates'
                 ELSE ' — ' || COALESCE(t.offenders, '') END AS detail
  FROM (
    SELECT count(*) AS examined,
           count(*) FILTER (WHERE dep.relname IN
             ('rate_cards','rate_components','discount_rules','fx_rates')) AS violations,
           string_agg(DISTINCT dep.relname, ', ') FILTER (WHERE dep.relname IN
             ('rate_cards','rate_components','discount_rules','fx_rates')) AS offenders
      FROM pg_depend d
      JOIN pg_rewrite r  ON r.oid = d.objid
      JOIN pg_class v    ON v.oid = r.ev_class
      JOIN pg_namespace vn ON vn.oid = v.relnamespace
      JOIN pg_class dep  ON dep.oid = d.refobjid
      JOIN pg_namespace dn ON dn.oid = dep.relnamespace
     WHERE vn.nspname = 'econ' AND dn.nspname = 'cost_engine'
  ) t;

-- P5-02 — econ exposes no AI provider or model column (INV-13).
--
-- Targets the ENGINE's identifiers specifically. A bare /provider/ match is
-- wrong here: `v_revenue_events.provider_fee_egp` is the PAYMENT GATEWAY's
-- fee — revenue-side data econ legitimately owns (§9) — and has nothing to do
-- with the AI provider INV-13 is about. Matching it would fail a rule it does
-- not violate.
SELECT 'P5-02' AS check,
       CASE WHEN t.examined = 0   THEN 'VACUOUS'
            WHEN t.violations = 0 THEN 'PASS'
            ELSE 'FAIL' END AS result,
       t.violations::text || ' forbidden identifier column(s) of '
         || t.examined::text || ' econ column(s) examined'
         || CASE WHEN t.examined = 0
                 THEN ' — VACUOUS: the econ schema exposes no columns at all'
                 WHEN t.violations = 0 THEN ' — no AI provider/model identifier exposed by econ'
                 ELSE ' — ' || COALESCE(t.offenders, '') END AS detail
  FROM (
    SELECT count(*) AS examined,
           count(*) FILTER (WHERE column_name IN
             ('provider','provider_code','model','api_surface',
              'rate_card_id','rate_card_ver','binding_id')) AS violations,
           string_agg(table_name || '.' || column_name, ', ') FILTER (WHERE column_name IN
             ('provider','provider_code','model','api_surface',
              'rate_card_id','rate_card_ver','binding_id')) AS offenders
      FROM information_schema.columns
     WHERE table_schema = 'econ'
  ) t;

-- P5-02b — and no econ view emits an actual provider code as DATA. This is
-- the stronger form: a column could be innocently named and still carry a
-- vendor name through.
--
-- THIS CHECK WAS VACUOUS AND SAID NOTHING ABOUT IT. It reads
-- econ.v_service_economics, which holds 0 rows because it excludes internal
-- traffic and 100% of telemetry is currently internal — so it could not fail,
-- yet printed PASS indistinguishably from a check that examined 383 rows.
-- Pre-existing since Phase 5; found by the M4.3 release gate and catalogued in
-- the framework audit (Class B).
--
-- Two changes, neither of which alters what the system does:
--   1. it now reports VACUOUS when its candidate population is 0, and
--   2. the population is widened from ONE view to EVERY econ view that carries
--      a service_code, so the check stops depending on a single view's
--      emptiness. It becomes non-vacuous the moment any of them has rows.
--
-- Kept deliberately narrow in one respect: the audit's stronger jsonb-scan form
-- (every value of every populated econ view vs every provider code and model
-- name) is NOT implemented here. That is a new assertion, not a repair of this
-- one, and it needs its own approval.
SELECT 'P5-02b' AS check,
       CASE WHEN t.examined = 0   THEN 'VACUOUS'
            WHEN t.violations = 0 THEN 'PASS'
            ELSE 'FAIL' END AS result,
       t.violations::text || ' service_code value(s) matching a provider code, of '
         || t.examined::text || ' econ service_code row(s) examined across '
         || t.views::text || ' view(s)'
         || CASE WHEN t.examined = 0
                 THEN ' — VACUOUS: no econ view currently emits a service_code row, '
                      || 'so this check proved nothing'
                 WHEN t.violations = 0 THEN ' — must be 0'
                 ELSE ' — INV-13 violated' END AS detail
  FROM (
    SELECT count(*)                                          AS examined,
           count(*) FILTER (WHERE p.provider_code IS NOT NULL) AS violations,
           count(DISTINCT s.src)                             AS views
      FROM (
        SELECT 'v_service_economics'::text AS src, e.service_code FROM econ.v_service_economics e
        UNION ALL
        SELECT 'v_operation_service_mix',        m.service_code FROM econ.v_operation_service_mix m
      ) s
      LEFT JOIN ai_catalog.providers p ON p.provider_code = s.service_code
  ) t;

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
       CASE WHEN t.examined = 0   THEN 'VACUOUS'
            WHEN t.violations = 0 THEN 'PASS'
            ELSE 'FAIL' END AS result,
       t.violations::text || ' of ' || t.examined::text
         || ' owner_econ_* function(s) executable by anon'
         || CASE WHEN t.examined = 0
                 THEN ' — VACUOUS: no owner_econ_* function exists to test'
                 ELSE ' — must be 0' END AS detail
  FROM (
    SELECT count(*) AS examined,
           count(*) FILTER (WHERE has_function_privilege('anon', p.oid, 'EXECUTE')) AS violations
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.proname LIKE 'owner\_econ\_%'
  ) t;

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
       CASE WHEN t.examined = 0   THEN 'VACUOUS'
            WHEN t.violations = 0 THEN 'PASS'
            ELSE 'FAIL' END AS result,
       t.violations::text || ' of ' || t.examined::text
         || ' money-bearing econ view(s) missing a confidence column'
         || CASE WHEN t.examined = 0
                 THEN ' — VACUOUS: no econ view exposes money'
                 WHEN t.violations = 0 THEN ' — every money-bearing econ view carries confidence'
                 ELSE ' — ' || COALESCE(t.offenders, '') END AS detail
  FROM (
    SELECT (SELECT count(DISTINCT c.table_name)
              FROM information_schema.columns c
             WHERE c.table_schema = 'econ'
               AND c.column_name ~* 'egp|usd|profit|margin')            AS examined,
           (SELECT count(*) FROM (
              SELECT c.table_name
                FROM information_schema.columns c
               WHERE c.table_schema = 'econ'
                 AND c.column_name ~* 'egp|usd|profit|margin'
               GROUP BY c.table_name
              EXCEPT
              SELECT c2.table_name
                FROM information_schema.columns c2
               WHERE c2.table_schema = 'econ' AND c2.column_name = 'confidence') d) AS violations,
           (SELECT string_agg(x, ', ') FROM (
              SELECT c.table_name AS x
                FROM information_schema.columns c
               WHERE c.table_schema = 'econ'
                 AND c.column_name ~* 'egp|usd|profit|margin'
               GROUP BY c.table_name
              EXCEPT
              SELECT c2.table_name
                FROM information_schema.columns c2
               WHERE c2.table_schema = 'econ' AND c2.column_name = 'confidence') d2) AS offenders
  ) t;

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
       CASE WHEN t.examined = 0   THEN 'VACUOUS'
            WHEN t.violations = 0 THEN 'PASS'
            ELSE 'FAIL' END AS result,
       t.violations::text || ' of ' || t.examined::text
         || ' econ view(s) hardcoding a confidence class'
         || CASE WHEN t.examined = 0
                 THEN ' — VACUOUS: the econ schema contains no views'
                 WHEN t.violations = 0 THEN ' — no econ view hardcodes a confidence class'
                 ELSE ' — ' || COALESCE(t.offenders, '') END AS detail
  FROM (
    SELECT count(*) AS examined,
           count(*) FILTER (WHERE definition ~ '''(actual|modeled|derived)''::text AS confidence') AS violations,
           string_agg(viewname, ', ') FILTER (WHERE definition ~ '''(actual|modeled|derived)''::text AS confidence') AS offenders
      FROM pg_views
     WHERE schemaname = 'econ'
  ) t;

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

-- P5-09 (rule 1) — revenue and cost are readable INDEPENDENTLY of each other.
--
-- THIS CHECK USED TO BE A CONSTANT. Until the 2026-08-01 verification-framework
-- pass it read `SELECT 'P5-09' AS check, 'PASS' AS result, ...` — a hardcoded
-- literal with no CASE. It reported two row counts and asserted nothing, so it
-- could not fail under any data, and the rule it names was untested. Found by
-- the framework audit (docs/roadmap/verification-framework-audit.md, Class A).
--
-- It now asserts the rule the same way P5-01 does: PostgreSQL's own dependency
-- graph, not a grep. Independence must hold in BOTH directions — a cost object
-- reaching into revenue breaks rule 1 exactly as badly as the reverse, and a
-- one-directional check would miss half of it.
--
-- Readability is still reported, but deliberately NOT asserted as non-empty:
-- zero revenue rows is a legitimate state (a fresh deployment), not a failure.
-- The falsifiable claim here is the absence of a dependency, and that claim has
-- a real population — the edges the revenue views actually have.
SELECT 'P5-09' AS check,
       CASE WHEN t.rev_on_cost > 0 OR t.cost_on_rev > 0 THEN 'FAIL'
            WHEN t.rev_edges = 0                        THEN 'VACUOUS'
            ELSE 'PASS' END AS result,
       t.rev_on_cost::text || ' revenue->cost + ' || t.cost_on_rev::text
         || ' cost->revenue dependency edge(s) among ' || t.rev_edges::text
         || ' revenue-view edge(s) examined'
         || CASE WHEN t.rev_on_cost = 0 AND t.cost_on_rev = 0
                 THEN ' — independent in both directions'
                 ELSE ' — DEPENDENCY FOUND, rule 1 violated' END
         || ' | revenue rows: ' || t.rev_rows::text
         || ', cost days: '     || t.cost_rows::text AS detail
  FROM (SELECT
    -- every relation the revenue views depend on, whatever the schema
    (SELECT count(*) FROM pg_depend d
       JOIN pg_rewrite r ON r.oid = d.objid
       JOIN pg_class v ON v.oid = r.ev_class
       JOIN pg_namespace vn ON vn.oid = v.relnamespace
       JOIN pg_class dep ON dep.oid = d.refobjid
      WHERE vn.nspname = 'econ'
        AND v.relname IN ('v_revenue_events','v_revenue_recognized_daily')
        AND dep.relname <> v.relname)                                AS rev_edges,
    -- ... of which any landing in cost_engine violates rule 1
    (SELECT count(*) FROM pg_depend d
       JOIN pg_rewrite r ON r.oid = d.objid
       JOIN pg_class v ON v.oid = r.ev_class
       JOIN pg_namespace vn ON vn.oid = v.relnamespace
       JOIN pg_class dep ON dep.oid = d.refobjid
       JOIN pg_namespace dn ON dn.oid = dep.relnamespace
      WHERE vn.nspname = 'econ' AND dn.nspname = 'cost_engine'
        AND v.relname IN ('v_revenue_events','v_revenue_recognized_daily'))  AS rev_on_cost,
    -- and the reverse direction: no cost_engine object may read econ
    (SELECT count(*) FROM pg_depend d
       JOIN pg_rewrite r ON r.oid = d.objid
       JOIN pg_class v ON v.oid = r.ev_class
       JOIN pg_namespace vn ON vn.oid = v.relnamespace
       JOIN pg_class dep ON dep.oid = d.refobjid
       JOIN pg_namespace dn ON dn.oid = dep.relnamespace
      WHERE vn.nspname = 'cost_engine' AND dn.nspname = 'econ')          AS cost_on_rev,
    (SELECT count(*) FROM econ.v_revenue_events)                          AS rev_rows,
    (SELECT count(*) FROM cost_engine.v_cost_daily)                       AS cost_rows
  ) t;

-- P5-10 (rules 2 + 3) — a blocked metric is NULL and states why. Never 0.
--
-- HALF OF THIS CHECK IS VACUOUS, and the old single-count form concealed it.
-- The rule is a biconditional tested in two directions over two DIFFERENT
-- populations:
--   blocked -> no profit figure   examined over rows WITH a block_reason
--   computed -> no block reason   examined over rows WITHOUT one
-- Today all 383 P&L days are blocked, so the second direction examines ZERO
-- rows. Summing both into one count(*) made a fully-exercised direction and an
-- entirely unexercised one indistinguishable.
--
-- Now each direction reports its own population, and the verdict is VACUOUS
-- only when BOTH are empty — a single exercised direction is still evidence.
SELECT 'P5-10' AS check,
       CASE WHEN t.blocked_pop = 0 AND t.computed_pop = 0 THEN 'VACUOUS'
            WHEN t.blocked_bad + t.computed_bad = 0       THEN 'PASS'
            ELSE 'FAIL' END AS result,
       t.blocked_bad::text || ' of ' || t.blocked_pop::text
         || ' blocked row(s) carry a profit figure; '
         || t.computed_bad::text || ' of ' || t.computed_pop::text
         || ' computed row(s) carry a block reason'
         || CASE WHEN t.blocked_pop = 0 AND t.computed_pop = 0
                 THEN ' — VACUOUS: no P&L rows at all'
                 WHEN t.computed_pop = 0
                 THEN ' — note: the computed->no-reason direction examined 0 rows (all P&L days are blocked)'
                 WHEN t.blocked_pop = 0
                 THEN ' — note: the blocked->no-profit direction examined 0 rows'
                 ELSE ' — both directions exercised' END AS detail
  FROM (
    SELECT count(*) FILTER (WHERE block_reason IS NOT NULL)                             AS blocked_pop,
           count(*) FILTER (WHERE block_reason IS NOT NULL AND gross_profit_egp IS NOT NULL) AS blocked_bad,
           count(*) FILTER (WHERE block_reason IS NULL)                                 AS computed_pop,
           count(*) FILTER (WHERE block_reason IS NULL AND gross_profit_egp IS NULL)    AS computed_bad
      FROM econ.v_pnl_daily
  ) t;

-- P5-11 (rule 3) — every blocked row names a reason, and never reports 0.
SELECT 'P5-11' AS check,
       CASE WHEN t.examined = 0   THEN 'VACUOUS'
            WHEN t.violations = 0 THEN 'PASS'
            ELSE 'FAIL' END AS result,
       t.violations::text || ' of ' || t.examined::text
         || ' row(s) with no profit figure lack a stated reason'
         || CASE WHEN t.examined = 0
                 THEN ' — VACUOUS: every P&L row carries a profit figure, so rule 3 was not exercised'
                 ELSE ' — must be 0' END AS detail
  FROM (
    SELECT count(*) FILTER (WHERE gross_profit_egp IS NULL) AS examined,
           count(*) FILTER (WHERE gross_profit_egp IS NULL
                              AND (block_reason IS NULL OR block_reason = '')) AS violations
      FROM econ.v_pnl_daily
  ) t;

-- P5-12 (rule 2) — a blocked metric always carries confidence 'blocked'.
SELECT 'P5-12' AS check,
       CASE WHEN t.examined = 0   THEN 'VACUOUS'
            WHEN t.violations = 0 THEN 'PASS'
            ELSE 'FAIL' END AS result,
       t.violations::text || ' of ' || t.examined::text
         || ' blocked row(s) not marked confidence=blocked'
         || CASE WHEN t.examined = 0
                 THEN ' — VACUOUS: no P&L row is blocked, so rule 2 was not exercised'
                 ELSE ' — must be 0' END AS detail
  FROM (
    SELECT count(*) FILTER (WHERE block_reason IS NOT NULL) AS examined,
           count(*) FILTER (WHERE block_reason IS NOT NULL AND confidence <> 'blocked') AS violations
      FROM econ.v_pnl_daily
  ) t;

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
       CASE WHEN t.examined = 0   THEN 'VACUOUS'
            WHEN t.violations = 0 THEN 'PASS'
            ELSE 'FAIL' END AS result,
       t.violations::text || ' of ' || t.examined::text
         || ' blocked coverage metric(s) with no stated reason'
         || CASE WHEN t.examined = 0
                 THEN ' — VACUOUS: nothing is blocked, so rule 3 was not exercised here'
                 ELSE ' — must be 0' END AS detail
  FROM (
    SELECT count(*) FILTER (WHERE state = 'blocked') AS examined,
           count(*) FILTER (WHERE state = 'blocked'
                              AND (detail IS NULL OR detail = '')) AS violations
      FROM econ.v_coverage
  ) t;

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
