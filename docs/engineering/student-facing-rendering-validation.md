# Student-facing rendering validation — the missing workflow stage

**Status: OPEN — the stage now exists as a harness, and is not yet wired into CI.**
Written 2026-08-26, from defects found in the first DSAT preview build.

> ⚠️ This repository is PUBLIC. Nothing below quotes item text, options,
> answers or figure data. Defects are described by CLASS and by the check
> that catches them. The items themselves live in the Spine's draft state
> and in the working scratchpad, and must never enter this repository.

---

## 1. Why this exists

Authored assessment content passes through four stages before a student sees
it, and until now the project verified only the first two:

```
authoring  →  item review  →  conversion  →  RENDERING  →  a student
             ✅ reviewed      ⚠️ partly      ❌ nothing
```

Item review reads the content as text. It cannot see what the browser draws.
The gap is not theoretical: **every defect listed in §3 survived a complete
whole-exam review, and two of them survived a DOM-level automated check as
well.** They were found only by rendering the page in a real browser and
looking at the pixels.

The name of the stage is the lesson. It is not "does the page load" and not
"is the JSON valid". It is: *does the thing the student looks at say what the
author meant, and can the answer still be read off it?*

## 2. What the stage checks

Three layers, because each is blind to what the next one catches.

| Layer | Question it answers | Blind to |
|---|---|---|
| **Content fidelity** | Is the rendered payload the reviewed content, byte for byte? | anything about how it is drawn |
| **Figure geometry** | Does the drawn shape still support its own answer? | anything about the page |
| **Browser end-to-end** | Does a real browser, driving the real UI, show a student a usable exam? | nothing below the pixel |

Layer 2 re-implements the renderer's curve mathematics independently and
asserts *answer-critical* properties — that a graph asked "how many solutions"
still has exactly that many crossings, that a figure called a circle is round
to within a stated pixel budget, that a curve is single-valued in x, that a
named vertex is where the question says it is.

Layer 3 loads the delivered file in headless Chromium, walks every question of
every module, exercises the routing boundary from **both** sides, and inspects
what was actually painted.

## 3. The defect classes it caught on its first run

Each of these had already passed item review. Two had also passed a DOM check.

1. **Text present in the DOM but invisible on screen.** A colour inherited
   from a broad element selector made every multiple-choice option render as
   white on white. `textContent` was correct throughout, so no DOM assertion
   could see it. The exam was unusable and looked, in code, entirely fine.
   → caught by a **computed-contrast** check, not by reading the DOM.

2. **A coordinate plane drawn with unequal axis scales.** Circles render as
   ellipses, right angles stop looking right, and every slope misreads. The
   underlying data was correct — a model-space check confirmed the points
   were exactly on a circle while the screen showed an ellipse.
   → caught by measuring **px-per-unit on each axis of the rendered SVG**.

3. **A figure's type inferred at render time.** The first renderer decided
   whether to join plotted points by pattern-matching the curve's label. A
   scatter of observations and a sampled smooth curve are byte-identical in
   the schema (see §4), so the renderer guessed — silently, per frame.
   → replaced by an **enumerated decision table with a build-time
   completeness gate**: an unlisted figure fails the build, a spare entry
   fails the build, a wrong count fails the build.

4. **A closed shape left open.** A figure sampled around a closed curve was
   drawn as an open polyline, leaving a large visible gap on a question that
   names the shape. Measured after the fact: **110 px**.
   → caught by asserting closure of shapes declared closed.

5. **A prompt that asserts something the figure does not contain.** One item
   tells the student a particular element is drawn on the figure; the
   stimulus contains no such element. This one is **content**, not rendering:
   it is recorded for the author to decide, not silently patched.

Defects 1–4 are fixed. Defect 5 is an open content decision.

## 4. What this exposed in the schema

`exam_stimulus_spec_ok`'s `plot` kind validates *where* points are and cannot
express *what they are*. These three figures are indistinguishable in the
spec, and mean entirely different things to a student:

* a scatter of individual observations — must never be joined
* a sampled smooth curve — must be joined and smoothed
* a polygon — must be joined with straight segments

