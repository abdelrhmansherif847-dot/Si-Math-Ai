# Stage 2 — The revised difficulty-aware blueprint

**STATUS: IMPLEMENTED BLUEPRINT — PROTOTYPE NOT YET GENERATED**

> Stage 2 replaces step-count-driven difficulty placement with the evidence-based
> Entry / Core / Stretch / Peak signatures, implements the composition layer,
> wires the anti-clone fingerprint into form emission, and proves the constraint
> system consistent by constructing a witness. No exam is generated, nothing is
> published, ESTM1-2026-A is untouched, and no backend or database behaviour
> changes.

Date: 2026-09-01. Branch: `claude/mock-exam-enhancement-nnwb48`.

---

## 0. The finding that dominates this stage

**53% of the 200 coded reference items have an Entry profile** — at most one
mechanism biting, and none of them a reasoning-core mechanism. **71% have an
Entry-or-Core profile.** The Stage-1/1.5 primitive library produces **none** of
them, and the dry run confirms it: no primitive can fill an Entry slot, and the
whole library can contribute **at most 14 items to a 50-question form** without
a structural repeat.

This is the trap-saturation finding one level up, with the same shape and the
same resolution. A bank of mechanism-bearing items is not a paper. Most of a
real form is routine work, and routine items have to come from routine
generation — not from a mechanism primitive persuaded to act gentle, which would
mean weakening `assess()`.

Stage 2 therefore does two separable things and reports them separately:

- **it proves the constraint system is consistent** — a 50-slot assignment
  satisfying every quota exists, and the dry run constructs one;
- **it does not close the coverage gap**, and says exactly how large the gap is.

---

## 1. Old vs new difficulty placement

| | old | new |
|---|---|---|
| placement | `DEMAND_BANDS`: an additive 1–9 score, mostly step count | four signatures, each a conjunction of admission properties |
| what a band is | a threshold on a sum | a set of required and allowed cognitive properties |
| shares per form | Entry 8–12, Core 26–32, Stretch 6–10, **Peak 1–3** | Entry 6–16, Core 6–19, Stretch 8–16, **Peak 11–24** |
| role of `steps` | the primary driver | **time budget only** |
| status of the old code | — | **kept, not deleted** — `DEMAND_BANDS` is still exported, and the gate asserts it |

Step count was demoted because the n=200 study measured what it is worth:
r(steps, RLx) = +0.413 raw, **partial r = +0.036** after the reasoning
mechanisms, **ΔR² = 0.000**. Across the four observed bands mean step count
moves from 2.78 to 3.79 — **one step separates Entry from Peak.**

The old Peak share of 1–3 items per form was the sharpest error the additive
score produced. The reference corpus, banded by RLx with the measured +4.00
per-form coder-drift correction applied to T1 and T2, is **32% Peak**.

---

## 2. The final signatures

Four properties, none of them a total: `present` (mechanisms appearing at all),
`biting` (appearing at full strength), `core` (of the four reasoning-core
mechanisms — hidden_step, inference, multiconcept, nonobvious_rel — how many
bite), and `trap` (0/1/2 from the Stage-1.5 route model).

| band | signature | composition |
|---|---|---|
| **Entry** | `biting ≤ 1`, `core = 0`, `present ≤ 5` | forbidden |
| **Core** | `biting ≤ 2`, `core ≤ 1`, `1 ≤ present ≤ 7`, `trap ≥ 1` | forbidden |
| **Stretch** | `1 ≤ biting ≤ 3`, `core ≤ 2`, `present ≥ 2`, `trap ≥ 1` | allowed |
| **Peak** | `biting ≥ 2`, `core ≥ 1`, `present ≥ 4`, `trap ≥ 1` | allowed |

**No band requires every mechanism, and no band requires any named one.** 24% of
real Peak items bite neither hidden_step nor inference, so requiring either
would have excluded a quarter of the observed band.

`core` is the sharpest discriminator the corpus offers:

| | Entry | Core | Stretch | Peak |
|---|---|---|---|---|
| items biting ≥1 reasoning-core mechanism | **0%** | 2% | 40% | **86%** |
| mechanisms present, median | 3 | 3 | 4 | 6 |
| mechanisms biting, median | 0 | 0 | 1 | 3 |
| trap_cost = 2 | 16% | 60% | 71% | 76% |

**Faithfulness, measured.** The Peak signature admits **81% of observed Peak
items and 0% of Entry or Core**; Entry admits 100% of Entry and 3% of Peak. The
signature is deliberately narrower than the observed Peak band — it requires a
reasoning-core mechanism, which 14% of real Peak items do without — so generated
Peak items sit in the modal Peak profile rather than its tail. That is a design
choice, stated rather than hidden.

