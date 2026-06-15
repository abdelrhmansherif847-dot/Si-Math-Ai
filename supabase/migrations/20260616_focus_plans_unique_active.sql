-- F5: Database-level protection against duplicate ACTIVE focus_plans.
--
-- Enforces "at most one ACTIVE plan per (user_id, title)" at the row level.
-- ARCHIVED rows remain unconstrained — users can hold any number of historical
-- archived plans for the same (user_id, title) pair.
--
-- Backward compatibility: zero existing rows violate this constraint (verified
-- at migration time). No backfill, no row deletion, no DEFAULT changes. The
-- index can be dropped without data loss.
--
-- Client side: upsertPlan handles PostgreSQL error code 23505 (unique_violation)
-- by re-fetching the winning ACTIVE plan and adopting it — the losing client
-- of a double-tab/multi-device race converges to the same state as the winner.

CREATE UNIQUE INDEX IF NOT EXISTS uniq_focus_plans_active_per_user_title
  ON focus_plans (user_id, title)
  WHERE status = 'ACTIVE';
