# Plan Catalog V2 — the plan as a record

**Status:** ✅ **Complete and live.** Applied to `igvkyxkmjnkzscqgommj` and
deployed to production on 2026-08-02.
**Audience:** anyone changing how a plan is priced, presented, sold or retired.

Every figure here was measured against the live project or the repository on
2026-08-02, not recalled. Where a claim could not be verified, it says so.

---

## 1. The one-paragraph version

A plan is a **row**, not a code change. `public.plan_definitions` holds
everything about it — what it is called, what it costs, what it grants, and how
it looks on the site. The Owner Dashboard writes that row through four guarded
RPCs. Every page reads it. **Creating a plan requires no frontend change, no
backend change and no deployment.**

---

## 2. How it got here

| Stage | What was true | What was still wrong |
|---|---|---|
| Before 2026-08-02 | Name, price and credits lived in **three tables** (`pricing_settings`, `plan_definitions`, `credit_packs`) with nothing enforcing agreement | A price edited in one meant the student **paid the new price and received the old credits**, silently. Renaming a pack made its payments unapprovable |
| `20260802_plan_catalog_single_source` | `plan_definitions` became the sole catalogue; the other two became **views** over it | A plan's badge, colour, icon, copy, features and CTA were still written into the pages, so creating one still meant editing code |
| `20260802b_plan_rpc_grant_hygiene` | The two new RPCs stopped being `anon`-executable | — |
| `20260802d_plan_catalog_v2_authoring` | The whole presentation surface moved onto the row | **Complete** |

---

## 3. The table

`public.plan_definitions`, primary key `plan_code`.

### 3.1 Identity and commerce

| Column | Notes |
|---|---|
| `plan_code` | **Immutable.** The join key `payment_requests`, `subscriptions` and `profiles.plan_code` all carry. `^[A-Z][A-Z0-9_]{1,48}$`. Auto-derived from the name when not supplied |
| `display_name` | 1–60 chars. Unique **among unarchived plans only**, so a name frees up when its holder is archived |
| `kind` | `subscription` · `pack` · `lifetime` · `custom` |
| `billing_cycle` | `none` · `monthly` · `quarterly` · `semiannual` · `annual` · `one_time` · `pack` · `custom` |
| `period_days` | Days of access. **Authoritative over the named cycle** — a custom plan can be any length |
| `amount_egp`, `currency` | See §7 on currency |
| `credits_granted`, `device_limit`, `daily_limit` | Entitlements |
| `is_founder` | Consumes a Founder slot on approval |
| `active`, `sort_order` | On sale; display order |

### 3.2 Presentation

`badge` (`none`/`best_value`/`most_popular`/`new`/`limited`/`custom`),
`badge_text`, `theme_color`, `accent_color` (both `#RRGGBB` or null), `icon`,
`short_description`, `full_description`, `features` (jsonb array), `cta_text`,
`cta_href`.

`is_best_value` is **GENERATED** from `badge = 'best_value'`. It cannot be
written directly and therefore cannot disagree with the badge — it used to be a
separate boolean, which is two fields for one fact.

### 3.3 Lifecycle

`visibility` (`public`/`hidden`/`internal`), `archived_at`, `created_by`,
`updated_by`, `created_at`, `updated_at`.

A plan reaches a public page only when **`active` AND `visibility = 'public'`
AND `archived_at IS NULL`**. `hidden` is reachable by direct link
(`?plan=CODE`) but unlisted; `internal` is dashboard-only.

### 3.4 Why features are jsonb, not a child table

A feature list is never read without its plan and never queried across plans. A
child table would add a join to every catalogue read and a second write to every
save, in exchange for nothing. Ordering is array order, which is what the
reorder control manipulates directly. Capped at 60 per plan.

---

## 4. The write path

Four RPCs, all `SECURITY DEFINER`, all gated on `profiles.is_admin`, none
executable by `anon`.

| RPC | Contract |
|---|---|
| `admin_upsert_plan(jsonb)` | Create or edit. **Requires an explicit `mode`**: `create` refuses an existing code, `update` refuses a missing one, `upsert` allows either. Absent keys keep their current value, so a partial patch is safe |
| `admin_duplicate_plan(text, text)` | Copies every field. Lands **inactive and hidden** — a duplicate that went live on creation would be a way to publish a plan by accident |
| `admin_archive_plan(text)` | Off sale, off every public page. **Never deletes** — `payment_requests`, `subscriptions` and `profiles` all carry `plan_code`, and deleting would orphan history. Returns the holder count |
| `admin_restore_plan(text)` | Un-archives **inactive and hidden**. Refuses if the name was taken while archived |

`admin_plan_catalog()` is the dashboard read: every plan including archived,
with units sold, revenue and current holders.

### 4.1 The mode contract exists because of a real defect

The pre-apply probe caught it. Without `mode`, typing an existing plan's name
into the Create form derived that plan's code, matched the existing row, and
**silently updated a live plan** while the owner believed they had created a new
one. `mode` is validated before any other field, so a bad mode cannot surface as
an unrelated field error.

---

## 5. The read path

```
plan_definitions ──┬─ view pricing_settings  (kind <> 'pack')
                   └─ view credit_packs      (kind =  'pack')
                          │
                   plan-catalog.js ── every page
```

Both views are `security_invoker`, so `plan_definitions`' own RLS applies.

`pricing_settings` covers **every non-pack kind**, not just `subscription`. It
was `kind = 'subscription'` only, which would have made a lifetime or custom
plan invisible to `can_register_device()` and `consume_credits()` — its holder
silently dropped to the 2-device default.

