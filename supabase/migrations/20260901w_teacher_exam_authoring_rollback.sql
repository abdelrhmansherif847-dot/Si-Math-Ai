-- =====================================================================
-- Rollback for 20260901e — a clean undo, because 3c owns no data
-- =====================================================================
-- STATUS: 🟡 PREPARED, deliberately unapplied.
--
-- 3c added twelve functions and not one table, column, policy, grant or row,
-- so dropping the functions restores the prior state exactly. Nothing a
-- teacher authored is touched by running this: the exams stay, and become
-- unreachable-for-writing again, which is precisely the 3b state.
--
-- ⚠️ It does NOT unpublish anything. An exam published through 3c stays
-- published, because publishing is a fact about a paper and not a feature of
-- the RPC that recorded it. Its audit rows stay too — workspace_audit_log is
-- append-only by design and no rollback in this project deletes history.
-- =====================================================================

begin;

drop function if exists teacher_exam_create(uuid, text, integer, boolean);
drop function if exists teacher_exam_update(uuid, text, text, integer, boolean, timestamptz, timestamptz);
drop function if exists teacher_exam_delete(uuid);
drop function if exists teacher_exam_save_stimulus(uuid, uuid, text, text, text, jsonb, text);
drop function if exists teacher_exam_delete_stimulus(uuid);
drop function if exists teacher_exam_save_question(uuid, uuid, integer, text, text, text, jsonb, text, uuid);
drop function if exists teacher_exam_delete_question(uuid);
drop function if exists teacher_exam_reorder_questions(uuid, uuid[]);
drop function if exists teacher_exam_publish(uuid);
drop function if exists teacher_exam_close(uuid);
drop function if exists teacher_exam_shift_ordinals(uuid, integer);
drop function if exists teacher_exam_new_code();

do $$
declare v_left text;
begin
  select string_agg(p.proname, ', ') into v_left
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname like 'teacher\_exam%'
     and p.proname not in ('teacher_exam_is_staff', 'teacher_exams_guard',
       'teacher_exam_content_guard', 'teacher_exam_stimulus_same_exam',
       'teacher_exam_access_guard', 'teacher_exam_attempts_guard',
       'teacher_exam_responses_guard');
  if v_left is not null then
    raise exception 'rollback 3c: authoring functions remain: %', v_left;
  end if;

  -- 3b must SURVIVE intact. Dropping its guards or its policy helper would
  -- leave six tables with their rules removed, which is far worse than an
  -- incomplete rollback of 3c.
  select string_agg(x.n, ', ') into v_left
    from unnest(array['teacher_exam_is_staff', 'teacher_exams_guard',
                      'teacher_exam_content_guard', 'teacher_exam_stimulus_same_exam',
                      'teacher_exam_access_guard', 'teacher_exam_attempts_guard',
                      'teacher_exam_responses_guard']) as x(n)
   where not exists (select 1 from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
                      where ns.nspname = 'public' and p.proname = x.n);
  if v_left is not null then
    raise exception 'rollback 3c: it destroyed 3b guards: %', v_left;
  end if;

  if (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relname like 'teacher\_exam%' and c.relkind = 'r') <> 6 then
    raise exception 'rollback 3c: it dropped a 3b table';
  end if;
end $$;

commit;
