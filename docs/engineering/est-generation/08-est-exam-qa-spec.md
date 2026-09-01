# EST I Math — Exam QA Specification

**Artifact 8 of 8.** Evidence tiers: [`01-est-exam-dna.md` §0](01-est-exam-dna.md).
Whole-form and whole-series acceptance. Artifact 7 covers individual items.

> A form of 50 individually acceptable items is not an acceptable form. Every
> gate here is a property no single item can satisfy or violate on its own.

---

## 0. Structure of this specification

| Layer | Gate range | Scope | Automation |
|---|---|---|---|
| **F — Form structure** | F1–F6 | one form | fully scripted |
| **B — Balance** | B1–B5 | one form | fully scripted |
| **C — Coherence** | C1–C4 | one form | scripted + read |
| **S — Series** | S1–S4 | all forms together | fully scripted |
| **D — Delivery** | D1–D4 | one form on the real surface | sat, not asserted |

`scripts/validate-est-blueprint.mjs` already enforces F1–F4 and B1 **against the
blueprint**. This specification enforces the same properties **against an
authored form**, which is a different and larger claim: a form can drift from its
own plan.

---

## 1. Form structure — F

| Gate | Statement | Fails when |
|---|---|---|
| **F1** | Exactly **50** items, one section, 75 minutes. | A form is short, long, or split. |
| **F2** | **100% four-option multiple choice.** Zero grid-ins, zero student-produced responses, zero five-option items. | *This is the gate `ESTM1-2026-A` fails today, with 8 grid-ins.* |
| **F3** | Every domain inside its published band; **Geometry and Trigonometry at 8–13%, i.e. 4–6 items.** | *This is the second gate `ESTM1-2026-A` fails today, at roughly 30% geometry.* |
| **F4** | Every family count inside its observed per-form range (artifact 6 §3). | A generator over-drawing one family. |
| **F5** | Every item's answer letter is A, B, C or D, and every item has exactly four options. | Schema drift. |
| **F6** | No item requires a formula the reference sheet gives **and** the stem also supplies — the sheet is the single source. | Redundant hand-holding that changes the item's difficulty. |

**F2 and F3 are the two published-spec violations already in production
(DRAFT).** They are listed first because they are the proof that a form-level
gate was needed: both items are individually fine, and both defects are only
visible from the form.

---

## 2. Balance — B

| Gate | Statement | Threshold |
|---|---|---|
| **B1** | Demand bands inside their per-form shares. | entry 8–12, core 26–32, stretch 6–10, peak 1–3 |
| **B2** | **Answer key balance.** | 11–14 of each letter; maximum run 3 |
| **B3** | **Difficulty dispersion, not a curve.** Every 10-item block: ≥2 entry, ≥1 stretch-or-peak, ≤1 peak. No two peaks adjacent. Q50 is not a peak. | — |
| **B4** | **On-ramp.** Q1–8: ≥3 entry items, ≤1 stretch, 0 peak. | — |
| **B5** | **Distractor-class coverage.** All nine classes (artifact 4 §1) appear; none exceeds 30% of the form. | 9 classes present, each ≤15 items |

**B2 is a deliberate departure from the corpus and is documented as one**
(artifact 6 §8). The reference forms are looser. **A key imbalance is repaired by
renumbering an item, never by shuffling its options** — a gate that is repaired
by reordering a sign grid has destroyed the item to satisfy the form.

**B3 replaces a difficulty curve, and the substitution is the point.** The
corpus has no ramp after roughly Q10 (artifact 1 §5, artifact 3 §4). A form whose
demand climbs monotonically **fails** this gate even though it would look, to a
casual reader, more carefully constructed.

**B5 exists because distractor monoculture is invisible item by item.** Fifty
items each with one defensible arithmetic-slip distractor is fifty passes at G2.6
and a form-level failure.

---

## 3. Coherence — C

| Gate | Statement |
|---|---|
| **C1** | **No archetype repeats within the form.** Target 50 distinct archetypes in 50 items; **50 required**, matching the two reference forms that achieve it. |
| **C2** | **No context repeats.** No two items share a scenario; no named person appears twice; no two items use the same real-world quantity (two salary items, two fuel items). |
| **C3** | **Shared-stimulus structure.** 3–5 sets; sizes 2–3 with at most one set of 4; contiguous; 8–12 items in sets; first set starting by Q10, last after Q39; every set introduced by the `Questions X to Y refer to…` heading. |
| **C4** | **Stimulus variety.** No stimulus type more than 3 times; at least one rare-tail type; at least one object-valued option set; roughly a third of items carrying a stimulus (15–20 of 50). |

