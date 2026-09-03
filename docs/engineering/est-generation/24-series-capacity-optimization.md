# 24 — Series Capacity Optimization

**STATUS: SERIES CAPACITY OPTIMIZATION — P4 NOT YET GENERATED**

No fourth prototype, no forms 2–25, and no non-reference objects were invented.
This stage answers one question before any more building happens: **what can the
supported vocabulary actually achieve across 25 forms?**

The answer is a number that changes the programme. **The best pairwise object
overlap any assignment can reach with the current eligibility structure is about
46%.** The Stage-B target of ≤20% is not difficult; it is unreachable, by a
factor of 2.3, and no allocation work of any kind gets there. The generator sits
at 64%, which is **75% of the achievable ceiling** — so roughly three quarters of
the remaining gap is a vocabulary fact and one quarter is allocation.

---

## 1. The current vocabulary map

Four archetypes were closed this pass (§2), taking the library from 179 to
**183 of the 189 the corpus names — 96.8%**.

| family | built / named | slots per form | reuse at N=25 | unbuilt |
|---|---|---|---|---|
| A01 | 10/10 | 3 | 7.5 | — |
| A02 | 4/4 | 2 | 12.5 | — |
| A03 | 7/7 | 2 | 7.1 | — |
| A04 | 8/9 | 3 | 9.4 | `inequality-from-graph` |
| A05 | 10/10 | 3 | 7.5 | — |
| A06 | 15/15 | 3 | 5.0 | — |
| A07 | 9/9 | 3 | 8.3 | — |
| A08 | 9/9 | 2 | 5.6 | — |
| A09 | 9/11 | 3 | 8.3 | `absvalue-graph-identify`, `graph-roman-numeral` |
| A10 | 11/11 | 2 | 4.5 | — |
| A11 | 7/7 | 1 | 3.6 | — |
| A12 | 13/13 | 1 | 1.9 | — |
| A13 | 27/29 | 8 | 7.4 | `event-anchored-series-scan`, `physics-graph-unit-conversion` |
| A14 | 12/12 | 3 | 6.3 | — |
| A15 | 9/9 | 3 | 8.3 | — |
| A16 | 9/9 | 3 | 8.3 | — |
| A17 | 9/9 | 2 | 5.6 | — |
| A18 | 5/6 | 1 | 5.0 | `vertical-line-roman` |
| **total** | **183/189** | 50 | — | 6 |

**The `reuse at N=25` column is the one to read.** Even with every archetype in a
family built, A02's four archetypes must each carry 12.5 of 25 forms, because the
corpus only has four. That is not a library defect. It is what a four-form corpus
supports.

**Of the 184 objects the library can name, 150 are eligible for a cell that has
standing demand.** The other 34 are admissible only in bands their family is
never given — the band-capacity layer from Stage B, unchanged in kind.

---

## 2. The remaining six, classified

Four of the ten Stage-B gaps were **authoring gaps and were closed**, with no
infrastructure change:

| archetype | family | built as | infrastructure needed |
|---|---|---|---|
| `pie-ratio-on-remainder` | A13 | Core construct, private two-slice pie | none |
| `read-then-percent-scaled` | A13 | Core construct, bar chart in hundreds | none |
| `parameter-interpret` | A13 | mechanism, exponential base as a factor | none |
| `parameter-interpret-constant` | A13 | mechanism, constant of proportionality | none |

Two were placed in A13/Core deliberately: it carries 2.12 slots a form from three
objects and was the third-largest contributor to the ceiling.

**The six that remain are all infrastructure, and none is authoring:**

| archetype | family | classification | what it needs |
|---|---|---|---|
| `inequality-from-graph` | A04 | **graph layer gap** | a coordinate-plane stimulus with a shaded half-plane |
| `absvalue-graph-identify` | A09 | **graph layer gap** | a coordinate-plane stimulus AND graph-valued options |
| `graph-roman-numeral` | A09 | **graph layer gap** | a coordinate-plane stimulus plus the Roman grid |
| `vertical-line-roman` | A18 | **graph layer gap** | a coordinate-plane stimulus plus the Roman grid |
| `event-anchored-series-scan` | A13 | **display layer gap** | a line-graph carrying arbitrary values and labelled events; today it carries `start`, `step`, `points` only |
| `physics-graph-unit-conversion` | A13 | **display layer gap** | a line-graph with axis units |

