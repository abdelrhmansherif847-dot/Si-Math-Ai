# EST and ACT on the exam engine

**Status: both forms exist as DRAFT in the Question Spine and deliver through
the real `exams.html`. Neither is published; no student can reach either.**

## What the audit found

The engine did not need generalising. Grepping the whole delivery path for `SAT`
or `DSAT` returns one hit, and it is a documentation reference inside a comment.

| Component | Verdict |
|---|---|
| `exam-registry.js` | Already carried `EST_MATH_1`, `EST_MATH_2_L1`, `ACT_MATH` with real structures, calculator policies and announcement schedules |
| `exam-delivery.js` | Walks a list of stages; compares answers as trimmed strings. No option count anywhere |
| `exam-form-source.js` | Reads any form by code |
| `exams.html` | Iterates `choices` and prints whatever `id` each row holds |
| stimulus · chrome · workspace · audio · ambience · integrity · calculator | Keyed on exam code or policy |
| `preflight-exam-form.mjs` | Its own usage example was already `ESTM1-2026-A EST_MATH_1` |

Two things did need work.

## 1. The database refused to store an ACT question

M3 fixed multiple choice at exactly four options lettered A–D, and fixed
`correct_answer` to the literal list `('A','B','C','D')`. ACT Math is
five-choice with alternating lettering — odd questions A–E, even questions
F–K, no I — so an ACT form could not be inserted at all.

`20260830c_question_spine_choice_sets` accepts three id sets and no others:
`{A,B,C,D}`, `{A,B,C,D,E}`, `{F,G,H,J,K}`.

**It also tightened the answer rule rather than merely widening it.**
`correct_answer` is now checked against the row's own `choices` instead of a
fixed letter list. Under the old rule, widening the letters would have let an
even-numbered ACT question offering F G H J K carry `correct_answer` `'A'` —
every constraint satisfied, and an unanswerable question. The tightening closes
that for every exam at once, including the SAT rows already stored.

Verified before applying: all ten shape cases behaved as intended as read-only
SELECTs against production, and all 66 DSAT questions passed both new
predicates, so `ADD CONSTRAINT` validated rather than failed.

## 2. Nothing knew which letters belong to which exam

The migration deliberately stops at what is *storable* and refuses to learn
ACT's odd/even alternation — the same line M3 drew when it would not CHECK
`exam_code` against a list or name a variant id. `exam-registry.js` owns the
convention: `sat4` (four options A–D, student-produced responses permitted) and
`act5alt` (five options, alternating, no grid-ins), with
`choiceIdsFor(code, ordinal)` as the one place a letter is decided.

`build-exam-form-draft.py` reads the section plan from the registry by shelling
out to node, so a form whose sections disagreed with the registry cannot be
built. It refuses three things, each demonstrated failing before being
demonstrated passing:

- a question lettered A–D where the ordinal calls for F–K
- a grid-in in an exam whose convention permits none
- an answer naming an option the question does not offer

## The forms

| | `ESTM1-2026-A` | `ACTM-2026-A` |
|---|---|---|
| Exam | `EST_MATH_1` | `ACT_MATH` |
| Structure | 1 section, 50 questions, 75 min | 1 section, 45 questions, 50 min |
| Format | 42 MCQ (A–D) + 8 grid-ins | 45 MCQ, alternating A–E / F–K |
| Calculator | permitted throughout, BYOD | permitted throughout, BYOD |
| Status | draft | draft |

Both are original Si Math content — `content_origin` is CHECK-locked to
`original_si_math`, so nothing third-party can be stored. **The content is not
in this repository and must not be.**

### Authoring checks

Each item carries an independent arithmetic check evaluated at build time: the
item is authored once as prose and once as arithmetic, and the build fails if
the two disagree.

**That was not enough, and the gap is worth recording.** The arithmetic checks
verify the MATHEMATICS, not the KEY. ACT item 1 computed 20 correctly and
pointed at 17, and every check still passed. A second pass comparing each keyed
option against the value its own explanation derives caught that and one more
(item 7, keyed on 18 where the answer is 22). A third defect — item 10 offered
five options for `x²−5x−24` and **not one of them was a factor** — was caught by
reading the item rather than by any check.

### Answer-key balance

Authored as prose, EST came out A7 B17 C14 D4 and ACT came out A3 B4 C10 D4 E2 /
F3 G5 H8 J6 **K0**. A student answering B to every EST question, or ruling K out
of every even ACT question, would beat chance without doing mathematics.

The build rebalances by reordering options — but only where order carries no
meaning. Where five options are bare numbers in ascending order, a student
scanning for a value expects a sorted list, and shuffling it would make the item
harder to read to buy a tidier key. Those are left as authored, and three ACT
items were instead given different distractors (each still a named error) so the
answer leaves the middle. Final: EST A11 B11 C10 D10; ACT A5 B4 C6 D3 E5 /
F4 G4 H5 J5 K4.

## Verified on the real surface

Both forms were sat through the deployed `exams.html`, not just tested:

- ACT q1 renders **A B C D E**, q2 renders **F G H J K**, five options each
- EST q1 renders **A B C D**; its grid-ins render as a text field
- Clocks come from the registry: **49:59** for ACT, **74:59** for EST
- Section labels, form codes and question counts all correct
- No console errors, no page errors, no failed requests, on either form

## Not done in this phase, deliberately

Scaled scoring (ACT 1–36 against SAT/EST 200–800), the wider EST system, and
publication to students. Publishing is a separate irreversible act gated on a
pre-flight, and these forms stay DRAFT until that decision is taken.
