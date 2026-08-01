# Phase 7 M2 — Release Report

**Status: APPLIED. Release Gate PASSED after two defects were found and fixed.**
Not closed out, not merged, no UI, no M3.

| | |
|---|---|
| Migrations applied | **4** — M2a, M2b, M2c, M2d |
| Release Gate | **M2-V1 … V9 — 9/9 PASS** |
| Economics regression | **17 PASS, 1 VACUOUS** |
| Cost Engine regression | **20 PASS, 5 VACUOUS, 1 WARN** |
| `admin.html` | **untouched** — RPC-only entry, per your ruling |
| `main` | **untouched** |
| Rows in `platform_cost_entries` | **0** — every test rolled back |

---

## 1. The gate found two defects. Both were mine.

This milestone's honest summary: **the implementation was wrong twice, and the
verification caught both.** Neither was found by review — only by execution.

### Defect 1 — `42702`, found at V4, after apply

`owner_econ_set_platform_cost` raised *"column reference period_month is
ambiguous"* on **every** call. `RETURNS TABLE` output names are **variables** in
PL/pgSQL scope, and the body's column references were unqualified.

**Why the pre-apply probe missed it:** the probe exercised the table, the freeze
trigger, all eight constraints, the sanctioned view, the resolver and **both**
net-profit RPCs — but **never called this function**. It inserted into the table
directly and performed the supersede by hand. `42702`, like `42804`, is raised
only at execution.

Fixed in **M2c** (qualification only).

### Defect 2 — two regressions, found by the Economics suite

**`P5-01` FAIL** — `econ.v_breakeven_inputs` joined `cost_engine.fx_rates`
directly. `fx_rates` is inside INV-05 / §8.10 rule 8's forbidden set, and worse
than the edge: **econ was implementing FX policy**, which belongs to the engine.

The correct pattern already existed and I did not follow it — `v_pnl_daily` never
touches `fx_rates`, it consumes `cost_engine.v_cost_daily.total_cost_egp`.

**`P5-04` FAIL** — `owner_econ_set_platform_cost` is `VOLATILE`, but `P5-04`
asserts every `owner_econ_*` is `STABLE`.

Fixed in **M2d**, on your instruction that **the code changes, not the check**.

---

## 2. Migrations applied

| Version | Name | What |
|---|---|---|
| `20260801182954` | `aiecon_p7_m2a_platform_cost_entries` | table, 8 constraints, 2 partial unique indexes, freeze trigger, security, sanctioned view, `platform_cost_available()` rewrite, writer + history RPCs |
| `20260801183045` | `aiecon_p7_m2b_net_profit` | `net_block_reason()`, extended `v_breakeven_inputs`, 2 net-profit RPCs |
| *(M2c)* | `aiecon_p7_m2c_fix_set_platform_cost_ambiguity` | **fix** — qualification only |
| *(M2d)* | `aiecon_p7_m2d_restore_layer_boundary` | **fix** — `cost_engine.to_egp()`, econ stops reading `fx_rates`, writer renamed out of `owner_econ_*` |

---

## 3. Release Gate — 9/9

| # | Validation | Result |
|---|---|---|
| **V1** | Objects created as designed | **PASS** — table, view, 6 functions |
| **V2** | `block_reason()` and its 4 callers untouched | **PASS** — proven from the stored migration statements: `v_pnl_daily` is only *read*, never redefined |
| **V3** | `v_breakeven_inputs` columns 1–8 unchanged | **PASS** — identical name, type, order |
| **V4** | Immutability + revision strategy | **FAIL → fixed (M2c) → PASS 9/9** |
| **V5** | Every CHECK constraint fires | **PASS 7/7** |
| **V6** | Security | **PASS 9/9** |
| **V7** | Double-counting prevented | **PASS** |
| **V8** | All six `net_block_reason` branches reachable | **PASS 6/6** |
| **V9** | No partial FX conversion | **PASS** |

### V6 — the security result in full

| Check | Result |
|---|---|
| Non-owner on all four RPCs | **`42501`** ×4 |
| `anon` table privileges | **none** — SELECT/INSERT/UPDATE/DELETE all revoked |
| `authenticated` table privileges | **none** |
| RLS enabled with **zero** permissive policies | **yes** — two independent protections |
| `FORCE ROW LEVEL SECURITY` | **absent**, per decision D2 |
| Owner succeeds | 14 rows |

