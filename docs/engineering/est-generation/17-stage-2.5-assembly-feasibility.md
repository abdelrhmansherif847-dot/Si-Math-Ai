# Stage 2.5 — Assembly feasibility and coverage

**STATUS: ASSEMBLY VALIDATION — STAGE 3 NOT YET APPROVED**

> Stage 2.5 builds the routine-item stream, covers the nine families the
> mechanism library could not serve, emits shared stimulus sets, and runs a real
> end-to-end assembly. Five independent seeds each fill 50/50 from the actual
> generator and emitter paths. No prototype is generated, nothing is published,
> ESTM1-2026-A is untouched, and no existing gate is weakened.

Date: 2026-09-02. Branch: `claude/mock-exam-enhancement-nnwb48`.

---

## 1. Why the original 10/50 dry run failed

Three separate causes, each measured rather than guessed.

**Cause 1 — no Entry items exist.** 53% of the 200 coded reference items have an
Entry profile: at most one mechanism biting, and none of them a reasoning-core
mechanism. 71% are Entry-or-Core. Every Stage-1 primitive was built to make a
mechanism bite, so the library produced **none** of them. Twenty-one of the
fifty slots were unfillable in principle.

**Cause 2 — nine families had no construct at all.** A02, A04, A06, A08, A11,
A13, A14, A15, A17 — 27 slots, of which A13 (read a display) alone is eight.

**Cause 3 — band and family are not independent.** The Stage-2 assembler assigned
bands on a fixed difficulty ramp, ignoring which family sat in each slot.
P-CLASSIFY only ever produces a Peak profile, so an Entry slot carrying family
A01 could never be filled however many candidates were drawn. That version filled
8 of 50; making the ramp capability-aware took it to 33.

Underneath all three sits the ceiling that actually governs: **anti-clone permits
one item per STRUCTURE**, so the number of distinct constructs a family owns *is*
the number of slots it can fill. At Stage 2 the library offered 34 structures for
50 slots.

---

## 2. The routine-item stream

`scripts/est-routine.mjs`. Nineteen families, 42 constructs, plus a
reader library of 16 readings across three shared display kinds.

**Routine is not low-quality and not trivial.** Every construct computes its key
in exact rational arithmetic, enumerates an error route for *every* printed
option, keeps a distractor within a factor of three of the key, and carries a
natural cheap trap where the mathematics has one. One item from every construct
was rendered and its key recomputed by hand; three had implausible distractors
(a percentage answer larger than the population, a growth slip landing six cells
from the start, an off-by-one duplicating another option) and were rebuilt.

**`assess()` is not applied to routine items, and is not weakened.** `assess()`
requires an insight route and a mechanism-blind route landing on a printed
distractor. A routine item has no insight route — there is no mechanism to be
blind to — so running it there is a category error, and relaxing it so they
passed would destroy the Stage-1 acceptance criterion for the items it does
govern. Routine items are a different class with their own contract,
`assessRoutine()`, and the mutation suite asserts the separation directly: a
placed routine item **fails** `assess()` and **passes** `assessRoutine()`.

**One correction the stream forced.** Marking only the correct route `natural`
graded every routine item trap-0, which locked the whole stream out of Core
(Core requires trap ≥ 1) and misdescribed the items. A routine question whose
option set contains the classic slip — reporting *y* instead of *x*, adding the
two bars, subtracting from 90 — does carry a cheap natural trap. The first
`wrongs` entry is that slip in every construct, and it is now marked natural.

---

## 3. The nine families

Each was diagnosed before anything was written. **None needed a new mechanism
primitive**; all nine are served by routine constructs, and three gained a
mechanism structure by extending an existing primitive rather than adding one.

| family | slots | why it was unserved | what was done |
|---|---|---|---|
| A13 data displays | 8 | no primitive emits a stimulus | 9 display readers across three kinds |
| A14 statistics | 3 | same | 4 constructs, 3 of them display readers |
| A15 probability | 3 | same | 3 constructs |
| A04 inequalities | 3 | no construct | 3 routine + **P-CLASSIFY/inequality-direction** |
| A06 quadratics | 3 | no construct | 3 routine + **P-NORMALISE/vertex_form** |
| A02 modelling | 2 | no construct | 2 routine |
| A08 rational expressions | 2 | no construct | 2 routine |
| A17 circles and solids | 2 | no construct | 2 routine + **C3 composition** |
| A11 growth | 1 | no construct | 1 routine |

