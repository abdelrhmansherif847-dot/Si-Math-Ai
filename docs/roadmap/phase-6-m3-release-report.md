# Phase 6 M3 — Release Report

**Status: ✅ GATE PASSED, 2026-08-01.** All eight validations passed on the
first run. Both regression suites clean. M4 not started.

| | |
|---|---|
| **Branch** | `claude/phase6-m3-economics-sections-4-6` |
| **Base** | `main` @ `197a0b3` |
| **Supabase project** | `igvkyxkmjnkzscqgommj` |
| **Sections delivered** | 4 (Credits Analytics), 5 (Package Profitability), 6 (Question Cost Analytics) |
| **`admin.html`** | built, **NOT deployed** (owner-deferred) |
| **Edge Functions** | none touched — `ai-tutor` untouched (CLAUDE.md §1) |
| **Frozen files** | none touched (CLAUDE.md §2) |

---

## Applied migrations

Both individually owner-approved before `apply_migration` (CLAUDE.md §3).

| Version | Migration | Adds |
|---|---|---|
| `20260801114601` | `aiecon_p6_m3_operation_mix` | `owner_econ_operation_mix()` |
| `20260801114637` | `aiecon_p6_m3_credit_summary` | `owner_econ_credit_summary(date,date)` |

No new tables. No new views. No existing object modified. `owner_econ_*`
function count 8 → 10.

---

## M3-V1 … M3-V8

| # | Validation | Result | Evidence |
|---|---|---|---|
| **V1** | Existing surfaces unchanged | **PASS** | 4 digests bit-identical to the M2 closeout |
| **V2** | New RPCs callable and correct | **PASS** | `operation_mix` identical to source view; `credit_summary` totals reconcile with every source |
| **V3** | Owner gate holds | **PASS** | `anon` denied; both STABLE+SECDEF+gated; gate **fires** `42501` for a real non-owner |
| **V4** | No client-side financial calculation | **PASS** | 0 matches across 10 patterns |
| **V5** | Every number is a typed column | **PASS** | 53/53 rendered fields declared |
| **V6** | Blocked states carry reasons | **PASS** | 4 sub-checks, incl. the §5a ADR enforced exactly |
| **V7** | INV-25 upheld | **PASS** | internal data exists and is actively withheld |
| **V8** | No regression | **PASS** | 18/18 economics |

### V1 — digests unchanged

| Object | Rows | Digest |
|---|---|---|
| `owner_econ_pnl()` | 383 | `77a987f03f50f30e332d43a97546b96d` |
| `econ.v_breakeven_inputs` | 14 | `75df5a9c9b53190c9787bf12bdd49931` |
| `econ.v_coverage` | 6 | `b51a582fab0756cb6ce4b21cc5d3ca1f` |
| `econ.v_pnl_daily[1-9]` | 383 | `464a53439e4a3335b96c3677433c5ace` |

### V2 — the new surfaces

`owner_econ_operation_mix()`: 0 rows, identical to `econ.v_operation_service_mix`.
Zero is correct — external cost is zero.

`owner_econ_credit_summary()`, every total reconciled against its own source:

| KPI | Value | Reconciles with |
|---|---|---|
| Credits sold | 220,500 | `econ.v_revenue_events.credits_granted` |
| Credits granted | 94,500 | `v_credit_flow` GRANT + ADMIN_ADJUST |
| Credits refunded | 15 | `v_credit_flow` REFUND |
| Credits consumed | 1,908 | `v_credit_flow` CONSUME |
| Net change | 92,607 | `v_credit_flow` total |
| Outstanding (snapshot) | 236,142 | `profiles.credits_balance` |
| Active students | 7 | distinct CONSUME users |
| Avg per student | **272.57** | not 272 — integer-division cast holds |
| Avg daily burn | 43.36 | |
| Runway | 5,445.6 days | |

### V3 — the gate actually fires

Not merely declared. A real non-owner profile was impersonated and both RPCs
raised:

```
42501  forbidden: owner_econ_operation_mix requires role owner
42501  forbidden: owner_econ_credit_summary requires role owner
```

### V6 — blocked states, including the locked ADR

