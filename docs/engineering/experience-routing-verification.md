# Experience routing — `my_experience()` (20260830i), prepared and verified

**Status: ✅ APPLIED 2026-08-30**, with explicit owner approval, as
`schema_migrations` version **`20260830222037`** (`my_experience`). This
migration alone; nothing else was touched. Post-apply verification in §8.

The client wiring in `login.html` and `nav.js` **is live**: `main` at `72aa7fb`
deployed to Vercel production on 2026-08-30. Post-deploy verification in §9.

**Date:** 2026-08-30 · **Project:** `igvkyxkmjnkzscqgommj` · **Branch:**
`claude/teacher-intelligence-layer-8e66b0`

---

## 1 · What this is

Increment 1 of the Primary Experience model: **one caller-scoped function that
answers "which product does this account belong in?", and two consumers.**

Before it, three surfaces answered that question independently and disagreed:

| Surface | What it read | What was wrong |
|---|---|---|
| `login.html` | `profiles.onboarding_completed` | routed **everyone** to `dashboard.html` — a teacher landed in the learning product and was asked for a target SAT score |
| `nav.js` | `profiles.role`, then `teacher_my_workspaces()` | counted **any row that was not `removed`** as teaching, so a **pending** assistant — approved by nobody, refused by every teaching RPC — was shown a Teaching link |
| `teacher.html` | the first active workspace it was handed | out of scope for this increment |

`my_experience()` is the single answer; the two pages become its consumers.

## 2 · The contract

```
{ "primary":           "staff" | "student",
  "can_staff":         boolean,
  "can_student":       boolean,           -- always true
  "platform_role":     "user" | "admin" | "super_admin" | "owner",
  "staff_memberships": [ { workspace_id, name, staff_role, status } ],
  "pending_count":     integer }
```

Six keys, always all six. Four rules decide them:

1. **`can_staff` is ACTIVE staff membership in an ACTIVE workspace** — not "has
   a row". A pending assistant stays in the Student experience and learns they
   are waiting from `pending_count`.
2. **`can_student` is unconditionally true.** The learning product is never
   taken away from an account because it acquired a teaching relationship.
3. **`platform_role` never sets `primary`.** Admin is a capability reached from
   the Admin section, not a home. It is reported so `nav.js` can render that
   section from the same call, and it comes from `current_user_role()` — the
   *same* read `has_role_at_least()` enforces with, so the sidebar cannot
   promise a page the database then refuses.
4. **Teaching stays a relationship.** Derived from `workspace_staff` on every
   call; nothing is stored, so nothing goes stale.

### Routing is not a security boundary

The function takes **no arguments** — there is no `p_user uuid`, so no version
of this call asks about somebody else. It writes nothing, reads only
`workspace_staff` and `teacher_workspaces`, and grants nothing. A client that
ignores it, lies about its answer, or never calls it gains **exactly nothing**:
every permission is still enforced by the RLS of `20260830b` and the
authorization inside each RPC of `20260830c`/`20260830d`. That property is what
makes it safe to hand a routing hint to a browser at all.

## 3 · Dry run — 33 checks, all PASS

Executed against production inside `begin; … rollback;`. Real RPCs under
simulated JWT identities; no fixture shortcuts, no direct table inserts.

| Group | What it proved |
|---|---|
| **A** (5+3) | a plain user is a student with six keys; the **platform owner is still a student** and gets `can_staff = false` while `platform_role` correctly reads `owner` |
| **B** (5) | creating a workspace *for* someone does not make the admin staff; the teacher becomes `primary = staff` with one `teacher`/`active` membership |
| **C** (3) | **a PENDING assistant is `primary = student`, `can_staff = false`** — the `nav.js` defect, fixed at the source — while `pending_count = 1` reports the application |
| **D** (2) | approval flips them to `staff` and `pending_count` falls to 0 |
| **E** (1) | enrolling as a student in a class does not make anyone staff |
| **F** (2) | teacher in one class **and** assistant in another is legal, and both memberships are reported with both roles |
| **G** (3) | a removed membership disappears; the other workspace still makes them staff; the teacher's own answer contains only their own memberships |
| **H** (1) | a deactivated workspace grants no staff experience |
| **I** (1) | an unidentified caller gets the student default, not an error |
| **J** (7) | 0 arguments · `security definer` · `search_path` pinned · `stable` · `anon` cannot execute · `authenticated` can · `PUBLIC` holds no grant |

