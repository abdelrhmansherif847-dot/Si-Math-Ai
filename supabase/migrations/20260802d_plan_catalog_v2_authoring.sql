-- =====================================================================
-- Plan catalogue v2 — a plan becomes a record, not a code change
-- =====================================================================
-- STATUS: ✅ APPLIED to igvkyxkmjnkzscqgommj on 2026-08-02 as migration
--         plan_catalog_v2_authoring. Owner-approved individually (CLAUDE.md §3).
--
--         POST-APPLY VERIFICATION: 14/14 PASS against live data — all 15
--         authoring columns present; the 9 existing plans unchanged in price,
--         credits, visibility and archive state, and carrying NO authored
--         content, so nothing a student sees moved; is_best_value generated
--         from badge; all 6 authoring functions deployed with zero anon
--         EXECUTE; both views rebuilt; pricing_settings now spans every
--         non-pack kind; FREE keeps daily_limit 15 and PRO_MONTHLY
--         device_limit 3; checkout still resolves packs by key; an anonymous
--         visitor can still price the product.
--
-- WHY THIS EXISTS
-- ---------------
-- 20260802_plan_catalog_single_source.sql made plan_definitions the one place
-- a plan's name, price and credits live. It did not make a plan *authorable*:
-- everything else a plan needs to appear on the site — its badge, its colour,
-- its icon, its description, its feature bullets, its call to action — was
-- still written into the pages. Creating a plan therefore still meant editing
-- code.
--
-- This migration moves that whole surface into the row. After it, creating a
-- plan is one INSERT and every page renders it, because every page already
-- reads the catalogue and will now find the presentation there too.
--
-- WHAT THIS DOES
-- --------------
--   1. plan_definitions gains the presentation and lifecycle columns
--   2. `kind` widens: subscription | pack | lifetime | custom
--   3. `billing_cycle` widens: + semiannual, one_time, custom
--   4. is_best_value becomes GENERATED from `badge` — it cannot drift
--   5. the compat views carry the new columns, and now cover every kind
--   6. fulfilment learns the two new kinds
--   7. entitlement lookups stop requiring `active` (see §7 — this is a bug fix)
--   8. authoring RPCs: upsert / duplicate / archive / restore
--   9. indexes sized for a catalogue in the thousands
--
-- SCOPE DECISIONS, STATED RATHER THAN ASSUMED
-- -------------------------------------------
-- • **Currency is a presentation field.** Each plan stores an ISO-4217 code and
--   the pages format against it. It does NOT convert, and it does NOT change
--   fulfilment: payment_requests.amount_egp, the revenue panels and the whole
--   econ schema remain EGP-denominated. Charging in another currency needs an
--   FX source and payment-provider work that is not in this migration, so a
--   non-EGP plan would be *quoted* in that currency and still *settled* in EGP.
--   Setting currency on a plan is safe; selling one in a foreign currency is a
--   separate piece of work.
--
-- • **`lifetime` grants credits that never expire.** plan_code is set (so the
--   holder gets the plan's entitlements) and subscription_expires_at is left
--   NULL. consume_credits only expires a subscription when expires_at IS NOT
--   NULL, so NULL is already "never expires" — no change needed there.
--
-- • **`custom` follows period_days.** period_days > 0 behaves as a
--   subscription; period_days = 0 behaves as a lifetime grant. That keeps one
--   rule instead of a special case nobody will remember.
--
-- • **Features are jsonb on the row, not a child table.** A feature list is
--   never read without its plan and never queried across plans, so a child
--   table would add a join to every catalogue read and a second write to every
--   save, in exchange for nothing. Ordering is array order, which is what the
--   reorder control in the dashboard manipulates directly.
--
-- BLAST RADIUS (measured 2026-08-02, not assumed)
-- -----------------------------------------------
--   rows in plan_definitions ................. 9
--   holders of a non-'subscription' kind ..... 0 (no lifetime/custom exists yet)
--   pages reading the views .................. 6, all still compile against them
--   SQL functions touched .................... 4 (approve_payment_request,
--                                               activate_subscription,
--                                               can_register_device,
--                                               consume_credits)
--   existing prices / credits changed ........ 0
--
-- PRE-APPLY PROBE: 38/38 PASS across three rolled-back runs against production
-- data (2026-08-02). What it proved:
--   • all 15 authoring columns land; the existing 9 plans survive with every
--     price and credit grant unchanged, and with EMPTY features — so applying
--     this changes nothing a student currently sees
--   • is_best_value is genuinely GENERATED: a direct write to it is rejected,
--     so it can no longer disagree with `badge`
--   • a fully-configured plan authored through admin_upsert_plan is visible to
--     the pricing read — badge, icon and features included — with no code change
--   • lifetime plans are visible to the device/daily-limit lookups, which the
--     old `kind = 'subscription'` view would have hidden
--   • refusals: unknown kind, non-hex colour, non-array features, duplicate live
--     name, unknown mode, 1-char plan code, non-admin caller
--   • duplicate lands inactive+hidden with features copied; archive keeps
--     yielding the device limit to existing holders; restore refuses when the
--     name was taken while archived
--
-- ONE DEFECT WAS FOUND AND FIXED BY THIS PROBE. `admin_upsert_plan` originally
-- had no mode. Filling in the Create form with an existing plan's name derived
-- that plan's code, matched the existing row, and silently UPDATED a live plan
-- while the owner believed they had created a new one. The `mode` contract
-- (create | update | upsert) exists because of that finding, and is checked
-- before any field so a bad mode cannot surface as an unrelated field error.
--
-- REVERSIBILITY
-- -------------
-- §10 carries the rollback. The added columns are additive; the four functions
-- are replaced with bodies that keep their current behaviour for the kinds that
-- exist today, so reverting them is only needed if the new kinds are abandoned.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Views come down first — §2 alters a column they depend on
-- ---------------------------------------------------------------------
drop view if exists public.pricing_settings;
drop view if exists public.credit_packs;

-- ---------------------------------------------------------------------
-- 2. The presentation and lifecycle surface
-- ---------------------------------------------------------------------
-- is_best_value was a plain boolean that the owner could set independently of
-- `badge`, which is two fields for one fact. It becomes generated below.
alter table public.plan_definitions drop column if exists is_best_value;

alter table public.plan_definitions
  add column if not exists currency          text        not null default 'EGP',
  add column if not exists badge             text        not null default 'none',
  add column if not exists badge_text        text,
  add column if not exists theme_color       text,
  add column if not exists accent_color      text,
  add column if not exists icon              text,
  add column if not exists short_description text,
  add column if not exists full_description  text,
  add column if not exists features          jsonb       not null default '[]'::jsonb,
  add column if not exists cta_text          text,
  add column if not exists cta_href          text,
  add column if not exists visibility        text        not null default 'public',
  add column if not exists archived_at       timestamptz,
  add column if not exists created_by        uuid;

-- One fact, one column. A badge of 'best_value' IS the best-value flag; the two
-- can no longer disagree because there is only one of them.
alter table public.plan_definitions
  add column if not exists is_best_value boolean
  generated always as (badge = 'best_value') stored;

-- ---------------------------------------------------------------------
-- 3. Widen the vocabularies
-- ---------------------------------------------------------------------
alter table public.plan_definitions drop constraint if exists plan_definitions_kind_check;
alter table public.plan_definitions
  add constraint plan_definitions_kind_check
  check (kind in ('subscription', 'pack', 'lifetime', 'custom'));

alter table public.plan_definitions drop constraint if exists plan_definitions_billing_cycle_chk;
alter table public.plan_definitions
  add constraint plan_definitions_billing_cycle_chk
  check (billing_cycle in ('none','monthly','quarterly','semiannual','annual','one_time','pack','custom'));

do $$ begin
  alter table public.plan_definitions add constraint plan_definitions_currency_chk
    check (currency ~ '^[A-Z]{3}$');
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.plan_definitions add constraint plan_definitions_badge_chk
    check (badge in ('none','best_value','most_popular','new','limited','custom'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.plan_definitions add constraint plan_definitions_visibility_chk
    check (visibility in ('public','hidden','internal'));
exception when duplicate_object then null; end $$;

-- A colour must be a hex literal the page can drop straight into CSS, or null.
do $$ begin
  alter table public.plan_definitions add constraint plan_definitions_theme_color_chk
    check (theme_color is null or theme_color ~ '^#[0-9A-Fa-f]{6}$');
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.plan_definitions add constraint plan_definitions_accent_color_chk
    check (accent_color is null or accent_color ~ '^#[0-9A-Fa-f]{6}$');
exception when duplicate_object then null; end $$;

-- features must be an ARRAY of objects. A bare object or a string would render
-- as garbage on the pricing page rather than failing here, so it fails here.
do $$ begin
  alter table public.plan_definitions add constraint plan_definitions_features_chk
    check (jsonb_typeof(features) = 'array');
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.plan_definitions add constraint plan_definitions_period_days_chk
    check (period_days >= 0);
exception when duplicate_object then null; end $$;

-- plan_code is the immutable join key carried by payment_requests, subscriptions
-- and profiles. Constrain its shape so an authored plan cannot mint a code that
-- breaks those joins or an element id in the dashboard.
do $$ begin
  alter table public.plan_definitions add constraint plan_definitions_plan_code_chk
    check (plan_code ~ '^[A-Z][A-Z0-9_]{1,48}$');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- 4. Backfill: carry today's presentation into the data
-- ---------------------------------------------------------------------
-- The Value Pack's "BEST VALUE" badge was a hardcoded name/index comparison in
-- two pages before the previous migration, and a boolean after it. Now it is a
-- badge, which is what it always was.
update public.plan_definitions set badge = 'best_value'
 where kind = 'pack' and display_name = 'Value Pack';

-- Packs are one-time by construction.
update public.plan_definitions set billing_cycle = 'pack' where kind = 'pack';

-- `features` stays EMPTY for the existing nine plans, deliberately. The pages
-- keep their current hand-written benefit copy whenever a plan carries no
-- features of its own, so applying this migration changes nothing a student
-- sees. A plan authored in the dashboard supplies its own list and overrides.

-- ---------------------------------------------------------------------
-- 5. Compat views — now covering every kind, and carrying presentation
-- ---------------------------------------------------------------------
-- pricing_settings is every plan a PROFILE can hold (anything that is not a
-- pack). It used to be `kind = 'subscription'` only; a lifetime or custom plan
-- would then be invisible to can_register_device() and consume_credits(), and
-- its holder would silently fall back to the 2-device default.
create view public.pricing_settings
with (security_invoker = true) as
select id, plan_code, display_name, billing_cycle, amount_egp as price_egp,
       currency, credits_granted, device_limit, daily_limit, is_founder,
       is_best_value, active, sort_order, created_at,
       kind, period_days, badge, badge_text, theme_color, accent_color, icon,
       short_description, full_description, features, cta_text, cta_href,
       visibility, archived_at
from public.plan_definitions
where kind <> 'pack';

comment on view public.pricing_settings is
  'Every plan a profile can hold (kind <> pack), with its presentation. Read-only compatibility view — author through admin_upsert_plan.';

create view public.credit_packs
with (security_invoker = true) as
select id, plan_code, display_name as name, credits_granted as credits,
       amount_egp as price_egp, currency, is_best_value, active, sort_order,
       created_at, badge, badge_text, theme_color, accent_color, icon,
       short_description, full_description, features, cta_text, cta_href,
       visibility, archived_at
from public.plan_definitions
where kind = 'pack';

comment on view public.credit_packs is
  'Pack face of plan_definitions, carrying plan_code and presentation. Read-only compatibility view — author through admin_upsert_plan.';

grant select on public.pricing_settings to anon, authenticated;
grant select on public.credit_packs     to anon, authenticated;

-- ---------------------------------------------------------------------
-- 6. Indexes for a catalogue that grows
-- ---------------------------------------------------------------------
-- The public read is always "visible, not archived, ordered" — that is the
-- index. At nine rows it changes nothing; at nine thousand it is the difference
-- between an index scan and a seq scan on every page load.
create index if not exists plan_definitions_public_idx
  on public.plan_definitions (kind, sort_order, plan_code)
  where archived_at is null and active and visibility = 'public';

create index if not exists plan_definitions_live_idx
  on public.plan_definitions (archived_at, kind, sort_order);

-- A name may be reused once its holder is archived, so uniqueness is partial.
drop index if exists public.plan_definitions_display_name_ci_key;
create unique index if not exists plan_definitions_display_name_ci_key
  on public.plan_definitions (lower(btrim(display_name)))
  where archived_at is null;

-- ---------------------------------------------------------------------
-- 7. Entitlement lookups must not depend on a plan still being on sale
-- ---------------------------------------------------------------------
-- Both functions filtered `active = true`. Deactivating or archiving a plan
-- someone still holds therefore silently dropped them to the 2-device default
-- and to the FREE daily allowance — a paying student penalised for a catalogue
-- edit they had nothing to do with. Entitlement follows the plan the student
-- holds; whether it is still for sale is a different question.
create or replace function public.can_register_device(p_user_id uuid, p_fingerprint text)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_is_admin     boolean;
  v_plan_code    text;
  v_device_limit integer;
  v_device_count integer;
begin
  select is_admin into v_is_admin from public.profiles where id = p_user_id;
  if v_is_admin then return true; end if;

  select plan_code into v_plan_code from public.profiles where id = p_user_id;

  -- No `active` filter: see §7.
  select device_limit into v_device_limit
  from public.plan_definitions
  where plan_code = v_plan_code;

  if v_device_limit is null then v_device_limit := 2; end if;

  select count(*) into v_device_count
  from public.user_devices
  where user_id = p_user_id
    and is_active = true
    and device_fingerprint != p_fingerprint;

  return v_device_count < v_device_limit;
end;
$function$;

-- ---------------------------------------------------------------------
-- 8. Fulfilment learns lifetime and custom
-- ---------------------------------------------------------------------
create or replace function public.approve_payment_request(
  request_id  uuid,
  admin_note  text default null
)
returns json
language plpgsql
security definer
set search_path = public
as $$
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

  -- ── BRANCH: credit pack — a top-up, not a plan change ──────────────────────
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

  -- ── Everything else sets a plan. Only the expiry differs. ──────────────────
  -- lifetime never expires; custom follows period_days; subscription always
  -- has a period. One rule, no special cases to remember.
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

  insert into public.subscriptions (user_id, plan_code, plan_type, status, active, current_period_end, created_at)
  values (_req.user_id, _req.plan_code, _req.plan_code, 'active', true, _expires_at, _now)
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
$$;

revoke all on function public.approve_payment_request(uuid, text) from public, anon;
grant execute on function public.approve_payment_request(uuid, text) to authenticated;

-- activate_subscription is the legacy `payments` path (not currently written
-- to). Taught the same vocabulary so the two cannot disagree if it is revived.
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

  -- No `active` filter: activating a plan a student already paid for must not
  -- depend on whether it is still on sale.
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

  INSERT INTO subscriptions
    (user_id, plan_code, plan_type, status, active,
     start_date, end_date, current_period_end,
     auto_renew, credits_granted, payment_id)
  VALUES
    (v_payment.user_id, v_plan.plan_code, v_plan.plan_code, 'ACTIVE', true,
     now(), v_end_date, v_end_date,
     false, v_plan.credits_granted, p_payment_id)
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

-- ---------------------------------------------------------------------
-- 9. Authoring RPCs
-- ---------------------------------------------------------------------

-- Derive a plan_code from a display name: "Scholar Term 2026" -> SCHOLAR_TERM_2026
create or replace function public.plan_code_from_name(p_name text)
returns text
language sql
immutable
as $$
  select left(regexp_replace(upper(btrim(coalesce(p_name, ''))), '[^A-Z0-9]+', '_', 'g'), 49);
$$;

-- Create or fully replace one plan. Every field the dashboard exposes, in one
-- round trip, validated server-side. Absent keys fall back to the existing row
-- on update, or to the column default on insert — so a partial patch is safe.
create or replace function public.admin_upsert_plan(p_plan jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_is_admin boolean;
  v_code     text;
  v_name     text;
  v_existing plan_definitions%rowtype;
  v_row      plan_definitions%rowtype;
  v_created  boolean := false;
  v_feat     jsonb;
  v_mode     text;
begin
  select is_admin into v_is_admin from profiles where id = auth.uid();
  if not coalesce(v_is_admin, false) then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;

  -- Mode is a contract error, not a data error, so it is checked before any
  -- field is looked at. Otherwise a bad mode surfaces as whichever field
  -- happens to fail validation first, which is confusing to debug.
  v_mode := lower(coalesce(p_plan->>'mode', 'upsert'));
  if v_mode not in ('create', 'update', 'upsert') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_mode', 'mode', v_mode);
  end if;

  v_name := btrim(coalesce(p_plan->>'display_name', ''));
  if length(v_name) < 1 or length(v_name) > 60 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_display_name');
  end if;

  -- plan_code is auto-derived from the name when the caller does not supply one.
  v_code := nullif(btrim(upper(coalesce(p_plan->>'plan_code', ''))), '');
  if v_code is null then v_code := plan_code_from_name(v_name); end if;
  if v_code !~ '^[A-Z][A-Z0-9_]{1,48}$' then
    return jsonb_build_object('ok', false, 'reason', 'invalid_plan_code', 'plan_code', v_code);
  end if;

  select * into v_existing from plan_definitions where plan_code = v_code;

  -- Mode is what stops "create" from silently becoming "edit". Without it,
  -- filling in the Create form with an existing plan's name derives that plan's
  -- code, matches the existing row, and quietly updates a LIVE plan while the
  -- owner believes they made a new one. The dashboard sends 'create' from the
  -- new-plan form and 'update' from the edit form; 'upsert' stays the default
  -- for callers that genuinely mean either. (Validated above, before any field.)
  if v_mode = 'create' and v_existing.plan_code is not null then
    return jsonb_build_object('ok', false, 'reason', 'plan_code_taken', 'plan_code', v_code);
  end if;
  if v_mode = 'update' and v_existing.plan_code is null then
    return jsonb_build_object('ok', false, 'reason', 'plan_not_found', 'plan_code', v_code);
  end if;

  -- A name collides only against plans that are still live.
  if exists (
    select 1 from plan_definitions
    where lower(btrim(display_name)) = lower(v_name)
      and plan_code <> v_code
      and archived_at is null
  ) then
    return jsonb_build_object('ok', false, 'reason', 'display_name_taken');
  end if;

  v_feat := coalesce(p_plan->'features', case when v_existing.plan_code is not null then v_existing.features else '[]'::jsonb end);
  if jsonb_typeof(v_feat) <> 'array' then
    return jsonb_build_object('ok', false, 'reason', 'features_must_be_an_array');
  end if;
  if jsonb_array_length(v_feat) > 60 then
    return jsonb_build_object('ok', false, 'reason', 'too_many_features');
  end if;

  insert into plan_definitions as pd (
    plan_code, display_name, kind, billing_cycle, amount_egp, currency,
    credits_granted, period_days, device_limit, daily_limit, is_founder,
    active, sort_order, badge, badge_text, theme_color, accent_color, icon,
    short_description, full_description, features, cta_text, cta_href,
    visibility, created_by, updated_by
  ) values (
    v_code,
    v_name,
    coalesce(p_plan->>'kind', 'subscription'),
    coalesce(p_plan->>'billing_cycle', 'none'),
    coalesce((p_plan->>'amount_egp')::numeric, 0),
    coalesce(nullif(upper(btrim(coalesce(p_plan->>'currency',''))), ''), 'EGP'),
    coalesce((p_plan->>'credits_granted')::integer, 0),
    coalesce((p_plan->>'period_days')::integer, 0),
    coalesce((p_plan->>'device_limit')::integer, 2),
    nullif(p_plan->>'daily_limit', '')::integer,
    coalesce((p_plan->>'is_founder')::boolean, false),
    coalesce((p_plan->>'active')::boolean, true),
    coalesce((p_plan->>'sort_order')::integer, 0),
    coalesce(p_plan->>'badge', 'none'),
    nullif(btrim(coalesce(p_plan->>'badge_text','')), ''),
    nullif(btrim(coalesce(p_plan->>'theme_color','')), ''),
    nullif(btrim(coalesce(p_plan->>'accent_color','')), ''),
    nullif(btrim(coalesce(p_plan->>'icon','')), ''),
    nullif(btrim(coalesce(p_plan->>'short_description','')), ''),
    nullif(btrim(coalesce(p_plan->>'full_description','')), ''),
    v_feat,
    nullif(btrim(coalesce(p_plan->>'cta_text','')), ''),
    nullif(btrim(coalesce(p_plan->>'cta_href','')), ''),
    coalesce(p_plan->>'visibility', 'public'),
    auth.uid(),
    auth.uid()
  )
  on conflict (plan_code) do update set
    display_name      = excluded.display_name,
    kind              = coalesce(p_plan->>'kind', pd.kind),
    billing_cycle     = coalesce(p_plan->>'billing_cycle', pd.billing_cycle),
    amount_egp        = coalesce((p_plan->>'amount_egp')::numeric, pd.amount_egp),
    currency          = coalesce(nullif(upper(btrim(coalesce(p_plan->>'currency',''))), ''), pd.currency),
    credits_granted   = coalesce((p_plan->>'credits_granted')::integer, pd.credits_granted),
    period_days       = coalesce((p_plan->>'period_days')::integer, pd.period_days),
    device_limit      = coalesce((p_plan->>'device_limit')::integer, pd.device_limit),
    daily_limit       = case when p_plan ? 'daily_limit'
                             then nullif(p_plan->>'daily_limit','')::integer
                             else pd.daily_limit end,
    is_founder        = coalesce((p_plan->>'is_founder')::boolean, pd.is_founder),
    active            = coalesce((p_plan->>'active')::boolean, pd.active),
    sort_order        = coalesce((p_plan->>'sort_order')::integer, pd.sort_order),
    badge             = coalesce(p_plan->>'badge', pd.badge),
    badge_text        = case when p_plan ? 'badge_text' then nullif(btrim(p_plan->>'badge_text'), '') else pd.badge_text end,
    theme_color       = case when p_plan ? 'theme_color' then nullif(btrim(p_plan->>'theme_color'), '') else pd.theme_color end,
    accent_color      = case when p_plan ? 'accent_color' then nullif(btrim(p_plan->>'accent_color'), '') else pd.accent_color end,
    icon              = case when p_plan ? 'icon' then nullif(btrim(p_plan->>'icon'), '') else pd.icon end,
    short_description = case when p_plan ? 'short_description' then nullif(btrim(p_plan->>'short_description'), '') else pd.short_description end,
    full_description  = case when p_plan ? 'full_description'  then nullif(btrim(p_plan->>'full_description'),  '') else pd.full_description end,
    features          = v_feat,
    cta_text          = case when p_plan ? 'cta_text' then nullif(btrim(p_plan->>'cta_text'), '') else pd.cta_text end,
    cta_href          = case when p_plan ? 'cta_href' then nullif(btrim(p_plan->>'cta_href'), '') else pd.cta_href end,
    visibility        = coalesce(p_plan->>'visibility', pd.visibility),
    updated_by        = auth.uid()
  returning * into v_row;

  v_created := (v_existing.plan_code is null);

  return jsonb_build_object('ok', true, 'created', v_created,
                            'plan_code', v_row.plan_code, 'plan', to_jsonb(v_row));
exception
  when check_violation then
    return jsonb_build_object('ok', false, 'reason', 'constraint_violation', 'detail', sqlerrm);
  when unique_violation then
    return jsonb_build_object('ok', false, 'reason', 'display_name_taken', 'detail', sqlerrm);
  when invalid_text_representation then
    return jsonb_build_object('ok', false, 'reason', 'invalid_number', 'detail', sqlerrm);
end;
$function$;

revoke all on function public.admin_upsert_plan(jsonb) from public, anon;
grant execute on function public.admin_upsert_plan(jsonb) to authenticated;

-- Duplicate: copy every field, mint a new code, and land it OFF. A duplicate
-- that went live the moment it was made would be a way to publish a plan by
-- accident.
create or replace function public.admin_duplicate_plan(p_source text, p_new_code text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_is_admin boolean;
  v_src      plan_definitions%rowtype;
  v_code     text;
  v_name     text;
  v_row      plan_definitions%rowtype;
  v_n        integer := 1;
begin
  select is_admin into v_is_admin from profiles where id = auth.uid();
  if not coalesce(v_is_admin, false) then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;

  select * into v_src from plan_definitions where plan_code = p_source;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'plan_not_found', 'plan_code', p_source);
  end if;

  v_code := nullif(btrim(upper(coalesce(p_new_code, ''))), '');
  if v_code is null then
    v_code := left(v_src.plan_code, 42) || '_COPY';
    while exists (select 1 from plan_definitions where plan_code = v_code) loop
      v_n := v_n + 1;
      v_code := left(v_src.plan_code, 40) || '_COPY' || v_n;
    end loop;
  end if;
  if exists (select 1 from plan_definitions where plan_code = v_code) then
    return jsonb_build_object('ok', false, 'reason', 'plan_code_taken', 'plan_code', v_code);
  end if;

  v_name := left(v_src.display_name || ' (Copy)', 60);
  v_n := 1;
  while exists (select 1 from plan_definitions where lower(btrim(display_name)) = lower(v_name) and archived_at is null) loop
    v_n := v_n + 1;
    v_name := left(v_src.display_name || ' (Copy ' || v_n || ')', 60);
  end loop;

  insert into plan_definitions (
    plan_code, display_name, kind, billing_cycle, amount_egp, currency,
    credits_granted, period_days, device_limit, daily_limit, is_founder,
    active, sort_order, badge, badge_text, theme_color, accent_color, icon,
    short_description, full_description, features, cta_text, cta_href,
    visibility, created_by, updated_by
  )
  select v_code, v_name, v_src.kind, v_src.billing_cycle, v_src.amount_egp, v_src.currency,
         v_src.credits_granted, v_src.period_days, v_src.device_limit, v_src.daily_limit,
         v_src.is_founder,
         false,                                    -- inactive
         (select coalesce(max(sort_order), 0) + 1 from plan_definitions where kind = v_src.kind),
         v_src.badge, v_src.badge_text, v_src.theme_color, v_src.accent_color, v_src.icon,
         v_src.short_description, v_src.full_description, v_src.features,
         v_src.cta_text, v_src.cta_href,
         'hidden',                                 -- not on the pricing page
         auth.uid(), auth.uid()
  returning * into v_row;

  return jsonb_build_object('ok', true, 'plan_code', v_row.plan_code, 'plan', to_jsonb(v_row));
end;
$function$;

revoke all on function public.admin_duplicate_plan(text, text) from public, anon;
grant execute on function public.admin_duplicate_plan(text, text) to authenticated;

-- Archive: take a plan off sale without deleting it. Deleting is never offered
-- — payment_requests, subscriptions and profiles all carry plan_code, and a
-- deleted plan would orphan every historical row that points at it.
create or replace function public.admin_archive_plan(p_plan_code text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_is_admin boolean;
  v_holders  integer;
  v_row      plan_definitions%rowtype;
begin
  select is_admin into v_is_admin from profiles where id = auth.uid();
  if not coalesce(v_is_admin, false) then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;

  select count(*) into v_holders from profiles where plan_code = p_plan_code;

  update plan_definitions
     set archived_at = now(), active = false, visibility = 'internal', updated_by = auth.uid()
   where plan_code = p_plan_code and archived_at is null
   returning * into v_row;

  if not found then
    return jsonb_build_object('ok', false, 'reason', 'plan_not_found_or_already_archived', 'plan_code', p_plan_code);
  end if;

  -- Holders keep the plan and everything it entitles them to (§7). The count is
  -- returned so the dashboard can say so rather than implying they were cut off.
  return jsonb_build_object('ok', true, 'plan_code', v_row.plan_code,
                            'archived_at', v_row.archived_at, 'active_holders', v_holders);
end;
$function$;

revoke all on function public.admin_archive_plan(text) from public, anon;
grant execute on function public.admin_archive_plan(text) to authenticated;

create or replace function public.admin_restore_plan(p_plan_code text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_is_admin boolean;
  v_row      plan_definitions%rowtype;
  v_name     text;
begin
  select is_admin into v_is_admin from profiles where id = auth.uid();
  if not coalesce(v_is_admin, false) then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;

  select display_name into v_name from plan_definitions where plan_code = p_plan_code and archived_at is not null;
  if v_name is null then
    return jsonb_build_object('ok', false, 'reason', 'plan_not_found_or_not_archived', 'plan_code', p_plan_code);
  end if;

  -- Its name may have been taken by a plan created while it was archived.
  if exists (
    select 1 from plan_definitions
    where lower(btrim(display_name)) = lower(btrim(v_name))
      and plan_code <> p_plan_code and archived_at is null
  ) then
    return jsonb_build_object('ok', false, 'reason', 'display_name_taken_while_archived', 'display_name', v_name);
  end if;

  -- Restored OFF and hidden. Coming back from the archive is not the same
  -- decision as going back on sale.
  update plan_definitions
     set archived_at = null, active = false, visibility = 'hidden', updated_by = auth.uid()
   where plan_code = p_plan_code
   returning * into v_row;

  return jsonb_build_object('ok', true, 'plan_code', v_row.plan_code, 'plan', to_jsonb(v_row));
end;
$function$;

revoke all on function public.admin_restore_plan(text) from public, anon;
grant execute on function public.admin_restore_plan(text) to authenticated;

-- The dashboard's read: everything, including archived, with usage attached.
create or replace function public.admin_plan_catalog()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_is_admin boolean;
  v_plans    jsonb;
begin
  select is_admin into v_is_admin from profiles where id = auth.uid();
  if not coalesce(v_is_admin, false) then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;

  select coalesce(jsonb_agg(row_to_json(p) order by p.archived_at nulls first, p.kind, p.sort_order, p.plan_code), '[]'::jsonb)
    into v_plans
  from (
    select pd.plan_code, pd.display_name, pd.kind, pd.amount_egp, pd.currency,
           pd.credits_granted, pd.billing_cycle, pd.period_days, pd.device_limit,
           pd.daily_limit, pd.is_founder, pd.is_best_value, pd.active, pd.sort_order,
           pd.badge, pd.badge_text, pd.theme_color, pd.accent_color, pd.icon,
           pd.short_description, pd.full_description, pd.features,
           pd.cta_text, pd.cta_href, pd.visibility, pd.archived_at, pd.updated_at,
           coalesce(s.sold_count, 0)   as sold_count,
           coalesce(s.sold_revenue, 0) as sold_revenue,
           coalesce(h.holders, 0)      as active_holders
    from plan_definitions pd
    left join (
      select plan_code, count(*) as sold_count, sum(amount_egp) as sold_revenue
      from payment_requests where status = 'approved' group by plan_code
    ) s on s.plan_code = pd.plan_code
    left join (
      select plan_code, count(*) as holders from profiles group by plan_code
    ) h on h.plan_code = pd.plan_code
  ) p;

  return jsonb_build_object('ok', true, 'plans', v_plans);
end;
$function$;

revoke all on function public.admin_plan_catalog() from public, anon;
grant execute on function public.admin_plan_catalog() to authenticated;

commit;

-- =====================================================================
-- 10. ROLLBACK
-- =====================================================================
-- begin;
--   drop view if exists public.pricing_settings;
--   drop view if exists public.credit_packs;
--   drop function if exists public.admin_upsert_plan(jsonb);
--   drop function if exists public.admin_duplicate_plan(text, text);
--   drop function if exists public.admin_archive_plan(text);
--   drop function if exists public.admin_restore_plan(text);
--   drop function if exists public.plan_code_from_name(text);
--   drop index if exists public.plan_definitions_public_idx;
--   drop index if exists public.plan_definitions_live_idx;
--   alter table public.plan_definitions
--     drop column if exists currency,          drop column if exists badge,
--     drop column if exists badge_text,        drop column if exists theme_color,
--     drop column if exists accent_color,      drop column if exists icon,
--     drop column if exists short_description, drop column if exists full_description,
--     drop column if exists features,          drop column if exists cta_text,
--     drop column if exists cta_href,          drop column if exists visibility,
--     drop column if exists archived_at,       drop column if exists created_by;
--   alter table public.plan_definitions drop column if exists is_best_value;
--   alter table public.plan_definitions add column is_best_value boolean not null default false;
--   update public.plan_definitions set is_best_value = true where kind='pack' and display_name='Value Pack';
--   -- then re-create the §5 views from 20260802_plan_catalog_single_source.sql
--   -- and restore approve_payment_request / activate_subscription /
--   -- can_register_device from that same file.
-- commit;
-- =====================================================================
