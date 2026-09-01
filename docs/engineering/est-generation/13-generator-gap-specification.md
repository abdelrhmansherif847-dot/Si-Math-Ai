# 13 — Generator Gap Specification

**STATUS: DESIGN SPECIFICATION — NOT IMPLEMENTED**

> This specification translates the n=200 Evidence-based Descriptive Difficulty
> Model into generator requirements. No generator code, blueprint, or prototype
> has been modified by this document.

Artifact 12 is unassigned. This is artifact 13 by explicit instruction.

**No exam content in this repository.** It is public. The corpus lives outside it.
Every archetype below is a structural description and every illustration is our
own. Corpus items are cited by coded identifier and by *mechanism* only.

---

## 0. Scope and provenance

| | |
|---|---|
| Evidence base | 200 reference items, 4 forms, coded item-by-item from the original papers and the publisher's own worked solutions |
| Method check | 20-item blind re-code, 280 cells, originals sealed until after comparison |
| External anchor | The publisher's printed Knowledge / Application / Reasoning classification, 200 labels, not used to build the frame |
| Comparison target | `ESTM1-2026-A`, frozen, re-coded at the current standard, unmodified |
| What this document changes | Nothing executable |

**Terminology.** *Mechanism* = a coded dimension of the forensic frame.
*Species* = a distinguishable way a mechanism is realised in an item.
*Primitive* = a generator construct that produces a species reliably.
*Load-bearing* = the mechanism was coded `2`, i.e. present **and** carrying the item.

**Two coding epochs.** Forms 1–2 were coded before the drift measured in §1.4;
Forms 3–4 and the `ESTM1-2026-A` re-code share the later epoch. **All prevalence
figures in this document are Forms 3+4 (n=100) against `ESTM1-2026-A` (n=50),
because those three were coded in the same pass.** Correlations are pooled over
all four forms using within-form z-scores, which cancel an additive per-form
coder offset exactly.

---

## 1. Frozen evidence

These are the conclusions this specification is built on. They are not re-opened
here.

### 1.1 The step-count demand score is not a valid difficulty model

`demand = steps + 2·derived + offsheet + repr-mismatch + boundary + multi-branch
+ interpreted-stimulus` counts work at every term.

```
r(steps, reasoning load) pooled                       +0.413
partial r(steps, rest | 4 mechanisms)                 +0.036
ΔR² on reasoning load, adding steps                    0.000
ΔR² on the publisher's own KAR label, adding steps    +0.004
```

Normalised for scale, step count is **12th of 14** at separating the Peak
quartile from Entry. Ranking a form by steps rather than by mechanisms moves
25–35 of its 50 items into a different quartile band, on all four papers.

### 1.2 Three mechanisms are robust

Corrected item-total correlation (each dimension against the sum of the other
twelve), per form and pooled:

| Mechanism | T1 | T2 | T3 | T4 | pooled | spread |
|---|---|---|---|---|---|---|
| `hidden_step` | 0.61 | 0.57 | 0.63 | 0.77 | **0.65** | 0.20 |
| `inference` | 0.59 | 0.37 | 0.62 | 0.68 | **0.65** | 0.31 |
| `multiconcept` | 0.52 | 0.37 | 0.60 | 0.63 | **0.56** | 0.27 |

### 1.3 The rest, in their measured standing

- `nonobvious_rel` — positive on all four forms (0.23–0.70, pooled 0.49) but a
  spread of 0.47. **Promising, wider, not robust.**
- `distractor_close` (100% presence, sd 0.31) and `opacity` (98% presence,
  sd 0.40) — **authenticity floors, not difficulty levers.** A variable with no
  variance cannot discriminate, and `distractor_close` flips sign between forms.
- `reversal` alone — four forms, no relationship (−0.08 to 0.39). **Reversal
  plus an offered wrong-direction distractor** is a candidate mechanism, on the
  evidence of one matched pair (T3-Q23 trivial / T4-Q47 not). Still a candidate.
- `approaches`, `competing_interp`, `filtering`, `abstraction` — all flip sign
  across forms. **Handled on the evidence, not on how sophisticated they sound.**

### 1.4 Coder drift was demonstrated, and cross-form level differences are void

Same 20 items, blind: **+4.00 reasoning-load points**, larger than any
form-to-form gap in the corpus.

```
judgement dimensions (11)   mean shift  +0.405
mechanical dimensions (3)   mean shift  +0.017
r(original, blind)                      +0.751   -> level shift, not re-ordering
```

**Cross-form level differences must not be read as form difficulty differences.**
Rank order within a form survives; level does not.

### 1.5 The external criterion is supportive, not validating

Within-form z-scores, so drift cancels:

```
Knowledge   n= 77   z = −0.29
Application n=104   z = +0.03
Reasoning   n= 19   z = +1.01
```

19 items against a three-level editorial label. **This is not psychometric
validation and must never be described as calibration.**

### 1.6 The verdict, and the sequence

**D — a combination**: mostly **C** (distribution and strength), a real **B**
component (missing generation species), less **A** than first thought
(−0.50 reference SD, not a different kind of paper).

**prove the model → change the generator → prove it on one prototype → then
scale to 25 forms.** This document is the end of stage one and the input to
stage two.

---

## 2. Mechanism-by-mechanism gap table

Prevalence is `share of items with the mechanism present (≥1)` /
`share where it is load-bearing (==2)`. Reference = Forms 3+4, n=100.
Prototype = `ESTM1-2026-A`, n=50.

| Mechanism | Evidence strength | Reference | ESTM1-A | Current generator support | Problem type | Required action |
|---|---|---|---|---|---|---|
| `hidden_step` | **Robust** — all 4 forms, 0.57–0.77, pooled 0.65 | 89% / **33%** | 68% / **16%** | L2 derived target — one species only | Wrong species produced, and half the frequency | **NEW CONSTRUCT** |
| `inference` | **Robust** — all 4 forms, 0.37–0.68, pooled 0.65 | 71% / **19%** | 60% / **8%** | L3 off-sheet formula — recall species only | Wrong species produced | **NEW CONSTRUCT** |
| `multiconcept` | **Robust** — all 4 forms, 0.37–0.63, pooled 0.56 | 86% / 15% | 64% / 14% | L7 stacked devices | Frequency of presence, not of power | **STRENGTHEN** |
| `nonobvious_rel` | Positive all 4, spread 0.47, pooled 0.49 | 53% / 8% | 38% / 8% | none | No construct exists | **NEW CONSTRUCT** |
| `competing_interp` | Sign flips (−0.04 … 0.36), pooled 0.26 | 46% / **16%** | 34% / **2%** | none | No construct; evidence thin | **NEW CONSTRUCT** (gated, §3.M4) |
| `repr_switch` | Positive all 4 but weak (0.03–0.20) | 49% / 26% | 50% / **32%** | L4 representation mismatch | Already at or above reference | **KEEP** |
| `trap_cost` | Positive all 4, spread 0.51, pooled 0.22 | 98% / 50% | 100% / 36% | L5 boundary + D1–D9 | Under-powered, not missing | **STRENGTHEN** |
| `filtering` | Sign flips (−0.07 … 0.31) | 48% / 17% | 56% / 12% | none explicit; emergent | At parity; evidence does not support promotion | **MONITOR / HOLD** |
| `abstraction` | Sign flips (−0.03 … 0.27) | 68% / 19% | 50% / 14% | implicit in family choice | Below reference but evidence weak | **MONITOR / HOLD** |
| `approaches` | Sign flips (−0.02 … 0.23) | 60% / 10% | 36% / **0%** | none | Absent from the prototype; evidence weak | **MONITOR / HOLD** |
| `reversal` | Sign flips (−0.08 … 0.39) | 44% / 10% | 24% / 6% | L2, weakly | Candidate only in combination | **MONITOR / HOLD** |
| `distractor_close` | 100% presence, sd 0.31, sign flips | 100% / 87% | 100% / **100%** | D1–D9 distractor model | **Over-applied as a difficulty lever** | **AUTHENTICITY FLOOR** |
| `opacity` | 98% presence, sd 0.40 | 98% / 81% | 96% / 72% | emergent | Ceiling variable | **AUTHENTICITY FLOOR** |
| `steps` (L1) | partial r +0.04, ΔR² 0.000 | mean 4.20 ops | mean 2.98 ops | L1, the base lever | Invalid as a difficulty ordering | **DO NOT USE AS DIFFICULTY LEVER** |
| `self_verify` | Modifier only; r −0.455 with z-load | mean 1.60 | mean 1.86 | none | Recorded, never summed | **MONITOR / HOLD** |

