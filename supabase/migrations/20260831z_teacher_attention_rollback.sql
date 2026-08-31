-- =====================================================================
-- ROLLBACK for 20260831a — remove teacher_attention()
-- =====================================================================
-- STATUS: 🟡 PREPARED, deliberately NOT APPLIED. 20260831a IS applied (live
--         2026-08-31); this is the way back if it ever needs to be withdrawn.
--
-- SAFE AT ANY TIME. teacher_attention() owns no data, is referenced by no
-- policy, trigger or foreign key, and writes nothing: it reads
-- workspace_students, profiles and weakness_reports and returns aggregates.
--
-- WHAT BREAKS: the attention section in teacher.html stops rendering. The page
-- treats a failed call as "not available" and hides the section, exactly as it
-- does before the forward migration is applied — which is what makes the deploy
-- order irrelevant in both directions.
-- =====================================================================

begin;

drop function if exists teacher_attention(uuid);

commit;
