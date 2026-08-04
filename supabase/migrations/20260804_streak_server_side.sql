-- PREPARED — NOT APPLIED. Needs explicit approval before apply_migration.
--
-- Move the streak computation from the browser into Postgres, and make the day
-- boundary a property of the STUDENT rather than of the device in their hand.
--
-- This replaces the earlier 20260804_profiles_timezone.sql, which added the
-- column alone. Rationale in docs/engineering/streak-server-side-architecture.md;
-- in short, a stored timezone only removes the two-device ambiguity if exactly
-- ONE actor applies it, and the columns stay forgeable for as long as the
-- browser is the thing writing them.
--
-- WHAT THIS FIXES THAT THE COLUMN ALONE CANNOT
--   * Two devices in different zones are BOTH fresh and legitimately disagree,
--     so neither the client's compare-and-set nor its staleness check fires.
--     Measured on live data for one real student, the same rows at the same
--     instant give best_streak 16 (Cairo), 18 (New York), 10 (Kiritimati).
--   * current_streak / best_streak / last_active_date are UPDATE-granted to
--     `authenticated` because the client computes them, so a student can edit
--     their own row and mint achievements. Section 3 revokes that.
--   * The 120-day window and the 1000-row PostgREST cap disappear: one
--     transaction sees every row.
--
-- ROLLBACK: 20260804_streak_server_side_rollback.sql restores the previous
-- state exactly. The client wrapper falls back to its in-browser path when the
-- RPC is absent, so a revert is safe in either order.

-- ── 1. The student's timezone ───────────────────────────────────────────────
-- NULL means "not known yet"; recompute_streak() then uses the device zone the
-- caller passes and stores it, so values converge with no student action and no
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

-- The student may set their own timezone (it is not privileged — it only moves
-- where their own day starts). The streak columns are revoked in section 3.
grant update (timezone), insert (timezone) on public.profiles to authenticated;

-- ── 2. The recompute ────────────────────────────────────────────────────────
-- Returns the SAME shape window.updateStreak already returns, so no consumer
-- changes: {current_streak, best_streak, active_days, timezone, today_key}.

create or replace function public.recompute_streak(
  p_user_id   uuid default auth.uid(),
  p_device_tz text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tz            text;
  v_today         date;
  v_current       int  := 0;
  v_best          int  := 0;
  v_last          date;
  v_days          date[];
  v_stored_best   int  := 0;
begin
  -- A caller may only recompute their OWN streak. service_role (which has no
  -- auth.uid()) is allowed through for admin/backfill use.
  if p_user_id is null then
    raise exception 'recompute_streak: no user';
  end if;
  if auth.uid() is not null and auth.uid() <> p_user_id then
    raise exception 'recompute_streak: refused' using errcode = '42501';
  end if;

  -- Zone precedence: stored -> the calling device's -> Africa/Cairo. A name the
  -- server does not recognise is discarded rather than trusted, so a bad client
  -- value cannot shift a student's day boundary to somewhere that does not
  -- exist. pg_timezone_names is the authority Postgres itself uses.
  select p.timezone, coalesce(p.best_streak, 0)
    into v_tz, v_stored_best
    from profiles p where p.id = p_user_id;

  if v_tz is null or not exists (select 1 from pg_timezone_names where name = v_tz) then
    if p_device_tz is not null
       and exists (select 1 from pg_timezone_names where name = p_device_tz) then
      v_tz := p_device_tz;
    else
      v_tz := coalesce(v_tz, 'Africa/Cairo');
      if not exists (select 1 from pg_timezone_names where name = v_tz) then
        v_tz := 'Africa/Cairo';
      end if;
    end if;
    -- Remember it, so every other device computes the same split from now on.
    update profiles set timezone = v_tz
      where id = p_user_id and timezone is distinct from v_tz;
  end if;

  v_today := (now() at time zone v_tz)::date;

  -- Every day the student was active, in their own zone. A day in the FUTURE is
  -- discarded: a row dated ahead of today would otherwise light a future Weekly
  -- Progress cell and extend the streak by a day nobody has lived yet.
  with acts as (
    select distinct (qr.created_at at time zone v_tz)::date as d
      from question_records qr
     where qr.user_id = p_user_id
    union
    select distinct (es.created_at at time zone v_tz)::date
      from exam_practice_sessions es
     where es.user_id = p_user_id
    union
    select distinct (ft.completed_at at time zone v_tz)::date
      from focus_tasks ft
      join focus_plans fp on fp.id = ft.plan_id
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
    coalesce((select array_agg(d order by d) from bounded), '{}'::date[]),
    coalesce((select max(len) from runs), 0),
    (select max(run_end) from runs),
    -- The anchor rule: a streak stays alive for the whole of the day AFTER the
    -- last activity, so practising yesterday and opening the app this morning
    -- reads N, not 0.
    coalesce((select len from runs where run_end >= v_today - 1 order by run_end desc limit 1), 0)
  into v_days, v_best, v_last, v_current;

  -- best_streak is a high-water mark: never below the live streak, and never
  -- below what the row already recorded (history older than any window).
  v_best := greatest(v_best, v_current, v_stored_best);

  update profiles
     set current_streak   = v_current,
         best_streak      = v_best,
         last_active_date = coalesce(v_last, last_active_date)
   where id = p_user_id;

  -- Achievements are granted in the SAME transaction as the streak that earns
  -- them, so a badge and the number behind it can never disagree.
  insert into achievements (user_id, achievement_key, name, description, earned_at)
  select p_user_id, k.key, k.name, k.descr, now()
    from (values
      ('streak_7',              '7-Day Streak',         'Practiced for 7 days in a row.',      7,  v_current),
      ('streak_30',             '30-Day Streak',        'Practiced for 30 consecutive days.',  30, v_current),
      ('consistency_champion',  'Consistency Champion', 'Maintained a streak of 14+ days.',    14, v_best)
    ) as k(key, name, descr, threshold, actual)
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
  'timezone, today_key}. SECURITY DEFINER: callers may only recompute '
  'themselves. This is the ONLY writer of the streak columns.';

revoke all on function public.recompute_streak(uuid, text) from public;
grant execute on function public.recompute_streak(uuid, text) to authenticated, service_role;

-- ── 3. The streak columns stop being client-writable ────────────────────────
-- The whole point. With recompute_streak() as the only writer, a student can no
-- longer set their own current_streak and mint achievements from it. The column
-- grants were only ever there because the browser did the computing.
--
-- Deliberately the LAST statement: if anything above fails the transaction rolls
-- back and the client keeps its existing write path.

revoke update (current_streak, best_streak, last_active_date)
  on public.profiles from authenticated;
revoke insert (current_streak, best_streak, last_active_date)
  on public.profiles from authenticated;
