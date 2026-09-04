-- =====================================================================
-- Teacher Homework, increment H6 — staff can read the paper they authored
-- =====================================================================
-- STATUS: 🟡 PREPARED, not applied. Apply only with explicit owner approval
--         (CLAUDE.md §3). Rollback: 20260906z.
-- DEPENDS ON: H2 (the tables), H3 (the authoring writes), H4 (the attach path)
--             and H5 (the sitting, LIVE 2026-09-04 as 20260904003547).
-- CONTEXT: docs/roadmap/teacher-intelligence-layer.md §15.26 (the H6 audit and
--          the seven locked decisions D6-1 … D6-7).
--
-- WHAT THIS IS. Two read functions and nothing else. It pays the bill F-5 handed
-- H6: since 20260904003547 revoked authenticated's SELECT on
-- teacher_homework_questions AND teacher_homework_stimuli, staff have had NO way
-- to read the content they authored. Measured, not inferred: a teacher and an
-- ACTIVE assistant both get 42501 on both tables today, so authoring is
-- currently write-only and blind, and there is no path to edit an existing
-- question. These two functions restore the read, deliberately, through the RPC
-- boundary rather than by handing the grant back.
--
-- WHAT IT IS NOT. No table, no policy, no grant on any table, no trigger, no
-- enum label, no audit label, no lock, no analyzer interaction, and NO existing
-- function is redefined. §3 asserts all of it.
--
-- ⚠️ NOTE WHAT IS ABSENT. Unlike H3, H4 and H5, this file redefines NOTHING, so
--    it does NOT carry the 20260831e hazard those three carried. That is the
--    single biggest reason this increment is safe to apply and trivial to undo:
--    20260906z is two DROP FUNCTION statements, it needs no refusal condition,
--    it restores no body byte-for-byte, and ITS WINDOW NEVER CLOSES. There is no
--    state to strand. The only consequence of running it is that authoring goes
--    blind again.
--
-- THE SEVEN LOCKED DECISIONS THIS FILE IMPLEMENTS
-- -----------------------------------------------
--   D6-1  dedicated read RPCs; the H3 write RPCs are not reshaped. They return
--         uuid / void / a two-key jsonb, so no reshaping could serve a read.
--   D6-2  exactly two: the list and the paper.
--   D6-3  the list is RPC-only and gates on workspace_is_active_staff BEFORE it
--         selects, so an unauthorized workspace id raises 42501 rather than
--         returning an empty list. An empty list would be a weak existence
--         oracle: it would say "that workspace has no homework" to someone who
--         is not entitled to know whether it exists at all.
--   D6-4  media_sha256 is NOT returned. It is a server-computed integrity value
--         (teacher_homework_save_stimulus computes it and ignores any client
--         value) and no client in the repository reads it — stimulus-view.js,
--         the shared renderer, consumes kind, label, body, spec, media_ref and
--         media_kind and nothing else. §3 pins the exposed list both ways.
--   D6-5  the F-5 revokes stay. This file contains no GRANT on any table.
--   D6-6  the Teacher Exams select('*') pattern is untouched, out of scope.
--   D6-7  no audit label. Reads are unaudited everywhere on this platform, and
--         H5's D-6 settled the same question the same way.
--
-- PARITY IS STRUCTURAL, NOT ASSERTED
-- ----------------------------------
-- Both gates reuse the canonical helpers BY CALL and restate no predicate:
-- teacher_homework_is_staff() -> workspace_is_active_staff(), which tests
-- status = 'active' AND the workspace is active and NEVER reads staff_role. A
-- teacher and an ACTIVE assistant are therefore identical here because they are
-- identical there — there is no second copy of the rule to drift.
--
-- The admin arm belongs to the POLICIES, not to these functions. The staff-read
-- policies say `... OR has_role_at_least('admin')`; these gates do not, so a
-- platform admin who is not active staff of the workspace is refused by both
-- functions. That is deliberate: the audit for this increment initially
-- mis-measured a PENDING assistant as able to read three homework rows, because
-- the profile it used happened to be a platform super_admin and matched the
-- policy's admin arm. Re-run with ordinary users, a pending assistant reads
-- zero. Keeping the admin arm out of these gates means the RPC surface cannot
-- inherit that surprise.
-- =====================================================================

