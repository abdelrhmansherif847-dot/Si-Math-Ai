-- =====================================================================
-- Teacher Exams, increment 3e — the room behind the door
-- =====================================================================
-- STATUS: 🟢 APPLIED 2026-09-01 as version 20260901174100.
--
-- The FIRST apply attempt was refused by this migration's own answer-key
-- assertion, which matched the words correct_answer and explanation inside a
-- COMMENT saying they are not selected. Nothing landed. The fix was to strip
-- `--` comments before every source check rather than to weaken the check —
-- and that also made the POSITIVE check honest, since a body that dropped the
-- call to exam_answer_matches() but kept a comment naming it would have passed.
-- All six bodies are byte-identical to production.
--
-- SCOPE. Six RPCs: start, save, submit, the student's own result, and the two
-- staff reads. No table, column, constraint, trigger, policy or grant — 3b
-- built teacher_exam_attempts and teacher_exam_responses and their guards, and
-- this only drives them.
--
-- TWO AUTHORITIES ARE REUSED, NOT REIMPLEMENTED
--   teacher_exam_can_start(exam)  decides whether a sitting may BEGIN. This
--                                 increment does not restate one line of it.
--   exam_answer_matches(fmt, correct, given)  is the single grading rule for
--                                 the whole platform. It is IMMUTABLE and takes
--                                 three scalars, so sharing it couples nothing.
--
-- THE ASYMMETRY THAT LOOKS LIKE A BUG AND IS NOT
-- ----------------------------------------------
-- can_start() is checked when a sitting is CREATED and never again. Resume,
-- save and submit deliberately do not check it. A student whose class link is
-- revoked mid-paper keeps the sitting they are halfway through and cannot begin
-- another — §15.14: destroying work in progress is a support incident, not a
-- security control. That is why the existing-attempt lookup comes FIRST in
-- start(), before any authorization is evaluated at all.
--
-- WHAT IS DELIBERATELY MISSING FROM THE SUBMIT PAYLOAD
-- ---------------------------------------------------
-- exam_submit() returns a `mistakes` array aggregated per topic|subtopic, in
-- exactly the shape the frozen ExamMistakesLogger consumes. teacher_exam_submit
-- returns COUNTS AND NOTHING ELSE. Handing back that shape would be an open
-- invitation for a client to post it into the analyzer, and teacher-authored
-- items carry no taxonomy mapping to aggregate on in the first place. Nothing
-- in this file writes weakness_signals, exam_mistakes or exam_practice_sessions,
-- and no statement below so much as names them.
-- =====================================================================

begin;

-- ── 1 · start, or resume ──────────────────────────────────────────────
create or replace function teacher_exam_start(p_exam uuid, p_client_request_id text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $fn$
declare
  a teacher_exams%rowtype;
  v teacher_exam_attempts%rowtype;
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'teacher_exam_start: sign in first' using errcode = '42501';
  end if;
  if coalesce(btrim(p_client_request_id), '') = '' then
    raise exception 'teacher_exam_start: a client_request_id is required' using errcode = '22000';
  end if;

  -- RESUME FIRST, AND WITHOUT ASKING can_start(). One sitting per student per
  -- exam, so a refresh, a second device or a lost connection all find the same
  -- row — and a student removed from the class since starting still reaches it.
  select * into v from teacher_exam_attempts
   where user_id = auth.uid() and exam_id = p_exam and status <> 'abandoned';

  if not found then
    -- Only a NEW sitting is gated, and the gate is the one 3d already owns.
    if not teacher_exam_can_start(p_exam) then
      raise exception 'teacher_exam_start: this exam is not open to you'
        using errcode = '42501';
    end if;
    select * into a from teacher_exams where id = p_exam;
    insert into teacher_exam_attempts (user_id, exam_id, duration_seconds, client_request_id)
    values (auth.uid(), p_exam, a.duration_minutes * 60, btrim(p_client_request_id))
    returning * into v;
    -- Every item gets a row now, so an untouched question is a row with
    -- answer NULL rather than a gap. Omission is evidence.
    insert into teacher_exam_responses (attempt_id, question_id, ordinal)
      select v.id, q.id, q.ordinal from teacher_exam_questions q where q.exam_id = p_exam;
  end if;

  select * into a from teacher_exams where id = p_exam;
  v_id := v.id;

  return jsonb_build_object(
    'attempt_id', v_id,
    'status', v.status,
    'started_at', v.started_at,
    'submitted_at', v.submitted_at,
    'duration_seconds', v.duration_seconds,
    'title', a.title,
    'instructions', a.instructions,
    'calculator_allowed', a.calculator_allowed,
    -- A NAMED column list, exactly as exam_start() uses. The answer key is not
    -- filtered out downstream; it is never selected in the first place.
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'question_id', q.id,
               'ordinal',     q.ordinal,
               'prompt',      q.prompt,
               'format',      q.question_format,
               'choices',     q.choices,
               'stimulus',    case when st.id is null then null else jsonb_build_object(
                                'kind', st.kind, 'label', st.label,
                                'body', st.body, 'spec', st.spec,
                                'media_ref', st.media_ref, 'media_kind', st.media_kind) end,
               'answer',      r.answer
             ) order by q.ordinal)
        from teacher_exam_questions q
        left join teacher_exam_stimuli st on st.id = q.stimulus_id
        left join teacher_exam_responses r on r.attempt_id = v_id and r.question_id = q.id
       where q.exam_id = p_exam
    ), '[]'::jsonb));
