// Streak writer — recomputes from question_records every call.
// Self-healing: backfills users whose history predates the Phase 2 deployment.
//
// Day boundaries are PINNED to Africa/Cairo (the product's audience), NOT the
// browser's local timezone. Relying on the device timezone made streaks
// non-deterministic: the same student on a Cairo device vs. a UTC/VPN device
// computed different day splits, so the stored current_streak flip-flopped
// between page loads (looked "stuck" / "wouldn't climb"). dashboard.html's
// heatmap uses the identical Cairo day-key so the two never disagree.
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
window.updateStreak = async function(sb, userId) {
  try {
    const today = new Date();
    const todayStr = streakDayKey(today);
    const todayLocalISO = todayStr;

    // Pull 120 days of activity. Streak is recomputed from scratch each call.
    // Source = question_records ∪ exam_practice_sessions — same union the
    // dashboard's Weekly Progress uses, so the two displays never disagree.
    const since = new Date(today); since.setDate(since.getDate() - 120);
    const [qrsRes, examsRes] = await Promise.all([
      sb.from('question_records').select('created_at').eq('user_id', userId).gte('created_at', since.toISOString()),
      sb.from('exam_practice_sessions').select('created_at').eq('user_id', userId).gte('created_at', since.toISOString()),
    ]);
    if (qrsRes.error)   console.warn('[streak] question_records fetch error:', qrsRes.error.message);
    if (examsRes.error) console.warn('[streak] exam_practice_sessions fetch error:', examsRes.error.message);

    // Build the set of local-date strings the user was active. Always include
    // today — caller invokes updateStreak right after a successful interaction,
    // and the current row may not be visible yet to the query.
    const dateSet = new Set([todayStr]);
    (qrsRes.data   || []).forEach(r => { if (r && r.created_at) dateSet.add(streakDayKey(new Date(r.created_at))); });
    (examsRes.data || []).forEach(r => { if (r && r.created_at) dateSet.add(streakDayKey(new Date(r.created_at))); });

    // Walk backward from today: consecutive days = current streak.
    let current = 0;
    let cursorKey = todayStr;
    while (dateSet.has(cursorKey)) {
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

    // Preserve historical best_streak if larger (covers older achievements).
    const { data: profile, error: pErr } = await sb
      .from('profiles')
      .select('best_streak')
      .eq('id', userId)
      .maybeSingle();
    if (pErr) console.warn('[streak] profile fetch error:', pErr.message);
    if (profile && typeof profile.best_streak === 'number' && profile.best_streak > best) {
      best = profile.best_streak;
    }

    const { error: uErr } = await sb.from('profiles').update({
      current_streak:   current,
      best_streak:      best,
      last_active_date: todayLocalISO,
    }).eq('id', userId);
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

    return { current_streak: current, best_streak: best };
  } catch (err) {
    console.error('[streak-update-failed]', err?.message || err);
    return { current_streak: 0, best_streak: 0 };
  }
};
