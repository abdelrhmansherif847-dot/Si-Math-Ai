# Primitive Coverage Revision

**STATUS: PRIMITIVE COVERAGE REVISION — P3 NOT YET GENERATED**

Stage 3.5 was accepted as a calibration result and classified its own remainder:
the dominant failure was **primitive coverage**, not blueprint calibration. This
pass measures that gap against the 200 reference items, closes the parts of it
that the measurement names, fixes the confirmed `P-COMBINATION` defect, and
states whether the library now justifies a third prototype.

No prototype was generated. `ESTM2-2026-P2` is untouched and still frozen at
sha256 `ae55f23c…`; `ESTM2-2026-P1` and `ESTM1-2026-A` are untouched.

No exam content is in this document or this repository.

---

## 1. The measured coverage gaps

### 1.1 The yardstick, and why it is not a matter of taste

Artifact 2 §3 names the archetype of every one of the 200 coded reference items.
Extracted mechanically, that is **189 distinct mathematical objects across 18
families**, and artifact 1 §9 measured the per-form consequence: **49, 49, 50 and
50 distinct archetypes in 50 items.** A real EST form asks each object once.

That vocabulary is now `scripts/est-objects.mjs`, and every generator construct
is mapped into it. Coverage is therefore counted, not asserted.

### 1.2 What was missing, measured

| gap | reference | generator before | deficit |
|---|---|---|---|
| objects the library can produce | 189 | **68 (36.0%)** | 121 |
| items asking for something other than a value | **29%** (58/200) | **11%** of constructs, 90% of a form asked for a value | ~18pp |
| interpretation-targeted constructs | 3 items | **0** | all |
| equation-targeted constructs | 7 items | **0** | all |
| expression-targeted constructs | 17 items | **1** | 16 |
| Roman-numeral subset constructs | 3 items, and the blueprint requires **exactly one per form** | **0** | the requirement had never once been meetable |
| distinct objects in a 50-item form | 49–50 | 48, with the remainder theorem asked twice and its composed variant a third time | the five AI-feel findings |

### 1.3 The per-family table, after the revision

| family | ref objects | ref items | slots | generator objects | non-value objects | non-value placed |
| A01 | 10 | 11 | 3 | 4 | 0 | 0 |
| A02 | 4 | 7 | 2 | 4 | 3 | 1 |
| A03 | 7 | 7 | 2 | 5 | 2 | 1 |
| A04 | 9 | 11 | 3 | 6 | 1 | 0 |
| A05 | 10 | 12 | 3 | 6 | 2 | 0 |
| A06 | 15 | 16 | 3 | 6 | 1 | 0 |
| A07 | 9 | 10 | 3 | 4 | 1 | 1 |
| A08 | 9 | 9 | 2 | 4 | 2 | 1 |
| A09 | 11 | 11 | 3 | 5 | 0 | 0 |
| A10 | 11 | 11 | 2 | 4 | 2 | 1 |
| A11 | 7 | 7 | 1 | 2 | 0 | 0 |
| A12 | 13 | 13 | 3 | 10 | 0 | 0 |
| A13 | 29 | 30 | 8 | 23 | 2 | 1 |
| A14 | 12 | 12 | 3 | 15 | 0 | 1 |
| A15 | 9 | 9 | 3 | 6 | 0 | 0 |
| A16 | 9 | 9 | 3 | 3 | 1 | 1 |
| A17 | 9 | 9 | 2 | 5 | 1 | 1 |
| A18 | 6 | 6 | 1 | 4 | 2 | 1 |
| **total** | **189** | **200** | **50** | **116** | **20** | **10** |

Reading it: no family is short of objects for its slots any more (the ceiling
that broke assembly), and `A01`, `A09`, `A11`, `A12` and `A15` still hold no
non-value construct at all — 13 of the 50 slots. That is where the residual
value-share gap lives, and §9 says so rather than hiding it.

---

## 2. Root causes

Four, and only the first is what "insufficient coverage" usually means.

**R1 — the library was built from the difficulty model, not from the corpus.**
Every Stage-1 primitive exists because a MECHANISM was found load-bearing in the
reference. Nothing was ever built because a KIND OF QUESTION was found there.
That is why 89% of constructs asked for a value while the corpus asks for one in
71% of items: a mechanism has a value at the end of it.

**R2 — the blueprint required something the library could not build.**
`SPECIAL_FORMS.roman: [1, 1]` has demanded exactly one Roman-numeral item per
form since artifact 6. No construct could produce one, and no gate noticed,
because the special-form budgets are checked against a form and the form never
had one to check.

