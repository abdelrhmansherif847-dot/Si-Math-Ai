-- =====================================================================
-- Mock delivery · 2 of 2 — start, save, submit
-- =====================================================================
-- STATUS: ⛔ PREPARED — NOT YET APPLIED. Awaiting owner approval (CLAUDE.md §3).
-- DEPENDS ON: 20260830e (exam_attempts, exam_responses, exam_answer_matches)
--
-- Three verbs, and a listing. Every one is SECURITY DEFINER because students
-- hold no privilege on exam_questions at all — which is exactly how the answer
-- key stays server-side.
--
-- WHAT exam_start() RETURNS IS A NAMED COLUMN LIST, and correct_answer and
-- explanation are not on it. That is the whole defence: not a filter a future
-- edit could widen by accident, but a select list someone would have to
-- deliberately add a column to.
--
-- exam_submit() IS THE ONLY WRITER OF is_correct. A client cannot set it
-- because a client cannot write these tables at all (20260830e grants SELECT
-- and nothing else).
-- =====================================================================

begin;

-- ── what can be sat ──────────────────────────────────────────────────────
create or replace function exam_available_sections()
returns table (
  section_id         uuid,
  form_code          text,
  exam_code          text,
  form_title         text,
  section_label      text,
  section_ordinal    integer,
  variant_id         text,
  question_count     integer,
  duration_minutes   integer,
  calculator_allowed boolean
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  -- Published only. A draft form is content in progress and no student sees it.
  select s.id, f.code, f.exam_code, f.title, s.label, s.ordinal, s.variant_id,
         s.question_count, s.duration_minutes, s.calculator_allowed
    from exam_form_sections s
    join exam_forms f on f.id = s.form_id
   where f.status = 'published'
   order by f.exam_code, s.ordinal, s.variant_id nulls first;
$$;

-- ── start (or resume) a sitting ──────────────────────────────────────────
create or replace function exam_start(p_section_id uuid, p_client_request_id text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_sec     exam_form_sections%rowtype;
  v_form    exam_forms%rowtype;
  v_attempt exam_attempts%rowtype;
  v_id      uuid;
begin
  if auth.uid() is null then
    raise exception 'exam_start: sign in first' using errcode = '42501';
  end if;
  if coalesce(btrim(p_client_request_id), '') = '' then
    raise exception 'exam_start: a client_request_id is required' using errcode = '22000';
  end if;

  select * into v_sec from exam_form_sections where id = p_section_id;
  if not found then
    raise exception 'exam_start: no such section' using errcode = '22023';
  end if;
  select * into v_form from exam_forms where id = v_sec.form_id;
  if v_form.status <> 'published' then
    raise exception 'exam_start: that exam is not available' using errcode = '22023';
  end if;

  -- Idempotent by (student, section, client_request_id): a double-tap or a
  -- reconnect resumes the same sitting instead of starting a second one.
  select * into v_attempt from exam_attempts
   where user_id = auth.uid() and section_id = p_section_id and client_request_id = p_client_request_id;

  if found then
    v_id := v_attempt.id;
  else
    insert into exam_attempts (user_id, form_id, section_id, duration_seconds, client_request_id)
    values (auth.uid(), v_sec.form_id, p_section_id, v_sec.duration_minutes * 60, btrim(p_client_request_id))
    returning * into v_attempt;
    v_id := v_attempt.id;

    -- Every item gets a row now, so an untouched question is a row with
    -- answer NULL rather than a gap. Omission is evidence.
    insert into exam_responses (attempt_id, question_id, ordinal)
      select v_id, q.id, q.ordinal from exam_questions q where q.section_id = p_section_id;
  end if;

  return jsonb_build_object(
    'attempt_id',         v_id,
    'status',             v_attempt.status,
    'started_at',         v_attempt.started_at,
    'duration_seconds',   v_attempt.duration_seconds,
    'exam_code',          v_form.exam_code,
    'form_title',         v_form.title,
    'section_label',      v_sec.label,
    'calculator_allowed', v_sec.calculator_allowed,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'question_id', q.id,
               'ordinal',     q.ordinal,
               'prompt',      q.prompt,
               'format',      q.question_format,
               'choices',     q.choices,
               'reading',     q.reading,
               'stimulus',    case when st.id is null then null else jsonb_build_object(
                                'kind', st.kind, 'label', st.label,
                                'body', st.body, 'spec', st.spec,
                                'media_ref', st.media_ref, 'media_kind', st.media_kind) end,
               -- their own saved answer, so a refresh does not lose work
               'answer',      r.answer
             ) order by q.ordinal)
        from exam_questions q
        left join exam_stimuli st on st.id = q.stimulus_id
        left join exam_responses r on r.attempt_id = v_id and r.question_id = q.id
       where q.section_id = p_section_id
    ), '[]'::jsonb)
  );
