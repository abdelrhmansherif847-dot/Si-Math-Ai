# The plot spec cannot say what a figure is — a proposal

**Status: PROPOSED. No migration file has been written and nothing has been
applied.** Per the repo convention a migration is authored only after the design
is approved, and applied only after the file itself is approved.
Written 2026-08-26.

---

## 1. The gap, stated exactly

`exam_stimulus_spec_ok`'s `plot` branch validates *where* the points are. It has
no way to record *what they are*. These three specs are byte-identical in the
database and mean entirely different things to a student:

```jsonc
{"curves":[{"points":[[1,90],[2,84],[3,79]]}]}   // a scatter of observations
{"curves":[{"points":[[1,90],[2,84],[3,79]]}]}   // samples of a smooth curve
{"curves":[{"points":[[1,90],[2,84],[3,79]]}]}   // vertices of a polygon
```

The same silence covers whether the plane is **metric** — one pixel per unit on
both axes, so a circle is round, a right angle is square and a slope reads true
— or a **data plot** whose axes measure different quantities, where squaring the
scales would be meaningless.

Both were found by rendering figures and looking at them, not by reasoning:
a scatter drawn joined, a parabola drawn as a V, a circle drawn as an ellipse.
See `student-facing-rendering-validation.md` §3.

## 2. Why `display` is the wrong home

The M4 migration draws the line itself, and its own worked example decides this
case:

> number-line closed/open endpoints → SEMANTIC. They encode `<` versus `<=`.

A rendering choice that changes what the figure *asserts* is semantic. Joining a
scatter asserts a functional relationship that does not exist. Squaring a data
plot asserts a geometry that is not there. Neither is presentation.

And `display` is documented as *"hints the renderer MAY honour"*. Putting these
there would leave a conforming renderer free to invert a figure's meaning. That
is not a loose contract; it is no contract.

## 3. The third option, and why it fails

The specimen renderer currently carries both decisions in a table beside the
spec, keyed by item. It is honest for one renderer and it is exactly what the
M4 migration set out to prevent:

> Rendering is delivery-phase work and belongs in `_shared/` so preview and
> delivery cannot draw the same question two ways.

Two renderers with two copies of that table is the drift the whole `_shared/`
pattern exists to stop. The table is a stopgap with a known expiry, not a design.

## 4. Proposed shape

Four additions to the `plot` semantic core. Everything else stays where it is.

| Key | Required | Values | Why semantic |
|---|---|---|---|
| `frame` | yes | `plane` · `data` | `plane` guarantees equal axis scales. Without it a circle is an ellipse and the radius reads wrong. |
| `curves[].figure` | yes | `scatter` · `curve` · `polygon` | Whether the points are observations, samples of a continuous curve, or vertices. Changes what the figure asserts. |
| `curves[].closed` | no (default false) | boolean | A *smooth* closed curve cannot express closure by repeating its first sample: the interpolation still has to wrap, and the duplicate distorts the tangent. Repeating the vertex works for a polygon and not for a circle. |
| `curves[].pointLabels` | no | array of strings, one per point (`""` = unlabelled) | The prompt says "points A and B". If the renderer drops the names the question is unanswerable. |

`expr`-based curves are constrained to `figure = 'curve'` — an expression cannot
be a scatter or a polygon.

Deliberately **not** promoted, because none of them change meaning: dash
patterns, mark sizes, grid density, colour, legend placement. Those stay in
`display`, which is the right home for them.

## 5. The validator change, in full

Replacing the `plot` branch of `exam_stimulus_spec_ok`. Additions marked `-- NEW`.

