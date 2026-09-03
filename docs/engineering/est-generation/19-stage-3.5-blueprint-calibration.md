# Stage 3.5 — Blueprint Calibration and Prototype Repair

**STATUS: BLUEPRINT CALIBRATION + P2 VALIDATION — NOT APPROVED FOR SERIES SCALING**

Stage 3 generated one prototype, `ESTM2-2026-P1`, and the blind review failed it
on five of ten criteria. The single sharpest finding was that **16 of its 17
Core slots held items a blind coder put in Entry**. This stage repairs the
blueprint that allowed that, builds the class of item the repair proved missing,
and validates a second prototype, `ESTM2-2026-P2`, against the same blind frame.

No exam content appears in this document. Every illustration is our own, and the
prototypes live outside this repository.

---

## 1. What the Entry/Core boundary was, and what it is now

### 1.1 The failure, stated exactly

The Stage-2 Core signature was

```js
Core: p => p.biting <= 2 && p.core <= 1 && p.present >= 1 && p.present <= 7 && p.trap >= 1 && !p.composed
```

Every clause is a CEILING except `present >= 1` and `trap >= 1`, and a routine
item with one mechanism mildly in play and a cheap slip satisfies both. Core
asked for nothing an Entry item could fail. The assembler filled 17 Core slots
from the routine stream and the blind coder returned 16 of them to Entry.

### 1.2 The question put to the corpus

Rather than reason about what Core *should* mean, the 200 coded reference items
were banded on drift-corrected RLx and every candidate property scored by
(share admitted in Core) − (share admitted in Entry):

| property | Entry | Core | separation |
|---|---:|---:|---:|
| **`trap_cost >= 2`** | 16% | 60% | **+0.44** |
| `opacity >= 2` (not surface-readable) | 51% | 88% | +0.36 |
| `present >= 5` | 11% | 42% | +0.31 |
| `coreMild >= 1` | 51% | 79% | +0.28 |
| `biting >= 1` | 11% | 31% | +0.20 |
| `core >= 1` | 0% | 2% | +0.02 |
| `steps >= 2` | 84% | 96% | +0.12 |

Two results matter more than the ranking.

**Neither `core` nor `biting` separates Entry from Core at all.** The modal Core
item in the corpus has *no* mechanism biting — signature `opacity 2, coreMild 1,
biting 0, core 0, trap 2`, 23% of the band. A Core rule built on mechanism
density would have described a Stretch item.

**`steps` is worth +0.12**, which is the whole case for keeping operation count
out of the placement rule.

### 1.3 Why the rule is built on `trap_cost` and not on the sharpest conjunction

The blind re-code of 20 items (artifact 15) classified each dimension as
*judgement* or *mechanical* by how far a second coding moved it. Mean shift on
the eleven judgement dimensions: **+0.405**. On the three mechanical ones:
**+0.017**. `trap_cost` shifted **+0.05** and `surface_visible` **+0.05**.

So the two properties that separate Entry from Core best are also the two a
second coder would have measured the same way. A conjunction search over all
1- 2- and 3-term rules that *also* reject every one of the 30 P1 routine
constructs the blind coder put in Entry left 105 survivors of 460; the best was
`(trap>=2 OR biting>=1) AND opacity>=2` at +0.55. Opacity is not modelled by the
generator, and adding it as a second declaration would have produced a synonym
for the trap rather than an independent test — the route model already asks what
the natural first move does. The rule adopted is therefore its drift-immune
half:

> **Core requires `trap === 2`.**

### 1.4 Making trap level 2 reachable without an insight route

`trapLevel()` compared the trap's cost against the INSIGHT route's cost. An item
with no insight route compares against `Infinity`, so level 2 was structurally
unreachable and every routine item graded 1 — confirmed from the other side by
the P1 blind coding, where all 34 routine constructs were coded `trap_cost 1`.

