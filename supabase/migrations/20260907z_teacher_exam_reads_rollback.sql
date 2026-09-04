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

begin;

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

  raise notice 'I-2a rollback verified: both reads gone, 28 teacher_exam* functions remain.';
end;
$v$;

commit;
