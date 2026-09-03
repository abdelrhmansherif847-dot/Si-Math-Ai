# 22 — Series Capacity and Library Expansion

**STATUS: SERIES CAPACITY ANALYSIS + LIBRARY EXPANSION — P4 NOT YET GENERATED**

No fourth prototype was generated in this pass, no forms 2–25 were produced, and
the generator is **not** approved for scaling. Everything below is measurement
and library work. Every number was produced by running the code in this
repository on the date of writing; nothing is recalled or estimated.

---

## 0. What changed, in one paragraph

P3 passed every single-form gate and failed the series question: 25 forms drawn
from the library shared **83% of their mathematical objects pairwise** against a
reference corpus that shares about 2%. This pass built an executable model of
what a 25-form series actually requires, expanded the library from **86 to 165
of the corpus's 189 named archetypes**, and re-measured. Pairwise object overlap
fell from **81% to 72%**. That is real movement and it is nowhere near enough,
and the reason is now measured rather than suspected: **the binding constraint
has changed from vocabulary to allocation.** A random draw from the library the
generator now has would overlap 15.1 of 50 items; the generator overlaps 36.2.
The gap is a factor of **2.4×**, and it lives almost entirely in one stream.

---

## 1. The series-capacity model

`scripts/est-series.mjs` is the model, and it is executable rather than
descriptive. Fifteen quantities, all of them measured over assembled forms.

### 1.1 The two closed forms

Two allocation policies bracket everything the generator could do.

**Random draw.** Each form draws `S` objects independently from a vocabulary of
`V`. Expected pairwise overlap is

```
E[overlap] = S² / V
```

and — this is the part that matters — **it does not depend on how many forms
there are.** Twenty-five forms overlap exactly as much pairwise as four do. A
series cannot be made more diverse by being longer.

**Scheduled allocation.** Each object is deliberately used `k` times across `N`
forms:

```
overlap = S(k − 1) / (N − 1)        V = N·S / k
```

At `k = 1` the overlap is zero. The corpus sits at `k ≈ 1.06`.

### 1.2 What a share costs

`requiredCapacity(share)` inverts both models. For a 25-form series of 50 items:

| overlap ceiling | as items of 50 | vocabulary, drawn | vocabulary, scheduled |
|---|---|---|---|
| 2.3% (the corpus) | 1.2 | 2,174 | 806 |
| 8% | 4 | 625 | 429 |
| 16% | 8 | 313 | 259 |
| 20% | 10 | 250 | 216 |
| 42% | 21 | 120 | 113 |

### 1.3 The other thirteen

Ten pairwise-overlap axes (`objects`, `archetypes`, `families`,
`numericConfigurations`, `targetExpressions`, `equationStructures`,
`representationPatterns`, `stimulusShapes`, `optionStructures`,
`reasoningRoutes`), plus objects-in-every-form, objects-in-more-than-one-form,
mean uses per object, distinct objects per slot, forms before a forced repeat,
and the allocation penalty.

**Each axis declares what its overlap MEANS.** `AXIS_MEANING` records, per axis,
whether overlap is measured against slots, stimuli or vocabulary, and whether
overlap is a defect at all. Family overlap is 100% and always will be: the
blueprint puts all eighteen families in every form by design. Reporting that as
a diversity failure would be reporting the specification as a bug. The test
suite asserts this classification, because an unclassified axis is how a model
starts grading its own design decisions as defects.

---

## 2. What the reference actually does, and a target that is honest about it

### 2.1 The reference's reuse policy, measured

From the four-form corpus (`REFERENCE_SERIES`, artifact 2 §3 and the item-level
database):

| | |
|---|---|
| **Always reused** | The 18 topic families. Every form covers every family. |
| **Almost never reused** | Named archetypes: 7 of 191 appear in more than one form — **3.7%**. |
| **Repeated at family level** | Always. Family overlap is 16 of 18 pairwise. |
| **Rarely repeated at object level** | Pairwise archetype overlap 1.17 of 50 — **2.3%**. |
| **Never repeated inside a form** | 49, 49, 50, 50 distinct archetypes in 50 slots. |
| **Never consecutive** | No archetype appears at adjacent positions across the series. |
| **Recurs only after a gap** | The 7 repeated archetypes are separated by at least one whole form. |

