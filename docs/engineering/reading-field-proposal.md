# `frame` and `reading` — a PREPARED migration, for review

**Status: APPLIED 2026-08-27** as version `20260827135710`, after individual
approval. Verified live before and after — see §7.

Files: `supabase/migrations/20260827a_stimulus_reading.sql` and its rollback.
Proof harness: `scripts/verify-reading.sh` — **37 checks, all passing** against
a local replay of the four applied Spine migrations.

---

## 0. Why there are two fields, not one

The figure design system computes every variant from two inputs. One is derived
(`resolutionOf()` — already implicit in the spec, nothing to store). The other
is authored, and that is `reading`.

But wiring it up surfaced a second gap that is more fundamental. **A triangle, a
function graph and a scatterplot are all `kind='plot'` today**, and they want
opposite treatments: equal scales and a permanent grid for one, neither for the
others. The renderer has no way to tell them apart, and inferring it from the
shape of the data is exactly what this schema refuses everywhere else.

So: `frame` says *what the figure is*, `reading` says *what the question asks
about it*. They go in different places, for a reason given in §1.

---

## 1. The proposed schema change

### `exam_stimuli` — `spec.frame`, required on every plot

`exam_stimulus_spec_ok`'s plot branch gains two lines:

```sql
s ?& array['xRange','yRange','curves','frame']
and (s ->> 'frame') in ('plane', 'graph', 'data')
```

Everything else in that function is reproduced byte-for-byte from `20260825a`,
so the diff is one branch.

**Only one call site.** Correcting a note carried in earlier work: the validator
is called from the `exam_stimuli.spec` CHECK and nowhere else.
`exam_question_choices_ok` does *not* call it — choices are text-only, exactly
`{id, text}`. So this change touches one constraint.

### `exam_questions` — `reading`

```sql
alter table public.exam_questions add column reading text;
alter table public.exam_questions add constraint exam_questions_reading_check
  check (reading is null or reading in ('shape', 'value'));
```

Plus one shared helper and two triggers (§4).

### Why `reading` is on the QUESTION and `frame` is on the STIMULUS

`exam_questions.stimulus_id` is documented as many-to-one: *"Several questions
may reference ONE stimulus — that is how a shared passage is modelled."*

Two questions can share a graph and ask different things of it — *"how many
turning points?"* and *"what is f(3)?"*. Putting `reading` on the stimulus would
force them to agree, and the second question would get the wrong figure. `frame`
has no such problem: a triangle is a triangle whatever is asked about it.

### Explicitly NOT in `display`

The spec already has an unvalidated `display` object for renderer hints. That is
where a manual design switch would live, and it is the wrong home for this:
`reading` is enumerated, validated, and refused where it has no meaning.
`display` is none of those things by design.

---

## 2. Allowed values, and what each one means

### `spec.frame` — a property of the figure

| value | meaning | consequence |
|---|---|---|
| `plane` | A coordinate plane where **shape carries meaning** — coordinate geometry. | Equal scales mandatory: a circle must be round, a right angle right. The grid is the measuring instrument and is **always** drawn. |
| `graph` | The **graph of a function**. The curve is the subject. | An *x* unit need not equal a *y* unit. A grid appears only when a value must be read off it. |
| `data` | **Measured data** on two different quantities. | No origin, no equal scales, no arrowheads. Horizontal reference lines only, and only when a value must be read. |

### `exam_questions.reading` — a property of the question

| value | meaning |
|---|---|
| `value` | The student must read a **numeric value or position** off the figure, with precision. |
| `shape` | The student must judge **shape, relationship or behaviour**, without extracting a precise value. |

**`reading` is not a design switch.** It is *refused* — must be NULL — wherever
it has no meaning: a question with no stimulus, a table, a number line, a
passage, and a `frame='plane'` plot whose grid is never optional. Storing it
there fails. That refusal is what keeps it a statement about the question rather
than a knob an author reaches for.

---

## 3. Specs before and after

**A coordinate-geometry figure.** Gains `frame`; the question stores no
`reading`, and storing one would fail.

```diff
  {
+   "frame": "plane",
    "xRange": [-1, 7.5], "yRange": [-1, 9.4],
    "xLabel": "x", "yLabel": "y",
    "curves": [{ "points": [[0,0],[6,0],[6,8],[0,0]] }]
  }
```

**A function graph, shared by two questions.** One spec, two readings — the case
that decided where `reading` lives.

