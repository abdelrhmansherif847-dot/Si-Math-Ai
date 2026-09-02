# Stage 3 — One revised EST prototype, and its blind forensic review

**STATUS: PROTOTYPE REVIEW — NOT APPROVED FOR SERIES GENERATION**

> One prototype was generated from the Stage-2 blueprint and the Stage-2.5
> assembler, frozen, put through mechanical QA, blind-coded on the same
> 14-dimension frame as the 200 reference items, and read item by item. It is
> DRAFT — INTERNAL REVIEW ONLY. Nothing is published, no student sees it,
> ESTM1-2026-A is untouched (md5 `38926f22b7869608f310d0a8e21bb55e`), and no QA
> gate was relaxed to let it pass.
>
> **Recommendation: REVISE BLUEPRINT.** The prototype fails five of the ten
> acceptance criteria, and the failures share one cause.

Date: 2026-09-02. Branch: `claude/mock-exam-enhancement-nnwb48`.

---

## 1. Prototype identity

| | |
|---|---|
| form id | `ESTM2-2026-P1` |
| status | DRAFT — INTERNAL REVIEW ONLY |
| seed | `4100` |
| blueprint version | Stage-2 signatures + Stage-2.5 assembler |
| sha256 | `f626d91683d85428b25987a5e0d5925d297c371f42865f58d4078de90b6d1edf` |
| items | 50 MCQ, 4 options each |
| answer key | `BBADCDCADBDBAAAABADAAAAABABBABBBBBABBABCABBBABDDAC` |
| streams | routine 33, mechanism 14, composed 3 |
| stimulus sets | 4 (bar-chart ×2, table, data-list), 10 slots |

**The payload is not in this repository.** It is exam content and the repository
is public; it is frozen alongside ESTM1-2026-A in the session's working store,
with the hash, key and per-item fingerprints recorded above and in
`identity.json`. Nothing was regenerated after review began.

---

## 2. Mechanical QA

All 50 keys were **recomputed by hand** from the rendered stem before any
automated check ran. **All 50 are correct.** No mathematical defect, no
duplicate option value, no unrouted distractor, no bypass among the mechanism
items, no anti-clone collision, no security or markup issue, no stimulus-set
violation, domains all in band, timing 88% of the 75-minute allowance.

**Nine failures, all in one class:**

| class | n | detail |
|---|---|---|
| KEY-BALANCE | 4 | A 19, B 20, C 4, D 7 — against `KEY_RULES.perLetter` of 11–14 |
| KEY-RUN | 5 | runs of 4 and 5 identical keys at Q16, Q23, Q24, Q33, Q34 — against `maxRun` 3 |

**Cause: the assembler never balances the key.** `layout()` shuffles each item's
options independently, which gives a binomial spread, not a balanced key. This
is an **assembly problem**, it is not a QA gate that was relaxed — `KEY_RULES`
has existed since the original blueprint and nothing checked it at form level.

Three further "failures" in the first QA run were bugs in my own harness, not in
the prototype, and were fixed there: a delimiter regex that matched any stem
containing mathematics (34 false hits), a placeholder check that flagged the
ordinary word "undefined", and a rule requiring every stem to end in a question
mark, which a legitimate imperative stem ("Simplify …") does not.

Repository CI: **73/73 green.** Mutation suites: 254 / 62 / 39 / 37 / 41, all
passing.

---

## 3. Blind forensic results

Coded from stem, options and stimulus data only. The generator's band, mechanism
map, routes and trap level were not consulted while coding.

| set | n | mean RLx | sd | Entry | Core | Stretch | Peak |
|---|---|---|---|---|---|---|---|
| reference T3+T4 (current standard) | 100 | **13.01** | 4.13 | 25% | 23% | 24% | 28% |
| reference n=200, drift-corrected | 200 | **13.55** | 3.81 | 18% | 24% | 26% | 32% |
| ESTM1-2026-A re-coded | 50 | 10.96 | 3.99 | 42% | 26% | 18% | 14% |
| **ESTM2-2026-P1 prototype** | 50 | **10.30** | 4.68 | **58%** | **10%** | 18% | 14% |

**The prototype is easier than ESTM1-2026-A**, the form Stage 1 was written to
improve on, and well below the reference envelope. Mean RLx by stream tells you
where it comes from:

| stream | n | mean RLx | range |
|---|---|---|---|
| routine | 33 | **7.39** | 3–13 |
| mechanism | 14 | 15.36 | 11–19 |
| composed | 3 | 18.67 | 18–19 |

The mechanism and composed streams are **at or above** the reference mean. The
routine stream is far below it, and it is two thirds of the form.

---

## 4. Reference comparison

Prevalence (present, ≥1) and bite rate (=2), against reference T3+T4 and
ESTM1-A:

