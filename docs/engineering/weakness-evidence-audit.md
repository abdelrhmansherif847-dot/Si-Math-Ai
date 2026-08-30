# Weakness evidence audit — what the exam engine actually records

**Date:** 2026-08-30 · **Project:** `igvkyxkmjnkzscqgommj`
**Why:** before connecting Weakness Intelligence to the Teacher and Assistant
surfaces, establish what evidence exists per question — measured, not assumed.
Requested explicitly so that v1 is designed on the real record rather than on a
guess about it.

**Headline:** a weakness system already exists, is well-designed, and is
**almost entirely derived from tutor conversations, not from exams**. Per-item
exam evidence is not recorded anywhere, and the columns that would hold it are
100% empty.

---

## 1 · What one mock exam records today

The shipped flow in `mock-exam.html` is `SELECT → TIMER → RESULTS → MISTAKES`.
The student sits the paper, then **types in their own totals** and picks the
topics they got wrong. What lands in the database:

| Table | Rows | What a single exam contributes |
|---|---:|---|
| `exam_practice_sessions` | 22 | One row: `exam_type`, `score`, `correct/wrong/omitted_answers`, `duration_minutes`, `started_at`, `ended_at`. Session totals only. |
| `exam_mistakes` | 11 | One row per topic the student ticked: `topic`, `subtopic`, `mistake_count`, `mistake_type='EXAM_MISTAKE'`. |

`exam_mistakes` **has** the columns for per-item evidence — `question_id`,
`correct_answer`, `student_answer`. They are filled in **0 of 11 rows**, because
the MISTAKES step never collects them. The schema anticipated per-question
capture; the interface never asked for it.

### What does not exist at all

A search for any attempt/response/answer table across every schema returns
exactly one match, `public.response_feedback` — which rates *Zero's* answers, not
a student's. **There is no per-item response record anywhere in the database.**

So for a mock exam the platform cannot answer: which item, chosen answer, time
on item, order of work, what was skipped and revisited. Not "hard to compute" —
not recorded.

### The authored side is ready, and that is the important asymmetry

| Table | Rows | State |
|---|---:|---|
| `exam_questions` | **161** | **161 of 161** carry `subtopic_id` **and** `difficulty`. Also `skill`, `correct_answer`, `question_format`, `choices`, `explanation`. |
| `exam_forms` / `exam_form_sections` / `exam_stimuli` | 1 / 3 / 25 | Authoring live; `exam_forms` states plainly that student delivery is a future, separately approved phase. |

Every authored item is already taxonomy-linked and difficulty-tagged. **The
content side is ready for per-item weakness; the delivery side is what does not
exist.** The gap is one phase, not one column.

---

## 2 · What the weakness system is actually built from

`weakness_signals` — 891 rows, 15 students:

| Source | Signals | Share |
|---|---:|---:|
| `AI_CHAT` | 767 | **86%** |
| `FOCUS_PRACTICE` | 111 | 12% |
| `MOCK_EXAM` | 13 | **1.5%** |

Only **3 students** have ever produced a mock-exam signal. By signal type:
`topic` 698, `resolution` 159, `explanation_repeated` 26, `repeated` 5,
`multi_concept` 2, `exam_confused` 1. Mean weights: `exam_confused` 1.20,
`repeated` 0.80, `topic` 0.68, `explanation_repeated` 0.60, `multi_concept` 0.30,
`resolution` 0.03.

707 of 891 signals carry a `source_question_id`; 778 are taxonomy-linked to a
`subtopic_id`.

> **A weakness in this platform today means "this student kept asking about it,
> and did not resolve it, in conversation with Zero."** It does not mean "this
> student got these items wrong under exam conditions." Both are real evidence.
> They are not the same claim, and a teacher shown the first will assume the
> second unless told.

---

## 3 · The derivation, as shipped

`regenerate-reports.js` (frozen) is the analyzer, and it is stricter than it
needed to be — worth recording, because v1 must not weaken it:

```
decayed_weight(s) = s.weight × exp(−age / 14 days)
weakness_score    = clamp(Σ decayed_weight / 5, 0, 1)
improvement_score = (prev7_raw − recent7_raw) / max(prev7_raw, 0.01) × 100
severity_band     = f(mastery_score): <30 critical, <50 high, <70 medium, else low
priority_rank     = mastery ASC, then weakness_score DESC
```

Two rules are stated in that file in capitals, and both are load-bearing:

- **"Analyzer is the SOLE authority for severity_band. Consumers must not
  re-derive."**
- **"Analyzer is the SOLE authority for trend. Consumers must NOT re-derive."**