The corpus says what full cost means for an item with nothing to discover.
Among its trap-2 Core items with no mechanism biting the shape is always the
same: the natural move is a **complete rival method** — the direct-variation
answer where the relation is inverse, the mean where the sum is wanted, the
magnitude of the negative root, the two-year total that is not the tallest bar.
The student answers a different question correctly and pays full price.

`trapLevel()` now has two branches:

- **an insight route exists** → cost against the insight. Unchanged from Stage 1.
- **no insight route** → **rivalry**. A natural wrong route landing on a printed
  option grades 2 when its value is **not an intermediate of the solution path**
  and its cost is at least the solution's. A route stopping at an intermediate
  is a truncation — a slip — and grades 1.

Both halves are DERIVED, not declared. `item.solution` is an ordered step list
whose last value must be the key; `steps` is its length and the intermediates
are its non-final values. Route costs are the lengths of the solution and rival
paths, so no cost is asserted anywhere and none can be inflated to buy a grade.

**The branch fails closed.** An item with no declared solution path can
establish no rivalry and grades 1, so all 42 pre-existing routine constructs are
graded exactly as before. Mutation-tested four ways in
`tests/est-form-gates.test.mjs` §3–4: turning a rival into a truncation, deleting
the path, ending the path anywhere but the key, and removing the natural rival
route each drop the grade to 1.

### 1.5 Routine items were not made complicated

Nothing was added to a routine construct to lift it. A routine item still has a
cheap natural slip and still grades trap 1, and it is now admissible in Entry
**only** — which is where the blind coder put 30 of P1's 34 routine constructs.

---

## 2. Protecting Stretch and Peak

The Stage-2 Stretch rule required `biting >= 1`, which a chart-reading routine
item satisfies for free: reading a value off a bar chart is a representational
switch and `repr_switch` bites without any reasoning. Stretch now requires

```js
Stretch: p => (p.core >= 1 || p.trap === 2) && p.biting >= 1 && p.biting <= 3 && p.core <= 2 && p.present >= 2
```

Either a **reasoning-core mechanism at full strength** — which `assessRoutine()`
contractually forbids a routine item from having — or a **full-cost trap**,
which the routine stream cannot construct. Neither clause is a step count and
neither is a sum.

**No band requires every mechanism.** Measured against the observed bands:

| rule | Entry | Core | Stretch | Peak |
|---|---:|---:|---:|---:|
| Core: `trap === 2` + ceilings | 16% | 60% | 71% | 76% |
| Stretch: `(core>=1 OR trap===2)` + shape | 5% | ~25% | 63% | 100% |
| Peak (unchanged from Stage 2) | 0% | 0% | 25% | 81% |

Peak stays deliberately narrower than the observed band: it requires a
reasoning-core mechanism, which 14% of real Peak items do without. That is a
design choice, stated rather than hidden, and it means generated Peak items sit
in the modal Peak profile rather than its tail.

The trap FLOOR was removed from Stretch, because the corpus carries one trap-0
item in 52 Stretch items and one in 63 Peak items. A rule saying "never" would
be stricter than the corpus; `verify()` now counts them instead and fails above
two.

---

## 3. What the corrected boundary cost — the measured hole

Correcting the boundary was measured before it was made, and it immediately
measured a hole. Under the corrected rules the generator's **Core capacity was
zero**. The mechanism pool's joint distribution, 6813 candidates:

```
   t0 b2 c1   516      t1 b1 c1  1013      t1 b2 c1  1030
   t1 b3 c2   338      t1 b4 c4  1119
   t2 b3 c2  1594      t2 b4 c2   577      t2 b5 c3   626
```

Every trap-2 item has **three or more** mechanisms biting and two or more from
the reasoning core. Every item with two or fewer biting has trap ≤ 1. Trap level
and mechanism density are entangled in the primitives.

The corpus does not share that entanglement: **29 of its 48 Core-band items are
graded trap 2 with no mechanism biting at all**. There is a class of authentic
EST item the generator could not make — not routine, because a routine item's
wrong route is a slip; not mechanism-bearing, because there is nothing to
discover. The middle.

---

## 4. The Core stream