end;
$fn$;

-- ── 2 · save one answer ───────────────────────────────────────────────
create or replace function teacher_exam_save_response(
  p_attempt uuid, p_question uuid, p_answer text, p_ms_delta integer, p_visit boolean)
returns void
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $fn$
declare n integer;
begin
  update teacher_exam_responses r
     set answer           = p_answer,
         -- Accumulated, never assigned: the page reports time since its last
         -- save, so a lost message costs one interval instead of the total.
         ms_on_item       = r.ms_on_item + least(greatest(coalesce(p_ms_delta, 0), 0), 3600000),
         visit_count      = r.visit_count + case when coalesce(p_visit, false) then 1 else 0 end,
         first_seen_at    = coalesce(r.first_seen_at, now()),
         last_answered_at = case when p_answer is not null then now() else r.last_answered_at end
    from teacher_exam_attempts a
   where r.attempt_id = p_attempt
     and r.question_id = p_question
     and a.id = r.attempt_id
     and a.user_id = auth.uid()          -- someone else's sitting is not yours
     and a.status = 'in_progress';       -- and a finished one is finished
  get diagnostics n = row_count;
  if n = 0 then
    -- One message for "not your attempt", "no such item" and "already
    -- submitted". Which it was is not the caller's business.
    raise exception 'teacher_exam_save_response: no open response for this attempt'
      using errcode = '22023';
  end if;
end;
$fn$;

