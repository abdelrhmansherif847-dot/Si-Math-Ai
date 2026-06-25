-- ============================================================================
-- Focus Practice → streak: per-task completion timestamp.
-- Lets Focus Practice count as daily activity in assets/streak.js (item 1).
-- Additive & non-destructive. Applied to igvkyxkmjnkzscqgommj on 2026-06-25.
-- ============================================================================
ALTER TABLE public.focus_tasks ADD COLUMN IF NOT EXISTS completed_at timestamptz;

-- Backfill already-DONE tasks with a best-effort completion day so existing
-- history contributes: prefer the D1 signal stamp, else the row's created_at.
UPDATE public.focus_tasks
   SET completed_at = COALESCE(signal_emitted_at, created_at)
 WHERE status = 'DONE' AND completed_at IS NULL;

-- ── Rollback ──
-- ALTER TABLE public.focus_tasks DROP COLUMN IF EXISTS completed_at;
