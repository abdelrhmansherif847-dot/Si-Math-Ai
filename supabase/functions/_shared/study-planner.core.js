/**
 * study-planner.core.js — Zero Personalized Study Planner ENGINE (independent).
 *
 * This is the dedicated planning engine described in the "Zero Personalized
 * Study Planner" RFC. It is deliberately a PURE, I/O-free, deterministic module
 * so it can be reused by every surface that needs a plan — the ai-tutor Edge
 * Function (Zero Chat), a future owner/teacher dashboard, notifications, or a
 * mobile app — exactly as the RFC's Implementation Note requires:
 *
 *     "The planning logic must remain independent so it can be reused by other
 *      parts of the platform in the future."
 *
 * Zero Chat (or any caller) is only the INTERFACE. It gathers the student's
 * real learning data into a normalized `StudentLearningState`, calls
 * `buildStudyPlan(state)`, and renders the returned `StudyPlan`. This file
 * contains NO database reads, NO network calls, and NO clock reads — the caller
 * passes `state.now` so the same inputs always produce the same plan (mirrors
 * the analyzer's frozen `runNow` determinism discipline).
 *
 * ── DATA SOURCES (normalized by the caller, consumed here) ──────────────────
 *   1. Weakness Analyzer   → state.weakness  (weakness_reports SSOT)
 *   2. Focus Practice      → state.focus     (focus_plans + focus_tasks)
 *   3. Mock Exams          → state.mocks     (exam_practice_sessions + mistakes)
 *   4. AI Tutor History    → state.tutor     (aggregated question_records)
 *   5. Student Progress    → state.progress / state.student (xp, rank, streak)
 *   6. Student Availability→ state.student.availability (exam date, hours/day)
 *
 * ── CORE PRINCIPLE ──────────────────────────────────────────────────────────
 *   Never generic. Every task, goal, and roadmap week is derived from the
 *   student's own data and ranked so the highest-impact work comes first.
 *   Focus Practice OWNS lesson content and order; the planner only decides
 *   WHICH plan and WHICH remaining lessons to schedule next — it never invents
 *   a lesson sequence (RFC: "follow the Focus Practice structure rather than
 *   inventing lesson orders").
 *
 * Environment-agnostic UMD: attaches globalThis.StudyPlanner in browsers/Deno,
 * exports via module.exports in Node/Deno CommonJS.
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.StudyPlanner = factory();
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  /* ════════════════════════════════════════════════════════════════════════
     CONSTANTS
     ════════════════════════════════════════════════════════════════════════ */

  var PLANNER_VERSION = 'study-planner-v1';

  /** Credit cost to create or regenerate a plan (RFC "Credits" section).
   *  Follow-up questions about an existing plan are NOT charged here — they
   *  stay in normal chat pricing. The 20-credit charge is enforced by the
   *  caller via consume_credits(p_feature='STUDY_PLAN'); this constant is the
   *  single source of truth the caller and UI copy read from. */
  var STUDY_PLAN_CREDIT_COST = 20;

  /** Default planning horizon when no exam date is known (weeks). */
  var DEFAULT_HORIZON_WEEKS = 4;
  /** Never schedule a roadmap longer than this even for far-off exams. */
  var MAX_HORIZON_WEEKS = 12;
  var MS_PER_DAY = 24 * 60 * 60 * 1000;

  /** The primary deliverable is a 7-day, day-by-day execution plan. */
  var DAYS_IN_WEEK = 7;
  var WEEK_MS = 7 * MS_PER_DAY;
  /** At the end of each week Zero re-evaluates and regenerates the plan. */
  var WEEKLY_REGEN_DAYS = 7;
  var WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  /** Severity → base impact weight. Mirrors analyzer severity bands
   *  (mastery <30 critical, <50 high, <70 medium, >=70 low). */
  var SEVERITY_WEIGHT = { critical: 100, high: 70, medium: 40, low: 15 };
  var SEVERITY_RANK = { critical: 4, high: 3, medium: 2, low: 1 };

  /** A weakness at/above this severity that was not present last time is a
   *  "new major weakness" regeneration trigger. */
  var MAJOR_WEAKNESS_BAND = 'high';
  /** Mastery jump (points) that counts as "significant improvement". */
  var SIGNIFICANT_IMPROVEMENT = 15;
  /** Mastery target ceiling and per-week realistic gain used for goals. */
  var MASTERY_GOAL_CEIL = 85;
  var MASTERY_WEEKLY_GAIN = 12;

  /** Exam-importance weighting — a CORE differentiator. A topic's priority is
   *  not just "how weak am I" but "how much will improving this move my score",
   *  which depends on how heavily the real exam weights the topic. Importance is
   *  a 0..1 weight (1 = appears very frequently / high score leverage) turned
   *  into a multiplier on impact, so a high-frequency weak topic (Linear
   *  Functions) outranks a rare one (Complex Numbers) at equal weakness.
   *
   *  The AUTHORITATIVE source should be a config/taxonomy-backed table the
   *  caller passes as `state.examImportance` (per exam type). The map below is
   *  only a sensible STARTER heuristic (SAT-math domain frequency) used as a
   *  fallback; unknown topics resolve to NEUTRAL so they are never penalized by
   *  our ignorance. Keyed by normalized topic name. */
  var IMPORTANCE_NEUTRAL = 0.5;
  var IMPORTANCE_MULT_MIN = 0.7;   // multiplier at importance 0
  var IMPORTANCE_MULT_SPAN = 0.6;  // → multiplier at importance 1 is 1.3
  var DEFAULT_EXAM_IMPORTANCE = {
    'linear functions': 0.95, 'linear equations': 0.95, 'systems of equations': 0.85,
    'quadratics': 0.85, 'quadratic functions': 0.85, 'nonlinear functions': 0.8,
    'functions': 0.8, 'exponents': 0.7, 'exponential functions': 0.65,
    'ratios': 0.7, 'rates': 0.7, 'proportions': 0.7, 'percentages': 0.7,
    'statistics': 0.65, 'data analysis': 0.65, 'probability': 0.5,
    'geometry': 0.55, 'triangles': 0.55, 'circle': 0.5, 'circles': 0.5,
    'trigonometry': 0.4, 'complex numbers': 0.25,
  };

  /** Remaining Focus Practice work is one priority factor (capped) AND drives
   *  proportional day allocation. This cap keeps it a nudge, not a dominator. */
  var FOCUS_BACKLOG_CAP = 12;

  /* ════════════════════════════════════════════════════════════════════════
     SMALL PURE HELPERS
     ════════════════════════════════════════════════════════════════════════ */

  function isNum(n) { return typeof n === 'number' && isFinite(n); }
  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
  function arr(x) { return Array.isArray(x) ? x : []; }
  function str(x) { return typeof x === 'string' ? x : ''; }
  function round1(n) { return Math.round(n * 10) / 10; }
  function round2(n) { return Math.round(n * 100) / 100; }

  /** Stable composite key for a (topic, subtopic) pair. */
  function conceptKey(topic, subtopic) {
    return str(topic).trim().toLowerCase() + '||' + str(subtopic).trim().toLowerCase();
  }

  /** Human label for a concept. */
  function conceptLabel(topic, subtopic) {
    topic = str(topic).trim();
    subtopic = str(subtopic).trim();
    if (topic && subtopic && subtopic.toLowerCase() !== topic.toLowerCase()) {
      return topic + ' — ' + subtopic;
    }
    return topic || subtopic || 'General';
  }

  function toDate(v) {
    if (v == null) return null;
    var d = (v instanceof Date) ? v : new Date(v);
    return isNaN(d.getTime()) ? null : d;
  }

  function isoDate(ms) {
    // Date portion only (YYYY-MM-DD), UTC — deterministic and timezone-stable.
    return new Date(ms).toISOString().slice(0, 10);
  }

  function daysBetween(fromMs, toMs) {
    return Math.floor((toMs - fromMs) / MS_PER_DAY);
  }

  /* ════════════════════════════════════════════════════════════════════════
     1. NORMALIZE — accept partial/loose input, produce a safe canonical shape
     ════════════════════════════════════════════════════════════════════════
     The caller SHOULD hand us clean data, but the planner must never throw on
     a missing field — a student with almost no history still deserves a plan.
     Every downstream stage reads only from this normalized view. */

  function normalizeState(raw) {
    raw = raw || {};
    var now = isNum(raw.now) ? raw.now : Date.now();
    var s = raw.student || {};
    var avail = s.availability || {};

    var hoursPerDay = isNum(avail.hoursPerDay) && avail.hoursPerDay > 0
      ? clamp(avail.hoursPerDay, 0.25, 12) : 1;
    // studyDays: weekday indices 0..6 (0=Sun) the student studies. Default: all.
    var studyDays = arr(avail.studyDays).filter(function (d) { return isNum(d) && d >= 0 && d <= 6; });
    if (!studyDays.length) studyDays = [0, 1, 2, 3, 4, 5, 6];

    var examDate = toDate(s.examDate);

    return {
      now: now,
      student: {
        id: str(s.id),
        name: str(s.name) || 'Student',
        examType: str(s.examType) || 'SAT',
        examDate: examDate ? examDate.getTime() : null,
        targetScore: isNum(s.targetScore) ? s.targetScore : null,
        xp: isNum(s.xp) ? s.xp : 0,
        rank: str(s.rank) || null,
        currentStreak: isNum(s.currentStreak) ? s.currentStreak : 0,
        availability: {
          // Study hours are used INTERNALLY to balance the week; per the UX
          // rule they are NOT shown to the student, and no minute estimate is
          // exposed on tasks or days. hoursPerDay/studyDays are echoed as the
          // inputs the plan was built against (a renderer may hide them).
          hoursPerDay: hoursPerDay,
          studyDays: studyDays.slice().sort(function (a, b) { return a - b; }),
        },
      },
      // Caller-supplied exam-importance overrides (0..1) by topic or topic||sub.
      examImportance: normalizeImportanceMap(raw.examImportance),
      weakness: normalizeWeakness(raw.weakness),
      focus: normalizeFocus(raw.focus),
      mocks: normalizeMocks(raw.mocks),
      tutor: normalizeTutor(raw.tutor),
      progress: normalizeProgress(raw.progress, s),
    };
  }

  /** Lowercase the keys of a caller-supplied importance map for stable lookup. */
  function normalizeImportanceMap(m) {
    var out = {};
    if (m && typeof m === 'object') {
      Object.keys(m).forEach(function (k) {
        var v = m[k];
        if (isNum(v)) out[str(k).trim().toLowerCase()] = clamp(v, 0, 1);
      });
    }
    return out;
  }

  /** Resolve a concept's exam-importance weight (0..1): caller override by
   *  concept key → by topic → starter default table → NEUTRAL. */
  function importanceFor(state, topic, subtopic) {
    var over = state.examImportance || {};
    var k = conceptKey(topic, subtopic);
    if (isNum(over[k])) return over[k];
    var t = str(topic).trim().toLowerCase();
    if (isNum(over[t])) return over[t];
    if (isNum(DEFAULT_EXAM_IMPORTANCE[t])) return DEFAULT_EXAM_IMPORTANCE[t];
    return IMPORTANCE_NEUTRAL;
  }

  function normalizeWeakness(list) {
    return arr(list).map(function (w) {
      w = w || {};
      var band = str(w.severityBand).toLowerCase();
      if (!SEVERITY_WEIGHT.hasOwnProperty(band)) band = null;
      return {
        topic: str(w.topic),
        subtopic: str(w.subtopic),
        masteryScore: isNum(w.masteryScore) ? clamp(w.masteryScore, 0, 100) : null,
        weaknessScore: isNum(w.weaknessScore) ? w.weaknessScore : null,
        severityBand: band,
        trend: (w.trend === 'improving' || w.trend === 'declining' || w.trend === 'stable') ? w.trend : null,
        recent7: isNum(w.recent7) ? w.recent7 : 0,
        recent14: isNum(w.recent14) ? w.recent14 : 0,
        priorityRank: isNum(w.priorityRank) ? w.priorityRank : null,
        totalSignals: isNum(w.totalSignals) ? w.totalSignals : 0,
        lastUpdatedAt: toDate(w.lastUpdatedAt),
      };
    }).filter(function (w) { return w.topic || w.subtopic; });
  }

  function normalizeFocus(list) {
    return arr(list).map(function (p) {
      p = p || {};
      var lessons = arr(p.lessons).map(function (l, i) {
        l = l || {};
        var status = str(l.status).toUpperCase();
        if (status !== 'DONE' && status !== 'IN_PROGRESS') status = 'NOT_STARTED';
        return {
          id: str(l.id),
          title: str(l.title) || ('Lesson ' + (i + 1)),
          topic: str(l.topic) || str(p.topic),
          subtopic: str(l.subtopic) || str(p.subtopic),
          order: isNum(l.order) ? l.order : i,
          status: status,
          estimatedMinutes: isNum(l.estimatedMinutes) && l.estimatedMinutes > 0 ? l.estimatedMinutes : 20,
          priority: isNum(l.priority) ? l.priority : 0,
        };
      });
      // Preserve Focus Practice's own order — sort ONLY by the explicit `order`
      // field, never re-rank by our own heuristics (RFC invariant).
      lessons.sort(function (a, b) { return a.order - b.order; });
      var status = str(p.status).toUpperCase();
      return {
        id: str(p.id),
        title: str(p.title) || 'Focus Plan',
        status: status === 'ARCHIVED' ? 'ARCHIVED' : 'ACTIVE',
        dominantSignal: str(p.dominantSignal) || null,
        topic: str(p.topic) || (lessons[0] && lessons[0].topic) || '',
        subtopic: str(p.subtopic) || (lessons[0] && lessons[0].subtopic) || '',
        lessons: lessons,
      };
    });
  }

  function normalizeMocks(list) {
    return arr(list).map(function (m) {
      m = m || {};
      return {
        id: str(m.id),
        completedAt: toDate(m.completedAt),
        score: isNum(m.score) ? m.score : null,
        totalQuestions: isNum(m.totalQuestions) ? m.totalQuestions : null,
        correct: isNum(m.correct) ? m.correct : null,
        avgSecondsPerQuestion: isNum(m.avgSecondsPerQuestion) ? m.avgSecondsPerQuestion : null,
        hadTimePressure: m.hadTimePressure === true,
        weakLessons: arr(m.weakLessons).map(function (w) {
          w = w || {};
          return {
            topic: str(w.topic),
            subtopic: str(w.subtopic),
            missCount: isNum(w.missCount) ? w.missCount : 1,
          };
        }).filter(function (w) { return w.topic || w.subtopic; }),
      };
    }).sort(function (a, b) {
      var ta = a.completedAt ? a.completedAt.getTime() : 0;
      var tb = b.completedAt ? b.completedAt.getTime() : 0;
      return tb - ta; // most recent first
    });
  }

  function normalizeTutor(t) {
    t = t || {};
    var topics = arr(t.topics).map(function (x) {
      x = x || {};
      return {
        topic: str(x.topic),
        subtopic: str(x.subtopic),
        askCount: isNum(x.askCount) ? x.askCount : 0,
        explanationRepeats: isNum(x.explanationRepeats) ? x.explanationRepeats : 0,
        deepExplains: isNum(x.deepExplains) ? x.deepExplains : 0,
        lastAskedAt: toDate(x.lastAskedAt),
      };
    }).filter(function (x) { return x.topic || x.subtopic; });
    return { topics: topics };
  }

  function normalizeProgress(p, student) {
    p = p || {};
    return {
      xp: isNum(p.xp) ? p.xp : (isNum(student.xp) ? student.xp : 0),
      rank: str(p.rank) || str(student.rank) || null,
      completionRate: isNum(p.completionRate) ? clamp(p.completionRate, 0, 1) : null,
    };
  }

  /* ════════════════════════════════════════════════════════════════════════
     2. PRIORITIZE — merge every data source into one ranked impact list
     ════════════════════════════════════════════════════════════════════════
     RFC: "The roadmap must always prioritize high-impact topics." Impact is a
     blend of weakness severity, mastery gap, trend, tutor confusion, and mock
     mistakes, then scaled by exam proximity. Determinism is guaranteed by a
     fixed tiebreaker (mastery ASC, impact DESC, key ASC) mirroring the
     analyzer's frozen ranking rule. */

  function prioritize(state) {
    var byKey = {};

    function slot(topic, subtopic) {
      var k = conceptKey(topic, subtopic);
      if (!byKey[k]) {
        byKey[k] = {
          key: k, topic: str(topic), subtopic: str(subtopic),
          masteryScore: null, severityBand: null, trend: null,
          recent7: 0, weaknessRank: null,
          tutorAsk: 0, tutorRepeat: 0, tutorDeep: 0,
          mockMiss: 0, reasons: [],
        };
      }
      return byKey[k];
    }

    // Weakness Analyzer — the SSOT signal.
    state.weakness.forEach(function (w) {
      var c = slot(w.topic, w.subtopic);
      if (isNum(w.masteryScore)) c.masteryScore = w.masteryScore;
      if (w.severityBand) c.severityBand = w.severityBand;
      if (w.trend) c.trend = w.trend;
      c.recent7 = Math.max(c.recent7, w.recent7);
      if (isNum(w.priorityRank)) c.weaknessRank = w.priorityRank;
    });

    // AI Tutor history — repeated confusion RAISES priority (RFC).
    state.tutor.topics.forEach(function (x) {
      var c = slot(x.topic, x.subtopic);
      c.tutorAsk += x.askCount;
      c.tutorRepeat += x.explanationRepeats;
      c.tutorDeep += x.deepExplains;
    });

    // Mock exams — frequently repeated mistakes RAISE priority (RFC).
    state.mocks.forEach(function (m) {
      m.weakLessons.forEach(function (w) {
        slot(w.topic, w.subtopic).mockMiss += w.missCount;
      });
    });

    var proximity = examProximityMultiplier(state);

    var list = Object.keys(byKey).map(function (k) {
      var c = byKey[k];
      var reasons = [];

      // Base: severity band, else derive from mastery gap.
      var sev = c.severityBand;
      if (!sev && isNum(c.masteryScore)) sev = bandForMastery(c.masteryScore);
      var base = sev ? SEVERITY_WEIGHT[sev] : 30;
      if (sev) reasons.push(sevReason(sev, c.masteryScore));

      // Mastery gap — lower mastery, more to gain.
      var gap = 0;
      if (isNum(c.masteryScore)) { gap = (100 - c.masteryScore) * 0.5; }

      // Trend adjustment.
      var trendAdj = 0;
      if (c.trend === 'declining') { trendAdj = 15; reasons.push('Declining trend — losing ground'); }
      else if (c.trend === 'improving') { trendAdj = -10; reasons.push('Improving — keep the momentum'); }

      // Tutor confusion.
      var confusion = clamp(c.tutorRepeat * 8 + c.tutorDeep * 5 + c.tutorAsk * 1, 0, 30);
      if (c.tutorRepeat > 0 || c.tutorDeep > 0) {
        reasons.push('You asked Zero to re-explain this ' + (c.tutorRepeat + c.tutorDeep) + '×');
      } else if (c.tutorAsk >= 3) {
        reasons.push('Frequently asked in chat (' + c.tutorAsk + '×)');
      }

      // Mock mistakes.
      var mock = clamp(c.mockMiss * 10, 0, 30);
      if (c.mockMiss > 0) reasons.push('Missed in mock exams (' + c.mockMiss + '×)');

      // Recency.
      var recency = clamp(c.recent7 * 3, 0, 15);
      if (c.recent7 >= 3) reasons.push('Active weakness this week');

      // Remaining Focus Practice work — barely-started topics need more room
      // (also drives proportional day allocation in the weekly plan, §3).
      var focusRemaining = remainingFocusCount(state, c.topic, c.subtopic);
      var focusBacklog = clamp(focusRemaining * 2, 0, FOCUS_BACKLOG_CAP);
      if (focusRemaining >= 3) reasons.push(focusRemaining + ' Focus units still to complete');

      // Exam importance — how heavily the REAL exam weights this topic. This is
      // the score-impact multiplier that makes the plan answer "what maximizes
      // my score this week" rather than merely "what am I weakest at".
      var importance = importanceFor(state, c.topic, c.subtopic);
      var importanceMult = IMPORTANCE_MULT_MIN + IMPORTANCE_MULT_SPAN * importance;
      if (importance >= 0.75) reasons.push('High exam frequency — strong score leverage');
      else if (importance <= 0.35) reasons.push('Lower exam frequency');

      var impact = (base + gap + trendAdj + confusion + mock + recency + focusBacklog)
        * proximity.multiplierFor(sev) * importanceMult;

      return {
        key: c.key, topic: c.topic, subtopic: c.subtopic,
        label: conceptLabel(c.topic, c.subtopic),
        masteryScore: c.masteryScore,
        severity: sev || 'medium',
        severityRank: SEVERITY_RANK[sev || 'medium'],
        trend: c.trend,
        examImportance: round2(importance),   // 0..1 weight used in ranking
        focusRemaining: focusRemaining,
        impactScore: round1(impact),
        reasons: reasons,
        _mastery: isNum(c.masteryScore) ? c.masteryScore : 999,
      };
    });

    // Deterministic ordering: impact DESC, then mastery ASC, then key ASC.
    list.sort(function (a, b) {
      if (b.impactScore !== a.impactScore) return b.impactScore - a.impactScore;
      if (a._mastery !== b._mastery) return a._mastery - b._mastery;
      return a.key < b.key ? -1 : (a.key > b.key ? 1 : 0);
    });

    return list.map(function (p, i) {
      var out = attachFocus(p, state);
      out.rank = i + 1;
      delete out._mastery;
      return out;
    });
  }

  function bandForMastery(m) {
    if (m < 30) return 'critical';
    if (m < 50) return 'high';
    if (m < 70) return 'medium';
    return 'low';
  }

  function sevReason(sev, mastery) {
    var m = isNum(mastery) ? ' (mastery ' + Math.round(mastery) + ')' : '';
    if (sev === 'critical') return 'Critical weakness' + m;
    if (sev === 'high') return 'High-severity weakness' + m;
    if (sev === 'medium') return 'Moderate weakness' + m;
    return 'Low-severity — maintenance' + m;
  }

  /** Attach the matching Focus Practice plan + its remaining lessons. The
   *  planner schedules WHICH plan/lessons; Focus Practice owns their order. */
  function attachFocus(priority, state) {
    var plan = findFocusPlan(state.focus, priority.topic, priority.subtopic);
    priority.focusPlanId = plan ? plan.id : null;
    priority.focusPlanTitle = plan ? plan.title : null;
    if (plan) {
      var remaining = plan.lessons.filter(function (l) { return l.status !== 'DONE'; });
      var done = plan.lessons.length - remaining.length;
      priority.remainingLessons = remaining;
      priority.lessonsTotal = plan.lessons.length;
      priority.lessonsDone = done;
      priority.progressPct = plan.lessons.length ? Math.round((done / plan.lessons.length) * 100) : 0;
      priority.hasFocusPlan = true;
    } else {
      priority.remainingLessons = [];
      priority.lessonsTotal = 0;
      priority.lessonsDone = 0;
      priority.progressPct = 0;
      priority.hasFocusPlan = false;
    }
    return priority;
  }

  /** Count a concept's not-yet-DONE Focus units (0 if it has no plan). Drives
   *  both the priority focus-backlog term and proportional day allocation. */
  function remainingFocusCount(state, topic, subtopic) {
    var plan = findFocusPlan(state.focus, topic, subtopic);
    if (!plan) return 0;
    return plan.lessons.filter(function (l) { return l.status !== 'DONE'; }).length;
  }

  /** Match a Focus Plan to a concept: exact (topic+subtopic) first, then topic. */
  function findFocusPlan(plans, topic, subtopic) {
    var active = plans.filter(function (p) { return p.status === 'ACTIVE'; });
    var exact = active.filter(function (p) {
      return conceptKey(p.topic, p.subtopic) === conceptKey(topic, subtopic);
    });
    if (exact.length) return withMostRemaining(exact);
    var byTopic = active.filter(function (p) {
      return str(p.topic).trim().toLowerCase() === str(topic).trim().toLowerCase() && str(topic).trim();
    });
    if (byTopic.length) return withMostRemaining(byTopic);
    return null;
  }

  function withMostRemaining(plans) {
    // Prefer the plan with unfinished lessons so we always point at real work.
    var best = null, bestRemain = -1;
    plans.forEach(function (p) {
      var r = p.lessons.filter(function (l) { return l.status !== 'DONE'; }).length;
      if (r > bestRemain) { bestRemain = r; best = p; }
    });
    return best;
  }

  /* Exam proximity: as the exam nears, concentrate weight on the highest
     severities (triage) rather than spreading effort thin. */
  function examProximityMultiplier(state) {
    var days = examDaysRemaining(state);
    var near = days != null && days <= 14;
    var soon = days != null && days <= 30;
    return {
      days: days,
      multiplierFor: function (sev) {
        if (near) return (sev === 'critical' || sev === 'high') ? 1.3 : 0.85;
        if (soon) return (sev === 'critical' || sev === 'high') ? 1.15 : 0.95;
        return 1;
      },
    };
  }

  function examDaysRemaining(state) {
    if (state.student.examDate == null) return null;
    return Math.max(0, daysBetween(state.now, state.student.examDate));
  }

  /* ════════════════════════════════════════════════════════════════════════
     3. WEEKLY EXECUTION PLAN (7 days) — the PRIMARY deliverable
     ════════════════════════════════════════════════════════════════════════
     Organized by DAY (Sunday, Monday, …), never by clock time — students keep
     different schedules, so a day assignment is enough. Available study hours
     are used INTERNALLY to size and cap each day's workload; they are never
     surfaced as "7:00 PM"-style slots.

     Each study day gets a concrete checklist, e.g.:
         Sunday   → Circle → Round 1 · Solve 15 Practice Questions · Review previous mistakes
         Monday   → Circle → Round 2 · AI Tutor Review
         Tuesday  → Circle → Round 3 · Timed Practice

     Days outside availability.studyDays are rest days with no assigned work.
     Focus Practice still OWNS unit order — the planner only walks the remaining
     units in sequence and spreads them one-per-study-day, highest impact first.
     The window rolls forward from `state.now`; at its end Zero re-evaluates the
     latest data and regenerates a completely new week (see detectRegeneration-
     Triggers → `week_elapsed`). */

  function buildWeek(state, priorities) {
    var startMs = state.now;                         // rolling 7-day window from today
    var avail = state.student.availability;
    var budget = avail.hoursPerDay * 60;
    var studyDaySet = {};
    avail.studyDays.forEach(function (d) { studyDaySet[d] = true; });

    // Ordered backlog of day "anchors": the remaining Focus units in their own
    // sequence, across priorities (top priority's units first). One anchor is
    // consumed per non-mock study day; units are never dropped or re-ordered.
    var anchors = buildAnchorBacklog(priorities);

    // Count study days in this window to place a single weekly mock sensibly.
    var studyDayCount = 0;
    for (var d = 0; d < DAYS_IN_WEEK; d++) {
      if (studyDaySet[new Date(startMs + d * MS_PER_DAY).getUTCDay()]) studyDayCount++;
    }
    var mockOrdinal = mockDayOrdinal(studyDayCount);

    var days = [];
    var anchorIdx = 0;
    var studyOrdinal = 0;
    for (var i = 0; i < DAYS_IN_WEEK; i++) {
      var dayMs = startMs + i * MS_PER_DAY;
      var wd = new Date(dayMs).getUTCDay();
      var isStudy = !!studyDaySet[wd];
      var day = {
        day: WEEKDAY_NAMES[wd],
        date: isoDate(dayMs),
        weekdayIndex: wd,
        isStudyDay: isStudy,
        tasks: [],
      };
      if (isStudy) {
        var isMockDay = studyOrdinal === mockOrdinal;
        // A dedicated mock day does not consume a Focus anchor (keeps the unit
        // sequence intact); other study days pull the next anchor.
        var anchor = isMockDay ? null : (anchors[anchorIdx] || null);
        if (anchor) anchorIdx++;
        day.tasks = buildDayTasks(state, priorities, anchor, {
          ordinal: studyOrdinal, isMockDay: isMockDay,
          isFirstStudyDay: studyOrdinal === 0, budget: budget,
        });
        studyOrdinal++;
      } else {
        day.note = 'Rest day';
      }
      days.push(day);
    }

    return {
      weekNumber: 1,
      startDate: isoDate(startMs),
      endDate: isoDate(startMs + (DAYS_IN_WEEK - 1) * MS_PER_DAY),
      regeneratesOn: isoDate(startMs + WEEK_MS),     // end-of-week re-evaluation
      studyDaysPerWeek: studyDayCount,
      focusTopics: priorities.slice(0, 2).map(function (p) { return p.label; }),
      days: days,
      goals: buildWeekGoals(state, priorities),      // measurable summary
    };
  }

  /** Which study-day ordinal (0-based) hosts the single weekly mock. Returns
   *  -1 when there are too few study days to spare one for a full mock. */
  function mockDayOrdinal(studyDayCount) {
    if (studyDayCount < 2) return -1;
    if (studyDayCount === 2) return 1;
    return Math.min(studyDayCount - 2, 3);
  }

  /** Flatten priorities into an ordered list of per-day anchors, preserving
   *  Focus Practice's unit order (never re-sequenced). */
  function buildAnchorBacklog(priorities) {
    var anchors = [];
    priorities.forEach(function (p) {
      if (p.hasFocusPlan && p.remainingLessons.length) {
        p.remainingLessons.forEach(function (lesson) {
          anchors.push({ type: 'focus_lesson', priority: p, lesson: lesson });
        });
      } else if (!p.hasFocusPlan) {
        anchors.push({ type: 'focus_start', priority: p });
      }
    });
    return anchors;
  }

  /** Build one study day's concrete checklist: an anchor (the next Focus unit
   *  or the weekly mock) followed by rotating, data-derived support activities
   *  capped by the daily time budget. No clock times are ever assigned. */
  function buildDayTasks(state, priorities, anchor, ctx) {
    var tasks = [];
    var used = 0;                       // INTERNAL minute accounting — never output
    var top = priorities[0] || null;

    // add(task, mins, guaranteed): `mins` balances the day internally; it is
    // NEVER written onto the task, so no duration is exposed to the student.
    function add(task, mins, guaranteed) {
      if (!guaranteed && tasks.length > 0 && used + mins > ctx.budget) return false;
      tasks.push(task);
      used += mins;
      return true;
    }

    // ── Anchor ──────────────────────────────────────────────────────────────
    if (ctx.isMockDay) {
      add({ type: 'mock', label: 'Complete a Mock Practice',
        detail: 'Your weekly checkpoint — take it under real timing, then log mistakes.',
        ref: { kind: 'mock' } }, Math.min(60, Math.max(30, ctx.budget)), true);
    } else if (anchor && anchor.type === 'focus_lesson') {
      var p = anchor.priority, lesson = anchor.lesson;
      add({ type: 'focus_lesson',
        label: p.focusPlanTitle + ' → ' + lesson.title,        // e.g. "Circle → Round 1"
        detail: 'Highest-impact next unit for ' + p.label + '.',
        ref: { kind: 'focus_lesson', planId: p.focusPlanId, lessonId: lesson.id, topic: p.topic, subtopic: p.subtopic } },
        lesson.estimatedMinutes, true);
    } else if (anchor && anchor.type === 'focus_start') {
      add({ type: 'focus_start', label: 'Start Focus Practice: ' + anchor.priority.label,
        detail: 'No active Focus plan covers this yet — start one so Zero can sequence its units.',
        ref: { kind: 'focus_start', topic: anchor.priority.topic, subtopic: anchor.priority.subtopic } },
        25, true);
    } else if (!priorities.length && ctx.isFirstStudyDay) {
      // Brand-new student: seed the plan with a diagnostic on the first day.
      add({ type: 'diagnostic', label: 'Take a short diagnostic mock',
        detail: 'Zero needs a little data to personalize your plan — this unlocks tailored priorities.',
        ref: { kind: 'mock' } }, Math.min(ctx.budget, 30), true);
      return tasks;
    } else {
      // Backlog exhausted (or no priorities): consolidation on the top concept.
      add({ type: 'consolidation',
        label: top ? 'Mixed review: ' + top.label : 'Mixed review of core topics',
        detail: 'Consolidate what you have covered so far.',
        ref: top ? { kind: 'review', topic: top.topic, subtopic: top.subtopic } : { kind: 'review' } },
        20, true);
    }

    // ── Rotating support activities (data-derived), capped by budget ─────────
    var focusRef = (anchor && anchor.priority) ? anchor.priority : top;
    var theme = ctx.ordinal % 3;
    if (theme === 0) {
      addPractice(add, focusRef, remaining(ctx.budget, used));
      if (hasRecentMistakes(state)) {
        add({ type: 'review', label: 'Review previous mistakes',
          detail: 'Re-work the questions you missed most recently.',
          ref: { kind: 'review' } }, 15);
      }
    } else if (theme === 1) {
      if (state.tutor.topics.length) {
        var confused = mostConfusedLabel(state);
        add({ type: 'ai_tutor_review', label: 'AI Tutor Review',
          detail: 'Revisit with Zero the topics you asked about most' + (confused ? ' (e.g. ' + confused + ')' : '') + '.',
          ref: { kind: 'ai_tutor_review' } }, 15);
      } else {
        addPractice(add, focusRef, remaining(ctx.budget, used));
      }
    } else {
      add({ type: 'timed_practice', label: 'Timed Practice',
        detail: 'Solve under exam timing to build pace' + (focusRef ? ' on ' + focusRef.label : '') + '.',
        ref: focusRef ? { kind: 'timed_practice', topic: focusRef.topic, subtopic: focusRef.subtopic } : { kind: 'timed_practice' } }, 20);
    }

    // Guarantee at least one support task when only the anchor is present and
    // there is room, so no study day is a lone checkbox.
    if (tasks.length === 1 && remaining(ctx.budget, used) >= 10) {
      addPractice(add, focusRef, remaining(ctx.budget, used));
    }

    return tasks;
  }

  function remaining(budget, used) { return Math.max(0, budget - used); }

  function addPractice(add, focusRef, minutesLeft) {
    var minutes = clamp(minutesLeft > 0 ? minutesLeft : 30, 10, 30);
    var count = clamp(Math.round(minutes / 2), 5, 20);
    add({ type: 'practice', label: 'Solve ' + count + ' Practice Questions',
      detail: focusRef ? 'Focused reps on ' + focusRef.label + '.' : 'Focused practice reps.',
      ref: focusRef ? { kind: 'practice', topic: focusRef.topic, subtopic: focusRef.subtopic, count: count } : { kind: 'practice', count: count } },
      minutes);
  }

  function mostConfusedLabel(state) {
    var best = null, bestScore = -1;
    state.tutor.topics.forEach(function (x) {
      var s = x.explanationRepeats * 2 + x.deepExplains * 2 + x.askCount;
      if (s > bestScore) { bestScore = s; best = x; }
    });
    return best ? conceptLabel(best.topic, best.subtopic) : null;
  }

  function hasRecentMistakes(state) {
    if (state.mocks.length && state.mocks[0].weakLessons.length) return true;
    return state.weakness.some(function (w) { return w.recent7 > 0; });
  }

  /* ════════════════════════════════════════════════════════════════════════
     4. WEEKLY GOALS — measurable outcomes summary (accompanies the day plan)
     ════════════════════════════════════════════════════════════════════════ */

  function buildWeekGoals(state, priorities) {
    var top = priorities.slice(0, 2);
    var goals = [];
    top.forEach(function (p) {
      if (p.hasFocusPlan && p.remainingLessons.length) {
        goals.push({
          label: 'Finish ' + p.focusPlanTitle + ' (' + p.remainingLessons.length + ' units left)',
          metric: 'focus_lessons_completed', target: p.remainingLessons.length,
          ref: { topic: p.topic, subtopic: p.subtopic, planId: p.focusPlanId },
        });
      } else if (!p.hasFocusPlan) {
        goals.push({
          label: 'Begin focused practice on ' + p.label,
          metric: 'focus_started', target: 1, ref: { topic: p.topic, subtopic: p.subtopic },
        });
      }
      if (isNum(p.masteryScore)) {
        var target = clamp(Math.round(p.masteryScore + MASTERY_WEEKLY_GAIN), 0, MASTERY_GOAL_CEIL);
        if (target > p.masteryScore) {
          goals.push({
            label: 'Reach ' + target + '% mastery in ' + p.label,
            metric: 'mastery_score', target: target, ref: { topic: p.topic, subtopic: p.subtopic },
          });
        }
      }
    });
    goals.push({ label: 'Complete one Mock Practice', metric: 'mocks_completed', target: 1, ref: { kind: 'mock' } });
    return goals;
  }

  /* ════════════════════════════════════════════════════════════════════════
     5. ROADMAP — long-term week-by-week sequence, high-impact first
     ════════════════════════════════════════════════════════════════════════ */

  function buildRoadmap(state, priorities) {
    var weeks = horizonWeeks(state);
    // One high-impact topic per week, in priority order. Distinct topics only
    // so the roadmap reads as a progression, not a repeat.
    var seenTopic = {};
    var ordered = [];
    priorities.forEach(function (p) {
      var t = str(p.topic).trim().toLowerCase() || p.key;
      if (seenTopic[t]) return;
      seenTopic[t] = true;
      ordered.push(p);
    });

    var roadmap = [];
    for (var i = 0; i < weeks; i++) {
      var p = ordered[i];
      var startMs = state.now + i * 7 * MS_PER_DAY;
      if (!p) {
        // Beyond known priorities → consolidation / full-length practice weeks.
        roadmap.push({
          week: i + 1,
          startDate: isoDate(startMs),
          focusTopic: 'Mixed review & full-length practice',
          subtopics: [],
          milestones: ['Full-length timed mock', 'Review all flagged mistakes'],
          isConsolidation: true,
        });
        continue;
      }
      var milestones = [];
      if (p.hasFocusPlan && p.remainingLessons.length) {
        milestones.push('Finish ' + p.focusPlanTitle + ' (' + p.remainingLessons.length + ' lessons)');
      } else if (!p.hasFocusPlan) {
        milestones.push('Start & progress a Focus plan for ' + p.label);
      }
      if (isNum(p.masteryScore)) {
        milestones.push('Reach ' + clamp(Math.round(p.masteryScore + MASTERY_WEEKLY_GAIN), 0, MASTERY_GOAL_CEIL) + '% mastery');
      }
      milestones.push('One targeted mock checkpoint');
      roadmap.push({
        week: i + 1,
        startDate: isoDate(startMs),
        focusTopic: p.topic || p.label,
        subtopics: p.subtopic ? [p.subtopic] : [],
        milestones: milestones,
        severity: p.severity,
        isConsolidation: false,
      });
    }
    return roadmap;
  }

  function horizonWeeks(state) {
    var days = examDaysRemaining(state);
    if (days == null) return DEFAULT_HORIZON_WEEKS;
    var w = Math.ceil(days / 7);
    return clamp(w, 1, MAX_HORIZON_WEEKS);
  }

  /* ════════════════════════════════════════════════════════════════════════
     6. RATIONALE + top-level assembly
     ════════════════════════════════════════════════════════════════════════ */

  function buildRationale(state, priorities) {
    var r = [];
    var days = examDaysRemaining(state);
    if (days != null) {
      r.push('Your ' + state.student.examType + ' is in ' + days + ' day' + (days === 1 ? '' : 's') +
        ' — the plan front-loads your highest-impact gaps.');
    } else {
      r.push('No exam date set — the plan follows a ' + DEFAULT_HORIZON_WEEKS +
        '-week horizon. Add your exam date for a countdown-tuned schedule.');
    }
    if (priorities.length) {
      r.push('Top priority is ' + priorities[0].label + ' because: ' + priorities[0].reasons.slice(0, 2).join('; ') + '.');
    } else {
      r.push('Not enough learning data yet — start with a diagnostic mock so Zero can personalize your priorities.');
    }
    r.push('Your week is a day-by-day checklist (no fixed clock times) sized to your available hours; at week\'s end Zero re-reads your latest data and builds a fresh week.');
    r.push('Units follow your Focus Practice sequence exactly; Zero only chooses which plan and which remaining units come next.');
    return r;
  }

  /**
   * buildStudyPlan — the single public entry point.
   * @param {object} rawState  StudentLearningState (see file header).
   * @returns {object} StudyPlan
   */
  function buildStudyPlan(rawState) {
    var state = normalizeState(rawState);
    var priorities = prioritize(state);
    var days = examDaysRemaining(state);
    var week = buildWeek(state, priorities);   // PRIMARY deliverable (7-day plan)

    // The engine reads Focus units' estimatedMinutes INTERNALLY (above) to
    // balance each day; strip it from the exposed `remainingLessons` so no
    // duration reaches the student (UX rule: show what to do, not how long).
    priorities.forEach(function (p) {
      (p.remainingLessons || []).forEach(function (l) { delete l.estimatedMinutes; });
    });

    return {
      version: PLANNER_VERSION,
      generatedAt: new Date(state.now).toISOString(),
      student: { name: state.student.name, examType: state.student.examType },
      examCountdown: state.student.examDate == null ? null : {
        examDate: isoDate(state.student.examDate),
        daysRemaining: days,
        weeksRemaining: Math.ceil((days || 0) / 7),
      },
      availability: state.student.availability,
      priorities: priorities,
      // PRIMARY: the 7-day, day-by-day execution plan.
      week: week,
      // Convenience pointer to today's entry inside `week.days` (may be a rest
      // day). The canonical schedule is always `week.days`.
      today: week.days[0],
      // SECONDARY: the long-term week-by-week roadmap to the exam.
      roadmap: buildRoadmap(state, priorities),
      rationale: buildRationale(state, priorities),
      meta: {
        primary: 'week',
        creditCost: STUDY_PLAN_CREDIT_COST,
        weeklyRegenDays: WEEKLY_REGEN_DAYS,
        sources: {
          weakness: state.weakness.length,
          focusPlans: state.focus.length,
          mocks: state.mocks.length,
          tutorTopics: state.tutor.topics.length,
        },
        triggersWatched: [
          'week_elapsed', 'mock_completed', 'weakness_updated',
          'focus_completed', 'new_major_weakness', 'significant_improvement',
        ],
      },
    };
  }

  /* ════════════════════════════════════════════════════════════════════════
     7. DYNAMIC UPDATES — regeneration-trigger detection
     ════════════════════════════════════════════════════════════════════════
     RFC "Dynamic Updates": the plan is not static. A caller persists a compact
     signature (`planSignature`) alongside each plan and, on any learning event,
     compares the current signature to decide whether to auto-regenerate. This
     keeps the trigger policy in the engine (reusable) instead of scattered
     across callers. */

  /** Compute a compact signature of the inputs that should invalidate a plan. */
  function planSignature(rawState) {
    var state = normalizeState(rawState);
    var criticalTopics = state.weakness
      .filter(function (w) { return SEVERITY_RANK[w.severityBand] >= SEVERITY_RANK[MAJOR_WEAKNESS_BAND]; })
      .map(function (w) { return conceptKey(w.topic, w.subtopic); })
      .sort();
    var maxMastery = 0, latestWeakness = 0;
    state.weakness.forEach(function (w) {
      if (isNum(w.masteryScore)) maxMastery = Math.max(maxMastery, w.masteryScore);
      if (w.lastUpdatedAt) latestWeakness = Math.max(latestWeakness, w.lastUpdatedAt.getTime());
    });
    var focusDone = 0;
    state.focus.forEach(function (p) {
      p.lessons.forEach(function (l) { if (l.status === 'DONE') focusDone++; });
    });
    return {
      generatedAt: state.now,        // when this signature (and its plan) was made
      mockCount: state.mocks.length,
      focusDoneCount: focusDone,
      criticalTopics: criticalTopics,
      maxMastery: maxMastery,
      latestWeaknessAt: latestWeakness,
    };
  }

  /**
   * detectRegenerationTriggers — compare a stored signature to current state.
   * @param {object} prevSignature  result of planSignature at last generation.
   * @param {object} currentState   fresh StudentLearningState.
   * @returns {{shouldRegenerate:boolean, reasons:Array<{code:string,message:string}>}}
   */
  function detectRegenerationTriggers(prevSignature, currentState) {
    var reasons = [];
    var cur = planSignature(currentState);
    var prev = prevSignature || {};

    // Primary cadence: a full week has elapsed since the plan was generated, so
    // Zero re-evaluates the latest data and builds a completely new week.
    if (isNum(prev.generatedAt) && (cur.generatedAt - prev.generatedAt) >= WEEK_MS) {
      reasons.push({ code: 'week_elapsed', message: 'A new week has started — time for a fresh weekly plan.' });
    }
    if (isNum(prev.mockCount) && cur.mockCount > prev.mockCount) {
      reasons.push({ code: 'mock_completed', message: 'A new mock exam was completed.' });
    }
    if (isNum(prev.focusDoneCount) && cur.focusDoneCount > prev.focusDoneCount) {
      reasons.push({ code: 'focus_completed', message: 'You completed more Focus Practice lessons.' });
    }
    if (isNum(prev.latestWeaknessAt) && cur.latestWeaknessAt > prev.latestWeaknessAt) {
      reasons.push({ code: 'weakness_updated', message: 'Your weakness analysis was refreshed.' });
    }
    var prevCrit = {};
    arr(prev.criticalTopics).forEach(function (k) { prevCrit[k] = true; });
    var newMajor = cur.criticalTopics.filter(function (k) { return !prevCrit[k]; });
    if (newMajor.length) {
      reasons.push({ code: 'new_major_weakness', message: 'A new major weakness was detected.' });
    }
    if (isNum(prev.maxMastery) && cur.maxMastery - prev.maxMastery >= SIGNIFICANT_IMPROVEMENT) {
      reasons.push({ code: 'significant_improvement', message: 'You made significant improvement — time to re-balance.' });
    }
    return { shouldRegenerate: reasons.length > 0, reasons: reasons };
  }

  /* ════════════════════════════════════════════════════════════════════════
     PUBLIC API
     ════════════════════════════════════════════════════════════════════════ */

  return {
    VERSION: PLANNER_VERSION,
    STUDY_PLAN_CREDIT_COST: STUDY_PLAN_CREDIT_COST,
    buildStudyPlan: buildStudyPlan,
    planSignature: planSignature,
    detectRegenerationTriggers: detectRegenerationTriggers,
    // Exposed for tests / advanced callers:
    _normalizeState: normalizeState,
    _prioritize: function (raw) { return prioritize(normalizeState(raw)); },
  };
}));
