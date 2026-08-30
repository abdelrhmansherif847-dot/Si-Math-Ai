# Owner Provisioning — the surface that lets a workspace exist

**Two halves, deliberately separated:**

| Half | Status |
|---|---|
| The provisioning surface in `admin.html` | **Built.** Deployable today against the already-live migrations |
| `20260830k` — creation becomes Owner-only | **🟡 PREPARED, NOT APPLIED.** Dry-run and mutation-tested; awaiting explicit approval |

**Date:** 2026-08-30 · **Project:** `igvkyxkmjnkzscqgommj` · **Branch:**
`claude/teacher-intelligence-layer-8e66b0`

---

## 1 · The gap this closes

`teacher_create_workspace()` had **no caller anywhere in the site**. So no
workspace could be created through the product, so no class code could exist,
so the "Connect to a class" box every student now sees in Settings could never
succeed. Creating a workspace required a direct database call.

The flow is now:

```
Owner → finds an existing account by email → names the class → Create
     → teacher_create_workspace() does all of it in ONE transaction:
         the workspace · the teacher/active staff row · both join codes · the audit row
     → the Owner is shown both codes and what each is for
     → the teacher signs in and my_experience() takes them to teacher.html
     → the student enters the student code in Settings, of their own accord
```

## 2 · What the surface is, and what it is not

**The RPC is the sole writer.** The client calls it and never inserts, updates
or deletes a workspace row — asserted per table per verb in the suite, because
the atomic guarantee is the whole value of routing through one function.

**No new way to reach `profiles`.** The account search reuses the exact query
Role Management already runs:

```js
sb.from('profiles').select('id, email, full_name, role').ilike('email', '%' + q + '%').limit(50)
```

An earlier design sketch proposed an `admin_find_account(email)` RPC. That was
wrong and is not built: RLS `admin_select_profiles` already lets any admin
select **every** profile row — measured, the Owner sees all 37 rows and all 37
emails; a plain user sees 1. A narrower second path would have been more surface
for no less exposure. The suite asserts the query is the same one and that it
selects no column beyond what Role Management already displays.

**Creating the workspace is what makes a Teacher.** Nothing in the panel writes
`profiles.role`, and nothing grants admin. The page says so where the Owner can
read it, and the suite asserts the absence.

## 3 · Owner-only, and where it actually lives

`admin.html` hides the panel two ways — `data-role-min` and a `role === 'owner'`
branch — and **both set `element.style.display` and nothing else.** All 16 gated
sections work this way. Hiding a card does not stop anyone calling the RPC.

So the restriction is in `20260830k`, one line of one function:

```diff
- if not has_role_at_least('admin'::user_role) then
+ if current_user_role() <> 'owner'::user_role then
```

`current_user_role() <> 'owner'` rather than `has_role_at_least('owner')`
because they are not the same statement: `>=` asks "at least this rung", and
there is no rung above owner *today* — if one were added, the `>=` form would
silently admit it.

Measured on production: **three accounts** satisfy the current `admin` gate —
one `owner` and two `super_admin`. That is the gap between the code and the
intent, and it is what this migration closes.

Everything else in the function is reproduced verbatim, and the page is
annotated so a future reader cannot mistake the hidden panel for the boundary.

**The cost, stated:** with this applied, if the Owner account is unavailable,
nobody can create a class.

## 4 · Dry run — 15 checks, all PASS

Against production inside `begin; … rollback;`, through the real RPCs under
simulated JWT identities.

| # | Check | Result |
|---|---|---|
| 1–2 | **both super_admins are refused** (`platform owner only`) | PASS |
| 3 | a teacher cannot self-provision | PASS |
| 4 | the **Owner** can provision | PASS |
| 5 | the teacher is auto-made **active `teacher` staff** | PASS |
| 6 | both codes still generated, distinct, 8 characters | PASS |
| 7 | the audit row is still written | PASS |
| 8 | **the teacher gains no platform role** (`profiles.role` stays `user`) | PASS |
| 9 | `my_experience()` then routes them to `staff` | PASS |
| 10 | an unknown account is still refused | PASS |
| 11 | a too-short class name is still refused | PASS |
| 12 | **a super_admin can still READ workspaces** — reads are deliberately not narrowed | PASS |
| 13 | the Owner can read back the code the page must show | PASS |
| 14 | the Owner cannot rotate a code for a class they do not own | PASS |
| 15 | **the full first-use path closes** — student joins, teacher sees them on the roster | PASS |

### It could have gone red

Reverting the gate to `has_role_at_least('admin')` turns check 1 into **FAIL**
(`CREATED`) — a super_admin provisioning again.

## 5 · A trap worth recording

`teacher_my_workspaces()` returns **zero rows for the Owner** — correctly,
because the Owner is not staff of the workspace they created. A panel built on
that RPC would have silently shown an empty list. The list reads
`teacher_workspaces` directly, which RLS permits via
`OR has_role_at_least('admin')`. The suite asserts the RPC is not called.

## 6 · The guardrail: one class per teacher

`teacher.html` renders only the **first** active workspace it is handed
(`rows.find(r => r.staff_status === 'active')`). Measured: one account can own
two workspaces — nothing in the database refuses it. So a second class would be
created and then be **unreachable for its teacher**.

Until the multi-workspace selector exists, the panel marks such accounts
"already teaches a class", offers no Select button, and refuses creation in the
handler as well. **This is a guardrail, not a boundary** — the database still
permits it, and the code says so.

## 7 · Test evidence

`tests/owner-provisioning.test.mjs` — **57 checks**; CI **56/56 green**.

Six mutations, each turning exactly the intended check red:

| Mutation | Check that failed |
|---|---|
| the migration keeps the admin gate | the gate is an equality on 'owner' · the old admin gate is gone |
| the gate becomes `has_role_at_least('owner')` | the gate is an equality on 'owner', not a rung comparison |
| the client writes the staff row itself | the client never calls `.insert()` on `workspace_staff` |
| the guardrail is dropped from the handler | creation refuses them even if the button is reached |
| the created panel stops explaining the staff code | it warns that the staff code mints assistants |
| the search widens what it selects | provisioning runs the SAME query · selects no extra column |

One assertion had to be rewritten during the run: it matched the *comment*
explaining why `teacher_my_workspaces()` is unused rather than any code. Fixed
to assert on the call.

Both panels were rendered headlessly with the page's real CSS.

## 8 · Deploy order is safe in both directions

The panel ships with the static site on merge; `20260830k` is applied by hand.

* **Before** it is applied: the panel is Owner-only in practice because only the
  Owner is shown it, and a super_admin calling the RPC directly succeeds exactly
  as they can today. Nothing regresses.
* **After**: such a call is refused by the database, and the panel reports what
  the server said (`twSay(e.message …)`), rather than hiding the failure.

The P0 client changes (`teacher.html` status handling, `settings.html` assistant
link) ride the same merge, so the deployed experience is complete: provisioning,
the codes, the assistant path and the truthful re-application all arrive at once.

## 9 · Files

```
admin.html                                                    -- the surface
supabase/migrations/20260830k_owner_only_provisioning.sql     -- forward, PREPARED
supabase/migrations/20260830u_owner_only_provisioning_rollback.sql  -- back, unapplied
tests/owner-provisioning.test.mjs                             -- 57 checks
```

## 10 · Not in this increment

The multi-workspace selector; any duplicate-name constraint; any change to the
workspace model, routing, `my_experience()`, or unrelated permissions.
