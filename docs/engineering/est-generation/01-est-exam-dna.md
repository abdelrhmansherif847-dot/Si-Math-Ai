# EST I Math — Exam DNA

**Artifact 1 of 8** in the EST generation specification. Written 2026-09-01.
Nothing in this file may be used to generate a form until artifacts 1–8 are
complete; artifact 6 is the only executable spec.

> **This file contains no exam content.** The repository is public. Reference
> items live only in the working corpus outside the repo, and are described
> here by structure, never transcribed. Any example in these documents is
> written by us to illustrate a structure, not copied from a reference form.

---

## 0. Evidence tiers — the labelling used across all eight artifacts

Every claim in artifacts 1–8 carries one of these tags. A claim without a tag
is a defect in the document.

| Tier | Label | Means |
|------|-------|-------|
| **T1** | PUBLISHER-AUTHORITATIVE | Printed by the exam publisher in the reference material's own front matter. Not inferred. |
| **T2** | STRONGLY SUPPORTED | Measured across the corpus and present in **all four** forms, or a count with a clear margin. |
| **T3** | INFERRED / MEDIUM | Present in 2–3 forms, or measured but dependent on our own classification judgement. |
| **T4** | LOW CONFIDENCE / INSUFFICIENT EVIDENCE | One form only, or contradicted by part of the evidence. **Never becomes a generation rule.** |

**The rule that governs all of them:** a pattern does not become a hard
generation constraint unless it is T1 or T2. T3 patterns may become *soft
preferences* with an explicit tolerance. T4 patterns are recorded so that a
later corpus can promote or kill them, and are otherwise inert.

### Frequency vocabulary

Used consistently for every archetype and device count:

| Term | Definition |
|------|------------|
| **core recurring** | Appears in all 4 forms |
| **occasional** | Appears in 2–3 forms |
| **rare** | Appears in 2–3 forms with ≤3 total instances |
| **form-specific** | Appears in exactly 1 form |

---

## 1. The corpus

**T1 — corpus composition.** Four distinct EST I Math forms, all from the
publisher's own preparation guide, all 50 items each; **200 items total, every
one read and classified individually**.

| Working label | Items | Notes |
|---|---|---|
| Form 1 | 50 | Also the source of the guide's printed front matter and reference sheet |
| Form 2 | 50 | |
| Form 3 | 50 | |
| Form 5 | 50 | Supplied twice; the two files are **byte-identical** (sha256 `a58d525dff0a…`), so they are one form, not two |

**Form 4 is absent from the corpus.** Four forms, not five. Any statement in
these artifacts that says "all forms" means these four.

**T2 — what the corpus does not contain.** No EST score-conversion table, no
published item difficulty statistics, no p-values, and no official
classification of any individual item into the publisher's own domain or
cognitive categories. Every per-item classification in these artifacts is
**ours**, and that limitation is carried forward explicitly wherever it
matters (notably §4).

**Known transcription limit.** The guides are page scans, not text. Superscripts
in particular are unreliable: one item in Form 5 is printed with what reads as a
cubic exponent but must be a square for its own stimulus table to be consistent,
and one item in Form 1 cannot be reconciled with any listed option under the
coefficient as scanned. Both are recorded as such. **No rule in these artifacts
rests on an item we could not solve.**

---

## 2. Structure — what the publisher states

**T1 — all of §2 is printed by the publisher.**

| Property | Value |
|---|---|
| Test | EST I, Mathematics section (EST-HS: Electronic Scholastic Test for High School) |
| Duration | **75 minutes** |
| Items | **50** |
| Sections | **One**. No modules, no adaptive stage, no break |
| Item format | **100% multiple choice, 4 options (A–D)**. No grid-ins, no student-produced responses, anywhere in 200 items |
| Calculator | **Allowed throughout**; a graphing calculator is expected, and the publisher's own advice assumes radian/degree mode handling |
| Score | Scaled to 800 |
| Guessing | The cover says "Avoid guessing"; the publisher's study advice says an educated guess after eliminating 2–3 options is worth it. **No wrong-answer penalty is stated anywhere.** |
| Perfect score | The publisher states a student "does not have to correctly answer all 50 questions to get a perfect score of 800" |

Time budget: **90 seconds per item** on average.

**T1 — reference sheet given to the student.** Circle area and circumference;
rectangle area; triangle area; Pythagoras; the 30-60-90 and 45-45-90 special
triangles; volumes of rectangular solid, cylinder, sphere, cone, pyramid;
360° / 2π in a circle; triangle angle sum.

