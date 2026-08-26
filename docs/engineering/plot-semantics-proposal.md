# Plot semantics — vocabulary and invariants review

**Status: UNDER REVIEW. No migration file has been written and nothing has been
applied.** Revision 2, 2026-08-26. Revision 1 proposed four additions; this
revision is the vocabulary-and-invariants review that was asked for before any
of it is frozen, and it **changes two of the four**.

> The first migration here is not a technical change. It becomes the language
> every figure on the platform is described in, for EST and ACT as much as for
> the DSAT items that happen to exist today. It is worth reviewing twice.

---

## 1. The principle that decides what goes in

The whole change is cheap **only because every Spine table is empty** (measured
2026-08-26: forms, sections, questions, stimuli and published forms all zero).
But "cheap now" is not a reason to put everything in now. The M4 migration
already set the test, when it deferred `accepted_answers`:

> Deferring is safe and was checked: adding a nullable column later is a plain
> ALTER, published MCQ rows would correctly hold NULL, and no SPR question can
> exist before the column does, so no published row ever needs back-filling.

Applied here, that test draws a clean line:

| | goes in now | can wait |
|---|---|---|
| **Required keys** | ✅ — a required key cannot be added later without a back-fill, and a published form freezes the old shape forever | |
| **Optional keys with a consumer today** | ✅ — the figures exist and the validation can actually be exercised | |
| **Optional keys with no consumer yet** | | ✅ — adding one later is a function replacement, and absent correctly means "not that kind of figure" |

So the first migration freezes as little as possible: **the two required keys,
plus the optional ones we can exercise against real figures today.** Everything
else is listed in §7 with the reason it can wait, so deferring is a recorded
decision rather than an oversight.

## 2. `frame` — three values, not two

**Changed from revision 1.** Revision 1 had `plane` and `data`. Reviewing
against EST and ACT rather than the DSAT set shows that collapses two different
things.

| value | axes | scale | drawn as |
|---|---|---|---|
| `plane` | both are pure number, and **distance is meaningful** | **must be equal on both axes** | axes crossing at an origin, arrowheads, square grid |
| `graph` | both are pure number, distance is *not* compared | free | axes crossing at an origin, arrowheads |
| `data` | axes measure **different quantities** | free | axes at the edges, quantity names, no arrowheads |

The `plane`/`graph` split is not cosmetic. A circle, a right angle, a distance
or a congruence is only readable when one unit of *x* is one unit of *y* — that
is what `plane` guarantees. A function graph asks for none of that: it is read
by *value*, and forcing equal scales on a function with **y** ∈ [−20, 20] over
**x** ∈ [0, 5] crushes it into a vertical smear.

Revision 1 would have forced every function graph into `plane`. That worked on
the DSAT set only because those particular ranges happened to be similar — which
is exactly the accident this review exists to catch.

**Required.** A plot that does not say whether distance is meaningful cannot be
drawn correctly by any renderer, now or later.

## 3. `curves[].figure` — a closed vocabulary of three

| value | what the points are | joined |
|---|---|---|
| `scatter` | individual marks | never |
| `curve` | samples of a continuous curve | smoothly |
| `polygon` | vertices | with straight segments |

**Why these three are complete, and why the list can be closed.** The vocabulary
names *how the points connect*, not *what shape they make*. Connection has
exactly three states — unjoined, joined smoothly, joined straight — and every
figure any of the three exams can pose is one of them:

| figure | reading |
|---|---|
| circle, ellipse, arc, parabola, any conic | `curve` |
| triangle, quadrilateral, any polygon, a segment, a path | `polygon` |
| scatter, a plotted point, a set of named points | `scatter` |

**This is the reason not to put shape names in the vocabulary.** `circle`,
`triangle`, `parabola` is an open list — the next exam brings a sector, an
annulus, an arc, a piecewise path — and an open list in a frozen spec is a
vocabulary that is wrong the first time it meets a figure nobody anticipated.
It also duplicates information the points already carry, and duplication is
where contradiction comes from: `figure: "circle"` with four points, or with
`closed: false`, is representable nonsense.

Naming the connection instead makes the enumeration **complete rather than
merely current**, and the shape stays where it already is — in the points.

**Required.** This is the key the whole review exists for; a curve that does not
say how it is read leaves the renderer guessing, which is the defect being fixed.

## 4. `curves[].closed` — a sibling key, with the contradictions rejected

The question raised in review: does `closed` belong beside `figure` or inside it?

**Folding it in was considered and rejected.** A vocabulary of
`{scatter, curve, closed_curve, polygon, closed_polygon}` does make the illegal
state unrepresentable rather than merely rejected, which is the stronger
guarantee. It stops scaling the moment a second orthogonal property arrives:
adding extent (§7) would multiply the list to fifteen values, and each further
property multiplies it again. That is how a vocabulary becomes unusable.

**Kept as a sibling, with the contradictions rejected by the validator instead.**
The model then cannot *store* a contradictory figure, which is the guarantee
that was actually asked for:

* `closed` is **forbidden** when `figure = 'scatter'` — absent, not merely false.
  A scatter has no closure to assert either way.
* `closed` is **forbidden** alongside `expr` — an expression has no endpoints.
* `closed: true` requires **at least three points**. A closed two-point path is
  degenerate.

## 5. `curves[].pointLabels` — unchanged