```sql
when k = 'plot' then
  s ?& array['xRange','yRange','curves','frame']                        -- NEW: frame
  and (s ->> 'frame') in ('plane', 'data')                              -- NEW
  and jsonb_typeof(s -> 'xRange') = 'array' and jsonb_array_length(s -> 'xRange') = 2
  and jsonb_typeof(s -> 'yRange') = 'array' and jsonb_array_length(s -> 'yRange') = 2
  and not exists (select 1 from jsonb_array_elements(s -> 'xRange' || s -> 'yRange') n
                   where jsonb_typeof(n) <> 'number')
  and ((s -> 'xRange' ->> 0)::numeric < (s -> 'xRange' ->> 1)::numeric)
  and ((s -> 'yRange' ->> 0)::numeric < (s -> 'yRange' ->> 1)::numeric)
  and jsonb_typeof(s -> 'curves') = 'array'
  and jsonb_array_length(s -> 'curves') >= 1
  and not exists (
        select 1 from jsonb_array_elements(s -> 'curves') c
         where jsonb_typeof(c) <> 'object'
            or not ((jsonb_typeof(c -> 'expr') = 'string')
                    or (jsonb_typeof(c -> 'points') = 'array'
                        and jsonb_array_length(c -> 'points') >= 2))
            -- NEW: every curve declares what it is
            or (c ->> 'figure') is null
            or (c ->> 'figure') not in ('scatter','curve','polygon')
            -- NEW: an expression can only be a curve
            or (jsonb_typeof(c -> 'expr') = 'string' and (c ->> 'figure') <> 'curve')
            -- NEW: closure is meaningless for a scatter
            or (c ? 'closed' and jsonb_typeof(c -> 'closed') <> 'boolean')
            or ((c ->> 'figure') = 'scatter' and (c ->> 'closed')::boolean is true)
            -- NEW: a label per point, "" where a point is unnamed
            or (c ? 'pointLabels' and (
                  jsonb_typeof(c -> 'pointLabels') <> 'array'
                  or jsonb_typeof(c -> 'points') <> 'array'
                  or jsonb_array_length(c -> 'pointLabels') <> jsonb_array_length(c -> 'points')
                  or exists (select 1 from jsonb_array_elements(c -> 'pointLabels') l
                              where jsonb_typeof(l) <> 'string'))))
  and (not (s ? 'xLabel') or jsonb_typeof(s -> 'xLabel') = 'string')
  and (not (s ? 'yLabel') or jsonb_typeof(s -> 'yLabel') = 'string')
```

Note the NULL trap the M4 file already warns about: `jsonb_typeof()` of an
absent key is NULL, not a mismatch, so the required keys are caught by the
`?&` presence guard and by the explicit `is null` test above — never by a type
comparison alone.

## 6. Blast radius — two call sites, not one

`exam_stimulus_spec_ok` is called from:

1. the `exam_stimuli` shape CHECK, and
2. inside `exam_question_choices_ok`, which validates a per-choice
   `{visual:{kind,spec}}` — the pattern EST uses for four coordinate planes
   offered *as the four answer choices*.

Tightening the plot branch therefore also tightens choice-level visuals. That is
correct and intended: a coordinate plane used as an answer choice needs to say
what it is at least as badly as one used as a stimulus.

`publish_exam_form()` is unaffected in shape — it calls the same helper.

## 7. Cost: free today, not free later

Measured against production on 2026-08-26, before any content was inserted:

| table | rows |
|---|---|
| `exam_forms` | **0** |
| `exam_form_sections` | **0** |
| `exam_questions` | **0** |
| `exam_stimuli` | **0** |
| published forms | **0** |

**There is nothing to back-fill and nothing frozen.** Adding *required* keys is
a plain `create or replace function` plus a re-validating CHECK, and no existing
row can fail it because no existing row exists.

The moment the first form is inserted this stops being true, and a published
form makes it permanent: publication freezes a spec forever, and a published
plot spec written under the current shape can never afterwards say what its own
figure is.

## 8. Consequence for sequencing

This inverts one step of the plan. The DSAT content insert was to come first;
it should now come second:

```
  schema decision  →  migration approved and applied  →  DSAT insert  →  wiring
```

Inserting 66 items first would mean writing every plot spec twice — once under
the current shape, once after — or accepting a back-fill that today costs
nothing.

## 9. What is being asked for

A decision on §4, nothing more. On approval the next step is a migration file
carrying the §5 body, its rollback, and a behavioural probe in a subtransaction
that always rolls back — the M1/M3/B1/B5/M4 shape — presented for a second,
separate approval before anything is applied.
