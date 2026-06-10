/**
 * Stage 5 — Mastery Record Updater
 *
 * Updates mastery_records after every AI Tutor interaction and resolution event.
 * Mastery_records is the authoritative mastery source for Weakness Analyzer,
 * Focus Practice, and future Dashboard widgets.
 *
 * Exposed globals:
 *   window.MasteryEngine.onQuestion(sb, userId, topic, subtopic, opts)
 *     opts: { confidence, weaknessSignal, isMultiConcept, isRepeat }
 *   window.MasteryEngine.onResolution(sb, userId, topic, subtopic, resolution)
 *     resolution: 'solved' | 'partial' | 'confused'
 *
 * Persists:
 *   mastery_score, topic, subtopic, questions_seen (attempted),
 *   questions_correct, accuracy, last_updated
 *
 * Mastery formulas:
 *   Time decay: gentle 0.5%/day after 7-day grace window (max 20% loss)
 *   onQuestion delta:  confidenceDelta + weaknessDelta + multiPenalty + repeatPenalty
 *   onResolution delta: solved→+5, partial→+1, confused→−4
 *   Mastery clamped to [10, 95]
 */
(function () {

  /* ── Constants ── */
  var MASTERY_MIN = 10;
  var MASTERY_MAX = 95;
  var MASTERY_BASELINE = 50;  // starting mastery for new topic

  /* ── Time decay ──
   * No decay for the first 7 days after last activity.
   * After that: 0.5% per day, capped at 20% total loss.
   * Models natural forgetting without being too punishing.
   */
  function applyTimeDecay(mastery, lastUpdated) {
    if (!lastUpdated) return mastery;
    var daysSince = (Date.now() - new Date(lastUpdated).getTime()) / 86400000;
    if (daysSince < 7) return mastery;
    var decayPct = Math.min(0.20, (daysSince - 7) * 0.005);
    return Math.round(mastery * (1 - decayPct));
  }

  /* ── Delta functions ──
   * Confidence 1-5 (from conf selector):
   *   5 → +3 (very confident = strong signal of mastery)
   *   4 → +2
   *   3 → 0  (neutral)
   *   2 → -2
   *   1 → -3 (very unconfident = strong weakness signal)
   */
  function confidenceDelta(conf) {
    if (!conf || conf < 1) return 0;
    if (conf >= 5) return 3;
    if (conf >= 4) return 2;
    if (conf >= 3) return 0;
    if (conf >= 2) return -2;
    return -3;
  }

  /*
   * Weakness signal from AI backend:
   *   true  → AI detected weakness → -3
   *   false → AI found no weakness → +1
   *   null  → unknown → 0
   */
  function weaknessDelta(weaknessSignal) {
    if (weaknessSignal === true)  return -3;
    if (weaknessSignal === false) return 1;
    return 0;
  }

  /*
   * Resolution (user feedback after explanation):
   *   solved   → +5 (fully understood — biggest positive signal)
   *   partial  → +1 (some progress)
   *   confused → -4 (still lost — needs attention)
   */
  function resolutionDelta(resolution) {
    if (resolution === 'solved' || resolution === '1') return 5;
    if (resolution === 'partial')   return 1;
    if (resolution === 'confused')  return -4;
    return 0;
  }

  function clamp(val, min, max) {
    return Math.max(min, Math.min(max, Math.round(val)));
  }

  /* ── Fetch existing mastery record ── */
  async function fetchRecord(sb, userId, topic, subtopic) {
    var res = await sb.from('mastery_records')
      .select('id, mastery_score, questions_seen, questions_correct, accuracy, last_updated')
      .eq('user_id', userId)
      .eq('topic', topic)
      .eq('subtopic', subtopic)
      .maybeSingle();
    return res.data || null;
  }

  /* ── Write mastery record (update or insert) ── */
  async function writeRecord(sb, userId, topic, subtopic, fields) {
    var existing = fields._existing;
    var now = new Date().toISOString();

    var seen     = ((existing ? existing.questions_seen    : 0) || 0) + (fields.addAttempt ? 1 : 0);
    var correct  = ((existing ? existing.questions_correct : 0) || 0) + (fields.addCorrect ? 1 : 0);
    var accuracy = seen > 0 ? Math.round((correct / seen) * 100 * 10) / 10 : 0;  // 1dp %

    var row = {
      user_id:           userId,
      topic:             topic,
      subtopic:          subtopic,
      mastery_score:     fields.mastery,
      questions_seen:    seen,
      questions_correct: correct,
      accuracy:          accuracy,
      last_updated:      now
    };

    if (existing) {
      var { error } = await sb.from('mastery_records')
        .update({
          mastery_score:     row.mastery_score,
          questions_seen:    row.questions_seen,
          questions_correct: row.questions_correct,
          accuracy:          row.accuracy,
          last_updated:      row.last_updated
        })
        .eq('id', existing.id);
      if (error) console.warn('[mastery] update error:', error.message);
    } else {
      var { error: insErr } = await sb.from('mastery_records').insert(row);
      if (insErr) console.warn('[mastery] insert error:', insErr.message);
    }
  }

  /* ── MasteryEngine ── */
  var MasteryEngine = {

    /**
     * Called after every AI Tutor response for a math question.
     *
     * opts:
     *   confidence     {number}  1-5 from conf selector
     *   weaknessSignal {boolean|null} from Edge Function response
     *   isMultiConcept {boolean} question spans multiple topics
     *   isRepeat       {boolean} user has asked about this subtopic before (count>=2)
     */
    onQuestion: async function (sb, userId, topic, subtopic, opts) {
      if (!sb || !userId || !topic || !subtopic) return;
      opts = opts || {};

      try {
        var existing = await fetchRecord(sb, userId, topic, subtopic);
        var base = existing
          ? applyTimeDecay(Number(existing.mastery_score) || MASTERY_BASELINE, existing.last_updated)
          : MASTERY_BASELINE;

        var delta = confidenceDelta(opts.confidence)
                  + weaknessDelta(opts.weaknessSignal)
                  + (opts.isMultiConcept ? -1 : 0)
                  + (opts.isRepeat       ? -2 : 0);

        var newMastery = clamp(base + delta, MASTERY_MIN, MASTERY_MAX);

        // Count as correct when confidence is high (4-5) AND AI found no weakness
        var isCorrect = (opts.confidence != null && opts.confidence >= 4)
                     && opts.weaknessSignal !== true;

        await writeRecord(sb, userId, topic, subtopic, {
          _existing:   existing,
          mastery:     newMastery,
          addAttempt:  true,
          addCorrect:  isCorrect
        });

        // Cascade: re-sync weakness_reports
        if (window.scheduleReportRegen) window.scheduleReportRegen(sb, userId);

      } catch (err) {
        console.warn('[mastery] onQuestion failed:', err.message || err);
      }
    },

    /**
     * Called when the user clicks a resolution button (Solved It / Partial / Confused).
     * Applies an additional mastery delta on top of the question-level update.
     */
    onResolution: async function (sb, userId, topic, subtopic, resolution) {
      if (!sb || !userId || !topic || !subtopic) return;

      try {
        var existing = await fetchRecord(sb, userId, topic, subtopic);
        if (!existing) return; // no record yet — onQuestion should have fired first

        var base  = Number(existing.mastery_score) || MASTERY_BASELINE;
        var delta = resolutionDelta(resolution);
        var newMastery = clamp(base + delta, MASTERY_MIN, MASTERY_MAX);

        // 'solved' counts as an additional correct answer
        var isCorrect = (resolution === 'solved');

        await writeRecord(sb, userId, topic, subtopic, {
          _existing:  existing,
          mastery:    newMastery,
          addAttempt: false,  // attempt already counted in onQuestion
          addCorrect: isCorrect
        });

        if (window.scheduleReportRegen) window.scheduleReportRegen(sb, userId);

      } catch (err) {
        console.warn('[mastery] onResolution failed:', err.message || err);
      }
    },

    /**
     * Called from ExamMistakesLogger for each topic in the exam mistake list.
     *
     * opts:
     *   mistakeCount      {number}  mistakes on this topic (1+)
     *   priorSessionCount {number}  # of prior exam sessions with mistakes on this topic
     */
    onExamMistake: async function (sb, userId, topic, subtopic, opts) {
      if (!sb || !userId || !topic || !subtopic) return;
      opts = opts || {};

      try {
        var existing = await fetchRecord(sb, userId, topic, subtopic);
        var base = existing
          ? applyTimeDecay(Number(existing.mastery_score) || MASTERY_BASELINE, existing.last_updated)
          : MASTERY_BASELINE;

        // mistakeDelta: -3 per mistake, up to 3 mistakes (max -9)
        var mistakeDelta  = -3 * Math.min(opts.mistakeCount || 1, 3);
        // repeatPenalty: -2 per prior session, up to 3 prior sessions (max -6)
        var repeatPenalty = (opts.priorSessionCount || 0) >= 1
          ? -2 * Math.min(opts.priorSessionCount, 3)
          : 0;

        var delta      = mistakeDelta + repeatPenalty;
        var newMastery = clamp(base + delta, MASTERY_MIN, MASTERY_MAX);

        await writeRecord(sb, userId, topic, subtopic, {
          _existing:  existing,
          mastery:    newMastery,
          addAttempt: true,
          addCorrect: false
        });

        if (window.scheduleReportRegen) window.scheduleReportRegen(sb, userId);

      } catch (err) {
        console.warn('[mastery] onExamMistake failed:', err.message || err);
      }
    },

    /**
     * Called from mock-exam / future quiz sessions.
     * Bulk-updates mastery from a results array.
     *
     * results: [{ topic, subtopic, attempted, correct }]
     */
    onExamResults: async function (sb, userId, results) {
      if (!sb || !userId || !Array.isArray(results)) return;
      for (var i = 0; i < results.length; i++) {
        var r = results[i];
        if (!r.topic || !r.subtopic) continue;
        try {
          var existing = await fetchRecord(sb, userId, r.topic, r.subtopic);
          var base = existing
            ? applyTimeDecay(Number(existing.mastery_score) || MASTERY_BASELINE, existing.last_updated)
            : MASTERY_BASELINE;

          // Exam accuracy: 0-100% → map to mastery delta -10 to +10
          var examAcc  = r.attempted > 0 ? r.correct / r.attempted : 0;
          var examDelta = Math.round((examAcc - 0.5) * 20);  // 100% → +10, 0% → -10

          var newMastery = clamp(base + examDelta, MASTERY_MIN, MASTERY_MAX);

          await writeRecord(sb, userId, r.topic, r.subtopic, {
            _existing:  existing,
            mastery:    newMastery,
            addAttempt: false,  // exam counts are already totals — merge below
            addCorrect: false
          });

          // Also bump the raw counts from exam
          if (existing) {
            var totalSeen    = (existing.questions_seen    || 0) + (r.attempted || 0);
            var totalCorrect = (existing.questions_correct || 0) + (r.correct   || 0);
            var acc = totalSeen > 0 ? Math.round((totalCorrect / totalSeen) * 100 * 10) / 10 : 0;
            await sb.from('mastery_records')
              .update({ questions_seen: totalSeen, questions_correct: totalCorrect, accuracy: acc })
              .eq('id', existing.id);
          }
        } catch (err) {
          console.warn('[mastery] onExamResults error for', r.subtopic, ':', err.message);
        }
      }
      if (window.scheduleReportRegen) window.scheduleReportRegen(sb, userId);
    }
  };

  window.MasteryEngine = MasteryEngine;

})();
