-- Phase 4 — Recency indicators
-- Adds analyzer-owned activity recency metrics to weakness_reports.
-- Authoritative source: regenerate-reports.js (recency aggregation in buildFromSignals).
--
-- SEMANTICS (important):
--   * These are ACTIVITY metrics, NOT weakness metrics.
--   * Every signal_type contributes — topic, multi_concept, repeated, resolution.
--   * A highly-improved topic where the student keeps clicking "Solved It" will
--     appear highly active. This is intentional for Phase 4.
--   * Phase 6 may introduce signal-family grouping with separate
--     activity vs weakness recency counts.
--
-- Dormant state is derived: recent14_count = 0 → dormant. No separate column.
--
-- Additive, non-destructive, backward-compatible:
--   * All three columns are nullable.
--   * Analyzer's strip+retry path handles rollout windows when columns are missing.

ALTER TABLE weakness_reports
  ADD COLUMN IF NOT EXISTS last_signal_at  timestamptz,
  ADD COLUMN IF NOT EXISTS recent7_count   integer,
  ADD COLUMN IF NOT EXISTS recent14_count  integer;

COMMENT ON COLUMN weakness_reports.last_signal_at IS
  'Timestamp of the most recent signal (any signal_type) for this topic+subtopic.
   Analyzer-derived. Owned by regenerate-reports.js.';

COMMENT ON COLUMN weakness_reports.recent7_count IS
  'Count of ALL signals (any signal_type — topic, multi_concept, repeated, resolution)
   created strictly less than 7 days before the analyzer run. Activity metric, NOT
   weakness count. Invariant: recent7_count <= recent14_count.';

COMMENT ON COLUMN weakness_reports.recent14_count IS
  'Count of ALL signals (any signal_type) created strictly less than 14 days before
   the analyzer run. Rolling window includes the recent7 window. Dormant ⇔ value=0.';
