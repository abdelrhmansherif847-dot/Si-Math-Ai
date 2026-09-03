# 26 — Expanded Reference Corpus Analysis

**STATUS: EXPANDED REFERENCE CORPUS ANALYSIS — GENERATOR FROZEN**

**The expansion did not arrive. Zero additional official EST Mathematics forms
are available, against a minimum of eight.**

Section 1 of the brief is explicit about what to do in that case — *"stop and
report the limitation rather than substituting unofficial material"* — and that
is what this document does. The generator is untouched, P4 is unblocked by
nothing, and no unofficial material was admitted, considered as a substitute, or
opened.

---

## 1. Exact corpus inventory

Everything available to this session, with provenance and a ruling on each.

### 1.1 Admitted — official EST I Mathematics

Source: **EST I Practice Guide — Math, 2026 Specifications**, the publisher's own
practice book. Its cover states *"Five sample tests for EST I Math with answer key
and detailed answers"*, and each test's title page carries the format we have on
record: **EST I Math, Sample Test #n, 75 minutes, 50 multiple-choice questions,
calculator allowed.**

| publisher's test | pages | md5 | status |
|---|---|---|---|
| Sample Test #1 | 32 | `3f3328e2…` | already coded |
| Sample Test #2 | 24 | `ef52969f…` | already coded |
| Sample Test #3 | 26 | `0b06707d…` | already coded |
| Sample Test #5 | 23 | `5cc42833…` | already coded |

**Four distinct forms. All four were already coded as T1–T4 in artifact 2.**
Verified by hash, not by filename: the guide files were uploaded under five
names, and two of them — `est1_Guide_test5_1` and `est1_Guide_test5_2` — are
**byte-identical**, the same document uploaded twice. Five filenames, four forms.

### 1.2 Known to exist, obtainable, not held

| | |
|---|---|
| **Sample Test #4** | The guide contains five sample tests and says so on its own cover. Test 4 is the one we do not have. It is official, the same publisher, the same 2026 specification, and it would be **directly comparable with no methodological caveat at all.** |

This is the only certain additional form, and it is **+1 against a minimum of +8.**

### 1.3 Excluded — official, but not this exam

| file | what it is | why excluded |
|---|---|---|
| `satpracticetest4digital` | College Board digital SAT practice test | different exam |
| `satpracticetest8digital` | College Board digital SAT practice test | different exam |
| `satpracticetest10digital` | College Board digital SAT practice test | different exam |

Verified rather than assumed: each is **module-structured with 27 questions per
module**, read from the documents themselves. EST I Math is **50 multiple-choice
questions in a single 75-minute section**. The digital SAT is adaptive across
modules and includes student-produced responses; EST I Math is all multiple
choice.

These are official documents and they are not a substitute. Section 2 of the
brief requires the existing coding standard to be preserved *"for longitudinal
comparability"*, and a corpus mixing two exams with different section structures,
item counts, response formats and adaptivity cannot be longitudinally compared
with itself. Every downstream measurement — archetype turnover, family × band
capacity, reuse distance — would be measuring the difference between two exams
and reporting it as a property of one.

**They may be worth analysing as a separate, clearly-labelled comparison corpus.
That is a different question and it is the user's to ask.** This document does
not do it, and nothing in this document mixes them in.

### 1.4 Excluded — not an official published form

| file | why excluded |
|---|---|
| `2026_March_USA_EliteXSAT` | A recalled/reconstructed live exam. Excluded by the standing instruction that has governed this programme since artifact 1, and independently by section 1 of this brief: *"No leaked forms. No recalled live exams. No unofficial reconstructions."* |

**It was not opened.** Its exclusion needs no examination and examining it would
be the beginning of admitting it.

### 1.5 The arithmetic