**Secondary requirements** (the table permits one action per row; these attach to it):

- `hidden_step` also requires **STRENGTHEN**: load-bearing share must roughly
  double, 16% → ~33%.
- `inference` also requires **STRENGTHEN**: 8% → ~19%.
- `distractor_close` also carries **DO NOT USE AS DIFFICULTY LEVER**. The D1–D9
  model is correct and stays; it must stop contributing to any difficulty
  decision.
- `steps` is retained as a **time-budget input** to form assembly, which is what
  L1 was validly measuring.

**No prevalence figure appears in this table that the study did not measure.**
`filtering`, `abstraction` and `approaches` have prevalence but no reliable
correlation, and are held for that reason.

---

## 3. The missing question species

The chain of reasoning is: `hidden_step` is the strongest robust mechanism →
therefore what matters is *what hidden steps are actually made of* → the corpus
contains 33 items where `hidden_step` is load-bearing → those decompose into
distinguishable species → **the generator's L2 produces one species, and it is
not among the 33.**

Each species below is specified against the ten required points.

---

### M1 · Determinate Combination

**Evidence:** 5 of 33 load-bearing hidden steps (15%) — the largest single
species. Appears in three families across both later forms.

1. **What the student sees.** One relation among two or more unknowns, and a
   target that is a *combination* of them.
2. **What they must notice/do.** That the individual unknowns are
   **undeterminable**, that the target nonetheless is determined, and what scalar
   or algebraic operation maps the given relation onto the target.
3. **Why a strong student distinguishes it.** A routine version determines every
   unknown and then assembles the target. Here the routine route does not
   terminate: there are fewer independent relations than unknowns.
4. **What makes the wrong path attractive.** The instinct to solve for each
   symbol. It leads either to an unbounded family or to the judgement "not enough
   information", which no option offers.
5. **What makes the correct path non-obvious.** Nothing in the stem signals that
   the target is a rescaling of the given. The mapping constant is not printed.
6. **Distractor architecture.** One option is the **given quantity itself**
   (stopped before applying the mapping); one is the mapping applied with the
   reciprocal or negated constant; one is the target with the correct magnitude
   and wrong sign. D-classes: D1 unfinished step, D6 wrong base/scale, D3 sign.
7. **Domains.** Foundational Algebra, Advanced Algebra and Functions. Cleanly in
   linear relations, quadratic coefficient relations, and rational identities.
8. **EST compatible.** Yes. Four-option numeric or expression target; no
   rendering requirement.
9. **New primitive or composition?** **New primitive.** No existing construct
   generates a deliberately under-determined system with a determinate
   combination target, and the QA gates would currently reject one as
   unsolvable.
10. **Abstract archetypes.**
    - *A1* — a single linear relation in two symbols; the target is a fixed
      linear combination of the two whose coefficient vector is a scalar multiple
      of the relation's. The scalar is not an integer.
    - *A2* — a quotient relation equated to a constant; the target is a linear
      combination of numerator and denominator symbols that factors out of the
      cleared form.
    - *A3* — two relations in three symbols where one elimination produces a
      determinate value for a *fourth* derived quantity, leaving all three
      original symbols free.

---

### M2 · Binding Conversion

**Evidence:** 3 of 33 (9%) as a unit/scale conversion; a fourth (calendar span)
shares the structure. **Load-bearing means the un-converted answer is a printed
option and is wrong.**

1. **Sees.** A quantity supplied in one unit or scale and a target requiring
   another, with the conversion not flagged.
2. **Notice/do.** That the axis, table header, rate denominator, or index base is
   not the target's unit; apply the conversion before the arithmetic.
3. **Distinguishes.** In a routine version the units already agree, or the
   conversion is named in the stem. Here it is carried silently by a label.
4. **Wrong path attractive.** The arithmetic runs correctly and terminates on a
   plausible, printed value.
5. **Non-obvious.** The conversion sits in the stimulus furniture — a "per 25
   units" rate denominator, a "in hundreds" axis caption, a milli- prefix — not
   in the sentence being read.
6. **Distractor architecture.** Mandatory: the **un-converted result must be an
   option**. A second option applies the conversion in the wrong direction; a
   third applies a neighbouring power of ten. D6 dominates, with D3 for
   direction.
7. **Domains.** Data Analysis and Probability (chart and table stimuli),
   Foundational Algebra (rate models), Geometry (unit-bearing measures).
8. **EST compatible.** Yes, and characteristic of the corpus. Requires the
   stimulus renderer to place unit text in the axis/header, which R1 already
   covers.
9. **New primitive or composition?** **New primitive.** L4 (representation
   mismatch) moves between representations but does not create a binding unit
   discrepancy, and no gate currently requires that the un-converted answer be
   offered.
10. **Abstract archetypes.**
    - *B1* — a two-column tariff table whose rate column is denominated per k
      units, k ≠ 1, with a total asked for a quantity that is not a multiple of k.
    - *B2* — a plotted relation whose axis captions each carry a scale factor,
      with a value asked in the underlying unit.
    - *B3* — a rate in a prefixed SI unit combined with a defining formula whose
      arguments are in base units.

---

### M3 · Normalisation Gate

**Evidence:** 4 of 33 (12%). The standard method exists and the student knows
it; it does not apply until the object is rewritten.

1. **Sees.** An object presented in a form to which the obvious theorem or
   formula does not literally apply.
2. **Notice/do.** Rewrite to the canonical form first — a shared base, a monic
   divisor, a parameterised ratio, a single fraction — then apply the method.
3. **Distinguishes.** A routine version supplies the canonical form. Here the
   first move is a rewrite that the stem does not request.
4. **Wrong path attractive.** Applying the method to the un-normalised object
   produces a clean, printed value.
5. **Non-obvious.** The object *looks* canonical. Nothing marks the divisor as
   non-monic or the bases as unrelated.
6. **Distractor architecture.** The result of applying the method without
   normalising must be an option. D4 structural/wrong-form dominates, with D6 for
   the scale that the normalisation would have introduced.
7. **Domains.** Advanced Algebra and Functions (exponents, polynomial division,
   rational expressions); Geometry (ratio parameterisation).
