# ESTM1-2026-A — rebuild record

**2026-09-01.** The form was rebuilt from
[artifact 6's blueprint](06-est-generation-blueprint.md), not patched. It remains
**DRAFT and admin-only**; no student has seen either version.

> No exam content in this file. The repository is public. Items live in the
> author's content directory outside it.

---

## 1. Why a rebuild and not a patch

The previous form failed two **PUBLISHER-AUTHORITATIVE** gates:

| Gate | Before | Published requirement |
|---|---|---|
| **F2** item format | **8 grid-in items** | 100% four-option multiple choice |
| **F3** geometry share | **15 of 50 = 30%** | 8–13%, i.e. 4–6 items |

Neither is a judgement call: the publisher prints both in its own front matter.

Three further defects were structural rather than per-item, and are the reason a
patch could not have fixed it:

- **No shared-stimulus sets, and no stimuli at all.** Every reference form has
  2–5 sets covering 8–12 items, and carries a stimulus on 14–18 items. The old
  form had zero of both. It was a bank of 50 standalone questions.
- **Essentially no derived targets.** The exam's signature device — the stem asks
  for something other than what the work produces, with the un-derived value
  offered — appeared on almost nothing.
- **Register drift.** Currency in EGP where the corpus uses US dollars
  throughout; lines named `ℓ` where the corpus names them `d`, `d′`, `m`.

Removing 8 grid-ins and 9–10 geometry items, then back-filling 17 slots and
adding four shared-stimulus sets, is a re-author of a third of the paper.

---

## 2. What the rebuilt form is

| Property | Value | Gate |
|---|---|---|
| Items | 50, one section, 75 minutes | F1 ✓ |
| Format | **100% four-option MCQ, zero grid-ins** | F2 ✓ |
| Foundational Algebra | 15 (30%) | F3 ✓ (27–32%) |
| Data Analysis & Probability | 16 (32%) | F3 ✓ |
| Advanced Algebra & Functions | 14 (28%) | F3 ✓ |
| **Geometry & Trigonometry** | **5 (10%)** | F3 ✓ (8–13%) |
| Demand bands | entry 12, core 28, stretch 7, peak 3 | B1 ✓ |
| Answer key | A 12, B 14, C 12, D 12; longest run 2 | B2 ✓ |
| Distractor classes | all 9 present; largest dominant class 14% | B5 ✓ |
| Distinct archetypes | **50 in 50 items** | C1 ✓ |
| Shared-stimulus sets | 4, covering 10 items (Q6–8, Q19–20, Q29–31, Q43–44) | C3 ✓ |
| Items carrying a stimulus | 16 allocated / 14 delivered | C4 ✓ |
| Derived targets | 10 | ✓ (6–12) |

Gate detail is in [artifact 8](08-est-exam-qa-spec.md); the audit is
`scripts/audit-est-form.mjs`, run against the content directory.

---

## 3. How it was verified

**Every item was re-solved independently** from its stem — not from the authoring
working — and the computed answer compared with the stored key. That is artifact
7 gate G1.4, and it is the gate that caught three mis-keyed ACT items earlier in
this project. 50 of 50 agree.

Two items were flagged on the first pass. **Both were bugs in the verifier, not
the items**: a sign error in the checker's own line-through-a-point computation,
and a string comparison too crude for a LaTeX rearrangement. Both were fixed and
re-run rather than waved through.

**The form was then sat on the real surface** — the real `exams.html`, the real
stimulus renderer, the real stylesheets — and the rendered pixels were looked at,
not merely asserted. Three defects were found that way and none of them would
have shown up in a property check:

| Found | Fix |
|---|---|
| The stem-and-leaf's leaves collapsed: `1 1 4 6 8` rendered as `11 4 6 8`, which reads as four values instead of five. **Ambiguous data.** | Non-breaking separators, so the gaps cannot collapse. |
| The grouped bar chart's `Morning` series label sat on top of the Wednesday bar. | The chart's numbers were re-chosen so both direct labels land clear. The approved chart grammar was not touched. |
| The Roman-numeral item's three statements ran inline into one sentence. | `rich()` in `exams.html` now treats an authored newline as a line break. |

The third is a **change to a shipped page**, and it is a fix rather than a
workaround: every reference form sets I./II./III. on their own lines, and the
alternative was to write the item inline, which is both harder to read and not
how the exam sets it.

**One thing I initially got wrong.** I first read the table renderer's unused
`sx-num` class as a bug. It is not: `scripts/validate-exam-surface-css.mjs`
records it as a deliberate decision — the approved table grammar aligns by column
position, so the numeric marking carries no treatment. The stem-and-leaf's leaf
column is therefore right-aligned, which is not how a stem-and-leaf is
conventionally set. **That is a presentation gap for the figure system to weigh,
not something to fix by quietly changing an approved grammar for one item.**

---

## 4. Items that need rendering support that does not exist

Both are **PRODUCT / RENDERING CAPABILITY GAPS**, not exam-design exclusions. The
blueprint keeps their budgets ([R1](R1-figure-renderer-requirements.md),
[R2](R2-answer-choice-schema.md)).

| Item | Needs | Interim |
|---|---|---|
| **Q10** — right triangle with an altitude to the hypotenuse | A not-to-scale schematic figure | Authored in full, figure spec held. Delivered with the geometry stated in prose. **No figure is shown, and the item does not say "not drawn to scale"** — there is nothing not to scale. |
| **Q35** — similar triangles cut by a parallel, from an area ratio | Same | Same |
| **Q47** — four students each asserting one property of a curve | Object-valued options | **Delivered.** Prose-claim option sets are text-expressible, so this half of the device works today. Graph- and number-line-valued options remain blocked. |

So the form **allocates** 2 items to the not-to-scale budget and **delivers** 0
of them with a figure. The device is absent from the delivered paper and returns
when R1 lands. Nothing was drawn to scale and labelled as if it were not.

---

## 5. What is still an assumption rather than evidence

Stated plainly, because a green validator is not the same as a good exam.

1. **The KAR mix is not claimed.** The published bands are the target; our
   classification is Tier 4 and is not used as a constraint (artifact 6 §0b). This
   form has **not** been KAR-classified by two agreeing passes, so **it must not
   be described as hitting the published KAR bands.**
2. **The difficulty bands are uncalibrated.** There are no item statistics
   anywhere in the corpus. The demand score orders items; it does not predict how
   many students answer correctly. **This form must not be presented to a student
   as being of a known difficulty, and must not report an EST-scaled score out of
   800** — there is no conversion table and inventing one would be fabricating a
   measurement.
3. **Authenticity is judged against four preparation forms**, not against a live
   exam paper (artifact 5 §7).
4. **Two items are less authentic in delivery than as authored**, per §4.
5. **The per-distractor 40% diversity cap is a judgement, not a measurement.**
   The corpus was labelled one class per item, and that per-item cap of 30% is
   the evidence-backed one. Both are checked; only one is measured.

---

## 6. Readiness

**Ready for internal review. Not ready to publish.**

- Every automated gate passes, and the gates were mutation-tested before being
  trusted.
- Every item has been solved independently and its key checked against the
  mathematics.
- The form has been sat and looked at.

**What review still owes it:** a second person reading all 50 items for
ambiguity (artifact 7 G1.3 is a human read and cannot be automated), a KAR
classification pass, and a decision on whether the two held figures should block
publication or ship as prose.

**Publication remains a separate, irreversible act.** `publish_exam_form()` is
gated on a pre-flight, and nothing here performed it.
