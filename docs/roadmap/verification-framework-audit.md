# Verification Framework Audit — vacuous and structurally weak checks

**Documentation only. Nothing here is implemented.** No SQL was changed, no
migration prepared, no deployment made. This is a proposal to be approved or
rejected before any of it is acted on.

Produced at the close of Phase 6, before Phase 7 begins.

---

## Why this exists

Phase 6 caught the same class of defect three milestones running, each time in a
different disguise:

| Milestone | What passed that should not have |
|---|---|
| **M4.1** | `V3b` compared **zero rows** — the RPC correctly returned nothing, so "the money columns match" was proven over an empty set |
| **M4.2** | `V4` compared only students **present** in the output, so it was structurally incapable of noticing a student who was **absent**. It missed 2 of 9 consumers and 4.2% of consumption |
| **M4.3** | `P5-02b` reads a view holding **0 rows**, so it cannot fail regardless of the invariant it claims to protect |

The generalised rule, stated in the M4.3 closeout:

> **A green check is only evidence if it could have gone red.**

The pre-apply type probe and `P5-17` defend against *type* drift. Nothing
currently defends against a **vacuous assertion** — a check whose input is empty,
whose population is one-sided, or whose result is a constant.

---

## Scope of the audit

| Suite | Checks | Executed | Method |
|---|---|---|---|
| `scripts/verify-economics.sql` | 18 | 18 | static shape scan + measured candidate population |
| `scripts/verify-cost-engine.sql` | 31 | 26 | same; `P4-24…P4-28` are write-path and never run |
| **Total** | **49** | **44** | |

"Candidate population" means the rows the assertion actually examines. A check
whose candidate population is **0** cannot fail, whatever it claims.

---

## Findings

### Class A — cannot fail under any data. **1 check.**

#### `P5-09` — the result is a literal

```sql
SELECT 'P5-09' AS check, 'PASS' AS result,
       'revenue rows: ' || … || ', cost days: ' || … AS detail
```

There is no `CASE`. `'PASS'` is a hardcoded string. **`P5-09` cannot report
anything except PASS**, no matter what happens to revenue or cost.

It is a *reporting* line that reads as an *assertion*. Its stated intent —
"revenue and cost are readable with no dependency between them" — is a real and
valuable invariant, and it is currently untested.

**Proposal.** Turn the intent into an assertion. The independence claim is
structural and can be checked from the dependency graph, exactly as `P5-01`
already does for the price book:

- assert both relations are readable **and** return a row count (guards against
  a view that errors or silently empties), and
- assert **no `econ` revenue object depends on any `cost_engine` relation**, via
  `pg_depend` — the same technique `P5-01` uses.

Behaviour is unchanged; only the check gains the ability to fail.

---

### Class B — vacuous today: candidate population is 0. **6 checks + 1 half.**

Each of these is **correctly written**. None is a defect in itself. Each is
simply proving nothing right now, and — this is the point — **nothing in the
output says so.** They print PASS identically to a check that examined 383 rows.

| Check | Asserts | Candidates | Why empty |
|---|---|---|---|
| `P5-02b` | no econ view emits a provider code as data | **0** | reads `econ.v_service_economics`, empty because it excludes internal traffic and 100% of telemetry is internal |
| `P4-10` | every unpriced fact carries an `unpriced_reason` | **0** | 0 unpriced facts — pricing coverage is 100% |
| `P4-11` | no unpriced fact carries a cost | **0** | same |
| `P4-20` | a shared cost split sums back to its source | **0** | 0 requests currently have shared cost |
| `P4-22` | an `unknown` work item reports NULL, not a number | **0** | 0 work items are `cost_completeness = 'unknown'` |
| `P4-30` | no work item claims `invoice_verified` over a list-priced call | **0** | 0 work items claim `invoice_verified` — all pricing is list price |
| `P5-10` *(half)* | blocked ⇎ has profit, both directions | 383 / **0** | the "blocked but has profit" half scans 383 rows; the "computed but has a block reason" half scans **0**, since no P&L day is unblocked |

**Proposal — make vacuity visible, not fatal.**

Do **not** convert these to FAIL. An empty population is the correct state of the
system today, and failing on it would train everyone to ignore the suite.

Instead, give every count-based check a third verdict:

```
PASS      the assertion examined ≥1 row and found no violation
VACUOUS   the assertion examined 0 rows — it proved nothing
FAIL      a violation was found
```

Implemented as a shared expression, so no check needs bespoke logic:

```sql
CASE WHEN <candidates> = 0        THEN 'VACUOUS'
     WHEN <violations> = 0        THEN 'PASS'
     ELSE 'FAIL' END
```

with the `detail` string carrying the candidate count — `"0 of 0 examined"`
instead of today's indistinguishable `"0 … — must be 0"`.

The summary line then becomes honest: *"44 checks: 37 PASS, 6 VACUOUS, 1
WARN"* rather than *"43 PASS, 1 WARN"*. **No behaviour changes; the suite's exit
status can keep treating VACUOUS as non-blocking.**

---

### Class C — structurally weak: has data, but can still miss a real defect. **4 checks.**

#### C1. `P4-17` examines only the most recent allocation run

