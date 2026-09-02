-- =====================================================================
-- Teacher Homework, increment H2.1 — five tables, their rules, their guards
-- =====================================================================
-- STATUS: 🟡 PREPARED, not applied. Apply only with explicit owner approval
--         (CLAUDE.md §3). Rollback: 20260902y (a clean undo, unlike 20260902z).
-- DEPENDS ON: 20260830a (teacher_workspaces), 20260901a (exam_stimulus_shape_ok),
--             20260902a (the five homework audit labels — H2 writes none of them)
-- CONTEXT: docs/roadmap/teacher-intelligence-layer.md §15.14 (homework keeps its
--          own model: code → immediate unlock, no approval) and §15.15 (the six
--          decisions locked 2026-09-02, mirrored column by column below).
--
-- SCOPE. Tables, constraints and triggers. NO RPC, no function that any client
-- calls, no grant (20260902c does RLS and grants), no UI, no content, no audit
-- row. After H2 the five tables exist, are governed, and are unreachable by
-- anyone: there is no write path at all until H3 ships the authoring RPCs.
--
-- Exactly the five tables the approved H2 scope names. A per-item ANSWER
-- record — the homework twin of teacher_exam_responses — is required before
-- H5 can save or grade anything, and it is deliberately outside this
-- increment: it is to be prepared, reviewed and approved as its own step, not
-- carried in here. Nothing in this file assumes its shape.
--
-- WHAT THIS DELIBERATELY DOES NOT TOUCH
-- -------------------------------------
-- teacher_exams and its five companions: not one line, and none of their
-- tables, guards or predicates is referenced. Homework is a SEPARATE system
-- (§15.15): a different lifecycle (untimed, resumable over days, one
-- submission, late allowed), a different access model (no approval queue), a
-- different feedback model (per-item, explanation, answers only when the
-- teacher reveals them). Sharing rows or predicates would make each system's
-- rule the other's accident. Also untouched, as in 3b: exam_forms,
-- exam_form_sections, exam_questions, exam_stimuli, exam_practice_sessions,
-- exam_mistakes, weakness_signals — teacher content never enters the platform
-- catalogue and never enters the analyzer (decision 2).
--
-- WHAT IS REUSED, AND WHY THAT IS SAFE
-- ------------------------------------
-- Four validators, all IMMUTABLE and all value-in/boolean-out, so sharing them
-- creates no coupling — only agreement about what a valid figure or a valid
-- answer is: exam_stimulus_shape_ok(), exam_stimulus_spec_ok(),
-- exam_question_choices_ok(), exam_question_answer_ok(). The audit established
-- these as safe by call; nothing else is borrowed.
--
-- WHAT IS DIFFERENT FROM 3b, COLUMN BY COLUMN, AND WHICH DECISION SAYS SO
-- -----------------------------------------------------------------------
--   no duration_minutes, no calculator_allowed, no opens_at / closes_at
--       homework is untimed practice; publishing opens it. (§15.15, audit)
--   due_at, nullable
--       a date, never a lock: a submission after it is accepted and flagged
--       late, never refused. (decision 3)
--   reveal_answers, NOT NULL default false
--       per-item correctness and the teacher's explanation are shown after
--       submission; the correct-answer TEXT only when this is true. (decision 1)
--   teacher_homework_access has NO state and NO was_member column
--       there is no queue: entering the code attaches an ACTIVE member at
--       once, and the row records that and nothing more. Access itself is
--       live membership, re-asked at every open — never this row. (§15.14)
--   teacher_homework_attempts: UNIQUE (homework_id, user_id), no client
--   request id, no duration, no 'abandoned', a `late` flag
--       one attempt per student per homework, ever, resumable across
--       sessions; the unique pair IS the idempotency; nothing times out, so
--       nothing is abandoned. (decisions 3, 4)
-- =====================================================================

begin;