**Genuinely unavailable from current evidence: none.** Every one of the six is a
described archetype with a known shape; all six are blocked on a stimulus or an
option layer, not on knowing what the item is.

No archetype was invented. The library names 183 reference archetypes and nothing
else.

---

## 3. The theoretical 25-form ceiling

Two numbers bracket the truth, and both are computed rather than searched for.

**A lower bound that no assignment can beat.** A cell placing `d·N` items over the
series from `|E|` eligible objects contributes at least `|E|·C(d·N/|E|, 2)` to
`Σ_o C(n_o, 2)`, and mean pairwise overlap is exactly `Σ_o C(n_o,2) / C(N,2)`.
Summing over cells **under**-counts, because an object serving two cells has its
counts added and convexity makes that worse — so the sum is a valid bound. It
depends on no algorithm.

**A constructive optimum.** An incremental-greedy assignment over the same cells,
most-constrained first, respecting the per-form uniqueness rules the assembler
enforces. It is a real assignment, so it is an upper bound on the optimum.

The optimizer sees cells, eligibility and per-form uniqueness. It does **not** see
the anti-clone fingerprint, the content signatures or stimulus-set coupling, all
of which can only reject assignments. So it is **optimistic by construction** and
the real generator can never beat it.

| | 25 forms |
|---|---|
| eligible objects | 150 |
| cells with standing demand | 52 |
| **lower bound — no assignment can beat** | **23.14 of 50 = 46.3%** |
| **constructive optimum — achieved** | **25.38 of 50 = 50.8%** |
| objects emitted at the optimum | 145 of 150 |
| every-form objects at the optimum | 9 |
| **proven minimum every-form objects** | **3** |
| distinct objects per form | 46–49 of 50 |
| slots the optimizer could not fill | 39 over 25 forms |
| infeasible cells | 0 |

**25 complete forms are mathematically feasible.** No cell is infeasible and every
form reaches 46–49 distinct objects of 50, inside the reference's own 49–50 only
at the top end. The 39 unfilled slots are per-form-uniqueness collisions in the
thinnest cells, about 1.6 per form.

The bound moves by roughly ±1.6 points with the realised demand profile, which
shifts slightly between scheduling policies; the run graded in §11 has a bound of
23.96 of 50 = **47.9%**.

---

## 4. The optimization formulation

**Variables.** `x[o, c, f] ∈ {0, 1, 2}` — the number of slots in form `f`, cell
`c`, filled by object `o`.

**Constraints, all taken from what the generator already enforces:**

| | |
|---|---|
| family mix | fixed to the blueprint table; the Stage-B evidence rejected permuting it |
| band mix | `BAND_PLAN`, held to ±0 slots per form as measured |
| eligibility | `x[o,c,f] = 0` unless `o ∈ E_c`, where `E_c` is derived from `profileOf`/`admits`, never declared |
| cell demand | `Σ_o x[o,c,f] = d_c` for every cell and form |
| per-form uniqueness | `Σ_c x[o,c,f] ≤ 2`, and at most one object per form may exceed 1 (`OBJECT_RULES`) |
| cooldown | `Σ_c x[o,c,f] = 0` if `o` appeared within the last `w` forms, softened to a preference so a scarce cell is never starved |
| stream requirements | Stretch and Peak admit mechanism and composed items only; this is `admits()`, not a side rule |
| stimulus sets | a set's slots read one display, so their objects come from that display's reader pool |
| anti-clone, content reuse | applied to realised items, not to object ids; they can only reject, so the ceiling ignores them and is optimistic |

**Objective — minimise a weighted diversity loss, not maximise object count:**

```
pairwiseObjectOverlap    1.0     the headline number
everyFormObject          2.0     per object; the corpus has none
repeatedObjectFrequency  0.5     mean uses per emitted object, above 1
reasoningSpeciesOverlap  0.7
targetStructureOverlap   0.3
cellScarcityPressure     0.4     demand served by a cell with under two objects
allocationPenalty        0.8     measured overlap over the random-draw prediction
```

The weights are in `DIVERSITY_LOSS` so that a change to what the programme values
is a change to a line of code the test suite can see. The two largest are the two
the reference is most emphatic about.

