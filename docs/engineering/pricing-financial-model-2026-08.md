# Pricing & financial model — review and repricing, 2026-08-30

Baseline read from the live project (`igvkyxkmjnkzscqgommj`) on 2026-08-30.
Every figure below was measured, not recalled.

## Why this happened

The proposed model arrived with four subscription prices. **All four were
already live and exact** — 349 / 899 / 1,949 / 2,999. No price changed in this
work. What had never been sized against cost were the *credit grants* attached
to them, which ran 3.5× the proposal and put every paid plan underwater at full
consumption.

## What the AI actually costs

Priced all 1,243 model calls (29 Jul – 30 Aug) against the rate cards already
configured in `cost_engine`:

| Model | Calls | Input | Cached | Output | USD |
|---|--:|--:|--:|--:|--:|
| gpt-4o | 548 | 1,096,813 | 388,224 | 100,941 | 4.237 |
| gpt-4o-mini | 618 | 10,243,646 | 682,368 | 116,675 | 1.658 |
| **Total** | **1,166** | | | | **5.894** |

One student message fans out to **4.08 model calls** — shadow pipeline,
difficulty detector and verification all bill against the same send. This is the
number most easily missed, and it is why a per-call figure and a per-message
figure differ by 4×.

**USD 5.894 ÷ 305 student requests = USD 0.0193/message ≈ EGP 0.94** at ~48.5.
The business assumption of EGP 1.125/message is therefore **conservative by
about 20% and sound as a planning number**.

Two caveats, both unresolved and neither ours to settle:

- The rate cards carry `price_confidence = list_price` and their own note says
  *UNVERIFIED against an invoice*. This is modelled cost, not billed cost.
- `cost_engine.fx_rates` is **empty**. No EGP figure resolves anywhere in the
  system today; EGP 48.5 is an assumption made for this review only.

## What changed

Catalogue and credit-cost values are **owner-editable operational data**, not
schema — there is an `admin_set_credit_cost` RPC and an Owner → Plans & Packs
dashboard, and the live catalogue has always diverged from the seed migrations
(they seeded PRO_MONTHLY at 500 credits; it was 3,500). These were applied as
data edits, which is the designed workflow. No migration was applied.

### Credit cost of a message: 5 → 8

`credit_costs.CHAT_TEXT` 5 → 8, the figure the grants were sized against.
`AI_CHAT_MESSAGE` moved with it: it is the dormant pre-v96 fallback (last fired
2026-07-22) and `ENTITLEMENT_FALLBACK_FEATURE` in `ai-tutor`, so leaving it at 5
would let the fallback path undercut the intended price if `CHAT_TEXT` were ever
deactivated.

`credit-config.js` `DEFAULT_COST` updated to match. That table is a
display-only fallback for the window before the live config loads; the database
stays authoritative.

### Grants resized

| Plan | Price | Was | Now | EGP/credit |
|---|--:|--:|--:|--:|
| Pro Monthly | 349 | 3,500 | 1,000 | 0.349 |
| Pro Quarterly | 899 | 10,500 | 3,000 | 0.300 |
| HERO | 1,949 | 25,000 | 7,000 | 0.278 |
| Pro Annual | 2,999 | 42,000 | 12,000 | 0.250 |

Against a modelled cost of EGP 0.1406/credit, gross margin now runs 44–60%
before gateway fees, tax and commission.

### Packs

Power Pack 649 → 599. Added **Ultra Pack** (`PACK_ULTRA`), 5,000 credits for
EGP 1,299. Starter and Value already matched.

### Existing subscribers: left alone as legacy accounts

The 313,400 credits already granted are untouched. `approve_payment_request`
sets `subscription_credits = credits_granted` (a reset, not an accumulation), so
the new figures apply from each subscriber's next renewal with no migration.
Pack credits accumulate and are unaffected by design.

**No legacy pricing was built, deliberately.** Raising `CHAT_TEXT` to 8 did
reduce what an existing balance buys — 42,000 credits bought 8,400 messages
before and buy 5,250 now — so preserving *credits* is not the same as preserving
*messages*. A per-user legacy 5-credit rate was designed and then rejected by the
product owner: the current paid accounts are early internal users working with
the team, and are to be handled as a separate legacy situation if they ever need
handling at all. Keeping one price for one operation is worth more than a
per-user exception table that every future pricing change would have to reason
about.

