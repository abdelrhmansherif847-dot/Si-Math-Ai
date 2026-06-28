/**
 * taxonomy-write.js — the single write-boundary helper for the canonical taxonomy.
 *
 * Every client writer (Mock Exam, Focus, Reports, Mastery, Chat) MUST go through
 * this module so that:
 *   - only canonical taxonomy IDs + canonical display names are ever written,
 *   - no passthrough / raw / AI-invented names reach the database,
 *   - every unmapped detection is logged through ONE path (log_unmapped_detection
 *     RPC) — no duplicate logging implementations.
 *
 * Depends on window.Taxonomy (taxonomy.js). UMD: window.TaxonomyWrite in the
 * browser, module.exports in Node/Deno (the Edge Function calls the same RPC
 * directly with the service role, so it does not import this file).
 *
 * API:
 *   TaxonomyWrite.canonical({ topic, subtopic, wordProblem }) ->
 *     { topic, subtopic, topic_id, subtopic_id, problem_type, taxonomy_version }
 *     | null   (null = unmapped → caller logs via logUnmapped and SKIPS the write)
 *
 *   TaxonomyWrite.columns(canon) -> the 4 taxonomy columns to merge into a row.
 *
 *   TaxonomyWrite.logUnmapped(sb, { rawTopic, rawSubtopic, rawProblemType,
 *                                   source, userId, context }) -> Promise
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else root.TaxonomyWrite = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  function tax() {
    return (typeof window !== 'undefined' && window.Taxonomy) ||
           (typeof globalThis !== 'undefined' && globalThis.Taxonomy) || null;
  }

  /* Resolve raw detection → canonical write fields, or null (reject). */
  function canonical(input) {
    var T = tax();
    if (!T || typeof T.resolve !== 'function') return null;
    var r = T.resolve({
      topic: input && input.topic,
      subtopic: input && input.subtopic,
      wordProblem: input ? input.wordProblem : undefined,
    });
    if (!r) return null;
    return {
      topic:            r.topicName,                 // canonical display name only
      subtopic:         r.subtopicName || '',        // '' (not null) for topic-level
      topic_id:         r.topicId,
      subtopic_id:      r.subtopicId || null,
      problem_type:     r.problemType,
      taxonomy_version: r.taxonomyVersion,
    };
  }

  /* Just the taxonomy columns (for spreading into an insert/update row). */
  function columns(canon) {
    if (!canon) return {};
    return {
      topic_id:         canon.topic_id,
      subtopic_id:      canon.subtopic_id,
      problem_type:     canon.problem_type,
      taxonomy_version: canon.taxonomy_version,
    };
  }

  /* The ONE logging path. Fire-and-forget; never throws into the caller. */
  function logUnmapped(sb, info) {
    info = info || {};
    var T = tax();
    var ver = (T && T.TAXONOMY_VERSION) || 1;
    // Never log known system / non-academic topics (e.g. 'General', 'Coaching').
    // They are intentionally non-academic — not alias-curation candidates — so
    // logging them would pollute unmapped_detections and add a per-turn DB write
    // on non-math turns. Only academic-but-unmapped detections are worth logging.
    if (T && typeof T.isAcademicTopic === 'function' && !T.isAcademicTopic(info.rawTopic)) {
      return Promise.resolve();
    }
    try {
      var p = sb.rpc('log_unmapped_detection', {
        p_raw_topic:        info.rawTopic != null ? String(info.rawTopic) : null,
        p_raw_subtopic:     info.rawSubtopic != null ? String(info.rawSubtopic) : null,
        p_raw_problem_type: info.rawProblemType || null,
        p_source:           info.source || null,            // 'chat' | 'mock' | 'focus'
        p_user_id:          info.userId || null,
        p_context:          info.context || null,
        p_taxonomy_version: ver,
      });
      if (p && typeof p.then === 'function') {
        return p.then(function (res) {
          if (res && res.error) console.warn('[taxonomy-write] logUnmapped error:', res.error.message);
        }, function (e) { console.warn('[taxonomy-write] logUnmapped threw:', (e && e.message) || e); });
      }
      return Promise.resolve();
    } catch (e) {
      console.warn('[taxonomy-write] logUnmapped threw:', (e && e.message) || e);
      return Promise.resolve();
    }
  }

  return { canonical: canonical, columns: columns, logUnmapped: logUnmapped };
}));
