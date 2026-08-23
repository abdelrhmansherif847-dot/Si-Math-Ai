# M1 — Staging Validation Report

**Date:** 2026-08-23 · **Migration:** `20260823a_mock_exam_integrity_events.sql` rev 4
**Verdict:** all checks passed · **one documentation defect found and fixed**
**M1 remains PREPARED and unapplied. Production was not touched.**

---

## 0. The authorised environment was not available

Authorisation was given to create a billable Supabase Preview Branch. **It could
not be created:**

```
PaymentRequiredException: Branching is supported only on the Pro plan or above
```

Confirmed by `get_organization`: the org `abdelrhmansherif847-dot's Org` is on the
**free** plan. Branching needs Pro (~$25/month). The quoted branch cost —
$0.01344/hour, ~$9.70/month — was never incurred, because no branch was created.

**A local PostgreSQL cluster was used instead**, which is *more* isolated than a
Preview Branch, costs nothing, and touches no account resource. It was created in
a temporary directory, used, and destroyed.

### Fidelity — what this environment is and is not

| | Preview Branch | What was used |
|---|---|---|
| Isolation from production | yes | **yes — stronger**, different machine entirely |
| Cost | $0.0134/hr | **none** |
| PostgreSQL version | 17.6 (matches prod) | **16.13 — differs** |
| Schema | full production clone | **only M1's dependencies, rebuilt** |

**Both gaps are real and neither is hidden.**

The version gap matters least: every feature M1 uses (`GENERATED ALWAYS AS …
STORED`, generated columns in indexes and CHECKs, `jsonb_each`, RLS, statement
triggers) has been present and stable since PG 12–13. The one PG 17 detail
observed — the `MAINTAIN` privilege appearing in default ACLs — does not affect
any behaviour M1 depends on. The expression-level probes reported earlier were
run against **production's own PG 17.6** read-only, so the generated-column
mapping and the metadata validator were confirmed on the real version too.

The schema gap matters more, and is stated plainly: **this run does not prove M1
applies cleanly on top of the real 141-migration production schema.** It proves
M1's own semantics are correct. The dependencies were not invented — they were
copied from production:

* `auth.uid()` — `pg_get_functiondef` output, verbatim
* `has_role_at_least`, `current_user_role`, `user_role_level` — verbatim
* `user_role` enum — `user < admin < super_admin < owner`
* `exam_practice_sessions` — its real 13 columns, real RLS policy, and
  **table-level** grants (`relacl` set, no per-column `attacl`)
* `pg_default_acl` — reproduced, so every new table auto-grants to `anon`,
  `authenticated` and `service_role`. This is what makes M1's revokes
  load-bearing rather than decorative, and reproducing it is why check 4 below
  is meaningful.

### The harness was proven non-vacuous before any RLS check ran

Testing RLS as the database owner would make every access check pass for the
wrong reason. Identity switching was verified first:

```
current_user=authenticated  auth.uid()=1111…  has_role_at_least('admin')=false   ← student
current_user=authenticated  auth.uid()=3333…  has_role_at_least('admin')=true    ← admin
```

Same role, different JWT claim, different privilege outcome. That is the
precondition for checks 3–8 meaning anything.

---

## 1. Results

| # | Check | Result |
|---|---|---|
| 1 | Migration applies | ✅ clean, exit 0 |
| 2 | Resulting schema | ✅ see below |
| 3 | Student INSERT for own user | ✅ accepted |
| 4 | Cross-user INSERT | ✅ refused — RLS policy violation |
| 5 | Student SELECT | ✅ **0 rows**, despite having inserted one |
| 6 | Student UPDATE | ✅ refused — permission denied |
| 7 | Student DELETE | ✅ refused — permission denied |
| 8 | Admin SELECT | ✅ 1 row visible |
| 9 | Metadata whitelist | ✅ 4 accepted, 5 refused |
| 10 | Confidence classification | ✅ both branches + fail-loud |
| 11a | Rollback, empty table | ✅ proceeds, no flag needed |
| 11b | Rollback, non-empty, no confirmation | ✅ **REFUSED** |
| 11c | Rollback, non-empty, with confirmation | ✅ proceeds |
| + | `anon` locked out | ✅ SELECT and INSERT both refused |
| + | `service_role` UPDATE | ✅ refused by the append-only trigger |
| + | `attempt_id` linkage | ✅ joins; legacy save without it still works |

### Check 2 — resulting schema

```
confidence   | text | is_nullable=NO | is_generated=ALWAYS   ← generated AND not-null
attempt_id   | uuid | is_nullable=NO                        ← events
```

