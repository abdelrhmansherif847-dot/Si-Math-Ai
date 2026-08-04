# Migration review package — server-side streak

For `supabase/migrations/20260804_streak_server_side.sql`. **Not yet applied.**
Baseline captured from production 2026-08-04, immediately before review.

Companion documents: `streak-postgres-review.md` (the nine-area implementation
review), `streak-server-side-architecture.md` (why Postgres over an Edge
Function), `streak-system-investigation.md` (the original bug hunt).

---

## 1. The migration

Full text: `supabase/migrations/20260804_streak_server_side.sql`. Five sections,
in this order, all in **one transaction**:

| § | What | Lock taken |
|---|---|---|
| 1 | `CREATE INDEX` on `exam_practice_sessions (user_id, created_at)` and `focus_tasks (plan_id, status, completed_at)` | `SHARE` on those two tables |
| 2 | `ADD COLUMN profiles.timezone text` + shape `CHECK` + `GRANT` on that column | `ACCESS EXCLUSIVE` on `profiles` |
| 3 | `CREATE OR REPLACE FUNCTION recompute_streak(uuid, text)` | none (catalogue only) |
| 4 | `REVOKE ALL … FROM public`, `GRANT EXECUTE` to `authenticated, service_role` | none |
| 5 | `REVOKE UPDATE/INSERT (current_streak, best_streak, last_active_date) FROM authenticated` | `ACCESS EXCLUSIVE` on `profiles` |

Section 5 is deliberately last: any earlier failure rolls the whole thing back
and leaves the client's existing write path intact.

## 2. The rollback

Full text: `supabase/migrations/20260804_streak_server_side_rollback.sql`.

1. `GRANT` the three streak columns back to `authenticated` — **first**, so an
   interrupted rollback cannot leave a client that has already fallen back
   unable to write.
2. `DROP FUNCTION recompute_streak(uuid, text)`.
3. `profiles.timezone` is **kept** (additive, `NULL`-tolerant, holds real data by
   then; every reader treats absence as "use the device zone"). The full-teardown
   statements are included as a comment for the rare case they are wanted.
4. The two indexes are **kept** — they benefit the in-browser path's queries too.

Because `assets/streak.js` detects an absent RPC at call time, migration and
client can be reverted in **either order** with no broken state.

## 3. Deployment checklist

Pre-flight (all already true, re-confirm on the day):

- [ ] `git status` clean on `claude/si-math-platform-audit-wp4oww`
- [ ] `node tests/run-all.mjs` → 31/31
- [ ] `scripts/smoke-pages.mjs` → 46/46
- [ ] The client wrapper is **already deployed** and inert (RPC absent → in-browser path)
- [ ] Baseline snapshot captured (§ 6 query) and recorded
- [ ] Rollback file present and read

Apply:

- [ ] `apply_migration` with `20260804_streak_server_side.sql`
- [ ] Confirm it returns success (it is one transaction — partial application is
      not a state that can exist)

Immediately after (§ 4 checklist in full):

- [ ] Structural verification — column, function, grants
- [ ] Behavioural verification — call the function, compare against the client's answer
- [ ] Data verification — no streak lost, no achievement revoked
- [ ] `node tests/run-all.mjs` → 31/31
- [ ] Production smoke — load dashboard and progress as a real signed-in student

## 4. Production verification checklist

**A. Structure.** Re-run the § 6 query; expect exactly these three flips:
`timezone_column_exists false → true`, `recompute_streak_exists false → true`,
`client_can_write_streak true → **false**`. Everything else unchanged.

**B. The function runs and is honest.** For a known student, as `service_role`:

```sql
SELECT public.recompute_streak('e5570d10-260e-431e-b32d-7d1d0dcab720'::uuid, 'Africa/Cairo');
```

Expect a JSON object with the five keys, `current_streak` matching what the
dashboard showed before, and `timezone` stored back on the row.

**C. Authorisation actually refuses.** The critical one — this is the entire
security boundary:

```sql
-- As an authenticated user whose auth.uid() is NOT this id: must raise 42501.
SELECT public.recompute_streak('<some other student uuid>'::uuid, NULL);
```

**D. The revoke bites.** As `authenticated`, this must fail:

```sql
UPDATE public.profiles SET current_streak = 999 WHERE id = auth.uid();
```

**E. No data loss.** `sum_best_streak` must not decrease, and
`streak_achievements` must not decrease. Both are high-water marks.

**F. Idempotency.** Call the function twice for one student; the second call must
return the identical object and write nothing (`§ 3` change-check).

**G. Smoke.** Sign in as a test account: dashboard Current Streak matches the
Weekly Progress strip; Progress page agrees with the dashboard; a chat message
still records and the streak still updates.

## 5. Expected before / after behaviour

| | Before | After |
|---|---|---|
| Who computes the streak | the browser | `recompute_streak()` in Postgres |
| Day boundary | device timezone | `profiles.timezone`, seeded from the device on first call |
| Two devices, different zones | disagree; the row thrashes 10/1/10/1 | agree — one stored zone |
| Concurrent recomputes | client CAS, best-effort | one row lock, serialised |
| History scanned | last 120 days, capped at 1000 rows | all of it |
| Long streaks | horizon heuristic (a 107-day streak once read 37) | exact |
| Streak columns writable by client | **yes** — forgeable | **no** |
| Achievements | separate upsert after the write | same transaction as the streak |
| Writes per page load | one, always | zero unless something changed |

## 6. Before/after snapshot query

Run verbatim before and after; diff the two results.

