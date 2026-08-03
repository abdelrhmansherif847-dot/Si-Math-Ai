# Daily Streak — investigation and fix, 2026-08-04

Reported: the streak occasionally breaks or resets for no reason; the new day
does not begin at 00:00 local; today's Weekly Progress square stays a
placeholder dot after practising just after midnight; Current Streak, Weekly
Progress and Achievements drift apart.

All four trace to **one decision plus two independent amplifiers**. Everything
below was measured against the shipped source or the live database, not
reasoned about.

---

## 1. Root cause — day keys were computed in a fixed foreign timezone

`assets/streak.js` pinned every day key to `Africa/Cairo` on every device, and
`dashboard.html` carried its own second copy of the same rule. Measured by
walking the shipped `streakDayKey` minute by minute, the day rolled over at
these **local** times:

| Student's zone | Summer | Winter |
|---|---|---|
| Africa/Cairo | 00:00 | 00:00 |
| Asia/Riyadh | 00:00 | **01:00** |
| Asia/Dubai | **01:00** | **02:00** |
| Asia/Tokyo | **06:00** | **07:00** |
| Europe/London | **22:00** (prev. day) | **22:00** (prev. day) |
| America/New_York | **17:00** (prev. day) | **17:00** (prev. day) |
| Pacific/Kiritimati | **11:00** | **12:00** |

Cairo observes DST, so the boundary also moved twice a year — Riyadh was correct
in summer and an hour late in winter, which is why the symptom came and went.

That single fact produces all three visible bugs:

**The streak breaks while the student practises every day.** Two consecutive
LOCAL days map to two NON-consecutive Cairo days whenever the sessions fall on
opposite sides of the Cairo boundary. Executed against the real function:

```
New York, Mon 13 Jul 15:00 local  ->  Cairo key 2026-07-13
New York, Tue 14 Jul 20:00 local  ->  Cairo key 2026-07-15   (Wednesday)
local days practised : 13, 14  -> consecutive, streak 2
Cairo keys stored    : 13, 15  -> gap on the 14th, streak 1
```

The wrong value was then **persisted** to `profiles.current_streak`.

**Today's square stays a dot.** A session at 00:30 in Dubai was filed under
yesterday, so `isDone` was false for today's cell and it rendered the `·`
placeholder — while the student had already practised.

**The new day starts late.** Directly from the table above.

### The fix

`SiDay` in `assets/streak.js` is now the single source of truth for what day it
is, resolving `preferred zone -> device zone -> Cairo (last resort only)`.
`dashboard.html`'s duplicate is deleted, and `updateStreak()` **returns** the
`timezone` and `today_key` it used so the strip is rendered in the frame the
counter was computed in — structurally, not by two copies agreeing.

It lives inside `streak.js` rather than its own file on purpose: two of the five
pages that load it (`mock-exam.html`, `focus.html`) are frozen and cannot be
given another `<script>` tag, so a separate module would have required a
duplicated fallback — the exact failure being removed.

Verified across `Africa/Cairo`, `Asia/Dubai`, `Asia/Riyadh`, `Europe/London`,
`America/New_York`, `Asia/Tokyo`, `Pacific/Kiritimati`, in both DST seasons:
every zone now rolls over at exactly **00:00 local**.

---

## 2. Amplifier — silent row-cap truncation could persist a 0

The three activity `SELECT`s had **no `ORDER BY` and no `LIMIT`**. PostgREST
truncates at `max-rows` (1000 here) **silently** — no error, just fewer rows —
and unordered, the rows it keeps are whatever the planner returned. A student
busy enough to cross the cap could therefore lose their most *recent* days,
which is precisely the set the backward walk needs, and `current_streak = 0`
would be written over a real streak.

Not hypothetical: the busiest account is at **755 rows** per 120-day window
against a 1000 cap, and climbing.

Fixed by ordering newest-first and capping explicitly, which makes truncation
cost only *old* history — and the within-window best-streak scan is already
floored by the stored `best_streak`.

---

## 3. Amplifier — a streak longer than the fetch window read as shorter

The walk can only see `STREAK_WINDOW_DAYS` (120) back. Running out of **data**
is not the same as finding a **gap**, but the old code treated them alike, so a
130-day streak would report 120 — a reset the student did not earn. The walk now
keeps the stored value when it reaches the window edge. A real gap *inside* the
window still breaks the streak, so the guard cannot mask a genuine reset.

---

## 4. The desync — counter and strip had different sources

`dashboard.html` read Current Streak from the `profiles` row (a separate round
trip, issued *after* `updateStreak` had already recomputed and written it) while
the strip beside it used the fresh computation. If the write had not landed, was
refused, or the read raced it, the two disagreed on screen — a lit square for
today next to a streak of 0. Reproduced in a browser and now fixed: both derive
from the single `updateStreak` result, with the stored row as fallback only.

On the bail path `updateStreak` returns the stored numbers it just read, so the
fallback is the same value either way and never renders a 0 the student did not
earn.

---

## 4b. The concurrent-write clobber — and a wrong call, corrected

This was first recorded as "low risk, two writers converge on the same answer".
Adversarial verification drove two overlapping `updateStreak` runs against one
shared row with a deterministic scheduler and reproduced the loss:

```
laptop reads activity — today's row not committed yet   -> computes 5
phone commits a question, recomputes, writes            -> 6
laptop's UPDATE lands last                              -> 5   (correct 6 gone)
```