8. **EST compatible.** Yes.
9. **New primitive or composition?** **New primitive**, though it composes with
   existing family templates: the primitive is the *de-normalisation* step
   applied to an otherwise routine item, plus the gate that the un-normalised
   answer is offered.
10. **Abstract archetypes.**
    - *C1* — an exponential equation whose three terms sit on three different
      bases, all powers of a common base that is not written anywhere.
    - *C2* — a divisibility or remainder statement whose divisor is non-monic, so
      the root is a non-integer rational.
    - *C3* — a ratio constraint on two quantities entering a product or area
      relation, so parameterising the ratio yields an equation one degree higher
      than the surface suggests.

---

### M4 · Scope Discrimination — **gated**

**Evidence:** 3 of 33 (9%) as a referent/quantifier problem. `competing_interp`
itself flips sign across forms (−0.04 … 0.36) and is **not robust**.

**Gate:** this species is specified but must **not** be scheduled into a form
until either (a) a fifth reference form raises `competing_interp` to a consistent
sign, or (b) the QA rule in point 6 below is implemented and demonstrated. The
corpus contains a matched failure case — a scope ambiguity whose alternative
reading was *not* offered as an option, so the item could not diagnose the
confusion it advertised.

1. **Sees.** A stem containing a determiner, quantifier, or referent whose scope
   admits more than one reading.
2. **Notice/do.** Fix the scope from the surrounding constraint, then compute.
3. **Distinguishes.** A routine version has one grammatical reading. Here
   choosing the reading *is* the mathematical work.
4. **Wrong path attractive.** The other reading is grammatically natural and
   computationally easier.
5. **Non-obvious.** The disambiguating information is structural, not stated.
6. **Distractor architecture — this is the gate.** **The alternative reading's
   answer must be a printed option, and no third reading may be admissible.**
   An item whose alternative reading is unrepresented is rejected: it looks
   harder and is not. D2 concept confusion, D5 wrong member of the right set.
7. **Domains.** Data Analysis and Probability (set language, complements,
   negation), Foundational Algebra (percentage referents).
8. **EST compatible.** Yes, and present in the corpus — but this is the species
   with the highest risk of producing ambiguity that reads as a defect rather
   than as difficulty.
9. **New primitive or composition?** **New primitive**, with a mandatory paired
   solver: the primitive must compute *both* readings and refuse to emit unless
   both are exactly representable in the option set.
10. **Abstract archetypes.**
    - *D1* — a percentage applied to a residual category rather than to the
      whole, with both bases yielding representable values.
    - *D2* — a negated conjunction over a multi-set draw, where "not all" and
      "none" are both computable and both offered.
    - *D3* — a constraint stated over a composite object that may bind on the
      whole or on each part, with both counts admissible.

---

### M5 · Classification Gate

**Evidence:** 3 of 33 (9%). The student must first decide *what kind of object
this is*; the reflex method belongs to a different kind.

1. **Sees.** A statement whose standard vocabulary points at one solution
   technique.
2. **Notice/do.** Establish the object's actual class — degree, domain,
   determinacy — and select the technique that class requires.
3. **Distinguishes.** A routine version's vocabulary and class agree. Here the
   vocabulary is borrowed from a neighbouring class, and the reflex technique is
   inapplicable rather than merely long.
4. **Wrong path attractive.** The reflex technique is well drilled and produces
   an answer.
5. **Non-obvious.** No sentence says "note that this is linear once expanded" or
   "note that the parameter need not be real."
6. **Distractor architecture.** The reflex technique's output must be an option.
   D2 concept confusion dominates.
7. **Domains.** Advanced Algebra and Functions primarily; Foundational Algebra
   for existence-of-solution statements.
8. **EST compatible.** Yes.
9. **New primitive or composition?** **New primitive.** The generator has no
   representation of "the phrase that names the technique" as separable from
   "the technique the object requires".
10. **Abstract archetypes.**
    - *E1* — an existence-of-solutions statement about an equation that reduces
      to first degree, so the discriminant reflex is inapplicable and the answer
      turns on coefficient cancellation with unequal constants.
    - *E2* — a parameter whose defining relation admits no real value, so the
      solution is complex and the reflex "solve for a real constant" dead-ends.
    - *E3* — a statement whose named quantity (a rate, a centre, a period) is a
      property of a *derived* object rather than the presented one.

---

### M6 · Supplied Decoy

**Evidence:** 1 of 33 (3%). Rare, and the purest Peak specimen in the corpus.
Specified because it is the cleanest available demonstration that difficulty can
be created by *removing* work rather than adding it.

1. **Sees.** An expression or configuration with a visibly substantial component.
2. **Notice/do.** Recognise that the substantial component is irrelevant —
   because another part collapses, cancels, or vanishes — and never process it.
3. **Distinguishes.** A routine version requires every supplied part. Here the
   correct route is *shorter* than it looks, and the strong student's advantage
   is knowing when to stop.
4. **Wrong path attractive.** Processing the decoy is long, correct-looking, and
   lands on an option in the "did the algebra, missed the collapse" family.
5. **Non-obvious.** Collapses are not signalled; the decoy is the visually
   dominant element.
6. **Distractor architecture.** All three distractors must be members of the
   "processed the decoy" family, differing by coefficient or sign, so that a
   student who does the long route lands on one of them. D7 computation slip,
   D3 sign, D6 scale.
7. **Domains.** Advanced Algebra and Functions (radical and rational
   expressions), Foundational Algebra (systems where a combination cancels).
8. **EST compatible.** Yes.
9. **New primitive or composition?** **New primitive.** It requires the generator
   to construct a *guaranteed collapse* and then attach an unrelated decoy, which
   no current construct does; the demand score would score it as easy.
10. **Abstract archetypes.**
    - *F1* — a quotient whose numerator is a sum of like terms with coefficients
      summing to zero, over a denominator of substantial visual weight.
    - *F2* — a configuration where one supplied measure is determined by the
      others and therefore adds nothing.
    - *F3* — a composite operation where an inner step returns the identity, so
      the outer operation is the whole answer.

---

### M7 · Unstated Model

**Evidence:** 2 of 33 (6%) as hidden steps, and the dominant species within the
robust `inference` mechanism. The corpus's inference is mostly *supplying a model
nobody wrote down* — not recalling a formula, which is what L3 produces.

1. **Sees.** A stimulus giving quantities of one kind and a question about a
   quantity of a different kind, with no stated relation between them.
2. **Notice/do.** Supply the relation from general knowledge or from the
   situation's own logic, then reason qualitatively or quantitatively with it.
3. **Distinguishes.** A routine version states the relation, or the relation is
   on the reference sheet. Here it is neither.
4. **Wrong path attractive.** Answering from the quantities that *are* shown, or
   declaring the question unanswerable — and one option is usually an
   escape-hatch that says exactly that.
5. **Non-obvious.** The needed relation is not mathematical content; it is the
   situation's structure.
6. **Distractor architecture.** One option asserts the reverse relation; one
   asserts no relation; one asserts the relation holds trivially. Options may be
   prose claims. D2 concept confusion.
7. **Domains.** Data Analysis and Probability primarily. Foundational Algebra for
   rate/quantity models.
8. **EST compatible.** Yes — the corpus contains prose-claim option sets, which
   R2 covers. **This species most often produces a `selection` target with
   `prose-claims` options.**
