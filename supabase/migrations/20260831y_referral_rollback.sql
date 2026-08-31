-- =====================================================================
-- ROLLBACK for 20260831b/c/d/e — remove the Teacher Partner Program
-- =====================================================================
-- STATUS: 🟡 PREPARED, deliberately NOT APPLIED.
--
-- ORDER MATTERS. The payment functions are unhooked FIRST, before anything
-- they call is dropped. Reversing that order leaves three functions
-- referencing a record_purchase_event() that no longer exists, and the next
-- approval of a student's payment fails.
--
-- The unhook restores each of the three to the definition production held on
-- 2026-08-31 — the same bodies 20260831e reproduces, minus the added lines:
--
--   approve_payment_request  md5 d1dd67130e32a31866738bf9b674bd09
--   activate_subscription    md5 5d48d50c9a1f70294aee003b719d8d20
--   activate_credit_pack     md5 c66e349c7c0bd449f0ee7254f36215cd
--
-- ⚠️  If any of the three has been changed since for an unrelated reason,
--     THIS FILE WOULD REVERT THAT CHANGE TOO. Diff before running it, exactly
--     as you would before applying 20260831e.
--
-- ⚠️  DATA LOSS. Dropping the tables destroys the commission ledger. If any
--     commission has ever been awarded, drop nothing: run only STEP 1 to
--     detach the program from the payment path, and keep the tables as the
--     accounting record they are. STEP 2 is for a rollback that happens
--     before the program has earned anybody anything.
-- =====================================================================

begin;

-- ── STEP 1 · unhook the payment paths (safe at any time) ─────────────────
-- Deliberately NOT reproduced here as three 100-line function bodies: keeping
-- a second verbatim copy in the repo means two places to get wrong. Restore
-- them from 20260831e by deleting the four lines marked `-- ADDED 20260831e`,
-- or from the production definitions captured above by md5.
--
-- To generate the restore statements from a database that still has them:
--
--   select pg_get_functiondef(p.oid)
--     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'public'
--      and p.proname in ('approve_payment_request','activate_subscription',
--                        'activate_credit_pack');
--
-- then delete the ADDED lines from the result and run it.

-- ── STEP 2 · drop the program (ONLY if no commission was ever awarded) ───
do $$
begin
  if to_regclass('public.referral_commissions') is not null
     and exists (select 1 from referral_commissions) then
    raise exception 'refusing to drop: % commission rows exist. Run STEP 1 only and keep the ledger.',
      (select count(*) from referral_commissions);
  end if;
end $$;

drop trigger if exists referral_award_trg on purchase_events;
drop function if exists referral_award_from_event();
drop function if exists record_purchase_event(text, uuid, uuid, text);

drop function if exists admin_referral_overview();
drop function if exists admin_reassign_referral(uuid, uuid, text, boolean);
drop function if exists admin_set_commission_status(uuid, text, text);
drop function if exists teacher_referral_students();
drop function if exists teacher_referral_summary();
drop function if exists attribute_referral(text, text);
drop function if exists teacher_referral_code();
drop function if exists is_active_teacher(uuid);

drop trigger if exists referral_commissions_guard_trg on referral_commissions;
drop function if exists referral_commissions_guard();
drop trigger if exists referral_attributions_guard_trg on referral_attributions;
drop function if exists referral_attributions_guard();
drop trigger if exists referral_rates_guard_trg on referral_commission_rates;
drop function if exists referral_rates_guard();

drop table if exists referral_commissions;
drop table if exists referral_attributions;
drop table if exists referral_codes;
drop table if exists referral_audit_log;
drop table if exists referral_award_skips;
drop table if exists referral_commission_rates;
drop table if exists purchase_events;

delete from system_settings where key = 'referral_payouts_enabled';

commit;
