# EST I Math — Generation Blueprint

**Artifact 6 of 8.** Evidence tiers: [`01-est-exam-dna.md` §0](01-est-exam-dna.md).
This is the only artifact a generator executes; 1–5 explain why it says what it
says, and 7–8 decide whether what came out is acceptable.

> **This blueprint is executable and self-checking.**
> The machine-readable half is [`scripts/est-blueprint.mjs`](../../../scripts/est-blueprint.mjs);
> [`scripts/validate-est-blueprint.mjs`](../../../scripts/validate-est-blueprint.mjs)
> asserts every constraint below and is auto-discovered by `tests/run-all.mjs`,
> so **CI fails if the blueprint stops satisfying its own rules.**
> The slot table in §4 is generated from the module, so it cannot drift from it.
>
> The validator was mutation-tested before being committed: moving a geometry
> item next to another, ending the form on its peak, pushing geometry over the
> published 13% ceiling, and deleting the Roman-numeral item each turn it red.
> The third of those is the exact defect already shipped in `ESTM1-2026-A`.

---

## 0. Rule strength — the anti-overfitting layer

**The corpus is four forms.** Turning every observed frequency into a mandatory
rule would produce four forms with shuffled questions, not an exam. Every rule in
this blueprint therefore carries a **strength**, declared in
`scripts/est-blueprint.mjs` `RULES` alongside its evidence tier and the reason
the two combine as they do.

| Strength | Meaning | What a generator may vary |
|---|---|---|
| **hard** | Must always hold. Violation is a defect. | Nothing |
| **range** | Must land inside a stated interval — anywhere inside it | Position within the range |
| **soft** | Should usually hold; a form may deviate **with a recorded reason** | The deviation, once explained |
| **tendency** | Reproduce **across the series**, not in every form | Per-form conformance |
| **rare** | Must appear in **some** forms of a series and **not in all** | Which forms carry it |
| **optional** | Free choice, recorded so it is varied deliberately | Everything |

**Evidence caps strength, and the validator enforces the cap:**

- **T3 evidence cannot support a `hard` constraint.** Three-of-four-forms is a
  tendency, not a law.
- **T4 evidence cannot constrain generation at all** — only `rare`, `tendency`
  or `optional`.

Mutation-tested: promoting a T4 finding to `hard` turns the validator red.

### Where each kind of rule lives

| Strength | Examples |
|---|---|
| **hard** | 50 items · 100% four-option MCQ · no archetype or context repeat within a form · no numeric duplication across the series · the key is read off, not chosen · every distractor named · the derived-target partner present · the last item is not the peak · peaks not adjacent · geometry not adjacent |
| **range** | Published domain bands · published KAR bands · family counts · demand-band shares · device budgets · set structure · stimulus coverage · key balance |
| **soft** | The on-ramp shape · per-block dispersion · no family twice in a row · peaks stacking two devices · the share of colon-form stems |
| **tendency** | A14 landing on exactly 3 · the per-form family mix · within-set skill ordering · the corpus's A-letter deficit (recorded, deliberately **not** reproduced) |
| **rare** | Complex numbers · NOT-items · stem modifiers · "none of the above" · four-computation options · scaled axes · explicit rounding · a named data source · an option with its own caveat · a prose-only shared stimulus |
| **optional** | Which archetype fills a slot · the context · the numbers |

**The point of the `tendency` row.** A14 lands on exactly 3 items in all four
reference forms. That is striking — and n = 4. Making it law would bake a
coincidence into 25 forms. It is recorded as a tendency to reproduce *in
aggregate*, and individual forms are free to carry 2 or 4.

---

## 0b. The KAR position

Stated once, in `scripts/est-blueprint.mjs` `KAR_CALIBRATION`, and enforced:

- **The published bands are the generation target.** PUBLISHER-AUTHORITATIVE (T1):
  Knowledge 35–45%, Application 45–55%, Reasoning 5–15%.
- **Our item-level classification is an imperfect measurement** (T4). We measured
  Knowledge at 14% against a published 35–45%.
