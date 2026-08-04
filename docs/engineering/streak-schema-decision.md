# Streak: what the current schema fixed, and what it cannot

2026-08-04. Written to separate two questions that were becoming entangled:
*is the streak logic correct?* and *do we need a new column?* The order matters —
a migration introduced while logic bugs remain would hide them rather than solve
them, and we would never learn which problems the column was actually for.

The current design has now been taken to its maximum correctness. Everything in
§1 was fixed **without any schema change**. §2 is what provably remains. §3 is
the migration proposal, to be judged on its own merits.

Full investigation record: `streak-system-investigation.md`.

---

## 1. Bugs fixed within the current schema

Every item below is fixed, on `claude/si-math-platform-audit-wp4oww`, with a
regression test that fails against the code before it.

### 1.1 The root cause — day boundaries in a fixed foreign timezone

Day keys were computed in `Africa/Cairo` on every device. Measured against the
shipped code, the "new day" began at 01:00/02:00 local in Dubai, 06:00/07:00 in
Tokyo, and 17:00 the *previous day* in New York; Cairo's own DST moved the
boundary twice a year, so Riyadh was correct in summer and an hour late in
winter. Three reported symptoms, one cause:

* a streak **broke while the student practised every day** — two consecutive
  local days map to two non-consecutive Cairo days (New York, Mon 15:00 → Cairo
  Mon; Tue 20:00 → Cairo **Wed**), and the wrong value was persisted;
* the day did not start at local midnight;
* practising just after midnight was filed under yesterday, so today's Weekly
  Progress square stayed a placeholder dot.

Fixed: `SiDay` (in `assets/streak.js`) is the single day-boundary authority,
resolving `explicit zone → device zone → Cairo (last resort only)`. All seven
tested zones now roll over at exactly **00:00 local** in both DST seasons.

### 1.2 Silent row-cap truncation

The activity `SELECT`s had no `ORDER BY` and no `LIMIT`. PostgREST truncates at
`max-rows` (1000) **silently**, and unordered the retained rows are arbitrary —
a busy student could lose their most recent days and have `current_streak = 0`
written over a real streak. The busiest live account is at **755 rows** per
window and climbing. Fixed by ordering newest-first with an explicit cap.

### 1.3 The truncation horizon (a bug the fix for 1.2 introduced)

Capping moved the effective horizon forward while the window-edge guard kept
watching the 120-day boundary the walk never reached: a **107-day streak read
37**, losing 9 further days for every additional day of practice. The horizon is
now the oldest day actually delivered whenever a source came back at the cap.

### 1.4 Concurrent writes — clobbering

`profiles.update` was blind last-writer-wins. Reproduced deterministically:
laptop reads before today's row commits (computes 5), phone commits and writes 6,
laptop's update lands last and writes 5. The premise that "recompute from
immutable rows means concurrent runs agree" is **false** — two runs straddling a
commit do not read the same rows.

Fixed with two checks, because one does not cover both orderings: a **pre-write
staleness check** (a stored `last_active_date` newer than any day this run saw
means a fresher run already went — return its values, do not write) and a
**compare-and-set** on the write, retried.

### 1.5 Concurrency bugs the CAS itself introduced

The first CAS was wrong in three ways, all found by adversarial testing and all
fixed:

* the `persisted` flag was **set and never read**, so every refusal path fell
  through and returned the run's own stale numbers *unflagged* — both pages then
  rendered a streak the database contradicted, with today's cell left a dot;
* the retry loop was **last-write-wins wearing a guard**: on losing it re-guarded
  on the winner's value and overwrote it. A run may now proceed only if it saw
  strictly more days;
* **`best_streak` had no guard**, so a run tying on `current_streak` won and
  wrote its own lower best, rolling a personal best backwards. Both columns are
  guarded now and the write is floored against the freshest value seen.

### 1.6 Two ways the streak could freeze forever

The staleness check was unbounded in both directions. A stored
`last_active_date` **after today** — reachable from a skewed client clock — made
every later run bail, freezing the streak permanently. A date **older than the
loaded window** made a lapsed student's streak unresettable, because an empty
window has no last-active day to compare against. Only a date inside the window
and at or before today is evidence now.

### 1.7 A transient read failure destroying a personal best

