/* weakness-view.js — one weakness, read three ways.
 *
 * The canonical weakness is a row of `weakness_reports`. It is produced by the
 * analyzer (`regenerate-reports.js`) and by nothing else. This module turns one
 * such row into what a student, a teacher, or an assistant should see — and it
 * DERIVES NOTHING.
 *
 * WHY THAT RESTRAINT IS THE WHOLE POINT
 * -------------------------------------
 * The analyzer states two rules in capitals, and they are the reason the same
 * weakness can mean the same thing on three surfaces:
 *
 *     "Analyzer is the SOLE authority for severity_band. Consumers must not
 *      re-derive."
 *     "Analyzer is the SOLE authority for trend. Consumers must NOT re-derive."
 *
 * A second implementation of severity is not a bug that shows up as an error.
 * It shows up as a teacher and a student disagreeing about the same student, six
 * months later, with no way to tell which one is right. So this module reads
 * `severity_band` and `trend` off the row and would rather render nothing than
 * compute a replacement. tests/weakness-view.test.mjs fails if it ever starts.
 *
 * WHAT IT ADDS: DISCLOSURE, NOT DERIVATION
 * ----------------------------------------
 * One fact travels with every weakness — what it is built from. Measured
 * 2026-08-30, 86% of all weakness signals come from tutor conversations and
 * 1.5% from mock exams (docs/engineering/weakness-evidence-audit.md §2). A
 * teacher shown "weak in Linear Equations" with no basis will read it as an exam
 * result, because that is what the word means in a classroom. It is not one yet.
 *
 * Counting stored signals by their stored source is reporting, not inference —
 * which is why this module may do it and may not do anything else.
 *
 * THE NULL TREND IS A RESULT, NOT A GAP
 * -------------------------------------
 * The analyzer holds `trend` at null below five signals on a topic, because a
 * percentage change over one or two signals swings on a single event. 205 of 225
 * live reports are null on that basis. Null renders NOTHING here — never
 * "stable", never "steady", never a flat arrow. Substituting a reassuring word
 * for a refusal to answer is the exact failure the gate exists to prevent.
 *
 * Exposed: window.WeaknessView
 */
