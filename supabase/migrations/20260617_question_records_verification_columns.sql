-- Phase 0 of the Adaptive Verification Architecture.
-- Adds 9 nullable columns to question_records to record per-question
-- verification pipeline state. All columns are NULL for legacy rows and
-- for rows written while VERIFICATION_ENABLED=false. No existing query,
-- report, or dashboard reads these fields.

ALTER TABLE public.question_records
  ADD COLUMN IF NOT EXISTS verification_tier        text,
  ADD COLUMN IF NOT EXISTS verification_path        text,
  ADD COLUMN IF NOT EXISTS verification_status      text,
  ADD COLUMN IF NOT EXISTS verification_confidence  numeric(4,3),
  ADD COLUMN IF NOT EXISTS solver_count             smallint,
  ADD COLUMN IF NOT EXISTS solver_agreement         numeric(4,3),
  ADD COLUMN IF NOT EXISTS judge_verdict            text,
  ADD COLUMN IF NOT EXISTS ocr_confidence           numeric(4,3),
  ADD COLUMN IF NOT EXISTS verification_meta        jsonb;
