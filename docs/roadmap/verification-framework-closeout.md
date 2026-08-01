# Verification Framework — Closeout

**Closed 2026-08-01.** The verification framework improvements are applied,
gate-verified and merged to `main`.

This was a housekeeping cycle between Phase 6 and Phase 7, not a phase of its
own. It changed **no product behaviour** — only what the verification suites are
able to prove.

---

## Final state

| | |
|---|---|
| Scope | `scripts/verify-economics.sql`, `scripts/verify-cost-engine.sql` |
| Database objects changed | **0** |
| Migrations applied | **0** |
| Checks with changed logic | 20 of 44 |
| Checks byte-identical | 24 |
| Checks added / removed | **0 / 0** |
| Gate on modified checks | **20/20 behave as designed** |
| Economics suite | **17 PASS, 1 VACUOUS** |
| Cost Engine suite | **20 PASS, 5 VACUOUS, 1 WARN** |
| Merged to `main` | yes |
| `admin.html` deployed | **no** |
| Phase 7 work | **none** |

---

## What was delivered

**1. `P5-09` became a real assertion.** It was `'PASS' AS result` — a literal
with no `CASE`, unable to fail under any data, leaving owner rule 1 untested. It
now asserts revenue/cost independence structurally via `pg_depend`, in **both
directions**, over 30 real dependency edges.

**2. The `VACUOUS` verdict.** A third outcome for checks whose candidate
population is zero, with the examined population printed in every count-based
check (`"0 of 383"` rather than a bare `"0"`). `VACUOUS` is deliberately **not**
a failure — an empty population is usually the correct state of this system, and
failing on it would train everyone to ignore the suite. Only `FAIL` blocks.

**3. Disappearing checks eliminated.** `P4-07/08/09/17` took their verdict from
a source row and emitted **no row at all** when that source was empty — vanishing
rather than failing. Each now `LEFT JOIN`s from a guaranteed row.

**4. `P4-17` was checking 1 allocation run of 2.** It now asserts across every
run, still reporting the latest separately.

---

## The locked principle

> **A green check is only evidence if it could have gone red.**

This was learned three times in Phase 6, in three different disguises:

| Milestone | The disguise |
|---|---|
| M4.1 | `V3b` compared **zero rows** — proven over an empty set |
| M4.2 | `V4` compared only rows **present**, so it could not see an **absent** one; missed 2 of 9 consumers |
| M4.3 | `P5-02b` reads a view holding **0 rows** — cannot fail regardless of the invariant |

The pre-apply type probe and `P5-17` defend against **type** drift. Nothing
defends against a **vacuous assertion** except reading it and asking what would
make it fail. `VACUOUS` makes that visible in the output rather than leaving it
to whoever happens to read the SQL.

---

## Falsifiability evidence

Shipping falsifiability work without demonstrating falsifiability would be
self-defeating. Twelve negative controls drove every new verdict path to the
outcome it claims to detect. **12/12 as expected.** The two that matter:

| Control | Old form | New form |
|---|---|---|
| Older allocation run broke conservation, latest fine | **`PASS`** — never examined | **`FAIL`** |
| Source relation returns zero rows | **no row emitted** | **1 row, `FAIL`** |

---

## The reported totals changed — and that is the deliverable

| Suite | Before | After |
|---|---|---|
| Economics | 18 PASS | **17 PASS + 1 VACUOUS** |
| Cost Engine | 25 PASS + 1 WARN | **20 PASS + 5 VACUOUS + 1 WARN** |

**Six checks moved PASS → VACUOUS. None regressed.** Each was already examining
zero rows and printing PASS indistinguishably from a check that examined 383. The
verdict changed; the facts did not.

The six: `P5-02b`, `P4-10`, `P4-11`, `P4-20`, `P4-22`, `P4-30`. Every one
returns to PASS automatically, with no code change, once its population becomes
non-empty — an unpriced fact, a shared-cost request, an `unknown` work item, an
`invoice_verified` item, or external traffic.

**Anyone comparing against the historical "18/18" or "25 PASS + 1 WARN" lines
should expect the new numbers.** Both references in `ai-economics.md` have been
annotated so the change is not mistaken for a regression later.

---

## Housekeeping performed

| File | Correction |
|---|---|
| `ai-economics.md` §Phase 5 | annotated: suite reports 17 PASS + 1 VACUOUS, with the reason and the auto-unblock condition |
| `ai-economics.md` §Phase 4 | annotated: read-only suite reports 20 PASS + 5 VACUOUS + 1 WARN; check count clarified as 26 read-only + 5 write-path |
| `verification-framework-engineering-review.md` | **corrected a wrong count** — its summary said "21 PASS, 4 VACUOUS" and omitted `P4-30`; the measured result is 20 + 5 + 1. Corrected in place with a dated note |
| `verification-framework-audit.md` | left as the historical proposal record, unmodified |

**On the corrected count:** the scripts were right; my summary of them was wrong.
Recorded here rather than quietly fixed, because a release report that
misreports its own totals is the same class of problem this cycle exists to
remove.

---

## What was deliberately NOT done

- **Population-conservation checks** — the highest-value item in the audit, and
  the only one that would have caught the M4.2 defect automatically. It is a
  **new assertion**, not a repair, and was held for separate approval.
- **The `jsonb`-scan form of `P5-02b`** — same reasoning. `P5-02b` was instead
  widened from one view to every econ view carrying a `service_code`, which is a
  repair rather than a new claim.
- **Exit-status policy for `VACUOUS`.** The scripts emit verdict rows; how CI
  treats `VACUOUS` is a caller decision. Recommended: non-blocking, as today.
- No Phase 7 planning, implementation, migration or deployment.

---

## Standing constraints, all honoured

- `mcp__Supabase__deploy_edge_function` **never called for `ai-tutor`**.
- **No frozen file touched**: `regenerate-reports.js`, `taxonomy.js`,
  `exam-mistakes-logger.js`, `mock-exam.html`, `weakness.html`, `focus.html`.
- **No migration** prepared or applied — none was needed.
- **`admin.html` not deployed.**
- No new assertions beyond the approved scope.

---

## Repository state

| Branch | State |
|---|---|
| `main` | verification framework merged at `8b1d838`; Phase 6 complete and frozen |
| `claude/phase7-simulator-breakeven` | **still empty** — 0 commits of its own; see the note below |
| `claude/verification-framework-audit` | **archived by retention on the remote** at `8b1d838`; local branch deleted |

**On the archive method.** The intent was a `archive/…` tag with the branch
deleted. **This git remote rejects tag pushes** — it carries zero tags, and four
attempts all failed with `the remote end hung up unexpectedly`. The branch was
therefore archived by *retaining* it on the remote instead, which is exactly how
every prior milestone branch in this repo was handled after merging
(`claude/phase6-m4-2-…`, `claude/phase6-m4-3-…` and the rest are all still
present). The local branch was deleted. The audit, engineering review,
release report and negative-control reasoning all remain reachable — and are in
any case on `main`.

**Note on the Phase 7 branch.** `claude/phase7-simulator-breakeven` was cut from
`main` at `a1e2610`, so it is now **3 commits behind** `main` at `8b1d838`. It
remains empty in the sense that matters — it carries **no work of its own** —
but it is no longer level with `main`. It was left untouched deliberately, since
the standing instruction is that nothing may happen on that branch. Fast-forward
it to `main` when Phase 7 is authorised, so Phase 7 starts on a base that
includes the verification framework improvements.

---

## Stop

The verification framework is closed. **Phase 6 remains complete and frozen; the
Phase 7 branch remains empty.** No Phase 7 work has begun.
