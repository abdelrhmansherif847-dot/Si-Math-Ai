-- =====================================================================
-- Teacher & Assistant Foundation · 4 of 4 — rollback
-- =====================================================================
-- STATUS: ⛔ PREPARED — NOT YET APPLIED, and not to be run unless the three
--         forward migrations were applied and are being withdrawn.
--
-- Written at the same time as the forward migrations, on the principle the
-- support system used: a migration whose rollback is written later is a
-- migration whose rollback is written under pressure.
--
-- DESTRUCTIVE. Dropping the tables destroys every teacher-student link and the
-- audit trail of how they were made. There is nothing to preserve elsewhere —
-- these tables reference no academic data and no academic table references
-- them, which is the same property that makes the forward migration safe.
-- =====================================================================

begin;

drop function if exists teacher_student_card(uuid, uuid);
drop function if exists teacher_roster(uuid);
drop function if exists teacher_my_workspaces();
drop function if exists teacher_remove_student(uuid, uuid);
drop function if exists teacher_set_staff_status(uuid, workspace_staff_status);
drop function if exists staff_join_workspace(text);
drop function if exists student_my_teachers();
drop function if exists student_leave_workspace(uuid);
drop function if exists student_join_workspace(text);
drop function if exists teacher_rotate_join_code(uuid, text);
drop function if exists teacher_create_workspace(uuid, text);

drop function if exists teacher_can_see_student(uuid);
drop function if exists workspace_is_owner(uuid);
drop function if exists workspace_is_active_staff(uuid);

drop table if exists workspace_audit_log;
drop table if exists workspace_students;
drop table if exists workspace_staff;
drop table if exists teacher_workspaces;

drop function if exists workspace_students_guard();
drop function if exists workspace_staff_guard();
drop function if exists workspace_new_code();

drop type if exists workspace_audit_action;
drop type if exists workspace_link_status;
drop type if exists workspace_staff_status;
drop type if exists workspace_staff_role;

commit;
