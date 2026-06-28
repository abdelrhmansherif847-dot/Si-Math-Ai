-- ============================================================================
-- Phase 3 · M9 — drop the unused direct-INSERT RLS policy on unmapped_detections.
-- All logging flows through the SECURITY DEFINER log_unmapped_detection RPC
-- (which bypasses RLS), so the authenticated direct-INSERT policy is unused by
-- application code and is an unnecessary attack surface (a client could insert /
-- inflate hit_count directly via PostgREST). After this, only the definer RPC
-- (and service_role) can write the table. RLS stays enabled.
-- ============================================================================
DROP POLICY IF EXISTS unmapped_insert_authenticated ON public.unmapped_detections;

-- ── Rollback ──
-- CREATE POLICY unmapped_insert_authenticated
--   ON public.unmapped_detections FOR INSERT TO authenticated WITH CHECK (true);
