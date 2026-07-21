-- ============================================================================
-- Phase B · SEC-02 — Row Level Security for public.analyzer_runs
--
-- analyzer_runs was created (20260614_analyzer_runs_telemetry.sql) WITHOUT RLS
-- and is exposed through PostgREST, so anon can currently read every user's
-- telemetry rows. Advisor: rls_disabled_in_public (ERROR).
--
-- Data shape: PII-free per-user aggregate telemetry, one row per analyzer run.
-- Writes: the CLIENT inserts its own row (regenerate-reports.js →
--   sb.from('analyzer_runs').insert(metrics), where metrics.user_id = auth.uid()).
--   regenerate-reports.js is a FROZEN file; this policy is written to keep that
--   existing insert working unchanged. Telemetry is fire-and-forget by design.
-- Reads: observability only → admins.
--
-- service_role bypasses RLS entirely (Edge Function / server maintenance).
-- Idempotent & rerunnable.
--
-- ── Rollback ──
--   DROP POLICY IF EXISTS analyzer_runs_insert_own  ON public.analyzer_runs;
--   DROP POLICY IF EXISTS analyzer_runs_admin_read  ON public.analyzer_runs;
--   ALTER TABLE public.analyzer_runs DISABLE ROW LEVEL SECURITY;
-- ============================================================================

ALTER TABLE public.analyzer_runs ENABLE ROW LEVEL SECURITY;

-- Users write only their own telemetry; admins may write for any user
-- (covers admin-triggered regeneration paths).
DROP POLICY IF EXISTS analyzer_runs_insert_own ON public.analyzer_runs;
CREATE POLICY analyzer_runs_insert_own ON public.analyzer_runs
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() OR has_role_at_least('admin'));

-- Telemetry is read for observability only → admins.
DROP POLICY IF EXISTS analyzer_runs_admin_read ON public.analyzer_runs;
CREATE POLICY analyzer_runs_admin_read ON public.analyzer_runs
  FOR SELECT TO authenticated
  USING (has_role_at_least('admin'));

-- No UPDATE / DELETE policies: telemetry is immutable from the client.
-- service_role (BYPASSRLS) handles any retention/cleanup.