| dimension | REF pres | REF bite | E1 bite | **P1 pres** | **P1 bite** | verdict |
|---|---|---|---|---|---|---|
| hidden_step | 89% | 33% | 16% | 62% | **34%** | **on target**, doubled from E1 |
| repr_switch | 49% | 26% | 32% | 58% | **28%** | on target |
| abstraction | 68% | 19% | 14% | 70% | 16% | close |
| nonobvious_rel | 53% | 8% | 8% | 74% | **30%** | **overshoots** |
| inference | 71% | 19% | 8% | 64% | 12% | improved, still under |
| multiconcept | 86% | 15% | 14% | 44% | 6% | under |
| filtering | 48% | 17% | 12% | 38% | 8% | under |
| competing_interp | 46% | 16% | 2% | 24% | 2% | gated, unchanged |
| reversal | 44% | 10% | 6% | 22% | 6% | under |
| trap_cost | 98% | 50% | 36% | 100% | 34% | under |
| distractor_close | 100% | 87% | 100% | 100% | **100%** | over-uniform |
| **opacity** | **98%** | **81%** | 72% | **56%** | **20%** | **the largest single gap** |

**`opacity` is the finding.** In the reference corpus, 98% of items keep at
least part of the required move off the surface and 81% keep it fully off. In
the prototype, 56% and 20%. The routine constructs say exactly what to do — *"If
3x + 9 = 36, what is the value of x?"* states the whole task — and a real EST
paper's easy items are still wrapped: a context, a slightly indirect target, a
quantity you have to notice rather than be handed.

**Routine does not mean transparent, and the Stage-2.5 routine stream conflated
the two.** That single conflation accounts for most of the 2.7-point RLx
shortfall.

### Steps

| | reference T3+T4 | ESTM1-A | prototype |
|---|---|---|---|
| mean steps | 4.20 | 2.98 | 2.72 |
| **r(steps, RLx)** | **+0.413** | — | **+0.835** |

**Criterion H fails.** The prototype's difficulty tracks step count twice as
tightly as the reference corpus does. The reason follows directly from the
opacity gap: with the wrapping dimensions flat across the routine stream, the
only thing separating an easy prototype item from a hard one is how many
operations it takes. Stage 2 demoted step count in the *placement rule*; the
prototype re-introduced it through the back door, in the *items*.

`distractor_close` is constant at 2 across all 50 items, so no correlation with
RLx is defined. Criterion I passes, but the constancy is itself a note: the
reference bites in 87% of items, not 100%.

---

## 5. ESTM1-A comparison

The Stage-2 changes **did** move the generator in the intended direction on the
mechanisms they targeted:

| | ESTM1-A | prototype | reference |
|---|---|---|---|
| hidden_step bites | 16% | **34%** | 33% |
| nonobvious_rel bites | 8% | **30%** | 8% |
| inference bites | 8% | 12% | 19% |
| repr_switch bites | 32% | 28% | 26% |
| structural clones | 1 known | **0** | — |
| distinct structures | — | **50/50** | — |
| composed items | 0 | **3** | — |

And yet the form as a whole is **easier** than ESTM1-A (10.30 vs 10.96) with
*more* Entry items (58% vs 42%). The mechanism work landed; the form regressed,
because the mechanism items are now a minority of it. ESTM1-A had no routine
stream and its items were uniformly mechanism-bearing but weak. The prototype
has strong mechanism items and a routine stream that is too plain, in a
proportion that favours the plain.

`nonobvious_rel` at 30% against a reference 8% is an **overshoot** and should be
read as one — the objective is the reference distribution, not a maximum.

---

## 6. Mechanism load-bearing

Re-derived from each item's routes and options, never from its metadata.

**17 of 17 mechanism-bearing Stretch/Peak items are genuinely load-bearing.**
Every one has a mechanism-blind route terminating on a printed wrong answer, and
no blind route reaches the key at or below the insight route's cost.

The other 3 of the 20 Stretch/Peak slots are **filled by routine items**, which
is a different failure and is diagnosed in §10:

| Q | construct | generator band | blind band | RLx | declared mechanism |
|---|---|---|---|---|---|
| Q20 | read-table-ratio | Stretch | **Entry** | 8 | `repr_switch: 2, abstraction: 1` |
| Q26 | conditional-from-two-way-table | Stretch | Stretch | 13 | `repr_switch: 1, filtering: 2` |
| Q44 | read-bar-count-above | Stretch | **Core** | 11 | `repr_switch: 2, filtering: 1` |

### Bypassable, and one that is