**T2 — and what is deliberately *not* on it.** The quadratic formula, slope,
distance, midpoint, the trigonometric ratios, arc length, sector area, the
exponent and radical laws, averages, the probability rules, the sum and product
of roots, and every surface-area formula. **Requiring a formula that is not on
the sheet is a difficulty lever the exam uses on purpose** — 11 of 200 items
(occasional, 3 of 4 forms) turn on recalling one, most often slope, distance,
midpoint, or Vieta's relations. Artifact 3 treats this as a calibrated lever.

**T1 — this contradicts our shipped form.** `ESTM1-2026-A` currently contains
8 grid-in items. Real EST I Math has none. Artifact 8's gate on item format is
the one that would have caught it.

---

## 3. Content domains — published bands versus what the forms actually do

**T1 — the publisher's stated domain weights:**

| Domain | Published band |
|---|---|
| Foundational Algebra | 27–32% |
| Data Analysis and Probability | 27–32% |
| Advanced Algebra and Functions | 27–32% |
| Geometry and Trigonometry | 8–13% |

**T3 — measured, using our classification of all 200 items:**

| Form | Foundational Alg. | Data & Prob. | Advanced Alg. | Geometry & Trig |
|---|---|---|---|---|
| Form 1 | 11 (22%) | 16 (32%) | 17 (34%) | 6 (12%) |
| Form 2 | 15 (30%) | 13 (26%) | 18 (36%) | 4 (8%) |
| Form 3 | 14 (28%) | 16 (32%) | 17 (34%) | 3 (6%) |
| Form 5 | 15 (30%) | 13 (26%) | 17 (34%) | 5 (10%) |
| **Pooled** | **55 (28%)** | **58 (29%)** | **69 (34%)** | **18 (9%)** |

Read this carefully, because it is easy to over-claim:

- **Foundational Algebra and Data & Probability sit inside their published
  bands** in 3 of 4 forms each, and pooled both land inside. **T2.**
- **Advanced Algebra sits above its published band in every single form** (34%,
  36%, 34%, 34% against a ceiling of 32%). Four for four, with no form even
  touching the band. **T3, not T2** — because the excess is 2–4 points and our
  classification boundary is exactly where it would show up. Several items we
  called Advanced Algebra (Vieta's relations, exponent laws, absolute-value
  manipulation) could defensibly be called Foundational Algebra by the
  publisher, and moving three items per form would close the gap entirely.
  **The honest statement is: either the forms run advanced-heavy, or our
  boundary is drawn one notch lower than the publisher's. We cannot tell which
  from this corpus.**
- **Geometry & Trigonometry is the smallest domain by a wide margin and sits at
  or below the published floor** — 6% and 8% in two forms against a floor of 8%.
  **T2 for the magnitude** (it is unambiguously the smallest domain; that
  conclusion does not depend on classification judgement), **T3 for the exact
  percentage.**

**Generation consequence.** Target the published bands, which are T1, not our
measurement, which is T3. Where the two disagree, the published band wins and
the disagreement is documented. **Geometry must be held to 8–13% — 4 to 6 items
out of 50.** Our shipped `ESTM1-2026-A` runs about 30% geometry, roughly three
times the ceiling; that is its second published-spec violation.

**T2 — geometry is never clustered.** Across all four forms the geometry items
are scattered through the paper with no two adjacent in three of the four forms,
and never more than two adjacent. Measured positions: Form 1 at 14/15/17/43/44/50,
Form 2 at 6/10/15/28, Form 3 at 6/27/41, Form 5 at 8/30/32/45/48.

---

## 4. The KAR cognitive model — where our measurement disagrees with the publisher

**T1 — the publisher's own cognitive framework and weights:**

| Band | Published | Publisher's description |
|---|---|---|
| **Knowledge** | 35–45% | Simple skills; single-step recall or procedure |
| **Application** | 45–55% | Analysis, evaluation, inference, interpretation |
| **Reasoning** | 5–15% | Planning, abstraction, generalisation, multi-step work |

**T4 — our measurement, and why it is T4:**

| Form | Knowledge | Application | Reasoning |
|---|---|---|---|
| Form 1 | 9 (18%) | 26 (52%) | 15 (30%) |
| Form 2 | 5 (10%) | 38 (76%) | 7 (14%) |
| Form 3 | 6 (12%) | 34 (68%) | 10 (20%) |
| Form 5 | 9 (18%) | 34 (68%) | 7 (14%) |
| **Pooled** | **29 (14%)** | **132 (66%)** | **39 (20%)** |

