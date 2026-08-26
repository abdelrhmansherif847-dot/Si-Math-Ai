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

**This is an open design decision, deliberately not taken here.** The options
are (a) extend the `plot` semantic core with a shape/aspect declaration in a
new migration, (b) accept them as `display` hints and give up the guarantee,
or (c) keep them outside the spec and require every renderer to carry the
same enumerated table. The preview currently does (c), which is honest for a
preview and does not scale to two renderers.

Until it is decided, **no plot-bearing form should be published**: publication
freezes the spec forever, and a published plot spec cannot currently say what
its own figure is.

## 5. Where the harness lives

The harness is content-adjacent and therefore lives with the content, in the
working scratchpad, not in this repository. It is three scripts — figure
geometry, content fidelity, browser end-to-end — plus a generator that embeds
the reviewed payload into a self-contained page.

**Wiring it into `tests/run-all.mjs` is deferred until a renderer exists in
`_shared/`.** The M4 migration already states where that renderer belongs, and
why: *"Rendering is delivery-phase work and belongs in `_shared/` so preview
and delivery cannot draw the same question two ways."* The checks above are
written against a renderer; duplicating them against a preview-only one would
be the second copy that rule exists to prevent.

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