---

## 5. Cooldown policies A/B/C/D

Measured on the real assembler, 25 forms each, identical library.

| | A: none | B: 1-form | C: 2-form | **D: adaptive** |
|---|---|---|---|---|
| completion rate | 25/25 | 25/25 | **24/25** | **25/25** |
| `verify()` passes | 25/25 | 25/25 | 24/25 | **25/25** |
| pairwise object overlap | 72% | 65% | 64% | **64%** |
| objects in EVERY form | 21 | 17 | **16** | 17 |
| objects emitted | 121 | **131** | **131** | 130 |
| allocation penalty | 2.66× | 2.40× | **2.36×** | **2.36×** |
| mechanism objects emitted | 38 | 38 | 38 | 38 |
| single-object cells | 14 | 15 | 15 | **13** |
| their demand per form | 8.8 | 8.9 | 8.9 | **8.0** |
| family mix deviation | 0 | 0 | 0 | 0 |
| band mix deviation | 0 | 0 | 0 | 0 |
| Stretch per form (floor 8) | 12 | 12 | 12 | 12 |
| Peak per form (floor 11) | 14 | 14 | 14 | 14 |
| all bands in range | yes | yes | yes | yes |

**No policy starves Stretch or Peak** — every one holds 12 and 14 exactly, with
zero band-mix deviation. The acceptability test is therefore decided by
completion, and it separates C from D: **a two-form cooldown drops a form.**

Policy D weights each object's cooldown by its **scarcity** — the fewest eligible
objects any cell it serves has. An object that is one of two in a Peak cell cools
down fast, because that cell cannot afford to have it parked; an object with
seventeen alternatives stays parked. It reaches C's diversity without C's failure,
and it is the only policy that *reduces* single-object-cell pressure (8.8 → 8.0).

---

## 6. Best achievable overlap

| | of 50 | share |
|---|---|---|
| what the corpus does (4 forms) | 1.17 | 2.3% |
| **proven lower bound, current eligibility** | **23.14** | **46.3%** |
| constructive optimum | 25.38 | 50.8% |
| generator today, policy D | 32.00 | 64% |
| generator at Stage 22 | 36.19 | 72% |

**The reference's 2.3% is not on the table.** Between the corpus's rate and the
best this vocabulary permits there is a factor of twenty, and it is a property of
the eligibility structure, not of the assembler.

---

## 7. Best achievable allocation penalty

The penalty is measured overlap over the random-draw prediction `S²/V`.

| | overlap | penalty |
|---|---|---|
| random draw over the whole library (V=184) | 13.59 | 1.00× by definition |
| **proven lower bound** | 23.14 | **1.70×** |
| constructive optimum | 25.38 | 1.87× |
| generator today, policy D | 32.00 | 2.36× |

**The allocation penalty can never reach 1×, and Stage B's "toward 1×" was
therefore unreachable too.** The denominator counts a random draw from all 184
objects, but 34 of them are eligible for no cell with demand, so the comparator is
a draw that could never actually be made.

**Corrected denominator** — a random draw over the 150 objects that are eligible:

| | overlap | corrected penalty |
|---|---|---|
| random draw over the eligible set | 16.67 | 1.00× |
| proven lower bound | 23.14 | **1.39×** |
| generator today | 32.00 | 1.92× |

The corrected figure is the one worth targeting, and 1.39× is its floor.

---

## 8. The every-form object minimum

An object is forced into every form when its cell's demand cannot be spread:
avoiding it needs `|E_c| ≥ d_c·N/(N−1)`, so **any cell with one object and
standing demand forces one**, whatever the rest of the library holds.

| | count |
|---|---|
| **proven minimum, current eligibility** | **3** (6 under the policy-D demand profile) |
| constructive optimum attains | 9 |
| generator today, policy D | 17 |
| the corpus | 0 |

Zero is unreachable while any cell holds one object. Three of the thirteen
single-object cells have demand in every form; the other ten are asked for less
than a full slot per form and their objects do not reach every form.

---

## 9. Binding constraints

The top 18 cells carry **76% of the entire lower bound**, and they are almost all
mechanism cells in the hard bands.