`scripts/est-core-stream.mjs` — **21 constructs across 15 families**, plus **4
readers of a shared display**. Routine mathematics whose most natural first move
is a complete rival method.

Each declares `solution` and `rival` as ordered step lists and is checked by
`assessCore()`, which is stricter than `assessRoutine()` in the two places that
matter and identical elsewhere. `assess()` is neither applied to these items nor
weakened: a Core item has no insight route, so the Stage-1 contract is not the
contract it can meet — the same reasoning that gave the routine stream its own.

The eight clauses, each mutation-tested:

1. no route claims an insight
2. a solution path of at least two steps, terminating on the key
3. a rival of at least the solution's length, landing on a printed wrong option
4. the rival's value is not an intermediate — a rival, not a truncation
5. every printed option is reached by an enumerated route
6. magnitude alone cannot identify the key
7. `core === 0`, `biting <= 2`, at least one mechanism in play
8. `trapLevel()` actually returns 2

**The rivalry test is necessary, not sufficient**, and the cost condition is
what makes the pair sufficient: "add the two legs instead of using Pythagoras"
lands off the solution path but takes one step against the key's two, so it
grades 1. Both conditions, or the trap is a slip.

**Residual risk, stated.** An author who omits an intermediate from the solution
path could disguise a truncation as a rival. Omission cannot be detected
automatically. What the design does instead is make the incentive run the right
way — declaring *extra* intermediates only makes trap 2 harder to earn — and
make the check demonstrably load-bearing: disabling the rivalry clause turns the
mutation suite red.

### 4.1 Core readers of a shared display

Ten of the fifty blueprint slots belong to four shared-stimulus sets and eight
of those ten are one family. With only routine readers available, every one of
those slots was forced to Entry, and the whole form's Entry floor was 15 against
a plan of 13. The corpus does not agree that a chart question is an easy
question — three of its Core items are chart readings. Four Core readers were
added, one per display kind plus one, and the set builder now tries a Core
reader first for each set.

---

## 5. Step-count leakage — what is gated and what is only reported

### 5.1 The gated quantity: band overlap

In the corpus, **95% of non-Entry items (71 of 75, T3+T4) take a number of
operations that some Entry item also takes**. Entry spans 1 to 7 steps; Peak
spans 1 to 8. Knowing how long a real EST item is tells you almost nothing about
how hard it is, and that is the property a generator has to reproduce.

The gate fires when fewer than **70%** of a form's non-Entry items fall inside
its Entry span. There is **no maximum on operations anywhere** — a form of
nine-step items passes, and the mutation suite asserts it does.

### 5.2 The reported quantities, and why they are not gated

Spearman r(steps, band rank) per reference form: **+0.128 / +0.275 / +0.423 /
+0.474**. The generator's sits near **+0.85** — but the reason is not that its
bands are reached by operation count. `itemSteps()` falls back to the fingerprint
chain, an authored 2-to-4 element shape label with almost no variance inside a
stream: routine items 1–2, Core-stream items exactly 2, mechanism items 3–4. A
correlation on that proxy measures which STREAM an item came from.

The underlying observation is real and worth acting on — the generator's streams
are separated by length where the reference's bands are not — so it is recorded.
It is not gated, because gating on it would be gating on a coincidence. Making
it gateable needs a real per-construct step count on all 66 constructs; that is
open work in §11.

### 5.3 What was done about it instead

Three "long but routine" constructs were added (a fraction grind, an expand-and-
collect, a chained unit conversion) and one long chart reading, because the
corpus is explicit that long-and-easy is a real EST shape — "fraction grind, no
insight required", "7 arithmetic operations, zero reasoning", "4 operations,
zero discovery". A rule was added that no two readings of one display may take
the same number of steps, preferred rather than required.

**On the blind coding of P2 the measured Spearman is +0.518**, against a
reference range of +0.128 to +0.474 and P1's Pearson +0.835.

---

## 6. Answer-key balance

### 6.1 Two rules with different standing

