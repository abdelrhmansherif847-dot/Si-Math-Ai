# ESTM1-2026-A — STATUS

> **DRAFT — INTERNAL REVIEW ONLY**

This file is the single place this form's status is stated. It is enforced by
[`scripts/validate-est-form-status.mjs`](../../../scripts/validate-est-form-status.mjs),
which runs in CI, so the restrictions below cannot quietly lapse.

---

## The restrictions

`ESTM1-2026-A` **must remain**:

- **admin-only**
- **not student-visible**
- **not part of production exam inventory**
- **not represented as an official EST exam**
- **not assigned an EST-scaled score**

**Do not publish it.** `publish_exam_form()` is a separate, irreversible act and
has not been performed.

---

## What it is

An **internal validation form**: the first form built end to end from the
[EST generation specification](README.md), used to test whether that
specification produces an authentic paper before 24 more are generated from it.

It is a milestone in the engineering work, **not a product release**.

## What it is not

- It is **not an official EST exam**, and must never be described as one. It is
  an original Si Math AI form written to resemble the EST's design.
- It has **no EST-scaled score**. The corpus contains no score-conversion table
  (artifact 1 §1), and inventing one would be fabricating a measurement. A raw
  score out of 50 is the only score this form can report.
- It has **no calibrated difficulty**. See below.

---

## KAR

**PUBLISHED EST KAR BANDS = TARGET.** Knowledge 35–45%, Application 45–55%,
Reasoning 5–15%, all PUBLISHER-AUTHORITATIVE.

**Our item-level KAR classification is DIAGNOSTIC ONLY.** It is Tier 4 evidence
(artifact 1 §4), it disagrees with the published bands, and it is not a
generation constraint.

**This form does not claim to satisfy the published KAR percentages**, and must
not be described as doing so until a reliable calibration method exists —
artifact 7 §6's rubric applied by two independent passes that agree. Enforced by
`KAR_CALIBRATION.claimAllowed === false` in `scripts/est-blueprint.mjs`.

---

## Difficulty

The form carries a **design-based difficulty estimate — not psychometrically
calibrated.**

That phrase is the required label. It means:

- The structural difficulty model (artifact 3) **is** used, and should keep being
  used, to give the form an appropriate mixture of cognitive demand: 12 entry,
  28 core, 7 stretch, 3 peak, dispersed rather than ramped.
- Those bands order items by **designed demand**. They do not predict how many
  students answer correctly, because the corpus contains no item statistics.
- **No item and no form may be shown to a student as being of a known
  difficulty**, and no percentage-correct may be predicted from these bands.

---

## Visual capability gaps

`R1` (not-to-scale figures) and `R2` (graph- and number-line-valued answer
choices) remain **product requirements**. See
[R1](R1-figure-renderer-requirements.md) and [R2](R2-answer-choice-schema.md).

**The prose substitutes in this form are temporary and are not accepted as a
permanent answer.** Two items (Q10, Q35) are allocated to the not-to-scale
budget, have their figures authored in full, and are delivered without a figure
until R1 exists.

**These item types stay in every future blueprint.** They are not to be removed
because the renderer cannot yet draw them; the blueprint keeps their budgets and
`scripts/validate-est-blueprint.mjs` fails if a budget floor is zeroed or a gap
is reclassified as an exam-design exclusion.

---

## The project standard

A green validator is **necessary but not sufficient**. The bar is:

**VALID · MATHEMATICALLY CORRECT · ORIGINAL · CLEAR · DIAGNOSTIC · AUTHENTIC ·
VISUALLY CORRECT · SERIES-DIVERSE**

---

## Status of the review

| Stage | State |
|---|---|
| Automated gates (artifact 8) | passing |
| Independent answer verification | 50/50 |
| Rendered and visually inspected | done |
| **Second-reader content review** | see [11-estm1-internal-review.md](11-estm1-internal-review.md) |
| Publication | **not performed, and not authorised** |

**Forms 2–25 are not to be generated** until this form has been reviewed and
approved. It is the controlled validation form for the whole series.
