-- ============================================================================
-- Phase 2 · M5 — weakness_reports: taxonomy id + problem_type + version columns.
-- Additive & nullable. NOT YET APPLIED — awaiting individual approval.
-- ============================================================================
ALTER TABLE public.weakness_reports ADD COLUMN IF NOT EXISTS topic_id          text;
ALTER TABLE public.weakness_reports ADD COLUMN IF NOT EXISTS subtopic_id       text;
ALTER TABLE public.weakness_reports ADD COLUMN IF NOT EXISTS problem_type      text;
ALTER TABLE public.weakness_reports ADD COLUMN IF NOT EXISTS taxonomy_version  smallint NOT NULL DEFAULT 1;

ALTER TABLE public.weakness_reports DROP CONSTRAINT IF EXISTS weakness_reports_problem_type_chk;
ALTER TABLE public.weakness_reports ADD  CONSTRAINT weakness_reports_problem_type_chk
  CHECK (problem_type IS NULL OR problem_type IN ('concept','word_problem'));

CREATE INDEX IF NOT EXISTS ix_wr_taxonomy
  ON public.weakness_reports (topic_id, subtopic_id, problem_type);

-- ── Rollback ──
-- DROP INDEX IF EXISTS ix_wr_taxonomy;
-- ALTER TABLE public.weakness_reports DROP CONSTRAINT IF EXISTS weakness_reports_problem_type_chk;
-- ALTER TABLE public.weakness_reports DROP COLUMN IF EXISTS taxonomy_version;
-- ALTER TABLE public.weakness_reports DROP COLUMN IF EXISTS problem_type;
-- ALTER TABLE public.weakness_reports DROP COLUMN IF EXISTS subtopic_id;
-- ALTER TABLE public.weakness_reports DROP COLUMN IF EXISTS topic_id;
