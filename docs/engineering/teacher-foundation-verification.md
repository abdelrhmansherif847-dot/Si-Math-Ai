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
