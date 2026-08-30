-- =====================================================================
-- Weakness Intelligence v1 — the teacher/assistant read path
-- =====================================================================
-- STATUS: ⛔ PREPARED — NOT YET APPLIED. Awaiting owner approval (CLAUDE.md §3).
-- DEPENDS ON: 20260830a/b/c (the teacher foundation, applied 2026-08-30)
-- CONTEXT: docs/engineering/weakness-evidence-audit.md — read it first. It is
--          the reason this function returns what it does and withholds the rest.
--
-- WHAT THIS IS
-- ------------
-- The FIRST consumer of teacher_can_see_student(). That predicate was written
-- in 20260830b guarding nothing, on the stated promise that every teacher-facing
-- read would route through it and nothing else. This is that read.
--
-- It opens no new access. There is no new table, no new policy, no new role, and
-- no widening of an existing one: a caller must already be active staff of the
-- workspace AND already hold an active link to this student. Both conditions
-- existed before this file and are unchanged by it.
--
-- WHAT IT RETURNS, AND WHAT IT DELIBERATELY DOES NOT
-- --------------------------------------------------
-- Returned: topic, subtopic, severity_band, priority_rank, trend,
--           last_signal_at, total_signals, and the per-source signal counts.
--
-- WITHHELD, on purpose:
--   * weakness_score, mastery_score, improvement_score, recent7/14_count.
--     These are the analyzer's working numbers. Handing them to a surface is an
--     invitation to re-derive a band or a direction from them, and
--     regenerate-reports.js states in capitals that the analyzer is the SOLE
--     authority for both. A teacher needs the conclusion and its evidence, not
--     the intermediate arithmetic — and a number on screen implies a precision
--     that 225 reports across 13 students does not support.
--   * Anything not about learning. This joins profiles for nothing at all: no
--     name, no email, no plan. The caller already has the roster.
--
-- THE PER-SOURCE COUNTS ARE THE POINT
-- -----------------------------------
-- Measured 2026-08-30: 86% of weakness signals come from tutor conversations,
-- 1.5% from mock exams, and only 3 students have ever produced an exam signal.
-- A teacher reading "weak in Linear Equations" with no basis attached will read
-- it as an exam result, because that is what the word means in a classroom.
-- These three counts are what let the surface say where it actually came from,
-- and they are counts of stored rows by their stored source — reporting, not
-- inference.
--
-- NULL TREND TRAVELS AS NULL
-- --------------------------
-- The analyzer holds trend at null below five signals on a topic; 205 of 225
-- live reports are null on that basis. Nothing here coalesces it to 'stable'.
-- The refusal is the finding and it must reach the screen intact.
-- =====================================================================

begin;

create or replace function teacher_student_weaknesses(p_workspace uuid, p_student uuid)
returns table (
  topic             text,
  subtopic          text,
  severity_band     text,
  priority_rank     integer,
  trend             text,
  last_signal_at    timestamptz,
  total_signals     integer,
  signals_ai_chat   integer,
  signals_mock_exam integer,
  signals_focus     integer
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $$
begin
  -- Two gates, both pre-existing. Staff of THIS workspace, and an active link to
  -- THIS student. Neither is new; this function is only the first caller.
  if not workspace_is_active_staff(p_workspace) then
    raise exception 'teacher_student_weaknesses: not staff of this workspace' using errcode = '42501';
  end if;
  if not teacher_can_see_student(p_student) then
    raise exception 'teacher_student_weaknesses: no active link to this student' using errcode = '42501';
  end if;
  -- Staff of workspace A must not read a student they are linked to only in
  -- workspace B. teacher_can_see_student() is caller-scoped, not workspace-
  -- scoped, so the pairing is checked explicitly.
  if not exists (
    select 1 from workspace_students ws
     where ws.workspace_id = p_workspace
       and ws.student_id = p_student
       and ws.status = 'active'
       and (ws.expires_at is null or ws.expires_at > now())
  ) then
    raise exception 'teacher_student_weaknesses: that student is not in this workspace' using errcode = '42501';
  end if;

  return query
    select r.topic,
           r.subtopic,
           r.severity_band,
           r.priority_rank,
           r.trend,                      -- null stays null
           r.last_signal_at,
           r.total_signals,
           coalesce(s.ai_chat, 0),
           coalesce(s.mock_exam, 0),
           coalesce(s.focus, 0)
      from weakness_reports r
      left join lateral (
        select count(*) filter (where w.source = 'AI_CHAT')::int        as ai_chat,
               count(*) filter (where w.source = 'MOCK_EXAM')::int      as mock_exam,
               count(*) filter (where w.source = 'FOCUS_PRACTICE')::int as focus
          from weakness_signals w
         where w.user_id = r.user_id
           and w.topic = r.topic
           and coalesce(w.subtopic, '') = coalesce(r.subtopic, '')
      ) s on true
     where r.user_id = p_student
     order by r.priority_rank nulls last, r.last_signal_at desc nulls last;
end;
$$;

comment on function teacher_student_weaknesses(uuid, uuid) is
  'The teacher/assistant read of a student''s canonical weaknesses. Gated by '
  'workspace staff + an active link + the pairing of the two. Returns the '
  'analyzer''s conclusions and their evidence basis, never its working numbers '
  '— see docs/engineering/weakness-evidence-audit.md §6.';

-- Same privilege discipline as every function in this system: strip the DEFAULT
-- ACL, then grant deliberately. Authorization is inside the body, not in who may
-- call it.
revoke all on function teacher_student_weaknesses(uuid, uuid) from public, anon, authenticated;
grant execute on function teacher_student_weaknesses(uuid, uuid) to authenticated;

commit;