9. **New primitive or composition?** **New primitive.** L3 supplies formulae the
   reference sheet omits; this supplies *models the situation implies*. They are
   different objects and need different validity constraints.
10. **Abstract archetypes.**
    - *G1* — a stimulus showing counts over two periods plus a stated invariance
      of a derived aggregate, asking which unstated per-unit quantity must have
      changed.
    - *G2* — a calendar or period-indexed model where the span between two named
      instants is neither stated nor equal to the difference of the labels.
    - *G3* — an intercept, slope or asymptote whose *meaning in the situation* is
      asked, with two near-synonymous prose readings offered and one correct.

---

### M8 · Naming Determines Structure

**Evidence:** 4 of 33 (12%) — tied second largest, and entirely geometric.

1. **Sees.** A configuration specified by vertex or point names, with either no
   figure or a figure explicitly not to scale.
2. **Notice/do.** Reconstruct which segments are adjacent, which angle sits at
   which vertex, which side is opposite the right angle — from the naming
   convention alone.
3. **Distinguishes.** A routine version supplies a to-scale figure that answers
   the adjacency question by inspection.
4. **Wrong path attractive.** Assuming the drawn or imagined configuration, or
   reading a three-letter angle name as the first letter's vertex.
5. **Non-obvious.** The convention is never restated, and the figure — when
   present — is drawn in a configuration that does not match the labels.
6. **Distractor architecture.** Each distractor corresponds to one wrong
   adjacency or one wrong vertex assignment, so the option set enumerates the
   configuration errors. D5 wrong member of the right set, D4 structural.
7. **Domains.** Geometry and Trigonometry only.
8. **EST compatible.** Yes — and it depends on the R1 not-to-scale contract,
   which is a capability gap, not an exclusion. **Figure-free variants are
   available today.**
9. **New primitive or composition?** **New primitive**, but a narrow one: it is a
   constraint on how a geometry item is *specified*, not a new mathematical
   content type. Composable with every existing geometry family.
10. **Abstract archetypes.**
    - *H1* — a right triangle given by vertex names and one angle named by three
      letters, with no figure, so the hypotenuse must be identified from the
      right-angle vertex.
    - *H2* — a quadrilateral named in a cyclic order that is not alphabetical, so
      adjacency does not follow the reading order of the names.
    - *H3* — two overlapping circles where one labelled point is simultaneously a
      centre of one and a point on the other.

---

## 4. Hidden-step decomposition

`hidden_step` is not one category. Of the **33 items in Forms 3+4 where it is
load-bearing**, the species distribute as follows. Percentages are of those 33.

| Species | n | % | Evidence | Current generator coverage | Reliably generated today? | What makes it load-bearing rather than cosmetic |
|---|---|---|---|---|---|---|
| **Determinate combination** (M1) | 5 | 15% | 3 families, both later forms | none | No | The individual symbols must be genuinely undeterminable, and the "not enough information" reading must be unavailable |
| **Naming determines structure** (M8) | 4 | 12% | Geometry only | none | No | No to-scale figure may resolve the adjacency question |
| **Normalisation gate** (M3) | 4 | 12% | AAF and Geometry | none | No | The un-normalised method must terminate on a printed option |
| **Binding conversion** (M2) | 3 | 9% | DAP and FA | none | No | The un-converted result must be a printed option and must be wrong |
| **Scope discrimination** (M4) | 3 | 9% | DAP and FA | none | No | Both readings must be computable and both must be represented |
| **Classification gate** (M5) | 3 | 9% | AAF and FA | none | No | The reflex technique must be *inapplicable*, not merely longer |
| **Unstated model** (M7) | 2 | 6% | DAP | L3, partially (recall only) | No | The relation must be absent from both stem and reference sheet |
| **Definition unpacking** | 2 | 6% | AAF | none | No | The definition itself must supply a shortcut the routine route ignores |
| **Selection across a gap** | 2 | 6% | DAP | none | No | The usable data must not be adjacent in the stimulus |
| **Property given, parameter asked** | 2 | 6% | AAF | L2, weakly | Partially | The forward route must be materially more expensive than the backward one |
| **Supplied decoy** (M6) | 1 | 3% | AAF | none | No | The collapse must be exact, and the decoy visually dominant |
| **Boundary/parity of a statistic** | 1 | 3% | DAP | L5, partially | Partially | The straddling values must both be printed options |
| **Reading precision** | 1 | 3% | — | — | — | **Excluded — a defect in the source item, not a species** |

### 4.1 The finding that drives this specification

> **The generator's L2 produces the *target-shift* species — asking for `3x − 1`
> rather than `x`. Target shift is the load-bearing mechanism in ZERO of the 33
> items.**

Target shift is widespread in the corpus as a `hidden_step = 1` garnish. It is
never what makes an item hard on its own. The generator's single hidden-step
construct produces the one species the evidence says does not carry difficulty.

This is the precise form of the **B** component of verdict D, and it explains the
**C** component too: the generator can only reach for frequency and step count
when it needs a harder item, because the species that would do the work do not
exist as constructs.

### 4.2 Two species that are partially covered

- **Property given, parameter asked** — L2 can express this when the target is a
  parameter rather than a variable. It is *not* reliably generated because
  nothing enforces the asymmetry in point 10 above: if the forward route is as
  cheap as the backward one, the reversal is cosmetic. This is the same finding
  as the `reversal` pair in §1.3.
- **Boundary/parity of a statistic** — L5 produces strictness discrimination.
  It does not produce the parity case, where an even count forces a statistic to
  a value that appears nowhere in the data. Adding that requires only a
  constraint on the generated dataset, not a new primitive.

---

## 5. Mechanism exists versus mechanism bites

A mechanism that a competent student can route around is not a mechanism. This
section audits both corpora for that failure and states the redesign rule.

### 5.1 The distinction that matters

**A bypass is a defect only when the shorter route does not itself require the
intended insight.**

- Substituting a convenient value into a compound expression to test the options
  *is* a form of the intended structural reasoning. Not a defect.
- Assigning a free parameter a convenient value so that an intended factoring
  insight never has to occur **is** a defect: the mechanism becomes optional.

The goal is not to force students through artificial complexity. It is to build
items where the intended reasoning is *naturally necessary*.

### 5.2 Audited cases

| Construct | Intended mechanism | Bypass route | Frequency | Redesign requirement |
|---|---|---|---|---|
| Under-determined relation with a combination target (`T3-Q3`, `T3-Q33`) | M1 determinate combination | Assign one free symbol a convenient value, solve numerically | 2 of the 5 M1 items in the corpus | The relation must not admit a free assignment that trivialises it — require ≥2 free symbols, or a non-linear relation where no assignment yields integer arithmetic |
| Advertised concept confusion with the alternative unrepresented (`T2-Q9`, `T4-Q3`, `T3-Q44`, `T4-Q24`) | M4 / M5 | Eliminate by option shape without engaging the concept | **4 of 200 reference items** | Mandatory gate: the confusion's answer must be a printed option (see §3.M4 point 6) |
| Aggregate comparison where the shortcut coincides with the answer (`T4-Q14`) | `filtering` | Read the single tallest mark rather than the aggregate | 1 observed | The shortcut answer must differ from the correct answer, or the item does not test aggregation |
| Multi-device stacking without interaction (`T3-Q12`) | `multiconcept` | Each device is routine and independent; the option grid collapses the item to one check | 1 observed at `multiconcept = 2` | **Concepts must interact**: the output of one must be the input of another, and no option-set structure may short-circuit the chain |
| Redundant supplied condition (`ESTM1-A Q12`) | M1 / factor theorem | The second divisibility condition is not needed for the asked combination | 1 in the prototype | Either make both conditions binding, or ask for a target that requires both |
| Deleted conversion (`ESTM1-A Q44`) | M2 binding conversion | No conversion exists — the rate is already in the target's unit | 1 in the prototype | Restore the binding conversion, and require the un-converted result to be offered |
| Independent device stack (`ESTM1-A Q46`) | L5 + L2 + strictness | Three devices, each routine, none feeding another | 1 in the prototype | Same interaction rule as `T3-Q12` |

