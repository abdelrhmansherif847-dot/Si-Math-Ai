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

### The reference, corrected

Printed assessment is the reference for the **mathematical visual language** —
ink data, marked axes, a quiet grid, numerals in the text face. It is not a
requirement to imitate paper. This is a digital-first exam, so where the two
pull apart, clarity and comfort on screen win. Checked against the choices
made: none of them are paper-imitation. Ink on white is high contrast because
thin lines need it on a screen; a quiet grid is *less* visual noise, not more;
the text face is the more screen-native choice of the two, not the less.

### Composition, after seeing the plates in place

Three further things, all visible only in the real question composition rather
than in an isolated figure:

* **One left edge.** A stimulus centred in the card starts about 150 px right
  of where the prompt starts, which is what made it read as an object parked
  above the question. Figure, prompt and options now share a left edge, and the
  question reads as one piece.
* **Table values in the text face.** Mono was reversed for figure numerals and
  the same reasoning applies to a table of values; having one mono and the
  other sans was the inconsistency.
* **Figure width 520 → 450.** At 520 a square-ish coordinate plane came out
  520 px tall and towered over the question it belonged to.

---

## 13. The libraries, actually prototyped

§3 evaluated the tools on their properties. This section evaluates them on
their **output**, which is the only standard that matters, because the student
does not see the architecture.

The npm registry is reachable from this container even though the CDN is not,
so JSXGraph (1.0 MB), Chart.js (209 KB) and D3 (280 KB) were fetched, inlined
into a local page, and pointed at the **same real exam specs** the preview
uses. Each library was configured toward the Si Math AI system — inked data,
our grid, our type, drag and zoom and tooltips off — because comparing our art
direction against a library's defaults would prove nothing.

`scripts/build-renderer-eval.py` rebuilds the page.

### Function graph — ours is clearly better, on the case a maths library should win

JSXGraph draws a curve given as sampled points by **joining them with straight
lines**. The result has a visible corner at every turning point and a sharp V
at the minimum — it asserts non-differentiability the function does not have.
That is precisely the defect our centripetal interpolation exists to prevent.

It has no way to do better without the formula, and our spec stores samples,
not formulas. **The library loses the case it was brought in for.**

### Circle — indistinguishable, and its axis choice is worse

This was the one place JSXGraph should have won outright: a true circle
primitive against twelve sampled points. Side by side at exam size, **they
cannot be told apart.** The theoretical advantage does not survive contact with
the size a student actually sees.

JSXGraph also chose 0.5 steps for the axis where ours chose 1. A student
counting a radius wants unit steps.

### Coordinate geometry — very close

Honestly close. JSXGraph's axes carry slightly more confident arrowheads. Ours
carries more of the exam-figure vocabulary: tick marks on both axes, the
two-tier grid, and axis names at the tips. Neither is embarrassing beside the
other.

### Scatter and bar — a tie on looks, decided by everything else

Chart.js, configured, produces a perfectly respectable scatter. On appearance
it is a tie.

But it had to be **explicitly told not to crop the declared window**: left to
itself it drew x from 1 to 7 when the spec declares 0 to 9, quietly changing
what a student can read off the figure. That is the tool deciding the
mathematics — the first non-negotiable — and it is the default behaviour.

And it is canvas: no DOM to style, so no CSS theming and no four surfaces from
one renderer; raster, so no crisp scaling; and nothing in the accessibility
tree.

### Number line — no candidate models it at all

Not one of the libraries has a concept of an open versus a closed endpoint,
which is the entire content of those questions.

### Verdict

**Custom SVG for production, across every figure family** — now earned by
output rather than asserted from bundle size. The comparison was run properly
and the libraries did not win: one is worse on the case it should own, one is
indistinguishable, one is a tie that loses on architecture, and none covers the
number line.

The tooling decision is unchanged, but its justification is now the right kind.

**What still stands from §5:** GeoGebra as a human authoring aid, outside the
codebase. And one addition — JSXGraph is worth keeping as an **authoring-time
cross-check** for constructed geometry, where its exact primitives can verify
coordinates an author computed by hand. Not shipped, not a dependency.

---

## 14. Renderer decision — CLOSED

**Decided 2026-08-26. The production renderer is the improved custom SVG
system, `exam-stimulus.js`.**

The wording matters, because "custom SVG" no longer means what it meant when
this review opened. It means the system as it stands after the art-direction
work: **inked data with hue reserved for two or more series, tick marks on both
axes, the two-tier grid, the 1 → 1.6 → 2.9 weight hierarchy, numerals in the
text face, the canvas taking the shape the mathematics asks for, and the
stimulus sharing a left edge with its question.** Reverting to the figures this
review started with would not satisfy this decision.

