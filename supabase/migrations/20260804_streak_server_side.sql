-- APPLIED 2026-08-04. See also 20260804_streak_server_side_revoke_anon.sql, a
-- follow-up this migration's verification checklist made necessary.
--
-- Move the streak computation from the browser into Postgres, and make the day
-- boundary a property of the STUDENT rather than of the device in their hand.
--
-- Rationale: docs/engineering/streak-server-side-architecture.md
-- Review findings this file answers: docs/engineering/streak-postgres-review.md
--
-- WHAT THIS FIXES THAT A TIMEZONE COLUMN ALONE CANNOT
--   * Two devices in different zones are BOTH fresh and legitimately disagree,
--     so neither the client's compare-and-set nor its staleness check fires.
--     Measured on live data for one real student, the same rows at the same
--     instant give best_streak 16 (Cairo), 18 (New York), 10 (Kiritimati).
--   * current_streak / best_streak / last_active_date are UPDATE-granted to
--     `authenticated` because the client computes them, so a student can edit
--     their own row and mint achievements. Section 5 revokes that.
--   * The 120-day window and the 1000-row PostgREST cap disappear: one
--     transaction sees every row, so no horizon heuristic is needed. That
--     heuristic was itself a bug source (a 107-day streak once read 37).
--
-- ROLLBACK: 20260804_streak_server_side_rollback.sql. The client wrapper falls
-- back to its in-browser path when the RPC is absent, so revert is safe in
-- either order and there is no deploy window to coordinate.

-- ── 1. Indexes the recompute depends on ─────────────────────────────────────
-- EXPLAIN ANALYZE on production showed question_records already served by
-- idx_question_records_user_created (Index Only Scan), but BOTH other sources
-- seq-scanning: exam_practice_sessions has no plain user_id index (only a
-- partial unique on (user_id, idempotency_key) WHERE idempotency_key IS NOT
-- NULL, which cannot serve a general lookup), and focus_tasks has none on
-- plan_id. Those scans are O(table) rather than O(user), and this function runs
-- on every dashboard load and every answered question — the exact shape that
-- degrades quietly as the platform grows.
--
-- Plain CREATE INDEX (not CONCURRENTLY): a migration runs in a transaction, and
-- these tables are small today (21 and 316 rows), so the brief lock is
-- immaterial. On a large table this would need CONCURRENTLY outside a
-- transaction instead.

create index if not exists idx_exam_sessions_user_created
  on public.exam_practice_sessions (user_id, created_at);

create index if not exists idx_focus_tasks_plan_status_completed
  on public.focus_tasks (plan_id, status, completed_at);

-- ── 2. The student's timezone ───────────────────────────────────────────────
-- NULL means "not known yet"; recompute_streak() then adopts the calling
-- device's zone and stores it, so values converge with no student action and no
-- separate client write.

alter table public.profiles
  add column if not exists timezone text;

comment on column public.profiles.timezone is
  'IANA timezone name (e.g. "Africa/Cairo") deciding where this student''s day '
  'boundaries fall for streaks and Weekly Progress. NULL = not yet known; '
  'recompute_streak() populates it from the calling device on first use.';

alter table public.profiles
  drop constraint if exists profiles_timezone_shape_check;
alter table public.profiles
  add constraint profiles_timezone_shape_check
  check (timezone is null or timezone ~ '^[A-Za-z][A-Za-z0-9+_-]*(/[A-Za-z0-9+_.-]+)*$');

-- Not privileged: it only moves where this student's own day starts.
grant update (timezone), insert (timezone) on public.profiles to authenticated;

-- ── 3. The recompute ────────────────────────────────────────────────────────
-- Returns the SAME shape window.updateStreak already returned, so no consumer
-- changes: {current_streak, best_streak, active_days, timezone, today_key}.
--
-- search_path is pinned WITHOUT pg_temp. A SECURITY DEFINER function that
-- leaves pg_temp searchable lets any caller create a temporary object that
-- shadows an unqualified name and have it run as the owner. Excluding it is the
-- standard hardening; pg_catalog is listed first so built-ins cannot be
-- shadowed either.
--
-- There is NO dynamic SQL anywhere in this function. p_device_tz reaches
-- `AT TIME ZONE` as a plpgsql *value*, never as concatenated text, and is
-- additionally required to exist in pg_timezone_names before use — so there is
-- no injection surface even before that validation.

