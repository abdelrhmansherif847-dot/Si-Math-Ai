# Phase 7 M5 — Revenue Simulation: Engineering / Design Review

**No migration, no code.** This reviews a *proposed* design against the measured
evidence in `phase-7-m5-investigation.md`, and stops for your approval.

---

## 1. The proposal in one line

**M5 implements `packages` re-pricing on external revenue, and REFUSES
`operations` with a measured reason — the same self-unblocking pattern M4 used
for profit.**

---

## 2. Why `operations` refuses rather than ships

Three measured facts, any one of which would be sufficient:

| # | Fact | Consequence |
|---|---|---|
| A | Feature identity exists only as free text; **0 of 373** `reference_id`s resolve | there is no key to override against |
| B | **16 of 373** rows (`AI_CHAT_MESSAGE (pack:5)`) map to no feature | an override silently skips them |
| C | Identity re-charge reproduces **356 of 373**, not all | the conservation check cannot pass |
| D | `AI_CHAT_MESSAGE` (348) vs `CHAT_TEXT` (7) are two names for one operation | the spec's own example moves **1.9%** of rows |

**D is the one that decides it.** A caller writes `{"CHAT_TEXT": 8}`, expecting
to re-price chat. They get a confident number computed from 7 of 373 rows. That
is the M1 defect wearing different clothes — and M1 exists precisely because that
class of answer is worse than no answer.

Shipping `operations` in a partial form would mean returning a revenue figure
that is *structurally* right and *materially* meaningless. The architecture's
governing rule says fail explicitly instead.

### The refusal must be measured, not hardcoded

Following M4 exactly. The function measures, per window:

```
unmappable_consume_rows      -- description with no matching credit_costs row
charge_ne_current_cost       -- historical charge <> current credit_cost
ambiguous_features           -- >1 active feature_name sharing a credit_cost
                                and both present in consumption
```

and refuses with the reason that is actually true:

```
unmappable_credit_transactions   (16 today)
credit_charge_history_diverged   (1 today)
ambiguous_feature_namespace      (AI_CHAT_MESSAGE / CHAT_TEXT today)
```

When the data is repaired, the refusal lifts **by itself** — no edit. That is the
property V12 proved for M4 and it should hold here too.

---

## 3. What `packages` does

1. Take every revenue event in the window, **excluding staff purchases**.
2. For each, resolve its plan; substitute the scenario price where the
   `packages` map names that plan; otherwise keep the plan's list price.
3. Hold purchase **volume constant** — 3 `PRO_MONTHLY` purchases stay 3
   purchases. `demand.elasticity` remains refused (M4 ruling).
4. Return actual, simulated, and delta, with `by_plan` breakdown.

**Conservation check, mandatory and measured:** with no `packages` override,
simulated revenue must equal recorded revenue **exactly** — `8542 = 8542` today.

**Precondition, measured every run:** recorded amount must equal plan list price
for every event in the window. It holds on all 8 events today, but the source of
truth is the *recorded payment*, so a discount or price change would break it.
When it breaks, refuse with `recorded_revenue_differs_from_list_price` and report
the variance — do not silently re-price on top of a mismatch.

**Inert overrides are noted, not refused.** `PACK_*` plans have zero purchases, so
`{"PACK_VALUE": 399}` moves nothing. That is a `note`, matching M1's treatment of
inert swaps — the answer is right, and the inertness is said out loud.

---

## 4. Staff purchases: excluded by default

**2 of 8 events, 1848 EGP — 21.6% of recorded revenue — are the owner's own
subscription.**

Lesson 5, which you made permanent one milestone ago, says a business metric
gates on the external population. Simulated revenue is a business metric.
Proposal: **exclude staff purchases by default**, and return both figures in
`basis` so nothing is hidden:

```jsonc
"basis": { "revenue_events": 6, "revenue_events_staff_excluded": 2,
           "revenue_egp_external": 6694, "revenue_egp_staff": 1848 }
```

This mirrors the cost side's `include_internal` default, and keeps the two halves
of the simulator governed by one rule rather than two.

---

## 5. Shape of the result

`owner_econ_simulate` is **extended, not replaced** — one Section 10 surface, and
`CREATE OR REPLACE` on an unchanged signature preserves ACLs (no `DROP`, so no
default-privilege reset). Grants still verified after apply, per Lesson 4.

```jsonc
{
  "ok": true, "simulated": true, "run_id": null, "milestone": "M5",
  "cost":    { … unchanged from M4 … },
  "revenue": { "actual_egp": 6694, "simulated_egp": …, "delta_egp": …,
               "by_plan": [ … ], "purchases": 6,
               "population": "external_only", "confidence": "modeled",
               "credits_consumed_actual": 1908,
               "credits_consumed_simulated": null,
               "credits_block_reason": "ambiguous_feature_namespace" },
  "profit":  { "value": null, "margin_pct": null, "confidence": "blocked",
               "block_reason": "disjoint_cost_and_revenue_populations" }
}
```

**Profit stays blocked and unchanged.** M5 implements the revenue *simulation*;
it does not create the external cost population profit needs. The M4 gate is
untouched and will unblock itself when external traffic is priced.

**`credits_consumed_actual` is reported; `credits_consumed_simulated` is not.**
Actual consumption is a fact we hold (1908 credits). Simulated consumption
depends on `operations`, so it blocks with the same measured reason.

---

## 6. Verification plan

Carrying the full discipline forward:

- **Pre-apply probe, direct execution** — every assertion calls the RPC itself.
- **Revenue identity conservation** — no override reproduces `6694` external
  (and `8542` including staff) **exactly**.
- **Every refusal driven to fire**, including all three `operations` reasons and
  `recorded_revenue_differs_from_list_price`.
- **Both branches of every measured gate proven reachable** — the M4 V12
  pattern: mutate one row inside the probe, watch the reason change, roll back.
- **Population conservation** — `by_plan` parts sum to the whole.
- **M4 regression inside M5's own gate** — the cost side and the profit block
  must be byte-identical to M4's results, since M5 must not disturb them.
- **Write safety, `STABLE`, owner gate, grants after apply.**

---

## 7. Risks

| Risk | Assessment |
|---|---|
| `operations` refusal reads as "feature missing" | **Real.** Mitigated by a `detail` naming the exact counts and the data repair needed |
| Extending `owner_econ_simulate` disturbs M4 behaviour | **Low but must be proven** — M4's assertions re-run inside M5's gate |
| Recorded-vs-list equality breaks later | **Certain eventually.** Measured every run; refuses rather than misreports |
| Staff exclusion changes a number you have seen | **Yes, deliberately** — 8542 → 6694. Both returned |

---

## 8. Decisions I need from you

1. **`operations` refuses — agreed?** The alternative is repairing the feature
   namespace first (a product/data change adjacent to GAP-3), then building
   `operations` in M6. I recommend refusing now and repairing separately, because
   the repair is not a simulator change and should not be smuggled into one.

2. **Exclude staff purchases from simulated revenue — agreed?** It follows Lesson
   5 directly. It will change the revenue figure you see from **8542 to 6694**.

3. **Extend `owner_econ_simulate` rather than add a new RPC — agreed?** Keeps one
   Section 10 surface and avoids a `DROP`+`CREATE`.

---

## Stop

**Nothing written, nothing applied.** On your answers I will implement, probe,
and return an engineering review of the actual code before anything is applied —
the same sequence as M1, M2 and M4.
