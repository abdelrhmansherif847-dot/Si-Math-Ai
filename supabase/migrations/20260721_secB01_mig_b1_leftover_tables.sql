-- ============================================================================
-- Phase B · SEC-01 — MIG-B1 leftover tables
--   public.mig_b1_map                          (69 rows  — temp mapping)
--   public.weakness_signals_bak_mig_b1_20260702 (476 rows — user-data backup)
--
-- Both are exposed through PostgREST with RLS OFF. Advisor:
-- rls_disabled_in_public (ERROR). The backup in particular holds a snapshot of
-- real user weakness data currently readable by anon — the most sensitive
-- exposure in Phase B.
--
-- They are LEFTOVERS from the completed MIG-B1 canonical backfill
-- (scripts/mig-b1.sql, applied 2026-07-02). Neither is referenced by any
-- application code, Edge Function, or other migration.
--
-- ── DISPOSITION: secure-in-place (non-destructive, reversible) ──
-- This migration enables RLS with NO policy → default-deny for anon &
-- authenticated. Closes the exposure immediately without data loss.
-- service_role (BYPASSRLS) retains access if the backup is still needed.
--
-- If the project prefers to DROP the leftovers instead (recommended cleanup —
-- removes the exposed data at rest entirely and clears the lint fully rather
-- than downgrading it to rls_enabled_no_policy/INFO), replace the body below
-- with the DROP block. That step is irreversible, hence gated on explicit
-- approval:
--
--   DROP TABLE IF EXISTS public.mig_b1_map;
--   DROP TABLE IF EXISTS public.weakness_signals_bak_mig_b1_20260702;
--
-- ── Rollback (secure-in-place) ──
--   ALTER TABLE public.mig_b1_map DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE public.weakness_signals_bak_mig_b1_20260702 DISABLE ROW LEVEL SECURITY;
-- ============================================================================

ALTER TABLE public.mig_b1_map                           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.weakness_signals_bak_mig_b1_20260702 ENABLE ROW LEVEL SECURITY;

-- Strip residual anon/authenticated table grants so nothing leaks even if a
-- future policy is added carelessly. No policy is created → default-deny.
REVOKE ALL ON public.mig_b1_map                           FROM anon, authenticated;
REVOKE ALL ON public.weakness_signals_bak_mig_b1_20260702 FROM anon, authenticated;
