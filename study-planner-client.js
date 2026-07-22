/**
 * study-planner-client.js — Phase 2 platform adapter for the Study Planner.
 *
 * The engine (study-planner.core.js / window.StudyPlanner) is PURE. This module
 * is its I/O boundary: it reads the student's real learning data from Supabase
 * into the engine's `StudentLearningState`, and persists generated plans. Zero
 * Chat (chat.html) orchestrates: charge credits → gatherStudentState →
 * StudyPlanner.buildStudyPlan → saveStudyPlan → render.
 *
 * Every data source is fault-tolerant: a missing table or a query error yields
 * a safe empty default rather than throwing, so a partial platform (or the
 * pre-migration state before `study_plans` exists) still produces a plan from
 * whatever data is available. The engine tolerates missing sections by design.
 *
 * Reads (all RLS-scoped to the signed-in user):
 *   profiles              → student profile + progress + availability
 *   weakness_reports      → ranked weaknesses (analyzer SSOT)
 *   focus_plans/tasks     → active Focus plans + their remaining units
 *   exam_practice_sessions+ exam_mistakes → recent mocks + weak lessons
 *   weakness_signals      → AI-tutor confusion (source='AI_CHAT')
 * Writes:
 *   study_plans           → the generated plan + signature (for regen checks)
 *
 * UMD: window.StudyPlannerClient in the browser, module.exports in Node (tests
 * pass a mock supabase client).
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.StudyPlannerClient = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var WINDOW_DAYS = 90;               // recency window for signals/mocks/mistakes
  var MS_PER_DAY = 24 * 60 * 60 * 1000;
  var PLANNER_VERSION_FALLBACK = 'study-planner-v1';

  function num(n, d) { return (typeof n === 'number' && isFinite(n)) ? n : (d == null ? null : d); }
  function str(x) { return typeof x === 'string' ? x : ''; }
  function arr(x) { return Array.isArray(x) ? x : []; }
  function keyOf(t, s) { return str(t).trim().toLowerCase() + '||' + str(s).trim().toLowerCase(); }

  /** Await a Supabase query, returning [] on any error so gather never throws. */
  async function rows(promise, tag) {
    try {
      var res = await promise;
      if (res && res.error) { warn(tag, res.error); return []; }
      return (res && res.data) || [];
    } catch (e) { warn(tag, e); return []; }
  }
  function warn(tag, e) {
    try { console.warn('[study-planner-client] ' + tag + ' unavailable:', (e && e.message) || e); } catch (_) {}
  }

  /* ── Loaders (each degrades to a safe default) ─────────────────────────────── */

  async function loadProfile(sb, userId) {
    // Only columns known to exist across the live schema. `study_availability`
    // is intentionally NOT selected (it may not exist pre-migration); the chat
    // supplies availability via opts instead.
    try {
      var res = await sb.from('profiles')
        .select('full_name, exam_type, exam_date, target_score, xp, rank_name, current_streak')
        .eq('id', userId).single();
      if (res && res.error) { warn('profiles', res.error); return {}; }
      return res.data || {};
    } catch (e) { warn('profiles', e); return {}; }
  }

  async function loadWeakness(sb, userId) {
    var data = await rows(
      sb.from('weakness_reports').select('*').eq('user_id', userId).order('priority_rank', { ascending: true }),
      'weakness_reports');
    return data.map(function (w) {
      return {
        topic: str(w.topic), subtopic: str(w.subtopic),
        masteryScore: num(w.mastery_score), weaknessScore: num(w.weakness_score),
        severityBand: str(w.severity_band) || null, trend: w.trend || null,
        recent7: num(w.recent7_count, 0), recent14: num(w.recent14_count, 0),
        priorityRank: num(w.priority_rank), totalSignals: num(w.total_signals, 0),
        lastUpdatedAt: w.last_updated || w.last_signal_at || null,
      };
    });
  }

  async function loadFocus(sb, userId) {
    var plans = await rows(
      sb.from('focus_plans').select('id, title, status, dominant_signal')
        .eq('user_id', userId).eq('status', 'ACTIVE'),
      'focus_plans');
    if (!plans.length) return [];
    var planIds = plans.map(function (p) { return p.id; });
    var tasks = await rows(
      sb.from('focus_tasks')
        .select('id, plan_id, topic, subtopic, task_title, priority, estimated_minutes, status')
        .in('plan_id', planIds).is('archived_at', null).order('priority', { ascending: true }),
      'focus_tasks');
    var byPlan = {};
    tasks.forEach(function (t) { (byPlan[t.plan_id] = byPlan[t.plan_id] || []).push(t); });
    return plans.map(function (p) {
      var units = (byPlan[p.id] || []).map(function (t, i) {
        return {
          id: str(t.id), title: str(t.task_title) || ('Unit ' + (i + 1)),
          topic: str(t.topic), subtopic: str(t.subtopic),
          order: num(t.priority, i), status: str(t.status) || 'NOT_STARTED',
          estimatedMinutes: num(t.estimated_minutes, 20),
        };
      });
      return {
        id: str(p.id), title: str(p.title) || 'Focus Plan', status: str(p.status) || 'ACTIVE',
        dominantSignal: p.dominant_signal || null, lessons: units,
      };
    });
  }

  async function loadMocks(sb, userId, sinceISO) {
    // Column names verified against the live schema (2026-07-21):
    // exam_practice_sessions → correct_answers/wrong_answers/omitted_answers,
    // total_questions, score, created_at/ended_at; exam_mistakes → topic,
    // subtopic, session_id, mistake_count.
    var sessions = await rows(
      sb.from('exam_practice_sessions').select('*').eq('user_id', userId).gte('created_at', sinceISO),
      'exam_practice_sessions');
    var mistakes = await rows(
      sb.from('exam_mistakes').select('topic, subtopic, session_id, mistake_count').eq('user_id', userId).gte('created_at', sinceISO),
      'exam_mistakes');
    // weakLessons per session, aggregated by concept (summing mistake_count).
    var bySession = {};
    mistakes.forEach(function (m) {
      var s = str(m.session_id); if (!s) return;
      var k = keyOf(m.topic, m.subtopic);
      var slot = (bySession[s] = bySession[s] || {});
      slot[k] = slot[k] || { topic: str(m.topic), subtopic: str(m.subtopic), missCount: 0 };
      slot[k].missCount += (num(m.mistake_count, 1) || 1);
    });
    return sessions.map(function (s) {
      var byK = bySession[str(s.id)];
      var wl = byK ? Object.keys(byK).map(function (k) { return byK[k]; }) : [];
      return {
        id: str(s.id),
        completedAt: s.ended_at || s.created_at || null,
        score: num(s.score),
        totalQuestions: num(s.total_questions),
        correct: num(s.correct_answers),
        avgSecondsPerQuestion: null,                 // not stored; engine tolerates
        hadTimePressure: num(s.omitted_answers, 0) > 0,
        weakLessons: wl,
      };
    });
  }

  async function loadTutor(sb, userId, sinceISO) {
    // AI-tutor confusion from chat-sourced weakness signals.
    var signals = await rows(
      sb.from('weakness_signals').select('topic, subtopic, signal_type')
        .eq('user_id', userId).eq('source', 'AI_CHAT').gte('created_at', sinceISO),
      'weakness_signals');
    var by = {};
    signals.forEach(function (g) {
      var k = keyOf(g.topic, g.subtopic);
      var slot = by[k] || (by[k] = { topic: str(g.topic), subtopic: str(g.subtopic), askCount: 0, explanationRepeats: 0, deepExplains: 0 });
      slot.askCount++;
      var t = str(g.signal_type);
      if (t === 'explanation_repeated') slot.explanationRepeats++;
      else if (t === 'deep_explanation') slot.deepExplains++;
    });
    return { topics: Object.keys(by).map(function (k) { return by[k]; }) };
  }

  /* ── Public: gather ────────────────────────────────────────────────────────── */

  async function gatherStudentState(sb, userId, opts) {
    opts = opts || {};
    var now = num(opts.now) || Date.now();
    var sinceISO = new Date(now - (num(opts.windowDays) || WINDOW_DAYS) * MS_PER_DAY).toISOString();

    var results = await Promise.all([
      loadProfile(sb, userId),
      loadWeakness(sb, userId),
      loadFocus(sb, userId),
      loadMocks(sb, userId, sinceISO),
      loadTutor(sb, userId, sinceISO),
    ]);
    var profile = results[0], weakness = results[1], focus = results[2], mocks = results[3], tutor = results[4];

    var fullName = str(profile.full_name);
    return {
      now: now,
      student: {
        id: str(userId),
        name: fullName.trim().split(/\s+/)[0] || 'Student',
        examType: str(profile.exam_type) || 'SAT',
        examDate: profile.exam_date || null,
        targetScore: num(profile.target_score),
        xp: num(profile.xp, 0),
        rank: str(profile.rank_name) || null,
        currentStreak: num(profile.current_streak, 0),
        // Availability is asked in chat (opts) — not stored server-side yet.
        availability: opts.availability || null,
      },
      examImportance: opts.examImportance || null,
      weakness: weakness,
      focus: focus,
      mocks: mocks,
      tutor: tutor,
      progress: { xp: num(profile.xp, 0), rank: str(profile.rank_name) || null },
    };
  }

  /* ── Public: persistence ───────────────────────────────────────────────────── */

  /**
   * saveStudyPlan — supersede the current plan and insert the new one. Returns
   * { persisted:boolean, reason? }. Never throws (persistence is best-effort so
   * a missing study_plans table pre-migration doesn't break generation).
   */
  async function saveStudyPlan(sb, userId, plan, signature, creditsCharged) {
    try {
      await sb.from('study_plans').update({ superseded_at: new Date().toISOString() })
        .eq('user_id', userId).is('superseded_at', null);
      var res = await sb.from('study_plans').insert({
        user_id: userId,
        planner_version: (plan && plan.version) || PLANNER_VERSION_FALLBACK,
        plan_json: plan,
        plan_signature: signature || null,
        credits_charged: num(creditsCharged, 20),
      }).select('id').single();
      if (res && res.error) { warn('study_plans insert', res.error); return { persisted: false, reason: res.error.message }; }
      return { persisted: true, id: res && res.data && res.data.id };
    } catch (e) { warn('study_plans insert', e); return { persisted: false, reason: (e && e.message) || 'error' }; }
  }

  /** getLatestStudyPlan — the current (non-superseded) plan, or null. */
  async function getLatestStudyPlan(sb, userId) {
    try {
      var res = await sb.from('study_plans')
        .select('id, plan_json, plan_signature, generated_at, planner_version')
        .eq('user_id', userId).is('superseded_at', null)
        .order('generated_at', { ascending: false }).limit(1).maybeSingle();
      if (res && res.error) { warn('study_plans read', res.error); return null; }
      return (res && res.data) || null;
    } catch (e) { warn('study_plans read', e); return null; }
  }

  return {
    gatherStudentState: gatherStudentState,
    saveStudyPlan: saveStudyPlan,
    getLatestStudyPlan: getLatestStudyPlan,
    WINDOW_DAYS: WINDOW_DAYS,
    // exposed for tests
    _loaders: { loadProfile: loadProfile, loadWeakness: loadWeakness, loadFocus: loadFocus, loadMocks: loadMocks, loadTutor: loadTutor },
  };
}));