### V7 — the double-counting hazard, measured

After correcting July from 25.00 → 30.00:

| Query | Returns |
|---|---|
| `sum(amount)` on the **raw table** | **55.00 — inflated** |
| `sum(amount)` on `econ.v_platform_costs_current` | **30.00 — correct** |
| Rows the view exposes | **1** |

Your ruling ② requirement 5 asked for this to be explicit. It is measured on live
objects, not asserted.

### V8 — all six branches proven reachable

`no_platform_cost_source` (verified on the **real empty table**),
`no_platform_cost_in_period`, `no_fx_for_platform_cost`, unblocked-NULL,
gross-precedence, and the INV-23 defensive branch.

**Worth recording:** on current production data the three platform-specific
reasons are **unreachable**, because gross blocking always fires first. They were
proven by direct literal-input tests instead — the `P5-06`/`P5-13` precedent — so
no branch shipped unexercised.

---

## 4. Regression suites

### Economics — **17 PASS, 1 VACUOUS**

`P5-01` … `P5-17` all PASS except `P5-02b`, **VACUOUS** (pre-existing since
Phase 5 — it reads a view that is empty while all telemetry is internal).

| Notable | Value |
|---|---|
| **`P5-01`** | **PASS — 0 price-book edges of 44** examined *(was 2 of 46)* |
| **`P5-04`** | **PASS — 15 functions, 15 STABLE+SECDEF, 15 owner-gated** *(was 16/15)* |
| `P5-17` | **15 `owner_econ_*` RPCs invoked, 0 raised** |

### Cost Engine — **20 PASS, 5 VACUOUS, 1 WARN**

Identical to the M4.3 baseline. `P4-31` WARN is pre-existing (76 of 76 facts
list-priced). `P4-15`/`P4-16` still reconcile to `0.22961425` with variance
`0.00000000`.

**No regression in either suite.**

---

## 5. The namespace rule, now without exception

| Namespace | Count | Kind |
|---|---|---|
| `owner_econ_*` | 15 | **read-only** |
| `owner_cost_*` | 6 | **read-only** |
| `owner_write_*` | **1** | **mutation** |

`owner_write_platform_cost` is the project's only writer in these namespaces, and
its name states that. The rule that held for the whole project now holds
*without* an exception, rather than being relaxed to accommodate new code.

---

## 6. Production state

| Measure | Value |
|---|---|
| `aiecon` migrations applied | **20** |
| `platform_cost_entries` rows | **0** |
| Months in `v_breakeven_inputs` | 14 |
| Months with net profit computed | **0** |
| Net profit block reason, every month | `no_cost_in_period` |

**Net profit is blocked on every month, and that is correct.** It is blocked
three ways: no external AI cost, no FX rate, and no platform cost data. Your
ruling ④ was explicit that no shortcut, fake FX or estimated FX would be used —
so this is the ruling working, not a defect.

`cost_engine.to_egp()` returns NULL with no rate, which is what makes the
no-partial-conversion guarantee hold.

---

## 7. Permanent process lessons

Recorded at your instruction, and both earned this milestone:

1. **Every new RPC requires a direct execution probe.** Testing the tables,
   triggers and views *around* a function proves nothing about the function.
   This now stands alongside the type probe as a standing requirement.
2. **Every new JOIN must be checked against the layer-boundary rules before
   apply.** A dependency edge is as much a contract as a column type. M2's
   design document, engineering review and probe all missed the `fx_rates` join
   because none of them asked that question.

---

## 8. Known issues carried forward

1. **`P5-01` has a blind spot** — it inspects view→relation edges, so an econ
   object calling a `cost_engine` *function* that touches the price book would
   not be caught. Real, and **deliberately not fixed here**: you ruled it a
   separate Verification Framework Enhancement rather than M2 scope.
2. **`P5-02b` is vacuous** — pre-existing since Phase 5.
3. **`P4-31` WARN** — 100% of cost is list-priced.
4. **Net profit blocked until FX exists** — correct by ruling ④.
5. **No UI for platform cost entry** — your ruling: RPC-only via
   `owner_write_platform_cost(...)`; the admin interface is a later milestone.
6. **The rollback window closes once real invoice data is entered.** Applying
   and populating remain deliberately separate steps.

---

## Stop

Gate complete and green. **No closeout, no merge, no `admin.html`, no M3.**
Awaiting owner instruction.