| Metric | Value | Reason | Badge |
|---|---|---|---|
| `cost_per_credit_usd` | NULL | `no_external_ai_cost_in_period` | `blocked` |
| `avg_credits_per_question` | NULL | `no_external_question_work_items` | `blocked` |
| credit metrics | populated | — | **`actual`** |
| Section 5 packages | 2/2 blocked | per-row reason, profit+margin NULL | `blocked` |

The §5a ADR is enforced by the data exactly as written, and
`questions_external = 0` is published beside it so the blocked state evidences
itself. Owner rule 1 holds: two blocked cost-derived figures did **not** drag
the credit metrics below `actual`.

### V7 — INV-25 upheld, and demonstrably so

The strong form: internal data **exists** and is withheld, rather than the
surfaces being trivially empty.

| Check | Observed |
|---|---|
| Coverage split | ext `$0` + int `$0.22961425` = tot `$0.22961425` |
| `operation_mix` | 0 rows returned, 11 operation/service pairs exist in all-traffic |
| `owner_cost_metrics` default | `p_include_internal = false`; 0 rows by default, >0 with internal |
| `credit_summary` | `questions_external = 0` while 27 internal work items exist |

---

## Regression suites

### Economics — `scripts/verify-economics.sql`: **18/18 PASS**

`P5-04` now covers **10** functions (was 8), all STABLE + SECURITY DEFINER +
owner-gated. **`P5-17` automatically picked up both new RPCs — 10 invoked, 0
raised** — the self-extending behaviour it was built for in M2, working as
designed with no edit to the suite.

### Cost Engine — `scripts/verify-cost-engine.sql`: **25 PASS, 1 WARN**

| | |
|---|---|
| Conservation | allocated = priced = `0.22961425`, variance `0.00000000` |
| Pricing coverage | 100.00% |
| Binding resolution | 100.00% |
| `P4-31` | **WARN** — 76/76 facts list-priced, 100% of cost `modeled` |

`P4-31` is the known carried-forward item awaiting invoice verification, not a
regression. Identical to M2.

`P4-24`–`P4-28` not run — they exercise write paths against production.

---

## Production state after M3

| Measure | Value |
|---|---|
| `owner_econ_*` RPCs | 10 |
| `owner_cost_*` RPCs | 6 |
| Priced cost facts | 76, **$0.22961425**, all internal |
| Work items | 33 (27 question + 6 unattributed), all internal |
| Revenue events | 8, **EGP 8,542** |
| Credits outstanding | 236,142 |
| P&L days | 383, all blocked `no_cost_in_period` |

Sections 5 and 6 render blocked-with-reason because external cost is zero.
Correct fail-closed behaviour under the owner's four locked rules; unblocks
with no code change when external traffic arrives.

---

## Known issues carried forward

None blocking, none new.

| # | Issue | Owner action |
|---|---|---|
| 1 | All prices list-priced (`P4-31`) — 100% `modeled` | verify against an invoice |
| 2 | No USD→EGP FX rate | supply a rate |
| 3 | `platform_cost_entries` absent (§9.4) — break-even blocked | Phase 7 |
| 4 | `v_revenue_recognized_daily` scaling ceiling | Phase 7/8 |
| 5 | `admin.html` not deployed | owner-deferred |
| 6 | `P4-24`–`P4-28` unrun (write-path) | run when acceptable |
| 7 | `avg_credits_per_question` blocked **by design** (§5a ADR) | none — locked decision, not an issue to fix |
| 8 | `econ.v_lesson_economics` has no RPC | Section 7 → M4 |

---

## What the gate proved about the process

M2's gate failed at V7 on a latent defect. M3's passed at every step — and the
reason is traceable: the **pre-apply type probe** introduced after M2 caught
four instances of the same defect class in `owner_econ_credit_summary()`
(`credits_granted`, `credits_refunded`, `credits_consumed`, `net_change` all
yielding `numeric` against a `bigint` declaration) **before** anything was
applied. Left alone they would have failed this gate exactly as M2's did.

`P5-17`, added in M2 as the systemic fix, then covered both new RPCs
automatically with no edit — because it discovers them from the catalog.

Two defences added in response to one failure, both demonstrably working.

---

## Stop point

**M3 is complete. M4 not started.** No further changes to the Economics layer,
migrations, verification scripts, or documentation without a new instruction.
