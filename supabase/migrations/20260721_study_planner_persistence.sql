-- ============================================================================
-- Zero Personalized Study Planner — persistence + credit cost.
-- Additive & non-destructive: no existing table or column is altered/dropped.
-- Applied to project igvkyxkmjnkzscqgommj on 2026-07-21 (approved individually
-- per CLAUDE.md §3, verified per DEPLOY.md §3).
-- ============================================================================

-- study_plans: latest generated plan per student. plan_json is the full
-- StudyPlan envelope from StudyPlanner.buildStudyPlan; plan_signature
-- (StudyPlanner.planSignature) powers cheap regeneration-trigger checks.
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

CREATE INDEX IF NOT EXISTS idx_study_plans_user_current
  ON public.study_plans (user_id, generated_at DESC)
  WHERE superseded_at IS NULL;

ALTER TABLE public.study_plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS study_plans_self ON public.study_plans;
CREATE POLICY study_plans_self ON public.study_plans
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 20-credit charge for generating/regenerating a plan (RFC "Credits").
-- consume_credits(p_feature=>'STUDY_PLAN') reads credit_cost from here.
INSERT INTO public.credit_costs (feature_name, display_name, credit_cost, active)
VALUES ('STUDY_PLAN', 'Study Plan', 20, true)
ON CONFLICT (feature_name) DO UPDATE
  SET credit_cost  = EXCLUDED.credit_cost,
      active       = EXCLUDED.active,
      display_name = EXCLUDED.display_name;

-- Optional availability storage ({ "hoursPerDay": 2, "studyDays": [0,1,2,3,4] }).
-- The chat currently supplies availability at generation time; this column lets
-- it be persisted later without another migration.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS study_availability jsonb;

-- ── Rollback (manual) ──────────────────────────────────────────────────────
-- ALTER TABLE public.profiles DROP COLUMN IF EXISTS study_availability;
-- DELETE FROM public.credit_costs WHERE feature_name = 'STUDY_PLAN';
-- DROP TABLE IF EXISTS public.study_plans;
