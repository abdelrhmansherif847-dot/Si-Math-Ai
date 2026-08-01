-- ===========================================================================
-- Phase 7 M2c — fix 42702 in owner_econ_set_platform_cost
-- ===========================================================================
-- STATUS: ✅ APPLIED 2026-08-01 as aiecon_p7_m2c_fix_set_platform_cost_ambiguity,
--         on owner approval after the M2 Release Gate failed at V4.
--         Pre-apply probe on the RPC itself: 6/6 scenarios PASS.
--         Post-apply: V4 re-run 9/9 PASS.
--
-- THE DEFECT
--   owner_econ_set_platform_cost raised 42702 "column reference period_month is
--   ambiguous" on EVERY call, so it could not be used at all.
--
--   In PL/pgSQL the RETURNS TABLE output names (id, period_month, category,
--   amount, currency, revision_number, superseded_id) are VARIABLES in scope.
--   The original body used unqualified column references:
--
--     SELECT * INTO v_old FROM public.platform_cost_entries
--      WHERE period_month = p_period_month AND category = v_cat AND is_current;
--
--   PostgreSQL cannot tell the OUT variable from the table column.
--
-- WHY THE PRE-APPLY PROBE MISSED IT
--   The M2 probe exercised the table, the freeze trigger, all eight
--   constraints, the sanctioned view, the resolver and BOTH net-profit RPCs —
--   but never called THIS function. The probe inserted into the table directly
--   and performed the supersede by hand, so this body never executed. 42702,
--   exactly like 42804, is raised only at execution.
--
--   PERMANENT LESSON (owner-recorded 2026-08-01): every new RPC requires a
--   DIRECT execution probe. Testing the tables, triggers and views around a
--   function proves nothing about the function. This now stands alongside the
--   type probe as a standing requirement.
--
-- SCOPE — QUALIFICATION ONLY
--   No logic, schema, signature or behaviour change. No other object touched.
--   Every column reference is prefixed with the table alias `e`.
--
-- ROLLBACK
--   Re-apply the prior (unqualified) body from
--   20260801_aiecon_p7_m2a_platform_cost_entries.sql — note that doing so
--   restores the 42702 defect and makes the function unusable again.
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.owner_econ_set_platform_cost(
  p_period_month  date,
  p_category      text,
  p_amount        numeric,
  p_currency      text DEFAULT 'USD',
  p_note          text DEFAULT NULL,
  p_change_reason text DEFAULT NULL
)
RETURNS TABLE (
  id              uuid,
  period_month    date,
  category        text,
  amount          numeric,
  currency        text,
  revision_number integer,
  superseded_id   uuid
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public, econ
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_old   public.platform_cost_entries%rowtype;
  v_new   public.platform_cost_entries%rowtype;
  v_cat   text := lower(btrim(p_category));
BEGIN
  IF NOT COALESCE(public.has_role_at_least('owner'::public.user_role), false) THEN
    RAISE EXCEPTION 'forbidden: owner_econ_set_platform_cost requires role owner'
      USING ERRCODE = '42501';
  END IF;

  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'owner_econ_set_platform_cost requires an authenticated actor'
      USING ERRCODE = '42501';
  END IF;

  -- QUALIFIED: e.period_month / e.category / e.is_current. The RETURNS TABLE
  -- output names shadow the columns otherwise — this is the 42702 fix.
  SELECT e.* INTO v_old
    FROM public.platform_cost_entries e
   WHERE e.period_month = p_period_month AND e.category = v_cat AND e.is_current;

  IF v_old.id IS NOT NULL AND p_change_reason IS NULL THEN
    RAISE EXCEPTION
      'correcting an existing platform cost requires p_change_reason: financial figures are not changed without a recorded reason'
      USING ERRCODE = '23514';
  END IF;

  -- ORDER IS LOAD-BEARING: supersede BEFORE insert. pce_one_current is a
  -- PARTIAL unique index, enforced immediately and not deferrable, so inserting
  -- first would momentarily leave two current rows and raise 23505.
  IF v_old.id IS NOT NULL THEN
    UPDATE public.platform_cost_entries e
       SET is_current = false, superseded_at = now(), superseded_by = v_actor
     WHERE e.id = v_old.id;
  END IF;

  INSERT INTO public.platform_cost_entries
    (period_month, category, amount, currency, note,
     revision_number, supersedes_id, created_by, change_reason)
  VALUES
    (p_period_month, v_cat, p_amount, p_currency, p_note,
     COALESCE(v_old.revision_number, 0) + 1, v_old.id, v_actor, p_change_reason)
  RETURNING * INTO v_new;

  RETURN QUERY
  SELECT v_new.id, v_new.period_month, v_new.category, v_new.amount,
         v_new.currency, v_new.revision_number, v_old.id;
END;
$$;

REVOKE ALL ON FUNCTION public.owner_econ_set_platform_cost(date,text,numeric,text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.owner_econ_set_platform_cost(date,text,numeric,text,text,text) FROM anon;
GRANT EXECUTE ON FUNCTION public.owner_econ_set_platform_cost(date,text,numeric,text,text,text) TO authenticated;

COMMENT ON FUNCTION public.owner_econ_set_platform_cost(date,text,numeric,text,text,text) IS
  'Record or correct a platform cost for a month. Requires role owner. A '
  'correction never overwrites: it inserts a new revision and marks the previous '
  'row is_current=false, and must state p_change_reason. VOLATILE by necessity — '
  'the one deliberate writer in AI Economics, writing a cost INPUT and never '
  'product pricing (§9.4).';
