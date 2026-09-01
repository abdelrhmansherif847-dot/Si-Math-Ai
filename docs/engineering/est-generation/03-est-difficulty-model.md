# EST I Math — Difficulty Model

**Artifact 3 of 8.** Evidence tiers: [`01-est-exam-dna.md` §0](01-est-exam-dna.md).

> **The honest frame for this artifact.** The corpus contains **no item
> statistics** — no p-values, no discrimination indices, no score conversion
> table. Nothing here is calibrated against how students actually performed.
> What follows is a model of the *levers the exam pulls*, derived from what
> varies across 200 items, together with a scoring scheme that reproduces the
> observed shape of a form. It predicts **relative** demand, and it must never
> be reported as a difficulty percentage or a predicted score.

---

## 1. What does not make an EST item hard

Worth stating first, because three plausible levers are visibly absent from the
corpus.

**T2 — arithmetic weight is not a lever.** A graphing calculator is permitted
throughout and the publisher expects one. Numbers in the corpus are chosen to be
*calculator-tractable*, and no item is hard because the arithmetic is heavy. The
one item that looks like a computation slog (expanding a product of polynomials)
is hard precisely because full expansion is the *wrong* method.

**T2 — obscure content is not a lever.** Every item in 200 sits inside a standard
secondary syllabus. There are no contrived definitions, no invented operators, no
"let ⊕ be defined as…" items anywhere in the corpus.

**T2 — reading length is barely a lever.** Stems are short. The longest stimulus
in the corpus is a paragraph of science exposition, and the mathematics it
requires does not use most of it — the length is the difficulty, but it happens
once in 200 items.

**T3 — and position is only weakly a lever.** Artifact 1 §5 measured it: an
easier opening block, then flat. There is no ramp to lean on.

---

## 2. The seven levers

Each lever is defined so that it can be counted on an item without judgement,
which is what makes the model auditable.

### L1 — Step count *(the base lever)*

The number of distinct mathematical moves between the given and the answer, where
a "move" is something a student could get individually wrong.

**T2 — the corpus spans 1 to 5.** One-step items exist in every form (take a
percentage; read one bar; solve a two-operation linear equation). Five-step items
exist: recover a total from a backwards fraction-and-percentage chain then report
a share of it; use two stated conditions on a rate to build and solve a system,
then report a distance.

| Steps | Rough share of the corpus | Typical shape |
|---|---|---|
| 1 | ~15% | Single read; single procedure |
| 2 | ~35% | Procedure plus one interpretation, or read plus one computation |
| 3 | ~30% | The corpus's centre of gravity |
| 4–5 | ~20% | Multi-condition, backwards chains, hybrid geometry/algebra |

Shares are T3: they follow our step counting, which is reproducible but not
publisher-sanctioned.

### L2 — Derived target

**Does the stem ask for the quantity the work produces, or for something built
from it?**

Binary, and the single most reliable difficulty signal in the corpus.
**T2: present on 34 of 200 items (17%), all four forms, 8–24% per form.**

It is a difficulty lever for a specific reason: the natural product of the work
is *always* offered as an option (artifact 4, D1). A student who does the
mathematics perfectly and stops one line early is not merely unrewarded — they
are actively caught.

Sub-forms observed, roughly in ascending demand:
1. **Arithmetic wrapper** — `k+4`, `−5tg`, `2×remainder`, `11x²`. The extra step
   is trivial *if noticed*.
2. **Wrong-member selection** — the greater root, the positive solution, the
   ordinate, the length rather than the width, the diameter rather than the
   radius.
3. **Aggregate over a set** — the sum of three integers; the sum of the roots.
4. **Recover a different quantity entirely** — the money from adults rather than
   the count of adults; the price of a third basket rather than either unit
   price.

### L3 — Recall of a formula that is not on the reference sheet

**T2 — 11 items across 3 forms carry this explicitly**, and the reference sheet's
omissions are systematic enough (artifact 1 §2) to be read as intentional.

The recall demands actually exercised, in descending frequency: slope; midpoint;
the distance formula; the sum and product of roots; the exponent and radical
laws; the trigonometric ratios; the probability rules; arc length and sector
area; surface areas.

This lever is *cheap for the exam and expensive for the student*: it adds no
reading, no steps, and no arithmetic, and it is a total barrier if the formula
is not known.

### L4 — Representation mismatch

**The answer is correct but not in the shape the student derived it.**
**T2 — 5 items, 3 forms.**

Observed: derive `y ≥ mx + c` when every option is written `−y ≤ …`, forcing a
multiply-by-negative and an inequality flip; factor to a binomial when the option
is the common factor times the binomial; a line given in a non-standard combined
form so the slope must be extracted rather than read; a proportion that must be
rearranged into a stated target relation.

The mathematics is finished; the work that remains is recognising one's own
answer. This is why an authentic EST item's options cannot simply be "the answer
plus three near-misses" — see artifact 4 §5.

### L5 — Boundary and strictness discrimination

**T2 — 7 items, all four forms.** Strict versus inclusive inequality; a point
*on* a circle offered when the stem says *inside*; "between 2012 and 2014"
offered inclusively and exclusively; the excluded endpoint of an interval offered
as the extreme integer.

The tell is that a boundary item's distractor is never a computational error.
The student's arithmetic is right; their reading of `<` versus `≤` is not.

### L6 — Multiple branches or cases