end;
$$;

-- ── record one interaction ───────────────────────────────────────────────
create or replace function exam_save_response(
  p_attempt uuid, p_question uuid, p_answer text,
  p_ms_delta integer default 0, p_visit boolean default false)
returns void
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  n integer;
begin
  update exam_responses r
     set answer           = p_answer,
         -- Accumulated, never assigned: the page reports time since the last
         -- save, so a lost message costs one interval instead of the total.
         -- Capped at an hour per call so a stalled tab cannot report a week.
         ms_on_item       = r.ms_on_item + least(greatest(coalesce(p_ms_delta, 0), 0), 3600000),
         visit_count      = r.visit_count + case when coalesce(p_visit, false) then 1 else 0 end,
         first_seen_at    = coalesce(r.first_seen_at, now()),
         last_answered_at = case when p_answer is not null then now() else r.last_answered_at end
    from exam_attempts a
   where r.attempt_id = p_attempt
     and r.question_id = p_question
     and a.id = r.attempt_id
     and a.user_id = auth.uid()          -- someone else's sitting is not yours
     and a.status = 'in_progress';       -- and a finished one is finished
  get diagnostics n = row_count;
  if n = 0 then
    raise exception 'exam_save_response: no open response for this attempt' using errcode = '22023';
  end if;
end;
$$;

