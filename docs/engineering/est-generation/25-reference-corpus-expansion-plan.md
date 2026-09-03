# 25 — Reference Corpus Expansion Plan

**STATUS: REFERENCE CORPUS EXPANSION PLAN — P4 BLOCKED**

The generator is frozen. No prototype was generated, no forms 2–25, no
archetypes invented. This document does one thing: it establishes what the
four-form reference corpus can and cannot determine, and it finds that the
answer is **less than this programme has been assuming for six stages.**

---

## 0. The finding

Every capacity number produced since artifact 20 has been computed against a
corpus vocabulary of **189 archetypes**, and 189 has been treated as *the*
vocabulary. It is not. It is what four forms revealed, and four forms is a
sample.

Two independent estimators, from separate data, say the same thing:

| method | what it uses | estimate of the archetype pool |
|---|---|---|
| Chao1, bias-corrected | how many archetypes were seen once vs twice | **1,500 – 2,250** |
| implied by pairwise overlap | `V = S² / overlap`, from the 2.3% figure | **2,143** |

**Sample coverage is 9–11%.** The four forms have seen roughly a tenth of the
archetype pool by frequency. About nine times in ten, the next reference item
drawn would be an archetype we have never seen.

This is not a marginal correction. It changes what several earlier conclusions
mean, and §8 sets out which.

---

## 1. The current four-form corpus, and its limitations

What the corpus is:

| | |
|---|---|
| forms | 4 |
| items | 200 |
| distinct archetypes observed | 189 |
| archetypes appearing in more than one form | 7 (3.7%) |
| distinct archetypes per form | 49, 49, 50, 50 |
| pairwise archetype overlap | 1.167 of 50 = **2.3%** |

Four forms give **six pairwise comparisons**. Every series-level statement this
programme has made — reuse rate, turnover, cooldown behaviour, "never
consecutive", "recurs only after a gap" — rests on six numbers, and three of the
policy claims rest on a total of seven recurrence events.

The frequency decomposition needs care and is recorded as a range rather than a
point. Two hundred items over 189 distinct archetypes leaves 11 repeat instances:
7 are the recorded cross-form recurrences, 2 are within-form repeats implied by
two forms having 49 distinct archetypes in 50 slots, and the remaining 2 could be
either. So:

| decomposition | f₁ (seen once) | f₂ (seen twice) | Chao1 | bias-corrected | 95% interval | coverage |
|---|---|---|---|---|---|---|
| fewest repeats | 182 | 7 | 2,555 | 2,248 | 1,288 – 5,281 | 9% |
| **central** | **180** | **9** | **1,989** | **1,800** | **1,088 – 3,795** | **10%** |
| most repeats | 178 | 11 | 1,629 | 1,502 | 945 – 2,932 | 11% |

**Chao1 is a lower bound on richness, not a point estimate.** The conclusion is
"at least this many", and it is already an order of magnitude above 189 at the
bottom of every interval.

---

## 2. Why a 25-form extrapolation is underdetermined

Three separate reasons, and any one of them is sufficient.

**The pool size is unknown to within a factor of four.** The central 95% interval
runs 1,088 to 3,795. A 25-form series design depends directly on it: the required
vocabulary, the achievable overlap and the reuse schedule all scale with `V`. A
design built on 1,088 and a design built on 3,795 are different designs.

**The reuse rate is measured on six pairs.** A simulated corpus drawn from a pool
of 2,000 produces, over four forms, a pairwise overlap whose 95% interval is
**0.50 to 2.17 of 50 slots** — the observed 1.17 sits comfortably inside it, and
so would 0.6 or 2.0. The observed 2.3% is one draw from that distribution.

**Nothing in four forms constrains what happens at twenty-five.** The corpus's
policies — never repeat inside a form, never consecutive, recur only after a gap
— are all *within-* and *between-adjacent-form* statements. Whether a publisher
recycling across two years reuses an archetype at 2.3% or at 15% cannot be seen
in four forms, because four forms contain no long-range structure at all.

---

## 3. The evidence for the 2.3% figure, re-examined

Artifact 22 §2.2 read the corpus this way:

> 189 archetypes for 200 slots is barely more vocabulary than slots. A **random**
> draw from 189 objects would overlap 13.2 of 50 items — 26%. The corpus overlaps
> 1.17. **The corpus does not achieve its diversity by having a large library. It
> achieves it by allocating a small one deliberately.**

