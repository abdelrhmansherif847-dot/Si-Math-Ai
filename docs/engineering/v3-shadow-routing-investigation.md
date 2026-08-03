# Non-math turns were entering the V3 shadow pipeline — investigation and fix

**Reported:** 2026-08-03 — a Question Inspector row for a turn that began
"hi zero hru" carried `pipeline_version = l3-shadow-v3`. The design contract is
that V3 Shadow runs on math questions and nothing else.
**Status:** ✅ **FIXED IN SOURCE, NOT YET DEPLOYED.** `ai-tutor` v97 is merged to
the feature branch; production still runs v96 (platform version 135). Nothing
deploys the Edge Function automatically — see DEPLOY.md §4.
**Branch:** `claude/v3-shadow-math-routing-bfprpr`

---

## 1. Finding, in one line

The gate was `is_math`, which is a **model-authored label about the turn**; the
pipeline needs a **fact about the text**, because it instructs two solvers and a
judge to solve that text. Nothing checked the second thing.

---

## 2. What the reported row actually was

The row whose question begins "hi zero hru" is
`b9af8a15` · **"hi zero hru whats 1+1"**. It contains a real math question, and
the prompt's own rule is to answer the math part of a mixed message and ignore
the rest, so `is_math=true` was correct there and the shadow's verdict was sound
— solvers agreed on "2", judge agreed, confidence 1.000.

The bug is real, but the cleanest instance of it is two rows later in the same
session. The report was right about the class and imprecise about the row.

| row | question | topic stored | shadow result |
|---|---|---|---|
| `3f52f205` | **"okk good"** | Algebra / Exponents | solver_answers `["Final Answer:", "Final Answer:"]`, judge inconclusive, **confidence 0.200** |
| `6f019c9d` | **"Give me a similar SAT/ACT question on this topic"** | Algebra / Linear Equations | solver_answers `["x = 2 or x = 3", "20"]`, judge inconclusive, confidence 0.500 |

---

## 3. Root cause, traced from classification to execution

```
model JSON  →  scope + is_math  →  isMath  →  [shadow gate]  →  runL3ShadowPipeline
                                                   ↑
                                        the only condition was isMath
```

`index.ts` resolved the gate as:

```ts
if (verificationEnabled && verificationShadowOnly && isMath && recordId) {
```

`is_math` answers *"did the student work a math problem this turn?"* — a
question v93 deliberately separated from `scope`, and it answers it **with the
conversation history in view**. That is the whole mechanism:

1. **Context-carried acknowledgements.** "okk good" arrived one turn after
   "whats 22 root 0". The classifier carried the previous topic forward
   (Algebra / Exponents, `is_math=true`), Zero re-answered the earlier problem,
   and the shadow was handed the literal phrase "okk good". Two solvers were
   told to solve it and both returned an empty answer.
2. **Question-generation requests.** "Give me a similar SAT/ACT question on this
   topic" is genuinely `is_math=true` — a problem *was* worked. But the problem
   is in Zero's **output**. The solvers were handed the request sentence.
3. **Meta-commands.** "Speak English only", "كلمني عربي مش فرانكو",
   "no its one quetsion and four option" — all came back `is_math=true` on a
   math-topic session and all wrote shadow rows.

Every one of these wrote an `l3-shadow-v3` row, so every one appeared in the
Question Inspector — which filters on
`verification_meta->>pipeline_version = 'l3-shadow-v3'` and is therefore a
faithful mirror of the routing decision, not a separate defect — and every one
moved the solver-agreement and judge-verdict series the verification programme
reads as signal.

**The taxonomy gate is deliberately NOT the fix.** Four of the shadow rows have
`topic_id = null` because `Taxonomy.resolve` rejected them, and gating on that
looks tempting. But `2x+100=1200,find x=?` is one of them: it is unmistakably
math that the taxonomy simply failed to map. Gating on taxonomy resolution would
have dropped a real math question to fix a labelling problem.

---

## 4. The fix

`isShadowEligibleInput(questionText, hasImage)` in
`supabase/functions/_shared/verification.core.ts` — pure, synchronous, no model
call. `index.ts` consults it on the **exact inputs the pipeline would receive**
(the resolved worksheet text and image on a reference turn, the student's
message otherwise), so the gate judges the bytes the solvers will actually see.

