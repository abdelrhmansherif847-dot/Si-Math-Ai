# Phase 6 M4.2 — Final Closeout

**Status: ✅ CLOSED, 2026-08-01.** Release gate passed after one failure that
was investigated, root-caused, fixed and re-verified. Both regression suites
clean. Repository reconciled with production.

M4.3 has not been started, planned, or scoped.

---

## Final state

| | |
|---|---|
| **Branch** | `claude/phase6-m4-2-student-consumption` |
| **Final commit** | the branch tip — this closeout's own commit (`git rev-parse` is authoritative) |
| **Base** | `main` @ `067d3c8` |
| **Supabase project** | `igvkyxkmjnkzscqgommj` |
| **Section delivered** | 8 — Student Consumption Analytics |
| **`admin.html`** | built, **NOT deployed** (owner-deferred) |
| **Edge Functions** | none touched — `ai-tutor` untouched (CLAUDE.md §1) |
| **Frozen files** | none touched (CLAUDE.md §2) |

**M4.2 commit history**

| Commit | What |
|---|---|
| `b8addbc` | Implementation — Section 8, two RPCs prepared |
| `f6d728c` | Release gate passed — release report |
| *branch tip* | This closeout + documentation reconciliation |

---

## Applied migrations

Each individually owner-approved before `apply_migration` (CLAUDE.md §3).

| Version | Migration | Effect |
|---|---|---|
| `20260801124707` | `aiecon_p6_m4_2_student_consumption` | `owner_econ_student_economics` 10 → 19 cols (DROP + recreate) |
| `20260801124835` | `aiecon_p6_m4_2_student_service_mix` | new `owner_econ_student_service_mix()` |
| `20260801130230` | `..._student_consumption_full_join_fix` | **root-cause fix found by V4** |

No new tables. No new views. `econ.v_student_economics` untouched.
**Fifteen `aiecon` migrations applied in total** (Phases 2–6).

---

## Production state

| Measure | Value |
|---|---|
| `owner_econ_*` RPCs | **12** (was 11) |
| `owner_cost_*` RPCs | 6 |
| `aiecon` migrations applied | **15** |
| Students listed in Section 8 | **9** |
| Credits consumed | **1,908** over a 44-day shared span |
| Priced cost facts | 76, **$0.22961425** — all internal |
| Revenue events | 8, **EGP 8,542.00** |
| P&L days | 383, all blocked `no_cost_in_period` |

**Verification**

| Suite | Result |
|---|---|
| Release gate M4.2-V1…V8 | **8/8 PASS** (V4 after one root-caused fix) |
| `scripts/verify-economics.sql` | **18/18 PASS** (`P5-04` → 12; `P5-17` → 12 invoked, 0 raised) |
| `scripts/verify-cost-engine.sql` read-only | **25 PASS, 1 WARN** (`P4-31`) |
| `scripts/verify-cost-engine.sql` P4-24…P4-28 | not run — write-path |

Backward compatibility: all four digests bit-identical to the M4.1 closeout.

---

## The V4 failure — the most important thing in this milestone

**What happened.** V4 failed on first run: per-student credits matched, but the
totals did not — **1,828 vs 1,908**.

**Why the check nearly missed it.** The assertion compared only students
*present* in the RPC output, so it was structurally incapable of detecting a
student who was **absent**. The totals line is what exposed it. This is the same
vacuous-pass shape caught in M4.1's V3 — a check that can only pass.

**Root cause.** The row set was driven by `econ.v_student_economics`, which is
itself `revenue FULL JOIN cost`. A student who consumed credits but has neither
revenue nor cost does not exist in it. A panel about *consumption* was therefore
hiding real consumers.

| Measure | Before | After |
|---|---|---|
| Students listed | 7 | **9** |
| Credits reported | 1,828 | **1,908** |
| Consumers hidden | **2 of 9** | 0 |
| Consumption unreported | **4.2%** | 0% |

**Fix — root cause only.** `FULL JOIN` consumption into the row set. Section 8's
population is revenue ∪ cost ∪ consumption. Consumption-only students resolve
`block_reason` and `confidence` from `econ.block_reason()` /
`worst_confidence()` rather than emitting a NULL reason, which would have
breached owner rule 3. Verified by V4d that the widening altered **no existing
money value** — the view stays canonical.