| cell | slots/form | objects | needed for 20% | share of the bound | streams |
|---|---|---|---|---|---|
| A15/Peak | 1.96 | 2 | 9 | 8.4% | mechanism |
| A09/Stretch | 2.12 | 3 | 10 | 6.5% | mechanism |
| A13/Core | 2.12 | 3 | 10 | 6.5% | core |
| A13/Entry | 4.88 | 17 | 22 | 5.5% | core+mechanism+routine |
| A01/Peak | 1.52 | 2 | 7 | 5.0% | mechanism |
| A06/Peak | 1.80 | 3 | 8 | 4.6% | mechanism |
| A03/Peak | 1.76 | 3 | 8 | 4.4% | composed+mechanism |
| A12b/Stretch | 1.00 | 1 | 5 | 4.4% | mechanism |
| A07/Peak | 1.00 | 1 | 5 | 4.4% | composed |
| A16/Stretch | 1.40 | 2 | 7 | 4.2% | mechanism |
| A10/Peak | 1.32 | 2 | 6 | 3.7% | mechanism |
| A02/Stretch | 0.84 | 1 | 4 | 3.1% | mechanism |
| A17/Peak | 1.48 | 3 | 7 | 3.1% | composed+mechanism |
| A05/Stretch | 0.76 | 1 | 4 | 2.5% | mechanism |
| A04/Peak | 0.76 | 1 | 4 | 2.5% | mechanism |
| A12b/Core | 0.76 | 1 | 4 | 2.5% | core |
| A08/Stretch | 0.72 | 1 | 4 | 2.2% | mechanism |
| A02/Core | 1.00 | 2 | 5 | 2.1% | core+mechanism |

### 9.1 Where the bound lives, and what would move it

| half of the form | cells | slots/form | share of the bound |
|---|---|---|---|
| **Stretch + Peak** | 26 | 26.0 | **17.10 of 23.14 — 74%** |
| Entry + Core | 26 | 24.0 | 6.04 — 26% |

Sensitivity, computing the bound under counterfactual eligibility:

| scenario | eligible objects | bound | forced every-form |
|---|---|---|---|
| **as built today** | **150** | **46.3%** | 3 |
| +1 object in every cell | 202 | **29.6%** | 0 |
| +2 objects in every cell | 254 | 22.0% | 0 |
| **every cell ≥ 5 objects** | **265** | **19.8%** | **0** |
| every cell ≥ 10 objects | 487 | 10.1% | 0 |
| every cell ≥ 20 objects | 998 | 4.5% | 0 |
| only Stretch+Peak cells ≥ 10 | 361 | 17.1% | 0 |
| only Entry+Core cells ≥ 10 | 276 | 39.3% | 3 |

**Three things fall out of that table.**

**One object per cell is worth 17 points of overlap.** Fifty-two objects, placed
one per cell, take the bound from 46.3% to 29.6%. Nothing else in this programme
has ever bought that much.

**The 250 figure was close in magnitude and wrong in kind.** Every cell at five
objects needs 265 — but the same 265 spread evenly across families would do
almost nothing. It is a *per-cell* requirement, and it is concentrated in the
hard bands: fixing only Stretch and Peak reaches 17.1%, while fixing only Entry
and Core leaves the bound at 39.3%.

**The binding constraint is Stretch and Peak eligibility, and it is not close.**
Twenty-six cells and twenty-six slots a form carry three quarters of the bound.

---

## 10. Recommended allocation policy

**Adopt policy D — adaptive cooldown weighted by object scarcity.**

It is the only policy that reaches the best measured diversity (64% overlap,
2.36× penalty, 130 objects emitted) while assembling 25 of 25 forms with
`verify()` green, bands exactly on the Stage-3.5 plan, and the *lowest*
single-object-cell pressure of the four.

**Do not adopt slot→family permutation.** Stage B measured it breaking 9 to 12
forms in 25 and moving the family mix by 9–13 slots; nothing here changes that.

No default was changed. `assemble()` still takes no ledger unless one is passed,
and `COOLDOWN_POLICIES.D` is available for the series driver a P4 would need.
The generator's behaviour is unchanged for anything that does not ask for it.

---

## 11. The revised P4 readiness gate

