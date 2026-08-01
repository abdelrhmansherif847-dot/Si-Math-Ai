-- ===========================================================================
-- Phase 6 M3 — expose the operation → service mix to the dashboard
-- ===========================================================================
-- STATUS: ⛔ PREPARED, NOT APPLIED. Requires individual owner approval before
--         apply_migration (CLAUDE.md §3). Owner instruction for M3: stop after
--         the engineering review; do not apply and do not begin the Release
--         Gate until the implementation has been reviewed.
--
-- WHY THIS EXISTS
--   Section 6 (Question Cost Analytics) needs the "operation → service mix"
--   KPI: for each student-facing operation, which canonical services it
--   consumed and what each cost.
--
--   econ.v_operation_service_mix already computes exactly that — it has since
--   Phase 5 — but NO RPC exposes it. The econ schema is deliberately not
--   reachable from PostgREST (INV-05, P5-03), so a view with no owner RPC is
--   invisible to the dashboard. This is the only surface Section 6 needs that
--   is not already published.
--
--   Audited at M3 planning: three econ views have no RPC.
--     v_operation_service_mix -> published here (Section 6)
--     v_lesson_economics      -> Section 7, deferred to M4
--     v_breakeven_inputs      -> Phase 7 (break-even), deliberately unpublished
--
-- WHAT IT ADDS
--   One owner-gated read RPC. No new table, no new view, no change to any
--   existing object. Same shape as every other owner_econ_* wrapper:
--   STABLE + SECURITY DEFINER + owner gate + REVOKE FROM PUBLIC/anon.
--
-- ON COLUMN TYPES — the M2 lesson, applied deliberately
--   M2's release gate failed because three RPCs declared `bigint` for a column
--   their view produced as `numeric`: sum(bigint) widens to numeric, and a
--   count begins as count(*), which is bigint.
--
--   Here the view's work_items is count(*) — already bigint — so this RPC
--   declares bigint with NO cast, and that is intentional.
--
--   A defensive ::bigint would be actively harmful: if v_operation_service_mix
--   ever changed to sum(...) and started yielding numeric, the cast would
--   silently truncate instead of raising 42804, and P5-17 would no longer
--   catch it. Casting is correct only when the source type genuinely differs
--   and the cast is provably exact (M2's case). Declaring the honest type and
--   letting the descriptor check fail loudly is correct here.
--
--   cost_usd is sum(numeric) -> numeric, declared numeric. No cast.
--
-- VERIFICATION
--   P5-17 discovers owner_econ_* from the catalog rather than a hardcoded
--   list, so this RPC is covered by the existing suite the moment it exists —
--   no verification change is needed.
--
-- ROLLBACK
--   DROP FUNCTION IF EXISTS public.owner_econ_operation_mix();
--   Nothing depends on it; the M3 dashboard panel is its only consumer and is
--   not deployed.
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.owner_econ_operation_mix()
RETURNS TABLE (
  operation    text,
  service_code text,
  cost_usd     numeric,
  work_items   bigint,
  confidence   text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, econ, cost_engine, ai_catalog
AS $$
BEGIN
  IF NOT COALESCE(public.has_role_at_least('owner'::public.user_role), false) THEN
    RAISE EXCEPTION 'forbidden: owner_econ_operation_mix requires role owner'
      USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT v.operation, v.service_code, v.cost_usd, v.work_items, v.confidence
    FROM econ.v_operation_service_mix v
   ORDER BY v.cost_usd DESC NULLS LAST, v.operation, v.service_code;
END;
$$;

REVOKE ALL ON FUNCTION public.owner_econ_operation_mix() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.owner_econ_operation_mix() FROM anon;
GRANT EXECUTE ON FUNCTION public.owner_econ_operation_mix() TO authenticated;

COMMENT ON FUNCTION public.owner_econ_operation_mix() IS
  'Operation → canonical-service cost mix for Question Cost Analytics '
  '(Phase 6 M3, Section 6). Requires role owner. Read-only passthrough of '
  'econ.v_operation_service_mix, which excludes internal traffic (INV-25) and '
  'derives its confidence from the contributing price cards (INV-27). Returns '
  'zero rows when no external traffic exists — an empty period, not an error.';
