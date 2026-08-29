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
