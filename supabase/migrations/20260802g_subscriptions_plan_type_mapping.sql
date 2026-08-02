-- ===========================================================================
-- approve_payment_request writes a VALID subscriptions.plan_type
-- ===========================================================================
-- STATUS: ✅ APPLIED to igvkyxkmjnkzscqgommj on 2026-08-02, owner-approved
--         individually (CLAUDE.md §3). Version 20260802184704.
--
--         The owner's requirement was explicit: fix EVERY writer, not just the
--         one that failed. §2 and §3 do that; §4 asserts it rather than
--         claiming it, and would abort the migration if either function still
--         passed a raw plan_code.
--
--         POST-APPLY VERIFICATION — rehearsed against production inside
--         transactions that were ROLLED BACK, calling the real functions:
--
--         approve_payment_request, one request per plan (11 plans):
--           FREE ......... refused: "period_days = 0; it cannot be approved
--                          without a period" — PRE-EXISTING and correct. FREE
--                          costs nothing, so no checkout creates a request for
--                          it. Not a plan_type failure; the guard is unchanged.
--           HERO ......... ✅ plan_code HERO / plan_type PRO_ANNUAL / 25,000 credits
--           PRO_QUARTERLY_COPY ✅ plan_code kept / plan_type PRO_QUARTERLY
--           PRO_* , FOUNDER_* ✅ plan_type identical to plan_code, as before
--           PACK_STARTER/VALUE/POWER ✅ 500/1,000/2,000 credits, no
--                          subscriptions row — the pack branch returns first
--
--         activate_subscription, one COMPLETED payment per plan (8 plans):
--           all 8 ✅, HERO -> PRO_ANNUAL, PRO_QUARTERLY_COPY -> PRO_QUARTERLY,
--           six legacy codes -> themselves, FREE -> FREE
--
--         activate_pro_subscription: ✅ writes PRO_MONTHLY, unchanged
--
--         Production afterwards: 7 subscriptions rows, plan_types still only
--         {FOUNDER_ANNUAL, PRO_MONTHLY}, 4 pending requests, founder slots 3,
--         zero rehearsal leftovers, constraint byte-identical.
--
-- ── THE FAILURE ────────────────────────────────────────────────────────────
--   new row for relation "subscriptions" violates check constraint
--   "subscriptions_plan_type_check"
--
-- Raised by the Approve button in the Owner Dashboard. Reproduced from live
-- data 2026-08-02: payment_requests row 9fbeb816-7560-402a-bdbe-363519e8ef84,
-- user 6b9a2f4b, plan_code 'HERO', created 18:22:09Z, still pending.
--
-- ── THE VALUE BEING WRITTEN ────────────────────────────────────────────────
-- approve_payment_request() ends with:
--
--   insert into public.subscriptions (user_id, plan_code, plan_type, ...)
--   values (_req.user_id, _req.plan_code, _req.plan_code, ...)
--                         ^^^^^^^^^^^^^^  ^^^^^^^^^^^^^^
--                         plan_code       plan_type — the SAME value
--
-- So plan_type receives the plan_code verbatim: **'HERO'**.
--
-- The constraint permits six values and no others:
--
--   CHECK (plan_type = ANY (ARRAY['FREE','PRO_MONTHLY','PRO_QUARTERLY',
--                                 'PRO_ANNUAL','FOUNDER_MONTHLY','FOUNDER_ANNUAL']))
--
-- 'HERO' is not among them. Every approval of any plan the owner authors from
-- the dashboard fails the same way.
--
-- ── WHICH CHANGE INTRODUCED THE MISMATCH ───────────────────────────────────
-- Two changes, and the distinction matters because the first one was fine:
--
--   1. 20260619_payment_packs_unified.sql — made the write plan_type :=
--      plan_code. Before it, 20260619_manual_payments_v1.sql had written the
--      literal 'SUBSCRIPTION'. This is where the coupling was introduced, and
--      at the time it was CORRECT-BY-COINCIDENCE: the only plan codes that
--      existed were exactly the six in the constraint, so a column holding a
--      category and a column holding a code were indistinguishable.
--
--   2. 20260802d_plan_catalog_v2_authoring.sql — applied 2026-08-02 15:44:02Z,
--      it made plan authoring unlimited from the Owner Dashboard. It carried
--      the same insert forward unchanged. Thirty-one minutes later, at
--      16:15:53Z, the owner created 'HERO' (kind=subscription,
--      billing_cycle=semiannual, period_days=182). The coincidence ended there.
--
-- So: the write is fourteen months old and the constraint is older still. What
-- broke is the assumption they both rested on — that the set of plan codes is
-- fixed and known at migration-authoring time. Plan Catalog V2's entire premise
-- is that it is not. Nothing failed until a plan outside the original six was
-- actually sold, which is why this surfaced today rather than in July.
--
-- This is the same defect class 20260802_plan_catalog_single_source.sql was
-- written to remove — it fixed the pack-rename case ("Rename 'Value Pack' and
-- approve_payment_request raises 'Unknown plan_code'") and did not look for the
-- others. subscriptions_plan_type_check is the one it missed.
--
-- ── THE FIX ────────────────────────────────────────────────────────────────
-- The constraint is NOT touched. The application is changed to write a value
-- the schema already accepts.
--
-- plan_type and plan_code are two columns holding the same fact, and only one
-- of them is authoritative. plan_code is: it carries the exact code and is what
-- every reader uses. plan_type is a legacy CATEGORY, and nothing reads it —
-- verified across the whole repository: pricing.html SELECTs it twice and never
-- touches the value; no SQL function reads it for logic; no page branches on it.
--
-- So this restores plan_type to what its constraint says it is — one of six
-- categories — and lets plan_code keep the truth:
--
--   • one of the six legacy codes  -> written verbatim, exactly as today.
--     Zero behaviour change for FREE, PRO_*, FOUNDER_*, which is every plan
--     that has ever been sold (measured: subscriptions holds only
--     FOUNDER_ANNUAL and PRO_MONTHLY).
--   • anything the owner authors    -> bucketed to the nearest legacy category
--     by period_days and is_founder.
--
-- Bucketing by period_days rather than by billing_cycle is deliberate: HERO is
-- 'semiannual', a cycle that did not exist when the constraint was written and
-- would have no case arm. period_days is a number, so an arbitrary future cycle
-- lands somewhere sensible instead of falling through to NULL.
--
-- Verified against all 11 rows in plan_definitions before writing this file —
-- every one maps to an allowed value, and all six legacy codes map to
-- themselves:
--
--   FREE             -> FREE              PRO_MONTHLY   -> PRO_MONTHLY
--   PRO_QUARTERLY    -> PRO_QUARTERLY     PRO_ANNUAL    -> PRO_ANNUAL
--   FOUNDER_MONTHLY  -> FOUNDER_MONTHLY   FOUNDER_ANNUAL-> FOUNDER_ANNUAL
--   HERO (182d)      -> PRO_ANNUAL        PRO_QUARTERLY_COPY (91d) -> PRO_QUARTERLY
--   PACK_*           -> NULL (never reached: the pack branch returns earlier)
--
-- ── EVERY WRITER OF subscriptions.plan_type (full inventory) ───────────────
-- Enumerated from pg_proc rather than from memory: every function whose body
-- INSERTs or UPDATEs subscriptions, plus the triggers on the table, plus the
-- client grants.
--
--   approve_payment_request      INSERT   plan_type := _req.plan_code   ✗ FIXED §2
--   activate_subscription        INSERT   plan_type := v_plan.plan_code ✗ FIXED §3
--   activate_pro_subscription    INSERT   plan_type := 'PRO_MONTHLY'    ✓ already valid
--   consume_credits              UPDATE   does not touch plan_type      ✓
--   enforce_my_subscription_expiry UPDATE does not touch plan_type      ✓
--   trg_sync_subscription_status TRIGGER  does not touch plan_type      ✓
--   pricing.html (browser)       INSERT   plan_type := selectedPlanCode ✗ removed
--                                          in the same commit as this file
--
-- CORRECTION TO AN EARLIER NOTE. A previous draft of this file said
-- activate_pro_subscription "carries the same latent bug". It does not. It
-- writes the string literal 'PRO_MONTHLY', which the CHECK already permits, and
-- it takes a month count rather than a plan_code — there is no code to map. It
-- is left unchanged deliberately, and §4 asserts its literal stays valid so the
-- claim is enforced rather than asserted.
--
-- ── NOT IN SCOPE, AND WHY ──────────────────────────────────────────────────
-- • Widening or dropping the CHECK. Explicitly excluded by the owner. The
--   better long-term shape is a foreign key to plan_definitions(plan_code) —
--   real referential integrity instead of a list frozen in 2026-06 — but that
--   replaces the constraint rather than satisfying it, so it is a separate
--   decision. Recorded in docs/engineering/infrastructure-backlog.md.
-- • Dropping plan_type. It is dead weight duplicated by plan_code, but removing
--   a column is destructive and unrelated to unblocking the approval.
-- • activate_pro_subscription's OTHER defect: it writes no plan_code at all, so
--   rows it creates carry plan_type without a code. Pre-existing, unrelated to
--   the constraint, and touching it would change behaviour this file has no
--   mandate to change.
--
-- Target project: igvkyxkmjnkzscqgommj
-- ===========================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. The mapping, as a function rather than an expression
-- ---------------------------------------------------------------------------
-- A function because there is more than one writer of this column. Inlining the
-- CASE into approve_payment_request would mean the next caller re-derives it,
-- and re-derived rules drift — which is exactly how plan_type and plan_code
-- came to disagree.
create or replace function public.legacy_plan_type(p_plan_code text)
returns text
language sql
stable
set search_path to 'public'
as $function$
  select case
    -- The six the constraint names. Verbatim: today's behaviour, unchanged.
    when p_plan_code in ('FREE','PRO_MONTHLY','PRO_QUARTERLY','PRO_ANNUAL',
                         'FOUNDER_MONTHLY','FOUNDER_ANNUAL')
      then p_plan_code
    else (
      select case
        -- Packs never reach subscriptions; approve_payment_request returns in
        -- its pack branch well before the insert. NULL satisfies the CHECK (a
        -- NULL operand makes the predicate NULL, which CHECK accepts) and is
        -- honest: a pack has no subscription category.
        when pd.kind = 'pack' then null
        when coalesce(pd.is_founder, false) then
          case when coalesce(pd.period_days, 0) between 1 and 135
               then 'FOUNDER_MONTHLY' else 'FOUNDER_ANNUAL' end
        else
          case when coalesce(pd.period_days, 0) between 1 and 45   then 'PRO_MONTHLY'
               when coalesce(pd.period_days, 0) between 46 and 135 then 'PRO_QUARTERLY'
               -- >135 days, and also 0/NULL (lifetime, one-time, custom):
               -- the longest bucket is the least wrong for an open-ended grant.
               else 'PRO_ANNUAL' end
      end
      from plan_definitions pd
      where pd.plan_code = p_plan_code
    )
  end;
$function$;

comment on function public.legacy_plan_type(text) is
  'Maps a plan_definitions.plan_code to one of the six categories subscriptions_plan_type_check permits. plan_code stays the authoritative value on the row; plan_type is a legacy category column that nothing reads. Added 2026-08-02 after approving a dashboard-authored plan (HERO) violated the constraint.';

revoke execute on function public.legacy_plan_type(text) from public, anon;
grant  execute on function public.legacy_plan_type(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. approve_payment_request — ONE line changes
-- ---------------------------------------------------------------------------
-- Rebased on the live definition, verified 2026-08-02. Everything below is that
-- body verbatim except the plan_type value in the final insert, which is marked.
create or replace function public.approve_payment_request(request_id uuid, admin_note text DEFAULT NULL::text)
returns json
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  _caller_id        uuid := auth.uid();
  _is_admin         boolean;
  _req              public.payment_requests%rowtype;
  _plan_def         public.plan_definitions%rowtype;
  _expires_at       timestamptz;
  _now              timestamptz := now();
  _is_founder_plan  boolean;
  _slots_remain     integer;
  _existing_pack    integer;
  _one_time         boolean;
begin
  select is_admin into _is_admin from public.profiles where id = _caller_id;
  if not _is_admin then
    raise exception 'Unauthorized: admins only';
  end if;

  select * into _req from public.payment_requests where id = request_id;
  if not found then raise exception 'Payment request not found'; end if;
  if _req.status <> 'pending' then raise exception 'Payment request is already %', _req.status; end if;

  select * into _plan_def from public.plan_definitions where plan_code = _req.plan_code;
  if not found then raise exception 'Unknown plan_code: %', _req.plan_code; end if;

  if _plan_def.kind = 'pack' then
    update public.payment_requests
    set status = 'approved', reviewed_at = _now, reviewed_by = _caller_id
    where id = request_id;

    select coalesce(pack_credits, 0) into _existing_pack from public.profiles where id = _req.user_id;

    update public.profiles
    set pack_credits      = _existing_pack + _plan_def.credits_granted,
        credits_balance   = coalesce(subscription_credits, 0) + _existing_pack + _plan_def.credits_granted,
        upgrade_requested = false,
        upgrade_note      = null
    where id = _req.user_id;

    return json_build_object(
      'ok',            true,
      'kind',          'pack',
      'user_id',       _req.user_id,
      'plan_code',     _req.plan_code,
      'credits_added', _plan_def.credits_granted
    );
  end if;

  _one_time := (_plan_def.kind = 'lifetime')
            or (_plan_def.kind = 'custom' and coalesce(_plan_def.period_days, 0) = 0);

  _is_founder_plan := coalesce(_plan_def.is_founder, false);

  if _is_founder_plan then
    select coalesce(value::int, 0) into _slots_remain
    from public.system_settings where key = 'founder_slots_remaining';
    if _slots_remain <= 0 then
      raise exception 'No Founder slots remaining. Cannot approve Founder plan.';
    end if;
    update public.system_settings
      set value = (_slots_remain - 1)::text
      where key = 'founder_slots_remaining';
  end if;

  if _one_time then
    _expires_at := null;
  else
    if coalesce(_plan_def.period_days, 0) <= 0 then
      raise exception 'Plan % is a % plan with period_days = %; it cannot be approved without a period',
        _plan_def.plan_code, _plan_def.kind, _plan_def.period_days;
    end if;
    _expires_at := _now + (_plan_def.period_days || ' days')::interval;
  end if;

  update public.payment_requests
  set status = 'approved', reviewed_at = _now, reviewed_by = _caller_id
  where id = request_id;

  update public.profiles
  set plan_code               = _req.plan_code,
      subscription_credits    = _plan_def.credits_granted,
      credits_balance         = coalesce(pack_credits, 0) + _plan_def.credits_granted,
      subscription_expires_at = _expires_at,
      upgrade_requested       = false,
      upgrade_note            = null,
      is_founder              = coalesce(is_founder, false) or _is_founder_plan
  where id = _req.user_id;

  -- ▼▼▼ THE ONE CHANGED LINE ▼▼▼
  -- was: values (_req.user_id, _req.plan_code, _req.plan_code, ...)
  -- plan_code keeps the exact code; plan_type gets the legacy category the
  -- CHECK constraint permits.
  insert into public.subscriptions (user_id, plan_code, plan_type, status, active, current_period_end, created_at)
  values (_req.user_id, _req.plan_code, public.legacy_plan_type(_req.plan_code), 'active', true, _expires_at, _now)
  -- ▲▲▲
  on conflict (user_id) do update
    set plan_code          = excluded.plan_code,
        plan_type          = excluded.plan_type,
        status             = 'active',
        active             = true,
        current_period_end = excluded.current_period_end;

  return json_build_object(
    'ok',              true,
    'kind',            _plan_def.kind,
    'user_id',         _req.user_id,
    'plan_code',       _req.plan_code,
    'credits_granted', _plan_def.credits_granted,
    'expires_at',      _expires_at,
    'never_expires',   _one_time,
    'is_founder',      _is_founder_plan,
    'founder_slots_remaining', case when _is_founder_plan then _slots_remain - 1 else null end
  );
end;
$function$;

-- ---------------------------------------------------------------------------
-- 3. activate_subscription — the same one-line change
-- ---------------------------------------------------------------------------
-- The Stripe/automated activation path. Not client-callable and not on the
-- Approve button, but it writes plan_type from a plan_code exactly as
-- approve_payment_request did, so it fails identically the first time it is
-- reached with an authored plan. Fixing one path and leaving the other is how a
-- defect comes back wearing a different stack trace.
--
-- Rebased on the live definition, verified 2026-08-02. Body verbatim except the
-- plan_type value, which is marked.
create or replace function public.activate_subscription(p_payment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  v_payment         RECORD;
  v_plan            RECORD;
  v_end_date        TIMESTAMPTZ;
  v_sub_id          UUID;
  v_new_sub_cred    INTEGER;
  v_already_founder BOOLEAN;
  v_founder_result  JSONB;
BEGIN
  SELECT * INTO v_payment FROM payments WHERE id = p_payment_id AND status = 'COMPLETED';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'payment_not_found_or_not_completed');
  END IF;

  IF v_payment.payment_type != 'SUBSCRIPTION' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_a_subscription_payment');
  END IF;

  SELECT * INTO v_plan FROM pricing_settings WHERE plan_code = v_payment.reference_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'plan_not_found');
  END IF;

  v_end_date := CASE v_plan.billing_cycle
    WHEN 'monthly'    THEN now() + INTERVAL '1 month'
    WHEN 'quarterly'  THEN now() + INTERVAL '3 months'
    WHEN 'semiannual' THEN now() + INTERVAL '6 months'
    WHEN 'annual'     THEN now() + INTERVAL '1 year'
    WHEN 'one_time'   THEN NULL
    WHEN 'custom'     THEN CASE WHEN COALESCE(v_plan.period_days, 0) > 0
                                THEN now() + (v_plan.period_days || ' days')::interval
                                ELSE NULL END
    ELSE NULL
  END;

  UPDATE subscriptions
  SET status = 'EXPIRED', active = false, updated_at = now()
  WHERE user_id = v_payment.user_id AND status = 'ACTIVE';

  -- ▼▼▼ THE ONE CHANGED LINE ▼▼▼
  -- was: (v_payment.user_id, v_plan.plan_code, v_plan.plan_code, 'ACTIVE', ...)
  INSERT INTO subscriptions
    (user_id, plan_code, plan_type, status, active,
     start_date, end_date, current_period_end,
     auto_renew, credits_granted, payment_id)
  VALUES
    (v_payment.user_id, v_plan.plan_code, public.legacy_plan_type(v_plan.plan_code), 'ACTIVE', true,
     now(), v_end_date, v_end_date,
     false, v_plan.credits_granted, p_payment_id)
  -- ▲▲▲
  RETURNING id INTO v_sub_id;

  UPDATE profiles
  SET
    plan_code               = v_plan.plan_code,
    plan                    = lower(v_plan.plan_code),
    subscription_credits    = subscription_credits + v_plan.credits_granted,
    credits_balance         = (subscription_credits + v_plan.credits_granted) + pack_credits,
    subscription_expires_at = v_end_date,
    upgrade_requested       = false,
    upgrade_note            = null
  WHERE id = v_payment.user_id
  RETURNING subscription_credits INTO v_new_sub_cred;

  INSERT INTO credit_transactions
    (user_id, transaction_type, credits, balance_after,
     reference_type, reference_id, description)
  SELECT
    v_payment.user_id, 'GRANT', v_plan.credits_granted,
    subscription_credits + pack_credits,
    'SUBSCRIPTION', v_sub_id,
    'Credits granted for ' || v_plan.display_name
  FROM profiles WHERE id = v_payment.user_id;

  IF v_plan.is_founder THEN
    SELECT is_founder INTO v_already_founder FROM profiles WHERE id = v_payment.user_id;
    IF NOT v_already_founder THEN
      v_founder_result := claim_founder_slot(v_payment.user_id, p_payment_id);
      IF NOT (v_founder_result->>'ok')::BOOLEAN THEN
        RETURN jsonb_build_object('ok', false,
          'reason', 'founder_slot_unavailable:' || (v_founder_result->>'reason'));
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', true, 'subscription_id', v_sub_id, 'plan_code', v_plan.plan_code,
    'credits_granted', v_plan.credits_granted, 'expires_at', v_end_date);
