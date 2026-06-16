window.updateStreak = async function(sb, userId) {
  try {
    const { data: profile } = await sb
      .from('profiles')
      .select('current_streak, best_streak, last_active_date')
      .eq('id', userId)
      .single();

    const today = new Date();
    const todayISO = today.toISOString().slice(0, 10);
    const todayStr = today.toDateString();

    const lastDate = profile?.last_active_date;

    if (lastDate) {
      const lastStr = new Date(lastDate + 'T12:00:00').toDateString();
      if (lastStr === todayStr) {
        return {
          current_streak: profile.current_streak ?? 0,
          best_streak: profile.best_streak ?? 0,
        };
      }
    }

    let current = profile?.current_streak ?? 0;
    let best = profile?.best_streak ?? 0;

    if (lastDate) {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = yesterday.toDateString();
      const lastStr = new Date(lastDate + 'T12:00:00').toDateString();
      if (lastStr === yesterdayStr) {
        current = current + 1;
      } else {
        current = 1;
      }
    } else {
      current = 1;
    }

    if (current > best) best = current;

    await sb.from('profiles').update({
      current_streak:   current,
      best_streak:      best,
      last_active_date: todayISO,
    }).eq('id', userId);

    const streakAchievements = [];
    if (current >= 7) {
      streakAchievements.push({
        user_id: userId,
        achievement_key: 'streak_7',
        name: '7-Day Streak',
        description: 'Practiced for 7 days in a row.',
        earned_at: new Date().toISOString(),
      });
    }
    if (current >= 30) {
      streakAchievements.push({
        user_id: userId,
        achievement_key: 'streak_30',
        name: '30-Day Streak',
        description: 'Practiced for 30 consecutive days.',
        earned_at: new Date().toISOString(),
      });
    }
    if (best >= 14) {
      streakAchievements.push({
        user_id: userId,
        achievement_key: 'consistency_champion',
        name: 'Consistency Champion',
        description: 'Maintained a streak of 14+ days.',
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
