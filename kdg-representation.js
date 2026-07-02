/**
 * kdg-representation.js — the REPRESENTATION LAYER of the Knowledge Dependency
 * Graph (KDG). Single authored source of truth for how a lesson can be presented.
 *
 * ── TWO INDEPENDENT LAYERS ─────────────────────────────────────────────────
 *   KNOWLEDGE      (taxonomy.core.js): WHAT the student is learning — the
 *                  topic / subtopic / lesson nodes and their dependencies.
 *   REPRESENTATION (this file):        HOW that lesson is presented — word
 *                  problem, graph, table, standard equation, etc.
 *
 * These are two SEPARATE, INDEPENDENT layers. Changing the representation of a
 * question NEVER changes the underlying lesson node. "Quadratic Equations shown
 * as a graph" and "Quadratic Equations shown as a word problem" are the SAME
 * lesson (ALG_010) in two different representations.
 *
 * ── UNIVERSAL REPRESENTATION LAYER ─────────────────────────────────────────
 * Every lesson can appear in ANY representation. Rather than wiring each lesson
 * to each representation by hand, the mapping is GLOBAL:
 *
 *       ALL LESSONS  ──▶  REPRESENTATION LAYER
 *                          ├── Word Problem
 *                          ├── Standard Equation
 *                          ├── Simple Equation
 *                          ├── Graph
 *                          ├── Table
 *                          ├── Diagram / Figure
 *                          ├── Real-life Scenario
 *                          ├── Multiple Choice
 *                          └── Short Answer
 *
 * So representationsForLesson(anyLesson) returns ALL representation ids, and
 * canRepresent(anyLesson, anyValidRepresentation) is always true. The layer is
 * intentionally lesson-agnostic — there is no per-lesson representation table to
 * maintain, and a newly added lesson is automatically representable in every form.
 *
 * ── RELATIONSHIP TO LEGACY problem_type ────────────────────────────────────
 * The taxonomy already carries a BINARY proto-representation on every record:
 * problem_type ∈ { 'concept', 'word_problem' }. The representation layer is the
 * generalisation of that binary into nine representations. The two coexist:
 *   - fromProblemType()  bridges the legacy binary INTO a representation id,
 *   - toProblemType()    bridges a representation id BACK to the legacy binary,
 * so consumers can adopt the richer vocabulary without any schema change. No new
 * database column is introduced by this file; persisting a representation id is a
 * future, separately-approved migration.
 *
 * ── DEPENDENCIES ───────────────────────────────────────────────────────────
 * This module has NO hard dependency on the taxonomy — the separation is real.
 * A few enrichment helpers (describeNode, lessonIds, allEdges) OPTIONALLY read a
 * global `Taxonomy` (taxonomy.js) when one is present, and degrade gracefully
 * when it is not, so the representation layer loads and is testable on its own.
 *
 * Environment-agnostic UMD: attaches window.KDGRepresentation in the browser,
 * exports via module.exports in Node / Deno.
 *
 * ── EDGE FUNCTION NOTE ─────────────────────────────────────────────────────
 * The Edge Function (ai-tutor) does NOT import this file yet. Wiring it in is a
 * separate, gated task: it requires a byte-identical `_shared` copy + drift guard
 * (the taxonomy pattern) and a deploy via DEPLOY.md §4 (CLI only). This file
 * deliberately does not touch supabase/functions/_shared so the ai-tutor deploy
 * bundle is unchanged.
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
   * Bumped when representation ids or their semantics change. Independent of the
   * taxonomy version — knowledge and representation version separately.
   * ════════════════════════════════════════════════════════════════════════ */
  var REPRESENTATION_LAYER_VERSION = 1;

  /* ════════════════════════════════════════════════════════════════════════
   * SECTION 2 — CANONICAL REPRESENTATIONS (id → displayName)
   * IDs are PERMANENT, OPAQUE UPPER_SNAKE constants — a representation id may be
   * stored on a record, so it must never change once introduced. displayName is
   * presentation-only and may be renamed freely. `legacyProblemType` records how
   * this representation maps onto the binary problem_type field (see bridges).
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
    {
      id: 'MULTIPLE_CHOICE', displayName: 'Multiple Choice', legacyProblemType: 'concept',
      description: 'Presentation as a multiple-choice question (answer-format representation).',
    },
    {
      id: 'SHORT_ANSWER', displayName: 'Short Answer', legacyProblemType: 'concept',
      description: 'Presentation as a short-answer / grid-in question (answer-format representation).',
    },
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
   * Keys are normalizeKey()'d (lowercase, trimmed, parens-stripped, NFC). Values
   * are canonical ids that MUST exist above. Seeded from the KDG infographic
   * vocabulary ("Normal Equation", "Small Equation"), common AI wording, and
   * Arabic, so detectors (AI Chat, Truth Engine, Question Generation) can classify
   * a raw representation label without a passthrough guess.
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
    // Multiple Choice
    'multiple choice': 'MULTIPLE_CHOICE', 'multiple-choice': 'MULTIPLE_CHOICE',
    'multiple choice question': 'MULTIPLE_CHOICE', 'multiple-choice question': 'MULTIPLE_CHOICE',
    'mcq': 'MULTIPLE_CHOICE', 'mcqs': 'MULTIPLE_CHOICE', 'mc': 'MULTIPLE_CHOICE',
    'choice': 'MULTIPLE_CHOICE', 'اختيار من متعدد': 'MULTIPLE_CHOICE',
    // Short Answer
    'short answer': 'SHORT_ANSWER', 'short-answer': 'SHORT_ANSWER',
    'short response': 'SHORT_ANSWER', 'free response': 'SHORT_ANSWER',
    'free-response': 'SHORT_ANSWER', 'open response': 'SHORT_ANSWER',
    'open-ended': 'SHORT_ANSWER', 'grid-in': 'SHORT_ANSWER', 'grid in': 'SHORT_ANSWER',
    'gridin': 'SHORT_ANSWER', 'student-produced response': 'SHORT_ANSWER',
    'fill in the blank': 'SHORT_ANSWER', 'fill-in': 'SHORT_ANSWER',
    'إجابة قصيرة': 'SHORT_ANSWER', 'إجابة حرة': 'SHORT_ANSWER',
  };

  /* ════════════════════════════════════════════════════════════════════════
   * SECTION 4 — KEY NORMALIZATION + RESOLVER (no passthrough)
   * Mirrors taxonomy.core.js normalizeKey so raw labels normalize identically.
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
   * display name. Unmapped → null (never a guess). */
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

  /* displayName(id) — the ONLY place a representation id becomes a human name. */
  function displayName(id) {
    return REP_BY_ID[id] ? REP_BY_ID[id].displayName : null;
  }

  /* describe(id) — full metadata record for a representation, or null. */
  function describe(id) {
    var r = REP_BY_ID[id];
    if (!r) return null;
    return { id: r.id, displayName: r.displayName, description: r.description };
  }

  /* ════════════════════════════════════════════════════════════════════════
   * SECTION 5 — UNIVERSAL MAPPING (the graph rule: ALL LESSONS → all reps)
   * ════════════════════════════════════════════════════════════════════════ */

  /* representationIds() — every representation id (a copy; callers may mutate). */
  function representationIds() { return REPRESENTATION_IDS.slice(); }

  /* representationsForLesson(lessonId?) — the universal rule. Every lesson can be
   * shown in EVERY representation, so this returns all ids regardless of lesson.
   * The lessonId argument is accepted for call-site clarity and future overrides;
   * it is not required and does not narrow the result. */
  function representationsForLesson(/* lessonId */) { return REPRESENTATION_IDS.slice(); }

  /* canRepresent(lessonId, representationId) — universal rule ⇒ true for any valid
   * representation id (the lesson does not restrict its representations). */
  function canRepresent(lessonId, representationId) {
    return isRepresentationId(representationId);
  }

  /* representationEdges(lessonId) — the KDG edges out of one lesson node into the
   * representation layer: lesson ──CAN_BE_REPRESENTED_AS──▶ representation, one per
   * representation. Lets a consumer materialise the graph fan-out for a lesson. */
  function representationEdges(lessonId) {
    return REPRESENTATION_IDS.map(function (repId) {
      return { from: lessonId, to: repId, relation: 'CAN_BE_REPRESENTED_AS' };
    });
  }

  /* ════════════════════════════════════════════════════════════════════════
   * SECTION 6 — LEGACY problem_type BRIDGES (additive; no schema change)
   * ════════════════════════════════════════════════════════════════════════ */

  /* fromProblemType(problem_type) → representation id | null.
   * 'word_problem' → WORD_PROBLEM (the only lossless direction). 'concept' is the
   * binary's "not a word problem" bucket and spans several symbolic/visual
   * representations, so it maps to null (unknown-specific), never a guess. */
  function fromProblemType(pt) {
    var key = normalizeKey(pt);
    if (key === 'word_problem' || key === 'word problem') return 'WORD_PROBLEM';
    return null;
  }

  /* toProblemType(representationId) → 'word_problem' | 'concept'.
   * Collapses the nine representations back onto the legacy binary so a consumer
   * that detects a rich representation can still write the existing problem_type
   * column correctly. Unknown id → 'concept' (safe default). */
  function toProblemType(representationId) {
    var r = REP_BY_ID[representationId];
    return (r && r.legacyProblemType) || 'concept';
  }

  /* ════════════════════════════════════════════════════════════════════════
   * SECTION 7 — OPTIONAL KNOWLEDGE-LAYER BRIDGE (loose coupling)
   * Uses a global `Taxonomy` (taxonomy.js) when present; degrades to null / [].
   * This is the ONLY place the two layers meet, and it is read-only.
   * ════════════════════════════════════════════════════════════════════════ */
  function getTaxonomy() {
    return (typeof window !== 'undefined' && window.Taxonomy) ||
           (typeof globalThis !== 'undefined' && globalThis.Taxonomy) || null;
  }

  /* lessonIds() — every taxonomy subtopic (lesson) id, or [] if Taxonomy absent. */
  function lessonIds() {
    var T = getTaxonomy();
    if (!T || !Array.isArray(T.SUBTOPICS)) return [];
    return T.SUBTOPICS.map(function (s) { return s.id; });
  }

  /* describeNode({ lessonId, representationId }) — a combined two-layer view of a
   * question node: its KNOWLEDGE (lesson) and its REPRESENTATION, side by side.
   * Lesson display names come from the taxonomy when available. Demonstrates the
   * separation: same lessonId + different representationId ⇒ same knowledge block. */
  function describeNode(input) {
    input = input || {};
    var repId = resolveRepresentation(input.representationId);
    var T = getTaxonomy();
    var lessonName = (T && input.lessonId && typeof T.displayName === 'function')
      ? T.displayName(input.lessonId) : null;
    return {
      knowledge: { lessonId: input.lessonId || null, lessonName: lessonName },
      representation: repId ? describe(repId) : null,
      problemType: repId ? toProblemType(repId) : null,
      version: REPRESENTATION_LAYER_VERSION,
    };
  }

  /* allEdges() — the entire universal layer materialised: one edge for every
   * (lesson × representation) pair. Requires Taxonomy; [] when it is absent. */
  function allEdges() {
    var out = [];
    lessonIds().forEach(function (lid) {
      REPRESENTATION_IDS.forEach(function (repId) {
        out.push({ from: lid, to: repId, relation: 'CAN_BE_REPRESENTED_AS' });
      });
    });
    return out;
  }

  return {
    /* ── Version ── */
    REPRESENTATION_LAYER_VERSION: REPRESENTATION_LAYER_VERSION,
    /* ── Canonical data ── */
    REPRESENTATIONS: REPRESENTATIONS,
    REPRESENTATION: REPRESENTATION,          // enum-style id constants
    REPRESENTATION_IDS: REPRESENTATION_IDS,
    /* ── Resolver / display ── */
    resolveRepresentation: resolveRepresentation,
    isRepresentation: isRepresentation,
    isRepresentationId: isRepresentationId,
    displayName: displayName,
    describe: describe,
    normalizeKey: normalizeKey,
    /* ── Universal mapping (the graph rule) ── */
    representationIds: representationIds,
    representationsForLesson: representationsForLesson,
    canRepresent: canRepresent,
    representationEdges: representationEdges,
    /* ── Legacy problem_type bridges ── */
    fromProblemType: fromProblemType,
    toProblemType: toProblemType,
    /* ── Optional knowledge-layer bridge ── */
    lessonIds: lessonIds,
    describeNode: describeNode,
    allEdges: allEdges,
    /* ── Introspection (tests only — do not mutate at runtime) ── */
    _aliases: REPRESENTATION_ALIASES,
    _repById: REP_BY_ID,
  };
}));