### 2.2 Why the corpus is evidence of scheduling, not of size

189 archetypes for 200 slots is barely more vocabulary than slots. A **random**
draw from 189 objects would overlap 13.2 of 50 items — 26%. The corpus overlaps
1.17. **The corpus does not achieve its diversity by having a large library. It
achieves it by allocating a small one deliberately.** That single fact reframes
the whole problem, and it is why this pass measures an *allocation penalty*
separately from vocabulary.

### 2.3 The target, stated honestly

The instruction was explicit: do not blindly target 1,206 objects if the
evidence does not justify it. It does not. The corpus's own vocabulary is 189,
and four forms cannot tell us what twenty-five would need — a 25-form corpus
might reuse far more, and we have never seen one.

So the target is a **ladder**, and its top rung is deliberately looser than the
corpus:

| stage | vocabulary | overlap ceiling | status |
|---|---|---|---|
| **A** | 120 | ≤ 42% | **REACHED** (166) |
| **B** | 250 | ≤ 20% | not reached |
| **C** | 625 | ≤ 8% | not reached |

`SERIES_TARGET.gateBeforeP4 = 'B'`, `gateBeforeScaling = 'C'`. Reproducing the
corpus's own 2.3% at N=25 would need roughly 2,174 objects drawn or 806
scheduled, and the model records that as `referenceShare` rather than as a
target, precisely so nobody later mistakes the aspiration for the requirement.

**Stage A is reached on vocabulary and not on overlap.** The library holds 166
nameable objects, comfortably past 120, and still overlaps 72%. That is the
whole finding of this pass in one line.

---

## 3. The library expansion

### 3.1 What was added

**62 routine asks** — `scripts/est-vocabulary.mjs`, across all eighteen
families. Organised by ASK rather than by family, because the ask *is* the
object: `sum-of-roots` and `product-of-roots` are two objects because the
relation invoked differs; `sum-of-roots` with different numbers is one object
twice. Every one of the 62 names a reference archetype the library could not
previously build.

**18 Core structures** — `scripts/est-core-stream.mjs`: fifteen constructs
(A01c, A03b, A05c, A06b, A07b, A08b, A09b, A10, A11c, A12c, A14b, A15c, A16b,
A16c, A17b) and three shared-display Core readers, taking the stream from 21
structures to 36 constructs plus 7 readers. Each declares a solution path
and a **rival** — a different question, answered correctly, at no less cost —
and is checked by `assessCore()`. No gate was loosened to admit any of them.

Reference-archetype coverage: **86 → 165 of 189 (46% → 87%)**.

### 3.2 The discipline, and where it stopped

A new object counted only where it changed the mathematical object, the target,
the representation, the reasoning decision, the constraint structure, the
interpretation or the solution route. Renamed variables, changed constants,
reordered options and equivalent algebraic forms counted as nothing, and none
were added.

**24 of the 189 archetypes remain unbuilt, and 6 of those are unbuildable
rather than undone.** `layout()` lays out exact rational VALUES, so an ask whose
OPTIONS are expressions, graphs or Roman-numeral sets cannot be expressed at
all: `literal-system`, `inequality-from-graph`, `graph-roman-numeral`,
`which-student-multi-claim`, `absvalue-graph-identify`, `vertical-line-roman`.
Those need an option layer that can hold non-numeric alternatives. They are
counted as unbuildable in the coverage table, not as missing effort.

### 3.3 The construction lesson, twice

Of the first 16 asks written, four yielded under half their seeds and one
yielded **zero**; of the next 46, twenty-two did. Every single failure was the
same mistake in a different costume: **sampling an answer and rejecting the
seeds where it came out wrong, instead of constructing the answer and deriving
the question.** `inverse-vs-reciprocal` sampled an output and hoped `(y − b)/a`
landed on an integer — 43 of 60 seeds discarded. `percent-change-base` demanded
two whole percentages — 50 of 60. `similar-right-triangles-altitudes` demanded a
whole altitude `ab/c`, which no Pythagorean triple a paper prints ever has —
60 of 60.

Two produced worse than low yield. `substitute-into-radical` offered
`sqrt(a²x)` as the distractor for `a·sqrt(x)`, which **is** the key, and yielded
0/60. `complex-fraction-simplify` computed `Q(qNum(key) * 1000) && key`, which
*threw* whenever the key was not an integer — the acceptance count that read
2/60 was catching an exception, not a rejection.

