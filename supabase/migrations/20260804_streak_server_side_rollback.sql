-- ROLLBACK for 20260804_streak_server_side.sql. PREPARED — apply only to revert.
--
-- Restores the pre-migration state exactly: the browser computes the streak and
-- writes the columns itself. assets/streak.js keeps that path as its fallback
-- and takes it automatically when recompute_streak() is absent, so this can be
-- applied BEFORE or AFTER reverting the client without leaving a broken state —
-- which is the property the atomic-change requirement is really asking for.
--
-- Ordering note: the grants are restored FIRST. If this file were run and
-- interrupted, a client that had already fallen back would otherwise be unable
-- to write, which is the one partially-migrated state worth avoiding.

-- 1. Give the browser back its write path.
grant update (current_streak, best_streak, last_active_date)
  on public.profiles to authenticated;
grant insert (current_streak, best_streak, last_active_date)
  on public.profiles to authenticated;

-- 2. Remove the server-side computation.
drop function if exists public.recompute_streak(uuid, text);

-- 3. profiles.timezone is deliberately KEPT.
--
-- It is additive, NULL-tolerant and harmless on its own: every reader treats
-- absence as "use the device zone", which is the pre-migration behaviour. It
-- also holds real data by the time anyone rolls back — zones populated from
-- students' devices — and dropping it would discard that for no benefit and
-- make a re-apply start from nothing.
--
-- To remove it as well (a full teardown rather than a revert of the
-- architecture), run:
--
--   alter table public.profiles drop constraint if exists profiles_timezone_shape_check;
--   alter table public.profiles drop column if exists timezone;
