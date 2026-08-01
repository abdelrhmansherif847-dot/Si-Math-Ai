# Phase 6 M4.1 — Release Report

**Status: ✅ GATE PASSED, 2026-08-01.** All eight validations passed on the
first run. Both regression suites clean. M4.2 not started.

| | |
|---|---|
| **Branch** | `claude/phase6-m4-economics-sections-7-9` |
| **Base** | `main` @ `44b2175` |
| **Supabase project** | `igvkyxkmjnkzscqgommj` |
| **Section delivered** | 7 — Lesson Economics |
| **`admin.html`** | built, **NOT deployed** |
| **Edge Functions / frozen files** | none touched |

---

## Applied migration

| Version | Migration | Adds |
|---|---|---|
| `20260801121050` | `aiecon_p6_m4_lesson_economics` | `owner_econ_lesson_economics()` |

No new tables. No new views. **No existing object modified.**
`owner_econ_*` count 10 → 11.

---

## M4.1-V1 … V8

| # | Validation | Result |
|---|---|---|
| **V1** | Existing surfaces unchanged | **PASS** — 4 digests bit-identical |
| **V2** | **`econ.v_lesson_economics` unchanged** | **PASS** — 3 sub-checks |
| **V3** | New RPC callable and correct | **PASS** — 7 sub-checks incl. the populated path |
| **V4** | Owner gate | **PASS** — gate fires `42501` |
| **V5** | No client-side calculation | **PASS** — 0 matches |
| **V6** | Every number a typed column | **PASS** — 12/12 |
| **V7** | Blocked state carries a reason | **PASS** |
| **V8** | No regression | **PASS** — 18/18 |

### V2 — the owner decision, proven three ways

| Check | Pre | Post | Verdict |
|---|---|---|---|
| View **definition** digest | `8e88c98f471e2d15e3d3fdf9360d2c01` | identical | PASS |
| View **columns** | 7 / `34edbec5…` | identical | PASS — no `display_name` added |
| View references taxonomy? | expected: no | **no taxonomy reference** | PASS — the join lives in the RPC |

### V3 — including the path production data cannot reach

V3a–V3c passed, but V3b compared **zero rows** — the RPC correctly returns
nothing because `v_lesson_economics` excludes internal traffic and all
telemetry is internal. A vacuous pass is not evidence, so the join and cast
were additionally exercised over the engine data that does exist:

| Sub-check | Observed | Verdict |
|---|---|---|
| V3a callable, row count matches view | 0 rpc / 0 view | PASS |
| V3b money columns identical | (0 rows — vacuous, hence V3d–V3g) | PASS |
| V3c declared shape | 10 columns | PASS |
| **V3d** LEFT JOIN preserves row count | **4 src → 4 joined** | PASS — no fan-out, no drop |
| **V3e** names resolve | **4 named / 0 unmapped** | PASS |
| **V3f** `::bigint` exact on real values | `1→1, 1→1, 2→2, 1→1` | PASS — round-trips exactly |
| **V3g** unmapped branch survives | 1 row for an unmapped key | PASS — kept with NULL name |

### V7 — blocked, and honestly so

RPC returns 0 rows; the panel's reason is derived from
`owner_econ_coverage()`'s typed columns — `value_external = 0`,
`value_internal = 0.22961425` — never composed as prose in the client.

---

## Regression suites

### Economics — **18/18 PASS**

`P5-04` now covers **11** functions, all `STABLE` + `SECURITY DEFINER` +
owner-gated. **`P5-17` picked up the new RPC automatically — 11 invoked, 0
raised** — with no edit to the suite, for the second milestone running.

### Cost Engine — **25 PASS, 1 WARN**

| | |
|---|---|
| Conservation | allocated = priced = `0.22961425`, variance `0.00000000` |
| Coverage / binding resolution | 100.00% / 100.00% |
| `P4-31` | **WARN** — 76/76 list-priced, the known carried-forward item |

`P4-24`–`P4-28` not run — write-path.

---

## The pre-apply probe, third milestone running

Before applying, the probe reported 10/10 — **but only because of one cast**,
and that was verified rather than assumed. The same probe without `::bigint` on
`questions` yields `numeric` against a `bigint` declaration:

> CONFIRMED: without the cast this RPC would raise `42804`.

`v_lesson_economics.questions` is `sum(work_items)` over `bigint`, which widens
to `numeric` — the M2 defect class, caught before apply for the third milestone
in a row.

That makes three consistent applications of one rule — *cast only when the
source type genuinely differs and the cast cannot lose information*:

| RPC | Source | Cast? |
|---|---|---|
| `owner_econ_operation_mix()` | `count(*)` → bigint | no |
| `owner_econ_credit_summary()` | `sum(bigint)` → numeric | yes |
| `owner_econ_lesson_economics()` | `sum(bigint)` → numeric | yes |

---

## Production state after M4.1

| Measure | Value |
|---|---|
| `owner_econ_*` RPCs | **11** |
| `owner_cost_*` RPCs | 6 |
| `aiecon` migrations applied | 12 |
| Priced cost facts | 76, `$0.22961425`, all internal |
| Revenue events | 8, EGP 8,542 |
| P&L days | 383, all blocked `no_cost_in_period` |

Section 7 renders blocked-with-reason: `v_lesson_economics` excludes internal
traffic (INV-25) and all telemetry is internal. Correct fail-closed behaviour;
unblocks with no code change.

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
| 7 | `avg_credits_per_question` blocked by design (M3 §5a ADR) | none — locked decision |
| 8 | Section 7's populated path unexercised in production | resolves when external traffic arrives; join/cast verified against engine data (V3d–V3g) |

---

## Stop point

**M4.1 is complete.** M4.2 (Student Consumption) not started. No further changes
to the Economics layer without a new instruction.
