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

  /* ════════════════════════════════════════════════════════════════════════
     SMALL PURE HELPERS
     ════════════════════════════════════════════════════════════════════════ */

  function isNum(n) { return typeof n === 'number' && isFinite(n); }
  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
  function arr(x) { return Array.isArray(x) ? x : []; }
  function str(x) { return typeof x === 'string' ? x : ''; }
  function round1(n) { return Math.round(n * 10) / 10; }

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
          hoursPerDay: hoursPerDay,
          studyDays: studyDays.slice().sort(function (a, b) { return a - b; }),
          weeklyMinutes: Math.round(hoursPerDay * 60 * studyDays.length),
        },
      },
      weakness: normalizeWeakness(raw.weakness),
      focus: normalizeFocus(raw.focus),
      mocks: normalizeMocks(raw.mocks),
      tutor: normalizeTutor(raw.tutor),
      progress: normalizeProgress(raw.progress, s),
    };
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

      var impact = (base + gap + trendAdj + confusion + mock + recency) * proximity.multiplierFor(sev);

      return {
        key: c.key, topic: c.topic, subtopic: c.subtopic,
        label: conceptLabel(c.topic, c.subtopic),
        masteryScore: c.masteryScore,
        severity: sev || 'medium',
        severityRank: SEVERITY_RANK[sev || 'medium'],
        trend: c.trend,
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
     3. TODAY — a concrete daily task list that fits the student's hours
     ════════════════════════════════════════════════════════════════════════ */

  function buildToday(state, priorities) {
    var budget = state.student.availability.hoursPerDay * 60;
    var used = 0;
    var tasks = [];
    var top = priorities[0] || null;

    function push(t) {
      if (used + t.estimatedMinutes > budget && tasks.length > 0) return false;
      tasks.push(t);
      used += t.estimatedMinutes;
      return true;
    }

    if (top) {
      if (top.hasFocusPlan && top.remainingLessons.length) {
        var lesson = top.remainingLessons[0];
        push({
          type: 'focus_lesson',
          label: 'Complete Focus Practice: ' + top.focusPlanTitle + ' — ' + lesson.title,
          detail: 'Your highest-impact next step for ' + top.label + '.',
          estimatedMinutes: lesson.estimatedMinutes,
          ref: { kind: 'focus_lesson', planId: top.focusPlanId, lessonId: lesson.id, topic: top.topic, subtopic: top.subtopic },
        });
      } else if (!top.hasFocusPlan) {
        push({
          type: 'focus_start',
          label: 'Start a Focus Practice plan for ' + top.label,
          detail: 'No active Focus plan covers your top weakness yet — start one so Zero can sequence the lessons.',
          estimatedMinutes: 25,
          ref: { kind: 'focus_start', topic: top.topic, subtopic: top.subtopic },
        });
      }

      // Targeted practice on the top concept.
      var qMinutes = clamp(Math.floor((budget - used) * 0.5), 10, 30);
      var qCount = clamp(Math.round(qMinutes / 2), 5, 20);
      push({
        type: 'practice',
        label: 'Solve ' + qCount + ' practice questions on ' + top.label,
        detail: 'Reinforce today\'s lesson with focused reps.',
        estimatedMinutes: qMinutes,
        ref: { kind: 'practice', topic: top.topic, subtopic: top.subtopic, count: qCount },
      });
    }

    // Review yesterday's mistakes when there is recent evidence to review.
    if (hasRecentMistakes(state)) {
      push({
        type: 'review',
        label: 'Review yesterday\'s mistakes',
        detail: 'Re-work the questions you missed most recently before moving on.',
        estimatedMinutes: clamp(budget - used, 5, 20),
        ref: { kind: 'review' },
      });
    }

    // If nothing was scheduled (brand-new student), give a real first step.
    if (!tasks.length) {
      tasks.push({
        type: 'diagnostic',
        label: 'Take a short diagnostic mock to seed your plan',
        detail: 'Zero needs a little data to personalize your plan — a quick mock unlocks tailored priorities.',
        estimatedMinutes: Math.min(budget, 30),
        ref: { kind: 'mock' },
      });
      used = tasks[0].estimatedMinutes;
    }

    return { date: isoDate(state.now), estimatedMinutes: Math.round(used), tasks: tasks };
  }

  function hasRecentMistakes(state) {
    if (state.mocks.length && state.mocks[0].weakLessons.length) return true;
    return state.weakness.some(function (w) { return w.recent7 > 0; });
  }

  /* ════════════════════════════════════════════════════════════════════════
     4. WEEK — this week's measurable goals
     ════════════════════════════════════════════════════════════════════════ */

  function buildWeek(state, priorities) {
    var top = priorities.slice(0, 2);
    var goals = [];
    var focusTopics = [];

    top.forEach(function (p) {
      focusTopics.push(p.label);
      if (p.hasFocusPlan && p.remainingLessons.length) {
        goals.push({
          label: 'Finish ' + p.focusPlanTitle + ' (' + p.remainingLessons.length + ' lessons left)',
          metric: 'focus_lessons_completed',
          target: p.remainingLessons.length,
          ref: { topic: p.topic, subtopic: p.subtopic, planId: p.focusPlanId },
        });
      } else if (!p.hasFocusPlan) {
        goals.push({
          label: 'Begin focused practice on ' + p.label,
          metric: 'focus_started',
          target: 1,
          ref: { topic: p.topic, subtopic: p.subtopic },
        });
      }
      if (isNum(p.masteryScore)) {
        var target = clamp(Math.round(p.masteryScore + MASTERY_WEEKLY_GAIN), 0, MASTERY_GOAL_CEIL);
        if (target > p.masteryScore) {
          goals.push({
            label: 'Reach ' + target + '% mastery in ' + p.label,
            metric: 'mastery_score',
            target: target,
            ref: { topic: p.topic, subtopic: p.subtopic },
          });
        }
      }
    });

    // Always include a mock checkpoint — the RFC's Week-1 example does.
    goals.push({
      label: 'Complete one Mock Practice', metric: 'mocks_completed', target: 1, ref: { kind: 'mock' },
    });

    return {
      weekNumber: 1,
      startDate: isoDate(state.now),
      endDate: isoDate(state.now + 6 * MS_PER_DAY),
      focusTopics: focusTopics,
      goals: goals,
    };
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
    r.push('Lessons follow your Focus Practice sequence exactly; Zero only chooses which plan and which remaining lessons come next.');
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
      today: buildToday(state, priorities),
      week: buildWeek(state, priorities),
      roadmap: buildRoadmap(state, priorities),
      rationale: buildRationale(state, priorities),
      meta: {
        creditCost: STUDY_PLAN_CREDIT_COST,
        sources: {
          weakness: state.weakness.length,
          focusPlans: state.focus.length,
          mocks: state.mocks.length,
          tutorTopics: state.tutor.topics.length,
        },
        triggersWatched: [
          'mock_completed', 'weakness_updated', 'focus_completed',
          'new_major_weakness', 'significant_improvement',
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
