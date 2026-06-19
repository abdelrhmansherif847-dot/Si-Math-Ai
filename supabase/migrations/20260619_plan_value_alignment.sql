-- Plan Value V1 alignment
-- 1. Bump free daily limit 10 → 15 (gives students a real taste before paywall)
-- 2. Sync plan_definitions prices to match pricing_settings (single source of truth)

update public.pricing_settings
set daily_limit = 15
where plan_code = 'FREE';

update public.plan_definitions
set amount_egp = 349, credits_granted = 3500, period_days = 30
where plan_code = 'PRO_MONTHLY';

update public.plan_definitions
set amount_egp = 2999, credits_granted = 42000, period_days = 365
where plan_code = 'PRO_ANNUAL';