### The forward model, as applied

| | Price | Credits |
|---|--:|--:|
| Pro Monthly | 349 | 1,000 |
| Pro Quarterly | 899 | 3,000 |
| HERO (6 months) | 1,949 | 7,000 |
| Pro Annual | 2,999 | 12,000 |

`CHAT_TEXT` = 8 credits. Verified live on 2026-08-30.

### "Unlimited AI messages" — root cause removed

`manual-payment.html:436` held a hardcoded fallback feature list beginning
`'Unlimited AI messages'`, used whenever a plan carried no authored features.
Nine of twelve plans had none, so **it was rendering live on checkout for Pro
Monthly** — a flat promise of unmetered use, directly contradicting the credit
model.

Rather than edit the string, every subscription plan was given an authored
feature list. Both `pricing.html:562` and `manual-payment.html:425` prefer
authored features over their fallback, so neither fallback is now reachable for
any plan a student can see. `PRO_QUARTERLY_COPY` is the only plan still without
one; it is inactive and `visibility = 'internal'`, so it never renders.

Wording follows `pricing.html`'s canonical ladder: lead with the credit grant,
describe the daily cap as the cap it is, and claim "unlimited" only where the
thing genuinely is not metered (chat-history retention). Two owner-authored
lists were corrected for the same class of error — HERO said "25,000 Credits"
and "Unlimited Step-by-Step Solutions"; SAT_EXAM_NIGHT said "Unlimited Zero AI
questions" for what is 625 messages at 8 credits.

### Founder Badge: sold out

`founder-badge.html` advertised "Only 3 Founder memberships remain" in its meta
description, Open Graph and Twitter cards, JSON-LD offer schema, and FAQ body —
all hardcoded — while `system_settings.founder_slots_remaining` was **0**. Since
`approve_payment_request` raises *"No Founder slots remaining"* below 1, the page
was sending students to a checkout guaranteed to refuse them.

Fixed at the source. `assets/founder-status.js` is the single place the count
lives, with `validate-knowledge-layer.mjs` failing the build if any surface
disagrees; the constant went 3 → 0, and every dependent surface now states
closure instead of a count. `faq.html` and the graph pages were regenerated from
`faq-data.mjs` rather than hand-edited. The JSON-LD offer moved from
`LimitedAvailability` to `schema.org/SoldOut` with `inventoryLevel` 0, and the
"Claim a Founder spot" CTA now reads "See current plans".

The validator needed a new branch: at zero, "only 0 memberships remain" is not a
sentence anyone should ship, so the requirement inverts — each surface must state
closure and must carry **no** numeric claim. Verified by reintroducing a stale
"only 3" into `llms.txt` and confirming two checks go red.

The page is preserved in full, as asked. It still explains what the Founder Badge
was and why it was capped; it simply no longer sells one.

**Copy deliberately avoids "all 50 memberships were claimed."** `founder_slots_total`
is 50 and `founder_slots_remaining` is 0, but only **five** Founder accounts
exist. Why the counter reads 0 against five holders is unexplained — most likely
it was zeroed by hand to close sales. The wording states only what is verifiable:
no memberships remain available.

## Prepared, not applied — ⚠️ CORRECTED 2026-08-31: THE FILES ARE GONE

This section described three referral migration files as sitting in the branch.
**They were never committed, on any branch.** Verified 2026-08-31:
`git log --all --diff-filter=A -- '*referral*' '*commission*'` returns nothing,
and `grep -rin "\breferral\b"` matches nothing in the repository outside this
document. They existed only in the working tree of the session that wrote this
file, and that container was reclaimed.

Two of the three names are now **taken by applied migrations** —
`20260830a_teacher_foundation_tables.sql` and
`20260830b_teacher_foundation_rls.sql`, both live since 2026-08-30 — so the
names cannot be reused even if the files are rewritten.

The design is not lost: it is carried forward, corrected and extended, in
`docs/roadmap/teacher-partner-program.md`. What that plan keeps from here is the
part that mattered — the business rules belong in constraints, not in
application code. What it corrects is the commission base: `payment_requests.
amount_egp` is a **direct client insert** with no trigger and no CHECK, so it is
student-controlled and must never be the figure a payout is computed from.

