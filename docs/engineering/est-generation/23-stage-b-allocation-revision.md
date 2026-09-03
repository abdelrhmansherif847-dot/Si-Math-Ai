# 23 — Stage B: Series Allocation Revision

**STATUS: STAGE B — SERIES ALLOCATION REVISION — P4 NOT YET GENERATED**

No fourth prototype was generated, no forms 2–25 were produced, and the
generator is **not** approved for scaling. **The Stage-B gate does not pass: 5
of 11 conditions.** Everything below is measurement, model and library work,
produced by running the code in this repository.

---

## 0. The result in one paragraph

Stage 22 established that allocation, not vocabulary, was binding. This stage
built the model that says *where* in the allocation the loss happens, and the
answer is one layer: **of 180 objects the library can name, 137 are admissible
in a cell the assembler actually realises, and only 102 ever appear.** The
proposed fix — permuting slot→family per form — was modelled against two
alternatives and **rejected on the evidence**: it breaks between 9 and 12 of
every 25 forms and distorts the family mix by 9–13 slots, for an overlap gain a
**series ledger** delivers with 25/25 forms complete and zero mix deviation. The
mechanism stream, untouched by Stage 22, went from 12 primitives to 27 and from
24 objects to 39, which took the band mix from 12.3 slots per form off plan to
**exactly on plan** and cut the slots served by an every-form object from 26.2 to
16.5. Pairwise object overlap over 25 forms moved **72% → 63%**, the allocation
penalty **2.40× → 2.28×**, and objects emitted **116 → 139**. That is real and
it is not Stage B: the milestone asks for 250 objects and ≤20% overlap.

---

## 1. The allocation bottleneck model

`scripts/est-allocation.mjs`. Six layers, each a count of distinct objects
surviving it, so the layer with the largest drop is the constraint. Measured
over 12 assembled forms against a pool of 28,454 candidates:

| layer | objects | drop | what it means |
|---|---|---|---|
| vocabulary capacity | 180 | — | objects the library can name |
| family capacity | 180 | 0 | objects in a family the blueprint knows |
| **band capacity** | **137** | **−43** | objects admissible in a cell with standing demand |
| slot demand | 137 | 0 | 50 slots × 12 forms bounds what can be emitted |
| **emitted coverage** | **102** | **−35** | objects that actually appeared |
| series reuse | 20 | −82 | objects that appeared in exactly one form |

**The 2.40× penalty originates in two roughly equal losses**, and neither is
vocabulary. Forty-three objects are admissible only in bands their family is
never given; thirty-five more are admissible somewhere but never reached,
because a family with two slots emits at most two objects a form however many it
holds.

### 1.1 One correction the model needed before it could be trusted

The first version measured the band layer against the blueprint's **declared**
band per slot (`slot.d`) and reported a loss of 68 objects. That figure was
wrong, because **`assignBands()` ignores `slot.d` entirely** — it derives a band
from the structures the family still has. Measured against the demand the
assembler actually realises, the loss is 33. Declared demand and realised demand
are different objects and the test suite now asserts that they differ, so the
two can never quietly be conflated again.

### 1.2 A second correction: capacity the pool cannot see

`capacityMatrix` reported **A13/Core as holding zero objects while three were
emitted from it every form**. Shared-display readers are built inside the set
pass and are never pool candidates, so a model built on the pool alone cannot
see them. `readerCapacity()` supplies them as `extra`. A model that contradicts
the forms it is modelling is the one thing a model must never do quietly.

### 1.3 The family × band capacity matrix

52 cells carry standing demand. Per cell the model reports available, reachable,
emitted, never-emitted, in-every-form, expected reuse, actual reuse and the
per-cell penalty. The headline rows, before and after this stage's work:

| | Stage 22 | Stage B |
|---|---|---|
| cells with standing demand | 48 | 52 |
| **single-object cells** | **20** | **13** |
| starved cells (demand > available) | 1 | **0** |
| **slots per form served by an every-form object** | **26.2** | **16.5** |
| band mix deviation from plan | 12.33 slots | **0** |

