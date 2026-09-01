# Teacher Foundation — applied and verified in production

**Date:** 2026-08-30 · **Project:** `igvkyxkmjnkzscqgommj`
**Approval:** explicit owner instruction — "apply the prepared migrations now,
one at a time … apply, verify in production, then move to the next one."
**Scope of this record:** what went live, what was checked after each step, and
what the end-to-end run actually proved. Design rationale is in the migration
headers; the product direction is `docs/roadmap/teacher-intelligence-layer.md`.

---

## 1 · What is live

| Applied | `schema_migrations` version | Repo file |
|---|---|---|
| Tables, enums, guards | `20260830182750` `teacher_foundation_tables` | `20260830a_…tables.sql` |
| Predicates, policies, grants | `20260830183010` `teacher_foundation_rls` | `20260830b_…rls.sql` |
| RPCs and the read surface | `20260830183143` `teacher_foundation_rpcs` | `20260830c_…rpcs.sql` |

The applied body differed from each repo file in two respects only: the header
text, and the outer `begin;`/`commit;` were omitted because `apply_migration`
supplies its own transaction. The rollback (`…z`) is **not** applied and should
not be — it is now the live withdrawal path.

`supabase_migrations.schema_migrations` holds **160** rows after this work.

## 2 · Verified after each migration

**After 1 —** four tables present, `relrowsecurity` true on all four, **0
policies** on all four (RLS enabled with no policy is deny-all, which is how the
tables were meant to sit between migrations 1 and 2); four enums; both guard
triggers attached; 15 indexes; `workspace_new_code`, `workspace_students_guard`
and `workspace_staff_guard` executable by `postgres` and `service_role` only.

**A finding worth keeping.** In the window between migrations 1 and 2, `anon`
and `authenticated` each held `DELETE, INSERT, REFERENCES, SELECT, TRIGGER,
TRUNCATE, UPDATE` on all four brand-new tables — the project's DEFAULT ACL trap
for functions applies to tables too. Nothing was reachable, because RLS was on
with no policy, but it means **the `revoke all on table … from anon,
authenticated` in migration 2 is load-bearing, not hygiene**. Recorded in that
file's header so the next table added here inherits the lesson.

**After 2 —** `anon` holds **no privilege of any kind** on the four tables;
`authenticated` holds `SELECT` and nothing else; four `SELECT` policies exist and
**zero** write policies; the three predicates are executable by `authenticated`
(required — a policy expression is evaluated as the calling user); and
`teacher_can_see_student()` appears in **0** policies outside this system's own
four tables.

**After 3 —** all 11 RPCs exist, all `SECURITY DEFINER`, all with
`search_path = pg_catalog, public` pinned; `anon` can execute **none** of them;
`authenticated` can execute all 11.

## 3 · The end-to-end run

Executed as one transaction that **rolled back**, so nothing persisted. Each step
ran under a real simulated identity — `request.jwt.claims` set to a chosen
`sub`, and `role` set to `authenticated`, so RLS and every guard evaluated the
same way they will for a browser. The cast was one admin plus **four ordinary
accounts with no role at all**: teacher, student, assistant, stranger. That the
teacher holds no platform role is the point of the design, and the run depends
on it.

The first assertion checks that `auth.uid()` actually follows the simulated JWT.
Without it every later check could pass vacuously against a NULL caller.

| # | What was proven |
|---|---|
| 1 | An admin creates a workspace owned by a plain-user teacher; both join codes issue |
| 1b | A non-admin calling `teacher_create_workspace` is refused — `42501` |
| 2 | The student joins with the code typed in **lower case** (codes normalise) |
| 2b | **Consent holds structurally**: the teacher, writing directly as a privileged role, cannot create a link for anyone — `42501, a link can only be created by the student it belongs to` |
| 3 | The student sees the connection through `student_my_teachers()` (the Settings surface) |
| 4 | The teacher's roster holds exactly one student; `teacher_can_see_student()` is true for them |
| 4c | …and **false** for a student who never joined |
| 5 | A stranger calling `teacher_roster()` is refused — `42501` |
| 5b | RLS shows that stranger **0** rows of `workspace_students` |
| 6 | An assistant joining with the staff code arrives `pending` |
| 6b | A pending assistant sees **no** roster — `42501` |
| 6c | A pending assistant cannot approve themselves — `42501` |
| 6d–e | The owner approves them; the assistant then sees the roster |
| 6f | The assistant cannot remove a student — `42501, workspace owner only` |
| 7 | The student disconnects → the teacher goes blind **immediately** |
| 7b | …and so does the assistant, through the same predicate |
| 7c | `ended_by` records that the student ended it |
| 8 | Re-entering the code restores visibility (consent, given again) |
| 8b | The owner removes the student → blind again |
| 8c | The student's Settings then shows no active teacher |
| 9 | The audit trail matches the actions performed, **in order**, and all 8 action kinds are reachable |

**25 of 25 passed.** One assertion failed on the first run and was wrong itself,
not the system: it expected `>= 8` audit rows from a scenario that performs
exactly 7 loggable actions. Re-run against the exact expected sequence —
`workspace_created > join_code_rotated > student_joined > staff_joined >
staff_activated > staff_removed > student_left > student_joined >
student_removed` — it matches element for element.

## 4 · Production state after all of it

`teacher_workspaces` 0 · `workspace_staff` 0 · `workspace_students` 0 ·
`workspace_audit_log` 0. Both scenarios rolled back cleanly; no test data
survives. The first real workspace has to be created deliberately, by an admin,
with `teacher_create_workspace(<owner uuid>, '<class name>')`.