This does not match the published bands, and the mismatch is large: we found
Knowledge at 14% against a published 35–45%, and Reasoning at 20% against a
published 5–15%.

**We are not concluding that the publisher's own weights are wrong about the
publisher's own exam.** The far likelier explanation is that our Knowledge bar
is set too high. We classified as "Application" a great many items that are a
single remembered procedure wearing one coat of context — evaluate a function,
take a percentage, read one value off a chart — and the publisher's
"simple skills, single-step" description plainly covers those. Reclassifying
them would move roughly 25–30% of items from Application to Knowledge and land
close to the published split.

The corpus contains **no publisher-classified exemplar of any KAR band**, so
there is nothing to calibrate against. That is precisely a Tier 4 situation and
it is treated as one.

**Generation consequence, stated plainly:**

1. **The published T1 bands are the generation target.** 35–45% Knowledge,
   45–55% Application, 5–15% Reasoning.
2. **Our KAR classification is not used as a generation constraint at all.** It
   is retained only as an internal difficulty proxy (artifact 3), where its
   *relative* ordering is useful even though its absolute calibration is not.
3. Artifact 7 defines a KAR rubric with worked boundary cases so that our
   classification becomes reproducible. Until a form is classified against that
   rubric by two independent passes that agree, **no form should claim to hit
   the published KAR bands.**

---

## 5. Difficulty across the paper — an easy opening, then flat

Using an internal difficulty proxy (cognitive band + whether the stem asks for a
derived rather than a direct quantity + count of stacked devices), by
position block, all four forms:

| Block | Form 1 | Form 2 | Form 3 | Form 5 | All |
|---|---|---|---|---|---|
| Q1–10 | 1.75 | 2.15 | 2.55 | 2.35 | **2.20** |
| Q11–20 | 2.70 | 2.40 | 2.60 | 2.20 | 2.48 |
| Q21–30 | 2.15 | 2.55 | 2.60 | 2.30 | 2.40 |
| Q31–40 | 2.55 | 2.35 | 2.85 | 2.55 | **2.58** |
| Q41–50 | 2.95 | 2.65 | 2.20 | 2.30 | 2.52 |

And the band distribution by position, pooled over all four forms:

| Block | Knowledge items | Reasoning items |
|---|---|---|
| Q1–10 | 9 / 40 (22%) | 3 / 40 (8%) |
| Q11–20 | 6 / 40 (15%) | 10 / 40 (25%) |
| Q21–30 | 7 / 40 (18%) | 5 / 40 (12%) |
| Q31–40 | 2 / 40 (5%) | 11 / 40 (28%) |
| Q41–50 | 5 / 40 (12%) | 10 / 40 (25%) |

**T3 — the shape is: a gentler opening block, then flat.** Q1–10 is the easiest
block in three of the four forms and carries the highest share of single-step
items and the lowest share of reasoning items. **After roughly Q10 there is no
ramp** — blocks 2 through 5 sit within 0.18 of each other pooled, and the
per-form series go up and down rather than climbing. Form 1 rises to the end;
Form 3 *falls* over its last block.

**T2 — the exam does not ramp like the ACT and does not stage like the digital
SAT.** It is one fixed 50-item section with an easy on-ramp. That is the
structural consequence of a single non-adaptive section, and it is the single
most important thing to get right in a generated form: **a steadily climbing
difficulty curve would be inauthentic.**

**Generation rule (from T2/T3):** Q1–8 carry the highest concentration of
single-step items and no more than one Reasoning item. From Q9 to Q50,
difficulty is deliberately unordered — hard items appear in the twenties, easy
items appear in the forties. Artifact 8 gates this as a *dispersion* check, not
a monotonicity check.

---

## 6. Shared-stimulus sets

**T2 — every form uses them; the number varies a lot.**

