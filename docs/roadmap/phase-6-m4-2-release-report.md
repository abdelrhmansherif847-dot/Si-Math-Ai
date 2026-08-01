# Phase 6 M4.2 — Release Report

**Status: ✅ GATE PASSED, 2026-08-01** — after one failure at V4 that was
investigated, root-caused, fixed and re-verified. Both regression suites clean.
M4.3 not started.

| | |
|---|---|
| **Branch** | `claude/phase6-m4-2-student-consumption` |
| **Base** | `main` @ `067d3c8` |
| **Supabase project** | `igvkyxkmjnkzscqgommj` |
| **Section delivered** | 8 — Student Consumption Analytics |
| **`admin.html`** | built, **NOT deployed** |
| **Edge Functions / frozen files** | none touched |

---

## Applied migrations

| Version | Migration | Effect |
|---|---|---|
| `20260801124707` | `aiecon_p6_m4_2_student_consumption` | `owner_econ_student_economics` 10 → 19 cols (DROP + recreate) |
| `20260801124835` | `aiecon_p6_m4_2_student_service_mix` | new `owner_econ_student_service_mix()` |
| `20260801130230` | `aiecon_p6_m4_2_student_consumption_full_join_fix` | **root-cause fix found by V4** |

No new tables. No new views. `econ.v_student_economics` untouched.
`owner_econ_*` 11 → 12.

---

## The V4 failure — what it caught and why it mattered

**V4 failed on first run.** The per-student assertion passed, but the totals
disagreed: **RPC 1,828 credits vs source 1,908.**

My check had been too weak — it only compared students *present* in the RPC, so
it was structurally incapable of seeing a student who was **absent**. The same
vacuous-pass shape caught in M4.1, and the totals line is what exposed it.

**Root cause.** The row set was driven by `econ.v_student_economics`, which is
itself `revenue FULL JOIN cost`. A student who consumed credits but has
**neither revenue nor cost** does not exist in it. Section 8 — a panel about
consumption — was therefore hiding real consumers.

| Measure | Before | After |
|---|---|---|
| Students listed | 7 | **9** |
| Credits reported | 1,828 | **1,908** |
| Consumers hidden | **2 of 9** | 0 |
| Consumption unreported | **4.2%** | 0% |

**Fix — root cause only.** `FULL JOIN` consumption into the row set: Section 8's
population is revenue ∪ cost ∪ **consumption**. The two consumption-only
students now appear with their credits, and — because they have no view row —
their `block_reason` and `confidence` are resolved from
`econ.block_reason()` / `worst_confidence()` directly rather than emitting a
NULL reason, which would have breached owner rule 3.

The view stays canonical for revenue/cost/profit (Decision 3). The fix widens
**who is listed**, never what their money figures say — proven by V4d.

This is the same principle as M4.1's `LEFT JOIN`: never silently drop a row
carrying a real quantity (INV-26).

---

## M4.2-V1 … V8

| # | Validation | Result |
|---|---|---|
| **V1** | Existing surfaces unchanged | **PASS** — 4 digests bit-identical |
| **V2** | `econ.v_student_economics` unchanged | **PASS** — 3 sub-checks |
| **V3** | Positions 1–10 preserved through the DROP | **PASS** — 19 columns verified |
| **V4** | RPCs callable; totals reconcile | **FAIL → fixed → PASS** — 6 sub-checks |
| **V5** | Owner gate | **PASS** — `42501` on both |
| **V6** | **No PII exposed** | **PASS** — 3 sub-checks |
| **V7** | Blocked states carry reasons | **PASS** — 4 sub-checks |
| **V8** | No regression | **PASS** — 18/18 |

### V2 — the view is untouched

| Check | Result |
|---|---|
| Definition digest | `b103129c37b63d67ae0e1fdb32cdc8fc` — **byte-identical** |
| Column shape | 10 columns, `da15384d…` — unchanged |
| References `credit_transactions`? | **no** — credits logic lives in the RPC |

