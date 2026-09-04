-- =====================================================================
-- Rollback for 20260906a — Teacher Homework H6
-- =====================================================================
-- STATUS: 🟡 PREPARED, deliberately unapplied.
--
-- ✅ THIS ROLLBACK HAS NO WINDOW, AND THAT IS WORTH SAYING OUT LOUD.
-- ---------------------------------------------------------------------
-- Every previous homework rollback closed:
--   20260902y  closes at the first student attachment
--   20260903z  stops being meaningful once any exam RPC ships (enum labels
--              cannot be dropped)
--   20260904z  closes at the first code rotation OR the first draft deletion
--   20260905z  closes at the FIRST SITTING
--
-- This one never closes. 20260906a adds two READ functions and nothing else:
-- no table, no policy, no grant on any table, no trigger, no enum label, no
-- audit label, and it redefines NO existing function. There is therefore no
-- data to strand, no body to restore byte-for-byte, and no state that makes the
-- undo unsafe later than it was earlier. It is two DROP FUNCTION statements.
--
-- Because nothing is restored, this file needs NO refusal condition.
-- A refusal would be theatre here: there is no condition under which dropping
-- two staff read functions loses information. Compare 20260905z, which refuses while any
-- attempt exists precisely because removing the RPCs there WOULD strand a
-- student mid-paper.
--
-- WHAT RUNNING IT COSTS. Staff authoring goes blind again — no list, no paper
-- read, and (since F-5) still no direct SELECT on teacher_homework_questions or
-- teacher_homework_stimuli. That is the pre-H6 state exactly, not a degraded
-- one. Any client built on these two functions stops working; at the time this
-- file was written the repository contained NO homework client code at all.
--
-- WHAT IT MUST NOT DO. It must not "helpfully" restore the direct SELECT grants
-- that F-5 revoked. Rolling H6 back does not roll F-5 back — that is 20260905z's
-- job and its own decision. §2 asserts the grants are still absent afterwards,
-- so a future edit cannot quietly widen this file into an F-5 reversal.
-- =====================================================================

begin;

-- ── 1 · drop what H6 added ────────────────────────────────────────────
-- No trigger depends on either, no function calls either, and neither is
-- referenced by a policy or a view, so there is no ordering to respect.
drop function if exists teacher_homework_list(uuid);
drop function if exists teacher_homework_paper(uuid);

-- ── 2 · verification ──────────────────────────────────────────────────
do $$
declare v_left text; v_n integer;
begin
  -- 2.1 nothing H6 added survives
  select string_agg(x.n, ', ') into v_left
    from unnest(array['teacher_homework_list','teacher_homework_paper']) as x(n)
   where exists (select 1 from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
                  where ns.nspname = 'public' and p.proname = x.n);
  if v_left is not null then
    raise exception 'rollback H6: functions remain: %', v_left;
  end if;

  -- 2.2 F-5 IS NOT REVERTED BY THIS FILE. Rolling back the read surface must
  --     not hand the direct SELECT back; that decision belongs to 20260905z.
  select string_agg(c.relname, ', ') into v_left
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relname in ('teacher_homework_questions','teacher_homework_stimuli')
     and has_table_privilege('authenticated', c.oid, 'select');
  if v_left is not null then
    raise exception 'rollback H6: it restored a grant F-5 revoked — that is 20260905z''s decision, not this file''s: %', v_left;
  end if;

  -- 2.3 H2 … H5 are untouched: the same shape H6 found when it arrived
  select count(*) into v_n from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname like 'teacher\_homework%' and c.relkind = 'r';
  if v_n <> 8 then
    raise exception 'rollback H6: expected the eight homework tables, found %', v_n;
  end if;
  select count(*) into v_n from pg_policy p join pg_class c on c.oid = p.polrelid
   where c.relname like 'teacher\_homework%';
  if v_n <> 9 then
    raise exception 'rollback H6: expected 9 homework policies, found %', v_n;
  end if;
  select count(*) into v_n from pg_trigger tg join pg_class c on c.oid = tg.tgrelid
   where c.relname like 'teacher\_homework%' and not tg.tgisinternal;
  if v_n <> 12 then
    raise exception 'rollback H6: expected 12 homework triggers, found %', v_n;
  end if;
  select count(*) into v_n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and (p.proname like 'teacher\_homework%' or p.proname like 'student\_homework%'
          or p.proname in ('student_attach_homework','student_my_homework'));
  if v_n <> 38 then
    raise exception 'rollback H6: expected the 38 H5 homework functions, found %', v_n;
  end if;

  -- 2.4 and it disturbed nothing it does not own
  select string_agg(x.n, ', ') into v_left from (values
      ('teacher_homework_is_staff','63ef7fa28bf3a0c48bd6658abd11009a'),
      ('workspace_is_active_staff','b40ec96a8eb64a7d3a22f80f66f26ec0'),
      ('student_homework_paper','ff8ba52d7221103dde07bcb2345d1d7a'),
      ('student_homework_submit','2fa7f9637d23dc2c8c090abdf917d814'),
      ('teacher_homework_students','7e64a3340f639aa54289b52559e4b471'),
      ('teacher_homework_review','f572a0ee1344460ab4a779343ef76348'),
      ('teacher_homework_content_guard','e9e80a7ac07b362919c3d363b9016844'),
      ('teacher_homework_code_guard','f54ea68a1b3ef3de5475e92c601a51dc')
    ) as x(n, md5_expected)
   where (select md5(p.prosrc) from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
           where ns.nspname = 'public' and p.proname = x.n) is distinct from x.md5_expected;
  if v_left is not null then
    raise exception 'rollback H6: it disturbed a function it does not own: %', v_left;
  end if;
end $$;

commit;