The original text, for the record:

- `20260830a_teacher_referral_commissions.sql` — four tables plus
  `attribute_referral()` and `award_referral_commission()`.
- `20260830b_approve_payment_awards_commission.sql` — the hook into
  `approve_payment_request`. Reproduces the current production definition
  verbatim with two `perform` lines added; diff before applying.
- `20260830z_teacher_referral_rollback.sql` — the undo, unhooking the payment
  path before dropping the functions it calls.

The business rules are carried by constraints rather than by application code:
`UNIQUE(student_user_id)` on `referral_commissions` makes "first paid purchase
only" impossible to violate; `UNIQUE(payment_request_id)` makes double-award
impossible; `PRIMARY KEY(student_user_id)` on `referral_attributions` makes
first-touch attribution structural. `rate_bps` and `tier_at_award` are frozen
into each row so crossing a tier does not restate history.

## Open — needs business, legal or product confirmation

1. **EGP/USD rate.** None configured. Every EGP cost figure scales with it.
2. **Actual AI cost.** Rate cards are unverified list prices. One invoice
   reconciliation converts modelled cost to measured cost.
3. **Commission base.** 10–15% of gross, or of net after fees? On Pro Annual a
   15% gross commission is a large share of the margin.
4. **VAT / withholding.** Whether Egyptian VAT applies to a digital education
   subscription, whether listed prices are inclusive, and withholding on teacher
   payouts. Nothing encoded.
5. **Gateway fees.** There is no gateway — payment is manual bank transfer with
   screenshot proof. `platform_cost_entries` exists and is empty.

## Defects found, not fixed

- **A Founder cannot renew** — held for a separate policy decision before the
  2027 renewal window; no behaviour changed. `approve_payment_request` checks
  `founder_slots_remaining` on *every* approval, not just first purchase, and
  the counter is at **0/50**. An existing Founder's renewal would raise
  *"No Founder slots remaining"*. All five renew between 21 Jun and 8 Jul 2027 —
  295 to 312 days out, so there is time. What the offer actually promised:
  `20260619_founder_restructure_annual.sql` records *"Locked renewal price forever
  (re-grants at 1499 EGP/year for life)"* and *"No lifetime/free access — must
  renew annually"*, so annual renewal at 1,499 is a written commitment. The
  *quantity* re-granted is not: `founder-badge.html` promises a price, never a
  credit figure, and mentions credits only as "full credit allocation for the AI".
- **Founder Annual economics.** 42,000 credits for EGP 1,499 is EGP 0.0357 per
  credit against ~EGP 0.14 cost, and the price lock is permanent. Slots at 0
  means nothing new can be sold, which contains it — but renewals (once the
  defect above is fixed) will keep granting 42,000.
- **`SAT_EXAM_NIGHT`** — held pending an explicit product decision, unchanged.
  `period_days = 41` runs from *approval*, not creation, so it behaves as a
  rolling window rather than a deadline, which argues 41 is a duration; the name
  "Exam Night" argues for three days. The evidence does not settle it. A payment
  request for EGP 1,000 has been **pending since 2026-08-23**; approving it grants
  41 days. Note the buyer submitted while the card read "3-day exam access" and
  "Unlimited Zero AI questions" — wording since replaced by "5,000 credits for the
  exam window", which asserts no duration.
- **`PRO_QUARTERLY_COPY`** — resolved, no action needed. Provenance from
  timestamps: created 16:01:35 on 2026-08-02 by duplicating Pro Quarterly and
  renaming it "HERO", archived by the owner at 16:03:42, and superseded at
  16:15:53 by the real semiannual `HERO`. It was **already archived**
  (`archived_at` set, `active = false`, `visibility = 'internal'`) — the state
  `admin_archive_plan()` produces — and has zero references in `profiles`,
  `subscriptions` or `payment_requests`. Left as it is.

## Not changed, deliberately

Requirement 5 of the brief — centralise pricing into configuration — was
**already satisfied and enforced** before this work: `plan_definitions` is the
sole catalogue, `plan-catalog.js` and `credit-config.js` are the only readers,
and `tests/plan-catalog.test.mjs` fails the build if a page reintroduces its own
price. No hardcoded price exists across 46 root pages. Nothing was added; every
change above is an Owner Dashboard edit, not a deploy.