### 5.3 The general anti-bypass rule

Every primitive in §8 carries an **anti-bypass rule** of this shape:

> Enumerate the routes a competent student may take. For each, determine whether
> it requires the intended insight. If any route both (a) reaches the key and
> (b) does not require the insight, the item is rejected — unless that route is
> itself an expression of the insight.

This is a *generation-time* obligation, not a QA afterthought: the primitive must
be able to enumerate its own alternative routes, which is why several primitives
below carry a `bypass_solver` input.

---

## 6. Difficulty as a signature, not a score

**No additive difficulty score is defined by this document, and none should be
built.** The demand score's defect was not its weights; it was that a scalar
invited optimisation of the cheapest term.

Bands are the observed quartiles of reasoning load across Forms 3+4, the hundred
items coded at the current standard. **They are a description of the reference
corpus, not a target function.**

External support: **7 of the 28 Peak-band items carry the publisher's Reasoning
label, against 1 in each of the other three bands.** The band construction and
the publisher's classification were built independently.

### 6.1 The four signatures

Values are reference means, Forms 3+4. A signature is a *profile*, not a
checklist: **no Peak item in the corpus contains every mechanism, and none is
required to.**

| | Entry | Core | Stretch | Peak |
|---|---|---|---|---|
| `hidden_step` | 0.64 | 0.91 | 1.46 | **1.79** |
| `inference` | 0.28 | 0.74 | 0.96 | **1.54** |
| `multiconcept` | 0.60 | 0.91 | 0.96 | **1.50** |
| `nonobvious_rel` | **0.08** | 0.43 | 0.67 | 1.18 |
| `repr_switch` | 0.32 | 0.61 | 0.75 | 1.25 |
| `competing_interp` | 0.28 | 0.35 | 0.67 | 1.11 |
| `filtering` | 0.28 | 0.52 | 0.71 | 1.04 |
| `abstraction` | 0.60 | 0.78 | 0.83 | 1.21 |
| `reversal` | 0.12 | 0.43 | 0.71 | 0.86 |
| `trap_cost` | 1.00 | 1.39 | 1.71 | 1.79 |
| `opacity` | 1.36 | 1.83 | 1.96 | 2.00 |
| `distractor_close` | 1.68 | 1.91 | 1.92 | 1.96 |
| `approaches` | 0.48 | 0.74 | 0.71 | 0.86 |
| `steps` | 3.24 | 3.65 | 4.67 | 5.11 |
| `self_verify` | 1.76 | 1.78 | 1.62 | **1.29** |

### 6.2 The signatures in prose, as generation criteria

**Entry** — one concept. Nothing implied. Nothing to discover. **The
relationship to use is the one the surface suggests** (`nonobvious_rel` 0.08 is
the sharpest single marker in the table). Distractors are still close and still
diagnostic; that never varies by band. The answer is often visible from the
stem. Fully self-verifiable.

**Core** — a hidden step appears about half the time, and something must be
inferred. The answer is no longer readable off the surface (`opacity` 1.83).
Still one dominant concept.

**Stretch** — the hidden step is routine (1.46) and load-bearing more often than
not. A tempting wrong interpretation exists. The item usually crosses a
representation. Still solvable by one clean route once the step is seen.