```diff
  {
+   "frame": "graph",
    "xRange": [-0.7, 4.7], "yRange": [-1.6, 5],
    "curves": [{ "expr": "x^3/3 - 2x^2 + 3x + 1" }]
  }

  exam_questions:
-   Q14  "How many turning points does the graph have?"   stimulus_id = S
-   Q15  "What is the value of f(3)?"                      stimulus_id = S
+   Q14  ...                                               reading = 'shape'
+   Q15  ...                                               reading = 'value'
```

**A chart.** No `frame` — a chart is always measured data — but `reading` is
required, because its reference lines depend on it.

```diff
  { "chartType": "bar", "categories": ["Mon","Tue"], "series": [...] }

  exam_questions:
+   Q21  reading = 'value'
```

**A number line and a table.** Unchanged. Their variants are derived, so they
neither gain `frame` nor accept `reading`.

---

## 4. What changes in validation and in the renderer

### Validation

| change | where |
|---|---|
| `frame` required and enumerated for `kind='plot'` | `exam_stimulus_spec_ok`, plot branch only |
| `reading in ('shape','value')` or NULL | `exam_questions_reading_check` |
| **where** `reading` applies, in one named place | new `exam_stimulus_needs_reading(kind, spec)` |
| `reading` required where consumed, **refused elsewhere** | new trigger `exam_questions_reading_applies` |
| a stimulus edit cannot desynchronise a question | new trigger `exam_stimuli_reading_still_valid` |

The second trigger exists because editing `spec.frame` from `plane` to `graph`
would leave every referencing question needing a `reading` it does not have.
Published forms are frozen, so this can only happen in draft — which is exactly
where it should be caught. The house rule from the same-form trigger applies: a
wrong combination is made **unstorable, not merely unpublishable**.

### Renderer

One function consumes both fields, and it is the whole of the change:

```js
function gridPlan(frame, reading, res) {
  if (frame === 'plane') return { mode: 'major', sub: res < 1 ? res : 0 };
  if (frame === 'graph') return { mode: reading === 'value' ? 'major' : 'none', sub: 0 };
  if (frame === 'data')  return { mode: reading === 'value' ? 'rules' : 'none', sub: 0 };
  throw new Error('gridPlan: unknown frame ' + JSON.stringify(frame));
}
```

**It throws rather than defaulting.** A plot whose frame the spec did not
declare is a content bug, not a figure to draw a guess for — and the database
now makes such a row unstorable, so reaching the throw means something bypassed
the constraint.

The renderer reads `spec.frame` **directly**, using the same three words the
database stores. An earlier draft called these `role: geometry | function |
data`, which meant two vocabularies for one concept and a translation table
between them. Renaming it collided with an existing presentational `frame`
boolean that draws the plate border — the same collision, in both directions,
twice. It is settled by giving the semantic field the good name and renaming the
border to what it actually is: `plate`.

---

## 5. Determinism — and the absence of a fallback

**The claim:** the set of cases where the renderer *consumes* `reading` is
exactly the set where the database *guarantees* it is present. There is no
reachable state in which the renderer must guess.

Every storable combination, enumerated:

| stimulus | `frame` | DB requires `reading`? | renderer consumes it? | variant |
|---|---|---|---|---|
| none | — | refused (must be NULL) | no | n/a |
| `text` | — | refused | no | n/a |
| `table` | — | refused | no | totals rank, derived from the data |
| `number_line` | — | refused | no | tick density = `resolutionOf()` |
| `plot` | `plane` | refused | no | grid always, step = `resolutionOf()` |
| `plot` | `graph` | **required** | **yes** | grid iff `value` |
| `plot` | `data` | **required** | **yes** | rules iff `value` |
| `chart` | — | **required** | **yes** | rules iff `value` |
| `figure` | — | refused | no | SVG exception path |

The two "required" columns match on every row. That is the proof, and
`scripts/verify-reading.sh` executes it rather than asserting it.

**No existing figure is affected, because there are none.** Measured on the live
project immediately before writing this:

```
exam_forms 0 · exam_form_sections 0 · exam_questions 0 · exam_stimuli 0
```

No backfill, no default to invent, no ambiguous legacy row. This is the cheapest
moment this change will ever have, and it does not come again.

**The guards are not decorative.** The harness drops
`exam_questions_reading_applies`, confirms that a missing `reading` and a
meaningless `reading` both become storable, restores the trigger, and confirms
both are refused again. A green suite that would stay green without the trigger
would be worth nothing.

