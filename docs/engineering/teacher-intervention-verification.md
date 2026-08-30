# T1.6 — the intervention record: verified before applying, then applied

**Status: APPLIED 2026-08-30** to `igvkyxkmjnkzscqgommj`, `schema_migrations`
version `20260830204951`. §1–§6 are the pre-apply work and are left in the tense
they were written in, because the order — verify, then propose, then apply — is
the point. **§7 is the production record.**

**Written:** 2026-08-30, second session of the day.
**Direction:** `docs/roadmap/teacher-intelligence-layer.md` §10 T1.6, §8.2, §8.3, §12.
**Applies to:** `supabase/migrations/20260830g_teacher_intervention_record.sql`
and its rollback `…20260830x…`. Both were written as `e` and `y` and renamed
after the Mock delivery work took those letters on the same branch — §7.4.

---

## 0. Why this file exists

`20260830d` was verified after it was applied, under simulated JWTs, and the
record of that (`teacher-foundation-verification.md` §6) is the reason anyone
can believe what it does. This file is the same discipline moved one step
earlier: the migration was executed and exercised **before** being proposed, so
that the approval decision in CLAUDE.md §3 is made against measured behaviour
rather than against a reading of the SQL.

The distinction matters because `class_interventions` is append-only. A defect
in it cannot be corrected by a follow-up UPDATE — that is the whole point of the
table — so the cost of getting it wrong is paid once and kept.

---

## 1. How it was run

A throwaway PostgreSQL 16 cluster, empty, with:

1. `teacher-intervention-preapply-stubs.sql` — stand-ins for the objects the
   teacher migrations depend on but do not create: `auth.users`, `auth.uid()`,
   the `anon` / `authenticated` / `service_role` roles, `profiles`,
   `weakness_reports`, `weakness_signals`, `user_role`, `has_role_at_least()`,
   and a three-lesson taxonomy with real ids (`ALG_006`, `ALG_007`, `GEO_006`).
   `auth.uid()` reads a session GUC, so every assertion below runs as a specific
   person rather than as a superuser pretending to be one.
2. The **real** `20260830a`, `b`, `c`, `d`, then `e`, in order, unmodified from
   the repository. All five applied without error.
3. `teacher-intervention-preapply-verify.sql` — 33 assertions, inside a
   transaction that is rolled back at the end.

Production is PostgreSQL 17.6 and this was 16.13. Nothing used here differs
between them (enums, RLS policies, `gen_random_uuid()`, row triggers,
`is distinct from`), but the gap is recorded rather than waved away: **the
applied result must still be verified on the real project**, and this is
evidence that it is worth applying, not evidence that it is applied.

Reproduce with:

```
psql -f docs/engineering/teacher-intervention-preapply-stubs.sql
psql -f supabase/migrations/20260830a_teacher_foundation_tables.sql   # …b, c, d, e
psql -f docs/engineering/teacher-intervention-preapply-verify.sql
```

## 2. Result — 33 of 33

| Group | Assertions | What it establishes |
|---|---:|---|
| Setup | 3 | A student joins by code, an assistant asks and is approved — through the real RPCs, so the fixture is a real relationship. |
| Who may record | 4 | The owner can. The assistant cannot (`42501`). An unrelated account cannot. The owner cannot record about a student who is not in their class. |
| The dates | 3 | A future date is refused, a backdate beyond 30 days is refused, 30 days exactly is allowed. |
| The taxonomy | 3 | A subtopic without its topic is refused by the check constraint (`23514`); an invented subtopic id is refused by the foreign key (`23503`); a weakness with **no** canonical id is still recordable by label — which is the 38% of live reports that would otherwise be unactionable. |
| Append-only | 6 | DELETE refused **for `postgres` itself**. The note cannot be edited. A withdrawal carrying any other change is refused. A withdrawal works once, the row survives dated, and a second withdrawal is refused. |
| Who may read | 9 | Teacher and assistant see the same three records; the student sees what is held about them including the withdrawn one; a student in no class and an unrelated account see nothing; `student_my_interventions()` returns the subject's own rows and nobody else's; the RPC refuses a student outside the workspace. |
| The §8.3 boundary | 4 | No foreign key into any of eleven academic tables — and, in the other direction, the only tables referenced at all are `teacher_workspaces`, the two taxonomy tables and `auth.users`. `anon` holds nothing; `authenticated` holds `SELECT` and no write verb. |
| No regression | 1 | `teacher_student_weaknesses()` still returns, and still withholds a null trend. |