-- ── 3 · submit, and grade ─────────────────────────────────────────────
create or replace function teacher_exam_submit(p_attempt uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $fn$
declare
  a teacher_exam_attempts%rowtype;
  v_correct int; v_wrong int; v_omitted int; v_total int;
begin
  select * into a from teacher_exam_attempts
   where id = p_attempt and user_id = auth.uid();
  if not found then
    raise exception 'teacher_exam_submit: no such attempt' using errcode = '42501';
  end if;

  if a.status = 'in_progress' then
    -- Graded here and nowhere else, by the platform's single grading rule.
    -- An UNANSWERED item stays NULL rather than false: "left it blank" and
    -- "got it wrong" are different claims, and collapsing them would turn a
    -- pacing problem into a topic weakness. The 3b CHECK makes the wrong
    -- version impossible anyway; this is the code agreeing with it.
    update teacher_exam_responses r
       set is_correct = case
             when r.answer is null then null
             else exam_answer_matches(q.question_format, q.correct_answer, r.answer)
           end
      from teacher_exam_questions q
     where q.id = r.question_id and r.attempt_id = p_attempt;

    -- Grading BEFORE the status flips, deliberately: 3b's response guard
    -- refuses an answer change once the sitting is not in_progress, and doing
    -- it the other way round would depend on that guard's exact wording.
    update teacher_exam_attempts set status = 'submitted', submitted_at = now()
     where id = p_attempt;
  end if;

  select count(*) filter (where is_correct),
         count(*) filter (where is_correct is false),
         count(*) filter (where answer is null),
         count(*)
    into v_correct, v_wrong, v_omitted, v_total
    from teacher_exam_responses where attempt_id = p_attempt;

  -- Counts only. Locked decision 2 gives the student their score at once;
  -- locked decision 3 keeps the key and the explanations server-side, so there
  -- is no per-item breakdown here either — an mcq marked wrong is a narrowed
  -- key on a paper the teacher may set again.
  return jsonb_build_object(
    'attempt_id', p_attempt, 'status', 'submitted',
    'total', v_total, 'correct', v_correct, 'wrong', v_wrong, 'omitted', v_omitted);
end;
$fn$;

-- ── 4 · the student's own result ──────────────────────────────────────
create or replace function student_my_teacher_exam_result(p_exam uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $fn$
declare a teacher_exam_attempts%rowtype; v_c int; v_w int; v_o int; v_t int;
begin
  select * into a from teacher_exam_attempts
   where exam_id = p_exam and user_id = auth.uid() and status <> 'abandoned';
  if not found then
    return jsonb_build_object('sat', false);
  end if;
  select count(*) filter (where is_correct), count(*) filter (where is_correct is false),
         count(*) filter (where answer is null), count(*)
    into v_c, v_w, v_o, v_t
    from teacher_exam_responses where attempt_id = a.id;
  return jsonb_build_object(
    'sat', true, 'status', a.status, 'started_at', a.started_at, 'submitted_at', a.submitted_at,
    'total', v_t, 'correct', v_c, 'wrong', v_w, 'omitted', v_o);
end;
$fn$;

-- ── 5 · what the teacher and the assistant see ────────────────────────
-- Identical for both: academic parity is a locked decision, and this read is
-- gated by teacher_exam_is_staff(), which is role-blind.
create or replace function teacher_exam_results(p_exam uuid)
returns table (
  student_id   uuid,
  full_name    text,
  status       text,
  started_at   timestamptz,
  submitted_at timestamptz,
  total        integer,
  correct      integer,
  wrong        integer,
  omitted      integer
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $fn$
begin
  if not teacher_exam_is_staff(p_exam) then
    raise exception 'teacher_exam_results: no such exam, or you are not staff of its class'
      using errcode = '42501';
  end if;
  return query
    select a.user_id,
           coalesce(p.full_name, 'Student'),
           a.status, a.started_at, a.submitted_at,
           count(r.*)::int,
           count(*) filter (where r.is_correct)::int,
           count(*) filter (where r.is_correct is false)::int,
           count(*) filter (where r.answer is null)::int
      from teacher_exam_attempts a
      left join teacher_exam_responses r on r.attempt_id = a.id
      left join profiles p on p.id = a.user_id
     where a.exam_id = p_exam
     group by a.user_id, p.full_name, a.status, a.started_at, a.submitted_at
     order by coalesce(p.full_name, '') asc;
end;
$fn$;

create or replace function teacher_exam_result_detail(p_exam uuid, p_student uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $fn$
declare a teacher_exam_attempts%rowtype;
begin
  if not teacher_exam_is_staff(p_exam) then
    raise exception 'teacher_exam_result_detail: no such exam, or you are not staff of its class'
      using errcode = '42501';
  end if;
  select * into a from teacher_exam_attempts where exam_id = p_exam and user_id = p_student;
  if not found then
    return jsonb_build_object('sat', false);
  end if;
  -- Staff DO see the key here, and that is not a leak: they authored it, and
  -- 3b's policy already lets them read teacher_exam_questions directly.
  return jsonb_build_object(
    'sat', true, 'status', a.status, 'started_at', a.started_at, 'submitted_at', a.submitted_at,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'ordinal', r.ordinal, 'prompt', q.prompt, 'format', q.question_format,
               'given', r.answer, 'correct_answer', q.correct_answer,
               'is_correct', r.is_correct, 'ms_on_item', r.ms_on_item,
               'visit_count', r.visit_count) order by r.ordinal)
        from teacher_exam_responses r
        join teacher_exam_questions q on q.id = r.question_id
       where r.attempt_id = a.id), '[]'::jsonb));
end;
$fn$;

