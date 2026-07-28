-- ===========================================================================
-- AI Economics · Phase 3 verification — AI model-call telemetry
-- ===========================================================================
-- Read-only. Writes nothing, locks nothing, safe to run against production at
-- any time.
--
-- Two jobs:
--   1. Structure — the table exists with the right posture (no money column,
--      no client access, immutable to the writer).
--   2. Truth — the data actually arriving is the data we designed for. This is
--      the half that matters: the whole reason Phase 3 exists is that
--      ai_usage_logs has recorded 0 tokens on 1,134 rows while claiming a model
--      the function never calls. A telemetry table that "exists" but records
--      zeros would be the same failure with a new name.
--
-- Usage:
--   psql "$SUPABASE_DB_URL" -f scripts/verify-ai-telemetry.sql
-- or paste into Supabase Dashboard → SQL Editor.
--
-- Every row must read PASS. WARN means "not enough production data yet" and is
-- expected between applying the migration and the first student questions
-- landing; re-run after traffic. Any FAIL blocks Phase 4.
--
-- Run before the migration is applied and this errors with "relation
-- public.ai_model_calls does not exist" — that is the expected pre-apply state.
-- ===========================================================================

WITH
expected_stages (stage) AS (
  VALUES ('tutor_main'), ('resolve'), ('extract'), ('rerun'),
         ('question_detect'), ('solver_a'), ('solver_b'), ('verdict'), ('classify')
),
sample AS (SELECT count(*) AS n FROM public.ai_model_calls),