### V3 — the DROP broke no contract

All 10 original positions preserved in name and type; 9 appended at 11–19.

### V4 — after the fix

| Sub-check | Observed |
|---|---|
| Population = revenue ∪ cost ∪ consumption | **9 = 9** (view alone had 7) |
| Credits reconcile, totals **and** per student | **1,908 = 1,908**, no consumer missing |
| `period_days` shared calendar span | 1 distinct value, **44**, matches source |
| Positions 1–10 values unchanged | the widening altered no existing value |
| Consumption-only rows carry a reason | 2 rows, each stating a reason and `blocked` |
| `student_service_mix` | 0 rows — zero external work items, correct |

### V6 — Decision 1 enforced at the database, not just the panel

| Check | Result |
|---|---|
| Identifying output columns | **0** |
| Either body reads `profiles`? | **no** |
| `full_name` / `email` / `rank_name` tokens in either body | **0** |

### V7 — blocked behaviour

| Check | Observed |
|---|---|
| `usage_anomaly` | NULL / `insufficient_population` / `blocked` on every row |
| Blocked rows | 9/9 carry a reason, profit and flag NULL, never zeroed |
| Credits independent of cost | `credits_confidence = actual` while `confidence = blocked` |
| `avg_cost_per_question_usd` | never derived without cost — no silent zero |

---

## Regression suites

### Economics — **18/18 PASS**

`P5-04` now covers **12** functions, all `STABLE` + `SECURITY DEFINER` +
owner-gated. **`P5-17` picked up both new surfaces automatically — 12 invoked,
0 raised** — third milestone running with no edit to the suite.

### Cost Engine — **25 PASS, 1 WARN**

Conservation exact: allocated = priced = `0.22961425`, variance `0.00000000`.
Coverage and binding resolution 100.00%. `P4-31` is the known list-price WARN.
`P4-24`–`P4-28` not run — write-path.

---

## The pre-apply probe, fifth milestone running

Before applying, the probe **failed at position 13**: `period_days` yielded
`integer`, not `bigint`, because `date - date` returns `integer` in PostgreSQL.
A **different trap** from the `sum(bigint) → numeric` family that caught M2, M3
and M4.1 — one that reasoning by analogy would have missed. Fixed with
`::bigint`; re-probed 19/19, and again 19/19 after the V4 fix.

**Five consecutive milestones in which the probe caught a real defect before
apply.** It did not, however, catch the V4 population defect — a probe verifies
*types*, not *semantics*. Both layers of checking earned their place here.

---

## Production state after M4.2

| Measure | Value |
|---|---|
| `owner_econ_*` RPCs | **12** |
| `owner_cost_*` RPCs | 6 |
| `aiecon` migrations applied | 15 |
| Students listed in Section 8 | **9** |
| Credits consumed | **1,908** over a 44-day span |
| Priced cost facts | 76, `$0.22961425`, all internal |
| P&L days | 383, all blocked |

---

## Known issues carried forward

None blocking, none new.

| # | Issue | Owner action |
|---|---|---|
| 1 | All prices list-priced (`P4-31`) | verify against an invoice |
| 2 | No USD→EGP FX rate | supply a rate |
| 3 | `platform_cost_entries` absent (§9.4) | Phase 7 |
| 4 | `v_revenue_recognized_daily` scaling ceiling | Phase 7/8 |
| 5 | `admin.html` not deployed | owner-deferred |
| 6 | `P4-24`–`P4-28` unrun (write-path) | run when acceptable |
| 7 | `avg_credits_per_question` blocked by design (M3 §5a ADR) | none — locked |
| 8 | `usage_anomaly` blocked — `insufficient_population` (n=7, needs 30) | none — unblocks from data |
| 9 | Section 8's cost half unexercised; anomaly's unblocked branch unexercised by construction | resolves as data arrives |

---

## Stop point

**M4.2 is complete.** M4.3 (AI Service & Model Analytics) not started. No
further changes to the Economics layer without a new instruction.