- **The measurement is not used as a generation constraint.** The validator fails
  if that flag is flipped.
- **Where the published specification and our measurement disagree, the
  specification wins**, and the disagreement is recorded rather than resolved by
  quietly moving the specification to fit what we measured. The likeliest
  explanation is that our Knowledge bar is set too high; the corpus contains no
  publisher-classified exemplar of any band, so there is nothing to calibrate
  against.
- **No form may claim to hit the published KAR bands** until artifact 7 §6's
  rubric has been applied by two independent passes that agree. The validator
  fails if that claim is enabled.

---

## 0c. Two retained budgets the platform cannot yet render

`nts` (not-to-scale figures) and `objectOptions` (graphical answer choices) are
**PRODUCT / RENDERING CAPABILITY GAPS, not exam-design exclusions**. Their
budgets stay in this blueprint — 1–4 and 1–2 respectively — and the validator
fails if either floor is zeroed or either gap is reclassified as an exclusion.

Requirements: [R1 — figure renderer](R1-figure-renderer-requirements.md),
[R2 — answer-choice schema](R2-answer-choice-schema.md).

**The interim rule is absolute:** author these items in full, including their
figure or choice specification. Never substitute a to-scale diagram for a
schematic one, never label a to-scale diagram "not drawn to scale", and never
fake a graphical option set as prose.

---

## 1. What a generation run produces

One **form**: 50 four-option multiple-choice items, one section, 75 minutes.
Nothing else — no modules, no grid-ins, no reference sheet of our own (the
published one is what the student has).

A **series** is the set of forms generated together. Series-level constraints
(§7) exist because 25 forms that are individually authentic can still be
collectively repetitive, and repetition across forms is what a student actually
notices.

---

## 2. Order of operations

The steps are ordered so that the expensive judgement happens last and the
cheap constraints cannot be violated by it.

1. **Take the slot plan** (§4). It fixes family, domain, demand band, set
   membership and required devices for all 50 positions.
2. **Assign an archetype to each slot** from its family's inventory
   (artifact 2 §3), honouring the anti-repetition rules (§7).
3. **Choose a context** for each item (artifact 5 §2), honouring context
   anti-repetition.
4. **Author the stem**, in register (artifact 5 §1, §3, §4).
5. **Solve it. Get the key.**
6. **Build the option set** by artifact 4 §5's procedure — including the
   mandatory D1 distractor on any derived-target item.
7. **Order the options by magnitude and read off the key letter.** Never choose
   the letter.
8. **Run the per-item gates** (artifact 7). Rewrite, do not patch.
9. **Run the form gates** (artifact 8), including key balance. Fix a key
   imbalance by re-choosing an item's numbers, never by shuffling its options.

Step 7 before step 9 is the important ordering. It is why key balance is a
*form-level repair by renumbering*, not an item-level choice.

---

## 3. The quotas

### Domains — published bands, hard

| Domain | Published | Blueprint | Items |
|---|---|---|---|
| Foundational Algebra | 27–32% | 30% | 15 |
| Data Analysis and Probability | 27–32% | 32% | 16 |
| Advanced Algebra and Functions | 27–32% | 28% | 14 |
| **Geometry and Trigonometry** | **8–13%** | **10%** | **5** |

### Families — default draw, with the observed per-form range

A generated form may move off the default but never outside the range. The
ranges are what the four reference forms actually did.

