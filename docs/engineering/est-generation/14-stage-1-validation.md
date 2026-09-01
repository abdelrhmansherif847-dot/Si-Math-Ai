# Stage 1 — New primitives, strengthenings, anti-clone: implementation and blind validation

**STATUS: IMPLEMENTED AND VALIDATED — NOT WIRED INTO THE BLUEPRINT**

> Stage 1 builds the eight primitives, the two strengthenings and the reference
> fingerprint table specified in
> [13-generator-gap-specification.md](13-generator-gap-specification.md). It does
> not change the exam blueprint, does not replace the demand score, does not
> alter the difficulty bands, does not touch ESTM1-2026-A, and generates no
> forms. Nothing here is reachable from the generator that builds a paper.

Date: 2026-09-01. Branch: `claude/mock-exam-enhancement-nnwb48`.

---

## 1. What was built

| File | Role |
|---|---|
| `scripts/est-primitives.mjs` | Eight primitives, two strengthenings, the exact-rational layer, and `assess()` — the load-bearing gate |
| `scripts/est-fingerprint.mjs` | The seven-axis structural fingerprint and clone detection (§9 of artifact 13) |
| `scripts/est-reference-fingerprints.json` | 200 reference fingerprints — **fingerprints only**, no stem, no options, no constants |
| `scripts/validate-est-primitives.mjs` | The CI gate: nine check blocks, auto-discovered by `tests/run-all.mjs` |
| `tests/est-primitives.test.mjs` | 123 assertions, including four mutation families applied to all eight primitives |
| `tests/est-fingerprint.test.mjs` | 59 assertions: per-axis mutation, null-axis handling, content-leak shape checks |

### The load-bearing gate

The acceptance criterion is not "the mechanism appears in the metadata". A
mechanism is load-bearing exactly when **the route that ignores it terminates on
a printed wrong answer**. `assess()` enforces four rules together:

1. some route flagged `requiresInsight` reaches the key;
2. no mechanism-blind route reaches the key at cost ≤ the insight route's cost
   (a *longer* valid route is not a defect — it is a legitimate second method);
3. some mechanism-blind route lands on a printed distractor;
4. a counterfactual is supplied and is not inert.

Counterfactuals come in two kinds. `value`: removing the mechanism moves the
key. `determinacy`: removing it makes the item unanswerable, proved by counting
the options that survive. The second exists because a prose-claim selection
target (P-UNSTATED-MODEL) becomes *easier* without its bridging relation without
the answer moving — requiring a value change there rejected 100% of candidates
until the distinction was drawn.

---

## 2. Generation accounting

20 items per primitive, seed 91001, on the fixed set the validator reproduces.

| primitive | attempts | mechanism-integrity refusals | arithmetic-validity refusals | option-architecture refusals | accepted |
|---|---|---|---|---|---|
| P-COMBINATION | 30 | 0 | 10 | 0 | 20 |
| P-CONVERSION | 21 | 0 | 0 | 1 | 20 |
| P-NORMALISE | 29 | 7 | 0 | 2 | 20 |
| P-SCOPE | 33 | 0 | 8 | 5 | 20 |
| P-CLASSIFY | 25 | 1 | 0 | 4 | 20 |
| P-DECOY | 23 | 0 | 0 | 3 | 20 |
| P-UNSTATED-MODEL | 21 | 1 | 0 | 0 | 20 |
| P-NAMED-CONFIG | 20 | 0 | 0 | 0 | 20 |

