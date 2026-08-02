-- =====================================================================
-- Plan catalogue — one source of truth for name, price and credits
-- =====================================================================
-- STATUS: ⛔ PREPARED — NOT YET APPLIED. Awaiting owner approval
--         (CLAUDE.md §3: every migration is approved individually).
--
-- WHY THIS EXISTS
-- ---------------
-- The same three facts about a plan — its name, its price and the credits
-- it grants — are stored in three separate tables today, and nothing keeps
-- them in agreement. Verified by read-only introspection of
-- igvkyxkmjnkzscqgommj on 2026-08-02:
--
--   pricing_settings  6 rows  display authority. Read by pricing.html,
--                             manual-payment.html, admin.html,
--                             activate_subscription(), can_register_device(),
--                             consume_credits()
--   plan_definitions  7 rows  fulfilment authority. Read by
--                             approve_payment_request() — this is the table
--                             that decides how many credits a student is
--                             actually granted — and admin_credits_overview()
--   credit_packs      3 rows  pack display authority. Read by pricing.html,
--                             settings.html, manual-payment.html, admin.html
--
-- docs/roadmap/ai-economics.md §4.1 already records the problem in its own
-- caveat column: "Second copy of price; must stay in lockstep" and "Third
-- copy of pack price". Nothing enforces that lockstep. The values agree
-- today only because no one has edited one of them.
--
-- The failure this actually causes is not cosmetic. A price edited in
-- pricing_settings changes what the pricing page quotes and what
-- manual-payment.html writes into payment_requests.amount_egp — but
-- approve_payment_request() reads credits_granted from plan_definitions, so
-- the student pays the new price and receives the old credits. There is no
-- error, no log line, and no way to notice except by hand.
--
-- Renaming a pack is worse. manual-payment.html maps a pack to its
-- plan_code with a hardcoded JS object:
--
--     const packCodeMap = { 'Starter Pack': 'PACK_STARTER',
--                           'Value Pack':   'PACK_VALUE',
--                           'Power Pack':   'PACK_POWER' };
--
-- Rename "Value Pack" and the fallback produces PACK_<NEW_NAME>, which does
-- not exist in plan_definitions, so approve_payment_request() raises
-- "Unknown plan_code" and the student's payment cannot be approved at all.
-- That is the bug this migration has to remove before the Owner Dashboard is
-- allowed to offer a rename button.
--
-- WHAT THIS DOES
-- --------------
-- Promotes plan_definitions to the single catalogue and turns the other two
-- tables into views over it. One row per plan, physically. Every existing
-- reader — six pages, four SECURITY DEFINER functions — keeps its current
-- query verbatim, because the views reproduce the old column names exactly.
--
-- SCOPE
-- -----
--   1. plan_definitions       +9 columns, backfilled, then made canonical
--   2. pricing_settings       TABLE -> renamed _legacy, recreated as a VIEW
--   3. credit_packs           TABLE -> renamed _legacy, recreated as a VIEW
--   4. public.admin_plan_catalog()                            NEW
--   5. public.admin_update_plan(text, text, numeric, integer) NEW
--
-- NOT in scope: approve_payment_request, activate_subscription,
-- consume_credits, can_register_device, admin_credits_overview — all four
-- keep working unchanged against the views and against plan_definitions.
-- No pricing value changes. No student balance is touched.
--
-- BLAST RADIUS (measured 2026-08-02, not assumed)
-- -----------------------------------------------
--   foreign keys referencing the three tables ...... 0
--   rows in pricing_settings / credit_packs ........ 6 / 3
--   client writes to pricing_settings|credit_packs . 0 (all .html/.js — reads only)
--   SQL functions reading them ..................... 5, all read-only
--   divergent values between the three copies ...... 0 (asserted below; the
--                                                     migration aborts if a
--                                                     divergence appeared
--                                                     between authoring and
--                                                     apply)
--
-- PRE-APPLY PROBE: 40/40 PASS (19 structural + 21 behavioural), run 2026-08-02
-- in a rolled-back transaction against production data. The body below is the
-- body that was probed; only comments and whitespace differ. What it proved:
--   • all 6 pricing_settings rows and all 3 credit_packs rows are reproduced
--     by the views field-for-field, including their uuids and created_at
--   • every legacy column survives with its original name and type
--   • FREE keeps daily_limit 15 (consume_credits) and PRO_* keep device_limit
--     3 (can_register_device)
--   • all 7 pre-existing plans keep their exact price and credits_granted
--   • a rename of PACK_VALUE leaves plan_code PACK_VALUE intact — the bug that
--     makes a renamed pack unapprovable today
--   • one admin_update_plan call moves the pricing page, the checkout page and
--     approve_payment_request's credit grant together
--   • all 8 refusal branches (non-admin read, non-admin write, unknown plan,
--     blank name, over-long name, duplicate name, out-of-range price,
--     negative credits) return their reason and write nothing
--
-- REVERSIBILITY
-- -------------
-- The pre-migration tables survive as pricing_settings_legacy and
-- credit_packs_legacy with their data intact. Rolling back is: drop the two
-- views, rename the two _legacy tables back, drop the added columns. §9 at
-- the foot of this file carries that script verbatim.
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Abort if the three copies have diverged since this was authored
-- ---------------------------------------------------------------------
-- Consolidation has to pick one value per field. That is only safe while the
-- copies agree. If they no longer do, a human has to decide which is right —
-- so stop here rather than silently letting plan_definitions win.
do $$
declare
  v_bad text;