| Family | Domain | Observed range | Blueprint |
|---|---|---|---|
| A01 Linear equations & solving | FA | 1–4 | 3 |
| A02 Modelling: build the expression | FA | 0–3 | 2 |
| A03 Systems of equations | FA | 1–3 | 2 |
| A04 Inequalities | FA | 2–3 | 3 |
| A05 Lines in the plane | FA | 1–4 | 3 |
| A12 Proportional reasoning: rate & cost | FA | 1–4 | 1 |
| A18 Number properties & logic | FA | 1–2 | 1 |
| A13 Data: read a display | DAP | 6–10 | 8 |
| A14 Statistics: summarise a data set | DAP | **3–3** | 3 |
| A15 Probability & counting | DAP | 1–4 | 3 |
| A12b Percentages: share of a population | DAP | 1–4 | 2 |
| A06 Quadratics & parabolas | AAF | 2–5 | 3 |
| A07 Polynomials & factoring | AAF | 2–3 | 3 |
| A08 Rational expressions & functions | AAF | 2–3 | 2 |
| A09 Functions: composition & evaluation | AAF | 2–3 | 3 |
| A10 Exponents, radicals & complex | AAF | 1–4 | 2 |
| A11 Growth & variation | AAF | 1–2 | 1 |
| A16 Geometry: angles & triangles | GT | 1–3 | 3 |
| A17 Geometry: circles, area & solids | GT | 1–4 | 2 |

A12 and A12b are one corpus family split across two domains; together they must
total **2–6**, which the validator checks separately.

### Demand bands

| Band | Demand score | Per form | Blueprint |
|---|---|---|---|
| Entry | 1–2 | 8–12 | 12 |
| Core | 3–5 | 26–32 | 28 |
| Stretch | 6–7 | 6–10 | 7 |
| Peak | 8–9 | 1–3 | 3 |

### Device budgets

| Device | Per form | Blueprint |
|---|---|---|
| Items in a shared-stimulus set | 8–12 | 10 |
| Derived target | 6–12 | 9 |
| Requires a formula off the reference sheet | 2–5 | 4 |
| "Figure not drawn to scale" | 1–4 | 2 |
| Boundary / strictness discrimination | 1–3 | 2 |
| Integer constraint | 1–3 | 2 |
| Roman-numeral multi-statement | **exactly 1** | 1 |
| Options are objects, not values | 1–2 | 1 |
| Rare-tail stimulus type | 1–2 | 1 |
| Four options each needing a computation | 0–2 | 1 |

---

## 4. The slot plan

Generated from `scripts/est-blueprint.mjs`. Every row's family, domain, demand
band, set membership and device list is checked by the validator.