**It is not a classifier.** An earlier attempt fitted a decision rule to
reproduce the RLx band (60% exact, 90% within one) and was discarded:
reproducing an additive score by other means is the thing Stage 2 was told not
to build. The bands overlap on purpose, and the form-level quotas fix the mix.

---

## 3. Form-level trap handling

Trap saturation is solved at assembly, and `assess()` is not weakened. Because
it requires a mechanism-blind route to land on a printed distractor, every item
that passes has a trap by construction — so a trap-free item must come from
routine generation, and the blueprint has to permit and budget one.

**`trap_cost` is drift-immune** — its blind re-code shift was **+0.05**, against
+0.405 on the judgement dimensions — so all four reference forms count:

| | T1 | T2 | T3 | T4 | pooled | blueprint range |
|---|---|---|---|---|---|---|
| level 0 (routine) | 8 | 0 | 0 | 2 | 5% | **0–8** |
| level 1 (cheap trap) | 15 | 7 | 21 | 27 | 35% | **7–27** |
| level 2 (full cost) | 27 | 43 | 29 | 21 | 60% | **21–43** |

### A correction to the Stage-1.5 report

Stage 1.5 said the reference's "trap-free 40% are largely routine items". **That
was wrong.** The 40% is `trap_cost < 2`, which is mostly level 1 — cheap traps,
not absent ones. Genuinely trap-free items are **5%**.

The correction cuts the other way than expected. The Stage-1.5 generated set,
graded by the route model, was **5% / 50% / 45%** — inside every reference range,
and matching the reference's trap-free share exactly. **The generator was not
saturated.** The 95%-vs-60% gap reported in Stage 1.5 came from my own blind
coding of generated items running harsher than my coding of reference items, on
a dimension the drift study shows is otherwise stable.

Only Entry admits a trap-0 item, so the interaction is real and the feasibility
check tests it: every trap-0 item must be an Entry item.

---

## 4. Composition

Implemented in `scripts/est-compose.mjs`, with one working pattern.

**The obligation that does not come free.** Load-bearing does not compose: two
mechanisms that each bite alone can produce an item in which one is decoration.
So `counterfactual` became a **per-mechanism structure**, and each mechanism must
be shown to carry weight on its own. The shape lives in `est-primitives.mjs` so
`assess()` and `assessComposed()` read one implementation; the plural form is a
strictly higher bar than the singular, never a way round it.

**Depth is capped at two by the page, not by taste.** The composed route set is
the *product* of the parents', so two mechanisms give exactly three
mechanism-blind combinations — A's error, B's error, both — and a four-option
item has exactly three distractor slots. Depth three needs seven and cannot be
printed.

**C2 · classification → normalisation** is built. The classification gate fixes
a parameter; that parameter is a coefficient of the polynomial whose remainder
the normalisation gate asks for. The closing step consumes **both** the
classified parameter and the normalised root, which is what makes it composition
rather than two questions printed together. The 2×2 error grid falls out of the
mathematics:

| | root normalised (b/A) | root left un-normalised (b) |
|---|---|---|
| parameter right | **KEY** | grid.b |
| parameter wrong | grid.a | grid.ab |

Each per-mechanism counterfactual is that mechanism's own error cell: taking the
reflex route on one gate while getting the other right lands exactly there.
243 of 400 seeds produce a valid item; three were verified by hand.

`assertInteraction` rejects stacking. **C5 (conversion ⊗ named configuration) is
recorded in the table as `disallowed`** rather than quietly omitted — it is what
an unguarded layer would build, and its closing step integrates one earlier
result, not two.

Tests demonstrate all five required cases plus the distinction that matters:

| demonstration | result |
|---|---|
| valid interacting pair | accepted |
| non-interacting pair (stacking) | rejected, reason names it as stacking |
| bypass route | rejected; a **longer** valid route is not a bypass |
| inert mechanism | rejected, and it names **which** mechanism |
| malformed counterfactual (4 shapes) | rejected |
| one counterfactual for two mechanisms | rejected, names the unproven one |
| incomplete or unprinted error grid | rejected |
| depth three, two representation switches | rejected |

---

## 5. Mechanism distribution rules

Targets are counts of items per 50-item form in which the mechanism **bites**.
`range` spans all four reference forms; `anchor` is T3+T4 only — the two coded at
the current standard, and the trustworthy figure, because every mechanism here
is a judgement dimension and T1/T2 run ~0.4 low on those.

