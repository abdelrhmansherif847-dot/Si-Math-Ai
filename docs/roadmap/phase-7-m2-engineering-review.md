# Phase 7 M2 — Engineering Review

**Status: implemented, PROBED, NOTHING APPLIED.** Two migrations are prepared
and unapplied. No database object was created or modified. No release gate has
begun. `main` untouched.

> **Resolved since — note added 2026-08-25; the status line above is kept as
> written, because it was true when written.** Both were applied:
> `aiecon_p7_m2a_platform_cost_entries` (`20260801182954`) and
> `aiecon_p7_m2b_net_profit` (`20260801183045`). `public.platform_cost_entries`
> exists in production, verified 2026-08-25.

Branch `claude/phase7-simulator-breakeven`.

| | |
|---|---|
| Migrations prepared | 2 — **neither applied** |
| Database objects changed | **0** |
| Pre-apply probe | **run — caught a real defect** (§1) |
| Probe assertions | 17 PASS, 2 corrected, 6 resolver branches PASS |
| Existing RPCs / views modified outside scope | **0** |
| `admin.html` | untouched |
| `v_pnl_daily` | **untouched** |

---

## 1. The probe caught a defect in my own design — before it was applied

**This is the headline, and it is the reason the mandatory probe exists.**

The design document §6 specified the revision sequence as:

1. insert the new revision, then
2. mark the old row superseded.

**That order cannot execute.** The probe reproduced it exactly:

```
ERROR: 23505 duplicate key value violates unique constraint "pce_one_current"
DETAIL: Key (period_month, category)=(2026-07-01, supabase) already exists.
```

**Root cause.** `pce_one_current` is a **partial** unique index. PostgreSQL
enforces it immediately, and a partial `UNIQUE INDEX` **cannot be made
`DEFERRABLE`** — only a true `UNIQUE` *constraint* can, and constraints cannot
be partial. Inserting first leaves two rows with `is_current = true` for one
key for an instant, which is exactly what the index forbids.

**Every correction would have failed in production.** Not a subtle inaccuracy —
the feature simply would not work.

**Fix, applied to both artefacts:** supersede first, then insert. Safe because
the two statements share one transaction: a failed insert rolls the supersede
back with it, so the table can never hold a superseded row with no replacement.

- `owner_econ_set_platform_cost` reordered, with the reasoning in the code.
- Design document §6 corrected, annotated with a dated note rather than silently
  rewritten.

The corrected order was then re-probed and passes (**P04**).

---

## 2. What was built

### M2a — `20260801_aiecon_p7_m2a_platform_cost_entries.sql`

| Object | Purpose |
|---|---|
| `public.platform_cost_entries` | the table — Alternative A, in-row supersede |
| 8 CHECK constraints + 2 partial unique indexes | ruling ③ |
| `public.freeze_platform_cost_entry()` + trigger | immutability enforced by the database |
| `econ.v_platform_costs_current` | **the only sanctioned read surface** |
| `econ.platform_cost_available()` | **rewritten** — tests usable data, not table existence |
| `public.owner_econ_set_platform_cost(...)` | the module's first writer, `VOLATILE`, owner-gated |
| `public.owner_econ_platform_cost_history(...)` | audit surface, returns superseded rows |

### M2b — `20260801_aiecon_p7_m2b_net_profit.sql`

| Object | Purpose |
|---|---|
| `econ.net_block_reason(...)` | **sibling** resolver (decision D1) — composes `block_reason()`, zero blast radius |
| `econ.v_breakeven_inputs` | extended: real `platform_cost_egp` + 4 appended columns |
| `public.owner_econ_net_profit_series(...)` | monthly series (decision D5) |
| `public.owner_econ_net_profit_summary(...)` | period summary, one row (decision D5) |

---

## 3. Every decision, and where it is enforced