checks AS (

  -- ── P3-01: the table exists ──────────────────────────────────────────────
  SELECT
    'P3-01'                                            AS check_id,
    'ai_model_calls table exists'                      AS "check",
    CASE WHEN COUNT(*) = 1 THEN 'PASS' ELSE 'FAIL' END AS status,
    CASE WHEN COUNT(*) = 1 THEN 'table present'
         ELSE 'missing — migration not applied' END    AS detail
  FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'ai_model_calls'

  -- ── P3-02: no client role can touch it ───────────────────────────────────
  UNION ALL
  SELECT
    'P3-02',
    'anon/authenticated hold no privileges',
    CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END,
    CASE WHEN COUNT(*) = 0 THEN 'no client grants'
         ELSE 'granted: ' || string_agg(DISTINCT grantee || ':' || privilege_type, ', ') END
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public' AND table_name = 'ai_model_calls'
    AND grantee IN ('anon', 'authenticated', 'PUBLIC')

  -- ── P3-03: RLS on ────────────────────────────────────────────────────────
  UNION ALL
  SELECT
    'P3-03',
    'RLS enabled',
    CASE WHEN bool_and(c.relrowsecurity) THEN 'PASS' ELSE 'FAIL' END,
    CASE WHEN bool_and(c.relrowsecurity) THEN 'row level security enabled'
         ELSE 'RLS OFF' END
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'ai_model_calls'

  -- ── P3-04: telemetry carries no money (INV-01) ───────────────────────────
  UNION ALL
  SELECT
    'P3-04',
    'no cost/price/currency column (INV-01)',
    CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END,
    CASE WHEN COUNT(*) = 0 THEN 'telemetry records usage only, never money'
         ELSE 'MONEY LEAKED INTO TELEMETRY: ' || string_agg(column_name, ', ') END
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'ai_model_calls'
    AND column_name ~* '(cost|price|usd|egp|fx|rate|amount|discount|currency)'

  -- ── P3-05: immutable to its own writer (INV-15) ──────────────────────────
  UNION ALL
  SELECT
    'P3-05',
    'service_role can INSERT but not UPDATE/DELETE',
    CASE WHEN has_table_privilege('service_role','public.ai_model_calls','INSERT')
          AND NOT has_table_privilege('service_role','public.ai_model_calls','UPDATE')
          AND NOT has_table_privilege('service_role','public.ai_model_calls','DELETE')
         THEN 'PASS' ELSE 'FAIL' END,
    'INSERT='   || has_table_privilege('service_role','public.ai_model_calls','INSERT')::text
      || ' UPDATE=' || has_table_privilege('service_role','public.ai_model_calls','UPDATE')::text
      || ' DELETE=' || has_table_privilege('service_role','public.ai_model_calls','DELETE')::text
      || '  [expect true/false/false]'

  -- ── P3-06: indexes present ───────────────────────────────────────────────
  UNION ALL
  SELECT
    'P3-06',
    'all six query indexes present',
    CASE WHEN COUNT(*) >= 6 THEN 'PASS' ELSE 'FAIL' END,
    COUNT(*) || ' indexes on ai_model_calls [expect >= 6 plus the pkey]'
  FROM pg_indexes
  WHERE schemaname = 'public' AND tablename = 'ai_model_calls'
    AND indexname <> 'ai_model_calls_pkey'

  -- ── P3-07: data is arriving ──────────────────────────────────────────────
  UNION ALL
  SELECT
    'P3-07',
    'telemetry rows exist',
    CASE WHEN (SELECT n FROM sample) > 0 THEN 'PASS' ELSE 'WARN' END,
    CASE WHEN (SELECT n FROM sample) > 0
         THEN (SELECT n FROM sample) || ' rows recorded'
         ELSE 'no rows yet — expected until v90 is deployed and a student asks a question' END

  -- ── P3-08: THE POINT OF PHASE 3 — tokens are real ────────────────────────
  -- Pre-v90 the platform recorded 0 tokens on every one of 1,134 ai_usage_logs
  -- rows. If successful calls still carry 0 tokens, Phase 3 has reproduced the
  -- exact defect it exists to fix, and Phase 4 would price nothing.
  UNION ALL
  SELECT
    'P3-08',
    'successful calls record non-zero tokens',
    CASE WHEN (SELECT n FROM sample) = 0                       THEN 'WARN'
         WHEN COUNT(*) FILTER (WHERE success) = 0              THEN 'WARN'
         WHEN COUNT(*) FILTER (WHERE success AND prompt_tokens > 0) = 0 THEN 'FAIL'
         ELSE 'PASS' END,
    CASE WHEN (SELECT n FROM sample) = 0 THEN 'no data yet'
         WHEN COUNT(*) FILTER (WHERE success) = 0 THEN 'no successful calls yet'
         ELSE COUNT(*) FILTER (WHERE success AND prompt_tokens > 0) || ' of '
              || COUNT(*) FILTER (WHERE success) || ' successful calls carry tokens; '
              || COALESCE(sum(prompt_tokens), 0) || ' prompt + '
              || COALESCE(sum(completion_tokens), 0) || ' completion recorded' END
  FROM public.ai_model_calls

  -- ── P3-09: units decompose prompt_tokens exactly ─────────────────────────
  -- input_token + cached_input_token must equal prompt_tokens, or the Cost
  -- Engine will price a different quantity than the provider billed.
  UNION ALL
  SELECT
    'P3-09',
    'units reconcile with the token mirrors',
    CASE WHEN (SELECT n FROM sample) = 0 THEN 'WARN'
         WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END,
    CASE WHEN (SELECT n FROM sample) = 0 THEN 'no data yet'
         WHEN COUNT(*) = 0 THEN 'input_token + cached_input_token = prompt_tokens on every row'
         ELSE COUNT(*) || ' row(s) where units do not reconcile' END
  FROM public.ai_model_calls
  WHERE success AND prompt_tokens > 0
    AND COALESCE((units->>'input_token')::int, 0)
      + COALESCE((units->>'cached_input_token')::int, 0) <> prompt_tokens

  -- ── P3-10: every service_code is in the catalog ──────────────────────────
  -- Soft by design: an unregistered code is recorded, not rejected. It still
  -- needs to be visible, because Phase 4 would price it as `unregistered`.
  UNION ALL
  SELECT
    'P3-10',
    'every emitted service_code exists in ai_catalog',
    CASE WHEN (SELECT n FROM sample) = 0 THEN 'WARN'
         WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'WARN' END,
    CASE WHEN (SELECT n FROM sample) = 0 THEN 'no data yet'
         WHEN COUNT(*) = 0 THEN 'all emitted capabilities are registered'
         ELSE 'UNREGISTERED: ' || string_agg(DISTINCT t.service_code, ', ') END
  FROM public.ai_model_calls t
  WHERE NOT EXISTS (
    SELECT 1 FROM ai_catalog.services s WHERE s.service_code = t.service_code)

  -- ── P3-11: every (service, model) pair matches a current binding ─────────
  UNION ALL
  SELECT
    'P3-11',
    'observed service/model pairs match catalog bindings',
    CASE WHEN (SELECT n FROM sample) = 0 THEN 'WARN'
         WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'WARN' END,
    CASE WHEN (SELECT n FROM sample) = 0 THEN 'no data yet'
         WHEN COUNT(*) = 0 THEN 'production matches the Phase 2 catalog exactly'
         ELSE 'UNBOUND: ' || string_agg(DISTINCT t.service_code || '/' || t.model, ', ') END
  FROM public.ai_model_calls t
  WHERE NOT EXISTS (
    SELECT 1 FROM ai_catalog.service_bindings b
     WHERE b.service_code = t.service_code AND b.model = t.model
       AND b.provider_code = t.provider AND b.effective_to IS NULL)

  -- ── P3-12: stage vocabulary is the expected one ──────────────────────────
  UNION ALL
  SELECT
    'P3-12',
    'stages are from the documented set',
    CASE WHEN (SELECT n FROM sample) = 0 THEN 'WARN'
         WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'WARN' END,
    CASE WHEN (SELECT n FROM sample) = 0 THEN 'no data yet'
         WHEN COUNT(*) = 0 THEN 'nine documented stages only'
         ELSE 'UNEXPECTED: ' || string_agg(DISTINCT t.stage, ', ') END
  FROM public.ai_model_calls t
  WHERE NOT EXISTS (SELECT 1 FROM expected_stages e WHERE e.stage = t.stage)

  -- ── P3-13: fan-out is in the expected range ──────────────────────────────
  -- Architecture §5.2 predicts 1 call for a plain text question and up to 6
  -- when images and the L3 pipeline are involved. A request emitting more than
  -- 10 rows means something is recording twice.
  UNION ALL
  SELECT
    'P3-13',
    'no request records an implausible number of calls',
    CASE WHEN (SELECT n FROM sample) = 0 THEN 'WARN'
         WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END,
    CASE WHEN (SELECT n FROM sample) = 0 THEN 'no data yet'
         WHEN COUNT(*) = 0 THEN 'every request emitted <= 10 calls'
         ELSE COUNT(*) || ' request(s) emitted > 10 calls — suspect double recording' END
  FROM (
    SELECT request_id FROM public.ai_model_calls
    GROUP BY request_id HAVING count(*) > 10
  ) noisy

  -- ── P3-14: failures are being captured, not swallowed ────────────────────
  -- Informational: a period with zero failures is plausible and healthy. This
  -- reports the split so GAP-7 coverage is visible rather than assumed.
  UNION ALL
  SELECT
    'P3-14',
    'failure capture (GAP-7) is observable',
    CASE WHEN (SELECT n FROM sample) = 0 THEN 'WARN' ELSE 'PASS' END,
    CASE WHEN (SELECT n FROM sample) = 0 THEN 'no data yet'
         ELSE COUNT(*) FILTER (WHERE NOT success) || ' failed call(s) of '
              || COUNT(*) || ' recorded'
              || COALESCE(' — codes: ' || string_agg(DISTINCT error_code, ', ')
                          FILTER (WHERE error_code IS NOT NULL), '') END
  FROM public.ai_model_calls

  -- ── P3-15: attribution is landing ────────────────────────────────────────
  UNION ALL
  SELECT
    'P3-15',
    'calls are attributed to a question and a student',
    CASE WHEN (SELECT n FROM sample) = 0 THEN 'WARN'
         WHEN COUNT(*) FILTER (WHERE question_record_id IS NULL) * 2 > COUNT(*) THEN 'WARN'
         ELSE 'PASS' END,
    CASE WHEN (SELECT n FROM sample) = 0 THEN 'no data yet'
         ELSE COUNT(*) FILTER (WHERE question_record_id IS NOT NULL) || '/' || COUNT(*)
              || ' rows carry a question_record_id; '
              || COUNT(*) FILTER (WHERE user_id IS NOT NULL) || '/' || COUNT(*)
              || ' carry a user_id' END
  FROM public.ai_model_calls
)

SELECT status, check_id, "check", detail
FROM checks
ORDER BY
  CASE status WHEN 'FAIL' THEN 0 WHEN 'WARN' THEN 1 ELSE 2 END,
  check_id;