**Peak** — near-universal hidden step (1.79); an unstated fact or model to supply
(1.54); a relationship the surface actively misdirects away from (1.18); two or
more concepts that genuinely interact (1.50). **Self-verifiability collapses**
(1.29 against Entry's 1.76): the answer, once found, is hard to check cheaply.

### 6.3 The generation rules these signatures imply

1. **A band is met by profile match, not by total.** An item claiming Peak must
   carry at least two of {`hidden_step`, `inference`, `multiconcept`,
   `nonobvious_rel`} as **load-bearing**, not four as merely present.
2. **`steps` is not a band criterion.** Peak items in the corpus average 5.1
   operations against Entry's 3.2 — a 1.9-operation difference that carries
   23% of scale, less than every reasoning mechanism.
3. **`distractor_close` and `opacity` are constant across bands** (1.68→1.96 and
   1.36→2.00). They must be satisfied at every band and must never be varied to
   express one.
4. **No band may require every mechanism.** The reference Peak band contains
   items with `nonobvious_rel = 0`, with `multiconcept = 0`, and with
   `inference = 0`. Forcing a full house would produce items unlike the corpus.
5. **`self_verify` is a recorded consequence, never a target.** Do not make an
   item unverifiable in order to make it Peak; that produces the reading-precision
   defect excluded in §4.

---

## 7. Mechanism-level audit of ESTM1-2026-A

The prototype is used **only** as a comparison target. It is frozen and
unmodified. Reference = Forms 3+4.

### 7.1 Underrepresented — present, correct, too infrequent

| Mechanism | Reference load-bearing | Prototype | Gap |
|---|---|---|---|
| `hidden_step` | 33% | 16% | −17 pp |
| `competing_interp` | 16% | 2% | −14 pp |
| `inference` | 19% | 8% | −11 pp |
| `trap_cost` | 50% | 36% | −14 pp |
| `approaches` | 10% | 0% | −10 pp |

### 7.2 Underpowered — the mechanism exists and does not bite

- **`Q12`** — two divisibility conditions supplied, one binding for the asked
  target. The second is decoration, so the intended multi-condition reasoning is
  optional.
- **`Q44`** — the reference archetype's binding conversion is absent; the rate is
  already in the target's unit. The mechanism was removed and the surface kept.
- **`Q46`** — three devices stacked without interaction. Each is routine and
  independently resolvable.
- **`Q24`** — a roman-numeral properties item whose three claims are settled by
  one repeated operation, so `multiconcept` is nominal.

### 7.3 Missing — no reliable construct exists

All eight species in §3: **M1 determinate combination, M2 binding conversion,
M3 normalisation gate, M4 scope discrimination, M5 classification gate,
M6 supplied decoy, M7 unstated model, M8 naming determines structure.**

Consequence in the distribution:

| Band | Reference | Prototype |
|---|---|---|
| Entry | 25 | 21 |
| Core | 23 | 13 |
| Stretch | 24 | 9 |
| **Peak** | **28** | **7** |

The prototype's own `demand` labels disagree with the evidence frame in the same
direction: **10 of the 28 items declared `core` sit in the Entry band**, and only
3 of 50 are declared `peak`.

### 7.4 Overused — substituting for reasoning

- **`distractor_close` load-bearing in 100% of prototype items against 87% of
  reference items.** The generator applies at maximum strength the one mechanism
  §1.3 shows does not discriminate — and more uniformly than the real papers do.
- **Step count as the difficulty ordering.** Prototype mean 2.98 operations
  against the reference's 4.20, which the demand score reads as "easier" and
  which §1.1 shows means nothing.

### 7.5 Authenticity-only — keep, never use to manufacture difficulty

- `distractor_close` and the D1–D9 model. An EST item without close diagnostic
  distractors does not read as an EST item.
- `opacity`. Emergent from good item design; not a lever.
- Register, context, name and unit conventions (artifact 5). Unchanged.
- `steps`, retained as a **time-budget input** only.

### 7.6 Two content defects, independent of everything above

- **`Q23` is not original.** It reproduces a reference item's context *and its
  constants*. This violates the project standard and §9 exists because of it.
- **`Q44`** as described in §7.2.

Neither is fixed by this document. Both are inputs to Stage 3.

---

## 8. New generator primitives

One specification per **NEW CONSTRUCT** in §2. Each controls *thinking demand*,
not numeric size or operation count.

Common contract, assumed by every primitive below:

```
INPUT   domain, family, target_band, rng_seed, forbidden_skeletons[]
OUTPUT  { stem, stimulus?, options[4], key, distractor_classes[],
          mechanism_profile{}, routes[], skeleton_fingerprint }
REJECT  on any failed assertion — primitives never emit a warning
```

`routes[]` is mandatory: the enumerated solution routes with, for each, whether
it requires the intended insight. This is what makes §5.3 enforceable.

---

### 8.1 `P-COMBINATION` — determinate combination (M1)

- **Purpose.** Emit an item whose individual unknowns are undeterminable and
  whose asked combination is determined.
- **Inputs.** `n_symbols` (≥2), `n_relations` (< `n_symbols`), `relation_form`
  ∈ {linear, quotient, coefficient}, `scale` (the mapping constant, non-unit),
  `target_shape`.
- **Generation logic.** Draw a relation `R` over the symbols. Choose a target
  `T` whose coefficient vector is `scale × R`'s coefficient vector. Verify by
  symbolic rank that the system is under-determined and that `T` lies in the row
  space of the relations.
- **Validity constraints.** Rank(relations) < `n_symbols`; `T` ∈ rowspace;
  `scale` ∉ {1, −1}; the key must be exact (rational, and printable in the form
  the family uses).
- **Distractor logic.** `d1` = the given relation's own constant (D1 unfinished);
  `d2` = `T` computed with `1/scale` (D6); `d3` = `−key` (D3). All three must be
  distinct from the key and from each other.
- **Difficulty control.** Band rises with: `n_symbols`; whether `scale` is a
  non-integer rational; whether the relation must first be cleared (quotient
  form) before the row-space membership is visible.
- **Anti-bypass rule.** Reject if assigning any single free symbol a value in
  `{0, ±1, ±2}` yields integer arithmetic for the remaining unknowns. This is
  the `T3-Q3` defect and it must be designed out.
- **Anti-clone rule.** `skeleton_fingerprint` must differ from every emitted
  sibling on ≥3 of the seven axes in §9.2.
- **QA assertions.** (1) symbolic rank is deficient; (2) the key is invariant
  under every admissible assignment of the free symbols — checked at 50 random
  admissible points; (3) no option equals the key; (4) `routes[]` contains no
  insight-free route.
- **Rendering.** None.
- **Valid abstract outputs.** A1, A2, A3 in §3.M1.

---

### 8.2 `P-CONVERSION` — binding conversion (M2)

- **Purpose.** Place a unit, scale or span discrepancy in the stimulus furniture
  such that the un-converted answer is wrong and offered.
- **Inputs.** `carrier` ∈ {axis_caption, table_header, rate_denominator,
  si_prefix, period_index}, `factor` (≠1, and ≠ a power of the answer's own
  scale where that would collapse the distractor), `base_family`.
- **Generation logic.** Build a routine item in `base_family`. Move the unit into
  the `carrier`. Recompute the key under conversion. Compute the un-converted
  result and require it to be representable.
- **Validity constraints.** `key ≠ unconverted`; both are exactly representable
  in the family's answer format; the carrier text is grammatical and matches
  artifact 5's register rules.
- **Distractor logic.** `d1` = the un-converted result (**mandatory**);
  `d2` = conversion applied in the reverse direction; `d3` = a neighbouring
  power of ten. D6 / D3 / D6.
- **Difficulty control.** Band rises with: the carrier's distance from the
  sentence being read (a rate denominator is harder than an SI prefix); whether
  two carriers are present simultaneously (both axes scaled).
- **Anti-bypass rule.** Reject if the un-converted result is not an option, or if
  estimation over the option range identifies the key without performing the
  conversion.
- **Anti-clone rule.** No two items in a series may share `carrier` *and*
  `base_family`.
- **QA assertions.** (1) `unconverted ∈ options`; (2) `unconverted ≠ key`;
  (3) the carrier appears exactly once and only in the stimulus; (4) no stem
  sentence names the conversion.
- **Rendering.** Requires unit text in axis captions or table headers — covered
  by R1. Figure-free table variants are available today.
- **Valid abstract outputs.** B1, B2, B3 in §3.M2.

---

### 8.3 `P-NORMALISE` — normalisation gate (M3)

- **Purpose.** Present an object in a form to which the reflex method does not
  apply until it is rewritten.
- **Inputs.** `canonical_family`, `denormalisation` ∈ {mixed_base,
  non_monic_divisor, ratio_parameterisation, compound_fraction},
  `unnormalised_answer_required` (always `true`).
- **Generation logic.** Generate the canonical item. Apply the denormalisation
  transform. Solve both the normalised and un-normalised routes.
- **Validity constraints.** The un-normalised route must **terminate** on a
  wrong, representable value — an un-normalised route that dead-ends produces
  frustration, not difficulty. The canonical form must be reachable in one
  documented rewrite.
- **Distractor logic.** `d1` = the un-normalised method's output (D4 structural);
  `d2` = the normalisation constant applied twice or not at all (D6);
  `d3` = the correct value with the pre-normalisation sign (D3).
- **Difficulty control.** Band rises with the visual similarity between the
  presented form and the canonical form.
- **Anti-bypass rule.** Reject if the canonical form is recoverable by
  inspection, or if numeric substitution at a small integer resolves the item
  without the rewrite.
- **Anti-clone rule.** `denormalisation` may repeat within a series only across
  different `canonical_family` values.
- **QA assertions.** (1) both routes terminate; (2) they differ; (3) the
  un-normalised output is an option; (4) the rewrite is a single documented step.
- **Rendering.** None.
- **Valid abstract outputs.** C1, C2, C3 in §3.M3.

---

### 8.4 `P-SCOPE` — scope discrimination (M4) — **gated, do not schedule**

- **Purpose.** Make the choice of referent or quantifier scope the mathematical
  work.
- **Gate.** Not to be scheduled into a form until `competing_interp` shows a
  consistent sign across five forms, or until assertion (1) below is implemented
  and demonstrated on at least ten generated items.
- **Inputs.** `ambiguity_type` ∈ {residual_referent, negated_conjunction,
  composite_constraint}, `readings` (exactly 2), `base_family`.
- **Generation logic.** Construct the situation. Solve **both** readings.
  Require both to be exactly representable and distinct.
- **Validity constraints.** Exactly two admissible readings — a third makes the
  item defective. A competent reader must be able to select the intended reading
  from a structural cue present in the stem.
- **Distractor logic.** `d1` = the alternative reading's answer (**mandatory**);
  `d2`, `d3` = slips within the intended reading. D2 / D5.
- **Difficulty control.** Band rises with how natural the alternative reading is
  and how much cheaper it is to compute.
- **Anti-bypass rule.** Reject if the alternative reading's answer is not an
  option — the `T2-Q9` / `T4-Q3` failure, observed 4 times in 200 reference items.
- **Anti-clone rule.** `ambiguity_type` may not repeat within a form.
- **QA assertions.** (1) `|readings| == 2` proved by an enumeration of
  determiner scopes, not asserted; (2) both answers representable and distinct;
  (3) alternative ∈ options; (4) a structural disambiguator exists in the stem.
- **Rendering.** None.
- **Valid abstract outputs.** D1, D2, D3 in §3.M4.

---

### 8.5 `P-CLASSIFY` — classification gate (M5)

- **Purpose.** Make identifying the object's class the first and decisive step.
- **Inputs.** `apparent_class`, `actual_class`, `vocabulary_source`
  (which class the naming phrase belongs to), `base_family`.
- **Generation logic.** Generate an item in `actual_class`. Phrase it in
  `apparent_class`'s standard vocabulary. Verify that `apparent_class`'s reflex
  technique is **inapplicable**, not merely longer.
- **Validity constraints.** The reflex technique must fail *categorically*
  (undefined, vacuous, or type-mismatched), and must nevertheless produce a
  value a student would write down.
- **Distractor logic.** `d1` = the reflex technique's output (D2 concept
  confusion, **mandatory**); `d2`, `d3` = slips within the correct technique.
