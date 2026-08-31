-- =====================================================================
-- Teacher Partner Program — ACL FIX for 20260831c
-- =====================================================================
-- STATUS: 🟢 APPLIED 2026-08-31, immediately after the b/c/d/e phase.
-- SEVERITY: this closed a live hole, open for the minutes between applying
--           20260831c and this file.
--
-- WHAT WENT WRONG
-- ---------------
-- This project grants every new function to `anon` and `authenticated` by
-- default. CLAUDE.md says so, and 20260831d revokes-then-grants for all eight
-- of ITS functions — but 20260831c creates two more (`record_purchase_event`
-- and `referral_award_from_event`) plus three guard functions in 20260831b,
-- and none of them was in that list. They kept the default ACL.
--
-- `record_purchase_event(text, uuid, uuid, text)` is SECURITY DEFINER and takes
-- the target user_id as a parameter. Reachable by `anon`, it would let anybody
-- POST a fabricated purchase for any account, which
--
--   * marks that student as having purchased, permanently blocking them from
--     ever being attributed to a teacher, and
--   * mints a real commission row if that student already has an attribution.
--
-- It is an internal seam between the payment path and the ledger. Nothing
-- outside the database should ever call it, which is exactly why it should have
-- carried no grant at all.
--
-- Found by the post-apply verification sweep, not by review: the sweep asks
-- pg_proc which functions carry `anon=X`, and that question does not care what
-- anybody intended.
--
-- THE RULE THIS RESTATES
-- ----------------------
-- Revoke-then-grant belongs with the CREATE, in the same migration, for every
-- function without exception — including trigger functions and internal
-- helpers. A privilege block that covers "the functions I was thinking about"
-- is how this happened.
-- =====================================================================

begin;

-- The seam. Nothing outside the database calls it: the payment functions do,
-- and they are SECURITY DEFINER and run as their owner.
revoke all on function record_purchase_event(text, uuid, uuid, text)
  from public, anon, authenticated;

-- Trigger functions. Not directly invocable as an RPC because they return
-- `trigger`, so these were hygiene rather than exposure — but the whole point
-- of the rule is not having to make that judgement one function at a time.
revoke all on function referral_award_from_event()    from public, anon, authenticated;
revoke all on function referral_attributions_guard()  from public, anon, authenticated;
revoke all on function referral_commissions_guard()   from public, anon, authenticated;
revoke all on function referral_rates_guard()         from public, anon, authenticated;

comment on function record_purchase_event(text, uuid, uuid, text) is
  'The single line a payment path adds to participate in the partner program. '
  'Resolves the authoritative price itself, so no caller can pass a wrong one '
  '— there is no amount parameter, by design. INTERNAL: no client role holds '
  'EXECUTE, because it takes the target user_id as an argument and would '
  'otherwise let a caller fabricate a purchase for somebody else (20260831f).';

commit;