The same gap covers whether a plot is a **coordinate plane** (equal axis
scales, geometry readable) or a **data plot** (axes measuring different
quantities, where squaring the scales would be meaningless).

The M4 migration's own test decides where these belong. It puts open/closed
number-line endpoints in the semantic core *because they encode `<` versus
`<=`* — a rendering choice that changes what the figure asserts is semantic.
By that test **both of these are semantic**, and neither has a home in the
validated core. `display` is explicitly the place for hints a renderer *may*
honour, so smuggling them there would let a conforming renderer invert a
figure's meaning.

> **CLOSED 2026-08-27, by (a). Everything above this line is the state of the
> question, not the state of the system.** The options were (a) extend the
> `plot` semantic core in a new migration, (b) accept them as `display` hints
> and give up the guarantee, or (c) keep them outside the spec and require every
> renderer to carry the same enumerated table. The preview did (c), which was
> honest for a preview and does not scale to two renderers — and two renderers
> is exactly what the repository then grew.
>
> Two migrations took (a), and both are applied:
>
> * `20260827a_stimulus_reading` — `spec.frame` (`plane` | `graph` | `data`),
>   what a plot IS; and `exam_questions.reading`, what is asked of it. See
>   `reading-field-proposal.md`.
> * `20260827b_plot_figures` — `spec.figures[]`, one entry per curve in order,
>   whose mode the database validates against the frame. See
>   `figures-field-proposal.md`.
>
> So a plot spec now says what its own figure is, and the bar on publishing a
> plot-bearing form is lifted **on this ground**. Every other publish gate still
> applies.
>
> The renderer caught up on 2026-08-29 — see §7.

## 5. Where the harness lives

The harness is content-adjacent and therefore lives with the content, in the
working scratchpad, not in this repository. It is three scripts — figure
geometry, content fidelity, browser end-to-end — plus a generator that embeds
the reviewed payload into a self-contained page.

**Wiring it into `tests/run-all.mjs` was deferred until a renderer existed in
`_shared/`.** The M4 migration states where that renderer belongs, and why:
*"Rendering is delivery-phase work and belongs in `_shared/` so preview and
delivery cannot draw the same question two ways."* The checks above are written
against a renderer; duplicating them against a preview-only one would be the
second copy that rule exists to prevent.

**That renderer now exists** — `supabase/functions/_shared/exam-stimulus.core.js`,
§7 below — so the precondition is met. The harness itself still cannot move into
this repository, because it embeds the content it checks and this repository is
public. What CAN move, and what §7 delivers, is the renderer's own behaviour: the
refusals and the family rules are now `tests/exam-stimulus.test.mjs`, in CI, on
synthetic specs. Layers 1 and 2 — content fidelity and figure geometry against
the real items — stay with the content.

## 6. The rule this produced

> **A green check on assessment content is only evidence if it was taken
> from the pixels a student sees.**

Every check in §2 was mutation-tested against the exact defect it is meant to
catch, and two were rewritten after the first attempt proved dead: they read
the same field they were meant to police, so mutating that field moved the
check and the defect together. A check that reads its subject's own
declaration of correctness is not a check. Each now compares the rendering
against an **independently written** statement of intent.

This is the same failure the verification-framework audit named, arriving in a
new place: *a green check is only evidence if it could have gone red.*

---

## 7. The fold — one renderer, authored once

**Done 2026-08-29, ahead of question delivery.** §5 deferred this until a
renderer existed in `_shared/`. It now does, and getting there found that the
repository had grown the exact thing the M4 migration forbids.

### There were two, and the labels were backwards

| file | what its header said | what actually read it |
|---|---|---|
| `exam-stimulus.js` | *"Si Math AI — MATH STIMULUS RENDERER"*, `DRAFT — NOT WIRED`, `⛔ BLOCKED ON A SCHEMA DECISION` | its own test, and three superseded design-plate builders |
| `scripts/explore-render.js` | *"EXPLORATION COPY — not production, not wired to anything"* | every preview build, five figure checks, and **`exam-graph-zero.js` — a shipped module** |