After rebuilding each from its answer outward, **62 of 62 asks yield at least
half their seeds**, and 35 of them yield above 80%.

### 3.4 The pool depth that the expansion made necessary

Adding eighteen Core structures left two seeds in twelve one slot short. The
cause was not a gate: 28 of 50 slots are Core, a Core candidate must clear
`admits(Core, …)` on top of every diversity rule, and at equal per-construct
depth a family's shallow pool ran out. `buildPool` now generates **twice** the
depth for Core that it does for the other streams, and A06 — which held one Core
structure against a Core slot the blueprint asks for every form — got a second.
**18 of 18 seeds now fill 50/50.** No gate was touched.

---

## 4. Capability is not coverage

Three quantities that this programme has been conflating, now measured
separately by `emittedCoverage()`:

- **capacity** — the library can build it at all
- **demand** — the blueprint has slots whose family and band could accept it
- **emitted** — it actually appears, measured over assembled forms

Over twelve assembled forms:

| | before this pass | after |
|---|---|---|
| pool constructs | 161 | **176** |
| reached (≥20% of forms) | 61 | **61** |
| rare (appears, <20%) | 29 | **29** |
| **UNREACHABLE (capacity + demand, zero emissions)** | 71 | **86** |
| no demand | 0 | 0 |

**Read those columns again.** The library grew by 78 structures and the number
of structures that actually reach a slot did not move by one. Ninety distinct
constructs are emitted across 600 placements, before and after.

That is not a bug in the expansion. It is the measurement of a ceiling nobody
had looked for: **the number of distinct constructs a form can emit is set by
the blueprint, not by the library.** Fifty slots, each pinned to a family and a
band, with `maxPerSubForm = 2` — the emitted count is bounded by the slot
structure, and the library has been above that bound for some time.

The one axis that did move is the one the P3 review flagged. At P3, the
equation-targeted constructs measured **0 reached / 2 unreachable / 0 items per
form** — a capability the blueprint had demand for and that never once appeared.
They now measure **1 reached / 0 unreachable / 1.08 items per form**.

---

## 5. Where the reuse actually lives

Per stream, over twelve assembled forms:

| stream | slots/form | distinct objects | in EVERY form | mean forms per object |
|---|---|---|---|---|
| mechanism | 19.6 | 22 | **16** | 10.7 |
| core | 15.3 | 29 | 2 | 6.4 |
| routine | 12.8 | 44 | 3 | 3.3 |
| composed | 2.3 | 3 | 2 | 9.3 |

Before this pass the core row read **17 objects, 8 in every form**. The core
work moved it to 29 and 2. The routine stream was already spread and stayed
spread. **The mechanism row did not move at all, because nothing was added to
it**, and it fills more slots than any other stream.

`forced.mjs` measures why, per (family, band) pair the blueprint demands:

- **26.2 of 50 slots per form** are filled by an object that appears in every
  form (was 29.1).
- **25 of 48** (family, band) pairs offer fewer than 1.5 distinct objects per
  slot they demand (was 27 of 47).
- **Twenty-three pairs offer exactly ONE object.** Fifteen of those are
  mechanism, two composed, two core, two routine, and two more mechanism pairs
  that the band plan does not always fill.
- **Fifteen of the twenty-three fill a slot in every one of the twelve forms**,
  and so their single object is in every form: A01/Peak, A04/Peak, A05/Stretch,
  A07/Peak, A07/Stretch, A08/Stretch, A09/Stretch, A10/Peak, A10/Stretch,
  A12b/Entry, A12b/Stretch, A14/Peak, A15/Peak, A17/Peak, A18/Peak. Thirteen are
  mechanism or composed; one is routine.

**That is the whole remaining problem, and it is now a list rather than a
feeling.** A (family, band) pair with one structure emits the same object in
every form no matter how large the library is.

---

## 6. Mechanism, load-bearing, and difficulty are three things

`assess()` was not weakened, and no mechanism item was forced into a band.

The confusion `assess()` invites is that it proves a mechanism is **present and
load-bearing** — an insight route reaches the key, no mechanism-blind route
reaches it more cheaply, a blind route lands on a printed distractor, and a
counterfactual holds — and none of that is a claim about **difficulty**.