<!-- SLOT-TABLE:BEGIN — generated, do not hand-edit -->
| Q | Family | Domain | Demand | Set | Required devices |
|---|---|---|---|---|---|
| 1 | A01 Linear equations & solving | FA | entry | — | — |
| 2 | A12b Percentages: share of a population | DAP | entry | — | — |
| 3 | A02 Modelling: build the expression | FA | entry | — | — |
| 4 | A06 Quadratics & parabolas | AAF | core | — | — |
| 5 | A05 Lines in the plane | FA | core | — | — |
| 6 | A13 Data: read a display | DAP | entry | S1 | `rareStimulus` |
| 7 | A13 Data: read a display | DAP | core | S1 | — |
| 8 | A13 Data: read a display | DAP | core | S1 | — |
| 9 | A10 Exponents, radicals & complex | AAF | stretch | — | — |
| 10 | A16 Geometry: angles & triangles | GT | core | — | `nts` |
| 11 | A04 Inequalities | FA | core | — | `boundary` |
| 12 | A07 Polynomials & factoring | AAF | stretch | — | `derived` |
| 13 | A01 Linear equations & solving | FA | entry | — | — |
| 14 | A17 Geometry: circles, area & solids | GT | core | — | — |
| 15 | A09 Functions: composition & evaluation | AAF | core | — | — |
| 16 | A03 Systems of equations | FA | stretch | — | `derived` |
| 17 | A14 Statistics: summarise a data set | DAP | entry | — | — |
| 18 | A08 Rational expressions & functions | AAF | core | — | — |
| 19 | A13 Data: read a display | DAP | core | S2 | — |
| 20 | A13 Data: read a display | DAP | core | S2 | `derived` |
| 21 | A05 Lines in the plane | FA | core | — | `offsheet` |
| 22 | A06 Quadratics & parabolas | AAF | entry | — | — |
| 23 | A12 Proportional reasoning: rate & cost | FA | core | — | `integer` |
| 24 | A18 Number properties & logic | FA | stretch | — | `roman` |
| 25 | A10 Exponents, radicals & complex | AAF | core | — | `offsheet` |
| 26 | A15 Probability & counting | DAP | core | — | — |
| 27 | A16 Geometry: angles & triangles | GT | entry | — | — |
| 28 | A06 Quadratics & parabolas | AAF | peak | — | `derived` `offsheet` |
| 29 | A13 Data: read a display | DAP | core | S3 | — |
| 30 | A13 Data: read a display | DAP | core | S3 | — |
| 31 | A14 Statistics: summarise a data set | DAP | core | S3 | — |
| 32 | A04 Inequalities | FA | entry | — | — |
| 33 | A07 Polynomials & factoring | AAF | core | — | — |
| 34 | A11 Growth & variation | AAF | core | — | — |
| 35 | A16 Geometry: angles & triangles | GT | peak | — | `nts` `derived` |
| 36 | A03 Systems of equations | FA | core | — | `derived` |
| 37 | A09 Functions: composition & evaluation | AAF | entry | — | — |
| 38 | A12b Percentages: share of a population | DAP | core | — | — |
| 39 | A05 Lines in the plane | FA | stretch | — | `offsheet` `derived` |
| 40 | A08 Rational expressions & functions | AAF | core | — | — |
| 41 | A15 Probability & counting | DAP | stretch | — | `derived` |
| 42 | A02 Modelling: build the expression | FA | core | — | — |
| 43 | A14 Statistics: summarise a data set | DAP | core | S4 | — |
| 44 | A13 Data: read a display | DAP | core | S4 | `fourWay` |
| 45 | A17 Geometry: circles, area & solids | GT | entry | — | — |
| 46 | A04 Inequalities | FA | stretch | — | `boundary` `derived` `integer` |
| 47 | A09 Functions: composition & evaluation | AAF | core | — | `objectOptions` |
| 48 | A15 Probability & counting | DAP | peak | — | — |
| 49 | A07 Polynomials & factoring | AAF | core | — | — |
| 50 | A01 Linear equations & solving | FA | entry | — | — |
<!-- SLOT-TABLE:END -->

**Shared-stimulus sets in this plan:** S1 = Q6–8 (3 items, rare-tail stimulus),
S2 = Q19–20 (2), S3 = Q29–31 (3), S4 = Q43–44 (2). First set starts at Q6
(rule: by Q10); last set starts at Q43 (rule: after Q39).

---

## 5. Placement rules the plan encodes

**On-ramp, then flat.** Q1–8 carries 4 entry items, no peak item and at most one
stretch item. From Q9 the form does not order itself: the blocks Q11–20,
Q21–30, Q31–40 and Q41–50 each mix all bands. **A generated form must not climb.**
Artifact 3 §4 has the measurement behind this.

**Every 10-item block** carries at least 2 entry items, at least one
stretch-or-peak item, and at most one peak item.

**Peaks are isolated.** No two adjacent, none in the on-ramp, and **the last item
is never a peak** — no reference form ends on its hardest item.

**Hard items are layered, not deep.** Every peak stacks at least two devices,
with at most one exception per form built on step count alone (Q48 here). This is
the rule that keeps difficulty inside syllabus.

**Geometry is never adjacent to geometry.** Q10, Q27, Q35, Q45 and Q14 in this
plan — five items, minimum gap of four.

**No family appears twice in a row** outside a shared set.

---

## 6. Instantiating a slot

Each slot names a family, not an item. Turning it into an item:

1. **Pick an archetype** from the family's inventory (artifact 2 §3) that
   satisfies §7's anti-repetition rules and can carry the slot's required
   devices. If no archetype in the family can carry them, the slot's device list
   is wrong — fix the plan, do not force the item.
2. **Pick a context** (artifact 5 §2). Ordinary commerce, school, civic life;
   given names only, weighted Arabic and Levantine; regional or anonymised
   geography; no distressing subject matter.
