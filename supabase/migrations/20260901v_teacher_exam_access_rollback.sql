-- =====================================================================
-- Rollback for 20260901f — a clean undo; 3d owns no data
-- =====================================================================
-- STATUS: 🟡 PREPARED, deliberately unapplied.
--
-- Seven functions and nothing else. Dropping them restores the prior state
-- exactly: the exam code goes back to being a unique string nobody can use.
--
-- ⚠️ Access rows already granted are NOT deleted, and that is correct. They are
-- decisions a teacher made, teacher_exam_access is append-only by its 3b guard,
-- and no rollback in this project deletes history. With these functions gone
-- nothing can act on them, which is the 3c state.
-- =====================================================================

begin;

drop function if exists student_my_teacher_exams();
drop function if exists teacher_exam_approve_members(uuid, uuid[]);
drop function if exists teacher_exam_decide_access(uuid, uuid, text);
drop function if exists teacher_exam_requests(uuid);
drop function if exists student_request_exam_access(text);
drop function if exists teacher_exam_rotate_code(uuid);
drop function if exists teacher_exam_can_start(uuid);

do $$
declare v_left text;
begin
  select string_agg(x.n, ', ') into v_left
    from unnest(array['student_my_teacher_exams', 'teacher_exam_approve_members',
                      'teacher_exam_decide_access', 'teacher_exam_requests',
                      'student_request_exam_access', 'teacher_exam_rotate_code',
                      'teacher_exam_can_start']) as x(n)
   where exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = x.n);
  if v_left is not null then raise exception 'rollback 3d: functions remain: %', v_left; end if;

  -- 3b's guards and 3c's authoring must SURVIVE.
  select string_agg(x.n, ', ') into v_left
    from unnest(array['teacher_exam_is_staff', 'teacher_exams_guard', 'teacher_exam_access_guard',
                      'teacher_exam_create', 'teacher_exam_publish', 'teacher_exam_close',
                      'teacher_exam_new_code']) as x(n)
   where not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                      where n.nspname = 'public' and p.proname = x.n);
  if v_left is not null then raise exception 'rollback 3d: it destroyed 3b/3c: %', v_left; end if;

  if (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relname like 'teacher\_exam%' and c.relkind = 'r') <> 6 then
    raise exception 'rollback 3d: it dropped a table';
  end if;
end $$;

commit;
