-- =====================================================================
-- Rollback for 20260901h — and this one really is an undo
-- =====================================================================
-- STATUS: 🟡 PREPARED, deliberately unapplied.
--
-- Restores teacher_student_weaknesses() to the exact body 20260830d applied:
-- ten columns, no ids. The body below is that file's, verbatim, and the check
-- at the end asserts the recreated function's pg_get_functiondef() md5 equals
-- the value read from production BEFORE 20260901h was applied
-- (889dfaaa49437d18fcdeae095be5c47d, 2026-09-01) — so this is a true undo,
-- not a hopeful one. The ACL is re-stated for the same reason as in 20260901h.
--
-- Rolling back while teacher.html's class-patterns card is deployed leaves that
-- card without the ids it keys on; it degrades to its excluded/empty state
-- rather than resolving labels, by design (§15.11 decision b). Roll the page
-- back too, or accept a silent card.
-- =====================================================================

begin;

drop function if exists teacher_student_weaknesses(uuid, uuid);

create function teacher_student_weaknesses(p_workspace uuid, p_student uuid)
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

revoke all on function teacher_student_weaknesses(uuid, uuid) from public, anon, authenticated;
grant execute on function teacher_student_weaknesses(uuid, uuid) to authenticated;

-- Verification, in the same transaction: the file fails rather than applies if
-- the signature, the security posture or the ACL is anything but the approved one.
do $$
declare v_oid oid; v_sig text;
begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'teacher_student_weaknesses';
  if v_oid is null then raise exception 'teacher_student_weaknesses: missing after create'; end if;
  v_sig := pg_get_function_result(v_oid);
  if v_sig <> 'TABLE(topic text, subtopic text, severity_band text, priority_rank integer, trend text, last_signal_at timestamp with time zone, total_signals integer, signals_ai_chat integer, signals_mock_exam integer, signals_focus integer)' then
    raise exception 'teacher_student_weaknesses: unexpected signature %', v_sig;
  end if;
  if not (select prosecdef from pg_proc where oid = v_oid) then raise exception 'not security definer'; end if;
  if not exists (select 1 from pg_proc where oid = v_oid and 'search_path=pg_catalog, public' = any(proconfig)) then
    raise exception 'search_path is not pinned';
  end if;
  if has_function_privilege('anon', v_oid, 'EXECUTE') then raise exception 'anon can execute'; end if;
  if has_function_privilege('public', v_oid, 'EXECUTE') then raise exception 'public can execute'; end if;
  if not has_function_privilege('authenticated', v_oid, 'EXECUTE') then raise exception 'authenticated cannot execute'; end if;
  if md5(pg_get_functiondef(v_oid)) <> '889dfaaa49437d18fcdeae095be5c47d' then
    raise exception 'rollback: body md5 % is not the pre-20260901h value', md5(pg_get_functiondef(v_oid));
  end if;
end $$;

commit;
