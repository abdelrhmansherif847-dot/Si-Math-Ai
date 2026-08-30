-- =====================================================================
-- ROLLBACK for 20260830g — the intervention record
-- =====================================================================
-- STATUS: ⏳ PREPARED, and not applied — and 20260830g IS applied, so from here
--         on this file is a live undo button rather than a thought experiment.
--         Like 20260830z, it exists so the forward migration could be approved
--         knowing exactly what undoing it costs. Applying it is its own
--         separate approval.
--
-- ⚠ THIS DESTROYS THE RECORD. class_interventions is append-only precisely
--   because its value is that nothing rewrites it, and dropping the table is
--   the one operation that defeats that. Rows here are things a teacher said
--   they did — they cannot be recomputed from anything, unlike a weakness
--   report, which the analyzer will rebuild. Read the count first:
--
--     select count(*) filter (where withdrawn_at is null) as live,
--            count(*)                                     as total
--       from class_interventions;
--
--   If that is not zero, take the table out to a file before running this and
--   say so in the migration record. A rollback that silently deleted a
--   teacher's record of their own work would be the worst possible failure of
--   a table whose entire purpose is to be trustworthy later.
--
-- ORDER: x runs before z. That is deliberate — this drops the dependent
--   objects, and 20260830z then drops the foundation they hang from. It is
--   independent of 20260830y (the Mock delivery rollback): neither table
--   references the other, so the two can run in either order relative to each
--   other, and both must precede z.
-- =====================================================================

begin;

drop function if exists student_my_interventions();
drop function if exists teacher_student_interventions(uuid, uuid);
drop function if exists teacher_withdraw_intervention(uuid);
drop function if exists teacher_record_intervention(uuid, uuid, intervention_kind, text, text, text, text, date);

drop trigger if exists class_interventions_append_only_trg on class_interventions;
drop function if exists class_interventions_append_only();

-- Policies go with the table; naming them keeps the file readable as an
-- inventory of what 20260830e created.
drop policy if exists class_interventions_subject_read on class_interventions;
drop policy if exists class_interventions_staff_read   on class_interventions;

drop table if exists class_interventions;
drop type  if exists intervention_kind;

commit;