The two new mechanism forms are extensions, not inventions.
`P-CLASSIFY/inequality-direction` applies the classification gate to an
inequality — whether the relation reverses is decided by the *sign* of the
coefficient and nothing in the stem says so. `P-NORMALISE/vertex_form` applies
the normalisation gate to a quadratic in expanded form — the standard technique
reads the vertex straight off `a(x−h)²+k` and does not apply until the square is
completed. Both were hand-verified.

### The bottleneck table, closed

**60 distinct structures for 50 slots, shortfall 0.**

| family | slots | structures | streams | | family | slots | structures | streams |
|---|---|---|---|---|---|---|---|---|
| A01 | 3 | 3 | routine+mechanism | | A12b | 2 | 2 | routine+mechanism |
| A02 | 2 | 2 | routine | | A06 | 3 | 4 | routine+mechanism |
| A03 | 2 | 3 | +composed | | A07 | 3 | 3 | +composed |
| A04 | 3 | 4 | routine+mechanism | | A08 | 2 | 2 | routine |
| A05 | 3 | 3 | routine+mechanism | | A09 | 3 | 4 | routine+mechanism |
| A18 | 1 | 2 | routine+mechanism | | A10 | 2 | 3 | routine+mechanism |
| A12 | 1 | 3 | routine+mechanism | | A11 | 1 | 1 | routine |
| A13 | 8 | 8 | routine | | A16 | 3 | 4 | routine+mechanism |
| A14 | 3 | 3 | routine | | A17 | 2 | 3 | +composed |
| A15 | 3 | 3 | routine | | | | | |

**The margin is thin and that is the standing risk.** Six families sit at exactly
their slot count, so a single construct regressing takes the form below 50/50.

---

## 4. Stimulus emission

A declared set is several questions about **one** display. Filling slots one at a
time cannot build one: the second slot needs a second reading of the *first*
slot's chart, and a per-item generator has already moved on. So sets are
assembled as a unit, in a pass before any individual slot, from a display
generated once and a reader library that takes it as an argument.

| set | slots | kind | items |
|---|---|---|---|
| S1 | 6, 7, 8 | bar-chart | 3 |
| S3 | 29, 30, 31 | data-list | 3 |
| S2 | 19, 20 | table | 2 |
| S4 | 43, 44 | bar-chart | 2 |

- **4 sets** (rule 3–5), **10 slots** covered, sizes 3/3/2/2 (rule 2–3).
- **Unsupported combinations: none.** Every declared set found a display kind
  with enough readers. `kindsFor()` reports when one cannot, and a set with no
  serving kind is recorded as unfilled rather than quietly skipped.
- **Rejections caused by stimulus constraints:** a set whose families exceed any
  kind's reader count; a reader already used by an earlier set; a reader whose
  reading clones one already in the same set.

Three ordering defects were found by running it, each recorded in the code:

1. **Sets must be ordered most-constrained-first.** Ordered by size, a two-slot
   A13+A13 set — servable by any of three kinds — took the data-list and
   stranded the two sets containing an A14 slot, for which the data-list was
   then the only kind with readers. Two A14 readers were added on the bar chart
   and the table, and the ordering now counts serving kinds.
2. **Anti-clone must run inside a set.** Summing the extremes of a list and
   subtracting them are the same reading of the same display; S3 built both.
3. **Reader exclusion must use the reader's real name.** A mangled key let two
   bar-chart sets reuse the same readings — seven clone collisions.

**Stimulus constraints do not make the difficulty or family constraints
unsatisfiable**: with the sets placed first, all four bands land inside their
observed ranges and every family is served.

---

## 5. Composition placement

The assembler places the quota deliberately. `assignBands` scores a composed
structure a thousand points better than any alternative while the per-form floor
is unmet, so composition is planned rather than hoped for. Relying on the greedy
pass placed **zero** composed items against a floor of two.

