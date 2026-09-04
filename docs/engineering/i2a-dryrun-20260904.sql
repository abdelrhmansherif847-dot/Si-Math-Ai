-- =====================================================================
-- I-2a PRODUCTION DRY-RUN ARTIFACT
-- RUN_ID: 7f3a91c4-2d68-4b05-9e17-c8a4b0d35e2f
-- =====================================================================
-- These are the exact bytes executed against production. The transaction is
-- opened here and is ABORTED by the raise in PART 4 -- there is no executable
-- commit anywhere in this file, because PART 1 and PART 3 are generated from
-- the migration and rollback with their own transaction control REMOVED. The
-- migration therefore cannot be applied by running this.
--
-- PART 1  20260907a, verbatim minus its transaction control
-- PART 2  probes. The assistants are made through staff_join_workspace() ->
--         teacher_set_staff_status(), never a direct workspace_staff INSERT:
--         a direct insert is refused 42501 by workspace_staff_guard(), which
--         is what invalidated the previous artifact. No probe pins a live row
--         COUNT either -- three drafts were created on the live page mid-run,
--         so the list is asserted as a relational invariant (exact set, exact
--         order) rather than against a number that a teacher can move.
-- PART 3  20260907z, verbatim minus its transaction control -- the rollback
--         rehearsal, including its own verification block
-- PART 4  post-rollback probes, the report, and the ABORT
-- =====================================================================

begin;

-- PART 1 · 20260907a
-- =====================================================================
-- Teacher Exams, item I-2a — staff read the paper through an RPC
-- =====================================================================
-- STATUS: 🟡 PREPARED. NOT APPLIED. Needs explicit owner approval.
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



-- ══ PART 2 · PROBES ══════════════════════════════════════════════════════
create temp table _r(seq serial, n text, got text, want text) on commit drop;
grant all on _r to public;
grant usage, select, update on sequence _r_seq_seq to public;

do $p$
declare
  WS    constant uuid := '66ab9465-5b5c-4f35-8753-4767bafb3060';
  EX    constant uuid := '688b3dd3-c08e-4617-9a51-439e5ca6b102';
  TEA   constant uuid := '43d2cb65-fac6-4690-817b-e540199405fb';
  ASST  constant uuid := '0469b960-935c-4f28-b8c5-81d6f7579135';
  PEND  constant uuid := '54af8696-285d-460d-891b-cc6801ec6d73';
  STU   constant uuid := '6b9a2f4b-26ab-4e29-aee3-dce9b116065e';
  OUT_  constant uuid := 'bfc32020-a393-4354-9856-458483284a3d';
  SUP   constant uuid := 'd634a21d-84be-4429-8c8a-d032b67867b4';
  CODE  constant text := 'TAC5PWR9';
  NOWS  constant uuid := '00000000-0000-4000-8000-0000000000ff';
  NOEX  constant uuid := '00000000-0000-4000-8000-0000000000fe';
  v_role0 text := current_user;
  v_t jsonb; v_a jsonb; v_n int; v_txt text; v_sid uuid; v_staff uuid; v_rec record;
