# Math visualisation tooling — review and decision

**Status: DECIDED — recommendation, awaiting approval. Nothing integrated.**
2026-08-26.

Eight tools evaluated for rendering Digital-Math-Exam figures. The goal is not
to pick a well-known library; it is the clearest, most accurate, least
interactive figure a student can be shown on screen.

---

## 0. The constraints the answer has to live inside

Three of these come from the repository and one from the nature of the product.
They do most of the work of deciding.

1. **No build step, deliberately** (`CLAUDE.md`). Every dependency is a CDN
   script pinned to an exact version with an SRI hash (`scripts/pin-cdn-sri.sh`,
   a CI gate). A library therefore has to ship as a browser bundle, and every
   version bump is a manual, verified act.
2. **Tests execute the real shipped source** (`tests/_source.mjs`), in Node,
   with no DOM library. A renderer that only runs inside a browser engine is a
   renderer that cannot be tested the way this repo tests things.
3. **"Do not introduce a build step to solve a problem that a dependency-free
   module would solve."** The house rule, stated in `CLAUDE.md`.
4. **An exam figure must be inert.** Hover, tooltips, zoom, pan and animation
   are not merely unnecessary — each is a channel that can hand a student
   information the question withholds. This is an assessment-integrity
   requirement, not a preference.

Constraint 4 is the one that inverts the usual evaluation. Almost every library
below is *built* around interactivity; for us that is the feature to remove.

## 1. What each actually costs, measured

Browser bundles, fetched from the npm registry and measured — not recalled.

| bundle | raw | gzipped |
|---|---:|---:|
| `jsxgraph/distrib/jsxgraphcore.js` | 1,023,423 | **256,676** |
| `d3/dist/d3.min.js` | 279,706 | 92,360 |
| `d3-shape/dist/d3-shape.min.js` | 30,898 | 7,618 |
| `chart.js/dist/chart.umd.js` | 208,518 | 70,384 |
| `katex/dist/katex.min.js` | 272,179 | 75,840 |
| **`exam-stimulus.js` (ours)** | **17,597** | **6,107** |

Plotly and Observable Plot were not fetched individually; their published
packages are 4.1 MB and 1.5 MB unpacked respectively, and neither is close to
competitive on this axis.

## 2. The finding that decides the notation question

**KaTeX is already a dependency of this platform.** `katex@0.16.11` and its
`auto-render` contrib are already pinned with SRI in the shipped pages. So
"KaTeX or MathJax" is not an open question — it was answered, it is enforced by
the CI gate, and introducing a second typesetter would mean two maths
renderings of the same notation on one platform.

**And the exam preview currently does not use it.** It uses a hand-rolled
regex `tex()` that handles exactly the seven constructs the DSAT items happened
to need. Tested against ordinary exam notation, **11 of 12 expressions come out
with raw LaTeX still in them**:

```
  BREAKS  \sqrt{49}                    →  \sqrt{49}
  BREAKS  \pi r^2                      →  \pi r^(2)          ← half-rendered
  BREAKS  m\angle ABC = 90^\circ       →  m\angle ABC = 90^\circ
  BREAKS  \overline{AB}                →  \overline{AB}
  BREAKS  \frac{a}{\frac{b}{c}}        →  \frac{a}{[frac b/c]} ← half-rendered
  BREAKS  \begin{cases}…\end{cases}    →  (untouched)
  ok      |x - 3| < 5
```

The half-rendered cases are the dangerous ones: a superscript resolves while
`\pi` does not, so the output looks *almost* right and can ship unnoticed. This
is the same defect class as the figure-guessing regex and the white-on-white
options — plausible output that nobody checked against the full input space.

**This is the strongest single conclusion of the review: custom is right for
figures and wrong for notation.**

### One consequence to design around