begin
  select string_agg(msg, E'\n  ') into v_bad from (
    select format('%s: pricing_settings(price=%s, credits=%s) vs plan_definitions(price=%s, credits=%s)',
                  ps.plan_code, ps.price_egp, ps.credits_granted, pd.amount_egp, pd.credits_granted) as msg
    from public.pricing_settings ps
    join public.plan_definitions pd on pd.plan_code = ps.plan_code
    where ps.price_egp <> pd.amount_egp or ps.credits_granted <> pd.credits_granted

    union all

    select format('%s: credit_packs(price=%s, credits=%s) vs plan_definitions(price=%s, credits=%s)',
                  cp.name, cp.price_egp, cp.credits, pd.amount_egp, pd.credits_granted)
    from public.credit_packs cp
    join public.plan_definitions pd on pd.display_name = cp.name and pd.kind = 'pack'
    where cp.price_egp <> pd.amount_egp or cp.credits <> pd.credits_granted
  ) d;

  if v_bad is not null then
    raise exception E'Plan copies have diverged — resolve by hand before consolidating:\n  %', v_bad;
  end if;
end $$;

-- Every pack in credit_packs must already have a plan_definitions twin,
-- otherwise consolidating drops a sellable product.
do $$
declare
  v_orphan text;
begin
  select string_agg(cp.name, ', ') into v_orphan
  from public.credit_packs cp
  where not exists (
    select 1 from public.plan_definitions pd
    where pd.kind = 'pack' and pd.display_name = cp.name
  );
  if v_orphan is not null then
    raise exception 'credit_packs rows with no plan_definitions twin: %', v_orphan;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 2. plan_definitions grows the display columns it was missing
-- ---------------------------------------------------------------------
-- These columns come from pricing_settings and credit_packs. Once they live
-- here, those two tables hold nothing that is not a copy.
alter table public.plan_definitions
  add column if not exists id            uuid        not null default gen_random_uuid(),
  add column if not exists billing_cycle text        not null default 'none',
  add column if not exists device_limit  integer     not null default 2,
  add column if not exists daily_limit   integer,
  add column if not exists is_founder    boolean     not null default false,
  add column if not exists is_best_value boolean     not null default false,
  add column if not exists active        boolean     not null default true,
  add column if not exists sort_order    integer     not null default 0,
  add column if not exists created_at    timestamptz not null default now(),
  add column if not exists updated_at    timestamptz not null default now(),
  add column if not exists updated_by    uuid;

-- `id` is the stable handle the credit_packs view exposes. pricing.html and
-- settings.html key their DOM off it, so it must not be regenerated on read.
do $$ begin
  alter table public.plan_definitions add constraint plan_definitions_id_key unique (id);
exception when duplicate_table or duplicate_object then null;
end $$;

