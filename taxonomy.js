/**
 * Taxonomy — single normalization authority for topic and subtopic strings.
 *
 * Environment-agnostic: attaches to window in browsers, exports via
 * module.exports in Node/edge-function environments.
 *
 * API:
 *   Taxonomy.normalizeTopic(s)    → canonical topic string
 *   Taxonomy.normalizeSubtopic(s) → canonical subtopic string
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.Taxonomy = factory();
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  /* ── Topic alias map ──
   * Keys are lowercase. Values are the canonical display form.
   * Add new aliases here; do not add them to individual callers.
   */
  var TOPIC_ALIASES = {
    'geometry':     'Geometry',
    'geometery':    'Geometry',
    'geomtry':      'Geometry',
    'algebra':      'Algebra',
    'algebera':     'Algebra',
    'algepra':      'Algebra',
    'trigonometry': 'Trigonometry',
    'trig':         'Trigonometry',
    'statistics':   'Statistics',
    'probability':  'Probability',
    'calculus':     'Calculus',
    'number theory':'Number Theory',
  };

  /* ── Subtopic alias map ──
   * Keys are lowercase (after parenthetical strip). Values are canonical.
   * Parenthetical qualifiers are stripped before alias lookup, so both
   * "Order of operations" and "Order of operations (PEMDAS)" resolve to
   * "Order of operations" via the alias map entry for 'order of operations'.
   */
  var SUBTOPIC_ALIASES = {
    'circle':                    'Circles',
    'circles':                   'Circles',
    'linear equation':           'Linear Equations',
    'linear equations':          'Linear Equations',
    'linear':                    'Linear',
    'order of operations':       'Order of operations',
    'pemdas':                    'Order of operations',
  };

  /* Strip trailing parenthetical qualifier, e.g. "Foo (Bar)" → "Foo" */
  function stripParens(s) {
    return s.replace(/\s*\([^)]+\)\s*$/, '').trim();
  }

  function normalizeTopic(s) {
    if (!s) return s;
    var t = s.trim();
    var lower = t.toLowerCase();
    return TOPIC_ALIASES[lower] || (t.charAt(0).toUpperCase() + t.slice(1));
  }

  function normalizeSubtopic(s) {
    if (!s) return s;
    var t = stripParens(s.trim());
    var lower = t.toLowerCase();
    return SUBTOPIC_ALIASES[lower] || t;
  }

  return {
    normalizeTopic:    normalizeTopic,
    normalizeSubtopic: normalizeSubtopic,
    /* Exposed for tests and introspection — do not mutate at runtime */
    _topicAliases:    TOPIC_ALIASES,
    _subtopicAliases: SUBTOPIC_ALIASES,
  };
}));