Measured key letter counts across the four reference forms (artifact 1 §8):

| Form | A | B | C | D | longest run |
|---|---:|---:|---:|---:|---|
| 1 | 10 | 13 | 14 | 13 | 3 |
| 2 | 9 | 17 | 14 | 10 | **5** |
| 3 | 9 | 11 | 18 | 12 | 3 |
| 5 | 9 | 12 | 15 | 14 | 3 |

The **per-letter budget of 11–14** is tighter than any reference form and is a
DELIBERATE DEPARTURE recorded in artifact 1 §8: the corpus under-uses A in all
four forms, which makes A a marginally worse guess, and reproducing an
unfairness buys no fidelity. That rule stays.

**The run cap of 3 does not survive.** The corpus has no anti-run rule at all —
its adjacent-repeat rate is 22.4% against the 25% a random key gives, and one
form contains a run of four AND a run of five. A cap of 3 is exactly the
unnatural rule this stage was told not to impose, and P1 failed five checks
against it while its actual key defect — **A19 B20 C4 D7** — went unenforced
because nothing balanced the key at emission. The cap is now **5**, the observed
maximum.

### 6.2 The real fix: balance at emission

`rebalanceKeys()` permutes each item's option ORDER so the form meets the letter
budget. The same four values are printed and the same one is correct; only which
letter carries the key moves, which is a choice the emitter was making at random
and can equally make to a budget. The mutation suite asserts the answer never
moves.

Three versions were needed and the first two are instructive, because both
produced a form whose longest key run was **one** — an anti-run rule arriving by
the back door, as unlike the reference as a run of six:

1. breaking ties away from the previous letter — an explicit anti-run rule;
2. taking the letter furthest below quota — which with four letters and fifty
   items rotates almost deterministically;
3. **any letter the budget can still afford**, chosen by a mixed hash of the
   position and the seed. Runs form wherever the budget leaves them free to.

A fourth defect was found and fixed at the same time: with the hash keyed on
position alone, **every form in the series carried the identical 50-letter key**.
Three seeds produced the same string. The seed is now mixed in.

A repair pass swaps two items' key letters when the tail is forced into a sixth
consecutive letter; swapping leaves every count identical.

Measured across six seeds: counts 11–14 in every letter, longest runs **2, 3, 4,
3, 5, 3**.

---

## 7. Content-level reuse, independent of the fingerprint

The seven-axis fingerprint compares SHAPE. Two items can score far apart on all
seven and still print the same equation — P1's Q01 and Q12 did, from different
primitives, and no gate saw it (artifact 18, defect D2).

`contentReuse()` reads the SURFACE instead, and is deliberately independent:

| axis | what collides | threshold |
|---|---|---|
| `equation` | a math span printed twice | ≥ 12 chars AND ≥ 2 distinct numerals |
| `numericTuple` | the sorted numbers of a stem | ≥ 3 numbers |
| `constants` | distinct integers ≥ 10 in a stem | ≥ 3 of them |
| `optionSet` | the four option texts, sorted | exact |

**Not rejecting legitimate common mathematics is the whole difficulty.** Every
EST form prints `y = mx + b`, `a^2 + b^2 = c^2`, `\pi r^2`, `x^2`. The thresholds
exist so those are never compared: `a^2 + b^2 = c^2` carries no numerals beyond
exponents; `x^2` is four characters. The mutation suite plants all four of those
formulas in one form and asserts zero false positives, then plants a repeated
equation, a repeated option grid and a repeated numeric tuple and asserts all
three are caught.

It is enforced at EMISSION, not audited afterwards: a candidate that repeats
surface content already printed is rejected during the fill.

**Nothing about exam content enters this repository.** The detector runs over
the in-memory form; only fingerprints and signatures are ever stored.

---

## 8. Measurable authenticity, and what was refused

Three properties are gated, each with a reference measurement behind it:

- **target diversity** — every reference form asks at least FOUR distinct kinds
  of thing and `value` is 64–76% of its items;