---

## 2. Slot→family permutation, investigated and rejected

Three policies, the same library, the same seeds, and the real assembler with
one input changed — `assemble()` now takes a slot plan rather than reading the
blueprint table directly.

- **A** — the blueprint table, unpermuted. The control.
- **B** — a random re-labelling inside each family's declared per-form range.
- **C** — constraint-aware: each family's allowance leans toward the top of its
  range when the library has depth to spare and toward the bottom when it does
  not, capped by the family's **structure** count, and rotated by form index so
  no family is pinned at its maximum.

A fourth column was added once the first three were measured: **A + the series
ledger** (§3).

### 2.1 The comparison, 25 forms each

| | policy A | policy B | policy C | **A + ledger** |
|---|---|---|---|---|
| forms assembled complete | **25/25** | 13/25 | 16/25 | **25/25** |
| pairwise object overlap | 73% | 66% | 68% | **65%** |
| archetype overlap | 70% | 63% | 65% | **63%** |
| reasoning-route overlap | 70% | 63% | 65% | 64% |
| objects in EVERY form | 21 | **13** | 14 | 15 |
| objects emitted (of 180) | 116 | 120 | 122 | **134** |
| objects used exactly once | 16 | **33** | 31 | 24 |
| allocation penalty | 2.63× | 2.37× | 2.43× | **2.35×** |
| family mix deviation / form | **0** | 13.36 | 9.6 | **0** |
| band mix deviation / form | **0** | 0.77 | 0.13 | **0** |
| mechanism objects emitted | 35 | 38 | 38 | 37 |
| anti-clone collisions | 0 | 0 | 0 | 0 |
| content collisions | 0 | 0 | 0 | 0 |

### 2.2 The verdict, and why

**Reject B and C. Adopt the ledger.**

Permutation buys overlap by breaking the form. Nine to twelve forms in
twenty-five do not fill, and the reason is specific and measured: policy C gave
A12 four slots instead of one, `assignBands` sent the extra ones to Stretch and
Peak where A12's only structures are the four `P-CONVERSION` archetypes, and
those collide with each other on the object gate. Thirty-one of thirty-three
unfilled slots across a 25-form run were a family pushed into a band where it
holds one primitive.

The surviving forms are also a biased sample — B's 66% is measured on the 13
forms that happened to complete — so its apparent advantage is not even a fair
comparison. And the family mix moves 9–13 slots per form away from the shape the
corpus measured, which is the thing the blueprint exists to hold.

**Permutation cannot manufacture capacity.** Moving which family sits at which
position does not change how many objects that family has in the band it lands
in. It redistributes a shortage.

### 2.3 What the investigation did produce

Two things worth keeping, both discovered while diagnosing why C failed.

**A band-scarcity term in `assignBands`.** Planning a slot on a band where the
family has exactly one structure left is a plan with no fallback. The weight was
chosen by sweep over 25 forms, not by taste:

| weight | overlap | every-form | penalty | Stretch/form | `verify()` |
|---|---|---|---|---|---|
| 0 | 72% | 21 | 2.40× | 9.0 | 25/25 |
| **10** | **68%** | **18** | **2.26×** | **8.4** | **25/25** |
| 15 | 68% | 18 | 2.26× | 8.0 | 21/25 |
| 20 | 67% | 18 | 2.22× | 8.0 | 25/25 |
| 25 | 65% | 16 | 2.16× | 7.6 | 13/25 |

The knob buys diversity by steering slots away from single-structure cells — and
those cells are almost all Stretch and Peak, so above 20 it buys diversity by
**emptying the hard end of the form**. Stretch's floor is 8; at 25 the mean is
7.6 and half the forms fail their own band gate. Ten keeps margin. **This knob is
nearly spent**, and that is itself a finding: the rest has to come from more
structures in those cells, not from steering around them.

