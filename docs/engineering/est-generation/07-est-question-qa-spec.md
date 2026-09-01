# EST I Math — Question QA Specification

**Artifact 7 of 8.** Evidence tiers: [`01-est-exam-dna.md` §0](01-est-exam-dna.md).
Per-item acceptance. Artifact 8 covers the whole form.

> **Every gate here is written so that it can fail.** A gate that no real item
> would ever trip is not a gate, it is decoration — this repository has been
> caught shipping a full suite of green checks that could not have gone red
> (`docs/roadmap/verification-framework-audit.md`), and this specification is
> written against that failure. Where a gate is currently a human read rather
> than a script, it says so.

---

## 0. The disposition rule

Every gate has one of three outcomes:

- **PASS** — proceed.
- **REWRITE** — the item is re-authored from its slot. **Not patched.** Patching
  a failed distractor set produces exactly the incoherent option sets artifact 4
  §4 lists as synthetic tells.
- **REPLAN** — the slot itself is wrong (its device list cannot be carried by any
  archetype in its family). Fix `scripts/est-blueprint.mjs`, re-run the blueprint
  validator, and re-author.

There is no "accept with a note". An item either ships or it does not.

---

## 1. Solvability gates — G1

These are absolute. An item failing any of them is not an exam question.

| Gate | Statement | Method |
|---|---|---|
| **G1.1** | The item has **exactly one** correct answer among its four options. | Solve independently, then verify **every** option against the stem. |
| **G1.2** | The correct answer is **derivable from the stem alone**, with the published reference sheet and a graphing calculator. No unstated assumption. | Solve from the stem as printed, with nothing else on the desk. |
| **G1.3** | No option other than the key satisfies the stem, **including under a defensible alternative reading of the stem**. | For each distractor, attempt to construct a reading of the stem that makes it correct. If one exists, the stem is ambiguous. |
| **G1.4** | The key matches the worked explanation, **digit for digit**. | Cross-check key against explanation as a separate step. |
| **G1.5** | If the stem asks for a member of a set ("a factor of…", "which point is inside…"), the key genuinely **is** one and no distractor is. | Test each option for membership. |
| **G1.6** | Every number in the stem is used, or its being unused is deliberate and stated. | Read the stem for orphan data. |

**G1.4 exists because it has already failed here.** Three ACT items authored in
this session were keyed to a value their own explanation contradicted — one
offered five "factors" of a quadratic and none of them was a factor. The
arithmetic self-checks passed, because they verified the mathematics and not the
key. **The mathematics being right does not make the key right.**

**G1.3 is the expensive one and the one that catches ambiguity.** It is a human
read; there is no script for "is there a defensible alternative reading". Budget
for it.

---

## 2. Distractor gates — G2

| Gate | Statement |
|---|---|
| **G2.1** | **Every distractor has a name.** For each, the sentence "a student who ______ gets this option" can be completed with a specific error. No filler. |
| **G2.2** | **No throwaway.** No option is eliminable without doing mathematics — not by magnitude, not by sign alone, not by units. |
| **G2.3** | **The derived-target partner is present.** If the stem asks for anything other than what the work directly produces, the un-derived value **is** one of the three distractors. |
| **G2.4** | **The near-neighbour concept is present** where the topic has a canonical one (domain vs range, inverse vs reciprocal, permutation vs combination, with vs without replacement, radius vs diameter, slant vs perpendicular height). |
| **G2.5** | **Sign grids are complete.** If the answer carries two independent sign or magnitude choices, all four cells are the option set. Never two cells plus two unrelated values. |
| **G2.6** | **At most one pure arithmetic slip** among the three distractors, and only where G2.3–G2.5 could not fill the set. Never all three. |
| **G2.7** | **Growth and extrapolation items carry an off-by-one** in the period or interval count. |
| **G2.8** | **Modelling items have no numeric distractors.** A "which equation models this" item's wrong options are structurally wrong models. |
| **G2.9** | **Option format is uniform** — all four fractions, or all four decimals to the same precision, or all four coordinate pairs, or all four expressions of the same shape. |
| **G2.10** | **Options are in magnitude order** where they are orderable; in structural order (sign grid, Roman-numeral subsets ascending) where they are not. |
| **G2.11** | **The key letter was read off, not chosen.** |
| **G2.12** | "None of the above", if used, is **not the key**. |

