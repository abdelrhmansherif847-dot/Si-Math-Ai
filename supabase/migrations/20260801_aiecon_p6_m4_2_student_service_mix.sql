-- ===========================================================================
-- Phase 6 M4.2 — per-student × service cost split for Section 8
-- ===========================================================================
-- STATUS: ⛔ PREPARED, NOT APPLIED. Requires individual owner approval before
--         apply_migration (CLAUDE.md §3). Applied together with
--         20260801_aiecon_p6_m4_2_student_consumption.sql; both land in the
--         same gate.
--
-- WHY A SEPARATE RPC RATHER THAN MORE COLUMNS
--   Section 8 asks for "student cost split by service". That is a different
--   GRAIN from the rest of Section 8: one row per (student, service) rather
--   than one row per student. It cannot be appended to
--   owner_econ_student_economics() without either repeating every per-student
--   figure on each service row or nesting a structure the dashboard would then
--   have to take apart — which is client-side derivation by another name.
--
--   So this is a second RPC by necessity of grain, NOT a second definition of
--   student economics. It reports no per-student total: every total still comes
--   from owner_econ_student_economics(), which remains the canonical surface
--   (owner Decision 3). The two cannot diverge because they do not overlap.
--
-- WHY NO NEW VIEW
--   The owner's standing constraint is no new views unless required. It is not
--   required here: the computation is a straightforward expansion of
--   question_cost_facts.service_mix, and owner_econ_credit_summary() already
--   set the precedent of composing directly in the RPC. econ.v_question_cost_
--   current supplies the row set; jsonb_each expands the per-service split the
--   allocator already wrote.
--
-- INV-25 — business metric, so internal traffic is EXCLUDED
--   Section 8 is a business surface, not a diagnostic one, so this filters
--   NOT is_internal. Measured 2026-08-01: with all telemetry internal this
--   returns ZERO rows — an empty period, not an error. It unblocks with no code
--   change when external traffic is priced and allocated.
--
--   (Contrast Section 9, which the owner locked as a DIAGNOSTIC surface and
--   which will include internal traffic. That distinction is deliberate.)
--
-- OWNER DECISION 1 — no personally identifying field
--   user_id only. No full_name, no email. Same reasoning as the companion
--   migration: economics dashboard, not a CRM.
--
-- ON TYPES
--   sum((value)::numeric) -> numeric, declared numeric, no cast.
--   count(*)              -> bigint,  declared bigint,  no cast — and no
--   defensive cast either: if this ever became a sum() and started yielding
--   numeric, the silent truncation would hide the 42804 that P5-17 relies on.
--   Same rule as owner_econ_operation_mix(). Verified by the mandatory
--   pre-apply type probe.
--
-- ROLLBACK
--   DROP FUNCTION IF EXISTS public.owner_econ_student_service_mix(integer);
--   Nothing depends on it; the Section 8 panel is its only consumer and
--   admin.html is not deployed.
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.owner_econ_student_service_mix(
  p_limit integer DEFAULT 200
)
RETURNS TABLE (
  user_id      uuid,
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
    RAISE EXCEPTION 'forbidden: owner_econ_student_service_mix requires role owner'
      USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT q.user_id,
         s.key                                              AS service_code,
         sum((s.value)::numeric)                            AS cost_usd,
         count(*)                                           AS work_items,
         econ.cost_confidence(max(q.price_confidence))      AS confidence
    FROM cost_engine.v_question_cost_current q
    CROSS JOIN LATERAL jsonb_each(q.service_mix) s(key, value)
   WHERE q.is_current
     AND NOT q.is_internal          -- INV-25: business metric
     AND q.user_id IS NOT NULL
   GROUP BY q.user_id, s.key
   ORDER BY sum((s.value)::numeric) DESC NULLS LAST, q.user_id, s.key
   LIMIT COALESCE(p_limit, 200);
END;
$$;

REVOKE ALL ON FUNCTION public.owner_econ_student_service_mix(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.owner_econ_student_service_mix(integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.owner_econ_student_service_mix(integer) TO authenticated;

COMMENT ON FUNCTION public.owner_econ_student_service_mix(integer) IS
  'Per-student x canonical-service cost split for Section 8 (Phase 6 M4.2). '
  'Requires role owner. A second RPC by necessity of GRAIN — one row per '
  '(student, service) — not a second definition of student economics: it '
  'reports no per-student total, so it cannot diverge from '
  'owner_econ_student_economics(), which stays canonical. Excludes internal '
  'traffic (INV-25) because Section 8 is a business surface, so it returns zero '
  'rows until external traffic exists. Exposes user_id and no identifying '
  'field (owner Decision 1). Confidence derives from the contributing price '
  'cards (INV-27).';