3. **Choose numbers** that are calculator-tractable but not artificially round
   (artifact 5 §3), and that make the intended distractors land on clean,
   distinguishable values.
4. **Write the stem** in register: roughly a third of a form's stems in the
   colon form rather than as a question; `d`/`m` for lines; abscissa/ordinate
   where the corpus would use them.
5. **Build the options** by artifact 4 §5, in the mandated order: derived-target
   partner first, near-neighbour concept second, sign grid if one exists, then
   structure-specific classes, at most one arithmetic slip.
6. **Attach the stimulus** if the slot is in a set or needs one, following
   artifact 5 §5's chart conventions and the repo's `figure-system.css` grammar.

### Where the demand score comes from

```
demand = steps                       (1..5)
       + 2  derived target
       + 1  off-sheet formula
       + 1  representation mismatch
       + 1  boundary discrimination
       + 1  multi-branch
       + 1  interpreted (not merely read) stimulus
```

An authored item is scored on this and must land in its slot's band. An item that
scores outside its band is re-authored, not re-labelled.

---

## 7. Anti-repetition

Three scopes, tightening outwards.

### Within one form — hard

- **No archetype twice.** Two of the four reference forms achieve 50 distinct
  archetypes in 50 items; that is the bar, and it is the single clearest signal
  of authored rather than generated work.
- **No context twice.** No two items in a form share a scenario — not two
  shopping items, not two salary items.
- **No named person twice.**
- **No stimulus type more than three times.**

### Between adjacent forms in a series — hard

- **At most 4 archetypes carried over.** The corpus's forms share only 7 of 191
  archetypes *in total across four forms*; 4 between adjacent forms is already
  generous.
- **No context carried over at all.**
- **No shared-stimulus set structure repeated** — if form *n* uses a grouped bar
  chart for its three-item set, form *n+1* does not.

### Across the whole series — hard

- **No archetype used more than 3 times** across the series.
- **No context used more than twice.**
- **Number reuse:** no two items anywhere in the series share their full
  numeric parameter set. A student working through 25 forms will notice a
  repeated question faster than any other defect.

**Why these are hard and not soft.** The single most damaging failure mode for a
25-form series is not an inauthentic item — it is a student recognising a
question they have already done, because that destroys the diagnostic value of
every score the platform reports. Artifact 8 gates all three scopes.

---

## 8. Answer keys

**A deliberate departure from measured DNA, recorded as such.**

The reference forms' keys are close to random with a consistent A deficit
(9, 9, 9, 10 out of 50 — artifact 1 §8), and they contain runs of four and five.

Generated forms use **11–14 of each letter with a maximum run of 3.** That is
tighter than any reference form. The reason is fairness, not fidelity: copying
the A deficit would make A a marginally worse guess for a student who guesses,
for no benefit.

**The key is still never chosen.** Options are ordered by magnitude and the
letter falls out. A form that comes out imbalanced is fixed by **renumbering an
item** so its answer sorts differently — never by shuffling options, which
destroys the sign grids, the Roman-numeral ladders and the ascending series that
the corpus's option sets are built on.

---

## 9. What the blueprint deliberately does not fix

Recorded so that later work does not mistake silence for a decision.

- **Which archetype fills which slot.** That is a per-form choice constrained by
  §7, not a fixed assignment. Two forms built from this same plan should not have
  the same item at Q12.
- **The KAR mix.** The published bands are the target (artifact 1 §4), but our
  KAR classification is Tier 4 and is not used as a generation constraint. It
  becomes one when artifact 7's rubric has been applied by two independent
  passes that agree.
- **Item statistics.** Nothing here is calibrated against student performance,
  because the corpus contains none. Once generated forms have been sat by real
  students, the demand bands should be checked against observed p-values and
  this blueprint revised. **Until then, no generated form may be described to a
  student as being of a known difficulty.**
- **Score conversion.** The corpus contains no conversion table. A generated form
  can report a raw score out of 50; it **cannot** report an EST-scaled score out
  of 800 without inventing the scale.
