-- ===========================================================================
-- Phase 6 M4.1 — publish lesson economics for Section 7
-- ===========================================================================
-- STATUS: ⛔ PREPARED, NOT APPLIED. Requires individual owner approval before
--         apply_migration (CLAUDE.md §3). Owner instruction for M4: each
--         milestone ends at implementation + engineering review; no apply and
--         no Release Gate until that milestone is individually approved.
--
-- WHY THIS EXISTS
--   Section 7 (Lesson Economics) needs cost per canonical lesson.
--   econ.v_lesson_economics has computed exactly that since Phase 5, but NO RPC
--   exposes it: the econ schema is deliberately unreachable from PostgREST
--   (INV-05, P5-03), so a view without an owner wrapper is invisible to the
--   dashboard. Same gap M3 closed for v_operation_service_mix.
--
--   This is the last econ view without an RPC other than v_breakeven_inputs,
--   which stays unpublished until Phase 7 (break-even).
--
-- OWNER DECISION 2026-08-01 — display names live in the RPC, not the view
--   econ.v_lesson_economics exposes only subtopic_id. Rendering "Functions"
--   rather than a raw key needs taxonomy.
--
--   The owner ruled: DO NOT modify econ.v_lesson_economics. Join
--   public.taxonomy_subtopics here and expose the display name from the RPC
--   only. That keeps the economics view stable and confines a presentation
--   concern to the presentation boundary — the view keeps reporting money, the
--   RPC decorates it for display.
--
--   Note on CLAUDE.md §2: the frozen artifact is taxonomy.js, the application's
--   taxonomy authority. public.taxonomy_subtopics / taxonomy_topics are
--   database tables, read here and never written. Nothing frozen is touched.
--
-- ON THE JOIN — LEFT, and why that matters
--   LEFT JOIN, never INNER. A lesson key with no taxonomy row must still appear
--   with its cost; dropping it would silently lose money from the panel, which
--   INV-26 forbids. subtopic_name is NULL for an unmapped key, so the gap is
--   visible rather than hidden behind a fallback label.
--
--   Verified safe against fan-out 2026-08-01: taxonomy_subtopics.id and
--   taxonomy_topics.id are both PRIMARY KEYs, so neither join can duplicate a
--   row and inflate cost. Measured: 4 engine lesson keys, 0 unmapped.
--
-- ON COLUMN TYPES — the M2 lesson, and it applies here
--   econ.v_lesson_economics.questions is sum(work_items) where work_items is
--   bigint, so it yields NUMERIC — the exact defect class that made three RPCs
--   un-callable in M2.
--
--   A question count is integral, and the source type genuinely differs from
--   the honest published type, so ::bigint is correct here and provably exact.
--   That is the same rule that made a cast WRONG in owner_econ_operation_mix()
--   (whose source was already count(*) -> bigint) and RIGHT in
--   owner_econ_credit_summary(). Cast only when the source type differs and the
--   cast cannot lose information.
--
--   cost_usd, cost_egp, cost_per_question_usd are numeric in the view and
--   numeric here. No cast.
--
-- VERIFICATION
--   Pre-apply type probe is mandatory (owner instruction, 2026-08-01) and was
--   run before this file was committed — see the M4.1 engineering review.
--   P5-17 discovers owner_econ_* from the catalog, so this RPC is covered by
--   the existing suite the moment it exists.
--
-- ROLLBACK
--   DROP FUNCTION IF EXISTS public.owner_econ_lesson_economics();
--   Nothing depends on it; the Section 7 panel is its only consumer and
--   admin.html is not deployed.
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.owner_econ_lesson_economics()
RETURNS TABLE (
  subtopic_id           text,
  subtopic_name         text,
  topic_id              text,
  topic_name            text,
  cost_usd              numeric,
  cost_egp              numeric,
  questions             bigint,
  cost_per_question_usd numeric,
  cost_completeness     text,
  confidence            text
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, econ, cost_engine, ai_catalog
AS $$
BEGIN
  IF NOT COALESCE(public.has_role_at_least('owner'::public.user_role), false) THEN
    RAISE EXCEPTION 'forbidden: owner_econ_lesson_economics requires role owner'
      USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT v.subtopic_id,
         st.display_name,          -- NULL when the key has no taxonomy row
         st.topic_id,
         t.display_name,
         v.cost_usd,
         v.cost_egp,
         v.questions::bigint,      -- sum(bigint) yields numeric; a count is integral
         v.cost_per_question_usd,
         v.cost_completeness,
         v.confidence
    FROM econ.v_lesson_economics v
    LEFT JOIN public.taxonomy_subtopics st ON st.id = v.subtopic_id
    LEFT JOIN public.taxonomy_topics    t  ON t.id  = st.topic_id
   ORDER BY v.cost_usd DESC NULLS LAST, v.subtopic_id;
END;
$$;

REVOKE ALL ON FUNCTION public.owner_econ_lesson_economics() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.owner_econ_lesson_economics() FROM anon;
GRANT EXECUTE ON FUNCTION public.owner_econ_lesson_economics() TO authenticated;

COMMENT ON FUNCTION public.owner_econ_lesson_economics() IS
  'Cost per canonical lesson for Lesson Economics (Phase 6 M4.1, Section 7). '
  'Requires role owner. Read-only passthrough of econ.v_lesson_economics — '
  'which excludes internal traffic (INV-25) and derives confidence from the '
  'contributing price cards (INV-27) — decorated with taxonomy display names. '
  'The display-name join lives here rather than in the view by owner decision '
  '(2026-08-01): the economics view stays stable and presentation stays at the '
  'presentation boundary. LEFT JOIN, so an unmapped lesson keeps its cost and '
  'reports a NULL name rather than disappearing. Returns zero rows when no '
  'external traffic exists — an empty period, not an error.';
