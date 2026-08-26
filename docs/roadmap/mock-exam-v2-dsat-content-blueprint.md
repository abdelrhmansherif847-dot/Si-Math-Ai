# Digital SAT — content blueprint

**Status:** DESIGN, agreed with the owner 2026-08-25. **No questions authored.**
**Scope:** what a DSAT form contains and why. Nothing here builds delivery,
scoring, or any part of the exam experience.

**What this document decides:** the shape of a `SAT_FULL` form — Module 1 and
both Module 2 routes — and the principle that makes the two routes genuinely
different rather than two piles sorted by a label.

**What it deliberately does NOT decide:** how questions reach a student, how
answers are captured, how anything is scored, and whether Si Math AI replicates
the real exam's score ceiling for the lower route. Those are separate decisions,
and one of them (§6) is not even a settled fact yet.

---

## 1. The two modules have different jobs

This is the whole design, and everything below follows from it.

**Module 1 reads the student.** Its job is to place them fairly — to spread
students across the range so the routing decision is sound. That makes its
*middle* the important part: the routing boundary sits there, and a module made
of very easy and very hard items sorts badly, because everyone clusters at the
ends and the boundary is decided by noise.

**Module 2 measures the student.** Its job is precision inside the band Module 1
identified. It is not a second attempt at placement; it is a finer ruler.

A consequence worth stating, because it is easy to get backwards: **Module 1
must not be built to be hard.** A routing module that intimidates measures
anxiety rather than ability, and a student who freezes in the first ten minutes
gets routed on their nerves. It starts at a natural, accessible level, covers a
wide range, and concentrates its resolving power in the middle.

---

## 2. The fairness contract

These are identical across `standard` and `advanced`. If any of them differed,
the route would change *what* is tested rather than how demanding the path to
the answer is — and a student's syllabus would depend on their first 35 minutes.

| Held constant | Why |
|---|---|
| The four domains and their weights | A route must not remove a domain from a student's exam |
| Taxonomy subtopic coverage | No concept may be unreachable because of a route |
| 22 questions, 35 minutes | The registry is explicit that routing changes no timing; this is also what keeps the timer state machine untouched |
| Question-format balance | The exam should feel like the same exam |

**The route changes the depth and complexity of the path to the answer. It never
changes the mathematics a student is examined on.**

---

## 3. Mechanisms, not labels

**A question is not "hard". It is harder *for a reason*, and the reason is
nameable.** This is a principle for the platform, not only a rule for this
blueprint.

`easy | medium | hard` is a summary. It is what the database stores and what a
report prints, and it is nearly useless for authoring — "write a hard one" is
not an instruction anyone can follow twice the same way. These are the levers an
author actually pulls:

| Mechanism | Lower setting | Higher setting |
|---|---|---|
| **Steps to solution** | one or two | two to four |
| **Translation load** | the mathematics is already on the page | a situation the student must model first |
| **Surface familiarity** | the standard presentation of the concept | the same concept in unfamiliar dress |
| **Distractor design** | wrong answers are plainly wrong | each wrong answer is the result of one specific slip |
| **Abstraction** | numeric coefficients | parameters; the answer is an expression |
| **Direction** | forward — given the input, find the output | reverse — which condition must hold |
| **Composition** | one subtopic | two subtopics resolved together |

Two items can share a subtopic, share a difficulty label, and be entirely
different questions depending on where these sit. That is what makes an adaptive
route real.

**Why this matters beyond authoring.** When a student gets an item wrong, "they
missed a hard question" is not a diagnosis. "They can do this algebra but not
when it is stated as a situation" is. Recording the mechanism at authoring time
is what makes the second sentence possible later — in feedback, in the weakness
model, and in anything the tutor says about *why* a student is stuck. The levers
are written down here so that the option stays open; nothing in this phase
depends on it.

---

## 3a. Representation is a mechanism, not decoration

Added 2026-08-25, on the owner's direction, after Module 1 review.

**Two rules, and the second is the one that is easy to fail.**

1. **Every visual must be load-bearing.** Remove it and the question must die.
   A chart a student can ignore because the number is also in the prompt is
   decoration, and decoration in an exam is worse than plain text — it costs
   reading time and returns nothing.
2. **Each representation must test a different way of thinking, not re-skin a
   question.** Turning "read a value from a table" into "read a value from a bar
   chart" adds variety to the page and nothing to the measurement. The
   representation has to be *why* the item is hard, or it is a costume.

That second rule is what makes the register below a register of *purposes*
rather than a list of shapes:

| Representation | What only it can ask |
|---|---|
| `table` | compare rows; infer a **relationship or a missing entry**, not read a cell |
| `chart` · bar | compare series across categories — where difference and ratio diverge |
| `chart` · line | change over time; rate, not level |
| `plot` · function | zeros, vertex, maximum, intervals; **comparing two functions**; transformation read as a picture |
| `plot` · scatter | trend and prediction, where no formula is given |
| `plot` · coordinate | distance, geometry reached through coordinates |
| `number_line` | strictness — open versus closed — visible nowhere else |

**Five types in a module is a floor, not a ceiling.** Module 1 reached five and
that was the beginning of the standard, not the target.

**The fairness contract of §2 extends to representation.** `standard` and
`advanced` carry the same *kinds* of representation in similar proportion. What
differs is the depth of reading: `standard` recovers a value from the table,
`advanced` infers the rate that generated it. The same chart, a different
question of the student. One route must never be "the graphs one" and the other
"the algebra one".

**Currently unavailable, and why:**

| Wanted | Blocked by |
|---|---|
| Pie charts | `exam_stimulus_spec_ok` permits `chartType` of `bar` or `line` only. Widening it is a migration and a decision, not a workaround |
| Geometry diagrams — angles in a figure | `kind = 'figure'` is closed to the SVG media path by design, and the storage bucket does not exist. Owner decision 2026-08-25: cover geometry through coordinate plots and text for now, and close this gap deliberately later |

---

## 4. The three sections

Question counts are fixed by the registry (22 each). Difficulty spreads below
are **initial design targets, tunable during authoring** — they are choices
about our exam, not claims about the real one.

**Module 1 — built to sort, not to intimidate**
Opens at a natural, accessible level. The bulk of its resolving power sits in
the middle band, where the routing boundary lives. A small stretch tail keeps
strong students from hitting a ceiling that would blur the top of the range.
Mechanisms mostly at their lower settings, with the middle band varying one or
two levers at a time — that is what produces a clean spread.

**Module 2 `standard` — the same mathematics, seen clearly**
Mechanisms at their lower settings throughout. The intent is a student
demonstrating what they actually know, with the presentation getting out of the
way: mathematics on the page rather than buried in a scenario, one idea per
item, distractors that do not punish a moment's carelessness as if it were a
misconception.

**Module 2 `advanced` — the same mathematics, further in**
Mechanisms at their higher settings. Modelling before solving; concepts in
unfamiliar dress; parameters instead of numbers; questions asked backwards;
two subtopics resolved in one item. Every distractor earns its place by encoding
a specific error.

---

## 4a. The routing threshold — Module 1 to Module 2

**Decision, owner, 2026-08-25. Version 1.**

> **17 or more of 22 → Module 2 `advanced`. 16 or fewer → `standard`.**

**This is Si Math AI's rule for Si Math AI's exam. It is NOT a claim about how
the College Board routes the real Digital SAT**, whose rule is not published. It
belongs in the same category as §6's register: ours, and labelled as ours.

### Why 17, and not 80%

80% of 22 is 17.6 questions, which is not a score anyone can get. Any percentage
has to be rounded to a question boundary, so the boundary is the real decision
and the percentage is decoration: 17/22 is 77.3%, 18/22 is 81.8%.

**17 is not a compromise between them. It is the only score with a property
worth having**, and the property comes from Module 1's own composition — 6 easy,
10 medium, 6 hard:

| | |
|---|---|
| Highest score reachable **without solving a single hard item** | 6 + 10 = **16** |
| So a score of **17** guarantees | at least **one** stretch item solved |
| A score of **18** would require | at least **two** |

At 16 a student may have answered every routine question and nothing beyond
them. At 17 they cannot have. **The threshold is the point where "this student
did something beyond the routine" stops being an inference and becomes a fact.**

That also answers the objection to 18 directly: it does not ask for evidence of
capability, it asks for two pieces of it, and turns the advanced route into a
reward for near-perfection. A strong student who makes five ordinary mistakes
should not be routed away from the harder material.

**This derivation is specific to a 22-item module of 6/10/6.** If Module 1's
difficulty mix ever changes, the threshold must be re-derived, not carried over.

### What this does NOT do