**G2.1 is the gate that catches the rest.** In practice, an item that fails G2.2,
G2.6 or G2.9 will already have failed G2.1, because the option with no name is
the filler option. It is also the gate an author is most tempted to wave through,
which is why it is first.

**Scriptable today:** G2.9, G2.10, G2.12 (option format, ordering, key letter)
run mechanically against the authored item. **Human read:** G2.1–G2.8, G2.11.

---

## 3. Register and authenticity gates — G3

Drawn from artifact 5 §7.

| Gate | Statement |
|---|---|
| **G3.1** | Mathematical vocabulary matches the corpus register where a choice exists (abscissa/ordinate, "admits", "defined by", lines named `d`/`d′`/`m`). |
| **G3.2** | The English is **formal, unhurried and correct**. Register imitated; errors not. |
| **G3.3** | Given names only, weighted Arabic and Levantine. No surnames except with a title. |
| **G3.4** | Geography is regional or anonymised. No US place names or institutions. |
| **G3.5** | Context is ordinary commerce, school or civic life. |
| **G3.6** | **No distressing subject matter** — no disease case counts, mortality, conflict, or comparable material, notwithstanding that the reference forms contain some. |
| **G3.7** | Currency in US dollars; length metric; imperial volume permitted. |
| **G3.8** | Units repeated in every option and italicised; area as "unit squared". |
| **G3.9** | Commas in thousands; uniform decimal precision across the option set. |
| **G3.10** | Numbers calculator-tractable but not artificially round. |
| **G3.11** | `(Figure not drawn to scale)` present, in italic parentheses, wherever the figure must not be measured — and **absent** where the figure is to scale. |
| **G3.12** | Display equations centred above the stem and referenced as "above". |
| **G3.13** | Roman-numeral options are subsets in ascending size, with the serial comma. |
| **G3.14** | If a real-world dataset is used, **the source is named in the stem**. If the data is invented, no source is claimed. |

**G3.11 has two directions and both matter.** Printing "not drawn to scale" on an
accurate figure is as wrong as omitting it from a misleading one: it is an
instruction to the student about what they may infer, not a disclaimer.

**G3.14 is a truthfulness gate, not a style gate.** Fabricating an attribution to
a named source would be a straightforward falsehood presented to a student as
fact. It is out of bounds regardless of what it does for authenticity.

---

## 4. Slot-conformance gates — G4

| Gate | Statement |
|---|---|
| **G4.1** | The item's family matches its slot. |
| **G4.2** | Every device the slot requires is actually present and load-bearing — a "boundary" slot's item genuinely turns on strict-vs-inclusive. |
| **G4.3** | The item carries **no device its slot did not ask for**, unless the form-level budget still holds after adding it. |
| **G4.4** | The demand score computes to the slot's band. |
| **G4.5** | The item's archetype does not appear elsewhere in the form. |
| **G4.6** | The item's context does not appear elsewhere in the form, and no named person repeats. |
| **G4.7** | The item's full numeric parameter set does not appear anywhere in the series. |

**G4.2 is the gate against decorative devices.** Marking a slot "boundary" and
then authoring an item where the endpoint happens not to matter satisfies the
budget on paper and changes nothing for the student.

**G4.4 cuts both ways.** An entry-band slot filled with a three-device item is as
much a failure as a peak slot filled with a one-step item. Re-author; do not
relabel the slot to fit the item.

**Scriptable today:** G4.1, G4.4, G4.5, G4.6, G4.7 against an item bank.
**Human read:** G4.2, G4.3.

---

## 5. Rendering gates — G5

The item must survive the delivery surface, not just the document.

