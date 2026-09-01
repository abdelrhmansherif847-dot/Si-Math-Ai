# Stage 1.5 — Robustness pass on the six Stage-1 findings

**STATUS: DESIGN/VALIDATION — STAGE 2 NOT APPROVED**

> Stage 1.5 addresses the six findings surfaced by
> [14-stage-1-validation.md](14-stage-1-validation.md). It does not change the
> exam blueprint, does not replace the demand score, does not alter the
> difficulty bands, does not touch ESTM1-2026-A, and generates no forms. The
> composition layer in §8 is a **design proposal only** — no part of it is
> implemented.

Date: 2026-09-01. Branch: `claude/mock-exam-enhancement-nnwb48`.

---

## 0. The methodological correction, stated first

Stage 1 reported "20/20 load-bearing" for each primitive and that number was
read more strongly than it deserved. **The 20 items in a primitive share a
skeleton, so on the 14 forensic dimensions they are one observation, not 20.**

Every table below therefore reports two units:

- **item level** — 160 generated items, which is what a paper is built from;
- **structural level** — the sub-form or archetype, which is what a *student*
  can learn to recognise, and the unit any claim about mechanism coverage has
  to be made in.

Where the two disagree, the structural number is the one that means something.

---

## 1. Finding 1 — P-DECOY's key-0 allowlist

**Resolved. The waiver is gone, and it was gone by removing the dependency, not
by relaxing the rule.**

### Why the name was structurally necessary

The Stage-1 realisation is an expression whose numerator's coefficients cancel
exactly, over a heavy radical denominator. The decoy *is* the denominator, and
"the denominator is irrelevant" is true exactly when the numerator vanishes.
Give the numerator any non-zero value and the denominator becomes load-bearing
— at which point the item is no longer a decoy item at all. **Within that
sub-form the key of 0 is forced by the mathematics.**

### Whether the 20-item set was artificially dependent on it

**Yes.** P-DECOY had exactly one sub-form, so all 20 items came from the one
construct and all 20 keyed 0. The allowlist was excusing a primitive that had
only one way to make a question.

### Alternative realisations

One was found and built: **`shared_terms_cancel`**. Two functions share their
quadratic and constant terms and differ only in the linear term; the difference
at a point is asked. The shared part is supplied, looks essential, and cancels.
The key varies with the coefficients.