| | |
|---|---|
| official EST forms available | **4** |
| already coded | **4** |
| **new this stage** | **0** |
| minimum requested | +8 |
| preferred | +12 |
| certain obtainable (Test #4) | +1 |
| shortfall against the minimum | **−8** |

The inventory is recorded in `scripts/est-baseline.json` under `corpus`, as
hashes and the publisher's test numbers — never content — and
`validate-est-baseline.mjs` asserts it on every CI run, so a later session can
tell at a glance whether the corpus has actually grown.

---

## 2. Coding methodology

**Unchanged, and deliberately so.** No definition was redefined, because nothing
new was coded.

The standard remains the one in `forensics/SCHEMA.md` and artifacts 1–3: the 11
owner-specified dimensions plus `reversal`, `trap_cost` and `self_verify`; the
Entry/Core/Stretch/Peak bands from artifact 3; the 18 families and 189 named
archetypes from artifact 2; mathematical objects, structural fingerprints, target
types and representation classes as used since artifact 20.

`surface_visible` remains scored inverted and `self_verify` remains a modifier
that is never summed. Those two carry a history of being got wrong and the
protection is worth restating even in a stage that codes nothing.

**The candidate-category rule stands ready and unused.** Any construct in a new
form that genuinely did not fit would be flagged as a new candidate category
rather than forced into an existing one. No new form, no new categories, no
silent redefinitions.

---

## 3–13. The analyses this stage was to perform

**NOT PERFORMED. Reason: no additional corpus.**

Each is listed with what it would have produced, so the work is specified rather
than merely deferred. All of the machinery for §§10–13 already exists and is
tested; §§3–9 need coded items and nothing else.

| § | analysis | status | blocked on |
|---|---|---|---|
| 3 | vocabulary accumulation curve | not performed | ≥1 new coded form; the curve over 4 points is already in artifact 25 |
| 4 | bootstrap uncertainty on that curve | **partly available** | the order-bootstrap over 4 forms gives 4! / symmetry = a handful of distinct orders; artifact 25 §4 reports the parametric version |
| 5 | pairwise overlap matrices, seven axes, uncollapsed | not performed | new forms. Over 4 forms the matrix is 6 cells per axis |
| 6 | reuse-distance distributions | not performed | new forms. Four forms can express gaps of 1, 2 and 3 only, from 7 recurrence events |
| 7 | family-level analysis, all 18 | not performed | new forms. At 4 forms most families have 4–12 observations |
| 8 | target and representation analysis | not performed | new forms |
| 9 | difficulty × vocabulary analysis | not performed | new forms. The Peak band is ~3 items per form — **12 observations in the whole corpus** |
| 10 | Chao1 / unseen-richness estimates | **performed in artifact 25** | — |
| 11 | H1/H2/H3 comparison | **partly performed** (§14 below) | discrimination needs new forms |
| 12 | 25-form extrapolation with uncertainty | **performed in artifact 25 §4** | tightening it needs new forms |
| 13 | frozen-generator comparison | not performed | there is no new corpus to compare against |

Re-running §§5–9 against the same four forms would produce the same numbers that
are already in artifacts 21–25. It would look like work and would add no
evidence, and this programme has a standing rule against exactly that
(`verification-framework-audit.md`: a green check is only evidence if it could
have gone red).

### 3.1 What section 9 in particular is waiting for

Worth stating separately because it bears on a live question. The brief asks
whether the generator's Peak deficit is a vocabulary-capacity problem rather than
a difficulty-signature problem. **The corpus contains about 12 Peak items in
total.** No analysis of Peak vocabulary turnover on 12 observations can separate
those two explanations, and reporting one would be inventing a finding. This is
among the strongest arguments for the expansion.

---

## 14. Generator-versus-corpus gap classification

Carried forward from artifact 25 §8 unchanged, because no new evidence arrived
that could change a row. The classification the brief asks for — A generator
defect, B insufficient reference evidence, C renderer/infrastructure, D
legitimate design difference:

| finding | class | note |
|---|---|---|
| allocation efficiency 74.9% against a ceiling of 1.0 | **A — generator defect** | real, tractable, bounded at 64% → 48% overlap |
| 9 of the 15 every-form objects | **A — generator defect** | avoidable within the current library |
| 183/189 archetypes executable, "vocabulary exhausted" | **B — insufficient evidence** | 189 is ~10% of the estimated pool |
| best achievable overlap ≈ 46% | **B — insufficient evidence** | the eligibility structure is thin because the vocabulary is a 10% sample |
| 6 of the 15 every-form objects | **B — insufficient evidence** | they sit in cells holding one archetype |
| ≤20% series overlap unreachable | **B — insufficient evidence** | and its own basis is one draw from a wide distribution |
| 6 archetypes unbuilt | **C — infrastructure** | 4 need a coordinate-plane stimulus, 2 a richer line graph |
| the allocation penalty cannot reach 1× | **D — metric artefact** | its denominator counts objects eligible for no cell; corrected floor 1.39× |
| band mix exactly on the Stage-3.5 plan | **D — legitimate design** | matches the calibrated target |

**One row is a generator defect that can be worked on today.** Two more are
generator defects only in part. Everything else is corpus, infrastructure, or a
metric that needed fixing.

### 14.1 Available → eligible → scheduled → emitted

The brief's section 13 requires this distinction be tracked for both reference
and generator. For the generator it is measured and current:

| stage | count |
|---|---|
| available (library names) | 184 objects |
| eligible (some cell with standing demand admits it) | 150 |
| scheduled (policy D reaches it across 25 forms) | 130–139 |
| emitted (appears in at least one assembled form) | 139 |

**For the reference corpus, only one of the four is knowable from four forms.**
"Emitted" is 189 archetypes over 200 items. "Available" is the ~1,500–2,600
estimate. "Eligible" and "scheduled" are not observable at all — they would
require knowing the publisher's item bank and its assembly rules, which no
practice guide discloses. The honest position is that **three of the four rungs
of this ladder cannot be measured on the reference at any corpus size we could
realistically obtain**, and the generator's figures should not be compared
against reference figures that do not exist.

---

## 15. The four questions

### Q1 — Do we now have enough reference forms to characterise series-level reuse?

**No, and the position is unchanged from artifact 25.** Four forms, six pairwise
comparisons, seven recurrence events. Artifact 25 established that the pool size
is uncertain by a factor of four and that 8–16 additional forms would be needed
to change that. Zero arrived.

### Q2 — Is the reference's low overlap primarily vocabulary, allocation, or hybrid?

**Undecidable on the present evidence, with the balance of it favouring H1.**

- **H1 (large vocabulary).** A pool of ~2,000 archetypes drawn independently
  predicts a pairwise overlap of 1.25 of 50 against the observed 1.167. Two
  independent estimators — Chao1 on the singleton counts, and the pool implied by
  the overlap itself — agree on that order of magnitude. **H1 fits with no extra
  mechanism.**
- **H2 (small vocabulary, deliberate scheduling).** Fits the overlap by
  construction, but requires the pool to be near 189, which the singleton counts
  contradict: 96% of observed archetypes appear exactly once, which is the
  signature of undersampling, not of scheduling.
- **H3 (hybrid).** Cannot be excluded and cannot be demonstrated. Scheduling on
  top of a large pool would be nearly invisible at 2.3% overlap, because a large
  pool alone already produces it.

**The discriminating measurement is reuse distance**, and it needs forms. If the
publisher schedules, recurrences will avoid adjacent forms more than chance
allows; if it draws, gaps will be geometric. Seven recurrence events cannot
distinguish those distributions. **This is the single measurement most worth
buying with an expanded corpus.**

### Q3 — What is the evidence-based acceptable overlap target for a 25-form generated series?

**There is not one, and this stage cannot produce one.**

What can be said precisely:

- The corpus's 2.3% is **one draw from a wide distribution.** A simulated corpus
  from a pool of 2,000 gives four-form overlaps anywhere in 0.50–2.17 of 50.
- **≤20% is unreachable** with the current eligibility structure, whose ceiling
  is ~46%. That is measured, not assumed.
- Extrapolating any target to 25 forms from four is underdetermined for the three
  reasons in artifact 25 §2, and none of them has been relieved.

**Recommendation: do not set a numeric target now.** The defensible interim
target is the one already in the revised gate — **allocation efficiency**, the
fraction of the achievable ceiling the generator captures, currently 74.9%
against 85%. It is bounded by 1, computed from the same vocabulary it grades, and
needs no corpus assumption at all. It is the only target in this programme that
is both meaningful and currently measurable.

### Q4 — What must change in the generator?

**Nothing, yet, and nothing on the evidence of this stage.** The generator
remains frozen. When work resumes, the classification in §14 says where it
belongs: **allocation efficiency is the one open generator defect**, worth
64% → 48% overlap, and it does not need a larger corpus to be worth doing.

**Outcome: C — acquire more reference forms**, with a qualification.

Against the four options the brief lists:

| option | verdict |
|---|---|
| **A — resume generator allocation work** | defensible on its own merits; bounded at 64% → 48%; needs no corpus. **The strongest available second choice.** |
| **B — expand generator vocabulary** | **rejected.** The supported vocabulary is 183/189 and the last six are infrastructure. Expanding further means inventing archetypes, which the brief forbids and which would make every coverage figure meaningless |
| **C — acquire more reference forms** | **the primary recommendation.** It is the only route that moves the ceiling, settles H1/H2/H3, and makes any 25-form target evidence-based |
| **D — hybrid** | what C plus A amounts to in practice, and the realistic plan if the corpus can be grown at all |

---

## 16. Recommendation for the next engineering phase

**In priority order, and each is independent of the ones below it.**

**1. Obtain Sample Test #4 from the practice guide.** It is official, from the
same book and specification, and it is the one form we know exists and do not
have. It takes the corpus from 4 to 5 — which does **not** reach any threshold in
artifact 25, and should not be presented as if it does. Its value is that it is
certain, immediate, free of methodological caveat, and would let the coding
pipeline be exercised end to end before a larger batch arrives.

**2. Establish whether more official EST forms exist at all.** This is the
question that decides the programme's shape and it has never been asked
explicitly. Prior years' practice guides, publisher sample material, official
released forms. **If the answer is "the guide's five tests are all there is",
then a 25-form series can never be validated against an official EST reference,
and that should be recorded as a permanent finding rather than rediscovered every
few stages.**

**3. If the corpus cannot grow, set the target as a product decision.** Artifact
25 §5.1 anticipated this. An acceptable reuse rate for a student sitting several
forms is a legitimate decision for the owner to make on pedagogical grounds. It
must be recorded as a decision, with its reasoning, and never dressed as a
measurement.

**4. Meanwhile, allocation efficiency 74.9% → 85% is available.** It is a real
generator defect, it needs no corpus, and it is bounded — the most it can buy is
64% → 48% pairwise overlap. **It is not proposed here**, because the generator is
frozen and unfreezing it is the user's call.

**What should NOT happen next:** more archetypes invented to raise a count; the
SAT forms merged into the EST corpus; the ≤20% target quietly lowered until the
generator passes it; or P4 generated to produce activity while the corpus
question is unresolved. P4 measures **difficulty**, which is a separable question
and arguably overdue — but it is a decision, not a default.

---

## Sample sizes and assumptions, as required

Every statistical claim in this document, with what it rests on:

| claim | n | assumptions |
|---|---|---|
| 4 official EST forms available, 0 new | 9 PDFs inventoried, 5 EST filenames, 4 distinct by md5 | none; hashes are exact |
| SAT files are a different exam | 3 documents, structure read directly | none; read from the files |
| pool estimate 1,500–2,600 | 200 items, 189 archetypes, f₁ ≈ 180, f₂ ≈ 9 | Chao1 is a **lower bound**; the frequency decomposition is a range, not a point; carried from artifact 25 |
| corpus overlap 2.3% | **6 pairwise comparisons** | one draw; the 95% interval under a 2,000-pool model is 0.50–2.17 of 50 |
| 7 recurrence events | 4 forms | too few to fit any gap distribution |
| Peak-band items | **≈12 in the entire corpus** | why §9 cannot be attempted |
| ceiling ≈46%, efficiency 74.9% | 25 assembled forms, 52 cells, 150 eligible objects | generator-side, measured; carried from artifact 24 |

---

## What was verified, and what was not

**Verified by running it.** The inventory: nine PDFs enumerated, hashed, and each
ruled on. The duplicate identified by hash, not by filename. The EST forms
confirmed from their own title pages — *EST I Math, Sample Test #5, 75 minutes,
50 multiple-choice questions* — and the guide's cover confirming it contains five
sample tests, which is how Test #4 was identified as missing. The SAT files
confirmed module-structured with 27 questions per module by reading them. CI
**79 of 79 green**. The baseline validator passes and now asserts the corpus
inventory too.

**Not verified, and not claimed.** No new item was coded, no analysis in §§3–9 or
§13 was performed, and no number in this document is new evidence about the
reference — every corpus statistic here is carried from artifact 25 with its
sample size restated. The recalled-exam file was not opened. Whether further
official EST forms exist anywhere is **unknown**; this session can only report
what is present.

**Standing constraints, all held.** Generator frozen — no primitive, blueprint,
allocation policy, difficulty model or QA rule was touched. ESTM1-2026-A, P1, P2
and P3 untouched; ESTM1's payload md5 is unchanged at
`38926f22b7869608f310d0a8e21bb55e`. P4 not generated. Forms 2–25 not generated.
No exam content in this repository. No unofficial material admitted or examined.