**The rollback is exercised too**: the column and both triggers are gone
afterwards, and the harness checks it.

---

## 6. End-to-end: the render path is Question + Stimulus → Figure

The last gate, and the one that mattered most: **does the `reading` on a
question actually reach the renderer, or does the figure still come from the
stimulus alone?**

`scripts/verify-reading-e2e.sh` — **7 stages, 24 browser checks** — proves it
with a real database rather than a unit test passing values by hand.

It builds a Spine database with the PREPARED migration applied, stores **one**
`exam_stimuli` row referenced by **two** `exam_questions` rows, exports exactly
the payload a client would fetch, and renders both questions in headless
Chromium through `renderForQuestion(question, question.stimulus)`.

```
stimulus 337f759d…  kind=plot  spec.frame="graph"  27 points   ← ONE row
  Q14  "How many turning points does the graph have?"  reading = "shape"
  Q15  "What is the value of f(3)?"                     reading = "value"
```

Result: **Q14 renders with no grid, Q15 renders with a grid**, from a
byte-identical spec. The curve path is character-for-character the same in both
(2925 chars) — only the scaffolding changed.

### The swap test, which is what actually settles it

Two figures differing proves nothing on its own; the page could be branching on
the question number. So the harness then runs

```sql
update public.exam_questions
   set reading = case reading when 'shape' then 'value' else 'shape' end
 where stimulus_id = (select id from public.exam_stimuli where label='shared-cubic');
```

re-exports, re-renders, and checks again. The stimulus row is untouched — same
id, same spec — and the figures **swap**:

```
Q14: shape/no-grid  →  value/grid
Q15: value/grid     →  shape/no-grid
```

The figure follows the question row. Nothing else moved.

### The old path is closed, not merely unused

`renderStimulus(kind, spec)` took a stimulus alone. That was the bug: it would
have drawn one treatment for two questions needing different ones, silently. It
now **throws** for the families whose variant depends on the question:

```
renderStimulus: plot/graph renders by the question, so it cannot be drawn
from a stimulus alone — use renderForQuestion(question, stimulus)
```

`renderForQuestion` makes the same refusals the database makes — a missing
`reading` where one is needed, or a `reading` where none applies, both throw
rather than drawing a default. The database decides what may be **stored**;
`needsReading()` in the renderer decides what may be **drawn**, and the two are
written to be identical so a row cannot validate and then fail to render.

## 7. Applied — the live verification

### Before

Measured on `igvkyxkmjnkzscqgommj` immediately before `apply_migration`:

```
exam_forms 0 · exam_form_sections 0 · exam_questions 0 · exam_stimuli 0
exam_questions.reading            absent
exam_stimulus_needs_reading       absent
the two new triggers              absent
"frame" in exam_stimulus_spec_ok  absent
exam_stimulus_spec_ok md5         9579b190f89326b28e6055614dc5c47d
latest applied migration          20260825221601
```

### After

```
exam_questions.reading            text, nullable
exam_questions_reading_check      CHECK (reading IS NULL OR reading = ANY (ARRAY['shape','value']))
triggers                          exam_questions_reading_applies, exam_stimuli_reading_still_valid
"frame" in exam_stimulus_spec_ok  present
exam_stimulus_spec_ok md5         3de6adeabf0ad9d2bc2857f3565acaa4   (changed — the function was replaced)
latest applied migration          20260827135710      · 153 applied in total
rows                              still 0 / 0 / 0 / 0
```

### The pure functions, called directly on the live database

| call | result |
|---|---|
| `exam_stimulus_spec_ok('plot', …)` without `frame` | `false` |
| `…` with `frame:"wobbly"` | `false` |
| `…` with `frame:"plane"` / `"graph"` | `true` |
| `exam_stimulus_spec_ok('table', …)` | `true` — unaffected |
| `exam_stimulus_needs_reading` for `plot/plane` | `false` |
| `…` for `plot/graph`, `plot/data`, `chart` | `true` |
| `…` for `number_line`, `table` | `false` |

Exactly the matrix in §5.

### The triggers, exercised live and rolled back

The nine-case enforcement matrix was run against the live database inside an
explicit transaction, and **all nine matched**: `graph` without a reading
refused, with one stored; `plane` with a reading refused, without one stored;
`number_line` and no-stimulus likewise. The transaction was rolled back and the
tables re-counted afterwards — **0 forms, 0 sections, 0 questions, 0 stimuli, 0
probe rows of any kind**. Nothing was left behind.