-- ── 1 · the paper ─────────────────────────────────────────────────────
create table teacher_homework (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references teacher_workspaces(id) on delete cascade,
  title          text not null,
  instructions   text,
  homework_code  text not null unique,
  status         text not null default 'draft',
  due_at         timestamptz,
  reveal_answers boolean not null default false,
  created_by     uuid not null references auth.users(id),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  published_at   timestamptz,
  closed_at      timestamptz,

  constraint teacher_homework_title_check
    check (length(btrim(title)) between 2 and 200),
  constraint teacher_homework_instructions_check
    check (instructions is null or char_length(instructions) <= 4000),
  constraint teacher_homework_status_check
    check (status in ('draft', 'published', 'closed')),
  -- The same 32-symbol alphabet the class and exam codes use, with the
  -- ambiguous glyphs gone. Enforced HERE so that a generator producing
  -- anything else is refused by the database, not trusted. Homework codes
  -- live in their own space: a code typed into the wrong box gets that box's
  -- one indistinguishable message.
  constraint teacher_homework_code_check
    check (homework_code ~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$'),
  -- A draft has never been published; anything past draft has been.
  constraint teacher_homework_published_stamp_check
    check ((status = 'draft') = (published_at is null)),
  constraint teacher_homework_closed_stamp_check
    check ((status = 'closed') = (closed_at is not null))
);

comment on table teacher_homework is
  'A teacher-authored homework, owned by a WORKSPACE and not by a person, so '
  'that staff coming and going never orphans or deletes it. Separate from '
  'teacher_exams by decision (§15.15): untimed, resumable, one submission, '
  'late allowed, no approval queue, per-item feedback. Never part of the '
  'platform catalogue and never analyzer evidence.';

comment on column teacher_homework.homework_code is
  'Per-homework code. Entering it ATTACHES the homework to an ACTIVE class '
  'member at once (teacher_homework_access); it grants nothing to anyone else '
  'and there is no approval. Rotating it stops future attachments and detaches '
  'nobody.';

comment on column teacher_homework.due_at is
  'A date, never a lock (decision 3). A submission after it is accepted and '
  'flagged late on the attempt; nothing is refused for being late.';

comment on column teacher_homework.reveal_answers is
  'Decision 1. After submission a student sees per-item correctness and the '
  'teacher''s explanation regardless; the correct-answer TEXT is shown only '
  'while this is true. Default false; the teacher may turn it on later.';

-- ── 2 · stimuli ───────────────────────────────────────────────────────
create table teacher_homework_stimuli (
  id           uuid primary key default gen_random_uuid(),
  homework_id  uuid not null references teacher_homework(id) on delete cascade,
  kind         text not null,
  label        text,
  body         text,
  spec         jsonb,
  media_ref    text,
  media_kind   text,
  media_sha256 text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint teacher_homework_stimuli_kind_check
    check (kind in ('text', 'table', 'chart', 'plot', 'number_line', 'figure')),
  constraint teacher_homework_stimuli_label_check
    check (label is null or char_length(label) between 1 and 200),
  constraint teacher_homework_stimuli_body_check
    check (body is null or char_length(body) between 1 and 8000),
  constraint teacher_homework_stimuli_shape_check
    check (exam_stimulus_shape_ok(kind, body, spec, media_ref)),
  constraint teacher_homework_stimuli_spec_check
    check (spec is null or exam_stimulus_spec_ok(kind, spec)),
  constraint teacher_homework_stimuli_media_kind_check
    check (media_kind is null or media_kind = 'svg'),
  constraint teacher_homework_stimuli_media_check
    check (media_ref is null or (media_kind = 'svg' and media_sha256 is not null)),
  constraint teacher_homework_stimuli_sha_check
    check (media_sha256 is null or media_sha256 ~ '^[0-9a-f]{64}$'),
  -- The two bounds 3b added for uncurated content: size, and bytes that are
  -- base64 at all. The renderer already refuses to inline a figure.
  constraint teacher_homework_stimuli_media_size_check
    check (media_ref is null or char_length(media_ref) <= 262144),
  constraint teacher_homework_stimuli_media_b64_check
    check (media_ref is null or media_ref ~ '^[A-Za-z0-9+/]+={0,2}$')
);

-- media_reason is deliberately absent, for the reason 3b recorded: there is no
-- reviewer for a teacher's own paper.

create index teacher_homework_stimuli_homework_idx on teacher_homework_stimuli (homework_id);

-- ── 3 · questions ─────────────────────────────────────────────────────
create table teacher_homework_questions (
  id              uuid primary key default gen_random_uuid(),
  homework_id     uuid not null references teacher_homework(id) on delete cascade,
  ordinal         integer not null,
  prompt          text not null,
  question_format text not null,
  choices         jsonb,
  correct_answer  text not null,
  explanation     text,
  stimulus_id     uuid references teacher_homework_stimuli(id) on delete restrict,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint teacher_homework_questions_slot_uq unique (homework_id, ordinal),
  constraint teacher_homework_questions_ordinal_check check (ordinal > 0),
  constraint teacher_homework_questions_prompt_check
    check (char_length(prompt) between 1 and 8000),
  constraint teacher_homework_questions_format_check
    check (question_format in ('mcq', 'grid_in')),
  constraint teacher_homework_questions_choices_check
    check (exam_question_choices_ok(question_format, choices)),
  constraint teacher_homework_questions_answer_check
    check (exam_question_answer_ok(question_format, choices, correct_answer)),
  constraint teacher_homework_questions_explanation_check
    check (explanation is null or char_length(explanation) <= 8000)
);

comment on table teacher_homework_questions is
  'A teacher-authored homework item. It carries NO difficulty, topic_id, '
  'subtopic_id, skill, content_origin or originality attestation — the design, '
  'not an omission, exactly as for teacher_exam_questions: an unmapped, '
  'uncalibrated item is given no column in which to pretend otherwise, which '
  'is what keeps it structurally out of the analyzer (decision 2). The '
  'explanation is part of the feedback a student receives after submitting '
  '(decision 1); the correct answer is not, unless the teacher reveals it.';

create index teacher_homework_questions_homework_idx on teacher_homework_questions (homework_id, ordinal);

-- ── 4 · access: the attachment ────────────────────────────────────────
create table teacher_homework_access (
  homework_id uuid not null references teacher_homework(id) on delete cascade,
  student_id  uuid not null references auth.users(id) on delete cascade,
  attached_at timestamptz not null default now(),

  -- One row per student per homework, ever: entering the code twice changes
  -- nothing. A constraint rather than code.
  constraint teacher_homework_access_pkey primary key (homework_id, student_id)
);

comment on table teacher_homework_access is
  'A student entered this homework''s code while an ACTIVE member of its '
  'class, and that is all this row says. There is no state column and no '
  'decision: §15.14 gives homework no approval queue. Whether the student may '
  'OPEN it is never read from here — it is live membership, an active '
  'workspace and a published paper, asked again at every open, exactly as '
  'teacher_exam_can_start() asks. A non-member is refused the code outright '
  '(H4), so every row here was a member at attachment by construction.';

-- Supports the rate limit H4 will impose: attachments per student per hour,
-- counted across all homework, checked BEFORE any code lookup so the refusal
-- can never confirm that a code was real. It counts rows, not guesses, as
-- 20260901f records for the exam limit.
create index teacher_homework_access_student_recent_idx
  on teacher_homework_access (student_id, attached_at desc);

-- ── 5 · attempts ──────────────────────────────────────────────────────
create table teacher_homework_attempts (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  homework_id  uuid not null references teacher_homework(id) on delete cascade,
  status       text not null default 'in_progress',
  started_at   timestamptz not null default now(),
  submitted_at timestamptz,
  late         boolean not null default false,

  -- One attempt per student per homework, EVER, and resumable across
  -- sessions: a refresh, a second device, a week later all find this row.
  -- The pair is the idempotency, so no client request id is needed.
  constraint teacher_homework_attempts_one_per_student unique (homework_id, user_id),
  constraint teacher_homework_attempts_status_check
    check (status in ('in_progress', 'submitted')),
  constraint teacher_homework_attempts_submitted_check
    check ((status = 'submitted') = (submitted_at is not null)),
  -- late is a fact about a SUBMISSION: it cannot be true of work in progress.
  constraint teacher_homework_attempts_late_check
    check ((not late) or status = 'submitted')
);

comment on column teacher_homework_attempts.late is
  'Decision 3: set at submission when submitted_at is after the homework''s '
  'due_at. A flag on the record, never a refusal.';

-- ── 6 · guards ────────────────────────────────────────────────────────
-- A constraint polices one row's values. A guard polices a TRANSITION. All
-- five are BEFORE triggers, and all of them fail closed.

-- 6.1 · the homework's own life: draft -> published -> closed, one way, no
--       deletes once published. Once published, the PAPER is frozen: title,
--       instructions and published_at cannot change. Exactly three things stay
--       mutable, each for a stated reason: the code (rotation answers a leak),
--       due_at (a teacher may extend or bring forward), and reveal_answers
--       (decision 1 — turning answers on after everyone has submitted is the
--       normal use, not an edit to the paper).
create or replace function teacher_homework_guard()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $fn$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception
        'teacher_homework: homework % is % — a published paper is a record, close it rather than delete it',
        old.homework_code, old.status using errcode = '42501';
    end if;
    return old;
  end if;

  if new.id is distinct from old.id
     or new.workspace_id is distinct from old.workspace_id
     or new.created_by is distinct from old.created_by
     or new.created_at is distinct from old.created_at then
    raise exception 'teacher_homework: id, workspace, author and creation time are immutable'
      using errcode = '22000';
  end if;

  -- A closed homework is final in every respect.
  if old.status = 'closed' then
    raise exception 'teacher_homework: homework % is closed and cannot change', old.homework_code
      using errcode = '42501';
  end if;

  if new.status is distinct from old.status then
    if old.status = 'draft' and new.status = 'published' then
      new.published_at := coalesce(new.published_at, now());
    elsif old.status = 'published' and new.status = 'closed' then
      new.closed_at := coalesce(new.closed_at, now());
    else
      raise exception
        'teacher_homework: % -> % is not a legal transition (draft -> published -> closed, one way)',
        old.status, new.status using errcode = '22000';
    end if;
  end if;

  if old.status = 'published' then
    if new.title is distinct from old.title
       or new.instructions is distinct from old.instructions
       or new.published_at is distinct from old.published_at then
      raise exception 'teacher_homework: homework % is published and its paper is immutable', old.homework_code
        using errcode = '42501';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$fn$;

create trigger teacher_homework_guard_trg
  before update or delete on teacher_homework
  for each row execute function teacher_homework_guard();

-- 6.2 · content follows the homework. Shared by stimuli and questions.
create or replace function teacher_homework_content_guard()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $fn$
declare
  v_homework_id uuid;
  v_status      text;
  v_code        text;
begin
  if tg_op = 'UPDATE' and new.homework_id is distinct from old.homework_id then
    raise exception '%: an item belongs to its homework and cannot be moved', tg_table_name
      using errcode = '22000';
  end if;

  v_homework_id := coalesce(new.homework_id, old.homework_id);
  select status, homework_code into v_status, v_code from teacher_homework where id = v_homework_id;

  -- FAIL CLOSED. If the parent cannot be read the answer is no, never silence:
  -- a NULL status compared with <> would be NULL, which is not true, and the
  -- guard would wave the write through. SECURITY DEFINER for the same reason.
  if v_status is null or v_status <> 'draft' then
    raise exception '%: homework % is % and its content is immutable',
      tg_table_name, coalesce(v_code, '(unreadable)'), coalesce(v_status, '(unknown)')
      using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  new.updated_at := now();
  return new;
end;
$fn$;

create trigger teacher_homework_stimuli_content_trg
  before insert or update or delete on teacher_homework_stimuli
  for each row execute function teacher_homework_content_guard();

create trigger teacher_homework_questions_content_trg
  before insert or update or delete on teacher_homework_questions
  for each row execute function teacher_homework_content_guard();

-- 6.3 · a stimulus is shared WITHIN one homework, never across two.
create or replace function teacher_homework_stimulus_same_homework()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $fn$
declare v_stimulus_homework uuid;
begin
  if new.stimulus_id is null then return new; end if;
  select homework_id into v_stimulus_homework from teacher_homework_stimuli where id = new.stimulus_id;
  -- NULL (missing or unreadable) is distinct from any id, so this fails closed.
  if v_stimulus_homework is distinct from new.homework_id then
    raise exception 'teacher_homework_questions: stimulus % belongs to a different homework than this question',
      new.stimulus_id using errcode = '23503';
  end if;
  return new;
end;
$fn$;

create trigger teacher_homework_questions_stimulus_trg
  before insert or update on teacher_homework_questions
  for each row execute function teacher_homework_stimulus_same_homework();

-- 6.4 · an attachment is a record: written once, never changed, never deleted.
--       Access is live membership, not this row, so there is nothing here that
--       a revocation would need to edit (§15.14).
create or replace function teacher_homework_access_guard()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $fn$
begin
  if tg_op = 'DELETE' then
    raise exception 'teacher_homework_access: an attachment is a record and is never deleted'
      using errcode = '42501';
  end if;
  raise exception 'teacher_homework_access: an attachment is written once and never changed'
    using errcode = '22000';
end;
$fn$;

create trigger teacher_homework_access_guard_trg
  before update or delete on teacher_homework_access
  for each row execute function teacher_homework_access_guard();

-- 6.5 · an attempt, once opened, is a record of what happened; once
--       submitted, nothing about it changes.
create or replace function teacher_homework_attempts_guard()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $fn$
begin
  if tg_op = 'DELETE' then
    raise exception 'teacher_homework_attempts: an attempt is a record and is never deleted'
      using errcode = '42501';
  end if;
  if new.id is distinct from old.id
     or new.user_id is distinct from old.user_id
     or new.homework_id is distinct from old.homework_id
     or new.started_at is distinct from old.started_at then
    raise exception 'teacher_homework_attempts: whose attempt, of what, from when — all immutable'
      using errcode = '22000';
  end if;
  if old.status <> 'in_progress' then
    raise exception 'teacher_homework_attempts: this attempt is already % and is final', old.status
      using errcode = '22000';
  end if;
  return new;
end;
$fn$;

create trigger teacher_homework_attempts_guard_trg
  before update or delete on teacher_homework_attempts
  for each row execute function teacher_homework_attempts_guard();

-- 6.6 · privilege hygiene. The DEFAULT ACL on a function in `public` grants
-- EXECUTE to anon and authenticated; a trigger function needs no grant to
-- fire (measured in 3b), so all five are revoked and granted back to nobody.
revoke all on function teacher_homework_guard()                  from public, anon, authenticated;
revoke all on function teacher_homework_content_guard()          from public, anon, authenticated;
revoke all on function teacher_homework_stimulus_same_homework() from public, anon, authenticated;
revoke all on function teacher_homework_access_guard()           from public, anon, authenticated;
revoke all on function teacher_homework_attempts_guard()         from public, anon, authenticated;

commit;
