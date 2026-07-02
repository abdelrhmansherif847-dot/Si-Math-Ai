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
 * Hard rules (enforced by keeping this the only implementation):
 *   - Display only. Never used for writes.
 *   - Never used for grouping / keys / joins / analytics.
 *   - No business logic — pure "canonical id, else resolve legacy name" → displayName.
 *
 * Load AFTER taxonomy.js in the browser.
 */
(function (root) {
  var T = (root && root.Taxonomy) || null;
  if (!T) return; // taxonomy.js must load first; no-op otherwise.

  // Master switch. Flip to false (or delete the file) to remove the layer.
  var ENABLED = true;

  function displayTopic(rec) {
    if (!rec) return null;
    if (rec.topic_id) return T.displayName(rec.topic_id);      // canonical: preferred
    if (!ENABLED) return null;
    var id = T.resolveTopicId(rec.topic);                       // legacy fallback (display)
    return id ? T.displayName(id) : (rec.topic || null);
  }

  function displaySubtopic(rec) {
    if (!rec) return null;
    if (rec.subtopic_id) return T.displayName(rec.subtopic_id); // canonical: preferred
    if (!ENABLED) return null;
    var tid = rec.topic_id || T.resolveTopicId(rec.topic);      // legacy fallback (display)
    var sid = tid ? T.resolveSubtopicId(tid, rec.subtopic) : null;
    return sid ? T.displayName(sid) : (rec.subtopic || null);
  }

  function displayForRecord(rec) {
    return { topic: displayTopic(rec), subtopic: displaySubtopic(rec) };
  }

  T.compat = {
    ENABLED: ENABLED,
    displayForRecord: displayForRecord,
    displayTopic: displayTopic,
    displaySubtopic: displaySubtopic,
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