**C1 is set at zero repeats, not "at most one".** Two of the four reference forms
achieve 50 distinct archetypes in 50 items, and the two that do not each repeat
once inside a shared-stimulus pair. Setting the gate at zero costs a generator
almost nothing and removes the judgement call about which repeat is benign.

**C2 catches the failure mode a reader notices first.** A form with two shopping
problems reads as thin long before anyone counts its domain weights.

---

## 4. Series — S

Run across all forms generated together. **These are the gates that matter most
for a 25-form product** and the only ones that cannot be checked while looking at
one form.

| Gate | Statement |
|---|---|
| **S1** | **Archetype turnover.** At most 4 archetypes shared between adjacent forms; no archetype used more than 3 times across the series. |
| **S2** | **Context turnover.** No context shared between adjacent forms; no context used more than twice across the series. |
| **S3** | **No numeric duplication.** No two items anywhere in the series share their full numeric parameter set. |
| **S4** | **Structural variety.** Adjacent forms do not use the same shared-set size pattern, the same stimulus type for their largest set, or the same rare-tail stimulus. |

**S3 is the strictest gate in this document and the most important.** A student
working 25 forms will recognise a repeated question before they notice anything
else, and a recognised question invalidates the score the platform reports back
to them. That is not an aesthetic failure; it is a measurement failure in a
product whose entire value is measurement.

**S1's budget is generous against the corpus.** Four reference forms share 7 of
191 archetypes *in total*. Four between adjacent forms is already looser than the
publisher's own practice.

---

## 5. Delivery — D

**Sat, not asserted.** Every gate here is performed by taking the form on the
real surface.

| Gate | Statement |
|---|---|
| **D1** | The form is sat end to end on `exams.html`: all 50 items reached, all options selectable, timer correct at 75 minutes, review and finish states correct at the last item. |
| **D2** | Every stimulus renders on every item of its set; every figure passes the visual-fidelity suite; every object-valued option set renders as objects. |
| **D3** | The scored result matches a hand-marked key, item for item. |
| **D4** | The form is **not published** and is invisible to students until explicitly approved. RLS verified by acting as the student role, not by reading the policy. |

**D3 is not redundant with artifact 7 G1.4.** G1.4 checks the authored key
against the authored explanation. D3 checks the *stored* key, after import,
against a hand mark of the *rendered* form. Those are three different artefacts
and the corpus of this repository's own history contains a case where they
diverged.

**D4 is the gate that keeps a defect from reaching a student.** The published
domain-band violation in `ESTM1-2026-A` is harmless only because that form is
DRAFT and admin-only.

---

## 6. Applying this to `ESTM1-2026-A`

Recorded here because the rebuild is the next piece of work and is deliberately
**not** started in this document.

| Gate | Status | Detail |
|---|---|---|
| **F1** | PASS | 50 items, 75 minutes, one section. |
| **F2** | **FAIL** | 8 grid-in items. The exam is 100% multiple choice (PUBLISHER-AUTHORITATIVE, artifact 1 §2). |
| **F3** | **FAIL** | Geometry approximately 30% against a published ceiling of 13%. |
| **F4** | Not yet assessed | Requires classifying the form against artifact 2's families. |
| **B1–B5** | Not yet assessed | |
| **C1–C4** | Not yet assessed | |
| **D4** | PASS | DRAFT, admin-only, invisible to students. |

**Two confirmed failures, both against Tier 1 evidence.** Neither is a judgement
call: the publisher prints the item format and the domain band in its own front
matter. The rebuild replaces the form rather than patching it, because removing
8 grid-ins and 8–9 geometry items and back-filling 17 slots is a re-author of a
third of the paper.

---

## 7. What this specification cannot check

Stated plainly so that a green run is not over-read.

- **It cannot tell you the form is the right difficulty.** There are no item
  statistics in the corpus (artifact 3 preamble). The demand bands reproduce the
  reference forms' *shape*; nothing here calibrates them against students.
  **A generated form must not be presented to a student as being of a known
  difficulty, and must not report an EST-scaled score out of 800** — the corpus
  contains no conversion table and inventing one would be fabricating a
  measurement.
- **It cannot tell you the items are pedagogically worth setting.** That is
  `CLAUDE.md`'s three questions, upstream of everything here.
- **It cannot tell you the form is authentic to the *live* exam**, only to four
  forms of the publisher's own preparation material (artifact 5 §7, T4 note).
- **It cannot substitute for reading the form.** Every automated gate in this
  document is a property check, and this repository's standing lesson is that a
  full set of green property checks coexisted with three consecutive visual
  regressions because nothing looked at the output
  (`docs/engineering/figure-visual-system.md`). **Someone reads all 50 items
  before a form ships.**
