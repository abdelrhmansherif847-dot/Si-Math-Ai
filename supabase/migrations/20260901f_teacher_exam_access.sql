-- =====================================================================
-- Teacher Exams, increment 3d — the code, the request, the decision
-- =====================================================================
-- STATUS: 🟢 APPLIED 2026-09-01 as version 20260901172530.
--
-- All seven bodies md5-compared against this file after applying and
-- byte-identical. Verified live in a rolled-back transaction: an approved
-- OUTSIDER still cannot start (membership is a separate condition), removing
-- and restoring a class link flips can_start immediately with no access row
-- touched, a rotated code stops the old one while leaving every decision
-- standing, and the throttle returns the SAME message for a valid and an
-- invalid code because it fires before the code is resolved.
--
-- This is the increment that gives the exam code a meaning. Until now it was a
-- unique string nobody could use. After this it raises a REQUEST, and a request
-- is not access.
--
-- SCOPE. Seven RPCs. No table, column, constraint, trigger, policy or grant:
-- 3b built teacher_exam_access and its guard, and this only drives them.
--
-- NOT IN 3d: exam_start, save, submit, grading, the player (3e/3g). Nothing
-- here reads a question, a stimulus or an answer key.
--
-- ⚠️ WHAT THE RATE LIMIT DOES AND DOES NOT DO — stated plainly, because the
-- honest version is narrower than it first sounds.
--
-- §15.14 caps a student at five requests per hour. That is implemented, and it
-- is checked BEFORE the code is resolved, which is the part that matters: check
-- it afterwards and a throttled student gets a different error for a real code
-- than for a wrong one, which is exactly the oracle the single-message rule
-- exists to prevent.
--
-- But the counter counts ROWS IN teacher_exam_access, and a wrong code creates
-- no row. So the limit caps how many exams one student can attach themselves to
-- per hour; it does NOT count failed guesses. Counting those would need an
-- attempts table, which is new schema and deliberately not smuggled in here.
-- What actually makes guessing hopeless is the code space — 32^8, about 2^40 —
-- combined with the single indistinguishable failure message. Recorded so that
-- nobody later reads "rate limited" and believes more than is true.
--
-- Rows are counted regardless of their current state, on purpose. Counting only
-- rows still `pending` would let a student whose requests keep getting rejected
-- carry on at full speed, which is precisely the person a limit is for.
-- =====================================================================

begin;

