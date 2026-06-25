-- ============================================================================
-- Phase 2 · M3 — weakness_signals: taxonomy id + problem_type + version columns.
-- Additive & nullable. NOT YET APPLIED — awaiting individual approval.
-- ============================================================================
ALTER TABLE public.weakness_signals ADD COLUMN IF NOT EXISTS topic_id          text;
ALTER TABLE public.weakness_signals ADD COLUMN IF NOT EXISTS subtopic_id       text;
ALTER TABLE public.weakness_signals ADD COLUMN IF NOT EXISTS problem_type      text;
ALTER TABLE public.weakness_signals ADD COLUMN IF NOT EXISTS taxonomy_version  smallint NOT NULL DEFAULT 1;

ALTER TABLE public.weakness_signals DROP CONSTRAINT IF EXISTS weakness_signals_problem_type_chk;
ALTER TABLE public.weakness_signals ADD  CONSTRAINT weakness_signals_problem_type_chk
  CHECK (problem_type IS NULL OR problem_type IN ('concept','word_problem'));

CREATE INDEX IF NOT EXISTS ix_ws_taxonomy
  ON public.weakness_signals (topic_id, subtopic_id, problem_type);

-- ── Rollback ──
-- DROP INDEX IF EXISTS ix_ws_taxonomy;
-- ALTER TABLE public.weakness_signals DROP CONSTRAINT IF EXISTS weakness_signals_problem_type_chk;
-- ALTER TABLE public.weakness_signals DROP COLUMN IF EXISTS taxonomy_version;
-- ALTER TABLE public.weakness_signals DROP COLUMN IF EXISTS problem_type;
-- ALTER TABLE public.weakness_signals DROP COLUMN IF EXISTS subtopic_id;
-- ALTER TABLE public.weakness_signals DROP COLUMN IF EXISTS topic_id;
