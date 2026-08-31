-- =====================================================================
-- teacher_attention() — where should a teacher look first, and why
-- =====================================================================
-- STATUS: 🟡 PREPARED — NOT APPLIED. Dry-run only.
--         Apply with explicit owner approval, per CLAUDE.md §3.
-- DEPENDS ON: 20260830b (workspace_is_active_staff), 20260830c (teacher_roster),
--             20260830d (teacher_student_weaknesses — the per-student read this
--             summarises)
--
-- WHAT IT IS
-- ----------
-- One row per ACTIVE-linked student in one workspace, carrying the smallest set
-- of facts that answers "who deserves the first look, and why". It is NOT a
-- leaderboard and NOT a judgement of a student: it is an attention budget
-- (teacher-intelligence-layer.md §6.4), capped at five, allowed to be empty.
--
-- IT RETURNS STRICTLY LESS THAN WHAT IS ALREADY APPROVED
-- -----------------------------------------------------
-- Only aggregates — a count, a band, a date. Never the per-topic list, which
-- already has its home in teacher_student_weaknesses(). No new fact about any
-- student becomes visible here; this is a summary of facts a teacher can
-- already reach one click away. The analyzer's working numbers
-- (weakness_score, mastery_score, improvement_score) are withheld exactly as
-- 20260830d withholds them.
--
-- THREE SIGNALS ARE DELIBERATELY NOT USED, AND THIS IS WHY
-- -------------------------------------------------------
-- Measured against production 2026-08-31 before this was written:
--
--   * trend            — populated on 20 of 225 reports (9%). Showing a
--                        regression signal that is absent nine times in ten
--                        teaches a teacher to distrust the surface.
--   * recent7_count    — NOT "the last 7 days". regenerate-reports.js computes
--     recent14_count     `age = now - ts` where `now` is the ANALYZER'S run
--                        time, so the count is frozen at generation. Proven in
--                        the data: one student carries 205 "recent 7-day"
--                        signals while having been silent for 43 days. Used
--                        live it would print "31 signals this week" beside
--                        "quiet for 24 days" — self-contradictory.
--   * priority_rank    — ranks a weakness WITHIN one student
--                        (`entries.forEach((e,i) => e.priority_rank = i+1)`),
--                        so every student has a rank 1. Measured: min() was 1
--                        for all 13 students with reports. It cannot order a
--                        class.
--
-- FRESHNESS IS STRUCTURAL, NOT A FOOTNOTE
-- ---------------------------------------
-- Every weakness_reports row is a snapshot of the student as of THEIR LAST
-- SIGNAL — measured: report generation date equals last-signal date for every
-- stale student tested. So a high-severity count can be a month old. Three
-- high-severity topics from a month ago is not the same present-tense fact as
-- one high-severity topic from yesterday, and ranking them together by count
-- would say it is.
--
-- Hence the reason is a TIER, not a score, and freshness picks the tier:
--
--   'struggling'   last signal within FRESH_DAYS and >= 1 critical/high
--                  -> the evidence is current. Act on the teaching.
--   'quiet'        last signal older than FRESH_DAYS
--                  -> act on the engagement. Severity still shown, always dated.
--   'no_evidence'  connected, but no weakness report at all
--                  -> act on the onboarding. This is an ABSENCE OF EVIDENCE and
--                     must never be rendered as an academic weakness.
--
-- A student is ordered by the fact that put them in their tier, so the row's
-- explanation and its position always agree. Ties break on name, never on
-- anything unstable: a list that reshuffles between loads cannot be trusted.
--
-- THE CAP IS PART OF THE CONTRACT
-- -------------------------------
-- LIMIT 5 lives in SQL, not in the page, so no caller can turn the budget into
-- a feed. An empty result is a valid answer and the section says nothing.
-- =====================================================================

begin;

