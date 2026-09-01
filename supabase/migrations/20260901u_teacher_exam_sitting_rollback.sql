-- =====================================================================
-- Rollback for 20260901g — a clean undo; 3e owns no data
-- =====================================================================
-- STATUS: 🟡 PREPARED, deliberately unapplied.
--
-- Six functions and nothing else. Dropping them puts the door back: access can
-- still be requested and approved, and nobody can sit.
--
-- ⚠️ Sittings already taken are NOT deleted. They are a record of what a student
-- actually did, teacher_exam_attempts is append-only by its 3b guard, and no
-- rollback in this project deletes student work. With these functions gone
-- nothing can read or extend them, which is the 3d state.
-- =====================================================================

begin;

drop function if exists teacher_exam_result_detail(uuid, uuid);
drop function if exists teacher_exam_results(uuid);
drop function if exists student_my_teacher_exam_result(uuid);
drop function if exists teacher_exam_submit(uuid);
drop function if exists teacher_exam_save_response(uuid, uuid, text, integer, boolean);
drop function if exists teacher_exam_start(uuid, text);

do $$
declare v_left text;
begin
  select string_agg(x.n, ', ') into v_left
    from unnest(array['teacher_exam_result_detail', 'teacher_exam_results',
                      'student_my_teacher_exam_result', 'teacher_exam_submit',
                      'teacher_exam_save_response', 'teacher_exam_start']) as x(n)
   where exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                  where n.nspname = 'public' and p.proname = x.n);
  if v_left is not null then raise exception 'rollback 3e: functions remain: %', v_left; end if;

  -- 3b, 3c and 3d must SURVIVE, and so must the shared grading rule.
  select string_agg(x.n, ', ') into v_left
    from unnest(array['teacher_exam_is_staff', 'teacher_exam_can_start', 'teacher_exam_create',
                      'teacher_exam_publish', 'student_request_exam_access',
                      'teacher_exam_decide_access', 'exam_answer_matches']) as x(n)
   where not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
                      where n.nspname = 'public' and p.proname = x.n);
  if v_left is not null then raise exception 'rollback 3e: it destroyed 3b/3c/3d or the grader: %', v_left; end if;

  if (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relname like 'teacher\_exam%' and c.relkind = 'r') <> 6 then
    raise exception 'rollback 3e: it dropped a table';
  end if;
end $$;

commit;