-- ── submit, grade, and hand the mistakes to the existing pipeline ────────
create or replace function exam_submit(p_attempt uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  a         exam_attempts%rowtype;
  v_form    exam_forms%rowtype;
  v_session uuid;
  v_correct integer; v_wrong integer; v_omitted integer; v_total integer;
  v_mistakes jsonb;
begin
  select * into a from exam_attempts where id = p_attempt and user_id = auth.uid();
  if not found then
    raise exception 'exam_submit: no such attempt' using errcode = '42501';
  end if;
  select * into v_form from exam_forms where id = a.form_id;

  if a.status = 'in_progress' then
    -- Grade server-side. This is the only place is_correct is ever written.
    --
    -- An UNANSWERED item stays NULL rather than false. "Left it blank" and "got
    -- it wrong" are different claims, and collapsing them would quietly turn a
    -- pacing problem into a topic weakness: the questions a student runs out of
    -- time for are the ones at the END of the paper, so every omission
    -- signalled as a mistake inflates whatever topic happens to sit there.
    -- The omission is still recorded — answer NULL, is_correct NULL, with its
    -- time and visit count — so pacing analysis has it when there is enough
    -- evidence to do that honestly. It just does not become a weakness signal.
    update exam_responses r
       set is_correct = case
             when r.answer is null then null
             else exam_answer_matches(q.question_format, q.correct_answer, r.answer)
           end
      from exam_questions q
     where q.id = r.question_id and r.attempt_id = p_attempt;

    update exam_attempts set status = 'submitted', submitted_at = now() where id = p_attempt;
    a.submitted_at := now();
  end if;

  -- is_correct is three-valued now and each state means exactly one thing:
  --   true  → answered correctly    false → answered wrongly    null → not answered
  select count(*) filter (where is_correct),
         count(*) filter (where is_correct is false),
         count(*) filter (where answer is null),
         count(*)
    into v_correct, v_wrong, v_omitted, v_total
    from exam_responses where attempt_id = p_attempt;

  -- One session row per attempt, so history, progress and the streak keep
  -- working off the table they already read. score stays NULL: a raw count is
  -- honest and a scaled score would need a conversion table we do not have.
  select id into v_session from exam_practice_sessions where attempt_id = p_attempt;
  if v_session is null then
    insert into exam_practice_sessions (
      user_id, exam_type, total_questions, correct_answers, wrong_answers,
      omitted_answers, score, duration_minutes, started_at, ended_at,
      idempotency_key, attempt_id)
    values (
      a.user_id, v_form.exam_code, v_total, v_correct, v_wrong,
      v_omitted, null,
      greatest(1, round(extract(epoch from (coalesce(a.submitted_at, now()) - a.started_at)) / 60)::int),
      a.started_at, coalesce(a.submitted_at, now()),
      p_attempt, p_attempt)
    returning id into v_session;

    -- One row per WRONG ITEM — and for the first time these three columns are
    -- not null. They are empty in 11 of 11 rows written by the frozen flow,
    -- because that flow asks the student for topics, not answers.
    insert into exam_mistakes (
      user_id, session_id, topic, subtopic, mistake_count, mistake_type,
      question_id, correct_answer, student_answer)
      select a.user_id, v_session,
             coalesce(tt.display_name, 'Unmapped'),
             ts.display_name,
             1, 'EXAM_MISTAKE',
             r.question_id, q.correct_answer, r.answer
        from exam_responses r
        join exam_questions q on q.id = r.question_id
        left join taxonomy_topics tt on tt.id = q.topic_id
        left join taxonomy_subtopics ts on ts.id = q.subtopic_id
       where r.attempt_id = p_attempt
         and r.is_correct is false;
  end if;

  -- Aggregated per topic|subtopic, which is the shape
  -- ExamMistakesLogger.process() already takes. The logger (frozen) turns these
  -- into weakness_signals at the weights it already uses; nothing here invents a
  -- new signal type, weight or source.
  select coalesce(jsonb_agg(m order by m ->> 'topic', m ->> 'subtopic'), '[]'::jsonb) into v_mistakes
    from (
      select jsonb_build_object(
               'topic',       coalesce(tt.display_name, 'Unmapped'),
               'subtopic',    ts.display_name,
               'count',       count(*),
               'question_id', min(r.question_id::text)
             ) as m
        from exam_responses r
        join exam_questions q on q.id = r.question_id
        left join taxonomy_topics tt on tt.id = q.topic_id
        left join taxonomy_subtopics ts on ts.id = q.subtopic_id
       where r.attempt_id = p_attempt
         and r.is_correct is false
       group by tt.display_name, ts.display_name
    ) g;

  return jsonb_build_object(
    'attempt_id', p_attempt,
    'session_id', v_session,
    'exam_code',  v_form.exam_code,
    'total',      v_total,
    'correct',    v_correct,
    'wrong',      v_wrong,
    'omitted',    v_omitted,
    'mistakes',   v_mistakes
  );
end;
$$;

-- ── privileges ───────────────────────────────────────────────────────────
revoke all on function exam_answer_matches(text, text, text)                 from public, anon, authenticated;
revoke all on function exam_available_sections()                             from public, anon, authenticated;
revoke all on function exam_start(uuid, text)                                from public, anon, authenticated;
revoke all on function exam_save_response(uuid, uuid, text, integer, boolean) from public, anon, authenticated;
revoke all on function exam_submit(uuid)                                     from public, anon, authenticated;

-- exam_answer_matches stays server-side: it takes the correct answer as an
-- argument, so a client able to call it could probe the key one guess at a time.
grant execute on function exam_available_sections()                             to authenticated;
grant execute on function exam_start(uuid, text)                                to authenticated;
grant execute on function exam_save_response(uuid, uuid, text, integer, boolean) to authenticated;
grant execute on function exam_submit(uuid)                                     to authenticated;

commit;
