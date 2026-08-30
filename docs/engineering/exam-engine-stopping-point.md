# Exam Engine — stopping point, 2026-08-30

**This work is closed and stable. Nothing here is mid-flight.**

Written because more than one session is working on this product at once. It
records what is finished, what is deliberately NOT in scope, and what the next
person needs to know before merging.

## State

| | |
|---|---|
| Branch | `claude/mock-exam-enhancement-nnwb48` |
| Head | `00d39fe` |
| Working tree | clean |
| Pushed | fully — 0 ahead, 0 behind its remote |
| CI | 62/62 green |
| Position vs `main` | 140 ahead, 3 behind |
| **Merge into `main`** | **clean — `git merge-tree` returns no conflicts** |

The 3 commits on `main` this branch lacks are pricing and Founder-badge work
from a different session (`founder-badge.html`, `credit-config.js`,
`assets/founder-status.js`, the pricing model doc). Three files are touched by
both sides — `docs/knowledge/faq-data.mjs`, `faq.html`, `llms-full.txt` — but in
different regions, and the dry-run merge is clean. **Verified, not assumed.**

## What is finished

**One engine, three exams.** Grepping the whole delivery path for `SAT` or
`DSAT` returns one hit, and it is a documentation reference inside a comment.
Everything exam-specific — option letters, section structure, timing,
calculator policy, announcements — is data in `exam-registry.js`, not code.

| Form | Exam | Structure | Status |
|---|---|---|---|
| `DSAT-2026-A` | `SAT_FULL` | 3 sections, 66 questions | draft |
| `ESTM1-2026-A` | `EST_MATH_1` | 1 section, 50 questions, 75 min | draft |
| `ACTM-2026-A` | `ACT_MATH` | 1 section, 45 questions, 50 min | draft |

**All three are DRAFT and `published_at` is NULL on every one.** No student can
reach any of them; RLS serves the Spine to admins only. Publishing is a separate
irreversible act through `publish_exam_form()`, gated on a pre-flight, and it
has not been taken.

Details: `docs/engineering/est-act-forms.md`.

## Database changes made in this session

`20260830c_question_spine_choice_sets` — **applied**, individually approved.
Widens the storable answer model to `{A,B,C,D}`, `{A,B,C,D,E}` and
`{F,G,H,J,K}`, and ties `correct_answer` to the row's own `choices` instead of a
fixed letter list. Rollback file exists and refuses to run while a 5-choice
question is stored, which is intended.

Two pie-chart migrations (`20260830a`, `20260830b`) were applied earlier the
same day.

## Deliberately NOT in scope

- **Teacher and Assistant surfaces.** Parallel work is under way in another
  branch. Nothing in this session touched, audited or planned those pages, and
  nothing here should be taken as a design for them.
- **Weakness Intelligence.** Waiting on the merged shape of the surfaces above,
  by explicit decision — building it in isolation first was rejected.
- **The larger EST system.** Deliberately deferred until the exam foundation
  settled, which it now has.
- **Scaled scoring** (ACT 1–36 vs SAT/EST 200–800). The engine reports raw
  correct/total; no scaled score exists anywhere.
- **Publication to students.** See above.

## Things a later session should not re-derive

- The engine did **not** need generalising. Only the database and the draft
  builder did. Re-auditing it will reach the same conclusion.
- The answer convention lives in `exam-registry.js` `ANSWER_CONVENTIONS`, and
  the database deliberately does **not** know ACT's odd/even alternation —
  same line M3 drew when it refused to CHECK `exam_code` against a list.
- Exam content is **not in this repository and must not be**. Items, options and
  answer keys live outside it; `scripts/build-exam-form-draft.py` is the tooling
  that turns an author's directory into SQL.
- The ambience layer's seven clips are recordings, matched by loudness at
  playback (`TRIM` in `exam-ambience.js`), and its gap is measured from the end
  of one sound to the start of the next.