| Decision | Enforcement |
|---|---|
| **D1** sibling resolver | `econ.net_block_reason()` created; `econ.block_reason()` **byte-unchanged**; its 4 callers untouched |
| **D2** no FORCE RLS | `REVOKE ALL` from PUBLIC/anon/authenticated + `ENABLE ROW LEVEL SECURITY` with **no permissive policy**. `FORCE` deliberately absent |
| **D3** keep `change_reason` | column present; `CHECK (revision_number = 1 OR change_reason IS NOT NULL)`; RPC raises a readable error before the constraint fires |
| **D4** `amount > 0` | `CONSTRAINT pce_amount_positive CHECK (amount > 0)` — probed, refuses `-5` |
| **D5** two explicit RPCs | `owner_econ_net_profit_series` + `owner_econ_net_profit_summary`; **no grain parameter anywhere** |
| **D6** `platform_cost_egp` NULL → real | happens only when a **current** entry exists; empty table keeps it NULL and blocked |
| ⑤ monthly only | `v_pnl_daily` untouched; **no allocation code exists in either migration** |
| ④ no FX shortcut | any unconvertible entry makes the whole month NULL — probed (**P11**) |
| ⑦ owner only | REVOKE + RLS + `has_role_at_least('owner')` on all four RPCs |

---

## 4. Pre-apply probe — method and results

Run inside `BEGIN … ROLLBACK`, the project's own Section E pattern. **Production
verified untouched afterwards**: table absent, view absent, resolver absent, RPCs
absent, `platform_cost_available()` still the original body, `v_breakeven_inputs`
still 8 columns, 16 `aiecon` migrations.

Because the objects genuinely exist inside the transaction, the RPCs were
**executed** — the only way to catch the `42804` class, which `CREATE` never
validates.

| # | Assertion | Result |
|---|---|---|
| PROBE-1 | `v_breakeven_inputs` columns 1–8 unchanged in name, type, order | **PASS** — `CREATE OR REPLACE` would have refused otherwise |
| P01 | `owner_econ_net_profit_series()` executes | **PASS** — 14 rows |
| P02 | `owner_econ_net_profit_summary()` executes | **PASS** — 1 row |
| P04 | supersede-then-insert works | **PASS** |
| P05a | raw table sum after a correction | **55.00 — inflated, the hazard demonstrated** |
| P05b | sanctioned view sum | **PASS — 30.00** |
| P06 | DELETE refused | **PASS** — `42501` |
| P07 | `amount` UPDATE refused | **PASS** — `42501` |
| P08 | reactivating a superseded row refused | **PASS** — `42501` |
| P09 | second current row for one key refused | **PASS** — `23505` |
| P11 | no partial conversion — month total NULL | **PASS** |
| P12a–e | all five CHECK constraints fire | **PASS** — `23514` ×5 |
| P13 | EGP entry converts with no FX rate | **PASS** — 500.00 |

**P05a is the most valuable line in this review.** It demonstrates the
double-counting hazard on real objects: after correcting July from 25 to 30, the
raw table sums to **55**, while the sanctioned view correctly returns **30**.
Ruling ② requirement 5 asked for this to be explicit; it is now measured, not
asserted.

### Two assertions I got wrong, and what they revealed

**P03 and P10 initially reported FAIL/CHECK.** Both expected a platform-specific
block reason and received `no_cost_in_period`.

**The code is right; my assertions were too specific.** `net_block_reason()`
composes: it returns the *gross* reason first, and every month is currently
gross-blocked because there is no external AI cost. So gross precedence
correctly wins.

**But this revealed something worth stating**: on current production data the
three platform-specific reasons are **unreachable**, because gross blocking
always fires first. They would have been shipped unexercised — the exact
"vacuous" class the verification-framework cycle addressed.

So the resolver was tested **directly**, with gross-complete inputs, following
the `P5-06`/`P5-13` precedent of literal-input function tests:

