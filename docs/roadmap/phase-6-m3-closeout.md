# Phase 6 M3 — Final Closeout

**Status: ✅ CLOSED AND FROZEN, 2026-08-01.** Release gate passed on the first
run, both regression suites clean, repository reconciled with production.

M4 has not been started.

---

## Final state

| | |
|---|---|
| **Branch** | `claude/phase6-m3-economics-sections-4-6` |
| **Final commit** | the branch tip — this closeout's own commit (a file cannot carry its own SHA; `git rev-parse` is authoritative) |
| **Base** | `main` @ `197a0b3` |
| **Supabase project** | `igvkyxkmjnkzscqgommj` |
| **Sections delivered** | 4 Credits Analytics · 5 Package Profitability · 6 Question Cost Analytics |
| **`admin.html`** | built, **NOT deployed** (owner-deferred) |
| **Edge Functions** | none touched — `ai-tutor` untouched (CLAUDE.md §1) |
| **Frozen files** | none touched (CLAUDE.md §2) |

**M3 commit history**

| Commit | What |
|---|---|
| `79ddfed` | M3 r1 — Sections 4–6, `owner_econ_operation_mix()` prepared |
| `f8dca2b` | M3 r2 — `owner_econ_credit_summary()` added; Section 4 headline |
| `5963f9c` | M3 r3 — "credits per question" locked as blocked by design (§5a ADR) |
| `c226395` | Release gate passed — release report |
| *branch tip* | This closeout + documentation reconciliation |

---

## Applied migrations

Both individually owner-approved before `apply_migration` (CLAUDE.md §3).

| Version | Migration | Adds |
|---|---|---|
| `20260801114601` | `aiecon_p6_m3_operation_mix` | `owner_econ_operation_mix()` |
| `20260801114637` | `aiecon_p6_m3_credit_summary` | `owner_econ_credit_summary(date,date)` |

No new tables. No new views. No existing object modified.

**Eleven `aiecon` migrations are now applied in total** (Phases 2–6).

---

## Production state

**Surfaces**

| Measure | Value |
|---|---|
| `owner_econ_*` RPCs | **10** (was 8 before M3) |
| `owner_cost_*` RPCs | 6 |
| `econ` views | 11 |
| `cost_engine` views | 17 |

**Data**

| Measure | Value |
|---|---|
| Priced cost facts | 76, **$0.22961425** — all internal |
| Work items | 27 question + 6 unattributed — all internal |
| Revenue events | 8, **EGP 8,542.00** |
| Credits outstanding | 236,142 |
| P&L days | 383, **all 383 blocked** `no_cost_in_period` |
| Conservation | allocated = priced, variance `0.00000000` |
| Pricing coverage / binding resolution | 100.00% / 100.00% |

**Verification**

| Suite | Result |
|---|---|
| Release gate M3-V1…V8 | **8/8 PASS, first run** |
| `scripts/verify-economics.sql` | **18/18 PASS** (`P5-17` invoked 10 RPCs, 0 raised) |
| `scripts/verify-cost-engine.sql` read-only | **25 PASS, 1 WARN** (`P4-31`) |
| `scripts/verify-cost-engine.sql` P4-24…P4-28 | not run — write-path |

**Backward compatibility** — proven by output. Digests bit-identical to the M2
closeout across the whole gate:

| Object | Rows | Digest |
|---|---|---|
| `owner_econ_pnl()` | 383 | `77a987f03f50f30e332d43a97546b96d` |
| `econ.v_breakeven_inputs` | 14 | `75df5a9c9b53190c9787bf12bdd49931` |
| `econ.v_coverage` | 6 | `b51a582fab0756cb6ce4b21cc5d3ca1f` |
| `econ.v_pnl_daily[1-9]` | 383 | `464a53439e4a3335b96c3677433c5ace` |

Sections 5 and 6 render blocked-with-reason because external cost is zero: all
telemetry is internal and business metrics exclude it (INV-25). Correct
fail-closed behaviour; unblocks with no code change when external traffic
arrives.

---

## The locked M3 architectural decision

`avg_credits_per_question` is **blocked by design**, not unfinished.

The Economics layer has exactly one definition of a question — the external
cost work item — and `public.question_records` must **never** be used as its
denominator, because that would put two different definitions of "question" on
one dashboard. The KPI renders `—` with `no_external_question_work_items` and
publishes `questions_external = 0` beside it so the blocked state evidences
itself.

Full ADR: `phase-6-m3-engineering-review.md` §5a. Enforced in four places: the
migration header, the `qwi` CTE comment, the `admin.html` render site, and the
ADR.

---

## Housekeeping performed at closeout

| File | Correction |
|---|---|
| `20260801_aiecon_p6_m3_operation_mix.sql` | `PREPARED, NOT APPLIED` → applied, `20260801114601`, with post-apply verification |
| `20260801_aiecon_p6_m3_credit_summary.sql` | `PREPARED, NOT APPLIED` → applied, `20260801114637`, with post-apply verification |
| `phase-6-m3-engineering-review.md` | `NOTHING APPLIED` → superseded by application; §7 marked executed; stop point marked historical |
| `ai-economics.md` | Phase 6 status now M1/M2/**M3** complete; both M3 migrations added to the table; gate outcome and the locked decision recorded |

**Verified clean:** no remaining `PREPARED, NOT APPLIED` marker anywhere in
`supabase/migrations/` or `docs/` except inside the M2 and M3 closeout records
of what was corrected, which are intentional history.

---

## Remaining known issues

None blocking. None introduced by M3.

| # | Issue | Owner action | Impact |
|---|---|---|---|
| 1 | **All prices are unverified list prices** — 76/76 facts, 100% of cost `modeled` (`P4-31` WARN) | verify against a real invoice | every derived figure correctly reports `modeled` under INV-27 |
| 2 | **No USD→EGP FX rate** | supply a rate | profit cannot be computed in any currency; deliberately not invented |
| 3 | **`platform_cost_entries` absent** (§9.4) | Phase 7 | net profit and break-even stay blocked |
| 4 | **`v_revenue_recognized_daily` scaling ceiling** — 500 annual subs → 182,500 intermediate rows | Phase 7/8 materialised table | pre-existing; M3 neither creates nor worsens it |
| 5 | **`admin.html` not deployed** | owner-deferred to a larger UI milestone | Sections 1–6 exist in the repo, unreachable in production |
| 6 | **`P4-24`–`P4-28` unrun** | run when a write-path window is acceptable | passed at the Phase 4 gate; unverified in M2/M3 sessions |
| 7 | **`econ.v_lesson_economics` has no RPC** | M4, Section 7 | not reachable by the dashboard |
| 8 | `avg_credits_per_question` blocked | **none — locked decision** | listed so it is never mistaken for an open defect |

---

## Standing constraints, all honoured

- `ai-tutor` never deployed via the inline MCP tool (CLAUDE.md §1)
- No frozen file touched (CLAUDE.md §2)
- Every migration individually approved before `apply_migration` (CLAUDE.md §3)
- No unrelated changes; no hidden fixes; one feature at a time
- `admin.html` not deployed, per explicit owner instruction

---

## Freeze

**M3 is frozen.** No further changes to the Economics layer, its migrations,
verification scripts, or documentation unless a new issue is discovered.

M4 branches from `main` and does not begin implementation until its plan is
reviewed and approved.
