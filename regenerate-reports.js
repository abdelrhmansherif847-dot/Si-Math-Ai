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

  /* ── Core formulas (must match weakness.html exactly) ── */

  function computeMastery(signals) {
    var now = Date.now();
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

  function buildFromSignals(signals) {
    /*
     * decayed_weight(s) = s.weight × exp(−age_ms / (14×DAY))
     * weakness_score    = clamp(Σ decayed_weight / 5, 0, 1)
     * improvement_score = (prev7_raw − recent7_raw) / max(prev7_raw,0.01) × 100
     * mastery           = computeMastery(topicSignals)
     * priority_rank     = sort by mastery ASC, then weakness_score DESC
     */
    var now = Date.now();
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
          resolveDecayed: 0
        };
      }
      var e = map[k];
      var age = now - new Date(s.created_at || 0).getTime();
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
      var mastery = computeMastery(e.signals);
      return {
        topic: e.topic,
        subtopic: e.subtopic,
        weakness_score: ws,
        improvement_score: impScore,
        total_signals: e.signals.length,
        mastery_score: mastery,
        biggest_weakness: false,
        priority_rank: 0
      };
    }).filter(function (r) { return r.total_signals > 0; });

    // Sort: mastery ASC (lower = more urgent), then weakness_score DESC
    entries.sort(function (a, b) {
      var ma = a.mastery_score != null ? a.mastery_score : 50;
      var mb = b.mastery_score != null ? b.mastery_score : 50;
      if (Math.abs(ma - mb) > 5) return ma - mb;
      return b.weakness_score - a.weakness_score;
    });

    entries.forEach(function (e, i) {
      e.priority_rank = i + 1;
      e.biggest_weakness = i === 0;
    });

    return entries;
  }

  /* ── UPSERT engine ── */

  async function regenerateWeaknessReports(sb, userId) {
    if (!sb || !userId) return;

    try {
      // 1. Load signals AND mastery_records in parallel
      var results = await Promise.all([
        sb.from('weakness_signals').select('*').eq('user_id', userId).order('created_at', { ascending: true }),
        sb.from('mastery_records').select('topic, subtopic, mastery_score').eq('user_id', userId)
      ]);

      var signals  = (results[0].data) || [];
      var mastRecs = (results[1].data) || [];
      if (signals.length === 0) return; // nothing to compute

      // Build authoritative mastery lookup from mastery_records
      var mastMap = {};
      mastRecs.forEach(function (m) {
        if (m.topic && m.subtopic && m.mastery_score != null) {
          mastMap[(m.topic + '|' + m.subtopic).toLowerCase()] = Number(m.mastery_score);
        }
      });

      // 2. Compute new reports from signals (mastery_records overrides signal-computed mastery)
      var computed = buildFromSignals(signals);

      // Inject authoritative mastery from mastery_records where available
      computed.forEach(function (c) {
        var k = ((c.topic || '') + '|' + (c.subtopic || '')).toLowerCase();
        if (mastMap[k] != null) {
          c.mastery_score = mastMap[k];
        }
      });

      // Re-sort after mastery override (mastery_records may change ordering)
      computed.sort(function (a, b) {
        var ma = a.mastery_score != null ? a.mastery_score : 50;
        var mb = b.mastery_score != null ? b.mastery_score : 50;
        if (Math.abs(ma - mb) > 5) return ma - mb;
        return b.weakness_score - a.weakness_score;
      });
      computed.forEach(function (c, i) {
        c.priority_rank = i + 1;
        c.biggest_weakness = i === 0;
      });
      if (computed.length === 0) return;

      // 3. Load existing reports to determine update vs insert
      var existRes = await sb
        .from('weakness_reports')
        .select('id, topic, subtopic')
        .eq('user_id', userId);

      var existing = (existRes.data) || [];
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

      if (toInsert.length > 0) {
        ops.push(
          sb.from('weakness_reports').insert(toInsert).then(function (res) {
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

      console.log(
        '[regenerate] done — ' + toInsert.length + ' inserted, ' +
        toUpdate.length + ' updated, ' + toDeleteIds.length + ' deleted'
      );

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