It was chosen because it won a fair comparison against real alternatives on
real specs (§13), and because it preserves the exam semantics exactly — not
because custom code was preferred in advance, and not on bundle size.

### What is closed and what is not

| | |
|---|---|
| **Closed** | the renderer technology decision |
| **Not closed** | the student-facing visual experience, and the exam surface |

The visual layer stays open until the owner sits the updated exam and judges
the whole thing — question, figure, table and navigation together — rather than
isolated plates or comparison screenshots. That judgement is what closes it.

### Pre-flight before that sitting

All 66 questions were walked on **all four candidate surfaces**: 12/12 checks
each, no JS errors, no contrast failure, no label overlap, no unequal-scaled
plane, no scatter joined, no authoring text leaking into a prompt. The notation
screen was checked separately on two surfaces — 16 constructs, no contrast
failure, no horizontal scroll.

KaTeX remains **unverified**: this container's proxy blocks the CDN, so the
typeset output has never been seen here. That is the one thing the sitting has
to confirm.

### Sequence from here

```
  sit the exam  →  lock the visual layer  →  migration
     →  approval  →  apply  →  content insert  →  wiring
```

---

## 15. The visual layer is NOT closed — back to design directions

The renderer comparison answered which technology to use. **It did not prove
the visual design is good**, and the owner's reaction after sitting the exam was
that the figures and tables still look bad. That reaction outranks every green
check in this repository: the student sees the figure, not the test suite.

Several rounds of adjusting line weights, grids, colours, alignment, typography
and sizing have not fixed it, which is the signal that the problem is not
another five-pixel change. So this stops being an iteration and goes back to
the design level.

### What could and could not be done

**Could not:** study high-quality examples visually. This container can search
text but cannot see images, so any claim to have "studied" real assessment
figures would be false. It is not made.

**One genuinely useful finding did come out of searching:** the Digital SAT
ships **Desmos on every math question**. A student sitting the real exam is
looking at Desmos-styled graphs continuously, which makes that visual language
a concrete reference standard rather than a matter of taste — and it is
markedly different from what the renderer produces today.

### Judged by figure family, not by one global direction

`scripts/build-figure-directions.py` builds the exploration page. It does **not**
ask for one look. Each mathematical object is a separate decision, because each
one has a different job on screen:

| family | the job |
|---|---|
| **Function graphs** | read shape and read values. The curve is the subject; the only family where the Desmos comparison genuinely applies |
| **Coordinate geometry** | count lengths and read positions. The grid is an *instrument the student uses*, which is the opposite of what a function graph wants |
| **Scatter / statistical** | judge a trend and locate one observation. Axes measure different quantities, so nothing is squared and the grid can only be a locating aid |
| **Number lines** | read one endpoint and decide open or closed. That distinction *is* the question |
| **Tables** | find one value fast and be certain which row and column it belongs to, under time |

The three plane families are shown through four treatments of frame, grid and
ink — **Plate**, **Open**, **Squared paper**, **Screen-native**. Number lines get
**their own four**, because frame and grid mean nothing on a number line: they
differ in how many values are named, how loud the endpoint is, and whether the
interval rides on the axis or sits above it as its own object. Tables get seven
structures, **three of them executions of Boxed**, at four columns rather than
three — the previous page under-showed the structure most real exam papers use.

The shared fundamentals — typeface, numeral style, tick treatment, label
placement, card and spacing — are held constant across every panel, so a mix
across families still reads as one exam.

### What looking at the output found

Every one of these passed the geometry tests and was invisible to them. All were
caught by rendering the page and reading it, then confirmed by measurement.

**1 · The two-tier grid never worked.** The rule was "the minor rule stays quiet
and the major rule, every fifth unit, carries the 3:1 contrast." But `niceStep`
holds the gridline count between **6 and 9 at every span from 4 to 1000** — by
design, so a student can count the divisions. Every fifth of 6–9 lines is one or
two lines, and one of those is usually hidden under the axis. So the "tier" was a
**single heavy line drawn through the figure**, which reads as part of the
drawing, not as a grid. The existing invariant — *majors fall exactly every fifth
gridline* — was true the whole time and told us nothing, because it checked
placement and never asked whether there were enough of them to perceive.

The tier is not wrong; it is **inseparable from grid density**, and a coarse grid
cannot carry it. It now engages only where it can be perceived, which in practice
means `gridMode: 'fine'` — half-steps under unit lines, 32 fine against 17 unit
in the geometry panel. Everywhere else the grid is uniform.