**A `relaxedSafe` pass in the fill loop.** The strict pass already refuses to
spend a structure a later slot is planned around; the relaxed and non-value
passes did not, and adding a second A01 mechanism made three seeds in eighteen
*worse* — an early slot took the structure a later one needed. The fill loop now
tries the safe relaxation first. Adding capacity that makes assembly worse is
exactly the sort of thing that is invisible without a fill-rate measurement.

---

## 3. The series ledger

The closed forms from Stage 22 say a random draw overlaps `S²/V` while a
schedule that uses each object `k` times overlaps `S(k−1)/(N−1)`. Every
measurement before this stage treated 25 forms as 25 independent draws. The
corpus does not; it schedules.

`seriesLedger(forms, {window})` counts how many of the recent forms each object
appeared in, and `assemble({ledger})` sorts the candidate pool by it — stably, so
the per-seed shuffle still breaks every tie. Nothing is forbidden: an object the
ledger dislikes is still placed when it is the only thing that fits, so a full
form is never traded for a fresher one.

The window was swept over 25 forms:

| window | overlap | every-form | objects used | penalty |
|---|---|---|---|---|
| none | 73% | 21 | 116 | 2.63× |
| 2 | 67% | 15 | 127 | 2.40× |
| 4 | 66% | 15 | 132 | 2.36× |
| **10** | **65%** | **15** | **134** | **2.35×** |
| 25 | 65% | 15 | 137 | 2.35× |

**It saturates at ten forms**, and the reason is this stage's subject: the ledger
can only rotate among the objects a cell actually has, and thirteen cells have
exactly one. Scheduling extracts the available rotation and then meets the
capacity floor. A window rather than a running total is also what the corpus
does — `ANTI_REPETITION.maxArchetypeUsesAcrossSeries` is 3 and
`maxArchetypeCarryoverBetweenAdjacentForms` is 4 of 50.

The ledger is **opt-in**: `assemble()` without one behaves exactly as before, and
the test suite asserts that an empty ledger produces the byte-identical form.

---

## 4. The mechanism-stream expansion

Mandatory, and the measurement said why: the mechanism stream fills more slots
than any other and Stage 22 did not touch it.

| | Stage 22 | Stage B |
|---|---|---|
| primitives | 12 | **27** |
| structures | 37 | **52** |
| objects | 24 | **39** |
| objects emitted over 12 forms | 22 | **35** |
| slots per form | 19.5 | 26.8 |

Fifteen new structures, each naming a reference archetype the library could not
previously build, each placed where the matrix measured one object against
standing demand, and each passing `assess()` unchanged:

| structure | family | species supplied |
|---|---|---|
| `P-ISOLATE/literal_system` | A01 | non-value, expression target, hidden relationship |
| `P-REGION/inequality_system_quadrant` | A04 | non-value, filtering, competing interpretation |
| `P-TANGENCY/tangent_at_vertex` | A06 | hidden relationship, multiple valid approaches |
| `P-INSCRIBED/parabola_inscribed_square` | A06 | hidden relationship, multiconcept |
| `P-SUPERPOSE/multi_curve_sum` | A09 | competing interpretation, multiconcept |
| `P-CLAIMANT/which_student_multi_claim` | A09 | non-value, competing interpretation, filtering |
| `P-EXTRANEOUS/extraneous_root` | A08 | filtering, hidden relationship, multiple approaches |
| `P-TRANSFORM/direct_variation_transformed` | A11 | hidden relationship |
| `P-BRANCH/conditional_branch_word` | A12 | filtering, hidden relationship |
| `P-CROSSOVER/two_model_intersection` | A13 | hidden relationship, competing interpretation |
| `P-INTERPRET-CONST/parameter_interpret_intercept` | A13 | non-value, interpretation, competing interpretation |
| `P-COUNT-SYMBOLIC/symbolic_counting_formula` | A15 | non-value, expression target, multiple approaches |
| `P-ALWAYS/always_true_parallel_angles` | A16 | non-value, competing interpretation, filtering |
| `P-COMPLETE-SQUARE/circle_roman_numeral` | A17 | non-value, hidden relationship, filtering |
| `P-ROTATED/coordinate_rectangle_rotated` | A17 | hidden relationship, multiple valid approaches |

