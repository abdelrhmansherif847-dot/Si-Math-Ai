-- =====================================================================
-- Teacher Exams, increment 3b.1 — six tables, their rules, their guards
-- =====================================================================
-- STATUS: 🟡 PREPARED — NOT APPLIED. Dry-run only, inside a rollback.
--
-- SCOPE. Tables, constraints and triggers. NO RPC, no function that any client
-- calls, no grant (20260901d does RLS and grants), no UI, no content. After
-- 3b the six tables exist, are governed, and are unreachable by anyone: there
-- is no write path at all until 3c ships the authoring RPCs.
--
-- WHAT THIS DELIBERATELY DOES NOT TOUCH
-- -------------------------------------
-- exam_forms, exam_form_sections, exam_questions, exam_stimuli,
-- exam_practice_sessions, exam_mistakes. Not one line. Teacher-authored
-- content never enters the platform catalogue, and never enters the analyzer.
-- tests/teacher-access-scope.test.mjs enforces that mechanically, and the
-- table names here are chosen so it keeps working: its academic list is
-- \b-anchored, so `teacher_exam_questions` does not match `\bexam_questions\b`.
--
-- The two arguments that justify the separation live HERE rather than in a
-- comment on the tables, because that ban is enforced against executable SQL
-- and a COMMENT string is executable SQL. Weakening the check to let prose
-- through would have been the wrong trade:
--
--   * exam_available_sections() is SECURITY DEFINER, granted to authenticated,
--     and returns EVERY published section with no per-student filter. A teacher
--     exam living in the platform catalogue would therefore be listed to every
--     student on the platform the moment it published. That is the mechanical
--     reason for the separation, not a stylistic one.
--   * exam_questions.topic_id is NOT NULL — that column IS the platform's
--     promise that every platform item is mapped to the taxonomy. Giving a
--     teacher item the same columns would let unmapped, uncalibrated content
--     wear the shape of measured content.
--
-- WHAT IS REUSED, AND WHY THAT IS SAFE
-- ------------------------------------
-- Five validators, all IMMUTABLE and all value-in/boolean-out, so sharing them
-- creates no coupling between the two content systems — only agreement about
-- what a valid chart or a valid answer is:
--   exam_stimulus_shape_ok()   the three-shape rule (extracted in 20260901a
--                              precisely so a second table could share it)
--   exam_stimulus_spec_ok()    per-kind spec validation
--   exam_question_choices_ok() / exam_question_answer_ok()
-- exam_answer_matches() is NOT referenced here: grading happens at submit,
-- which is 3e. Reusing it in 3b would be reuse for its own sake.
-- =====================================================================

begin;

