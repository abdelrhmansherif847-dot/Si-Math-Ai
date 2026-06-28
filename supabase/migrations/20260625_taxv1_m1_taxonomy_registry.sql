-- ============================================================================
-- Phase 2 · M1 — canonical taxonomy registry (AUTO-GENERATED from taxonomy.core.js
-- by scripts/gen-registry-seed.mjs — DO NOT EDIT BY HAND; re-generate instead).
--
-- Backs topic_id / subtopic_id with real rows so FOREIGN KEY constraints can be
-- added in a later phase (deferred until after MIG-B backfill, per design). IDs
-- are PERMANENT: the seed updates display_name on conflict but never rewrites ids.
-- Additive & isolated. NOT YET APPLIED — awaiting individual approval.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.taxonomy_topics (
  id               text PRIMARY KEY,
  display_name     text     NOT NULL,
  taxonomy_version smallint NOT NULL DEFAULT 1,
  is_active        boolean  NOT NULL DEFAULT true,
  CONSTRAINT taxonomy_topics_version_chk CHECK (taxonomy_version > 0)
);

CREATE TABLE IF NOT EXISTS public.taxonomy_subtopics (
  id               text PRIMARY KEY,
  topic_id         text     NOT NULL REFERENCES public.taxonomy_topics(id),
  display_name     text     NOT NULL,
  taxonomy_version smallint NOT NULL DEFAULT 1,
  is_active        boolean  NOT NULL DEFAULT true,
  CONSTRAINT taxonomy_subtopics_version_chk CHECK (taxonomy_version > 0)
);

INSERT INTO public.taxonomy_topics (id, display_name, taxonomy_version) VALUES
  ('ALGEBRA', 'Algebra', 1),
  ('FUNCTIONS', 'Functions', 1),
  ('GEOMETRY', 'Geometry', 1),
  ('STATISTICS', 'Statistics', 1),
  ('PROBABILITY_RATIOS', 'Probability & Ratios', 1)
ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name;

INSERT INTO public.taxonomy_subtopics (id, topic_id, display_name, taxonomy_version) VALUES
  ('ALG_001', 'ALGEBRA', 'Order of Operations', 1),
  ('ALG_002', 'ALGEBRA', 'Exponents', 1),
  ('ALG_003', 'ALGEBRA', 'Radicals', 1),
  ('ALG_004', 'ALGEBRA', 'Polynomials', 1),
  ('ALG_005', 'ALGEBRA', 'Complex Numbers', 1),
  ('ALG_006', 'ALGEBRA', 'Linear Equations & Functions', 1),
  ('ALG_007', 'ALGEBRA', 'Systems of Equations', 1),
  ('ALG_008', 'ALGEBRA', 'Inequalities', 1),
  ('ALG_009', 'ALGEBRA', 'Absolute Value', 1),
  ('ALG_010', 'ALGEBRA', 'Quadratic Equations & Functions', 1),
  ('ALG_011', 'ALGEBRA', 'Exponential Functions', 1),
  ('ALG_012', 'ALGEBRA', 'Sequences', 1),
  ('FUN_001', 'FUNCTIONS', 'Functions', 1),
  ('FUN_002', 'FUNCTIONS', 'Function Transformations', 1),
  ('GEO_001', 'GEOMETRY', 'Lines & Angles', 1),
  ('GEO_002', 'GEOMETRY', 'Triangles', 1),
  ('GEO_003', 'GEOMETRY', 'Polygons', 1),
  ('GEO_004', 'GEOMETRY', 'Similarity', 1),
  ('GEO_005', 'GEOMETRY', 'Trigonometry', 1),
  ('GEO_006', 'GEOMETRY', 'Circle & Equation of the Circle', 1),
  ('GEO_007', 'GEOMETRY', 'Solid Geometry', 1),
  ('GEO_008', 'GEOMETRY', 'Coordinate Geometry', 1),
  ('STA_001', 'STATISTICS', 'Scatter Plots', 1),
  ('STA_002', 'STATISTICS', 'Mean, Median & Mode', 1),
  ('STA_003', 'STATISTICS', 'Range & Interval', 1),
  ('STA_004', 'STATISTICS', 'Stem-and-Leaf Plots', 1),
  ('STA_005', 'STATISTICS', 'Data Analysis', 1),
  ('PR_001', 'PROBABILITY_RATIOS', 'Probability', 1),
  ('PR_002', 'PROBABILITY_RATIOS', 'Permutations & Combinations', 1),
  ('PR_003', 'PROBABILITY_RATIOS', 'Percentages', 1),
  ('PR_004', 'PROBABILITY_RATIOS', 'Ratio & Proportion', 1),
  ('PR_005', 'PROBABILITY_RATIOS', 'Unit Rates', 1),
  ('PR_006', 'PROBABILITY_RATIOS', 'Work & Time', 1)
ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name, topic_id = EXCLUDED.topic_id;

-- ── Rollback ──
-- DROP TABLE IF EXISTS public.taxonomy_subtopics;
-- DROP TABLE IF EXISTS public.taxonomy_topics;