### The generalised lesson, now twice-learned

M4.1 established it with a `LEFT JOIN`; M4.2 re-learned it with a `FULL JOIN`:

> **A panel's population must be the union of every population it reports on,
> never one contributing surface.** Driving a row set off a single view silently
> drops whoever that view omits.

### And the limit of the pre-apply probe

The probe passed cleanly on this function. It could not have caught this:
**a probe verifies types, not semantics.** Type checking and reconciliation
checking are separate defences, and M4.2 is the case that proves both are
needed. Recorded here so the probe's five-milestone track record is not
mistaken for broader coverage than it has.

---

## Locked M4.2 decisions

Recorded so they are not re-litigated:

- **No PII in the economics layer.** Student surfaces expose `user_id` only.
  Verified at the database: 0 identifying output columns, neither function body
  reads `profiles`, 0 `full_name`/`email`/`rank_name` tokens. If a student ever
  needs identifying, that belongs in a separate drill-down outside economics.
- **The statistical usage anomaly ships blocked** — `insufficient_population`
  until n ≥ 30, evaluated from data so it unblocks with no code change. The
  deterministic `cost_exceeds_revenue` ships now and is unaffected.
- **One canonical per-student surface.** `owner_econ_student_economics()` was
  extended, not duplicated. `owner_econ_student_service_mix()` is a separate
  *grain* and reports no per-student total, so it cannot diverge.
- **`avg_daily_usage` divides by the shared calendar span**, matching
  `owner_econ_credit_summary().avg_daily_burn` — not per-student active days.

---

## Housekeeping performed at closeout

| File | Correction |
|---|---|
| both M4.2 migrations | `PREPARED, NOT APPLIED` → applied, with versions and post-apply verification (done with the release report; re-verified here) |
| `phase-6-m4-2-engineering-review.md` | `NOTHING APPLIED` → superseded by application; §6 marked executed; stop point marked historical; **§3's observation table annotated as pre-fix**, since it says 7 students where the truth is 9 |
| `ai-economics.md` | Phase 6 status now includes **M4.2 complete**; all three migrations added; the V4 lesson and the four locked decisions recorded |

**Sweep result:** no stale `PREPARED` / `NOT APPLIED` marker remains in any M4.2
file. Scoped to M4.2 as instructed; earlier milestones were reconciled at their
own closeouts.

---

## Remaining known issues

None blocking. One new, and it is a deliberate block rather than a defect.

| # | Issue | Owner action |
|---|---|---|
| 1 | All prices unverified list prices — 100% `modeled` (`P4-31` WARN) | verify against an invoice |
| 2 | No USD→EGP FX rate | supply a rate |
| 3 | `platform_cost_entries` absent (§9.4) | Phase 7 |
| 4 | `v_revenue_recognized_daily` scaling ceiling | Phase 7/8 |
| 5 | `admin.html` not deployed | owner-deferred |
| 6 | `P4-24`–`P4-28` unrun (write-path) | run when acceptable |
| 7 | `avg_credits_per_question` blocked by design (M3 §5a ADR) | none — locked |
| 8 | **`usage_anomaly` blocked** — `insufficient_population`, n=7 needs 30 | none — unblocks from data |
| 9 | Section 8's cost half unexercised; the anomaly's unblocked branch unexercised by construction | resolves as data arrives |
| 10 | `econ.v_breakeven_inputs` still has no RPC | Phase 7 — deliberate |

---

## Standing constraints, all honoured

- `ai-tutor` never deployed via the inline MCP tool (CLAUDE.md §1)
- No frozen file touched (CLAUDE.md §2)
- Every migration individually approved before `apply_migration` (CLAUDE.md §3)
- No unrelated changes; the V4 fix addressed the verified root cause only
- `admin.html` not deployed, per explicit owner instruction

---

## Stop

**M4.2 is closed.** M4.3 (AI Service & Model Analytics) — the last remaining
Phase 6 section — is not started, planned, or scoped. Its branch exists empty,
awaiting an instruction to begin.
