-- =====================================================================
-- ROLLBACK for 20260830i — remove my_experience()
-- =====================================================================
-- STATUS: 🟡 PREPARED, deliberately NOT APPLIED. 20260830i went live on
--         2026-08-30 (schema_migrations 20260830222037), so this file is now a
--         live way back rather than a hypothetical one; running it is its own
--         approval, exactly like running the forward one.
--
-- SAFE TO RUN AT ANY TIME. my_experience() owns no data, is referenced by no
-- policy, no trigger, no other function and no foreign key: it reads
-- workspace_staff and teacher_workspaces and returns jsonb. Dropping it removes
-- a routing hint and nothing else.
--
-- WHAT BREAKS IF YOU RUN IT
-- -------------------------
-- Nothing server-side. In the browser, login.html and nav.js both treat a
-- failed my_experience() call as "not applied yet" and fall back to the
-- behaviour they shipped with — the profiles read plus teacher_my_workspaces().
-- That fallback is what makes the forward migration safe to apply in either
-- order relative to a site deploy, and it is what makes this rollback safe too.
-- =====================================================================

begin;

drop function if exists my_experience();

commit;
