-- ============================================================================
-- Phase 2 · M2 — question_records: taxonomy id + problem_type + version columns.
-- Additive & nullable. Legacy rows stay readable; real ids/problem_type are
-- backfilled later (Phase 4 / MIG-B). New writes populate these going forward.
-- NOT YET APPLIED — awaiting individual approval.
-- ============================================================================
ALTER TABLE public.question_records ADD COLUMN IF NOT EXISTS topic_id          text;
ALTER TABLE public.question_records ADD COLUMN IF NOT EXISTS subtopic_id       text;
ALTER TABLE public.question_records ADD COLUMN IF NOT EXISTS problem_type      text;
ALTER TABLE public.question_records ADD COLUMN IF NOT EXISTS taxonomy_version  smallint NOT NULL DEFAULT 1;

ALTER TABLE public.question_records DROP CONSTRAINT IF EXISTS question_records_problem_type_chk;
ALTER TABLE public.question_records ADD  CONSTRAINT question_records_problem_type_chk
  CHECK (problem_type IS NULL OR problem_type IN ('concept','word_problem'));

ALTER TABLE public.question_records DROP CONSTRAINT IF EXISTS question_records_taxver_chk;
ALTER TABLE public.question_records ADD  CONSTRAINT question_records_taxver_chk
  CHECK (taxonomy_version > 0);

CREATE INDEX IF NOT EXISTS ix_qr_taxonomy
  ON public.question_records (topic_id, subtopic_id, problem_type);

-- ── Rollback ──
-- DROP INDEX IF EXISTS ix_qr_taxonomy;
-- ALTER TABLE public.question_records DROP CONSTRAINT IF EXISTS question_records_problem_type_chk;
-- ALTER TABLE public.question_records DROP COLUMN IF EXISTS taxonomy_version;
-- ALTER TABLE public.question_records DROP COLUMN IF EXISTS problem_type;
-- ALTER TABLE public.question_records DROP COLUMN IF EXISTS subtopic_id;
-- ALTER TABLE public.question_records DROP COLUMN IF EXISTS topic_id;