An array of strings, one per point, `""` where a point is unnamed. Semantic
because the prompt says "points *A* and *B*": a renderer that drops the names
leaves the question unanswerable. Forbidden alongside `expr` — an expression has
no enumerable points to name.

## 6. Two limits in the *current* validator that this review found

Neither is part of the four additions. Both are existing rules that block real
EST and ACT figures, and both are cheapest to fix in the same migration.

1. **`points` must have length ≥ 2, so a single point cannot exist.**
   "Point *P* is at (3, 4)" is an ordinary coordinate-geometry item and it
   cannot be represented at all today. The rule should depend on the figure: a
   **path** (`curve`, `polygon`) needs ≥ 2; a **`scatter`** needs ≥ 1.

2. **`dashed` was filed under `display` in revision 1, and that is wrong for one
   role.** As decoration it is presentation. As the *boundary of a region* it
   carries strict-versus-inclusive — the same distinction the M4 migration
   already ruled semantic for number-line endpoints. Since no item in any of the
   three exams needs a shaded region yet, this is deferred with the rest of
   §7 rather than guessed at now — but it is recorded so the eventual region
   work does not quietly put meaning in a hint.

## 7. Deliberately deferred, with the test that justifies it

Each of these is a real figure property that EST or ACT can pose. Each is
**optional**, so adding it later is a `create or replace function` with no
back-fill and no published row needing rewriting — and absent correctly means
"not that kind of figure". None has a consumer in the current corpus, so its
validation could not be exercised against a real figure today.

| deferred | what it would express | why not now |
|---|---|---|
| `extends` | segment vs ray vs line — whether the path continues past the visible window | no item in the corpus distinguishes them; adding it later is optional-key cheap |
| region fill + boundary strictness | "the shaded region represents…", solid vs dashed boundary for ≤ vs < | no region item exists yet; guessing the shape now would freeze an unexercised contract |
| box plot, stem-and-leaf as a figure | five-number summaries drawn as a figure | these are a new `kind`, not a `plot` figure — a separate capability, out of scope |

## 8. The full invariant set

Every rule the validator enforces on a plot, and what each one rejects. A rule
that cannot reject anything is not a rule.

| # | invariant | rejects |
|---|---|---|
| P1 | `frame` present and in `('plane','graph','data')` | a plot that does not say whether distance is meaningful |
| P2 | every curve has `figure`, in `('scatter','curve','polygon')` | a figure the renderer would have to guess at |
| P3 | `expr` present ⇒ `figure = 'curve'` | an expression declared a scatter or a polygon |
| P4 | `expr` present ⇒ no `closed`, no `pointLabels` | closure or names on something with no enumerable points |
| P5 | `figure = 'scatter'` ⇒ no `closed` | a closed scatter |
| P6 | `closed` present ⇒ boolean | a string or number standing in for a truth value |
| P7 | `closed = true` ⇒ ≥ 3 points | a degenerate closed two-point path |
| P8 | `figure = 'scatter'` ⇒ ≥ 1 point; `curve`/`polygon` ⇒ ≥ 2 | an empty scatter, a one-point path — **and it unblocks the single named point that is impossible today** |
| P9 | `pointLabels` ⇒ array of strings, length equal to `points` | a label count that does not match the figure |
| P10 | existing range rules unchanged | (as today) |

### Legal and illegal combinations, exhaustively

| `figure` | `expr` | `points` | `closed` | `pointLabels` | |
|---|---|---|---|---|---|
| `scatter` | — | ≥ 1 | absent | optional | ✅ |
| `curve` | — | ≥ 2 | absent / `false` | optional | ✅ |
| `curve` | — | ≥ 3 | `true` | optional | ✅ |
| `curve` | string | — | absent | absent | ✅ |
| `polygon` | — | ≥ 2 | absent / `false` | optional | ✅ |
| `polygon` | — | ≥ 3 | `true` | optional | ✅ |
| `scatter` | — | ≥ 1 | **`true` or `false`** | | ❌ P5 — a scatter has no closure |
| `scatter` \| `polygon` | **string** | | | | ❌ P3 — an expression is a curve |
| `curve` | string | | **any** | | ❌ P4 — no endpoints to close |
| any | — | **2** | **`true`** | | ❌ P7 — degenerate |
| any | — | ≥ 1 | | **length ≠ points** | ❌ P9 |
| **absent** | | | | | ❌ P2 — the defect being fixed |

## 9. Blast radius — unchanged from revision 1

`exam_stimulus_spec_ok` has two call sites: the `exam_stimuli` shape CHECK, and
`exam_question_choices_ok`, which validates a per-choice `{visual:{kind,spec}}` —
the pattern EST uses for four coordinate planes offered *as the four answer
choices*. Tightening the plot branch tightens both, which is intended: a plane
used as an answer choice needs to say what it is at least as badly as one used
as a stimulus.

## 10. What is being asked for

A decision on §2 through §6 — the vocabulary, the invariants, and the two
existing-validator fixes. Only after that is a migration written, carrying the
§8 invariants, its rollback, and a behavioural probe in a subtransaction that
always rolls back — the M1/M3/B1/B5/M4 shape — and presented for a second,
separate approval before anything is applied.

**Sequence, as agreed:**

```
  vocabulary review  →  migration proposal  →  separate approval
      →  apply  →  DSAT insert  →  renderer wiring
```
