# PostgreSQL implementation review — `recompute_streak()`

2026-08-04. Final review before applying `20260804_streak_server_side.sql`.
Conducted against the live database (read-only) rather than from reading.

**The first draft had nine defects, two of them security-relevant.** All are
fixed in the migration as it now stands; each is recorded below rather than
quietly corrected, because the point of the review is what it caught.

---

## 1. Transaction safety under concurrent updates

**Defect found — lost update.** The draft read `best_streak` and `timezone`,
computed, then wrote. In READ COMMITTED (Postgres' default, and Supabase's) two
overlapping calls both read the pre-state, both compute, and the later `UPDATE`
silently discards the earlier one. That is precisely the lost update the
client-side compare-and-set was built to fight — reproduced there, and it would
have been reintroduced here.

**Fixed** by taking a row lock at the top (§ 2) and by making `best_streak`
monotonic in the write itself:

```sql
best_streak = greatest(v_best, coalesce(best_streak, 0))
```

evaluated against the row's *current* value under the lock, so a personal best
cannot move backwards even if a write arrives by another path.

Each call is one statement from the client, so it is its own transaction: either
the profile update, the achievement inserts and the timezone write all commit, or
none do. There is no partial state to observe.

## 2. Row locking behaviour

```sql
select ... from public.profiles where p.id = p_user_id for update;
```

* **Scope** — exactly one row, taken before any other work, so concurrent
  recomputes of *the same* student serialise and recomputes of *different*
  students never contend.
* **Deadlock** — impossible by ordering: `profiles` is always locked first, and
  the only other lock (the `achievements` insert) is always taken after.
* **Duration** — a few milliseconds (26.8 ms measured for the busiest account,
  before the new indexes).
* **Missing row** — `for update` finds nothing for a student whose profile has
  not been created yet. Handled explicitly: return a zeroed result with
  `skipped: true` rather than raising, so a brand-new signup does not see an
  error.

The second caller re-reads after the first commits, so it sees the winner's
values and the same or newer activity. **This is what deletes the client's CAS,
retry loop and staleness check** — the lock provides for free what ~200 lines of
JavaScript approximated badly.

## 3. Performance under high write volume

Measured with `EXPLAIN (ANALYZE, BUFFERS)` on the busiest live account
(759 `question_records`):

| Source | Plan before | Issue |
|---|---|---|
| `question_records` | Index Only Scan | fine |
| `exam_practice_sessions` | **Seq Scan** | no plain `user_id` index |
| `focus_tasks` | **Seq Scan** | no `plan_id` index |

Total 26.8 ms / 212 buffers. Harmless today (21 and 316 rows) but **O(table)
rather than O(user)** — and this function runs on every dashboard load, every
Progress load and every answered question, so it degrades quietly as the platform
grows. **Fixed** by adding both indexes in § 1 of the migration.

**Write volume — defect found.** The draft wrote the row unconditionally on every
call. Since most calls change nothing, that is WAL, dead tuples and index churn
for no state change, on the hottest path in the app. **Fixed** with a change
check: the `UPDATE` runs only when a value actually differs. Steady-state read
traffic now performs zero writes.

**Returned payload — defect found.** `active_days` was unbounded, so a
long-tenured student would ship years of dates on every page load for a 7-day
strip. **Fixed:** the streak is still computed over all history, but only the
last 180 days are returned.

**Unbounded history is deliberate.** It costs an index range scan per source and
removes the 120-day window *and* the horizon heuristic — which was itself a bug
source (a 107-day streak once read 37).

## 4. SECURITY DEFINER safety

**Defect found — privilege escalation (the serious one).** The draft read:

```sql
if auth.uid() is not null and auth.uid() <> p_user_id then raise ... end if;
```

which **fails open** when `auth.uid()` is null: any caller without a resolvable
JWT subject could pass any `p_user_id` and recompute — and read back — another
student's streak. **Fixed** to fail closed: a null `auth.uid()` is accepted only
for `service_role` / `postgres` / `supabase_admin`; otherwise refused.

**Defect found — `search_path` included `pg_temp`.** A `SECURITY DEFINER`
function that leaves `pg_temp` searchable lets a caller create a temporary object
shadowing an unqualified name and have it execute as the owner. **Fixed** to
`set search_path = pg_catalog, public`, with `pg_catalog` first so built-ins
cannot be shadowed either. Every table reference is additionally schema-qualified.

**Defect found — default `EXECUTE` to `public`.** Functions are executable by
everyone unless revoked, which would have exposed this to `anon`. **Fixed:**
`revoke all ... from public`, then grant to `authenticated, service_role`.

**SQL injection: none.** There is no dynamic SQL — no `EXECUTE`, no
`format()`, no concatenation. `p_device_tz` reaches `AT TIME ZONE` as a plpgsql
*value*, and is required to exist in `pg_timezone_names` before use, so an
unrecognised or hostile string is discarded rather than evaluated. `p_user_id` is
`uuid`, so a non-UUID is rejected by the type system at the call boundary.

## 5. RLS compatibility

Verified against the live catalogue: every table involved is owned by `postgres`,
has `relrowsecurity = true` and **`relforcerowsecurity = false`**. A table owner
bypasses RLS unless `FORCE` is set — so this function, owned by `postgres`, is
**not constrained by RLS at all**.

This is the intended design (it must read rows and write columns the caller
cannot), but it means **the `auth.uid()` check is the entire security boundary**,
not a convenience on top of RLS. That is exactly why the fail-open bug in § 4
mattered, and it is now stated in the function's own comment so nobody later
assumes RLS is a second line of defence.

