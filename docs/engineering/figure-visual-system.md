# The figure system, and how it is kept honest

**Written 2026-08-29**, after the third visual regression in a row shipped past a
full set of green property checks.

## The failure this exists to stop

Three times, in three different places, the figures students see stopped looking
like the design system while every check in the repository stayed green:

| | what shipped | what every check said |
|---|---|---|
| Plate proportion | Exam plates 24% flatter than the specimen; squared paper ruled every **two** units, uncountable | font sizes, colours, selectors, family classes: all matching |
| Specimen sheet | `stimulus-plates.html` drew axes at 1.75 with round caps where the exam ships 1.2 butt, and set the x/y tips in bold sans where the exam ships serif italic | the page agreed with itself |
| Table | Took its line-height and its ink from whatever page it landed on — 40px rows and near-black on the sheet, 46.6px rows and #111820 in the exam | every measured property identical |

The common shape: **a matching property is not a matching picture.** A computed
`font-size` cannot tell you the plate is the wrong shape, that a grid is ruled in
twos, or that a table is a different grey. Each of these was found by looking, and
each could have been found automatically only by comparing pixels.

## The baselines were wrong first

The visual suite was built before anyone checked that what it was recording was
right. Recording a baseline from the current renderer and then verifying the
renderer against that baseline is circular: **a wrong drawing becomes protected
rather than caught.** That is what happened, and it was caught by going back to
the page the families were actually judged on — `figure-directions.html`, where
each treatment was chosen among alternatives — and putting its pixels beside the
product's.

Measured, on the coordinate plane:

| | approved reference | what shipped |
|---|---|---|
| unit grid | `#cdd8e2` — 1.45:1 | `#848d99` — **3.36:1** |
| sub-unit mesh | `#e4eaf0` — 1.21:1 | absent unless a vertex sat on a half |
| axis | `#0e1620` at 1.8 — 18.2:1 | `#3b4756` at 1.2 — 9.5:1 |

**`--fig-grid` had been set to the approved MAJOR tier's ink** — the heavy
every-fifth line — so every gridline in the system was drawn one tier too dark.
At the same time the axis was set lighter and thinner than approved. Grid and
axis converged in weight, the mesh that makes paper *paper* was conditional and
usually absent, and the result read exactly as it was described: a lattice of
separate lines rather than one coherent plane.

None of this was visible to a property check, and the visual suite could not see
it either, because the baseline had been recorded from the same wrong renderer.
The values are now taken verbatim from `PLANE_INK['paper']` in
`build-figure-directions.py`.

**The contrast floor moved, deliberately and with the owner's decision.** The
grid sits at 1.45:1, below the 3:1 that `365d85b` introduced. That commit's
premise — "it sat at 1.25:1, drawn and invisible" — was about a single pale tier;
two tiers together are legible, which is why the reference looks right. The gate
no longer asserts a flat floor on the grid. It asserts the RELATIONSHIP that
actually broke: each tier perceptible, ordered beneath the one above it, and the
axis dominating the mesh by at least 6x (it is 12.6x). Four mutations confirm it
— restoring the dark grid, washing the mesh out, lightening the axis, and
inverting the tiers each red a different check.

## One grammar

`figure-system.css` is the approved family grammar and the only place it exists.
Every surface that draws a figure links it — the exam, the specimen sheets, the
previews, anything built later. It is self-contained: its own tokens, both
themes, and its own type metrics, so a page cannot change a figure by existing
around it.

Four pages keep their own figure CSS deliberately — `figure-directions`,
`exam-composition`, `renderer-eval`, `figure-vocabulary` — because they exist to
show treatments that were **not** chosen. They declare it, and
`scripts/validate-figure-system.mjs` requires them to.

That validator is the anti-drift gate. A page may carry the grammar verbatim or
declare itself an exploration; nothing else. It also fails if the two sheets
disagree about a token they both define.

## The contract

`scripts/figure-specimens.json` holds the approved appearance **as database
rows**: an `exam_stimuli` kind and spec, plus the `exam_questions.reading` that
selects the variant. Nothing else. Eleven cases cover every family and every
meaningful variant.