KaTeX renders to HTML, not SVG, so **SVG text cannot carry KaTeX**. Options are
`<foreignObject>` (patchy, and a rendering risk in an exam) or keeping figure
labels notation-free. Real exam figures label axes `x`, `y`, "Weeks of
practice" — never `\frac{dy}{dx}` — so the constraint costs nothing and should
be written into the authoring rules: **notation lives in the prompt, options and
table cells (HTML, KaTeX); figure labels stay plain.**

## 3. Tool by tool

### JSXGraph — a construction engine we would not construct with
Genuinely excellent at what it is for: declaring *mathematical objects with
dependencies* — the circle through three points, the intersection of two lines,
a perpendicular bisector — and computing them exactly.

**Our schema stores computed points, not constructions.** The author has already
decided the circle is centred at (3, 2) with radius 2; the spec records where
the points are. JSXGraph's entire value proposition is therefore unused, and we
would pay 256 KB gzipped — **forty-two times our renderer** — for a coordinate
transform and a curve path.

Its interactivity is removable (`fixed: true`, `pan`/`zoom` disabled,
`showNavigation: false`, `highlight: false`) but not *absent*: the board still
attaches pointer handlers. Proving inertness would mean auditing that surface on
every version bump, against a requirement where being nearly-inert is failing.

**Verdict: not the production renderer.** And, contrary to the initial
hypothesis, **not the verification tool either** — see §5.

### D3 — right library, wrong problem, one idea worth stealing
For a general charting need D3 is the correct answer. Here its contribution
narrows to three things: linear scales (four lines of arithmetic we already
have), a nice-number tick algorithm (`d3.ticks`, which we hand-rolled), and
`d3-shape`'s curve interpolators.

`d3-axis` we would specifically *not* use: it emits its own DOM structure and
inline styling, which fights the class-based CSS that makes our light/dark and
four-surface theming work at all.

**But one thing in D3 is better than what we have.** `d3-shape` offers
`curveCatmullRom.alpha(0.5)` — *centripetal* parameterisation. Ours is uniform
(α = 0), which can overshoot and self-intersect on unevenly spaced samples. Our
own figures use even spacing so it has not bitten, but the schema permits any
points, so it eventually will.

**Verdict: take the idea, not the dependency.** Centripetal parameterisation is
about ten lines. Adding `d3-shape` at 7.6 KB gzipped would be defensible; adding
full D3 at 92 KB for this would not.

### Observable Plot — covers three of ten, and imposes a look
A grammar of graphics over D3, excellent for statistical charts. It has no
concept of a coordinate plane, so it cannot draw a circle-as-geometry, a
labelled triangle or a number line — **three of our ten figure types, not ten.**
Its defaults are recognisable and deliberately not fully overridable.

Adopting it would mean two rendering systems on one exam page, one of which
speaks a different visual language. **Verdict: no.**

### Plotly.js — built for exploration, which is the opposite requirement
Scientifically strong and genuinely capable. `staticPlot: true` does produce a
fully inert figure, which is a real point in its favour.

But 4.1 MB unpacked is disqualifying for a timed exam, its visual identity is
strong and hard to escape, and we would be shipping an exploration toolkit —
zoom, pan, modebar, hover, autoscale — in order to switch all of it off.
**Verdict: overkill.**

### Chart.js — canvas, which breaks the architecture outright
This one fails on a structural point rather than a preference. Chart.js renders
to **canvas**. Our architecture is *geometry in JS, appearance in CSS*: the
renderer emits semantic classes and every colour, weight and font is a CSS
token. That is what makes four candidate surfaces, light/dark and the
theme-follows-viewer behaviour work at all.

Canvas has no DOM to style, so every colour would have to be passed in as
JavaScript and the whole figure re-rendered on a theme change. It is also
raster: no crisp scaling, no text in the accessibility tree, no selectable
labels. It has no coordinate-plane concept either. **Verdict: no.**

### MathJax — the better accessibility story, the worse exam behaviour
MathJax v4 has broader LaTeX coverage and a stronger assistive story
(assistive MathML, speech rules, an expression explorer). It typesets
**asynchronously**, which means notation can reflow after first paint — a
layout shift under a running clock, in front of a student reading a question.

