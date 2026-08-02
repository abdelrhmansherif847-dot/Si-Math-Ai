# Subscription writer backlog

Defects in the functions that create or update `public.subscriptions`, found
while fixing `subscriptions_plan_type_check` on 2026-08-02 and **deliberately
not fixed there**. Each is independently actionable and carries its own
evidence; neither is a follow-up to the other, and neither reopens the
`plan_type` work (`20260802184704`, closed).

Why a separate file: `infrastructure-backlog.md` is platform and deployment
work. These are billing-logic defects in application functions, and filing them
there would blur what that file is for.

**Scope of what is already fixed, so nobody re-litigates it:** every writer of
`subscriptions.plan_type` now produces a value the CHECK constraint permits. See
`supabase/migrations/20260802g_subscriptions_plan_type_mapping.sql`. Neither
item below is a `plan_type` problem.

---

## SUB-1 — `activate_subscription` cannot activate a user twice

**Status:** `OPEN` · **Severity:** high — this path is live
**Found:** 2026-08-02, in a rolled-back rehearsal of the `plan_type` fix

### The defect

`public.subscriptions` carries `UNIQUE (user_id)` — one row per user, forever.
`activate_subscription()` expires the old row and then **INSERTs a new one**:

```sql
UPDATE subscriptions
SET status = 'EXPIRED', active = false, updated_at = now()
WHERE user_id = v_payment.user_id AND status = 'ACTIVE';

INSERT INTO subscriptions (user_id, plan_code, plan_type, ...)
VALUES (...);                       -- no ON CONFLICT
```

The UPDATE changes a status; it does not remove the row. The unique index is on
`user_id` alone and does not care about status, so the INSERT collides with the
row that was just expired:

```
duplicate key value violates unique constraint "subscriptions_user_id_unique"
```

**Any user who already has a subscriptions row cannot be activated through this
function.** First activation succeeds; every subsequent one — a renewal, an
upgrade, a re-subscribe after lapsing — fails.

### Evidence

Observed directly. Driving `activate_subscription` once per plan against a
single user, 1 of 8 succeeded and 7 failed on the unique constraint; isolating
each iteration with a `DELETE` first made all 8 pass. That difference *is* the
bug — the function only works against a user who has never had a subscription.

`approve_payment_request()` writes the same table correctly, which is the
clearest statement of the intended shape:

```sql
insert into public.subscriptions (...)
values (...)
on conflict (user_id) do update
  set plan_code = excluded.plan_code, ...
```

### Why it is live, not theoretical

`activate_subscription` is not client-callable
(`has_function_privilege('authenticated', …) = false`), which made it look
dormant. It is not. The `admin-actions` Edge Function (platform version 15,
ACTIVE) calls it with the service-role key at two sites:

- `action === 'activate_subscription'` — marks a PENDING payment COMPLETED, then
  calls the RPC (`supabase/functions/admin-actions/index.ts:124`)
- the manual-approval branch — creates a COMPLETED payment, then dispatches to
  `activate_subscription` for `payment_type === 'SUBSCRIPTION'` (line 183)

`payments` holds 5 rows, all COMPLETED, so the input path is real.

It has not bitten yet because the two approval paths have not overlapped on one
user: `approve_payment_request` (the manual-payment flow, which upserts
correctly) has been the one in use. The first renewal through `admin-actions`
will fail.

### Fix sketch

Mirror `approve_payment_request`: `on conflict (user_id) do update`. Note the
two functions also disagree on case — `activate_subscription` writes
`status = 'ACTIVE'` and `'EXPIRED'`, `approve_payment_request` writes
`'active'`. Anything filtering on status has to know which wrote the row. Worth
settling in the same change, but **check for readers first** — `pricing.html`
filters `.eq('status','active')` (lowercase), so rows written by
`activate_subscription` are already invisible to it.

That last point deserves its own look: it may mean the two paths have been
producing rows the pricing page treats differently all along.

---

## SUB-2 — `activate_pro_subscription` persists no `plan_code`

**Status:** `OPEN` · **Severity:** low — no caller, no rows produced
**Found:** 2026-08-02, same review

### The defect

```sql
INSERT INTO public.subscriptions
  (user_id, plan_type, active, status, start_date, end_date,
   current_period_end, credits_remaining)
VALUES
  (p_user_id, 'PRO_MONTHLY', true, 'active', now(), v_end, v_end, 0);
```

`plan_code` is absent from the column list, so a row created here has
`plan_code = NULL` and only the legacy `plan_type` category. Every reader in the
platform keys on `plan_code` — `pricing.html` selects
`plan_code,plan_type,current_period_end,auto_renew` and uses `plan_code`;
`consume_credits` resolves the daily limit from `profiles.plan_code`. A row with
a category and no code is invisible to all of them.

The same function updates `profiles.plan = 'pro'` — the pre-Plan-Catalog column
— and not `profiles.plan_code`, so the profile side has the same gap.

### Why it is low severity

**Nothing calls it.** Verified 2026-08-02 across every surface:

| Surface | Result |
|---|---|
| SQL functions | none reference it |
| Edge Functions (`ai-tutor`, `admin-actions`) | none |
| Shipped frontend (`*.html`, `*.js`) | none |
| `authenticated` EXECUTE | false |

And the data agrees: `subscriptions` holds **0 rows with a NULL `plan_code`**,
so this function has never produced one.

It is dead code that predates Plan Catalog V2 — it hardcodes a plan
(`'PRO_MONTHLY'`) and takes a month count rather than a `plan_code`, which is
the shape the catalogue replaced.

### Fix sketch

Two honest options, and the choice is a product decision rather than a technical
one:

1. **Drop it.** No caller, no rows, superseded by `approve_payment_request` and
   `activate_subscription`. Removing dead billing code is worth more than
   repairing it.
2. **Repair it** — take a `plan_code`, write `plan_code` and
   `profiles.plan_code`, route `plan_type` through `legacy_plan_type()` — if
   there is a real need for a "grant N months of Pro" admin action. If so, note
   that SUB-1's INSERT-vs-UPSERT problem applies here too: this function has the
   same shape.

**Do not simply add `plan_code` to the INSERT.** That would leave a hardcoded
`'PRO_MONTHLY'` in a system whose whole point is that plans are authored, and
make a dead function look maintained.

---

## Not defects, recorded so they are not re-investigated

- **`activate_pro_subscription` writing the literal `'PRO_MONTHLY'` into
  `plan_type`.** Valid — it is one of the six values the CHECK permits. An
  earlier note in this session called it "the same latent bug" as
  `approve_payment_request`; that was wrong, and `20260802g` now asserts the
  literal stays valid so the claim is enforced rather than trusted.
- **`approve_payment_request` refusing FREE** with *"period_days = 0; it cannot
  be approved without a period"*. Correct and intentional: nothing is paid for
  FREE, so no checkout creates a request for it.