**`assess()` rejected nothing** — 0 bypass failures, 0 no-trap failures, 0 inert
counterfactuals across every constructed candidate. That is not evidence the
gate is weak; it is where the rejection happens. Each primitive refuses to
*construct* an item whose mechanism would not bite ("un-normalised route reaches
the key", "two bases coincide — nothing to normalise", "no-solution and
infinitely-many coincide"), so `assess()` is a second line that the first line
rarely lets anything through to. The mutation tests below are what prove it can
still fail.

---

## 3. Mutation testing

Four mutation families, applied to all eight primitives (`tests/est-primitives.test.mjs`):

| mutation | must produce |
|---|---|
| delete the insight route | rejected: no insight route reaches the key |
| add a cheap mechanism-blind route to the key | rejected: bypass |
| move every blind route off the option list | rejected: no blind route lands on a printed distractor |
| make the counterfactual inert | rejected: mechanism is decoration |

The negative control (`P-COMBINATION/single-relation`, one relation and two
symbols, where assigning either symbol solves it at the insight's cost) produced
**64 candidates and 0 acceptances**, every one rejected by the bypass rule.

The two gates added after blind coding were mutation-tested the same way, by
reverting each fix in a scratch copy:

| reverted | result |
|---|---|
| unit-coefficient suppression | 20 checks fail |
| the one-sided direction guard | 2 checks fail (1 distinct key over 20) |
| the P-DECOY variety waiver | 2 checks fail |

---

## 4. Blind validation

160 items (8 × 20) were rendered to a pack carrying **stem and options only** —
no key, no primitive name, no species, no mechanism map, no `routes[]`, no
counterfactual, no fingerprint — deterministically shuffled, and coded on the
same 14-dimension frame as the 200 reference items.

**Every key was recomputed by hand from the stem. All 160 are correct.**

The blind classification into sub-forms was a **1:1 relabelling** of the sealed
one: 13 groups, same partition, four differing only in name (I called
`aggregate_invariance` "revenue-constant").

| primitive | generated | valid | mechanism present | mechanism load-bearing | bypass fails | QA fails | anti-clone fails | blind LB rate |
|---|---|---|---|---|---|---|---|---|
| P-COMBINATION | 20 | 20 | 20 | 20 | 0 | 0 | 0 | 20/20 |
| P-CONVERSION | 20 | 20 | 20 | 20 | 0 | 0 | 0 | 20/20 |
| P-NORMALISE | 20 | 20 | 20 | 20 | 0 | 0 | 0 | 20/20 |
| P-SCOPE | 20 | 20 | 20 | 20 | 0 | 0 | 0 | 20/20 |
| P-CLASSIFY | 20 | 20 | 20 | 20 | 0 | 0 | 0 | 20/20 |
| P-DECOY | 20 | 20 | 20 | 20 | 0 | 0 | 0 | 20/20 |
| P-UNSTATED-MODEL | 20 | 20 | 20 | 20 | 0 | 0 | 0 | 20/20 |
| P-NAMED-CONFIG | 20 | 20 | 20 | 20 | 0 | 0 | 0 | 20/20 |

**A 100% load-bearing rate is a weaker claim than it looks, and must not be
quoted without this paragraph.** The 20 items in a primitive share one skeleton,
so on the 14 dimensions they are one observation, not 20. The honest unit is the
**sub-form**: 13 observations, not 160. Any statistic computed over 160 rows
overstates its precision by roughly a factor of 12.

### RLx by sub-form

| RLx | sub-form | band |
|---|---|---|
| 8 | si_prefix | Entry |
| 10 | period_index | Entry |
| 10 | rate_denominator | Entry |
| 11 | axis_scale | Core |
| 11 | three_letter_angle | Core |
| 12 | residual_referent | Core |
| 14 | coefficients_sum_zero | Stretch |
| 14 | non_monic_divisor | Stretch |
| 15 | mixed_base | Stretch |
| 15 | sum-difference | Stretch |
| 18 | existence-of-solutions | Peak |
| 18 | ratio-parameter | Peak |
| 18 | aggregate_invariance | Peak |

Sub-form mean 13.38, range 8–18; 3 Entry, 3 Core, 4 Stretch, 3 Peak. The
reference corpus mean is 13.01 and ESTM1-2026-A re-coded at the same standard is
10.96.

### Mechanism profile

Present (≥1) and bites (=2), against the reference corpus and ESTM1-2026-A:

| dimension | REF present | REF bites | E1 present | E1 bites | S1 present | S1 bites |
|---|---|---|---|---|---|---|
| hidden_step | 72% | 31% | 68% | 16% | 100% | **85%** |
| inference | 46% | 13% | 60% | 8% | 98% | 25% |
| nonobvious_rel | 43% | 11% | 38% | 8% | 100% | **50%** |
| competing_interp | 32% | 14% | 34% | 2% | 60% | 16% |
| abstraction | 63% | 22% | 50% | 14% | 65% | 28% |
| reversal | 26% | 8% | 24% | 6% | 41% | 12% |
| filtering | 40% | 16% | 56% | 12% | 31% | 12% |
| multiconcept | 66% | 17% | 64% | 14% | 78% | **0%** |
| repr_switch | 44% | 20% | 50% | 32% | 46% | **0%** |
| approaches | 36% | 6% | 36% | 0% | 48% | **0%** |
| trap_cost | 95% | 60% | 100% | 36% | 100% | **100%** |
| distractor_close | 100% | 89% | 100% | 100% | 100% | 78% |

The gap the specification was written to close is closed: `hidden_step` bites in
16% of ESTM1-A items, 31% of reference items, and 85% of Stage-1 items.
`nonobvious_rel` and `inference` move the same way. **Three dimensions the
primitives do not produce at all** are recorded in §6.

---

## 5. Anti-clone

The seven-axis fingerprint compares token sets per axis, not strings — the clone
that motivated it had archetype `budget-fixed-fee-integer-floor` against
`budget-integer-floor`, which exact matching misses by three characters.

- **Within a sub-form: 20/20 flagged.** Correct and by design. A primitive *is* a
  skeleton generator, so its draws share a skeleton. The anti-clone rule belongs
  at form assembly, where a paper takes one or two items per sub-form.
- **Across sub-forms: 3 of 78 pairs flagged.** All three are the linear
  P-CONVERSION carriers (`rate_denominator`, `period_index`, `axis_scale`)
  colliding with each other — one skeleton, `fixed + rate × converted`, wearing
  three narratives. The detector is right. **Form assembly must draw at most one
  of the three**, which is a Stage-2 blueprint constraint, recorded here as an
  input to it.
- **Against the reference table: reduced strength.** The archetype database
  populates four of seven axes, and `distract` uses a different vocabulary on
  each side, so three are live. `detectClone` therefore returns review
  candidates, never rejections, at reduced strength. Populating the reference
  table's `narrative` and `numeric` axes remains open.

---

## 6. Defects found, and their disposition

Every one of these was found by **reading the items**, not by any structural
check. `assess()` cannot see them: they are presentational, or they are
properties of a series rather than of an item.

### Fixed in Stage 1

| # | defect | scope |
|---|---|---|
| 1 | Unit coefficients printed literally — `1\sqrt{25t}`, `-1x`, `1x^2`, `1y`, `- 1v` | P-COMBINATION, P-NORMALISE, P-DECOY |
| 2 | `(a + -3)` where a paper prints `(a - 3)` | P-CLASSIFY |
| 3 | The key was the constant string `increased` in all 20 items | P-UNSTATED-MODEL |

(1) and (2) are pure output bugs: every affected item was mathematically correct
and structurally sound, which is exactly why nothing caught them — and exactly
how a generated paper announces itself on sight. Both are now guarded by check 8
of the validator, mutation-tested.

(3) was a one-sided guard: the primitive required the ticket count to *fall*, so
the answer was always "increased". Direction is not part of the species. The
guard now rejects only an unchanged count, and the key varies. **This matters
beyond tidiness: a mechanism that is load-bearing on one item stops biting
across a series if the key never moves** — a student who answers one answers the
rest by pattern, without ever supplying the model. Check 9 guards it.

### Recorded, needing a design decision (Stage 2)

| # | defect | why it is not fixed here |
|---|---|---|
| 4 | **P-DECOY keys 0 in all 20 items.** Its only realisation of the supplied-decoy species collapses the numerator to zero, so the key is 0 by construction | Choosing a different realisation is a design change. Explicitly waived in check 9 by a one-name allowlist; removing the name fails CI |
| 5 | **P-NAMED-CONFIG yields 8 distinct questions from 20 draws**, one appearing 6×, and implements **one** configuration (right angle at Q, 45° at P, leg given, hypotenuse asked). The species is "naming determines structure"; a single configuration under-realises it | Varying which vertex is named and which side is asked is the species' substance, not a parameter tweak |
| 6 | **`si_prefix` signposts its own mechanism** — "with I in amperes" tells the student to convert. It is still load-bearing (the un-converted value is printed) but codes RLx 8, the lowest in the set | Removing the signpost changes what the item tests |
| 7 | **P-CONVERSION option sets span up to four orders of magnitude** (150 / 390 / 1590 / 37590). Real EST option architecture does not | The wrong-direction distractor is what stretches the range; replacing it is a distractor-model decision |
| 8 | **`trap_cost` bites in 100% of items against 60% in the reference.** Every generated item carries a maximal trap; real papers do not | Uniformity is a blueprint-level property, not a primitive-level one |
| 9 | **`multiconcept`, `repr_switch` and `approaches` bite in 0%.** No primitive integrates two concepts at full strength, switches representation, or admits two genuinely different routes at comparable cost. `repr_switch` needs graphs, tables and figures, which no primitive emits | These are missing constructs, not defects in the eight that exist |

---

## 7. Regression

`node tests/run-all.mjs` → **68/68 green**. 65 pre-existing checks, all passing,
none removed or weakened; the three added are `est-primitives` (123 assertions),
`est-fingerprint` (59), and the `validate-est-primitives` gate (nine blocks).

`ESTM1-2026-A` is byte-identical (md5 `38926f22b7869608f310d0a8e21bb55e`). No
existing source file was modified: the six new files are additions, and the only
edit elsewhere is this document plus the CI count in `CLAUDE.md`.
