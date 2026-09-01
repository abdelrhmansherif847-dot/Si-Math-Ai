# R2 — Requirements: the answer-choice schema

**A PRODUCT / RENDERING CAPABILITY REQUIREMENT, not an exam-design decision.**
Declared in [`scripts/est-blueprint.mjs`](../../../scripts/est-blueprint.mjs)
`RENDERING_CAPABILITY.graphicalChoices`; the blueprint budget for the item type
it unblocks is **retained**, not removed.

Status: **specified, not built.** The current schema is unchanged.

---

## 1. Why this exists

**An EST answer choice is not always a value.** Across the corpus, 4 items in 3
of 4 forms present their four options as *objects*:

| Observed option set | Form |
|---|---|
| Four **graphs** of absolute-value functions, differing by transformation | one |
| Four **number lines** showing candidate solution sets of a quadratic inequality | one |
| Four **systems of equations**, one of which has infinitely many solutions | one |
| Four **rows of a comparison table** — four tariffs, cheapest wins | one |
| Four **prose claims** about a bar chart, one of which is true | two |
| Four **named students**, each asserting one property of a curve | one |

The device is *occasional* (3 of 4 forms), not rare, and it is pedagogically
distinct: a graph-valued option set tests whether a student can read a
transformation off a picture, which no numeric option set can test.

**Today `exam_questions.choices` is `[{id, text}]` — one string per option.**
Systems of equations, table rows, prose claims and named students are all
expressible as LaTeX or plain text and are **authorable now**. Graphs and number
lines are **not**, and faking them as text ("the graph shifted 2 left") converts a
visual-reading item into a verbal-recognition item — a different question.

---

## 2. The target schema

An option becomes a **discriminated union** on `kind`. The existing shape stays
valid as the `text` case, so nothing already stored has to move.

```
choice := {
  id:   "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H" | "J" | "K",
  kind: "text" | "math" | "plot" | "number_line" | "chart" | "table" | "figure" | "composite",
  ...payload by kind
}
```

| `kind` | Payload | Renderer | Available today |
|---|---|---|---|
| `text` | `text: string` | plain | **yes** — the current shape |
| `math` | `text: string` (LaTeX) | existing math pipeline | **yes** — the current shape, by convention |
| `plot` | `spec` — the same plot spec `exam_stimuli` uses | `drawPlot` | needs plumbing only |
| `number_line` | `spec` — the same number-line spec | `drawNumberLine` | needs plumbing only |
| `chart` | `spec` — the same chart spec | `drawChart` | needs plumbing only |
| `table` | `spec` — the same table spec | `drawTable` | needs plumbing only |
| `figure` | `spec` — the schematic figure spec of [R1](R1-figure-renderer-requirements.md) | R1 renderer | blocked on R1 |
| `composite` | `parts: [choice…]` (one level deep, no nesting) | sequence | needs plumbing |

**The payloads are the specs the Spine already validates.** A plot-valued option
is the same object an `exam_stimuli` row would hold, so `exam_stimulus_spec_ok()`
validates it unchanged. That is deliberate: **one spec vocabulary for stimuli and
for choices**, not two.

`composite` exists for the one real mixed case — an option that is a small graph
plus a caption. It is capped at one level to keep the renderer bounded.

---

## 3. Requirements

### 3.1 Schema and storage

| # | Requirement |
|---|---|
| **C1** | The current `[{id, text}]` shape remains valid and is interpreted as `kind: "text"`. **No stored row changes.** |
| **C2** | `exam_question_choices_ok()` extends to validate the union: a known `kind`, the payload that kind requires, and for spec-bearing kinds the same spec validation `exam_stimuli` uses. |
| **C3** | `exam_question_answer_ok()` is unchanged in behaviour: `correct_answer` names an option **id**, never its content. Graphical options must not change how a key is stored. |
| **C4** | The id sets stay registry-owned (`ANSWER_CONVENTIONS` in `exam-registry.js`): `sat4` A–D, `act5alt` A–E / F–K. A choice `kind` never implies a lettering. |
| **C5** | All four options in an item **must share a `kind`**, except where `composite` is used. The corpus never mixes a graph option with a numeric one, and a mixed set would make one option visually distinctive — an unintended cue. |

### 3.2 Rendering and interaction

| # | Requirement |
|---|---|
| **C6** | Graphical options render inside the option's clickable target. The whole option — letter, graphic and any caption — is one hit area. |
| **C7** | Graphical options render at a size where the discriminating feature is legible at the smallest supported viewport. Four parabolas differing by a horizontal shift are not distinguishable at thumbnail size. |
| **C8** | Selection state is visible without relying on colour alone, and does not obscure the graphic. |
| **C9** | Every graphical option carries author-written alt text. A student using a screen reader must be able to tell the four apart. |
| **C10** | Options render deterministically, and each is covered by the visual-fidelity suite — the same standard as stimuli. |
| **C11** | Graphical options are inert: no zoom, no measurement, no interaction that would let a student measure an option a schematic deliberately does not assert. |
| **C12** | A `figure`-valued option renders under R1's not-to-scale contract, including R1/N2 — the *(Figure not drawn to scale)* label is emitted from the flag, per option. |

### 3.3 Authoring and QA

| # | Requirement |
|---|---|
| **C13** | Artifact 4's structural rules apply unchanged to object options: **no throwaway** (C7 is what makes this checkable), every option a named error, and **structural ordering** — a transformation family runs in a fixed order (identity, horizontal shift, vertical shift, reflection), never shuffled to place a key. |
| **C14** | Artifact 7's G2.9 (uniform option format) is satisfied by C5. |
| **C15** | Artifact 7's G2.11 still holds: the key letter is **read off** the structural order, never chosen. |
| **C16** | The generation engine must be able to **emit and validate** object options, not merely store them. A generator that can only produce text options cannot fill the `objectOptions` budget the blueprint retains. |

---

## 4. Sequencing

Three independent steps, in increasing cost:

1. **Plumbing for the specs that already render.** `plot`, `number_line`,
   `chart` and `table` options need no new renderer — `exam-stimulus.js` already
   draws all four. This unblocks the **graph-valued and number-line-valued option
   sets**, which are the two the corpus actually uses and the two currently
   impossible. Smallest step, largest fidelity gain.
2. **`composite`.** Only needed for mixed graphic-plus-caption options; the
   corpus shows none, so this can wait for evidence.
3. **`figure`-valued options.** Blocked on [R1](R1-figure-renderer-requirements.md).

Step 1 alone closes the gap for every object-valued option set in the corpus
except a schematic-diagram option, which the corpus does not contain.

---

## 5. Acceptance

The schema is done when all six observed option-set shapes in §1 can be authored,
stored, rendered, selected and marked — and when **the negative test fails**: an
item whose four options are four different `kind`s must be **rejected** by C5. If
a mixed set is accepted, C5 is decorative.

And one measurement, not an assertion: a graph-valued option set rendered at the
smallest supported viewport must be **looked at**, and the four options must be
distinguishable by eye. C7 cannot be verified any other way.

---

## 6. What this requirement does not decide

- **Whether to build it, and when.**
- **Whether the migration is one step or three.** §4 argues for three; that is a
  recommendation, not a constraint.
- **How a generator chooses a transformation family** for a graph-valued option
  set. That belongs in the generation engine, not the schema.