*The open consequence:* with no major tier, no gridline clears 3:1 — measured at
**1.21–1.38:1** across the three grid-bearing directions. The numerals and ticks
carry every value, so nothing is unreadable, but the earlier claim that gridlines
meet the non-text floor no longer holds and should not be repeated. Whether the
grid gets darker is a per-family question: for coordinate geometry, where the
grid *is* the instrument, only the dense treatment is genuinely countable.

**2 · A frame around the plot window cannot hold a plane.** Framing the window
while the axes run through the interior put the numerals outside their own frame,
clipped the leftmost label against it, dropped a gridline 4.9px short of it and
let the axis arrow puncture it — four defects, one cause. A plate bounds the
**whole figure, its labels included**. Now checked: nothing may fall outside the
border and no gridline may hug it.

**3 · Arrowheads on a data frame are a false claim.** An arrowhead says the axis
continues past the edge. That is true of a coordinate plane and false of a
bounded scale — weeks 0 to 9, books 10 to 36. The scatter drew them anyway,
because the test for an axis was *"does the window contain the origin"* rather
than *"is this a plane"*, and its weeks happen to start at zero. Arrowheads now
belong to the plane and nowhere else.

**4 · Figure numerals were set with the keyboard hyphen.** On a figure the
difference from U+2212 is visible: a hyphen is short, high, and reads as
punctuation. The tables already used a real minus; the figures did not.

**5 · A colour defined in one theme only is an invisible figure.** The first draft
of the number lines hard-coded near-black inks, which vanished on a dark card —
axis 1.44:1, numerals 2.11:1, interval **1.06:1**. Every direction's ink is now
generated from a `(light, dark)` table, and the build **fails** if a token is
referenced without being defined or is defined in only one theme.

**6 · A band nobody can see is not a band.** The dark zebra tint measured
Δluminance 0.0000 against its neighbour — `grid + zebra` rendered identically to
plain `Boxed`, which would have made that panel a wasted choice. Banding is now
measured on the two rows rather than asserted from the stylesheet.

Two of the checks written to catch this were themselves wrong and were corrected:
the contrast helper measured translucent tints as opaque (`rgba(15,92,140,.09)`
read as a dark navy), and a `tickMode` passed to `drawPlot` did nothing at all,
so the Open direction was described as naming fewer values while naming exactly
as many as the other three. **The description was changed to match the drawing,
not the reverse.**

### Verification

`scripts/check-figure-directions.cjs` drives the page in headless Chromium —
**230 checks, both themes.** It is a manual harness, not part of `tests/run-all.mjs`:
it needs a browser, and the repo deliberately has no package.json.

Four mutations were introduced on purpose to confirm the checks can go red:
dimming the plate gridline back to its old value, flipping the number-line
endpoint semantics, removing the lift from the band direction, and deleting one
ink token. Each was caught.

### The plate was the wrong frame for the judgement

Passing 230 geometry and contrast checks means the figures are not broken. It
does not mean they are good, and it is not what the owner was reacting to. A
student never sees a plate on a card; the Digital SAT puts a multiple-choice
question in **one centred column with the choices below**, so the figure has to
do its job in that composition, at that measure, against that text.

`scripts/build-exam-composition.py` builds that page: every family as a whole
question at true exam measure, first as the renderer draws it today and then
recomposed, with what changed and what it cost. The questions are original and
neutral; no authored item appears.

### The five faults, none of which are CSS

1. **The window is not composed.** It is derived from the data range plus
   padding, so the figure takes whatever shape that produces. On the cubic that
   was a tall plate whose upper half was empty.
2. **The scaffolding outweighs the subject.** Arrowheads on four ends, italic
   tips, a grid, ticks and numerals, against a 2.4px curve.
3. **The figure does not name itself.** A stem says *triangle OAB* and the
   figure names no vertex and no origin.
4. **The figure floats**, centred in whatever box it is given, at a width
   unrelated to the text it belongs to.
5. **One language is forced on every object.** Equal scales and a coordinate
   grid are right for geometry and wrong for a function graph and a scatterplot.

### What is per family, and what is shared

**Different on purpose:** whether scales are equal (mandatory for geometry,
wrong for a function graph), whether there is a grid and how dense, whether the
axes carry arrowheads, whether gridlines run both ways or only across, and how
much of the measure the figure takes.

**Identical across all five:** typeface and numeral style, tick treatment and
numeral placement, figure ink, the space above and below a figure inside a
question, stem and choice typography, and the measure of the column.

### Defects the recomposition exposed