| decision | reason |
|---|---|
| accept | `image` — an upload is always a problem, the axiom `resolveScope` already runs on |
| accept | `equation` — a relation symbol beside an operand, or LaTeX |
| reject | `generation_request` — a verb of supply plus a practice noun |
| accept | `math_content` — a numeral, an operator, or a math term |
| reject | `empty_input` / `no_math_content` |

**Direction of failure is deliberately the opposite of the domain scope guard.**
That guard fails open because refusing a real student is the expensive error.
Nothing here is student-facing: a false reject costs one shadow sample, a false
accept poisons the corpus the verification programme is built on. But dropping a
real math question would break "every math question is verified", so the rule is
**reject only on positive evidence that there is nothing to solve**. An equation
therefore outranks generation phrasing — `another question: 2x+5=11` still runs.

### Two traps the replay found, not the hand-written cases

- **Franco-Arabic digits are letters.** `3=ع, 7=ح, 2=ء`. "Ya zerooooo 3amel
  ehhh" and "Yala nbda2 2wel 7aga" are greetings containing no numbers, and a
  bare digit test routes every Franco greeting in. Counting letters does not
  separate them either — "3am" is Franco and "5cm" is a measurement, and both
  are one digit plus two letters. The discriminator is **how many** letters ride
  along: ≤1 is a variable or a question label, exactly 2 must be a unit or an
  ordinal, more is a Franco word.
- **Arabic agglutinates at both edges.** A naive test for `حل` fires inside
  `مرحلة`; requiring a hard boundary instead misses `المساحة` and `حلها`. A
  closed set of proclitics and enclitics is allowed between the boundary and the
  term and nothing else, so `حلو` — ubiquitous small talk — stays out.

### Where the gate is NOT placed, and why

Inside `runL3ShadowPipeline`. `tests/verification-core-parity.test.mjs` replays
six recorded scenarios through that function and asserts deep equality against a
golden captured from the pre-extraction code; one scenario's question text is
`"Which option is correct?"`, which this gate correctly rejects. Putting the
check inside the pipeline would have forced a regeneration of the golden, and
the suite says in its own header not to do that. The pipeline is the executor;
the router is the caller. The guarantee that no future call site can bypass the
gate is enforced instead by reading the shipped call site in the test suite.

---

## 5. Verification

**Replayed over 500 real production turns** (`question_records`, most recent 500
with non-empty text) — 129 of which ran `l3-shadow-v3`.

- **46 of the 129 would no longer run.** Every one was inspected by hand: the
  reported rows, five "Give me a similar question" requests, eight
  language/meta-commands, the exam-format questions ("امتحان ال DSAT كام سوال"),
  hint-mode conversational turns, one row of keyboard-layout garbage, and
  acknowledgements. **No false negatives remain in the corpus.**
- **83 still run**, including every equation, every worksheet reference, and
  **all image turns** — the largest math cohort, unaffected by construction.
- The replay is what caught the worst regression this fix nearly shipped: an
  earlier form of the Franco rule required a token to *start* with its digits,
  which read `Q17` and `q36` as Franco words and silently dropped **25 real
  worksheet references**. None of the hand-written test cases would have found
  it. Those cases are now pinned in the suite in their own right.

`tests/v3-shadow-routing.test.mjs` — 129 assertions covering the reported rows,
the two trap classes, the equation-outranks-phrasing rule, the wiring in
`index.ts`, and the blast radius. `node tests/run-all.mjs`: **28/28 green**
(27 pre-existing checks plus this suite), including `verification-core-parity`,
which is the proof the pipeline body itself did not move.

---

## 6. Blast radius

`is_math` is **untouched**. It still gates taxonomy resolution, mastery,
weakness, the difficulty detector, detector v2 and the client's solution
workflow. The only behaviour that changed is which turns enter L3 Shadow.

A skip now logs `[ai-tutor] l3-shadow-skipped` with its reason, so a missing
shadow row is distinguishable from a pipeline that crashed.

---

## 7. Adjacent defect — NOT fixed here

**`is_math` is still wrong on context-carried turns.** "okk good" was stored as
`topic=Algebra, subtopic=Exponents, difficulty=Easy` with two rules attached. It
therefore still pollutes **taxonomy, mastery and weakness**, exactly the way the
v93 exam-format bug did before it was fixed. The same is true of "Speak English
only" and the other meta-commands, several of which are stored as Algebra
practice.

This is the same class of bug as `is-math-classification.test.mjs` pins, one
layer earlier, and its blast radius is the whole student-facing record — which
is precisely why it was not folded into a shadow-routing fix. It needs its own
change, its own prompt rules, and its own regression suite.