`assess()` was not weakened and no item was forced into a band. The suite
mutation-checks this directly: strip the insight route, or the blind route that
lands on a distractor, or the counterfactual, and the same item fails.

### 4.1 Two things the expansion exposed

**The Roman-numeral grid is a device, not content.** Two of these archetypes are
Roman-numeral items in the corpus, and `DEVICE_BUDGETS.roman` is `[1, 1]` —
exactly one per form. With two more grid constructs in the pool, A08's
mechanism-band slot went unfilled on **nine seeds in ten**, because A08 held one
mechanism structure and it was the Roman one. They are realised here as four
prose claims instead; the reasoning and the non-value target are the archetype's,
only the presentation differs. **Worth recording separately: that budget is
enforced today only by the option-grid content signature** — two items sharing
the boilerplate "I and II only…" labels are flagged as repeated content.
The right outcome by the wrong mechanism, and `DEVICE_BUDGETS` is not consulted
by the assembler at all.

**A third false positive in the content-signature layer.** A stem printing
`f(5) = -3` and `g(5) = -3` yields the `equationCoefficients` signature `eq:-3,5`
twice, and the detector reported **"q8 and q8 share a signature"** — a form
failing its own content gate because one item said something twice. Signatures
are now deduplicated per item. That is the third such defect found by pushing on
this layer; the other two were an empty option array and the boilerplate grid.

---

## 5. The thirteen single-object cells, decided one at a time

The brief was explicit that the objective is **reference-shaped capacity, not
uniform capacity**. The decision for each cell rests on two measurements: how
many reference archetypes its family has at all, and whether its object actually
reaches every form.

Down from 20 single-object cells to 13, and from 15 whose object appears in
every form to **2**.

| cell | demand/form | in every form | decision | evidence |
|---|---|---|---|---|
| A12b/Stretch | 1.00 | **yes** | **add** — still open | A12b had 2 structures for 2 slots, the only family with no slack; two structures moved in (§5.1), Stretch still single |
| A07/Peak | 1.00 | **yes** | **keep sparse** — recorded | the only composed pattern serving A07; `COMPOSITION_LIMITS` caps composed items per form, so each pattern is near-certain to appear. A generator artefact, not a corpus one |
| A05/Stretch, A04/Peak, A02/Stretch, A12b/Core, A07/Stretch, A08/Stretch, A01/Stretch, A16/Peak, A08/Peak, A11/Stretch, A05/Peak, A14/Peak | 0.08–0.92 | no | **keep sparse** | their objects do not reach every form, and every one of these families has **all** of its reference archetypes built (A04 excepted: `inequality-from-graph` needs a graph stimulus) |

**The justification for "keep sparse" is the corpus's own reuse rate.** Over four
forms the reference reuses each family's archetypes at `k` = 0.31 (A12) to 2.00
(A02); A02 has four archetypes in the entire corpus and two slots a form. Forcing
every cell to three objects would mean inventing archetypes the corpus does not
have, which is precisely what the brief forbids.

### 5.1 The one cell that was fixed by moving rather than building

A12b is a blueprint sub-family with **no archetype list of its own** — its
objects are filed under percentages elsewhere — and it held exactly two
structures against two slots every form, so both of its objects appeared in every
one of twelve forms. Two structures were moved into it: the successive-percentage
Core construct (whose id was already `A12b`, and which was filed under A12 only
because that is where it was written) and the `undo-a-percent-increase` routine
ask. Undoing a percent change on a population is a share question. After the
move, A12b/Entry and A12b/Core are no longer single-object; A12b/Stretch still is.