| Gate | Statement |
|---|---|
| **G5.1** | The item renders correctly in `exams.html` at the Question Spine's schema, including every option. |
| **G5.2** | Object-valued option sets (four graphs, four number lines, four systems, four table rows) render as objects, not as stringified text. |
| **G5.3** | Any figure conforms to `figure-system.css` and passes the visual-fidelity suite. |
| **G5.4** | Superscripts, radicals, absolute-value bars, inequality symbols and set notation render correctly at the delivered size. |
| **G5.5** | A shared stimulus is visible on every item of its set without scrolling past the options. |
| **G5.6** | The item is legible at the smallest supported viewport. |

**G5.4 is not a formality.** Reading the reference corpus, superscripts were the
single least reliable glyph in a scan; in a browser they are the least reliable
glyph at small sizes. An exponent that renders as a baseline digit changes the
question.

**G5.1–G5.6 are executed by looking at the rendered item**, not by asserting that
the renderer is correct. The repository has a standing lesson on this
(`docs/engineering/student-facing-rendering-validation.md`): two renderers
disagreed for three days and every property check stayed green, because nothing
was looking at pixels.

---

## 6. The KAR rubric

Artifact 1 §4 records that our KAR classification is Tier 4 and is **not** a
generation constraint. This rubric is what would make it one. Until two
independent passes over the same form agree, **no form may claim to hit the
published KAR bands.**

**Knowledge** — one remembered fact or one remembered procedure, applied once.
Context, if present, does not change the procedure. *Includes:* evaluate a
function at a value; take a percentage; read one value off a chart; apply a
formula from the reference sheet; solve a two-operation linear equation.

**Application** — two or more procedures, or one procedure whose *choice* is not
stated by the stem. *Includes:* read then compute; translate a situation into a
model and solve it; select a method (Vieta rather than solving; the remainder
theorem rather than long division); interpret a parameter in context.

**Reasoning** — the student must plan, generalise, or evaluate claims. *Includes:*
"which is always true"; Roman-numeral multi-statement items; "which student is
right"; constrained enumeration; explaining a mechanism from data; multi-branch
case analysis; items where the first step is choosing what to find.

**Boundary cases, stated to make the rubric reproducible:**

| Case | Band | Why |
|---|---|---|
| Percentage of a stated total, one step | K | One remembered procedure. |
| Percentage of a percentage, both stated | A | Two applications, and the chain must be built. |
| Percentage recovered backwards from a remainder | R | The student must plan the inversion. |
| Read one bar | K | Single read. |
| Read one bar, apply the axis scale factor | A | Two steps, and the second is unprompted. |
| Which appliance sold most across two years | A | Aggregation the stem does not spell out. |
| Why revenue was flat while units fell | R | Inference about a mechanism; no computation. |
| Solve a quadratic by formula | K | One remembered procedure (formula not on the sheet, but still one procedure). |
| Sum of the roots without solving | A | Method choice. |
| Sum of the roots of a factored cubic, one factor linear | R | The student must notice the ignored factor. |

**A derived target does not by itself raise the band.** It raises the *demand
score* (artifact 3), which is a different axis. An item can be Knowledge-band and
still catch students on the last line.

---

## 7. The order to run the gates

Cheapest first, so an item that will be rewritten is rewritten early.

1. **G4.1, G4.4–G4.7** — slot conformance and repetition. Scripted, instant.
2. **G1.1–G1.6** — solvability. Solve it yourself; do not trust the authoring
   step's answer.
3. **G2** — distractors. G2.1 first; most failures stop there.
4. **G3** — register. Scripted where possible, read where not.
5. **G4.2, G4.3** — are the devices load-bearing.
6. **G5** — render it and look at it.

**Nothing may be marked complete on the basis of steps 1–5.** An item that has
not been rendered and read on the delivery surface has not been checked.

---

## 8. What this specification does not do

- **It does not measure difficulty.** The demand score orders items; it does not
  predict how many students answer correctly. No item may be labelled "medium"
  or "hard" to a student on the strength of it.
- **It does not check pedagogical value.** Whether an item teaches anything is
  the gate in `CLAUDE.md`'s three questions, and it sits upstream of this
  document.
- **It does not check the explanation's quality**, only that the explanation
  agrees with the key (G1.4). Explanation quality is a separate deliverable and
  is not covered by these eight artifacts.