If the `profiles` read failed, `storedBest` defaulted to 0, so the high-water
floor vanished and a personal best of 130 was overwritten with whatever the
window held — **permanently**, since nothing can reconstruct it. It now bails
exactly as the activity-source guard does.

### 1.8 The activity hint trusting the device clock

`activityToday` added the client's `todayStr` outright. A clock running fast
before midnight credited *tomorrow*: streak inflated by one, an unearned
`streak_7` minted, and a future `last_active_date` stamped — which then triggered
1.6 and froze the streak. The hint is now anchored to persisted data: `activityAt`
carries a server timestamp, and the bare boolean is honoured only when the
database *already* shows activity today, making it a no-op that cannot invent a
day. Any activity dated after today is discarded, which also stops future-dated
rows lighting future Weekly Progress cells with a completed check.

### 1.9 The strip and the counter disagreeing

Two independent defects:

* the counter was read from the `profiles` row — a second round trip *after* the
  recompute had written it — while the strip beside it used the fresh
  computation. Reproduced in a browser: a lit square for today next to a streak
  of **0**. Both now come from one value, on `dashboard.html` and `progress.html`;
* on the degraded path the strip was rebuilt from `question_records ∪ exams`,
  which cannot see Focus Practice — so a Focus-only student got zero lit days
  beside "6 day streak". The strip is now **derived from the counter** there
  (a streak of N ending on `last_active_date` is exactly those N days), so the
  two halves of the card cannot contradict each other by construction.

### 1.10 One missing asset killing the whole dashboard

`dashboard.html` referenced `SiDay` unconditionally, so if `assets/streak.js`
failed to load the page died with "Could not load" — defeating the degradation
path written for exactly that case. It now falls back to a local helper.

### 1.11 The single source of truth, and the last raw reader

`study-planner-client.js` read `current_streak` straight from `profiles` to build
the AI planner's context. Since `chat.html` calls `updateStreak` *without*
awaiting it, a plan built moments after an answered question quoted a streak a
day behind — in generated prose the student reads. `streak.js` now publishes its
computed result (`getStreakSnapshot`, in-memory, keyed by user, bounded by age
**and** by the day it was computed for) and the planner prefers it.

**Consumer inventory — complete:**

| Consumer | Source | Status |
|---|---|---|
| `assets/streak.js` | the writer | authoritative |
| Dashboard counter | `updateStreak` result | ✅ |
| Weekly Progress strip | same result; derived from the counter when degraded | ✅ |
| Achievements | upserted inside the same run, from the same computation | ✅ |
| Progress page | `updateStreak` result | ✅ |
| Study Planner | `getStreakSnapshot`, column as fallback | ✅ |
| XP (`xp-updater.js`) | does not read streak at all | n/a |
| Mastery (`mastery-updater.js`) | does not read streak | n/a |
| Daily goals | **no such feature exists in the codebase** | n/a |

### 1.12 The exam countdown, same root cause

`assets/exam-days.js` was still Cairo-pinned, so "N days until your exam" was off
by one for non-Cairo students for part of every day — including reading
"1 days remaining" on the morning of the exam. Now uses the student's local day.

Its regression test asserted the *opposite* guarantee (device-timezone
independence) and, worse, was **vacuous**: it probed an instant at which all five
sampled zones fall on the same calendar date, so it could not have gone red
whatever the module did. Replaced with assertions at an instant where zones
genuinely disagree, verified to fail against the old implementation.

---

## 2. Problems that cannot be solved without the migration

These are not oversights. They are the residue of computing a per-student value
from a device-supplied timezone, and no amount of client logic removes them.

### 2.1 Two devices in different timezones disagree, and fight

The blocking one. A student with a phone on `Africa/Cairo` and a laptop on
`Europe/London` computes **different day splits from identical rows**. Both runs
are correct for their own zone, both hold the newest activity, so neither
staleness guard fires — the guards distinguish *stale* from *fresh*, and neither
of these is stale. Reproduced: a 10-day streak reads 10 on the phone and 1 on the
laptop, and the stored row is overwritten by whichever loaded last, thrashing
10/1/10/1 indefinitely.

**Why no client fix works.** To decide which zone is authoritative you must know
the student's zone. That is precisely the fact the schema does not record. Any
tie-break invented on the client — prefer the larger streak, prefer the most
recent write, prefer the first device seen — is a guess that is wrong for a
student who genuinely travelled, and "prefer the larger" is directly exploitable.