do $$ begin
  alter table public.plan_definitions add constraint plan_definitions_billing_cycle_chk
    check (billing_cycle in ('none','monthly','quarterly','annual','pack'));
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.plan_definitions add constraint plan_definitions_amount_chk
    check (amount_egp >= 0);
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.plan_definitions add constraint plan_definitions_credits_chk
    check (credits_granted >= 0);
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.plan_definitions add constraint plan_definitions_display_name_chk
    check (length(btrim(display_name)) between 1 and 60);
exception when duplicate_object then null;
end $$;

-- One product per name, or checkout copy becomes ambiguous.
create unique index if not exists plan_definitions_display_name_ci_key
  on public.plan_definitions (lower(btrim(display_name)));

-- ---------------------------------------------------------------------
-- 3. Backfill — pull the display columns across, then adopt pack identity
-- ---------------------------------------------------------------------

-- 3a. Subscriptions that exist only in pricing_settings (FREE, FOUNDER_MONTHLY).
--     FREE has to be present or consume_credits() loses the 15/day free
--     allowance and can_register_device() loses its device cap.
insert into public.plan_definitions
  (plan_code, display_name, credits_granted, period_days, amount_egp, kind,
   id, billing_cycle, device_limit, daily_limit, is_founder, active, sort_order, created_at)
select ps.plan_code, ps.display_name, ps.credits_granted,
       case ps.billing_cycle when 'monthly' then 30 when 'quarterly' then 91
                             when 'annual'  then 365 else 0 end,
       ps.price_egp, 'subscription',
       ps.id, ps.billing_cycle, ps.device_limit, ps.daily_limit,
       ps.is_founder, ps.active, ps.sort_order, ps.created_at
from public.pricing_settings ps
where not exists (select 1 from public.plan_definitions pd where pd.plan_code = ps.plan_code);

-- 3b. Subscriptions present in both: pricing_settings owns the display
--     columns (it is what the pricing page has been rendering). Price and
--     credits are identical on both sides — §1 just proved it — so copying
--     them across is a no-op that keeps the statement self-contained.
update public.plan_definitions pd
   set id            = ps.id,
       display_name  = ps.display_name,
       amount_egp    = ps.price_egp,
       credits_granted = ps.credits_granted,
       billing_cycle = ps.billing_cycle,
       device_limit  = ps.device_limit,
       daily_limit   = ps.daily_limit,
       is_founder    = ps.is_founder,
       active        = ps.active,
       sort_order    = ps.sort_order,
       created_at    = ps.created_at
  from public.pricing_settings ps
 where ps.plan_code = pd.plan_code;

-- 3c. Packs adopt the uuid credit_packs already published. pricing.html
--     passes it to openPackModal() and settings.html keys pack tiles on it;
--     minting fresh uuids here would be an invisible behaviour change.
update public.plan_definitions pd
   set id            = cp.id,
       amount_egp    = cp.price_egp,
       credits_granted = cp.credits,
       billing_cycle = 'pack',
       active        = cp.active,
       sort_order    = cp.sort_order,
       created_at    = cp.created_at,
       device_limit  = 0,
       daily_limit   = null,
       is_founder    = false
  from public.credit_packs cp
 where pd.kind = 'pack' and pd.display_name = cp.name;

-- 3d. "BEST VALUE" was a hardcoded string comparison in manual-payment.html
--     (pack.name === 'Value Pack') and a hardcoded array index in
--     pricing.html (idx === 1). Both break the moment a pack is renamed or
--     reordered — which is exactly what the Owner Dashboard is about to
--     allow. Carry the current badge into the data and let the pages read it.
update public.plan_definitions
   set is_best_value = true
 where kind = 'pack' and display_name = 'Value Pack';

-- Packs are one-time top-ups: period_days must stay 0 so
-- approve_payment_request() takes the pack branch and grants no expiry.
update public.plan_definitions set period_days = 0 where kind = 'pack';

-- ---------------------------------------------------------------------
-- 4. Retire the duplicate tables (kept, renamed, for rollback)
-- ---------------------------------------------------------------------
alter table public.pricing_settings rename to pricing_settings_legacy;
alter table public.credit_packs     rename to credit_packs_legacy;