begin
  -- P01/P02 · PASTE FIDELITY: installed bodies must equal the file's bytes.
  insert into _r(n,got,want) values ('P01 teacher_exam_list body md5',
    (select md5(prosrc) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname='teacher_exam_list'),
    'a0a8cf0c09e0dac4de4ab1c881b03c19');
  insert into _r(n,got,want) values ('P02 teacher_exam_paper body md5',
    (select md5(prosrc) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname='teacher_exam_paper'),
    '28953b6e6d2b0c7c5b0df3dfd40ca639');

  -- ── the assistants are created through the REAL path, never a direct insert.
  -- staff_join_workspace() as the assistant -> born 'pending';
  -- teacher_set_staff_status() as the OWNER -> 'active'.
  -- A direct INSERT is refused 42501 by workspace_staff_guard(), which is what
  -- invalidated the previous dry-run artifact.
  perform set_config('role','authenticated',true);

  perform set_config('request.jwt.claims', json_build_object('sub',ASST,'role','authenticated')::text, true);
  v_a := staff_join_workspace(CODE);
  insert into _r(n,got,want) values ('P03 assistant joined via staff_join_workspace', v_a->>'status', 'pending');

  perform set_config('request.jwt.claims', json_build_object('sub',PEND,'role','authenticated')::text, true);
  v_a := staff_join_workspace(CODE);
  insert into _r(n,got,want) values ('P04 second assistant joined, left pending', v_a->>'status', 'pending');

  perform set_config('request.jwt.claims', json_build_object('sub',TEA,'role','authenticated')::text, true);
  select id into v_staff from workspace_staff where workspace_id = WS and user_id = ASST;
  perform teacher_set_staff_status(v_staff, 'active');
  insert into _r(n,got,want) values ('P05 assistant activated by the owner',
    (select status::text from workspace_staff where id = v_staff), 'active');
  insert into _r(n,got,want) values ('P06 the other assistant is still pending',
    (select status::text from workspace_staff where workspace_id = WS and user_id = PEND), 'pending');

  -- a real figure, written by the REAL RPC so media_sha256 is server-computed
  v_sid := teacher_exam_save_stimulus(EX, null, 'figure', 'Dry-run figure', null, null,
             encode(convert_to('<svg xmlns="http://www.w3.org/2000/svg"/>','UTF8'),'base64'));
  insert into _r(n,got,want) values ('P07 the figure really has a media_sha256 (non-vacuity)',
    (select case when media_sha256 is null then 'NULL' else 'present' end
       from teacher_exam_stimuli where id = v_sid), 'present');

  -- ── the TEACHER reads
  insert into _r(n,got,want) values ('P08 list returns EXACTLY the workspace''s exams',
    case when (select array_agg(x.exam_id order by x.exam_id) from teacher_exam_list(WS) x)
            = (select array_agg(e.id order by e.id) from teacher_exams e where e.workspace_id = WS)
         then 'EXACT SET' else 'MISMATCH' end, 'EXACT SET');
  select count(*) into v_n from teacher_exam_list(WS);
  insert into _r(n,got,want) values ('P08b …and that set is not empty (non-vacuity)',
    case when v_n > 0 then 'non-empty (' || v_n || ')' else 'EMPTY' end,
    'non-empty (' || (select count(*) from teacher_exams where workspace_id = WS) || ')');
  insert into _r(n,got,want) values ('P08c …in created_at desc order, as the page asks the table for',
    case when (select string_agg(t.exam_id::text, ',' order by t.ord)
                 from (select exam_id, row_number() over () as ord from teacher_exam_list(WS)) t)
            = (select string_agg(e.id::text, ',' order by e.rn)
                 from (select id, row_number() over (order by created_at desc) as rn
                         from teacher_exams where workspace_id = WS) e)
         then 'ORDERED' else 'WRONG ORDER' end, 'ORDERED');
  v_t := teacher_exam_paper(EX);
  insert into _r(n,got,want) values ('P09 teacher paper exam_id', v_t->>'exam_id', EX::text);
  insert into _r(n,got,want) values ('P10 teacher paper stimuli', jsonb_array_length(v_t->'stimuli')::text, '1');
  insert into _r(n,got,want) values ('P11 teacher paper questions', jsonb_array_length(v_t->'questions')::text, '1');
  insert into _r(n,got,want) values ('P12 can_edit_content is true for a draft', v_t->>'can_edit_content', 'true');

  -- ── PARITY: the ACTIVE assistant must read byte-identically
  perform set_config('request.jwt.claims', json_build_object('sub',ASST,'role','authenticated')::text, true);
  v_a := teacher_exam_paper(EX);
  insert into _r(n,got,want) values ('P13 ACTIVE assistant paper == teacher paper',
    case when v_a = v_t then 'PARITY' else 'DIFFERS' end, 'PARITY');
  insert into _r(n,got,want) values ('P14 ACTIVE assistant list == teacher list',
    case when (select jsonb_agg(to_jsonb(x) order by x.exam_id) from teacher_exam_list(WS) x)
            = (select jsonb_agg(to_jsonb(y) order by y.exam_id) from teacher_exam_list(WS) y)
         then 'PARITY' else 'DIFFERS' end, 'PARITY');

  -- ── DENIALS, every non-staff caller, both functions
  for v_rec in select * from (values
        ('pending assistant', PEND), ('enrolled student', STU),
        ('outsider', OUT_), ('platform super_admin', SUP)) as x(lbl, uid)
  loop
    perform set_config('request.jwt.claims', json_build_object('sub',v_rec.uid,'role','authenticated')::text, true);
    begin
      select count(*) into v_n from teacher_exam_list(WS);
      v_txt := 'NO ERROR (' || v_n || ' rows)';
    exception when others then get stacked diagnostics v_txt = returned_sqlstate;
    end;
    insert into _r(n,got,want) values ('D · ' || v_rec.lbl || ' -> list', v_txt, '42501');
    begin
      v_a := teacher_exam_paper(EX);
      v_txt := 'NO ERROR';
    exception when others then get stacked diagnostics v_txt = returned_sqlstate;
    end;
    insert into _r(n,got,want) values ('D · ' || v_rec.lbl || ' -> paper', v_txt, '42501');
  end loop;

  -- no session at all
  perform set_config('request.jwt.claims','{}',true);
  begin
    select count(*) into v_n from teacher_exam_list(WS); v_txt := 'NO ERROR';
  exception when others then get stacked diagnostics v_txt = returned_sqlstate;
  end;
  insert into _r(n,got,want) values ('D · no session -> list', v_txt, '42501');
  begin
    v_a := teacher_exam_paper(EX); v_txt := 'NO ERROR';
  exception when others then get stacked diagnostics v_txt = returned_sqlstate;
  end;
  insert into _r(n,got,want) values ('D · no session -> paper', v_txt, '42501');

  -- a workspace / exam that does not exist must be REFUSED, never an empty set
  perform set_config('request.jwt.claims', json_build_object('sub',TEA,'role','authenticated')::text, true);
  begin
    select count(*) into v_n from teacher_exam_list(NOWS);
    v_txt := 'NO ERROR (' || v_n || ' rows)';
  exception when others then get stacked diagnostics v_txt = returned_sqlstate;
  end;
  insert into _r(n,got,want) values ('D · nonexistent workspace -> list (not an empty set)', v_txt, '42501');
  begin
    v_a := teacher_exam_paper(NOEX); v_txt := 'NO ERROR';
  exception when others then get stacked diagnostics v_txt = returned_sqlstate;
  end;
  insert into _r(n,got,want) values ('D · nonexistent exam -> paper', v_txt, '42501');

  -- ── PAYLOAD SHAPE, on the teacher's own payload
  insert into _r(n,got,want) values ('P15 media_sha256 absent from the paper payload',
    case when v_t::text like '%media_sha256%' then 'PRESENT' else 'absent' end, 'absent');
  insert into _r(n,got,want) values ('P16 stimulus field count',
    (select count(*)::text from jsonb_object_keys(v_t->'stimuli'->0) k), '7');
  insert into _r(n,got,want) values ('P17 stimulus fields, exactly',
    (select string_agg(k, ',' order by k) from jsonb_object_keys(v_t->'stimuli'->0) k),
    'body,id,kind,label,media_kind,media_ref,spec');
  insert into _r(n,got,want) values ('P18 question field count',
    (select count(*)::text from jsonb_object_keys(v_t->'questions'->0) k), '8');
  insert into _r(n,got,want) values ('P19 question fields, exactly',
    (select string_agg(k, ',' order by k) from jsonb_object_keys(v_t->'questions'->0) k),
    'choices,correct_answer,explanation,id,ordinal,prompt,question_format,stimulus_id');
  insert into _r(n,got,want) values ('P20 list declares 15 OUT columns',
    (select count(*)::text
       from pg_proc p
       join pg_namespace ns on ns.oid = p.pronamespace
       cross join lateral unnest(p.proargmodes) as m
      where ns.nspname='public' and p.proname='teacher_exam_list' and m = 't'), '15');

  -- ── I-2a REVOKES NOTHING: the direct table reads must still work today.
  perform set_config('request.jwt.claims', json_build_object('sub',TEA,'role','authenticated')::text, true);
  begin
    select count(*) into v_n from teacher_exam_questions where exam_id = EX;
    v_txt := 'ok (' || v_n || ' rows)';
  exception when others then get stacked diagnostics v_txt = returned_sqlstate;
  end;
  insert into _r(n,got,want) values ('P21 teacher direct SELECT on teacher_exam_questions', v_txt, 'ok (1 rows)');
  begin
    select count(*) into v_n from teacher_exam_stimuli where exam_id = EX;
    v_txt := 'ok (' || v_n || ' rows)';
  exception when others then get stacked diagnostics v_txt = returned_sqlstate;
  end;
  insert into _r(n,got,want) values ('P22 teacher direct SELECT on teacher_exam_stimuli', v_txt, 'ok (1 rows)');

  perform set_config('role', v_role0, true);
  perform set_config('request.jwt.claims','{}',true);

  insert into _r(n,got,want) values ('P23 content-table grants to authenticated (I-2b has not run)',
    (select count(*)::text from information_schema.role_table_grants
      where table_schema='public' and grantee in ('anon','authenticated')
        and table_name in ('teacher_exam_questions','teacher_exam_stimuli')), '2');
  insert into _r(n,got,want) values ('P24 teacher_exam* functions installed (29 + these 2)',
    (select count(*)::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname like 'teacher\_exam%'), '31');
  insert into _r(n,got,want) values ('P25 anon holds EXECUTE on neither read',
    (has_function_privilege('anon','teacher_exam_list(uuid)','EXECUTE')
     or has_function_privilege('anon','teacher_exam_paper(uuid)','EXECUTE'))::text, 'false');
