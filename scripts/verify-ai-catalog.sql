-- ===========================================================================
-- AI Economics · Phase 2 verification — AI Service Catalog
-- ===========================================================================
-- Read-only. Writes nothing, locks nothing, safe to run against production at
-- any time.
--
-- Verifies that the AI Service Catalog is actually in force in the live
-- database — not that a migration file exists, and not that a migration
-- reported success. Encodes the Phase 2 exit criteria from
-- docs/roadmap/ai-economics.md §14:
--
--   "every call site in §5.2 maps to exactly one seeded service and binding"
--
-- Usage:
--   psql "$SUPABASE_DB_URL" -f scripts/verify-ai-catalog.sql
-- or paste into Supabase Dashboard → SQL Editor.
--
-- Every row must read PASS. Any FAIL blocks Phase 3.
-- A WARN means the check could not be made from SQL and needs a human look.
--
-- Run BEFORE the migration is applied and this script errors with
-- "schema ai_catalog does not exist" — that is the expected pre-apply state.
-- ===========================================================================

WITH
-- The eight ai-tutor call sites from architecture §5.2, as nine distinct
-- (capability, model) pairs. `ocr` covers two sites (extract + rerun) with one
-- binding because its stage_filter is NULL; `solver` covers solver_a + solver_b
-- for the same reason.
expected_bindings (service_code, model, call_site) AS (
  VALUES
    ('tutor',               'gpt-4o-mini', 'index.ts:3161 tutor_main, text path'),
    ('tutor',               'gpt-4o',      'index.ts:3161 tutor_main, vision path'),
    ('solver',              'gpt-4o-mini', 'index.ts:1532 solver_a + solver_b'),
    ('judge',               'gpt-4o',      'index.ts:1621 verdict'),
    ('ocr',                 'gpt-4o',      'index.ts:1278 extract + :1323 rerun'),
    ('vision',              'gpt-4o',      'index.ts:1372 question_detect'),
    ('difficulty_detector', 'gpt-4o-mini', 'index.ts:933 classify'),
    ('reference_resolver',  'gpt-4o-mini', 'index.ts:2501 resolve, text parent'),
    ('reference_resolver',  'gpt-4o',      'index.ts:2501 resolve, image parent')
),
live_services (service_code) AS (
  VALUES ('tutor'), ('solver'), ('judge'), ('ocr'), ('vision'),
         ('difficulty_detector'), ('reference_resolver')
),
ahead_services (service_code) AS (
  VALUES ('truth_engine'), ('sympy'), ('python'), ('embedding'), ('translation')
),