**Three patterns are now implemented** — C2 (classification → normalisation) from
Stage 2, plus C1 and C3 built here:

- **C1 · conversion → combination.** A recorded quantity must be converted before
  it enters a system whose individual unknowns are undetermined and whose asked
  combination is not. Hand-verified: recorded 10 → total 120, *a+c* = 56, *b* =
  64, target 48; the three error cells −7, 56, 1 all correct and all printed.
- **C3 · named configuration → unstated model.** Which two sides are the legs
  follows from where the right angle is named; that the legs serve as base and
  height follows from the right angle. Neither is on the page. Hand-verified on
  the 3-4-5 triple: area 6, hypotenuse-as-leg 7.5, half-omitted 12, both 15.

Every seed places **3** composed items (range 2–6), and each is re-verified by
`assessComposed` at report time rather than trusted from assembly. Composition
consumes 3 of the form's 60 structures — **5% of the diversity budget**.

`assertInteraction` still rejects stacking, and C5 remains recorded in the
composable table as `disallowed` rather than omitted.

---

## 6. Diversity

**50 distinct structures across 50 items in every seed; most-repeated 1; zero
anti-clone collisions.** No form consumes a sub-form twice.

Two fixes were needed, and neither is a random-name or random-number fix:

- **The A04 boundary construct was flagged against A01's solve-linear, and
  rightly so on the parts as first written** — identical ctx, options,
  distractors and narrative. What actually differs is the *target*: a greatest
  integer under an inclusive constraint, not a solution. The fingerprint axes now
  say so. That is the same repair made for P-NAMED-CONFIG in Stage 2: the
  fingerprint must describe the item, or the variation is invisible to it.
- **Structure selection is a matching, not a budget.** Three earlier attempts
  failed and each is recorded in the code: a fixed ramp (8/50), a per-family
  band set that over-promised a family whose single Stretch structure was asked
  for five slots (33/50), and a per-band count that double-counted every
  structure admissible in two bands (43/50). Each family now holds an explicit
  list of its remaining structures with the bands each admits, and a slot takes
  one.

---

## 7. Five-seed results

| seed | fill | retries | rejections | archetypes | Peak | composition | clones | verdict |
|---|---|---|---|---|---|---|---|---|
| 4100 | **50/50** | 214 | 174 | 50 | 11 | 3 | 0 | PASS |
| 5200 | **50/50** | 108 | 68 | 50 | 11 | 3 | 0 | PASS |
| 6300 | **50/50** | 126 | 86 | 50 | 11 | 3 | 0 | PASS |
| 7400 | **50/50** | 142 | 102 | 50 | 11 | 3 | 0 | PASS |
| 8500 | **50/50** | 157 | 117 | 50 | 11 | 3 | 0 | PASS |

Bands are identical across all five: Entry 13, Core 17, Stretch 9, Peak 11 — every
one inside its observed per-form range (6–16 / 6–19 / 8–16 / 11–24).

**The stems and the structure sets differ between seeds; the structural PLAN does
not.** With 60 structures for 50 slots the assembler has almost no freedom, so
every seed converges on the same band assignment. For a single form that is
robustness. **For a 25-form series it is a problem**, and it is the clearest
input to Stage 3: series diversity needs substantially more structures than
assembly feasibility does.

### Mechanism distribution, all five seeds

| mechanism | 4100 | 5200 | 6300 | 7400 | 8500 | reference per-form range |
|---|---|---|---|---|---|---|
| hidden_step | 17 | 17 | 17 | 17 | 17 | 13–17 |
| repr_switch | 12 | 12 | 13 | 12 | 12 | 6–14 |
| nonobvious_rel | 10 | 10 | 10 | 10 | 10 | 3–11 |
| abstraction | 9 | 9 | 9 | 9 | 9 | 8–14 |
| inference | 8 | 8 | 8 | 8 | 8 | 2–10 |
| multiconcept | 4 | 4 | 4 | 4 | 4 | 5–14 · **UNDER** |
| reversal | 3 | 3 | 3 | 3 | 3 | 0–6 |
| filtering | 2 | 2 | 2 | 2 | 2 | 5–12 · **UNDER** |
| competing_interp | 1 | 1 | 1 | 1 | 1 | 5–8 · **GATED** |

