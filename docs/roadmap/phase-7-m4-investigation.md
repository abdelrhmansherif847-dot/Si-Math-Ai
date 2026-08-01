# Phase 7 M4 — `owner_econ_simulate()` Pre-Implementation Investigation

**Read-only. Nothing built, nothing applied.**

Follows the owner rulings of 2026-08-01: M3 deferred, **simulator built first**;
M3 = break-even only, M4 = simulator; future months render `future_period`.

---

## The headline

The simulator has real data for **each side separately** — and **none for the
two sides together.**

```
cost   population: 1 user   (internal)   window: 2026-07-29 .. 2026-07-31
revenue population: 8 users (external)   window: 2026-06-10 .. 2026-07-22

shared users: 0        shared days: 0        (the windows do not even touch)
```

**`Profit` and `Profit Margin` cannot be computed honestly today.** Subtracting
a cost drawn from one internal user in late July from a revenue drawn from eight
external users in June–mid-July produces a number that would look authoritative
and mean nothing.

That is precisely the failure class M1 existed to eliminate: an answer that looks
trustworthy because its structure is right, while its content is not.

---

## What each side actually has

**Cost side — works today.** M1 proved it end to end:

| | |
|---|---|
| Facts | 76, all `is_internal = true` |
| Total | `$0.22961425` |
| Scenario grammar | `basis_window`, `service_swap`, `model_swap`, `rate_override`, `discounts`, `fx` |
| Refusal contract | 16 reasons, all gate-verified |
| Entry point | `owner_cost_reprice()` with `include_internal: true` |

**Revenue side — real external data exists:**

| Table | Rows | Relevance |
|---|---|---|
| `credit_transactions` | 392 total, **115 external** across **8 users** | credit consumption + allowance exhaustion |
| `subscriptions` | 7, **5 external subscribers** | recurring revenue base |
| `credit_costs` | 16 | the `operations` override target |
| `credit_packs` | 3 | the `packages` override target (`price_egp`) |
| `plan_definitions` | 7 | plan pricing (`amount_egp`, `credits_granted`, `period_days`) |
| `econ.v_revenue_events` | 8 | recognized revenue |

Transaction types present: `CONSUME`, `GRANT`, `REFUND`, `ADMIN_ADJUST`.

**Profit — cannot be sourced.** It needs both sides over the same population and
period, and there is no intersection at all.

---

## Recommended design

Return **both sides, each with its own confidence**, and **block profit with a
distinct reason** rather than computing it from disjoint inputs:

```jsonc
{
  "ok": true, "simulated": true, "run_id": null,
  "cost":   { "actual_usd": …, "simulated_usd": …, "delta_usd": …,
              "by_service": [ … ], "confidence": "modeled",
              "population": "internal_only", "calls": 76 },
  "revenue":{ "actual_egp": …, "simulated_egp": …, "delta_egp": …,
              "credits_consumed": …, "confidence": "modeled",
              "population": "external", "users": 8 },
  "profit": { "value": null, "confidence": "blocked",
              "block_reason": "disjoint_cost_and_revenue_populations",
              "detail": "cost covers 1 internal user over 3 days; revenue covers
                         8 external users over 43 days; 0 shared users, 0 shared days" }
}
```

**Why block rather than omit.** Profit *will* resolve once external traffic is
priced — it is data-limited, not undefined. M4.3 drew exactly this line: a
*blocked* metric promises it will resolve; an *omitted* one never will. Profit is
blocked. (Contrast M3's future months, which are permanently unresolvable and got
their own `future_period` reason under the same principle.)

**Why not just run it on internal traffic.** Revenue has no internal population
to pair with — the internal user has cost but no purchases. Forcing the pairing
would invent an economic relationship that does not exist.

### Consequences worth stating before you approve

1. **The simulator's headline number becomes the cost delta, not profit.** That
   is still the actionable one — *"switching solver to Sonnet moves AI cost by
   −38%"* — and it is fully supported by real data today.
2. **`demand.elasticity` is inert** with volume held constant, and there is no
   basis to estimate elasticity from 8 users. Recommend accepting the key in the
   grammar and **refusing any non-zero value** (`elasticity_unsupported`) rather
   than silently ignoring it — the `routing` precedent from M1.
3. **Revenue simulation needs its own conservation check**: re-charging at the
   *current* credit costs and package prices must reproduce recognized revenue
   exactly, the same way M1's identity scenario reproduced `$0.22961425`.

---

## Open questions for you

1. **Confirm profit blocks rather than computes.** The alternative is to compute
   it and label it heavily — I do not recommend that, and it contradicts the
   confidence architecture, but it is your call.
2. **Scope of the revenue side.** Full re-charge simulation (credit consumption,
   allowance exhaustion, package re-pricing) is the spec, and it is the larger
   half of M4. Options: (a) build it in full; (b) M4 ships **cost-side + profit
   blocked** only, and revenue simulation becomes M5. Given that M1 and M2 both
   showed smaller milestones catch more, **(b) is worth considering** — but it
   splits the spec's Section 10, so I am flagging it rather than assuming.
3. **`elasticity` — refuse non-zero, or accept and ignore?** I recommend refuse.

---

## What I have NOT done

No migration written. No object created. No production state changed. `main`
remains at `ba23a0b`.

Nothing proceeds until you answer the three questions above.
