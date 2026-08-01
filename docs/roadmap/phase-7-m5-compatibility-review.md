# Phase 7 M5 — Staff-Exclusion Compatibility Review

**Requested before implementing the staff exclusion.** Read-only; measured
against production 2026-08-01.

---

## Verdict

**Existing consumers DO depend on the current behaviour.** Your condition —
*"if no existing consumer depends on the current behaviour, then recommend
changing the default"* — **is not met.**

**Recommendation: do not change the default.** Keep total revenue as the
simulator's basis, and return all three figures explicitly so the split is
visible without contradicting any surface already in use.

---

## What consumes the revenue figures

**Database — 4 `econ` views depend on the revenue views:**

| View | Rows |
|---|---|
| `econ.v_pnl_daily` | 383 |
| `econ.v_student_economics` | 7 |
| `econ.v_package_economics` | 2 |
| `econ.v_coverage` | — |

**RPCs — 7 return revenue-shaped columns**, of which **6 are wired into
`admin.html`:**

| RPC | In `admin.html`? | Rows today |
|---|---|---|
| `owner_econ_revenue` | ✅ | 444 |
| `owner_econ_pnl` | ✅ | — |
| `owner_econ_pnl_summary` | ✅ | — |
| `owner_econ_package_economics` | ✅ | 2 |
| `owner_econ_student_economics` | ✅ | 9 |
| `owner_econ_credit_summary` | ✅ | 1 |
| `owner_econ_net_profit_series` / `_summary` | ✗ | — |
| `owner_econ_simulate` | ✗ *(new in M4)* | — |

**Client — `admin.html` displays revenue on at least 5 surfaces**, including
**two tiles explicitly labelled "Total Revenue"**:

```
line 313   "Total Revenue"  ...  sub: "all-time approved"
line 758   "Total Revenue"  ...  sub: "EGP, approved"
line 647   "Recognised revenue by plan, spread across each plan's period"
line 671   "Revenue, AI cost and margin per plan"
line 707   "Revenue, credits and usage per student"
```

No client reads `econ.v_revenue_events` or `v_revenue_recognized_daily`
directly — all access is through the RPCs.

---

## The measured impact

```
v_revenue_events total ....... 8542 EGP   <- what admin.html "Total Revenue" shows
  external only .............. 6694 EGP
  staff ...................... 1848 EGP   (21.6%)
```

**The risk is not breakage — it is contradiction.**

Nothing would throw. But if `owner_econ_simulate` used an external-only baseline
while `admin.html` continues to display **8542** on two tiles labelled "Total
Revenue", the owner would see two different "actual revenue" numbers on two owner
surfaces, for the same period, with no on-screen explanation of the difference.

That is the same class of problem M1 was built to eliminate — a number that is
individually defensible and collectively misleading.

---

## Why this differs from the cost side

M4 excluded internal traffic on the **cost** side without this problem, because
`cost_facts.is_internal` is a **first-class column** that every cost surface
already honours: `include_internal` defaults to `false` everywhere, so all cost
surfaces agree with each other.

Revenue has **no equivalent**. `econ.v_revenue_events` has no internal/staff
concept at all — staff status is only derivable by joining `profiles` on
`role`/`is_admin`. So excluding staff in one place creates disagreement, where on
the cost side it creates consistency.

---

## Recommendation

1. **M5 uses TOTAL revenue as its simulation basis** — identical to what
   `admin.html` already shows. Nothing contradicts, no default changes.

2. **Return all three figures explicitly**, so the split is available without
   anyone having to compute it:

   ```jsonc
   "revenue": { "actual_egp": 8542, …,
                "total_revenue_egp":    8542,
                "external_revenue_egp": 6694,
                "staff_revenue_egp":    1848,
                "population": "all_purchases" }
   ```

3. **If you later want external-only as the business default**, that is a
   **coordinated change across `econ.v_revenue_events`, 4 dependent views, 6
   `admin.html` surfaces and 7 RPCs** — a milestone of its own, with its own gate.
   It must not arrive as a side effect of the simulator.

   The clean way to do it, when you want it: add a first-class `is_internal`
   (or `is_staff`) concept to the revenue layer, mirroring `cost_facts`, so every
   revenue surface honours one rule the way the cost surfaces already do. That is
   the structural fix; excluding staff in one RPC is not.

---

## What this does not change

Lesson 5 stands. It says a business metric must gate on the external population
**and that the overlap must be measured**. The measurement is done, and it is
reported. What this review establishes is that *acting* on it is a coordinated
product change, not a one-function default flip — and that the honest interim is
to publish both numbers rather than to quietly pick one.
