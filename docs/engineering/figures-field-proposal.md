# `figures[]` — a PREPARED migration, for review

**Status: PREPARED. Not applied.** `apply_migration` has not been called.

Files: `supabase/migrations/20260827b_plot_figures.sql` and its rollback.
Proof: `scripts/verify-figures.sh` — **40 checks**, plus 4 renderer checks and
the 23 authored specs run through the live function.

---

## 1. The proposed schema change

`20260827a` added `frame`: what a plot **is**. This adds `figures[]`: how each
of its curves is **drawn**. Both were named in the preview generator's own
comment — *"the second decision the spec cannot carry"* — and this is that
second one.

It is semantic, not a rendering hint. **The same array of points is a parabola
or a scatterplot depending on it**, and a renderer that guessed would invent a
continuous relationship the data never claimed.

Three additions:

| | |
|---|---|
| `exam_plot_frame_mode_ok(frame, mode)` | the combinations the system has a meaning for |
| `exam_plot_figures_ok(spec)` | structure, vocabulary, and agreement with `curves[]` |
| `exam_stimulus_spec_ok` | plot branch now requires `figures` and calls the above |

## 2. The vocabulary — locked, not extended

Read out of the shipped figure loop. **No new words are introduced.**

| key | values | applies to |
|---|---|---|
| `mode` | `curve` · `polygon` · `scatter` · `points` | required, every figure |
| `closed` | boolean | `curve` only — it is `smoothPath`'s wrap flag; `linePath` ignores it |
| `vertices` | boolean | `polygon` only — draws dots at the corners |
| `dashed` | boolean | any |
| `labels` | string[] | `polygon` and `points` only |

**Unknown keys are refused**, so `tension`, or `label` for `labels`, fails at
the INSERT instead of being silently ignored by a renderer that never reads it.

## 3. `frame` × `mode` — combinations, not fields in isolation

Validating each field alone would let a scatter sit on a coordinate plane
because both halves are individually valid. They are two halves of one
statement, and some pairs are contradictions:

| | curve | polygon | scatter | points |
|---|:--:|:--:|:--:|:--:|
| **plane** — geometry | ✓ a circle | ✓ a triangle | ✗ | ✓ named points |
| **graph** — a function | ✓ | ✓ straight lines | ✗ | ✓ a marked point |
| **data** — measured | ✓ a fit line | ✗ | ✓ | ✗ |

* `scatter` on `plane`/`graph` — a scatter asserts **measured observations**; a
  plane asserts geometry and a graph asserts a function. Neither is a sample.
  Named dots on a plane are `points`, which already exists.
* `polygon` on `data` — a closed straight-sided shape over measured data has no
  reading.
* `points` on `data` — observations on a data frame are `scatter`. Refused so
  there is exactly one way to say it.

## 4. Labels: one per **distinct** vertex

A polygon that closes by repeating its first point has *n* points and *n−1*
vertices. Requiring `labels.length == points.length` would have rejected the
triangle in the real content; labelling the repeat would print the same letter
twice in one corner. The rule counts distinct vertices, and both cases are
checked.

## 5. The silent fallback is gone

`renderForQuestion` used to do `spec.figures || [{mode:'curve'}]`. It now
throws:

```
renderForQuestion: plot <id> has no figures[] —
how each curve is drawn is authored, never guessed
```

Proven, and so is the semantics it protects: feeding **the same 27 points**
through with `mode:'scatter'` gives *27 points, 0 curves*; with `mode:'curve'`
it gives *0 points, 1 curve*. That is the whole argument for why this belongs in
the spec.

## 6. Verification

| | |
|---|---|
| `scripts/verify-figures.sh` | **40 checks** on a throwaway Postgres replaying the five applied migrations first |
| the 21-row `frame`×`mode`×keys matrix | written from the rules, in `scripts/figures-matrix.txt` |
| the 23 authored specs | all 23 pass `exam_stimulus_spec_ok` under the new validator |
| `vfall.cjs` | 4 checks: no fallback, and `figures` decides the drawing |
| non-vacuity | the combination rule is stubbed to `true`, a scatter-on-a-plane is then **accepted**, and refused again once restored |
| rollback | included; drops both helpers and points at `20260827a` for the validator |

No regression: reading 37, e2e 7 stages, figure pages 232 / 176 / 96,
authoring review 12. The e2e harness now applies **both** migrations, so the
shared-stimulus proof runs against the full stack.

## 7. No backfill

`exam_stimuli` is empty — measured immediately before writing. As with `frame`,
this is the cheapest moment the change will ever have.

---

## Two content defects this surfaced — both must close before publication

Neither is a schema problem. Both are cases where **the stem says one thing and
the mathematics stored says another**, which no amount of design can paper over.

### CONTENT-1 · M2A:9 — the line of best fit does not exist

> *"A line of best fit **is drawn** through the points. Which is closest to its
> slope?"*

The spec contains **only the six observations**. There is no fit line in the
figure. The student is asked for the slope of a line that was never drawn.

Fixing it means adding a second curve — `{mode:'curve', dashed:true}` on a
`data` frame, which the vocabulary above already permits — and authoring its two
endpoints. It cannot ship as it stands.

### CONTENT-2 · M1:9 — "two lines" that are segments

> *"The graph shows **two lines**. What is the x-coordinate of the point where
> they intersect?"*

The spec stores two five-point polylines spanning x ∈ [−1, 3] and [0, 4] inside
a window of [−2, 6]. They stop short of both edges, so they read as **segments**,
not lines. Either the points extend to the window edge or the stem says
"segments".

Logged rather than fixed here: this is authoring, and it is the owner's call
which way each one resolves.