- **Difficulty control.** Band rises with how strongly the vocabulary points at
  the wrong class.
- **Anti-bypass rule.** Reject if the correct class is deducible from the answer
  options' shape alone.
- **Anti-clone rule.** No `(apparent_class, actual_class)` pair may repeat within
  a series.
- **QA assertions.** (1) the reflex technique is provably inapplicable;
  (2) it nonetheless yields a representable value; (3) that value ∈ options;
  (4) the correct class is not stated anywhere in the stem.
- **Rendering.** None.
- **Valid abstract outputs.** E1, E2, E3 in §3.M5.

---

### 8.6 `P-DECOY` — supplied decoy (M6)

- **Purpose.** Create an item whose correct route is *shorter* than it appears,
  because a supplied component is irrelevant by construction.
- **Inputs.** `collapse_type` ∈ {coefficients_sum_zero, inner_identity,
  determined_measure}, `decoy_weight` (the visual/structural mass of the
  irrelevant component), `base_family`.
- **Generation logic.** Construct the collapsing component with an exact
  algebraic guarantee. Attach a decoy of substantial weight that the collapse
  makes irrelevant.
- **Validity constraints.** The collapse must be **exact**, not approximate.
  The decoy must be well-formed — a malformed decoy is a defect, not a distractor.
- **Distractor logic.** **All three distractors must be members of the "processed
  the decoy" family**, differing by coefficient or sign, so a student who takes
  the long route lands on one. D7 / D3 / D6.
- **Difficulty control.** Band rises with `decoy_weight` and with how late in the
  expression the collapse becomes visible.
- **Anti-bypass rule.** Reject if the collapse is visible before the decoy is
  read — the item must reward stopping, not skimming.
- **Anti-clone rule.** `collapse_type` may appear at most once per form.
- **QA assertions.** (1) the collapse is symbolically exact; (2) the decoy is
  well-formed and irrelevant, proved by solving with the decoy removed;
  (3) the long route terminates on an option; (4) the key is not that option.
- **Rendering.** None.
- **Valid abstract outputs.** F1, F2, F3 in §3.M6.

---

### 8.7 `P-UNSTATED-MODEL` — unstated model (M7)

- **Purpose.** Require the student to supply a relation that appears neither in
  the stem nor on the reference sheet.
- **Inputs.** `shown_quantity`, `asked_quantity`, `bridging_relation`,
  `answer_shape` ∈ {prose_claim, value}, `escape_hatch` (bool).
- **Generation logic.** Build a stimulus in `shown_quantity`. Ask about
  `asked_quantity`. Verify that `bridging_relation` is absent from stem, stimulus
  and reference sheet, and that it is common knowledge at the target level.
- **Validity constraints.** The relation must be **unambiguous once supplied** —
  this species must not become M4 by accident. The item must be answerable
  without any quantity the stimulus does not show.
