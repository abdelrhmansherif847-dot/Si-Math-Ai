-- =====================================================================
-- Teacher Homework, increment H5 — the student sits the paper
-- =====================================================================
-- STATUS: 🟡 PREPARED, not applied. Apply only with explicit owner approval
--         (CLAUDE.md §3). Rollback: 20260905z.
-- DEPENDS ON: H2 (the six tables), H3 (authoring) and H4 (the attach path,
--             LIVE 2026-09-03 as 20260903203209). No enum migration: H5 adds
--             NO audit label, by the decision recorded in §15.22 D-6.
-- CONTEXT: docs/roadmap/teacher-intelligence-layer.md §15.18 (the audit),
--          §15.19–§15.22 (every locked decision this file implements).
--
-- ⚠️ THIS FILE REDEFINES FOUR LIVE FUNCTIONS: teacher_homework_attempts_guard(),
--    teacher_homework_responses_guard(), student_my_homework() and
--    teacher_homework_students(). It is the hazard 20260831e is remembered for.
--    Never re-apply without first diffing all four against production; §8
--    asserts each one, and 20260905z restores every H4 body byte-for-byte.
--    The four H4 md5s this file replaces:
--      teacher_homework_attempts_guard    dacf16fdbce357a20975d566b3035680
--      teacher_homework_responses_guard   c5db8f0336d0460c0ad1eb534bbbfc0b
--      student_my_homework                04198136c9609eb8e73baeb747d13dd3
--      teacher_homework_students          01b0386d8a03c5d54d734f7a565c23ee
--
-- WHAT THIS IS. The student can now open a homework, answer it, come back to
-- it, and submit it; the teacher can read the result. It is the last student
-- increment: after this the homework system is complete from code to grade.
--
-- WHAT IT IS NOT. No table, no policy, no enum label, no analyzer change, no
-- UI. §8 asserts all five.
--
-- THE FOURTEEN LOCKED INVARIANTS THIS FILE IMPLEMENTS (§15.19–§15.22)
-- -------------------------------------------------------------------
--   1  closing blocks a NEW start; it never kills a sitting already running
--   2  resuming needs LIVE membership and workspace, re-checked every call
--   3  a removed student cannot save or submit; rejoining restores the sitting
--   4  grading happens only at submit
--   5  is_correct is NULL until then
--   6  submission grades through exam_answer_matches(), the one authority
--   7  submit is idempotent
--   8  save and submit lock the attempt FIRST
--   9  submit never locks the homework — only start does (see the note there)
--  10  late freezes at submission
--  11  the key needs reveal_answers AND the caller's OWN submitted attempt
--  12  the key is not SELECTED at all for a caller not entitled to it
--  13  homework stays entirely outside the analyzer
--  14  permanent code retirement (H4) is untouched
--
-- WHY A DEFERRED CONSTRAINT TRIGGER (invariants 4 and 5)
-- ------------------------------------------------------
-- MEASURED before this file was written (§15.22): an IMMEDIATE check that "a
-- verdict may exist only on a submitted attempt" would refuse grading that
-- happens before the flip, and so would force the submit order to invert. A
-- DEFERRED constraint trigger tests the COMMITTED STATE instead of the
-- statement order, so grade-then-flip survives — proven by running both cases.
-- It is not a new pattern here: referral_commission_rates already carries a
-- DEFERRABLE INITIALLY DEFERRED constraint trigger.
--
-- It is a BACKSTOP, not the first line: a deferred check reports at COMMIT, so
-- the RPC still has to be right. And note for anything that forces it early:
-- SET CONSTRAINTS ALL IMMEDIATE is sticky for the rest of the transaction
-- (measured — it made one audit probe fire early and misreport).
--
-- VERIFY, NEVER COMPUTE (invariant 6)
-- -----------------------------------
-- teacher_homework_verdict_guard() recomputes the verdict through
-- exam_answer_matches() and REFUSES one that disagrees. It does not write the
-- value: computing it in the trigger would grade on save, which invariant 4
-- forbids. The RPC decides WHEN a verdict is written; the database decides
-- WHAT it must be. There is no second grading rule anywhere.
--
-- THE STUDENT READ BOUNDARY IS NOW RPC-ONLY (§15.22 H-3, extended by F-5)
-- -------------------------------------------------------------------------
-- This file REVOKES SELECT on BOTH teacher_homework_questions AND
-- teacher_homework_stimuli from authenticated. The content a student sees stops
-- being separated from them by RLS alone and starts being separated by the
-- absence of any reach at all.
--
-- Stimuli were added to the revoke by decision F-5, and the reason is
-- consistency rather than a leak: RLS on that table already carries only a
-- STAFF-READ policy, so a student's direct select returns zero rows today
-- either way. But "the homework student read boundary is RPC-only" was only
-- literally true of one of the two content tables, and half an architecture is
-- the kind of thing a later reader resolves in the wrong direction.
--
-- The staff-read policies on BOTH tables are deliberately LEFT IN PLACE though
-- nothing can now reach them: the policy is the rule, the grant is the reach,
-- and keeping the rule means a future GRANT cannot silently hand students the
-- key. Staff keep their access through teacher_homework_review(), added below.
--
-- The student RPC names its stimulus fields ONE BY ONE -- kind, label, body,
-- spec, media_ref, media_kind -- and never selects s.*. media_sha256 is a
-- server-computed integrity field and is staff-only; id, homework_id and the
-- timestamps are internal. §12.8 pins the exposed list.
--
-- This deliberately diverges from Teacher Exams, whose pages read the
-- equivalent tables directly; homework's student boundary is RPC-only by
-- decision, not by accident. The bill it hands H6 is a staff authoring-read RPC.
--
-- REMOVAL AFTER SUBMISSION (F-1, LOCKED)
-- --------------------------------------
-- A student removed from the class AFTER submitting keeps access to their own
-- submitted result, and to the correct answer and explanation when
-- reveal_answers is true. The sitting is finished and the result is theirs;
-- removal governs what they may still DO, not what they already earned.
--
-- Removal continues to prevent a new start, a resume, a save and a submit, and
-- a student removed while in_progress stays under S-2 exactly as locked: the
-- attempt survives untouched and access returns only on rejoining as an ACTIVE
-- member. The asymmetry is deliberate and is now asserted (§12.8) rather than
-- merely true, because it is the third gate arm of student_homework_paper()
-- and nothing else would notice if a later edit dropped it.
-- =====================================================================