## 3. What went red on the way

Two assertions failed while this was being written, which is the only reason the
other 31 mean anything.

- **The expected record count was wrong (4, not 3).** Written from the number of
  `teacher_record_intervention` calls in the file rather than from the number
  that were *supposed to succeed* — three of those calls are refusal tests. The
  assertion caught the author's arithmetic, not the migration's. Corrected to 3.
- **`name[] = text[]` has no operator.** The introspection assertion comparing
  the referenced-table list against the allowed list compared `pg_class.relname`
  (type `name`) with a `text[]` literal. Cast added.

Both are failures of the test, not of the migration, and both are recorded
because a suite that has never failed has not been shown to be capable of it —
`verification-framework-audit.md`, the same rule.

## 4. What this does NOT establish

Stated plainly, because the table above is persuasive and the gaps are not
visible from it.

- **Nothing about production.** Different major version, empty database, stub
  `auth`. The applied run has to be verified on its own.
- **Nothing about `service_role`.** The append-only trigger was proven against
  `postgres`, which is stronger, but the Supabase `service_role` path with its
  own grants was not exercised. Worth a check at apply time.
- **Nothing about concurrency.** No two-session test; there is no
  read-modify-write in this migration to lose, but that is an argument, not a
  measurement.
- **Nothing about whether teachers will use it.** This is the failure mode the
  direction document worries about most, and no amount of SQL addresses it. The
  record is a log until a later stage can say whether a difficulty changed —
  §10 T1.6 says so, and this file does not claim otherwise.

## 5. Surface verification

`teacher.html` was rendered headlessly in `?preview=1` at 1280px and 470px and
driven through the whole flow: open a student, open the form, pick a subject
from their real weaknesses, record it, see it appear, withdraw it, and confirm
an assistant is offered neither control. One defect was found by rendering that
reading had not caught:

> **The subject, the note and the date ran together into one sentence.**
> `.iv-what`, `.iv-note` and `.iv-when` are `<span>`s inside a `<span>`, so
> without `display:block` the row read
> "Covered again · Systems of EquationsRe-explained elimination.Aug 30".

This is character-for-character the bug already documented on `.row .nm` and
`.row .meta` in the same file — the same mistake, made again, in new markup, and
caught the same way. The CSS comment now says so, so the third instance is
avoidable.

Horizontal overflow at 470px: none. Page errors: none (the two console entries
are the CDN being unreachable from the sandbox, which is the defensive-client
path `teacher-surface.test.mjs` already covers).

## 6. Unrelated defect found while running the suite

`tests/streak-failure-paths.test.mjs` imported `_source.mjs` by an **absolute
path into one machine's home directory** (`/home/user/Si-Math-Ai/...`). On any
other checkout — a fresh clone, GitHub's runner, this session — it died at
import with `ERR_MODULE_NOT_FOUND` before a single assertion ran, and
`run-all.mjs` reported it as one red suite among fifty green ones. It is on
`main` too. Changed to a relative import; its 11 assertions now run, and pass.

Worth noting as a class of problem rather than a typo: a suite that cannot even
import reports identically to a suite whose assertions fail, and the
distinction is exactly the one a CI summary line hides.

## 7. Applied — the production record

Owner approval was given explicitly for this migration alone. It was applied on
its own, nothing else in the same operation, as
`20260830204951 teacher_intervention_record`.