**R3 — the shared-stimulus machinery locked eight slots to one question shape.**
Every A13 slot sat inside a set, a set is built from READERS of one generated
display, and a reader that makes its own display cannot serve one. The three
reference archetypes that do exactly that — parameter interpretation,
qualitative claim evaluation, axis comprehension, 6 of the corpus's 30 A13 items
— had nowhere to go.

**R4 — repetition was policed in the wrong unit.** Anti-clone compares
fingerprints, the content detector compares surfaces, and `maxPerSubForm` counts
sub-forms. Three remainder-theorem items from three sub-forms with three
fingerprints and three option grids passed all three checks. The unit that
matters is the mathematical object, and nothing counted it.

**A fifth, found while fixing R1:** the Stage-3.5 signatures admitted only
**183 of the 200 reference items**. Seventeen real EST questions suited no band,
so anything built in their shape was unplaceable — which is how the gap surfaced:
the new interpretation primitives coded exactly like their reference analogues
and were then admissible nowhere.

---

## 3. New and modified primitives

### 3.1 Three new primitives, seven sub-forms — all non-value

`scripts/est-interpret.mjs`.

| primitive | sub-form | target | object | reference analogue |
|---|---|---|---|---|
| **P-INTERPRET** | `parameter_meaning` | interpretation | `parameter-interpret-rate` | T1 Q5 (RLx 12, Core) |
| | `axes_comprehension` | selection:claim | `graph-comprehension-axes` | T1 Q29 (RLx 6, **Entry**) |
| | `claim_from_display` | — | — | **withdrawn**, see §3.4 |
| **P-SUBSET** | `roman_properties` | selection:roman-subset | `roman-numeral-properties` | T4 Q41 (RLx 13) |
| | `roman_conditions` | selection:roman-subset | `roman-numeral-sign-reasoning` | T3 Q7 (RLx 18, Peak) |
| **P-SELECT-OBJECT** | `which_equation` | equation | `perpendicular-parameters-composite` | T2 Q5 (RLx 8, **Entry**) |
| | `which_system` | selection:object | `infinite-solutions-identify` | T3 Q29 (RLx 15) |

Two things about this table are load-bearing.

**Each is coded as the corpus codes its own analogue.** The first version gave
every one of them three or four biting mechanisms and they all landed in Peak.
The corpus does not put them there: T1 Q29 is "zero computation, reads the axes
against four claims" and codes RLx 6; T2 Q5 codes RLx 8. Coding them heavier
would have raised the difficulty distribution while claiming to fix variety, and
this pass was explicitly told not to maximise difficulty. They now span **Entry
through Peak**, as their analogues do.

**The Roman-numeral option grid is built so it cannot leak.** T3 Q7's note is the
design constraint: "option set leaks: I appears in 3 of 4 options so I is
probably true; real work collapses to statement II". The grid here puts each
statement in exactly two of the four options, so no statement can be inferred
from the grid.

### 3.2 Six non-value routine constructs

Because seven new primitives spread over seven families each compete with the
value constructs already in that family — adding them alone moved a form from
90% value to 82%, and twelve families still held an unused non-value construct.
The reference spreads non-value across nearly every family (A02's four
archetypes are **all** expression or selection), so these do too:
`equivalent-exponent-expression`, `equivalent-rational-expression`,
`rearrange-literal-formula`, `absolute-value-interval`, `point-inside-a-circle`,
`equation-from-its-roots`.

### 3.3 Four new readers of a shared display

Two claim readers (`bar-claim`, `list-claim`) so a set slot need not ask for a
number, and two median readers (`bar-median`, `table-median`) so no display kind
is one-deep in A14 — a kind with a single A14 reader was a single point of
failure, and two seeds lost both slots of a set to it.

### 3.4 One construct withdrawn, and the rule it illustrates

`P-INTERPRET/claim_from_display` was written before the claim READER and is the
same question: same context, chain, target, option kind, distractor family and
narrative. The anti-clone check refused whichever came second, which cost a slot
on every seed. The reader is the more useful of the two because it can fill a
set slot, so the standalone is no longer offered. The function remains in the
file as the record of a construct that did not earn its place.

**A new sub-form counts as coverage only when it is not already in the library
under another name.** Nothing in this pass is a renamed variable, a changed
constant, a reordered option set or an equivalent algebraic form.

### 3.5 Two signature routes, so the rules admit the corpus

Core gains "a trap with five or more mechanisms in play"; Stretch gains "two
biting with four in play". Measured on the 200 reference items:

| | admitted |
|---|---|
| Stage 3.5, as shipped | 183 / 200 (92%) |
| + the Core route | 194 / 200 (97%) |
| + the Stretch route | **197 / 200 (98%)** |

**The routine stream is unaffected**, which is the check that matters: a routine
item has `present <= 2`, so both new routes refuse it and it stays Entry-only.
The Stage-3.5 boundary is widened toward the corpus, not back toward the defect
it fixed.