**T2, occasional.** Nested absolute values with four solutions where resolving
only the outer one gives two; a conditional word problem whose two payment rules
are mutually exclusive and where applying both is offered; a quadratic in
disguise with real and imaginary roots; "can be equal to" items where the
unknown has two values and only one appears among the options.

The failure mode is stopping after the first branch, and the corpus offers that
partial answer every time.

### L7 — Stacked devices

**T3 — the corpus's hardest items are not deep, they are layered.** Its highest-
demand items each stack three or more of L1–L6 plus a stimulus:

- similar triangles inside a figure marked *not drawn to scale*, with algebraic
  segment labels, asking for a linear combination of the unknown (L1×3, L2, L7);
- a compound inequality, shifted to a derived target, restricted to integers,
  with the excluded endpoint offered (L1×3, L2, L5);
- sum and product of two numbers, recover both, then report **half the greater**
  — with all four of {greater, lesser} × {halved, not} on the page (L1×3, L2,
  L6).

**Generation consequence.** Hard EST items are made by *stacking cheap levers*,
not by reaching for harder content. A generator that produces difficulty by
escalating topic will drift out of syllabus; one that stacks L2 + L5 + an integer
constraint on ordinary content will land exactly where the corpus lives.

---

## 3. The demand score

A reproducible integer scale for use inside generation and QA. **It is an
internal ordering device. It is not a difficulty estimate, and no student-facing
surface may display it.**

```
demand = steps                      (L1, 1..5)
       + 2  if derived target       (L2)
       + 1  if off-sheet formula    (L3)
       + 1  if representation mismatch (L4)
       + 1  if boundary discrimination (L5)
       + 1  if multi-branch         (L6)
       + 1  if the item carries a stimulus it must interpret, not just read
```

Observed range on the corpus: **1 to 9**. Bands:

| Band | Demand | Share of a form | Role |
|---|---|---|---|
| **Entry** | 1–2 | 8–12 items | The opening block and the scattered easy items later |
| **Core** | 3–5 | 26–32 items | The body of the paper |
| **Stretch** | 6–7 | 6–10 items | Where the paper separates students |
| **Peak** | 8–9 | 1–3 items | Never more than 3; never two adjacent |

Shares are **T3**, fitted to reproduce the corpus's observed shape rather than
measured against student data.

---

## 4. How demand is placed across the form

**T2 — the placement rules that the corpus actually obeys:**

1. **Q1–Q8 is an on-ramp.** Highest concentration of Entry-band items; at most one
   Stretch item; **no Peak item in any form**.
2. **From Q9 the paper does not order itself.** Artifact 1 §5 measured blocks 2–5
   within 0.18 of each other. Two of four forms have a *lower* final block than
   their middle. **A monotonically climbing generated form would be inauthentic.**
3. **Peak items are isolated.** No two adjacent anywhere in 200 items.
4. **The last item is not the hardest.** In none of the four forms is Q50 the
   highest-demand item of its form.
5. **Shared-stimulus sets do not ramp internally** (artifact 1 §6): they cover
   distinct skills, and the hardest item of a set may be its first.

**T3 — the dispersion target.** Rather than a curve, the generated form should
satisfy: every 10-item block contains at least two Entry items and at least one
Stretch item, and no block contains more than one Peak item. That reproduces the
observed flat-but-varied texture. Artifact 8 gates it.

---

## 5. Time as a constraint, not a lever

**T1 — 75 minutes for 50 items is 90 seconds each.**

**T3 — the corpus is not designed to be a time trap.** Most items are 30–60
second items for a prepared student; a handful are genuine 3-minute items. The
budget is generous by comparison with the ACT's 60 seconds. Two consequences:

- **Difficulty must come from the levers, not from volume.** Padding a form with
  long computations would change the exam's character.
- **But the four-computation item is legitimate.** Two items in one form present
  four options each requiring its own calculation (compare four tariffs; test
  four systems for infinite solutions). At 90 seconds this is affordable, and it
  is a real EST shape. Cap it at one or two per form.

---

## 6. Content-specific difficulty notes

**T2 — geometry is disproportionately hard for its share.** It is the smallest
domain (9%) but carries the highest concentration of *not drawn to scale*,
off-sheet formulas, and hybrid items. Two of the corpus's Peak-band items are
geometry. A generator that fills its 4–6 geometry slots with routine area
calculations will be under-weight in demand even while inside the domain band.

**T2 — data-display items span the full range.** A13 contains both the cheapest
items in the corpus (read one bar) and genuinely demanding ones (recover an
hourly rate from a graph reading plus external conditions; compute a residual
against a supplied regression model). The family is not a difficulty floor.

**T3 — the derived-target device is what makes mid-syllabus content hard.**
Remove L2 from the corpus and a large fraction of its Stretch band collapses into
Core. It is the cheapest way to raise demand without leaving syllabus, which is
presumably why the exam uses it on roughly one item in six.

---

## 7. What this artifact hands to artifact 6

- The **seven levers**, each countable without judgement.
- The **demand score** and its four bands, with per-form shares.
- The **placement rules**: on-ramp then flat; isolated peaks; no ramp; no
  hardest-last.
- The **dispersion target** that replaces a difficulty curve.
- Three standing warnings: do not make difficulty out of arithmetic, do not make
  it out of content escalation, and do not make it out of a rising curve.
