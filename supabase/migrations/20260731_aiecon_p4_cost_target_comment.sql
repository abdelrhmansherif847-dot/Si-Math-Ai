-- ===========================================================================
-- Metadata-only: correct the cost_target_usd column comment
-- ===========================================================================
-- APPLIED to igvkyxkmjnkzscqgommj on 2026-07-31 (owner-approved).
--
-- OWNER DECISION (2026-07-31, locked): services.cost_target_usd is the
-- MONTHLY BUDGET for a service, in USD.
--
-- The Phase 2 comment described it as a target "per unit_of_work", which the
-- decision supersedes. owner_cost_health() already implements the monthly
-- budget (see 20260731_aiecon_p4_cost_engine.sql §15); this brings the
-- documentation carried in the database into line with the implementation.
--
-- COMMENT ON COLUMN only. No schema change, no data change, no behavioural
-- change, no dependent object touched. Verified after applying: 12 services,
-- 76 current cost facts, $0.22961425 total, allocated = priced, every
-- allocation run still conserved.
--
-- Previous value, for the record:
--   'Owner-set optimization target per unit_of_work. NULL = no target
--    (§15 Q10 — set from measured baselines after Phase 4, not from guesses).'
-- ===========================================================================

COMMENT ON COLUMN ai_catalog.services.cost_target_usd IS
  'Owner-set MONTHLY BUDGET for this service, in USD. NULL = no budget set '
  '(§15 Q10 — set from measured baselines after Phase 4, not from guesses). '
  'owner_cost_health() reports service_over_budget with one row per breached '
  'calendar month, comparing the month''s total spend against this value. '
  'Internal/admin traffic is INCLUDED in that comparison: a budget measures '
  'money actually owed to the provider, unlike the reported metrics, which '
  'exclude internal traffic by default (INV-25).';