The 250-object milestone is **withdrawn**. It asked the library to be a third
larger than the corpus it is built from, and §3 shows it was also asking the
wrong question: with the supported vocabulary the best achievable overlap is 46%,
so a 20% target could not be met however well the generator allocated.

It is replaced by two criteria that move independently:

**Vocabulary completeness** — what fraction of the archetypes the corpus actually
names can the library build? Bounded by the corpus and the renderer.

**Allocation efficiency** — of the diversity the vocabulary makes *possible*, how
much does the generator capture? Measured against a ceiling computed from the
same vocabulary, bounded by 1, and the only quantity allocation work moves.

```
REVISED READINESS GATE — policy D, 25 forms

  PASS  vocabulary-completeness    183 of 189 named archetypes = 96.8%
  PASS  unbuilt-classified         every unbuilt archetype has a recorded classification
  FAIL  allocation-efficiency      74.9% of the ceiling (23.96 of 50 achievable, 32.00 achieved)
  FAIL  every-form-objects         17 objects in every form against a proven minimum of 6
  PASS  series-assembles           25/25 forms complete
  PASS  band-mix                   0 slots per form deviation
  PASS  family-mix                 0 slots per form deviation
  PASS  suites-green               77 of 77

  6/8   NOT READY
```

The gate cannot be satisfied by vocabulary alone — the suite mutation-tests
exactly that case, because it is the defect in the milestone this replaces.

### 11.1 What the two failures mean

**Allocation efficiency 74.9%.** A quarter of the achievable diversity is still
being left on the table. This *is* the tractable engineering target, and it is
bounded: the most it can buy is 32.00 → 23.96 of 50, or 64% → 48% overlap.

**Every-form objects 17 against a minimum of 6.** Eleven of those seventeen are
avoidable within the current library, and they are the same list as §9.

### 11.2 The decision this stage hands back

Four routes were on the table. The measurements pick between them.

1. **Allocation architecture** — worth doing, and bounded at 64% → 48%. Policy D
   plus whatever closes the remaining 25% efficiency gap.
2. **Supported vocabulary expansion** — **exhausted.** 183 of 189 are built and
   the last six are infrastructure, not authoring.
3. **Additional reference corpus** — the only route to a materially lower ceiling.
   The bound is set by per-cell eligibility in Stretch and Peak, and those cells
   can only be widened with archetypes; the corpus has no more to give. A fifth
   and sixth reference form would name archetypes we have not seen **and** would
   tell us what a longer series actually reuses, which four forms cannot.
4. **P4 measurement** — premature on the gate, but the case for it is stronger
   than it was: every structural condition passes, the band mix is exactly on the
   Stage-3.5 plan, and the last blind coding predates 17 new mechanism structures.
   **P4 would measure difficulty, not series capacity**, and those are now
   separable questions.

**Recommendation: 3 and 1 together, in that order.** More reference forms is the
only thing that moves the ceiling, and it is also the only thing that tells us
whether a 25-form target of 20% was ever the right target — the corpus's 2.3% is
measured over four forms, and no evidence in this programme says what twenty-five
would look like.

---

## What was verified, and what was not

**Verified by running it.** CI **77 of 77 green**, including the new
`est-capacity` suite (68 checks). The lower bound is checked against
hand-computable cases where the answer is known by arithmetic, and against the
constructive optimizer, which must never beat it. Every cooldown policy is
checked to assemble 4/4 forms without starving Stretch or Peak. Every gate
condition is broken in turn to prove it can fail alone, including the case of a
complete vocabulary allocated badly. 183 of 189 archetypes are executable and
nothing was invented to close the count.

**Not verified, and not claimed.** No fourth prototype: nothing was frozen,
rendered, hand-keyed or blind-coded, and nothing here is evidence about item
quality. No difficulty re-measurement — the last blind coding is P3's (RLx 11.66)
and seventeen mechanism structures have entered the library since. The ceiling is
optimistic by construction: it ignores anti-clone and content constraints, which
can only reject assignments. And the efficiency target of 0.85 is a judgement
about how close to a ceiling is close enough, not a corpus measurement.

**Standing constraints, unchanged.** No exam content in this repository. ESTM1-2026-A
is untouched and byte-identical. No migration was written or applied. All work is
on `claude/mock-exam-enhancement-nnwb48`.
