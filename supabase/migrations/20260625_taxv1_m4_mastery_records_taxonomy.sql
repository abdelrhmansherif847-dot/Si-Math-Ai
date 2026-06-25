-- ============================================================================
-- Phase 2 · M4 — mastery_records: taxonomy id + problem_type + version columns.
--
-- IMPORTANT: this migration is ADDITIVE ONLY. It adds the columns and a NON-UNIQUE
-- helper index. It does NOT change the mastery key yet. The mastery key migration
-- to UNIQUE (user_id, topic_id, subtopic_id, problem_type) is a SEPARATE Phase 4
-- step (M4b) that runs AFTER MIG-B backfills topic_id/subtopic_id and sets
-- problem_type='concept' for legacy rows — so no row collides and no progress is
-- lost. Doing the unique swap here, before backfill, would fail (all-NULL ids).
--
-- NOT YET APPLIED — awaiting individual approval.
-- ============================================================================
ALTER TABLE public.mastery_records ADD COLUMN IF NOT EXISTS topic_id          text;
ALTER TABLE public.mastery_records ADD COLUMN IF NOT EXISTS subtopic_id       text;
ALTER TABLE public.mastery_records ADD COLUMN IF NOT EXISTS problem_type      text;
ALTER TABLE public.mastery_records ADD COLUMN IF NOT EXISTS taxonomy_version  smallint NOT NULL DEFAULT 1;

ALTER TABLE public.mastery_records DROP CONSTRAINT IF EXISTS mastery_records_problem_type_chk;
ALTER TABLE public.mastery_records ADD  CONSTRAINT mastery_records_problem_type_chk
  CHECK (problem_type IS NULL OR problem_type IN ('concept','word_problem'));

-- Non-unique helper index only (read path). Unique key swap deferred to M4b/Phase 4.
CREATE INDEX IF NOT EXISTS ix_mr_taxonomy
  ON public.mastery_records (user_id, topic_id, subtopic_id, problem_type);

-- ── Rollback ──
-- DROP INDEX IF EXISTS ix_mr_taxonomy;
-- ALTER TABLE public.mastery_records DROP CONSTRAINT IF EXISTS mastery_records_problem_type_chk;
-- ALTER TABLE public.mastery_records DROP COLUMN IF EXISTS taxonomy_version;
-- ALTER TABLE public.mastery_records DROP COLUMN IF EXISTS problem_type;
-- ALTER TABLE public.mastery_records DROP COLUMN IF EXISTS subtopic_id;
-- ALTER TABLE public.mastery_records DROP COLUMN IF EXISTS topic_id;
