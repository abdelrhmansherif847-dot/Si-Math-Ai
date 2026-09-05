-- =====================================================================
-- Rollback for 20260908a — Teacher Exams I-2b
-- =====================================================================
-- STATUS: 🟡 PREPARED, deliberately unapplied.
--
-- It restores EXACTLY the two grants 20260908a took, and nothing else:
--
--   grant select on teacher_exam_questions to authenticated;
--   grant select on teacher_exam_stimuli   to authenticated;
--
-- ✅ THIS ROLLBACK HAS NO WINDOW. A grant is not state: nothing accumulates
-- while it is absent, so restoring it later is exactly as safe as restoring
-- it immediately. Compare 20260905z, whose window closes at the first
-- sitting because an attempt in progress CAN be stranded.
--
-- ⚠️ IT RESTORES REACH THE PAGE NO LONGER USES. teacher-exams.html has been
-- RPC-only since 5c064fa and does not read these tables, so running this does
-- not "fix" the page — it puts the direct read back for anything that might
-- want it. Nothing in the repository does. Run it if I-2b turns out to have
-- broken a consumer nobody enumerated, and expect that consumer to be
-- something outside this repo.
--
-- ⚠️ AND THE ONE THAT MATTERS: 20260907z — I-2a's rollback — MUST NOT BE RUN
-- ALONE once 20260908a is applied. That file drops teacher_exam_list() and
-- teacher_exam_paper(). With those gone AND the grants revoked, staff have no
-- read at all: not through an RPC, not through the table. That is precisely
-- the blind state H5 created on the homework side, where authoring was
-- write-only with no way to edit an existing question. From the day 20260908a
-- ships, the order for a full undo is THIS FILE FIRST, THEN 20260907z —
-- and §2.4 below refuses if the I-2a reads are already gone, so the wrong
-- order fails loudly instead of quietly blinding the staff surface.
-- =====================================================================

begin;

-- ── 1 · restore the two grants ────────────────────────────────────────
grant select on teacher_exam_questions to authenticated;
grant select on teacher_exam_stimuli   to authenticated;

-- ── 2 · verification ──────────────────────────────────────────────────
do $v$
declare
  n int;
  v_txt text;
begin
  -- 2.1 · both grants are back, for authenticated and for nobody else.
  select count(*) into n from information_schema.role_table_grants
   where table_schema = 'public' and grantee = 'authenticated'
     and privilege_type = 'SELECT'
     and table_name in ('teacher_exam_questions', 'teacher_exam_stimuli');
  if n <> 2 then
    raise exception 'I-2b rollback: % of the 2 grants came back (expected 2)', n; end if;
  select count(*) into n from information_schema.role_table_grants
   where table_schema = 'public' and grantee = 'anon'
     and table_name in ('teacher_exam_questions', 'teacher_exam_stimuli');
  if n <> 0 then
    raise exception 'I-2b rollback: anon was granted something (found %)', n; end if;

  -- 2.2 · and ONLY those two moved. The full set is back to the pre-I-2b
  -- string, so a rollback that over-restored dies here.
  select string_agg(table_name || ':' || privilege_type, ',' order by table_name, privilege_type)
    into v_txt
    from information_schema.role_table_grants
   where table_schema = 'public' and grantee = 'authenticated'
     and table_name like 'teacher\_exam%';
  if v_txt <> 'teacher_exam_access:SELECT,teacher_exam_attempts:SELECT,'
            || 'teacher_exam_questions:SELECT,teacher_exam_responses:SELECT,'
            || 'teacher_exam_stimuli:SELECT,teacher_exams:SELECT' then
    raise exception 'I-2b rollback: the grant set is not the pre-I-2b set: %', v_txt;
  end if;

  -- 2.3 · it changed nothing else.
  select count(*) into n from pg_policies where schemaname = 'public';
  if n <> 133 then raise exception 'I-2b rollback: policy count moved: %', n; end if;
  select md5(string_agg(p.proname || '|' || md5(p.prosrc), ',' order by p.proname)) into v_txt
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.proname like 'teacher_exam%';
  if v_txt <> '5cf7b7617f098fc200aac7cf6ecc23c0' then
    raise exception 'I-2b rollback: a teacher_exam* body changed (%)', v_txt; end if;

  -- 2.4 · THE ORDER GUARD. If the I-2a reads are already gone, 20260907z was
  -- run first and staff have been blind since. Restoring the grants now fixes
  -- that, so this does NOT refuse — it says so loudly, because a rollback that
  -- silently repaired a blind window would hide the fact that it happened.
  select count(*) into n
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.proname in ('teacher_exam_list', 'teacher_exam_paper');
  if n <> 2 then
    raise warning 'I-2b rollback: only % of the 2 I-2a reads exist — 20260907z was run '
                  'BEFORE this file, so staff had no read at all in between. The grants '
                  'are restored now, so the direct read works again; re-apply 20260907a '
                  'if the RPC surface is still wanted.', n;
  end if;

  raise notice 'I-2b rollback verified: both grants restored, nothing else moved.';
end;
$v$;

commit;