| mechanism | range | anchor | ESTM1-A | note |
|---|---|---|---|---|
| hidden_step | 13–17 | 16–17 | 8 | strongest, most stable |
| repr_switch | 6–14 | 12–14 | 16 | the one ESTM1-A **over**-produced |
| abstraction | 8–14 | 8–11 | 7 | |
| inference | 2–10 | 9–10 | 4 | |
| filtering | 5–12 | 5–12 | 6 | |
| competing_interp | 5–8 | 8 | 1 | **gated** — sign flips across forms; P-SCOPE stays unscheduled |
| multiconcept | 5–14 | 7–8 | 7 | needs composition |
| nonobvious_rel | 3–11 | 3–5 | 4 | |
| reversal | 0–6 | 4–6 | 3 | |

The targets are **ranges, not maxima to hit**. `competing_interp` keeps its
Stage-0 gate: its evidence status has not changed and Stage 2 does not pretend
it has.

---

## 6. Diversity and anti-clone

The Stage-1 fingerprint is now wired into form emission, and doing that found a
real defect in it.

**The fingerprint could not see direction.** `apply-ratio-adj-to-hyp` and
`apply-ratio-opp-to-adj` share nine of eleven tokens, and a token-set comparison
cannot tell a transformation from its reverse. So P-NAMED-CONFIG's ten Stage-1.5
archetypes were invisible to anti-clone. Every structural axis is now a **single
token** (`adj2hyp`, `hyp2adj`), and the ctx, options, narrative and numeric axes
carry the configuration too.

**It still flags two P-NAMED-CONFIG items as a repeat — and that is correct.**
The ten archetypes are ten transformations *within one archetype family*, not ten
independent question types. A real form's three geometry items are a ratio
question, an angle chase and a similar-triangles question; ours would be three
draws from one family. The fingerprint's granularity is the one that governs
assembly, and it says so.

**Measured capacity: 14.** One item per sub-form, so the library can contribute
at most 14 items to a form without a structural repeat.

Diversity ceilings: 2 per archetype, 3 per sub-form, 8 per primitive, 18 distinct
archetypes minimum. Reference fingerprints remain fingerprints only — the
content-leak checks from Stage 1.5 are unchanged and still green.

---

## 7. Dry-run results

`node scripts/est-dry-run.mjs` (`--full` for every slot). It reports what it
could not do as prominently as what it could.

### Part A — what real generated items filled

**10 of 50 slots.** The other 40 are reported, not skipped:

| reason | slots |
|---|---|
| no primitive serves this family | 30 |
| no candidate of the required band survived the slot rules | 10 |

**Family → bands the library can actually serve.** This is why a fixed
difficulty ramp fails: band and family are not independent. A first attempt
assigned bands on a ramp and filled 8 of 50, because P-CLASSIFY only ever
produces a Peak profile and an Entry slot carrying family A01 can never be
filled. Band assignment is now **solved against capability**.

| family | bands servable | | family | bands servable |
|---|---|---|---|---|
| A01 | Peak | | A10 | Core, Stretch, Peak |
| A03 | Stretch, Peak | | A12 | Core, Stretch, Peak |
| A05 | Stretch, Peak | | A12b | Core, Stretch |
| A07 | Core, Stretch, Peak | | A16 | Stretch, Peak |
| A09 | **(none)** | | A18 | Peak |
| every other family | **(none)** | | | |

| metric | filled subset (n=10) |
|---|---|
| domain | FA 5, DAP 1, AAF 3, GT 1 — not balanced, and cannot be: 8 DAP slots are data displays |
| KAR | **not asserted** — `claimAllowed: false`, unchanged by Stage 2 |
| bands | Entry 0, Core 3, Stretch 3, Peak 4 |
| trap | level 0: 0, level 1: 5, level 2: 5 |
| composition | 1 (range 2–6) |
| representation switch | 1 at full strength |
| stimulus | **0** — no primitive emits one, so every shared-stimulus set is unserved |
| archetype diversity | 10 distinct across 10 items, max repetition 1 |
| anti-clone collisions | **0** |
| time budget | 13.2 min for 10 items against a 15.0 min pro-rata allowance |
| hidden-step species | 8 distinct across the 10 items whose hidden_step bites |

`A09` serves nothing: `P-DECOY/shared_terms_cancel` has trap level 0 *and* bites
a reasoning-core mechanism, and **0 of the corpus's 10 trap-free items bite a
reasoning-core mechanism**. The signature refusing it is the corpus speaking,
not a hole in the rules — recorded as an assertion so it cannot drift.

### Part B — is the constraint system consistent?

A different question, asked with an idealised supply, and answered by
**constructing a witness** rather than asserting:

```
witness bands: Entry 9, Core 12, Stretch 13, Peak 16  (= 50)
witness traps: level 0 → 2, level 1 → 20, level 2 → 28  (= 50)
witness composed: 3
every trap-0 item must be an Entry item — no other signature admits one: 2 ≤ 9
mechanism minima need 47 bitings, of which 23 reasoning-core;
the band mix supplies at most 184 and 102.
VERDICT: CONSISTENT
```

The interactions checked are the ones that could have failed: trap-0 confined to
Entry, composition confined to Stretch and Peak, per-band biting ceilings against
the mechanism minima, and no single mechanism's floor exceeding the slots that
can carry it.

**Verdict.** The constraint system is consistent. The current library fills 10 of
50. Stage 2 does not close that gap and does not claim to.

---

## 8. Mutation-test results

Every gate broken one way at a time (`tests/est-blueprint-gates.test.mjs`, 37
assertions). A baseline healthy form passes first, so each mutation has something
to break.

| mutation class | result |
|---|---|
| too many Peak items (32) | rejected — `band Peak outside 11..24` |
| too few Peak items (10) | rejected |
| a required mechanism starved (`hidden_step` = 2) | rejected — names the mechanism |
| no mechanism supplied at all | rejected |
| trap saturation (0/2/48) | rejected |
| no real traps (30/15/5) | rejected |
| one archetype used five times | rejected — names the archetype |
| structural clones inside the form | rejected |
| composition floor missed (0) / ceiling breached (12) | both rejected |
| impossible domain distribution (FA 40) | rejected |

Plus the signature and composition mutations: Entry refusing any reasoning-core
mechanism however few bite, Peak refusing an item with none however loaded, both
refusing a composed item, and the closing step of a composed item ceasing to
integrate both results.

KAR is **deliberately not asserted** — a gate pretending to check it would be the
vacuous kind. The tests assert instead that `claimAllowed` is still false.

One assertion in the first draft of this suite was a tautology
(`X === false || !X === false`) and was replaced with a measurement of which
sub-forms no band admits.

---

## 9. Files changed

| file | change |
|---|---|
| `scripts/est-signatures.mjs` | **new** — the four signatures, band shares, trap mix, mechanism targets, composition limits, diversity ceilings, time budget, routine stream |
| `scripts/est-compose.mjs` | **new** — per-mechanism counterfactuals, `assessComposed`, `compose`, the composable table with C5 recorded as disallowed, and the C2 builder |
| `scripts/est-dry-run.mjs` | **new** — capability-solved band assignment, the fill, the witnessed feasibility check, the 13-metric report |
| `scripts/validate-est-signatures.mjs` | **new** — the CI gate, auto-discovered |
| `tests/est-compose.test.mjs` | **new** — 39 assertions, the five required demonstrations |
| `tests/est-blueprint-gates.test.mjs` | **new** — 37 assertions, the seven mutation classes |
| `scripts/est-primitives.mjs` | `counterfactualsOf` / `checkCounterfactual` extracted so `assess()` reads either shape; P-NAMED-CONFIG fingerprint parts now encode the archetype |
| `docs/engineering/est-generation/16-stage-2-blueprint.md` | this document |
| `docs/engineering/est-generation/README.md` | index row |

Not changed: `est-blueprint.mjs` (the demand score is **kept**, as required),
ESTM1-2026-A (md5 `38926f22b7869608f310d0a8e21bb55e`), the reference fingerprint
table, any backend or database behaviour.

---

## 10. CI

`node tests/run-all.mjs` → **71/71 green**. 68 pre-existing checks, none removed
or weakened; three added (`est-compose`, `est-blueprint-gates`,
`validate-est-signatures`).

---

## 11. What Stage 3 would need

Not a request — the record of what the dry run proved is missing, so the next
approval is an informed one.

1. **A routine-item stream.** 53% of a real form has an Entry profile and the
   library produces none. This is the binding constraint, not the families.
2. **Nine unserved families**, chiefly the 8 data-display slots (A13) and the
   statistics, probability and circle families.
3. **Stimulus emission.** No primitive emits one, so every shared-stimulus set
   is unfillable.
4. **More sub-forms.** Anti-clone caps the library's contribution at one item per
   sub-form — 14 today.
5. **A second composition pattern.** Only C2 is built, and it serves one family,
   which is why the dry run places 1 composed item against a floor of 2.

---

## 12. Commit

`docs/engineering/est-generation/16-stage-2-blueprint.md` is carried by the
Stage-2 commit; the hash is recorded in the follow-up commit that amends this
line, and in the Stage-2 report.