### 2.2 A travelling student loses their streak

Flying Cairo → New York shifts the boundary by 7 hours, which can split one local
day into two or merge two into one. The streak recomputes lower and, being the
only live view, persists. Only a stored zone makes the split a property of the
student rather than of the device in their hand.

### 2.3 DST transitions in a zone the student is not in

`SiDay`'s arithmetic is DST-exact (day keys are calendar dates, and day maths runs
on UTC-midnight epochs), and a student practising daily across a transition keeps
an unbroken streak **in their own zone**. What cannot be fixed is a device
reporting a *different* zone across the transition — that is 2.1 again, seasonal.

### 2.4 Self-inflation via client-writable columns

`current_streak`, `best_streak` and `last_active_date` are client-writable — they
must be, because the client computes them. Several guards therefore trust
client-writable data: the horizon fallback trusts `storedCurrent`, the best-streak
floor trusts `storedBest`. A student editing their own row can inflate their own
streak and mint achievements.

**This is not solved by the migration either.** It is only solved by computing the
streak server-side (an Edge Function or a Postgres function, with the columns
revoked from `authenticated`). Recorded here so the migration is not credited
with fixing it. Scope is bounded — a student can only inflate their own numbers,
there is no cross-user exposure and no billing impact.

---

## 3. The migration: benefit, risk, rollout

`supabase/migrations/20260804_profiles_timezone.sql` — **PREPARED, NOT APPLIED.**

```sql
alter table public.profiles add column if not exists timezone text;
-- + a shape CHECK, + grant update(timezone), insert(timezone) to authenticated
```

### Benefit

Exactly one thing, and it should be adopted for exactly that: it makes the day
boundary a property of the **student** instead of the device in their hand. That
closes 2.1, 2.2 and 2.3 — every remaining reproducible inconsistency other than
the self-inflation vector, which it explicitly does not address.

It is worth being precise about what it does *not* buy. It does not fix any bug
in §1; those are already fixed without it. It is an architectural correction,
not a patch — which is the whole reason for fixing §1 first.

### Risk

Low, and bounded by design:

* **`NULL` is the expected state and means "use the device zone"** — i.e. exactly
  today's behaviour. Nothing changes on apply, and there is no backfill.
* **Additive only.** No existing column is altered, no data rewritten, no
  behaviour changes until the client half ships.
* **The client half is deliberately unwritten.** Writing a column that does not
  exist would fail the `profiles-write-grants` CI gate, so code and schema cannot
  land out of order in the wrong direction.
* **`timezone` is not privileged.** It changes only where this student's own day
  boundaries fall. The CHECK constrains shape; `resolveTimeZone()` validates for
  real at read time via `Intl` and falls back safely on anything unusable.
* **Reversible.** `alter table … drop column timezone` restores the current state
  exactly, because every reader already treats absence as "use the device zone".

The one genuine risk is a **wrong stored zone** — a student who sets up on a
travelling device and never returns, permanently pinned to the wrong day
boundary. Mitigated by writing the zone back when it changes (below) and by it
being user-visible and correctable.

### Rollout

Four steps, each independently verifiable and revertible:

1. **Apply the migration.** Column arrives `NULL` everywhere; behaviour identical.
   Verify: nothing changes on any surface.
2. **Read it.** Pass `updateStreak(sb, uid, { timezone: prof.timezone })` from
   `dashboard.html` and `progress.html`. Still a no-op while every value is
   `NULL`. Verify: the existing suites stay green, and a manually populated test
   row makes both devices agree.
3. **Write it back.** Set the device zone when the stored one is `NULL`, or when
   it has genuinely changed, so values converge with no student action. Verify:
   the `profiles-write-grants` gate accepts `timezone`, and the two-device
   scenario from 2.1 stops thrashing.
4. **Surface it.** A timezone control in `settings.html`, defaulted from the
   device, so a student who travels can correct a wrong pin. Only after 1–3 are
   observed stable.

Steps 1–3 are what close §2. Step 4 is the safety valve for the one risk above.

### Recommendation

Apply it — but on the strength of §2, not §1. The logic bugs are fixed; what
remains is a fact the schema does not record, and no client code can infer it.