Client RLS is unaffected: existing `SELECT` policies still govern what the
browser reads directly, and the revoked column grants are privilege-level, which
RLS does not override.

## 6. Idempotency

Calling twice over identical persisted data yields an identical result and an
identical row:

* the computation is a pure function of (activity rows, zone, `now()`);
* the `UPDATE` is now a no-op when nothing changed;
* achievements use `ON CONFLICT DO NOTHING`, so a repeat neither duplicates a
  badge nor rewrites its `earned_at`.

Refreshes, extra tabs and repeated calls are therefore free and safe.

## 7. Failure recovery

Any exception aborts the function's transaction, so `profiles` and `achievements`
roll back together and the row is left exactly as it was — there is no
half-applied state, and the next call self-heals from the same immutable activity
rows.

Client-side, `assets/streak.js` distinguishes two cases: an **absent** RPC
(`PGRST202`) means "not migrated yet" and runs the in-browser path; any **other**
error reports the stored row flagged `skipped`, and deliberately does not retry
in the browser, because post-migration the columns are revoked and that path
could only fail again and render a `0` nobody earned.

## 8. Rollback safety

`20260804_streak_server_side_rollback.sql` restores the grants **first**, then
drops the function, so an interruption mid-rollback cannot leave a client that
has already fallen back unable to write. `profiles.timezone` is deliberately
kept: it is additive, `NULL`-tolerant, holds real data by then, and every reader
treats absence as "use the device zone".

Because the client wrapper detects the absent RPC at call time, the migration and
the client can be reverted in **either order** with no broken state.

The new indexes are left in place on rollback — they are pure wins for the
in-browser path's queries too.

## 9. Can it produce different results for identical persisted data?

Given identical activity rows, an identical stored `timezone`, and the same
instant: **no**. The computation is deterministic — `row_number()` orders by a
distinct date, runs are disjoint, and the anchor selection can match at most one
run.

Three honest qualifications:

1. **`now()` is an input.** The same rows yield a different `current_streak`
   tomorrow. That is the feature, not nondeterminism.
2. **First-call zone bootstrap.** While `profiles.timezone` is `NULL`, the result
   depends on which device calls first, because that call adopts and *stores* its
   zone. Every call after that is deterministic. This is the one genuine
   order-dependence, it is self-resolving, and it is strictly better than today,
   where *every* call depends on the device.
3. **A student who changes their stored timezone** legitimately gets a different
   split. That is the point of storing it.

---

## 10. PostgreSQL vs an Edge Function

Both could compute this correctly. The comparison is about what each makes
*impossible*.

| | PostgreSQL function | Edge Function |
|---|---|---|
| Atomicity | Read, compute, write and grant in **one transaction** | Separate round trips; needs its own CAS/locking |
| Concurrency | `SELECT … FOR UPDATE`, one row | No lock primitive without extra round trips |
| Data volume | Sees every row; no window, no cap | PostgREST/pagination limits return; needs a window |
| Latency | One round trip; 26.8 ms measured | Client → Edge → DB → Edge → client |
| Revoking column writes | Works — `SECURITY DEFINER` writes as owner | Also works, via service key |
| Deploy path | **A migration** — the path already in use | A second, manual path |
| Deploy risk | Reviewed as SQL, applied once | `CLAUDE.md` records **two production outages** from `ai-tutor` deploys; multi-file bundle, CLI-only |
| Drift | Function and schema version together | Source and deployed bundle drift routinely — this repo's own baseline was wrong in both directions inside 24h |
| Secrets | None | Needs a service key with elevated rights |
| Testability | Deterministic SQL | Needs the runtime |

**Why Postgres wins long-term here**, specifically:

1. **Atomicity is the actual requirement.** Every bug this saga produced —
   clobbering, `best_streak` regressing, stale reads, read-after-write seeds —
   was a symptom of read-compute-write not being atomic. Postgres makes it atomic
   by construction; an Edge Function would have to *rebuild* the CAS machinery
   that is being deleted, just in TypeScript instead of JavaScript. Same bug
   class, new address.
2. **It removes a deploy path rather than adding one.** The Edge Function is the
   riskiest surface this project has: two outages, a four-file bundle, a
   CLI-only manual step, and a documented habit of the repo and production
   drifting apart. A migration is reviewed once and versioned with the schema it
   depends on.
3. **The computation belongs next to the data.** It reads three tables, writes
   two, and needs no network, no model, no secret. Shipping the rows to another
   process to compute a number about them is the part that was wrong.

**Where an Edge Function would be the better choice** — and this is worth stating
so the decision is not mistaken for a general rule: if the streak ever needed a
provider call, an external API, or logic genuinely awkward in SQL. It does not.

**One honest cost of the Postgres route:** SQL is harder to unit-test in this
repo's dependency-free harness than JavaScript is. The tests pin the *client
contract* (RPC preferred / absent / failing) and the SQL is verified against the
live database; a JS implementation would have been easier to test in isolation.
That is a real trade, made knowingly, and it is why this review exists in the
form it does.

---

## Verdict

The nine defects the review found are fixed. The two that mattered — a fail-open
authorisation check and a missing row lock — were both **reintroductions of bug
classes already fixed once on the client**, which is the strongest argument for
having done this review before applying rather than after.

Recommended to apply, with the `SECURITY DEFINER` authorisation block and the
final `REVOKE` as the two things to read closely.