### 3.6 Capacity counted in the unit the rule polices

`capacityOf()` now counts distinct OBJECTS per family, not structures.
P-NAMED-CONFIG offers fourteen structures that are one object — the special
right triangle — so the matching believed a three-slot family had three
named-configuration structures available, assigned two, and the object gate then
refused the second at emission. Slots went unfilled on three of ten seeds.

---

## 4. Capacity, before and after

| | before | after |
|---|---:|---:|
| constructs (pool + readers) | 108 | **120** |
| distinct mathematical objects in the pool | 81 | **90** |
| reference vocabulary covered | 68 / 189 (36.0%) | **77 / 189 (40.7%)** |
| families with no mechanism sub-form | 4 | **1** (A11) |
| families short of objects for their slots | 2 | **0** |
| seeds filling 50/50 with every gate passing | 5 of 6 | **10 of 10** |

Seventeen constructs were added and coverage rose by nine objects: five of the
new constructs produce an object the library already covered from another
family, and three produce something the reference vocabulary does not name. Both
are counted honestly rather than as coverage.

---

## 5. Mathematical-object diversity, before and after

The rule, read off the corpus: at most one object may appear twice in a form,
and none may appear three times (`OBJECT_RULES`, from 49/49/50/50).

| | ESTM2-2026-P2 | after |
|---|---|---|
| distinct objects in 50 items | 48 | **49–50** across 10 seeds |
| objects repeated | 2 (`special-triangle-45`, `remainder-theorem`) | **0–1** |
| enforcement | none — three remainder-theorem items passed every check | rejected **at emission**, and reported by `verify()` |

P2's three remainder-theorem items read as two here plus its composed variant,
which the vocabulary names separately. Either way the form asked one theorem
three times and nothing saw it.

Six mutation classes in `tests/est-form-gates.test.mjs` §10, each verified
non-vacuous by disabling the rule and watching the suite go red.

---

## 6. Value-targeted share, before and after

| | reference | before | after |
|---|---|---|---|
| non-value share of the construct pool | — | 11% | **22%** |
| value share of an assembled form | **64–76%** (T1 64, T2 68, T3 76, T4 76) | **90%** | **80%** |
| distinct target kinds in a form | 4–5 | 5 | 5–6 |
| interpretation-targeted constructs | 3 items | 0 | 1 |
| equation-targeted constructs | 7 items | 0 | 1 |
| Roman-numeral constructs | 3 items | 0 | 2 |

**80% is still above the reference's 64–76%.** It sits exactly on the gate's
ceiling, which was set at 0.80 with headroom at Stage 3.5, so the gate passes and
the reference range does not. That is stated here rather than resolved by moving
the threshold. §9 says what closing it needs.

---

## 7. The `P-COMBINATION/sum-difference` defect, exactly

The target is `m(u+w) + n·v`. When `m === n` it factors:

```
    m(u+w) + m·v  =  m(u + v + w)  =  m·A
```

readable off the **first relation alone**. The second relation is decoration and
the block combination the item exists to require is not required. Measured
incidence: **90 of 817 candidates, 11%**. One shipped in `ESTM2-2026-P2` as its
Q36.

Six stages of review missed it because `assess()`'s anti-bypass check compares
only ENUMERATED routes, and nobody had enumerated this one.

**The fix is in two parts, and the second is the structural one.**

1. The degenerate parameterisation is rejected at construction.
2. The collapse is **enumerated as a route on every sum-difference item**, healthy
   or not. Its value equals the key only in the degenerate case, so in a healthy
   item it is just another wrong route — and in a degenerate one it is a cost-1
   blind route onto the key, which `assess()` refuses as a bypass.

Part 2 is what makes this structural rather than an allowlist: the check that
catches it lives in the general contract, so a future sibling primitive
reintroducing the same shape is caught by the same rule.

**The regression test asserts both parts independently**
(`tests/est-primitives.test.mjs`), and each was verified to bite:

| mutation | result |
|---|---|
| remove the construction guard, keep the route | 90 degenerate candidates get built; `assess()` refuses **all 90** (727/817 load-bearing) |
| remove the route, keep the guard | the structural assertion fails |
| both in place | 100 rejected at construction, 727 built, **727/727 load-bearing** |

---

## 8. Regression and mutation results

```
node tests/run-all.mjs                74 / 74 green
```

| suite | checks | result |
|---|---:|---|
| `est-primitives` | 261 | pass — +7 for the sum-difference regression |
| `est-fingerprint` | 64 | pass |
| `est-compose` | 39 | pass |
| `est-blueprint-gates` | 37 | pass |
| `est-assembly-gates` | 40 | pass |
| `est-form-gates` | **69** | pass — +11 for object diversity |
| `validate-est-assembly` | 5 seeds × 50/50 | pass |
| `validate-est-blueprint` | 50 slots, 4 sets, all budgets | pass |

