-- =====================================================================
-- Teacher Exams, item I-2b — the client loses its direct reach
-- =====================================================================
-- STATUS: ✅ APPLIED 2026-09-05 as version 20260905030858, after explicit
--         owner approval, from the reviewed package at commit 62643da
--         exactly as committed. Rollback: 20260908z, PREPARED and
--         unapplied — it has NO WINDOW, because a grant is not state and
--         nothing accumulates while it is absent.
--         ⚠️ THE UNDO ORDER IS NOW LOAD-BEARING: 20260908z FIRST, THEN
--         20260907z. Running 20260907z alone drops the two I-2a reads
--         while these grants are gone and leaves staff with no read at
--         all — the H5 blind state exactly.
--         Post-apply evidence: 19/19 behavioural checks on the live
--         database — both RPCs still serve staff, the teacher's own
--         direct SELECT on both tables is now 42501, all four kept
--         grants still resolve, and student / outsider / super_admin /
--         no-session / nonexistent-exam are all 42501. The policies
--         hash, all 31 teacher_exam* bodies, the function, policy and
--         table counts and every data count were byte-identical before
--         and after.
-- DEPENDS ON: I-2a (20260907a, LIVE as 20260904144132 — the two staff read
--             RPCs) AND the page switch that put teacher-exams.html on them
--             (merged 5c064fa, deployed and verified 2026-09-05).
-- ROLLBACK: 20260908z, PREPARED and unapplied. It restores EXACTLY these two
--           grants and nothing else.
-- CONTEXT: docs/roadmap/teacher-intelligence-layer.md §15.29 item I-2.
--
-- TWO STATEMENTS. That is the whole migration:
--
--   revoke select on teacher_exam_questions from authenticated;
--   revoke select on teacher_exam_stimuli   from authenticated;
--
-- WHAT THIS DOES NOT DO, AND WHY IT MATTERS MORE THAN WHAT IT DOES.
-- ---------------------------------------------------------------------
-- ⚠️ IT CLOSES NO LIVE LEAK. Say that plainly, because the opposite is the
-- easy thing to believe about a revoke. RLS on both tables carries a
-- staff-read policy and nothing else, so a non-staff caller's direct select
-- ALREADY returns zero rows — measured on production 2026-09-05, as an
-- enrolled student and as an outsider, on all six teacher_exam* tables:
-- every one returned 0. What this removes is the REACH, and with it the
-- chance that some later policy makes the grant matter. That is worth
-- having; it is not a fix for anything that is currently wrong.
--
-- It is also ROLE-WIDE, so it takes STAFF's direct read away too. That is
-- affordable only because I-2a shipped first: teacher_exam_list() and
-- teacher_exam_paper() already serve every read teacher-exams.html makes,
-- and the page has been live on them since 5c064fa. H5 revoked BEFORE H6
-- restored the read and staff were measurably blind in between, with no way
-- to edit an existing question. Read first, revoke second, never the other
-- way — and this file is the second half of that sentence.
--
-- SCOPE: TWO TABLES, NOT SIX, AND THIS WAS A DECISION.
-- ---------------------------------------------------------------------
-- authenticated holds SELECT on all six teacher_exam* tables. Four of them
-- KEEP it and this file does not name them:
--
--   teacher_exams            teacher_exam_access
--   teacher_exam_attempts    teacher_exam_responses
--
-- Two reasons. First, symmetry with H5, which revoked exactly the two
-- homework CONTENT tables and left teacher_homework itself granted —
-- measured on the live catalogue, not recalled. Second, and the real one:
-- nothing in this increment has established what those four are for, and a
-- revoke bundled in on the strength of "nothing seems to need it" is a
-- security decision taken by arithmetic. If they should go, that is its own
-- increment with its own audit. §3.2 asserts all four survive.
--
-- It adds no table, no policy, no function, no trigger and no enum label,
-- and it REDEFINES NOTHING — §3 asserts that too. The two staff-read
-- POLICIES stay exactly as they are: the policy is the rule and the grant is
-- the reach, and removing the reach is not a reason to forget the rule.
-- =====================================================================