- **low-information readings** — a shared display carries at most ONE pure
  lookup (the corpus's single-bar-read item is singular in its four-item block);
- **configuration repetition** — at most TWO items may share a sub-form
  (artifact 1 §9: within a form an archetype essentially never repeats, and two
  of four reference forms carry 50 distinct archetypes in 50 items).

Three are reported and **not** gated: stem-length spread, numeric-magnitude
spread, and context-noun reuse. Each is a real AI tell. None has a threshold
defensible from the evidence this project holds — the corpus is coded on 14
dimensions and carries no machine-readable stems — and a threshold chosen by
taste is the subjective black-box detector this stage was told not to build.

`ARCHETYPE_DIVERSITY.maxPerSubForm` was lowered from 3 to 2, and `capacityOf()`
now respects it, because P-NAMED-CONFIG offers fourteen variations on one
special-triangle configuration and P1 printed three of them.

---

## 9. Assembly

`BAND_PLAN` was re-derived from **T3+T4 only, uncorrected** — the 100 reference
items coded at the current standard, which is the standard a generated form is
blind-coded against. Their bands are Entry 25 / Core 23 / Stretch 24 / Peak 28
per 100; per 50 that is 12.5 / 11.5 / 12 / 14, and the plan is **13 / 11 / 12 /
14**. The Stage-2 plan came from the drift-CORRECTED pooled n=200, where T1 and
T2 carry +4.00 to make them comparable with T3/T4 — a correction that exists to
pool four forms coded months apart and does not apply to a form coded today
against forms coded today.

Two new mechanism sub-forms were written, `P-PARTITION/partition_mean` and
`P-PARTITION/inclusion_exclusion`, because the assembler measured that six of
nineteen archetype families held twenty-one of the fifty slots with **no
mechanism sub-form at all** — those slots could never be anything but Entry or
Core. Both express a mechanism the eight Stage-1 primitives do not: an aggregate
that does not combine the way its parts appear to. Means do not average;
probabilities do not add.

**Five seeds, 50/50 each, every contract holding simultaneously**
(`scripts/validate-est-assembly.mjs`): each item re-checked by the contract for
its stream, no anti-clone collisions, composition in range, key balance,
content reuse, configuration and stimulus rules, 86 distinct structures for 50
slots.

Two things are recorded as OPEN measurements rather than asserted, and printed
on every run of the gate:

| | measured | reference |
|---|---|---|
| Entry band | 17 | 6–16 (drift-corrected per-form range) |
| Peak band | 10 | 11–24 |
| value-target share | 88–90% | 64–76% |
| step-span overlap | 42–85% | 95% |

Asserting a range the generator provably cannot reach turns a measured gap into
a red build that says nothing new. §11 records what closing each would take.

---

## 10. ESTM2-2026-P2

| | |
|---|---|
| Form | `ESTM2-2026-P2` |
| Status | DRAFT — INTERNAL REVIEW ONLY. Not published, not exposed to students |
| Seed | **9600** |
| sha256 | `ae55f23c5c5b4a21813f7e6b26832d4ddc4a65004d65c51a417efcbf7db56ca5` |
| Blueprint version | stage-3.5 signatures + core stream + form gates |
| Items | 50/50 |
| Answer key | `BBACDDDDAACBBDDDAAACCADBCBBACCCDADBCCABCCBAADDDCBC` |
| Key counts | A 12 · B 11 · C 14 · D 13, longest run 3 |
| Streams | routine 17 · core 14 · mechanism 16 · composed 3 |
| Stimulus sets | 4 (bar-chart ×2, data-list, table) |

**The seed was chosen before the form was seen.** 9600 had never been run: the
five seeds the Stage-3.5 gates were developed against are 4100 / 5200 / 6300 /
7400 / 8500, and generating P2 on one of them would have been sampling from the
set the work was tuned on.

`ESTM2-2026-P1` is untouched. Its payload, identity and blind render are
unchanged on disk and it remains the failed prototype. `ESTM1-2026-A` is
unchanged, md5 `38926f22b7869608f310d0a8e21bb55e`.

---

## 11. The blind forensic review of P2

Every key was recomputed by hand from the rendered item BEFORE any coding, and
all 50 match the generator. All 50 items were then coded on the same
14-dimension frame as the 200 reference items, from stem, options and stimulus
data only — no band, no stream, no mechanism map, no routes, no solution paths.

### 11.1 The headline

| | P1 | **P2** | reference T3+T4, per 50 |
|---|---:|---:|---:|
| mean RLx | 10.30 | **12.12** | **13.01** |
| Entry | 29 (58%) | **16 (32%)** | 12.5 (25%) |
| Core | 5 (10%) | **13 (26%)** | 11.5 (23%) |
| Stretch | 9 (18%) | **11 (22%)** | 12 (24%) |
| Peak | 7 (14%) | **10 (20%)** | 14 (28%) |
| `opacity` mean | 0.40 | **1.70** | 1.79 |
| r(steps, RLx) | +0.835 | **+0.664** | +0.413 |
| Spearman r(steps, band) | — | **+0.518** | +0.128…+0.474 |

For comparison, `ESTM1-2026-A` — the hand-reviewed form this programme started
from — measures mean RLx 10.96.

### 11.2 The Entry/Core repair, tested where it failed

The P1 failure was that Core slots held Entry items. The Core stream's 14 items
blind-code as **Core 6 / Stretch 6 / Entry 2** — twelve of fourteen at Core or
above. Mean RLx by stream: routine **8.41**, core **12.07**, mechanism **14.81**,
composed **19.00**. The streams are ordered as designed and the Core stream sits
where the corpus puts Core.

### 11.3 Generator band against blind band

**26 of 50**, against P1's 25 of 50. The number barely moved; the *direction*
inverted, and that is the finding.

| gen \ blind | Entry | Core | Stretch | Peak |
|---|---:|---:|---:|---:|
| Entry | 12 | 5 | 0 | 0 |
| Core | 2 | **6** | **6** | 0 |
| Stretch | 1 | 2 | 2 | **4** |
| Peak | 1 | 0 | 3 | 6 |

In P1 the generator over-claimed: Core slots held Entry items. In P2 it
**under**-claims: six Core slots hold blind-Stretch items and four Stretch slots
hold blind-Peak items. The mass is above the diagonal, not below it. That is a
calibration offset in the signature thresholds, not a failure of the mechanism —
the items are harder than the generator believes, which is the opposite of the
Stage-3 defect and a different problem.

### 11.4 Per-dimension, against T3+T4

| dimension | P2 | ref | delta |
|---|---:|---:|---:|
| trap_cost | 1.62 | 1.48 | +0.14 |
| filtering | 1.04 | 0.99 | +0.05 |
| nonobvious_rel | 0.72 | 0.72 | 0.00 |
| reversal | 0.24 | 0.30 | −0.06 |
| competing_interp | 0.46 | 0.53 | −0.07 |
| distractor_close | 1.78 | 1.86 | −0.08 |
| opacity | 1.70 | 1.79 | −0.09 |
| repr_switch | 0.76 | 0.86 | −0.10 |
| abstraction | 0.92 | 1.06 | −0.14 |
| inference | 0.88 | 1.02 | −0.14 |
| hidden_step | 0.98 | 1.19 | −0.21 |
| approaches | 0.24 | 0.53 | −0.29 |
| **multiconcept** | **0.78** | **1.20** | **−0.42** |

`opacity`, the largest single gap in P1 at −1.39, has closed to −0.09.
`multiconcept` is now the largest, and `approaches` second: generated items
present fewer plausible routes than real ones.

### 11.5 Mechanisms still bite

hidden_step 22% · multiconcept 24% · repr_switch 24% · inference 20% ·
nonobvious_rel 20% · abstraction 18% · filtering 12% · reversal 4% ·
competing_interp 2%. The Stage-1 gains hold; `nonobvious_rel`'s P1 overshoot
(30% against a reference 8%) has come down to 20%.

Blind `trap_cost` {1: 19, 2: 31} against generator `trapLevel` {0: 1, 1: 27,
2: 22} — agreement 38/50, and the generator **under**-grades, consistent with
§11.3.

---

## 12. Second-reader defects — found, reported, NOT fixed

### D1 — a bypassable Stage-1 primitive (SEVERE)

`P-COMBINATION/sum-difference` builds a target `m(u+w) + n·v` from two relations.
**When `m === n` the target collapses to `m(u+v+w)`, readable straight off the
first relation**; the second is decoration and the insight is not required.

Measured: **90 of 817 candidates (11%)** have `m === n`. One of them is in P2.

`assess()`'s anti-bypass check compares only ENUMERATED routes, and this route
was never enumerated — so the defect survived Stage 1, 1.5, 2, 2.5, 3 and 3.5.
The fix is one line (`if (m === n) return { error: … }`) plus a route
enumerating the collapse so the check can see it. **It is not applied here**,
because applying it would invalidate the frozen P2 and restart the review this
stage exists to deliver.

### D2 — three items with one opening sentence

Q10, Q14 and Q27 all open "In triangle PQR, m∠PQR = 90°…". `maxPerSubForm`
counts sub-forms and these are three different ones, so the rule did not fire.
Five items open "The bar chart shows the number of items sold on four days".

### D3 — the same function definition twice

Q37 and Q47 both define `f(x) = 4x − 5`. The content detector missed it: the
span is 10 characters against a 12-character threshold, and the numeric tuples
and option grids differ.

### D4 — three remainder-theorem items

Q12, Q33, Q49. Three different sub-forms (a non-monic divisor, a composed
classification-then-remainder, a routine evaluation), so no configuration rule
fired, but a student meets the remainder theorem three times in one paper.

### D5 — a genuinely ambiguous composed stem

Q16 says output is recorded "in dozens of units" and that a recorded total is
10, then that the three parts sum "to that total". Whether the parts sum to 10
or to 120 is not settled by the sentence, and **both readings are printed**.
The conversion is load-bearing, which is the composition working; the wording
is not.

### D6 — two displays with identical category labels

Two separate bar charts both labelled Mon/Tue/Wed/Thu.

### D7 — three readings of one five-number list

Q29, Q30, Q31 at depths 2, 1, 2. The distinct-depth rule is a preference (a hard
version starved three of fifty slots) so a repeat at depth 2 was allowed.

### D8 — an artificial-looking target scale

Q05 asks for `4(a/b)`. The multiplier exists to move the answer off the
distractor grid and reads as a generated flourish.

### D9 — 90% of items ask for a value

Against a reference range of 64–76%. Three non-value Core constructs were added
and the share moved from 88% to 90%: the pool is overwhelmingly value-targeted
and three constructs cannot change that. This is coverage, not calibration.

---

## 13. Verdict, and where the remaining failure lives

### 13.1 Against the Stage-3.5 acceptance criteria

Ranges are **evidence-based**, derived from the four reference forms rather than
demanded exactly. The comparison basis is T3+T4 uncorrected, the standard P2 was
coded at; per-form ranges across all four forms are given where they differ.

| | criterion | measured | verdict |
|---|---|---|---|
| **A** | difficulty profile moves materially toward reference | mean RLx 10.30 → **12.12** (ref 13.01); every band moved toward its target | **PASS** |
| **B** | Entry no longer dominates | 58% → **32%** (ref 25%, per-form range 18–32% at this standard) | **PASS** |
| **C** | Core is a real band, not routine items in Core slots | Core stream blind-codes Core 6 / Stretch 6 / Entry 2; blind Core 26% vs ref 23% | **PASS** |
| **D** | Stretch and Peak survive | Stretch 22% (ref 24%), Peak **20%** (ref 28%, per-form range 22–28%) | **PARTIAL** |
| **E** | Stage-1 mechanism gains retained | all nine mechanisms bite; hidden_step 22%, multiconcept 24%, opacity 1.70 vs 1.79 | **PASS** |
| **F** | difficulty is not step count | Spearman +0.518 vs reference max +0.474; band overlap 82% vs 95% | **PARTIAL** |
| **G** | no exact content reuse | zero equation, tuple, constant or option-grid collisions | **PASS** |
| **H** | no severe key imbalance | A12 B11 C14 D13, longest run 3 | **PASS** |
| **I** | no systematic AI-generated feel | 9 second-reader defects, 6 of them repetition the gates do not model | **FAIL** |
| **J** | routine stream at reference scale, overwhelmingly Entry | 17 routine items, blind Entry 12 / Core 5 | **PASS** |

**7 PASS · 2 PARTIAL · 1 FAIL**, against Stage 3's 5 PASS / 5 FAIL.

### 13.2 Where the remaining failure lives

The brief asks the remainder to be classified as blueprint calibration,
primitive coverage, assembly, forensic-model limitation, or a genuine conflict
in the reference-derived constraints. It is **three of the five**, and they are
separable:

**PRIMITIVE COVERAGE — the dominant one, and the reason D, F and I are not
passes.**

- Six of nineteen archetype families hold **21 of the 50 slots** and have no
  mechanism sub-form. Those slots cannot be Stretch or Peak whatever the plan
  says. The Stretch+Peak ceiling is 21 against a per-form reference floor of 22.
- The candidate pool is **90% value-targeted** against a reference 64–76%.
- Every construct's step count comes from an authored 2-to-4 element chain
  label, so the streams are separated by length where the reference's bands are
  not.
- Repetition defects D2, D3, D4, D6, D7 are all one shape: the generator has few
  enough distinct *mathematical objects* that a 50-item form meets several of
  them more than once. 100 structures exist and 50 are used — 50% freedom, up
  from 32% at P1 — but they concentrate on a narrow set of objects.

**FORENSIC-MODEL LIMITATION — one, and it is real.**

The step-independence gate rests on a proxy. §5.2 states it; the honest
consequence is that F cannot be judged properly until steps are derived per
construct rather than inferred from a fingerprint axis.

**CORRECTNESS — one, and it is severe.**

D1: 11% of one Stage-1 primitive's candidates are bypassable, and six stages of
review did not catch it because the anti-bypass check can only see routes
someone enumerated.

**NOT blueprint calibration, and NOT a conflict in the constraints.** The
boundary correction did what it was built to do, measured on the criterion it
was built for. And no two reference-derived constraints were found to be in
conflict: everything that failed, failed for want of coverage.

### 13.3 Recommendation

**REVISE PRIMITIVE COVERAGE — do not scale, and do not build a P3 yet.**

Building a third prototype against the same primitive library would reproduce
§13.2 with different numbers. The next stage's work is named and ordered:

1. fix D1, and add the enumerated collapse route so `assess()` can see it;
2. give all 66 constructs a real derived step count, retiring the chain proxy;
3. mechanism sub-forms for the six unreached families;
4. non-value targets across the pool, not three of them;
5. a repetition rule over mathematical OBJECT rather than sub-form, which is
   what D2, D3, D4, D6 and D7 all need.

**Stop here.** Forms 2–25 are not generated, no form is published, and none is
exposed to students. Series scaling waits on explicit approval after a prototype
passes blind review.

---

## Artefacts

| what | where |
|---|---|
| signatures, bands, evidence | `scripts/est-signatures.mjs` |
| trap level, rivalry, P-PARTITION | `scripts/est-primitives.mjs` |
| the Core stream | `scripts/est-core-stream.mjs` |
| the four form gates | `scripts/est-form-gates.mjs` |
| assembler, three streams | `scripts/est-assemble.mjs` |
| assembly gate, 5 seeds | `scripts/validate-est-assembly.mjs` |
| mutation suite, 9 classes | `tests/est-form-gates.test.mjs` |
| P1 (frozen, failed) · P2 (frozen) | outside this repository |

Committed as `30fe947`.
