-- ===========================================================================
-- Production security verification — database layer
-- ===========================================================================
-- Read-only. Writes nothing, locks nothing, safe to run against production at
-- any time.
--
-- Verifies that the controls from SEC-01, SEC-04 and SEC-08 are actually in
-- force in the live database — not that a migration file exists, and not that
-- a migration reported success. SEC-01 is the reason for that distinction: the
-- first attempt at it returned `success` and changed nothing, because a
-- column-level REVOKE is a silent no-op against a table-wide grant. Only
-- reading the resulting privileges catches that.
--
-- Usage:
--   psql "$SUPABASE_DB_URL" -f scripts/verify-security-sql.sql
-- or paste into Supabase Dashboard → SQL Editor.
--
-- Every row must read PASS. Any FAIL is a release blocker.
-- ===========================================================================

WITH checks AS (

  -- ── SEC-01: privileged profile columns are server-authority only ─────────
  SELECT
    'SEC-01'                                   AS finding,
    'privileged profile columns not client-writable' AS check,
    CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END AS status,
    CASE WHEN COUNT(*) = 0
         THEN 'no client role holds INSERT/UPDATE on any privileged column'
         ELSE 'STILL WRITABLE: ' || string_agg(DISTINCT grantee || '.' || column_name, ', ')
    END                                        AS detail
  FROM information_schema.column_privileges
  WHERE table_schema = 'public' AND table_name = 'profiles'
    AND grantee IN ('anon', 'authenticated')
    AND privilege_type IN ('UPDATE', 'INSERT')
    AND column_name IN ('is_admin','role','credits_balance','subscription_credits',
                        'pack_credits','plan_code','plan','subscription_expires_at',
                        'is_founder','founder_badge')

  UNION ALL

  -- ── SEC-01: legitimate student writes still work ─────────────────────────
  -- The fix must not have over-reached. If these are missing, onboarding,
  -- settings, XP and streaks are broken.
  SELECT
    'SEC-01',
    'student-owned profile columns still writable',
    CASE WHEN COUNT(*) = 8 THEN 'PASS' ELSE 'FAIL' END,
    'writable: ' || COALESCE(string_agg(column_name, ', ' ORDER BY column_name), '(none)')
      || '  [expect 8]'
  FROM information_schema.column_privileges
  WHERE table_schema = 'public' AND table_name = 'profiles'
    AND grantee = 'authenticated' AND privilege_type = 'UPDATE'
    AND column_name IN ('full_name','exam_type','exam_date','xp','rank_name',
                        'current_streak','best_streak','upgrade_requested')

  UNION ALL

  -- ── SEC-01: service_role untouched ───────────────────────────────────────
  SELECT
    'SEC-01',
    'service_role retains full profile write access',
    CASE WHEN COUNT(*) >= 2 THEN 'PASS' ELSE 'FAIL' END,
    'service_role privileges on profiles: ' || COUNT(*)::text || ' [expect >= 2]'
  FROM information_schema.table_privileges
  WHERE table_schema = 'public' AND table_name = 'profiles'
    AND grantee = 'service_role' AND privilege_type IN ('UPDATE', 'INSERT')

  UNION ALL

  -- ── SEC-01: anon has no write path at all ────────────────────────────────
  SELECT
    'SEC-01',
    'anon cannot write profiles',
    CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END,
    CASE WHEN COUNT(*) = 0 THEN 'anon holds no INSERT/UPDATE on profiles'
         ELSE 'anon still holds ' || COUNT(*)::text || ' column grant(s)' END
  FROM information_schema.column_privileges
  WHERE table_schema = 'public' AND table_name = 'profiles'
    AND grantee = 'anon' AND privilege_type IN ('UPDATE', 'INSERT')

  UNION ALL

  -- ── SEC-04: no permissive write policy on the knowledge base ─────────────
  -- The vulnerable shape was FOR ALL USING (true). Anything that still
  -- authorises a write with a `true` qualifier is the same hole.
  SELECT
    'SEC-04',
    'knowledge base has no permissive write policy',
    CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END,
    CASE WHEN COUNT(*) = 0
         THEN 'no FOR ALL / write policy with a true qualifier'
         ELSE 'PERMISSIVE POLICY PRESENT: ' || string_agg(tablename || '.' || policyname, ', ')
    END
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename LIKE 'zero_knowledge%'
    AND cmd IN ('ALL', 'INSERT', 'UPDATE', 'DELETE')
    AND (COALESCE(qual, 'true') = 'true' AND COALESCE(with_check, 'true') = 'true')

  UNION ALL

  -- ── SEC-04: writes are admin-gated ───────────────────────────────────────
  SELECT
    'SEC-04',
    'knowledge base writes are admin-gated',
    CASE WHEN COUNT(*) >= 3 THEN 'PASS' ELSE 'FAIL' END,
    'admin-gated write policies: ' || COUNT(*)::text || ' [expect 3, one per table]'
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename LIKE 'zero_knowledge%'
    AND cmd IN ('ALL', 'INSERT', 'UPDATE', 'DELETE')
    AND (COALESCE(qual, '') LIKE '%auth_is_admin%' OR COALESCE(with_check, '') LIKE '%auth_is_admin%')

  UNION ALL

  -- ── SEC-04: reads still open, or the tutor loses its personality ─────────
  SELECT
    'SEC-04',
    'knowledge base still publicly readable',
    CASE WHEN COUNT(*) >= 3 THEN 'PASS' ELSE 'FAIL' END,
    'public SELECT policies: ' || COUNT(*)::text || ' [expect 3]'
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename LIKE 'zero_knowledge%'
    AND cmd = 'SELECT' AND COALESCE(qual, '') = 'true'

  UNION ALL

  -- ── SEC-04: anon holds no write grant on the knowledge base ──────────────
  SELECT
    'SEC-04',
    'anon cannot write the knowledge base',
    CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END,
    CASE WHEN COUNT(*) = 0 THEN 'anon holds no write grant'
         ELSE 'anon still holds: ' || string_agg(DISTINCT privilege_type, ', ') END
  FROM information_schema.table_privileges
  WHERE table_schema = 'public' AND table_name LIKE 'zero_knowledge%'
    AND grantee = 'anon' AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')

  UNION ALL

  -- ── AUTHZ-01: consume_credits still refuses cross-user spend ─────────────
  -- Verified rather than assumed: an earlier draft of SEC-08 nearly revoked
  -- EXECUTE on this function, which would have broken charging platform-wide.
  SELECT
    'AUTHZ-01',
    'consume_credits blocks cross-user spend',
    CASE WHEN COUNT(*) = 1 THEN 'PASS' ELSE 'FAIL' END,
    CASE WHEN COUNT(*) = 1 THEN 'dual-authorization guard present'
         ELSE 'GUARD MISSING — apply 20260721_study_plan_always_charge.sql' END
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'consume_credits'
    AND pg_get_functiondef(p.oid) LIKE '%forbidden_user_mismatch%'

  UNION ALL

  -- ── Baseline: RLS enabled on every public table ──────────────────────────
  SELECT
    'BASELINE',
    'RLS enabled on every public table',
    CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'FAIL' END,
    CASE WHEN COUNT(*) = 0 THEN 'all public tables have RLS enabled'
         ELSE 'RLS OFF: ' || string_agg(relname, ', ') END
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity

  UNION ALL

  -- ── Baseline: no table is missing policies while RLS is on ───────────────
  -- Informational rather than fatal — a table with RLS and no policy denies
  -- everything, which is safe but usually unintended.
  SELECT
    'BASELINE',
    'no RLS-enabled table lacks policies',
    CASE WHEN COUNT(*) = 0 THEN 'PASS' ELSE 'WARN' END,
    CASE WHEN COUNT(*) = 0 THEN 'every RLS table has at least one policy'
         ELSE 'no policies (denies all): ' || string_agg(c.relname, ', ') END
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity
    AND NOT EXISTS (SELECT 1 FROM pg_policies p
                    WHERE p.schemaname = 'public' AND p.tablename = c.relname)
)
SELECT
  CASE status WHEN 'PASS' THEN 'PASS' WHEN 'WARN' THEN 'WARN' ELSE 'FAIL' END AS status,
  finding,
  check,
  detail
FROM checks
ORDER BY
  CASE status WHEN 'FAIL' THEN 0 WHEN 'WARN' THEN 1 ELSE 2 END,
  finding, check;
