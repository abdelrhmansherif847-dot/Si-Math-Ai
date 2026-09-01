-- =====================================================================
-- Teacher Exams, increment 3c — authoring, and the publish gate
-- =====================================================================
-- STATUS: 🟡 PREPARED — NOT APPLIED. Dry-run only, inside a rollback.
--
-- SCOPE. Ten RPCs that let a teacher or an ACTIVE assistant build a paper and
-- publish it, plus one internal helper. No table, column, policy or grant
-- changes: 3b is live and this increment does not touch it.
--
-- NOT IN 3c, and each one is a deliberate line rather than an oversight:
--   * the student side entirely — no code lookup, no access request, no
--     approval queue, no rate limit, no sitting, no save, no submit (3d/3e);
--   * teacher_exam_rotate_code(). Generation lives here because exam_code is
--     NOT NULL and create cannot exist without it. ROTATION does not: its whole
--     meaning is "stops future code-based requests and revokes nothing", and
--     until 3d there are no requests, so nothing about that sentence can be
--     tested. An RPC whose behaviour cannot be observed is untested surface.
--     3b's guard already permits the update, so 3d adds the RPC and nothing else.
--
-- WHAT IS REUSED
--   teacher_exam_is_staff(exam_id)   the 3b authority. Role-blind, so teacher
--                                    and active assistant have identical
--                                    academic power — a locked decision.
--   workspace_is_active_staff(ws)    for create, where there is no exam yet.
--   The four shared validators are NOT called here. They are already CHECK
--   constraints on the tables; calling them again in an RPC would be a second
--   copy of the rule that could drift from the first.
--
-- STILL ABSENT, STILL DELIBERATE: no difficulty, topic_id, subtopic_id, skill,
-- content_origin or originality attestation reaches these tables. Nothing here
-- writes weakness_signals, exam_mistakes or exam_practice_sessions, and no
-- statement below names any of them.
-- =====================================================================

begin;

-- ── 1 · the code generator, with the retry the class codes never had ──
-- workspace_new_code() draws 8 of 32 symbols and does NOT retry on collision,
-- so a duplicate surfaces to the caller as a raw 23505. With one workspace that
-- is theoretical; exam codes multiply per EXAM, so the same generator used
-- unchanged would make a latent bug reachable. Fixing workspace_new_code() is a
-- separate increment by decision — this one keeps its own.
--
-- The retry lives in teacher_exam_create() around the INSERT itself rather than
-- around a SELECT ... WHERE NOT EXISTS, because only the INSERT is race-free:
-- a check-then-insert can lose to a concurrent transaction between the two.
create or replace function teacher_exam_new_code()
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

revoke all on function teacher_exam_new_code() from public, anon, authenticated;