- **It cannot run.** Nothing scores Module 1 — the platform captures no answers
  and computes no score (see `mock-exam.html`: *"no score, no answers, no
  evaluation of any kind"*). This is a decision recorded ahead of the machinery
  that would apply it, not a behaviour.
- **It is not calibrated.** No student has sat this exam. 17 is a defensible
  starting point, not an empirical finding, and it is the first thing to
  re-examine once there is real performance data: do students at 16–17 actually
  do better on one route than the other?
- **It is not the long-term design.** Module 1 was built with mechanisms and
  difficulty deliberately varied, so treating its 22 items as interchangeable
  marks is a simplification we accept for v1 and should outgrow. The intended
  direction is routing on a **performance profile**: a student at 16 who solved
  the hard items and slipped on easy ones is not the same student as one at 17
  who cleared the routine and nothing else. That is what §3's mechanisms make
  possible later, and it is the reason for recording them at authoring time.
- **The student never sees it.** They finish Module 1 and the next module opens.
  No threshold is displayed, and no route is named — the registry already
  withholds per-variant labels for the same reason.

---

## 5. Coverage, identical in all three sections

22 questions per section, mapped to the live taxonomy:

| Domain | Items | Taxonomy |
|---|---:|---|
| Algebra | 8 | `ALG_006` Linear Equations & Functions · `ALG_007` Systems · `ALG_008` Inequalities |
| Advanced Math | 7 | `ALG_010` Quadratics · `ALG_004` Polynomials · `ALG_011` Exponentials · `FUN_001` Functions · `FUN_002` Transformations |
| Problem-Solving & Data | 4 | `PR_003` Percentages · `PR_004` Ratio & Proportion · `PR_005` Unit Rates · `STA_002` Mean/Median/Mode · `STA_005` Data Analysis |
| Geometry & Trigonometry | 3 | `GEO_002` Triangles · `GEO_005` Trigonometry · `GEO_006` Circles · `GEO_008` Coordinate Geometry |

The domain split is a design choice reflecting the Digital SAT's known emphasis
on algebra and advanced mathematics. **It is not transcribed from an official
specification** — see §6.

---

## 6. UNVERIFIED — open questions about the real exam

**Everything in this section is unconfirmed. None of it may become a design fact
or a system behaviour until it is verified against an official source.** They are
recorded here so that the next person knows which numbers are ours and which are
supposed to be the exam's.

| Claim | Status |
|---|---|
| The MCQ / grid-in ratio is roughly 75 / 25 | **UNVERIFIED.** General understanding, no official source consulted. Treat the format mix as a design choice until confirmed |
| Routing to the lower Module 2 caps the score a student can reach | **UNVERIFIED, and deliberately not acted on.** Stated from general knowledge of the format |
| The domain weights in §5 | **UNVERIFIED as a transcription.** They are our chosen emphasis, informed by the exam's known character |

**On the score ceiling specifically.** Si Math AI builds no scoring today, so
nothing depends on this. Two things must not be assumed:

1. that the claim is true — it needs an official source; and
2. that having an easier and a harder route in the *content* implies replicating
   a score ceiling in *scoring*.

The second is a separate decision with a real tension behind it — fidelity to
test day against what a training platform should do to a student's ceiling
after 35 minutes — and it will be taken on its own terms, not inherited by
accident from this blueprint.

---

## 7. Item shapes, by mechanism

Abstract shapes, to make the levers concrete for authoring. **These are not
questions and must not be treated as a question bank** — real content lives only
in the Spine's draft state, never in this repository, which is public.

| Mechanism | Lower-setting shape | Higher-setting shape |
|---|---|---|
| Steps | Solve a two-step linear equation for the unknown | Solve for an unknown whose coefficient is itself fixed by a second stated relation |
| Translation | The equation is given; evaluate it under a stated condition | A described situation the student must turn into a relation before anything can be solved |
| Familiarity | A quadratic in its standard presentation | The same quadratic reached through its factored form, its vertex, or a table of values |
| Distractors | Options far apart; only one is close to reasonable | Each option is what a student lands on after one specific slip — a sign, a halving, an off-by-one |
| Abstraction | Numeric coefficients; the answer is a number | Parameters; the answer is an expression in those parameters |
| Direction | Given the function and an input, produce the output | Given a property of the function, determine which statement must be true |
| Composition | One subtopic, resolved directly | A coordinate-geometry situation that also requires solving a system before it yields |

---

## 8. What happens next

1. This blueprint is agreed. *(Done — owner, 2026-08-25.)*
2. Author 66 questions in a scratchpad, never in this repository, and present
   them for review.
3. On approval, insert as `draft` into the Spine, run
   `scripts/preflight-exam-form.mjs`, move to `review`, publish.
4. Repeat for EST, then ACT.

**The pipeline is already proven** — `scripts/verify-spine-pipeline.sh SAT_FULL`
takes a synthetic 66-question form with both Module 2 routes through migrations,
pre-flight, publish, immutability and every realistic authoring mistake, on a
throwaway database. What is missing is the content, not the machinery.

Experience work — the paper feel, timing pressure, sound, the psychological
simulation — begins only after DSAT, EST and ACT all stand on a proven
foundation. **Fidelity first, then the cleverness on top of it.**