Six of nine land inside the observed range. Three do not, and none is fixed by
tuning:

- **`multiconcept` (4 vs 5–12)** bites only in composed items, and composition is
  capped at 6 per form by design. Closing it needs more composition patterns.
- **`filtering` (2 vs 5–12)** is carried by P-DECOY and P-SCOPE, which supply two
  structures between them.
- **`competing_interp` (1 vs 5–8)** is **deliberately** under-supplied: P-SCOPE
  remains unscheduled because the mechanism's sign flips across the four
  reference forms. Stage 2.5 does not relitigate that gate.

### Trap distribution, and what it can honestly be compared to

Level 0: 0 · Level 1: 41 (82%) · Level 2: 9 (18%).

**These are NOT compared against the reference counts, and Stage 2 built a gate
that did.** `TRAP_MIX`'s ranges were counted with a *judgement* instrument on 200
published items; generated items are graded by the *route model*, which needs an
enumerated route list published items do not have. Asserting one against the
other is a category error, and a gate built on one is not a gate. That check is
corrected here to assert the profile's **shape** instead: more than one level
present, some item at full cost, none saturated, and every trap-free item in
Entry — the only band admitting one.

The underlying fact is structural and worth stating plainly: **only a mechanism
item can be trap-2 under the route model**, because a routine item's correct
route *is* its natural route. A form that is two-thirds routine therefore caps at
roughly a third trap-2, whatever the reference's judgement-coded 60% suggests.

### Other metrics (seed 4100)

- **Domain:** FA 15 (30%), DAP 16 (32%), AAF 14 (28%), GT 5 (10%) — all four
  inside their published bands.
- **KAR:** **not asserted.** `claimAllowed` is false and Stage 2.5 does not change
  it; printing a number would manufacture a claim the evidence does not support.
- **Streams:** routine 33, mechanism 14, composed 3.
- **Hidden-step species:** 9 distinct across the 17 items whose `hidden_step`
  bites.
- **Time budget:** 65.8 min estimated against a 75-minute paper (88%, tolerance
  ±15%).

---

## 8. Rejection-reason distribution

**During the fill** (seed 4100): 214 candidates examined, 174 rejected.

| n | reason |
|---|---|
| 154 | anti-clone: structural repeat of an item already placed |
| 10 | Stretch: signature not satisfied |
| 10 | Peak: signature not satisfied |

Anti-clone dominates by an order of magnitude, which is the expected shape: the
pool holds many candidates per structure and exactly one may be placed.

**During pool construction**, the twelve largest of 213 distinct reasons:

| n | reason |
|---|---|
| 389 | P-CLASSIFY: the boundary is not a whole number at this level |
| 286 | P-COMBINATION: half-integer blocks read badly at this level |
| 218 | P-SCOPE: a reading is not a whole count |
| 187 | P-COMBINATION: ratio not in lowest terms |
| 180 | P-NORMALISE: two bases coincide — nothing to normalise |
| 140 | P-NAMED-CONFIG: withholding it leaves the key unchanged — the mechanism is decoration |
| 125 | P-NAMED-CONFIG: the transformation is the identity |
| 106 | P-NORMALISE: root is an integer — the divisor normalises itself away |
| 103 | P-NORMALISE: x cancels — no unique solution |
| 92 | P-CONVERSION: every distractor is a decade away |
| 81 | P-UNSTATED-MODEL: count did not change |
| 71 | P-CLASSIFY: duplicate option 0 |

Almost all are mathematical-validity refusals, which is the right shape: the
generator throws away far more than it keeps, and it throws it away for stated
reasons.

---

## 9. Mutation-test results

`tests/est-assembly-gates.test.mjs`, 41 assertions. A baseline 50/50 form passes
first, so every mutation has something to break.

