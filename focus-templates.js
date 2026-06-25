/**
 * focus-templates.js — ID-keyed Focus Practice template engine (scaffolding).
 *
 * Phase 1: structure-only. The engine resolves a template by STABLE IDS ONLY —
 * never by display name — so future curriculum renames never affect Focus
 * Practice generation. A single default template reproduces today's behavior;
 * per-subtopic custom templates can be registered later with NO engine change.
 *
 *   Template
 *     → Rounds[]
 *         → Days[]
 *             → Missions[]
 *
 * Lookup contract (IDs only):
 *   templateFor({ topicId, subtopicId, problemType, taxonomyVersion })
 *
 * NOT wired into focus.html yet (that consumer is frozen and flips in a later
 * phase). Additive scaffolding only.
 *
 * UMD: window.FocusTemplates in browsers, module.exports in Node/Deno.
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.FocusTemplates = factory();
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  /* Registry keyed by a composite STABLE-ID string. Never keyed by name. */
  var REGISTRY = {};

  function keyOf(topicId, subtopicId, problemType, taxonomyVersion) {
    return [
      taxonomyVersion == null ? '*' : String(taxonomyVersion),
      topicId || '*',
      subtopicId || '*',
      problemType || '*',
    ].join('|');
  }

  /* The default template — mirrors the current hardcoded Focus Practice shape.
   * Kept generic so it applies to any subtopic until a custom one is registered. */
  var DEFAULT_TEMPLATE = {
    id: 'DEFAULT_V1',
    rounds: [
      {
        round: 1,
        days: [
          { day: 1, missions: [ { type: 'practice', count: 3 } ] },
          { day: 2, missions: [ { type: 'practice', count: 3 } ] },
          { day: 3, missions: [ { type: 'practice', count: 3 } ] },
        ],
      },
    ],
  };

  /* Register a custom template for a specific (id,id,problemType,version) tuple. */
  function register(spec, template) {
    if (!spec || !spec.topicId || !spec.subtopicId) {
      throw new Error('[focus-templates] register requires topicId and subtopicId');
    }
    REGISTRY[keyOf(spec.topicId, spec.subtopicId, spec.problemType, spec.taxonomyVersion)] = template;
  }

  /* Resolve the best template by ID, narrowest match first, default last.
   * Never accepts or compares display names. */
  function templateFor(spec) {
    spec = spec || {};
    if (!spec.topicId || !spec.subtopicId) {
      throw new Error('[focus-templates] templateFor requires topicId and subtopicId (IDs only, never names)');
    }
    var v = spec.taxonomyVersion, t = spec.topicId, s = spec.subtopicId, p = spec.problemType;
    var candidates = [
      keyOf(t, s, p, v),
      keyOf(t, s, p, undefined),
      keyOf(t, s, undefined, v),
      keyOf(t, s, undefined, undefined),
    ];
    for (var i = 0; i < candidates.length; i++) {
      if (REGISTRY[candidates[i]]) return REGISTRY[candidates[i]];
    }
    return DEFAULT_TEMPLATE;
  }

  return {
    templateFor: templateFor,
    register: register,
    DEFAULT_TEMPLATE: DEFAULT_TEMPLATE,
    _registry: REGISTRY,
    _keyOf: keyOf,
  };
}));
