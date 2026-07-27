// Streak writer — recomputes from question_records every call.
// Self-healing: backfills users whose history predates the Phase 2 deployment.
//
// Day boundaries are PINNED to Africa/Cairo (the product's audience), NOT the
// browser's local timezone. Relying on the device timezone made streaks
// non-deterministic: the same student on a Cairo device vs. a UTC/VPN device
// computed different day splits, so the stored current_streak flip-flopped
// between page loads (looked "stuck" / "wouldn't climb"). dashboard.html's
// heatmap consumes the `active_days` set this function returns, so the two
// surfaces read from one computation and can never disagree.
const STREAK_TZ = 'Africa/Cairo';
// Canonical day key: 'YYYY-MM-DD' in Cairo local time (en-CA gives ISO order).
function streakDayKey(d) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: STREAK_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
}
// Add N days to a 'YYYY-MM-DD' key without re-introducing timezone drift.
function streakKeyMinusDays(key, n) {
  const [y, m, d] = key.split('-').map(Number);
  const t = Date.UTC(y, m - 1, d) - n * 86400000;
  const back = new Date(t);
  const pad2 = x => String(x).padStart(2, '0');
  return back.getUTCFullYear() + '-' + pad2(back.getUTCMonth() + 1) + '-' + pad2(back.getUTCDate());
}
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
window.updateStreak = async function(sb, userId, opts) {
  try {
    const today = new Date();
    const todayStr = streakDayKey(today);
    const seedToday = !!(opts && opts.activityToday);

    // Pull the window's activity. Streak is recomputed from scratch each call.
    // Source = question_records ∪ exam_practice_sessions ∪ Focus Practice
    // completions — the same union the dashboard's Weekly Progress uses, so the
    // displays never disagree. Focus Practice was previously invisible to the
    // streak (it writes neither question_records nor exam sessions), which made
    // streaks stall for students practising only via Focus Practice.
    const since = new Date(today);
    since.setDate(since.getDate() - (STREAK_WINDOW_DAYS + 1));
    const [qrsRes, examsRes, plansRes] = await Promise.all([
      sb.from('question_records').select('created_at').eq('user_id', userId).gte('created_at', since.toISOString()),
      sb.from('exam_practice_sessions').select('created_at').eq('user_id', userId).gte('created_at', since.toISOString()),
      sb.from('focus_plans').select('id').eq('user_id', userId),
    ]);
    if (qrsRes.error)   console.warn('[streak] question_records fetch error:', qrsRes.error.message);
    if (examsRes.error) console.warn('[streak] exam_practice_sessions fetch error:', examsRes.error.message);
    if (plansRes.error) console.warn('[streak] focus_plans fetch error:', plansRes.error.message);

    // Read the stored streak up front: it is both the historical best_streak
    // floor and the value we fall back to when the recompute has no data to
    // stand on.
    const { data: profile, error: pErr } = await sb
      .from('profiles')
      .select('current_streak,best_streak')
      .eq('id', userId)
      .maybeSingle();
    if (pErr) console.warn('[streak] profile fetch error:', pErr.message);
    const storedCurrent = (profile && typeof profile.current_streak === 'number') ? profile.current_streak : 0;
    const storedBest    = (profile && typeof profile.best_streak    === 'number') ? profile.best_streak    : 0;

    // Bail out rather than write a wrong value. If BOTH primary activity
    // sources failed (offline, RLS hiccup, transient 5xx), the recompute would
    // see an empty history and persist current_streak = 0 — silently wiping a
    // legitimate streak on a page load that had nothing to do with practising.
    // Leave the stored row untouched and let the next call self-heal.
    if (qrsRes.error && examsRes.error) {
      console.warn('[streak] both activity sources failed — leaving stored streak untouched');
      return { current_streak: storedCurrent, best_streak: storedBest, active_days: [], skipped: true };
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
        .gte('completed_at', since.toISOString());
      if (focusRes.error) console.warn('[streak] focus_tasks fetch error:', focusRes.error.message);
    }

    // Build the set of Cairo-date strings the user was actually active.
    const dateSet = new Set();
    if (seedToday) dateSet.add(todayStr);
    (qrsRes.data   || []).forEach(r => { if (r && r.created_at)   dateSet.add(streakDayKey(new Date(r.created_at))); });
    (examsRes.data || []).forEach(r => { if (r && r.created_at)   dateSet.add(streakDayKey(new Date(r.created_at))); });
    (focusRes.data || []).forEach(r => { if (r && r.completed_at) dateSet.add(streakDayKey(new Date(r.completed_at))); });

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

    // Best streak across the window — longest consecutive run.
    // Map each Cairo day-key to a UTC-midnight epoch so consecutive-day math is
    // exact (no DST drift): keys are date-only, parsed as UTC.
    const sortedDates = Array.from(dateSet)
      .map(k => { const [y, m, d] = k.split('-').map(Number); return Date.UTC(y, m - 1, d); })
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

    const patch = { current_streak: current, best_streak: best };
    if (lastActive) patch.last_active_date = lastActive;
    const { error: uErr } = await sb.from('profiles').update(patch).eq('id', userId);
    if (uErr) console.warn('[streak] profile update error:', uErr.message);

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
    return { current_streak: current, best_streak: best, active_days: activeDays };
  } catch (err) {
    console.error('[streak-update-failed]', err?.message || err);
    return { current_streak: 0, best_streak: 0, active_days: [], skipped: true };
  }
};