begin;

-- ── 1 · the revoke ────────────────────────────────────────────────────
revoke select on teacher_exam_questions from authenticated;
revoke select on teacher_exam_stimuli   from authenticated;

-- ── 2 · nothing else ──────────────────────────────────────────────────
-- No grant, no policy, no function, no table. The absence is the design.

-- ── 3 · verification, inside the transaction ──────────────────────────
do $v$
declare
  n int;
  v_txt text;
begin
  -- 3.1 · the two named tables have NO client grant left, from either role.
  select count(*) into n from information_schema.role_table_grants
   where table_schema = 'public' and grantee in ('anon', 'authenticated')
     and table_name in ('teacher_exam_questions', 'teacher_exam_stimuli');
  if n <> 0 then
    raise exception 'I-2b: % client grants survive on the two content tables (expected 0)', n;
  end if;

  -- 3.2 · THE FOUR THAT MUST NOT MOVE. This is the assertion that makes the
  -- scope a decision rather than a coincidence: a file that revoked more
  -- than it was approved for dies here.
  select string_agg(table_name || ':' || privilege_type, ',' order by table_name, privilege_type)
    into v_txt
    from information_schema.role_table_grants
   where table_schema = 'public' and grantee = 'authenticated'
     and table_name like 'teacher\_exam%';
  if v_txt <> 'teacher_exam_access:SELECT,teacher_exam_attempts:SELECT,'
            || 'teacher_exam_responses:SELECT,teacher_exams:SELECT' then
    raise exception 'I-2b: the surviving grant set is wrong: %', v_txt;
  end if;

  -- 3.3 · the POLICIES are untouched. Both staff-read policies still exist,
  -- and the whole-schema count has not moved.
  select count(*) into n from pg_policies
   where schemaname = 'public'
     and tablename in ('teacher_exam_questions', 'teacher_exam_stimuli');
  if n <> 2 then
    raise exception 'I-2b: content-table policies moved: % (expected 2)', n; end if;
  select count(*) into n from pg_policies where schemaname = 'public';
  if n <> 133 then raise exception 'I-2b: policy count moved: % (expected 133)', n; end if;
  select count(*) into n from pg_tables where schemaname = 'public';
  if n <> 84 then raise exception 'I-2b: table count moved: % (expected 84)', n; end if;

  -- 3.4 · NO FUNCTION IS ADDED OR REDEFINED — asserted as a hash of all 31
  -- teacher_exam* bodies, the I-2a reads included. A count alone cannot see a
  -- REDEFINITION, which is the 20260831e hazard.
  select count(*) into n
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.proname like 'teacher_exam%';
  if n <> 31 then
    raise exception 'I-2b: teacher_exam* function count is % (expected 31)', n; end if;
  select md5(string_agg(p.proname || '|' || md5(p.prosrc), ',' order by p.proname)) into v_txt
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.proname like 'teacher_exam%';
  if v_txt <> '5cf7b7617f098fc200aac7cf6ecc23c0' then
    raise exception 'I-2b: a teacher_exam* body changed (bodies hash %)', v_txt;
  end if;

  -- 3.5 · the two reads I-2a shipped are still callable by authenticated —
  -- they are the ONLY way staff can see this content once the grant is gone,
  -- so a file that revoked the grant while breaking them would be the H5
  -- blind window all over again.
  if not (has_function_privilege('authenticated', 'teacher_exam_list(uuid)',  'EXECUTE')
      and has_function_privilege('authenticated', 'teacher_exam_paper(uuid)', 'EXECUTE')) then
    raise exception 'I-2b: authenticated can no longer call one of the I-2a reads';
  end if;

  raise notice 'I-2b verification passed: 2 grants revoked, 4 kept, nothing else moved.';
end;
$v$;

commit;