**That inference treated the sample as the population, and it does not survive.**
If the pool is ~2,000, an entirely independent draw of 50 per form gives an
expected overlap of `50²/2000 = 1.25` — against an observed 1.17. The corpus's
diversity is **fully explained by drawing from a large pool with no scheduling
whatsoever.**

| explanation | predicted overlap | observed |
|---|---|---|
| deliberate scheduling of 189 archetypes | ≈ 1.2 by construction | 1.17 |
| independent draws from ~2,000 archetypes | 1.25 | 1.17 |

Both fit. The data cannot separate them, and the second requires no scheduling
mechanism at all — so the scheduling reading was never the parsimonious one, and
it was load-bearing in artifacts 22, 23 and 24.

The programme's "allocation penalty" — measured overlap over a random draw from
the generator's own library — was therefore comparing the generator against a
target produced by a **library ten times larger**, and calling the shortfall an
allocation defect. Some of it was. Most of it was vocabulary all along.

---

## 4. The uncertainty four forms leave

A parametric bootstrap: draw `N` forms of 50 archetypes from a pool of known
size, then report what an analyst seeing only those forms would conclude. The
pool is uniform, which is the **conservative** choice — a real pool has a
frequency distribution, and any skew makes these estimators more biased downward,
not less.

At a pool of 2,000, 200 replicates per row:

| forms | archetypes seen | coverage | overlap, 95% | pool estimate, 95% | spread |
|---|---|---|---|---|---|
| **4** | **193** | **7%** | **1.17 [0.50 – 2.17]** | **2,344 [1,373 – 4,920]** | **151%** |
| 6 | 282 | 12% | 1.27 [0.73 – 1.87] | 2,195 [1,466 – 3,498] | 93% |
| 8 | 367 | 16% | 1.25 [0.89 – 1.64] | 2,160 [1,648 – 3,135] | 69% |
| 10 | 446 | 21% | 1.29 [0.96 – 1.60] | 2,085 [1,673 – 2,862] | 57% |
| 12 | 538 | 20% | 1.00 [0.79 – 1.24] | 2,615 [2,001 – 3,444] | 55% |
| 15 | 633 | 30% | 1.24 [1.01 – 1.42] | 2,094 [1,774 – 2,576] | 38% |
| 20 | 793 | 38% | 1.26 [1.12 – 1.38] | 2,038 [1,782 – 2,372] | 29% |
| 25 | 993 | 38% | 1.00 [0.90 – 1.09] | 2,570 [2,259 – 2,930] | 26% |

**The simulation reproduces the real corpus.** At a pool of 2,000, four forms
yield a median of 193 distinct archetypes and an overlap of 1.17 — the corpus
shows 189 and 1.167. At a pool of 189 the same four forms would overlap **13 of
50**, eleven times what is observed. The regression suite asserts both directions.

**At four forms the pool estimate spans more than its own centre.** That is the
whole of §2 in one number.

---

## 5. How many additional forms are needed

Two thresholds, because two different claims need different evidence.

**Tier 1 — enough to revise the capacity model and resume allocation work.** The
reuse rate known to ±20% and the pool size to within ±37% of its centre.
Allocation work needs to know what it is aiming at; it does not need the pool
enumerated.

**Tier 2 — enough to make a claim about vocabulary completeness.** At least a
third of the pool observed, and the pool size known to ±20%. **This is the
threshold the programme has been unknowingly failing.** "183 of 189 archetypes
are executable" is a statement about the pool, and at 10% coverage it is a
statement about the sample wearing the sample's clothes.

| hypothesised pool | tier 1 reached at | tier 2 reached at | **additional forms needed** |
|---|---|---|---|
| 1,500 | 12 forms | 15 forms | **+8 / +11** |
| 2,000 | 15 forms | 20 forms | **+11 / +16** |
| 2,500 | 15 forms | 25 forms | **+11 / +21** |

**Recommendation: obtain at least 8 additional official EST Mathematics forms
(12 total), and target 16 (20 total).**

- **+8 is the minimum that buys anything.** Below 12 forms no pool hypothesis
  reaches even tier 1, so a smaller expansion would change the numbers without
  changing what can be concluded from them.
