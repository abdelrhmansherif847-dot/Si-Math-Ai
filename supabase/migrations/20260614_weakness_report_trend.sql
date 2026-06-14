-- Phase 3 — Trend detection
-- Adds analyzer-owned trend to weakness_reports.
-- Authoritative source: regenerate-reports.js (trendFromImprovement).
-- Consumers must read this column; never re-derive from improvement_score.
--
-- Additive, non-destructive, backward-compatible:
--   * Column is nullable.
--   * Trend is null when improvement_score is null OR total_signals < 5
--     (confidence gate against single-event noise).
--   * Analyzer's strip+retry path handles rollout windows where the column
--     may not exist yet on the target DB.

ALTER TABLE weakness_reports
  ADD COLUMN IF NOT EXISTS trend text;

COMMENT ON COLUMN weakness_reports.trend IS
  'improving|stable|declining|null — analyzer-derived from improvement_score with a
   minimum-history confidence gate (MIN_HISTORY_FOR_TREND=5 total_signals).
   Owned by regenerate-reports.js. Do not re-derive in consumers.';