KaTeX renders synchronously and emits MathML alongside its HTML, so the
accessibility gap is much narrower than it first appears. Coverage is sufficient
for every construct in §2. **Verdict: KaTeX — and it is already pinned.**

### GeoGebra — the authoring tool, used by a person, outside the codebase
Multi-megabyte and applet-shaped; not a production renderer, as expected.

As an **authoring** aid it is the best thing here. Constructing "the
perpendicular bisector of AB meets the circle at P and Q" and reading exact
coordinates off it is precisely what an author needs and what is error-prone by
hand. And because a human uses it and pastes numbers into the spec, it carries
**zero production risk** — no bundle, no version pin, no SRI, no attack surface.

**Verdict: yes, as a human tool. Not a dependency.**

### Custom SVG — what we already have
6.1 KB gzipped. No dependency. Class-based CSS theming. Testable in Node against
a thirty-line fake DOM. **Inert by construction rather than by configuration** —
it attaches no listener at all, and the test suite asserts that by scanning the
source.

Its weakness is real and should be stated plainly: every tick algorithm, curve
interpolation and edge case is ours to get right, without a library's many eyes.
The mitigation is the one already in place — a geometry test suite where every
check is mutation-tested against the defect it exists to catch, plus numeric
verification that each answer is still readable off the drawn shape.

## 4. A — the tool for each figure type

| figure | renderer | if a constraint changed, the alternative |
|---|---|---|
| Function graph | custom SVG | — |
| Coordinate plane | custom SVG | JSXGraph, **if the schema stored constructions instead of points** |
| Circle / geometry | custom SVG | same |
| Polygon / triangle | custom SVG | same |
| Scatter | custom SVG | Observable Plot, **if we needed statistical transforms** (binning, faceting) |
| Scatter + line of best fit | custom SVG | same — Plot computes the regression; our author supplies it |
| Bar chart | custom SVG | Plot or Chart.js, if visual identity did not matter |
| Line chart | custom SVG | same |
| Table | HTML + CSS | — (never an SVG or a chart library) |
| Number line | custom SVG | nothing else models open/closed endpoints at all |
| **Mathematical notation** | **KaTeX** | MathJax, if async reflow were acceptable |

The right-hand column is the useful part: it names the condition under which to
revisit. If the schema ever stores constructions, reopen JSXGraph. If items ever
need a regression computed rather than supplied, reopen Plot.

## 5. B — the architecture

**Hybrid, but not the hybrid initially proposed.**

```
  semantic schema  →  custom SVG renderer  →  inert figure
                      (geometry only, no colour)
                              +
                      CSS visual system     →  surface, theme, weight
                              +
                      KaTeX                 →  notation, in HTML only
```

* **Production, student-facing: custom SVG.** One renderer, `exam-stimulus.js`,
  shared by preview and delivery so the same question cannot be drawn two ways.
* **Notation: KaTeX**, already pinned. The hand-rolled `tex()` is replaced.
* **Authoring: GeoGebra**, by a person, outside the repository.
* **Verification: arithmetic in the test suite**, not a library. The existing
  numeric checks already prove a circle is round to within a stated pixel
  budget and that a graph still crosses a line the right number of times — in
  closed form, with no browser and no dependency. JSXGraph would add a browser
  dependency to do what exact arithmetic already does exactly.
* **JSXGraph, D3, Observable Plot, Plotly, Chart.js: none, in production.** One
  idea is borrowed from `d3-shape` and reimplemented.

**This differs from the suggested JSXGraph + D3 in both directions**, which is
what the review was for: JSXGraph turns out not to be the verification tool
either, and D3 contributes one algorithm rather than a dependency.

## 6. C — the comparison

Scored against what this project needs, not in the abstract.