END;
$function$;

-- ---------------------------------------------------------------------------
-- 4. Assert every sellable plan now maps to a permitted value
-- ---------------------------------------------------------------------------
-- Aborts rather than committing a mapping that still violates the constraint
-- for some plan already in the catalogue.
do $$
declare
  v_bad text;
begin
  select string_agg(format('%s -> %s', plan_code, coalesce(legacy_plan_type(plan_code), '<null>')), ', ')
    into v_bad
  from plan_definitions
  where kind <> 'pack'
    and coalesce(legacy_plan_type(plan_code), 'FREE') not in
        ('FREE','PRO_MONTHLY','PRO_QUARTERLY','PRO_ANNUAL','FOUNDER_MONTHLY','FOUNDER_ANNUAL');

  if v_bad is not null then
    raise exception 'legacy_plan_type still yields a value the CHECK rejects: %', v_bad;
  end if;
end $$;

-- No writer of plan_type may pass a raw plan_code through again. Checked
-- against the function bodies themselves, so a future edit that reintroduces it
-- cannot commit alongside this file's claim to have removed it.
do $$
declare
  v_src text;
begin
  select pg_get_functiondef(p.oid) into v_src from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='public' and p.proname='approve_payment_request';
  if v_src !~ 'legacy_plan_type\(_req\.plan_code\)' then
    raise exception 'approve_payment_request does not route plan_type through legacy_plan_type';
  end if;

  select pg_get_functiondef(p.oid) into v_src from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='public' and p.proname='activate_subscription';
  if v_src !~ 'legacy_plan_type\(v_plan\.plan_code\)' then
    raise exception 'activate_subscription does not route plan_type through legacy_plan_type';
  end if;

  -- activate_pro_subscription is untouched on purpose; assert its literal is
  -- and stays a permitted value, so "no change needed" is enforced, not assumed.
  select pg_get_functiondef(p.oid) into v_src from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='public' and p.proname='activate_pro_subscription';
  if v_src !~ '''PRO_MONTHLY''' then
    raise exception 'activate_pro_subscription no longer writes the literal PRO_MONTHLY — re-check it';
  end if;
