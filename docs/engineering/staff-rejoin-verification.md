# The assistant re-application defect — audit, fix, and evidence (P0)

**Status: 🟡 PREPARED, NOT APPLIED.** `20260830j` is written, dry-run against
production inside a rolled-back transaction, and mutation-tested. Applying it is
a separate, explicit decision.

**Date:** 2026-08-30 · **Project:** `igvkyxkmjnkzscqgommj` · **Branch:**
`claude/teacher-intelligence-layer-8e66b0`

---

## 1 · The defect, as measured

`staff_join_workspace()` ended with `on conflict (workspace_id, user_id) do
nothing` and then returned `{"status":"pending"}` **unconditionally**. Measured
against the live database:

> After a teacher removes an assistant, re-entering the staff code returns
> **`"pending"` while the row is still `"removed"`.**

`teacher.html` then shows the waiting-for-approval screen for an application
that was never filed. The assistant waits forever, and the call writes a
`staff_joined` audit row describing something that did not happen. The same
shape hit an already-`active` assistant (told they were waiting) and the teacher
of the class pasting their own staff code.

**The student side never had this bug** — verified in the same session: a
student who leaves (`revoked`) *or* is removed by the teacher (`removed`) can
re-enter the code and the link returns to `active`, and the roster shows them
again. The staff side simply lacked the equivalent rule.

## 2 · Why the RPC alone could not fix it

Established, not assumed. Retrying the status change inside a `SECURITY
DEFINER` context — so the table privilege was the definer's and only the trigger
could object — produced:

```
REFUSED: workspace_staff: only the workspace owner can change staff status
```

`workspace_staff_guard` refuses **any** status change by anyone but the
workspace owner. That is why this migration touches a trigger, and it is the
only reason.

An earlier attempt at the same probe was refused by the *table privilege*
before the trigger ran, which proves nothing about the guard. The distinction
matters: a check that a privilege happens to block is not evidence about the
rule you think you are testing.

## 3 · The change

**One new transition, and nothing else:**

```
removed  ->  pending,  by the account named on the row itself
```

It cannot reach `active`. That remains the workspace owner's alone and is the
entire safety gate on the staff code. Re-applying grants **nothing** — `pending`
is an application, and `teacher_roster()`, `teacher_student_card()` and
`teacher_student_weaknesses()` refuse a pending assistant exactly as before.

This mirrors the rule `workspace_students_guard` has always had: a student may
restore their own link because re-consent is still consent. An assistant may
re-apply because re-applying is still applying. Neither can approve itself.

**The RPC now reports the row's real status** — `pending`, `active`, whatever it
is — and writes the audit row only when something actually happened.

**Lifecycle columns are cleared on re-application**, and that is correctness
rather than tidiness: the approval path uses
`activated_at := coalesce(new.activated_at, now())`, so a re-approved row that
kept its old `activated_at` would report the *first* approval as the time of the
second. `created_at` is deliberately not reset — it is when this account first
applied here, and that is true.

`workspace_staff_guard` is otherwise reproduced from `20260830h` byte-for-byte,
error strings included, so the diff is one inserted block.

## 4 · Dry run — 12 + 4 checks, all PASS

Against production, inside `begin; … rollback;`, through the real RPCs under
simulated JWT identities.

| # | Check | Result |
|---|---|---|
| 1 | a first application still becomes `pending`, and says so | PASS |
| 2 | re-entering while pending writes **no second audit row** | PASS |
| 3 | an **active** assistant is told `active`, not "pending" | PASS |
| 4 | **a removed assistant re-applies and the row really becomes `pending`** | PASS |
| 5 | `activated_at` / `removed_at` are cleared on re-application | PASS |
| 6 | a re-applied assistant still sees **no roster** (`teacher_roster: not staff of this workspace`) | PASS |
| 7 | a re-applied assistant **cannot self-approve** | PASS |
| 8 | a third party cannot re-apply for someone else | PASS |
| 9 | the teacher row is still immovable | PASS |
| 10 | the teacher pasting their own staff code is told `active` | PASS |
| 11 | a wrong code is still refused | PASS |
| 12 | an enrolled student still cannot become staff in the same class | PASS |

