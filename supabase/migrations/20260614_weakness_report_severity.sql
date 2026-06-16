-- Phase 2 — Severity classification
-- Adds analyzer-owned severity_band to weakness_reports.
-- Authoritative source: regenerate-reports.js (severityFromMastery).
-- Consumers must read this column; never re-derive from mastery_score.
--
-- Additive, non-destructive, backward-compatible:
--   * Column is nullable, so existing rows continue to be valid until the next analyzer run.
--   * Analyzer treats absence of the column as a graceful skip during rollout windows.

ALTER TABLE weakness_reports
  ADD COLUMN IF NOT EXISTS severity_band text;

COMMENT ON COLUMN weakness_reports.severity_band IS
  'critical|high|medium|low — analyzer-derived from mastery_score. Owned by regenerate-reports.js. Do not re-derive in consumers.';
