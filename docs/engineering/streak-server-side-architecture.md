# Should the streak move server-side? Yes — and it subsumes the migration

2026-08-04. Written before implementing `profiles.timezone`, because the answer
changes *what* should be implemented. Approving a column and then discovering the
computation belongs elsewhere would mean building the client half twice.

**Verdict: compute the streak in Postgres. The timezone column is still needed,
but as an input to a server-side function rather than to browser JavaScript.**

---

## 1. Why the current architecture cannot be finished

The streak is computed in the browser and written to columns the browser owns.
Three consequences, and none is a bug that can be fixed in place:

**Concurrency is unsolvable at the client.** Two devices recomputing from the
same rows must agree on who wins. The compare-and-set and the staleness check now
in `assets/streak.js` resolve *stale vs fresh*, but two devices in different
timezones are **both fresh and legitimately disagree** — so no guard fires and the
row thrashes. Measured on live data for one real student:

| Timezone | active days | best streak |
|---|---|---|
| Africa/Cairo | 42 | **16** |
| Asia/Dubai | 42 | **16** |
| America/New_York | 42 | **18** |
| Pacific/Kiritimati | 39 | **10** |

Same rows, same instant, four different truths. A stored timezone removes the
ambiguity — but only if exactly one actor applies it.

**The columns are forgeable.** `current_streak`, `best_streak` and
`last_active_date` are `UPDATE`-granted to `authenticated`, because the client
computes them. Several guards therefore trust client-writable data: the horizon
fallback trusts `storedCurrent`, the best-streak floor trusts `storedBest`. A
student can edit their own row and mint achievements. **The timezone column does
not fix this.** Only moving the computation does.

**Correctness is bounded by what a browser can fetch.** A 120-day window and a
1000-row PostgREST cap are not incidental — they are why the horizon guard exists
at all, and that guard is a heuristic that trusts a forgeable stored value.

---

## 2. The proposed design

A **Postgres function**, not an Edge Function:

```sql
create function public.recompute_streak(p_user_id uuid default auth.uid())
  returns jsonb
  language sql
  security definer
  set search_path = public
```

It resolves the student's zone (`profiles.timezone`, falling back to a default),
projects all three activity sources to local dates, finds consecutive runs with
the standard `date - row_number()` grouping, applies the anchor rule, updates
`profiles`, and returns `{current_streak, best_streak, active_days, timezone,
today_key}` — the exact shape `updateStreak` already returns.

**Why Postgres rather than an Edge Function.** It ships as a migration, so there
is no second deploy path to keep in sync — and `CLAUDE.md` records two production
outages from Edge Function deploys. It runs in one transaction against all rows,
so no window, no row cap, and no read-after-write gap. And `SECURITY DEFINER` lets
the streak columns be revoked from `authenticated` while the function still
writes them, which is the only way to close forgeability.

### What this deletes

Roughly 200 lines of `assets/streak.js` become unnecessary, because each existed
to compensate for computing in the wrong place:

| Machinery | Why it existed | Why it goes |
|---|---|---|
| Compare-and-set + retry loop | concurrent browser writes | one transaction; no lost update possible |
| Pre-write staleness check | a stale run overwriting a fresh one | there is one writer |
| `ROW_CAP` + newest-first ordering | PostgREST truncation | SQL aggregates every row |
| Window-edge / truncation horizon | the 120-day window | no window |
| `activityAt` / `activityToday` seed | read-after-write visibility | the write and the read are in one transaction |
| `getStreakSnapshot` + freshness bounds | cross-page staleness | one call returns the truth |

Every one of those was a real fix for a real bug this session. That they all
dissolve is the argument: they were compensating for the architecture.

**`assets/streak.js` keeps its signature** — `window.updateStreak(sb, userId,
opts)` returning the same object — and becomes a thin RPC wrapper. That matters
practically: `mock-exam.html` and `focus.html` are FROZEN and both call it. The
computation can move server-side **without editing either frozen file.**

### What stays client-side

Rendering only. `dashboard.html` and `progress.html` keep reading the returned
object; the Weekly Progress strip keeps deriving from `active_days` and
`today_key`. `SiDay` stays for display-side date maths.

---

## 3. Honest costs and risks

* **`SECURITY DEFINER` needs care** — `search_path` pinned, `p_user_id` defaulting
  to `auth.uid()`, and a check that a caller cannot recompute (or read) another
  student's row. This is the main review surface.
* **Achievements** move into the function, or stay client-side reading its result.
  Recommend inside: it is the same transaction, so a granted badge and the streak
  that earned it cannot disagree.
* **Migrations are irreversible in production.** Mitigated by the function being
  additive and the grant revocation being a separate, independently revertible
  statement.
* **Offline degradation changes.** Today a failed read leaves the stored value;
  with an RPC, a failed call means no update at all — which is the same outcome,
  but the client must render the stored value rather than 0. Already the case.
* **This is a bigger change than a column.** It is one migration plus a rewrite of
  one client module, versus one migration plus threading a value through two
  pages. The larger change removes more code than it adds.

---

## 4. Recommendation, and the ordering question

**Do the server-side move as the migration**, rather than shipping the
client-side timezone column first and moving the computation later.

Doing it in two steps means: write the client code to read and write
`profiles.timezone`, thread it through `updateStreak`, verify the two-device
scenario, ship it — and then delete all of it when the computation moves, because
a server-side function reads the column directly and the client never touches it.
The intermediate state also leaves the columns writable, so the forgeability
finding stays open through a release that was explicitly justified by closing
inconsistencies.

The single change is not much larger, and it is the one that makes the
architecture correct rather than the one that adds a column to a design that
cannot be finished.

### The atomic package

Nothing lands separately; the schema and the application move together:

1. **Migration** — `profiles.timezone`; `recompute_streak()`; `REVOKE UPDATE
   (current_streak, best_streak, last_active_date) FROM authenticated`.
2. **Client** — `assets/streak.js` becomes an RPC wrapper with an unchanged
   signature and return shape; it also writes back the device zone when
   `profiles.timezone` is null, so values converge with no student action.
3. **Edge Function** — no change required. `ai-tutor` does not touch the streak
   columns. (Confirmed by inventory; this is the one component that stays still.)
4. **Data flow** — unchanged for every consumer: dashboard, progress, planner and
   achievements keep reading the same object shape.
5. **Tests** — the existing 82 assertions keep running against the wrapper's
   contract; new SQL-level tests pin the anchor rule, consecutive/missed days, the
   timezone split and the revoked grants. The suites that pinned CAS behaviour are
   deleted with the code they pinned, and their intent moves to the SQL tests.
6. **Rollback** — one migration that drops the function and restores the grants;
   the client wrapper falls back to the current in-browser path if the RPC is
   absent, so a revert is safe in either order.

### The decision I need

This changes what gets built, so I have not started it. Two viable paths:

**A — server-side (recommended).** One atomic change; closes the timezone
ambiguity *and* forgeability; deletes ~200 lines of compensating machinery.
Bigger review surface, and a `SECURITY DEFINER` function to get right.

**B — client-side column, as originally scoped.** Smaller and closer to what is
already reviewed; closes the timezone ambiguity only; leaves the columns forgeable
and keeps the CAS machinery, most of which would later be deleted anyway.
