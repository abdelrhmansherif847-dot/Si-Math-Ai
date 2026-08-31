-- =====================================================================
-- Teacher Partner Program — 2 of 4: the engine
-- =====================================================================
-- STATUS: 🟡 PREPARED — NOT APPLIED. Dry-run only.
-- DEPENDS ON: 20260831b
--
-- ONE MECHANISM, NOT TWO
-- ----------------------
-- The platform has two payment paths that share no table:
--
--   approve_payment_request()            -> payment_requests
--   admin-actions/create_and_approve     -> payments -> activate_subscription()
--                                                    -> activate_credit_pack()
--
-- Hooking commission logic into both would mean two copies of the rule, and a
-- third path added later would silently earn nobody anything. Instead both
-- paths write ONE canonical event, and a trigger on that event is the only
-- thing that ever awards a commission.
--
--   payment path  ──> record_purchase_event()  ──> purchase_events
--                                                        │
--                                              AFTER INSERT trigger
--                                                        ▼
--                                          referral_award_from_event()
--
-- A future payment path participates by adding one line. It cannot participate
-- incorrectly, because it does not compute anything.
--
-- NOTHING HERE MAY BREAK A PAYMENT
-- --------------------------------
-- Both functions wrap their work in an exception block. A commission is an
-- accounting row; a student's plan activating is the thing they paid for. If
-- the engine fails, the purchase still completes and the reason is written to
-- referral_award_skips. Because UNIQUE(source_kind, source_id) makes replay
-- safe, an admin can re-run a missed award later without risking a double.
-- =====================================================================

begin;

-- ── the award ────────────────────────────────────────────────────────────
create or replace function referral_award_from_event()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  v_attr      referral_attributions%rowtype;
  v_is_first  boolean;
  v_n         int;
  v_rate      referral_commission_rates%rowtype;
  v_amount    numeric(12,2);
begin
  begin
    -- (1) FIRST PURCHASE? Counted over purchase_events, which is the only
    --     table that sees both payment paths. A purchase with an unpriceable
    --     plan still counts here: it happened, so it is not "first" any more.
    select count(*) = 1 into v_is_first
      from purchase_events where user_id = new.user_id;

    if not v_is_first then
      insert into referral_award_skips (user_id, source_kind, source_id, reason, detail)
      values (new.user_id, new.source_kind, new.source_id, 'not_first_purchase',
              jsonb_build_object('event_id', new.id));
      return new;
    end if;

    -- (2) The first purchase LOCKS the attribution, whether or not it pays a
    --     commission. "Once the student completes their first successful paid
    --     purchase, attribution becomes permanently bound to that teacher."
    perform set_config('si.referral_rpc', 'on', true);
    update referral_attributions
       set locked_at = now(), locked_reason = 'first_purchase'
     where student_user_id = new.user_id and locked_at is null;
    perform set_config('si.referral_rpc', 'off', true);

    -- (3) Was this student referred at all? The ordinary answer is no, and it
    --     is not worth a diagnostic row.
    select * into v_attr from referral_attributions where student_user_id = new.user_id;
    if not found then return new; end if;

    -- (4) A price we can stand behind, or nothing.
    if new.gross_egp is null or new.gross_egp <= 0 then
      insert into referral_award_skips (user_id, source_kind, source_id, reason, detail)
      values (new.user_id, new.source_kind, new.source_id, 'no_authoritative_price',
              jsonb_build_object('plan_code', new.plan_code, 'event_id', new.id));
      return new;
    end if;

    -- (5) Partner eligibility is the teacher role that already exists: an
    --     ACTIVE staff row with staff_role = 'teacher'. No new role, and no
    --     rung on user_role.
    if not exists (
      select 1 from workspace_staff s
      join teacher_workspaces w on w.id = s.workspace_id
      where s.user_id = v_attr.teacher_user_id
        and s.staff_role = 'teacher' and s.status = 'active' and w.is_active
    ) then
      insert into referral_award_skips (user_id, source_kind, source_id, reason, detail)
      values (new.user_id, new.source_kind, new.source_id, 'teacher_not_active',
              jsonb_build_object('teacher_user_id', v_attr.teacher_user_id));
      return new;
    end if;

    -- (6) Tier, from the count INCLUDING this award: the 10th paid student is
    --     charged at 12.5%, which is what "10-29" means. Reversed rows do not
    --     count, so a reversal genuinely undoes the progress it created.
    select count(*) + 1 into v_n
      from referral_commissions
     where teacher_user_id = v_attr.teacher_user_id and status <> 'reversed';

    select * into v_rate from referral_commission_rates
     where min_paid_students <= v_n
       and (max_paid_students is null or max_paid_students >= v_n);

    if not found then
      insert into referral_award_skips (user_id, source_kind, source_id, reason, detail)
      values (new.user_id, new.source_kind, new.source_id, 'no_rate_band',
              jsonb_build_object('n', v_n));
      return new;
    end if;

    -- (7) numeric, half-up, two places. 349 * 1250 / 10000 = 43.625 -> 43.63.
    v_amount := round(new.gross_egp * v_rate.rate_bps / 10000.0, 2);

    insert into referral_commissions (
      student_user_id, teacher_user_id, purchase_event_id,
      source_kind, source_id, plan_code,
      gross_egp, rate_bps, tier_label, paid_count_at_award, commission_egp)
    values (
      new.user_id, v_attr.teacher_user_id, new.id,
      new.source_kind, new.source_id, new.plan_code,
      new.gross_egp, v_rate.rate_bps, v_rate.label, v_n, v_amount)
    on conflict do nothing;

    return new;

  exception when others then
    -- A failed commission must never fail a payment.
    insert into referral_award_skips (user_id, source_kind, source_id, reason, detail)
    values (new.user_id, new.source_kind, new.source_id, 'exception',
            jsonb_build_object('sqlstate', sqlstate, 'message', sqlerrm));
    return new;
  end;