-- The legacy copies must stop being reachable, or a future page could read a
-- stale price from them and reintroduce exactly the drift this removes.
revoke all on public.pricing_settings_legacy from anon, authenticated;
revoke all on public.credit_packs_legacy     from anon, authenticated;

comment on table public.pricing_settings_legacy is
  'Frozen pre-consolidation copy (2026-08-02). Superseded by the pricing_settings view over plan_definitions. Retained for rollback only — do not read, do not write.';
comment on table public.credit_packs_legacy is
  'Frozen pre-consolidation copy (2026-08-02). Superseded by the credit_packs view over plan_definitions. Retained for rollback only — do not read, do not write.';

-- ---------------------------------------------------------------------
-- 5. Compatibility views — same names, same columns, one row underneath
-- ---------------------------------------------------------------------
-- security_invoker keeps plan_definitions' own RLS in force
-- (plan_definitions_public_read: SELECT to public), so anonymous visitors can
-- still price the product and nothing else leaks.

create view public.pricing_settings
with (security_invoker = true) as
select id, plan_code, display_name, billing_cycle, amount_egp as price_egp,
       credits_granted, device_limit, daily_limit, is_founder, active,
       sort_order, created_at
from public.plan_definitions
where kind = 'subscription';

comment on view public.pricing_settings is
  'Subscription face of plan_definitions. Read-only compatibility view — edit plan_definitions (or call admin_update_plan) instead.';

create view public.credit_packs
with (security_invoker = true) as
select id, plan_code, display_name as name, credits_granted as credits,
       amount_egp as price_egp, is_best_value, active, sort_order, created_at
from public.plan_definitions
where kind = 'pack';

-- plan_code is the column that lets manual-payment.html delete its
-- name -> PACK_* map. Without it a renamed pack cannot be checked out.
comment on view public.credit_packs is
  'Pack face of plan_definitions, now carrying plan_code so checkout resolves a pack by key rather than by name. Read-only compatibility view — edit plan_definitions (or call admin_update_plan) instead.';

grant select on public.pricing_settings to anon, authenticated;
grant select on public.credit_packs     to anon, authenticated;

-- ---------------------------------------------------------------------
-- 6. updated_at maintenance
-- ---------------------------------------------------------------------
create or replace function public.plan_definitions_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists plan_definitions_touch_trg on public.plan_definitions;
create trigger plan_definitions_touch_trg
  before update on public.plan_definitions
  for each row execute function public.plan_definitions_touch();