create or replace function teacher_attention(p_workspace uuid)
returns table (
  student_id       uuid,
  full_name        text,
  reason           text,
  high_or_critical integer,
  top_severity     text,
  last_signal_at   timestamptz,
  days_quiet       integer,
  joined_at        timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
declare
  FRESH_DAYS constant int := 14;
begin
  -- The same gate teacher_roster() uses, for the same reason: this is a
  -- workspace-wide read, so active staff of THIS workspace and nobody else.
  if not workspace_is_active_staff(p_workspace) then
    raise exception 'teacher_attention: not staff of this workspace' using errcode = '42501';
  end if;

  return query
  with roster as (
    -- ACTIVE links only. A revoked or removed student is not this teacher's
    -- to be prompted about.
    select ws.student_id as sid,
           coalesce(p.full_name, 'Student') as nm,
           ws.joined_at as jat
      from workspace_students ws
      left join profiles p on p.id = ws.student_id
     where ws.workspace_id = p_workspace
       and ws.status = 'active'
       and (ws.expires_at is null or ws.expires_at > now())
  ),
  agg as (
    -- LEFT JOIN, deliberately: a student with no report must survive this and
    -- arrive as 'no_evidence' rather than silently vanishing from the class.
    select r.sid, r.nm, r.jat,
           count(w.id) filter (where w.severity_band in ('critical','high'))::int as hc,
           max(case w.severity_band when 'critical' then 4 when 'high' then 3
                                    when 'medium'   then 2 when 'low'  then 1 end) as band_rank,
           max(w.last_signal_at) as last_sig
      from roster r
      left join weakness_reports w on w.user_id = r.sid
     group by r.sid, r.nm, r.jat
  ),
  scored as (
    select a.*,
           case when a.last_sig is null then null::int
                else (now()::date - a.last_sig::date)::int end as quiet_days
      from agg a
  )
  select s.sid,
         s.nm,
         case when s.last_sig is null                            then 'no_evidence'
              when s.quiet_days > FRESH_DAYS                     then 'quiet'
              when s.hc > 0                                      then 'struggling'
              else null end                                      as reason,
         s.hc,
         case s.band_rank when 4 then 'critical' when 3 then 'high'
                          when 2 then 'medium'   when 1 then 'low' end as top_band,
         s.last_sig,
         s.quiet_days,
         s.jat
    from scored s
   where s.last_sig is null                    -- no evidence at all
      or s.quiet_days > FRESH_DAYS             -- gone quiet
      or s.hc > 0                              -- currently struggling
   order by
     -- Tier first: current evidence outranks stale evidence, which outranks
     -- an absence of evidence. This is the freshness requirement, made
     -- structural rather than written under the row.
     case when s.last_sig is not null and s.quiet_days <= FRESH_DAYS and s.hc > 0 then 1
          when s.quiet_days > FRESH_DAYS                                          then 2
          else                                                                          3 end,
     -- Then by the fact that put them in the tier, so position and explanation
     -- always agree.
     case when s.last_sig is not null and s.quiet_days <= FRESH_DAYS and s.hc > 0
          then s.hc end desc nulls last,
     case when s.quiet_days > FRESH_DAYS then s.quiet_days end desc nulls last,
     case when s.last_sig is null then s.jat end asc nulls last,
     -- Stable tie-break. Never random: a list that reshuffles between loads
     -- cannot be trusted, and trust is the whole asset here.
     s.nm asc, s.sid asc
   limit 5;                                    -- the attention budget, in SQL
end;
$$;

comment on function teacher_attention(uuid) is
  'Up to five active-linked students of one workspace who may deserve the first '
  'look, each with the fact that qualified them. An attention budget, not a '
  'feed, and not a judgement of any student. Returns aggregates only — never '
  'the per-topic weakness list, and never the analyzer working scores. Excludes '
  'trend, recent7_count, recent14_count and priority_rank: measured unreliable '
  'or not comparable across students.';

-- ── privileges: revoke the default ACL, then grant deliberately ──────────
revoke all on function teacher_attention(uuid) from public, anon, authenticated;
grant execute on function teacher_attention(uuid) to authenticated;

commit;