And a confidence gate already exists: `MIN_HISTORY_FOR_TREND = 5`. Below five
signals on a topic, `trend` is held at **null**, because a percentage change over
one or two signals swings 50–100% on a single event. `weakness.html` honours it —
a null trend renders no chip at all.

**That gate is already doing its job, visibly.** Of 225 reports, **205 (91%) have
`trend = null`**; 13 are `declining`, 7 `improving`. The system is refusing to
claim a direction of travel for nine reports in ten. Any teacher-facing surface
must preserve that refusal rather than fill the space.

---

## 4 · How much there is to show

225 reports across 13 students. All 225 have a `mastery_score` and a
`severity_band` (0 nulls). Bands: 159 medium, 32 high, 30 low, 4 critical.
Reports span 2026-06-17 → 2026-08-30; 167 were refreshed in the last 30 days.

The distribution is the finding:

```
reports per student:  144, 31, 15, 13, 8, 3, 2, 2, 2, 2, 1, 1, 1
```

**One student holds 144 of the 225.** Eight of the thirteen have three or fewer.
Only 8 reports have any mock-exam signal on the same topic.

So for a typical student a teacher would open the card and see **one to three
weaknesses, each built from a handful of chat signals, with no trend**. That is
worth showing — it is more than the teacher has today — but only if it is
labelled for what it is.

---

## 5 · What v1 can and cannot be

**Can, on today's record:**

- Show the same canonical weakness — topic, subtopic, severity band, priority —
  on the student, teacher and assistant surfaces, by all three **reading
  `weakness_reports`** rather than recomputing anything.
- Disclose the basis of each weakness: how many signals, from which sources, and
  when the last one arrived. These are facts already stored, not new derivations.
- Preserve the analyzer's refusals: no trend where trend is null, no severity
  where severity is null.

**Cannot, and must not be faked:**

| Wanted | Blocked by |
|---|---|
| Weakness from exam performance | No per-item responses. 13 of 891 signals are exam-derived, from 3 students. |
| Time-per-question, pacing, abandonment | No per-item timing. Only `duration_minutes` for a whole sitting. |
| "Knows it but fails under time" | Needs accuracy and timing on the same item. Neither is recorded. |
| Which specific items to reteach | `exam_mistakes.question_id` is null in 11 of 11 rows. |
| Class-wide misconception patterns | Needs shared items across students; delivery does not exist. |

**The one thing to add, and where.** Every blocked row above is unblocked by the
same change: **capture the response per item when a mock is delivered.** That
belongs in the Mock Experience delivery phase, which is not built. It is not a
column to bolt on: `exam_forms` deliberately has no student read path yet, and
`mock-exam.html` — the only flow that exists — is frozen (CLAUDE.md §2) and asks
the student for totals, not answers.

**Recommendation:** build v1 on `weakness_reports` as it stands, labelled
honestly, and treat per-item capture as a requirement of the delivery phase
rather than a patch to the current flow. When delivery lands, the weakness
pipeline needs no new surface — a new signal `source` flows into the same
reports, and the same three views improve together.

---

## 6 · Consequences for the design

1. **`weakness_reports` is the canonical weakness.** Three surfaces read one row.
   No surface recomputes severity or trend — the analyzer's own rule, extended to
   the teacher and the assistant.
2. **Every teacher-facing weakness discloses its basis.** A weakness with no
   exam evidence says so. This is the audit's main product: without it, a teacher
   reads a chat-derived weakness as an exam result.
3. **Silence is preserved.** Null trend renders nothing, not "stable".
4. **v1 adds no threshold of its own.** It presents and discloses; it derives
   nothing. A new cut-off chosen now would be chosen against 13 students, one of
   whom is 64% of the data.

---

## 7 · What shipped, 2026-08-30

`teacher_student_weaknesses()` is **live** (`20260830195034`), and it is the
first consumer of `teacher_can_see_student()`. `weakness-view.js` shapes one
`weakness_reports` row for a student, teacher or assistant and derives nothing.

Verified against a real student holding **144** canonical reports: the teacher
read returned all 144, **135 of them with no trend — matching the table
exactly**, with the per-source basis populated (384 AI_CHAT signals against 11
MOCK_EXAM across that student's weaknesses, which is this audit's §2 finding
showing up in the product rather than in a document).

**Phase closed.** What remains blocked is exactly what §5 said would be:
everything that needs a per-item response. The next phase is Mock delivery and
per-question evidence — and when it lands, the pipeline needs no new surface. A
new signal `source` flows into the same reports, and the student, teacher and
assistant views improve together because they read the same row.
