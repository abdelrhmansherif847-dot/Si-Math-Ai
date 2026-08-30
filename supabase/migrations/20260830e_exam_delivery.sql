-- =====================================================================
-- Mock delivery — per-question evidence for the weakness pipeline
-- =====================================================================
-- STATUS: ⛔ PREPARED — NOT YET APPLIED. Awaiting owner approval (CLAUDE.md §3).
-- DEPENDS ON: the exam authoring tables (exam_forms/sections/questions/stimuli)
-- CONTEXT: docs/engineering/weakness-evidence-audit.md §5 lists exactly what is
--          impossible today and why. This file records the missing evidence and
--          nothing else.
--
-- SCOPE, STATED SO IT CAN BE HELD TO
-- ----------------------------------
-- The audit found that every blocked weakness insight is blocked by the same
-- absence: no per-item response is recorded anywhere. So this captures four
-- things per item and stops:
--
--     what they answered · whether it was right · how long they spent on it
--     · how many times they came back to it
--
-- Omission is the absence of an answer, so "what they skipped" falls out for
-- free. Delivery order is fixed by the item's ordinal, so "the order they
-- worked in" is reconstructable from first_seen_at.
--
-- AN OMISSION IS RECORDED, AND IS NOT A WEAKNESS SIGNAL. It is kept with its
-- time and visit count, because running out of time is real evidence about
-- pacing. But it does not feed the weakness pipeline: the items a student never
-- reaches are the ones at the end of the paper, and signalling them would
-- inflate whichever topic happens to sit there. See exam_submit() in
-- 20260830f, where is_correct stays NULL for an unanswered item.
--
-- DELIBERATELY NOT HERE, though each is a real exam feature:
--   * Scaled scores. A raw count is honest; a scaled score needs a conversion
--     table this platform does not have, and inventing one would put a number
--     on screen that no evidence supports. exam_practice_sessions.score is left
--     NULL by this path on purpose.
--   * Adaptive routing between Module 2 variants. The DSAT form already carries
--     'standard' and 'advanced' sections; an attempt records WHICH section was
--     sat, so routing can be added later without touching this schema.
--   * Proctoring. exam_integrity_events exists and stays where it is —
--     client-reported evidence, never proof, with no student read path.
--   * Review-your-answers, explanations, retakes, question flagging beyond the
--     visit counter. None of it produces weakness evidence.
--
-- AN ATTEMPT IS ONE SECTION SITTING
-- ---------------------------------
-- The smallest unit that yields per-item evidence, and the unit these exams are
-- actually sat in: EST Math 1 and ACT Math are one section each, so an attempt
-- is a full sitting; DSAT is module by module, which is how it is really taken.
-- Multi-module orchestration is the page's job, not the schema's.
--
-- THE ANSWER KEY NEVER REACHES THE BROWSER
-- ----------------------------------------
-- exam_questions carries correct_answer and explanation, and students hold no
-- read privilege on it at all. exam_start() is the only delivery path and it
-- selects a named column list that excludes both. Grading happens in
-- exam_submit(), server-side, where the key already lives. A client cannot set
-- is_correct because a client cannot write these tables at all.
--
-- IT FEEDS THE EXISTING PIPELINE, IT DOES NOT REPLACE IT
-- -----------------------------------------------------
-- exam_submit() writes an exam_practice_sessions row and exam_mistakes rows —
-- the same tables the frozen mock-exam flow writes — and returns the mistake
-- list in the shape ExamMistakesLogger.process() already takes. That logger
-- (frozen) then emits weakness_signals with source='MOCK_EXAM' at the weights it
-- already uses, and regenerate-reports.js (frozen) turns them into the same
-- canonical weakness_reports the student, teacher and assistant already read.
--
-- No new signal source, no second analyzer, no second authority for severity.
-- The one thing that changes is that exam_mistakes.question_id, correct_answer
-- and student_answer stop being null — they are empty in 11 of 11 rows today,
-- because the frozen flow never had them to give.
-- =====================================================================

begin;

