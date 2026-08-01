# Phase 7 M5 — Revenue Simulation: Pre-Implementation Investigation

**Read-only. Nothing built, nothing applied.** All figures measured against
production 2026-08-01.

---

## The headline

**M5's two halves have opposite verdicts, and the evidence is not close.**

| Half | Scenario key | Verdict |
|---|---|---|
| Purchase re-pricing | `packages` | ✅ **Supported** — identity re-price reproduces revenue **exactly** |
| Credit re-charging | `operations` | ❌ **Not supported on current data** — identity re-charge **cannot** reproduce history |

The `operations` half fails for a reason worth stating plainly: **the §11 spec's
own example would move 1.9% of production consumption and silently miss the
rest.**

---

## Half 1 — `packages` re-pricing: supported

```
revenue events ......... 8      all via payment_requests, 0 via payments
plan kinds ............. 8 subscription, 0 pack
plans .................. FOUNDER_ANNUAL (5 × 1499), PRO_MONTHLY (3 × 349)
recorded gross ......... 8542 EGP
same at list price ..... 8542 EGP
variance ............... 0          <- identity conservation holds
amounts == list price .. 8 of 8
```

An identity re-price reproduces recognized revenue **exactly**, the way M1's
identity scenario reproduced `$0.22961425`. The M5 conservation check is
therefore possible and meaningful.

**But the equality is a measured fact, not a structural guarantee.**
`econ.v_revenue_events` takes its amount from **`payment_requests.amount_egp` —
what was actually paid** — not from `plan_definitions.amount_egp`. They happen to
agree on all 8 events today. The first discount, promo, or price change makes
them diverge, and an identity re-price would then silently disagree with
recorded revenue.

> Per Lesson 5, M5 must **measure** this equality on every run and refuse when it
> does not hold, rather than assume it.

**Two facts that shape the design:**

1. **`PACK_*` plans have generated zero revenue.** `credit_packs` holds 3 packs
   and `plan_definitions` 3 pack plans, and **not one purchase**. A `packages`
   override naming a pack is **inert** — a note, not a refusal, following the M1
   precedent for inert swaps.

2. **2 of 8 revenue events are staff purchases.**

   ```
   staff events ...... 2   1848 EGP   (21.6% of all revenue)
   external events ... 6   6694 EGP
   ```

   The owner's own account holds a real subscription. Lesson 5 says a business
   metric gates on the external population — so simulated revenue must exclude
   staff purchases, or at minimum measure and report both. This is the exact
   pattern M4 hit on the cost side.

---

## Half 2 — `operations` re-charging: not supported

### Finding A — feature identity lives in free text, with no key

```
CONSUME rows ..................... 373    across 7 users
reference_type ................... AI_USAGE on all 373
reference_id resolves to a
  question_records row ........... 0 of 373
foreign key credit_transactions
  -> credit_costs ................ none
```

The **only** carrier of "which feature was charged" is
`credit_transactions.description`, a free-text column. There is no foreign key
and `reference_id` resolves to nothing in `question_records`.

### Finding B — 16 rows cannot be mapped at all

| `description` | rows | joins to `credit_costs`? |
|---|---|---|
| `AI_CHAT_MESSAGE` | 348 | ✅ |
| **`AI_CHAT_MESSAGE (pack:5)`** | **16** | ❌ **no match** |
| `CHAT_TEXT` | 7 | ✅ |
| `CHAT_IMAGE` | 1 | ✅ |
| `STUDY_PLAN` | 1 | ✅ |

The description is prose with a suffix, not an identifier. Those 16 rows cannot
be attributed to any feature.

### Finding C — identity re-charge does not reproduce history

```
CONSUME rows ......................... 373
charge == current credit_cost ........ 356
unmappable to any feature ............ 16
charged differently from current cost . 1   (CHAT_TEXT charged 30, current cost 5)
```

**356 of 373.** Unlike the cost side, re-charging at current credit costs would
**not** reproduce recorded consumption. The conservation property that made M1
and the `packages` half trustworthy is simply absent here.

### Finding D — two names for one operation, and the spec picks the wrong one

`credit_costs` carries **both** `AI_CHAT_MESSAGE = 5` and `CHAT_TEXT = 5`.
Production consumption splits **348 / 7** between them.

The §11 spec's worked example is:

```jsonc
"operations": { "CHAT_TEXT": 8, "MOCK_EXAM": 35 }
```

Applied to production, `CHAT_TEXT` would re-charge **7 of 373 rows (1.9%)** and
silently leave 348 untouched. `MOCK_EXAM` would match **zero** — it is one of the
six features in `credit_costs` that has never been consumed (the GAP-3 operations
Phase 8 is scheduled to wire).

**This is precisely the M1 defect class**: a scenario that appears to have been
honoured, returns a confident number, and has barely moved anything.

---

## Architectural dependencies

| Dependency | Direction | Note |
|---|---|---|
| `econ.v_revenue_events` → `payment_requests`, `payments` | existing | source of truth is the **recorded payment** |
| `econ.v_revenue_events` → `plan_definitions` | existing | supplies `kind`, `period_days`, `credits_granted` — and the list price a `packages` override would replace |
| `econ.v_revenue_events` → `econ.revenue_confidence()` | existing | status → confidence |
| `credit_transactions` → `credit_costs` | **absent** | no FK; join is on free text |
| `credit_transactions` → `question_records` | **absent** | `reference_id` resolves 0 of 373 |
| M5 → `cost_engine` | **none added** | revenue reads touch no cost_engine object; INV-05 unaffected, `P5-01` untouched |

**M5 extends `public.owner_econ_simulate(jsonb)`** — Section 10's single surface.
The signature is unchanged, so `CREATE OR REPLACE` applies and **ACLs are
preserved** (no `DROP`, so no default-privilege reset). Lesson 4 still requires
verifying grants after apply; it simply should not need a corrective this time.

---

## What M5 can honestly deliver

| Output | Verdict |
|---|---|
| Simulated revenue under `packages` overrides | ✅ real, conserving, external-only |
| Revenue delta vs actual | ✅ real |
| Credits consumed | ⚠️ reportable as **actual**, not simulatable |
| Simulated consumption under `operations` | ❌ refuse — measured |
| Allowance exhaustion re-simulation | ❌ depends on `operations`; refuse with it |
| Profit / margin | ❌ stays blocked (M4 ruling, unchanged) |

---

## The decisions this puts in front of you

1. **`operations` — refuse, or repair the data first?** Refusing is consistent
   with M1 and M4 and needs no product change. Repairing means giving
   `credit_transactions` a real feature key and reconciling the
   `AI_CHAT_MESSAGE` / `CHAT_TEXT` duplication — a product/data fix adjacent to
   GAP-3, not a simulator fix.

2. **Staff purchases in simulated revenue — exclude by default?** 21.6% of
   recorded revenue is the owner's own subscription. Lesson 5 points to
   excluding it and reporting both figures.

3. **Extend `owner_econ_simulate` or add a separate RPC?** Extending keeps one
   Section 10 surface and avoids a `DROP`+`CREATE`.

Proposed answers, with reasoning, are in
`docs/roadmap/phase-7-m5-design-review.md`.

---

## What I have NOT done

No migration, no object, no code, no production change. `main` and
`claude/phase7-simulator-breakeven` both remain at `cbf2fea`.