begin;

-- ── 1 · the paper list ────────────────────────────────────────────────
-- THE GATE COMES FIRST AND IT GATES ON THE WORKSPACE (D6-3). Filtering rows by
-- staffness instead would return an empty set to an outsider, which answers a
-- question they are not entitled to ask.
create or replace function teacher_homework_list(p_workspace uuid)
returns table (
  homework_id      uuid,
  title            text,
  homework_code    text,
  status           text,
  due_at           timestamptz,
  reveal_answers   boolean,
  created_at       timestamptz,
  published_at     timestamptz,
  closed_at        timestamptz,
  question_count   integer,
  attached_count   integer,
  attempt_count    integer,
  submitted_count  integer
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $fn$
begin
  if not workspace_is_active_staff(p_workspace) then
    raise exception 'teacher_homework_list: no such class, or you are not active staff of it'
      using errcode = '42501';
  end if;

  return query
    select h.id, h.title, h.homework_code, h.status, h.due_at, h.reveal_answers,
           h.created_at, h.published_at, h.closed_at,
           (select count(*)::int from teacher_homework_questions q where q.homework_id = h.id),
           (select count(*)::int from teacher_homework_access a where a.homework_id = h.id),
           (select count(*)::int from teacher_homework_attempts t where t.homework_id = h.id),
           (select count(*)::int from teacher_homework_attempts t
             where t.homework_id = h.id and t.status = 'submitted')
      from teacher_homework h
     where h.workspace_id = p_workspace
     -- Drafts first because they are the ones still being worked on, then the
     -- most recently created. Status is text, so the ordering is spelled out
     -- rather than left to alphabetical accident (closed < draft < published).
     order by case h.status when 'draft' then 0 when 'published' then 1 else 2 end,
              h.created_at desc;
end;
$fn$;

-- ── 2 · one paper, with its content ───────────────────────────────────
-- The staff read of everything they authored, INCLUDING the answer key and the
-- explanation — they wrote them, and they cannot edit what they cannot see.
-- This is not the student read: student_homework_paper() gates the key on
-- reveal_answers AND the caller's own submitted attempt (S-1) and is untouched
-- by this file.
create or replace function teacher_homework_paper(p_homework uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $fn$
declare h teacher_homework%rowtype;
begin
  if not teacher_homework_is_staff(p_homework) then
    raise exception 'teacher_homework_paper: no such homework, or you are not staff of its class'
      using errcode = '42501';
  end if;

  select * into h from teacher_homework where id = p_homework;

  return jsonb_build_object(
    'homework_id', h.id, 'workspace_id', h.workspace_id,
    'title', h.title, 'instructions', h.instructions,
    'homework_code', h.homework_code, 'status', h.status,
    'due_at', h.due_at, 'reveal_answers', h.reveal_answers,
    'created_at', h.created_at, 'published_at', h.published_at, 'closed_at', h.closed_at,
    -- The one derived field, and it is derived from the same condition
    -- teacher_homework_content_guard() enforces: content is editable only while
    -- the paper is a draft. The page must not have to know that rule twice.
    'can_edit_content', (h.status = 'draft'),
    -- D6-4: seven stimulus fields, named one by one. media_sha256 is absent and
    -- §3 asserts it, because a later s.* would put it back without anyone
    -- noticing. created_at/updated_at are internal and add nothing to authoring.
    'stimuli', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', s.id, 'kind', s.kind, 'label', s.label, 'body', s.body,
               'spec', s.spec, 'media_ref', s.media_ref, 'media_kind', s.media_kind
             ) order by s.created_at, s.id)
        from teacher_homework_stimuli s where s.homework_id = p_homework), '[]'::jsonb),
    -- Eight question fields. correct_answer and explanation are HERE and that is
    -- not a leak: this function is staff-gated, and staff authored them.
    'questions', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', q.id, 'ordinal', q.ordinal, 'prompt', q.prompt,
               'question_format', q.question_format, 'choices', q.choices,
               'correct_answer', q.correct_answer, 'explanation', q.explanation,
               'stimulus_id', q.stimulus_id
             ) order by q.ordinal)
        from teacher_homework_questions q where q.homework_id = p_homework), '[]'::jsonb));
