-- ============================================================================
-- Phase B · SEC-03 — Row Level Security for the taxonomy registry
--   public.taxonomy_topics, public.taxonomy_subtopics
--
-- Created by 20260625_taxv1_m1_taxonomy_registry.sql WITHOUT RLS and exposed
-- through PostgREST. Advisor: rls_disabled_in_public (ERROR).
--
-- These are canonical reference/lookup tables (topic & subtopic display names,
-- versions, active flags). They contain no user data. They back topic_id /
-- subtopic_id FKs and are seeded by migration / service_role.
--
-- Policy model = the established reference-table pattern in this codebase
-- (credit_costs / credit_packs / pricing_settings): public read, admin write.
-- SECURITY DEFINER functions (e.g. log_unmapped_detection) and service_role
-- bypass RLS, so registry maintenance is unaffected.
-- Idempotent & rerunnable.
--
-- ── Rollback ──
--   DROP POLICY IF EXISTS taxonomy_topics_public_read    ON public.taxonomy_topics;
--   DROP POLICY IF EXISTS taxonomy_topics_admin_write    ON public.taxonomy_topics;
--   DROP POLICY IF EXISTS taxonomy_subtopics_public_read ON public.taxonomy_subtopics;
--   DROP POLICY IF EXISTS taxonomy_subtopics_admin_write ON public.taxonomy_subtopics;
--   ALTER TABLE public.taxonomy_topics    DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE public.taxonomy_subtopics DISABLE ROW LEVEL SECURITY;
-- ============================================================================

-- ── taxonomy_topics ──
ALTER TABLE public.taxonomy_topics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS taxonomy_topics_public_read ON public.taxonomy_topics;
CREATE POLICY taxonomy_topics_public_read ON public.taxonomy_topics
  FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS taxonomy_topics_admin_write ON public.taxonomy_topics;
CREATE POLICY taxonomy_topics_admin_write ON public.taxonomy_topics
  FOR ALL TO authenticated
  USING (auth_is_admin()) WITH CHECK (auth_is_admin());

-- ── taxonomy_subtopics ──
ALTER TABLE public.taxonomy_subtopics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS taxonomy_subtopics_public_read ON public.taxonomy_subtopics;
CREATE POLICY taxonomy_subtopics_public_read ON public.taxonomy_subtopics
  FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS taxonomy_subtopics_admin_write ON public.taxonomy_subtopics;
CREATE POLICY taxonomy_subtopics_admin_write ON public.taxonomy_subtopics
  FOR ALL TO authenticated
  USING (auth_is_admin()) WITH CHECK (auth_is_admin());