Check 8 above was refused by the table privilege, not the guard — so it was
**re-run against the guard itself**, inside a definer stand-in where privilege
could not mask the answer:

| | Asked of the guard | Result |
|---|---|---|
| A | `removed → pending` by the row's own user | **ALLOWED**, row becomes pending |
| B | `removed → pending` by a **third party** | REFUSED — only the workspace owner |
| C | `removed → active` by the assistant | REFUSED — only the workspace owner |
| D | `pending → active` by the assistant | REFUSED — only the workspace owner |

### It could have gone red

A mutant guard whose allowance omits `new.user_id = auth.uid()` turns check B
into **FAIL** (`ALLOWED | row=pending`) — a third party re-applying on someone
else's behalf. The check is real.

## 5 · The reachability half

`teacher.html` carries the ASSISTANT CODE box, but its only two links —
`login.html`'s redirect and `nav.js`'s Teaching link — are **both gated on
ACTIVE staff**. So someone handed an assistant code had no path to the box that
accepts it, and a pending assistant had no way back to check their own status.

The fix is one line in `settings.html`'s Teachers & Assistants card: a link to
`teacher.html`, saying what an assistant code is and that they will see nothing
until approved. Settings is reachable by everyone and is already where class
relationships are managed.

**A link is not access.** `nav.js` still gates Teaching on ACTIVE staff only —
deliberately not on `pending_count`, which `my_experience()` already returns —
and `settings.html` gained no staff RPC. Asserted in the suite.

`teacher.html`'s join handler now branches on the returned status: `active`
loads the workspace, only `pending` shows the waiting screen. A client on the
old bundle still receives `pending` from the new function in the case that
matters, so the migration and the site can deploy in either order.

## 6 · Test evidence

`tests/staff-rejoin.test.mjs` — **45 checks**; CI **55/55 green**.

Seven mutations, each turning exactly the intended check red:

| Mutation | Check that failed |
|---|---|
| the allowance forgets whose row it is | it is limited to the row's OWN user |
| the allowance is widened to reach `active` | limited to removed → pending; never mentions active |
| the owner check moves **before** the allowance (making it dead) | the workspace-owner check still follows the allowance |
| re-application forgets to clear `activated_at` | re-application clears activated_at |
| the audit row is written unconditionally again | the audit write is conditional |
| `teacher.html` always shows the waiting screen again | the handler branches on the returned status |
| the settings link is removed | settings links to the assistant code box |

The card was also rendered headlessly with the page's real CSS: the assistant
line sits below a divider in secondary text and does not compete with "Connect
to a class".

## 7 · A discrepancy found on the way

The live `staff_join_workspace` body was **884 bytes**; the body in `20260830c`
is **1034**. The difference is **two comment lines and nothing else** — verified
by stripping comments from both and comparing: identical. The applied revision
simply carried no comments. Recorded because a rollback must restore what was
really running, and `20260830v` does.

`workspace_staff_guard` was byte-for-byte identical between repo and production
(2426 bytes, md5 `4e098f6a6bff50b5ef21e71fd800a707`).

## 8 · Deliberately not in this change

Per the approved scope: no provisioning, no workspace-creation permission
change, no admin account lookup, no routing change, no `nav.js` change.

Two follow-ups recorded rather than done:

* Two guard error strings still say **"the owner row"** where the value is now
  `teacher` — a leftover from `20260830h`. Correcting them is a user-visible
  string change unrelated to this defect.
* `workspace_new_code()` uses `random()`, not a CSPRNG. At 32⁸ ≈ 1.1 × 10¹² with
  rotation available this is not a practical risk, but the codes are not
  cryptographically unpredictable.

## 9 · Files

```
supabase/migrations/20260830j_staff_rejoin.sql            -- forward, PREPARED
supabase/migrations/20260830v_staff_rejoin_rollback.sql   -- back, unapplied
```