The file calling itself production had fallen a schema generation behind: it
still took `frame` and `figures` out of band through `opts`, three days after
the migrations that put them on the row. The file calling itself an exploration
copy read them off the row, refused a plot without `figures[]`, and carried
`renderForQuestion(question, stimulus)` — the entry point content goes through.

Nothing caught this because nothing was looking. A preview and a delivery
drawing one row two ways is not a hypothetical the M4 comment was guarding
against; it was two files apart, and the exam would have been where it showed.

### What the fold did

* **One authored source**: `supabase/functions/_shared/exam-stimulus.core.js`,
  exporting `SiExamStimulus`. The schema-aware renderer, with the stale DRAFT
  and BLOCKED banners removed because both were false by the time they were
  read, and the history kept in the header so the next reader knows why.
* **One generated copy**: `exam-stimulus.js`, written by
  `scripts/sync-exam-stimulus.mjs` — the `study-planner.core.js` pattern, sync
  on direct run only, so the validator can never repair the file it is about to
  assert on.
* **`scripts/explore-render.js` is gone.** Its callers — five preview builders,
  five figure checks and `exam-graph-zero.js` — now read the core. The builders
  resolve it from their own path rather than the working directory, and none of
  them holds a snapshot: the renderer is read at build time, which is the rule
  `mkpreview.py` wrote after a pasted copy went stale and fixes silently stopped
  reaching the preview.
* **`scripts/validate-exam-stimulus.mjs`** is the CI gate — copy drift, the fork
  staying gone, no stale status banner, generated previews not falling behind,
  and the schema fields actually being read rather than merely claimed in a
  comment. Every check was mutation-tested; each goes red under the change it
  exists to catch.

### The test suite could not fail

`tests/exam-stimulus.test.mjs` never called `t.done()`. Every other suite does.
`run-all.mjs` decides pass/fail on the exit code, so the suite **printed `FAIL`
and exited 0** — it had been a vacuous gate since it was written, and CI would
have stayed green through any defect it caught. Fixed, and proven: four
deliberate mutations of the renderer now produce failures *and* a non-zero exit.

That is the §6 rule landing on the checker rather than the checked. *A green
check is only evidence if it could have gone red* — and this one could not,
for reasons that had nothing to do with what it asserted.

### What the suite asserts now

The grid rule changed with the fold, so its check was rewritten rather than
relaxed. `niceStep` holds the gridline count between 6 and 9 at every span from
4 to 1000, so "a major every fifth line" is usually one or two majors, one of
them hidden under the axis — the survivor read as a heavy stray line through
the figure. The tier now engages only where at least three majors fall in the
window. **Both branches are asserted**, because checking only the engaged one
would pass a renderer that had quietly lost the threshold.

Added with the fold, all against synthetic specs:

* where `reading` applies, as an independently written table over every
  kind × frame — plus a check that the SQL still states the rule the JS
  mirrors, so the two cannot drift apart in silence;
* the four refusals: no `figures[]`, a missing `reading`, a `reading` supplied
  where nothing renders by it, and a stimulus with no question;
* **one stimulus row, two readings, two different figures** — the property the
  `reading` column exists for. If they came out the same the column would be
  decorative and the migration bought nothing;
* the family rule as a table (`plane` always ruled; `graph`/`data` ruled only
  for a value; an undeclared frame throws rather than guessing a look), and the
  derived sub-grid resolution;
* that a negative numeral keeps its sign.

### One thing left behind, deliberately

Three design-plate builders — `build-stimulus-plates.py`,
`build-figure-vocabulary.py`, `build-renderer-eval.py` — predate the
frame/reading vocabulary and call `renderStimulus()` with a bare stimulus. They
still *build*; their pages will now throw in a browser for a chart or a
graph/data plot, because that path is deliberately closed. They are superseded
design explorations, their outputs are gitignored, and every one was already
published as an artifact. They were not repaired, and this paragraph exists so
that is a decision on the record rather than a surprise later.
