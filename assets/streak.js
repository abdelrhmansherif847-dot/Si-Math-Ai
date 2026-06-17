// Streak writer — recomputes from question_records every call.
// Self-healing: backfills users whose history predates the Phase 2 deployment.
// Uses browser local date for day boundaries (approved Strategy B).
window.updateStreak = async function(sb, userId) {
  try {
    const today = new Date();
    const todayStr = today.toDateString();
    const pad2 = n => String(n).padStart(2, '0');
    const todayLocalISO = today.getFullYear() + '-' + pad2(today.getMonth() + 1) + '-' + pad2(today.getDate());

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
    (qrsRes.data   || []).forEach(r => { if (r && r.created_at) dateSet.add(new Date(r.created_at).toDateString()); });
    (examsRes.data || []).forEach(r => { if (r && r.created_at) dateSet.add(new Date(r.created_at).toDateString()); });

    // Walk backward from today: consecutive days = current streak.
    let current = 0;
    const cursor = new Date(today); cursor.setHours(0, 0, 0, 0);
    while (dateSet.has(cursor.toDateString())) {
      current += 1;
      cursor.setDate(cursor.getDate() - 1);
    }

    // Best streak across the window — longest consecutive run.
    const sortedDates = Array.from(dateSet)
      .map(s => { const d = new Date(s); d.setHours(0, 0, 0, 0); return d.getTime(); })
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
