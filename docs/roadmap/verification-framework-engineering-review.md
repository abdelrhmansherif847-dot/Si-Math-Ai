# Verification Framework Improvements — Engineering Review

**Scope: the verification scripts only.** No business logic, economics logic or
cost-engine behaviour was touched. No migration was prepared or applied, no
release gate run, nothing merged, nothing deployed.

Branch `claude/verification-framework-audit`, cut from `main` at `a1e2610`, so
the Phase 7 branch stays empty.

| | |
|---|---|
| Files changed | 2 — `scripts/verify-economics.sql`, `scripts/verify-cost-engine.sql` |
| Checks with changed logic | **20** of 44 |
| Checks byte-identical | **24** |
| Checks added or removed | **0** |
| Database objects changed | **0** |
| Migrations | **0** |
| `admin.html` | untouched |

Implements items 1–4 of the audit. **Item 5 (population-conservation checks) is
deliberately not implemented** — it was held back for separate approval.

---

## 1. `P5-09` — a constant became an assertion

**Before.** `SELECT 'P5-09' AS check, 'PASS' AS result, ...` — a hardcoded
literal with no `CASE`. It reported two row counts and asserted nothing. It
could not fail under any data, and owner rule 1 was untested.

**After.** The rule is asserted structurally, the same way `P5-01` already
asserts the price-book boundary: PostgreSQL's own dependency graph.

Two deliberate design choices:

- **Both directions are checked.** A `cost_engine` object reaching into `econ`
  breaks rule 1 exactly as badly as a revenue view reaching into
  `cost_engine`. A one-directional check would have missed half the rule.
- **Readability is reported but not asserted as non-empty.** Zero revenue rows
  is a legitimate state — a fresh deployment — not a failure. The falsifiable
  claim is the *absence of a dependency*, and that claim has a real population.

**Live result:**

```
P5-09  PASS  0 revenue->cost + 0 cost->revenue dependency edge(s)
             among 30 revenue-view edge(s) examined
             — independent in both directions | revenue rows: 8, cost days: 3
```

30 edges examined, where the old form examined nothing.

---

## 2. The `VACUOUS` verdict

A third verdict, applied wherever a candidate population can legitimately be
empty:

```
PASS      examined >= 1 candidate row, found no violation
VACUOUS   examined ZERO candidate rows — proved nothing
FAIL      a violation was found
```

**`VACUOUS` is not a failure, and that is the point.** An empty population is
usually the *correct* state of this system — no unpriced facts, no shared-cost
requests, no external traffic yet. Failing on it would train everyone to ignore
the suite. It records that the check abstained, so a reader can separate
load-bearing passes from empty ones. Only `FAIL` blocks.

Every count-based check now also reports its **examined population** in
`detail` — `"0 of 383 …"` rather than the old `"0 … — must be 0"`, which was
identical whether the denominator was 383 or 0.

### Suite results after the change

**Economics — 17 PASS, 1 VACUOUS** (was reported as 18 PASS):

| Check | Verdict | Population now visible |
|---|---|---|
| `P5-01` | PASS | 0 of **44** econ→cost_engine edges |
| `P5-02` | PASS | 0 of **98** econ columns |
| **`P5-02b`** | **VACUOUS** | **0 of 0** — no econ view emits a service_code row |
| `P5-05` | PASS | 0 of **12** functions |
| `P5-07` | PASS | 0 of **9** money-bearing views |
| `P5-09` | PASS | 0 of **30** revenue-view edges |
| `P5-10` | PASS | 0 of **383** blocked; 0 of **0** computed |
| `P5-11` | PASS | 0 of **383** |
| `P5-12` | PASS | 0 of **383** |
| `P5-14` | PASS | 0 of **3** blocked metrics |
| `P5-15` | PASS | 0 of **11** econ views |
| `P5-17` | PASS | 12 RPCs invoked, 0 raised |

**Cost engine — 21 PASS, 4 VACUOUS, 1 WARN** (was reported as 25 PASS, 1 WARN):

| Check | Verdict | Why |
|---|---|---|
| **`P4-10`** | **VACUOUS** | 0 unpriced facts — the reason rule is unexercised |
| **`P4-11`** | **VACUOUS** | 0 unpriced facts — INV-23 unexercised here |
| **`P4-20`** | **VACUOUS** | no request has a shared call |
| **`P4-22`** | **VACUOUS** | no work item is `cost_completeness = unknown` |
| `P4-31` | WARN | unchanged — 76 of 76 facts list-priced |

**Nothing regressed. The count of green checks dropped because five of them
were never green in the load-bearing sense** — they were empty, and now they
say so.

### `P5-10` — the half-vacuous check

Rule 2+3 is a biconditional over **two different populations**:

```
blocked  -> no profit figure     examined over rows WITH a block_reason  (383)
computed -> no block reason      examined over rows WITHOUT one          (0)
```

The old single `count(*)` summed both, making a fully-exercised direction and an
entirely unexercised one indistinguishable. Each direction now reports its own
population, and the verdict is `VACUOUS` only when **both** are empty — one
exercised direction is still evidence.

### `P5-02b` — widened, not just relabelled

Rather than only marking it `VACUOUS`, its population was widened from **one**
view to **every** econ view carrying a `service_code` (verified: exactly
`v_service_economics` and `v_operation_service_mix`). It stops depending on a
single view's emptiness and becomes non-vacuous the moment either has rows.

The audit's stronger `jsonb`-scan form is **not** implemented — that is a new
assertion, not a repair of this one, and needs its own approval.

---

