# R1 — Requirements: the schematic figure renderer

**A PRODUCT / RENDERING CAPABILITY REQUIREMENT, not an exam-design decision.**
Declared in [`scripts/est-blueprint.mjs`](../../../scripts/est-blueprint.mjs)
`RENDERING_CAPABILITY.notToScaleFigure`; the blueprint budget for the item type
it unblocks is **retained**, not removed.

Status: **specified, not built.** Nothing here is implemented.

---

## 1. Why this exists

`(Figure not drawn to scale)` is printed on **8 items across all four reference
forms** — a core-recurring device (artifact 2 §4). It is not a legal disclaimer.
It is an instruction to the student: *this diagram shows the relationships, and
you may not measure it.* It removes estimation-from-the-picture as a strategy and
forces deduction, and it is the exam's standard way of setting a geometry problem
whose given lengths would make an accurate drawing either useless or impossible.

The corpus uses it for exactly the situations that need it:

- a right triangle with a cevian, where two of the three labelled lengths are
  algebraic and the third is numeric;
- a cone whose **slant** height is labelled and whose perpendicular height is the
  thing being asked for — a diagram drawn accurately would let the student
  measure the answer;
- two circles intersecting, with a right angle marked at one intersection and
  several arcs named, where no accurate drawing satisfies all the stated
  conditions simultaneously;
- a parabola with an inscribed square, where the square's size is the unknown.

**The Spine cannot draw any of them today.** `exam-stimulus.js` throws
`unsupported kind` on the `figure` kind, and all three `plot` frames draw to
scale: `plane` renders the grid, `graph` and `data` render reference lines. A
side labelled 9 cm and drawn 3 units long would be a false statement the renderer
made to the student.

**The rule this creates, and it is absolute:** never draw a figure to scale and
label it "not drawn to scale", and never substitute an accurate diagram for a
schematic one. Until this renderer exists, items needing it are authored in full
and held.

---

## 2. The one property that governs the whole design

> **The drawing must communicate every intended relationship and no unintended
> one.**

A schematic figure is not "a bad drawing". It is a drawing in which some
properties are **load-bearing** and others are **explicitly not asserted**. The
renderer's job is to make that distinction visible and enforceable.

| Must be communicated truthfully | Must NOT be implied |
|---|---|
| Incidence — which points lie on which lines, arcs, circles | That a segment's drawn length is proportional to its label |
| Order along a line — B is between A and C | That an angle's drawn size equals its stated measure |
| Which angle is marked as right, or as equal to another | That two visually similar segments are equal |
| Parallel and perpendicular marks | That a point drawn near a curve is on it |
| Region membership — inside/outside a circle or polygon | That a drawn shape is regular when only "quadrilateral" is stated |
| Tangency and intersection counts | Anything a student could obtain with a ruler or protractor |

Two failure modes follow directly, and both must be caught by the system rather
than by a reviewer's eye:

- **False proportion.** Segments labelled 5 and 13 drawn at a ratio of 1:1.1.
- **Accidental precision.** An angle stated only as "obtuse" drawn at exactly
  120°, inviting measurement.

---

## 3. Functional requirements

### 3.1 Primitives

| # | Requirement |
|---|---|
| **F1** | **Points**, with a label, a label anchor (8 compass positions plus auto), and an optional marker (filled dot, open dot, none). |
| **F2** | **Segments** between points, with an optional length label placed beside the segment, and tick marks (1, 2, 3) to assert equality between segments. |
| **F3** | **Lines and rays**, extending beyond the drawn region, with arrowheads, named in the corpus's register (`d`, `d′`, `d₁`, `m`). |
| **F4** | **Angles** at a vertex between two rays, with an arc (single, double, triple to assert equality), a label (`x°`, `(2x − 3)°`, `α`), and a **right-angle square** as a distinct marker. |
| **F5** | **Circles and arcs**, by centre and radius or by three points, with a marked centre, named arcs, and chords. |
| **F6** | **Polygons**, closed, with labelled vertices, optional interior shading, and per-side tick marks. |
| **F7** | **Curves** — parabola, hyperbola branch, generic smooth curve through control points — for function-shaped figures that are not on axes. |
| **F8** | **Solids in projection** — cone, cylinder, rectangular prism, pyramid, sphere — with hidden edges dashed, and with **slant height and perpendicular height as separately labellable elements**. This is not decoration: the corpus's cone item turns on exactly that distinction. |
| **F9** | **Coordinate axes**, optional, with or without a grid, so that a figure may sit on axes *without* the grid inviting measurement. |
| **F10** | **Intersections** as first-class points: a point defined as "where these two objects meet", so it stays correct when geometry is adjusted. |
| **F11** | **Annotations** — a free text callout with a leader line, and a brace or dimension line spanning two points. |
| **F12** | **Parallel marks** (matching chevrons) on two or more segments. |

### 3.2 The not-to-scale contract