`plan-catalog.js` is the client module. It walks three column sets newest-first
(`V2` → `V1` → legacy), so a page renders against whichever migration the
database has actually had applied. It holds **no fallback table of plan names**:
an unloaded catalogue derives a label from the plan code (`PRO_MONTHLY` → "Pro
Monthly"), because a derivation cannot drift from the database.

It is also the **single definition of the billing-cycle vocabulary** —
`periodLabel`, `monthsIn`, `cycleDays`, `CYCLE_DAYS`. See §8.

### 5.1 Who consumes what

| Surface | Reads | Gets from the row |
|---|---|---|
| Pricing page | `pricing_settings`, `credit_packs` | Badge, icon, colours, both descriptions, feature list, CTA, currency, cycle |
| Checkout (`manual-payment.html`) | same | Badge, icon, short description, features, price, cycle, `plan_code` |
| Settings | `credit_packs` | Pack name, credits, price, currency, icon |
| Dashboard / Profile | `plan-catalog.js` | Plan name; paid-vs-free decided by **price**, not a code prefix |
| Devices / Login | `plan-catalog.js` | `device_limit`, plan name |
| Focus (D1/D2 gate) | `plan-catalog.js` | Eligibility = "a subscription with a price" |
| Admin | `admin_plan_catalog()` | Everything, including archived |
| Fulfilment | `plan_definitions` | `kind`, `credits_granted`, `period_days`, `is_founder` |

---

## 6. Fulfilment

`approve_payment_request()` branches on one rule rather than a case per kind:

- `kind = 'pack'` → one-time top-up to `pack_credits`, no plan change
- **one-time** = `kind = 'lifetime'`, or `kind = 'custom'` with `period_days = 0`
  → sets `plan_code`, grants credits, `subscription_expires_at = NULL`.
  `consume_credits` only expires a subscription when `expires_at IS NOT NULL`,
  so NULL already means "never expires"
- everything else → sets `plan_code` with an expiry of `period_days`

A subscription with `period_days = 0` is **refused** at approval rather than
granting an already-expired plan.

### 6.1 Entitlement follows the plan the student holds

`can_register_device()` and `activate_subscription()` used to filter
`active = true`. Deactivating or archiving a plan someone still held therefore
dropped them to the 2-device default — a paying student penalised for a
catalogue edit they had nothing to do with. Both now look the plan up by
`plan_code` alone. **Archiving is safe for existing holders by construction.**

---

## 7. Currency is quoted, not settled

Each plan stores an ISO-4217 code and the pages format against it. It does
**not** convert, and it does **not** change fulfilment: `payment_requests.amount_egp`,
the revenue panels and the whole `econ` schema remain EGP-denominated.

A non-EGP plan is **quoted** in its currency and **settled** in EGP. Setting the
field is safe; actually selling in a foreign currency needs an FX source and
payment-provider work that is not built. Do not read a non-EGP plan's revenue
figures as that currency.

---

## 8. The billing-cycle vocabulary has exactly one definition

`plan-catalog.js` owns it. The pages delegate.

This is not decoration. The database learned `semiannual` before the pages did,
and `pricing.html` spelled the cycle list out locally — so a semiannual plan was
advertised **"/ month"** and its "≈ N/day" figure divided by 30 instead of 182.
Caught after deployment by comparing the dashboard's live preview against the
rendered pricing card, which is now a permanent test.

`CYCLE_DAYS` is an explicit table (`30 / 91 / 182 / 365`) rather than
months × 30.44, because the approximation put semiannual at 183 while the
Create Plan form writes 182 — and two definitions that disagree by a day are
still two definitions.

---

## 9. Scale

Indexed for the public read (`visible, unarchived, ordered`) and for the
lifecycle read. The unique display-name index is **partial** on
`archived_at IS NULL`, so archived plans do not exhaust the name space.

At today's nine rows the indexes change nothing. At thousands they are the
difference between an index scan and a sequential scan on every page load. No
architectural change is needed to get there: the catalogue is one table, the
pages read it through two views, and nothing enumerates plans in code.

---

## 10. What is verified, and how

| Gate | Result |
|---|---|
| Pre-apply probe, rolled back against production | **38/38** |
| Post-apply against live data | **14/14** |
| Post-deploy full lifecycle against the live RPCs | **23/23** |
| Preview ↔ rendered card parity | **11/11** |
| `tests/plan-catalog.test.mjs` | **210 assertions** |
| Full suite | **25/25 green** |
| Repo-wide hardcode audit (66 production files) | plan-code lists 0 · display names 0 · prices 0 · name maps 0 |

The field list in `tests/plan-catalog.test.mjs` **is** the spec — a field
quietly dropped from the form fails the build.

---

## 11. Rules for anyone changing this

1. **`plan_code` is immutable.** Renaming it orphans every historical row.
2. **Never delete a plan.** Archive it.
3. **A new billing cycle or kind goes in the CHECK constraint AND in
   `plan-catalog.js`.** Adding one without the other is how §8 happened.
4. **Do not add a plan list to a page.** `tests/plan-catalog.test.mjs` fails the
   build on any array literal holding a plan code.
5. **Presentation belongs on the row.** If a page needs a new per-plan visual,
   add a column and read it — do not branch on `plan_code`.
6. **Migrations are individually approved** (CLAUDE.md §3) and applied **before**
   the code that depends on them (DEPLOY.md §2).