| mutation | result |
|---|---|
| routine items disabled | rejected — only 17 slots remain, reproducing the Stage-2 result as an assertion |
| a required family unavailable | the bottleneck table reports the shortfall rather than hiding it |
| stimulus constraints violated (undersized set) | rejected |
| stimulus: a set demanding more readings than any kind offers | no serving kind, reported |
| stimulus: every reader of a kind excluded | the set is unbuildable and says so |
| composition quota ignored (0, and 12) | both rejected |
| structural duplication allowed | rejected, and the duplicate is detectable |
| anti-clone bypassed | rejected, reason names anti-clone |
| a band starved (Peak emptied) / flooded (all Peak) | both rejected |
| mechanism requirements bypassed via metadata | rejected — a rich mechanism map with no insight route fails |
| a routine item claiming reasoning-core mechanisms | fails its own contract, and the form is rejected |
| an option no route reaches | fails the routine contract |

Plus the separation of contracts, asserted directly: a placed routine item
**fails** `assess()` and **passes** `assessRoutine()`; a mechanism item passes
`assess()` unchanged.

---

## 10. Acceptance criteria

| | criterion | result |
|---|---|---|
| A | at least one real 50/50 dry run | **met** — five |
| B | all five seeds produce complete forms | **met** — 50/50 each |
| C | no anti-clone violation | **met** — 0 in every seed |
| D | no invalid composition | **met** — 3 per seed, depth 2, each re-verified |
| E | no mechanism satisfied only through metadata | **met** — load-bearing re-derived per item; mutation-tested |
| F | domain, stimulus and structural constraints simultaneously valid | **met** — all four domains in band, 4 sets, 50 distinct structures |
| G | CI green, no gate weakened | **met** — 73/73 |

Three metrics sit outside their reference ranges and are reported rather than
tuned: `multiconcept`, `filtering`, and the deliberately gated
`competing_interp`. None is an acceptance criterion, and none can be closed
without more structures or an evidence change.

---

## 11. Files changed

| file | change |
|---|---|
| `scripts/est-routine.mjs` | **new** — the routine stream: `assessRoutine`, 33 constructs across 19 families, the shared-display reader library, `stimulusSet`, `kindsFor` |
| `scripts/est-assemble.mjs` | **new** — the real assembler: two-stream pool, structure matching, the stimulus-set pass, `verify`, `bottleneck`, the report |
| `scripts/validate-est-assembly.mjs` | **new** — the CI gate, five seeds |
| `tests/est-assembly-gates.test.mjs` | **new** — 41 assertions, eight mutation classes |
| `scripts/est-compose.mjs` | C1 and C3 built |
| `scripts/est-primitives.mjs` | `P-CLASSIFY/inequality-direction`, `P-NORMALISE/vertex_form`; `layout`, `coef`, `term`, `signedConst` exported |
| `scripts/est-fingerprint.mjs` | the chain axis compares a step LIST at 0.9 and a free-text label at 0.5 — two different kinds of value that needed different thresholds |
| `scripts/validate-est-primitives.mjs` | the P-CLASSIFY architecture check made form-aware |
| `docs/engineering/est-generation/17-stage-2.5-assembly-feasibility.md` | this document |
| `docs/engineering/est-generation/README.md` | index row |

Not changed: the blueprint's slot table, family quotas, domain or KAR
calibration; `DEMAND_BANDS`; ESTM1-2026-A (md5
`38926f22b7869608f310d0a8e21bb55e`); the reference fingerprint table; any backend
or database behaviour.

---

## 12. CI

`node tests/run-all.mjs` → **73/73 green**. 71 pre-existing checks, none removed
or weakened; two added (`est-assembly-gates`, `validate-est-assembly`).

---

## 13. What Stage 3 would meet

Recorded so the next approval is an informed one, not as a request.

1. **Series diversity, not assembly feasibility.** 60 structures fill one form
   and leave the assembler no freedom; every seed converges on the same plan. A
   25-form series needs several times that.
2. **Six families sit at exactly their slot count.** One construct regressing
   takes the form below 50/50.
3. **`multiconcept` and `filtering` remain under-supplied**, and the first needs
   more composition patterns rather than more items.
4. **`competing_interp` stays gated** on evidence that has not changed.

---

## 14. Commit

`docs/engineering/est-generation/17-stage-2.5-assembly-feasibility.md` is carried
by the Stage-2.5 commit; the hash is recorded by the follow-up commit that amends
this line, and in the Stage-2.5 report.