-- ── 1 · answer matching ──────────────────────────────────────────────────
-- Immutable and separately testable, because grading is the one place where a
-- quiet mistake becomes a wrong weakness for a real student.
--   mcq     — correct_answer is a choice id ('A'..'D'); compare case-folded.
--   grid_in — a short string ('16', '1215', '43'). Compare numerically when
--             both sides parse as numbers, so '16', '16.0' and ' 16 ' agree;
--             otherwise fold case and whitespace. Nothing cleverer: a grader
--             that guesses is worse than one that marks a near-miss wrong.
create or replace function exam_answer_matches(p_format text, p_correct text, p_given text)
returns boolean
language plpgsql
immutable
parallel safe
set search_path = pg_catalog, public
as $$
declare
  a text := upper(btrim(coalesce(p_given, '')));
  b text := upper(btrim(coalesce(p_correct, '')));
  na numeric; nb numeric;
begin
  if a = '' then return false; end if;          -- omitted is never correct
  if p_format = 'mcq' then return a = b; end if;
  begin
    na := a::numeric; nb := b::numeric;
    return na = nb;
  exception when others then
    return regexp_replace(a, '\s+', '', 'g') = regexp_replace(b, '\s+', '', 'g');
  end;
end;
$$;

-- ── 2 · tables ───────────────────────────────────────────────────────────

create table exam_attempts (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  form_id           uuid not null references exam_forms(id),
  section_id        uuid not null references exam_form_sections(id),
  status            text not null default 'in_progress'
                      check (status in ('in_progress', 'submitted', 'abandoned')),
  started_at        timestamptz not null default now(),
  submitted_at      timestamptz,
  -- Frozen at start from the section, so a later edit to the section cannot
  -- change how long a sitting that already happened was allowed to be.
  duration_seconds  integer not null,
  client_request_id text not null,
  unique (user_id, section_id, client_request_id)
);

comment on table exam_attempts is
  'One sitting of one exam section by one student. The unit that carries '
  'per-item evidence. See 20260830e for why an attempt is a section rather than '
  'a whole form.';

create index exam_attempts_user_idx on exam_attempts (user_id, started_at desc);
create index exam_attempts_open_idx on exam_attempts (user_id) where status = 'in_progress';

create table exam_responses (
  id               uuid primary key default gen_random_uuid(),
  attempt_id       uuid not null references exam_attempts(id) on delete cascade,
  question_id      uuid not null references exam_questions(id),
  ordinal          integer not null,
  -- NULL is an omission, and an omission is evidence. It is never coalesced to
  -- an empty string, because "left it blank" and "typed nothing" differ.
  answer           text,
  -- Server-set, once, inside exam_submit(). NULL until then — a client that
  -- could see this before submitting would have the answer key.
  is_correct       boolean,
  ms_on_item       integer not null default 0,
  visit_count      integer not null default 0,
  first_seen_at    timestamptz,
  last_answered_at timestamptz,
  unique (attempt_id, question_id)
);

comment on table exam_responses is
  'One row per delivered item per attempt, created up-front so an untouched '
  'item is a row with answer NULL rather than a missing row. Carries what was '
  'answered, whether it was right, time on item and revisit count — the four '
  'facts docs/engineering/weakness-evidence-audit.md §5 found missing.';

create index exam_responses_attempt_idx on exam_responses (attempt_id, ordinal);
create index exam_responses_question_idx on exam_responses (question_id);

-- ── 3 · RLS — students read their own work, and write nothing ────────────
alter table exam_attempts  enable row level security;
alter table exam_responses enable row level security;

revoke all on table exam_attempts  from anon, authenticated;
revoke all on table exam_responses from anon, authenticated;
grant select on table exam_attempts  to authenticated;
grant select on table exam_responses to authenticated;

create policy exam_attempts_own_read on exam_attempts
  for select to authenticated
  using (user_id = auth.uid() or has_role_at_least('admin'::user_role));

create policy exam_responses_own_read on exam_responses
  for select to authenticated
  using (
    exists (select 1 from exam_attempts a where a.id = attempt_id and a.user_id = auth.uid())
    or has_role_at_least('admin'::user_role)
  );

commit;
