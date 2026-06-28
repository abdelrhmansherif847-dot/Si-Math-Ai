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
      // Canonicalize prior mistakes so keys match the current canonical signals.
      // Unmapped priors simply do not contribute to the compound weight.
      var pc = canonOf(m);
      if (!pc) continue;
      var k = pc.topic + '|' + (pc.subtopic || '');
      if (!sessionsByKey[k]) sessionsByKey[k] = new Set();
      sessionsByKey[k].add(m.session_id);
    }
    Object.keys(sessionsByKey).forEach(function (k) {
      map[k] = sessionsByKey[k].size;
    });
    return map;
  }

  /* ── Canonical resolver (Phase 3) ──
   * Routes every mock-exam mistake through the single taxonomy write boundary.
   * Returns the canonical write fields, or null when the detection cannot be
   * mapped (caller logs it via TaxonomyWrite.logUnmapped and SKIPS the write —
   * no passthrough names are ever stored).
   */
  function canonOf(m) {
    if (typeof window === 'undefined' || !window.TaxonomyWrite) return null;
    return window.TaxonomyWrite.canonical({
      topic: (m && m.topic) || '',
      subtopic: (m && m.subtopic) || '',
      wordProblem: m ? m.word_problem : undefined,
    });
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
          // Phase 3: resolve to canonical taxonomy. Unmapped → log once via the
          // shared path and SKIP (never store a passthrough/raw name).
          var canon = canonOf(m);
          if (!canon) {
            if (window.TaxonomyWrite) window.TaxonomyWrite.logUnmapped(sb, {
              rawTopic: m.topic, rawSubtopic: m.subtopic, source: 'mock', userId: userId,
            });
            continue;
          }
          var topic    = canon.topic;
          var subtopic = canon.subtopic; // '' not null — weakness_signals.subtopic is NOT NULL
          var taxCols  = {
            topic_id: canon.topic_id, subtopic_id: canon.subtopic_id,
            problem_type: canon.problem_type, taxonomy_version: canon.taxonomy_version,
          };

          var count  = Math.max(1, m.count || 1);
          var key    = topic + '|' + (subtopic || '');
          var priorCount = priorMap[key] || 0;

          var weight = examSignalWeight(count, priorCount);

          // question_id is an optional field on each mistake; null when not provided.
          var qId = m.question_id || null;

          // Primary exam-mistake signal
          signalsToInsert.push(Object.assign({
            user_id:              userId,
            topic:                topic,
            subtopic:             subtopic,
            signal_type:          'topic',
            source:               'MOCK_EXAM',
            weight:               weight,
            created_at:           now,
            source_session_id:    sessionId,
            source_question_id:   qId,
          }, taxCols));

          // Repeated signal if seen in prior sessions
          if (priorCount > 0) {
            signalsToInsert.push(Object.assign({
              user_id:            userId,
              topic:              topic,
              subtopic:           subtopic,
              signal_type:        'repeated',
              source:             'MOCK_EXAM',
              weight:             Math.min(2.0, 0.5 * priorCount),
              created_at:         now,
              source_session_id:  sessionId,
              source_question_id: qId,
            }, taxCols));
          }

          // exam_confused: persistent exam failure across ≥2 prior sessions —
          // escalation marker that the student has been repeatedly examined and
          // continues to struggle. Supplements (does not replace) the topic signal.
          if (priorCount >= 2) {
            signalsToInsert.push(Object.assign({
              user_id:            userId,
              topic:              topic,
              subtopic:           subtopic,
              signal_type:        'exam_confused',
              source:             'MOCK_EXAM',
              weight:             1.2,
              created_at:         now,
              source_session_id:  sessionId,
              source_question_id: qId,
            }, taxCols));
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
            var ck = canonOf(mk);
            if (!ck) continue; // unmapped already logged in the signal loop above
            var t  = ck.topic;
            var st = ck.subtopic; // '' not null
            var ukey = t + '|' + (st || '');
            if (seen[ukey]) continue;
            seen[ukey] = true;

            var c       = Math.max(1, mk.count || 1);
            var pCount  = priorMap[t + '|' + (st || '')] || 0;
            await window.MasteryEngine.onExamMistake(sb, userId, t, st, {
              mistakeCount:      c,
              priorSessionCount: pCount,
              problem_type:      ck.problem_type,
              topic_id:          ck.topic_id,
              subtopic_id:       ck.subtopic_id
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
