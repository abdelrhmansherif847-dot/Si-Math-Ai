-- =====================================================================
-- Teacher Homework, increment H3 — authoring, publish, close, rotation
-- =====================================================================
-- STATUS: 🟡 PREPARED, not applied. Apply only with explicit owner approval
--         (CLAUDE.md §3), and only AFTER 20260903a. Rollback: 20260903y.
-- DEPENDS ON: the H2 package, LIVE since 2026-09-03 (20260903123333 /
--             123410 / 123458) — the six tables, their guards, and
--             teacher_homework_is_staff(), which this file CALLS and never
--             redefines; 20260902a for four of the five audit labels; and
--             20260903a for the fifth, homework_answers_revealed, which must
--             be committed before this file can write it (a new enum value
--             cannot be cast in the transaction that adds it).
-- CONTEXT: docs/roadmap/teacher-intelligence-layer.md §15.15 (the six locked
--          decisions) and §15.16 (this increment).
--
-- WHAT THIS IS. The first write path into the homework schema. Until now the
-- six tables have been governed and unreachable: clients hold SELECT only, and
-- H2 shipped no function any client could call. This file adds thirteen RPCs a
-- teacher or ACTIVE assistant may call, and two helpers nobody may call.
--
-- WHAT IT IS NOT. No student surface: no attach, no code entry, no open, no
-- save, no submit, no grading, no results read. Those are H4 and H5. Nothing
-- here reads or writes teacher_homework_access, teacher_homework_attempts or
-- teacher_homework_responses — asserted in §5 below, not merely intended.
--
-- AUTHORIZATION, IN ONE PLACE
-- ---------------------------
-- Every RPC gates on teacher_homework_is_staff(), which is role-blind by
-- construction (§15.15 decision 5). Teacher and active assistant therefore have
-- identical authoring power and no line here needs to say so. A pending
-- assistant is not staff. Every refusal carries ONE message covering both "no
-- such homework" and "not your class", so the id is never an oracle — the
-- convention 3c set and the class code has always used.
--
-- WHAT MIRRORS 3c EXACTLY, AND WHY THAT IS SAFE
-- ---------------------------------------------
-- Read from production rather than from the repo before being copied: the
-- staff gate and its single message; the draft-only content rule, where the
-- RPC exists to turn a trigger's message into one a teacher can act on while
-- the trigger stays the thing that cannot be bypassed; the bounded code-retry
-- loop that catches ONLY a code collision by constraint name and re-raises
-- everything else; the ordinal-shifting trick that dodges the slot unique;
-- the all-or-nothing reorder; the server-side media_sha256 with any client
-- value ignored; and the audit-log insert shape.
--
-- WHAT DIVERGES, AND WHICH DECISION SAYS SO
-- -----------------------------------------
--   no duration, calculator, opens_at or closes_at anywhere
--       homework is untimed practice; publishing opens it. (§15.15)
--   due_at has its OWN RPC, not a field of the update
--       teacher_exam_update is draft-only for everything it touches. due_at is
--       mutable while PUBLISHED (§15.15b, measured), so folding it into the
--       update would force one function to hold two different lifecycles and
--       get them both right. Two RPCs, one rule each. (decision 3)
--   teacher_homework_reveal_answers() takes NO boolean
--       the latch is one-way (§15.15b). A setter with a boolean parameter would
--       make un-revealing something the API can express and the guard must
--       refuse; with no parameter it cannot be expressed at all. It is also the
--       one RPC permitted to touch a CLOSED homework. (decision 1)
--   the publish gate has no window or duration checks
--       there is no window. Publishing with a due date already past is
--       DELIBERATELY allowed: decision 3 makes due_at a date and never a lock,
--       so such a homework is simply one where every submission is late.
--   teacher_homework_delete() removes the content itself, in order
--       3c leaves this to ON DELETE CASCADE. Measured on production (§15.16a),
--       that does not work here: PostgreSQL removes the parent row BEFORE
--       running the cascade, so teacher_homework_content_guard() reads a NULL
--       status and — correctly, by its own fail-closed design — refuses. The
--       result was that only a completely EMPTY draft could ever be deleted,
--       which contradicts the locked lifecycle. Deleting the children first,
--       while the parent still exists and is a draft, lets the guard evaluate
--       normally. The guard is not weakened, bypassed or touched.
--   no approval queue anywhere
--       §15.14. Nothing here touches access; entering the code attaches an
--       active member at once, and that is H4.
--
-- THE FIVE AUDIT LABELS, AND THE SILENCE AROUND THEM
-- --------------------------------------------------
-- Five labels are writable here: homework_created, homework_published,
-- homework_closed and homework_code_rotated from 20260902a, and
-- homework_answers_revealed from 20260903a. homework_attached belongs to H4
-- and is written nowhere in this file.
--
-- The reveal label exists because the first version of this increment did not
-- have one, and the audit that found the gap (§15.16a) measured what a reveal
-- actually left behind: reveal_answers = true, a bumped updated_at, and nothing
-- else — no actor, and a timestamp column that every accepted update stamps, so
-- a due-date change and a reveal could not be told apart. An irreversible act
-- any active staff member can perform now names who performed it.
--
-- There is still NO label for an update, a due-date change, a content edit or a
-- delete, so this file logs none of them. Each is reversible, repeatable and
-- visible in the row itself — the test the exam labels already applied — and
-- §15.16a records the measured reason a delete needs none: it can only ever
-- destroy a draft with no attachment, no attempt and no answer.
-- =====================================================================

