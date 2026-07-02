/**
 * kdg-representation.js — the REPRESENTATION axis of the Knowledge Dependency
 * Graph (KDG). Single authored source of truth for how a lesson can be presented.
 *
 * Conforms to docs/roadmap/kdg-multi-axis-architecture.md. THE ARCHITECTURE IS THE
 * SOURCE OF TRUTH: every behavioural decision here is described there. Section refs
 * (§n) point at that document. If code and architecture disagree, the code is wrong.
 *
 * Conformance guarantees (enforced by scripts/validate-kdg-representation.mjs):
 *   1. No behaviour that is not described by the architecture.
 *   2. No hidden defaults — every default is intentional and documented below.
 *   3. Capability is DETERMINISTIC — it never reads learned affinity, user data,
 *      analytics, or model predictions. Learning influences RANKING only, never
 *      VALIDITY (§6, §7).
 *   4. Stable public API — capability is reached only through capabilityOf() /
 *      isCapable() / capableRepresentations(). Consumers never see whether it came
 *      from RULE_AFFORDS, the structural-type bridge, or (future) Knowledge metadata.
 *   5. Temporary code is unmistakable — see the LESSON_STRUCTURAL_TYPE banner.
 *   6. (Validator) tests architectural invariants, not implementation values.
 *
 * ── TWO INDEPENDENT LAYERS ─────────────────────────────────────────────────
 *   KNOWLEDGE      (taxonomy.core.js): WHAT the student is learning — lessons.
 *   REPRESENTATION (this file):        HOW that lesson may be presented.
 * Changing the representation never changes the underlying lesson node.
 *
 * ── CAPABILITY + AFFINITY (§2.1, §6, §7) ───────────────────────────────────
 *   • CAPABILITY (hard gate): is a representation VALID for a lesson? Hybrid —
 *       rule baseline (structural-type → afford set) + expert overrides,
 *       precedence expert > rule. Tri-valued: true | false | null (unknown).
 *   • AFFINITY (soft rank, [0,1]): among KNOWN-CAPABLE representations, how
 *       natural / common? Learned; cold-start uniform. Affinity can never change
 *       capability (§7).
 *
 * ── UNKNOWN-CAPABILITY POLICY (§7) ─────────────────────────────────────────
 * capabilityOf() stays TRI-STATE; `null` is never globally collapsed here. Each
 * consumer applies the collapse the architecture assigns it:
 *   • Production (Question Generation; Focus Practice selection): strict — use
 *     isCapable() / capableRepresentations() (null → not capable, fail-closed).
 *   • Consumption (AI Chat; Truth Engine): do NOT gate on capability; act on the
 *     representation that exists; a `false` is at most a logged anomaly.
 *   • Authoring: read capabilityOf() and branch on `null` (surface the unknown).
 *
 * ── SEVEN REPRESENTATIONS ──────────────────────────────────────────────────
 * Word Problem · Standard Equation · Simple Equation · Graph · Table ·
 * Diagram/Figure · Real-life Scenario. Multiple Choice / Short Answer / Grid-in
 * are RESPONSE formats (a separate Assessment axis, §2.2) — not representations.
 *
 * ── problem_type BRIDGE (unchanged) — REASONING LAYER (prepared, not built, §5) ─
 *
 * Environment-agnostic UMD. The Edge Function does NOT import this file (§4).
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
   * ════════════════════════════════════════════════════════════════════════ */
  var REPRESENTATION_LAYER_VERSION = 2;

  /* ════════════════════════════════════════════════════════════════════════
   * SECTION 2 — CANONICAL REPRESENTATIONS (§2, §2.2)
   * IDs are PERMANENT, OPAQUE UPPER_SNAKE. `legacyProblemType` records how each
   * maps onto the binary problem_type field (bridge, §7-code).
   * ════════════════════════════════════════════════════════════════════════ */
  var REPRESENTATIONS = [
    { id: 'WORD_PROBLEM', displayName: 'Word Problem', legacyProblemType: 'word_problem',
      description: 'The concept stated as a text problem the student must translate into math.' },
    { id: 'STANDARD_EQUATION', displayName: 'Standard Equation', legacyProblemType: 'concept',
      description: 'The symbolic form, e.g. ax + by = c or ax² + bx + c = 0.' },
    { id: 'SIMPLE_EQUATION', displayName: 'Simple Equation', legacyProblemType: 'concept',
      description: 'A stripped-down symbolic form, e.g. x + 3 = 7.' },
    { id: 'GRAPH', displayName: 'Graph', legacyProblemType: 'concept',
      description: 'The concept shown visually on axes, e.g. the parabola of y = x².' },
    { id: 'TABLE', displayName: 'Table', legacyProblemType: 'concept',
      description: 'A table of values / data form of the concept.' },
    { id: 'DIAGRAM', displayName: 'Diagram / Figure', legacyProblemType: 'concept',
      description: 'A geometric figure, drawing, or labelled diagram.' },
    { id: 'REAL_LIFE', displayName: 'Real-life Scenario', legacyProblemType: 'word_problem',
      description: 'The concept embedded in a real-world / applied situation.' },
    // Multiple Choice / Short Answer / Grid-in intentionally absent — Assessment axis (§2.2).
  ];

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

  function resolveRepresentation(raw) {
    if (raw == null) return null;
    var asId = String(raw).trim().toUpperCase();
    if (isRepresentationId(asId)) return asId;
    var key = normalizeKey(raw);
    if (!key) return null;
    if (REPRESENTATION_ALIASES[key]) return REPRESENTATION_ALIASES[key];
    return null;
  }

  function isRepresentation(raw) { return resolveRepresentation(raw) !== null; }
  function displayName(id) { return REP_BY_ID[id] ? REP_BY_ID[id].displayName : null; }
  function describe(id) {
    var r = REP_BY_ID[id];
    return r ? { id: r.id, displayName: r.displayName, description: r.description } : null;
  }
  function representationIds() { return REPRESENTATION_IDS.slice(); }

  /* ════════════════════════════════════════════════════════════════════════
   * SECTION 5 — CAPABILITY RULE (durable) + STRUCTURAL-TYPE BRIDGE (temporary)
   * ════════════════════════════════════════════════════════════════════════ */

  /* DURABLE (§6): the capability rule — structural type → afforded representations.
   * O(types). This is the real logic and survives the Knowledge-layer migration.
   * Afford sets are the architecture's §2.1 baseline (pending sign-off, §8.1). */
  var STRUCTURAL_TYPE = {
    PROCEDURAL: 'PROCEDURAL', FUNCTIONAL: 'FUNCTIONAL', DATA: 'DATA',
    GEOMETRIC: 'GEOMETRIC', COMBINATORIAL: 'COMBINATORIAL',
  };
  var RULE_AFFORDS = {
    PROCEDURAL:    ['WORD_PROBLEM', 'REAL_LIFE', 'SIMPLE_EQUATION'],
    FUNCTIONAL:    ['WORD_PROBLEM', 'REAL_LIFE', 'SIMPLE_EQUATION', 'STANDARD_EQUATION', 'GRAPH', 'TABLE'],
    DATA:          ['WORD_PROBLEM', 'REAL_LIFE', 'TABLE', 'DIAGRAM', 'GRAPH'],
    GEOMETRIC:     ['WORD_PROBLEM', 'REAL_LIFE', 'DIAGRAM', 'STANDARD_EQUATION'],
    COMBINATORIAL: ['WORD_PROBLEM', 'REAL_LIFE', 'TABLE', 'STANDARD_EQUATION'],
  };

  /* ┌──────────────────────────────────────────────────────────────────────┐
   * │ ⚠️  TEMPORARY BRIDGE — NOT PERMANENT ARCHITECTURE — WILL BE DELETED  ⚠️ │
   * └──────────────────────────────────────────────────────────────────────┘
   * LESSON_STRUCTURAL_TYPE (lesson → type) is a STAND-IN for lesson metadata that
   * belongs in the KNOWLEDGE layer (taxonomy). It exists ONLY because
   * taxonomy.core.js is frozen and cannot yet carry per-lesson structural metadata.
   *
   *   • It is NOT part of the permanent taxonomy.
   *   • It is temporary implementation metadata.
   *   • The long-term goal is to DERIVE capability from the Knowledge layer.
   *   • Once Knowledge is rich enough this map is DELETED (migration: architecture §6).
   *
   * Do NOT treat it as a durable classification, and do NOT let consumers reach it:
   * capability is exposed ONLY through capabilityOf() (criterion 4), so this can be
   * replaced by Knowledge-layer reads without any consumer change. */
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

  /* Expert overrides (human-authoritative, §6) — precedence over the rule. Small,
   * grows only by curation. ALG_005 Complex Numbers → Graph is VALID via the Argand
   * plane though the PROCEDURAL rule excludes it. Migrates WITH structural type. */
  var EXPERT_CAPABILITY_OVERRIDES = {
    ALG_005: { GRAPH: true },
  };

  /* capabilityOf(lessonId, repId) → true | false | null.
   *   true  = capable (expert override, else the structural-type rule);
   *   false = an invalid representation id, OR explicitly not-capable;
   *   null  = the lesson has no structural tag → capability UNKNOWN (never a
   *           silent allow/deny — the caller applies the §7 policy for its role).
   *
   * DETERMINISTIC (criterion 3): a pure function of (lessonId, repId) over
   * architecture-approved inputs ONLY — EXPERT_CAPABILITY_OVERRIDES and RULE_AFFORDS.
   * It MUST NOT read LEARNED_AFFINITY, user data, analytics, or model predictions.
   * Learning influences ranking (affinity), never validity. */
  function capabilityOf(lessonId, repId) {
    if (!isRepresentationId(repId)) return false;       // not a representation → not capable
    var ov = EXPERT_CAPABILITY_OVERRIDES[lessonId];
    if (ov && Object.prototype.hasOwnProperty.call(ov, repId)) return ov[repId] === true;
    var type = LESSON_STRUCTURAL_TYPE[lessonId];
    if (!type) return null;                             // untagged lesson → unknown
    return (RULE_AFFORDS[type] || []).indexOf(repId) !== -1;
  }

  /* isCapable(lessonId, repId) → boolean. The STRICT (§7 production) reading:
   * true only when known-capable; `null` (unknown) collapses to false (fail-closed).
   * Consumption consumers (AI Chat, Truth Engine) must NOT use this — they act on the
   * representation that exists and do not gate on capability. */
  function isCapable(lessonId, repId) { return capabilityOf(lessonId, repId) === true; }

  /* capableRepresentations(lessonId) → the KNOWN-CAPABLE representation ids (strict).
   * An untagged lesson yields [] (fail-closed) — NOT all reps. There is deliberately
   * no fail-open fallback here; a consumer that wants one (e.g. Focus Practice's safe
   * subset, §7) implements it itself. */
  function capableRepresentations(lessonId) {
    return REPRESENTATION_IDS.filter(function (id) { return isCapable(lessonId, id); });
  }

  /* ════════════════════════════════════════════════════════════════════════
   * SECTION 6 — AFFINITY (soft rank over KNOWN-CAPABLE reps; learned)
   * ════════════════════════════════════════════════════════════════════════ */

  /* Cold-start affinity: UNIFORM over capable representations (§7; the only open
   * sub-question, §8.2, is whether to later SEED from infographic weights — the
   * cold-start POLICY of uniform is decided). The constant's exact value is
   * immaterial: uniform ⇒ ranking falls back to canonical order. It is an
   * intentional "capable but no learned signal yet" marker, not a value the code
   * merely "needs" (criterion 2). */
  var COLD_START_AFFINITY = 0.5;

  /* LEARNED_AFFINITY: lessonId → { repId: weight[0,1] }. Populated by the learning
   * system later. Read ONLY by affinity() — never by capability (criterion 3). */
  var LEARNED_AFFINITY = {};

  /* affinity(lessonId, repId) → number in [0,1] | null.
   * Defined ONLY for KNOWN-CAPABLE pairs; null when capability is false OR unknown
   * (affinity ranks the capable set, so an un-proven pair has no affinity). */
  function affinity(lessonId, repId) {
    if (capabilityOf(lessonId, repId) !== true) return null;
    var l = LEARNED_AFFINITY[lessonId];
    if (l && typeof l[repId] === 'number') {
      var v = l[repId];
      return v < 0 ? 0 : (v > 1 ? 1 : v);            // clamp learned to [0,1]
    }
    return COLD_START_AFFINITY;
  }

  /* rankedRepresentations(lessonId) → capable ids, most-natural first (affinity
   * desc; canonical order as a stable tie-break). Bounded by capability — learned
   * affinity can reorder but can NEVER introduce a non-capable rep (criterion 3). */
  function rankedRepresentations(lessonId) {
    return capableRepresentations(lessonId).sort(function (a, b) {
      var d = affinity(lessonId, b) - affinity(lessonId, a);
      if (d) return d;
      return REPRESENTATION_IDS.indexOf(a) - REPRESENTATION_IDS.indexOf(b);
    });
  }

  /* representationEdges(lessonId) — KDG edges into the representation axis, one per
   * KNOWN-CAPABLE representation, weighted by affinity. */
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
    // Known rep → its legacyProblemType. Non-rep input → 'concept' is the intentional
    // legacy default (the binary's "not a word problem" bucket), not a stray fallback.
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

  /* describeNode({ lessonId, representationId }) — a combined two-layer view: the
   * KNOWLEDGE (lesson) beside its REPRESENTATION, with the capability verdict and
   * affinity. Deliberately exposes NO structural type (criterion 4 — the capability
   * source is internal). A future Reasoning block (§5) sits beside `knowledge`. */
  function describeNode(input) {
    input = input || {};
    var repId = resolveRepresentation(input.representationId);
    var T = getTaxonomy();
    var lessonName = (T && input.lessonId && typeof T.displayName === 'function')
      ? T.displayName(input.lessonId) : null;
    return {
      knowledge: { lessonId: input.lessonId || null, lessonName: lessonName },
      representation: repId ? describe(repId) : null,
      capable: (input.lessonId && repId) ? capabilityOf(input.lessonId, repId) : null,  // tri-state
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
    /* ═══ STABLE PUBLIC API (survives the structural-type → Knowledge migration) ═══ */
    REPRESENTATION_LAYER_VERSION: REPRESENTATION_LAYER_VERSION,
    REPRESENTATIONS: REPRESENTATIONS,
    REPRESENTATION: REPRESENTATION,
    REPRESENTATION_IDS: REPRESENTATION_IDS,
    // resolver / display
    resolveRepresentation: resolveRepresentation,
    isRepresentation: isRepresentation,
    isRepresentationId: isRepresentationId,
    displayName: displayName,
    describe: describe,
    normalizeKey: normalizeKey,
    representationIds: representationIds,
    // capability — the ONLY way to reach validity; source is internal (criterion 4)
    capabilityOf: capabilityOf,          // tri-state primitive
    isCapable: isCapable,                // strict (§7 production reading)
    capableRepresentations: capableRepresentations,
    // affinity (ranking only; never validity)
    affinity: affinity,
    rankedRepresentations: rankedRepresentations,
    representationEdges: representationEdges,
    // legacy problem_type bridge (unchanged)
    fromProblemType: fromProblemType,
    toProblemType: toProblemType,
    // optional knowledge-layer bridge
    lessonIds: lessonIds,
    describeNode: describeNode,
    allEdges: allEdges,

    /* ═══ INTERNAL — validation/tests only. NOT stable public API. ═══
     * The capability SOURCE (rules, structural-type bridge) is intentionally not a
     * public capability surface (criterion 4) and the bridge is temporary
     * (criterion 5). Do not depend on or mutate these at runtime. */
    _aliases: REPRESENTATION_ALIASES,
    _repById: REP_BY_ID,
    _ruleAffords: RULE_AFFORDS,                     // durable rule
    _lessonStructuralType: LESSON_STRUCTURAL_TYPE,  // TEMPORARY bridge (see banner)
    _expertOverrides: EXPERT_CAPABILITY_OVERRIDES,
    _learnedAffinity: LEARNED_AFFINITY,
  };
}));