(function () {
  'use strict';

  /* Presentation only. The mapping from mastery_score to a band lives in the
     analyzer and is deliberately absent here. */
  var BANDS = {
    critical: { label: 'Critical', tone: 'critical', rank: 0 },
    high:     { label: 'High',     tone: 'high',     rank: 1 },
    medium:   { label: 'Medium',   tone: 'medium',   rank: 2 },
    low:      { label: 'Low',      tone: 'low',      rank: 3 },
  };

  var TRENDS = {
    improving: { label: 'Improving', dir: 'up' },
    declining: { label: 'Declining', dir: 'down' },
    stable:    { label: 'Stable',    dir: 'flat' },
  };

  var SOURCE_LABELS = {
    AI_CHAT:        'tutor conversations',
    MOCK_EXAM:      'mock exams',
    FOCUS_PRACTICE: 'focus practice',
  };

  function num(v) { return typeof v === 'number' && isFinite(v) ? v : 0; }

  /** Human "3 days ago" without pulling in a date library. */
  function since(iso) {
    if (!iso) return null;
    var d = (Date.now() - new Date(iso).getTime()) / 86400000;
    if (!isFinite(d)) return null;
    if (d < 1) return 'today';
    if (d < 2) return 'yesterday';
    if (d < 30) return Math.floor(d) + ' days ago';
    if (d < 365) return Math.floor(d / 30) + ' months ago';
    return 'over a year ago';
  }

  /**
   * One weakness_reports row -> the canonical view every surface shares.
   * `counts` is {AI_CHAT, MOCK_EXAM, FOCUS_PRACTICE} of stored signals.
   */
  function canonical(row, counts) {
    if (!row) return null;
    var c = counts || {};
    var bySource = {
      AI_CHAT:        num(c.AI_CHAT),
      MOCK_EXAM:      num(c.MOCK_EXAM),
      FOCUS_PRACTICE: num(c.FOCUS_PRACTICE),
    };
    var counted = bySource.AI_CHAT + bySource.MOCK_EXAM + bySource.FOCUS_PRACTICE;

    // Read, never re-derive. An unknown band is null, not a guess.
    var band = row.severity_band && BANDS[row.severity_band] ? row.severity_band : null;
    var trend = row.trend && TRENDS[row.trend] ? row.trend : null;

    return {
      topic: row.topic || null,
      subtopic: row.subtopic || null,
      band: band,
      bandLabel: band ? BANDS[band].label : null,
      bandTone: band ? BANDS[band].tone : null,
      priority: typeof row.priority_rank === 'number' ? row.priority_rank : null,

      // Null stays null all the way to the screen.
      trend: trend,
      trendLabel: trend ? TRENDS[trend].label : null,
      trendDir: trend ? TRENDS[trend].dir : null,

      lastSignalAt: row.last_signal_at || null,
      lastSeen: since(row.last_signal_at),

      basis: {
        total: num(row.total_signals) || counted,
        counted: counted,
        bySource: bySource,
        hasExamEvidence: bySource.MOCK_EXAM > 0,
      },
    };
  }

  /**
   * What the weakness is built from, in one sentence. Always names the absence
   * of exam evidence when there is none — that absence is the finding, not a
   * detail to leave out because it reads awkwardly.
   */
  function basisSentence(view) {
    if (!view) return '';
    var b = view.basis, parts = [];
    ['AI_CHAT', 'FOCUS_PRACTICE', 'MOCK_EXAM'].forEach(function (k) {
      if (b.bySource[k] > 0) parts.push(b.bySource[k] + ' ' + SOURCE_LABELS[k]);
    });
    if (!parts.length) {
      return b.total ? ('Built from ' + b.total + ' recorded signal' + (b.total === 1 ? '' : 's') + '.')
                     : 'No recorded signals yet.';
    }
    var n = b.counted;
    var s = 'Built from ' + n + ' signal' + (n === 1 ? '' : 's') + ' — ' + parts.join(', ') + '.';
    if (!b.hasExamEvidence) s += ' No exam evidence yet — this comes from how they work, not from a test result.';
    return s;
  }

  var ROLES = {
    /* The student is the subject. Their view is about what to do next. */
    student: {
      lead: function (v) { return v.subtopic || v.topic; },
      showBasis: false,   // weakness.html already explains itself in its own terms
      showPriority: false,
      canAct: true,
      actionHint: 'Practice this next.',
    },
    /* The teacher decides. Their view is about where attention goes, and it
       carries the basis because they will act on it in front of a student. */
    teacher: {
      lead: function (v) { return v.subtopic || v.topic; },
      showBasis: true,
      showPriority: true,
      canAct: true,
      actionHint: 'Worth a conversation before the next session.',
    },
    /* The assistant reads exactly what the teacher reads and changes nothing.
       Same weakness, same evidence, no action. */
    assistant: {
      lead: function (v) { return v.subtopic || v.topic; },
      showBasis: true,
      showPriority: true,
      canAct: false,
      actionHint: 'Raise it with the teacher.',
    },
  };

  /**
   * Shape one canonical view for one role. The WEAKNESS does not change between
   * roles — topic, band and trend are identical by construction. Only what the
   * surface is allowed to do with it changes.
   */
  function forRole(view, role) {
    var cfg = ROLES[role];
    if (!view || !cfg) return null;
    return {
      role: role,
      topic: view.topic,
      subtopic: view.subtopic,
      lead: cfg.lead(view),
      band: view.band,
      bandLabel: view.bandLabel,
      bandTone: view.bandTone,
      // A null trend is absent from the output entirely, so a surface cannot
      // accidentally render a falsy value as "stable".
      trend: view.trend,
      trendLabel: view.trendLabel,
      showTrend: view.trend != null,
      priority: cfg.showPriority ? view.priority : null,
      lastSeen: view.lastSeen,
      basis: cfg.showBasis ? basisSentence(view) : null,
      hasExamEvidence: view.basis.hasExamEvidence,
      canAct: cfg.canAct,
      actionHint: cfg.actionHint,
    };
  }

  /** Order for display: the analyzer's own priority, then band, then recency. */
  function order(views) {
    return (views || []).slice().sort(function (a, b) {
      if (a.priority != null && b.priority != null && a.priority !== b.priority) return a.priority - b.priority;
      var ra = a.band ? BANDS[a.band].rank : 99, rb = b.band ? BANDS[b.band].rank : 99;
      if (ra !== rb) return ra - rb;
      return String(b.lastSignalAt || '').localeCompare(String(a.lastSignalAt || ''));
    });
  }

  window.WeaknessView = {
    canonical: canonical,
    forRole: forRole,
    basisSentence: basisSentence,
    order: order,
    SOURCE_LABELS: SOURCE_LABELS,
    BANDS: BANDS,
  };
}());