begin;

-- ── 0 · two helpers no client may call ────────────────────────────────

-- The same alphabet and shape as the class and exam codes. Homework codes live
-- in their own space; the retry that makes a collision harmless is in each
-- caller, wrapped around the write, exactly as 3c does it.
create or replace function teacher_homework_new_code()
returns text
language plpgsql
volatile
set search_path = pg_catalog, public
as $fn$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  out text := '';
  i int;
begin
  for i in 1..8 loop
    out := out || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
  end loop;
  return out;
end;
$fn$;

-- Closing the gap a delete leaves, without ever holding two questions at the
-- same ordinal: push everything above the hole far out of range, then bring it
-- back one lower. The slot unique is never violated in between.
create or replace function teacher_homework_shift_ordinals(p_homework uuid, p_from integer)
returns void
language plpgsql
volatile
set search_path = pg_catalog, public
as $fn$
begin
  update teacher_homework_questions set ordinal = ordinal + 1000000
   where homework_id = p_homework and ordinal > p_from;
  update teacher_homework_questions set ordinal = ordinal - 1000000 - 1
   where homework_id = p_homework and ordinal > 1000000;
end;
$fn$;

-- ── 1 · the paper ─────────────────────────────────────────────────────

create or replace function teacher_homework_create(p_workspace uuid, p_title text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $fn$
declare v_id uuid; v_code text; v_con text; i int;
begin
  if auth.uid() is null then
    raise exception 'teacher_homework_create: sign in first' using errcode = '42501';
  end if;
  if not workspace_is_active_staff(p_workspace) then
    raise exception 'teacher_homework_create: you are not active staff of that class'
      using errcode = '42501';
  end if;

  for i in 1..10 loop
    begin
      v_code := teacher_homework_new_code();
      insert into teacher_homework (workspace_id, title, homework_code, created_by)
      values (p_workspace, btrim(p_title), v_code, auth.uid())
      returning id into v_id;
      exit;
    exception when unique_violation then
      get stacked diagnostics v_con = constraint_name;
      -- Only a code collision is retryable. Anything else unique is a real
      -- error and must not be swallowed by a loop that looks like a retry.
      if v_con is distinct from 'teacher_homework_homework_code_key' then
        raise;
      end if;
      if i = 10 then
        raise exception 'teacher_homework_create: could not allocate a free homework code'
          using errcode = '53400';
      end if;
    end;
  end loop;

  insert into workspace_audit_log (workspace_id, actor_id, action, subject_id, meta)
  values (p_workspace, auth.uid(), 'homework_created', null, jsonb_build_object('homework_id', v_id));

  return jsonb_build_object('homework_id', v_id, 'homework_code', v_code);
end;
$fn$;

-- The PAPER: title and instructions, draft only. due_at is deliberately absent
-- — it has its own RPC because it has its own lifecycle.
create or replace function teacher_homework_update(p_homework uuid, p_title text, p_instructions text)
returns void
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $fn$
declare v_status text;
begin
  if not teacher_homework_is_staff(p_homework) then
    raise exception 'teacher_homework_update: no such homework, or you are not staff of its class'
      using errcode = '42501';
  end if;
  select status into v_status from teacher_homework where id = p_homework;
  if v_status <> 'draft' then
    raise exception 'teacher_homework_update: this homework is % and its paper is fixed', v_status
      using errcode = '42501';
  end if;

  update teacher_homework
     set title        = btrim(p_title),
         instructions = nullif(btrim(coalesce(p_instructions, '')), '')
   where id = p_homework;
end;
$fn$;

-- The DUE DATE, which outlives the draft. A teacher may extend it, bring it
-- forward, or clear it entirely while the homework is published; a closed
-- homework refuses, and the guard refuses it again. Moving it never rewrites
-- an existing submission's `late` flag — that was measured, and holds because
-- a submitted attempt is immutable, not because this function is careful.
create or replace function teacher_homework_set_due_at(p_homework uuid, p_due_at timestamptz)
returns void
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $fn$
declare v_status text;
begin
  if not teacher_homework_is_staff(p_homework) then
    raise exception 'teacher_homework_set_due_at: no such homework, or you are not staff of its class'
      using errcode = '42501';
  end if;
  select status into v_status from teacher_homework where id = p_homework;
  if v_status = 'closed' then
    raise exception 'teacher_homework_set_due_at: this homework is closed' using errcode = '22023';
  end if;

  update teacher_homework set due_at = p_due_at where id = p_homework;
end;
$fn$;

-- THE LATCH. Note what this function does not have: a parameter. Un-revealing
-- is not a call this API can express, which is a stronger statement than a
-- guard that refuses it — and the guard refuses it too. It is also the only
-- RPC here that a CLOSED homework accepts, because "the due date passes, you
-- close it, then you show the answers" is the ordinary marking flow (§15.15b).
create or replace function teacher_homework_reveal_answers(p_homework uuid)
returns void
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $fn$
declare v_ws uuid;
begin
  if not teacher_homework_is_staff(p_homework) then
    raise exception 'teacher_homework_reveal_answers: no such homework, or you are not staff of its class'
      using errcode = '42501';
  end if;

  -- `and not reveal_answers` is what makes the audit row honest. A second call
  -- on an already-revealed paper matches no row, so v_ws stays NULL and this
  -- returns without logging: the latch is idempotent, and a repeat is not a
  -- second event. A refused call never reaches here at all. One reveal, one row.
  -- The guard's tuple comparison lets this through on a CLOSED homework, which
  -- is the one change a closed paper still accepts (§15.15b).
  update teacher_homework set reveal_answers = true
   where id = p_homework and not reveal_answers
   returning workspace_id into v_ws;
  if v_ws is null then
    return;
  end if;

  -- The convention 20260903a records, matching 20260902a's exactly: the actor
  -- is auth.uid(), subject_id is NULL because the subject is a paper and
  -- subject_id references auth.users, meta carries the homework, and the log's
  -- own created_at default is when it happened.
  insert into workspace_audit_log (workspace_id, actor_id, action, subject_id, meta)
  values (v_ws, auth.uid(), 'homework_answers_revealed', null,
          jsonb_build_object('homework_id', p_homework));
end;
$fn$;

create or replace function teacher_homework_delete(p_homework uuid)
returns void
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $fn$
declare v_status text; v_attached int; v_attempts int;
begin
  if not teacher_homework_is_staff(p_homework) then
    raise exception 'teacher_homework_delete: no such homework, or you are not staff of its class'
      using errcode = '42501';
  end if;
  select status into v_status from teacher_homework where id = p_homework;
  -- Only a draft may be deleted. The two non-draft statuses get DIFFERENT
  -- messages because they call for different actions: a published paper should
  -- be closed, and a closed one is simply final. 3c's teacher_exam_delete()
  -- (LIVE, 20260901e) says "close it, do not delete it" for both, so a teacher
  -- deleting a closed exam is told to close it again. That wording was not
  -- copied here; the live defect is recorded in §15.16b instead.
  if v_status = 'published' then
    raise exception 'teacher_homework_delete: this homework is published — close it, do not delete it'
      using errcode = '42501';
  elsif v_status <> 'draft' then
    raise exception 'teacher_homework_delete: this homework is % and can no longer be deleted', v_status
      using errcode = '42501';
  end if;
  -- The H2 guard refuses a non-draft delete too. Asking here as well turns a
  -- trigger's message into one the caller can act on; the guard remains the
  -- thing that cannot be bypassed.

  -- Student rows make this not a draft anyone may discard. The guards refuse
  -- it anyway — an attachment and an attempt are each "a record and never
  -- deleted", and an answer is held by a RESTRICT — but a raw trigger message
  -- names none of that, so ask first and say what is in the way. The guards
  -- remain the thing that cannot be bypassed. (A response cannot exist without
  -- an attempt, so counting attempts covers all three.)
  select count(*) into v_attached from teacher_homework_access where homework_id = p_homework;
  select count(*) into v_attempts from teacher_homework_attempts where homework_id = p_homework;
  if v_attached > 0 or v_attempts > 0 then
    raise exception
      'teacher_homework_delete: % student(s) hold this homework and % have started it — it can no longer be deleted',
      v_attached, v_attempts using errcode = '42501';
  end if;

  -- CHILDREN FIRST, and not by cascade. Measured on production (§15.16a):
  -- PostgreSQL deletes the parent row before running the referential cascade,
  -- so the content guard fires with the parent already gone, reads a NULL
  -- status and fails closed — which is exactly what it is for, and which made
  -- every draft carrying so much as one question undeletable. Removing the
  -- content while the parent is still present and still a draft lets the guard
  -- evaluate the real status and permit the write. Questions before stimuli:
  -- the stimulus foreign key is ON DELETE RESTRICT.
  delete from teacher_homework_questions where homework_id = p_homework;
  delete from teacher_homework_stimuli where homework_id = p_homework;
  delete from teacher_homework where id = p_homework;
end;
$fn$;

-- ── 2 · stimuli ───────────────────────────────────────────────────────

create or replace function teacher_homework_save_stimulus(
  p_homework uuid, p_stimulus uuid, p_kind text, p_label text,
  p_body text, p_spec jsonb, p_media_ref text)
returns uuid
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $fn$
declare v_status text; v_id uuid; v_kind text := null; v_sha text := null; v_head text;
begin
  if not teacher_homework_is_staff(p_homework) then
    raise exception 'teacher_homework_save_stimulus: no such homework, or you are not staff of its class'
      using errcode = '42501';
  end if;
  select status into v_status from teacher_homework where id = p_homework;
  if v_status <> 'draft' then
    raise exception 'teacher_homework_save_stimulus: this homework is % and its content is fixed', v_status
      using errcode = '42501';
  end if;

  if p_media_ref is not null then
    begin
      -- Computed HERE from the bytes, so a client-supplied hash is not merely
      -- distrusted, it is never read.
      v_sha  := encode(sha256(decode(p_media_ref, 'base64')), 'hex');
      v_head := left(convert_from(decode(p_media_ref, 'base64'), 'UTF8'), 400);
    exception when others then
      raise exception 'teacher_homework_save_stimulus: the figure is not valid base64 text'
        using errcode = '22023';
    end;
    -- A cheap sniff, not a parser, exactly as 3c records: it catches the common
    -- authoring mistake (a PNG, a URL, raw markup) while the real safety
    -- property lives in the renderer, which emits a figure as
    -- <img src="data:image/svg+xml;base64,...">, where script cannot run.
    if v_head !~* '<svg' then
      raise exception 'teacher_homework_save_stimulus: that figure does not look like an SVG'
        using errcode = '22023';
    end if;
    v_kind := 'svg';
  end if;

  if p_stimulus is null then
    insert into teacher_homework_stimuli (homework_id, kind, label, body, spec, media_ref, media_kind, media_sha256)
    values (p_homework, p_kind, nullif(btrim(coalesce(p_label, '')), ''), p_body, p_spec,
            p_media_ref, v_kind, v_sha)
    returning id into v_id;
  else
    update teacher_homework_stimuli
       set kind = p_kind,
           label = nullif(btrim(coalesce(p_label, '')), ''),
           body = p_body,
           spec = p_spec,
           media_ref = p_media_ref,
           media_kind = v_kind,
           media_sha256 = v_sha
     where id = p_stimulus and homework_id = p_homework
     returning id into v_id;
    if v_id is null then
      raise exception 'teacher_homework_save_stimulus: that stimulus is not part of this homework'
        using errcode = '22023';
    end if;
  end if;
  return v_id;
end;
$fn$;

create or replace function teacher_homework_delete_stimulus(p_stimulus uuid)
returns void
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $fn$
declare v_homework uuid; v_status text; v_used int;
begin
  select homework_id into v_homework from teacher_homework_stimuli where id = p_stimulus;
  if v_homework is null or not teacher_homework_is_staff(v_homework) then
    raise exception 'teacher_homework_delete_stimulus: no such stimulus, or you are not staff of its class'
      using errcode = '42501';
  end if;
  select status into v_status from teacher_homework where id = v_homework;
  if v_status <> 'draft' then
    raise exception 'teacher_homework_delete_stimulus: this homework is % and its content is fixed', v_status
      using errcode = '42501';
  end if;

  -- The foreign key is ON DELETE RESTRICT, so this is already impossible. The
  -- point of asking first is the message: a raw FK violation tells a teacher
  -- nothing about which questions are still using the figure.
  select count(*) into v_used from teacher_homework_questions where stimulus_id = p_stimulus;
  if v_used > 0 then
    raise exception 'teacher_homework_delete_stimulus: % question(s) still use this figure', v_used
      using errcode = '23503';
  end if;

  delete from teacher_homework_stimuli where id = p_stimulus;
end;
$fn$;

-- ── 3 · questions ─────────────────────────────────────────────────────

create or replace function teacher_homework_save_question(
  p_homework uuid, p_question uuid, p_ordinal integer, p_prompt text, p_format text,
  p_correct_answer text, p_choices jsonb, p_explanation text, p_stimulus uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $fn$
declare v_status text; v_id uuid;
begin
  if not teacher_homework_is_staff(p_homework) then
    raise exception 'teacher_homework_save_question: no such homework, or you are not staff of its class'
      using errcode = '42501';
  end if;
  select status into v_status from teacher_homework where id = p_homework;
  if v_status <> 'draft' then
    raise exception 'teacher_homework_save_question: this homework is % and its content is fixed', v_status
      using errcode = '42501';
  end if;

  -- The same-homework rule is a trigger and cannot be bypassed; asking here
  -- only buys a better message than a 23503 from the guard.
  if p_stimulus is not null
     and not exists (select 1 from teacher_homework_stimuli
                      where id = p_stimulus and homework_id = p_homework) then
    raise exception 'teacher_homework_save_question: that figure belongs to a different homework'
      using errcode = '23503';
  end if;

  if p_question is null then
    insert into teacher_homework_questions
      (homework_id, ordinal, prompt, question_format, choices, correct_answer, explanation, stimulus_id)
    values
      (p_homework, p_ordinal, p_prompt, p_format, p_choices, p_correct_answer,
       nullif(btrim(coalesce(p_explanation, '')), ''), p_stimulus)
    returning id into v_id;
  else
    update teacher_homework_questions
       set ordinal = p_ordinal, prompt = p_prompt, question_format = p_format,
           choices = p_choices, correct_answer = p_correct_answer,
           explanation = nullif(btrim(coalesce(p_explanation, '')), ''),
           stimulus_id = p_stimulus
     where id = p_question and homework_id = p_homework
     returning id into v_id;
    if v_id is null then
      raise exception 'teacher_homework_save_question: that question is not part of this homework'
        using errcode = '22023';
    end if;
  end if;
  return v_id;
end;
$fn$;

create or replace function teacher_homework_delete_question(p_question uuid)
returns void
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $fn$
declare v_homework uuid; v_status text; v_ord integer;
begin
  select homework_id, ordinal into v_homework, v_ord from teacher_homework_questions where id = p_question;
  if v_homework is null or not teacher_homework_is_staff(v_homework) then
    raise exception 'teacher_homework_delete_question: no such question, or you are not staff of its class'
      using errcode = '42501';
  end if;
  select status into v_status from teacher_homework where id = v_homework;
  if v_status <> 'draft' then
    raise exception 'teacher_homework_delete_question: this homework is % and its content is fixed', v_status
      using errcode = '42501';
  end if;

  delete from teacher_homework_questions where id = p_question;
  perform teacher_homework_shift_ordinals(v_homework, v_ord);
end;
$fn$;

create or replace function teacher_homework_reorder_questions(p_homework uuid, p_question_ids uuid[])
returns void
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $fn$
declare v_status text; v_n int; v_total int;
begin
  if not teacher_homework_is_staff(p_homework) then
    raise exception 'teacher_homework_reorder_questions: no such homework, or you are not staff of its class'
      using errcode = '42501';
  end if;
  select status into v_status from teacher_homework where id = p_homework;
  if v_status <> 'draft' then
    raise exception 'teacher_homework_reorder_questions: this homework is % and its content is fixed', v_status
      using errcode = '42501';
  end if;

  select count(*) into v_total from teacher_homework_questions where homework_id = p_homework;
  select count(*) into v_n from teacher_homework_questions
   where homework_id = p_homework and id = any (p_question_ids);
  -- A partial list would silently leave some questions behind at their old
  -- numbers and produce exactly the non-contiguous state publish refuses.
  if v_n <> v_total or array_length(p_question_ids, 1) is distinct from v_total then
    raise exception 'teacher_homework_reorder_questions: the list must name all % question(s) of this homework exactly once',
      v_total using errcode = '22023';
  end if;

  update teacher_homework_questions set ordinal = ordinal + 1000000 where homework_id = p_homework;
  update teacher_homework_questions q
     set ordinal = x.pos
    from (select unnest(p_question_ids) as id, generate_series(1, array_length(p_question_ids, 1)) as pos) x
   where q.id = x.id and q.homework_id = p_homework;
end;
$fn$;

-- ── 4 · lifecycle ─────────────────────────────────────────────────────

-- The gate checks ONLY what a CHECK constraint cannot express: facts that span
-- rows. Everything about a single row is already the database's job.
create or replace function teacher_homework_publish(p_homework uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $fn$
declare h teacher_homework%rowtype; v_n int; v_min int; v_max int; v_distinct int; v_bad int;
begin
  if not teacher_homework_is_staff(p_homework) then
    raise exception 'teacher_homework_publish: no such homework, or you are not staff of its class'
      using errcode = '42501';
  end if;
  select * into h from teacher_homework where id = p_homework for update;
  if h.status <> 'draft' then
    raise exception 'teacher_homework_publish: this homework is already %', h.status using errcode = '22023';
  end if;

  -- 1 · a paper with no questions is not a paper (no constraint spans rows)
  select count(*), min(ordinal), max(ordinal), count(distinct ordinal)
    into v_n, v_min, v_max, v_distinct
    from teacher_homework_questions where homework_id = p_homework;
  if v_n = 0 then
    raise exception 'teacher_homework_publish: this homework has no questions' using errcode = '22023';
  end if;

  -- 2 · ordinals are exactly 1..n (also cross-row, also unreachable by CHECK)
  if v_min <> 1 or v_max <> v_n or v_distinct <> v_n then
    raise exception
      'teacher_homework_publish: question numbers must run 1..% with no gaps (found % question(s), numbered % to %)',
      v_n, v_n, v_min, v_max using errcode = '22023';
  end if;

  -- 3 · defence in depth, honestly labelled: the same-homework rule is a
  --     trigger on every write and a stimulus cannot change homework, so this
  --     cannot fail today. It is here so that a future path writing these
  --     tables another way still cannot publish a cross-homework reference.
  select count(*) into v_bad
    from teacher_homework_questions q
    left join teacher_homework_stimuli s on s.id = q.stimulus_id
   where q.homework_id = p_homework and q.stimulus_id is not null
     and (s.id is null or s.homework_id <> p_homework);
  if v_bad > 0 then
    raise exception 'teacher_homework_publish: % question(s) reference a figure from another homework', v_bad
      using errcode = '23503';
  end if;

  -- There is DELIBERATELY no check on due_at. Decision 3 makes it a date and
  -- never a lock, so publishing with it already past is legal — it describes a
  -- homework where every submission will be flagged late, which is a thing a
  -- teacher is allowed to set up. Refusing here would contradict the decision.

  update teacher_homework set status = 'published' where id = p_homework;

  insert into workspace_audit_log (workspace_id, actor_id, action, subject_id, meta)
  values (h.workspace_id, auth.uid(), 'homework_published', null,
          jsonb_build_object('homework_id', p_homework, 'questions', v_n));

  return jsonb_build_object('homework_id', p_homework, 'homework_code', h.homework_code, 'questions', v_n);
end;
$fn$;

-- Closing stops new opens. An attempt already in progress may still finish —
-- that is decision 4, and it is H5's business, not this function's: nothing
-- here touches attempts.
create or replace function teacher_homework_close(p_homework uuid)
returns void
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $fn$
declare h teacher_homework%rowtype;
begin
  if not teacher_homework_is_staff(p_homework) then
    raise exception 'teacher_homework_close: no such homework, or you are not staff of its class'
      using errcode = '42501';
  end if;
  select * into h from teacher_homework where id = p_homework for update;
  if h.status <> 'published' then
    raise exception 'teacher_homework_close: only a published homework can be closed (this one is %)', h.status
      using errcode = '22023';
  end if;

  update teacher_homework set status = 'closed' where id = p_homework;

  insert into workspace_audit_log (workspace_id, actor_id, action, subject_id, meta)
  values (h.workspace_id, auth.uid(), 'homework_closed', null, jsonb_build_object('homework_id', p_homework));
end;
$fn$;

-- Rotation answers a leak: it stops the old code and REVOKES NOTHING. Students
-- already attached stay attached, which is §15.14 and not an oversight.
create or replace function teacher_homework_rotate_code(p_homework uuid)
returns text
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $fn$
declare v_status text; v_ws uuid; v_code text; v_con text; i int;
begin
  if not teacher_homework_is_staff(p_homework) then
    raise exception 'teacher_homework_rotate_code: no such homework, or you are not staff of its class'
      using errcode = '42501';
  end if;
  select status, workspace_id into v_status, v_ws from teacher_homework where id = p_homework;
  if v_status = 'closed' then
    raise exception 'teacher_homework_rotate_code: this homework is closed' using errcode = '22023';
  end if;

  for i in 1..10 loop
    begin
      v_code := teacher_homework_new_code();
      update teacher_homework set homework_code = v_code where id = p_homework;
      exit;
    exception when unique_violation then
      get stacked diagnostics v_con = constraint_name;
      if v_con is distinct from 'teacher_homework_homework_code_key' then raise; end if;
      if i = 10 then
        raise exception 'teacher_homework_rotate_code: could not allocate a free homework code'
          using errcode = '53400';
      end if;
    end;
  end loop;

  insert into workspace_audit_log (workspace_id, actor_id, action, subject_id, meta)
  values (v_ws, auth.uid(), 'homework_code_rotated', null, jsonb_build_object('homework_id', p_homework));

  return v_code;
end;
$fn$;

-- ── 5 · privileges ────────────────────────────────────────────────────
-- The DEFAULT ACL on a function in `public` grants EXECUTE to anon and
-- authenticated. Every function is stripped first, then granted back
-- deliberately — and the two helpers are granted back to nobody.
revoke all on function teacher_homework_new_code()                              from public, anon, authenticated;
revoke all on function teacher_homework_shift_ordinals(uuid, integer)           from public, anon, authenticated;
revoke all on function teacher_homework_create(uuid, text)                      from public, anon, authenticated;
revoke all on function teacher_homework_update(uuid, text, text)                from public, anon, authenticated;
revoke all on function teacher_homework_set_due_at(uuid, timestamptz)           from public, anon, authenticated;
revoke all on function teacher_homework_reveal_answers(uuid)                    from public, anon, authenticated;
revoke all on function teacher_homework_delete(uuid)                            from public, anon, authenticated;
revoke all on function teacher_homework_save_stimulus(uuid, uuid, text, text, text, jsonb, text) from public, anon, authenticated;
revoke all on function teacher_homework_delete_stimulus(uuid)                   from public, anon, authenticated;
revoke all on function teacher_homework_save_question(uuid, uuid, integer, text, text, text, jsonb, text, uuid) from public, anon, authenticated;
revoke all on function teacher_homework_delete_question(uuid)                   from public, anon, authenticated;
revoke all on function teacher_homework_reorder_questions(uuid, uuid[])         from public, anon, authenticated;
revoke all on function teacher_homework_publish(uuid)                           from public, anon, authenticated;
revoke all on function teacher_homework_close(uuid)                             from public, anon, authenticated;
revoke all on function teacher_homework_rotate_code(uuid)                       from public, anon, authenticated;

grant execute on function teacher_homework_create(uuid, text)                   to authenticated;
grant execute on function teacher_homework_update(uuid, text, text)             to authenticated;
grant execute on function teacher_homework_set_due_at(uuid, timestamptz)        to authenticated;
grant execute on function teacher_homework_reveal_answers(uuid)                 to authenticated;
grant execute on function teacher_homework_delete(uuid)                         to authenticated;
grant execute on function teacher_homework_save_stimulus(uuid, uuid, text, text, text, jsonb, text) to authenticated;
grant execute on function teacher_homework_delete_stimulus(uuid)                to authenticated;
grant execute on function teacher_homework_save_question(uuid, uuid, integer, text, text, text, jsonb, text, uuid) to authenticated;
grant execute on function teacher_homework_delete_question(uuid)                to authenticated;
grant execute on function teacher_homework_reorder_questions(uuid, uuid[])      to authenticated;
grant execute on function teacher_homework_publish(uuid)                        to authenticated;
grant execute on function teacher_homework_close(uuid)                          to authenticated;
grant execute on function teacher_homework_rotate_code(uuid)                    to authenticated;

-- ── 6 · verification ──────────────────────────────────────────────────
-- Every assertion names what would breach it, so each one could go red.
do $$
declare
  v_bad text; v_n integer;
  CLIENT constant text[] := array['teacher_homework_create','teacher_homework_update',
    'teacher_homework_set_due_at','teacher_homework_reveal_answers','teacher_homework_delete',
    'teacher_homework_save_stimulus','teacher_homework_delete_stimulus','teacher_homework_save_question',
    'teacher_homework_delete_question','teacher_homework_reorder_questions','teacher_homework_publish',
    'teacher_homework_close','teacher_homework_rotate_code'];
  INTERNAL constant text[] := array['teacher_homework_new_code','teacher_homework_shift_ordinals'];
begin
  -- 6.1 all fifteen exist
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and (p.proname = any (CLIENT) or p.proname = any (INTERNAL));
  if v_n <> 15 then
    raise exception 'H3: expected 15 functions, found %', v_n;
  end if;

  -- 6.2 every client RPC is SECURITY DEFINER with a pinned search_path
  select string_agg(p.proname, ', ') into v_bad
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname = any (CLIENT)
     and (not p.prosecdef or not (p.proconfig @> array['search_path=pg_catalog, public']));
  if v_bad is not null then
    raise exception 'H3: not definer, or search_path not pinned: %', v_bad;
  end if;

  -- 6.3 the thirteen are callable by authenticated
  select string_agg(p.proname, ', ') into v_bad
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname = any (CLIENT)
     and coalesce(array_to_string(p.proacl::text[], ' '), '') not like '%authenticated=X%';
  if v_bad is not null then
    raise exception 'H3: a client RPC is not callable by authenticated: %', v_bad;
  end if;

  -- 6.4 the two helpers are callable by NOBODY, and anon by nothing at all
  select string_agg(p.proname, ', ') into v_bad
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public'
     and ((p.proname = any (INTERNAL) and coalesce(array_to_string(p.proacl::text[], ' '), '') like '%authenticated=X%')
          or ((p.proname = any (CLIENT) or p.proname = any (INTERNAL))
              and coalesce(array_to_string(p.proacl::text[], ' '), '') like '%anon=X%'));
  if v_bad is not null then
    raise exception 'H3: a helper is client-callable, or anon holds EXECUTE: %', v_bad;
  end if;

  -- 6.5 H2's staff helper was NOT redefined by this file
  if (select md5(p.prosrc) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname='teacher_homework_is_staff')
     <> '63ef7fa28bf3a0c48bd6658abd11009a' then
    raise exception 'H3: teacher_homework_is_staff() was redefined — it belongs to 20260902c';
  end if;

  -- 6.6 the H3/H4/H5 boundary, in the only form that is actually true after
  --     the delete fix. H3 may not WRITE access, attempts or responses — those
  --     are H4's and H5's tables. It does READ two of them, in exactly one
  --     place: teacher_homework_delete() counts attachments and attempts so it
  --     can refuse with a message naming what is in the way (§15.16a). A read
  --     whose only outcome is a refusal is not a student surface; a write is.
  --     An earlier draft of this file forbade the mention rather than the
  --     write, and the production dry-run refused to install it — which is
  --     what a dry-run is for.
  select string_agg(p.proname, ', ') into v_bad
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and (p.proname = any (CLIENT) or p.proname = any (INTERNAL))
     and p.prosrc ~ '(insert\s+into|update|delete\s+from)\s+teacher_homework_(access|attempts|responses)';
  if v_bad is not null then
    raise exception 'H3: a function WRITES a student table: %', v_bad;
  end if;
  -- and the read stays confined to the one function that needs it
  select string_agg(p.proname, ', ') into v_bad
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and (p.proname = any (CLIENT) or p.proname = any (INTERNAL))
     and p.prosrc ~ 'teacher_homework_(access|attempts|responses)'
     and p.proname <> 'teacher_homework_delete';
  if v_bad is not null then
    raise exception 'H3: a function other than the delete pre-check reads a student table: %', v_bad;
  end if;

  -- 6.7 only the five labels this increment may write, and never homework_attached
  select string_agg(p.proname, ', ') into v_bad
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and (p.proname = any (CLIENT) or p.proname = any (INTERNAL))
     and p.prosrc ~ 'homework_attached';
  if v_bad is not null then
    raise exception 'H3: homework_attached belongs to H4, written in: %', v_bad;
  end if;

  -- 6.7b the reveal label must exist before this file can write it. Without
  -- 20260903a applied the RPC would fail at RUNTIME, on a teacher, rather than
  -- here — so refuse to install a function that cannot work.
  if not exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
                  where t.typname = 'workspace_audit_action'
                    and e.enumlabel = 'homework_answers_revealed') then
    raise exception 'H3: workspace_audit_action has no homework_answers_revealed label — apply 20260903a first';
  end if;

  -- 6.7c the reveal writes its row only when the latch actually moved
  if (select p.prosrc from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname='teacher_homework_reveal_answers')
     !~ 'and not reveal_answers' then
    raise exception 'H3: teacher_homework_reveal_answers() would log a repeated reveal as a fresh event';
  end if;

  -- 6.7d the delete removes its content itself rather than trusting a cascade
  --      that fails closed (§15.16a)
  if (select p.prosrc from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname='teacher_homework_delete')
     !~ 'delete from teacher_homework_questions where homework_id' then
    raise exception 'H3: teacher_homework_delete() relies on the cascade, which cannot delete a draft with content';
  end if;

  -- 6.8 the latch RPC takes no boolean, so un-revealing is unrepresentable.
  --     Read as an ordered list of argument TYPES. An earlier version of this
  --     line compared pg_get_function_identity_arguments() against 'uuid',
  --     which that function never returns — it includes the parameter NAME
  --     ('p_homework uuid'). The check could therefore only ever raise, so the
  --     file could not install at all; the production dry-run is what found
  --     it. A check that cannot go green is as useless as one that cannot go
  --     red, and rather more expensive.
  if (select coalesce(array_to_string(array(select t::regtype::text from unnest(p.proargtypes) t), ','), '')
        from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname='teacher_homework_reveal_answers') <> 'uuid' then
    raise exception 'H3: teacher_homework_reveal_answers() takes % rather than just the homework id',
      (select pg_get_function_identity_arguments(p.oid) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
        where n.nspname='public' and p.proname='teacher_homework_reveal_answers');
  end if;
  if (select p.prosrc from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname='teacher_homework_reveal_answers') ~ 'reveal_answers\s*=\s*false' then
    raise exception 'H3: teacher_homework_reveal_answers() can set the latch back to false';
  end if;
  -- And it must not read status AT ALL. §15.15b's exception is that a CLOSED
  -- homework may still reveal; a gate of any spelling would take that back, so
  -- the check forbids the word rather than one way of writing it. Comments are
  -- stripped first, as elsewhere, so this tests the code and not the prose.
  if (select regexp_replace(p.prosrc, '--[^' || chr(10) || ']*', '', 'g')
        from pg_proc p join pg_namespace n on n.oid=p.pronamespace
       where n.nspname='public' and p.proname='teacher_homework_reveal_answers') ~ '\mstatus\M' then
    raise exception 'H3: teacher_homework_reveal_answers() reads status — a closed homework could no longer be revealed';
  end if;

  -- 6.9 this file creates no table, policy or type
  select count(*) into v_n from pg_class c join pg_namespace n on n.oid=c.relnamespace
   where n.nspname='public' and c.relname like 'teacher\_homework%' and c.relkind='r';
  if v_n <> 6 then
    raise exception 'H3: the homework table count changed (found %) — this increment adds none', v_n;
  end if;
  select count(*) into v_n from pg_policy p join pg_class c on c.oid=p.polrelid where c.relname like 'teacher\_homework%';
  if v_n <> 9 then
    raise exception 'H3: the homework policy count changed (found %) — this increment adds none', v_n;
  end if;
end $$;

commit;