Both sides of the suite render a case through `renderForQuestion()` — the one
entry point content goes through — so the specimen and the exam cannot disagree
about how a row becomes a figure. The only thing that differs between them is the
page around it, which is the thing being tested.

## The suite

`scripts/check-visual-fidelity.cjs` asks two questions in pixels:

1. **Does the renderer still draw what was approved?** Each case against its
   committed baseline in `tests/visual-baselines/`.
2. **Does the exam draw the same thing the design system does?** The same case
   carried through `exams.html` — the Spine read model, the exam stylesheet, the
   exam's column, its card — compared with the first image.

`scripts/check-visual-exam.cjs` does the second question on **real
DSAT-2026-A content**, one representative per family present in the form. It has
no baseline and never will: this repository is public, so no picture of an exam
figure may be committed. Comparing the two surfaces with each other needs no
stored pixels and answers the question that matters anyway. Its renders go to
`tests/visual-out/exam/`, which `.gitignore` excludes.

`scripts/png.cjs` decodes and compares PNGs with node's `zlib` and the spec's
five filters, because there is still no `package.json`.

## Getting a trustworthy comparison

Four things had to be pinned before a difference meant anything. Each was found
because it reported a change on a figure that was provably identical:

- **Webfonts blocked, a local stack pinned.** A baseline that depends on whether
  Google Fonts answered is a baseline that fails for the wrong reason. The
  baselines are recorded against DejaVu; swapping it for Liberation reds all
  eleven, which is why CI installs the font explicitly.
- **`--disable-lcd-text`.** The exam card composites its text with RGB subpixel
  antialiasing; the specimen page does not. Orange and blue fringes against
  neutral edges — half a percent of the frame, on a table identical in every
  measured dimension.
- **Align at device resolution, then average to CSS pixels.** The exam starts its
  figure at a fractional y where the specimen starts at 0. Aligning after
  averaging leaves a sub-pixel offset no integer slide can reach.
- **Compare the figure, not the box around it.** Element screenshots, tight to
  the drawing, so a card's padding is not a difference.

None of these tolerate a real change: a moved line, a changed weight, a different
grid step or a reshaped plate all move whole CSS pixels.

## Proven, not asserted

A green check is only evidence if it could have gone red. Every mutation below
was applied to the real source and the suite was run:

| deliberate violation | result |
|---|---|
| a frame drawn around every figure | 10 checks red |
| the old stretched plate restored (560×300) | 7 red |
| squared paper loses its unit grid | 1 red — `geo-2`, and only `geo-2` |
| axis stroke thinned 1.2 → 0.8 | 4 red |
| a page keeps a stale copy of the grammar | validator red |
| a page carries the grammar then overrides one rule | validator red |
| a token drifts between the two sheets | validator red |
| the pinned font swapped | all 11 baselines red |

`geo-2` is worth its own line. Nothing in the grammar page exercised a
squared-paper window past nine units across — the boundary where `niceStep` drops
to a two-unit step — so the defect that actually shipped had no case that could
see it. **A contract only covers the failures it has a case for.**

## Running it

```
node scripts/check-visual-fidelity.cjs              # the contract
node scripts/check-visual-fidelity.cjs --approve    # re-record, then LOOK
node scripts/check-visual-exam.cjs <form-fixture>   # the real exam
```

`--approve` is a separate, explicit run because a baseline is an approval, and
approving is a human act. The suite writes `tests/visual-out/index.html`, which
lays every case out side by side — baseline, renderer, exam, difference — because
the point is to look at them.

CI runs the contract in its own job with Chromium, and uploads every render and
difference image on failure, so a red build can be looked at rather than guessed
at. **This job has not yet run on GitHub**; it is written but unverified there.

## The pie family, and what looking at it found

The pie family shipped green — 26 of 26 visual checks at 0.000%, every property
check passing — and was still wrong in the exam. The two defects it carried are
worth keeping, because neither was the kind a check was watching for and one is
still open.