```sql
FROM cost_engine.allocation_runs ORDER BY started_at DESC LIMIT 1
```

**Measured: 2 runs exist; `P4-17` inspects 1.** A historical run that failed
conservation is invisible to it forever. None currently fails, so there is no
live defect — but the check is incomplete by construction.

**Proposal.** Assert across **all** runs, and report the latest separately:
`count(*) FILTER (WHERE conserved IS NOT TRUE OR variance_usd <> 0) = 0`. Same
data, same behaviour, strictly more coverage.

#### C2. The "check vanishes" class — `P4-07`, `P4-08`, `P4-09`, `P4-17`

All four take their verdict **from a row**:

```sql
FROM cost_engine.v_pricing_coverage     -- P4-07/08/09
FROM cost_engine.allocation_runs …      -- P4-17
```

If that source returns **zero rows**, the `SELECT` returns zero rows — so the
check emits **no output line at all**. It does not fail; it disappears. In a run
printing ~44 result blocks, a *missing* block is far easier to overlook than a
red one.

`v_pricing_coverage` returns exactly 1 row today, but nothing in its definition
guarantees that.

**Proposal.** Give each a guaranteed row, e.g.
`FROM (SELECT 1) g LEFT JOIN <source> s ON true`, so an empty source yields an
explicit `VACUOUS` / `FAIL` line instead of silence.

#### C3. `P4-08` / `P4-09` degrade a NULL to `WARN`

```sql
CASE WHEN coverage_pct >= 99 THEN 'PASS'
     WHEN coverage_pct IS NULL THEN 'WARN' ELSE 'FAIL' END
```

A NULL here means the metric could not be computed — which is at least as
serious as a low value, yet it reports softer than `FAIL`.

**Proposal.** Keep `WARN` only for the genuine "no data yet" case (zero telemetry
rows) and report NULL-with-data as `FAIL`. Distinguishable from the same
candidate-count already needed for Class B.

#### C4. Population-shape checks are absent entirely

The M4.2 failure was **not** a wrong value; it was a **missing row**, and no
check in either suite asserts that a surface's population equals the union of the
populations it reports on. That defect was caught by a hand-written gate
assertion, not by the suite — so an equivalent regression would ship undetected
today.

**Proposal (highest value of everything here).** Add population-conservation
checks to the standing suite for each owner surface that aggregates across
sources — the same assertion M4.3-V4e ended up making:

> the row count at each grain equals the count of distinct groups at that grain
> in the source, and the money total equals the source total

This is the one addition that would have caught the M4.2 defect automatically.

---

### What is already strong — worth preserving as the model

Not everything needs work, and the good patterns should be named so they get
copied rather than diluted:

| Check | Why it is strong |
|---|---|
| `P5-04` | carries an explicit `count(*) > 0` **non-empty guard** — the exact pattern Class B needs, already in the codebase |
| `P5-06`, `P5-13` | pure function tests over **literal inputs** — deterministic, always exercised, independent of production data |
| `P5-17` | discovers RPCs **from the catalog** rather than a hardcoded list, so it auto-covers anything added later; it caught the `42804` class that `CREATE` cannot |
| `P4-15`, `P4-16`, `P4-18` | **conservation identities** over 76 real facts — they go red on any drift |
| `P4-01`, `P4-05`, `P5-16` | **exact-count** assertions (`= 9`, `= 6`, `= 3`), not `>= 1` |

`P5-04`'s guard is the important one: the fix for Class B is not a new invention,
it is applying a pattern this suite already contains.

---

## Summary

| Class | Checks | Severity | Nature |
|---|---|---|---|
| **A** — cannot fail ever | 1 (`P5-09`) | **High** | a constant presented as a verdict |
| **B** — vacuous today | 6 + 1 half | Medium | correct checks, currently proving nothing, indistinguishable from real passes |
| **C** — structurally weak | 4 | Medium | partial scans, silent disappearance, soft NULL handling, and no population-shape coverage |
| **Strong** | 11 named | — | preserve and copy |

**No check in either suite is wrong.** Nothing here contradicts a Phase 6 result:
the M4.3 gate's verdicts were reached by hand-written assertions that *were*
exercised, and where one was not (`P5-02b`), the release report said so and ran a
non-vacuous form instead — 890 rows, 0 leaks.

What this audit says is narrower and worth stating plainly: **the standing suites
report 43 PASS where 37 of those passes are load-bearing and 6 are empty**, and
the output cannot currently tell them apart.

## Recommended order, if approved

1. **`P5-09`** — smallest change, removes the only check that can never fail.
2. **The `VACUOUS` verdict** — one shared expression, applied across both suites.
3. **`P4-17` full-scan** and the **guaranteed-row** fix for `P4-07/08/09`.
4. **Population-conservation checks** — most work, highest value; the only item
   that would have caught M4.2 automatically.

Items 1–3 are mechanical and touch no behaviour. Item 4 is a genuine addition and
deserves its own scoped approval.

---

## Status

**Proposal only. Nothing implemented.** No SQL changed, no migration prepared, no
deployment, no merge. Phase 6 remains complete and frozen; the Phase 7 branch
remains empty.

This document is on `claude/verification-framework-audit`, cut from `main`, so
that the Phase 7 branch stays empty as instructed.