**No Stage-3.5 gain regressed.** Verified item by item:

| Stage-3.5 gain | still holds? |
|---|---|
| Entry/Core boundary — routine items are Entry-only | yes; both new signature routes require `present >= 4`, a routine item has ≤2 |
| band calibration | Entry 17–18, Core 13–14, Stretch 8, Peak 10–12 (plan 13/11/12/14) |
| form-level key balance | 11–14 per letter, longest run 2–5, on every seed |
| content-level reuse protection | zero collisions on 10 seeds |
| load-bearing mechanism requirements | `assess()` unchanged and now catches one more defect class |
| routine items remain genuinely routine | `assessRoutine()` unchanged; no routine construct was made harder |
| no exact or distinctive content reuse | enforced at emission, unchanged |
| existing QA / mutation coverage | 74/74, and every new gate mutation-tested |

**Difficulty was not maximised.** Mean band composition moved from 17/14/9/10 to
17.5/13.5/8/11 — Peak rose by about one item and Core fell by about half of one,
against a plan of 13/11/12/14. Stretch is the band still short, at 8 against 12.

---

## 9. P3 readiness verdict

### 9.1 What is now sufficient

- **50/50 on 10 of 10 seeds** with every gate passing, against 5 of 6 before.
- **Object diversity is enforced** in the unit the corpus measures, and the
  repetition class behind five of the nine Stage-3.5 second-reader defects
  (D2, D3, D4, D6, D7) is closed at emission rather than reported afterwards.
- **The confirmed correctness defect is fixed**, structurally, with a regression
  test proven to bite twice over.
- **The signatures admit 98% of the reference**, up from 92%.
- **Every family now has enough objects for its slots.**

### 9.2 What is not

| criterion | target | measured | short by |
|---|---|---|---|
| value-targeted share | 64–76% | **80%** | 4pp |
| Stretch band | ~12 of 50 | **8** | 4 items |
| reference vocabulary covered | — | 40.7% | 112 objects |
| families with no non-value construct | 0 | **5** (A01, A09, A11, A12, A15 — 13 slots) | 5 |

The value share and the Stretch band are the same gap seen twice: five families
holding 13 slots can only produce value-targeted items, and the mechanism stream
still reaches Stretch through only a few families.

### 9.3 Verdict

**P3 IS JUSTIFIED — but as a measurement, not as a candidate for scaling.**

The case for generating it: every defect Stage 3.5 named as fixable in this pass
is fixed and measured, the assembly is stable across ten seeds where it was
stable across five, and the two residual gaps are both **quantified, bounded and
in the same direction** — the form is 4pp too value-heavy and 4 items short in
one band. Neither is the kind of failure that makes a blind review
uninterpretable, which is what would make a prototype a waste.

The case against scaling on it: 40.7% of the reference vocabulary is a library
that will repeat itself across 25 forms even while each individual form passes
its object gate. Series-level diversity is a different measurement from
per-form diversity and **this pass did not make it**.

So the recommendation is: **generate P3 and blind-review it, then decide.** Do
not treat a passing P3 as approval to scale — the series question needs its own
evidence, and the honest next measurement after P3 is how many distinct forms
this library can produce before objects start recurring across forms.

### 9.4 If P3 is authorised, the work is named

1. non-value constructs for A01, A09, A11, A12, A15 — the 13 slots that can only
   ask for a value;
2. mechanism reach into the families that still cannot produce a Stretch item;
3. a real per-construct step count, retiring the fingerprint-chain proxy
   (artifact 19 §5.2, still open);
4. a series-level object ledger — how often an object may recur ACROSS forms,
   which the corpus answers (7 of 191 archetypes appear in more than one form)
   and nothing in the generator measures.

**Stop here.** No P3 was generated in this pass. No form is published, none is
exposed to students, and Forms 2–25 are not generated.

---

## Artefacts

| what | where |
|---|---|
| the reference object vocabulary, and coverage | `scripts/est-objects.mjs` |
| the three non-value primitives | `scripts/est-interpret.mjs` |
| the sum-difference fix | `scripts/est-primitives.mjs` |
| six non-value routine constructs, four new readers | `scripts/est-routine.mjs` |
| two signature routes | `scripts/est-signatures.mjs` |
| object capacity and the emission-time object gate | `scripts/est-assemble.mjs` |
| the standalone display slot | `scripts/est-blueprint.mjs` |
| object-diversity mutations | `tests/est-form-gates.test.mjs` §10 |
| the sum-difference regression | `tests/est-primitives.test.mjs` |

Committed as `110b8fa`.