| Form | Sets | Items in sets | Positions and sizes |
|---|---|---|---|
| Form 1 | 2 | 6 (12%) | Q4–5 (2, model), Q29–32 (**4**, grouped bar) |
| Form 2 | 5 | 12 (24%) | Q4–5 (2, model), Q20–22 (3, line), Q31–33 (3, table), Q39–40 (2, table), Q44–45 (2, scatter) |
| Form 3 | 5 | 11 (22%) | Q7–8 (2, graph), Q16–18 (3, table), Q24–25 (2, scatter), Q42–43 (2, **prose only**), Q45–46 (2, two-series line) |
| Form 5 | 3 | 8 (16%) | Q9–11 (3, curve), Q14–16 (3, grouped bar), Q43–44 (2, table) |
| **Pooled** | **15** | **37 (18.5%)** | |

**T2 findings:**
- **Set size is 2 or 3 in 14 of 15 sets.** One set of 4 exists (Form 1). No set
  of 5 or more anywhere.
- **Every form places its first set in the first quarter** — Q4, Q4, Q7, Q9 —
  and its last set in the last quarter — Q29, Q44, Q45, Q43.
- **A shared stimulus need not be a figure.** Form 3's Q42–43 set is plain prose
  with no graphic at all. Any rule that assumes "stimulus ⇒ image" is wrong.
- Sets are always contiguous and always introduced by an explicit
  "Questions X to Y refer to…" heading.

**T3 — within a set, the questions probe different things, and the order is not
a ramp.** Form 1's four-item set runs comprehension → single read → single read
→ multi-condition scan. Form 2's three-item set opens with its hardest item.
Form 5's set runs interpret-the-intercept → scaled read → chained computation.
The reliable statement is that a set covers **distinct** skills on one stimulus;
the unreliable statement — which we are not making — is that it ramps.

**Generation rule:** 3–5 sets per form, 2–3 items each (one set of 4 permitted),
8–12 items in sets total; first set inside Q4–Q10, last set inside Q40–Q47; at
least one set on a non-graphical stimulus per two forms.

---

## 7. Stimulus inventory

**T2 — count of items carrying each stimulus type, across 200 items:**

| Stimulus | Items | Forms | Class |
|---|---:|---|---|
| Table (data) | 15 | 4/4 | core recurring |
| Geometric figure | 10 | 4/4 | core recurring |
| Grouped/paired bar chart | 8 | 3/4 | occasional |
| Scatterplot | 5 | 3/4 | occasional |
| Function graph on axes | 5 | 4/4 | core recurring |
| Single-series line graph | 4 | 3/4 | occasional |
| Two-series line graph | 2 | 1/4 | form-specific |
| Algebraic model as shared stimulus | 4 | 2/4 | occasional |
| Pie chart | 2 | 2/4 | occasional |
| Prose-only shared stimulus | 2 | 1/4 | form-specific |
| Smooth cost/production curve | 3 | 1/4 | form-specific |
| Coordinate grid (counting squares) | 1 | 1/4 | form-specific |
| Stem-and-leaf plot | 1 | 1/4 | form-specific |
| Cumulative-frequency polygon | 1 | 1/4 | form-specific |
| Three curves on one axis | 1 | 1/4 | form-specific |
| Listed data set (inline) | 1 | 1/4 | form-specific |
| Science-text stimulus (no graphic) | 1 | 1/4 | form-specific |
| Graphs **as the four options** | 1 | 1/4 | form-specific |
| Number lines **as the four options** | 1 | 1/4 | form-specific |

Roughly **35% of items carry a stimulus of some kind**; the rest are
self-contained.

**T2 — the option set is not always text.** At least one item per form presents
its four options as objects rather than values (four graphs, four number lines,
four systems of equations, four rows of a comparison table). This is a genuine
and repeated feature, not a curiosity, and any delivery surface for a generated
EST form must support it.

**T3 — the long tail is deliberate.** Nine stimulus types appear exactly once
in 200 items. A generated form that only ever uses tables, bars and scatterplots
would be measurably less varied than every reference form. Artifact 6 requires
at least one *rare-tail* stimulus per form.

---

## 8. Answer key — measured, and it is not what a designer would build

**T2 — key letter counts:**

| Form | A | B | C | D | Longest run | Run lengths present |
|---|---:|---:|---:|---:|---|---|
| Form 1 | 10 | 13 | 14 | 13 | 3 | 1×30, 2×7, 3×2 |
| Form 2 | 9 | 17 | 14 | 10 | **5** | 1×29, 2×6, 4×1, 5×1 |
| Form 3 | 9 | 11 | 18 | 12 | 3 | 1×37, 2×5, 3×1 |
| Form 5 | 9 | 12 | 15 | 14 | 3 | 1×28, 2×5, 3×4 |
| **Pooled** | **37 (18.5%)** | **53 (26.5%)** | **61 (30.5%)** | **49 (24.5%)** | | |

