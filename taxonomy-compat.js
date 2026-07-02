/*
 * taxonomy-compat.js — TEMPORARY MIGRATION COMPATIBILITY LAYER (Phase 5).
 *
 * ⚠️ NOT part of the permanent architecture. Delete this entire file at Phase 5
 * close, once every table's topic_id/subtopic_id is fully populated. Its removal
 * is a Phase 5 completion criterion.
 *
 * Purpose: the ONE place that translates a legacy record into DISPLAY strings
 * while some rows still have NULL topic_id/subtopic_id. Every consumer calls
 * Taxonomy.compat.displayForRecord() instead of writing its own fallback.
 *
 * Platform-neutral (single module — no duplicated logic):
 *   - Browser: load after taxonomy.js; attaches window.Taxonomy.compat.
 *   - Edge/Deno: import after _shared/taxonomy.core.js; attaches globalThis.Taxonomy.compat.
 *   - Node/bundlers: `require()` / import returns the same API via module.exports.
 * Taxonomy is resolved lazily from the global, so load order never matters.
 *
 * Hard rules: display only · never writes · never grouping/keys/joins/analytics ·
 * no business logic (canonical id, else resolve legacy name → displayName).
 */
(function (root) {
  function getT() {
    return (root && root.Taxonomy)
        || (typeof globalThis !== 'undefined' && globalThis.Taxonomy)
        || null;
  }
  var ENABLED = true; // flip to false / delete the file to remove the layer.

  function displayTopic(rec) {
    if (!rec) return null;
    var T = getT(); if (!T) return rec.topic || null;
    if (rec.topic_id) return T.displayName(rec.topic_id);       // canonical: preferred
    if (!ENABLED) return null;
    var id = T.resolveTopicId(rec.topic);                        // legacy fallback (display)
    return id ? T.displayName(id) : (rec.topic || null);
  }

  function displaySubtopic(rec) {
    if (!rec) return null;
    var T = getT(); if (!T) return rec.subtopic || null;
    if (rec.subtopic_id) return T.displayName(rec.subtopic_id);  // canonical: preferred
    if (!ENABLED) return null;
    var tid = rec.topic_id || T.resolveTopicId(rec.topic);       // legacy fallback (display)
    var sid = tid ? T.resolveSubtopicId(tid, rec.subtopic) : null;
    return sid ? T.displayName(sid) : (rec.subtopic || null);
  }

  function displayForRecord(rec) {
    return { topic: displayTopic(rec), subtopic: displaySubtopic(rec) };
  }

  var api = {
    ENABLED: ENABLED,
    displayForRecord: displayForRecord,
    displayTopic: displayTopic,
    displaySubtopic: displaySubtopic,
  };

  var T0 = getT();
  if (T0) T0.compat = api;                                        // browser + Edge/Deno
  if (typeof module !== 'undefined' && module.exports) module.exports = api; // Node / bundlers
})(typeof globalThis !== 'undefined' ? globalThis : this);