end;
$p$;


-- PART 3 · 20260907z · ROLLBACK REHEARSAL
-- =====================================================================
-- Rollback for 20260907a — Teacher Exams I-2a
-- =====================================================================
-- STATUS: 🟡 PREPARED, deliberately unapplied.
--
-- ✅ THIS ROLLBACK HAS NO WINDOW.
-- ---------------------------------------------------------------------
-- The same posture as 20260906z, and for the same reason. 20260907a adds two
-- READ functions and nothing else: no table, no policy, no grant on any table,
-- no trigger, no enum label, no audit label, and it redefines NO existing
-- function. There is therefore no data to strand, no body to restore
-- byte-for-byte, and no state that makes the undo unsafe later than it was
-- earlier. It is two DROP FUNCTION statements.
--
-- Because nothing is restored, this file needs NO refusal condition. A refusal
-- would be theatre: there is no condition under which dropping two staff read
-- functions loses information. Compare 20260905z, which refuses while any
-- attempt exists precisely because removing the RPCs there WOULD strand a
-- student mid-paper.
--
-- WHAT RUNNING IT COSTS, and it is less than H6's equivalent. Any client built
-- on these two functions stops working — after I-2a that is teacher-exams.html.
-- But authenticated still holds SELECT on teacher_exams,
-- teacher_exam_questions and teacher_exam_stimuli, because I-2a deliberately
-- revokes nothing. So the pre-I-2a page, which reads those tables directly,
-- still works exactly as it does today.
--
-- ⚠️ THAT CHANGES THE DAY I-2b SHIPS. Once the revokes land, dropping these two
-- functions leaves staff with no read at all — the blind state H5 created on
-- the homework side. From that point this rollback must be run together with
-- I-2b's, never alone. I-2b's rollback file will say the same thing from its
-- side.
-- =====================================================================


