/**
 * Stage 6 — Exam Mistakes Logger
 *
 * Orchestrates the full exam-mistake pipeline:
 *   1. Detect repeated topics across prior sessions (compound weight)
 *   2. Write weakness_signals with source='MOCK_EXAM' (higher authority than chat)
 *   3. Write 'repeated' signals for topics seen in ≥1 prior session
 *   4. Call MasteryEngine.onExamMistake() per topic
 *   5. Cascade into weakness_reports via regenerateWeaknessReports()
 *
 * Exposed global:
 *   window.ExamMistakesLogger.process(sb, userId, sessionId, mistakes, sessionStats)
 *
 *   mistakes: [{ topic, subtopic, count, question_id?, correct_answer?, student_answer? }]
 *   sessionStats: { correct, wrong, omitted, total_questions? }
 */
(function () {
  var DAY = 86400000;

  /* ── Signal weight formula ──
   * base  = clamp(1.5 + (mistakeCount-1)×0.5, 1.5, 4.0)
   * Prior sessions on same topic compound the weight:
   *   base = clamp(base × (1 + 0.3 × priorCount), 1.5, 4.0)
   */
  function examSignalWeight(mistakeCount, priorSessionCount) {
    var base = Math.max(1.5, Math.min(4.0, 1.5 + (mistakeCount - 1) * 0.5));
    if (priorSessionCount > 0) {
      base = Math.max(1.5, Math.min(4.0, base * (1 + 0.3 * priorSessionCount)));
    }
    return Math.round(base * 100) / 100;
  }

  /* ── Fetch prior exam_mistakes for this user (excluding the current session) ── */
  async function fetchPriorMistakes(sb, userId, currentSessionId) {
    var res = await sb
      .from('exam_mistakes')
      .select('topic, subtopic, session_id')
      .eq('user_id', userId)
      .neq('session_id', currentSessionId);
    return (res.data) || [];
  }

  /* ── Build a map: "topic|subtopic" → count of prior sessions ── */
  function buildPriorMap(priorMistakes) {
    var map = {};
    var sessionsByKey = {};
    for (var i = 0; i < priorMistakes.length; i++) {
      var m = priorMistakes[i];
      var k = (m.topic || '') + '|' + (m.subtopic || '');
      if (!sessionsByKey[k]) sessionsByKey[k] = new Set();
      sessionsByKey[k].add(m.session_id);
    }
    Object.keys(sessionsByKey).forEach(function (k) {
      map[k] = sessionsByKey[k].size;
    });
    return map;
  }

  /* ── Topic name normalizer ──
   * Delegates to window.Taxonomy (taxonomy.js) when available.
   * Inline fallback preserves behaviour during rollout if taxonomy.js
   * has not yet loaded.
   */
  function normalizeTopic(s) {
    if (typeof window !== 'undefined' && window.Taxonomy) return window.Taxonomy.normalizeTopic(s);
    if (!s) return s;
    var t = s.trim();
    return t.charAt(0).toUpperCase() + t.slice(1);
  }
  function normalizeSubtopic(s) {
    if (typeof window !== 'undefined' && window.Taxonomy) return window.Taxonomy.normalizeSubtopic(s);
    if (!s) return s;
    return s.replace(/\s*\([^)]+\)\s*$/, '').trim();
  }

  /* ── Main pipeline ── */
  var ExamMistakesLogger = {

    process: async function (sb, userId, sessionId, mistakes, sessionStats) {
      if (!sb || !userId || !sessionId || !Array.isArray(mistakes) || mistakes.length === 0) return;

      try {
        var priorMistakes = await fetchPriorMistakes(sb, userId, sessionId);
        var priorMap = buildPriorMap(priorMistakes);

        var now = new Date().toISOString();
        var signalsToInsert = [];

        for (var i = 0; i < mistakes.length; i++) {
          var m = mistakes[i];
          var topic    = normalizeTopic((m.topic || '').trim());
          var subtopic = normalizeSubtopic((m.subtopic || '').trim()); // keep as '' not null — weakness_signals.subtopic is NOT NULL
          if (!topic) continue;

          var count  = Math.max(1, m.count || 1);
          var key    = topic + '|' + (subtopic || '');
          var priorCount = priorMap[key] || 0;

          var weight = examSignalWeight(count, priorCount);

          // Primary exam-mistake signal
          signalsToInsert.push({
            user_id:     userId,
            topic:       topic,
            subtopic:    subtopic,
            signal_type: 'topic',
            source:      'MOCK_EXAM',
            weight:      weight,
            created_at:  now
          });

          // Repeated signal if seen in prior sessions
          if (priorCount > 0) {
            signalsToInsert.push({
              user_id:     userId,
              topic:       topic,
              subtopic:    subtopic,
              signal_type: 'repeated',
              source:      'MOCK_EXAM',
              weight:      Math.min(2.0, 0.5 * priorCount),
              created_at:  now
            });
          }
        }

        // Write all signals in one batch
        if (signalsToInsert.length > 0) {
          var { error: sigErr } = await sb.from('weakness_signals').insert(signalsToInsert);
          if (sigErr) console.warn('[exam-logger] signals insert error:', sigErr.message);
        }

        // Update mastery per unique topic|subtopic
        if (window.MasteryEngine) {
          var seen = {};
          for (var j = 0; j < mistakes.length; j++) {
            var mk = mistakes[j];
            var t  = normalizeTopic((mk.topic || '').trim());
            var st = normalizeSubtopic((mk.subtopic || '').trim()); // keep as '' not null
            if (!t) continue;
            var ukey = t + '|' + (st || '');
            if (seen[ukey]) continue;
            seen[ukey] = true;

            var c       = Math.max(1, mk.count || 1);
            var pCount  = priorMap[t + '|' + (st || '')] || 0;
            await window.MasteryEngine.onExamMistake(sb, userId, t, st, {
              mistakeCount:      c,
              priorSessionCount: pCount
            });
          }
        }

        // Cascade: rebuild weakness_reports
        if (window.regenerateWeaknessReports) {
          await window.regenerateWeaknessReports(sb, userId);
        }

      } catch (err) {
        console.warn('[exam-logger] process failed:', err.message || err);
      }
    }
  };

  window.ExamMistakesLogger = ExamMistakesLogger;

})();