**Q12 is bypassable.** The composed C2 item asks for the remainder of
`P(x) = −3x² + ax + 4` on division by `(3x − 5)` after classifying `a = 5`. At
`x = 5/3` the quadratic and linear terms cancel exactly, so **the answer is 4 —
the constant term printed in the stem.** A student who evaluates at 0, or who
guesses the visible constant, is correct without either gate. Both mechanisms are
decoration in this instance, and `assessComposed` passed it because the error
grid is intact and the counterfactuals move the key: the defect is a numeric
coincidence the primitive has no guard against.

### Categories

- **mechanism-bearing and genuinely load-bearing: 16** (17 minus Q12)
- **mechanism-bearing but bypassable: 1** (Q12)
- **routine and correctly routine: 30** — none artificially inflated; routine
  mean RLx 7.39 with no item forced above its natural level
- **artificially complicated: 2** — Q12 and Q36 read as two questions welded
  together ("In the equation … there is no value of x … What is the remainder
  when …"); the composed stems state both halves in full rather than letting one
  feed the other
- **difficulty mostly arithmetic: 0 individually**, but see the r = +0.835
  finding, which is the same defect at form level

---

## 7. Second-reader defects

Read item by item, and recorded before any fix.

| # | Q | defect | class |
|---|---|---|---|
| D1 | form | key balance A19/B20/C4/D7 and five runs of 4–5 | assembly |
| D2 | Q01, Q12 | **the same equation `(a−2)(4x+1) = 12x−4` appears in both.** Q01's answer *is* Q12's first step, so a student who does Q01 gets half of Q12 free | assembly / anti-clone |
| D3 | Q12 | **the key equals a constant printed in its own stem** (the middle terms cancel at the root) | generator primitive |
| D4 | Q44 | option A = 110 — a *sum of items* offered as an answer to "on how many of the days"; nobody picks it | distractor |
| D5 | Q06 | option A = 75/4 — a fractional count of items sold | distractor |
| D6 | Q08 | category options printed Mon, Tue, **Thu, Wed** — not in the display's own order | rendering / authenticity |
| D7 | Q06–Q08 | the shared bar chart has Wed = Thu = 15, which makes Q07's "wrong pair" distractor 0 and gives the set a flat look | generator |
| D8 | Q19, Q20 | the shared table has South = East = 36, so Q19's "adjacent row" distractor is ambiguous between two rows | generator |
| D9 | Q29–Q31 | three questions on one five-number list, all of them "read a value off it" — low information density for a whole stimulus set | blueprint / reader library |
| D10 | Q10, Q27, Q35 | three special-triangle items with the same shape: one angle, one side, find another side to the nearest tenth. Different archetypes, and they still read as one question asked three times | originality |
| D11 | Q17 | option A = 7/6 — a fractional "sum of 6 numbers" | distractor |

**None found in these classes:** chart values off drawn rules (no rules are
drawn), coordinates off rules, answer-choice mismatch, multiple correct answers,
unfair visual precision, accidental estimation shortcuts, redundant conditions,
representation inconsistencies, explanation/key mismatches.

**"Feels obviously AI-generated": yes, in three places** — D9, D10, and the
composed stems of D12/Q36. A reader would notice the three triangle items and the
three list readings.

---

## 8. Structural diversity

- **50 distinct structures across 50 items**; most-repeated 1.
- 48 distinct sub-forms; the most-used primitive is `R-A13` at 8 (its family's
  full quota).
- **0 anti-clone collisions.**

D2 is the exception the fingerprint cannot see: Q01 and Q12 share their entire
equation, and the fingerprint reads them as different because the composed
item's chain differs. **Constant-level repetition across items is not modelled at
all**, and that is a real gap in the anti-clone system rather than a tuning
error.

---

## 9. Series diversity

Measured, not fixed — it does not affect this single form's quality.

| | |
|---|---|
| structures available | **73** |
| structures selected | **50** |
| structures unused | **23** (32% freedom remaining) |
| band-specific capacity | Entry 42, Core 49, Stretch 26, Peak 26 |

The Stretch and Peak capacity of 26 each is the binding number for a series: a
25-form run needs Stretch and Peak items that are not the same 26 structures
every time. This remains a **Stage-4 concern**.

---

## 10. Pass/fail against A–J

| | criterion | verdict | evidence |
|---|---|---|---|
| A | 50/50 valid and rendered | **PASS** | all 50 keys hand-verified; no math, render or security defect |
| B | no critical mathematical or visual defects | **PASS** | none found; the nine QA failures are key distribution, not mathematics |
| C | no structural clone violations | **FAIL** | 0 by fingerprint, but Q01 and Q12 share an equation (D2) |
| D | difficulty inside the reference envelope | **FAIL** | 10.30 vs 13.01 / 13.55; below ESTM1-A |
| E | Entry/Core/Stretch/Peak believable | **FAIL** | 58/10/18/14 vs reference 25/23/24/28; generator and blind bands agree on **25/50** |
| F | mechanisms load-bearing, not decoration | **PASS** | 16 of 17 mechanism items genuine; the one exception (Q12) is a numeric coincidence, recorded |
| G | routine items genuinely routine | **PASS** | routine mean RLx 7.39; none artificially inflated |
| H | no systematic dependence on operation count | **FAIL** | r(steps, RLx) = **+0.835** vs reference +0.413 |
| I | no systematic dependence on distractor closeness | **PASS** | constant at 2; no correlation defined |
| J | reads like an EST paper item by item | **FAIL** | D2, D9, D10 |

**Five failures. The prototype does not pass.**

---

## 11. Failure diagnosis

The failures are not eleven separate problems. **C, D, E, H and J share one
cause, and it is a blueprint problem.**

### The primary failure — blueprint

**The Core signature admits routine items, so Core is filled with Entry-difficulty
work.** `Core` requires `biting ≤ 2, core ≤ 1, present ≥ 1, trap ≥ 1` — and
every routine item satisfies it. The confusion table shows the consequence
exactly:

```
generator      Entry   Core  Stretch   Peak     (columns = blind-coded)
Entry             12      1       0       0
Core              16      1       0       0      <- 16 of 17 Core slots hold Entry items
Stretch            1      3       5       0
Peak               0      0       4       7
```

Two narrower blueprint faults sit alongside it:

- **`repr_switch: 2` satisfies the Stretch floor.** Reading a chart counts as a
  biting mechanism, so three Stretch slots hold routine display items (§6). In
  the reference, `repr_switch` bites across all four bands and discriminates
  nothing; only the reasoning core does.
- **The band ranges are too wide to constrain.** Entry 6–16 and Core 6–19 let
  the assembler place 30 routine items while the plan asked for 21.

### The secondary failure — generator

**The routine constructs are transparent.** Opacity bites in 20% of prototype
items against 81% of reference items. Routine does not mean the task is stated;
it means the technique is standard. This is what makes the routine stream code
7.39 instead of the reference Entry band, and it is what drives r(steps, RLx) to
+0.835.

### The smaller, separable ones

| defect | class | smallest fix |
|---|---|---|
| D1 key balance | assembly | balance the key at form level — the shuffle is per-item and nothing checks the form |
| D2 shared equation | anti-clone | fingerprint the *constants*, not only the structure |
| D3 trivializing coincidence | generator primitive | guard C2 against a key equal to any value printed in the stem |
| D4, D5, D11 | distractor | reject an option whose *kind* is wrong for the question — a count is not a sum, a count of objects is not a fraction |
| D6 | rendering | print category options in the display's own order |
| D7, D8 | generator | forbid ties in a shared display that a reader's distractors depend on |
| D9, D10 | blueprint | cap the readings drawn from one stimulus, and the archetypes drawn from one family |

### Smallest structural fix

**Three changes, in this order:**

1. **Separate the Core signature from Entry** — require Core to carry either a
   reasoning-core mechanism or an opacity floor, so a fully transparent routine
   item cannot occupy a Core slot.
2. **Give the routine constructs opacity** — wrap the task rather than stating
   it. This is the largest single lever on the RLx gap and it is generator work,
   not blueprint work.
3. **Balance the answer key at form level.**

Nothing else needs to change to re-test. The mechanism library, the composition
layer, the anti-clone system and the assembler are all working; what is
mis-calibrated is which band a transparent item belongs in, and how transparent
a routine item is allowed to be.

---

## 12. Recommendation

**REVISE BLUEPRINT.**

The generator is not the primary problem: its mechanism items code at 15.36 mean
RLx against a reference 13.01, its hidden-step bite rate matches the reference
exactly, and 16 of 17 are genuinely load-bearing. The blueprint places
transparent routine items into Core and Stretch slots, and the routine
constructs are more transparent than any real EST item.

**Do not scale.** One prototype has done its job: it found a mis-calibration that
no aggregate metric in Stage 2 or 2.5 could have surfaced, because both were
measuring the generator's own band assignment rather than reading the questions.

---

## 13. CI

`node tests/run-all.mjs` → **73/73 green**. Mutation suites: `est-primitives`
254, `est-fingerprint` 62, `est-compose` 39, `est-blueprint-gates` 37,
`est-assembly-gates` 41 — all passing, none weakened. ESTM1-2026-A byte-identical
(md5 `38926f22b7869608f310d0a8e21bb55e`).

---

## 14. Commit

`efb92c78c59f5e3f9918886c0039f6086dbd8c5b` on
`claude/mock-exam-enhancement-nnwb48` — the commit that introduced every change
described above. This line was written by the follow-up commit that amends it.
