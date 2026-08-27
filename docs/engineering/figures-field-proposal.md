# `figures[]` — a PREPARED migration, for review

**Status: APPLIED 2026-08-27** as version `20260827154657`, after individual
approval. 154 migrations applied. Verified live before and after.

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

## Applied — the live verification

| | before | after |
|---|---|---|
| `exam_stimuli` / `exam_questions` rows | 0 / 0 | **0 / 0** |
| `exam_plot_figures_ok`, `exam_plot_frame_mode_ok` | absent | both present |
| `exam_stimulus_spec_ok` md5 | `3de6adea…` | **`5c20cf6c…`** |
| latest migration | `20260827135710` | `20260827154657` (154 applied) |

Called live: a plot with no `figures` → `false`; `graph`+`curve` → `true`;
`plane`+`scatter` → `false`; `data`+`polygon` → `false`; `data`+`scatter` →
`true`; unknown mode → `false`; unknown key (`tension`) → `false`;
`data`+`curve` (the fit line) → `true`; tables untouched. All 24 authored specs
validate.

### A drift I introduced, recorded rather than hidden

`pg_get_functiondef` md5s differ between the repository file and production for
two of the three functions. **The executable logic is byte-identical** — with
comments and whitespace stripped, both sides give `45eab35e…` and `31d37afe…`
at identical lengths (1518 and 3810 characters). Raw lengths differ (2806 vs
1897; 5090 vs 5042) because I trimmed inline comments while composing the
`apply_migration` call instead of passing the file body verbatim.

Harmless, and avoidable: **pass the migration file's body unedited.** Recorded
so a future session comparing deployed against tree finds the answer instead of
re-deriving it, as `support-actions` already requires.

## Two content defects this surfaced — both now FIXED

Neither is a schema problem. Both are cases where **the stem says one thing and
the mathematics stored says another**, which no amount of design can paper over.

### CONTENT-1 · M2A:9 — FIXED, the fit line is now drawn

> *"A line of best fit **is drawn** through the points. Which is closest to its
> slope?"*

The spec contains **only the six observations**. There is no fit line in the
figure. The student is asked for the slope of a line that was never drawn.

**Fixed** by adding the actual least-squares fit as a second curve:
`y = −6.057x + 96.200`, drawn from (0.5, 93.17) to (6.5, 56.83) as
`{mode:'curve', dashed:true}` on the `data` frame — the one combination the
migration allows for exactly this. The key was already right: the true slope is
−6.057 and choice C is −6.

**Consequence, stated plainly.** M2S:9 and M2A:9 were one of the four shared
stimuli, and the one I cited as proof that `reading` belongs on the question —
`shape` for the relationship, `value` for the slope. Now that M2A:9 has a fit
line the two specs differ, so **they are no longer the same stimulus**, and that
shape/value split is no longer present in the content. Three shared stimuli
remain, all with matching readings.

The architecture is unchanged and still right — it costs nothing and covers the
case — but I should stop citing the content as proving it, because after this
fix it does not.

### CONTENT-2 · M1:9 — FIXED, the stem now says what the figure shows

> *"The graph shows **two lines**. What is the x-coordinate of the point where
> they intersect?"*

The spec stores two five-point polylines spanning x ∈ [−1, 3] and [0, 4] inside
a window of [−2, 6]. They stop short of both edges, so they read as **segments**,
not lines. **Fixed** by changing the wording rather than stretching the geometry: the stem
now reads *"The graph shows two line segments."*
