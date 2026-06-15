-- Phase F3 — Signal-aware task generation
--
-- Adds dominant_signal to both focus_plans and focus_tasks.
--
-- focus_plans.dominant_signal  — current-wave cache. Written at plan creation
--   and overwritten only at wave-append boundaries. Allows the render path to
--   read the active diagnosis without inspecting task rows.
--
-- focus_tasks.dominant_signal  — authoritative per-task historical record.
--   Written once at task INSERT; never updated. Preserves the diagnosis that
--   produced each wave even after later waves overwrite the plan-level cache.
--
-- Both columns are nullable. Existing rows default to NULL (default plan).
-- NULL means no dominant signal was detected; tasks use the standard 9-task plan.

ALTER TABLE focus_plans ADD COLUMN IF NOT EXISTS dominant_signal TEXT;
ALTER TABLE focus_tasks  ADD COLUMN IF NOT EXISTS dominant_signal TEXT;

COMMENT ON COLUMN focus_plans.dominant_signal IS
  'Cache of the dominant signal type for the current active wave. '
  'One of: exam_confused | hint_used | explanation_repeated | repeated | null. '
  'Overwritten at wave-append boundaries; historical diagnosis lives on focus_tasks.dominant_signal.';

COMMENT ON COLUMN focus_tasks.dominant_signal IS
  'Signal type that drove task generation for this task. '
  'Written once at INSERT; never updated. Preserves per-wave historical diagnosis.';