end $$;

commit;

-- ===========================================================================
-- VERIFICATION (run after applying)
-- ===========================================================================
--   -- 1. Every plan maps to something the constraint accepts.
--   SELECT plan_code, kind, period_days, is_founder,
--          public.legacy_plan_type(plan_code) AS plan_type
--     FROM plan_definitions ORDER BY kind, plan_code;
--
--   -- 2. The six legacy codes are unchanged (each maps to itself).
--   SELECT count(*) FROM plan_definitions
--    WHERE plan_code IN ('FREE','PRO_MONTHLY','PRO_QUARTERLY','PRO_ANNUAL',
--                        'FOUNDER_MONTHLY','FOUNDER_ANNUAL')
--      AND public.legacy_plan_type(plan_code) IS DISTINCT FROM plan_code;   -- expect 0
--
--   -- 3. The constraint is untouched.
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--    WHERE conname = 'subscriptions_plan_type_check';
--   -- expect the original six-value list
--
--   -- 4. The blocked approval now succeeds (this APPROVES A REAL PAYMENT —
--   --    run it only when the owner intends to approve that request):
--   --   SELECT public.approve_payment_request('9fbeb816-7560-402a-bdbe-363519e8ef84');
--   --   SELECT plan_code, plan_type FROM subscriptions WHERE user_id = '6b9a2f4b-...';
--   --   expect plan_code = 'HERO', plan_type = 'PRO_ANNUAL'
--
-- ── Rollback ───────────────────────────────────────────────────────────────
-- Restore the insert to `_req.plan_code` for plan_type from
-- supabase/migrations/20260802d_plan_catalog_v2_authoring.sql, then:
--   drop function if exists public.legacy_plan_type(text);
-- Note that rolling back reinstates the failure for any non-legacy plan code.
--
-- ── FOLLOW-UP (not done here) ──────────────────────────────────────────────
-- activate_subscription and activate_pro_subscription also write plan_type from
-- a plan code and will fail the same way if they are ever reached with an
-- authored plan. Neither is client-callable and neither is on the Approve path,
-- so they are out of scope for unblocking this failure — but they are the same
-- bug, and they should take legacy_plan_type() the next time either is touched.
-- ===========================================================================