| | maths accuracy | visual control | weight | a11y | inert exam figure | maintainability | generic-look risk |
|---|---|---|---|---|---|---|---|
| **Custom SVG** | ours to prove — and proven by test | total | **6 KB** | full DOM + CSS | **by construction** | all ours | none |
| **KaTeX** | excellent | n/a (notation) | 76 KB, already shipped | MathML output | inert | upstream | n/a |
| JSXGraph | excellent | moderate, opinionated | **257 KB** | SVG, no semantics | by configuration, re-audit each bump | upstream + our overrides | moderate |
| D3 (full) | n/a (primitives) | total | 92 KB | ours anyway | inert | upstream + all our code anyway | none |
| `d3-shape` only | excellent interpolators | total | 7.6 KB | ours anyway | inert | small surface | none |
| Observable Plot | good, statistical | limited by design | ~1.5 MB pkg | reasonable | mostly | upstream | **high** |
| Plotly | excellent | fights defaults | **~4.1 MB pkg** | reasonable | `staticPlot: true` | upstream | **high** |
| Chart.js | adequate | **canvas — no CSS** | 70 KB | **raster, no DOM** | inert | upstream | **high** |
| GeoGebra | excellent | n/a (authoring) | n/a — not shipped | n/a | n/a | none | none |

## 7. D — nothing renders on a library's defaults

Whatever ships is subordinate to the Si Math AI visual system, never the
reverse. For the two things that do ship:

* **Custom SVG** sets no colour, weight or font at all. Every appearance
  decision is a CSS token, which is what makes the four candidate surfaces and
  both themes work from one renderer.
* **KaTeX** ships its own stylesheet. Its font sizing, spacing and colour must
  be brought under our tokens — `color: inherit` rather than KaTeX's default,
  and its sizing tied to our type scale — so notation in a prompt reads as the
  same typographic system as the prose around it. That is a real integration
  task, not a drop-in.

And the standing rule, unchanged: no hover, no tooltip, no zoom, no pan, no
animation, no annotation the spec did not ask for.

## 8. What this review changes, held until approval

Nothing has been integrated. Three items follow from it:

1. **Replace the hand-rolled `tex()` with KaTeX** in the preview and the
   eventual delivery surface, and bring KaTeX's styling under our tokens.
   Evidence: 11 of 12 realistic expressions currently fail.
2. **Adopt centripetal Catmull-Rom** (α = 0.5) in `exam-stimulus.js` — about ten
   lines, borrowed from `d3-shape`'s approach without the dependency.
3. **Write the authoring rule** that figure labels stay notation-free, because
   SVG text cannot carry KaTeX.

Item 1 is the one that would otherwise reach a student as a broken question.

---

## 9. Authoring rules produced by this review

Approved 2026-08-26 and recorded here because they constrain content, not code.

1. **Figure labels carry no mathematical notation.** SVG text cannot render
   KaTeX, so axis and point labels are plain: `x`, `y`, `Time (minutes)`,
   `Number of students`. Notation belongs in the prompt, the options or a table
   cell, all of which are HTML. Real exam figures already work this way.

2. **A curve must be sampled densely enough that smoothing changes nothing.**
   Measured on a parabola: polyline, uniform and centripetal interpolation
   disagree with one another by **84 px at four samples and 2 px at twenty**.
   Below roughly ten samples the interpolation is choosing the shape, and a
   student reading a value off the curve is reading the renderer rather than the
   author. `tests/exam-stimulus.test.mjs` enforces the invariant directly:
   the smoothed path must agree with the plain polyline through the same points.
   **Smoothing is safe precisely when it makes no difference.**

3. **One continuous branch per curve entry.** A function with an asymptote or a
   discontinuity is several curves, never one — see the stress test, case 9.

4. **No more than three curves in a figure** until a colour rule exists; the
   renderer cycles three series colours.

---

## 10. The render-time smoothing fallback — attempted, and it cannot be built

The instruction was: smooth only when a safety test proves the smoothing does
not change the reading, and otherwise draw the figure explicitly rather than let
the renderer guess. **The principle is right. The mechanism does not exist, and
the measurements say so.**