- **Distractor logic.** `d1` = the reverse relation; `d2` = no relation ("no
  change", "no specific reason"); `d3` = the relation holding trivially. D2.
  When `escape_hatch` is true, exactly one option asserts unanswerability.
- **Difficulty control.** Band rises with the distance between `shown_quantity`
  and `asked_quantity`, and falls when the relation is nameable in one word.
- **Anti-bypass rule.** Reject if the answer is derivable from the shown
  quantities alone by any monotone argument.
- **Anti-clone rule.** `bridging_relation` may not repeat within a series.
- **QA assertions.** (1) the relation is absent from stem, stimulus and reference
  sheet — checked by string and by symbol; (2) the item is unanswerable without
  it, proved by solving with the relation withheld; (3) exactly one option is
  correct under the supplied relation.
- **Rendering.** Prose-claim option sets require R2, which is a capability gap,
  not an exclusion. Value-shaped variants are available today.
- **Valid abstract outputs.** G1, G2, G3 in §3.M7.

---

### 8.8 `P-NAMED-CONFIG` — naming determines structure (M8)

- **Purpose.** Make configuration reconstruction from naming conventions the
  decisive step in a geometry item.
- **Inputs.** `figure_mode` ∈ {none, not_to_scale}, `naming_device` ∈
  {three_letter_angle, cyclic_vertex_order, dual_role_point},
  `base_geometry_family`.
- **Generation logic.** Specify the configuration by names only. When
  `figure_mode = not_to_scale`, render a configuration that is *topologically
  correct and metrically misleading*.
- **Validity constraints.** The configuration must be uniquely determined by the
  names. **A figure, if drawn, must not resolve the naming question by
  inspection** — that would delete the mechanism.
- **Distractor logic.** Each distractor is the answer under exactly one wrong
  adjacency or vertex assignment. D5 / D4.
- **Difficulty control.** Band rises from `three_letter_angle` (weakest) through
  `cyclic_vertex_order` to `dual_role_point` (strongest).
- **Anti-bypass rule.** Reject if any drawn figure resolves the adjacency, or if
  the answer is invariant across the wrong configurations.
- **Anti-clone rule.** `naming_device` may appear at most twice per form, and the
  five-item Geometry allocation limits this naturally.
- **QA assertions.** (1) the configuration is uniquely determined by names;
  (2) each distractor corresponds to a named wrong configuration; (3) if a figure
  exists, its metric properties contradict at least one measured quantity;
  (4) the not-to-scale notice is present when `figure_mode = not_to_scale`.
- **Rendering.** `figure_mode = not_to_scale` depends on the **R1 not-to-scale
  contract**, which is an open capability gap. **`figure_mode = none` is
  available today and covers two of the three naming devices.**
- **Valid abstract outputs.** H1, H2, H3 in §3.M8.

---

### 8.9 Strengthened, not new

- **`multiconcept` (STRENGTHEN).** L7 stacking exists. Add the **interaction
  requirement** from §5.2: the output of one concept must be the input of the
  next, and no option-set structure may short-circuit the chain. Stacking without
  interaction is the `T3-Q12` / `ESTM1-A Q46` defect.
- **`trap_cost` (STRENGTHEN).** L5 exists. Add the requirement that the natural
  first move must be *expensive or wrong*, not merely different — measured by
  comparing the enumerated `routes[]`.

---

## 9. Anti-clone requirement

**Mandatory, and triggered by a measured defect.** `ESTM1-A Q23` reproduces a
reference item's context, device, transformation, target, option architecture,
distractor logic, narrative — **and its actual constants**. Surface-number
variation is not originality, and the current pipeline did not detect this.

### 9.1 The rule

> An item is a **clone** if it matches a reference item or another generated item
> on the structural fingerprint below, regardless of its numeric values.
> Generation must reject clones at emission time, not at review.

### 9.2 The structural fingerprint — seven axes

| # | Axis | What is compared | Match test |
|---|---|---|---|
| 1 | **Context / device** | The narrative frame plus the stimulus kind and its schema | Same frame *and* same stimulus kind |
| 2 | **Transformation chain** | The ordered sequence of mathematical operations from givens to key, with values erased and only operation types and arities retained | Identical ordered chain |
| 3 | **Target form** | What is asked — value / expression / equation / selection / interpretation — plus any shift applied to it | Same target class *and* same shift |
| 4 | **Answer-choice architecture** | The pattern the option values form: sign grid, scale ladder, target-shift set, object set, roman subset, prose claims | Same architecture |
| 5 | **Distractor logic** | The multiset of D1–D9 classes, and which distractor is the primary trap | Same multiset *and* same primary trap |
| 6 | **Narrative structure** | Entity count, entity roles, and the given/asked skeleton with entities anonymised | Isomorphic skeleton |
| 7 | **Numeric skeleton** | The *roles* the constants play — which is the base, the rate, the target, the bound — not their values | Identical role assignment |

### 9.3 Thresholds

- **Against the reference corpus:** matching on **≥5 of 7** is a clone and is
  rejected. Matching on all 7 with identical constants — the `Q23` case — is a
  **hard failure** that must also raise an alert, because it indicates the
  reference item was reproduced rather than generated.
- **Against previously generated siblings (within a form):** **≥5 of 7** is
  rejected.
- **Across a 25-form series:** **≥6 of 7** is rejected; artifact 9's series
  ledger already tracks ten diversity dimensions and is the natural host.
- **Axis 2 alone** — an identical transformation chain with an identical target
  form (axes 2 **and** 3) is rejected regardless of the other five, because that
  is the pair that determines what the item actually tests.

### 9.4 What the future system must compare against

1. The 200-item reference fingerprint table — **derived from the corpus, stored
   as fingerprints only, never as content**, so the comparison set can live in
   this repository while the corpus does not.
2. Every item already emitted in the current form.
3. Every item in every previously published form of the series.

**Not implemented.** No fingerprint table exists yet, and building one is Stage 1
work.

---

## 10. Preserved negative findings — what the generator must not do

Each of these is a measured finding, not a stylistic preference. They are stated
as prohibitions because each names a way the current pipeline can manufacture the
appearance of difficulty.

1. **Do not equate more operations with harder reasoning.** Partial
   `r = +0.04`; `ΔR² = 0.000`. Step count is 12th of 14 at separating Peak from
   Entry.
2. **Do not inflate arithmetic to manufacture difficulty.** The corpus contains
   items of 7–9 operations in the Entry band and 1–2 operations in the Peak band.
3. **Do not make every item a multi-concept chain.** `multiconcept` is robust at
   `r = 0.56` but load-bearing in only **15%** of reference items. Stacking
   without interaction is the `T3-Q12` defect.
4. **Do not make distractors artificially close merely to increase difficulty.**
   100% presence, sd 0.31, sign flips across forms. It is an authenticity floor.
   The prototype already exceeds the reference at 100% vs 87%.
5. **Do not force reversal into items just because it exists.** Four forms, no
   relationship. Only reversal *plus an offered wrong-direction distractor* is a
   candidate, and it is still a candidate.
6. **Do not create fake hidden steps that are merely omitted algebra.** A hidden
   step is load-bearing only when the un-taken route terminates on a printed
   wrong answer. Omitting a line the student would supply anyway is cosmetic.
7. **Do not make every Stretch or Peak item complicated.** No reference Peak item
   contains every mechanism; the band is a profile, not a checklist.
8. **Do not use visual complexity as a substitute for mathematical reasoning.**
   The corpus's one reading-precision item is excluded from the species list as a
   source defect, not adopted as a technique.
9. **Do not copy or lightly paraphrase reference questions.** §9 exists because
   this happened once and was not caught.
10. **Do not treat the publisher's KAR labels as psychometric calibration.**
    19 Reasoning items, a three-level editorial label, supportive only. No
    document, gate, report or interface may describe them as calibration, and no
    scaled score may be derived from anything in this specification.

---

## 11. Implementation roadmap

**Nothing below is started. Approval is required before Stage 1 begins.**

### Stage 1 — New and strengthened primitives

Build the eight primitives in §8 plus the two strengthenings in §8.9, each with
its `routes[]` enumeration, anti-bypass rule and QA assertions. Build the
structural fingerprint of §9.2 and the reference fingerprint table of §9.4 — as
fingerprints only, so the comparison set can live in this repository.

Exit criterion: each primitive emits 20 items that pass their own QA assertions,
and a blind coding of a sample confirms the intended mechanism is load-bearing.
`P-SCOPE` stays gated and is built but not scheduled.

### Stage 2 — Revised difficulty-aware blueprint

Replace the demand score with the band signatures of §6. Retain `steps` as a
time-budget input only. Set band quotas from the observed distribution — roughly
a quarter of a form in the Peak band. Add the interaction requirement to L7 and
the expensive-first-move requirement to L5. Wire the anti-clone check into
emission.

Exit criterion: `validate-est-blueprint.mjs` gates the new signatures, and the
mutation tests break on each one.

### Stage 3 — One revised prototype and forensic review

Generate exactly one form. Code it blind on the 14-dimension frame, by the
protocol of this study — including the drift check, since §1.4 showed a single
coder moves four points across a hundred items without noticing.

Exit criterion: the new form's mechanism profile sits inside the reference
ranges of §6.1, with `hidden_step` load-bearing near 33% and the Peak band near
25%; the anti-clone check returns no match ≥5 axes against the reference table;
and the two content defects of §7.6 are absent by construction.

**Only then**, and only on explicit approval, does the series of 25 begin.

---

## Provenance

| Artifact | Role here |
|---|---|
| 3 — Difficulty Model | The seven levers and the demand score this document supersedes as a difficulty ordering |
| 4 — Distractor Model | D1–D9, retained unchanged and reclassified as an authenticity floor |
| 6 — Generation Blueprint | The host for Stage 2 |
| 7, 8 — QA Specifications | The host for the assertions in §8 and the anti-clone check in §9 |
| 9 — Series Diversity | The natural host for the series-level anti-clone threshold |
| 11 — ESTM1-A internal review | The content review this audit sits beside; §7.6 restates two of its open items |
| R1, R2 | Capability gaps that `P-NAMED-CONFIG` and `P-UNSTATED-MODEL` partially depend on |