end;
$fn$;

-- ── 3 · privileges ────────────────────────────────────────────────────
-- Revoke then grant: the default ACL on a new function is EXECUTE to PUBLIC,
-- so granting without revoking first would leave anon able to call it.
revoke all on function teacher_homework_list(uuid)  from public, anon, authenticated;
revoke all on function teacher_homework_paper(uuid) from public, anon, authenticated;

grant execute on function teacher_homework_list(uuid)  to authenticated;
grant execute on function teacher_homework_paper(uuid) to authenticated;

-- NO grant on any table appears in this file. F-5 stands (D6-5).

-- ── 4 · verification ──────────────────────────────────────────────────
-- Every assertion names what would breach it, so each one could go red. Source
-- checks read the installed body with -- comments STRIPPED, because the H4
-- dry-run found a check that could ONLY raise: it matched a word the body used
-- in a comment to disclaim it. The raw prosrc is held in no variable at all.
do $$
declare
  v_bad text; v_n integer; v_code text;
  NEWFN constant text[] := array['teacher_homework_list','teacher_homework_paper'];
begin
  -- 4.1 H6 ADDS NO TABLE, NO POLICY, NO ENUM LABEL, NO TRIGGER
  select count(*) into v_n from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname like 'teacher\_homework%' and c.relkind = 'r';
  if v_n <> 8 then
    raise exception 'H6: the homework table count moved to % — this increment adds none', v_n;
  end if;
  select count(*) into v_n from pg_policy p join pg_class c on c.oid = p.polrelid
   where c.relname like 'teacher\_homework%';
  if v_n <> 9 then
    raise exception 'H6: the homework policy count moved to % — this increment adds none', v_n;
  end if;
  select count(*) into v_n from pg_enum e join pg_type t on t.oid = e.enumtypid
   where t.typname = 'workspace_audit_action';
  if v_n <> 22 then
    raise exception 'H6: the audit label count moved to % — D6-7 adds none', v_n;
  end if;
  -- 12, measured: 2 on teacher_homework, 2 on questions, 3 on responses (H5's
  -- two plus H2's), and 1 each on stimuli, access, attempts, retired_codes and
  -- attach_attempts. The first draft of this check guessed 8 and the dry-run
  -- refused the file outright — which is the check working, a page earlier than
  -- usual.
  select count(*) into v_n from pg_trigger tg join pg_class c on c.oid = tg.tgrelid
   where c.relname like 'teacher\_homework%' and not tg.tgisinternal;
  if v_n <> 12 then
    raise exception 'H6: the homework trigger count moved to % — this increment adds none', v_n;
  end if;

  -- 4.2 IT REDEFINES NOTHING. Every function H6 must not own still carries the
  --     body H5 left live. This is the check H3, H4 and H5 each needed because
  --     they DID redefine; H6 passing it means it carried no such hazard.
  select string_agg(x.n, ', ') into v_bad from (values
      ('teacher_homework_is_staff','63ef7fa28bf3a0c48bd6658abd11009a'),
      ('workspace_is_active_staff','b40ec96a8eb64a7d3a22f80f66f26ec0'),
      ('teacher_homework_can_open','9ef8d477bede57132177ca896ab4a2f9'),
      ('teacher_homework_code_guard','f54ea68a1b3ef3de5475e92c601a51dc'),
      ('teacher_homework_content_guard','e9e80a7ac07b362919c3d363b9016844'),
      ('teacher_homework_can_resume','b122cb715fcea62e2a2258cf163c64b0'),
      ('teacher_homework_attempts_guard','33638efcd5a0d53c590ba37df7bf09e9'),
      ('teacher_homework_responses_guard','df3c3a65a7293ac9cc05e2c2a82c1a15'),
      ('teacher_homework_verdict_guard','7ed961745e7437e1f74b6283303e1096'),
      ('teacher_homework_verdict_state_guard','9bd87804cb4b78774ee5986c88a12876'),
      ('student_homework_paper','ff8ba52d7221103dde07bcb2345d1d7a'),
      ('student_homework_start','d0f918fdf3a1a5896348fdcd19a5bfe1'),
      ('student_homework_save','f0f77954d51e913adc57d2854fae0d9d'),
      ('student_homework_submit','2fa7f9637d23dc2c8c090abdf917d814'),
      ('student_my_homework','f123a59911a2683e39a76df0020dfd0d'),
      ('teacher_homework_students','7e64a3340f639aa54289b52559e4b471'),
      ('teacher_homework_review','f572a0ee1344460ab4a779343ef76348')
    ) as x(n, md5_expected)
   where (select md5(p.prosrc) from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
           where ns.nspname = 'public' and p.proname = x.n) is distinct from x.md5_expected;
  if v_bad is not null then
    raise exception 'H6: it disturbed a function it does not own: %', v_bad;
  end if;

  -- 4.3 both new functions are definer, pinned, authenticated-only
  select string_agg(p.proname, ', ') into v_bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = any (NEWFN)
     and (not p.prosecdef
          or not (p.proconfig @> array['search_path=pg_catalog, public'])
          or not has_function_privilege('authenticated', p.oid, 'execute'));
  if v_bad is not null then
    raise exception 'H6: not definer, search_path unpinned, or not callable: %', v_bad;
  end if;
  select string_agg(p.proname, ', ') into v_bad
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and (p.proname like 'teacher\_homework%' or p.proname like 'student\_homework%'
          or p.proname in ('student_attach_homework','student_my_homework'))
     and has_function_privilege('anon', p.oid, 'execute');
  if v_bad is not null then
    raise exception 'H6: anon can call: %', v_bad;
  end if;

  -- 4.4 F-5 IS INTACT. Neither content table regained a grant, and both
  --     staff-read policies are still there — the rule surviving the reach.
  select string_agg(c.relname, ', ') into v_bad
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relname in ('teacher_homework_questions','teacher_homework_stimuli')
     and has_table_privilege('authenticated', c.oid, 'select');
  if v_bad is not null then
    raise exception 'H6: F-5 was reverted — authenticated holds a direct SELECT on: %', v_bad;
  end if;
  select string_agg(x.t, ', ') into v_bad from (values
      ('teacher_homework_questions','teacher_homework_questions_staff_read'),
      ('teacher_homework_stimuli','teacher_homework_stimuli_staff_read')
    ) as x(t, pol)
   where not exists (select 1 from pg_policy p join pg_class c on c.oid = p.polrelid
                      where c.relname = x.t and p.polname = x.pol);
  if v_bad is not null then
    raise exception 'H6: a staff-read policy was dropped: %', v_bad;
  end if;

  -- 4.5 THE GATES ARE THE CANONICAL HELPERS, CALLED, NOT RESTATED.
  select regexp_replace(p.prosrc, '--[^\n]*', '', 'g') into v_code
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'teacher_homework_list';
  if v_code !~ 'if not workspace_is_active_staff\(p_workspace\) then' then
    raise exception 'H6: the list does not gate on workspace_is_active_staff BEFORE it selects';
  end if;
  if position('workspace_is_active_staff' in v_code) > position('return query' in v_code) then
    raise exception 'H6: the list gates AFTER it selects — an outsider would get an empty list, not 42501';
  end if;
  if v_code ~ 'staff_role' then
    raise exception 'H6: the list reads staff_role — teacher and assistant must be structurally identical';
  end if;
  if v_code ~ 'workspace_staff' or v_code ~ 'has_role_at_least' then
    raise exception 'H6: the list restates the staff predicate instead of calling the helper';
  end if;
  if v_code ~ 'for update' or v_code ~ 'for share' then
    raise exception 'H6: the list takes a lock — these are reads';
  end if;

  select regexp_replace(p.prosrc, '--[^\n]*', '', 'g') into v_code
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'teacher_homework_paper';
  if v_code !~ 'if not teacher_homework_is_staff\(p_homework\) then' then
    raise exception 'H6: the paper does not gate on teacher_homework_is_staff';
  end if;
  if position('teacher_homework_is_staff' in v_code) > position('jsonb_build_object' in v_code) then
    raise exception 'H6: the paper builds its payload before it authorizes';
  end if;
  if v_code ~ 'staff_role' then
    raise exception 'H6: the paper reads staff_role — parity must be structural';
  end if;
  if v_code ~ 'workspace_staff' or v_code ~ 'has_role_at_least' then
    raise exception 'H6: the paper restates the staff predicate instead of calling the helper';
  end if;
  if v_code ~ 'for update' or v_code ~ 'for share' then
    raise exception 'H6: the paper takes a lock — these are reads';
  end if;

  -- 4.6 D6-4 · THE EXPOSED STIMULUS FIELDS, PINNED BOTH WAYS.
  if v_code ~ 'media_sha256' then
    raise exception 'H6: the staff paper read exposes media_sha256 — D6-4 forbids it';
  end if;
  if v_code ~ 'select\s+s\.\*' or v_code ~ 'select\s+q\.\*' then
    raise exception 'H6: the paper selects a whole row instead of naming its fields';
  end if;
  -- Counted as the JSON PAIR, not as a bare column reference. An earlier draft
  -- of this block counted 's.id' and 'q.ordinal' and required exactly one --
  -- which they can never satisfy, because each is legitimately named twice: once
  -- in the payload and once in the ORDER BY that makes the array deterministic.
  -- That check could ONLY have raised, so the file could not have installed. It
  -- is the same shape as the defects the H3 and H4 dry-runs caught, and the rule
  -- it breaks is the same one: a check that cannot go green is as useless as one
  -- that cannot go red. What must be unique is the EXPOSURE, so that is what is
  -- counted.
  select string_agg(f.c, ' | ' order by f.c) into v_bad
    from unnest(array['''id'', s.id', '''kind'', s.kind', '''label'', s.label',
                      '''body'', s.body', '''spec'', s.spec',
                      '''media_ref'', s.media_ref', '''media_kind'', s.media_kind']) as f(c)
   where (length(v_code) - length(replace(v_code, f.c, ''))) / length(f.c) <> 1;
  if v_bad is not null then
    raise exception 'H6: a stimulus field is not exposed exactly once in the staff read: %', v_bad;
  end if;
  select string_agg(f.c, ' | ' order by f.c) into v_bad
    from unnest(array['''id'', q.id', '''ordinal'', q.ordinal', '''prompt'', q.prompt',
                      '''question_format'', q.question_format', '''choices'', q.choices',
                      '''correct_answer'', q.correct_answer', '''explanation'', q.explanation',
                      '''stimulus_id'', q.stimulus_id']) as f(c)
   where (length(v_code) - length(replace(v_code, f.c, ''))) / length(f.c) <> 1;
  if v_bad is not null then
    raise exception 'H6: a question field is not exposed exactly once in the staff read: %', v_bad;
  end if;
  -- The key IS here, and that is the point of the increment. A paper read that
  -- withheld it would leave staff unable to edit what they wrote.
  if v_code !~ 'q\.correct_answer' or v_code !~ 'q\.explanation' then
    raise exception 'H6: the staff paper read withholds the key it exists to return';
  end if;

  -- 4.7 THE ANALYZER BOUNDARY IS NOT ASSERTED HERE, DELIBERATELY — the same
  --     decision H5 §12.9 records. tests/teacher-access-scope.test.mjs bans any
  --     forward migration from NAMING an academic table in executable SQL at
  --     all, which is the stronger statement and is already enforced in CI. A
  --     weaker copy here would have to name those tables to forbid them, and
  --     would therefore break the real rule. These are two staff reads over
  --     homework tables; they write nothing anywhere.

  -- 4.8 the shape of the homework system after this increment
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and (p.proname like 'teacher\_homework%' or p.proname like 'student\_homework%'
          or p.proname in ('student_attach_homework','student_my_homework'));
  if v_n <> 40 then
    raise exception 'H6: expected 40 homework functions (38 before + 2 new), found %', v_n;
  end if;
end $$;

commit;
