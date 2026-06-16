-- F4: Plan lifecycle management + task archival + query scaling index
--
-- 1. last_referenced_at  — tracks recency of plan access for inactivity-based archival.
--    No DEFAULT. Existing rows receive NULL (opt into the 30-day clock on first interaction).
--
-- 2. archived_at on focus_tasks — marks a completed wave rolled out of the 27-task window.
--    DONE stays DONE. Execution state is independent from archival state.
--    Render filter: archived_at IS NULL.
--
-- 3. Composite index on question_records for the rewritten user_id + created_at query
--    (replaces the session_id IN-list pattern).

ALTER TABLE focus_plans
  ADD COLUMN IF NOT EXISTS last_referenced_at TIMESTAMPTZ;

ALTER TABLE focus_tasks
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_focus_plans_user_status_ref
  ON focus_plans (user_id, status, last_referenced_at);

CREATE INDEX IF NOT EXISTS idx_question_records_user_created
  ON question_records (user_id, created_at);