-- ── 1 · the paper ─────────────────────────────────────────────────────
create table teacher_exams (
  id                 uuid primary key default gen_random_uuid(),
  workspace_id       uuid not null references teacher_workspaces(id) on delete cascade,
  title              text not null,
  instructions       text,
  exam_code          text not null unique,
  status             text not null default 'draft',
  duration_minutes   integer not null,
  calculator_allowed boolean not null default true,
  opens_at           timestamptz,
  closes_at          timestamptz,
  created_by         uuid not null references auth.users(id),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  published_at       timestamptz,
  closed_at          timestamptz,

  constraint teacher_exams_title_check
    check (length(btrim(title)) between 2 and 200),
  constraint teacher_exams_instructions_check
    check (instructions is null or char_length(instructions) <= 4000),
  constraint teacher_exams_status_check
    check (status in ('draft', 'published', 'closed')),
  -- The same 32-symbol alphabet the class codes use, with the ambiguous glyphs
  -- gone: read aloud in a room and typed on a phone. Enforced HERE so that a
  -- generator producing anything else is refused by the database, not trusted.
  constraint teacher_exams_code_check
    check (exam_code ~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$'),
  constraint teacher_exams_duration_check
    check (duration_minutes between 1 and 600),
  constraint teacher_exams_window_check
    check (opens_at is null or closes_at is null or closes_at > opens_at),
  -- A draft has never been published; anything past draft has been.
  constraint teacher_exams_published_stamp_check
    check ((status = 'draft') = (published_at is null)),
  constraint teacher_exams_closed_stamp_check
    check ((status = 'closed') = (closed_at is not null))
);

comment on table teacher_exams is
  'A teacher-authored paper, owned by a WORKSPACE and not by a person, so that '
  'staff coming and going never orphans or deletes an exam. It is deliberately '
  'not part of the platform exam catalogue; the migration header records the '
  'measured reason.';

comment on column teacher_exams.exam_code is
  'Per-exam access code. It grants NOTHING on its own — entering it raises a '
  'request in teacher_exam_access that staff must approve. Rotating it stops '
  'future code-based requests and revokes nothing.';

-- ── 2 · stimuli ───────────────────────────────────────────────────────
create table teacher_exam_stimuli (
  id           uuid primary key default gen_random_uuid(),
  exam_id      uuid not null references teacher_exams(id) on delete cascade,
  kind         text not null,
  label        text,
  body         text,
  spec         jsonb,
  media_ref    text,
  media_kind   text,
  media_sha256 text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint teacher_exam_stimuli_kind_check
    check (kind in ('text', 'table', 'chart', 'plot', 'number_line', 'figure')),
  constraint teacher_exam_stimuli_label_check
    check (label is null or char_length(label) between 1 and 200),
  constraint teacher_exam_stimuli_body_check
    check (body is null or char_length(body) between 1 and 8000),
  constraint teacher_exam_stimuli_shape_check
    check (exam_stimulus_shape_ok(kind, body, spec, media_ref)),
  constraint teacher_exam_stimuli_spec_check
    check (spec is null or exam_stimulus_spec_ok(kind, spec)),
  constraint teacher_exam_stimuli_media_kind_check
    check (media_kind is null or media_kind = 'svg'),
  constraint teacher_exam_stimuli_media_check
    check (media_ref is null or (media_kind = 'svg' and media_sha256 is not null)),
  constraint teacher_exam_stimuli_sha_check
    check (media_sha256 is null or media_sha256 ~ '^[0-9a-f]{64}$'),
  -- TWO CONSTRAINTS THE PLATFORM TABLE DOES NOT HAVE, because platform content
  -- is curated and teacher content is not. The renderer already refuses to
  -- inline a figure — it emits <img src="data:image/svg+xml;base64,...">, and
  -- an SVG loaded through <img> cannot run script or reach the page. These two
  -- close what is left: unbounded size, and bytes that are not base64 at all.
  constraint teacher_exam_stimuli_media_size_check
    check (media_ref is null or char_length(media_ref) <= 262144),
  constraint teacher_exam_stimuli_media_b64_check
    check (media_ref is null or media_ref ~ '^[A-Za-z0-9+/]+={0,2}$')
);

-- media_reason is deliberately absent. On the platform table it is a 10-500
-- character justification for choosing a figure over a spec — a content-review
-- control. There is no reviewer for a teacher's own paper, so requiring it
-- would be friction with no reader.

create index teacher_exam_stimuli_exam_idx on teacher_exam_stimuli (exam_id);

-- ── 3 · questions ─────────────────────────────────────────────────────
create table teacher_exam_questions (
  id              uuid primary key default gen_random_uuid(),
  exam_id         uuid not null references teacher_exams(id) on delete cascade,
  ordinal         integer not null,
  prompt          text not null,
  question_format text not null,
  choices         jsonb,
  correct_answer  text not null,
  explanation     text,
  stimulus_id     uuid references teacher_exam_stimuli(id) on delete restrict,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint teacher_exam_questions_slot_uq unique (exam_id, ordinal),
  constraint teacher_exam_questions_ordinal_check check (ordinal > 0),
  constraint teacher_exam_questions_prompt_check
    check (char_length(prompt) between 1 and 8000),
  constraint teacher_exam_questions_format_check
    check (question_format in ('mcq', 'grid_in')),
  constraint teacher_exam_questions_choices_check
    check (exam_question_choices_ok(question_format, choices)),
  constraint teacher_exam_questions_answer_check
    check (exam_question_answer_ok(question_format, choices, correct_answer)),
  constraint teacher_exam_questions_explanation_check
    check (explanation is null or char_length(explanation) <= 8000)
);

comment on table teacher_exam_questions is
  'A teacher-authored item. It carries NO difficulty, topic_id, subtopic_id, '
  'skill, content_origin or originality attestation. Their absence is the '
  'design rather than an omission: a teacher item has neither a reviewed '
  'taxonomy mapping nor a measured difficulty, so it is given no column in '
  'which to pretend otherwise. That is what makes it structurally impossible '
  'for this content to reach the analyzer looking like measured evidence.';

create index teacher_exam_questions_exam_idx on teacher_exam_questions (exam_id, ordinal);

-- ── 4 · access ────────────────────────────────────────────────────────
create table teacher_exam_access (
  exam_id               uuid not null references teacher_exams(id) on delete cascade,
  student_id            uuid not null references auth.users(id) on delete cascade,
  state                 text not null default 'pending',
  was_member_at_request boolean not null,
  requested_at          timestamptz not null default now(),
  decided_at            timestamptz,
  decided_by            uuid references auth.users(id),

  -- THE RULE IS THE KEY. One row per student per exam, ever: a decided request
  -- is not the student's to reopen, and this is a constraint rather than code.
  constraint teacher_exam_access_pkey primary key (exam_id, student_id),
  constraint teacher_exam_access_state_check
    check (state in ('pending', 'approved', 'rejected', 'revoked')),
  constraint teacher_exam_access_decided_check
    check ((state = 'pending') = (decided_at is null)),
  constraint teacher_exam_access_decider_check
    check ((decided_at is null) = (decided_by is null))
);

comment on column teacher_exam_access.was_member_at_request is
  'Frozen at request time, and NOT recomputed. A student who joins the class '
  'after requesting would otherwise retroactively look like a member and erase '
  'the leak signal the queue exists to show. The live membership check is a '
  'separate question, asked again at every start.';

-- Supports the rate limit 3d will impose: five pending requests per student
-- per hour, counted across all exams, checked BEFORE any code lookup so the
-- refusal can never confirm that a code was real.
create index teacher_exam_access_student_recent_idx
  on teacher_exam_access (student_id, requested_at desc);

-- ── 5 · attempts ──────────────────────────────────────────────────────
create table teacher_exam_attempts (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  exam_id           uuid not null references teacher_exams(id) on delete cascade,
  status            text not null default 'in_progress',
  started_at        timestamptz not null default now(),
  submitted_at      timestamptz,
  duration_seconds  integer not null,
  client_request_id text not null,

  constraint teacher_exam_attempts_idem_uq unique (user_id, exam_id, client_request_id),
  constraint teacher_exam_attempts_status_check
    check (status in ('in_progress', 'submitted', 'abandoned')),
  constraint teacher_exam_attempts_submitted_check
    check ((status = 'submitted') = (submitted_at is not null)),
  constraint teacher_exam_attempts_duration_check check (duration_seconds > 0),
  constraint teacher_exam_attempts_request_check
    check (char_length(btrim(client_request_id)) between 1 and 120)
);

-- Locked decision 1: one attempt per student per exam in V1, no retakes. A
-- partial index rather than a plain unique, so an abandoned attempt does not
-- lock a student out of the exam forever.
create unique index teacher_exam_attempts_one_per_student
  on teacher_exam_attempts (user_id, exam_id) where status <> 'abandoned';

-- ── 6 · responses ─────────────────────────────────────────────────────
create table teacher_exam_responses (
  id               uuid primary key default gen_random_uuid(),
  attempt_id       uuid not null references teacher_exam_attempts(id) on delete cascade,
  question_id      uuid not null references teacher_exam_questions(id) on delete restrict,
  ordinal          integer not null,
  answer           text,
  is_correct       boolean,
  ms_on_item       integer not null default 0,
  visit_count      integer not null default 0,
  first_seen_at    timestamptz,
  last_answered_at timestamptz,

  constraint teacher_exam_responses_slot_uq unique (attempt_id, question_id),
  constraint teacher_exam_responses_ordinal_check check (ordinal > 0),
  constraint teacher_exam_responses_ms_check check (ms_on_item >= 0),
  constraint teacher_exam_responses_visits_check check (visit_count >= 0),
  constraint teacher_exam_responses_answer_check
    check (answer is null or char_length(answer) <= 500),
  -- THE THREE-VALUED RULE, MADE STRUCTURAL. is_correct is true / false / NULL,
  -- and NULL means "not answered" — never "wrong". An unanswered item cannot be
  -- graded at all, so no future writer can collapse a pacing problem into a
  -- topic weakness by accident.
  constraint teacher_exam_responses_omission_check
    check (answer is not null or is_correct is null)
);

-- ── 7 · guards ────────────────────────────────────────────────────────
-- A constraint polices one row's values. A guard polices a TRANSITION, which
-- is where every rule in this increment actually lives. All six are BEFORE
-- triggers, and all of them fail closed.

-- 7.1 · the exam's own life: draft -> published -> closed, one way, no deletes
--       once it has been published.
create or replace function teacher_exams_guard()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $fn$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception
        'teacher_exams: exam % is % — a published paper is a record, close it rather than delete it',
        old.exam_code, old.status using errcode = '42501';
    end if;
    return old;
  end if;

  if new.id is distinct from old.id
     or new.workspace_id is distinct from old.workspace_id
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception 'teacher_exams: id, workspace, author and creation time are immutable'
      using errcode = '22000';
  end if;

  -- A closed exam is final in every respect. Reopening one would make the
  -- window meaningless, and there is no way to tell a re-opened sitting from
  -- an original afterwards.
  if old.status = 'closed' then
    raise exception 'teacher_exams: exam % is closed and cannot change', old.exam_code
      using errcode = '42501';
  end if;

  if new.status is distinct from old.status then
    if old.status = 'draft' and new.status = 'published' then
      new.published_at := coalesce(new.published_at, now());
    elsif old.status = 'published' and new.status = 'closed' then
      new.closed_at := coalesce(new.closed_at, now());
    else
      raise exception
        'teacher_exams: % -> % is not a legal transition (draft -> published -> closed, one way)',
        old.status, new.status using errcode = '22000';
    end if;
  end if;

  -- Once published the PAPER is frozen. Exactly two things stay mutable, and
  -- both are deliberate: the code, because rotation is the answer to a leak,
  -- and the closing time, because a teacher may extend or end the window.
  if old.status = 'published' then
    if new.title is distinct from old.title
       or new.instructions is distinct from old.instructions
       or new.duration_minutes is distinct from old.duration_minutes
       or new.calculator_allowed is distinct from old.calculator_allowed
       or new.opens_at is distinct from old.opens_at
       or new.published_at is distinct from old.published_at then
      raise exception 'teacher_exams: exam % is published and its paper is immutable', old.exam_code
        using errcode = '42501';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$fn$;

create trigger teacher_exams_guard_trg
  before update or delete on teacher_exams
  for each row execute function teacher_exams_guard();

-- 7.2 · content follows the exam. Shared by stimuli and questions, and it also
--       carries updated_at, so there is one place that decides whether content
--       may change at all.
create or replace function teacher_exam_content_guard()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $fn$
declare
  v_exam_id uuid;
  v_status  text;
  v_code    text;
begin
  if tg_op = 'UPDATE' and new.exam_id is distinct from old.exam_id then
    raise exception '%: an item belongs to its exam and cannot be moved', tg_table_name
      using errcode = '22000';
  end if;

  v_exam_id := coalesce(new.exam_id, old.exam_id);
  select status, exam_code into v_status, v_code from teacher_exams where id = v_exam_id;

  -- FAIL CLOSED. If the parent cannot be read the answer is no, never silence:
  -- a NULL status compared with <> would be NULL, which is not true, and the
  -- guard would wave the write through. That is the failure mode this line
  -- exists to prevent, and it is why the function is SECURITY DEFINER as well.
  if v_status is null or v_status <> 'draft' then
    raise exception '%: exam % is % and its content is immutable',
      tg_table_name, coalesce(v_code, '(unreadable)'), coalesce(v_status, '(unknown)')
      using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  new.updated_at := now();
  return new;
end;
$fn$;

create trigger teacher_exam_stimuli_content_trg
  before insert or update or delete on teacher_exam_stimuli
  for each row execute function teacher_exam_content_guard();

create trigger teacher_exam_questions_content_trg
  before insert or update or delete on teacher_exam_questions
  for each row execute function teacher_exam_content_guard();

-- 7.3 · a stimulus is shared WITHIN one exam, never across two. This is the
--       mechanism behind "several questions, one figure" — and its bound.
create or replace function teacher_exam_stimulus_same_exam()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $fn$
declare v_stimulus_exam uuid;
begin
  if new.stimulus_id is null then return new; end if;
  select exam_id into v_stimulus_exam from teacher_exam_stimuli where id = new.stimulus_id;
  -- NULL (missing or unreadable) is distinct from any exam id, so this also
  -- fails closed.
  if v_stimulus_exam is distinct from new.exam_id then
    raise exception 'teacher_exam_questions: stimulus % belongs to a different exam than this question',
      new.stimulus_id using errcode = '23503';
  end if;
  return new;
end;
$fn$;

create trigger teacher_exam_questions_stimulus_trg
  before insert or update on teacher_exam_questions
  for each row execute function teacher_exam_stimulus_same_exam();

-- 7.4 · an access decision is a record: never deleted, never reopened by the
--       student, and the REQUEST half never rewritten.
create or replace function teacher_exam_access_guard()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $fn$
begin
  if tg_op = 'DELETE' then
    raise exception 'teacher_exam_access: an access decision is a record and is never deleted'
      using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    if new.state <> 'pending' then
      raise exception 'teacher_exam_access: a request is born pending or not at all'
        using errcode = '22000';
    end if;
    return new;
  end if;

  if new.exam_id is distinct from old.exam_id
     or new.student_id is distinct from old.student_id
     or new.requested_at is distinct from old.requested_at
     or new.was_member_at_request is distinct from old.was_member_at_request then
    raise exception 'teacher_exam_access: the request is immutable; only the decision may change'
      using errcode = '22000';
  end if;

  if new.state = 'pending' and old.state <> 'pending' then
    raise exception 'teacher_exam_access: a decided request cannot return to pending'
      using errcode = '22000';
  end if;

  -- Stamping the time here, and NOT the decider, is deliberate: the CHECK
  -- requires both or neither, so a caller that forgets to name who decided is
  -- refused instead of writing an unattributable decision.
  if new.state is distinct from old.state then
    new.decided_at := now();
  end if;
  return new;
end;
$fn$;

create trigger teacher_exam_access_guard_trg
  before insert or update or delete on teacher_exam_access
  for each row execute function teacher_exam_access_guard();

-- 7.5 · a sitting, once started, is a record of what happened.
create or replace function teacher_exam_attempts_guard()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $fn$
begin
  if tg_op = 'DELETE' then
    raise exception 'teacher_exam_attempts: a sitting is a record and is never deleted'
      using errcode = '42501';
  end if;
  if new.id is distinct from old.id
     or new.user_id is distinct from old.user_id
     or new.exam_id is distinct from old.exam_id
     or new.started_at is distinct from old.started_at
     or new.duration_seconds is distinct from old.duration_seconds
     or new.client_request_id is distinct from old.client_request_id then
    raise exception 'teacher_exam_attempts: whose sitting, of what, for how long, from when — all immutable'
      using errcode = '22000';
  end if;
  if old.status <> 'in_progress' and new.status is distinct from old.status then
    raise exception 'teacher_exam_attempts: this sitting is already %', old.status
      using errcode = '22000';
  end if;
  return new;
end;
$fn$;

create trigger teacher_exam_attempts_guard_trg
  before update or delete on teacher_exam_attempts
  for each row execute function teacher_exam_attempts_guard();

-- 7.6 · an answer belongs to one item of one sitting, and is graded once.
create or replace function teacher_exam_responses_guard()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $fn$
declare v_status text;
begin
  if tg_op = 'DELETE' then
    raise exception 'teacher_exam_responses: an answer is a record and is never deleted'
      using errcode = '42501';
  end if;
  if new.attempt_id is distinct from old.attempt_id
     or new.question_id is distinct from old.question_id
     or new.ordinal is distinct from old.ordinal then
    raise exception 'teacher_exam_responses: which item of which sitting is immutable'
      using errcode = '22000';
  end if;

  -- Graded once, and never re-graded: once is_correct holds a verdict, no
  -- later code path can quietly rewrite it.
  if old.is_correct is not null and new.is_correct is distinct from old.is_correct then
    raise exception 'teacher_exam_responses: this item is already graded'
      using errcode = '42501';
  end if;

  -- A submitted paper cannot be edited. 3e must therefore grade BEFORE it
  -- flips the attempt to submitted — the same order exam_submit() already
  -- uses. Fails closed on an unreadable parent.
  if new.answer is distinct from old.answer then
    select status into v_status from teacher_exam_attempts where id = new.attempt_id;
    if v_status is null or v_status <> 'in_progress' then
      raise exception 'teacher_exam_responses: this sitting is % and its answers are final',
        coalesce(v_status, '(unknown)') using errcode = '42501';
    end if;
  end if;
  return new;
end;
$fn$;

create trigger teacher_exam_responses_guard_trg
  before update or delete on teacher_exam_responses
  for each row execute function teacher_exam_responses_guard();

-- 7.7 · privilege hygiene for the six functions above.
-- The DEFAULT ACL on a function in `public` grants EXECUTE to anon and
-- authenticated, so a bare CREATE FUNCTION is callable by anyone signed in.
-- That trap has bitten this repo before (see 20260830b's header, and the
-- referral engine's 20260831f). A trigger function is no exception, and it
-- needs no grant to work: measured on this database, revoking EXECUTE from
-- every client role does NOT stop the trigger firing, because PostgreSQL does
-- not check EXECUTE when a trigger fires. So they are revoked and granted back
-- to nobody.
revoke all on function teacher_exams_guard()             from public, anon, authenticated;
revoke all on function teacher_exam_content_guard()      from public, anon, authenticated;
revoke all on function teacher_exam_stimulus_same_exam() from public, anon, authenticated;
revoke all on function teacher_exam_access_guard()       from public, anon, authenticated;
revoke all on function teacher_exam_attempts_guard()     from public, anon, authenticated;
revoke all on function teacher_exam_responses_guard()    from public, anon, authenticated;

commit;