It also demonstrates the anti-bypass rule doing its job: evaluating both
functions and subtracting **reaches the key** and is not a bypass, because it
costs 8 against the insight's 2. What the mechanism buys is not correctness but
the difference between two operations and eight — and the printed distractors
(each function's value alone, and the difference taken backwards) catch the
students who take the long road and slip on it.

### What replaced the waiver

The variety gate now runs **per sub-form**, and a sub-form whose key is forced
may declare it — at a price:

```js
constantKey: { value: '0', maxPerForm: 1,
  reason: 'the decoy is the denominator, and only a vanishing numerator makes a denominator irrelevant' },
```

The declaration is an obligation, not an excuse: it caps the sub-form at one
item per form, which the blueprint must honour. A primitive whose every
sub-form declares a constant key fails outright. Mutation-tested: deleting the
declaration fails 2 checks; adding one to a sub-form whose key actually varies
also fails.

---

## 2. Finding 2 — P-NAMED-CONFIG species diversity

**Resolved, and this was the most important one.**

Stage 1 shipped **one** configuration: right angle at Q, 45° at P, a leg given,
the hypotenuse asked. The primitive worked; the species did not. "Naming
determines structure" is not demonstrated by an item whose structure never
changes.

### What now varies

The **transformation itself** — which ratio, in which direction, between which
two roles — on top of which vertices carry the two named angles:

| axis | values |
|---|---|
| angle | 30° · 45° · 60° |
| right-angle vertex | P · Q · R, stated as `m∠PQR = 90°` so the middle letter locates it |
| named-angle vertex | either remaining vertex |
| given role | hypotenuse · adjacent leg · opposite leg |
| asked role | any other role |

The structural archetype is `θ : givenRole → askedRole`, and it fixes the
mathematics exactly. The right angle is no longer stated as "the right angle is
at Q" but as a three-letter angle name, so **both** angle positions must be read
out of the naming.

### Measured, 20 fresh draws

| metric | Stage 1 | Stage 1.5 |
|---|---|---|
| distinct structural archetypes | **1** | **10** |
| maximum archetype repetition | 20 | 4 |
| archetype × naming combinations | 1 | 16 |
| distinct stems | 8 / 20 | **20 / 20** |
| distinct keys | 8 / 20 | **20 / 20** |
| most-repeated question | 6× | 1× |

### A mathematical finding that fell out of it

45° items were initially refused by the generator, and correctly: in an
isosceles right triangle **the two legs are interchangeable, so reading the
right angle at the wrong vertex produces the same answer.** The species' own
error is invisible there. Rather than ship a 45° item with an undetectable
misreading, a second error family was added — *applying the other special
triangle's ratio* — which survives the symmetry. The `natural` flag now follows
whichever misreading a given configuration actually supports, and never sits on
an error whose answer is just the number already in the stem.

---

## 3. Finding 3 — si_prefix signposting

**Resolved.**

The stem ended `... with $I$ in amperes, what is the resistance $R$, in ohms?`
— which names the conversion the item exists to test. It now reads:

> A component carries a current of 20 mA when the potential difference across it
> is 11 volts. Using $R = V/I$, what is the resistance $R$, in ohms?

Blind checks on the redesigned carrier:

- **Is the conversion still necessary?** Yes. The answer is asked in ohms, and
  an ohm is a volt per ampere. Nothing else supplies the requirement.
- **Is the item still unambiguous?** Yes. 11 V and 20 mA determine one
  resistance; 0.55 is right only in kΩ, which is not what is asked.
- **Does the mechanism still bite?** Yes. The un-converted answer is printed and
  wrong, which is the load-bearing test, and it is now the *natural* route
  rather than one the stem warns against.

Blind-coded consequence: `hidden_step` 1 → 2 and opacity 0 → 1, moving the
sub-form from RLx 8 (the lowest in the Stage-1 set, below the reference Entry
band) to RLx 10.

---

## 4. Finding 4 — P-CONVERSION distractor magnitude

**Resolved, and the rule is about error paths rather than proximity.**

Two changes to the items:

1. **The wrong-direction distractor is gone from the divide carriers.**
   Multiplying where you should divide lands k² from the key — four decades out
   on the 25 km carrier. It is a real error, but an option nobody reads past,
   and it is what stretched the printed set. It is replaced by *charging the
   joining fee once per period*: the same kind of mistake (the model misapplied,
   not the arithmetic slipped) and it stays on the page.
2. **`axis_scale`'s factor is 12, not 100** — "records its output in dozens"
   rather than "in hundreds", which is both a smaller factor and the more
   natural phrasing.

Measured option spread (max ÷ min printed value):

| carrier | Stage 1 | Stage 1.5 |
|---|---|---|
| rate_denominator | 250× | **10.6×** |
| period_index | 122× | **5.2×** |
| axis_scale | 73× | **8.7×** |
| si_prefix | ~300,000× | **1000×, declared** |

### The declared exception

`si_prefix` keeps a wide set because **every option is the answer produced by
dividing the current by a different power of ten** — reading mA as the base
unit, as centi, as deci. That is a scale ladder, every rung is a named error,
and a conversion item is allowed to have options that differ in scale because
scale is the quantity it tests. The item declares it:

```js
optionArchitecture: { kind: 'scale-ladder', base: 10,
  reason: 'every option is the answer a named prefix error yields, so the options differ in scale by construction — which is the quantity the item tests' },
```

The old set reached for a near-miss (half the conversion factor — nobody makes
that error) purely to satisfy an anti-estimation guard. That is exactly the
arbitrary proximity the finding warned against, and it is gone.

### The QA assertion (validator check 10)

Two clauses, in this order:

- **(a) every printed option must be the answer some enumerated route
  produces.** No option is arbitrary.
- **(b) magnitude alone must not identify the key** — some distractor within a
  factor of three — *unless* the item declares an option architecture saying
  why scale is what is under test, in which case every option must sit an exact
  power of the declared base from the key.

Clause (a) found real defects across four primitives that had nothing to do with
conversion: **20 printed options that no enumerated route reached.** P-SCOPE
printed the morning-group count and the within-residual complement while its
route list pointed at a value that was never printed; P-COMBINATION, P-NORMALISE,
P-CLASSIFY and P-DECOY each built a sign-slip distractor and never wrote down
the slip. Every one was diagnosable — the route list was simply incomplete.
Seven routes were added. `assess()` already required that a mechanism-*blind*
route land on a printed option; this is the converse, and it was the half that
was missing.

Clause (b) also caught three P-NORMALISE items where P(b/a) lands near zero
while P(b) is large, leaving the key as the only small value among three big
ones. The anti-estimation guard P-CONVERSION had carried since Stage 1 is now
on that primitive too.

---

## 5. Finding 5 — trap-cost saturation

**Partially resolved. The capability is demonstrated and gated; the
comparability to the reference corpus is not established, and the residual
saturation turns out to be structural.**

### The three levels, read off the route model

`trapLevel(item)` grades one thing — what the natural first move costs:

| level | meaning |
|---|---|
| **0** | no meaningful trap: nothing a student would naturally do lands on a printed wrong answer |
| **1** | natural, low cost: the natural move lands wrong, but cheaply — less work than the correct route |
| **2** | genuine high cost: the natural move lands wrong *after* at least as much work as the correct route |

This is not a second difficulty score. It is descriptive, it grades one thing,
and nothing manufactures a trap to fill a quota — a primitive with no natural
trap reports 0.

### Measured distribution

| | level 0 | level 1 | level 2 |
|---|---|---|---|
| all 160 items | 8 (5%) | 80 (50%) | 72 (45%) |

| primitive | 0 | 1 | 2 |
|---|---|---|---|
| P-CONVERSION · P-NORMALISE · P-SCOPE · P-UNSTATED-MODEL | 0 | 20 | 0 |
| P-DECOY | 8 | 0 | 12 |
| P-CLASSIFY · P-COMBINATION · P-NAMED-CONFIG | 0 | 0 | 20 |

The generator spans all three levels. P-DECOY spans two by itself, because
`shared_terms_cancel`'s natural route reaches the key. Validator check 11 sets
a **ceiling, not a target**: at least two levels must appear, and level 2 may
not exceed 80% of the set. A single primitive at 100% level 2 is legitimate —
P-CLASSIFY is, because the reflex technique genuinely costs as much as the
correct one.

### What is NOT resolved, and why

On the instrument used for the n=200 study — my own 0/1/2 judgement — the
Stage-1.5 set still codes `trap_cost = 2` in **95% of items and 93% of
sub-forms**, against **60%** in the reference corpus. That gap has not closed,
and the route model is a *different, more precise instrument* that cannot be
applied to the reference corpus at all, because published items do not come with
route enumerations and inferring them is exactly the judgement that drifts.

The reason the gap will not close at primitive level is structural, and worth
stating plainly:

> **The load-bearing gate mandates a trap.** `assess()` requires that some
> mechanism-blind route land on a printed distractor. Every item that passes
> therefore has an attractive printed trap on some wrong route, by construction.
> The reference corpus's trap-free 40% are largely *routine* items carrying no
> target mechanism at all.

A paper that matches the reference distribution therefore needs both kinds:
mechanism-bearing items from these primitives, mixed with routine items that
carry no mechanism. **That mixing is a blueprint decision and belongs to Stage
2.** No change at primitive level can produce it without weakening the
load-bearing criterion, which is not a trade worth making.

---

## 6. Finding 6 — multiconcept / repr_switch / approaches at zero

**Unresolved by design, and correctly so.** §8 is the proposal; nothing is
implemented.

| dimension (bites, =2) | reference | ESTM1-A | Stage 1 | Stage 1.5 items | Stage 1.5 sub-forms |
|---|---|---|---|---|---|
| `repr_switch` | 20% | 32% | **0%** | **12%** | 7% |
| `multiconcept` | 17% | 14% | **0%** | **0%** | **0%** |
| `approaches` | 6% | 0% | **0%** | **0%** | **0%** |

`repr_switch` moved off zero as a side effect of finding 2: reading a geometric
configuration out of vertex naming *is* a representation switch, and it became
load-bearing once the configuration varied. `multiconcept` and `approaches`
have not moved and will not move without composition — a single primitive
produces a single mechanism, so its closing step integrates one earlier result,
and `assertInteraction` correctly refuses to call that interaction.

---

## 7. Fresh validation results

160 items, 8 primitives × 20, seed 91001, rendered stem-and-options-only,
shuffled, and coded on the same 14-dimension frame. **Every key in the changed
families was recomputed by hand and all are correct.** The blind grouping was
again a 1:1 relabelling of the sealed one.

### Item level and structural level

| primitive | items | load-bearing | mean RLx | sub-forms | archetypes | sub-form RLx |
|---|---|---|---|---|---|---|
| P-CLASSIFY | 20 | 20/20 | 18.0 | 1 | 1 | 18 |
| P-COMBINATION | 20 | 20/20 | 16.4 | 2 | 2 | 15–18 |
| P-CONVERSION | 20 | 20/20 | 11.1 | 4 | 4 | 10–12 |
| P-DECOY | 20 | 20/20 | 13.6 | 2 | 2 | 13–14 |
| P-NAMED-CONFIG | 20 | 20/20 | 15.3 | 1 | **10** | 15 |
| P-NORMALISE | 20 | 20/20 | 15.0 | 2 | 2 | 15 |
| P-SCOPE | 20 | 20/20 | 12.0 | 1 | 1 | 12 |
| P-UNSTATED-MODEL | 20 | 20/20 | 18.0 | 1 | 1 | 18 |

**160 items resolve to 14 sub-forms and 23 archetypes.** Item-level mean RLx
14.92; structural-level mean 14.07 (n = 14). Reference corpus 13.01;
ESTM1-2026-A re-coded at the same standard 10.96.

Sub-form bands: Entry 1, Core 4, Stretch 6, Peak 3.

### Structural diversity

| primitive | archetypes (max repetition) | distinct stems | distinct keys |
|---|---|---|---|
| P-NAMED-CONFIG | **10** (4) | 20/20 | 20/20 |
| P-CONVERSION | 4 (10) | 20/20 | 19/20 |
| P-COMBINATION | 2 (11) | 20/20 | 20/20 |
| P-NORMALISE | 2 (14) | 20/20 | 20/20 |
| P-DECOY | 2 (12) | 20/20 | 8/20 |
| P-SCOPE | 1 (20) | 18/20 | 17/20 |
| P-CLASSIFY | 1 (20) | 20/20 | 12/20 |
| P-UNSTATED-MODEL | 1 (20) | 19/20 | 2/20 |

P-DECOY's 8 distinct keys and P-UNSTATED-MODEL's 2 are both explained above and
both bounded: the collapse sub-form declares its forced key with a one-per-form
cap, and a prose-selection target has four possible keys in total.

### Distractor plausibility

- **Every printed option across all 160 items is reached by an enumerated
  route** (check 10a). It was not true before this pass — 20 were not.
- **158 of 160 items have a distractor within a factor of three of the key.**
  The 2 that do not are `si_prefix` items with a declared scale ladder.
- Option spread on the three linear conversion carriers fell from 73–250× to
  5–11×.

### Mechanism profile, structural level

| dimension (bites) | reference | ESTM1-A | Stage 1 | Stage 1.5 |
|---|---|---|---|---|
| hidden_step | 31% | 16% | 85% | 100% |
| nonobvious_rel | 11% | 8% | 50% | 50% |
| abstraction | 22% | 14% | 28% | 29% |
| inference | 13% | 8% | 25% | 14% |
| competing_interp | 14% | 2% | 16% | 14% |
| filtering | 16% | 12% | 12% | 14% |
| reversal | 8% | 6% | 12% | 7% |
| repr_switch | 20% | 32% | 0% | 7% |
| multiconcept | 17% | 14% | 0% | 0% |
| approaches | 6% | 0% | 0% | 0% |

`hidden_step` at 100% is itself worth flagging as over-representation against a
reference of 31% — every primitive was built to carry an unstated step. Like
trap saturation, it is a property of a *bank of mechanism-bearing items*, not
of a paper, and it is the blueprint's job to dilute it.

---

## 8. Design proposal — the composition layer

**Design only. Not implemented, not scheduled.**

### 8.1 What composition has to mean

Two primitives compose when one's output is the other's input (**serial**), or
both feed a common closing step (**parallel**). The reason to want it is narrow
and specific: `multiconcept` bites only when the closing step integrates two
earlier results, which is what `assertInteraction` already tests and what a
single primitive structurally cannot supply.

### 8.2 The obligation that does not come for free

**Load-bearing does not compose.** Two mechanisms that each bite alone can
produce a composed item in which one is decoration — because the other's
resolution incidentally resolves it. The layer's central new obligation is a
**per-mechanism counterfactual**: withholding A alone must change the key or
the determinacy, and likewise B alone. Withholding both is not a test.

### 8.3 Why the option format caps composition at two

The composed route set is the **product** of the parents' route sets, not the
union. Two mechanisms with one insight and one blind route each give four
combinations, of which three are blind: `a₁b₀`, `a₀b₁`, `a₁b₁` — one error,
the other error, both errors. Those are exactly three distractors, and a
four-option item has exactly three slots.

**A three-mechanism composition would need seven distractors and cannot be
printed.** The 4-option format is therefore a hard cap at pairs, and any
"triple composition" is really a pair with one mechanism demoted to decoration.

### 8.4 Five composition patterns

Abstract structural descriptions. None is a rewritten reference question.

**C1 · Conversion → Combination** (serial, value-carrying)
A quantity must be converted before entering a system whose individual unknowns
are undetermined but whose combination is determined. *Load-bearing test:* the
un-converted value's combination must be printed and wrong; the un-combined
intermediate must also be printed. *Risk:* the option set becomes a 2×2 error
grid, which is authentic only if the fourth cell (both errors) is also printed —
an incomplete grid lets a student back out the key by pattern.

**C2 · Classification → Normalisation** (serial, method-selecting)
The classification gate decides *which* normalisation applies; the normalisation
must then be performed. *Load-bearing test:* misclassifying leads to a different
normalisation whose output is printed, and correct classification with a botched
normalisation is printed separately. *Risk:* if the two classification branches
happen to yield the same value, the gate is decoration — the per-mechanism
counterfactual must show the branch outputs differ.

**C3 · Named configuration → Unstated model** (serial, representation → relation)
The configuration is read from naming; a relation that is nowhere stated (a
similarity, a conservation, a rate identity) must then be supplied to finish.
This is the pattern that would make `repr_switch` and `inference` bite in one
item. *Load-bearing test:* mixed counterfactual kinds — `value` for the
configuration half, `determinacy` for the relation half. *Risk:* two
indeterminacies compound into a genuinely ambiguous item; the guard is that
exactly one option survives under the correct configuration *and* the correct
relation.

**C4 · Decoy ⊗ Scope** (parallel, both feeding one target)
A supplied quantity is irrelevant *and* the relevant quantity's referent is
ambiguous. Both must be resolved; neither alone suffices. This is the pattern
that makes `multiconcept` bite, because the closing step integrates two
independently resolved facts. *Risk: the highest of the five.* If the decoy is
only irrelevant under the correct scope reading, then resolving scope resolves
the decoy for free and the composition silently collapses to one mechanism. The
guard is explicit: **the decoy must be inert under both readings.** (P-SCOPE is
also still unscheduled pending the `competing_interp` gate, so C4 cannot be
first.)

**C5 · Conversion ⊗ Named configuration** — *the cautionary pattern.*
A configuration read from naming, with a length supplied in a unit that must
convert before the ratio applies. Two independent preconditions, both required,
touching different parts of the item — which makes it the cheapest to build and
the least likely to create a bypass, **and also not a composition at all**.
`assertInteraction` refuses it: the closing step integrates one earlier result,
not two. It is stacking. It is included here precisely because it is what an
unguarded composition layer would produce, and what the interaction rule exists
to reject.

### 8.5 What the layer must preserve, and how

| obligation | mechanism |
|---|---|
| mathematical validity | exact rationals throughout; the composed key computed once, never reconciled from parts |
| load-bearing status | per-mechanism counterfactuals (§8.2) — the one genuinely new requirement |
| anti-bypass | `assess()` applied to the **product** route set: no blind combination may reach the key at cost ≤ the insight combination's |
| distractor integrity | the 2×2 error grid must be complete and every cell route-reached (validator check 10a, unchanged) |
| representation coherence | at most one representation switch per composed item, or it stops testing mathematics and starts testing bookkeeping |
| anti-clone | the composed fingerprint chain is the concatenation of the parents'; composed skeletons register as their own sub-forms, and `chain AND target` is computed on the composed chain, never on either parent's |

### 8.6 Is composition currently possible?

**Almost.** Three of the four pieces already exist:

- `assertInteraction` enforces the DAG property and would accept or reject a
  composed chain unchanged;
- `assess()` takes a route list and would work on a product route list
  unchanged;
- the fingerprint concatenates chains naturally.

**One implementation change is required**: `item.counterfactual` is a single
object (`scripts/est-primitives.mjs:153`). It must become a list keyed by
mechanism before §8.2 can be enforced. That is the whole blocker, and it is
small — which is the argument for doing it deliberately in Stage 2 rather than
opportunistically now.

---

## 9. Files changed

| file | change |
|---|---|
| `scripts/est-primitives.mjs` | P-DECOY split into two sub-forms (`decoyCollapse`, `decoyShared`); `constantKey` declaration; P-NAMED-CONFIG rewritten over a configuration space with the `TRIG`/`factor` table and a wrong-triangle error family; si_prefix de-signposted and given a decade ladder; `axis_scale` factor 100 → 12; the divide carriers' wrong-direction distractor replaced; seven missing routes enumerated; anti-estimation guard added to `normNonMonic`; `trapLevel()` added |
| `scripts/validate-est-primitives.mjs` | variety gate rescoped to sub-forms with declared constant keys; P-DECOY architecture check made form-aware; **check 10** (option magnitude and error-path coverage); **check 11** (trap saturation ceiling) |
| `tests/est-primitives.test.mjs` | P-DECOY test rewritten to cover both sub-forms; P-SCOPE mutant test rewritten to record a real limit of the generic gate |
| `tests/est-fingerprint.test.mjs` | axis-mutation tests pinned to same-sub-form pairs |
| `docs/engineering/est-generation/15-stage-1.5-robustness.md` | this document |
| `docs/engineering/est-generation/README.md` | index row |

Not changed: the blueprint, the demand score, the difficulty bands,
ESTM1-2026-A (md5 `38926f22b7869608f310d0a8e21bb55e`), the reference
fingerprint table.

### Gates added, each mutation-tested

| gate | reverting it produces |
|---|---|
| constant-key declaration | 2 failures on P-DECOY/coefficients_sum_zero |
| enumerated-route coverage | 6 failures across P-COMBINATION |
| ladder declaration | 7 failures on P-CONVERSION |
| ladder rung exactness | 7 failures on P-CONVERSION |
| trap saturation ceiling | 154/160 at full cost — fails |

---

## 10. CI

`node tests/run-all.mjs` → **68/68 green**. No existing gate removed or
weakened; two checks added inside the existing `validate-est-primitives` gate.
`est-primitives.test.mjs` went from 123 to **254 assertions**;
`est-fingerprint.test.mjs` from 59 to **61**.

---

## 11. Commit

Recorded on the commit that carries this document — see the Stage-1.5 report in
the session transcript for the hash.
