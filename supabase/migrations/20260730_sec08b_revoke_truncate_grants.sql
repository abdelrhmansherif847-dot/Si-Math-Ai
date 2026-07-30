-- ===========================================================================
-- SEC-08 (b) — revoke TRUNCATE / TRIGGER / REFERENCES from anon, authenticated
-- ===========================================================================
-- STATUS: APPLIED 2026-07-30 to igvkyxkmjnkzscqgommj. Owner-approved
--   individually (CLAUDE.md §3), conditional on the dependency review below,
--   which was completed first.
--
-- Split out of supabase/migrations-pending/20260727_sec08_rpc_grant_hygiene.sql
-- and applied as its own step. Section (a) shipped alongside as
-- 20260730_sec08a_rpc_grant_hygiene.sql; section (c) remains unapplied.
--
-- WHY
--   Supabase's default `GRANT ALL` left anon and authenticated holding
--   TRUNCATE on every table in public. **TRUNCATE is not subject to RLS** — no
--   row-level policy can stop it. It is unreachable through PostgREST today
--   (the REST API never emits TRUNCATE), so this was latent rather than live,
--   but a single SQL-executing RPC added later would have turned it into
--   instant total data loss.
--
--   TRIGGER and REFERENCES are DDL privileges. Neither role performs DDL, so
--   neither privilege has a runtime meaning for them.
--
-- DEPENDENCY REVIEW (completed before applying, 2026-07-30)
--   • No client or Edge Function code issues TRUNCATE — grep across
--     *.html, *.js, *.ts, *.mjs found only string-truncation identifiers.
--   • No function body in schema public references TRUNCATE
--     (pg_proc.prosrc ~* '\mtruncate\M' → 0 rows).
--   • Precedent: 20260727_profiles_column_privilege_hardening.sql and
--     20260727_sec04_knowledge_base_write_lockdown.sql already revoke exactly
--     these three privileges on individual tables. This generalises them.
--
-- BEFORE → AFTER (measured)
--   TRUNCATE    anon 35 + authenticated 35 = 70  →  0
--   TRIGGER     anon 35 + authenticated 35 = 70  →  0
--   REFERENCES  anon 35 + authenticated 35 = 70  →  0
--   SELECT grants preserved: 78.  INSERT/UPDATE/DELETE preserved: 219.
-- ===========================================================================

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT format('%I.%I', schemaname, tablename) AS t
    FROM   pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('REVOKE TRUNCATE, TRIGGER, REFERENCES ON %s FROM anon, authenticated', r.t);
  END LOOP;
END $$;

-- ===========================================================================
-- Verification (all three must be 0)
--   SELECT privilege_type, count(*)
--     FROM information_schema.role_table_grants
--    WHERE table_schema='public' AND grantee IN ('anon','authenticated')
--      AND privilege_type IN ('TRUNCATE','TRIGGER','REFERENCES')
--    GROUP BY 1;
--
-- NOTE: this is not self-healing. A future `GRANT ALL ON <table> TO
-- authenticated`, or a new table created without care, reintroduces these.
-- Re-running this file is safe and idempotent.
-- ===========================================================================
