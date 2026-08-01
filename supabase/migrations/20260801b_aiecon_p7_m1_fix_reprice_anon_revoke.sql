-- =====================================================================
-- Phase 7 · M1 — corrective: revoke owner_cost_reprice from anon
-- =====================================================================
-- STATUS: ✅ APPLIED 2026-08-01 (version 20260801205515 + this).
--
-- WHY
-- ---
-- The M1 migration did DROP FUNCTION + CREATE FUNCTION on
-- public.owner_cost_reprice. That re-applies Supabase's DEFAULT PRIVILEGES,
-- which grant EXECUTE to `anon` DIRECTLY. The M1 migration revoked only
-- FROM PUBLIC, and REVOKE ... FROM PUBLIC does not remove a direct role
-- grant — so anon retained EXECUTE.
--
-- Caught by P4-06 on the first Release Gate run after apply:
--   P4-06 | FAIL | 1 owner_cost_* function(s) executable by anon — must be 0
--
-- Not exploitable for data: the function's first statement is the owner gate,
-- so an anon caller still gets 42501. But it breaks the Phase 4
-- defense-in-depth invariant, and the gate is right to fail it.
--
-- The Phase 4 migration revokes from PUBLIC *and* anon for every other
-- owner_cost_* function. This restores that pattern. Folded into the M1
-- migration file so a replay from scratch is correct in one pass.
-- =====================================================================
REVOKE ALL ON FUNCTION public.owner_cost_reprice(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.owner_cost_reprice(jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.owner_cost_reprice(jsonb) TO authenticated;