- **+16 reaches tier 2 under the central hypothesis**, which is what a
  completeness claim — and therefore any future "the vocabulary is exhausted"
  statement — actually requires.

### 5.1 The constraint this recommendation runs into

Official EST Mathematics forms are a finite, slowly-published resource, and this
plan does not assume 20 of them can be obtained. Three honest possibilities:

1. **20 forms are obtainable.** Follow §6, then resume at tier 2.
2. **12 forms are obtainable.** Resume allocation work at tier 1 and record that
   no completeness claim can be made. This is a good outcome.
3. **Fewer than 12 are obtainable.** Then the ≤20% target is **permanently
   unverifiable from official evidence**, and the programme must set its target
   on other grounds — a documented product decision about acceptable reuse for a
   student sitting several forms, not a measurement. That decision would be the
   user's to make and should be recorded as a decision, not disguised as a
   finding.

**No leaked, unofficial or reconstructed material is acceptable for any of
this.** The corpus rules have said so since artifact 1 and this plan does not
create an exception; a corpus contaminated to reach a threshold measures nothing.

---

## 6. Exactly what to measure on the expanded corpus

Every item of every new form is coded on the frames this programme already has,
so the new forms are directly comparable with the four. In priority order:

**The series questions — these are why the corpus is being expanded.**

1. **Archetype turnover** — f₁, f₂, Chao1 and sample coverage recomputed at each
   new form count, so the pool estimate can be watched converging (or not).
2. **Pairwise archetype overlap**, per pair rather than as a mean, with the
   distribution across all `C(N,2)` pairs. Six pairs cannot show a distribution.
3. **Long-range reuse** — the form gap between recurrences of the same archetype.
   Four forms cannot distinguish "never reused" from "reused after five forms",
   and that distinction is the entire cooldown question.
4. **Whether 2.3% is representative.** Does pairwise overlap rise with the number
   of forms, as a fixed-pool model predicts, or stay flat, as a growing-pool
   model does? This is the single most valuable measurement in the list.

**The structural questions — already measured on four forms, now with error bars.**

5. Family × band capacity: how many distinct archetypes each cell actually draws
   on, which is what sets the ceiling in artifact 24 §9.
6. Mechanism frequency and the load-bearing rate, on the artifact-3 frame.
7. Non-value-targeted share and equation-targeted share per form.
8. Interpretation species, and whether the three parameter-interpretation
   archetypes are the whole set.
9. Mathematical-object diversity per form (the 49–50 of 50 figure).
10. Natural cooldown and reuse patterns — the empirical version of policy D.

**And one methodological check.** Re-derive the artifact-2 archetype taxonomy
from the expanded corpus independently, and compare it with the existing 189. If
new forms are coded *into* the existing taxonomy rather than against a fresh one,
the taxonomy will absorb new archetypes as variants of old ones and the turnover
measurement will be an artefact of the coder, not of the corpus.

---

## 7. When the corpus is sufficient to resume generator work

Executable, in `corpusSufficiency()`:

```
TIER 1 — resume allocation work
  pool estimate spans <= 75% of its centre
  overlap rate spans <= 40% of its centre
  at least 8 forms

TIER 2 — make a vocabulary-completeness claim
  sample coverage >= 35%
  pool estimate spans <= 40% of its centre
```

Four forms reach neither, and the model says why rather than merely saying no.

**What resuming looks like at each tier:**

| tier | what unblocks | what stays blocked |
|---|---|---|
| **1** | the revised capacity model, the allocation architecture, a defensible overlap target, P4 as a **difficulty** measurement | any claim that the vocabulary is complete or exhausted |
| **2** | vocabulary-completeness claims, a 25-form series design, the ≤20% question answered rather than assumed | — |

**P4 does not need tier 1.** It measures difficulty and item quality against the
blind-coding frame, and the last blind coding predates 17 new mechanism
structures and a band mix that is now exactly on the Stage-3.5 plan. That is a
separable question from series capacity and it is the one piece of generator work
that could proceed on the current corpus. **It is not proposed here** — the
instruction is that the generator stays frozen — but the separability should be
on the record.

---

## 8. Corpus limitation versus generator limitation