Two candidate metrics were tested against cases whose correctness is known:

| case | max turning angle | deviation from polyline | truth |
|---|---:|---:|---|
| circle, 8 samples | 45° | 25.5 px | smoothing **recovers** the shape |
| circle, 12 samples | 30° | 18.0 px | correct |
| parabola, 20 samples | 29° | 1.4 px | correct |
| parabola, 10 samples | 49° | 6.8 px | correct |
| parabola, 6 samples | 64° | 25.2 px | marginal |
| parabola, 4 samples | 74° | 79.7 px | smoothing **invents** the shape |

* **Deviation from the polyline does not separate them.** A circle sampled
  perfectly well deviates 25.5 px; a parabola sampled badly deviates 25.2 px.
  The metric measures **curvature**, not error.
* **Overshoot beyond the sample band is not sound either.** A genuine extremum
  between two samples legitimately leaves the bracket — a real parabola does
  exactly that at its vertex.
* **Turning angle separates better but not cleanly** (45° correct against 49°
  also correct), because the angle depends on how much true curvature lies
  between samples — which is precisely what the spec does not carry.

**The information is not in the points.** No local metric can distinguish
"sampled adequately" from "sampled sparsely" without knowing the function.

And the proposed fallback would not be safe anyway: **a polyline is not the
conservative choice**, it is a different wrong claim — it asserts corners the
function does not have. Ugly is not the same as honest.

### What is sound instead

1. **The renderer does not decide.** It smooths what is declared a `curve`,
   because deciding would mean guessing with a metric that does not work.
2. **The author is responsible for sampling density**, and the rule is written
   down in §9.2 with the numbers behind it.
3. **An authoring-time warning, labelled a heuristic and not a gate:** flag any
   `curve` whose maximum turning angle between consecutive chords exceeds 60°.
   That catches the realistic mistake (parabola at 4 and 6 samples) without
   firing on legitimate figures (circle at 8, parabola at 10). It warns a human;
   it never silently changes a rendering.

This is a correction to the instruction, made because the evidence contradicts
it. The principle it was protecting — *beauty never precedes mathematical
meaning in an exam* — is served better by refusing to let the renderer decide at
all than by having it decide on a metric that cannot tell the cases apart.

---

## 11. Student-facing exam UI and math art direction

A pass on what the student actually looks at, prompted by opening the preview
and finding that the chrome read as a product while the exam body read as a
prototype. Four things were wrong, and three of them were bugs rather than
taste.

### The navigation was never styled at all

The stylesheet targeted `nav` while the element is `<div class="nav">`. The
selector matched nothing, so the entire navigation rendered as an unstyled
block at the top left of the page — which is exactly how it looked. One
character of specificity, and it made the exam look unfinished.

Rebuilt as one persistent system: **Back · question map · Next**, fixed at the
bottom of the viewport, in a three-column grid so nothing shifts between
questions. Back and Next are the two controls a student reaches for under time,
so they are large and flank the map rather than being hunted for. The map is a
single scrolling row with the current question brought into view, and it
re-flows to two rows only below 640 px.

### A table was three nested boxes

Card, then a bordered stimulus box, then the table — and the table itself
stretched to fill a container far wider than its content, with the row labels
centred and the *headers* of numeric columns rendered in the monospace face
meant for their values.

The exam table presentation now follows the content: **width is auto**, text
columns read left, numeric columns align right in tabular figures so a column
can be compared down its length by eye, the header is the only strong rule, and
there is no box. A header is text even above a numeric column.

### Bold that wrapped an expression came out as asterisks

`the **$x$-coordinate**` splits into three runs at the maths delimiters, so the
opening and closing `**` landed in different runs, matched nothing, and both
appeared literally in the question. Bold is now tracked across the runs.

### The plate was padding the mathematics out

