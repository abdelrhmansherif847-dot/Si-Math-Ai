/* ═══════════════════════════════════════════════════════════════════════════
 * SiDay — the single source of truth for "what day is it for this student".
 *
 * Every surface that splits activity into days derives its keys here: the
 * streak writer below, dashboard.html's Current Streak and Weekly Progress
 * strip, and the achievements those drive. It lives in THIS file, exported as
 * window.SiDay, rather than in its own script, because two of the five pages
 * that load assets/streak.js are frozen (mock-exam.html, focus.html) and
 * cannot be given an extra <script> tag. A second file would therefore either
 * break the streak on those pages or need a duplicated fallback — and a
 * duplicate is the exact failure this module exists to end.
 *
 * ── The day boundary is the STUDENT'S local midnight ────────────────────────
 *
 * It used to be pinned to Africa/Cairo on every device. That was deliberate:
 * it made the split deterministic when a student opened the app from devices
 * in different timezones. But it bought that determinism by moving the day
 * boundary off midnight for everyone outside Cairo, which is three bugs at
 * once, all reported from the field. Measured against the pinned code:
 *
 *   • The new day did not start at 00:00 local. Asia/Dubai rolled over at
 *     01:00 local in summer and 02:00 in winter; Asia/Tokyo 06:00/07:00;
 *     America/New_York 17:00 the day BEFORE. Cairo observes DST, so the offset
 *     also moved twice a year — Asia/Riyadh was correct in summer, an hour
 *     late in winter.
 *
 *   • Practising just after local midnight was filed under YESTERDAY, so
 *     today's square in Weekly Progress stayed a placeholder dot even though
 *     the student had already practised.
 *
 *   • The streak could break while the student practised every single day.
 *     Two consecutive LOCAL days map to two NON-consecutive Cairo days when
 *     the sessions fall on opposite sides of the Cairo boundary: New York,
 *     Mon 15:00 -> Cairo Mon; Tue 20:00 -> Cairo WED. Mon and Wed is a gap, so
 *     a real 2-day streak was recomputed as 1.
 *
 * resolveTimeZone() picks, in order:
 *   1. an explicitly supplied IANA zone — where a stored per-profile timezone
 *      plugs in (see the PREPARED migration adding profiles.timezone). Once
 *      that column exists and is populated, every device computes the same
 *      split for a student even if they travel, restoring the cross-device
 *      determinism the Cairo pin reached for WITHOUT moving the boundary off
 *      midnight.
 *   2. the device's own zone — the student's local midnight today.
 *   3. Africa/Cairo, only if the runtime cannot name a zone at all.
 *
 * Determinism: the streak is always RECOMPUTED from immutable activity rows,
 * never incremented, so re-running it over THE SAME ROWS for a given zone can
 * only produce the same answer. That makes a refresh idempotent.
 *
 * It does NOT make concurrent runs safe, and an earlier version of this comment
 * claimed it did. Two runs straddling a commit read DIFFERENT rows, so the one
 * that started earlier can finish later carrying a staler answer. The write
 * below is therefore a compare-and-set, not a blind update — see the reasoning
 * at the persist step.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';
  var FALLBACK_TZ = 'Africa/Cairo';   // last resort only, never a default

  function isValidTimeZone(tz) {
    if (!tz || typeof tz !== 'string') return false;
    try { new Intl.DateTimeFormat('en-CA', { timeZone: tz }); return true; }
    catch (e) { return false; }
  }
  function deviceTimeZone() {
    try {
      var tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      return isValidTimeZone(tz) ? tz : null;
    } catch (e) { return null; }
  }
  function resolveTimeZone(preferred) {
    if (isValidTimeZone(preferred)) return preferred;
    return deviceTimeZone() || FALLBACK_TZ;
  }
  /* 'YYYY-MM-DD' for the calendar day `date` falls on in `tz`. en-CA yields
     ISO ordering, so keys sort and compare as plain strings. */
  function dayKey(date, tz) {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: resolveTimeZone(tz),
      year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(date);
  }
  /* Day arithmetic runs on a UTC-midnight epoch built from the key's parts.
     Never on a local Date: adding 24h across a DST change lands on the wrong
     calendar day. */
  function keyToEpoch(key) {
    var p = String(key).split('-');
    return Date.UTC(+p[0], (+p[1]) - 1, +p[2]);
  }
  function epochToKey(t) {
    var d = new Date(t);
    var pad2 = function (n) { return String(n).padStart(2, '0'); };
    return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate());
  }
  function addDays(key, n) { return epochToKey(keyToEpoch(key) + n * 86400000); }
  function diffDays(a, b) { return Math.round((keyToEpoch(b) - keyToEpoch(a)) / 86400000); }

  root.SiDay = {
    FALLBACK_TZ: FALLBACK_TZ,
    isValidTimeZone: isValidTimeZone,
    deviceTimeZone: deviceTimeZone,
    resolveTimeZone: resolveTimeZone,
    dayKey: dayKey,
    keyToEpoch: keyToEpoch,
    epochToKey: epochToKey,
    addDays: addDays,
    diffDays: diffDays,
  };
}(typeof globalThis !== 'undefined' ? globalThis : this));