## 3. Disappearing checks eliminated

`P4-07`, `P4-08`, `P4-09` and `P4-17` took their verdict **from a source row**.
If that source returned zero rows, the `SELECT` returned zero rows — the check
**vanished from the output** rather than failing. In a run printing ~44 blocks,
a missing block is far easier to overlook than a red one.

Each now `LEFT JOIN`s from a guaranteed `(SELECT 1)`, so an empty source yields
an explicit verdict.

**Proven, not asserted** — old form vs new form against an empty source:

| Form | Rows emitted | Finding |
|---|---|---|
| OLD (`FROM v_pricing_coverage`) | **0** | **defect confirmed** — vanishes, no verdict |
| NEW (`LEFT JOIN` from `(SELECT 1)`) | **1** | emits exactly one row, and it is a `FAIL` |

### `P4-08` / `P4-09` — NULL no longer softens to WARN

A NULL `coverage_pct` **with telemetry present** now `FAIL`s: it means the
metric could not be computed over data that exists, which is at least as serious
as a low value. `WARN`/`VACUOUS` is reserved for the genuine "no data yet" case
— zero telemetry rows — where there is nothing to cover.

---

## 4. `P4-17` — every allocation run, not only the latest

**Before.** `FROM cost_engine.allocation_runs ORDER BY started_at DESC LIMIT 1`.
A historical run that failed conservation was invisible permanently. Measured:
**2 runs existed, 1 was checked.**

**After.** Asserts across all runs; still reports the latest separately, so no
diagnostic detail is lost.

```
P4-17  PASS  0 of 2 allocation run(s) failed conservation;
             latest run conserved=true variance=0.00000000
```

Coverage doubled on live data. Conservation is a property of every run — a run
that lost money and was then superseded is exactly the case worth catching.

---

## 5. Negative controls — the part that matters

This work is *about* falsifiability, so shipping it without demonstrating that
the new checks can go red would be self-defeating. Every new verdict path was
driven to the outcome it claims to detect, using synthetic read-only fixtures.

| Control | Verdict | Expected |
|---|---|---|
| NC1 empty population | `VACUOUS` | ✅ |
| NC1 populated, clean | `PASS` | ✅ |
| NC1 populated, violating | `FAIL` | ✅ |
| NC2 revenue reads cost (forward) | `FAIL` | ✅ |
| NC2 cost reads revenue (reverse) | `FAIL` | ✅ |
| NC2 no revenue views exist | `VACUOUS` | ✅ |
| NC2 independent (production) | `PASS` | ✅ |
| **NC3 older run broke, latest fine** | **`FAIL`** | ✅ — **the old form said `PASS`** |
| NC3 all runs conserved | `PASS` | ✅ |
| NC3 no runs at all | `VACUOUS` | ✅ — old form emitted **no row** |
| NC4 empty source, old form | **0 rows** | ✅ defect reproduced |
| NC4 empty source, new form | **1 row, `FAIL`** | ✅ fixed |

**12 of 12 as expected.** NC3 and NC4 are the two that matter most: each
reproduces a defect the old check genuinely could not report, and shows the new
one reporting it.

---

## 6. Scope discipline

| Check set | Result |
|---|---|
| Economics — logic changed | 11: `P5-01 02 02b 05 07 09 10 11 12 14 15` |
| Economics — byte-identical | 7: `P5-03 04 06 08 13 16 17` |
| Cost engine — logic changed | 9: `P4-07 08 09 10 11 17 20 22 30` |
| Cost engine — byte-identical | 17: `P4-01…06 12…16 18 19 21 23 29 31` |
| Checks added / removed | **0 / 0** |

Comparison is on **comment-stripped, whitespace-normalised** statement bodies,
so documentation-only edits do not count as logic changes.

**No database object was modified.** The `VACUOUS` expression is deliberately
inlined per check rather than factored into a shared SQL function: a function
would be a schema change, and this work is confined to the scripts.

`P5-04` already carried the `count(*) > 0` non-empty guard. The fix was applying
a pattern the codebase already contained, not inventing one.

---

## 7. One consequence worth stating plainly

**The suites will now report fewer green checks than before**, and no behaviour
changed to cause it:

| Suite | Before | After |
|---|---|---|
| Economics | 18 PASS | 17 PASS + 1 VACUOUS |
| Cost engine | 25 PASS + 1 WARN | 21 PASS + 4 VACUOUS + 1 WARN |

Five checks moved from PASS to VACUOUS. **None of them regressed** — each was
already proving nothing, and the output simply now says so. Anyone comparing
against a historical "25 PASS" line should expect this and should not read it as
a failure.

Each returns to PASS automatically, with no code change, as soon as its
population becomes non-empty: an unpriced fact, a shared-cost request, an
`unknown` work item, or external traffic.

---

## 8. What was NOT done

- **Population-conservation checks (audit item 4 / recommended item 4)** — the
  highest-value addition and the only one that would have caught the M4.2
  defect automatically. It is a genuine new assertion, not a repair, and was
  explicitly held for separate approval.
- **The `jsonb`-scan form of `P5-02b`** — same reasoning.
- **Exit-status handling.** The scripts still emit verdict rows; how a CI caller
  treats `VACUOUS` is a policy decision, not a script change. Recommended:
  non-blocking, same as today.
- No Phase 7 planning, implementation, migration, deployment or merge.

---

## Status

Implementation and this review are complete. Nothing applied, nothing merged,
nothing deployed. Phase 6 remains complete and frozen; the Phase 7 branch
remains empty.

**Awaiting owner review.**
