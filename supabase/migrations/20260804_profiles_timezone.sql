-- PREPARED — NOT APPLIED. Needs explicit approval before apply_migration.
--
-- profiles.timezone — the student's own IANA timezone, so day boundaries are
-- identical on every device they use.
--
-- WHY THIS EXISTS
-- Day keys for the streak, the Weekly Progress strip and the achievements they
-- drive are computed at the student's LOCAL midnight (see the SiDay header in
-- assets/streak.js). Without a stored value that zone comes from the device,
-- which is correct and stable for a student who is not travelling — the case
-- for effectively everyone, on any given day.
--
-- It is not sufficient in one case: the same student on two devices reporting
-- DIFFERENT zones (a laptop left on home time, a VPN, an actual flight) can
-- compute two different day splits near a boundary, and whichever page loads
-- last writes its answer to current_streak. Pinning every device to a fixed
-- Africa/Cairo used to prevent that, but bought it by moving the day boundary
-- hours off local midnight for every student outside Egypt — which is the bug
-- this column's design replaces, not one to reintroduce.
--
-- With this column populated, resolveTimeZone(profiles.timezone) makes the
-- split a property of the STUDENT rather than of the device in their hand, so
-- the recompute is deterministic across devices AND lands on local midnight.
--
-- AFTER APPLYING, the client work is small and is deliberately NOT shipped yet,
-- because writing a column that does not exist would fail the
-- profiles-write-grants CI gate:
--   1. read `timezone` alongside the other profile columns;
--   2. pass it as updateStreak(sb, uid, { timezone: prof.timezone });
--   3. write the device zone back when it is null or has genuinely changed,
--      so the stored value converges without the student configuring anything.
--
-- NULL is a valid, expected state: it means "no stored preference, use the
-- device zone", which is exactly today's behaviour. Nothing breaks before the
-- backfill, and there is no backfill to run.

alter table public.profiles
  add column if not exists timezone text;

comment on column public.profiles.timezone is
  'IANA timezone name (e.g. "Africa/Cairo", "Asia/Dubai") used to place this '
  'student''s day boundaries for streaks and Weekly Progress. NULL = fall back '
  'to the device timezone. Set from the browser; not a privileged column.';

-- Reject anything that is not a plausible IANA name, so a bad write cannot
-- silently push a student onto the Cairo fallback. Postgres cannot validate the
-- zone database from a CHECK without a function call that is not IMMUTABLE, so
-- this is a shape check; resolveTimeZone() validates for real at read time via
-- Intl and falls back safely on anything it cannot use.
alter table public.profiles
  drop constraint if exists profiles_timezone_shape_check;
alter table public.profiles
  add constraint profiles_timezone_shape_check
  check (timezone is null or timezone ~ '^[A-Za-z][A-Za-z0-9+_-]*(/[A-Za-z0-9+_.-]+)*$');

-- SEC-01 column-privilege model: the client may set its own timezone. It is not
-- privileged — it changes only where this student's own day boundaries fall.
grant update (timezone) on public.profiles to authenticated;
grant insert (timezone) on public.profiles to authenticated;