After the rollback, re-measured: `my_experience` does not exist, and
`teacher_workspaces` / `workspace_staff` / `workspace_students` /
`workspace_audit_log` all still hold **0 rows**. The dry run left nothing
behind.

### The dry run could have gone red

The same transaction was re-run with one mutation — `can_staff` counting any
non-`removed` row, i.e. the exact `nav.js` defect moved into the function. Check
C1 turned **FAIL** (`primary: "staff", can_staff: true` for a pending
assistant). A green check that cannot go red is not evidence
(`docs/roadmap/verification-framework-audit.md`).

## 4 · The client changes

**`nav.js`** asks `my_experience()` once and takes both the platform role and
`can_staff` from it.

**`login.html`** routes `primary === 'staff'` to `teacher.html`, **before** the
onboarding branch. Staff beats unfinished onboarding deliberately: student
onboarding asks for an exam type and a target date, which a teacher who does not
study here has no answer to. Nothing is taken away — `can_student` is always
true, the learning product is one link away, and onboarding is still there.

### Both tolerate the migration not being applied

The static site deploys on merge; migrations are applied by hand. So the two
arrive in **either order**, and both files fall back to exactly what they did
before `20260830i`: `nav.js` reads `profiles.role` and calls
`teacher_my_workspaces()`, `login.html` uses its previous destination. The
fallback also carries the pending fix (`staff_status === 'active'`), so a
pending assistant is shown no Teaching link in either world. The rollback
`20260830w` is safe for the same reason.

## 5 · Test evidence

`tests/experience-routing.test.mjs` — **57 checks**, and the CI suite is
**54/54 green**.

The client checks **execute the shipped bytes**: the decision block is sliced
out of `nav.js` and the routing block out of `login.html` (via `slice()`, which
throws rather than silently extracting nothing) and run against a stand-in
client. A paraphrase would keep passing while the real page broke.

Six mutations, each turning exactly the intended check red:

| Mutation | Check that failed |
|---|---|
| `nav.js` fallback reverts to `!== 'removed'` | the FALLBACK carries the pending fix too |
| `nav.js` treats a pending membership as staff | a PENDING assistant gets NO Teaching link |
| `login.html` drops the `return` after the staff redirect | active staff land on the staff surface |
| `login.html` stops destructuring the RPC error | the routing call destructures the error |
| the migration counts any non-`removed` row as active | `can_staff` counts only `status = 'active'` |
| the migration lets `platform_role` decide | `primary` never consults the platform role |

The suite also asserts, on `nav.js`, `login.html` and `teacher.html`, that **no
role or experience is ever inferred from an email address**. Identity comes from
the authenticated user's relationship to a workspace, and from nothing else.

## 6 · Deliberately not in this increment

* the surface switcher (moving between Staff and Student on demand)
* the multi-workspace selector in `teacher.html` — it still silently picks the
  first active workspace
* workspace provisioning UI (creation stays admin-only)
* the deferred `workspace_is_owner()` → `workspace_is_teacher()` and
  `teacher_workspaces.owner_id` → `teacher_id` renames
* removing the `TEACHER_ROLES` tolerance in `teacher.html`, which still accepts
  both `teacher` and `owner`

## 7 · Files

```
supabase/migrations/20260830i_my_experience.sql            -- forward, APPLIED
supabase/migrations/20260830w_my_experience_rollback.sql   -- back, unapplied
```

The rollback is safe at any time: the function owns no table, is referenced by
no policy, trigger or foreign key, and both consumers work with or without it.

## 8 · Post-apply verification, against the live database

Applied 2026-08-30 as `20260830222037`. Migration count moved **165 → 166**.

### The function contract, read from the live catalogue

| | |
|---|---|
| arguments | **0** — there is no version of this call that asks about someone else |
| security | `SECURITY DEFINER`, `STABLE` |
| `search_path` | `pg_catalog, public` (pinned) |
| returns | `jsonb` |
| ACL | `authenticated:EXECUTE, postgres:EXECUTE, service_role:EXECUTE` — **`anon` cannot execute it, and PUBLIC holds no grant** |
| body | **byte-for-byte identical to the repository file**: 2128 bytes, md5 `a8fcd788b28fd325bae0bca8664c2361` |

The body comparison matters more than it looks. The repo has been ahead of
production before (`CLAUDE.md`, the Edge Function rows), and "applied" is not
the same claim as "what is running is what we reviewed". Here they are the same
bytes, measured.

