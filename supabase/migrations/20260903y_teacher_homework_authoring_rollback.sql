-- =====================================================================
-- Rollback for 20260903b — the homework authoring RPCs
-- =====================================================================
-- STATUS: 🟡 PREPARED, deliberately unapplied. The file it undoes went LIVE on
--         2026-09-03 as version 20260903175957, so this is now a real undo of
--         live functions. Rehearsed before that apply, in one aborting
--         transaction: the homework functions went 7 -> 22 -> 7 and all nine
--         hashes — signatures, bodies, ACLs, constraints, policies, relations,
--         triggers, table grants, counts — returned to their exact pre-install
--         values, with 0 differing.
--
-- This is a CLEAN undo, and a cheap one: 20260903b creates no table, no policy,
-- no type, no column and no row, so removing it is removing fifteen functions.
-- Dropping them takes the write path away and leaves the H2 schema exactly as
-- 2026-09-03 left it — six governed tables that clients may read and nobody may
-- write.
--
-- WHAT THIS MUST NOT TOUCH, and asserts it did not:
--   teacher_homework_is_staff(uuid)   belongs to 20260902c, not to H3. It is
--                                     CALLED by these RPCs and outlives them.
--   the five H2 guards                belong to 20260902b/d.
--   the six tables, nine policies     belong to the H2 package.
--   the six audit labels              belong to 20260902a and 20260903a and
--                                     cannot be undone at all (no
--                                     ALTER TYPE ... DROP VALUE). Dropping
--                                     these RPCs leaves homework_answers_revealed
--                                     with no writer, which is the same state
--                                     the other five labels are in today.
--
-- ⚠️ Unlike the H2 rollback, this destroys NO student work — there is none to
-- destroy, because H3 never created a student write path. It does strand any
-- homework a teacher authored: the rows survive, and become uneditable and
-- unpublishable until the RPCs come back. The check below reports what would be
-- stranded rather than refusing, because leaving a draft in place is not the
-- same kind of loss as deleting a submitted answer.
-- =====================================================================

begin;

do $$
declare v_drafts integer := 0; v_published integer := 0;
begin
  if to_regclass('public.teacher_homework') is not null then
    execute 'select count(*) from teacher_homework where status = ''draft''' into v_drafts;
    execute 'select count(*) from teacher_homework where status = ''published''' into v_published;
  end if;
  if v_drafts > 0 or v_published > 0 then
    raise notice 'rollback H3: % draft and % published homework will be left in place and become uneditable until the RPCs return',
      v_drafts, v_published;
  end if;
end $$;

drop function if exists teacher_homework_create(uuid, text);
drop function if exists teacher_homework_update(uuid, text, text);
drop function if exists teacher_homework_set_due_at(uuid, timestamptz);
drop function if exists teacher_homework_reveal_answers(uuid);
drop function if exists teacher_homework_delete(uuid);
drop function if exists teacher_homework_save_stimulus(uuid, uuid, text, text, text, jsonb, text);
drop function if exists teacher_homework_delete_stimulus(uuid);
drop function if exists teacher_homework_save_question(uuid, uuid, integer, text, text, text, jsonb, text, uuid);
drop function if exists teacher_homework_delete_question(uuid);
drop function if exists teacher_homework_reorder_questions(uuid, uuid[]);
drop function if exists teacher_homework_publish(uuid);
drop function if exists teacher_homework_close(uuid);
drop function if exists teacher_homework_rotate_code(uuid);
drop function if exists teacher_homework_shift_ordinals(uuid, integer);
drop function if exists teacher_homework_new_code();

-- ── verification ──────────────────────────────────────────────────────
do $$
declare v_left text; v_n integer;
begin
  -- 1 · every H3 function is gone
  select string_agg(p.proname, ', ') into v_left
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in ('teacher_homework_create','teacher_homework_update','teacher_homework_set_due_at',
                       'teacher_homework_reveal_answers','teacher_homework_delete','teacher_homework_save_stimulus',
                       'teacher_homework_delete_stimulus','teacher_homework_save_question',
                       'teacher_homework_delete_question','teacher_homework_reorder_questions',
                       'teacher_homework_publish','teacher_homework_close','teacher_homework_rotate_code',
                       'teacher_homework_shift_ordinals','teacher_homework_new_code');
  if v_left is not null then
    raise exception 'rollback H3: functions remain: %', v_left;
  end if;

  -- 2 · H2 survives INTACT: its helper, its five guards, its six tables, its
  --     nine policies. This is the assertion that makes the undo surgical.
  select string_agg(x.n, ', ') into v_left
    from unnest(array['teacher_homework_is_staff','teacher_homework_guard','teacher_homework_content_guard',
                      'teacher_homework_stimulus_same_homework','teacher_homework_access_guard',
                      'teacher_homework_attempts_guard','teacher_homework_responses_guard']) as x(n)
   where not exists (select 1 from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
                      where ns.nspname = 'public' and p.proname = x.n);
  if v_left is not null then
    raise exception 'rollback H3: it destroyed H2 functions: %', v_left;
  end if;

  select count(*) into v_n from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname like 'teacher\_homework%' and c.relkind = 'r';
  if v_n <> 6 then
    raise exception 'rollback H3: the six H2 tables are not all present (%)', v_n;
  end if;

  select count(*) into v_n from pg_policy p join pg_class c on c.oid = p.polrelid
   where c.relname like 'teacher\_homework%';
  if v_n <> 9 then
    raise exception 'rollback H3: the nine H2 policies are not all present (%)', v_n;
  end if;

  -- 3 · the exam system is untouched, as it was before H3
  select count(*) into v_n from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname like 'teacher\_exam%' and c.relkind = 'r';
  if v_n <> 6 then
    raise exception 'rollback H3: the six teacher_exam tables are not all present (%)', v_n;
  end if;
end $$;

commit;
