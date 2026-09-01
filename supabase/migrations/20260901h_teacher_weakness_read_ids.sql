-- =====================================================================
-- teacher_student_weaknesses() — the stored taxonomy ids travel with the row
-- =====================================================================
-- STATUS: ✅ APPLIED 2026-09-01 to igvkyxkmjnkzscqgommj with explicit owner
--         approval (CLAUDE.md §3), recorded as schema_migrations version
--         20260901220926 `teacher_weakness_read_ids`. Applied through the MCP
--         tool with this file's text verbatim, minus the outer transaction.
--         Verified after apply: twelve-column signature; live
--         pg_get_functiondef() md5 5d69fc5116d3f78416b30d68714c752a, equal to
--         the value pre-computed from this file; ACL identical to the four
--         other teaching reads; anon/public refused, authenticated allowed;
--         SECURITY DEFINER with search_path pinned; the real student's rows
--         carry the stored ids; the 20260830d contract suite re-run 10 of 10
--         in an aborted transaction. Every other function, policy, constraint
--         and relation hash unchanged. Rollback: 20260901t, prepared, unapplied.
-- DEPENDS ON: 20260830d (the read this widens), 20260830b (the gates it keeps)
-- CONTEXT: docs/roadmap/teacher-intelligence-layer.md §15.11 — decision (b),
--          locked 2026-09-01: the class-wide aggregate keys on the STORED
--          weakness_reports.subtopic_id, never on a label resolved by the client.
--
-- WHAT THIS IS
-- ------------
-- Two trailing output columns, topic_id and subtopic_id, on the existing
-- per-student read. Nothing else moves: the three gates, the withheld working
-- numbers, the per-source counts, the ordering and the ACL are what 20260830d
-- applied. The body below was GENERATED from that file, not retyped, and
-- tests/teacher-class-patterns.test.mjs asserts the two differ by exactly the
-- two added select lines and the two added columns.
--
-- It opens no new access. A taxonomy identifier derived from a label the caller
-- already receives is not a new fact about a student, and the analyzer's working
-- numbers (weakness_score, mastery_score, improvement_score, recent7/14_count)
-- stay absent from the signature exactly as before.
--
-- WHY A DROP, AND WHY THE ACL IS RE-STATED
-- ----------------------------------------
-- PostgreSQL refuses to change a function's return type under CREATE OR REPLACE
-- (42P13), so the function is dropped and recreated. The DROP also discards the
-- COMMENT and the ACL — and this project's default ACL hands EXECUTE to anon —
-- so both are re-stated below rather than assumed. Nothing depends on the
-- function (pg_depend, read 2026-09-01), so the DROP cannot cascade.
--
-- Pre-apply baseline, read 2026-09-01: signature of exactly ten columns; live
-- body md5 889dfaaa49437d18fcdeae095be5c47d; ACL postgres/service_role/
-- authenticated = X. The rollback asserts its way back to that md5.
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
  signals_focus     integer,
  topic_id          text,
  subtopic_id       text
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
           coalesce(s.focus, 0),
           r.topic_id,
           r.subtopic_id
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

-- Verification, in the same transaction: the file fails rather than applies if
-- the signature, the security posture or the ACL is anything but the approved one.
do $$
declare v_oid oid; v_sig text;
begin
  select p.oid into v_oid from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'teacher_student_weaknesses';
  if v_oid is null then raise exception 'teacher_student_weaknesses: missing after create'; end if;
  v_sig := pg_get_function_result(v_oid);
  if v_sig <> 'TABLE(topic text, subtopic text, severity_band text, priority_rank integer, trend text, last_signal_at timestamp with time zone, total_signals integer, signals_ai_chat integer, signals_mock_exam integer, signals_focus integer, topic_id text, subtopic_id text)' then
    raise exception 'teacher_student_weaknesses: unexpected signature %', v_sig;
  end if;
  if not (select prosecdef from pg_proc where oid = v_oid) then raise exception 'not security definer'; end if;
  if not exists (select 1 from pg_proc where oid = v_oid and 'search_path=pg_catalog, public' = any(proconfig)) then
    raise exception 'search_path is not pinned';
  end if;
  if has_function_privilege('anon', v_oid, 'EXECUTE') then raise exception 'anon can execute'; end if;
  if has_function_privilege('public', v_oid, 'EXECUTE') then raise exception 'public can execute'; end if;
  if not has_function_privilege('authenticated', v_oid, 'EXECUTE') then raise exception 'authenticated cannot execute'; end if;
end $$;

commit;