-- ── 1 · the single authority on whether a sitting may begin ───────────
-- Every one of these is re-read at call time. Nothing is cached, and no
-- surface may re-derive this rule: 3e's exam_start calls THIS, exactly as
-- weakness severity has one owner and no consumer recomputes it.
--
-- Takes no student parameter, deliberately. A predicate that accepted one
-- would let any signed-in account probe another student's access state.
create or replace function teacher_exam_can_start(p_exam uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public
as $fn$
  select exists (
    select 1
      from teacher_exams e
      join teacher_workspaces w  on w.id = e.workspace_id
      join teacher_exam_access a on a.exam_id = e.id and a.student_id = auth.uid()
      join workspace_students ws on ws.workspace_id = e.workspace_id
                               and ws.student_id = auth.uid()
     where e.id = p_exam
       and a.state = 'approved'                                  -- decided, per exam
       and ws.status = 'active'                                  -- membership is LIVE
       and (ws.expires_at is null or ws.expires_at > now())
       and w.is_active                                           -- locked decision 6
       and e.status = 'published'                                -- open
       and (e.opens_at  is null or e.opens_at  <= now())
       and (e.closes_at is null or e.closes_at >  now())
  );
$fn$;

comment on function teacher_exam_can_start(uuid) is
  'approved AND still an active member of an active workspace AND the exam is '
  'open. Membership is a live condition, never a stored one: revoking a class '
  'link makes this false immediately, with no access row touched and no cleanup '
  'job. An attempt already in progress is deliberately NOT governed by this — '
  'destroying work a student is halfway through is a support incident, not a '
  'security control.';

-- ── 2 · rotating the code ─────────────────────────────────────────────
-- Rotation stops FUTURE code-based requests and silently revokes nothing.
-- Pending requests stay in front of the teacher, who can then judge them
-- knowing the code had leaked; voiding them would destroy the very signal that
-- prompted the rotation.
--
-- Its own bounded retry, wrapped around the UPDATE. workspace_new_code() still
-- has none and is still not this increment's business.
create or replace function teacher_exam_rotate_code(p_exam uuid)
returns text
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $fn$
declare v_status text; v_ws uuid; v_code text; v_con text; i int;
begin
  if not teacher_exam_is_staff(p_exam) then
    raise exception 'teacher_exam_rotate_code: no such exam, or you are not staff of its class'
      using errcode = '42501';
  end if;
  select status, workspace_id into v_status, v_ws from teacher_exams where id = p_exam;
  if v_status = 'closed' then
    raise exception 'teacher_exam_rotate_code: this exam is closed' using errcode = '22023';
  end if;

  for i in 1..10 loop
    begin
      v_code := teacher_exam_new_code();
      update teacher_exams set exam_code = v_code where id = p_exam;
      exit;
    exception when unique_violation then
      get stacked diagnostics v_con = constraint_name;
      if v_con is distinct from 'teacher_exams_exam_code_key' then raise; end if;
      if i = 10 then
        raise exception 'teacher_exam_rotate_code: could not allocate a free exam code'
          using errcode = '53400';
      end if;
    end;
  end loop;

  insert into workspace_audit_log (workspace_id, actor_id, action, subject_id, meta)
  values (v_ws, auth.uid(), 'exam_code_rotated', null, jsonb_build_object('exam_id', p_exam));

  return v_code;
end;
$fn$;

-- ── 3 · the student enters a code ─────────────────────────────────────
create or replace function student_request_exam_access(p_code text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $fn$
declare
  v_norm   text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  v_recent integer;
  e        teacher_exams%rowtype;
  v_member boolean;
  v_state  text;
  v_new    boolean := false;
begin
  if auth.uid() is null then
    raise exception 'student_request_exam_access: sign in first' using errcode = '42501';
  end if;

  -- THE LIMIT COMES FIRST, before the code is even looked at. Checked after,
  -- its distinct message would confirm that a code was real.
  select count(*) into v_recent
    from teacher_exam_access
   where student_id = auth.uid() and requested_at > now() - interval '1 hour';
  if v_recent >= 5 then
    raise exception 'student_request_exam_access: too many requests in the last hour, try again later'
      using errcode = '53400';
  end if;

  select * into e from teacher_exams where exam_code = v_norm and status = 'published';
  if not found then
    -- ONE message for a wrong code, a draft's code, a closed exam's code and a
    -- code that never existed. Which of them it was is not the student's
    -- business, and telling them turns this box into an oracle — exactly as
    -- student_join_workspace() already refuses to do for class codes.
    raise exception 'student_request_exam_access: that code did not match an open exam'
      using errcode = '22023';
  end if;

  if workspace_is_active_staff(e.workspace_id) then
    raise exception 'student_request_exam_access: you are staff in this class'
      using errcode = '22000';
  end if;

  -- Frozen at request time. A student who joins the class afterwards would
  -- otherwise retroactively look like a member and erase the leak signal.
  select exists (
    select 1 from workspace_students ws
     where ws.workspace_id = e.workspace_id and ws.student_id = auth.uid()
       and ws.status = 'active' and (ws.expires_at is null or ws.expires_at > now())
  ) into v_member;

  -- One row per student per exam, EVER. Re-entering the code after a decision
  -- changes nothing: a decided request is not the student's to reopen.
  insert into teacher_exam_access (exam_id, student_id, was_member_at_request)
  values (e.id, auth.uid(), v_member)
  on conflict (exam_id, student_id) do nothing;
  get diagnostics v_recent = row_count;
  v_new := v_recent > 0;

  select state into v_state from teacher_exam_access
   where exam_id = e.id and student_id = auth.uid();

  -- Only a NEW request is an event. Logging a re-entry would fill the trail
  -- with noise a teacher has to read past.
  if v_new then
    insert into workspace_audit_log (workspace_id, actor_id, action, subject_id, meta)
    values (e.workspace_id, auth.uid(), 'exam_access_requested', auth.uid(),
            jsonb_build_object('exam_id', e.id, 'was_member', v_member));
  end if;

  -- The student may read their own access row anyway (3b policy), so returning
  -- the state leaks nothing. The exam's TITLE is returned and nothing else of
  -- it: no questions, no stimuli, no answer key, not even the duration.
  return jsonb_build_object(
    'exam_id', e.id, 'title', e.title, 'state', v_state, 'created', v_new);
end;
$fn$;

-- ── 4 · the queue the teacher and the assistant both see ──────────────
-- Name only. §8.4 keeps a student's academic, commercial and contact data out
-- of a teacher's read surface, and an OUTSIDER has no relationship at all — so
-- the row carries their name, the fact that they are not in this class, and
-- nothing else. That is the deliberate trade §15.14 records: the queue becomes
-- a leak detector, at the cost of a name.
create or replace function teacher_exam_requests(p_exam uuid)
returns table (
  student_id            uuid,
  full_name             text,
  state                 text,
  is_member_now         boolean,
  was_member_at_request boolean,
  requested_at          timestamptz,
  decided_at            timestamptz
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $fn$
declare v_ws uuid;
begin
  if not teacher_exam_is_staff(p_exam) then
    raise exception 'teacher_exam_requests: no such exam, or you are not staff of its class'
      using errcode = '42501';
  end if;
  select workspace_id into v_ws from teacher_exams where id = p_exam;

  return query
    select a.student_id,
           coalesce(p.full_name, 'Student'),
           a.state,
           exists (select 1 from workspace_students ws
                    where ws.workspace_id = v_ws and ws.student_id = a.student_id
                      and ws.status = 'active'
                      and (ws.expires_at is null or ws.expires_at > now())),
           a.was_member_at_request,
           a.requested_at,
           a.decided_at
      from teacher_exam_access a
      left join profiles p on p.id = a.student_id
     where a.exam_id = p_exam
     order by (a.state = 'pending') desc, a.requested_at asc;
end;
$fn$;

-- ── 5 · the decision ──────────────────────────────────────────────────
create or replace function teacher_exam_decide_access(
  p_exam uuid, p_student uuid, p_state text)
returns void
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $fn$
declare v_ws uuid; v_current text; v_action workspace_audit_action;
begin
  if not teacher_exam_is_staff(p_exam) then
    raise exception 'teacher_exam_decide_access: no such exam, or you are not staff of its class'
      using errcode = '42501';
  end if;
  if p_state not in ('approved', 'rejected', 'revoked') then
    raise exception 'teacher_exam_decide_access: state must be approved, rejected or revoked'
      using errcode = '22023';
  end if;
  -- A student deciding their own request is the whole thing this gate exists
  -- to stop. The staff check above already refuses it, because a student of a
  -- class is not staff of it — this makes the intent explicit rather than
  -- incidental, and would still hold if the staff rule ever loosened.
  if p_student = auth.uid() then
    raise exception 'teacher_exam_decide_access: you cannot decide your own request'
      using errcode = '42501';
  end if;

  select workspace_id into v_ws from teacher_exams where id = p_exam;
  select state into v_current from teacher_exam_access
   where exam_id = p_exam and student_id = p_student;
  if v_current is null then
    raise exception 'teacher_exam_decide_access: that student has not requested this exam'
      using errcode = '22023';
  end if;
  -- Revoking is taking back something granted. A request that was never
  -- approved is REJECTED, and keeping the two verbs distinct is what makes the
  -- audit trail readable a term later.
  if p_state = 'revoked' and v_current <> 'approved' then
    raise exception 'teacher_exam_decide_access: only approved access can be revoked (this is %)', v_current
      using errcode = '22023';
  end if;
  if v_current = p_state then
    return;                       -- idempotent; a double tap is not an event
  end if;

  update teacher_exam_access
     set state = p_state, decided_by = auth.uid()   -- the guard stamps decided_at
   where exam_id = p_exam and student_id = p_student;

  v_action := case p_state
                when 'approved' then 'exam_access_approved'
                when 'rejected' then 'exam_access_rejected'
                else 'exam_access_revoked' end::workspace_audit_action;

  -- §15.14 convention: subject_id is the STUDENT for every exam_access_* event,
  -- so a teacher reading one student's history sees their access decisions
  -- beside their joins and removals. The exam lives in meta.
  insert into workspace_audit_log (workspace_id, actor_id, action, subject_id, meta)
  values (v_ws, auth.uid(), v_action, p_student,
          jsonb_build_object('exam_id', p_exam, 'from', v_current));
end;
$fn$;

-- ── 6 · bulk approval, members only ───────────────────────────────────
-- §15.14: bulk approval is restricted to verified members, so an outsider can
-- never be swept in by a single tap. Non-members are skipped and COUNTED, not
-- silently dropped — a teacher who taps "approve all" is told that someone was
-- left out, which is the moment they should look at the queue.
create or replace function teacher_exam_approve_members(p_exam uuid, p_students uuid[])
returns jsonb
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $fn$
declare v_ws uuid; s uuid; v_ok int := 0; v_skipped int := 0; v_member boolean;
begin
  if not teacher_exam_is_staff(p_exam) then
    raise exception 'teacher_exam_approve_members: no such exam, or you are not staff of its class'
      using errcode = '42501';
  end if;
  select workspace_id into v_ws from teacher_exams where id = p_exam;

  foreach s in array coalesce(p_students, array[]::uuid[]) loop
    select exists (
      select 1 from workspace_students ws
       where ws.workspace_id = v_ws and ws.student_id = s and ws.status = 'active'
         and (ws.expires_at is null or ws.expires_at > now())
    ) into v_member;
    if v_member and s <> auth.uid()
       and exists (select 1 from teacher_exam_access
                    where exam_id = p_exam and student_id = s and state <> 'approved') then
      perform teacher_exam_decide_access(p_exam, s, 'approved');
      v_ok := v_ok + 1;
    else
      v_skipped := v_skipped + 1;
    end if;
  end loop;

  return jsonb_build_object('approved', v_ok, 'skipped', v_skipped);
end;
$fn$;

-- ── 7 · what the student can see of it ────────────────────────────────
-- Only exams they hold an access row for: an exam is not discoverable without
-- its code, and this must not become a directory of a class's papers. It
-- returns the paper's shell — title, duration, window — and NO content: no
-- question, no stimulus, and above all no answer key.
create or replace function student_my_teacher_exams()
returns table (
  exam_id            uuid,
  title              text,
  workspace_name     text,
  duration_minutes   integer,
  calculator_allowed boolean,
  status             text,
  opens_at           timestamptz,
  closes_at          timestamptz,
  access_state       text,
  can_start          boolean
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $fn$
begin
  if auth.uid() is null then
    raise exception 'student_my_teacher_exams: sign in first' using errcode = '42501';
  end if;
  return query
    select e.id, e.title, w.name, e.duration_minutes, e.calculator_allowed,
           e.status, e.opens_at, e.closes_at, a.state,
           teacher_exam_can_start(e.id)
      from teacher_exam_access a
      join teacher_exams e on e.id = a.exam_id
      join teacher_workspaces w on w.id = e.workspace_id
     where a.student_id = auth.uid()
     order by (a.state = 'approved') desc, e.closes_at asc nulls last, e.title asc;
end;
$fn$;

-- ── 8 · ACLs ─────────────────────────────────────────────────────────
revoke all on function teacher_exam_can_start(uuid) from public, anon, authenticated;
revoke all on function teacher_exam_rotate_code(uuid) from public, anon, authenticated;
revoke all on function student_request_exam_access(text) from public, anon, authenticated;
revoke all on function teacher_exam_requests(uuid) from public, anon, authenticated;
revoke all on function teacher_exam_decide_access(uuid, uuid, text) from public, anon, authenticated;
revoke all on function teacher_exam_approve_members(uuid, uuid[]) from public, anon, authenticated;
revoke all on function student_my_teacher_exams() from public, anon, authenticated;

grant execute on function teacher_exam_can_start(uuid) to authenticated;
grant execute on function teacher_exam_rotate_code(uuid) to authenticated;
grant execute on function student_request_exam_access(text) to authenticated;
grant execute on function teacher_exam_requests(uuid) to authenticated;
grant execute on function teacher_exam_decide_access(uuid, uuid, text) to authenticated;
grant execute on function teacher_exam_approve_members(uuid, uuid[]) to authenticated;
grant execute on function student_my_teacher_exams() to authenticated;

-- ── 9 · verification ─────────────────────────────────────────────────
do $$
declare
  v_bad text;
  FNS constant text[] := array['teacher_exam_can_start', 'teacher_exam_rotate_code',
    'student_request_exam_access', 'teacher_exam_requests', 'teacher_exam_decide_access',
    'teacher_exam_approve_members', 'student_my_teacher_exams'];
begin
  select string_agg(p.proname, ', ') into v_bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = any (FNS)
     and (not p.prosecdef
          or coalesce(array_to_string(p.proconfig, ','), '') !~ 'search_path=pg_catalog, public');
  if v_bad is not null then raise exception '3d: not definer, or search_path unpinned: %', v_bad; end if;

  select string_agg(p.proname, ', ') into v_bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = any (FNS)
     and (p.proacl is null
          or exists (select 1 from unnest(p.proacl) a
                      where a::text like '=%' or a::text like 'anon=%'));
  if v_bad is not null then raise exception '3d: reachable by public or anon: %', v_bad; end if;

  -- no answer key may appear in anything a student can call
  select string_agg(p.proname, ', ') into v_bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('student_request_exam_access', 'student_my_teacher_exams', 'teacher_exam_can_start')
     and p.prosrc ~ 'correct_answer|teacher_exam_questions|teacher_exam_stimuli';
  if v_bad is not null then
    raise exception '3d: a student-callable function reads exam content: %', v_bad;
  end if;

  -- 3b and 3c are untouched: still no client write privilege on any table
  select string_agg(distinct g.table_name || '.' || g.privilege_type, ', ') into v_bad
    from information_schema.role_table_grants g
   where g.table_schema = 'public' and g.table_name like 'teacher\_exam%'
     and g.grantee in ('anon', 'authenticated') and g.privilege_type <> 'SELECT';
  if v_bad is not null then raise exception '3d: a client role gained a write privilege: %', v_bad; end if;
end $$;

commit;