begin;

-- ── 1 · the resume gate ───────────────────────────────────────────────
-- teacher_homework_can_open() is the NEW-START gate and is untouched. The two
-- gates differ by exactly one condition: can_open requires the paper to be
-- published, this one requires a sitting to already exist. That single
-- difference is invariant 1.
create or replace function teacher_homework_can_resume(p_homework uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $fn$
  select exists (
    select 1
      from teacher_homework h
      join teacher_workspaces w        on w.id = h.workspace_id
      join teacher_homework_access a   on a.homework_id = h.id and a.student_id = auth.uid()
      join workspace_students ws       on ws.workspace_id = h.workspace_id
                                      and ws.student_id = auth.uid()
      join teacher_homework_attempts t on t.homework_id = h.id and t.user_id = auth.uid()
     where h.id = p_homework
       and ws.status = 'active'
       and (ws.expires_at is null or ws.expires_at > now())
       and w.is_active
       and t.status = 'in_progress'
  );
$fn$;

-- ── 2 · the guards ────────────────────────────────────────────────────

-- H-1b. An attempt is BORN in_progress. A CHECK cannot tell INSERT from
-- UPDATE, so this is the smallest mechanism that closes the hole for a table
-- owner and for a future migration, not only for a client who holds no INSERT.
-- Everything below the INSERT branch is 20260902b's body, unchanged.
create or replace function teacher_homework_attempts_guard()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $fn$
begin
  if tg_op = 'INSERT' then
    if new.status <> 'in_progress' then
      raise exception 'teacher_homework_attempts: an attempt is born in_progress, not %', new.status
        using errcode = '22000';
    end if;
    return new;
  end if;
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

drop trigger if exists teacher_homework_attempts_guard_trg on teacher_homework_attempts;
create trigger teacher_homework_attempts_guard_trg
  before insert or delete or update on teacher_homework_attempts
  for each row execute function teacher_homework_attempts_guard();

-- H-2. A submitted answer is immutable in EVERY column. 20260902b froze the
-- answer; last_answered_at was the one that still moved (measured), so it now
-- rides the same condition rather than getting a rule of its own.
create or replace function teacher_homework_responses_guard()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $fn$
declare v_status text;
begin
  if tg_op = 'DELETE' then
    raise exception 'teacher_homework_responses: an answer is a record and is never deleted'
      using errcode = '42501';
  end if;

  if new.attempt_id is distinct from old.attempt_id
     or new.question_id is distinct from old.question_id
     or new.homework_id is distinct from old.homework_id
     or new.ordinal is distinct from old.ordinal then
    raise exception 'teacher_homework_responses: which item of which attempt is immutable'
      using errcode = '22000';
  end if;

  -- Graded once, and never re-graded: once is_correct holds a verdict, no later
  -- code path can quietly rewrite it — and NULL is a rewrite too.
  if old.is_correct is not null and new.is_correct is distinct from old.is_correct then
    raise exception 'teacher_homework_responses: this item is already graded'
      using errcode = '42501';
  end if;

  -- A submitted paper cannot be edited. last_answered_at rides the same test as
  -- the answer itself (H-2): a frozen answer whose timestamp still moves is not
  -- frozen. Fails closed on an unreadable parent, which is why this is DEFINER.
  if new.answer is distinct from old.answer
     or new.last_answered_at is distinct from old.last_answered_at then
    select status into v_status from teacher_homework_attempts where id = new.attempt_id;
    if v_status is null or v_status <> 'in_progress' then
      raise exception 'teacher_homework_responses: this attempt is % and its answers are final',
        coalesce(v_status, '(unknown)') using errcode = '42501';
    end if;
  end if;

  return new;
end;
$fn$;

-- H-1c · VERIFY, NEVER COMPUTE. A verdict must agree with the platform's single
-- grading rule. A CHECK cannot reach the key on another table, so this is the
-- smallest mechanism. It fires on BOTH write verbs, because a forged verdict
-- arrives just as easily on an INSERT.
create or replace function teacher_homework_verdict_guard()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $fn$
declare q teacher_homework_questions%rowtype; v_should boolean;
begin
  if new.is_correct is null then
    return new;
  end if;
  select * into q from teacher_homework_questions where id = new.question_id;
  if not found then
    raise exception 'teacher_homework_responses: a verdict cannot be verified against an unreadable question'
      using errcode = '22000';
  end if;
  -- An unanswered item has no verdict. The omission CHECK says the same thing;
  -- this agrees with it rather than restating it differently.
  v_should := case when new.answer is null then null
                   else exam_answer_matches(q.question_format, q.correct_answer, new.answer) end;
  if new.is_correct is distinct from v_should then
    raise exception
      'teacher_homework_responses: a verdict must agree with the platform grading rule (expected %, got %)',
      coalesce(v_should::text, 'null'), new.is_correct
      using errcode = '22000';
  end if;
  return new;
end;
$fn$;

-- Named to sort AFTER teacher_homework_responses_guard_trg, so the immutability
-- rules are applied before the truth rule. BEFORE ROW triggers fire in
-- alphabetical name order — measured during H4.
create trigger teacher_homework_responses_verdict_trg
  before insert or update on teacher_homework_responses
  for each row execute function teacher_homework_verdict_guard();

-- D-4 · A verdict may exist ONLY on a submitted attempt. DEFERRED so that
-- grade-then-flip inside one transaction is legal while the forbidden STATE is
-- not — see the header. AFTER, because it judges the row as written.
create or replace function teacher_homework_verdict_state_guard()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $fn$
declare v_status text;
begin
  if new.is_correct is null then
    return null;
  end if;
  select status into v_status from teacher_homework_attempts where id = new.attempt_id;
  if v_status is distinct from 'submitted' then
    raise exception
      'teacher_homework_responses: a verdict exists on an attempt that is % — grading happens only at submission',
      coalesce(v_status, '(unknown)') using errcode = '22000';
  end if;
  return null;
end;
$fn$;

create constraint trigger teacher_homework_verdict_state_trg
  after insert or update on teacher_homework_responses
  deferrable initially deferred
  for each row execute function teacher_homework_verdict_state_guard();

-- ── 3 · the student read ──────────────────────────────────────────────
-- THE KEY IS NOT SELECTED unless the caller is entitled to it (invariant 12).
-- Two branches, not one query with a masking CASE: a CASE still names the
-- column in the query that runs, and the contract this file wants to be able to
-- state is "the key was never read", not "the key was read and hidden".
create or replace function student_homework_paper(p_homework uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $fn$
declare
  h        teacher_homework%rowtype;
  t        teacher_homework_attempts%rowtype;
  v_name   text;
  v_key_ok boolean;
  v_items  jsonb;
  v_sat    boolean;
begin
  if auth.uid() is null then
    raise exception 'student_homework_paper: sign in first' using errcode = '42501';
  end if;

  select * into t from teacher_homework_attempts
   where homework_id = p_homework and user_id = auth.uid();
  v_sat := found;

  -- THE GATE. can_open is the new-start gate; can_resume is invariant 1's
  -- exception. The third arm is F-1, LOCKED: a read of the caller's OWN
  -- finished work survives removal from the class. S-2 blocks starting,
  -- resuming, saving and submitting, and says nothing about reading; the
  -- sitting is over and the result is the student's. RLS already lets them read
  -- their own responses, so refusing here would only hide what they can still
  -- reach through PostgREST — while withholding the key they are entitled to.
  --
  -- Note the deliberate asymmetry this creates, which F-1 accepts: removed
  -- while in_progress, all three arms are false and the paper cannot be read at
  -- all; removed after submitting, it can. §12.8 asserts this arm exists.
  if not (teacher_homework_can_open(p_homework)
          or teacher_homework_can_resume(p_homework)
          or (v_sat and t.status = 'submitted')) then
    raise exception 'student_homework_paper: this homework is not open to you' using errcode = '42501';
  end if;

  select * into h from teacher_homework where id = p_homework;
  select name into v_name from teacher_workspaces where id = h.workspace_id;

  -- S-1: the flag is NECESSARY BUT NOT SUFFICIENT. Without the second half a
  -- teacher who reveals mid-sitting would hand the key to a student who can
  -- still change their answers (measured, §15.19).
  v_key_ok := coalesce(h.reveal_answers and v_sat and t.status = 'submitted', false);

  if v_key_ok then
    select coalesce(jsonb_agg(jsonb_build_object(
             'question_id', q.id, 'ordinal', q.ordinal, 'prompt', q.prompt,
             'format', q.question_format, 'choices', q.choices,
             'stimulus', case when s.id is null then null else jsonb_build_object(
                           'kind', s.kind, 'label', s.label, 'body', s.body, 'spec', s.spec,
                           'media_ref', s.media_ref, 'media_kind', s.media_kind) end,
             'answer', r.answer, 'is_correct', r.is_correct,
             'correct_answer', q.correct_answer, 'explanation', q.explanation
           ) order by q.ordinal), '[]'::jsonb) into v_items
      from teacher_homework_questions q
      left join teacher_homework_stimuli s on s.id = q.stimulus_id
      left join teacher_homework_responses r on r.question_id = q.id and r.attempt_id = t.id
     where q.homework_id = p_homework;
  else
    -- The entitled branch above is the ONLY query in this function that names
    -- correct_answer or explanation.
    select coalesce(jsonb_agg(jsonb_build_object(
             'question_id', q.id, 'ordinal', q.ordinal, 'prompt', q.prompt,
             'format', q.question_format, 'choices', q.choices,
             'stimulus', case when s.id is null then null else jsonb_build_object(
                           'kind', s.kind, 'label', s.label, 'body', s.body, 'spec', s.spec,
                           'media_ref', s.media_ref, 'media_kind', s.media_kind) end,
             'answer', r.answer, 'is_correct', r.is_correct
           ) order by q.ordinal), '[]'::jsonb) into v_items
      from teacher_homework_questions q
      left join teacher_homework_stimuli s on s.id = q.stimulus_id
      left join teacher_homework_responses r on r.question_id = q.id and r.attempt_id = t.id
     where q.homework_id = p_homework;
  end if;

  return jsonb_build_object(
    'homework_id', h.id, 'title', h.title, 'instructions', h.instructions,
    'workspace_name', v_name, 'status', h.status, 'due_at', h.due_at,
    'reveal_answers', h.reveal_answers, 'answers_visible', v_key_ok,
    'attempt_id', t.id, 'attempt_status', t.status,
    'started_at', t.started_at, 'submitted_at', t.submitted_at, 'late', t.late,
    'items', v_items);
end;
$fn$;

-- ── 4 · start and resume ──────────────────────────────────────────────
-- THE ONLY PLACE IN H5 THAT LOCKS THE HOMEWORK ROW, and it must stay that way:
-- start takes homework -> attempt, so if submit ever took attempt -> homework
-- the two would deadlock (§15.21). Submit therefore READS the homework without
-- locking it.
create or replace function student_homework_start(p_homework uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $fn$
declare h teacher_homework%rowtype; t teacher_homework_attempts%rowtype;
begin
  if auth.uid() is null then
    raise exception 'student_homework_start: sign in first' using errcode = '42501';
  end if;

  -- Locking the paper closes the start-vs-close race: nothing gates an attempt
  -- INSERT on the paper's status, so without this a start can land just after a
  -- close commits.
  select * into h from teacher_homework where id = p_homework for update;
  if not found then
    raise exception 'student_homework_start: this homework is not open to you' using errcode = '42501';
  end if;

  -- RESUME FIRST. One sitting per student per paper, so a refresh, a second
  -- device and a lost connection all find the same row.
  select * into t from teacher_homework_attempts
   where homework_id = p_homework and user_id = auth.uid();

  if found then
    -- Unlike teacher_exam_start(), resuming is AUTHORIZED — invariant 2. A
    -- student removed mid-sitting cannot continue until they rejoin (S-2).
    if t.status = 'in_progress' and not teacher_homework_can_resume(p_homework) then
      raise exception 'student_homework_start: this homework is not open to you' using errcode = '42501';
    end if;
    -- A submitted attempt is returned, never reopened. The attempts guard would
    -- refuse a reopen anyway; this is the RPC agreeing with it.
    return jsonb_build_object('attempt_id', t.id, 'status', t.status, 'resumed', true,
      'started_at', t.started_at, 'submitted_at', t.submitted_at, 'late', t.late);
  end if;

  -- A NEW sitting. Only here does the published condition apply.
  if not teacher_homework_can_open(p_homework) then
    raise exception 'student_homework_start: this homework is not open to you' using errcode = '42501';
  end if;

  begin
    insert into teacher_homework_attempts (user_id, homework_id)
    values (auth.uid(), p_homework)
    returning * into t;
    -- Every item gets a row now, so an untouched question is a row with answer
    -- NULL rather than a gap: omission is evidence, and save is an UPDATE that
    -- can never introduce a cross-paper row.
    insert into teacher_homework_responses (attempt_id, question_id, homework_id, ordinal)
      select t.id, q.id, p_homework, q.ordinal
        from teacher_homework_questions q where q.homework_id = p_homework;
  exception when unique_violation then
    -- Two tabs raced. Converge on the one attempt rather than surfacing an
    -- error for something that already succeeded.
    select * into t from teacher_homework_attempts
     where homework_id = p_homework and user_id = auth.uid();
  end;

  return jsonb_build_object('attempt_id', t.id, 'status', t.status, 'resumed', false,
    'started_at', t.started_at, 'submitted_at', t.submitted_at, 'late', t.late);
end;
$fn$;

-- ── 5 · save one answer ───────────────────────────────────────────────
create or replace function student_homework_save(p_attempt uuid, p_question uuid, p_answer text)
returns void
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $fn$
declare t teacher_homework_attempts%rowtype;
begin
  if auth.uid() is null then
    raise exception 'student_homework_save: sign in first' using errcode = '42501';
  end if;

  -- THE ATTEMPT LOCK COMES FIRST (invariant 8). Without it the responses guard
  -- reads the attempt status without a lock, so a save whose guard has already
  -- run can land an answer on an attempt a concurrent submit has just frozen.
  select * into t from teacher_homework_attempts
   where id = p_attempt and user_id = auth.uid() for update;
  if not found then
    raise exception 'student_homework_save: no such attempt' using errcode = '42501';
  end if;
  if t.status <> 'in_progress' then
    raise exception 'student_homework_save: this attempt is % and its answers are final', t.status
      using errcode = '42501';
  end if;

  -- S-2, THE LOAD-BEARING RULE: live membership re-checked on EVERY save, under
  -- the lock — not start-time authorization. The database will happily let a
  -- removed student's in-progress attempt be written (measured), so this line
  -- is the whole of the rule.
  if not teacher_homework_can_resume(t.homework_id) then
    raise exception 'student_homework_save: this homework is no longer open to you' using errcode = '42501';
  end if;

  update teacher_homework_responses
     set answer = nullif(btrim(coalesce(p_answer, '')), ''),
         last_answered_at = now()
   where attempt_id = p_attempt and question_id = p_question;
  if not found then
    raise exception 'student_homework_save: that question is not on this attempt' using errcode = '22000';
  end if;
end;
$fn$;

-- ── 6 · submit ────────────────────────────────────────────────────────
create or replace function student_homework_submit(p_attempt uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $fn$
declare
  t teacher_homework_attempts%rowtype;
  h teacher_homework%rowtype;
  v_c int; v_w int; v_o int; v_n int; v_late boolean;
begin
  if auth.uid() is null then
    raise exception 'student_homework_submit: sign in first' using errcode = '42501';
  end if;

  select * into t from teacher_homework_attempts
   where id = p_attempt and user_id = auth.uid() for update;
  if not found then
    raise exception 'student_homework_submit: no such attempt' using errcode = '42501';
  end if;

  -- IDEMPOTENT (invariant 7). The branch comes BEFORE any write: the attempts
  -- guard raises 22000 on a second flip, so attempting the write and catching
  -- the error is NOT the same thing — it would also swallow real failures.
  if t.status = 'in_progress' then
    if not teacher_homework_can_resume(t.homework_id) then
      raise exception 'student_homework_submit: this homework is no longer open to you'
        using errcode = '42501';
    end if;

    -- READ, never lock: start holds homework -> attempt, so locking here would
    -- close a deadlock cycle (invariant 9).
    select * into h from teacher_homework where id = t.homework_id;

    -- GRADE FIRST, by the one authority. An unanswered item stays NULL rather
    -- than false: "left it blank" and "got it wrong" are different claims, and
    -- the omission CHECK makes the wrong version impossible anyway.
    update teacher_homework_responses r
       set is_correct = case when r.answer is null then null
                             else exam_answer_matches(q.question_format, q.correct_answer, r.answer) end
      from teacher_homework_questions q
     where q.id = r.question_id and r.attempt_id = p_attempt;

    -- late is decided here and frozen here (invariant 10): the attempts guard
    -- refuses every later update, so moving due_at afterwards cannot restate it.
    v_late := h.due_at is not null and now() > h.due_at;

    update teacher_homework_attempts
       set status = 'submitted', submitted_at = now(), late = v_late
     where id = p_attempt;
  end if;

  select count(*) filter (where is_correct),
         count(*) filter (where is_correct is false),
         count(*) filter (where answer is null),
         count(*)
    into v_c, v_w, v_o, v_n
    from teacher_homework_responses where attempt_id = p_attempt;

  select * into t from teacher_homework_attempts where id = p_attempt;

  -- COUNTS ONLY. No per-item breakdown and above all no topic|subtopic
  -- "mistakes" array: that shape is what a client would forward to the
  -- analyzer, and invariant 13 says homework never reaches it. The player's
  -- own guard is the second lock, not the only one.
  return jsonb_build_object(
    'attempt_id', p_attempt, 'status', t.status, 'submitted_at', t.submitted_at,
    'late', t.late, 'total', v_n, 'correct', v_c, 'wrong', v_w, 'omitted', v_o);
end;
$fn$;

-- ── 7 · the student's own list, now resume-aware ──────────────────────
-- 20260904a's body with ONE changed expression: can_open alone went false the
-- moment a paper closed, so a student mid-sitting was told they could not open
-- a paper they may still finish (measured, §15.19).
create or replace function student_my_homework()
returns table (
  homework_id     uuid,
  title           text,
  workspace_name  text,
  status          text,
  due_at          timestamptz,
  reveal_answers  boolean,
  attached_at     timestamptz,
  attempt_status  text,
  submitted_at    timestamptz,
  late            boolean,
  can_open        boolean
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $fn$
begin
  if auth.uid() is null then
    raise exception 'student_my_homework: sign in first' using errcode = '42501';
  end if;
  return query
    select h.id, h.title, w.name, h.status, h.due_at, h.reveal_answers,
           a.attached_at, t.status, t.submitted_at, t.late,
           teacher_homework_can_open(h.id) or teacher_homework_can_resume(h.id)
      from teacher_homework_access a
      join teacher_homework h        on h.id = a.homework_id
      join teacher_workspaces w      on w.id = h.workspace_id
      left join teacher_homework_attempts t
             on t.homework_id = h.id and t.user_id = auth.uid()
     where a.student_id = auth.uid()
     order by (t.status is distinct from 'submitted') desc,
              h.due_at asc nulls last,
              a.attached_at desc;
end;
$fn$;

-- ── 8 · the staff roster, with the one signal S-2 makes necessary ─────
-- active_member exists because S-2 permits a permanently stranded sitting: a
-- student who left mid-paper looks exactly like one still working, and the
-- roster had no way to tell them apart (measured). It is a signal, not a
-- lifecycle state — no cleanup, no abandonment, no monitoring.
drop function if exists teacher_homework_students(uuid);
create or replace function teacher_homework_students(p_homework uuid)
returns table (
  student_id     uuid,
  student_name   text,
  active_member  boolean,
  attached_at    timestamptz,
  attempt_status text,
  started_at     timestamptz,
  submitted_at   timestamptz,
  late           boolean,
  total          integer,
  correct        integer,
  wrong          integer,
  omitted        integer
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $fn$
declare v_ws uuid;
begin
  if not teacher_homework_is_staff(p_homework) then
    raise exception 'teacher_homework_students: no such homework, or you are not staff of its class'
      using errcode = '42501';
  end if;
  select workspace_id into v_ws from teacher_homework where id = p_homework;
  return query
    select a.student_id,
           coalesce(p.full_name, 'Student'),
           exists (select 1 from workspace_students ws
                    where ws.workspace_id = v_ws and ws.student_id = a.student_id
                      and ws.status = 'active'
                      and (ws.expires_at is null or ws.expires_at > now())),
           a.attached_at,
           t.status, t.started_at, t.submitted_at, t.late,
           (select count(*)::int from teacher_homework_responses r where r.attempt_id = t.id),
           (select count(*)::int from teacher_homework_responses r
             where r.attempt_id = t.id and r.is_correct),
           (select count(*)::int from teacher_homework_responses r
             where r.attempt_id = t.id and r.is_correct is false),
           (select count(*)::int from teacher_homework_responses r
             where r.attempt_id = t.id and r.answer is null)
      from teacher_homework_access a
      left join profiles p on p.id = a.student_id
      left join teacher_homework_attempts t
             on t.homework_id = a.homework_id and t.user_id = a.student_id
     where a.homework_id = p_homework
     order by coalesce(p.full_name, 'Student') asc, a.attached_at asc;
end;
$fn$;

-- ── 9 · the staff per-student review ──────────────────────────────────
-- Staff DO see the key here, and that is not a leak: they authored it. It
-- exists because §11 revokes their direct read of teacher_homework_questions
-- along with everyone else's — the grant is role-wide, so removing the
-- students' reach removes theirs, and this restores it deliberately.
create or replace function teacher_homework_review(p_homework uuid, p_student uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $fn$
declare t teacher_homework_attempts%rowtype; h teacher_homework%rowtype;
begin
  if not teacher_homework_is_staff(p_homework) then
    raise exception 'teacher_homework_review: no such homework, or you are not staff of its class'
      using errcode = '42501';
  end if;
  select * into h from teacher_homework where id = p_homework;
  select * into t from teacher_homework_attempts
   where homework_id = p_homework and user_id = p_student;
  if not found then
    return jsonb_build_object('sat', false, 'reveal_answers', h.reveal_answers);
  end if;
  return jsonb_build_object(
    'sat', true, 'status', t.status, 'started_at', t.started_at,
    'submitted_at', t.submitted_at, 'late', t.late, 'reveal_answers', h.reveal_answers,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'ordinal', r.ordinal, 'prompt', q.prompt, 'format', q.question_format,
               'choices', q.choices, 'given', r.answer, 'is_correct', r.is_correct,
               'correct_answer', q.correct_answer, 'explanation', q.explanation
             ) order by r.ordinal)
        from teacher_homework_responses r
        join teacher_homework_questions q on q.id = r.question_id
       where r.attempt_id = t.id), '[]'::jsonb));
end;
$fn$;

-- ── 10 · privileges ───────────────────────────────────────────────────
revoke all on function teacher_homework_can_resume(uuid)                from public, anon, authenticated;
revoke all on function student_homework_paper(uuid)                     from public, anon, authenticated;
revoke all on function student_homework_start(uuid)                     from public, anon, authenticated;
revoke all on function student_homework_save(uuid, uuid, text)          from public, anon, authenticated;
revoke all on function student_homework_submit(uuid)                    from public, anon, authenticated;
revoke all on function student_my_homework()                            from public, anon, authenticated;
revoke all on function teacher_homework_students(uuid)                  from public, anon, authenticated;
revoke all on function teacher_homework_review(uuid, uuid)              from public, anon, authenticated;
revoke all on function teacher_homework_verdict_guard()                 from public, anon, authenticated;
revoke all on function teacher_homework_verdict_state_guard()           from public, anon, authenticated;

grant execute on function teacher_homework_can_resume(uuid)             to authenticated;
grant execute on function student_homework_paper(uuid)                  to authenticated;
grant execute on function student_homework_start(uuid)                  to authenticated;
grant execute on function student_homework_save(uuid, uuid, text)       to authenticated;
grant execute on function student_homework_submit(uuid)                 to authenticated;
grant execute on function student_my_homework()                         to authenticated;
grant execute on function teacher_homework_students(uuid)               to authenticated;
grant execute on function teacher_homework_review(uuid, uuid)           to authenticated;

-- ── 11 · the student read boundary becomes RPC-only ───────────────────
-- H-3, extended by F-5 to BOTH content tables. The content a student sees stops
-- being separated from them by RLS alone. The staff-read POLICIES stay: the
-- policy is the rule and the grant is the reach, so keeping the rules means a
-- future GRANT cannot silently hand out the key.
--
-- Neither revoke closes a live leak — RLS on both tables carries a staff-read
-- policy and nothing else, so a student's direct select already returned zero
-- rows. What they remove is the REACH, and with it the possibility that a later
-- policy makes the grant matter. They also remove STAFF's direct read, because
-- a grant to authenticated is role-wide: that is what teacher_homework_review()
-- restores, and what H6 must restore for authoring.
revoke select on teacher_homework_questions from authenticated;
revoke select on teacher_homework_stimuli   from authenticated;

-- ── 12 · verification ─────────────────────────────────────────────────
-- Every assertion names what would breach it, so each one could go red. Each
-- one is also reachable: the H4 dry-run found a check that could ONLY raise
-- because it matched a COMMENT, so every source check below reads the body with
-- its -- comments stripped and the raw prosrc is held in no variable at all.
do $$
declare
  v_bad text; v_n integer; v_code text;
  NEWFN constant text[] := array['teacher_homework_can_resume','student_homework_paper',
    'student_homework_start','student_homework_save','student_homework_submit',
    'student_my_homework','teacher_homework_students','teacher_homework_review'];
begin
  -- 12.1 H5 ADDS NO TABLE, NO POLICY, NO ENUM LABEL
  select count(*) into v_n from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname like 'teacher\_homework%' and c.relkind = 'r';
  if v_n <> 8 then
    raise exception 'H5: the homework table count moved to % — this increment adds none', v_n;
  end if;
  select count(*) into v_n from pg_policy p join pg_class c on c.oid = p.polrelid
   where c.relname like 'teacher\_homework%';
  if v_n <> 9 then
    raise exception 'H5: the homework policy count moved to % — this increment adds none', v_n;
  end if;
  select count(*) into v_n from pg_enum e join pg_type t on t.oid = e.enumtypid
   where t.typname = 'workspace_audit_action';
  if v_n <> 22 then
    raise exception 'H5: the audit label count moved to % — D-6 adds none', v_n;
  end if;

  -- 12.2 THE FOUR REDEFINED BODIES REALLY CHANGED, and nothing else did.
  --      A no-op redefinition would mean this file did not do what it says.
  select string_agg(x.n, ', ') into v_bad from (values
      ('teacher_homework_attempts_guard','dacf16fdbce357a20975d566b3035680'),
      ('teacher_homework_responses_guard','c5db8f0336d0460c0ad1eb534bbbfc0b'),
      ('student_my_homework','04198136c9609eb8e73baeb747d13dd3'),
      ('teacher_homework_students','01b0386d8a03c5d54d734f7a565c23ee')
    ) as x(n, old_md5)
   where (select md5(p.prosrc) from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
           where ns.nspname = 'public' and p.proname = x.n) = x.old_md5;
  if v_bad is not null then
    raise exception 'H5: these were supposed to be redefined and still carry their H4 body: %', v_bad;
  end if;
  select string_agg(x.n, ', ') into v_bad from (values
      ('teacher_homework_is_staff','63ef7fa28bf3a0c48bd6658abd11009a'),
      ('teacher_homework_guard','19bbc18c825edce8b3c9a03c75f9fecb'),
      ('teacher_homework_can_open','9ef8d477bede57132177ca896ab4a2f9'),
      ('teacher_homework_create','4fca434e72a510889063bd8ae67490bb'),
      ('teacher_homework_rotate_code','124b4acb5657aef31709a8e5b24d0f60'),
      ('teacher_homework_delete','f7f430e228bf399ba6131d972c8b07c6'),
      ('student_attach_homework','e601665a5fc3ce816e411026dff85f00'),
      ('teacher_homework_code_guard','f54ea68a1b3ef3de5475e92c601a51dc'),
      ('teacher_homework_code_available','d4758dfd75b06a59b8b146bf47d12399')
    ) as x(n, md5_expected)
   where (select md5(p.prosrc) from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
           where ns.nspname = 'public' and p.proname = x.n) is distinct from x.md5_expected;
  if v_bad is not null then
    raise exception 'H5: it disturbed a function it does not own: %', v_bad;
  end if;

  -- 12.3 every new client RPC is definer, pinned and callable by authenticated;
  --      anon holds EXECUTE on nothing in the homework system
  select string_agg(p.proname, ', ') into v_bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = any (NEWFN)
     and (not p.prosecdef
          or not (p.proconfig @> array['search_path=pg_catalog, public'])
          or not has_function_privilege('authenticated', p.oid, 'execute'));
  if v_bad is not null then
    raise exception 'H5: not definer, search_path unpinned, or not callable: %', v_bad;
  end if;
  select string_agg(p.proname, ', ') into v_bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and (p.proname like 'teacher\_homework%' or p.proname like 'student\_homework%'
          or p.proname in ('student_attach_homework','student_my_homework'))
     and has_function_privilege('anon', p.oid, 'execute');
  if v_bad is not null then
    raise exception 'H5: anon can call: %', v_bad;
  end if;
  -- the two new guards are callable by nobody
  if has_function_privilege('authenticated', 'teacher_homework_verdict_guard()', 'execute')
     or has_function_privilege('authenticated', 'teacher_homework_verdict_state_guard()', 'execute') then
    raise exception 'H5: a verdict guard is client-callable';
  end if;

  -- 12.4 THE STUDENT READ BOUNDARY IS RPC-ONLY, for BOTH content tables (F-5).
  --      The grants are gone; the policies stay, so a future GRANT cannot
  --      silently hand students the key.
  select string_agg(c.relname, ', ') into v_bad
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relname in ('teacher_homework_questions','teacher_homework_stimuli')
     and has_table_privilege('authenticated', c.oid, 'select');
  if v_bad is not null then
    raise exception 'H5: authenticated still holds a direct SELECT on: %', v_bad;
  end if;
  select string_agg(x.t, ', ') into v_bad from (values
      ('teacher_homework_questions','teacher_homework_questions_staff_read'),
      ('teacher_homework_stimuli','teacher_homework_stimuli_staff_read')
    ) as x(t, pol)
   where not exists (select 1 from pg_policy p join pg_class c on c.oid = p.polrelid
                      where c.relname = x.t and p.polname = x.pol);
  if v_bad is not null then
    raise exception 'H5: a staff-read policy was dropped — the rule must survive the reach: %', v_bad;
  end if;
  -- anon never held either grant and must not gain one
  if has_table_privilege('anon', 'teacher_homework_questions', 'select')
     or has_table_privilege('anon', 'teacher_homework_stimuli', 'select') then
    raise exception 'H5: anon holds a direct SELECT on a homework content table';
  end if;
  -- and nothing else lost its grant. teacher_homework_stimuli is DELIBERATELY
  -- absent from this list now: before F-5 this same check asserted it KEPT the
  -- grant, so the flip is visible here rather than silent.
  select string_agg(c.relname, ', ') into v_bad
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relname in ('teacher_homework','teacher_homework_access',
                       'teacher_homework_attempts','teacher_homework_responses')
     and not has_table_privilege('authenticated', c.oid, 'select');
  if v_bad is not null then
    raise exception 'H5: it removed a grant it should not have: %', v_bad;
  end if;

  -- 12.5 the trigger inventory, and the deferred one really is deferred
  select count(*) into v_n from pg_trigger tg join pg_class c on c.oid = tg.tgrelid
   where c.relname = 'teacher_homework_responses' and not tg.tgisinternal;
  if v_n <> 3 then
    raise exception 'H5: teacher_homework_responses carries % triggers — H2''s one plus this file''s two', v_n;
  end if;
  select pg_get_triggerdef(tg.oid) into v_bad from pg_trigger tg join pg_class c on c.oid = tg.tgrelid
   where c.relname = 'teacher_homework_responses' and tg.tgname = 'teacher_homework_verdict_state_trg';
  if v_bad !~ 'DEFERRABLE INITIALLY DEFERRED' then
    raise exception 'H5: the verdict-state trigger is not deferred, so it would force the submit order to invert: %', v_bad;
  end if;
  if not (select tg.tgdeferrable and tg.tginitdeferred from pg_trigger tg join pg_class c on c.oid = tg.tgrelid
           where c.relname = 'teacher_homework_responses' and tg.tgname = 'teacher_homework_verdict_state_trg') then
    raise exception 'H5: the verdict-state trigger is not DEFERRABLE INITIALLY DEFERRED in the catalogue';
  end if;
  select pg_get_triggerdef(tg.oid) into v_bad from pg_trigger tg join pg_class c on c.oid = tg.tgrelid
   where c.relname = 'teacher_homework_attempts' and tg.tgname = 'teacher_homework_attempts_guard_trg';
  if v_bad !~ 'BEFORE INSERT OR DELETE OR UPDATE ON public\.teacher_homework_attempts' then
    raise exception 'H5: the attempts guard does not cover INSERT, so a born-submitted attempt is still possible: %', v_bad;
  end if;

  -- 12.6 TRIGGER ORDER. BEFORE ROW triggers fire in alphabetical name order, so
  --      the immutability rules must sort before the truth rule.
  if not ('teacher_homework_responses_guard_trg' < 'teacher_homework_responses_verdict_trg') then
    raise exception 'H5: the verdict guard would fire before the immutability guard';
  end if;

  -- 12.7 THE SUBMIT AND SAVE CONTRACTS, read off the installed source with
  --      comments stripped so these test code and never prose.
  select regexp_replace(p.prosrc, '--[^\n]*', '', 'g') into v_code
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'student_homework_submit';
  if v_code !~ 'exam_answer_matches' then
    raise exception 'H5: submit does not grade through the platform authority';
  end if;
  if position('exam_answer_matches' in v_code) > position('set status = ''submitted''' in v_code) then
    raise exception 'H5: submit flips the attempt before it grades';
  end if;
  if (length(v_code) - length(replace(v_code, 'for update', ''))) / length('for update') <> 1 then
    raise exception 'H5: submit takes more or fewer than one lock — it must lock the attempt and nothing else';
  end if;
  if v_code !~ 'teacher_homework_attempts\s+where id = p_attempt and user_id = auth\.uid\(\) for update' then
    raise exception 'H5: submit does not lock the attempt first';
  end if;
  if v_code ~ 'from teacher_homework where[^;]*for update' then
    raise exception 'H5: submit locks the homework row — that closes a deadlock cycle against start';
  end if;
  if v_code !~ 'if t\.status = ''in_progress'' then' then
    raise exception 'H5: submit is not idempotent — it must branch before it writes, not catch the guard';
  end if;
  if v_code !~ 'teacher_homework_can_resume' then
    raise exception 'H5: submit does not re-check live membership (S-2)';
  end if;
  if v_code ~ 'mistakes' or v_code ~ 'session_id' then
    raise exception 'H5: submit returns an analyzer-shaped payload';
  end if;

  select regexp_replace(p.prosrc, '--[^\n]*', '', 'g') into v_code
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'student_homework_save';
  if v_code !~ 'for update' or v_code !~ 'teacher_homework_can_resume' then
    raise exception 'H5: save does not lock the attempt and re-check live membership';
  end if;
  if position('for update' in v_code) > position('teacher_homework_can_resume' in v_code) then
    raise exception 'H5: save checks membership before it takes the lock';
  end if;
  if v_code ~ 'is_correct' then
    raise exception 'H5: save writes a verdict — grading happens only at submit';
  end if;

  select regexp_replace(p.prosrc, '--[^\n]*', '', 'g') into v_code
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'student_homework_start';
  if v_code !~ 'from teacher_homework where id = p_homework for update' then
    raise exception 'H5: start does not lock the paper, so a start can land after a close';
  end if;
  if v_code !~ 'when unique_violation then' then
    raise exception 'H5: racing starts would surface an error instead of converging on one attempt';
  end if;
  if position('teacher_homework_attempts' in v_code) > position('teacher_homework_can_open' in v_code) then
    raise exception 'H5: start asks the new-start gate before it looks for an existing sitting';
  end if;

  -- 12.8 THE KEY IS NAMED IN EXACTLY ONE BRANCH of the student read.
  select regexp_replace(p.prosrc, '--[^\n]*', '', 'g') into v_code
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'student_homework_paper';
  -- q.correct_answer, not 'correct_answer': the entitled branch names the column
  -- once and the JSON key once, and it is the COLUMN READ that must be unique.
  if (length(v_code) - length(replace(v_code, 'q.correct_answer', ''))) / length('q.correct_answer') <> 1 then
    raise exception 'H5: the answer key is read in more than one branch of the student read — the unentitled branch must not select it at all';
  end if;
  if (length(v_code) - length(replace(v_code, 'q.explanation', ''))) / length('q.explanation') <> 1 then
    raise exception 'H5: the explanation is named more than once in the student read';
  end if;
  if v_code !~ 'reveal_answers and v_sat and t\.status = ''submitted''' then
    raise exception 'H5: the key is exposed on reveal alone — S-1 requires the caller''s own SUBMITTED attempt';
  end if;

  -- F-1, LOCKED: the third gate arm is what lets a student removed AFTER
  -- submitting still read their own result. Nothing else in the file would
  -- notice its removal, so it is asserted here rather than left merely true.
  if v_code !~ 'v_sat and t\.status = ''submitted''\)\) then' then
    raise exception 'H5: the read gate lost its third arm — F-1 says a submitted result survives removal from the class';
  end if;
  -- and it really is a THIRD arm of an OR, not the S-1 condition counted twice
  if (length(v_code) - length(replace(v_code, 'teacher_homework_can_resume', '')))
     / length('teacher_homework_can_resume') <> 1 then
    raise exception 'H5: the read gate does not call can_resume exactly once';
  end if;

  -- F-5: the stimulus fields the student read exposes are named ONE BY ONE.
  -- media_sha256 is a server-computed integrity value and is staff-only; the
  -- ids and timestamps are internal. A future s.* would breach this.
  if v_code ~ 'media_sha256' then
    raise exception 'H5: the student read exposes media_sha256 — that is a staff-only integrity field';
  end if;
  if v_code ~ 'select\s+s\.\*' or v_code ~ 'jsonb_build_object\(s\.\*' then
    raise exception 'H5: the student read selects a whole stimulus row instead of naming its fields';
  end if;
  -- Counted PER BRANCH, not merely present: the read has two branches and a
  -- field dropped from one of them would still be found by a presence test,
  -- so the entitled and unentitled students would see different figures.
  select string_agg(f.c || '×' || ((length(v_code) - length(replace(v_code, f.c, '')))
                                   / length(f.c))::text, ', ' order by f.c)
    into v_bad
    from unnest(array['s.kind','s.label','s.body','s.spec',
                      's.media_ref','s.media_kind']) as f(c)
   where (length(v_code) - length(replace(v_code, f.c, ''))) / length(f.c) <> 2;
  if v_bad is not null then
    raise exception 'H5: a stimulus field is not named exactly once in each branch of the student read: %', v_bad;
  end if;

  -- 12.9 THE ANALYZER BOUNDARY IS NOT ASSERTED HERE, DELIBERATELY.
  --      The first draft of this file listed the analyzer tables in a regex so
  --      it could forbid them — and tests/teacher-access-scope.test.mjs went
  --      red, because its blanket ban is that no forward migration may NAME an
  --      academic table in executable SQL at all. That ban is the stronger
  --      statement and it is already enforced in CI, so a weaker copy here
  --      bought nothing and broke the real one. The boundary is proven three
  --      ways instead: that ban, submit returning counts only (§12.7), and the
  --      measured fact that no database function writes the analyzer at all.

  -- 12.10 the shape of the homework system after this increment
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and (p.proname like 'teacher\_homework%' or p.proname like 'student\_homework%'
          or p.proname in ('student_attach_homework','student_my_homework'));
  if v_n <> 38 then
    raise exception 'H5: expected 38 homework functions (30 before + 8 new), found %', v_n;
  end if;
end $$;

commit;