// Streak writer — recomputes from the activity tables every call.
// Self-healing: backfills users whose history predates the Phase 2 deployment.
//
// updateStreak RETURNS the timezone and today-key it used, so dashboard.html
// renders the Weekly Progress strip in exactly the frame the counter was
// computed in. That is what makes "one source of truth" structural rather than
// a coincidence of two copies agreeing.
const STREAK_DAY = SiDay;
// Canonical day key: 'YYYY-MM-DD' in the student's own timezone.
function streakDayKey(d, tz) { return STREAK_DAY.dayKey(d, tz); }
// Subtract N days from a 'YYYY-MM-DD' key. Calendar arithmetic, DST-exact.
function streakKeyMinusDays(key, n) { return STREAK_DAY.addDays(key, -n); }
// Window size for the recompute. 120 days of history, +1 day of slack so the
// oldest Cairo day in range is never half-truncated by the UTC lower bound
// (Cairo is UTC+2/+3, so a Cairo day starts before the matching UTC instant).
const STREAK_WINDOW_DAYS = 120;

// opts.activityToday — set by callers that invoke updateStreak immediately after
// writing an activity row, as a belt-and-braces hint that today counts even if
// the row is not yet visible to the follow-up SELECT. It is NOT required for
// correctness: every current call site awaits its write first, and the anchor
// rule below keeps a live streak intact for a full day regardless. It must
// never default to true — an unconditional "today is active" seed is what made
// streaks climb on page views alone and then collapse a day or two later.
/* The most recent computed result, for consumers that need the streak but have
 * no reason to trigger a recompute of their own.
 *
 * The alternative for such a consumer is reading profiles.current_streak
 * directly, which is the raw column the recompute WRITES — so it is stale for
 * exactly as long as the write is in flight, and chat.html deliberately does
 * not await updateStreak. A reader firing in that window sees the previous
 * value. Publishing the computed result gives them the same number every other
 * surface is showing, with the column as fallback.
 *
 * Keyed by user id so a session change cannot serve the previous student's
 * streak. Deliberately in-memory only: persisting it would create a second
 * durable copy of a value whose whole problem was having more than one.
 */
function publish(userId, result) {
  try {
    if (typeof window === 'undefined') return;
    window.__siStreak = { userId: userId, at: Date.now(), result: result };
  } catch (e) { /* non-browser host — the cache is an optimisation, not a contract */ }
}

// The published result for `userId`, or null. Callers MUST treat null as "ask
// the database" rather than as "no streak".
window.getStreakSnapshot = function (userId) {
  var c = (typeof window !== 'undefined') ? window.__siStreak : null;
  if (!c || !c.result || (userId && c.userId !== userId)) return null;
  return c.result;
};

