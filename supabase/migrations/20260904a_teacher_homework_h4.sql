-- =====================================================================
-- Teacher Homework, increment H4 — the student attaches
-- =====================================================================
-- STATUS: 🟡 PREPARED, not applied. Apply only with explicit owner approval
--         (CLAUDE.md §3). Rollback: 20260904z.
-- DEPENDS ON: H2 (the six tables, LIVE 2026-09-03) and H3 (the authoring RPCs,
--             LIVE 2026-09-03 as 20260903175957). The audit label this file
--             writes, homework_attached, has existed since 20260902a — so
--             unlike H3 this increment needs NO enum migration and is ONE
--             file, applied in one transaction.
-- CONTEXT: docs/roadmap/teacher-intelligence-layer.md §15.14 (the access
--          model), §15.15 (the six locked decisions) and §15.17 (this
--          increment's audit, and the two approved additions).
--
-- ⚠️ THIS FILE REDEFINES THREE LIVE FUNCTIONS: teacher_homework_create(),
--    teacher_homework_rotate_code() and teacher_homework_delete(), all three
--    installed by 20260903b. It is the hazard 20260831e is remembered for.
--    Never re-apply this file without first diffing all three against
--    production — §7 below asserts each one consults the reservation, and
--    20260904z restores the H3 bodies byte-for-byte.
--
-- WHAT THIS IS. The first student write path in the homework system. A student
-- types a Homework Code and is attached at once — no queue, no approval. That
-- asymmetry with Teacher Exams is §15.14's, and it is deliberate: homework is
-- practice, an exam is graded.
--
-- WHAT IT IS NOT. No open, no save, no submit, no grading, no results, no
-- feedback. Those are H5. This file writes teacher_homework_access and nothing
-- else student-shaped: §6 asserts it never writes attempts or responses.
--
-- THE ATTACH ORDER IS THE CONTRACT, AND IT IS NOT AN IMPLEMENTATION DETAIL
-- -----------------------------------------------------------------------
--     1. signed in
--     2. rate limit                 <- BEFORE the code is looked at
--     3. resolve a PUBLISHED homework
--     4. not active staff of that class
--     5. an ACTIVE member of that class
--     6. attach
--     7. audit, once
--
-- Step 2 precedes step 3 for the reason the exam RPC records: a limit checked
-- after resolution answers a different question for a real code than for a
-- fake one, and that difference is an oracle. Steps 3 and 5 return ONE reason
-- for the same reason — see the note on that reason below.
--
-- WHY AN EXPECTED REFUSAL IS RETURNED AND NOT RAISED
-- --------------------------------------------------
-- MEASURED on production before this function was written: a row inserted by
-- a plpgsql function that then RAISES does not survive the raise — the insert
-- is rolled back with it (0 rows), while the same insert followed by a RETURN
-- survives (1 row). An attach that recorded its attempt and then raised
-- 'that code did not match' would therefore roll back the very row the
-- limiter exists to keep, and would silently reproduce the exam limiter's
-- blind spot: only successes counted. That is the defect this increment was
-- approved to fix, so every EXPECTED outcome — no match, not a member, staff
-- — is RETURNED as {ok:false, reason:...} and the transaction commits with
-- the attempt recorded.
--
-- The rate limit is the one refusal that still RAISES, and that is deliberate
-- too: the raise rolls back this call's own attempt row, so a caller who is
-- already throttled cannot grow the table by hammering it. The limit still
-- holds from the rows already recorded.
--
-- TWO NEW TABLES, AND WHY EACH EXISTS
-- -----------------------------------
-- Both were approved after the H4 audit measured the problems they solve.
-- Neither is client-readable: RLS on, no policy, no grant to anon or
-- authenticated, every access through SECURITY DEFINER. That posture is not
-- new — ai_model_calls, ai_tutor_failures, platform_cost_entries and
-- verification_decisions already live that way in this database.
--
--   teacher_homework_retired_codes
--       MEASURED HAZARD (§15.17): rotating a homework code frees the old
--       value. Nothing reserved it, and a DIFFERENT homework could then be
--       given that exact code — demonstrated on production, accepted. A
--       student still holding the old code would attach to the wrong paper
--       while doing nothing wrong.
--
--       THE INVARIANT, and it is stronger than the hazard that prompted it:
--
--           ONCE A HOMEWORK CODE HAS EXISTED, IT NEVER BECOMES AVAILABLE AGAIN.
--
--       So a code leaves circulation by BOTH exits, not just rotation:
--           create        the code is taken, and held by the row itself
--           rotate        the old code is retired, permanently
--           delete draft  the code is retired BEFORE the row goes
--       Deletion is included even though a draft's code grants nothing: a
--       draft code can still have been read aloud, photographed or forwarded,
--       and reissuing it later produces exactly the wrong-paper attachment
--       this table exists to prevent. Published and draft are not
--       distinguished, because code identity has nothing to do with status.
--
--       Retirement is PERMANENT and deliberately not a TTL: the code space is
--       32^8 (~1.1e12), so recycling buys nothing and risks everything.
--
--       Both exits are atomic. Rotation writes the new code and the
--       reservation in one transaction; deletion writes the reservation and
--       removes the row in one. There is therefore no instant at which a code
--       is neither held by a live homework nor reserved, which is what makes
--       a concurrent create unable to slip between them.
--
--       WHAT ENFORCES IT. The three RPCs enforce it on every path a client can
--       reach, and teacher_homework_code_guard() — a BEFORE INSERT OR
--       UPDATE OF homework_code trigger on teacher_homework, §2b below —
--       enforces it in the database itself.
--
--       The trigger exists because the first version of this file did not have
--       one, and the dry-run measured the consequence: a raw INSERT carrying a
--       retired code was ACCEPTED, because the UNIQUE on homework_code cannot
--       see the reservation table and a CHECK may not subquery. Clients hold
--       no INSERT on teacher_homework, so nothing reachable today could do it
--       — but an invariant that depends on nobody currently holding a grant is
--       an application rule wearing a database rule's clothes, and this
--       project prefers the real thing (H2 chose composite foreign keys over a
--       trigger for the same reason).
--
--       The trigger covers BOTH ways a code can arrive on a row: INSERT, and
--       UPDATE OF homework_code. An earlier version was INSERT-only, which
--       left the identical hole through a different door — a raw UPDATE to a
--       retired value — and an invariant enforced on one write verb but not
--       the other is not enforced. `UPDATE OF homework_code` keeps the guard
--       off every other update the table takes (title, due_at, status, the
--       reveal latch), so H2's own lifecycle is untouched.
--
--       Rotation still works, and the order is why: the RPC installs the NEW
--       code first — which is not retired, so the guard passes — and retires
--       the OLD one afterwards. Rotating A to B and later back to A is
--       therefore refused, which is the invariant doing its job rather than a
--       regression.
--
--   teacher_homework_attach_attempts
--       MEASURED GAP (§15.17): the exam limiter counts ROWS CREATED in
--       teacher_exam_access, so a wrong code creates nothing and is never
--       counted. It caps successful attachments, not guessing. This table
--       counts EVERY submission, including failures. It holds exactly two
--       facts — who, and when — and deliberately NOT the submitted code, not
--       the outcome, and not the homework: none of those are needed to count,
--       and storing the outcome would make the table itself an oracle.
-- =====================================================================

begin;

-- ── 1 · the retired-code reservation ──────────────────────────────────

create table teacher_homework_retired_codes (
  code         text primary key,
  -- Provenance only, and deliberately NOT foreign keys. A cascade would free
  -- the code again the moment its draft was deleted, which is precisely the
  -- hazard this table exists to prevent; `on delete set null` would keep the
  -- reservation but throw away the record of where it came from. The
  -- reservation is about the CODE and must outlive the paper entirely.
  homework_id  uuid,
  workspace_id uuid,
  retired_at   timestamptz not null default now(),
  retired_by   uuid,

  constraint teacher_homework_retired_codes_code_check
    check (code ~ '^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$')
);

comment on table teacher_homework_retired_codes is
  'Homework codes that have left a homework row, by rotation or by the '
  'deletion of a draft. A code here is permanently '
  'unavailable to any future homework, so a student holding an old code can '
  'never be attached to a different paper by it. Permanent by decision, not a '
  'TTL. homework_id and workspace_id are provenance and carry no foreign key '
  'on purpose: the reservation must outlive the paper, including its deletion.';

-- Append-only, and more strictly than the audit log: a reservation that could
-- be edited or removed is not a reservation.
create or replace function teacher_homework_retired_codes_guard()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $fn$
begin
  if tg_op = 'DELETE' then
    raise exception 'teacher_homework_retired_codes: a retired code is never released'
      using errcode = '42501';
  end if;
  raise exception 'teacher_homework_retired_codes: a reservation is written once and never changed'
    using errcode = '22000';
end;
$fn$;

create trigger teacher_homework_retired_codes_guard_trg
  before update or delete on teacher_homework_retired_codes
  for each row execute function teacher_homework_retired_codes_guard();

alter table teacher_homework_retired_codes enable row level security;
revoke all on table teacher_homework_retired_codes from anon, authenticated;
revoke all on function teacher_homework_retired_codes_guard() from public, anon, authenticated;

-- ── 2b · the invariant, in the database ───────────────────────────────
-- The RPCs check teacher_homework_code_available() before they issue a code.
-- This is the same rule one level down, where a writer that never called an
-- RPC still meets it. One check, both write verbs: a code can only arrive on
-- a row by INSERT or by an UPDATE that names the column, and refusing one but
-- not the other leaves the same hole behind a different door.
create or replace function teacher_homework_code_guard()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $fn$
begin
  -- new.homework_code is the code the row is about to carry, on either verb,
  -- so one unconditional check covers both. A row's own live code is never in
  -- the reservation — retirement always accompanies the code LEAVING the row —
  -- so an update that rewrites the column to its current value still passes.
  --
  -- SECURITY DEFINER so RLS on the reservation table can never blind the
  -- check: a guard that cannot see the rows it guards against fails open,
  -- which is the one thing a guard must not do.
  if exists (select 1 from teacher_homework_retired_codes where code = new.homework_code) then
    raise exception
      'teacher_homework: code % was retired and can never be issued again', new.homework_code
      using errcode = '22000';
  end if;
  return new;
end;
$fn$;

-- Deliberately NOT errcode 23505. teacher_homework_create() catches
-- unique_violation to retry a code collision, and a RAISE carries no
-- constraint_name, so a 23505 here would enter that handler only to be
-- re-raised as an opaque error. 22000 keeps this refusal out of the retry
-- path entirely — the retry is for collisions with LIVE codes, which the
-- UNIQUE still raises normally.
-- UPDATE OF homework_code, not a bare UPDATE: the guard must not fire on the
-- title, the due date, the status transitions or the reveal latch, all of
-- which H2 governs and none of which can put a code on a row.
create trigger teacher_homework_code_guard_trg
  before insert or update of homework_code on teacher_homework
  for each row execute function teacher_homework_code_guard();

revoke all on function teacher_homework_code_guard() from public, anon, authenticated;

-- ── 2 · the attach limiter ────────────────────────────────────────────

create table teacher_homework_attach_attempts (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  attempted_at timestamptz not null default now()
);

comment on table teacher_homework_attach_attempts is
  'One row per attach-code submission, successful or not. It holds who and '
  'when, and nothing else: the submitted code is never stored, and neither is '
  'the outcome — the limiter does not need either, and recording the outcome '
  'would turn this table into the oracle the one-message rule exists to '
  'prevent. Pruned opportunistically by student_attach_homework(); this '
  'database has no scheduler, so nothing else would ever prune it.';

-- The shape the two live counting queries already use:
-- teacher_exam_access_student_recent_idx and idx_ai_usage_user_time.
create index teacher_homework_attach_attempts_user_recent_idx
  on teacher_homework_attach_attempts (user_id, attempted_at desc);

-- An attempt is a fact about a moment. It may be pruned, never rewritten.
create or replace function teacher_homework_attach_attempts_guard()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $fn$
begin
  raise exception 'teacher_homework_attach_attempts: an attempt is a fact and is never edited'
    using errcode = '22000';
end;
$fn$;

create trigger teacher_homework_attach_attempts_guard_trg
  before update on teacher_homework_attach_attempts
  for each row execute function teacher_homework_attach_attempts_guard();

alter table teacher_homework_attach_attempts enable row level security;
revoke all on table teacher_homework_attach_attempts from anon, authenticated;
revoke all on function teacher_homework_attach_attempts_guard() from public, anon, authenticated;

-- ── 3 · the two code helpers ──────────────────────────────────────────

-- Availability now means two things, and both are checked in one place so a
-- future caller cannot check only half.
create or replace function teacher_homework_code_available(p_code text)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $fn$
  select not exists (select 1 from teacher_homework where homework_code = p_code)
     and not exists (select 1 from teacher_homework_retired_codes where code = p_code);
$fn$;

-- ── 4 · create and rotate now respect the reservation ─────────────────
-- Both bodies are 20260903b's, with the retired-code check added inside the
-- existing bounded retry and nothing else touched. §6.5 asserts exactly that.

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
      -- H4: a retired code is never issued again. Checking here rather than
      -- after the INSERT keeps one bounded loop instead of two.
      if not teacher_homework_code_available(v_code) then
        if i = 10 then
          raise exception 'teacher_homework_create: could not allocate a free homework code'
            using errcode = '53400';
        end if;
        continue;
      end if;
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

create or replace function teacher_homework_rotate_code(p_homework uuid)
returns text
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $fn$
declare v_status text; v_ws uuid; v_old text; v_code text; v_con text; i int;
begin
  if not teacher_homework_is_staff(p_homework) then
    raise exception 'teacher_homework_rotate_code: no such homework, or you are not staff of its class'
      using errcode = '42501';
  end if;
  select status, workspace_id, homework_code into v_status, v_ws, v_old
    from teacher_homework where id = p_homework;
  if v_status = 'closed' then
    raise exception 'teacher_homework_rotate_code: this homework is closed' using errcode = '22023';
  end if;

  for i in 1..10 loop
    begin
      v_code := teacher_homework_new_code();
      if not teacher_homework_code_available(v_code) then
        if i = 10 then
          raise exception 'teacher_homework_rotate_code: could not allocate a free homework code'
            using errcode = '53400';
        end if;
        continue;
      end if;
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

  -- The retirement comes AFTER the new code is committed to the row, so a
  -- failed rotation never reserves a code that is still in use.
  insert into teacher_homework_retired_codes (code, homework_id, workspace_id, retired_by)
  values (v_old, p_homework, v_ws, auth.uid())
  on conflict (code) do nothing;

  insert into workspace_audit_log (workspace_id, actor_id, action, subject_id, meta)
  values (v_ws, auth.uid(), 'homework_code_rotated', null, jsonb_build_object('homework_id', p_homework));

  return v_code;
end;
$fn$;

-- Deleting a draft retires its code. Everything else in this body is
-- 20260903b's, including the measured reason the children go first: PostgreSQL
-- removes the parent BEFORE running the cascade, so teacher_homework_content_
-- guard() would read a NULL status and fail closed (§15.16a).
create or replace function teacher_homework_delete(p_homework uuid)
returns void
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $fn$
declare v_status text; v_attached int; v_attempts int; v_code text; v_ws uuid;
begin
  if not teacher_homework_is_staff(p_homework) then
    raise exception 'teacher_homework_delete: no such homework, or you are not staff of its class'
      using errcode = '42501';
  end if;
  select status, homework_code, workspace_id into v_status, v_code, v_ws
    from teacher_homework where id = p_homework;
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

  -- Student rows make this not a draft anyone may discard. The guards refuse
  -- it anyway, but a raw trigger message names none of that, so ask first and
  -- say what is in the way. (A response cannot exist without an attempt, so
  -- counting attempts covers all three.)
  select count(*) into v_attached from teacher_homework_access where homework_id = p_homework;
  select count(*) into v_attempts from teacher_homework_attempts where homework_id = p_homework;
  if v_attached > 0 or v_attempts > 0 then
    raise exception
      'teacher_homework_delete: % student(s) hold this homework and % have started it — it can no longer be deleted',
      v_attached, v_attempts using errcode = '42501';
  end if;

  -- CHILDREN FIRST, and not by cascade (§15.16a). Questions before stimuli:
  -- the stimulus foreign key is ON DELETE RESTRICT.
  delete from teacher_homework_questions where homework_id = p_homework;
  delete from teacher_homework_stimuli where homework_id = p_homework;

  -- H4: the code is retired BEFORE the row that holds it goes, so there is no
  -- instant in this transaction when the code is neither live nor reserved.
  -- A draft's code granted nothing, but it may still have been shared, and
  -- reissuing it would be the same wrong-paper attachment rotation guards
  -- against. Status is not consulted: code identity does not depend on it.
  insert into teacher_homework_retired_codes (code, homework_id, workspace_id, retired_by)
  values (v_code, p_homework, v_ws, auth.uid())
  on conflict (code) do nothing;

  delete from teacher_homework where id = p_homework;
end;
$fn$;

-- ── 5 · the student path ──────────────────────────────────────────────

-- THE ONE REASON. A wrong code, a code that never existed, a DRAFT's code, a
-- CLOSED homework's code, and a real code held by someone who is not a member
-- of that class all return the identical {ok:false, reason:'no_match'}. The
-- caller cannot tell them apart, and neither can a timing comparison: the
-- limit was already spent before any of them was evaluated. The last of those
-- is the one that differs from Teacher Exams, and it differs because the
-- systems differ: an
-- exam has an approval queue, so letting a non-member raise a request turns
-- the queue into a leak detector at no cost. Homework has no queue — attaching
-- IS the grant — so a distinct "you are not in this class" would confirm to an
-- outsider that the code they hold is real, with nobody in the loop to notice.
-- The cost is real and is accepted: a student who has not yet joined their
-- class is told only that the code did not match. The surface should say so in
-- general terms ("check you have joined your class") without the server ever
-- distinguishing the two cases.
create or replace function student_attach_homework(p_code text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $fn$
declare
  WINDOW_  constant interval := interval '1 hour';
  LIMIT_   constant integer  := 10;
  v_norm   text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  v_recent integer;
  h        teacher_homework%rowtype;
  v_name   text;
  v_new    boolean := false;
begin
  -- 1 · signed in
  if auth.uid() is null then
    raise exception 'student_attach_homework: sign in first' using errcode = '42501';
  end if;

  -- 2 · THE LIMIT, BEFORE THE CODE IS LOOKED AT.
  -- Pruning first is what keeps this table bounded: there is no scheduler in
  -- this database (measured — no pg_cron, no job, no cleanup function
  -- anywhere), so a row deleted here is a row deleted at all. Each caller
  -- clears their own expired rows on every call, which leaves behind at most
  -- LIMIT_ rows for a caller who never returns.
  delete from teacher_homework_attach_attempts
   where user_id = auth.uid() and attempted_at <= now() - WINDOW_;

  -- Counted whether or not the code turns out to be real: that is the whole
  -- difference from the exam limiter, which counts rows created and so never
  -- sees a guess.
  insert into teacher_homework_attach_attempts (user_id) values (auth.uid());

  select count(*) into v_recent
    from teacher_homework_attach_attempts
   where user_id = auth.uid() and attempted_at > now() - WINDOW_;
  if v_recent > LIMIT_ then
    -- The one refusal that still raises. Rolling back this call's own attempt
    -- row is the point: a throttled caller cannot grow the table, and the
    -- limit holds from the rows already recorded.
    raise exception 'student_attach_homework: too many attempts in the last hour, try again later'
      using errcode = '53400';
  end if;

  -- 3 · resolve a PUBLISHED homework IN AN ACTIVE CLASS. Returned, not
  -- raised, so the attempt above survives the call — see the header.
  -- The workspace condition belongs here rather than in the membership check
  -- below: a deactivated class refuses its class code already
  -- (student_join_workspace, measured), and without it a student of a
  -- deactivated workspace could still attach — creating a permanent record
  -- teacher_homework_can_open() would then refuse to honour, in a class whose
  -- staff have lost the power to manage it.
  -- The alias is hw, not h: h is the rowtype variable above, and plpgsql
  -- resolves the ambiguity by refusing (42702). Caught by the dry-run.
  select hw.* into h from teacher_homework hw
    join teacher_workspaces w on w.id = hw.workspace_id
   where hw.homework_code = v_norm and hw.status = 'published' and w.is_active;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'no_match');
  end if;

  -- 4 · staff of the class cannot attach to their own paper. This reason IS
  -- distinct, and safely: staff already read every homework in their class,
  -- including its code, so it confirms nothing they cannot already see.
  if workspace_is_active_staff(h.workspace_id) then
    return jsonb_build_object('ok', false, 'reason', 'staff');
  end if;

  -- 5 · an ACTIVE member, checked live and never stored. There is no
  -- was_member_at_request here and there must not be: an exam records that
  -- flag because a non-member may still raise a request, and here they may
  -- not. Same reason as step 3, indistinguishable by design.
  if not exists (
    select 1 from workspace_students ws
     where ws.workspace_id = h.workspace_id
       and ws.student_id = auth.uid()
       and ws.status = 'active'
       and (ws.expires_at is null or ws.expires_at > now())
  ) then
    return jsonb_build_object('ok', false, 'reason', 'no_match');
  end if;

  -- 6 · attach. The primary key makes this idempotent, so a double tap and a
  -- re-entered code both land on the same single row.
  insert into teacher_homework_access (homework_id, student_id)
  values (h.id, auth.uid())
  on conflict (homework_id, student_id) do nothing;
  get diagnostics v_recent = row_count;
  v_new := v_recent > 0;

  -- 7 · one attachment, one event. A re-entry attaches nothing and so logs
  -- nothing: the convention student_request_exam_access() follows, and
  -- deliberately NOT student_join_workspace()'s, which writes a row on every
  -- call and was measured doing so three times for one membership (§15.17).
  if v_new then
    insert into workspace_audit_log (workspace_id, actor_id, action, subject_id, meta)
    values (h.workspace_id, auth.uid(), 'homework_attached', auth.uid(),
            jsonb_build_object('homework_id', h.id));
  end if;

  select name into v_name from teacher_workspaces where id = h.workspace_id;
  return jsonb_build_object(
    'ok', true,
    'reason', case when v_new then 'attached' else 'already_attached' end,
    'homework_id', h.id, 'title', h.title, 'workspace_name', v_name);
end;
$fn$;

-- The sole authority on whether a student may open a homework. It takes NO
-- student parameter: one would let any account probe another student's access,
-- which is why teacher_exam_can_start() has none either. Every condition is
-- read live, so revoking a class link closes the door with no row touched and
-- no cleanup job. There is deliberately no due_at condition — decision 3 makes
-- the due date a date and never a lock.
create or replace function teacher_homework_can_open(p_homework uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $fn$
  select exists (
    select 1
      from teacher_homework h
      join teacher_workspaces w       on w.id = h.workspace_id
      join teacher_homework_access a  on a.homework_id = h.id and a.student_id = auth.uid()
      join workspace_students ws      on ws.workspace_id = h.workspace_id
                                     and ws.student_id = auth.uid()
     where h.id = p_homework
       and ws.status = 'active'
       and (ws.expires_at is null or ws.expires_at > now())
       and w.is_active
       and h.status = 'published'
  );
$fn$;

-- The student's own list. Shaped on student_my_teacher_exams(): it lists every
-- attachment and computes the gate per row rather than filtering, so a paper
-- that has closed or a class that was left still appears, greyed out, instead
-- of vanishing without explanation.
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
           teacher_homework_can_open(h.id)
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

-- The staff roster for one paper: who attached, and how far they have got.
-- Names come from profiles, as the exam results read already does.
create or replace function teacher_homework_students(p_homework uuid)
returns table (
  student_id     uuid,
  student_name   text,
  attached_at    timestamptz,
  attempt_status text,
  submitted_at   timestamptz,
  late           boolean
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $fn$
begin
  if not teacher_homework_is_staff(p_homework) then
    raise exception 'teacher_homework_students: no such homework, or you are not staff of its class'
      using errcode = '42501';
  end if;
  return query
    select a.student_id, coalesce(p.full_name, 'Student'), a.attached_at,
           t.status, t.submitted_at, t.late
      from teacher_homework_access a
      left join profiles p on p.id = a.student_id
      left join teacher_homework_attempts t
             on t.homework_id = a.homework_id and t.user_id = a.student_id
     where a.homework_id = p_homework
     order by coalesce(p.full_name, 'Student') asc, a.attached_at asc;
end;
$fn$;

-- ── 6 · privileges ────────────────────────────────────────────────────
revoke all on function teacher_homework_delete(uuid)            from public, anon, authenticated;
grant  execute on function teacher_homework_delete(uuid)       to authenticated;
revoke all on function teacher_homework_code_available(text)   from public, anon, authenticated;
revoke all on function student_attach_homework(text)           from public, anon, authenticated;
revoke all on function teacher_homework_can_open(uuid)         from public, anon, authenticated;
revoke all on function student_my_homework()                   from public, anon, authenticated;
revoke all on function teacher_homework_students(uuid)         from public, anon, authenticated;

grant execute on function student_attach_homework(text)        to authenticated;
grant execute on function teacher_homework_can_open(uuid)      to authenticated;
grant execute on function student_my_homework()                to authenticated;
grant execute on function teacher_homework_students(uuid)      to authenticated;
-- teacher_homework_code_available() is granted to NOBODY: it answers "does
-- this code exist", which is the one question the whole one-message rule
-- exists to refuse.

-- ── 7 · verification ──────────────────────────────────────────────────
-- Every assertion names what would breach it, so each one could go red. Each
-- one is also reachable: the H3 dry-run found a check that could ONLY raise
-- (it compared pg_get_function_identity_arguments() against a value that
-- function never returns), so argument lists here are read as TYPES.
do $$
declare
  v_bad text; v_n integer; v_code text;
  NEWFN constant text[] := array['student_attach_homework','teacher_homework_can_open',
    'student_my_homework','teacher_homework_students'];
begin
  -- 7.1 the two tables exist, with exactly the columns approved
  select string_agg(a.attname, ',' order by a.attnum) into v_bad
    from pg_attribute a where a.attrelid = 'teacher_homework_retired_codes'::regclass
     and a.attnum > 0 and not a.attisdropped;
  if v_bad is distinct from 'code,homework_id,workspace_id,retired_at,retired_by' then
    raise exception 'H4: teacher_homework_retired_codes has columns %', v_bad;
  end if;
  select string_agg(a.attname, ',' order by a.attnum) into v_bad
    from pg_attribute a where a.attrelid = 'teacher_homework_attach_attempts'::regclass
     and a.attnum > 0 and not a.attisdropped;
  if v_bad is distinct from 'id,user_id,attempted_at' then
    raise exception 'H4: the limiter holds more than who and when: %', v_bad;
  end if;

  -- 7.2 the reservation must OUTLIVE the paper, so it carries no foreign key
  --     that could cascade the code back into circulation
  if exists (select 1 from pg_constraint
              where conrelid = 'teacher_homework_retired_codes'::regclass and contype = 'f') then
    raise exception 'H4: a foreign key on the retired-code table would free codes when a paper is deleted';
  end if;

  -- 7.3 neither table is reachable by a client, and neither has a policy
  select string_agg(distinct g.table_name || ':' || g.grantee, ', ') into v_bad
    from information_schema.role_table_grants g
   where g.table_schema = 'public'
     and g.table_name in ('teacher_homework_retired_codes','teacher_homework_attach_attempts')
     and g.grantee in ('anon','authenticated');
  if v_bad is not null then
    raise exception 'H4: a client role can reach an internal table: %', v_bad;
  end if;
  select count(*) into v_n from pg_policy p join pg_class c on c.oid = p.polrelid
   where c.relname in ('teacher_homework_retired_codes','teacher_homework_attach_attempts');
  if v_n <> 0 then
    raise exception 'H4: an internal table has % polic(ies) — it should have none, and no grant', v_n;
  end if;
  select string_agg(c.relname, ', ') into v_bad
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and not c.relrowsecurity
     and c.relname in ('teacher_homework_retired_codes','teacher_homework_attach_attempts');
  if v_bad is not null then
    raise exception 'H4: RLS is not enabled on: %', v_bad;
  end if;

  -- 7.4 the code helper answers "does this code exist" and is callable by NOBODY
  if has_function_privilege('authenticated', 'teacher_homework_code_available(text)', 'execute')
     or has_function_privilege('anon', 'teacher_homework_code_available(text)', 'execute') then
    raise exception 'H4: teacher_homework_code_available() is client-callable — it is an oracle';
  end if;

  -- 7.5 create and rotate differ from their H3 bodies in the retired-code
  --     check AND NOTHING ELSE. Both must consult the reservation.
  -- EVERY source check below reads v_code, which is the installed body with
  -- its -- comments stripped. The raw prosrc is deliberately never held in a
  -- variable here, so a later check cannot reach for it.
  --
  -- These bodies explain themselves at length, and an assertion that matches a
  -- comment tests PROSE: it goes green on a function that only talks about
  -- doing the thing, and red on one that explains why it does not. The H3
  -- dry-run found the mirror of this — a check that could ONLY ever raise
  -- (§15.16b). THE FIRST H4 DRY-RUN FOUND THIS ONE: §7.8 below refused a body
  -- that satisfies it, because student_attach_homework() writes the words
  -- "was_member_at_request" in a comment in order to say it does not use them.
  -- The file could not install at all until this was fixed.
  select regexp_replace(p.prosrc, '--[^\n]*', '', 'g') into v_code
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'teacher_homework_create';
  if v_code !~ 'teacher_homework_code_available' then
    raise exception 'H4: teacher_homework_create() can still issue a retired code';
  end if;
  select regexp_replace(p.prosrc, '--[^\n]*', '', 'g') into v_code
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'teacher_homework_rotate_code';
  if v_code !~ 'teacher_homework_code_available' then
    raise exception 'H4: teacher_homework_rotate_code() can still issue a retired code';
  end if;
  if v_code !~ 'insert into teacher_homework_retired_codes' then
    raise exception 'H4: rotation does not retire the code it replaces — the hazard is unfixed';
  end if;
  -- 7.5b THE INVARIANT'S OTHER EXIT. A deleted draft's code must be retired
  --      too, and BEFORE the row that holds it goes.
  select regexp_replace(p.prosrc, '--[^\n]*', '', 'g') into v_code
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'teacher_homework_delete';
  if v_code !~ 'insert into teacher_homework_retired_codes' then
    raise exception 'H4: deleting a draft releases its code back into circulation';
  end if;
  if position('insert into teacher_homework_retired_codes' in v_code)
     > position('delete from teacher_homework where id = p_homework' in v_code) then
    raise exception 'H4: the code is retired after its row is gone — there is a window where it is free';
  end if;
  if v_code ~ 'status = ''published''[^;]*retired' then
    raise exception 'H4: retirement is conditional on status — the invariant does not depend on it';
  end if;

  -- 7.6 THE ATTACH ORDER. The limit is checked before the code is resolved,
  --     which is what stops the limiter from being an oracle. Read positionally
  --     off the installed source, so reordering the body turns this red.
  select regexp_replace(p.prosrc, '--[^\n]*', '', 'g') into v_code
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'student_attach_homework';
  if position('too many attempts' in v_code) > position('''no_match''' in v_code) then
    raise exception 'H4: the rate limit is checked AFTER the code is resolved — it has become an oracle';
  end if;
  if position('insert into teacher_homework_attach_attempts' in v_code)
     > position('select count(*) into v_recent' in v_code) then
    raise exception 'H4: the attempt is counted after the count is taken — a guess would be free';
  end if;

  -- 7.7 ONE reason covers a bad code AND a non-member. Two occurrences of the
  --     same literal is the whole point; one would mean a distinct refusal
  --     leaked which of the two happened.
  if (length(v_code) - length(replace(v_code, '''no_match''', '')))
     / length('''no_match''') <> 2 then
    raise exception 'H4: the unknown-code and not-a-member refusals are no longer indistinguishable';
  end if;
  -- 7.7b and an expected refusal must not RAISE: a raise rolls back the
  --      attempt row and turns this limiter back into the exam's.
  if v_code ~ 'raise exception ''student_attach_homework: that code' then
    raise exception 'H4: an expected refusal raises, which discards the attempt it just recorded';
  end if;

  -- 7.8 the attach path never records whether the caller was a member, and
  --     never reads the exam access model. Read off v_code, for the reason
  --     recorded at 7.5: the body names was_member_at_request in a comment
  --     precisely to say it is absent.
  if v_code ~ 'was_member' then
    raise exception 'H4: student_attach_homework() records membership at attach time — homework has no queue to need it';
  end if;
  if v_code ~ 'teacher_exam' then
    raise exception 'H4: student_attach_homework() reaches into the exam access model';
  end if;

  -- 7.9 the gate takes the homework and nothing else
  if (select coalesce(array_to_string(array(select t::regtype::text from unnest(p.proargtypes) t), ','), '')
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'teacher_homework_can_open') <> 'uuid' then
    raise exception 'H4: teacher_homework_can_open() takes more than the homework id — it could probe another student';
  end if;
  if (select regexp_replace(p.prosrc, '--[^\n]*', '', 'g')
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'teacher_homework_can_open') !~ 'auth\.uid\(\)' then
    raise exception 'H4: teacher_homework_can_open() does not bind the caller';
  end if;

  -- 7.10 H4 writes access and NOTHING else student-shaped: attempts and
  --      responses belong to H5
  select string_agg(p.proname, ', ') into v_bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = any (NEWFN)
     and regexp_replace(p.prosrc, '--[^\n]*', '', 'g')
         ~ '(insert\s+into|update|delete\s+from)\s+teacher_homework_(attempts|responses)';
  if v_bad is not null then
    raise exception 'H4: a function writes an H5 table: %', v_bad;
  end if;

  -- 7.11 the four client RPCs are definer, pinned, and callable by
  --      authenticated; anon holds nothing anywhere in the homework system
  select string_agg(p.proname, ', ') into v_bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = any (NEWFN)
     and (not p.prosecdef
          or not (p.proconfig @> array['search_path=pg_catalog, public'])
          or not has_function_privilege('authenticated', p.oid, 'execute'));
  if v_bad is not null then
    raise exception 'H4: not definer, search_path unpinned, or not callable: %', v_bad;
  end if;
  select string_agg(p.proname, ', ') into v_bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and (p.proname like 'teacher\_homework%' or p.proname = 'student_attach_homework'
                                   or p.proname = 'student_my_homework')
     and has_function_privilege('anon', p.oid, 'execute');
  if v_bad is not null then
    raise exception 'H4: anon can call: %', v_bad;
  end if;

  -- 7.12 H2's helper and H3's authoring RPCs are untouched apart from the two
  --      this file deliberately redefines
  if (select md5(p.prosrc) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'teacher_homework_is_staff')
     <> '63ef7fa28bf3a0c48bd6658abd11009a' then
    raise exception 'H4: teacher_homework_is_staff() was redefined — it belongs to 20260902c';
  end if;

  -- 7.12b THE INVARIANT IS IN THE DATABASE. The guard exists, fires on BOTH
  --       write verbs and on no more than the code column, reads the
  --       reservation, and is definer with a pinned path.
  select pg_get_triggerdef(tg.oid) into v_bad
    from pg_trigger tg join pg_class c on c.oid = tg.tgrelid
   where c.relname = 'teacher_homework' and tg.tgname = 'teacher_homework_code_guard_trg'
     and not tg.tgisinternal;
  if v_bad is null then
    raise exception 'H4: the code guard is not installed — the invariant is only a convention';
  end if;
  if v_bad !~ 'BEFORE INSERT OR UPDATE OF homework_code ON public\.teacher_homework' then
    raise exception 'H4: the code guard does not cover both write verbs: %', v_bad;
  end if;
  -- A bare UPDATE would fire on every title and due-date edit H2 governs; a
  -- DELETE clause would put it in the way of teacher_homework_delete().
  if v_bad ~ 'OR UPDATE ON' or v_bad ~ 'DELETE' then
    raise exception 'H4: the code guard is wider than the column it protects: %', v_bad;
  end if;
  select regexp_replace(p.prosrc, '--[^\n]*', '', 'g') into v_code
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'teacher_homework_code_guard';
  if v_code !~ 'from teacher_homework_retired_codes where code = new\.homework_code' then
    raise exception 'H4: the code guard does not consult the reservation';
  end if;
  if not (select p.prosecdef and p.proconfig @> array['search_path=pg_catalog, public']
            from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = 'teacher_homework_code_guard') then
    raise exception 'H4: the code guard is not definer with a pinned search_path — RLS could blind it';
  end if;
  if has_function_privilege('authenticated', 'teacher_homework_code_guard()', 'execute')
     or has_function_privilege('anon', 'teacher_homework_code_guard()', 'execute') then
    raise exception 'H4: the code guard is client-callable';
  end if;

  -- 7.12c AND H2'S OWN TRIGGER IS UNTOUCHED. The new one is additive. H2's
  --       guard has no INSERT coverage at all, and on an UPDATE OF
  --       homework_code both now fire — the code guard FIRST, because BEFORE
  --       ROW triggers fire in alphabetical name order and
  --       teacher_homework_code_guard_trg sorts before
  --       teacher_homework_guard_trg. H2 still sees every update it saw
  --       before, and none of its own rules move.
  if (select md5(p.prosrc) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'teacher_homework_guard')
     <> '19bbc18c825edce8b3c9a03c75f9fecb' then
    raise exception 'H4: it altered teacher_homework_guard(), which belongs to 20260902b';
  end if;
  select pg_get_triggerdef(tg.oid) into v_bad
    from pg_trigger tg join pg_class c on c.oid = tg.tgrelid
   where c.relname = 'teacher_homework' and tg.tgname = 'teacher_homework_guard_trg';
  if v_bad !~ 'BEFORE DELETE OR UPDATE ON public\.teacher_homework' then
    raise exception 'H4: H2''s trigger on teacher_homework changed: %', v_bad;
  end if;
  select count(*) into v_n from pg_trigger tg join pg_class c on c.oid = tg.tgrelid
   where c.relname = 'teacher_homework' and not tg.tgisinternal;
  if v_n <> 2 then
    raise exception 'H4: teacher_homework carries % triggers — H2''s one, plus this file''s one', v_n;
  end if;

  -- 7.13 the shape of the homework system after this increment
  select count(*) into v_n from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname like 'teacher\_homework%' and c.relkind = 'r';
  if v_n <> 8 then
    raise exception 'H4: expected 8 teacher-homework tables (6 from H2 + 2 here), found %', v_n;
  end if;
  select count(*) into v_n from pg_policy p join pg_class c on c.oid = p.polrelid
   where c.relname like 'teacher\_homework%';
  if v_n <> 9 then
    raise exception 'H4: the policy count moved to % — this increment adds none', v_n;
  end if;
end $$;

commit;