**The premise was the error.** "Recomputed from immutable rows" makes a *repeat*
run idempotent; it says nothing about *concurrent* runs, because two runs
straddling a commit do not read the same rows. The module's own header asserted
the stronger claim ("refreshes, extra tabs and late-arriving rows are safe by
construction") — that sentence was the false guarantee the missing guard hid
behind, and it has been corrected in place rather than deleted.

The repo already had the precedent: `mock-exam.html` guards `profiles.xp` with a
compare-and-set retry loop whose comment names the second-tab scenario. The
streak write, on a sibling column of the same row, had none.

Fixed with **two** checks, because one is not enough:

* **Before the write** — if the stored `last_active_date` is newer than any day
  this run saw, a fresher recompute already ran; return its values and do not
  write. This covers a winner whose write landed *before* this run even read the
  profile, where the CAS guard would match and a blind retry would clobber.
* **On the write** — `.eq('current_streak', <value read>).select()`, retried up
  to four times. This covers a write landing *mid-run*.

`last_active_date` is the freshness yardstick rather than the streak number,
because a genuine break legitimately *lowers* the streak. A blanket
"only write if higher" rule would make a broken streak unpersistable; a run that
sees a real break holds the newest activity there is, so it still writes. Both
directions are pinned by test.

A losing run now also *returns* the stored truth with `skipped: true` instead of
its own stale number, so a page that lost the race still renders the right value.

**`progress.html` had the desync too** and is fixed the same way as the
dashboard: it awaited the recompute, then re-read `profiles` and rendered
`profile.current_streak` from that second round trip. It now renders from the
`updateStreak` result. (`study-planner-client.js` also reads `current_streak`
straight from `profiles` with no recompute, feeding it to the AI planner's
context — left alone, since it is a read for prompt context rather than a
rendered number, but noted as the remaining consumer of the raw column.)

## 5. Consistency guarantees, and their one limit

* **Refresh.** The streak is always RECOMPUTED from immutable activity rows,
  never incremented, so a repeat run over the same rows with the same zone can
  only produce the same answer. Pinned by test.
* **Second tab / overlapping runs.** Guarded by the two checks in §4b. Note this
  is a *separate* property from idempotence — conflating the two is what left it
  unguarded.
* **Delayed synchronisation.** `chat.html` now passes `activityToday` — the
  hint's documented purpose, which had no caller — but only when the server
  confirmed a `question_records` row for that turn. It must never be passed
  unconditionally: an unconditional "today is active" seed is what once made
  streaks climb on page views alone.
* **A read failure never overwrites a real streak.** Any failed activity source
  bails and returns the stored values untouched.
* **Second device — the one limit.** Two devices reporting DIFFERENT zones can
  still split days differently near a boundary. Closing that needs the student's
  zone stored rather than read from the device:
  `supabase/migrations/20260804_profiles_timezone.sql` is **PREPARED, NOT
  APPLIED** and needs approval. The client half is deliberately unshipped, since
  writing a column that does not exist would fail the `profiles-write-grants`
  gate. Until then the device zone is stable for any student who is not
  travelling, which is the case on any given day.

---

## 6. Related, found but NOT changed

* **`assets/exam-days.js` is still Cairo-pinned** (`EXAM_TZ`), so "N days until
  your exam" carries the same off-by-one for non-Cairo students — on
  `dashboard.html` that sits on the same screen as a now-local-midnight streak.
  Left alone deliberately: it is a different feature from the one reported, and
  `tests/exam-days.test.mjs` explicitly asserts device-timezone *independence*,
  so changing it inverts a stated guarantee and should be a decision, not a
  side effect of this fix.
* **`focus.html` `computeWeeklyStats` uses a device-local Monday** — a third day
  frame, disagreeing with both. The file is FROZEN.
* ~~`profiles.update` is last-writer-wins~~ — **fixed, see §4b.** This was first
  written off here as low risk "because the value is recomputed from source
  rows, so two writers converge". That reasoning is wrong and the claim was
  wrong: adversarial verification reproduced the clobber deterministically.
* **`chat.html`'s daily-usage counter uses a UTC day.** Correct as-is and
  deliberately not aligned: `consume_credits` enforces the quota with
  `date_trunc('day', now() AT TIME ZONE 'UTC')`, so the client matches the
  server. Quota days and streak days are different concepts.

---

## 7. Tests

Two new suites, executing the real shipped source. Both build their expected day
keys with an **independent** `Intl` call, so a bug in the module cannot make its
own tests agree with it.

* `tests/streak-timezone.test.mjs` (42 assertions) — rollover at local midnight
  in 7 zones × 2 DST seasons, 23:59/00:01 boundaries, the New York consecutive-
  days case, zone-resolution precedence and rejection of invalid zones, and
  calendar arithmetic across spring-forward, autumn-back, month, year and leap
  day.
* `tests/streak-rollover.test.mjs` (40 assertions) — first activity after
  midnight, consecutive days, missed days, all three activity sources, delayed
  sync with and without the hint, refresh and second-device idempotence, the
  ordered/capped reads, the window-edge guard (and that a real gap still
  breaks), and that counter, day-set and persisted write all agree.

`tests/streak.test.mjs` now states `FIXTURE_TZ = 'Africa/Cairo'` explicitly:
its fixtures are built at Cairo wall-clock hours, and that used to be implicit
in the module's global pin.

CI 30/30 green. `scripts/smoke-pages.mjs` 46/46 clean. A browser check across
five timezones confirms today's square lights on the correct **local** day with
the counter agreeing; run against the pre-fix code the same check lights the
**wrong day** in Dubai, Tokyo and Kiritimati and desyncs the counter in all five.