checks AS (

  -- ── P2-01: the schema exists ─────────────────────────────────────────────
  SELECT
    'P2-01'                                        AS check_id,
    'ai_catalog schema exists'                     AS "check",
    CASE WHEN COUNT(*) = 1 THEN 'PASS' ELSE 'FAIL' END AS status,
    CASE WHEN COUNT(*) = 1 THEN 'schema present'
         ELSE 'schema ai_catalog is missing — migration not applied' END AS detail
  FROM information_schema.schemata WHERE schema_name = 'ai_catalog'

  -- ── P2-02: client roles hold no schema access ────────────────────────────
  UNION ALL
  SELECT
    'P2-02',
    'anon/authenticated hold no USAGE on ai_catalog',
    CASE WHEN NOT has_schema_privilege('anon','ai_catalog','USAGE')
          AND NOT has_schema_privilege('authenticated','ai_catalog','USAGE')
         THEN 'PASS' ELSE 'FAIL' END,
    CASE WHEN NOT has_schema_privilege('anon','ai_catalog','USAGE')
          AND NOT has_schema_privilege('authenticated','ai_catalog','USAGE')
         THEN 'no client role can enter the schema'
         ELSE 'USAGE granted to: ' || concat_ws(', ',
                CASE WHEN has_schema_privilege('anon','ai_catalog','USAGE') THEN 'anon' END,
                CASE WHEN has_schema_privilege('authenticated','ai_catalog','USAGE') THEN 'authenticated' END) END

  -- ── P2-03: client roles hold no table privileges ─────────────────────────
  UNION ALL
  SELECT
    'P2-03',
    'anon/authenticated hold no table privileges in ai_catalog',
    CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END,
    CASE WHEN COUNT(*) = 0 THEN 'no client grants on any catalog table'
         ELSE 'granted: ' || string_agg(DISTINCT grantee || '.' || table_name || ':' || privilege_type, ', ') END
  FROM information_schema.role_table_grants
  WHERE table_schema = 'ai_catalog' AND grantee IN ('anon', 'authenticated', 'PUBLIC')

  -- ── P2-04: RLS enabled on every catalog table ────────────────────────────
  UNION ALL
  SELECT
    'P2-04',
    'RLS enabled on all three catalog tables',
    CASE WHEN COUNT(*) FILTER (WHERE c.relrowsecurity) = 3 THEN 'PASS' ELSE 'FAIL' END,
    'RLS on ' || COUNT(*) FILTER (WHERE c.relrowsecurity) || ' of ' || COUNT(*) || ' tables'
      || COALESCE(' — missing: ' || string_agg(c.relname, ', ') FILTER (WHERE NOT c.relrowsecurity), '')
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'ai_catalog' AND c.relkind = 'r'

  -- ── P2-05: the catalog carries no price ──────────────────────────────────
  -- INV-01 / INV-02: pricing lives only in the Cost Engine. services
  -- .cost_target_usd is the one documented exception — an owner-set
  -- optimization target used for flagging, never for calculating a cost.
  UNION ALL
  SELECT
    'P2-05',
    'no pricing column in ai_catalog (INV-02)',
    CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END,
    CASE WHEN COUNT(*) = 0 THEN 'catalog holds no price, rate, currency amount, or FX column'
         ELSE 'unexpected money column(s): ' || string_agg(table_name || '.' || column_name, ', ') END
  FROM information_schema.columns
  WHERE table_schema = 'ai_catalog'
    AND (column_name ~* '(price|rate|cost|usd|egp|fx|amount|discount)')
    AND NOT (table_name = 'services' AND column_name = 'cost_target_usd')

  -- ── P2-06: all twelve services seeded ────────────────────────────────────
  UNION ALL
  SELECT
    'P2-06',
    'all 12 canonical services present and active',
    CASE WHEN COUNT(*) = 12 AND COUNT(*) FILTER (WHERE active) = 12 THEN 'PASS' ELSE 'FAIL' END,
    COUNT(*) || ' services, ' || COUNT(*) FILTER (WHERE active) || ' active (expected 12 / 12)'
  FROM ai_catalog.services

  -- ── P2-07: the seven live capabilities exist ─────────────────────────────
  UNION ALL
  SELECT
    'P2-07',
    'seven live capabilities seeded',
    CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END,
    CASE WHEN COUNT(*) = 0 THEN 'tutor, solver, judge, ocr, vision, difficulty_detector, reference_resolver'
         ELSE 'MISSING: ' || string_agg(l.service_code, ', ') END
  FROM live_services l
  WHERE NOT EXISTS (SELECT 1 FROM ai_catalog.services s WHERE s.service_code = l.service_code)

  -- ── P2-08: the provider registry ─────────────────────────────────────────
  UNION ALL
  SELECT
    'P2-08',
    'openai registered as an active provider',
    CASE WHEN COUNT(*) = 1 THEN 'PASS' ELSE 'FAIL' END,
    CASE WHEN COUNT(*) = 1 THEN 'openai / external_api / USD'
         ELSE 'openai provider row missing or inactive' END
  FROM ai_catalog.providers
  WHERE provider_code = 'openai' AND active AND kind = 'external_api'

  -- ── P2-09: THE PHASE 2 EXIT CRITERION ────────────────────────────────────
  -- Every §5.2 call site maps to exactly one current binding.
  UNION ALL
  SELECT
    'P2-09',
    'every §5.2 call site maps to exactly one current binding',
    CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END,
    CASE WHEN COUNT(*) = 0 THEN 'all 9 (capability, model) pairs resolve 1:1'
         ELSE 'unresolved: ' || string_agg(e.service_code || '/' || e.model
                                           || ' (' || e.call_site || ') → ' || e.n || ' bindings', '; ') END
  FROM (
    SELECT x.service_code, x.model, x.call_site,
           (SELECT COUNT(*) FROM ai_catalog.service_bindings b
             WHERE b.service_code = x.service_code
               AND b.model        = x.model
               AND b.effective_to IS NULL) AS n
    FROM expected_bindings x
  ) e
  WHERE e.n <> 1

  -- ── P2-10: no binding beyond the expected nine ───────────────────────────
  UNION ALL
  SELECT
    'P2-10',
    'no current binding outside the expected set',
    CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END,
    CASE WHEN COUNT(*) = 0 THEN 'exactly the 9 documented bindings are current'
         ELSE 'undocumented: ' || string_agg(b.service_code || '/' || b.model, ', ') END
  FROM ai_catalog.service_bindings b
  WHERE b.effective_to IS NULL
    AND NOT EXISTS (SELECT 1 FROM expected_bindings x
                     WHERE x.service_code = b.service_code AND x.model = b.model)

  -- ── P2-11: registered-ahead services have no binding yet ─────────────────
  UNION ALL
  SELECT
    'P2-11',
    'registered-ahead services carry no binding',
    CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END,
    CASE WHEN COUNT(*) = 0 THEN 'truth_engine, sympy, python, embedding, translation await implementation'
         ELSE 'unexpectedly bound: ' || string_agg(DISTINCT b.service_code, ', ') END
  FROM ai_catalog.service_bindings b
  JOIN ahead_services a ON a.service_code = b.service_code

  -- ── P2-12: binding windows are sane ──────────────────────────────────────
  UNION ALL
  SELECT
    'P2-12',
    'no inverted or future-dated binding window',
    CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END,
    CASE WHEN COUNT(*) = 0 THEN 'every window starts in the past and ends after it starts'
         ELSE COUNT(*) || ' binding(s) with a bad window' END
  FROM ai_catalog.service_bindings
  WHERE (effective_to IS NOT NULL AND effective_to <= effective_from)
     OR effective_from > now()

  -- ── P2-13: every binding points at a registered service and provider ─────
  UNION ALL
  SELECT
    'P2-13',
    'no orphan binding',
    CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END,
    CASE WHEN COUNT(*) = 0 THEN 'every binding resolves to a seeded service and provider'
         ELSE COUNT(*) || ' orphan binding(s)' END
  FROM ai_catalog.service_bindings b
  WHERE NOT EXISTS (SELECT 1 FROM ai_catalog.services  s WHERE s.service_code  = b.service_code)
     OR NOT EXISTS (SELECT 1 FROM ai_catalog.providers p WHERE p.provider_code = b.provider_code)

  -- ── P2-14: the catalog is not exposed through PostgREST ──────────────────
  -- On this project the PostgREST schema list is not stored in the
  -- authenticator role's settings, so SQL usually cannot see it. When it is
  -- unreadable this reports WARN: confirm by hand in
  -- Dashboard → Settings → API → Exposed schemas (ai_catalog must be absent).
  UNION ALL
  SELECT
    'P2-14',
    'ai_catalog absent from the PostgREST exposed-schema list',
    CASE WHEN cfg IS NULL             THEN 'WARN'
         WHEN cfg LIKE '%ai_catalog%' THEN 'FAIL'
         ELSE 'PASS' END,
    CASE WHEN cfg IS NULL
           THEN 'not readable from SQL — verify in Dashboard → Settings → API → Exposed schemas'
         WHEN cfg LIKE '%ai_catalog%'
           THEN 'EXPOSED: ' || cfg
         ELSE 'exposed schemas: ' || cfg END
  FROM (
    SELECT (SELECT c FROM (
              SELECT unnest(s.setconfig) AS c
              FROM pg_db_role_setting s
              JOIN pg_roles r ON r.oid = s.setrole
              WHERE r.rolname = 'authenticator') z
            WHERE c LIKE 'pgrst.db_schemas%' LIMIT 1) AS cfg
  ) q

  -- ── P2-15: no production table was touched ───────────────────────────────
  -- Phase 2 is additive. ai_model_calls belongs to Phase 3 and must not exist
  -- yet; cost_engine and econ belong to Phase 4/5.
  UNION ALL
  SELECT
    'P2-15',
    'Phase 2 stayed additive — no later-phase object created early',
    CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'WARN' END,
    CASE WHEN COUNT(*) = 0 THEN 'no Phase 3+ objects present, as expected at Phase 2'
         ELSE 'present ahead of schedule: ' || string_agg(n, ', ') END
  FROM (
    SELECT 'public.ai_model_calls' AS n WHERE to_regclass('public.ai_model_calls') IS NOT NULL
    UNION ALL SELECT 'schema cost_engine' WHERE EXISTS (
      SELECT 1 FROM information_schema.schemata WHERE schema_name = 'cost_engine')
    UNION ALL SELECT 'schema econ' WHERE EXISTS (
      SELECT 1 FROM information_schema.schemata WHERE schema_name = 'econ')
  ) later
)

SELECT status, check_id, "check", detail
FROM checks
ORDER BY
  CASE status WHEN 'FAIL' THEN 0 WHEN 'WARN' THEN 1 ELSE 2 END,
  check_id;
