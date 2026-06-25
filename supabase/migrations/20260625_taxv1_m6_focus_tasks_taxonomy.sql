-- ============================================================================
-- Phase 2 · M6 — focus_tasks: taxonomy id + problem_type + version columns.
-- Additive & nullable. Existing active plans keep working unchanged.
-- NOT YET APPLIED — awaiting individual approval.
-- ============================================================================
ALTER TABLE public.focus_tasks ADD COLUMN IF NOT EXISTS topic_id          text;
ALTER TABLE public.focus_tasks ADD COLUMN IF NOT EXISTS subtopic_id       text;
ALTER TABLE public.focus_tasks ADD COLUMN IF NOT EXISTS problem_type      text;
ALTER TABLE public.focus_tasks ADD COLUMN IF NOT EXISTS taxonomy_version  smallint NOT NULL DEFAULT 1;

ALTER TABLE public.focus_tasks DROP CONSTRAINT IF EXISTS focus_tasks_problem_type_chk;
ALTER TABLE public.focus_tasks ADD  CONSTRAINT focus_tasks_problem_type_chk
  CHECK (problem_type IS NULL OR problem_type IN ('concept','word_problem'));

ALTER TABLE public.focus_tasks DROP CONSTRAINT IF EXISTS focus_tasks_taxver_chk;
ALTER TABLE public.focus_tasks ADD  CONSTRAINT focus_tasks_taxver_chk
  CHECK (taxonomy_version > 0);

CREATE INDEX IF NOT EXISTS ix_ft_taxonomy
  ON public.focus_tasks (topic_id, subtopic_id, problem_type);

-- ── Rollback ──
-- DROP INDEX IF EXISTS ix_ft_taxonomy;
-- ALTER TABLE public.focus_tasks DROP CONSTRAINT IF EXISTS focus_tasks_problem_type_chk;
-- ALTER TABLE public.focus_tasks DROP COLUMN IF EXISTS taxonomy_version;
-- ALTER TABLE public.focus_tasks DROP COLUMN IF EXISTS problem_type;
-- ALTER TABLE public.focus_tasks DROP COLUMN IF EXISTS subtopic_id;
-- ALTER TABLE public.focus_tasks DROP COLUMN IF EXISTS topic_id;