---

## 6. Before and after

### 6.1 Reachable capacity

| | Stage 22 | Stage B |
|---|---|---|
| executable vocabulary (objects) | 166 | **180** |
| reference archetypes built | 165 of 189 | **179 of 189** |
| band-reachable objects | 133 | **137** |
| objects emitted over 12 forms | 98 | **102** |
| objects emitted over 25 forms | 116 | **139** |
| mechanism objects | 24 | **39** |

### 6.2 Allocation penalty

| | Stage 22 | Stage B |
|---|---|---|
| pairwise object overlap, 25 forms | 72% | **63%** |
| random-draw prediction | 15.1 of 50 | 13.9 of 50 |
| measured overlap | 36.2 of 50 | **31.7 of 50** |
| **allocation penalty** | **2.40×** | **2.28×** |
| objects in every form | 21 | **15** |
| slots/form from an every-form object | 26.2 | **16.5** |

### 6.3 The 25-form simulation, in full

25 forms, seeds `31400 + 977i`, ledger on, **25/25 complete**:

```
pairwise object overlap    63%   (31.66 of 50)
archetype overlap          61%
reasoning-route overlap    61%
stimulus-shape overlap     33%
numeric configurations      1%
equation structures         3%
objects in EVERY form      15
objects emitted           139 of 180
allocation penalty       2.28x
```

### 6.4 Emitted versus available, and what is emitted

| target species | items per form | status |
|---|---|---|
| value | 37.1 | 74% of the form — reference 64–76% ✓ |
| selection | 7.2 | emitted |
| expression | 2.8 | emitted |
| interpretation | 1.5 | emitted |
| equation | 0.4 | emitted |

The non-value species are **emitted, not merely available** — the Stage-22 defect
where a capability existed and never once appeared is closed and stays closed.

---

## 7. The Stage-B gate

`stageBGate()` is executable and every condition can fail on its own; the test
suite breaks each in turn and asserts the gate names it.

| condition | result | measurement |
|---|---|---|
| executable vocabulary ≥ 250 | **FAIL** | 180 |
| pairwise object overlap ≤ 20% | **FAIL** | 63% |
| no object in every simulated form | **FAIL** | 15 |
| no unintended single-object-forced cell | **FAIL** | 2 undecided of 14 |
| allocation penalty moving toward 1× | **FAIL** | 2.28× against a 1.5× target |
| non-value species actually emitted | **PASS** | equation 0.4, interpretation 1.5, selection 7.2 per form |
| mechanism capacity materially increased | **FAIL** | 39 objects against a 60 target — though 24 → 39 is the increase |
| family mix reference-shaped | **PASS** | 0 slots deviation |
| band mix reference-shaped | **PASS** | 0 slots deviation, exactly on the Stage-3.5 plan |
| all QA/mutation suites green | **PASS** | 76 of 76 |
| the series assembles | **PASS** | 25/25 forms complete |

**5 of 11. STAGE B DOES NOT PASS.**

### 7.1 The vocabulary milestone cannot be met from the corpus

This is the finding that decides what happens next, and it is arithmetic rather
than opinion. **The corpus names 189 archetypes. The library builds 179.** Ten
remain, and none of them is authoring work: five need an option layer that can
hold a graph or a Roman grid (`inequality-from-graph`, `absvalue-graph-identify`,
`graph-roman-numeral`, `physics-graph-unit-conversion`, `vertical-line-roman`)
and five need display readers the stimulus layer does not offer
(`event-anchored-series-scan`, `parameter-interpret`,
`parameter-interpret-constant`, `pie-ratio-on-remainder`,
`read-then-percent-scaled`). Reaching **250
reference-shaped objects is therefore impossible from the vocabulary four
reference forms reveal** — the milestone is 32% larger than the corpus itself.

It can be reached in exactly two ways, and they are different kinds of work:

1. **Code more reference forms.** The 189 is what four forms revealed. A fifth
   and sixth would name archetypes we have never seen, and would also tell us
   what a longer series actually reuses — which four forms cannot.
2. **Accept objects the corpus does not name.** Legitimate where the domain
   plainly supports them, and the library already does it in four places
   (`P-CONVERSION`'s forms carry `own:` objects). But it is no longer *measured*
   coverage, and the discipline that has held since Stage 20 — every object is a
   named archetype — would need an explicit, recorded exception.

**Neither is a code change, and neither should be chosen by an implementer
alone.**

---

## 8. What was verified, and what was not

**Verified by running it.**

- CI **76 of 76 green**, including the new `est-allocation` suite (87 checks,
  every measurement paired with a mutation).
- `verify()` passes **25 of 25** assembled forms; object diversity 25/25; **zero
  content collisions across 25 forms**.
- Band mix **exactly on the Stage-3.5 plan** — Entry 13.0, Core 11.0, Stretch
  12.0, Peak 14.0 — measured over 25 forms. Before this stage it was Entry 16.2,
  Core 14.0, Stretch 9.0, Peak 10.8.
- All 15 new mechanism structures build load-bearing items under an unchanged
  `assess()`, and the suite proves the gate still bites by breaking each clause.
- The ledger never costs a slot: 25/25 forms complete with it on, and an empty
  ledger produces the byte-identical form.
- Every named object is still a reference archetype; the registry has no
  duplicate key.

**Not verified, and not claimed.**

- **No fourth prototype.** Nothing was frozen, rendered, hand-keyed or
  blind-coded. Nothing here is evidence about item quality.
- **No difficulty re-measurement.** The last blind coding is P3's (RLx 11.66).
  Fifteen mechanism structures have entered the library since and the band mix
  has moved onto plan — which should raise measured difficulty — but **that is a
  prediction, not a measurement**. A P4 will have to re-code.
- **The A/B/C comparison for B and C is on incomplete series.** Their overlap
  figures come from the 13 and 16 forms that assembled, which is a biased
  sample. That does not change the verdict — the incompleteness *is* the verdict
  — but their numbers should not be quoted as if they were comparable to A's.
- **The mechanism target of 60 objects is a judgement**, set at roughly 1.5× the
  Stretch+Peak slot demand. It is not derived from the corpus, which does not
  categorise items by generator stream.

---

## 9. P4 readiness verdict

**NOT READY. Do not generate P4.**

The gate fails on five conditions and the largest, vocabulary, cannot be closed
by more of the work this stage did. The next step is **not another library
revision of the same kind** — the corpus vocabulary is 94% built and the last
10 archetypes need renderer capability, not authoring.

Ranked by measured effect, what would actually move the remaining conditions:

1. **A decision on the vocabulary milestone** (§7.1). Code more reference forms,
   or record an explicit exception permitting objects the corpus does not name.
   Everything else is downstream of this.
2. **Mechanism objects 39 → 60+.** The Stretch and Peak bands are 26 of 50 slots
   and only mechanism and composed items can serve them; at 39 objects those 26
   slots draw from 1.5 objects each. This is the one capacity lever left that
   does not need a decision above it — but it needs archetypes, which brings it
   back to 1.
3. **A second composed pattern per family.** Each of the three patterns serves
   exactly one family, so each appears in essentially every form. A07/Peak is
   one of the two remaining every-form cells for exactly this reason.
4. **An option layer for graphs and Roman grids, and five more display
   readers**, which is all ten remaining archetypes and would let the Roman
   device rotate properly.
5. **Enforce `DEVICE_BUDGETS` in the assembler.** The Roman budget is currently
   held by a content-signature side effect (§4.1). It works; it should not be
   what holds it.

**Standing constraints, unchanged.** No exam content in this repository; only
structures, fingerprints and counts. ESTM1-2026-A is untouched and byte-identical.
No migration was written or applied. All work is on
`claude/mock-exam-enhancement-nnwb48`.