drop function if exists teacher_exam_paper(uuid);
drop function if exists teacher_exam_list(uuid);

-- ── verification ──────────────────────────────────────────────────────
do $v$
declare n int;
begin
  select count(*) into n
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.proname in ('teacher_exam_list', 'teacher_exam_paper');
  if n <> 0 then
    raise exception 'I-2a rollback: % of the two read functions survived', n;
  end if;

  -- The rollback must remove ONLY those two. Everything else 3b and 3c
  -- installed has to still be there: 29 teacher_exam* functions, as before —
  -- and the same body hash the forward file asserts, so this cannot pass by
  -- coincidence of arithmetic.
  select count(*) into n
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.proname like 'teacher_exam%';
  if n <> 29 then
    raise exception 'I-2a rollback: teacher_exam* function count is % (expected 29)', n;
  end if;

  if (select md5(string_agg(p.proname || '|' || md5(p.prosrc), ',' order by p.proname))
        from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
       where ns.nspname = 'public' and p.proname like 'teacher_exam%')
     <> 'a664e4521cbaffc1d0cce3f051dbdcfd' then
    raise exception 'I-2a rollback: the surviving teacher_exam* bodies are not the pre-I-2a set';
  end if;

  -- And it must not have touched the grants either way.
  select count(*) into n from information_schema.role_table_grants
   where table_schema = 'public' and grantee in ('anon', 'authenticated')
     and table_name in ('teacher_exam_questions', 'teacher_exam_stimuli');
  if n <> 2 then
    raise exception 'I-2a rollback: content-table grants moved (found %)', n;
  end if;

  raise notice 'I-2a rollback verified: both reads gone, 29 teacher_exam* functions remain.';