| # | Requirement |
|---|---|
| **N1** | A figure declares `toScale: true` or `toScale: false`. **There is no default.** An undeclared figure is refused. |
| **N2** | When `toScale: false`, the renderer prints *(Figure not drawn to scale)* itself, in the corpus's italic-parentheses form. **The author never writes that string** — it is emitted from the flag, so the label cannot disagree with the figure. |
| **N3** | When `toScale: false`, drawn geometry comes from an explicit **layout** — hand-placed coordinates for the schematic — and labels come from the **semantics**. The two are separate fields and are never derived from each other. |
| **N4** | When `toScale: true`, the renderer **derives** the drawing from the semantics and refuses any layout override. A to-scale figure cannot be nudged. |
| **N5** | When `toScale: true`, the validator recomputes every labelled length and angle from the layout and **fails on any disagreement beyond a stated tolerance**. This is the gate that makes N4 meaningful. |
| **N6** | When `toScale: false`, the validator checks the layout against the **relationship set** only — incidence, betweenness, marked equalities, marked right angles, region membership — and fails when a stated relationship is not drawn. |
| **N7** | **Anti-precision check.** When `toScale: false`, the validator fails if a labelled length or angle happens to be drawn accurately to within a small tolerance, unless the author has flagged that element `incidentallyAccurate: true` with a reason. A schematic that is accidentally exact is a schematic a student will measure. |
| **N8** | A figure may be **partly** to scale: individual elements carry `scaleAsserted: true`. The most common real case is a coordinate-axis figure whose axes are true but whose labelled segment is not. |

### 3.3 Accessibility, determinism, storage

| # | Requirement |
|---|---|
| **A1** | Every figure carries author-written alt text describing the relationships, not the appearance. It is content, not decoration, and it is required. |
| **A2** | The renderer is **deterministic**: the same spec produces byte-identical SVG. Required for the visual-fidelity suite and for `media_sha256`. |
| **A3** | Figures render correctly at the smallest supported viewport, and text does not collide with geometry at any supported size. |
| **A4** | Figures respect `figure-system.css` — the repository's one figure grammar. No private stylesheet. |
| **A5** | Colour is never the only carrier of meaning. |
| **A6** | The figure is inert: no interaction, no measurement tool, no zoom that would let a student measure a schematic. |

---

## 4. Where it fits in the existing architecture

**Follow the `_shared/` single-source pattern.** The repository's standing lesson
is that a second copy of anything is a defect with a delay on it
(`docs/engineering/student-facing-rendering-validation.md` §7). One module,
authored once, synced to the browser copy and the Edge Function bundle, CI
failing on drift — exactly as `exam-stimulus.core.js` is handled today.

**Storage.** `exam_stimuli` already has a `figure` kind whose shape check demands
`media_ref` + `media_kind='svg'` + `media_sha256` + `media_reason`. Two options,
and the second is preferred:

- **(a) Pre-rendered SVG.** Author the SVG, store it by reference with its hash.
  Simple, but the figure becomes opaque: nothing can validate that the drawing
  matches the item's stated geometry, and N5–N7 become impossible.
- **(b) A `figure` spec, validated like every other kind.** Extend
  `exam_stimulus_spec_ok()` with a `figure` branch, store the semantic
  description in `spec`, and render deterministically. **This is the one that
  makes the not-to-scale contract enforceable**, and it matches how `plot`,
  `chart`, `table` and `number_line` already work. It requires relaxing
  `exam_stimuli_shape_check`, which currently forces `figure` to carry
  `media_ref` and forbids `spec`.

**Delivery.** `renderForQuestion()` gains a `figure` branch. `reading` does not
apply — a schematic has no value to read off it — so
`exam_stimulus_needs_reading()` must return false for `figure`, and the trigger
will then require `reading IS NULL`, which is correct.

**Visual regression.** Every figure primitive needs an approved specimen in
`scripts/figure-specimens.json` and a committed baseline in
`tests/visual-baselines/`. The repository has already shipped three visual
regressions past a full set of green property checks; a matching `stroke-width`
cannot tell you a right-angle marker is on the wrong vertex.

---

## 5. Acceptance — how we will know it works

The renderer is done when **all eight not-to-scale items in the reference corpus
can be specified and drawn**, each satisfying N1–N8, and each reviewed by eye
against the printed original for *relationship fidelity* — not pixel fidelity,
which is neither achievable nor wanted.

Specifically it must handle:

1. A right triangle with a cevian to the hypotenuse and mixed numeric/algebraic
   side labels.
2. A cone with slant height labelled and perpendicular height asked for.
3. Two intersecting circles with named centres, named arcs, a marked right angle
   at an intersection, and points on both circles.
4. A parabola with an inscribed square whose vertices lie on the curve and the
   axis.
5. Two parallel lines cut by two transversals, with four algebraic angle labels.
6. A triangle containing a smaller similar triangle formed by a parallel line,
   with segment labels partly algebraic.
7. Two altitudes of a triangle, both drawn, with three of four lengths given.
8. A polygon on coordinate axes where the axes are true and the polygon is not.

**And one negative test that must fail:** a figure declared `toScale: false`
whose labelled 5 cm and 13 cm sides are drawn at a true 5:13 ratio must be
**rejected** by N7. If that passes, the anti-precision guard is decorative.

---

## 6. What this requirement does not decide

- **Whether to build it, and when.** That is a product call.
- **The authoring format's surface syntax.** JSON in `spec` is the obvious
  choice for consistency with the other kinds; the field names are not fixed here.
- **Whether figures are authored by hand or generated.** The generation engine
  will eventually need to emit them, which argues for a small, closed vocabulary.
