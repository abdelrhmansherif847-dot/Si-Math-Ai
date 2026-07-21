-- ============================================================================
-- Phase B · SEC-04 — Row Level Security for public.plan_definitions
--
-- plan_definitions (subscription / credit-pack catalog: plan_code, kind,
-- credits_granted, period_days, ...) is exposed through PostgREST WITHOUT RLS.
-- Advisor: rls_disabled_in_public (ERROR).
--
-- No user data; it is plan-catalog reference data. It is read today only by
-- SECURITY DEFINER functions (approve_payment_request), which bypass RLS and
-- are therefore unaffected by these policies.
--
-- Policy model = established reference-table pattern (credit_packs /
-- pricing_settings): public read, admin write. Public read keeps it consistent
-- with the sibling pricing tables and safe for any future pricing UI.
-- Idempotent & rerunnable.
--
-- ── Rollback ──
--   DROP POLICY IF EXISTS plan_definitions_public_read ON public.plan_definitions;
--   DROP POLICY IF EXISTS plan_definitions_admin_write ON public.plan_definitions;
--   ALTER TABLE public.plan_definitions DISABLE ROW LEVEL SECURITY;
-- ============================================================================

ALTER TABLE public.plan_definitions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS plan_definitions_public_read ON public.plan_definitions;
CREATE POLICY plan_definitions_public_read ON public.plan_definitions
  FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS plan_definitions_admin_write ON public.plan_definitions;
CREATE POLICY plan_definitions_admin_write ON public.plan_definitions
  FOR ALL TO authenticated
  USING (auth_is_admin()) WITH CHECK (auth_is_admin());