```sql
SELECT 'streak_rows' AS metric, count(*)::text AS value FROM profiles
UNION ALL SELECT 'nonzero_current_streak', count(*)::text FROM profiles WHERE coalesce(current_streak,0) > 0
UNION ALL SELECT 'sum_current_streak', coalesce(sum(current_streak),0)::text FROM profiles
UNION ALL SELECT 'sum_best_streak', coalesce(sum(best_streak),0)::text FROM profiles
UNION ALL SELECT 'max_best_streak', coalesce(max(best_streak),0)::text FROM profiles
UNION ALL SELECT 'achievements_total', count(*)::text FROM achievements
UNION ALL SELECT 'streak_achievements', count(*)::text FROM achievements
    WHERE achievement_key IN ('streak_7','streak_30','consistency_champion')
UNION ALL SELECT 'timezone_column_exists', (EXISTS(SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='profiles' AND column_name='timezone'))::text
UNION ALL SELECT 'recompute_streak_exists', (EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname='recompute_streak'))::text
UNION ALL SELECT 'client_can_write_streak', (EXISTS(SELECT 1 FROM information_schema.column_privileges
    WHERE table_schema='public' AND table_name='profiles' AND grantee='authenticated'
      AND privilege_type='UPDATE' AND column_name='current_streak'))::text
ORDER BY 1;
```

**Baseline, production, 2026-08-04:**

| metric | value |
|---|---|
| `streak_rows` | 24 |
| `nonzero_current_streak` | 14 |
| `sum_current_streak` | 19 |
| `sum_best_streak` | 44 |
| `max_best_streak` | 17 |
| `achievements_total` | 17 |
| `streak_achievements` | 2 |
| `timezone_column_exists` | false |
| `recompute_streak_exists` | false |
| `client_can_write_streak` | **true** |

## 7. User-visible changes

**None at the moment of applying.** No student sees anything change until their
next page load, and then:

* **Most students: nothing.** Their device zone is what the function adopts and
  stores, so the same number is recomputed. The largest cohort is in Egypt, where
  the stored zone will equal the old hard-coded `Africa/Cairo`.
* **Students outside Egypt may see their streak CHANGE ONCE, and it may go
  down.** This is the correction, not a regression: their days were being split
  at a foreign midnight, so some streaks were inflated and some broken. Worth
  knowing before support hears it.
* **Best streak can only go up or stay.** Guarded by `greatest()`; no student
  loses a personal best.
* **Achievements are never revoked** — `ON CONFLICT DO NOTHING`, no deletes.
* **A student who edited their own `current_streak`** loses that number at the
  next recompute. Intended.
* No UI, copy or layout change. The Weekly Progress strip, counter and
  achievements render from the same payload shape as before.

## 8. Estimated downtime

**Zero.** No table is rewritten and no long lock is taken. Measured object sizes:

| Table | Rows | Size | DDL against it |
|---|---|---|---|
| `profiles` | 24 | 32 kB | `ADD COLUMN` (nullable, no default → metadata only), `REVOKE` |
| `exam_practice_sessions` | 5 | 48 kB | `CREATE INDEX` |
| `focus_tasks` | 280 | 176 kB | `CREATE INDEX` |
| `question_records` | 1,159 | 48 MB | **none** — read only |

`ADD COLUMN` of a nullable column with no default is a catalogue change in
PostgreSQL 11+, so it does not rewrite the table regardless of its size.
Expected wall-clock: **well under one second**, dominated by round-trip latency.

The one honest caveat: § 2 and § 5 take `ACCESS EXCLUSIVE` on `profiles`, which
briefly blocks reads and writes to that table. On 24 rows this is sub-millisecond,
but it does mean the migration should not be run while a long transaction holds a
conflicting lock on `profiles`, or it will queue behind it. Check for one first:

```sql
SELECT pid, state, wait_event_type, left(query, 80) AS query
FROM pg_stat_activity
WHERE state <> 'idle' AND query ILIKE '%profiles%' AND pid <> pg_backend_pid();
```

Plain `CREATE INDEX` (not `CONCURRENTLY`, because a migration runs inside a
transaction) blocks *writes* to the two indexed tables for its duration —
milliseconds at these sizes. On a large table this would need `CONCURRENTLY`
outside a transaction instead.

## 9. Recovery if it fails halfway

**"Halfway" cannot happen.** `apply_migration` runs the file in a single
transaction, and every statement in it is transactional DDL — PostgreSQL supports
this, unlike MySQL. Any failure at any point rolls back all five sections
atomically. The observable states are exactly two: fully applied, or unchanged.

Consequences, by failure point:

* **Fails during §1–§4** — nothing applied. The client keeps its in-browser path,
  because the RPC never came into existence. No action needed beyond fixing the
  cause.
* **Fails at §5 (the revoke)** — still nothing applied, and this is why the
  revoke is last: the riskiest statement cannot leave the function live while the
  client's write path is gone.
* **Succeeds, but the function misbehaves in production** — this is the real
  recovery case. Apply the rollback file. The client detects the absent RPC on
  the next call and resumes computing in the browser; the restored grants let it
  write again. No data is lost, because nothing is deleted and both streak
  numbers are high-water marks.
* **Succeeds, but a student's streak looks wrong** — do not roll back
  reflexively. Run the function for that student and compare against the § 6
  numbers; a *changed* streak outside Egypt is the expected correction (§ 7).

**Rollback decision rule:** roll back if the function errors for any real
student, if authorisation check C fails, or if `sum_best_streak` decreases.
Do not roll back for individual streak values changing outside Egypt.

There is no restore-from-backup path in this plan because nothing is destroyed:
no `DROP`, no `DELETE`, no type change, no rewrite. The only privilege removed is
restored by the rollback's first statement.