## 5 · What is NOT proven by any of this

- **The browser path.** Everything above is the database contract. `teacher.html`
  and the Settings section were checked against that contract statically
  (`tests/teacher-access-scope.test.mjs`), not clicked through by a real signed-in
  teacher. The first workspace will be the first real exercise of the UI.
- **Scale.** Every check ran on a roster of one.
- **Anything about learning.** No analytics exist here, deliberately — T1 is
  identity and consent. `teacher_can_see_student()` is live and guards nothing,
  waiting for the evidence the Mock Experience will produce.

---

## 6 · Weakness Intelligence v1 — applied and verified, 2026-08-30

`teacher_student_weaknesses()` applied as `20260830195034`
(`teacher_weakness_read`), the first consumer of `teacher_can_see_student()`.
Verified after apply: SECURITY DEFINER, `search_path` pinned, `anon` cannot
execute it, `authenticated` can, and the return signature is exactly the ten
approved columns — `topic, subtopic, severity_band, priority_rank, trend,
last_signal_at, total_signals, signals_ai_chat, signals_mock_exam,
signals_focus`. The analyzer's working numbers are absent from the signature, so
no surface can re-derive a band from them.

End-to-end, one rolled-back transaction, every step under a simulated JWT,
against a **real student holding 144 canonical weakness reports**:

| # | What was proven |
|---|---|
| 1 | The teacher read returns all 144 reports — the RPC and the table agree exactly |
| 2 | **135 of the 144 carry no trend, matching the table exactly** — the analyzer's refusal survives the trip to the surface uncoalesced |
| 3 | The evidence basis is populated: 384 `AI_CHAT` signals against 11 `MOCK_EXAM` across that student's weaknesses — the audit's central finding visible in the product |
| 4 | A stranger is refused — `42501` |
| 5 | A **pending** assistant is refused; once approved, they read the **same 144** |
| 6 | **The pairing gate earned its place.** The assistant was active staff of workspace B *and* could see the student through workspace A, so both earlier gates passed — and the third refused: *"that student is not in this workspace"* |
| 7 | The student disconnects → the teacher loses the weaknesses along with everything else — `42501` |

**9 of 9 passed.** Production after the run: `teacher_workspaces` 0,
`workspace_staff` 0, `workspace_students` 0, `workspace_audit_log` 0, and
`weakness_reports` untouched at 225. No test data survived.

**Still not proven:** the browser path (the card is covered by
`tests/teacher-surface.test.mjs`, not by a signed-in teacher clicking it), and
anything at scale — every check ran on a roster of one.

## 7 · The stored ids travel with the read — applied and verified, 2026-09-01

`20260901h` applied as `20260901220926` (`teacher_weakness_read_ids`): two
trailing output columns, `topic_id` and `subtopic_id`, on
`teacher_student_weaknesses()`, for the class-wide weakness aggregate
(`teacher-intelligence-layer.md` §15.11, decision b — the aggregate keys on the
STORED id and must not resolve a label to recover one, and no teacher read
carried the stored id). The body was generated from `20260830d`, not retyped;
`tests/teacher-class-patterns.test.mjs` asserts the two differ by exactly the
two added select lines, 14 of 14 mutants killed.

Verified after apply, against predictions written down before it:

| | Expected | Live |
|---|---|---|
| Signature | the ten approved columns, then `topic_id text, subtopic_id text` | exactly that |
| `pg_get_functiondef()` md5 | `5d69fc5116d3f78416b30d68714c752a`, pre-computed from the file (the same reconstruction reproduces the old function's `889dfaaa…`) | `5d69fc5116d3f78416b30d68714c752a` |
| ACL | `postgres=X, service_role=X, authenticated=X` — the four other teaching reads | identical; anon and public cannot execute |
| Posture | SECURITY DEFINER, `search_path=pg_catalog, public`, STABLE, comment re-stated | all present |
| Every other function (hash excluding this one) | `89e78600…` | `89e78600…` |
| Policies / constraints / relations | `fad6918e…` / `28193c25…` / `201dde96…` | unchanged |
| Rows | 225 reports, 893 signals, 5 workspace rows | unchanged |

The `20260830d` contract suite, re-run in one aborted transaction with fixtures
built through the real RPCs (`staff_join_workspace`, `teacher_set_staff_status`,
`teacher_create_workspace` as the platform owner, `student_leave_workspace`):

| # | Proven |
|---|---|
| 1 | The RPC and the table agree on every field of the real student's rows, the two ids included (2 of 2) |
| 2 | Null trend travels as null (2 = 2) |
| 3 | The per-source basis equals the signal table (3 `AI_CHAT`, 0 `MOCK_EXAM`) |
| 4 | A stranger is refused — `42501` |
| 5 | A pending assistant is refused; once activated they read the same two rows, both with `subtopic_id` |
| 6 | The pairing gate: active staff of workspace B who can see the student through A is refused for B — *"that student is not in this workspace"* |
| 7 | The student disconnects → the teacher is refused — *"no active link to this student"* |
| 8 | An unlinked student who holds reports is refused |
| 9 | `anon` cannot execute |

**10 of 10.** Residue after the abort: 1 workspace, 1 staff row, 1 active link,
2 audit rows, 225 reports — exactly the pre-run state; no rehearsal workspace
survived. Consumers: `weakness-view.js` produces byte-identical teacher and
assistant views for a ten-column and a twelve-column row (run in Node against
the shipped module), and `renderLearning()` reads only named fields. Rollback
`20260901t` stays prepared and unapplied; rehearsed the same day, it returns
the signature and the md5 to their pre-apply values.