Three findings, with their strength stated honestly:

1. **A is under-used, consistently.** 9, 9, 9, 10 — A is the least-frequent key
   in all four forms, and the counts are remarkably tight. Pooled, A is 18.5%
   against 25% uniform (z ≈ −2.1, p ≈ 0.03 two-tailed on its own). The
   *consistency* is the stronger signal than the magnitude: were letters
   exchangeable, A being lowest in all four forms has probability well under 1%.
   **T2.**
2. **There is no anti-run rule.** The adjacent-repeat rate is 22.4% pooled
   (44 of 196), statistically indistinguishable from the 25% a random key would
   give. Form 2 contains a run of four and a run of five. **T2 — and it kills
   the intuition that real forms avoid runs.**
3. **There is no local balancing.** In per-10-item blocks, a single letter
   reaches 6 of 10 on four occasions across the corpus.

**Generation consequence, and a deliberate departure.** The observed key is
essentially random with an A deficit. We are **not** going to reproduce the A
deficit — it is an artefact of the reference forms' authoring, it makes A a
marginally worse guess than the other letters, and copying it would import an
unfairness for no fidelity gain. Artifact 8 will require each generated form to
be **11–14 of each letter with a run cap of 3**, which is tighter than any
reference form. **This is recorded as an intentional departure from measured
DNA, on fairness grounds, not as a finding.** Everything else about key
construction follows the corpus.

---

## 9. Item independence — the strongest single structural finding

**T2, and the most useful measurement in this artifact.**

Classifying all 200 items to a fine-grained archetype (191 distinct archetypes):

| Form | Distinct archetypes in its 50 items | Repeats within the form |
|---|---|---|
| Form 1 | 49 | 1 (two "build the model equation" items) |
| Form 2 | 49 | 1 (two parameter-interpretation items, and they share one stimulus) |
| Form 3 | **50** | none |
| Form 5 | **50** | none |

**Within a form, an archetype essentially never repeats.** Two of the four forms
have 50 distinct archetypes in 50 items. Both exceptions are benign: one is a
stimulus-sharing pair.

And across forms, at the same fine granularity, **only 7 of 191 archetypes
appear in more than one form.**

But roll the same 200 items up to the family level and the picture inverts:
**16 of 18 archetype families appear in all four forms** (artifact 2 carries the
table). The two that do not are near-misses, present in 3 of 4.

**This is the generation rule that matters most:**

> The **family mix is nearly fixed** across forms. The **specific archetype
> inside each family is almost completely refreshed** between forms, and never
> repeats inside one form.

A generator that samples archetypes independently will produce forms with
duplicate archetypes and will read as synthetic immediately. Artifact 6 encodes
this as a hard constraint and artifact 8 gates it.

---

## 10. What this artifact establishes, in one page

**Hard constraints (T1/T2) — a generated EST form must:**

1. Be one section: 50 items, 75 minutes, no modules or breaks.
2. Be 100% four-option multiple choice. **Zero grid-ins.**
3. Assume a graphing calculator throughout.
4. Assume the given reference sheet, and treat any formula outside it as a
   deliberate recall demand rather than an accident.
5. Hit the published domain bands, with **Geometry & Trigonometry at 8–13%
   (4–6 items)** — the tightest and most-often-violated of the four.
6. Have an easier opening block (roughly Q1–8) and **no ramp thereafter**.
7. Contain 3–5 shared-stimulus sets of 2–3 items (one set of 4 permitted),
   totalling 8–12 items, first set by Q10 and last set after Q40.
8. Carry a stimulus on roughly a third of items, drawn from a wide inventory
   including at least one rare-tail type.
9. Present at least one item whose four options are objects (graphs, number
   lines, systems, table rows) rather than values.
10. **Repeat no archetype within the form**, while keeping the family mix stable
    across forms.

**Soft preferences (T3) — with tolerances, not gates:** the Advanced Algebra
share, the exact geometry percentage, the within-set skill ordering, and the
rare-tail stimulus choice.

**Not a constraint (T4):** our KAR classification. The published KAR bands
are the target; our measurement of them is not evidence.

**Two published-spec violations already shipped**, both caught by this artifact
and both fixed in artifact 8's gates: `ESTM1-2026-A` has 8 grid-ins where the
exam has none, and roughly 30% geometry where the ceiling is 13%.