-- ── 6 · ACLs ─────────────────────────────────────────────────────────
revoke all on function teacher_exam_start(uuid, text) from public, anon, authenticated;
revoke all on function teacher_exam_save_response(uuid, uuid, text, integer, boolean) from public, anon, authenticated;
revoke all on function teacher_exam_submit(uuid) from public, anon, authenticated;
revoke all on function student_my_teacher_exam_result(uuid) from public, anon, authenticated;
revoke all on function teacher_exam_results(uuid) from public, anon, authenticated;
revoke all on function teacher_exam_result_detail(uuid, uuid) from public, anon, authenticated;

grant execute on function teacher_exam_start(uuid, text) to authenticated;
grant execute on function teacher_exam_save_response(uuid, uuid, text, integer, boolean) to authenticated;
grant execute on function teacher_exam_submit(uuid) to authenticated;
grant execute on function student_my_teacher_exam_result(uuid) to authenticated;
grant execute on function teacher_exam_results(uuid) to authenticated;
grant execute on function teacher_exam_result_detail(uuid, uuid) to authenticated;

-- ── 7 · verification ─────────────────────────────────────────────────
do $$
declare
  v_bad text;
  FNS constant text[] := array['teacher_exam_start', 'teacher_exam_save_response',
    'teacher_exam_submit', 'student_my_teacher_exam_result', 'teacher_exam_results',
    'teacher_exam_result_detail'];
begin
  select string_agg(p.proname, ', ') into v_bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = any (FNS)
     and (not p.prosecdef
          or coalesce(array_to_string(p.proconfig, ','), '') !~ 'search_path=pg_catalog, public');
  if v_bad is not null then raise exception '3e: not definer, or search_path unpinned: %', v_bad; end if;

  select string_agg(p.proname, ', ') into v_bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = any (FNS)
     and (p.proacl is null
          or exists (select 1 from unnest(p.proacl) a
                      where a::text like '=%' or a::text like 'anon=%'));
  if v_bad is not null then raise exception '3e: reachable by public or anon: %', v_bad; end if;

  -- Every source check below runs against the function body with its `--`
  -- comments STRIPPED. That is not a loosening, it is the difference between
  -- checking code and checking prose: a comment cannot select a column, and on
  -- the first run of this migration the answer-key check fired on the words
  -- "correct_answer and explanation are not in it" inside a comment explaining
  -- that they are not selected. Stripping cuts both ways and makes the
  -- POSITIVE check honest too — a body that dropped the call to
  -- exam_answer_matches() but kept a comment naming it would otherwise pass.

  -- THE ANSWER-KEY BOUNDARY, asserted against the source rather than trusted.
  -- Only the two staff reads may name correct_answer or explanation.
  select string_agg(p.proname, ', ') into v_bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('teacher_exam_start', 'teacher_exam_save_response',
                       'student_my_teacher_exam_result')
     and regexp_replace(p.prosrc, '--[^\n]*', '', 'g') ~ 'correct_answer|explanation';
  if v_bad is not null then
    raise exception '3e: a student-facing function names the answer key: %', v_bad;
  end if;

  -- ONE grading rule. A second implementation would be a comparison written by
  -- hand somewhere in this increment.
  if regexp_replace((select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'teacher_exam_submit'), '--[^\n]*', '', 'g')
     !~ 'exam_answer_matches' then
    raise exception '3e: teacher_exam_submit does not use exam_answer_matches()';
  end if;

  -- NOTHING here may name an evidence table.
  select string_agg(p.proname, ', ') into v_bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = any (FNS)
     and regexp_replace(p.prosrc, '--[^\n]*', '', 'g')
         ~ 'weakness_signals|weakness_reports|exam_mistakes|exam_practice_sessions|mastery_records';
  if v_bad is not null then
    raise exception '3e: a sitting function names an evidence table: %', v_bad;
  end if;

  -- 3b is untouched: still no client write privilege on any table
  select string_agg(distinct g.table_name || '.' || g.privilege_type, ', ') into v_bad
    from information_schema.role_table_grants g
   where g.table_schema = 'public' and g.table_name like 'teacher\_exam%'
     and g.grantee in ('anon', 'authenticated') and g.privilege_type <> 'SELECT';
  if v_bad is not null then raise exception '3e: a client role gained a write privilege: %', v_bad; end if;
end $$;

commit;
