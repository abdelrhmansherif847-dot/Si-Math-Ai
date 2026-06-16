-- Phase 10 — Analyzer Observability
-- Adds analyzer_runs as a dedicated, aggregate-only telemetry table.
-- Records one row per _doRegenerate() invocation. Fire-and-forget writes;
-- telemetry failure must never affect analyzer output.
--
-- PII-free by design: no topic names, no subtopic names, no signal content,
-- no question text. Only aggregate shapes (counts, durations, outcomes).
--
-- Retention: NOT managed in this phase. Telemetry volume scales ~linearly
-- with regeneration volume. Cleanup is recorded as future operational work.

CREATE TABLE IF NOT EXISTS analyzer_runs (
  id                      BIGSERIAL PRIMARY KEY,
  user_id                 UUID NOT NULL,
  started_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  duration_ms             INTEGER,
  signals_read            INTEGER,
  mastery_records_read    INTEGER,
  reports_existing        INTEGER,
  reports_computed        INTEGER,
  reports_inserted        INTEGER,
  reports_updated         INTEGER,
  reports_deleted         INTEGER,
  read_phase_ms           INTEGER,
  compute_phase_ms        INTEGER,
  write_phase_ms          INTEGER,
  dedup_collapsed         BOOLEAN DEFAULT FALSE,
  pending_rerun_triggered BOOLEAN DEFAULT FALSE,
  strip_retry_count       INTEGER DEFAULT 0,
  outcome                 TEXT,    -- 'success' | 'no_signals' | 'failure'
  error_message           TEXT,
  error_phase             TEXT,    -- 'read' | 'compute' | 'write' | null
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analyzer_runs_user_started
  ON analyzer_runs (user_id, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_analyzer_runs_outcome
  ON analyzer_runs (outcome, started_at DESC)
  WHERE outcome <> 'success';

COMMENT ON TABLE  analyzer_runs IS 'Phase 10 — per-regeneration telemetry. Aggregate-only, PII-free.';
COMMENT ON COLUMN analyzer_runs.outcome IS 'success | no_signals | failure';
COMMENT ON COLUMN analyzer_runs.error_phase IS 'read | compute | write — set only when outcome=failure';
COMMENT ON COLUMN analyzer_runs.strip_retry_count IS 'Times the OPTIONAL_COLS strip-retry fallback fired during this run (schema rollout health).';
COMMENT ON COLUMN analyzer_runs.dedup_collapsed IS 'True when this run was triggered by a Phase 9 dedup-collapsed call.';
COMMENT ON COLUMN analyzer_runs.pending_rerun_triggered IS 'True when this run resolved with a queued follow-up (signal landed mid-flight).';
