-- ============================================================================
-- PROPOSED SCHEMA — Zero Personalized Study Planner  (Phase 2)
-- ============================================================================
-- ⛔ STATUS: PROPOSED — NOT A MIGRATION, NOT APPLIED.
--
-- Per CLAUDE.md §3, every migration must be individually approved before
-- `apply_migration` is called. This file lives under docs/ (NOT under
-- supabase/migrations/) precisely so it does NOT enter the parity-checked
-- migration set or imply it is live. On approval:
--   1. Move to supabase/migrations/<date>_study_plans.sql (verbatim).
--   2. Apply it BEFORE any code that reads these objects ships (DEPLOY.md §2).
--   3. Verify the objects exist in prod, then re-run check-migration-parity.sh.
--
-- Everything here is ADDITIVE and non-destructive: no existing table or column
-- is altered or dropped. Rollback drops only the new objects.
-- Target project: igvkyxkmjnkzscqgommj
-- ============================================================================

-- 1. study_plans — the latest generated plan per student. -------------------
--    plan_json is the full StudyPlan envelope from StudyPlanner.buildStudyPlan.
--    plan_signature is StudyPlanner.planSignature(state), stored so the next
--    learning event can call detectRegenerationTriggers() cheaply.
CREATE TABLE IF NOT EXISTS public.study_plans (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  planner_version text        NOT NULL,
  plan_json       jsonb       NOT NULL,
  plan_signature  jsonb       NOT NULL,
  credits_charged integer     NOT NULL DEFAULT 20,
  generated_at    timestamptz NOT NULL DEFAULT now(),
  superseded_at   timestamptz            -- NULL = current plan; set when replaced
);

-- One live plan per student is the common read; keep older ones for history.
CREATE INDEX IF NOT EXISTS idx_study_plans_user_current
  ON public.study_plans (user_id, generated_at DESC)
  WHERE superseded_at IS NULL;

ALTER TABLE public.study_plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS study_plans_self ON public.study_plans;
CREATE POLICY study_plans_self ON public.study_plans
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 2. Credit cost seed — the 20-credit charge (RFC "Credits"). ----------------
--    Mirrors existing credit_costs rows; consume_credits(p_feature=>'STUDY_PLAN')
--    reads credit_cost from here. Constraint-agnostic upsert (does NOT assume a
--    unique index on feature_name — reviewer should confirm the real constraint
--    and may switch to ON CONFLICT if one exists).
INSERT INTO public.credit_costs (feature_name, credit_cost, active)
SELECT 'STUDY_PLAN', 20, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.credit_costs WHERE feature_name = 'STUDY_PLAN'
);
UPDATE public.credit_costs
   SET credit_cost = 20, active = true
 WHERE feature_name = 'STUDY_PLAN';

-- 3. (OPTIONAL) Availability storage. ---------------------------------------
--    Only needed if availability is persisted rather than asked in chat each
--    time. Shape: { "hoursPerDay": 2, "studyDays": [0,1,2,3,4] }.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS study_availability jsonb;

-- ── Rollback (manual) ──────────────────────────────────────────────────────
-- ALTER TABLE public.profiles DROP COLUMN IF EXISTS study_availability;
-- DELETE FROM public.credit_costs WHERE feature_name = 'STUDY_PLAN';
-- DROP TABLE IF EXISTS public.study_plans;
