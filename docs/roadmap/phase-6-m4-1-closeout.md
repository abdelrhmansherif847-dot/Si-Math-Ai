# Phase 6 M4.1 — Final Closeout

**Status: ✅ CLOSED, 2026-08-01.** Release gate passed on the first run, both
regression suites clean, repository reconciled with production.

M4.2 has not been started, planned, or scoped.

---

## Final state

| | |
|---|---|
| **Branch** | `claude/phase6-m4-economics-sections-7-9` |
| **Final commit** | the branch tip — this closeout's own commit (`git rev-parse` is authoritative) |
| **Base** | `main` @ `44b2175` |
| **Supabase project** | `igvkyxkmjnkzscqgommj` |
| **Section delivered** | 7 — Lesson Economics |
| **`admin.html`** | built, **NOT deployed** (owner-deferred) |
| **Edge Functions** | none touched — `ai-tutor` untouched (CLAUDE.md §1) |
| **Frozen files** | none touched (CLAUDE.md §2) |

**M4.1 commit history**

| Commit | What |
|---|---|
| `5e9f6e0` | Implementation — Section 7 + `owner_econ_lesson_economics()` prepared |
| `f8ee1ef` | Release gate passed — release report |
| *branch tip* | This closeout + documentation reconciliation |

---

## Applied migration

Individually owner-approved before `apply_migration` (CLAUDE.md §3).

| Version | Migration | Adds |
|---|---|---|
| `20260801121050` | `aiecon_p6_m4_lesson_economics` | `owner_econ_lesson_economics()` |

No new tables. No new views. **No existing object modified.**
**Twelve `aiecon` migrations are now applied in total** (Phases 2–6).

---

## Production state

| Measure | Value |
|---|---|
| `owner_econ_*` RPCs | **11** (was 10) |
| `owner_cost_*` RPCs | 6 |
| `econ` views | 11 |
| `cost_engine` views | 17 |
| Priced cost facts | 76, **$0.22961425** — all internal |
| Work items | 27 question + 6 unattributed — all internal |
| Revenue events | 8, **EGP 8,542.00** |
| Credits outstanding | 236,142 |
| P&L days | 383, all blocked `no_cost_in_period` |
| Conservation | allocated = priced, variance `0.00000000` |
| Coverage / binding resolution | 100.00% / 100.00% |

**Verification**

| Suite | Result |
|---|---|
| Release gate M4.1-V1…V8 | **8/8 PASS, first run** |
| `scripts/verify-economics.sql` | **18/18 PASS** (`P5-04` → 11 functions; `P5-17` → 11 invoked, 0 raised) |
| `scripts/verify-cost-engine.sql` read-only | **25 PASS, 1 WARN** (`P4-31`) |
| `scripts/verify-cost-engine.sql` P4-24…P4-28 | not run — write-path |

**Backward compatibility** — digests bit-identical to the M3 closeout:

| Object | Rows | Digest |
|---|---|---|
| `owner_econ_pnl()` | 383 | `77a987f03f50f30e332d43a97546b96d` |
| `econ.v_breakeven_inputs` | 14 | `75df5a9c9b53190c9787bf12bdd49931` |
| `econ.v_coverage` | 6 | `b51a582fab0756cb6ce4b21cc5d3ca1f` |
| `econ.v_pnl_daily[1-9]` | 383 | `464a53439e4a3335b96c3677433c5ace` |

---

## The owner decision, and how it was proven

**`econ.v_lesson_economics` must not be modified; the taxonomy join lives in the
RPC.** Verified at the gate three independent ways:

| Check | Result |
|---|---|
| View definition digest | `8e88c98f471e2d15e3d3fdf9360d2c01` — **byte-identical** |
| View column shape | 7 columns, `34edbec5…` — unchanged, no `display_name` added |
| View references taxonomy? | **no** — the join is in the RPC, not the view |

The join is `LEFT`, so a lesson with no taxonomy row keeps its cost and reports
a NULL name rather than disappearing (INV-26). Fan-out is impossible:
`taxonomy_subtopics.id` and `taxonomy_topics.id` are both PRIMARY KEYs.

---

## What the gate added beyond the plan

Section 7 returns zero rows in production — all telemetry is internal and the
view excludes it — so `V3b` compared nothing. A vacuous pass is not evidence, so
the join and cast were exercised over the engine data that does exist:

| Sub-check | Observed |
|---|---|
| LEFT JOIN preserves row count | 4 in → 4 out, no fan-out, no drop |
| Names resolve | 4 of 4 |
| `::bigint` exact on real values | `1→1, 1→1, 2→2, 1→1` |
| Unmapped branch | key kept with a NULL name |

The residual risk stated in the engineering review was therefore closed during
the gate rather than carried forward as untested code.

---

## Housekeeping performed at closeout

| File | Correction |
|---|---|
| `20260801_aiecon_p6_m4_lesson_economics.sql` | `PREPARED, NOT APPLIED` → applied, `20260801121050`, with post-apply verification (done with the release report; re-verified here) |
| `phase-6-m4-1-engineering-review.md` | `NOTHING APPLIED` → superseded by application; §6 marked executed; stop point marked historical; preserved as the pre-application record |
| `ai-economics.md` | Phase 6 status now includes **M4.1 complete**; migration added to the applied table; gate outcome and both locked M4 decisions recorded |

**Sweep result:** no stale `PREPARED` / `NOT APPLIED` marker remains in any
M4.1 file. Sweep scoped to M4.1 as instructed; earlier milestones were
reconciled at their own closeouts.

---

## Remaining known issues

None blocking. None introduced by M4.1.

| # | Issue | Owner action |
|---|---|---|
| 1 | All prices unverified list prices — 100% `modeled` (`P4-31` WARN) | verify against a real invoice |
| 2 | No USD→EGP FX rate | supply a rate |
| 3 | `platform_cost_entries` absent (§9.4) | Phase 7 |
| 4 | `v_revenue_recognized_daily` scaling ceiling | Phase 7/8 |
| 5 | `admin.html` not deployed | owner-deferred |
| 6 | `P4-24`–`P4-28` unrun (write-path) | run when acceptable |
| 7 | `avg_credits_per_question` blocked **by design** (M3 §5a ADR) | none — locked decision |
| 8 | Section 7's populated path unexercised **in production** | resolves when external traffic arrives; join and cast verified against engine data at the gate |

---

## Locked decisions carried into M4.2 / M4.3

Recorded here so they are not re-litigated:

- **Section 9 is a diagnostic surface, not a business metric.** It shows all
  observed AI telemetry including internal traffic, is labelled diagnostic, and
  its numbers never feed any `owner_econ_*` business KPI. INV-25 continues to
  apply to business metrics only.
- **Section 9 must be served by `owner_cost_*` RPCs, never `owner_econ_*`** —
  it is a service→provider→model drill-down, and INV-13 / P5-02 forbid provider
  and model identifiers in the `econ` schema.
- **The pre-apply type probe is mandatory for every new RPC.**
- Each milestone ends: implementation → engineering review → **stop**.

---

## Standing constraints, all honoured

- `ai-tutor` never deployed via the inline MCP tool (CLAUDE.md §1)
- No frozen file touched (CLAUDE.md §2) — `taxonomy.js` untouched; only the
  taxonomy **tables** were read
- Every migration individually approved before `apply_migration` (CLAUDE.md §3)
- No unrelated changes; no hidden fixes; one milestone at a time
- `admin.html` not deployed, per explicit owner instruction

---

## Stop

**M4.1 is closed.** M4.2 is not started, planned, or scoped — its branch exists
empty, awaiting an instruction to begin planning.
