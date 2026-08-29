# DSAT-2026-A — the first form in the Spine

**Inserted into production 2026-08-29, as DRAFT, after explicit approval.**
Not published. Not visible to any student. This is the record of what went in,
how it was verified, and what is deliberately still missing.

> ⚠️ **This repository is PUBLIC.** Nothing below quotes a prompt, an option, an
> answer or a figure. Everything here is counts, hashes and process. The items
> live with the author, outside this repository, and the tooling reads them from
> a directory you point it at — see `scripts/build-exam-form-draft.py`.

---

## 1. Why it was inserted before it was finished

The 66 authored items existed in exactly one place: an ephemeral working
directory that dies with its container. Every hour they stayed there was an hour
the whole authoring effort could be lost to a timeout.

Draft is the landing state the Spine was designed for. It commits to nothing:
publication is a separate, irreversible act behind a gate that currently refuses
this form three times over (§4), and nothing about a draft reaches a student.
So the content became durable without anyone claiming it was ready.

## 2. What is in production

| | |
|---|---|
| Form | `DSAT-2026-A` · `exam_code = SAT_FULL` · status **draft** |
| Sections | 3 — Module 1, Module 2 (standard), Module 2 (advanced); 22 questions / 35 min each |
| Questions | 66 — 22 per section |
| Stimuli | 24, referenced by 27 questions (**3 are shared** by two questions each) |
| `reading` | 12 questions carry one |
| `calculator_allowed` | `true` on all three sections |

The three shared stimuli are the point of the `reading` column: one figure,
two questions, two different renderings. An earlier converter would have
inserted a separate stimulus row per question and destroyed that property
silently. `build-exam-form-draft.py` inserts each distinct stimulus once.

## 3. How it was verified — three hashes and a render

The insert was **transcribed** into the database through a tool call, so
"it looked right" is not evidence. What makes it evidence:

**Content fidelity.** A canonical string per question — section, variant,
ordinal, prompt, format, choices flattened in id order, answer, explanation,
difficulty, topic, subtopic, stimulus label, reading — hashed three ways, by
three independent implementations:

| computed by | aggregate |
|---|---|
| Python, from the authored source files | `2bc474b0…89611ad` |
| PostgreSQL 16, on the local verification database | `2bc474b0…89611ad` |
| PostgreSQL 17.6, on production | `2bc474b0…89611ad` |

Mutation-tested: changing one character of one prompt, one answer letter, or
one option's text each moves the aggregate. It could have gone red.

**Stimulus fidelity.** `label ‖ kind ‖ spec::text` over all 24 —
`f29aa549…c99a00fc` on production, identical locally.

**Render.** The 27 question+stimulus pairs are byte-identical between the two
databases (`420d6ee3…f96b3f0ccd3`), and the shipped renderer draws all 27 from
those rows with nothing supplied out of band: 6 table, 15 plot, 3 chart,
3 number line.

> **A false alarm worth keeping.** The render-input hashes first came back
> DIFFERENT. The cause was not the data: production is `en_US.UTF-8` and the
> local harness `C.UTF-8`, and the check ordered by the signature string itself,
> so the two `string_agg`s concatenated in different orders. Re-run with
> `order by … collate "C"` both sides give `420d6ee3…`. **A cross-database hash
> comparison must pin its ordering, or it compares collations rather than
> content.**

## 4. What the live pre-flight says

Run against production, same result as the local harness:

| severity | check | rows |
|---|---|---|
| ERROR | `form-status` | 1 |
| ERROR | `question-status` | 66 |
| ERROR | `question-attestation` | 66 |
| WARNING | `question-explanation` | 40 |

**Every error is workflow state, and that is the correct state to be in.** Three
human acts stand between this and a published form, and all three are supposed
to be human: approving each question, attesting its originality, and moving the
form to `review`. None of them blocks anything a draft is for.

**Nothing structural failed.** Module shape against the `SAT_FULL` expectation,
all 66 ordinals, both Module 2 variants, difficulty on every question, taxonomy
linkage, no orphan stimulus, no use of the SVG media exception.

That clean result is evidence rather than silence: on the local harness,
deleting a question, nulling a difficulty and adding an orphan stimulus each
turn the matching check red, and five malformed rows — a plot with no
`figures[]`, one with no `frame`, a figure mode its frame forbids, a `reading`
where nothing renders by it, and clearing a `reading` a figure depends on — are
all refused by the live constraints.

## 5. Student exposure — measured, not assumed

`authenticated` **does** hold a `SELECT` grant on all four tables. What makes
the form invisible is RLS: each table has exactly one policy, `SELECT … using
has_role_at_least('admin')`, and no INSERT/UPDATE/DELETE policy for
`authenticated` at all. `anon` holds no grant.

Verified by acting as the role rather than reading the policy:

```
acting_as = authenticated, is_admin = false
forms 0 · sections 0 · questions 0 · stimuli 0
```

Worth stating precisely, because "there is no student read path" is not quite
right and the difference matters: the path exists and is gated. If
`has_role_at_least` ever regressed, this data would be one predicate away from
readable — and `exam_questions.correct_answer` is in it. When delivery ships,
the M3 comment on that column already names the requirement: *"student-facing
access is a separately approved, published-only read model that must exclude
this column."*

## 6. Deliberately not done

* **40 questions have no explanation.** A later content-authoring pass, by a
  person. Not generated, not invented, and not a publish gate.
* **No question is approved and none is attested.** Both are human judgements
  about content and provenance; a tool that performed them would be defeating
  their purpose.
* **The form is not published, and no student-facing read model exists.**

## 7. The tooling, and why it is in this repository

`build-exam-form-draft.py` · `verify-exam-form-draft.sh` ·
`check-exam-form-renders.mjs`

None of them contains content; all three read it from a directory given on the
command line. They are here so that the next form — `DSAT-2026-B` and after —
does not start from a blank page, and so that this one can be re-verified after
the container that authored it is gone.