### Advisors

`get_advisors(security)` returns 116 notices, none of them new in kind. The
three functions this migration added each raise `function_search_path_mutable`
— and so do the ten Spine functions that were already there, including
`exam_stimulus_spec_ok` and `publish_exam_form`. All three are **SECURITY
INVOKER** with no grant to `anon`, `authenticated` or `public`, so the
escalation this lint exists to catch does not apply; it is hygiene, and it is
Spine-wide rather than something this change introduced.

**Logged as follow-up**, not fixed here: setting `search_path` on all 13 Spine
functions is its own migration and deserves its own approval rather than being
smuggled in alongside an approved one.

## What this costs the content

The 66 authored DSAT items are not inserted yet. Every plot among them will need
`frame` authored, and every question referencing a `graph`, `data` or chart
stimulus will need `reading`. That is a content pass, not a code change, and it
is the point: **the content says what the question asks; the system decides how
it is drawn.**

## What is still not decided

Applying this. Nothing here is applied, `apply_migration` has not been called,
the production renderer is still unwired, and no content has been inserted.

---

## 8. Authoring the 66 items — what the content found

**Status: authored and checked, NOT inserted.** The dataset and its checker live
in the scratchpad, never the public repository: they carry exam stems.

The 66 items resolve to **23 distinct stimuli** — 11 plots, 6 tables, 3 charts,
3 number lines — of which **4 are shared by two questions each**.

| | |
|---|---|
| plots given a `frame` | 11 (`plane` 5, `graph` 4, `data` 2) |
| questions given a `reading` | 12 (`value` 11, `shape` 1) |
| shared stimuli | 4 |
| judgement calls surfaced | 3 |

Every decision carries the phrase that settles it, and `authcheck.py` restates
the live database's rules and applies them to all 66 before any insert, so an
insert cannot fail halfway. It reports **AUTHORING COMPLETE — every rule
satisfied**.

### The design's own case turned up in the real content

`M2S:9` and `M2A:9` share **one** scatterplot:

* M2S:9 — *"Which best describes the relationship between weeks of practice and
  errors per test?"* → `reading = shape`
* M2A:9 — *"A line of best fit is drawn through the points. Which is closest to
  its slope?"* → `reading = value`

One stimulus row, two questions, two different readings. This is precisely why
`reading` sits on `exam_questions` rather than on `exam_stimuli`, and it was not
a hypothetical — it is item 9 of the second module.

### FINDING · `figures[]` is still outside the spec

The curve modes — scatter, curve, polygon, points, `closed`, and the point
labels — have **never** been part of `exam_stimuli.spec`. They live in a
build-time table in the preview generator, whose own comment reads: *"the second
decision the spec cannot carry."* The applied migration carried the first half
(`frame`); this is the other half, and it was invisible until the content was
mapped onto the schema.

**The insert is not blocked.** `exam_stimulus_spec_ok` permits extra keys, so
`figures` stores. But it stores **unvalidated**, a wrong mode is therefore
storable, and publishing a form freezes it. Without it the renderer falls back
to `[{mode:'curve'}]` — which would draw all three scatterplots as continuous
curves.

**Recommendation: one small follow-up migration before the insert**, validating
`figures[]` on `kind='plot'`. It is the same argument that made `frame` worth
doing before content rather than after, and the Spine is still empty. Requires
its own approval.

### Three judgement calls, surfaced rather than smoothed over

* **M1:9** — two straight lines, and the question wants only an x-coordinate.
  Drawn today with equal scales so the slopes read true, but nothing in the
  question depends on that. Taken as `graph`; `plane` is defensible. Also the
  item whose stem says *"two lines"* while the spec stores two short segments.
* **M1:4** — *"for how many values of x does f(x) = 2"*. A count sounds like
  shape, but the count cannot be made without locating y = 2. Taken as `value`.
* **M2A:21** — *"which equation represents the parabola"*. Matching an equation
  is shape-like, but the candidates differ by values that must be read off.
  Taken as `value`.

### Verified visually

`vauth.cjs` — 12 checks, both themes — renders all 23 stimuli through
`renderForQuestion()` and confirms the authored values took effect: the
scatterplots draw as **points, not curves** (which is what proves `figures[]`
reached the renderer), the geometry figure keeps its grid, and the shape-read
scatter has no reference lines.

Nothing is inserted: `exam_forms`, `exam_form_sections`, `exam_questions` and
`exam_stimuli` are all still empty.
