# Phase 7 M5 — Revenue Simulation: Engineering Review

**Migration prepared, nothing applied.** Awaiting approval.

`supabase/migrations/20260801d_aiecon_p7_m5_revenue_simulation.sql`

| | |
|---|---|
| Objects | **1** — `public.owner_econ_simulate(jsonb)` replaced in place |
| Pre-apply probe | **16 / 16 PASS** |
| Direct execution probe | **yes** |
| Signature change | **none** — `CREATE OR REPLACE`, no `DROP`, so no ACL reset |
| Frozen files touched | **0** |
| Client files touched | **0** |

---

## 1. Your three decisions, implemented

**1 — `operations` refuses on measured evidence.** No partial simulation of the
subset that happens to match:

```
T4  reason=unmappable_credit_transactions
    consume_rows=373  unmappable=16  diverged=1
    ambiguous=AI_CHAT_MESSAGE/CHAT_TEXT
```

The refusal names all three defects it measured, in priority order, and lifts by
itself when the namespace is repaired — the M4 pattern.

**2 — the staff exclusion is NOT implemented.** See §2.

**3 — `owner_econ_simulate` extended, not duplicated.** One Section 10 surface;
the M4 contract is preserved and re-asserted inside M5's own probe (T9, T10, T12).

---

## 2. Compatibility review — your condition was not met

You asked me to check before changing the default. **Existing consumers do depend
on current behaviour**, so I did not change it.

| Consumer | Depends |
|---|---|
| `econ.v_pnl_daily` (383 rows), `v_student_economics`, `v_package_economics`, `v_coverage` | 4 views |
| `owner_econ_revenue`, `_pnl`, `_pnl_summary`, `_package_economics`, `_student_economics`, `_credit_summary` | **6 RPCs wired into `admin.html`** |
| `admin.html` | 5 revenue surfaces, incl. **two tiles reading "Total Revenue" = 8542 EGP** |

**The risk is contradiction, not breakage.** Nothing would throw — but the
simulator would report 6694 while `admin.html` shows 8542 on two tiles for the
same period, with no on-screen explanation.

**Why this differs from the cost side:** `cost_facts.is_internal` is a
first-class column every cost surface already honours, so excluding internal
traffic there creates *consistency*. Revenue has no equivalent — staff status is
only derivable by joining `profiles` — so excluding it in one place creates
*disagreement*.

**Implemented:** total remains the basis, and all three figures are published so
nothing is hidden:

```
T7  total=8542  external=6694  staff=1848  population=all_purchases
```

**If you want external-only as the business default**, the clean route is to add
a first-class `is_internal`/`is_staff` concept to the revenue layer mirroring
`cost_facts`, so every revenue surface honours one rule. That is a coordinated
change across 4 views, 6 RPCs and 6 `admin.html` surfaces — its own milestone,
not a simulator side effect. Full detail in
`docs/roadmap/phase-7-m5-compatibility-review.md`.

---

## 3. ⚠ One deliberate contract change that needs your approval

**M4's profit block reason on the overlap branch has changed.**

| | M4 | M5 |
|---|---|---|
| No external overlap | `disjoint_cost_and_revenue_populations` | **unchanged** |
| Overlap exists | `revenue_simulation_not_implemented` | **`revenue_and_cost_currencies_unreconciled`** |

**Why:** M4's reason said revenue simulation did not exist. After M5 that is no
longer true, so leaving it would be a stale message asserting something false.
The new reason states what actually blocks profit once the populations overlap:
cost is USD, revenue is EGP, and **`cost_engine.fx_rates` is empty** — so there
is no rate to reconcile them.

**Consequence:** M4's Release Gate **V12 asserted the old string** and would now
fail if replayed verbatim. That is expected and correct — the assertion
described M4's world. M5's gate asserts the new reason on the same flipped-row
transition, so the *behaviour* (measured, self-unblocking, profit still `NULL`)
is unchanged and still proven.

I am flagging this rather than quietly changing it because it alters a string a
future reader may rely on. **Say the word if you would rather keep the M4 string
and add the FX condition as a second reason instead.**

---

## 4. What `packages` does, and why it is trustworthy

