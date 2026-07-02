/**
 * kdg-representation.js — the REPRESENTATION axis of the Knowledge Dependency
 * Graph (KDG). Single authored source of truth for how a lesson can be presented.
 *
 * Conforms to docs/roadmap/kdg-multi-axis-architecture.md (the approved
 * architecture is the source of truth; this module implements it).
 *
 * ── TWO INDEPENDENT LAYERS ─────────────────────────────────────────────────
 *   KNOWLEDGE      (taxonomy.core.js): WHAT the student is learning — lessons.
 *   REPRESENTATION (this file):        HOW that lesson may be presented.
 * Changing the representation of a question never changes the underlying lesson
 * node: "Quadratics as a graph" and "Quadratics as a word problem" are the SAME
 * lesson (ALG_010) in two representations.
 *
 * ── CAPABILITY + AFFINITY (NOT universal membership) ───────────────────────
 * A lesson is NOT representable in every form. "Order of Operations as a Graph"
 * and "Stem-and-Leaf as a Standard Equation" are not merely uncommon — they are
 * INVALID. The axis therefore carries two distinct relations (architecture §2.1):
 *
 *   • CAPABILITY (hard gate, boolean): is a representation VALID for a lesson?
 *       Produced HYBRID (architecture §6):
 *         rule baseline  — derived from the lesson's structural-type tag, then
 *         expert override — a small curated exception table (human-authoritative),
 *       with precedence  expert override > rule.
 *   • AFFINITY (soft rank, [0,1]): among CAPABLE representations, how natural /
 *       common / effective? LEARNED from performance data; here it is a cold-start
 *       default with an injection hook (LEARNED_AFFINITY). Learning tunes affinity
 *       continuously; it never silently flips capability (that goes to review).
 *
 * ── THE SEVEN REPRESENTATIONS ──────────────────────────────────────────────
 *   Word Problem · Standard Equation · Simple Equation · Graph · Table ·
 *   Diagram/Figure · Real-life Scenario.
 * Multiple Choice / Short Answer / Grid-in are NOT representations — they encode
 * the RESPONSE channel, an orthogonal axis. They move to a separate ASSESSMENT
 * vocabulary (future, item metadata — architecture §2.2). They are intentionally
 * absent here.
 *
 * ── REASONING LAYER (prepared, NOT implemented) ────────────────────────────
 * A future deep graph layer (sub-skills + error mechanisms) sits between
 * Knowledge and the surface axes (architecture §5). It is deliberately not built
 * here. describeNode() returns a `knowledge` block that a Reasoning block will
 * later sit beside; nothing in this module needs to change to add it.
 *
 * ── problem_type BRIDGE (unchanged) ────────────────────────────────────────
 * The legacy binary problem_type ∈ { concept, word_problem } is bridged both
 * ways (fromProblemType / toProblemType) so consumers adopt the richer vocabulary
 * with no schema change. No database column is introduced.
 *
 * ── DEPENDENCIES ───────────────────────────────────────────────────────────
 * No hard dependency on the taxonomy. Capability is computed from an internal
 * structural-type tag map keyed by taxonomy subtopic ids (soft, string-level
 * coupling). Enrichment helpers (describeNode, lessonIds, allEdges) OPTIONALLY
 * read a global `Taxonomy` and degrade gracefully when it is absent.
 *
 * Environment-agnostic UMD: attaches window.KDGRepresentation in the browser,
 * exports via module.exports in Node / Deno. The Edge Function does NOT import
 * this file (integration is a separate, gated task — architecture §4).
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.KDGRepresentation = factory();
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  /* ════════════════════════════════════════════════════════════════════════
   * SECTION 1 — VERSION
   * Bumped to 2: Assessment removed (9→7 representations) and the universal
   * membership model replaced by capability + affinity. A representation id may
   * be persisted, so ids remain permanent; only the set and semantics changed.
   * ════════════════════════════════════════════════════════════════════════ */
  var REPRESENTATION_LAYER_VERSION = 2;

  /* ════════════════════════════════════════════════════════════════════════
   * SECTION 2 — CANONICAL REPRESENTATIONS (id → displayName)
   * IDs are PERMANENT, OPAQUE UPPER_SNAKE constants. `legacyProblemType` records
   * how each maps onto the binary problem_type field (see the bridges).
   * ════════════════════════════════════════════════════════════════════════ */
  var REPRESENTATIONS = [
    {
      id: 'WORD_PROBLEM', displayName: 'Word Problem', legacyProblemType: 'word_problem',
      description: 'The concept stated as a text problem the student must translate into math.',
    },
    {
      id: 'STANDARD_EQUATION', displayName: 'Standard Equation', legacyProblemType: 'concept',
      description: 'The symbolic form, e.g. ax + by = c or ax² + bx + c = 0.',
    },
    {
      id: 'SIMPLE_EQUATION', displayName: 'Simple Equation', legacyProblemType: 'concept',
      description: 'A stripped-down symbolic form, e.g. x + 3 = 7.',
    },
    {
      id: 'GRAPH', displayName: 'Graph', legacyProblemType: 'concept',
      description: 'The concept shown visually on axes, e.g. the parabola of y = x².',
    },
    {
      id: 'TABLE', displayName: 'Table', legacyProblemType: 'concept',
      description: 'A table of values / data form of the concept.',
    },
    {
      id: 'DIAGRAM', displayName: 'Diagram / Figure', legacyProblemType: 'concept',
      description: 'A geometric figure, drawing, or labelled diagram.',
    },
    {
      id: 'REAL_LIFE', displayName: 'Real-life Scenario', legacyProblemType: 'word_problem',
      description: 'The concept embedded in a real-world / applied situation.',
    },
    // NOTE: Multiple Choice / Short Answer / Grid-in intentionally removed — they
    // are RESPONSE formats (an Assessment axis, item metadata), not content
    // representations. See architecture §2.2. A separate Assessment vocabulary
    // will own them; do not re-add them here.
  ];

  /* Enum-style id constants for callers: KDGRepresentation.REPRESENTATION.GRAPH. */
  var REPRESENTATION = {};
  var REPRESENTATION_IDS = [];
  var REP_BY_ID = {};
  REPRESENTATIONS.forEach(function (r) {
    REPRESENTATION[r.id] = r.id;
    REPRESENTATION_IDS.push(r.id);
    REP_BY_ID[r.id] = r;
  });

  /* ════════════════════════════════════════════════════════════════════════
   * SECTION 3 — ALIAS MAPPING (normalized raw label → representation id)
   * Keys are normalizeKey()'d. Seeded from the KDG infographic vocabulary
   * ("Normal Equation", "Small Equation"), common AI wording, and Arabic.
   * ════════════════════════════════════════════════════════════════════════ */
  var REPRESENTATION_ALIASES = {
    // Word Problem
    'word problem': 'WORD_PROBLEM', 'word problems': 'WORD_PROBLEM',
    'wordproblem': 'WORD_PROBLEM', 'word_problem': 'WORD_PROBLEM',
    'story problem': 'WORD_PROBLEM', 'story problems': 'WORD_PROBLEM',
    'worded problem': 'WORD_PROBLEM', 'text problem': 'WORD_PROBLEM',
    'مسألة كلامية': 'WORD_PROBLEM', 'مسائل كلامية': 'WORD_PROBLEM',
    'مسالة كلامية': 'WORD_PROBLEM',
    // Standard Equation  (infographic: "Normal Equation / Symbolic Form")
    'standard equation': 'STANDARD_EQUATION', 'standard equations': 'STANDARD_EQUATION',
    'standard form': 'STANDARD_EQUATION', 'normal equation': 'STANDARD_EQUATION',
    'symbolic': 'STANDARD_EQUATION', 'symbolic form': 'STANDARD_EQUATION',
    'symbolic equation': 'STANDARD_EQUATION', 'algebraic equation': 'STANDARD_EQUATION',
    'equation': 'STANDARD_EQUATION', 'equations': 'STANDARD_EQUATION',
    'formula': 'STANDARD_EQUATION', 'معادلة': 'STANDARD_EQUATION',
    'معادلة قياسية': 'STANDARD_EQUATION',
    // Simple Equation  (infographic: "Small Equation / Simple Form")
    'simple equation': 'SIMPLE_EQUATION', 'simple equations': 'SIMPLE_EQUATION',
    'small equation': 'SIMPLE_EQUATION', 'simple form': 'SIMPLE_EQUATION',
    'simple': 'SIMPLE_EQUATION', 'basic equation': 'SIMPLE_EQUATION',
    'one-step equation': 'SIMPLE_EQUATION', 'one step equation': 'SIMPLE_EQUATION',
    'معادلة بسيطة': 'SIMPLE_EQUATION',
    // Graph  (Visual Form)
    'graph': 'GRAPH', 'graphs': 'GRAPH', 'graphical': 'GRAPH', 'graphing': 'GRAPH',
    'plot': 'GRAPH', 'plots': 'GRAPH', 'coordinate graph': 'GRAPH',
    'line graph': 'GRAPH', 'curve': 'GRAPH', 'chart': 'GRAPH', 'charts': 'GRAPH',
    'رسم بياني': 'GRAPH', 'تمثيل بياني': 'GRAPH',
    // Table  (Data Form)
    'table': 'TABLE', 'tables': 'TABLE', 'table of values': 'TABLE',
    'data table': 'TABLE', 'value table': 'TABLE', 'جدول': 'TABLE', 'جدول قيم': 'TABLE',
    // Diagram / Figure
    'diagram': 'DIAGRAM', 'diagrams': 'DIAGRAM', 'figure': 'DIAGRAM', 'figures': 'DIAGRAM',
    'geometry figure': 'DIAGRAM', 'geometric figure': 'DIAGRAM', 'geometry diagram': 'DIAGRAM',
    'shape': 'DIAGRAM', 'drawing': 'DIAGRAM', 'illustration': 'DIAGRAM',
    'رسم': 'DIAGRAM', 'شكل': 'DIAGRAM', 'رسم هندسي': 'DIAGRAM',
    // Real-life Scenario
    'real-life scenario': 'REAL_LIFE', 'real life scenario': 'REAL_LIFE',
    'real-life': 'REAL_LIFE', 'real life': 'REAL_LIFE', 'real world': 'REAL_LIFE',
    'real-world': 'REAL_LIFE', 'real-world scenario': 'REAL_LIFE',
    'real world scenario': 'REAL_LIFE', 'application': 'REAL_LIFE',
    'applied': 'REAL_LIFE', 'scenario': 'REAL_LIFE', 'context problem': 'REAL_LIFE',
    'practical': 'REAL_LIFE', 'موقف واقعي': 'REAL_LIFE', 'سيناريو واقعي': 'REAL_LIFE',
  };

  /* ════════════════════════════════════════════════════════════════════════
   * SECTION 4 — KEY NORMALIZATION + RESOLVER (no passthrough)
   * ════════════════════════════════════════════════════════════════════════ */
  function stripParens(s) { return s.replace(/\s*\([^)]+\)\s*$/, '').trim(); }
  function normalizeKey(s) {
    if (s == null) return '';
    var t = String(s).normalize ? String(s).normalize('NFC') : String(s);
    return stripParens(t.trim().toLowerCase());
  }

  function isRepresentationId(id) {
    return typeof id === 'string' && Object.prototype.hasOwnProperty.call(REP_BY_ID, id);
  }

  /* resolveRepresentation(raw) → permanent representation id | null (reject).
   * Accepts a canonical id (case-insensitive), a known alias, or a canonical
   * display name. Unmapped → null (never a guess). Removed Assessment labels
   * (MCQ, short answer, grid-in) now correctly resolve to null. */
  function resolveRepresentation(raw) {
    if (raw == null) return null;
    var asId = String(raw).trim().toUpperCase();
    if (isRepresentationId(asId)) return asId;                 // raw was already an id
    var key = normalizeKey(raw);
    if (!key) return null;
    if (REPRESENTATION_ALIASES[key]) return REPRESENTATION_ALIASES[key];
    return null;
  }

  function isRepresentation(raw) { return resolveRepresentation(raw) !== null; }

  function displayName(id) { return REP_BY_ID[id] ? REP_BY_ID[id].displayName : null; }

  function describe(id) {
    var r = REP_BY_ID[id];
    if (!r) return null;
    return { id: r.id, displayName: r.displayName, description: r.description };
  }

  function representationIds() { return REPRESENTATION_IDS.slice(); }

  /* ════════════════════════════════════════════════════════════════════════
   * SECTION 5 — CAPABILITY (hybrid: rule baseline + expert overrides)
   *
   * Structural types classify a lesson by which representations it AFFORDS. This
   * is the O(lessons) tagging that replaces an O(lessons × reps) matrix. The
   * afford sets below are the INITIAL BASELINE and mirror the matrix in
   * architecture §2.1 — pending capability-authority sign-off (open question §7.1).
   * ════════════════════════════════════════════════════════════════════════ */
  var STRUCTURAL_TYPE = {
    PROCEDURAL: 'PROCEDURAL',       // arithmetic / symbolic manipulation
    FUNCTIONAL: 'FUNCTIONAL',       // functions / relations (graphable)
    DATA: 'DATA',                   // data / distribution displays
    GEOMETRIC: 'GEOMETRIC',         // figures / spatial
    COMBINATORIAL: 'COMBINATORIAL', // counting / probability
  };

  /* structuralType → the representations it affords by RULE (the baseline). */
  var RULE_AFFORDS = {
    PROCEDURAL:    ['WORD_PROBLEM', 'REAL_LIFE', 'SIMPLE_EQUATION'],
    FUNCTIONAL:    ['WORD_PROBLEM', 'REAL_LIFE', 'SIMPLE_EQUATION', 'STANDARD_EQUATION', 'GRAPH', 'TABLE'],
    DATA:          ['WORD_PROBLEM', 'REAL_LIFE', 'TABLE', 'DIAGRAM', 'GRAPH'],
    GEOMETRIC:     ['WORD_PROBLEM', 'REAL_LIFE', 'DIAGRAM', 'STANDARD_EQUATION'],
    COMBINATORIAL: ['WORD_PROBLEM', 'REAL_LIFE', 'TABLE', 'STANDARD_EQUATION'],
  };

  /* lesson (taxonomy subtopic id) → structural type. Keep in sync with the
   * taxonomy SUBTOPICS (validate-kdg-representation.mjs guards coverage/orphans). */
  var LESSON_STRUCTURAL_TYPE = {
    // Algebra
    ALG_001: 'PROCEDURAL',  ALG_002: 'PROCEDURAL',  ALG_003: 'PROCEDURAL',
    ALG_004: 'FUNCTIONAL',  ALG_005: 'PROCEDURAL',  ALG_006: 'FUNCTIONAL',
    ALG_007: 'FUNCTIONAL',  ALG_008: 'FUNCTIONAL',  ALG_009: 'FUNCTIONAL',
    ALG_010: 'FUNCTIONAL',  ALG_011: 'FUNCTIONAL',  ALG_012: 'FUNCTIONAL',
    // Functions
    FUN_001: 'FUNCTIONAL',  FUN_002: 'FUNCTIONAL',
    // Geometry
    GEO_001: 'GEOMETRIC',   GEO_002: 'GEOMETRIC',   GEO_003: 'GEOMETRIC',
    GEO_004: 'GEOMETRIC',   GEO_005: 'GEOMETRIC',   GEO_006: 'GEOMETRIC',
    GEO_007: 'GEOMETRIC',   GEO_008: 'FUNCTIONAL',  // coordinate geometry ≈ graph-based
    // Statistics
    STA_001: 'DATA',        STA_002: 'DATA',        STA_003: 'DATA',
    STA_004: 'DATA',        STA_005: 'DATA',
    // Probability & Ratios
    PR_001: 'COMBINATORIAL', PR_002: 'COMBINATORIAL', PR_003: 'PROCEDURAL',
    PR_004: 'FUNCTIONAL',    PR_005: 'FUNCTIONAL',    PR_006: 'PROCEDURAL',
  };

  /* Expert capability overrides (human-authoritative) — precedence over the rule.
   * Each entry maps a representation id to an explicit true/false, correcting a
   * known rule miss. Kept deliberately small; grows only via curation.
   *   ALG_005 Complex Numbers → Graph: VALID via the Argand plane, though the
   *   PROCEDURAL rule would exclude it (architecture §6 canonical example). */
  var EXPERT_CAPABILITY_OVERRIDES = {
    ALG_005: { GRAPH: true },
  };

  /* structuralTypeOf(lessonId) → type | null (untagged). */
  function structuralTypeOf(lessonId) { return LESSON_STRUCTURAL_TYPE[lessonId] || null; }

  /* capabilityOf(lessonId, repId) → true | false | null.
   *   false = invalid representation id, OR explicitly not-capable (rule/override);
   *   true  = capable; null = lesson untagged (capability unknown). */
  function capabilityOf(lessonId, repId) {
    if (!isRepresentationId(repId)) return false;
    var ov = EXPERT_CAPABILITY_OVERRIDES[lessonId];
    if (ov && Object.prototype.hasOwnProperty.call(ov, repId)) return ov[repId] === true;
    var type = LESSON_STRUCTURAL_TYPE[lessonId];
    if (!type) return null;                                    // unknown lesson
    return (RULE_AFFORDS[type] || []).indexOf(repId) !== -1;
  }

  /* canRepresent(lessonId, representationId) → boolean.
   * The hard gate. Blocks only EXPLICITLY not-capable pairs; an untagged lesson
   * stays permissive (null → allowed) so a newly added lesson never hard-breaks
   * a consumer before it is tagged. */
  function canRepresent(lessonId, representationId) {
    return capabilityOf(lessonId, representationId) !== false;
  }

  /* capableRepresentations(lessonId) → the representation ids valid for a lesson.
   * Replaces the old universal representationsForLesson(): a tagged lesson returns
   * its capable subset; an untagged lesson returns all (permissive degradation). */
  function capableRepresentations(lessonId) {
    return REPRESENTATION_IDS.filter(function (id) { return canRepresent(lessonId, id); });
  }

  /* ════════════════════════════════════════════════════════════════════════
   * SECTION 6 — AFFINITY (soft rank over CAPABLE representations)
   * Learned from data; here a cold-start default with an injection hook. Learning
   * writes LEARNED_AFFINITY and tunes affinity only — it never flips capability.
   * ════════════════════════════════════════════════════════════════════════ */
  var DEFAULT_AFFINITY = 0.5;         // cold-start: uniform over capable reps
  var LEARNED_AFFINITY = {};          // lessonId → { repId: weight[0,1] } (injected later)

  /* affinity(lessonId, repId) → number in [0,1] | null (null when not capable). */
  function affinity(lessonId, repId) {
    if (!isRepresentationId(repId)) return null;
    if (capabilityOf(lessonId, repId) === false) return null;  // no affinity for invalid pairs
    var l = LEARNED_AFFINITY[lessonId];
    if (l && typeof l[repId] === 'number') {
      var v = l[repId];
      return v < 0 ? 0 : (v > 1 ? 1 : v);
    }
    return DEFAULT_AFFINITY;
  }

  /* rankedRepresentations(lessonId) → capable ids, most-natural first (affinity
   * desc, canonical order as a stable tie-break). Cold-start ⇒ canonical order. */
  function rankedRepresentations(lessonId) {
    return capableRepresentations(lessonId).sort(function (a, b) {
      var d = affinity(lessonId, b) - affinity(lessonId, a);
      if (d) return d;
      return REPRESENTATION_IDS.indexOf(a) - REPRESENTATION_IDS.indexOf(b);
    });
  }

  /* representationEdges(lessonId) — KDG edges into the representation axis, one
   * per CAPABLE representation, weighted by affinity. */
  function representationEdges(lessonId) {
    return capableRepresentations(lessonId).map(function (repId) {
      return { from: lessonId, to: repId, relation: 'CAN_BE_REPRESENTED_AS', weight: affinity(lessonId, repId) };
    });
  }

  /* ════════════════════════════════════════════════════════════════════════
   * SECTION 7 — LEGACY problem_type BRIDGES (unchanged; additive, no schema change)
   * ════════════════════════════════════════════════════════════════════════ */
  function fromProblemType(pt) {
    var key = normalizeKey(pt);
    if (key === 'word_problem' || key === 'word problem') return 'WORD_PROBLEM';
    return null;
  }
  function toProblemType(representationId) {
    var r = REP_BY_ID[representationId];
    return (r && r.legacyProblemType) || 'concept';
  }

  /* ════════════════════════════════════════════════════════════════════════
   * SECTION 8 — OPTIONAL KNOWLEDGE-LAYER BRIDGE (loose coupling)
   * ════════════════════════════════════════════════════════════════════════ */
  function getTaxonomy() {
    return (typeof window !== 'undefined' && window.Taxonomy) ||
           (typeof globalThis !== 'undefined' && globalThis.Taxonomy) || null;
  }

  function lessonIds() {
    var T = getTaxonomy();
    if (!T || !Array.isArray(T.SUBTOPICS)) return [];
    return T.SUBTOPICS.map(function (s) { return s.id; });
  }

  /* describeNode({ lessonId, representationId }) — a combined view of a question
   * node: KNOWLEDGE (lesson + structural type) beside its REPRESENTATION, with the
   * capability verdict and affinity. A future Reasoning block sits beside
   * `knowledge` without changing this shape. */
  function describeNode(input) {
    input = input || {};
    var repId = resolveRepresentation(input.representationId);
    var T = getTaxonomy();
    var lessonName = (T && input.lessonId && typeof T.displayName === 'function')
      ? T.displayName(input.lessonId) : null;
    return {
      knowledge: {
        lessonId: input.lessonId || null,
        lessonName: lessonName,
        structuralType: input.lessonId ? structuralTypeOf(input.lessonId) : null,
      },
      representation: repId ? describe(repId) : null,
      capable: (input.lessonId && repId) ? capabilityOf(input.lessonId, repId) : null,
      affinity: (input.lessonId && repId) ? affinity(input.lessonId, repId) : null,
      problemType: repId ? toProblemType(repId) : null,
      version: REPRESENTATION_LAYER_VERSION,
    };
  }

  /* allEdges() — the representation axis materialised: capable, affinity-weighted
   * edges for every taxonomy lesson. Requires Taxonomy; [] when absent. */
  function allEdges() {
    var out = [];
    lessonIds().forEach(function (lid) {
      representationEdges(lid).forEach(function (e) { out.push(e); });
    });
    return out;
  }

  return {
    /* ── Version ── */
    REPRESENTATION_LAYER_VERSION: REPRESENTATION_LAYER_VERSION,
    /* ── Canonical data ── */
    REPRESENTATIONS: REPRESENTATIONS,
    REPRESENTATION: REPRESENTATION,
    REPRESENTATION_IDS: REPRESENTATION_IDS,
    STRUCTURAL_TYPE: STRUCTURAL_TYPE,
    /* ── Resolver / display ── */
    resolveRepresentation: resolveRepresentation,
    isRepresentation: isRepresentation,
    isRepresentationId: isRepresentationId,
    displayName: displayName,
    describe: describe,
    normalizeKey: normalizeKey,
    representationIds: representationIds,
    /* ── Capability (hybrid: rule + expert override) ── */
    structuralTypeOf: structuralTypeOf,
    capabilityOf: capabilityOf,
    canRepresent: canRepresent,
    capableRepresentations: capableRepresentations,
    /* ── Affinity (learned; cold-start default) ── */
    affinity: affinity,
    rankedRepresentations: rankedRepresentations,
    representationEdges: representationEdges,
    /* ── Legacy problem_type bridges (unchanged) ── */
    fromProblemType: fromProblemType,
    toProblemType: toProblemType,
    /* ── Optional knowledge-layer bridge ── */
    lessonIds: lessonIds,
    describeNode: describeNode,
    allEdges: allEdges,
    /* ── Introspection (tests only — do not mutate at runtime) ── */
    _aliases: REPRESENTATION_ALIASES,
    _repById: REP_BY_ID,
    _ruleAffords: RULE_AFFORDS,
    _lessonStructuralType: LESSON_STRUCTURAL_TYPE,
    _expertOverrides: EXPERT_CAPABILITY_OVERRIDES,
    _learnedAffinity: LEARNED_AFFINITY,
  };
}));
