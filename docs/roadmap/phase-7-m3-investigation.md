# Phase 7 M3 — Pre-Implementation Investigation

**Read-only. Nothing built, nothing applied.** This exists to put one decision
in front of you before any M3 code is written.

---

## The headline

**M3 (`owner_econ_breakeven()`) would ship a panel that is blocked on 100% of
months — and would stay blocked even if you entered fixed costs and an FX rate
tomorrow.**

Not because of a defect. Because the platform has **no priced student traffic
yet**. Measured on production 2026-08-01:

| Input break-even needs | State | Consequence |
|---|---|---|
| External AI cost | **0 of 76 facts are external** — all 76 are `is_internal = true` | `ai_cost_usd` is NULL on every month |
| FX rate (USD → EGP) | **`cost_engine.fx_rates` is EMPTY (0 rows)** | no USD cost could be converted even if it existed |
| Fixed costs | **`platform_cost_entries` is EMPTY (0 rows)** | no fixed-cost input |
| Distinct students in cost facts | **1** — and that one is internal | "subscribers needed at current ARPU" has no population |
| Cost history | **3 days** (2026-07-29 → 07-31) | no month has a full cost picture |

```
econ.v_breakeven_inputs — all 14 months:
  block_reason      = no_cost_in_period   (14/14)
  net_block_reason  = no_cost_in_period   (14/14)
  ai_cost_usd       = NULL                (14/14)
  confidence        = blocked             (14/14)
```

Revenue is the one side that works — 8 events producing real EGP across 14
months (`2026-06` → `2027-07`).

---

## Why every fact is internal

All 76 cost facts belong to **one user**, and that user is flagged internal.
This is the owner's own testing traffic. INV-25 excludes internal traffic from
business metrics **by default** — so every business-facing econ surface
correctly sees zero AI cost.

This is the confidence architecture working exactly as designed. It is also why
M2's Net Profit came back blocked on all 14 months "three ways over": no external
AI cost, no FX rate, no platform data. **M3 inherits all three**, plus a fourth
(no student population).

Evidence this is not a join bug: `owner_cost_reprice('{}')` — with
`include_internal` defaulting to `false` — returns `no_cost_facts_in_window`.
With `include_internal: true` it returns all 76 facts and `$0.22961425`. The
data is there; it is correctly classified as internal.

---

## A structural issue worth raising now

**Revenue is recognized forward through 2027-07; cost can only ever be
historical.** Break-even on `2027-05` is not "blocked pending data" — it is
blocked *permanently*, because AI cost for a future month cannot exist.

If M3 renders one row per month over the revenue window, **8 of the 14 rows are
future months that can never unblock.** That is a presentation decision, not a
data one, and it should be made deliberately rather than discovered on screen.

---

## A scope discrepancy to settle

The two planning documents disagree about what M3 is:

| Source | M3 | M4 |
|---|---|---|
| `ai-economics.md` §14 roadmap table | "Simulator / **Break-even** RPCs" *(combined)* | — |
| `phase-7-investigation-and-plan.md` §5 | `owner_econ_breakeven()` + Section 11 panel | `owner_econ_simulate()` + Section 10 panel |

The detailed plan's split is the better one — `owner_econ_breakeven()` and
`owner_econ_simulate()` are independent, and M1/M2 both proved that smaller
milestones catch more. **I recommend M3 = break-even only, M4 = simulator**, and
correcting the roadmap table to match. Confirm and I will treat that as settled.

---

## Your options

**A. Build M3 now, blocked-state and all.** The panel ships correct and honest,
renders `no_cost_in_period` everywhere, and becomes live the moment real student
traffic is priced. Consistent with how M2 shipped Net Profit. Delivers **no
usable number today**.

**B. Defer M3 until external traffic exists.** Move to M4 (simulator) instead —
the simulator runs on `include_internal: true` and *does* have data to work with,
as M1 proved. Break-even returns when there is something to break even on.

**C. Build M3 with an explicit diagnostic mode**, the way Section 9 was handled
in Phase 6 M4.3: a clearly-labelled `include_internal` diagnostic that lets you
see the mechanism working on the internal data, while the business-facing default
stays blocked. Needs an explicit exception to INV-25's default, labelled on
screen, and its numbers must never feed a business KPI.

**My recommendation: B, then A.** M4's simulator has real data behind it today;
M3's break-even does not. Building the simulator first delivers something you can
actually use, and break-even lands later on top of the same M2 inputs without
rework. Nothing in M4 depends on M3 — the dependency in the plan runs the other
way only by numbering, not by design.

That said, if you want Phase 7 finished in the stated order, **A is perfectly
defensible** — a correct blocked panel is what the whole confidence architecture
was built to produce, and M2 set exactly that precedent.

---

## What I have NOT done

No migration written. No object created. No file changed outside this document.
`main` and `claude/phase7-simulator-breakeven` remain at `ba23a0b`.

---

## Decisions needed

1. **Option A, B, or C** above.
2. **M3 = break-even only, M4 = simulator?** (recommended — and the roadmap table
   corrected to match).
3. If **A** or **C**: how should future months render — omitted, or shown blocked
   with a distinct reason such as `future_period`?

---

## Owner rulings — 2026-08-01

Recorded after this investigation was reviewed:

1. **Option B.** M3 is **deferred**; the simulator (M4) is built first, because it
   has real data behind it today and break-even does not.
2. **The M3/M4 split is authoritative.** M3 = `owner_econ_breakeven()` + Section 11
   only; M4 = `owner_econ_simulate()` + Section 10. The `ai-economics.md` roadmap
   table has been corrected to match.
3. **Future months render blocked with a distinct `future_period` reason** — not
   omitted, and not conflated with `no_cost_in_period`. A reader must be able to
   tell "has not happened yet" from "pending data".

Ruling 3 is binding on M3 whenever it is built.

Continues in `phase-7-m4-investigation.md`.