Constraints: 5 CHECKs (`event_type`, `confidence_domain`, `exam_code`,
`elapsed`, `metadata`) + PK + FK to `auth.users`.
Indexes: `user_time`, `attempt`, `high_conf` (partial), plus `eps_attempt_idx`.
RLS: enabled, exactly 2 policies — `insert_own` (WITH CHECK `user_id = auth.uid()`)
and `admin_read` (USING `has_role_at_least('admin')`). No UPDATE or DELETE policy.

**The `attempt_id` asymmetry, confirmed empirically:**

```
exam_integrity_events.attempt_id   is_nullable = NO
exam_practice_sessions.attempt_id  is_nullable = YES
```

**Privileges — the check that the reproduced `pg_default_acl` made meaningful:**

```
authenticated | INSERT,SELECT
postgres      | DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
service_role  | DELETE,INSERT,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE
```

`anon` is **absent entirely** — it received full DML at creation from the default
ACL and the migration's `revoke` removed it.

### Check 5 is the one worth pausing on

The student inserted an event, then selected and saw **zero rows** — including
their own. That is the no-student-facing-log decision working: their SELECT
matches no policy at all, so nothing is filtered *out*, nothing is ever
considered *in*.

### Check 9 — metadata

Accepted: `{}`, `selection_length`, `hidden_ms`, `blurred_ms`.
Refused: `user_agent`, **a device fingerprint smuggled in beside a valid key**,
copied text, a negative duration, a stringified number.

### Check 10 — classification

```
copy -> high    print -> high    fullscreen_exit -> high
visibility_hidden -> low    window_blur -> low    context_menu -> low
```

* A client supplying `confidence` → refused, `428C9 cannot insert a non-DEFAULT
  value into column "confidence"`.
* An unmapped type, with the `event_type` CHECK widened exactly as a careless
  future migration would widen it → refused, **`23502` not-null**, and **zero
  rows** for that type — so there is nothing for M2 to ever count.

**A detail worth recording precisely:** an unknown `event_type` is rejected by
the NOT NULL on `confidence` *before* the `event_type` CHECK evaluates, because
the generated column is computed first. Both constraints would reject it; the
observed SQLSTATE is 23502, not 23514. The migration's checklist says to expect
23502, which matches.

### Checks 11a–c — the rollback guard

Refusal, verbatim, with both counters correct:

```
ERROR:  M1 rollback refused: 2 integrity event(s) and 1 linked session(s) would
be destroyed. If that is intended, re-run with "set local
si.confirm_integrity_data_loss = 'yes';" in the same transaction.
```

State was unchanged after the refusal. With the confirmation the file's header
documents, it proceeded:

```
NOTICE:  M1 rollback proceeding: dropping 2 integrity event(s); clearing
attempt_id on 1 session(s).
```

After every rollback run: table gone, column gone, index gone, both functions
gone, **`exam_practice_sessions` back to 13 columns with every row intact.**

M1 was applied, rolled back, re-applied and rolled back again in one session
without error — so the pair is repeatable, not one-shot.

---

## 2. The one defect found

**Not in the migration — in the rollback's verification checklist.**

It told the operator to expect *"the original 14 columns"* on
`exam_practice_sessions` after rollback. The table has **13**. Running the
rollback for real is what surfaced it; reading the file never would have.

The 14 came from miscounting an earlier privileges query, whose result set
included one table-level grant row alongside the 13 per-column rows. Confirmed
against production: `count(*) = 13`.

Harmless as a number, but a checklist with a wrong expected value is worse than
no checklist — it trains the operator to wave through a mismatch, which is
exactly the habit a rollback checklist exists to prevent. Corrected in rollback
rev 3.

**This is the return on running the validation rather than reasoning about it.**

---

## 3. Production, verified untouched

Queried after teardown:

```
events_table_absent = true   attempt_id_absent = true   functions_absent = true
eps_columns = 13             sessions_intact  = 21
```

No Preview Branch was created, so nothing is accruing cost. The local cluster was
stopped and its directory deleted.

---

## 4. What this does and does not authorise

Validated: M1's DDL, constraints, generated column, RLS model, privilege model,
append-only enforcement, metadata bounds, fail-loud classification, the
`attempt_id` linkage, backward compatibility with a save that has no
`attempt_id`, and the rollback in all three states.

**Not** validated: that M1 applies cleanly on top of the real production schema
with its 141 applied migrations. Nothing observed suggests it would not — M1
creates new objects and adds one nullable column — but it was not tested, and a
free-plan account cannot test it without applying to production.

That gap is the one thing to weigh before Production approval. Two ways to close
it, neither of which this report assumes:

1. **Upgrade to Pro** (~$25/month) and run this same plan on a real Preview
   Branch cloned from production. Closes the gap completely.
2. **Accept it**, on the grounds that M1 adds only new objects plus one additive
   nullable column, its dependencies were verified present in production, and
   the rollback has now been exercised in all three states.

**Awaiting explicit Production approval. No phase beyond M1 has been started.**