### Two panels' labels met in the middle (fixed)

`drawPie` sized an outer gutter from the longest label so no label could be
clipped by the plate edge, then laid the panels out abutting. Inside a panel a
label starts `R + LAB` from the centre and runs outward, so any label wider than
`pw/2 − R − LAB` overhangs its own panel. With two panels side by side, the left
one's right-hand label and the right one's left-hand label overhang into the
same channel and meet.

On `DSAT-2026-A` Q21/Q22 they did: **"Mathematics  45%" and "Year 10  20%"
overlapped by 0.8 × 3.1 px** and read as a single two-line block floating between
the pies, belonging to neither — on a pair of questions whose whole point is
telling the two distributions apart. The outer gutter had been sized for exactly
this overhang. The inner one had never been sized at all.

The channel is now sized from the two labels that actually meet in it — the left
panel's furthest-right reach plus the right panel's furthest-left — with no
constant added, because the character-count width estimate already runs about
15% long and that surplus is the air. Panels that already clear stay abutting,
so `pie-0` and `pie-1` render byte-identically to the baselines approved before
this existed.

**Why no case caught it.** `pie-0` has two panels as well, but its labels are
short and the two facing the channel are shorter still, so abutting panels held
and nothing in the set could have gone red. `pie-2` is the missing case: not the
exam's item — **this repository is public and no exam content may enter it** — but
its shape, a long right-pointing label out of the left panel meeting a long
left-pointing one out of the right, invented and reaching further across the
channel than the case that found it. Measured in a browser with the channel
removed, `pie-2`'s two labels overlap by 32.2px while `pie-0` and `pie-1` still
clear; with it, none of the three collides. Reverting the channel turns `pie-2`
red and leaves the other two green, which is the check earning its keep. Same
lesson `geo-2` records: **a contract only covers the failures it has a case for.**

### A two-panel pie was drawn at half the family's type size (fixed)

Measured in the real card, at 1440×900, against a 17.5px stem and this exam's
15.6px bar-chart numerals, the pie's labels landed at **8.7px** — on the figure
a student reads the answer off.

The cause is not the stylesheet. **A one-line label is as wide as its whole
string, and that width — not the circle — makes a pie plate three times the
width of the pie inside it.** Two of those abreast overflow any question column,
so the column scales the plate down and the type with it.

Ten compositions were rendered through the real `exams.html` card against the
live rows before one was chosen. The ones that only moved the constants each
traded one defect for another:

| composition | label | pie radius | figure height |
|---|---|---|---|
| as shipped — 560px measure, one line | 8.7px | 44.7px | 178px |
| the card's full 702px measure | 11.0px | 56.1px | 223px |
| + type raised to 17px | 12.6px | 47.6px | 189px |
| + pies drawn smaller | 13.7px | 38.6px | 174px |
| + smaller again | 14.6px | **32.3px** | 152px |
| one panel per row (stacked) | 16.8px | 80.4px | **590px** |
| **the share set beneath its name** | **15.3px** | **57.7px** | **240px** |

Raising the type widens the labels, which widens the plate, which scales it back
down — so it is only ever bought by shrinking the pies until the charts are an
afterthought. Stacking buys the type at the cost of a figure that pushes the
stem and all four options below the fold.

**Setting the share on a second line makes a label as wide as the longer of the
two strings rather than their sum** — close to half for real category names. The
plate narrows, the scale rises, and the type and the pie both get bigger. It
costs one line of height per label and changes nothing about the vocabulary:
same two hues and two neutrals, same direct labelling, same white separators,
same titles.

Two things follow from it, both deliberate:

- **The pie is shown at the card's measure (702px), not the figure measure
  (560px).** A pie is the one family whose plate is intrinsically two figures
  side by side; the stem and the answer choices already use all 702. `SHOWN`
  is untouched, so no other family moves.
- **`PIE.PX` is 300**, the width a panel comes out at when a two-panel plate is
  shown at 702 — so a lone pie and a paired one draw a panel the same size,
  which is what that cap has always been for.