Measured on the 200-item reference corpus, the rate at which each mechanism's
bite coincides with an Entry-band item:

| DIFFICULTY_CARRYING | easy rate | | DIFFICULTY_SUPPORTING | easy rate |
|---|---|---|---|---|
| `hidden_step` | 0% | | `reversal` | 7% |
| `inference` | 0% | | `filtering` | 15% |
| `nonobvious_rel` | 0% | | `abstraction` | 16% |
| `multiconcept` | 3% | | `repr_switch` | 18% |
| `competing_interp` | 4% | | | |

Items with two or more mechanisms biting and **no** carrying mechanism: n=8,
banded Core 3 / Stretch 2 / Peak 3, mean RLx 14.1. With a carrying bite: n=80,
Stretch 22 / Peak 58, mean RLx 17.1, never Entry or Core.

So the signature model admits a supporting-only item to **Core** and does not
require it to reach Stretch or Peak. That is what `profileOf().carry` is for.
A mechanism item is not automatically a hard item, and pretending otherwise was
what pushed the whole library toward the top of the scale.

---

## 7. The P3 content collision, fixed structurally

P3's Q15 and Q47 both printed `f(x) = 2x + 4`. The detector in place at the time
compared trimmed stem strings above a length threshold, which is a proxy for
content, not content.

`scripts/est-content.mjs` replaces it with seven structural signatures:
`functionalForm`, `equationCoefficients`, `targetExpression`, `numericTuple`,
`geometricConfiguration`, `transformationParams`, `optionGrid`. Run against the
frozen P3 payload today:

```
P3 content collisions under the structural signatures:
  q15 and q47 share a functionalForm signature
  Q15: ["functionalForm","f:deg1:2,4"] …
  Q47: ["functionalForm","f:deg1:2,4"] …
```

The signatures are wired into the assembler's `contentClash`, so a form carrying
that pair cannot be emitted: **12 of 12 assembled forms carry zero content
collisions.**

**No string-length threshold survives anywhere in the detector**, and the
guarantee that it does not fire on shared mathematical furniture is executable:
`COMMON_FORMULAS` holds six statements — the slope-intercept form, Pythagoras,
the circle's area, a bare square, the quadratic formula, a cylinder's volume —
and the suite asserts that no two of them collide.

**Writing that test found a live false positive.** `signaturesOf` emitted an
`optionGrid` signature whenever `item.options` was truthy — and an *empty array*
is truthy, so any two items with no printed options collided on the signature
`''`. Every assembled item has four options, so it could never fire in
production, which is exactly why it survived review. It now requires at least
two options, and three mutations pin the behaviour.

**Only fingerprints and signatures are stored. No reference question text is in
this repository or in any file this pass produced.**

---

## 8. Three-level diversity

The objective is not "more unique fingerprints". All three levels must pass.
Measured over twelve assembled forms:

| level | what it asks | result |
|---|---|---|
| **1 — object diversity** | no form asks one mathematical object more than twice; at most one object repeats | **12/12 PASS**, 49–50 distinct objects per form (reference 49–50) |
| **1b — content** | no two items in a form share a structural signature | **12/12 PASS** |
| **2 — reasoning species** | distinct reasoning routes within and across forms | **50 of 50 distinct in every form**; 108 distinct species across the series |
| **3 — series-level reuse** | pairwise reuse across the series | **FAIL** |

Level 3, in full:

```
objects 73%, reasoningRoutes 71%, archetypes 71%, stimulusShapes 39%
23 objects appear in EVERY form; the corpus has none
allocation penalty 2.41x
```

**Levels 1, 1b and 2 pass and level 3 fails, and that combination is the
finding.** A generator can produce fifty distinct objects and fifty distinct
reasoning routes in every single form it makes, and still hand a student who
sits two of them the same 36 questions in different clothes. Per-form diversity
gates cannot see this. `objectDiversity()` is not a series-diversity solution
and was never going to be.

---

## 9. The 25-form series, before and after

25 forms, seeds `31400 + 977i` for i = 1…25, all 25 assembled complete.