-- ── 2 · create ───────────────────────────────────────────────────────
create or replace function teacher_exam_create(
  p_workspace          uuid,
  p_title              text,
  p_duration_minutes   integer,
  p_calculator_allowed boolean default true
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $fn$
declare
  v_id   uuid;
  v_code text;
  v_con  text;
  i      int;
begin
  if auth.uid() is null then
    raise exception 'teacher_exam_create: sign in first' using errcode = '42501';
  end if;
  if not workspace_is_active_staff(p_workspace) then
    raise exception 'teacher_exam_create: you are not active staff of that class'
      using errcode = '42501';
  end if;

  for i in 1..10 loop
    begin
      v_code := teacher_exam_new_code();
      insert into teacher_exams
        (workspace_id, title, exam_code, duration_minutes, calculator_allowed, created_by)
      values
        (p_workspace, btrim(p_title), v_code, p_duration_minutes,
         coalesce(p_calculator_allowed, true), auth.uid())
      returning id into v_id;
      exit;
    exception when unique_violation then
      get stacked diagnostics v_con = constraint_name;
      -- Only a code collision is retryable. Anything else unique is a real
      -- error and must not be swallowed by a loop that looks like a retry.
      if v_con is distinct from 'teacher_exams_exam_code_key' then
        raise;
      end if;
      if i = 10 then
        raise exception 'teacher_exam_create: could not allocate a free exam code'
          using errcode = '53400';
      end if;
    end;
  end loop;

  insert into workspace_audit_log (workspace_id, actor_id, action, subject_id, meta)
  values (p_workspace, auth.uid(), 'exam_created', null, jsonb_build_object('exam_id', v_id));

  return jsonb_build_object('exam_id', v_id, 'exam_code', v_code);
end;
$fn$;

-- ── 3 · edit the paper's metadata ─────────────────────────────────────
-- Every field is required rather than "null means leave alone", because three
-- of them are legitimately nullable and a patch-style API cannot express
-- "clear the instructions" at all. This is a form save: the client holds the
-- whole record and sends it back.
create or replace function teacher_exam_update(
  p_exam               uuid,
  p_title              text,
  p_instructions       text,
  p_duration_minutes   integer,
  p_calculator_allowed boolean,
  p_opens_at           timestamptz,
  p_closes_at          timestamptz
)
returns void
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $fn$
declare v_status text;
begin
  if not teacher_exam_is_staff(p_exam) then
    -- One message for "no such exam" and "not your class". The id is a uuid so
    -- this is not much of an oracle either way, but the house rule is that a
    -- refusal never tells you which of the two it was.
    raise exception 'teacher_exam_update: no such exam, or you are not staff of its class'
      using errcode = '42501';
  end if;
  select status into v_status from teacher_exams where id = p_exam;
  if v_status <> 'draft' then
    raise exception 'teacher_exam_update: this exam is % and its paper is fixed', v_status
      using errcode = '42501';
  end if;

  update teacher_exams
     set title              = btrim(p_title),
         instructions       = nullif(btrim(coalesce(p_instructions, '')), ''),
         duration_minutes   = p_duration_minutes,
         calculator_allowed = coalesce(p_calculator_allowed, true),
         opens_at           = p_opens_at,
         closes_at          = p_closes_at
   where id = p_exam;
end;
$fn$;

-- ── 4 · delete a draft ────────────────────────────────────────────────
-- No audit event: 3a deliberately shipped no exam_deleted label, because at
-- that point nothing had established that a draft could be deleted. It has
-- now, so whether an assistant deleting a teacher's draft deserves a trail is
-- a real question — deliberately left open rather than answered by adding an
-- irreversible enum label in passing.
create or replace function teacher_exam_delete(p_exam uuid)
returns void
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $fn$
declare v_status text;
begin
  if not teacher_exam_is_staff(p_exam) then
    raise exception 'teacher_exam_delete: no such exam, or you are not staff of its class'
      using errcode = '42501';
  end if;
  select status into v_status from teacher_exams where id = p_exam;
  if v_status <> 'draft' then
    raise exception 'teacher_exam_delete: this exam is % — close it, do not delete it', v_status
      using errcode = '42501';
  end if;
  -- The 3b guard refuses a non-draft delete too. Checking here as well is not
  -- duplication for its own sake: it turns a trigger's message into one the
  -- caller can act on, and the guard remains the thing that cannot be bypassed.
  delete from teacher_exams where id = p_exam;
end;
$fn$;

-- ── 5 · stimuli ──────────────────────────────────────────────────────
-- p_stimulus null inserts, otherwise updates that stimulus of THIS exam.
--
-- media_sha256 is COMPUTED here and any client value is ignored. A hash the
-- client supplies is a hash of whatever the client felt like saying; computed
-- server-side it is actually a fingerprint of the stored bytes. The decode also
-- doubles as validation — bytes that are not really base64 fail here rather
-- than at render time in front of a student.
create or replace function teacher_exam_save_stimulus(
  p_exam      uuid,
  p_stimulus  uuid,
  p_kind      text,
  p_label     text default null,
  p_body      text default null,
  p_spec      jsonb default null,
  p_media_ref text default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $fn$
declare
  v_status text;
  v_id     uuid;
  v_kind   text := null;
  v_sha    text := null;
  v_head   text;
begin
  if not teacher_exam_is_staff(p_exam) then
    raise exception 'teacher_exam_save_stimulus: no such exam, or you are not staff of its class'
      using errcode = '42501';
  end if;
  select status into v_status from teacher_exams where id = p_exam;
  if v_status <> 'draft' then
    raise exception 'teacher_exam_save_stimulus: this exam is % and its content is fixed', v_status
      using errcode = '42501';
  end if;

  if p_media_ref is not null then
    begin
      v_sha  := encode(sha256(decode(p_media_ref, 'base64')), 'hex');
      v_head := left(convert_from(decode(p_media_ref, 'base64'), 'UTF8'), 400);
    exception when others then
      raise exception 'teacher_exam_save_stimulus: the figure is not valid base64 text'
        using errcode = '22023';
    end;
    -- A cheap sniff, not a parser. It catches the overwhelmingly common
    -- authoring mistake — pasting a PNG, a URL or raw markup — while the real
    -- safety property lives in the renderer, which emits a figure as
    -- <img src="data:image/svg+xml;base64,...">. An SVG loaded through <img>
    -- cannot run script or reach the page, so a hostile file is inert even if
    -- it gets past this line.
    if v_head !~* '<svg' then
      raise exception 'teacher_exam_save_stimulus: that figure does not look like an SVG'
        using errcode = '22023';
    end if;
    v_kind := 'svg';
  end if;

  if p_stimulus is null then
    insert into teacher_exam_stimuli (exam_id, kind, label, body, spec, media_ref, media_kind, media_sha256)
    values (p_exam, p_kind, nullif(btrim(coalesce(p_label, '')), ''), p_body, p_spec,
            p_media_ref, v_kind, v_sha)
    returning id into v_id;
  else
    update teacher_exam_stimuli
       set kind = p_kind,
           label = nullif(btrim(coalesce(p_label, '')), ''),
           body = p_body,
           spec = p_spec,
           media_ref = p_media_ref,
           media_kind = v_kind,
           media_sha256 = v_sha
     where id = p_stimulus and exam_id = p_exam
     returning id into v_id;
    if v_id is null then
      raise exception 'teacher_exam_save_stimulus: that stimulus is not part of this exam'
        using errcode = '22023';
    end if;
  end if;
  return v_id;
end;
$fn$;

create or replace function teacher_exam_delete_stimulus(p_stimulus uuid)
returns void
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $fn$
declare v_exam uuid; v_status text; v_used int;
begin
  select exam_id into v_exam from teacher_exam_stimuli where id = p_stimulus;
  if v_exam is null or not teacher_exam_is_staff(v_exam) then
    raise exception 'teacher_exam_delete_stimulus: no such stimulus, or you are not staff of its class'
      using errcode = '42501';
  end if;
  select status into v_status from teacher_exams where id = v_exam;
  if v_status <> 'draft' then
    raise exception 'teacher_exam_delete_stimulus: this exam is % and its content is fixed', v_status
      using errcode = '42501';
  end if;

  -- The foreign key is ON DELETE RESTRICT, so this is already impossible. The
  -- point of asking first is the message: a raw FK violation tells a teacher
  -- nothing about which questions are still using the figure.
  select count(*) into v_used from teacher_exam_questions where stimulus_id = p_stimulus;
  if v_used > 0 then
    raise exception 'teacher_exam_delete_stimulus: % question(s) still use this figure', v_used
      using errcode = '23503';
  end if;

  delete from teacher_exam_stimuli where id = p_stimulus;
end;
$fn$;

-- ── 6 · questions ────────────────────────────────────────────────────
create or replace function teacher_exam_save_question(
  p_exam           uuid,
  p_question       uuid,
  p_ordinal        integer,
  p_prompt         text,
  p_format         text,
  p_correct_answer text,
  p_choices        jsonb default null,
  p_explanation    text default null,
  p_stimulus       uuid default null
)
returns uuid
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $fn$
declare v_status text; v_id uuid;
begin
  if not teacher_exam_is_staff(p_exam) then
    raise exception 'teacher_exam_save_question: no such exam, or you are not staff of its class'
      using errcode = '42501';
  end if;
  select status into v_status from teacher_exams where id = p_exam;
  if v_status <> 'draft' then
    raise exception 'teacher_exam_save_question: this exam is % and its content is fixed', v_status
      using errcode = '42501';
  end if;

  -- The same-exam rule is a trigger and cannot be bypassed; asking here only
  -- buys a better message than a 23503 from the guard.
  if p_stimulus is not null
     and not exists (select 1 from teacher_exam_stimuli
                      where id = p_stimulus and exam_id = p_exam) then
    raise exception 'teacher_exam_save_question: that figure belongs to a different exam'
      using errcode = '23503';
  end if;

  if p_question is null then
    insert into teacher_exam_questions
      (exam_id, ordinal, prompt, question_format, choices, correct_answer, explanation, stimulus_id)
    values
      (p_exam, p_ordinal, p_prompt, p_format, p_choices, p_correct_answer,
       nullif(btrim(coalesce(p_explanation, '')), ''), p_stimulus)
    returning id into v_id;
  else
    update teacher_exam_questions
       set ordinal = p_ordinal, prompt = p_prompt, question_format = p_format,
           choices = p_choices, correct_answer = p_correct_answer,
           explanation = nullif(btrim(coalesce(p_explanation, '')), ''),
           stimulus_id = p_stimulus
     where id = p_question and exam_id = p_exam
     returning id into v_id;
    if v_id is null then
      raise exception 'teacher_exam_save_question: that question is not part of this exam'
        using errcode = '22023';
    end if;
  end if;
  return v_id;
end;
$fn$;

-- Deleting closes the gap it leaves, because publish requires 1..n contiguous
-- and a teacher who deletes question 2 of 5 should not then have to renumber
-- three questions by hand to be allowed to publish.
create or replace function teacher_exam_delete_question(p_question uuid)
returns void
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $fn$
declare v_exam uuid; v_status text; v_ord integer;
begin
  select exam_id, ordinal into v_exam, v_ord from teacher_exam_questions where id = p_question;
  if v_exam is null or not teacher_exam_is_staff(v_exam) then
    raise exception 'teacher_exam_delete_question: no such question, or you are not staff of its class'
      using errcode = '42501';
  end if;
  select status into v_status from teacher_exams where id = v_exam;
  if v_status <> 'draft' then
    raise exception 'teacher_exam_delete_question: this exam is % and its content is fixed', v_status
      using errcode = '42501';
  end if;

  delete from teacher_exam_questions where id = p_question;
  perform teacher_exam_shift_ordinals(v_exam, v_ord);
end;
$fn$;

-- Closing a gap, and reordering, both have to move several rows through a
-- UNIQUE(exam_id, ordinal) that is checked per row and not deferrable. Doing it
-- in one UPDATE would depend on the order PostgreSQL happens to touch rows in.
-- So both go via a two-phase park: lift every affected row clear of the live
-- range, then set the final numbers.
create or replace function teacher_exam_shift_ordinals(p_exam uuid, p_from integer)
returns void
language plpgsql
volatile
set search_path = pg_catalog, public
as $fn$
begin
  update teacher_exam_questions set ordinal = ordinal + 1000000
   where exam_id = p_exam and ordinal > p_from;
  update teacher_exam_questions set ordinal = ordinal - 1000000 - 1
   where exam_id = p_exam and ordinal > 1000000;
end;
$fn$;

revoke all on function teacher_exam_shift_ordinals(uuid, integer) from public, anon, authenticated;

create or replace function teacher_exam_reorder_questions(p_exam uuid, p_question_ids uuid[])
returns void
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $fn$
declare v_status text; v_n int; v_total int;
begin
  if not teacher_exam_is_staff(p_exam) then
    raise exception 'teacher_exam_reorder_questions: no such exam, or you are not staff of its class'
      using errcode = '42501';
  end if;
  select status into v_status from teacher_exams where id = p_exam;
  if v_status <> 'draft' then
    raise exception 'teacher_exam_reorder_questions: this exam is % and its content is fixed', v_status
      using errcode = '42501';
  end if;

  select count(*) into v_total from teacher_exam_questions where exam_id = p_exam;
  select count(*) into v_n from teacher_exam_questions
   where exam_id = p_exam and id = any (p_question_ids);
  -- A partial list would silently leave some questions behind at their old
  -- numbers and produce exactly the non-contiguous state publish refuses.
  if v_n <> v_total or array_length(p_question_ids, 1) is distinct from v_total then
    raise exception 'teacher_exam_reorder_questions: the list must name all % question(s) of this exam exactly once',
      v_total using errcode = '22023';
  end if;

  update teacher_exam_questions set ordinal = ordinal + 1000000 where exam_id = p_exam;
  update teacher_exam_questions q
     set ordinal = x.pos
    from (select unnest(p_question_ids) as id, generate_series(1, array_length(p_question_ids, 1)) as pos) x
   where q.id = x.id and q.exam_id = p_exam;
end;
$fn$;

-- ── 7 · publish ──────────────────────────────────────────────────────
-- Deliberately NOT publish_exam_form(). That gate is service_role, not
-- SECURITY DEFINER, so a teacher in a browser cannot call it; it demands a
-- module/variant structural expectation that is an operator artifact; and it
-- requires a difficulty and an originality attestation on every question,
-- neither of which a teacher-authored item has or should have.
--
-- What this gate checks is exactly what a CHECK constraint CANNOT express.
-- Everything a constraint already enforces — formats, choices, answer keys,
-- stimulus shapes and specs — is deliberately not re-asserted here. Re-checking
-- it would add lines that cannot go red, and a green check that could never
-- have failed is not evidence of anything.
create or replace function teacher_exam_publish(p_exam uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $fn$
declare
  e teacher_exams%rowtype;
  v_n int; v_min int; v_max int; v_distinct int; v_bad int;
begin
  if not teacher_exam_is_staff(p_exam) then
    raise exception 'teacher_exam_publish: no such exam, or you are not staff of its class'
      using errcode = '42501';
  end if;
  select * into e from teacher_exams where id = p_exam for update;
  if e.status <> 'draft' then
    raise exception 'teacher_exam_publish: this exam is already %', e.status using errcode = '22023';
  end if;

  -- 1 · a paper with no questions is not a paper (no constraint spans rows)
  select count(*), min(ordinal), max(ordinal), count(distinct ordinal)
    into v_n, v_min, v_max, v_distinct
    from teacher_exam_questions where exam_id = p_exam;
  if v_n = 0 then
    raise exception 'teacher_exam_publish: this exam has no questions' using errcode = '22023';
  end if;

  -- 2 · ordinals are exactly 1..n (also cross-row, also unreachable by CHECK)
  if v_min <> 1 or v_max <> v_n or v_distinct <> v_n then
    raise exception
      'teacher_exam_publish: question numbers must run 1..% with no gaps (found % question(s), numbered % to %)',
      v_n, v_n, v_min, v_max using errcode = '22023';
  end if;

  -- 3 · a window already past would publish something nobody can ever sit.
  --     Time-dependent, so a CHECK cannot express it.
  if e.closes_at is not null and e.closes_at <= now() then
    raise exception 'teacher_exam_publish: this exam closes in the past' using errcode = '22023';
  end if;

  -- 4 · the window must be long enough to hold the paper. Publishing a 45
  --     minute exam into a 20 minute window is not a policy choice, it is an
  --     exam nobody can finish.
  if e.opens_at is not null and e.closes_at is not null
     and e.closes_at - e.opens_at < make_interval(mins => e.duration_minutes) then
    raise exception
      'teacher_exam_publish: the window is shorter than the % minute duration', e.duration_minutes
      using errcode = '22023';
  end if;

  -- 5 · defence in depth, and honestly labelled: the same-exam rule is a
  --     trigger on every write and a stimulus cannot change exams, so this
  --     cannot fail today. It is here so that a future path which writes these
  --     tables another way still cannot publish a cross-exam reference.
  select count(*) into v_bad
    from teacher_exam_questions q
    left join teacher_exam_stimuli s on s.id = q.stimulus_id
   where q.exam_id = p_exam and q.stimulus_id is not null
     and (s.id is null or s.exam_id <> p_exam);
  if v_bad > 0 then
    raise exception 'teacher_exam_publish: % question(s) reference a figure from another exam', v_bad
      using errcode = '23503';
  end if;

  update teacher_exams set status = 'published' where id = p_exam;

  insert into workspace_audit_log (workspace_id, actor_id, action, subject_id, meta)
  values (e.workspace_id, auth.uid(), 'exam_published', null,
          jsonb_build_object('exam_id', p_exam, 'questions', v_n));

  return jsonb_build_object('exam_id', p_exam, 'exam_code', e.exam_code, 'questions', v_n);
end;
$fn$;

-- ── 8 · close ────────────────────────────────────────────────────────
create or replace function teacher_exam_close(p_exam uuid)
returns void
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $fn$
declare e teacher_exams%rowtype;
begin
  if not teacher_exam_is_staff(p_exam) then
    raise exception 'teacher_exam_close: no such exam, or you are not staff of its class'
      using errcode = '42501';
  end if;
  select * into e from teacher_exams where id = p_exam for update;
  if e.status <> 'published' then
    raise exception 'teacher_exam_close: only a published exam can be closed (this one is %)', e.status
      using errcode = '22023';
  end if;

  update teacher_exams set status = 'closed' where id = p_exam;

  insert into workspace_audit_log (workspace_id, actor_id, action, subject_id, meta)
  values (e.workspace_id, auth.uid(), 'exam_closed', null, jsonb_build_object('exam_id', p_exam));
end;
$fn$;

-- ── 9 · ACLs ─────────────────────────────────────────────────────────
-- The default ACL on a function in `public` grants EXECUTE to anon and
-- authenticated. Every one is stripped and granted back deliberately; the two
-- internal helpers are granted to nobody.
revoke all on function teacher_exam_create(uuid, text, integer, boolean) from public, anon, authenticated;
revoke all on function teacher_exam_update(uuid, text, text, integer, boolean, timestamptz, timestamptz) from public, anon, authenticated;
revoke all on function teacher_exam_delete(uuid) from public, anon, authenticated;
revoke all on function teacher_exam_save_stimulus(uuid, uuid, text, text, text, jsonb, text) from public, anon, authenticated;
revoke all on function teacher_exam_delete_stimulus(uuid) from public, anon, authenticated;
revoke all on function teacher_exam_save_question(uuid, uuid, integer, text, text, text, jsonb, text, uuid) from public, anon, authenticated;
revoke all on function teacher_exam_delete_question(uuid) from public, anon, authenticated;
revoke all on function teacher_exam_reorder_questions(uuid, uuid[]) from public, anon, authenticated;
revoke all on function teacher_exam_publish(uuid) from public, anon, authenticated;
revoke all on function teacher_exam_close(uuid) from public, anon, authenticated;

grant execute on function teacher_exam_create(uuid, text, integer, boolean) to authenticated;
grant execute on function teacher_exam_update(uuid, text, text, integer, boolean, timestamptz, timestamptz) to authenticated;
grant execute on function teacher_exam_delete(uuid) to authenticated;
grant execute on function teacher_exam_save_stimulus(uuid, uuid, text, text, text, jsonb, text) to authenticated;
grant execute on function teacher_exam_delete_stimulus(uuid) to authenticated;
grant execute on function teacher_exam_save_question(uuid, uuid, integer, text, text, text, jsonb, text, uuid) to authenticated;
grant execute on function teacher_exam_delete_question(uuid) to authenticated;
grant execute on function teacher_exam_reorder_questions(uuid, uuid[]) to authenticated;
grant execute on function teacher_exam_publish(uuid) to authenticated;
grant execute on function teacher_exam_close(uuid) to authenticated;

-- ── 10 · verification ────────────────────────────────────────────────
do $$
declare
  v_bad text;
  FNS constant text[] := array[
    'teacher_exam_create', 'teacher_exam_update', 'teacher_exam_delete',
    'teacher_exam_save_stimulus', 'teacher_exam_delete_stimulus',
    'teacher_exam_save_question', 'teacher_exam_delete_question',
    'teacher_exam_reorder_questions', 'teacher_exam_publish', 'teacher_exam_close'];
begin
  -- every client RPC is definer with a pinned search_path
  select string_agg(p.proname, ', ') into v_bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = any (FNS)
     and (not p.prosecdef
          or coalesce(array_to_string(p.proconfig, ','), '') !~ 'search_path=pg_catalog, public');
  if v_bad is not null then
    raise exception '3c: not definer, or search_path unpinned: %', v_bad;
  end if;

  -- nothing anywhere in this increment is reachable by anon or PUBLIC
  select string_agg(p.proname, ', ') into v_bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname like 'teacher\_exam%'
     and (p.proacl is null
          or exists (select 1 from unnest(p.proacl) a
                      where a::text like '=%' or a::text like 'anon=%'));
  if v_bad is not null then
    raise exception '3c: reachable by public or anon: %', v_bad;
  end if;

  -- the two helpers are granted to NOBODY
  select string_agg(p.proname, ', ') into v_bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('teacher_exam_new_code', 'teacher_exam_shift_ordinals')
     and exists (select 1 from unnest(p.proacl) a where a::text like 'authenticated=%');
  if v_bad is not null then
    raise exception '3c: an internal helper is client-callable: %', v_bad;
  end if;

  -- 3b is untouched: still no client write privilege on any table
  select string_agg(distinct g.table_name || '.' || g.privilege_type, ', ') into v_bad
    from information_schema.role_table_grants g
   where g.table_schema = 'public' and g.table_name like 'teacher\_exam%'
     and g.grantee in ('anon', 'authenticated') and g.privilege_type <> 'SELECT';
  if v_bad is not null then
    raise exception '3c: 3b was altered — a client role gained a write privilege: %', v_bad;
  end if;
end $$;

commit;