### Behaviour, re-run against the LIVE function — 18 of 18 PASS

The function was **not** re-created for these; the fixtures were built through
the real RPCs under simulated JWT identities, and the whole transaction was
rolled back.

| # | Check | Result |
|---|---|---|
| 1–3 | **Platform Owner is NOT automatically `primary: staff`** — `student`, `can_staff: false`, while `platform_role` still reads `owner`; six keys exactly | PASS |
| 4–6 | **Active staff → `primary: staff`**, `can_staff: true`, `can_student` still true, membership reads `teacher`/`active` with the right workspace id | PASS |
| 7–9 | **Pending assistant → `primary: student`, `can_staff: false`**, `pending_count: 1`, row visible as `assistant`/`pending` | PASS |
| 10 | approval flips them to `staff` and `pending_count` falls to 0 | PASS |
| 11 | an enrolled student is not staff | PASS |
| 12–14 | **Multi-workspace represented correctly** — teacher in one class and assistant in another gives two memberships, both roles, both workspace ids | PASS |
| 15–16 | a removed membership disappears while the other still counts; one caller's answer never contains another's memberships | PASS |
| 17 | **A deactivated workspace grants no staff experience** — `student`, `can_staff: false`, empty list | PASS |
| 18 | an unidentified caller gets the student default, not an error | PASS |

### Production is clean

Re-measured after the rollback: `teacher_workspaces`, `workspace_staff`,
`workspace_students`, `workspace_audit_log`, `class_interventions` and
`exam_attempts` all still hold **0 rows**. Verification created no workspace and
no membership.

### Advisors

One WARN, `0029_authenticated_security_definer_function_executable`: a
`SECURITY DEFINER` function is callable by `authenticated`. That is the design,
and it is the project's standing pattern — **20 functions carry the identical
warning**, `teacher_my_workspaces()`, `student_my_teachers()` and
`student_my_interventions()` among them. Authorization lives inside each body,
never in who may call it (`20260830b`). No ERROR-level finding exists on the
project.

## 9 · Post-deploy verification, against the live site

`main` merged at **`72aa7fb`**; Vercel production deployment
`dpl_ELWu64MwwR8H2afG8do7s4cxUyRc`, state READY, `githubCommitSha` matching the
merge exactly.

### The deployed bytes

Fetched from `https://www.si-math-ai.com` (through the Vercel API — the host
itself is blocked by this session's egress policy) and compared against
`git show 72aa7fb:<file>`:

| File | Live | Matches the repo |
|---|---|---|
| `nav.js` | 200 | **byte-for-byte** |
| `login.html` | 200 | **byte-for-byte** |
| `settings.html` | 200 | **byte-for-byte** |

`login.html` calls `my_experience()`, destructures the RPC error, and its
`primary === 'staff'` branch precedes the onboarding branch — checked in the
served file, not the local one. `nav.js` takes both the role and `can_staff`
from the same call and keeps its fallback.

### Every real account, swept

The live `my_experience()` was run once **as each of the 37 real accounts**,
under that account's own simulated JWT. Not a sample:

| | |
|---|---|
| accounts checked | **37** |
| routed to `student` | **37** |
| routed to `staff` | **0** |
| `can_student` true | **37** |
| `can_staff` true | **0** |
| correct six-key shape | **37** |
| platform roles present | `user`, `super_admin`, `owner` |

**No ordinary user's experience changed**, and the accounts carrying
`super_admin` and `owner` are among the 37 routed to `student` — the platform
role really does not decide the experience, measured on live data rather than
argued.

### The new settings section, for a real student

`student_my_teachers()` called as five real accounts: succeeded for all five,
returned zero rows for all five. So the section reveals itself and says *"No
teacher is connected to your account. Nobody can see your work but you."* That
is the only student-visible change in this deploy.

### The rest is inert

0 workspaces, 0 staff rows, 0 student links, 0 audit rows, 0 interventions,
0 exam attempts, 0 exam responses; 0 published exam forms. `teacher.html` is
reachable but every roster is empty, and `exam.html` is reachable but nothing is
sittable. 166 migrations applied — verification created nothing.

### What is now observable

The routing boundary is live but has never fired: with 0 active staff rows,
no account can reach `primary: staff`. The first time it fires will be the
first workspace an admin creates.