| | before | after |
|---|---|---|
| vocabulary (nameable objects) | 90 | **166** |
| objects actually used | — | 116 |
| **pairwise object overlap** | 40.7 / 50 — **81%** | **36.2 / 50 — 72%** |
| archetypes | 79% | 70% |
| reasoning routes | 80% | 71% |
| stimulus shapes | 39% | 38% |
| numeric configurations | 1% | 1% |
| equation structures | 2% | 2% |
| objects in EVERY form | 28 | **21** |
| objects in more than one form | 94% | 85% (reference 3.7%) |
| mean uses per object | 14.4 | 10.8 |
| distinct objects per slot | 0.07 | 0.093 (reference 0.955) |
| random-draw prediction | 27.8 / 50 | 15.1 / 50 |
| **allocation penalty** | 1.46× | **2.40×** |
| stage reached | NONE | NONE |

**The allocation penalty went up while overlap went down, and that is the
signal.** Doubling the vocabulary halved what a random draw would produce and
the generator captured under a quarter of that improvement. Vocabulary is no
longer the binding constraint. Allocation is.

---

## 10. What has to happen before P4

Ordered by measured effect, not by ease.

**10.1 — The mechanism stream needs the treatment the Core stream just had.**
22 objects, 16 in every form, 19.6 of 50 slots. Thirteen of the fifteen
(family, band) pairs whose single object appears in every form are mechanism or
composed. Bringing each of the twenty-three single-object pairs to three
requires roughly **46 new structures**, most of them mechanism, and each must
pass `assess()` — insight route,
anti-bypass, a blind route landing on a printed distractor, and a counterfactual
that holds. This is the single largest remaining piece of work and it is not a
vocabulary exercise; it is thirty-two individually argued items.

**10.2 — Per-form slot→family assignment.** The blueprint pins the same family
to the same slot in all 25 forms, so a family with one Peak-capable structure
emits that object 25 times whatever the library holds. Permuting the assignment
per form, inside the family-share and adjacency rules, would let forced pairs
rotate. **This changes a Stage-2 artefact and would invalidate part of the
Stage-2.5 and Stage-3.5 validation, so it is proposed here and not implemented.**

**10.3 — A series-aware assembler.** Every measurement in this document treats
25 forms as 25 independent draws. The corpus does not; it schedules. A series
ledger that records which objects each earlier form used and penalises them in
the next is the difference between `randomOverlap` and `scheduledOverlap` — a
factor of 2.7 at the corpus's own share. `scripts/est-series-ledger.mjs` exists
and is not yet consulted by `assemble()`.

**10.4 — A non-numeric option layer**, for the six archetypes `layout()` cannot
express.

**Recommended gate before P4 is generated:** Stage B — 250 objects and ≤20%
pairwise overlap — with 10.1 and at least one of 10.2/10.3 done. Generating P4
against the current library would re-measure what this document already
measures.

---

## 11. What was verified, and what was not

**Verified by running it.**

- CI: **75 of 75 green**, including the new `est-series-capacity` suite
  (96 checks, every measurement asserted in both directions).
- Assembly: **18 of 18 seeds fill 50/50**; `verify()` passes 12 of 12 forms.
- Every one of the 62 routine asks builds, passes `assessRoutine()`, and maps to
  exactly one `CONSTRUCT_OBJECT` entry that matches what it declares.
- Every one of the 36 Core constructs and 7 Core readers builds and passes
  `assessCore()`.
- The object registry has no duplicate key and names no object that is not a
  reference archetype.
- The P3 content collision is detected; twelve fresh forms carry none.
- The empty-`optionGrid` false positive, found by writing the test.

**Not verified, and not claimed.**

- **No fourth prototype was generated.** No form was frozen, rendered, hand-keyed
  or blind-coded in this pass. Nothing here is evidence about item quality.
- **No difficulty re-measurement.** The last blind coding is P3's (RLx 11.66).
  Eighteen Core structures and 62 routine asks have entered the library since,
  and their effect on the band profile is **unmeasured**. A P4 will have to
  re-code.
- **The 25-form measurement is of assembled forms, not reviewed forms.** It
  measures structure, not whether the items are good.
- **`gateBeforeScaling = 'C'` is a judgement**, extrapolated from a four-form
  corpus. Four forms cannot tell us what twenty-five need.

**Standing constraints, unchanged.** No exam content in this repository. Only
fingerprints and structural signatures are stored. ESTM1-2026-A remains frozen
and untouched. No migration was written or applied. All work is on
`claude/mock-exam-enhancement-nnwb48`.
