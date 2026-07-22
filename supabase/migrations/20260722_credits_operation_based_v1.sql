-- ===========================================================================
-- Operation-based Zero AI credits — cost catalogue + pack repricing (RFC)
-- ===========================================================================
-- STATUS: PENDING OWNER APPROVAL. Do NOT apply until reviewed (CLAUDE.md §3).
-- Target project: igvkyxkmjnkzscqgommj
--
-- Idempotent & convergent: safe to run more than once. No destructive DROPs;
-- existing rows are updated in place, missing rows inserted. Credits granted by
-- each pack are UNCHANGED (500 / 1000 / 2000) — only the EGP price moves.
--
-- Design notes
--   • This is the single source of truth for per-operation credit costs. Pages
--     read costs from public.credit_costs via credit-config.js — never hardcode.
--   • always_charge = true  → the operation ALWAYS deducts its cost, even for a
--     FREE user who still has daily-free-allowance slots left. This mirrors the
--     STUDY_PLAN precedent (20260721_study_plan_always_charge.sql): heavy
--     "generate/create" operations must cost the same for every tier.
--   • always_charge = false → the operation is covered by the FREE plan's daily
--     free allowance (freemium funnel) before it starts spending credits. The
--     chat family stays freemium so current free users are not cut off.
--
-- Operation catalogue (RFC → feature_name):
--   chat_text          → CHAT_TEXT           5   (freemium)
--   chat_image         → CHAT_IMAGE          8   (freemium)
--   chat_followup      → CHAT_FOLLOWUP       2   (freemium)
--   chat_deep_explain  → CHAT_DEEP_EXPLAIN  10   (freemium; trigger TBD)
--   study_plan         → STUDY_PLAN         20   (always_charge — already live)
--   mock_exam          → MOCK_EXAM          40   (always_charge)
--   mock_timer         → MOCK_TIMER         10   (always_charge)
--   mock_practice      → MOCK_PRACTICE      10   (always_charge)
--   focus_session      → FOCUS_SESSION      15   (always_charge)
--   weakness_analysis  → WEAKNESS_ANALYSIS  20   (always_charge)
--
-- Schema assumption (live schema was not introspected — DB access withheld):
--   public.credit_costs exposes (feature_name, credit_cost, active,
--   always_charge) plus a defaulted PK / created_at. If your credit_costs has
--   additional NOT NULL columns without defaults, add them to the INSERT below
--   before applying. AI_CHAT_MESSAGE (5) is intentionally left active as the
--   back-compat fallback the client uses until this migration is live.
-- ===========================================================================

-- 1. CREDIT COSTS -----------------------------------------------------------

-- 1a. Converge every catalogued operation to its target cost/flags. Rows that
--     already exist (MOCK_EXAM, WEAKNESS_ANALYSIS, …) are updated in place.
UPDATE public.credit_costs c
SET credit_cost   = v.credit_cost,
    active        = v.active,
    always_charge = v.always_charge
FROM (VALUES
  ('CHAT_TEXT',          5,  true, false),
  ('CHAT_IMAGE',         8,  true, false),
  ('CHAT_FOLLOWUP',      2,  true, false),
  ('CHAT_DEEP_EXPLAIN',  10, true, false),
  ('STUDY_PLAN',         20, true, true),
  ('MOCK_EXAM',          40, true, true),
  ('MOCK_TIMER',         10, true, true),
  ('MOCK_PRACTICE',      10, true, true),
  ('FOCUS_SESSION',      15, true, true),
  ('WEAKNESS_ANALYSIS',  20, true, true)
) AS v(feature_name, credit_cost, active, always_charge)
WHERE c.feature_name = v.feature_name;

-- 1b. Insert any catalogued operation that does not exist yet.
INSERT INTO public.credit_costs (feature_name, credit_cost, active, always_charge)
SELECT v.feature_name, v.credit_cost, v.active, v.always_charge
FROM (VALUES
  ('CHAT_TEXT',          5,  true, false),
  ('CHAT_IMAGE',         8,  true, false),
  ('CHAT_FOLLOWUP',      2,  true, false),
  ('CHAT_DEEP_EXPLAIN',  10, true, false),
  ('STUDY_PLAN',         20, true, true),
  ('MOCK_EXAM',          40, true, true),
  ('MOCK_TIMER',         10, true, true),
  ('MOCK_PRACTICE',      10, true, true),
  ('FOCUS_SESSION',      15, true, true),
  ('WEAKNESS_ANALYSIS',  20, true, true)
) AS v(feature_name, credit_cost, active, always_charge)
WHERE NOT EXISTS (
  SELECT 1 FROM public.credit_costs c WHERE c.feature_name = v.feature_name
);

-- 1c. Retire the legacy FOCUS_PLAN feature (superseded by FOCUS_SESSION).
--     Kept for historical ai_usage_logs joins; simply deactivated.
UPDATE public.credit_costs SET active = false WHERE feature_name = 'FOCUS_PLAN';

-- 2. PACK REPRICING ---------------------------------------------------------
-- Credits granted stay 500 / 1000 / 2000; only the EGP price changes.
-- Two tables carry pack pricing:
--   • credit_packs    → what pricing.html displays
--   • plan_definitions→ what approve_payment_request grants on approval
-- Keep them in lockstep.

UPDATE public.credit_packs SET price_egp = 199 WHERE name = 'Starter Pack';
UPDATE public.credit_packs SET price_egp = 349 WHERE name = 'Value Pack';
UPDATE public.credit_packs SET price_egp = 649 WHERE name = 'Power Pack';

UPDATE public.plan_definitions SET amount_egp = 199 WHERE plan_code = 'PACK_STARTER';
UPDATE public.plan_definitions SET amount_egp = 349 WHERE plan_code = 'PACK_VALUE';
UPDATE public.plan_definitions SET amount_egp = 649 WHERE plan_code = 'PACK_POWER';

-- ── Rollback (manual) ──────────────────────────────────────────────────────
--   • credit_costs: set active=false for CHAT_*, MOCK_TIMER, MOCK_PRACTICE,
--     FOCUS_SESSION; restore MOCK_EXAM(10)/WEAKNESS_ANALYSIS(10) and their prior
--     active/always_charge flags; re-activate FOCUS_PLAN if desired.
--   • credit_packs / plan_definitions: restore 69 / 129 / 249.
-- ===========================================================================