end;
$v$;



-- ══ PART 4 · POST-ROLLBACK PROBES, REPORT, AND ABORT ═════════════════════
do $done$
declare
  v_out text := '';
  v_bad int  := 0;
  v_all int  := 0;
  r record;
begin
  -- the rollback in PART 3 has already run; record what it left behind
  insert into _r(n,got,want) values ('R01 I-2a functions surviving the rollback',
    (select count(*)::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname in ('teacher_exam_list','teacher_exam_paper')), '0');
  insert into _r(n,got,want) values ('R02 teacher_exam* functions after rollback',
    (select count(*)::text from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname like 'teacher\_exam%'), '29');
  insert into _r(n,got,want) values ('R03 surviving bodies are byte-for-byte the pre-I-2a set',
    (select md5(string_agg(p.proname||'|'||md5(p.prosrc), ',' order by p.proname))
       from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname like 'teacher\_exam%'),
    'a664e4521cbaffc1d0cce3f051dbdcfd');
  insert into _r(n,got,want) values ('R04 grants unmoved by the rollback',
    (select count(*)::text from information_schema.role_table_grants
      where table_schema='public' and grantee in ('anon','authenticated')
        and table_name in ('teacher_exam_questions','teacher_exam_stimuli')), '2');

  for r in select * from _r order by seq loop
    v_all := v_all + 1;
    if r.got is distinct from r.want then
      v_bad := v_bad + 1;
      v_out := v_out || E'\n  FAIL  ' || r.n || ' | got=' || coalesce(r.got,'<null>') || ' want=' || r.want;
    else
      v_out := v_out || E'\n  ok    ' || r.n || ' = ' || coalesce(r.got,'<null>');
    end if;
  end loop;

  raise exception E'\n=== I-2a DRY-RUN · RUN_ID 7f3a91c4-2d68-4b05-9e17-c8a4b0d35e2f ===%\n\n=== %/% passed, % failed · TRANSACTION ABORTED ===',
    v_out, v_all - v_bad, v_all, v_bad;
end;
$done$;