### 7.1 Structural, read-only — 12 of 12

Table present with RLS on · **no foreign key into any of thirteen academic
tables** · the only references are `teacher_workspaces`, `taxonomy_topics`,
`taxonomy_subtopics`, `auth.users` · the append-only trigger exists · both read
policies exist · `authenticated` holds `SELECT` and no write verb · `anon` holds
nothing · all five functions are `security definer` with `search_path` pinned ·
`EXECUTE` revoked from `anon` on all five · the trigger function is not callable
by `authenticated` · the table is empty.

### 7.2 Behavioural, under simulated JWTs — 25 of 25

Run against **real accounts** — a real admin, a real teacher, a real assistant,
the student who holds the largest number of weakness reports, and an unrelated
account — inside a transaction that was rolled back. Transaction semantics were
established first with a throwaway probe table, which did not survive its
rollback.

| | Result |
|---|---|
| Setup through the real RPCs: workspace created, student joined by code, assistant approved | OK |
| Owner records an intervention | OK |
| Assistant records · outsider records · owner records about a non-member | `42501` ×3 |
| Future date · backdate beyond 30 days | `22023` ×2 |
| Backdate of exactly 30 days | OK |
| Subtopic without its topic (check) · unknown subtopic id (foreign key) | `23514`, `23503` |
| A weakness with no canonical id, recorded by label | OK |
| Superuser `DELETE` | `42501` |
| **`service_role` `DELETE`** | **`42501`** |
| **`service_role` note edit** | **`42501`** |
| Withdrawal keeps the row, dated, note intact · second withdrawal | OK, `22023` |
| Teacher / assistant / student each see 3 · outsider sees 0 | 3 · 3 · 3 · 0 |
| `student_my_interventions()`: subject 3, outsider 0 | 3 · 0 |
| The RPC refuses a student outside the workspace | `42501` |
| `teacher_student_weaknesses()` still returns, still withholds | 144 rows, 135 with no trend |

The last line is the same 144/135 that `20260830d`'s own verification recorded,
which is what makes it a regression check rather than a fresh measurement.

**The `service_role` gap named in §4 is now closed with a measurement, not an
argument.** `service_role` holds `INSERT`, `UPDATE` and `DELETE` on this table
and has `rolbypassrls` — so the trigger is the *only* thing standing between a
service job and a rewritten history. It refused both attempts.

**Nothing persisted.** After the rollback: `class_interventions` 0,
`teacher_workspaces` 0, `workspace_students` 0, `workspace_staff` 0,
`workspace_audit_log` 0, probe table gone.

### 7.3 Still not established

§4 stands except for the `service_role` line, which is now measured.
Concurrency is still untested — there is no read-modify-write here to lose, but
that remains an argument. And nothing here says a teacher will use it.

### 7.4 The migration was renamed after it was written

Between this session's first commit and this one, the Mock delivery work landed
`20260830e_exam_delivery.sql` and `20260830f_exam_delivery_rpcs.sql` **on this
same branch**, plus `20260830y_exam_delivery_rollback.sql`. This migration had
been written as `20260830e` and its rollback as `20260830y`: two different files
claiming one ordinal, in a repo where the prefix is the ordering key. Renamed to
`g` and `x`. The letters now match the applied order — `e` 20:26, `f` 20:30,
this 20:49 — so the rename restored the ordering rather than imposing one.

Worth recording as a hazard rather than an incident: two sessions working the
same branch on the same day will collide on migration ordinals, and nothing in
the repo detects it. `scripts/check-migration-parity.sh` compares files against
what is applied; it does not notice two files sharing a prefix.

### 7.5 The surface is live

`renderInterventions()` no longer shows "Prepared — not connected yet". Its
catch branch is now a genuine error state — a dropped connection, a revoked link
— and still neither throws nor implies the teacher has done nothing.
