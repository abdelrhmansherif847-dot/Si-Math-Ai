# Phase 7 M2d — Regression Fix: Engineering Review

**Review only. No migration prepared yet, no code applied.** Awaiting approval.

> **Resolved since — note added 2026-08-25; the status line above is kept as
> written, because it was true when written.** The migration was written, approved and
> applied: `aiecon_p7_m2d_restore_layer_boundary`, production version
> `20260801185207`.

Fixes the two Economics regressions M2 introduced. **Neither fix touches a
verification check** — the architecture is restored, the tests stay as they are.

---

## 1. How FX conversion returns to `cost_engine`

**The defect.** `econ.v_breakeven_inputs` does `LEFT JOIN cost_engine.fx_rates`
and multiplies by `usd_to_egp` itself. `fx_rates` is inside INV-05's forbidden
set, and — worse than the edge — **econ is implementing FX policy**, which is the
engine's job.

**The fix.** Move the conversion into `cost_engine`, exposed as a pure utility:

```sql
cost_engine.to_egp(p_amount numeric, p_month date) RETURNS numeric   -- STABLE
```

- reads `fx_rates` for `date_trunc('month', p_month)` — the engine's own
  **month-of-occurrence policy (§8.7)**, unchanged and now stated in exactly one
  place;
- returns **NULL when no rate covers the month**, which is what preserves the
  no-partial-conversion rule;
- **never reads `platform_cost_entries`** — it converts a number, so §9.4's
  "platform cost stays outside the Cost Engine" is not breached either.

`econ.v_breakeven_inputs` then calls `cost_engine.to_egp(c.amount, c.period_month)`
and holds **no reference to `fx_rates` at all**. This is precisely the
relationship econ already has with `v_cost_daily.total_cost_egp`: the engine
converts, econ consumes.

### One thing I will not pretend

`P5-01` inspects **view → relation** dependency edges. A view calling a
*function* creates no such edge, so a function-mediated leak **would not be
caught**. If I chose this route merely because the check can't see it, that would
be gaming the test.

I am not claiming that. The justification is that the **conversion logic itself
moves into the engine** — econ stops knowing the rate, the policy and the
month-matching rule. The access path and the ownership both move, not just the
detectability.

**But the blind spot is real**, and I recommend closing it: extend `P5-01` (or
add a sibling) to also flag `econ` objects that call `cost_engine` *functions*
touching the price book. **That is a verification-strengthening change, not a
weakening, and it is out of scope here** — raised for a separate decision so it
is not lost.

*(Rejected alternative: exposing `cost_engine.v_fx_monthly` for econ to read.
That is a passthrough of `fx_rates` under a different name — it would move the
edge without moving the policy, which is worse.)*

---

## 2. The new writer name, and why

`owner_econ_set_platform_cost` → **`owner_write_platform_cost`**

| | |
|---|---|
| Existing namespaces, measured | `owner_econ_*`, `owner_cost_*` — **both read-only, always** |
| Rule preserved | `owner_econ_*` = read-only reporting |
| New namespace | `owner_write_*` = mutation, owner-gated |

`write` states the mutation in the name itself, so a reader needs no convention
knowledge. The prefix is new — deliberately, since there is currently **no
`owner_*` writer anywhere**, so nothing else is disturbed.

`owner_econ_platform_cost_history` **keeps its name**: it is `STABLE`, read-only,
and passes `P5-04` correctly. Only the writer moves.

---

## 3. No existing contract changes

| Contract | Effect |
|---|---|
| `platform_cost_entries` schema | **unchanged** |
| Constraints, indexes, freeze trigger | **unchanged** |
| `econ.v_platform_costs_current` | **unchanged** |
| `econ.net_block_reason()` | **unchanged** |
| `v_breakeven_inputs` **columns** | **unchanged** — 12 columns, same names, types, order. Only the internal expression for `platform_cost_egp` changes |
| `owner_econ_net_profit_series/summary` | **unchanged** |
| `owner_econ_platform_cost_history` | **unchanged** |
| `econ.block_reason()`, `v_pnl_daily`, `owner_econ_pnl`, `owner_econ_pnl_summary` | **untouched** |
| `owner_econ_set_platform_cost` | **dropped** — see below |

**Dropping the writer breaks nothing, and this is measured, not assumed:**

- functions referencing it: **none**
- `admin.html` references: **none** (no UI was built — your ruling)
- rows it has written: **0**

It was applied earlier today and has never successfully executed — it was broken
by `42702` from creation until M2c. **Nothing can depend on it.**

---

## 4. Blast radius

| Object | Operation | Risk |
|---|---|---|
| `cost_engine.to_egp()` | **CREATE** — new | none, nothing calls it yet |
| `econ.v_breakeven_inputs` | `CREATE OR REPLACE VIEW` | low — no column name/type/order change, so its 0 dependents are unaffected |
| `owner_write_platform_cost` | **CREATE** — new | none |
| `owner_econ_set_platform_cost` | **DROP** | none — proven unreferenced, 0 rows written |

**Two dependents of `v_breakeven_inputs`** exist (`owner_econ_net_profit_series`,
`owner_econ_net_profit_summary`). Both select named columns that do not change,
so `CREATE OR REPLACE` cannot break them — and both will be re-executed in the
probe rather than assumed safe.

**Not touched at all:** `platform_cost_entries`, its trigger, its constraints,
`v_platform_costs_current`, `net_block_reason`, `v_pnl_daily`, `block_reason`,
and every Phase 6 surface.

---

## 5. Rollback

```sql
-- 1. restore the writer under its old name (note: restores the 42702 defect
--    unless the M2c-qualified body is used)
--    → re-apply from 20260801_aiecon_p7_m2c_...sql, renamed back
DROP FUNCTION IF EXISTS public.owner_write_platform_cost(date,text,numeric,text,text,text);

-- 2. restore the fx_rates join
CREATE OR REPLACE VIEW econ.v_breakeven_inputs AS <M2b body>;   -- no type change

-- 3. remove the utility
DROP FUNCTION IF EXISTS cost_engine.to_egp(numeric,date);
```

`CREATE OR REPLACE VIEW` suffices in both directions because **no column type
changes**, so no `DROP VIEW` and no dependent rebuild is needed.

**Rollback restores the INV-05 violation**, so it is a last resort — the forward
fix is the correct path.

---

## 6. What this fixes, and what it does not

| Check | Before | After (expected) |
|---|---|---|
| `P5-01` | **FAIL** — 2 of 46 edges hit the price book | **PASS** — 0 edges; econ holds no `fx_rates` reference |
| `P5-04` | **FAIL** — 16 fns, 15 STABLE | **PASS** — 15 fns, 15 STABLE; the writer leaves the namespace |

**Unchanged and still correct:** net profit stays **blocked on every month**,
because `fx_rates` is empty. Moving the conversion does not create a rate.

---

## 7. Proposed sequence

1. Prepare the M2d migration.
2. **Pre-apply probe — including a direct execution probe of
   `owner_write_platform_cost`**, the lesson from M2c.
3. Apply.
4. Re-run **`P5-01`** and **`P5-04`** only.
5. If both pass → full Economics suite → Cost Engine suite → Release Report → stop.

---

## Stop

**No migration prepared, nothing applied.** Awaiting approval of this review.
