# Mock delivery — dry run against production, 2026-08-30

**Status: LIVE.** `20260830e` (`20260830202630`) and `20260830f`
(`20260830203031`) were applied to `igvkyxkmjnkzscqgommj` on 2026-08-30 with
explicit owner approval, one at a time, verified after each. The rollback
`20260830y` is deliberately not applied.

**No content was published.** All 3 forms and all 161 questions remain `draft`,
`exam_available_sections()` returns 0, and `exam_attempts`/`exam_responses` hold
0 rows. Publishing stays a separate authoring decision.

**Why:** `docs/engineering/weakness-evidence-audit.md` §5 found that every
blocked weakness insight is blocked by the same absence — no per-item response
exists anywhere. This layer records that and nothing else.

---

## 1 · How it was verified before being applied

Both migrations were executed **inside a transaction that was rolled back**,
against the real database, together with a full end-to-end sitting. So the SQL
is known to compile and behave against the live schema without anything being
committed. Production is unchanged: `exam_attempts` and `exam_responses` do not
exist there yet.

The test form went through the **real publish path** — `draft → review →
publish_exam_form()` — so the run also exercised the authoring contract, which
enforces approved questions, contiguous ordinals, difficulty and originality
attestation before a form can be sat.

## 2 · What the dry run proved

| | |
|---|---|
| `exam_start` delivers the section | 3 items, 1800s allowed |
| **The answer key never leaves the server** | payload carries no `correct_answer`, no `explanation`, and not the grid-in answer string |
| Responses are pre-created | 3 rows before a single answer, so an omission is a row rather than a gap |
| Restarting resumes | same attempt id, one attempt row — a double-tap cannot start a second sitting |
| Per-item timing and revisits accumulate | 66,000ms across 3 items, 3 visits |
| Re-answering adds time | Q2 reached 53,000ms across two visits and kept the newer answer |
| Nothing is graded before submit | `is_correct` null on every row |
| Another student cannot answer into it | `22023` |
| Graded server-side, correctly | correct=1 wrong=1 omitted=1 |
| A session row exists for history and the streak | one row, `score` deliberately NULL |
| **`exam_mistakes` finally carries per-item evidence** | `question_id`, `correct_answer` and `student_answer` all populated — empty in 11 of 11 legacy rows |
| A submitted attempt is closed | `22023` |
| Resubmitting does not double-count | still one session, one mistake row |
| Draft forms are not deliverable | `22023` |
| Only published sections are listed | 1 listed; the 5 draft sections stayed hidden |
| Grader | 10 cases: MCQ exact/case-folded/wrong/omitted, grid-in exact/spaced/decimal/wrong/omitted/non-numeric |

## 3 · Two bugs the dry run found, and what changed

**1 · `idempotency_key` is a uuid, not text.** `exam_submit` built
`'attempt:' || attempt_id`, which fails on insert. The attempt id is already
unique per sitting, so it is now used directly. A pure type error — invisible in
review, fatal on first use.

**2 · Omissions were being graded `false`, and became weakness signals.** This is
the one worth keeping. `exam_answer_matches` returns false for a blank answer, so
every unanswered item was marked wrong and flowed into `exam_mistakes` and from
there into the weakness pipeline.

That is not a rounding error, it is a wrong claim about a student. **The
questions a student runs out of time for are the ones at the end of the paper**,
so signalling omissions would have inflated whichever topic happened to sit
there — and the inflation would have looked like a genuine, growing weakness in
that topic, on the student's own page and on their teacher's.

Now `is_correct` is three-valued and each state means exactly one thing:

```
true  → answered correctly       false → answered wrongly       null → not answered
```

The omission is still recorded, with its time and visit count, because running
out of time is real evidence about pacing. It simply does not become a weakness
signal. Re-verified: a 4-item sitting answered right / wrong / blank / never
reached produces correct=1 wrong=1 omitted=2, two rows with `is_correct` null,
**one** mistake row, and a mistakes payload totalling 1.

## 4 · What it does not do

No scaled scores (`score` stays NULL — a raw count is honest and a conversion
table does not exist here). No adaptive routing between the DSAT Module 2
`standard`/`advanced` variants, though an attempt records which section was sat
so routing can be added without touching this schema. No proctoring —
`exam_integrity_events` stays where it is. It writes no `weakness_signals`
itself: `exam_submit` returns mistakes in the shape `ExamMistakesLogger.process()`
already takes, so the frozen logger and the frozen analyzer stay the only
authorities.

## 5 · The delivery page

`exam.html` is the browser half: pick a sitting, sit it timed, one item at a
time, submit. It is resumable — a stable `client_request_id` in `localStorage`
means a refresh resumes the same attempt rather than starting a second one — and
the timer is anchored to the server's `started_at`, so reloading does not buy
more time. Running out submits automatically.

It reports the four facts as it goes: the answer, a **time delta** since the last
save (so a lost message costs one interval rather than the total), a visit on
entering an item, and a flush on leaving, every 20 seconds, and when the tab is
hidden or closed.

On submit it hands the mistakes straight to `ExamMistakesLogger.process()` and
then `regenerateWeaknessReports()` — the frozen logger and the frozen analyzer
stay the only writers of signals and reports. The result is four raw counts;
there is no scaled score because none is computed.

**Driven end to end in a real browser** (preview paper): start → Q1 of 4, four
choices, timer counting → answer → next → jump to the grid-in item → type →
submit → "1 correct, 1 wrong, 2 left blank, 4 questions". The page tells the
student in words that blanks are recorded but not counted as weaknesses.

`?preview=1` runs a sample paper entirely from local fixtures and reaches the
database not at all, which is how the experience was built and verified without
publishing anything.

## 6 · What is still missing before a real student can sit one

**Published content, and nothing else.** All 3 forms and all 161 questions are
`draft`, so `exam_available_sections()` is empty and the page shows an honest
"no exam is available yet" state. Taking a form through review and publishing it
is an authoring decision with an immutability contract attached, and this work
deliberately did not take it.