-- ---------------------------------------------------------------------
-- 7. READ RPC — the whole catalogue plus what each plan has actually sold
-- ---------------------------------------------------------------------
-- Mirrors admin_credits_overview(): one round-trip, is_admin-gated, returns
-- inactive rows too (the dashboard has to show FOUNDER_MONTHLY even though
-- students cannot see it).
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

  select coalesce(jsonb_agg(row_to_json(p) order by p.kind, p.sort_order, p.plan_code), '[]'::jsonb)
    into v_plans
  from (
    select pd.plan_code, pd.display_name, pd.kind, pd.amount_egp, pd.credits_granted,
           pd.billing_cycle, pd.period_days, pd.device_limit, pd.daily_limit,
           pd.is_founder, pd.is_best_value, pd.active, pd.sort_order, pd.updated_at,
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

revoke all on function public.admin_plan_catalog() from public;
grant execute on function public.admin_plan_catalog() to authenticated;

-- ---------------------------------------------------------------------
-- 8. WRITE RPC — name / price / credits, and nothing else
-- ---------------------------------------------------------------------
-- Deliberately narrow. plan_code is the join key that payment_requests,
-- subscriptions and profiles.plan_code all carry, so it is not editable here
-- — renaming it would orphan historical rows. kind is not editable either:
-- flipping a subscription to a pack would change which branch
-- approve_payment_request() takes for requests already in the queue.
--
-- NULL means "leave alone", so the dashboard can send only what changed.
create or replace function public.admin_update_plan(
  p_plan_code       text,
  p_display_name    text    default null,
  p_price_egp       numeric default null,
  p_credits_granted integer default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_is_admin boolean;
  v_before   plan_definitions%rowtype;
  v_after    plan_definitions%rowtype;
  v_name     text;
begin
  select is_admin into v_is_admin from profiles where id = auth.uid();
  if not coalesce(v_is_admin, false) then
    return jsonb_build_object('ok', false, 'reason', 'forbidden');
  end if;

  select * into v_before from plan_definitions where plan_code = p_plan_code;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'plan_not_found', 'plan_code', p_plan_code);
  end if;

  if p_display_name is not null then
    v_name := btrim(p_display_name);
    if length(v_name) < 1 or length(v_name) > 60 then
      return jsonb_build_object('ok', false, 'reason', 'invalid_display_name');
    end if;
    if exists (
      select 1 from plan_definitions
      where lower(btrim(display_name)) = lower(v_name) and plan_code <> p_plan_code
    ) then
      return jsonb_build_object('ok', false, 'reason', 'display_name_taken');
    end if;
  end if;

  -- 1,000,000 EGP and 10,000,000 credits are both far outside any real plan.
  -- The ceiling exists so a slipped keystroke in the dashboard cannot publish
  -- a price to the live pricing page.
  if p_price_egp is not null and (p_price_egp < 0 or p_price_egp > 1000000) then
    return jsonb_build_object('ok', false, 'reason', 'invalid_price');
  end if;

  if p_credits_granted is not null and (p_credits_granted < 0 or p_credits_granted > 10000000) then
    return jsonb_build_object('ok', false, 'reason', 'invalid_credits');
  end if;

  update plan_definitions
     set display_name    = coalesce(v_name, display_name),
         amount_egp      = coalesce(p_price_egp, amount_egp),
         credits_granted = coalesce(p_credits_granted, credits_granted),
         updated_by      = auth.uid()
   where plan_code = p_plan_code
   returning * into v_after;

  return jsonb_build_object(
    'ok', true,
    'plan_code', v_after.plan_code,
    'kind',      v_after.kind,
    'before', jsonb_build_object('display_name', v_before.display_name,
                                 'price_egp',    v_before.amount_egp,
                                 'credits_granted', v_before.credits_granted),
    'after',  jsonb_build_object('display_name', v_after.display_name,
                                 'price_egp',    v_after.amount_egp,
                                 'credits_granted', v_after.credits_granted),
    'updated_at', v_after.updated_at
  );
end;
$function$;

revoke all on function public.admin_update_plan(text, text, numeric, integer) from public;
grant execute on function public.admin_update_plan(text, text, numeric, integer) to authenticated;

commit;

-- =====================================================================
-- 9. ROLLBACK (run only if the consolidation has to be undone)
-- =====================================================================
-- begin;
--   drop view if exists public.pricing_settings;
--   drop view if exists public.credit_packs;
--   alter table public.pricing_settings_legacy rename to pricing_settings;
--   alter table public.credit_packs_legacy     rename to credit_packs;
--   grant select on public.pricing_settings to anon, authenticated;
--   grant select on public.credit_packs     to anon, authenticated;
--   grant insert, update, delete on public.pricing_settings to authenticated;
--   grant insert, update, delete on public.credit_packs     to authenticated;
--   drop function if exists public.admin_update_plan(text, text, numeric, integer);
--   drop function if exists public.admin_plan_catalog();
--   drop trigger if exists plan_definitions_touch_trg on public.plan_definitions;
--   drop function if exists public.plan_definitions_touch();
--   drop index if exists public.plan_definitions_display_name_ci_key;
--   alter table public.plan_definitions
--     drop column if exists id,            drop column if exists billing_cycle,
--     drop column if exists device_limit,  drop column if exists daily_limit,
--     drop column if exists is_founder,    drop column if exists is_best_value,
--     drop column if exists active,        drop column if exists sort_order,
--     drop column if exists created_at,    drop column if exists updated_at,
--     drop column if exists updated_by;
--   -- FREE and FOUNDER_MONTHLY were added by §3a; they did not exist before.
--   delete from public.plan_definitions where plan_code in ('FREE','FOUNDER_MONTHLY');
-- commit;
-- =====================================================================