// opts.timezone — an explicit IANA zone for this student, when the caller has
// one (e.g. a stored profile preference). Omitted, the student's device zone is
// used. Resolved ONCE per call and threaded through every key computation
// below, so a single run can never mix two frames.
window.updateStreak = async function(sb, userId, opts) {
  try {
    const tz = STREAK_DAY.resolveTimeZone(opts && opts.timezone);
    const today = new Date();
    const todayStr = streakDayKey(today, tz);
    const seedToday = !!(opts && opts.activityToday);

    // Pull the window's activity. Streak is recomputed from scratch each call.
    // Source = question_records ∪ exam_practice_sessions ∪ Focus Practice
    // completions — the same union the dashboard's Weekly Progress uses, so the
    // displays never disagree. Focus Practice was previously invisible to the
    // streak (it writes neither question_records nor exam sessions), which made
    // streaks stall for students practising only via Focus Practice.
    const since = new Date(today);
    since.setDate(since.getDate() - (STREAK_WINDOW_DAYS + 1));
    // ORDER BY created_at DESC + an explicit LIMIT on every activity read.
    //
    // These were unordered and unlimited. PostgREST caps a response at
    // `max-rows` (1000 on this project) and truncates SILENTLY — no error, just
    // fewer rows — and without an ORDER BY the rows it keeps are whatever the
    // planner returned. A student busy enough to cross the cap could therefore
    // lose their most RECENT days, which is precisely the set the backward walk
    // needs, and line ~"const patch" below would then persist current_streak = 0
    // over a real streak. The busiest account is already at ~755 rows per
    // window, so this was a live account away from firing.
    //
    // Newest-first ordering makes truncation harmless for the current streak:
    // what gets dropped is the OLDEST history, which only bounds the
    // within-window best-streak scan — and best_streak is floored by the stored
    // value below, so nothing is lost there either.
    const ROW_CAP = 1000;
    const [qrsRes, examsRes, plansRes] = await Promise.all([
      sb.from('question_records').select('created_at').eq('user_id', userId)
        .gte('created_at', since.toISOString()).order('created_at', { ascending: false }).limit(ROW_CAP),
      sb.from('exam_practice_sessions').select('created_at').eq('user_id', userId)
        .gte('created_at', since.toISOString()).order('created_at', { ascending: false }).limit(ROW_CAP),
      sb.from('focus_plans').select('id').eq('user_id', userId).limit(ROW_CAP),
    ]);
    if (qrsRes.error)   console.warn('[streak] question_records fetch error:', qrsRes.error.message);
    if (examsRes.error) console.warn('[streak] exam_practice_sessions fetch error:', examsRes.error.message);
    if (plansRes.error) console.warn('[streak] focus_plans fetch error:', plansRes.error.message);

    // Read the stored streak up front: it is both the historical best_streak
    // floor and the value we fall back to when the recompute has no data to
    // stand on.
    const { data: profile, error: pErr } = await sb
      .from('profiles')
      .select('current_streak,best_streak,last_active_date')
      .eq('id', userId)
      .maybeSingle();
    if (pErr) console.warn('[streak] profile fetch error:', pErr.message);
    const storedCurrent = (profile && typeof profile.current_streak === 'number') ? profile.current_streak : 0;
    const storedBest    = (profile && typeof profile.best_streak    === 'number') ? profile.best_streak    : 0;
    // The newest day any previous run recorded. This is the freshness yardstick
    // the persist step measures our own view against.
    const storedLastActive = (profile && profile.last_active_date)
      ? String(profile.last_active_date).slice(0, 10) : null;

    // Bail out rather than write a wrong value. If ANY activity source failed
    // (offline, RLS hiccup, transient 5xx), the recompute sees a partial history
    // and can persist a current_streak that is too low — or 0 — on a page load
    // that had nothing to do with practising. Leave the stored row untouched and
    // let the next call self-heal.
    //
    // This used to require BOTH primary sources to fail, which missed the common
    // case: a student's activity lives in ONE source (chat-only students are
    // entirely in question_records, Focus-only students entirely in focus_tasks),
    // so losing just that source wiped the streak while the other returned an
    // empty-but-successful result.
    if (qrsRes.error || examsRes.error || plansRes.error) {
      console.warn('[streak] an activity source failed — leaving stored streak untouched');
      return { current_streak: storedCurrent, best_streak: storedBest, active_days: [],
               timezone: tz, today_key: todayStr, skipped: true };
    }

    // focus_tasks has no user_id column — resolve the user's plan ids first,
    // then their DONE tasks in the window via focus_tasks.completed_at.
    let focusRes = { data: [] };
    const planIds = (plansRes.data || []).map(p => p.id).filter(Boolean);
    if (planIds.length) {
      focusRes = await sb.from('focus_tasks')
        .select('completed_at')
        .in('plan_id', planIds)
        .eq('status', 'DONE')
        .gte('completed_at', since.toISOString())
        .order('completed_at', { ascending: false })   // same truncation reasoning
        .limit(ROW_CAP);
      if (focusRes.error) {
        // Same reasoning as the guard above: a Focus-only student's entire
        // history is in this table, so a failed read must not be treated as
        // "no activity".
        console.warn('[streak] focus_tasks fetch failed — leaving stored streak untouched');
        return { current_streak: storedCurrent, best_streak: storedBest, active_days: [],
                 timezone: tz, today_key: todayStr, skipped: true };
      }
    }

    // Build the set of Cairo-date strings the user was actually active.
    const dateSet = new Set();
    if (seedToday) dateSet.add(todayStr);
    (qrsRes.data   || []).forEach(r => { if (r && r.created_at)   dateSet.add(streakDayKey(new Date(r.created_at), tz)); });
    (examsRes.data || []).forEach(r => { if (r && r.created_at)   dateSet.add(streakDayKey(new Date(r.created_at), tz)); });
    (focusRes.data || []).forEach(r => { if (r && r.completed_at) dateSet.add(streakDayKey(new Date(r.completed_at), tz)); });

    // Anchor the walk. A streak stays alive for the whole of the day AFTER the
    // last activity — practising yesterday and opening the app this morning
    // must not read as 0 and then jump back to N after the first question.
    // Anchor = today when active today, else yesterday when active yesterday,
    // else the streak is genuinely broken.
    const yesterdayStr = streakKeyMinusDays(todayStr, 1);
    let cursorKey = null;
    if (dateSet.has(todayStr))          cursorKey = todayStr;
    else if (dateSet.has(yesterdayStr)) cursorKey = yesterdayStr;

    // Walk backward from the anchor: consecutive days = current streak.
    let current = 0;
    while (cursorKey && dateSet.has(cursorKey)) {
      current += 1;
      cursorKey = streakKeyMinusDays(cursorKey, 1);
    }

    // The walk can only see as far back as the fetch window (or the row cap).
    // If it consumed every day it had and ran out of data rather than finding a
    // genuine gap, the streak is AT LEAST `current` — it is not evidence that
    // it ended there. Reporting the truncated number would hand a student on a
    // 130-day streak a sudden drop to 120, i.e. exactly the "reset for no
    // reason" being investigated. Trust the stored value in that case; a real
    // break always shows up as a missing day INSIDE the window, which this
    // guard cannot mask because the walk stops before reaching the edge.
    const oldestLoadedKey = streakKeyMinusDays(todayStr, STREAK_WINDOW_DAYS);
    const hitWindowEdge = current > 0 && cursorKey && cursorKey <= oldestLoadedKey;
    if (hitWindowEdge && storedCurrent > current) current = storedCurrent;

    // Best streak across the window — longest consecutive run.
    // Map each Cairo day-key to a UTC-midnight epoch so consecutive-day math is
    // exact (no DST drift): keys are date-only, parsed as UTC.
    const sortedDates = Array.from(dateSet)
      .map(k => STREAK_DAY.keyToEpoch(k))
      .sort((a, b) => a - b);
    let best = 0, run = 0, prev = null;
    const DAY_MS = 86400000;
    for (const t of sortedDates) {
      if (prev !== null && (t - prev) === DAY_MS) run += 1;
      else run = 1;
      if (run > best) best = run;
      prev = t;
    }
    // best_streak is a high-water mark: never below the live streak, and never
    // below what the profile already recorded (covers achievements earned
    // before this window, and history older than STREAK_WINDOW_DAYS).
    best = Math.max(best, current, storedBest);

    // last_active_date is the most recent day with real activity — not "now".
    // Stamping today on every call made it report a practice day for students
    // who had merely opened the dashboard.
    const activeDays = Array.from(dateSet).sort();
    const lastActive = activeDays.length ? activeDays[activeDays.length - 1] : null;

    // Compare-and-set, following the precedent mock-exam.html already sets for
    // profiles.xp. The write used to be a blind `.update(patch).eq('id', ...)`,
    // so two overlapping recomputes resolved by whichever HTTP response landed
    // last rather than by whichever read was fresher:
    //
    //   laptop reads activity  — today's row not committed yet     -> computes 5
    //   phone commits a question, recomputes, writes               -> 6
    //   laptop's UPDATE lands last                                 -> 5  (wrong)
    //
    // "The streak is recomputed from immutable rows, so concurrent runs agree"
    // is a FALSE premise, and it is why this went unguarded: two runs straddling
    // a commit do not read the same rows, so idempotence says nothing about
    // concurrency. Reproduced deterministically before fixing.
    //
    // Losing the race must NOT simply mean "retry and overwrite" either: a
    // genuine break legitimately LOWERS the streak, so a blanket
    // only-write-if-higher rule would make a broken streak unpersistable.
    // last_active_date is the freshness signal that separates the two cases. A
    // stale run is stale precisely because it missed recent activity, so its
    // newest active day is OLDER than the winner's. A run that sees a real
    // break has the newest active day there is, so it still writes.
    // "Is that row's view of the world newer than mine?" — true when it records
    // activity on a day later than the newest day I could see.
    const newerThanMine = (theirLastActive) => {
      if (!theirLastActive) return false;
      const theirs = String(theirLastActive).slice(0, 10);
      return !lastActive || theirs > lastActive;
    };

    // Checked BEFORE the CAS, not only when it fails. A run can be stale and
    // still hold a matching guard — the winner's write may land before this run
    // even reads the profile, in which case the guard matches the value the
    // winner just stored and a blind retry would happily overwrite it. The
    // guard covers writes landing MID-run; this covers writes that landed
    // BEFORE it. Both are needed.
    if (newerThanMine(storedLastActive)) {
      console.warn('[streak] stored row reflects newer activity than this run saw — not writing');
      return { current_streak: storedCurrent, best_streak: storedBest, active_days: activeDays,
               timezone: tz, today_key: todayStr, skipped: true };
    }

    let guardCurrent = storedCurrent;
    let persisted = false;
    for (let attempt = 0; attempt < 4 && !persisted; attempt++) {
      const patch = { current_streak: current, best_streak: best };
      if (lastActive) patch.last_active_date = lastActive;
      const { data: won, error: uErr } = await sb.from('profiles')
        .update(patch)
        .eq('id', userId)
        .eq('current_streak', guardCurrent)
        .select('id');
      if (uErr) { console.warn('[streak] profile update error:', uErr.message); break; }
      if (won && won.length) { persisted = true; break; }

      // Zero rows: someone wrote between our read and now. Re-read and decide.
      const { data: fresh, error: rErr } = await sb.from('profiles')
        .select('current_streak,best_streak,last_active_date')
        .eq('id', userId)
        .maybeSingle();
      if (rErr || !fresh) { console.warn('[streak] CAS re-read failed — leaving the winner in place'); break; }
      if (newerThanMine(fresh.last_active_date)) {
        // The other run saw activity we did not. Its answer is the fresher one.
        console.warn('[streak] a fresher recompute won the race — not overwriting');
        break;
      }
      if (fresh.current_streak === current && fresh.best_streak >= best) { persisted = true; break; }
      guardCurrent = fresh.current_streak;   // retry against what is there now
    }

    const streakAchievements = [];
    if (current >= 7) {
      streakAchievements.push({
        user_id: userId, achievement_key: 'streak_7',
        name: '7-Day Streak', description: 'Practiced for 7 days in a row.',
        earned_at: new Date().toISOString(),
      });
    }
    if (current >= 30) {
      streakAchievements.push({
        user_id: userId, achievement_key: 'streak_30',
        name: '30-Day Streak', description: 'Practiced for 30 consecutive days.',
        earned_at: new Date().toISOString(),
      });
    }
    if (best >= 14) {
      streakAchievements.push({
        user_id: userId, achievement_key: 'consistency_champion',
        name: 'Consistency Champion', description: 'Maintained a streak of 14+ days.',
        earned_at: new Date().toISOString(),
      });
    }
    for (const ach of streakAchievements) {
      await sb.from('achievements').upsert(ach, {
        onConflict: 'user_id,achievement_key',
        ignoreDuplicates: true,
      });
    }

    // active_days: Cairo day-keys, ascending. dashboard.html renders its weekly
    // heatmap from this instead of re-querying, so the heatmap and the streak
    // counter are derived from one set by construction.
    // timezone + today_key travel with the day-set so every consumer renders in
    // the frame this computation used, instead of re-deriving "today" from its
    // own copy of the rules and hoping the two agree.
    const result = { current_streak: current, best_streak: best, active_days: activeDays,
                     timezone: tz, today_key: todayStr };
    publish(userId, result);
    return result;
  } catch (err) {
    console.error('[streak-update-failed]', err?.message || err);
    // skipped:true — the caller must fall back to the stored streak rather than
    // render 0, which would look like a reset the student did not earn.
    return { current_streak: 0, best_streak: 0, active_days: [], skipped: true };
  }
};