| Scenario | Reason returned | Verdict |
|---|---|---|
| R1 empty table | `no_platform_cost_source` | **PASS** |
| R2 entries exist, none this month | `no_platform_cost_in_period` | **PASS** |
| R3 entry unconvertible | `no_fx_for_platform_cost` | **PASS** |
| R4 all inputs complete | NULL — unblocked | **PASS** |
| R5 gross blocked + platform fine | `no_cost_in_period` | **PASS — precedence correct** |
| R6 NULL total, no named cause | `no_platform_cost_in_period` | **PASS — never silently zero (INV-23)** |

**All six branches proven reachable**, including the unblocked path that
production data cannot currently reach.

---

## 5. Architectural invariants

| Invariant | Evidence |
|---|---|
| **INV-05 / §8.10 r8** — layer boundary | neither migration adds any `cost_engine` → `econ` or `cost_engine` → `platform_cost_entries` reference; the read is econ → `cost_engine.fx_rates` only, which already exists |
| **INV-07** read-only reporting | all reporting functions `STABLE`; the single writer is `VOLATILE` **by necessity** and is a cost *input* writer, the documented §9.4 exception |
| **INV-23** unknown is NULL, never 0 | `no partial conversion` (P11); R6 branch; `NULLIF(revenue,0)` on margin |
| **INV-26** never silently drop | the whole month goes NULL rather than summing convertible rows only |
| **INV-27** confidence never upgraded | `net_confidence = worst(gross, 'actual')`; blocked ⇒ `worst(NULL)` = blocked |
| **INV-03** no client calculation | no `admin.html` change in M2 at all |
| **§9.4** gross never reported as net | `block_reason`/`confidence` keep their meaning; net gets its **own** `net_block_reason`/`net_confidence` |

---

## 6. Risks

| # | Risk | Assessment |
|---|---|---|
| 1 | **Nothing is applied** | both migrations prepared only |
| 2 | Double-counting | mitigated four ways; hazard demonstrated and the view proven correct (P05) |
| 3 | Rollback window closes once real data is entered | documented in both the migration header and §13 of the design; **apply and populate as separate steps** |
| 4 | Platform block reasons unreachable in production | proven by direct resolver test instead; recorded as a known limitation |
| 5 | `v_breakeven_inputs` has 2 dependents | `CREATE OR REPLACE` changes no column type, so no dependent breaks; verified columns 1–8 identical |
| 6 | Net profit stays blocked after M2 | **expected and correct** — needs FX (ruling ④). Must be stated in the release report so it is not read as a defect |

---

## 7. Proposed M2 Release Gate — **not run**

| # | Validation |
|---|---|
| M2-V1 | Apply M2a; confirm state; existing surfaces' digests unchanged |
| M2-V2 | `econ.block_reason()` **byte-identical**; its 4 callers unchanged |
| M2-V3 | `v_breakeven_inputs` columns 1–8 identical in name, type, order, and **value** where not platform-derived |
| M2-V4 | Immutability: DELETE / UPDATE / reactivation all refused; supersede succeeds |
| M2-V5 | All CHECK constraints fire — one negative control each |
| M2-V6 | Security: `anon` and `authenticated` denied **by grant** and **by policy**, proven independently; owner RPC succeeds |
| M2-V7 | Double-counting: view total ≠ raw total after a correction; every consumer uses the view |
| M2-V8 | All six `net_block_reason` branches reachable |
| M2-V9 | Regression: Economics 17 PASS + 1 VACUOUS; Cost Engine 20 PASS + 5 VACUOUS + 1 WARN |

---

## 8. One open question

**M2a creates the table but nothing populates it.** Entering real invoice data is
an owner action, not a migration — and once entered, the rollback window closes
(§13). I have deliberately **not** written any seed data, and there is no
`admin.html` UI for entry in M2.

**How do you want to enter the first real platform costs — directly via
`owner_econ_set_platform_cost(...)`, or should a Section 12 UI come first?**
This does not block applying M2, but it determines whether M2 ships a table the
owner cannot yet reach from the dashboard.

---

## Stop

Implementation and this review are complete. **Nothing applied, no release gate,
no deployment, no M3 work.** Awaiting owner review and approval before any
migration is applied.