end;
$$;

comment on function referral_award_from_event() is
  'The ONLY thing that creates a commission. Fires on purchase_events, which '
  'both payment paths write, so a commission cannot be skipped depending on '
  'which path was used. Catches every exception into referral_award_skips: a '
  'student''s plan must activate whatever the accounting does.';

drop trigger if exists referral_award_trg on purchase_events;
create trigger referral_award_trg
  after insert on purchase_events
  for each row execute function referral_award_from_event();

-- ── the one line every payment path calls ────────────────────────────────
create or replace function record_purchase_event(
  p_source_kind text, p_source_id uuid, p_user_id uuid, p_plan_code text)
returns void
language plpgsql
volatile
security definer
set search_path = pg_catalog, public
as $$
declare
  v_plan plan_definitions%rowtype;
begin
  begin
    -- The price comes from the catalogue, server-side, and from nowhere else.
    -- NOT payment_requests.amount_egp, which is a direct client insert with no
    -- trigger and no CHECK; NOT payments.amount_egp, which an admin types into
    -- a form. Five legacy payments carry free-text reference_ids ("Simath"),
    -- so a miss here is expected and is recorded as an unpriceable purchase
    -- rather than guessed at.
    select * into v_plan from plan_definitions where plan_code = p_plan_code;

    insert into purchase_events (user_id, source_kind, source_id, plan_code, plan_kind, gross_egp)
    values (p_user_id, p_source_kind, p_source_id, p_plan_code, v_plan.kind, v_plan.amount_egp)
    on conflict (source_kind, source_id) do nothing;

  exception when others then
    insert into referral_award_skips (user_id, source_kind, source_id, reason, detail)
    values (p_user_id, p_source_kind, p_source_id, 'record_event_exception',
            jsonb_build_object('sqlstate', sqlstate, 'message', sqlerrm));
  end;
end;
$$;

comment on function record_purchase_event(text, uuid, uuid, text) is
  'The single line a payment path adds to participate in the partner program. '
  'Resolves the authoritative price itself, so no caller can pass a wrong one '
  '— there is no amount parameter, by design.';

-- ── history, so an existing customer is not somebody''s "first purchase" ──
/* Without this, a student who has been paying since June could be attributed
   tomorrow and their NEXT purchase would look like a first purchase. The
   backfill makes every past purchase visible to the first-purchase test.
   gross_egp resolves where the plan_code is real and stays NULL where it is
   not — five legacy rows carry labels rather than codes. */
insert into purchase_events (user_id, source_kind, source_id, plan_code, plan_kind, gross_egp, occurred_at)
select pr.user_id, 'payment_request', pr.id, pr.plan_code, pd.kind, pd.amount_egp,
       coalesce(pr.reviewed_at, pr.created_at)
  from payment_requests pr
  left join plan_definitions pd on pd.plan_code = pr.plan_code
 where pr.status = 'approved'
on conflict (source_kind, source_id) do nothing;

insert into purchase_events (user_id, source_kind, source_id, plan_code, plan_kind, gross_egp, occurred_at)
select p.user_id, 'payment', p.id, p.reference_id, pd.kind, pd.amount_egp, p.created_at
  from payments p
  left join plan_definitions pd on pd.plan_code = p.reference_id
 where p.status = 'COMPLETED'
on conflict (source_kind, source_id) do nothing;

/* The backfill fires the award trigger, which is correct and harmless: no
   referral_attributions row exists yet for anybody, so every historical event
   skips at step (3) and awards nothing. Applying b and c before any teacher
   has a code is therefore the safe order, and is the intended one. */

commit;