- **`aspect` was doing three jobs.** It set scale equality, decided whether the
  axes carry arrowheads, and chose between italic axis tips and chart-style axis
  titles. Dropping equal scales on a function graph — correct — therefore also
  removed its arrows and replaced its tips with floating titles. Split into
  `axes` ('plane' | 'data', what the axes *are*) and `aspect` (how they are
  *scaled*).
- **The new option collided with an existing one.** `frame` was already the
  boolean that draws the plate border, so reusing the name framed every figure
  that set it. Renamed to `axes`.
- **Nothing was clipped to the declared window.** The cubic exited the top of
  its own plate and kept going. The series is now clipped to the window; the
  scaffolding is not, because numerals sit in the padding deliberately.
- **A vertex label placed radially lands in the numeral gutter**, because exam
  figures put vertices on the axes. Labels now take the first clear position on
  a ring of eight.
- **The ray's arrowhead scaled with its stroke width.** At 6px against a 1.4px
  axis it came out four times larger, sitting on top of the axis's own arrow —
  two arrowheads at one end. The ray gets a fixed-size marker in the ray's ink,
  and the axis arrow is dropped on any side a ray already terminates.
- **A dense grid does not automatically mean a countable one.** Half-unit
  gridlines under numerals every 2 make counting *harder*. The window is trimmed
  so `niceStep` stays on 1 and one square means one unit — which is what the
  question actually asks the student to count.

### Two checks that were green and worthless

- *"Grid spacing equals numeral spacing"* is true by construction: both derive
  from `sx`. It stayed green when the window was widened until the step became
  2. Replaced by reading the numeral **values** and requiring a step of one.
- The ring-based label placement was **never exercised** — removing it changed
  nothing, because this page's trimmed window happens not to collide. It is now
  checked on a figure built to collide, which reports overlaps without it.

Both were caught by mutating the page and finding that nothing went red. Three
further mutations (naive label placement, a widened window, a removed clip) are
each caught.

`scripts/check-exam-composition.cjs` — **98 checks, both themes**, headless
Chromium. Manual, like the directions harness: it needs a browser.

### DECIDED · Data charts and scatterplots follow Screen-native

**The first family decision.** These figures are *measured data*, not coordinate
geometry, so they no longer inherit the plane's visual language. On a digital
test the screen is part of what the figure means, rather than decoration applied
on top of it — which is why this is the one family where the screen-native
direction is a fit and not a default.

**Taken from the direction:** clean screen-first composition; data-led hierarchy
(the observations are the heaviest, most saturated thing in the figure);
restrained, validated colour; horizontal reference lines only; no
coordinate-plane conventions — no arrowheads, no equal-scale grid, no origin;
axis titles set the way a modern chart sets them, the y title upright above its
own axis rather than rotated up the side.

**Deliberately refused — screen-native is not dashboard:**

| refused | why |
|---|---|
| Legend | A legend is a lookup, and a lookup under time is what a figure exists to remove. Series name themselves at their own end. |
| Tooltip / hover | On a dashboard a tooltip reveals the value. On an exam that is the answer. |
| Card, panel, shadow | The figure sits *in* the question, not in a widget the question contains. |
| Decorative fill or gradient | Nothing carries meaning the data did not give it. |

The decision covers the **family**, not the one scatter that prompted it, so the
study also carries a scatter with a line of best fit, a bar chart, and a
two-series line chart in the same language.

**Colour was computed, not chosen.** Slots 1–2 of the validated categorical
palette, checked against the real exam surfaces (`#ffffff` / `#161d25`) in both
themes with `--pairs all`: lightness band, chroma floor, colour-vision
separation and 3:1 contrast all pass — worst all-pairs CVD ΔE 24.7 light / 26.8
dark, normal-vision ΔE 33.6 / 31.8.

**Two published dataviz defaults were overridden, on purpose.** The house
guidance requires a legend for ≥2 series and ships a hover tooltip by default.
Neither survives an exam: the tooltip *is* the answer, and the legend is a
lookup. The requirement underneath the legend rule — identity must never rest on
colour alone — is met instead by **direct labels on the series**, which the same
guidance endorses for ≤4 series. The tooltip rule is simply refused, and a check
enforces that the page carries no interactivity at all.

**Explicitly not applied to the other four families.** A coordinate plane and a
scatterplot want opposite things; that is the entire reason for deciding one
family at a time. A check resolves the data hue and the figure ink through the
browser and fails if a plane, a geometry figure or a number line has drifted onto
the data colour.

Defects this decision surfaced:

- **The clip ate the annotation.** Direct labels were appended to the clipped
  series group, so *"Line of best fit"* rendered as *"Li"* while the DOM
  reported the full string. The clip bounds the drawing; a label naming the
  drawing is annotation and now sits on the root. Checked by geometry, not by
  reading `textContent`.
- **Padding did not follow content.** A y title set upright needs a line above
  the plot and a self-naming series needs room to its right; both are now
  derived from what the figure actually carries.

`scripts/check-exam-composition.cjs` — **176 checks, both themes.** Three
mutations confirm the decision's guards can fail: labels returned to the clipped
group, a legend restored, and the data hue forced onto the other families.

### DECIDED · All five families — and the system is a grammar, not five looks

Every family is now chosen:

| Family | Decision |
|---|---|
| Data & scatterplots | **Screen-native** |
| Tables | **Boxed — header band** (Panel and Typographic refused) |
| Number lines | **Statement**, with adaptive tick density |
| Coordinate geometry | **Squared paper** |
| Function graphs | **Open**, with a grid only when the question needs one |

The decisive instruction was not the list. It was this: *each family should have a
fixed **grammar**, with variants tied to the job of the question* — so the system
reads as designed for mathematics rather than as five looks handed out to five
kinds of picture.

`scripts/build-figure-system.py` implements exactly that. **Two inputs compute
every variant on the page; none is hand-set.**

**Rule one — `reading`, authored.** Does the student have to get a *number* off
the figure, or only judge its *shape*? Nothing in the geometry can answer that:
two questions can share one graph and want different treatments. So it is a
property of the question, and the spec has to carry it. It turns the grid on a
function graph on and off, and the reference lines on a chart.

**Rule two — `resolutionOf()`, derived.** The coarsest step on which every marked
value lands exactly — 1, ½, ¼, ⅕ or ⅒. Nobody chooses it; it is already in the
spec. An endpoint at −2.5 makes it ½, and the figure grows half-step marks so
that endpoint sits on one. It sets tick density on a number line and grid density
in coordinate geometry.

```
gridPlan(role, reading, res)
  geometry → always a grid, at the figure's own resolution   (the instrument)
  function → grid iff reading === 'value'                    (the curve is the subject)
  data     → horizontal rules iff reading === 'value'        (a value is read leftwards)
```

Geometry deliberately ignores `reading`: its grid *is* the measuring instrument,
so it is never optional. A mutation that makes geometry obey `reading` like the
others fails the suite.

### What the schema now needs

**`reading` is a missing field.** `exam_stimuli` has no way to record it and
`exam_stimulus_spec_ok` would reject it. That is a migration change, and it is
far cheaper to know now — the Spine is still empty — than after content is
inserted. Everything else the system needs is already derivable from values the
spec holds.

### The grid earned its contrast

The grid sat at **1.25:1** — drawn, and invisible; the geometry panel showed
twenty gridlines and looked like it had none. That was defensible while every
figure carried a grid whether it needed one or not. Under the variant rule a grid
appears *only* when the question needs it, so **every grid is now information the
reader must perceive**, and it clears 3:1 (3.36 light / 3.71 dark) with the
sub-unit tier kept quieter beneath it. Lifting it obliged the numerals to carry a
halo, or the lines run through them.

This closes, in the right direction, the open question left when the every-fifth
tier was removed: the answer was not a darker grid everywhere, it was **fewer
grids, each dark enough to count.**

### Verification

`scripts/check-figure-system.cjs` — **96 checks, both themes.** They assert the
rules *fire*, not that they exist: `reading: shape` draws no grid and
`reading: value` draws one; integer vertices give a unit grid while a vertex at
7.5 grows half-unit lines; an integer endpoint gives no minor ticks while −2.5
grows them *and* gets named though it is off the major step.

Three mutations confirm the suite can go red: `reading` stopped from turning the
grid on, `resolutionOf()` pinned to 1, and geometry made to obey `reading`. Each
fails in exactly the places the rule claims to govern.

One check was too broad and was corrected: an unscoped `title` selector matched
the page's own `<title>` in the head and reported a tooltip source that did not
exist. A tooltip source is a `<title>` *inside* an `svg`.

### The rule for what happens next

React **per family**. There is no requirement that the answer be the same in all
five, and good reason to think it will not be. What must stay common is the
fundamentals — type, numerals, ticks, label placement, spacing, the card. Those
are already constant across every panel, which is why a mix does not look like a
mix.

The next artefact is not a patch: it is a **figure-family design system** — the
chosen treatment per mathematical object, plus the shared layer written down as
rules the renderer enforces.

**Nothing is locked. The production renderer is untouched, no migration exists,
and no content has been inserted.**