create or replace function public.recompute_streak(
  p_user_id   uuid default auth.uid(),
  p_device_tz text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_caller        uuid := auth.uid();
  v_tz            text;
  v_stored_tz     text;
  v_stored_best   int;
  v_stored_cur    int;
  v_stored_last   date;
  v_today         date;
  v_current       int  := 0;
  v_best          int  := 0;
  v_last          date;
  v_days          date[];
begin
  if p_user_id is null then
    raise exception 'recompute_streak: no user' using errcode = '22004';
  end if;

  -- AUTHORISATION. This function is SECURITY DEFINER and its owner (postgres)
  -- owns every table it reads, and none of them set FORCE ROW LEVEL SECURITY —
  -- so RLS does NOT constrain it. This check is therefore the whole security
  -- boundary, not a convenience.
  --
  -- Written to fail closed: a caller with no auth.uid() may only proceed if it
  -- is a trusted backend role. An earlier draft allowed any p_user_id whenever
  -- auth.uid() was null, which would have let a tokenless caller recompute (and
  -- read) any student's streak.
  if v_caller is null then
    if current_user not in ('service_role', 'postgres', 'supabase_admin') then
      raise exception 'recompute_streak: refused' using errcode = '42501';
    end if;
  elsif v_caller <> p_user_id then
    raise exception 'recompute_streak: refused' using errcode = '42501';
  end if;

  -- ROW LOCK. Serialises concurrent recomputes of the SAME student, which is
  -- what makes the read-compute-write below atomic with respect to itself.
  -- Without it two overlapping calls read the same stored values, compute
  -- independently, and the later UPDATE silently discards the earlier — the
  -- exact lost-update the client-side compare-and-set existed to fight. One row,
  -- one lock, always taken first, so there is no ordering deadlock; it is held
  -- only for the few milliseconds of this function.
  --
  -- A missing profiles row is not an error worth raising: the caller is a
  -- freshly-signed-up student whose row has not been created yet.
  select p.timezone, coalesce(p.best_streak, 0), coalesce(p.current_streak, 0), p.last_active_date
    into v_stored_tz, v_stored_best, v_stored_cur, v_stored_last
    from public.profiles p
   where p.id = p_user_id
     for update;

  if not found then
    return jsonb_build_object(
      'current_streak', 0, 'best_streak', 0, 'active_days', '[]'::jsonb,
      'timezone', coalesce(p_device_tz, 'Africa/Cairo'),
      'today_key', to_char((now() at time zone coalesce(p_device_tz, 'Africa/Cairo'))::date, 'YYYY-MM-DD'),
      'skipped', true);
  end if;

  -- Zone precedence: stored -> calling device -> Africa/Cairo. A name absent
  -- from pg_timezone_names is discarded rather than trusted, so a bad or hostile
  -- client value cannot move a student's day boundary somewhere that does not
  -- exist (or error at AT TIME ZONE and abort the whole call).
  v_tz := v_stored_tz;
  if v_tz is null or not exists (select 1 from pg_timezone_names where name = v_tz) then
    if p_device_tz is not null
       and exists (select 1 from pg_timezone_names where name = p_device_tz) then
      v_tz := p_device_tz;
    else
      v_tz := 'Africa/Cairo';
    end if;
  end if;

  v_today := (now() at time zone v_tz)::date;

  -- Every day the student was active, in their own zone. Deliberately UNBOUNDED
  -- in history: the whole point of computing here is that one transaction sees
  -- every row, so there is no window and therefore no horizon heuristic to get
  -- wrong. Cost is O(rows for this student) via the indexes in section 1.
  --
  -- A day in the FUTURE is dropped: a row dated ahead of today would otherwise
  -- light a future Weekly Progress cell and extend the streak by a day nobody
  -- has lived yet.
  with acts as (
    select (qr.created_at at time zone v_tz)::date as d
      from public.question_records qr
     where qr.user_id = p_user_id and qr.created_at is not null
    union
    select (es.created_at at time zone v_tz)::date
      from public.exam_practice_sessions es
     where es.user_id = p_user_id and es.created_at is not null
    union
    select (ft.completed_at at time zone v_tz)::date
      from public.focus_tasks ft
      join public.focus_plans fp on fp.id = ft.plan_id
     where fp.user_id = p_user_id
       and ft.status = 'DONE'
       and ft.completed_at is not null
  ),
  bounded as (select d from acts where d is not null and d <= v_today),
  -- Consecutive days share (date - row_number()); one group per unbroken run.
  grouped as (
    select d, d - (row_number() over (order by d))::int as grp from bounded
  ),
  runs as (
    select grp, count(*)::int as len, max(d) as run_end from grouped group by grp
  )
  select
    -- Only the recent window is RETURNED. The streak is computed from all of
    -- history, but the client renders a 7-day strip; shipping years of dates on
    -- every page load would be pure waste.
    coalesce((select array_agg(d order by d) from bounded where d > v_today - 180), '{}'::date[]),
    coalesce((select max(len) from runs), 0),
    (select max(run_end) from runs),
    -- The anchor rule: a streak stays alive for the whole of the day AFTER the
    -- last activity, so practising yesterday and opening the app this morning
    -- reads N rather than 0. Runs are disjoint, so at most one can qualify.
    coalesce((select len from runs where run_end >= v_today - 1 order by run_end desc limit 1), 0)
  into v_days, v_best, v_last, v_current;

  -- best_streak is a high-water mark: never below the live streak, and never
  -- below what the row already recorded (history predating any of this).
  v_best := greatest(v_best, v_current, v_stored_best);

  -- Write only when something actually changed. This function runs on every
  -- dashboard load, every Progress load and every answered question, and an
  -- unconditional UPDATE would rewrite the row each time — WAL, dead tuples and
  -- index churn for no change. greatest() on best_streak is belt-and-braces
  -- alongside the row lock: even if a write arrived by another path, the
  -- personal best cannot move backwards.
  if v_current is distinct from v_stored_cur
     or v_best is distinct from v_stored_best
     or (v_last is not null and v_last is distinct from v_stored_last)
     or v_tz is distinct from v_stored_tz then
    update public.profiles
       set current_streak   = v_current,
           best_streak      = greatest(v_best, coalesce(best_streak, 0)),
           last_active_date = coalesce(v_last, last_active_date),
           timezone         = v_tz
     where id = p_user_id;
  end if;

  -- Achievements are granted in the SAME transaction as the streak that earns
  -- them, so a badge and the number behind it can never disagree. ON CONFLICT
  -- DO NOTHING keeps this idempotent and preserves the original earned_at.
  insert into public.achievements (user_id, achievement_key, name, description, earned_at)
  select p_user_id, k.key, k.nm, k.descr, now()
    from (values
      ('streak_7',             '7-Day Streak',         'Practiced for 7 days in a row.',     7,  v_current),
      ('streak_30',            '30-Day Streak',        'Practiced for 30 consecutive days.', 30, v_current),
      ('consistency_champion', 'Consistency Champion', 'Maintained a streak of 14+ days.',   14, v_best)
    ) as k(key, nm, descr, threshold, actual)
   where k.actual >= k.threshold
  on conflict (user_id, achievement_key) do nothing;

  return jsonb_build_object(
    'current_streak', v_current,
    'best_streak',    v_best,
    'active_days',    to_jsonb(coalesce(v_days, '{}'::date[])),
    'timezone',       v_tz,
    'today_key',      to_char(v_today, 'YYYY-MM-DD')
  );
end;
$$;

comment on function public.recompute_streak(uuid, text) is
  'Recomputes the daily streak from question_records + exam_practice_sessions + '
  'focus_tasks in the student''s own timezone, updates profiles, grants streak '
  'achievements, and returns {current_streak, best_streak, active_days, '
  'timezone, today_key}. SECURITY DEFINER and NOT constrained by RLS: the '
  'auth.uid() check inside is the security boundary. Takes a FOR UPDATE lock on '
  'the profiles row, so concurrent recomputes of one student serialise. This is '
  'the ONLY writer of the streak columns.';

-- ── 4. Execute grants ───────────────────────────────────────────────────────
-- REVOKE FROM public first: a SECURITY DEFINER function is executable by
-- everyone by default, which would expose it to the `anon` role.

revoke all on function public.recompute_streak(uuid, text) from public;
grant execute on function public.recompute_streak(uuid, text) to authenticated, service_role;

-- ── 5. The streak columns stop being client-writable ────────────────────────
-- The point of the whole change. With recompute_streak() as the only writer, a
-- student can no longer set their own current_streak and mint achievements from
-- it. These grants existed only because the browser did the computing.
--
-- Deliberately LAST: if anything above fails, the transaction rolls back and the
-- client keeps its existing write path.

revoke update (current_streak, best_streak, last_active_date)
  on public.profiles from authenticated;
revoke insert (current_streak, best_streak, last_active_date)
  on public.profiles from authenticated;