The distinction this stage exists to draw. Each row is a finding this programme
has recorded; the third column is what it actually was.

| finding | recorded in | actually a limit of |
|---|---|---|
| 183 of 189 archetypes executable — "vocabulary expansion is exhausted" | 24 §11 | **the corpus.** 189 is 10% of the pool. The library has built most of what four forms revealed |
| best achievable pairwise overlap ≈ 46% | 24 §3 | **the corpus.** The eligibility structure is thin because the vocabulary is a 10% sample |
| the allocation penalty cannot reach 1× | 24 §7 | **the metric.** Its denominator counts objects eligible for no cell; corrected, the floor is 1.39× |
| allocation efficiency 74.9% | 24 §11 | **the generator.** Real, tractable, and bounded at 64% → 48% |
| 15 objects in every form against a minimum of 6 | 24 §8 | **the generator**, for 9 of them; **the corpus** for the other 6, which sit in cells with one archetype |
| the corpus "schedules a small library" | 22 §2.2 | **an inference error.** The data equally supports independent draws from a large pool (§3) |
| ≤20% series overlap | 22 §2.3 | **the corpus.** Unreachable at the current eligibility, and its own basis is one draw from a wide distribution |
| six archetypes unbuilt | 24 §2 | **the renderer.** Four need a coordinate-plane stimulus, two a richer line graph |

**The generator's remaining defect is one line of that table**: allocation
efficiency, worth 64% → 48% overlap, and worth doing. Everything else on the list
is a limit of what four forms can tell us, and no amount of generator work moves
it.

---

## 9. The frozen baseline

Recorded in `scripts/est-baseline.json` and re-derived by
`scripts/validate-est-baseline.mjs` on every CI run, so drift is a failure rather
than a discovery.

| | |
|---|---|
| reference archetypes named / executable | 189 / **183** — 96.8% |
| unbuilt, classified | 4 coordinate-plane stimulus, 2 richer line-graph |
| eligible objects | 150 |
| theoretical best overlap | 46.3% – 47.9% (profile-dependent) |
| constructive optimum | 50.8% |
| achieved | 64% |
| allocation efficiency | 74.9% |
| allocation penalty floor | 1.70× (1.39× with the denominator corrected) |
| every-form object minimum / achieved | 3 (6 on the graded profile) / 17 |
| recommended cooldown policy | **D**, adaptive by object scarcity |
| forms complete of 25 | 25/25 |
| band mix / family mix deviation | 0 / 0 |
| CI | **79 of 79 green** |
| ESTM1-2026-A | byte-identical, md5 `38926f22b7869608f310d0a8e21bb55e` |

The validator found a defect in this record on its first run: the ceiling had
been recorded as a single number when it is profile-dependent, and the efficiency
figure did not divide out. Both are now recorded as a range with the graded value
named. That is what the freeze is for.

**Two code changes accompany the freeze, and neither touches generation.**
`SERIES_TARGET` and `STAGE_B` are marked **aspirational and superseded** in
source, so nothing in the repository states ≤20% as a feasibility gate. The
targets themselves are unchanged — they were not lowered, they were reclassified.

---

## What was verified, and what was not

**Verified by running it.** CI **79 of 79 green**, including the new
`est-corpus-model` suite (55 checks) and the baseline validator. The estimators
are checked against cases whose answer is arithmetic — Chao1 of a saturated
sample is the observed count; `poolFromOverlap` and `randomOverlap` are each
other's inverse. The central claim is checked in both directions: a simulated
pool of 2,000 reproduces the observed corpus in four forms, and a pool of 189
produces an overlap eleven times too large. The baseline is re-derived from the
live registry.

**Not verified, and not claimed.** The pool estimate is a **lower bound with a
wide interval**, and the uniform-pool assumption in the simulation is a modelling
choice — a skewed pool would put the true richness higher, not lower, but the
convergence rates in §5 would shift. The tier thresholds in §7 are judgements
about how precise is precise enough, not corpus measurements. Nothing here is
evidence about item quality, and no new corpus material was obtained, examined or
assumed to exist.

**Standing constraints, unchanged.** No exam content in this repository. No
leaked or unofficial material, and none proposed. ESTM1-2026-A untouched. No
migration written or applied. Generator frozen. All work on
`claude/mock-exam-enhancement-nnwb48`.
