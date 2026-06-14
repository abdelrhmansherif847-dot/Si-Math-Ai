/**
 * Stage 4 — Report Regenerator
 *
 * Reads all weakness_signals for a user, runs the same formulas as the
 * Weakness Analyzer, and UPSERTs the results into weakness_reports.
 *
 * Exposed globals:
 *   window.regenerateWeaknessReports(sb, userId) → Promise<void>
 *   window.scheduleReportRegen(sb, userId)        debounced 5-second trigger
 */
(function () {
  var DAY = 86400000;

  /* ── Severity classification (Phase 2) ──
   * Analyzer is the SOLE authority for severity_band.
   * Thresholds live here only — consumers must not re-derive from mastery_score.
   * Bands map mastery_score → {critical,high,medium,low}.
   */
  var SEVERITY_THRESHOLDS = { critical: 30, high: 50, medium: 70 };
  function severityFromMastery(mastery) {
    if (mastery == null) return null;
    if (mastery < SEVERITY_THRESHOLDS.critical) return 'critical';
    if (mastery < SEVERITY_THRESHOLDS.high)     return 'high';
    if (mastery < SEVERITY_THRESHOLDS.medium)   return 'medium';
    return 'low';
  }

  /* ── Trend detection (Phase 3) ──
   * Analyzer is the SOLE authority for trend. Consumers must NOT re-derive.
   *
   * trend ∈ {improving, stable, declining, null}, derived from improvement_score.
   *
   * Confidence gate (MIN_HISTORY_FOR_TREND): below 5 signals on a topic, the
   * improvement_score is dominated by single-event noise (one signal added or
   * removed swings it by ~50–100%), so we hold trend = null until the topic has
   * enough density to make percentage-change meaningful. null also represents
   * the "improvement_score is null" case (no signals in the 7–14 day window),
   * giving consumers one unified "not enough history yet" state.
   */
  var TREND_THRESHOLDS = { improving: 5, declining: -5 };      // percentage-point bands
  var MIN_HISTORY_FOR_TREND = 5;                                // minimum total_signals
  function trendFromImprovement(imp, totalSignals) {
    if (imp == null) return null;
    if ((totalSignals || 0) < MIN_HISTORY_FOR_TREND) return null;
    if (imp >  TREND_THRESHOLDS.improving) return 'improving';
    if (imp <  TREND_THRESHOLDS.declining) return 'declining';
    return 'stable';
  }

  /* ── Core formulas (must match weakness.html exactly) ── */

  function computeMastery(signals, runNow) {
    // Phase 9: optional frozen wall-clock. Defaults to Date.now() for legacy callers.
    var now = (typeof runNow === 'number') ? runNow : Date.now();
    var total = signals.length;
    if (!total) return null;
    var last7 = 0, decayScore = 0;
    var weakSigs = 0, helpReqs = 0, repeated = 0, highConf = 0, understood = 0;
    for (var i = 0; i < signals.length; i++) {
      var s = signals[i];
      var t = new Date(s.created_at || 0).getTime();
      var age = now - t;
      decayScore += Math.exp(-age / (DAY * 14));
      if (age < 7 * DAY) last7++;
      var examMult = (s.source === 'MOCK_EXAM') ? 2 : 1;
      if (s.signal_type === 'topic' && (s.weight || 0) > 0.4) weakSigs += examMult;
      if (s.signal_type === 'multi_concept') helpReqs++;
      if (s.signal_type === 'repeated') repeated += examMult;
      if (s.signal_type === 'topic' && (s.weight != null ? s.weight : 1) < 0.3) highConf++;
      if (s.signal_type === 'resolution' && (s.weight || 0) < 0) understood++;
    }
    var chatWeaknessScore = weakSigs * 3 + helpReqs * 2 + repeated * 2;
    var baseScore = total * 1.5 + decayScore * 3 + last7 * 2;
    var positiveBoost = understood * 5 + highConf * 4;
    return Math.max(10, Math.min(95, Math.round(100 - (baseScore + chatWeaknessScore) * 4 + positiveBoost)));
  }

  function buildFromSignals(signals, runNow) {
    /*
     * decayed_weight(s) = s.weight × exp(−age_ms / (14×DAY))
     * weakness_score    = clamp(Σ decayed_weight / 5, 0, 1)
     * improvement_score = (prev7_raw − recent7_raw) / max(prev7_raw,0.01) × 100
     * mastery           = computeMastery(topicSignals, now)
     * priority_rank     = sort by mastery ASC, then weakness_score DESC,
     *                     then lexicographic topic|subtopic ASC (Phase 9 deterministic tiebreaker).
     *
     * Phase 9: runNow is a single frozen wall-clock timestamp captured once at
     * the top of regenerateWeaknessReports(). Threaded through here and into
     * computeMastery() so every age/decay/recency calculation inside one
     * analyzer run uses the same baseline. Identical input + identical runNow
     * ⇒ byte-identical output. Defaults to Date.now() for legacy callers.
     */
    var now = (typeof runNow === 'number') ? runNow : Date.now();
    var map = {};
    for (var i = 0; i < signals.length; i++) {
      var s = signals[i];
      var k = (s.topic || '') + '|' + (s.subtopic || '');
      if (!map[k]) {
        map[k] = {
          topic: s.topic || null,
          subtopic: s.subtopic || null,
          signals: [],
          totalDecayed: 0,
          recent7Raw: 0,
          prev7Raw: 0,
          resolveDecayed: 0,
          /* ── Phase 4 recency aggregates (ACTIVITY, not weakness) ──
           * recent7Count / recent14Count count EVERY signal_type — topic,
           * multi_concept, repeated, AND resolution. Semantics: how recently
           * the topic was touched in any way, NOT how many fresh weakness
           * signals fired.
           *
           * Implication: a topic where the student keeps clicking "Solved It"
           * registers as highly active. If we later need a weakness-only
           * recency count, Phase 6 (signal-family grouping) will introduce it
           * as a separate column; do not silently change the meaning of these.
           */
          recent7Count: 0,
          recent14Count: 0,
          lastSignalAt: null
        };
      }
      var e = map[k];
      var ts = new Date(s.created_at || 0).getTime();
      var age = now - ts;
      if (e.lastSignalAt == null || ts > e.lastSignalAt) e.lastSignalAt = ts;
      if (age < 7  * DAY) e.recent7Count++;
      if (age < 14 * DAY) e.recent14Count++;
      var decay = Math.exp(-age / (DAY * 14));
      var dw = (s.weight || 0) * decay;
      var raw = s.weight || 0;
      e.signals.push(s);
      if (s.signal_type === 'resolution') {
        e.resolveDecayed += dw;
      } else {
        e.totalDecayed += dw;
        if (age < 7 * DAY) e.recent7Raw += raw;
        else if (age < 14 * DAY) e.prev7Raw += raw;
      }
    }

    var entries = Object.values(map).map(function (e) {
      var netDecayed = e.totalDecayed + e.resolveDecayed;
      var ws = Math.max(0, Math.min(1, netDecayed / 5));
      var impScore = e.prev7Raw > 0
        ? Math.round((e.prev7Raw - e.recent7Raw) / Math.max(e.prev7Raw, 0.01) * 100)
        : null;
      var mastery = computeMastery(e.signals, now);
      return {
        topic: e.topic,
        subtopic: e.subtopic,
        weakness_score: ws,
        improvement_score: impScore,
        total_signals: e.signals.length,
        mastery_score: mastery,
        severity_band: severityFromMastery(mastery),
        trend: trendFromImprovement(impScore, e.signals.length),
        recent7_count: e.recent7Count,
        recent14_count: e.recent14Count,
        last_signal_at: e.lastSignalAt ? new Date(e.lastSignalAt).toISOString() : null,
        biggest_weakness: false,
        priority_rank: 0
      };
    }).filter(function (r) { return r.total_signals > 0; });

    // Sort: mastery ASC (lower = more urgent), then weakness_score DESC,
    // then lexicographic topic|subtopic ASC (Phase 9 deterministic tiebreaker —
    // resolves previously-undefined ordering for rows where mastery and weakness
    // are equal; live impact: 1 pair out of 30 rows, no current rank changes).
    entries.sort(function (a, b) {
      var ma = a.mastery_score != null ? a.mastery_score : 50;
      var mb = b.mastery_score != null ? b.mastery_score : 50;
      if (Math.abs(ma - mb) > 5) return ma - mb;
      if (a.weakness_score !== b.weakness_score) return b.weakness_score - a.weakness_score;
      var ka = (a.topic || '') + '|' + (a.subtopic || '');
      var kb = (b.topic || '') + '|' + (b.subtopic || '');
      return ka < kb ? -1 : ka > kb ? 1 : 0;
    });

    entries.forEach(function (e, i) {
      e.priority_rank = i + 1;
      e.biggest_weakness = i === 0;
    });

    return entries;
  }

  /* ── UPSERT engine ── */

  // ── Phase 9: in-flight de-duplication ──
  // Concurrent calls for the same user collapse to a single in-flight Promise.
  // If a call arrives while a regen is running, the user is flagged as "pending"
  // and exactly one fresh regen runs after the current one resolves — capturing
  // any signals that landed during the in-flight window.
  var _running = new Map();   // userId → Promise<void>
  var _pending = new Set();   // userId set

  async function regenerateWeaknessReports(sb, userId) {
    if (!sb || !userId) return;
    if (_running.has(userId)) {
      _pending.add(userId);
      return _running.get(userId);
    }
    var p = _doRegenerate(sb, userId).finally(function () {
      _running.delete(userId);
      if (_pending.has(userId)) {
        _pending.delete(userId);
        // Chain exactly one rerun to catch signals that landed mid-flight.
        regenerateWeaknessReports(sb, userId);
      }
    });
    _running.set(userId, p);
    return p;
  }

  async function _doRegenerate(sb, userId) {
    if (!sb || !userId) return;

    try {
      // Phase 9: capture wall-clock ONCE per run. Every age / decay / recency
      // calculation inside this run uses this frozen baseline.
      var runNow = Date.now();

      // Phase 9: parallel three-read — narrows the signals-vs-existing drift
      // window from two round-trips to one. Combined with the in-flight dedup,
      // concurrent same-user invocations cannot interleave reads inconsistently.
      var results = await Promise.all([
        sb.from('weakness_signals').select('*').eq('user_id', userId).order('created_at', { ascending: true }),
        sb.from('mastery_records').select('topic, subtopic, mastery_score').eq('user_id', userId),
        sb.from('weakness_reports').select('id, topic, subtopic').eq('user_id', userId)
      ]);

      var signals    = (results[0].data) || [];
      var mastRecs   = (results[1].data) || [];
      var _existing0 = (results[2].data) || [];  // used in step 3 below
      if (signals.length === 0) return; // nothing to compute

      // Build authoritative mastery lookup from mastery_records
      var mastMap = {};
      mastRecs.forEach(function (m) {
        if (m.topic && m.subtopic && m.mastery_score != null) {
          mastMap[(m.topic + '|' + m.subtopic).toLowerCase()] = Number(m.mastery_score);
        }
      });

      // 2. Compute new reports from signals (mastery_records overrides signal-computed mastery)
      // Phase 9: pass runNow so buildFromSignals/computeMastery use the same wall-clock.
      var computed = buildFromSignals(signals, runNow);

      // Inject authoritative mastery from mastery_records where available
      computed.forEach(function (c) {
        var k = ((c.topic || '') + '|' + (c.subtopic || '')).toLowerCase();
        if (mastMap[k] != null) {
          c.mastery_score = mastMap[k];
          // severity_band must always match the final mastery_score (Phase 2).
          c.severity_band = severityFromMastery(c.mastery_score);
        }
      });

      // Re-sort after mastery override (mastery_records may change ordering).
      // Phase 9: mirror the same deterministic tiebreaker as buildFromSignals.
      computed.sort(function (a, b) {
        var ma = a.mastery_score != null ? a.mastery_score : 50;
        var mb = b.mastery_score != null ? b.mastery_score : 50;
        if (Math.abs(ma - mb) > 5) return ma - mb;
        if (a.weakness_score !== b.weakness_score) return b.weakness_score - a.weakness_score;
        var ka = (a.topic || '') + '|' + (a.subtopic || '');
        var kb = (b.topic || '') + '|' + (b.subtopic || '');
        return ka < kb ? -1 : ka > kb ? 1 : 0;
      });
      computed.forEach(function (c, i) {
        c.priority_rank = i + 1;
        c.biggest_weakness = i === 0;
      });
      if (computed.length === 0) return;

      // 3. Phase 9: existing reports were loaded in the parallel Promise.all above
      // (results[2]) — re-using the same MVCC-close snapshot as signals + mastery.
      var existing = _existing0;
      var existMap = {};
      existing.forEach(function (r) {
        var k = (r.topic || '') + '|' + (r.subtopic || '');
        existMap[k] = r.id;
      });

      // 4. Split computed into updates vs inserts
      var now = new Date().toISOString();
      var toUpdate = [];
      var toInsert = [];
      var computedKeys = new Set();

      computed.forEach(function (c) {
        var k = (c.topic || '') + '|' + (c.subtopic || '');
        computedKeys.add(k);
        var row = {
          user_id: userId,
          topic: c.topic,
          subtopic: c.subtopic,
          weakness_score: c.weakness_score,
          mastery_score: c.mastery_score,
          improvement_score: c.improvement_score,
          total_signals: c.total_signals,
          priority_rank: c.priority_rank,
          biggest_weakness: c.biggest_weakness,
          severity_band: c.severity_band,
          trend: c.trend,
          recent7_count: c.recent7_count,
          recent14_count: c.recent14_count,
          last_signal_at: c.last_signal_at,
          last_updated: now
        };
        if (existMap[k] != null) {
          toUpdate.push(Object.assign({ id: existMap[k] }, row));
        } else {
          toInsert.push(Object.assign({ created_at: now }, row));
        }
      });

      // 5. Collect IDs of stale rows (topic no longer has signals)
      var toDeleteIds = existing
        .filter(function (r) {
          return !computedKeys.has((r.topic || '') + '|' + (r.subtopic || ''));
        })
        .map(function (r) { return r.id; });

      // 6. Execute all DB operations in parallel
      var ops = [];

      // Rollout-safe: if a phase-added column doesn't exist on the deployed DB yet,
      // strip the optional field and retry once. Keeps the analyzer working during
      // staged rollouts where code lands before the migration.
      var OPTIONAL_COLS = ['severity_band', 'trend', 'recent7_count', 'recent14_count', 'last_signal_at'];
      function stripOptional(row) {
        var clean = Object.assign({}, row);
        OPTIONAL_COLS.forEach(function (k) { delete clean[k]; });
        return clean;
      }
      function isMissingColumnError(err) {
        var m = (err && err.message) || '';
        return /column.*does not exist|schema cache/i.test(m);
      }

      if (toInsert.length > 0) {
        ops.push(
          sb.from('weakness_reports').insert(toInsert).then(function (res) {
            if (res.error && isMissingColumnError(res.error)) {
              return sb.from('weakness_reports').insert(toInsert.map(stripOptional)).then(function (r2) {
                if (r2.error) console.warn('[regenerate] insert error (after strip):', r2.error.message);
              });
            }
            if (res.error) console.warn('[regenerate] insert error:', res.error.message);
          })
        );
      }

      toUpdate.forEach(function (row) {
        var id = row.id;
        var payload = Object.assign({}, row);
        delete payload.id;
        ops.push(
          sb.from('weakness_reports').update(payload).eq('id', id).then(function (res) {
            if (res.error && isMissingColumnError(res.error)) {
              return sb.from('weakness_reports').update(stripOptional(payload)).eq('id', id).then(function (r2) {
                if (r2.error) console.warn('[regenerate] update error (after strip):', r2.error.message);
              });
            }
            if (res.error) console.warn('[regenerate] update error:', res.error.message);
          })
        );
      });

      if (toDeleteIds.length > 0) {
        ops.push(
          sb.from('weakness_reports').delete().in('id', toDeleteIds).then(function (res) {
            if (res.error) console.warn('[regenerate] delete error:', res.error.message);
          })
        );
      }

      await Promise.all(ops);

    } catch (err) {
      console.warn('[regenerate] failed:', err.message || err);
    }
  }

  /* ── Debounced scheduler (5-second window after last signal) ── */

  var _regenTimer = null;

  function scheduleReportRegen(sb, userId) {
    clearTimeout(_regenTimer);
    _regenTimer = setTimeout(function () {
      regenerateWeaknessReports(sb, userId);
    }, 5000);
  }

  /* ── Expose on window ── */
  window.regenerateWeaknessReports = regenerateWeaknessReports;
  window.scheduleReportRegen = scheduleReportRegen;

})();
