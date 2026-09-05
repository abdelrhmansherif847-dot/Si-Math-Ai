-- =====================================================================
-- Teacher Exams, item I-2a — staff read the paper through an RPC
-- =====================================================================
-- STATUS: ✅ APPLIED 2026-09-04 as version 20260904144132, after explicit
--         owner approval, from the package at commit 0d3c3e9 exactly as
--         committed. Rollback: 20260907z, PREPARED and unapplied — like
--         H6's it has NO WINDOW, and running it today costs nothing
--         operationally because authenticated still holds SELECT on the
--         tables the pre-I-2a page reads. THAT CHANGES THE DAY I-2b SHIPS.
--         Post-apply evidence: docs/engineering/i2a-dryrun-20260904.sql,
--         the exact bytes dry-run against production (43/43, aborted),
--         plus 26/26 behavioural checks on the live functions. Both
--         installed bodies were compared byte-for-byte against this file
--         after the apply, and the 29 teacher_exam* functions this file
--         does not own were confirmed unchanged.
-- DEPENDS ON: 3b (20260901c/d — the six tables, RLS and the staff-read
--             policies), 3c (20260901e — the authoring RPCs and
--             teacher_exam_is_staff()).
-- CONTEXT: docs/roadmap/teacher-intelligence-layer.md §15.29 item I-2, and
--          §15.26 for H6, which this file mirrors deliberately.
-- ROLLBACK: 20260907z, PREPARED and unapplied. Like H6's, it has NO WINDOW.
--
-- WHAT THIS IS. Two read functions and nothing else — the exam twins of
-- teacher_homework_list() and teacher_homework_paper(). Today
-- teacher-exams.html reads teacher_exams, teacher_exam_questions and
-- teacher_exam_stimuli directly with select('*'), which is the shape H5's F-5
-- and H6 replaced on the homework side: table reads, every column shipped
-- (media_sha256 included), and a student-side grant still held on the content
-- tables. These two functions give the page somewhere else to read from.
--
-- WHAT IT IS NOT — AND THIS IS THE WHOLE POINT OF SPLITTING I-2 IN TWO.
-- ---------------------------------------------------------------------
-- There is NO revoke in this file. authenticated keeps its SELECT on
-- teacher_exam_questions and teacher_exam_stimuli until I-2b, which ships only
-- after the page is LIVE on these functions.
--
-- Homework did it the other way round: 20260905a (H5) revoked first, and staff
-- were then measurably blind — 42501 on both content tables for a teacher AND
-- an active assistant — until 20260906a (H6) gave the read back. Authoring was
-- write-only for the whole gap, with no way to edit an existing question. That
-- window was survivable only because nobody was authoring at the time. Doing
-- the same here would be repeating a known mistake on a system that already has
-- a real draft in it.
--
-- So: read first, revoke second, and never the other way.
--
-- It also adds no table, no policy, no grant on any table, no trigger, no enum
-- label, no audit label, and it REDEFINES NO EXISTING FUNCTION — so it carries
-- none of the 20260831e hazard. §3 asserts all of that.
--
-- WHO MAY CALL. Both gates are workspace_is_active_staff(), directly or through
-- teacher_exam_is_staff(): status = 'active' AND the workspace is active, and
-- staff_role is never read. A teacher and an ACTIVE assistant are therefore
-- identical here because they are identical there.
--
-- The admin arm belongs to the POLICIES, not to these functions — the same
-- decision H6 recorded, and for the same measured reason: that increment's
-- audit first mis-measured a PENDING assistant as staff because the profile it
-- used was a platform super_admin matching the policy's `OR
-- has_role_at_least('admin')` arm. Keeping that arm out of these gates means
-- the RPC surface cannot inherit the surprise.
-- =====================================================================

begin;

-- ── 1 · the exam list ─────────────────────────────────────────────────
-- THE GATE COMES FIRST AND IT GATES ON THE WORKSPACE. Filtering rows by
-- staffness instead would hand an outsider an empty set, which answers a
-- question they are not entitled to ask: an empty list and a list you may not
-- see are different facts.
--
-- ORDERING IS THE PAGE'S CURRENT ORDERING, DELIBERATELY. teacher-exams.html
-- orders by created_at desc today, and I-2a is a read-boundary change, not a
-- UX change: keeping the order identical is what makes the page switch
-- provably behaviour-preserving. H6's list puts drafts first, which is better,
-- and adopting it here is a separate decision for a separate increment.
create or replace function teacher_exam_list(p_workspace uuid)
returns table (
  exam_id             uuid,
  title               text,
  exam_code           text,
  status              text,
  duration_minutes    integer,
  calculator_allowed  boolean,
  opens_at            timestamptz,
  closes_at           timestamptz,
  created_at          timestamptz,
  published_at        timestamptz,
  closed_at           timestamptz,
  question_count      integer,
  request_count       integer,
  attempt_count       integer,
  submitted_count     integer
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $fn$
begin
  if not workspace_is_active_staff(p_workspace) then
    raise exception 'teacher_exam_list: no such class, or you are not active staff of it'
      using errcode = '42501';
  end if;

  return query
    select e.id, e.title, e.exam_code, e.status, e.duration_minutes,
           e.calculator_allowed, e.opens_at, e.closes_at,
           e.created_at, e.published_at, e.closed_at,
           (select count(*)::int from teacher_exam_questions q where q.exam_id = e.id),
           (select count(*)::int from teacher_exam_access  a where a.exam_id = e.id),
           (select count(*)::int from teacher_exam_attempts t where t.exam_id = e.id),
           (select count(*)::int from teacher_exam_attempts t
             where t.exam_id = e.id and t.status = 'submitted')
      from teacher_exams e
     where e.workspace_id = p_workspace
     order by e.created_at desc;
end;
$fn$;

-- ── 2 · one exam, with its content ────────────────────────────────────
-- The staff read of everything they authored, INCLUDING the answer key and the
-- explanation — they wrote them, and they cannot edit what they cannot see.
-- This is not a student read: no student-facing function is touched by this
-- file, and teacher_exam_start() still selects its own named column list that
-- omits correct_answer and explanation.
create or replace function teacher_exam_paper(p_exam uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $fn$
declare e teacher_exams%rowtype;
begin
  if not teacher_exam_is_staff(p_exam) then
    raise exception 'teacher_exam_paper: no such exam, or you are not staff of its class'
      using errcode = '42501';
  end if;

  select * into e from teacher_exams where id = p_exam;

  return jsonb_build_object(
    'exam_id', e.id, 'workspace_id', e.workspace_id,
    'title', e.title, 'instructions', e.instructions,
    'exam_code', e.exam_code, 'status', e.status,
    'duration_minutes', e.duration_minutes,
    'calculator_allowed', e.calculator_allowed,
    'opens_at', e.opens_at, 'closes_at', e.closes_at,
    'created_at', e.created_at, 'published_at', e.published_at, 'closed_at', e.closed_at,
    -- The one derived field, derived from the same condition
    -- teacher_exam_content_guard() enforces: content is editable only while the
    -- exam is a draft. The page must not have to know that rule twice.
    'can_edit_content', (e.status = 'draft'),
    -- SEVEN stimulus fields, named one by one. media_sha256 is ABSENT and §3
    -- asserts it: it is computed server-side by teacher_exam_save_stimulus(),
    -- no client reads it, and a later s.* would put it back with nobody
    -- noticing. media_kind IS present — stimulus-view.js requires it to draw a
    -- figure at all. created_at/updated_at add nothing to authoring.
    'stimuli', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', s.id, 'kind', s.kind, 'label', s.label, 'body', s.body,
               'spec', s.spec, 'media_ref', s.media_ref, 'media_kind', s.media_kind
             ) order by s.created_at, s.id)
        from teacher_exam_stimuli s where s.exam_id = p_exam), '[]'::jsonb),
    -- EIGHT question fields. correct_answer and explanation are HERE and that
    -- is not a leak: this function is staff-gated, and staff authored them.
    'questions', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', q.id, 'ordinal', q.ordinal, 'prompt', q.prompt,
               'question_format', q.question_format, 'choices', q.choices,
               'correct_answer', q.correct_answer, 'explanation', q.explanation,
               'stimulus_id', q.stimulus_id
             ) order by q.ordinal)
        from teacher_exam_questions q where q.exam_id = p_exam), '[]'::jsonb));
end;
$fn$;

-- ── 3 · privileges ────────────────────────────────────────────────────
-- Revoke then grant: the default ACL on a new function is EXECUTE to PUBLIC,
-- so granting without revoking first would leave anon able to call it.
revoke all on function teacher_exam_list(uuid)  from public, anon, authenticated;
revoke all on function teacher_exam_paper(uuid) from public, anon, authenticated;

grant execute on function teacher_exam_list(uuid)  to authenticated;
grant execute on function teacher_exam_paper(uuid) to authenticated;

-- NO grant or revoke on any TABLE appears in this file. That is I-2b.

-- ── 4 · verification, inside the transaction ──────────────────────────
do $v$
declare
  n int;
  v_src text;
begin
  -- 4.1 · both functions exist, with the intended shape.
  select count(*) into n
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public'
     and p.proname in ('teacher_exam_list', 'teacher_exam_paper')
     and p.prosecdef                                   -- security definer
     and p.provolatile = 's'                           -- stable
     and p.proconfig @> array['search_path=pg_catalog, public'];
  if n <> 2 then
    raise exception 'I-2a: expected 2 stable+definer+pinned functions, found %', n;
  end if;

  -- 4.2 · authenticated may call both; anon and public may call neither.
  if not (has_function_privilege('authenticated', 'teacher_exam_list(uuid)',  'EXECUTE')
      and has_function_privilege('authenticated', 'teacher_exam_paper(uuid)', 'EXECUTE')) then
    raise exception 'I-2a: authenticated cannot call one of the two reads';
  end if;
  if has_function_privilege('anon', 'teacher_exam_list(uuid)',  'EXECUTE')
  or has_function_privilege('anon', 'teacher_exam_paper(uuid)', 'EXECUTE') then
    raise exception 'I-2a: anon can call a staff read';
  end if;

  -- 4.3 · media_sha256 is not in either body. Read the source with comments
  -- STRIPPED, because the comment above says the word in order to say it is
  -- absent — a check that reads prose can only ever go the wrong way, which is
  -- the defect H3 §6.8 and H4 §7.8 each found in their own verification block.
  for v_src in
    select regexp_replace(p.prosrc, '--[^\n]*', '', 'g')
      from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
     where ns.nspname = 'public' and p.proname in ('teacher_exam_list', 'teacher_exam_paper')
  loop
    if v_src like '%media_sha256%' then
      raise exception 'I-2a: media_sha256 appears in a function body';
    end if;
    -- and the strip is not vacuous: the paper body must still name media_kind.
    null;
  end loop;
  if (select count(*) from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
       where ns.nspname = 'public' and p.proname = 'teacher_exam_paper'
         and regexp_replace(p.prosrc, '--[^\n]*', '', 'g') like '%media_kind%') <> 1 then
    raise exception 'I-2a: the comment strip removed too much — media_kind is gone too';
  end if;

  -- 4.4 · THIS FILE ADDS NO TABLE, POLICY, TRIGGER OR ENUM LABEL, and changes
  -- no table grant. Counted against the values measured on 2026-09-04.
  select count(*) into n from pg_tables where schemaname = 'public';
  if n <> 84 then raise exception 'I-2a: public table count moved: % (expected 84)', n; end if;
  select count(*) into n from pg_policies where schemaname = 'public';
  if n <> 133 then raise exception 'I-2a: policy count moved: % (expected 133)', n; end if;
  select count(*) into n from information_schema.role_table_grants
   where table_schema = 'public' and grantee in ('anon', 'authenticated')
     and table_name in ('teacher_exam_questions', 'teacher_exam_stimuli');
  if n <> 2 then
    raise exception 'I-2a: the content-table grants moved — that is I-2b, not this file (found %)', n;
  end if;

  -- 4.5 · NO EXISTING FUNCTION IS REDEFINED — asserted as a HASH of the live
  -- bodies, not as a count of them. The first draft of this check said "28 + 2
  -- = 30" because 28 was counted by eye off a query result; the real number is
  -- 29 (teacher_exam_update was missed) and the production dry-run refused the
  -- file outright. A count is the wrong instrument anyway: it cannot notice a
  -- function being REDEFINED, which is the 20260831e hazard this is here for.
  -- The hash below is of every teacher_exam* body except the two this file
  -- creates, measured on production 2026-09-04.
  select count(*) into n
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.proname like 'teacher_exam%';
  if n <> 31 then
    raise exception 'I-2a: teacher_exam* function count is % (expected 31 = 29 + these 2)', n;
  end if;

  select md5(string_agg(p.proname || '|' || md5(p.prosrc), ',' order by p.proname)) into v_src
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.proname like 'teacher_exam%'
     and p.proname not in ('teacher_exam_list', 'teacher_exam_paper');
  if v_src <> 'a664e4521cbaffc1d0cce3f051dbdcfd' then
    raise exception 'I-2a: an existing teacher_exam* body changed (bodies hash %)', v_src;
  end if;

  raise notice 'I-2a verification passed: 2 read functions, no schema, no grant change.';
end;
$v$;

commit;
