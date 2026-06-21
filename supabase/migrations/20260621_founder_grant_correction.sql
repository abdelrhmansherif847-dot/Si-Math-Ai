-- Founder Annual grant correction
-- plan_definitions.FOUNDER_ANNUAL had 3500 (monthly-equivalent value in the
-- annual grant field). pricing UI advertises 42000/year for 1499 EGP. Two
-- Founders currently under-credited by 38500 each.

-- 1. Fix source-of-truth (idempotent guard)
UPDATE public.plan_definitions
   SET credits_granted = 42000
 WHERE plan_code = 'FOUNDER_ANNUAL'
   AND credits_granted = 3500;

-- 2. Backfill under-credited Founders (additive + capped, idempotent)
WITH affected AS (
  SELECT id, subscription_credits
    FROM public.profiles
   WHERE plan_code = 'FOUNDER_ANNUAL'
     AND subscription_credits < 42000
)
UPDATE public.profiles p
   SET subscription_credits = p.subscription_credits + (42000 - a.subscription_credits),
       credits_balance      = p.credits_balance      + (42000 - a.subscription_credits)
  FROM affected a
 WHERE p.id = a.id;

-- 3. Audit ledger
INSERT INTO public.credit_transactions
  (user_id, transaction_type, credits, balance_after, reference_type, description)
SELECT id, 'GRANT', 38500, credits_balance,
       'ADMIN',
       'Founder Annual grant correction (3500 -> 42000): plan_definitions bug fix 2026-06-21'
  FROM public.profiles
 WHERE plan_code = 'FOUNDER_ANNUAL'
   AND id IN ('d60ae0b9-2827-430a-9d03-bfa9bd65d21e',
              'c2d8c684-711f-42c5-9c90-e636b526daf7');