Equal axis scales are non-negotiable, but *how* they were obtained was a
composition decision made badly: the canvas was fixed and the **window** was
widened to match, so every figure sat in the middle of a plate with empty grid
around it. The canvas now takes the shape the mathematics asks for — the
declared window is honoured exactly and the plate is as tall as that window
needs. Nothing is padded.

### Two authoring findings this produced

1. **A window should fit its figure.** On a `plane`, slack in one axis is
   multiplied into the other: a *y* range a third too generous forces the *x*
   range wider to keep the scales equal, and the figure ends up small in the
   middle of a large plate. Loose windows cost twice.

2. **The first real instance of the deferred `extends` gap.** An item whose
   prompt reads "the graph shows two lines" is stored as two short `polygon`
   segments, so the drawing shows two segments that stop in mid-air. It is not
   wrong — P10 is satisfied, they do not touch the boundary — but the figure
   says *segment* where the prompt says *line*. Under the agreed rule this
   figure either gets re-authored so the wording matches what the language can
   say, or it waits for `extends`. **It is not approximated, and it should be
   settled before the 66 are inserted.**

---

## 12. The figure visual system — a real art-direction pass

The previous pass fixed layout and was told, correctly, that it had answered a
different question. Isolating a single figure on white made the problem
obvious in one look: **it was a dashboard chart, not an exam figure.**

Four decisions carry almost all of the difference. None is about layout.

### 1. Ink, not hue

A lone triangle drawn in the brand blue reads as decoration. Drawn in
near-black it reads as a figure in an exam. **Colour is for telling things
apart, and one figure has nothing to be told apart from** — so hue is now spent
only where a plot carries two or more curves, and then it is the validated
categorical set. The renderer marks a single-curve plot `sx-solo` and the
stylesheet inks it.

This is the same principle the data-viz rule states for legends ("a single
series needs no legend — the title names it"), carried through to colour.

### 2. Tick marks

There were none. Without them the numerals are captions floating beside a
background grid; with them they are readings off a measured axis. This is the
single change that most separated the output from a printed figure, and it was
absent entirely.

### 3. A real weight hierarchy

Grid 1 → axis 1.75 → figure 2.5 is barely a hierarchy, so the grid and the
figure competed for the eye. Now grid 1 → axis 1.6 → **figure 2.9**, with the
axes in ink rather than a mid grey, so the data is unambiguously the loudest
thing on the plate and the grid is unambiguously the substrate.

### 4. Sans numerals, not mono

An earlier decision recorded in §9 was wrong: *"numerals on an axis are
measurements, so mono reads as an instrument."* On a plate it reads as a data
readout. A printed figure sets its numerals in the text face, tabular so the
y-axis column still aligns, and in ink rather than a soft grey.

### What the pass cost, and how it was caught

Quieting the grid to a neutral dropped the **major** rule to 2.56:1 and 2.53:1
on the two light surfaces — under the 3:1 floor for graphical information a
reader needs, which §11 had only just established. Caught by measuring rather
than by eye, and corrected to a neutral that clears the floor on all four
surfaces (3.10 – 3.43:1) while still being quieter than the blue-tinted grid it
replaced.

Final figure contrast, measured on every surface:

| surface | figure | minor rule | major rule |
|---|---:|---:|---:|
| Paper | 17.9:1 | 1.43:1 | 3.36:1 |
| Softened | 16.2:1 | 1.36:1 | 3.10:1 |
| Lifted | 14.0:1 | 1.42:1 | 3.43:1 |
| Night | 16.7:1 | 1.37:1 | 3.34:1 |

### On using a maths tool as a reference

The container's proxy blocks the CDN, so **no JSXGraph or GeoGebra reference
could be rendered here to compare against** — that is a limitation of this
environment, not a judgement about the tools, and it is stated rather than
worked around. The benchmark used instead was the printed-assessment figure
convention itself: ink data, black axes with arrowheads and tick marks, a quiet
neutral grid, numerals in the text face. The production decision is unchanged —
custom SVG — but §5's conclusion now has to be defended by the output rather
than by bundle size, which is the right standard.