**Identity conserves exactly** — the property that made M1 credible:

```
T1  actual=8542.0000  simulated=8542.0000  delta=0.0000  purchases=8
T2  by_plan parts=8542.0000 = whole 8542.0000, purchases 8/8
```

**Re-pricing works and the arithmetic is checkable by hand:**

```
T3  PRO_MONTHLY 349 -> 450 : 3 purchases x 450 = 1350 (was 1047)
    total simulated 8845, delta +303
```

Volume is held constant — 3 purchases stay 3 purchases.

**The identity precondition is measured every run, not assumed.** Revenue comes
from `payment_requests.amount_egp` — what was actually paid — not from
`plan_definitions`. They agree on all 8 events *today*; the first discount or
price change breaks that. T11 proves the guard fires:

```
T11 (plan price changed inside the probe)
    reason=recorded_revenue_differs_from_list_price
    recorded=8542  list=10492  variance=-1950
```

**Inert overrides are noted, not refused** — `PACK_*` plans have zero purchases:

```
T6  ok=true  delta=0  notes=["package_override_inert: PACK_VALUE"]
```

The M1 precedent: the answer is right, and the inertness is said out loud.

---

## 5. Probe — 16/16

```
T1  revenue-identity        PASS  actual=8542 simulated=8542 delta=0 purchases=8
T2  population-conserved    PASS  by_plan parts=8542 whole=8542 purchases=8/8
T3  packages-repricing      PASS  simulated=8845 delta=303
T4  RULING-1 ops-REFUSED    PASS  unmappable=16 diverged=1 ambiguous=AI_CHAT_MESSAGE/CHAT_TEXT
T5  packages-validation     PASS  4/4 refused
T6  inert-override-NOTED    PASS  delta=0, note emitted
T7  three-figures-published PASS  total=8542 external=6694 staff=1848
T8  credits-blocked         PASS  actual=1908 simulated=null
T9  M4-profit-regression    PASS  value=null margin=null blocked
T10 M4-cost-no-drift        PASS  simulate=0.07730370 reprice=0.07730370
T11 precondition-REFUSED    PASS  variance=-1950 detected
T12 M4-contract-preserved   PASS  4/4 (elasticity, routing, cost-refusal, INV-25)
T13 never-emits-blocked     PASS  0 of 4 runs emitted a blocked value as a number
T14 grants+volatility       PASS  anon=f auth=t vol=s secdef=t
T15 write-safety            PASS  facts=76 sum=0.22961425 events=8 plan=349
T16 security                PASS  non-owner -> 42501
```

**T13 is the load-bearing one**: across four successful scenarios, no blocked
value — profit, margin, or simulated credits — is ever emitted as a number.

**T9/T10/T12 are the M4 regression**, run inside M5's own probe: profit still
blocks identically, the cost figure is byte-identical to `owner_cost_reprice`,
and all four M4 refusal behaviours survive.

**T14** verifies grants even though `CREATE OR REPLACE` preserves them — Lesson 4
says verify, not assume.

---

## 6. Limitations

1. **Credits cannot be simulated** — `credits_consumed_actual` (1908) is
   reported as fact; `credits_consumed_simulated` is `NULL` with the measured
   block reason. It unblocks when the feature namespace is repaired.
2. **Profit stays blocked**, now on the FX condition once populations overlap.
   `fx_rates` is empty, so even a perfect overlap would not produce profit today.
3. **Allowance exhaustion is not simulated** — it depends on `operations`.
4. **No UI.** RPC-only, consistent with M1/M2/M4.

---

## 7. Rollback

Restore the M4 body verbatim from
`supabase/migrations/20260801c_aiecon_p7_m4_econ_simulate.sql` via
`CREATE OR REPLACE`. No `DROP`, no ACL change, nothing else depends on it.

---

## 8. Proposed sequence, on your approval

1. Apply. 2. Confirm applied state **including grants**. 3. Release Gate — all 16
assertions against the applied function. 4. Economics regression. 5. Cost Engine
regression. 6. Release Report. **Stop immediately on the first failure.**

---

## Stop

**Nothing applied.** Awaiting approval — and specifically your call on §3, the
changed profit block reason.
