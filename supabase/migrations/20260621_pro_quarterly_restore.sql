-- Restore PRO_QUARTERLY in plan_definitions
-- pricing_settings already has it (899 EGP, 10500 credits, quarterly).
-- pricing.html and manual-payment.html already render the quarterly tier.
-- Without this row, approve_payment_request raises 'Unknown plan_code: PRO_QUARTERLY'.

INSERT INTO public.plan_definitions
  (plan_code, display_name, credits_granted, period_days, amount_egp, kind)
VALUES
  ('PRO_QUARTERLY', 'Pro Quarterly', 10500, 91, 899, 'subscription')
ON CONFLICT (plan_code) DO UPDATE
  SET display_name    = EXCLUDED.display_name,
      credits_granted = EXCLUDED.credits_granted,
      period_days     = EXCLUDED.period_days,
      amount_egp      = EXCLUDED.amount_egp,
      kind            = EXCLUDED.kind;
