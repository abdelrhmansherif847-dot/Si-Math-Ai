/* AUTO-GENERATED from taxonomy.core.js by scripts/sync-taxonomy.mjs — DO NOT EDIT. */
/**
 * taxonomy.core.js — SINGLE AUTHORED SOURCE OF TRUTH for the Si Math AI taxonomy.
 *
 * This is the only file that may be hand-edited. Two byte-identical copies are
 * generated from it by scripts/sync-taxonomy.mjs and must never be edited directly:
 *   - taxonomy.js                              (browser entry; HTML loads this)
 *   - supabase/functions/_shared/taxonomy.core.js  (Deno / Edge Function)
 * A drift guard (scripts/validate-taxonomy.mjs) fails if the copies diverge.
 *
 * Environment-agnostic UMD: attaches window.Taxonomy in browsers, exports via
 * module.exports in Node/Deno.
 *
 * ── ARCHITECTURE (locked) ──────────────────────────────────────────────────
 *   AI Detection (raw, untrusted)
 *        ↓  normalizeKey  (lowercase, trim, strip parens, NFC)
 *        ↓  Alias Mapping  (TOPIC_ALIASES / SUBTOPIC_ALIASES → stable IDs)
 *        ↓  Canonical Topic ID        (must exist, else REJECT → null)
 *        ↓  Canonical Subtopic ID     (must exist under that topic, else REJECT)
 *        ↓  Problem Type              (CONCEPT | WORD_PROBLEM)
 *
 *   - IDs are PERMANENT. Once introduced an ID never changes — it is a DB key.
 *     Display names, aliases, and taxonomy versions may change freely; IDs may not.
 *   - The database is designed around IDs; names are presentation-only.
 *   - NO passthrough fallback in the new resolver: unmapped → null (reject + log).
 *
 *   Legacy name-based API (normalizeTopic / normalizeSubtopic / subtopicsFor /
 *   isAcademicTopic / normalizeConcept / dedupeConceptList) is preserved verbatim
 *   for the currently-shipping consumers. Those consumers migrate to the ID API
 *   in a later phase; the legacy passthrough is removed only once they have.
 */
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory();
  } else {
    root.Taxonomy = factory();
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {

  /* ════════════════════════════════════════════════════════════════════════
   * SECTION 1 — VERSION
   * Every generated record stores the taxonomy version that created it.
   * A curriculum change ships as version 2 (new IDs / aliases) and never
   * silently mutates version-1 semantics.
   * ════════════════════════════════════════════════════════════════════════ */
  var TAXONOMY_VERSION = 1;

  /* ════════════════════════════════════════════════════════════════════════
   * SECTION 2 — PROBLEM TYPES (metadata, never a Topic/Subtopic)
   * ════════════════════════════════════════════════════════════════════════ */
  var PROBLEM_TYPE = { CONCEPT: 'concept', WORD_PROBLEM: 'word_problem' };
  var PROBLEM_TYPES = [PROBLEM_TYPE.CONCEPT, PROBLEM_TYPE.WORD_PROBLEM];

  /* ════════════════════════════════════════════════════════════════════════
   * SECTION 3 — CANONICAL TOPICS (id → displayName)
   * IDs are PERMANENT. displayName is presentation-only and may be renamed.
   * ════════════════════════════════════════════════════════════════════════ */
  var TOPICS = [
    { id: 'ALGEBRA',            displayName: 'Algebra' },
    { id: 'FUNCTIONS',          displayName: 'Functions' },
    { id: 'GEOMETRY',           displayName: 'Geometry' },
    { id: 'STATISTICS',         displayName: 'Statistics' },
    { id: 'PROBABILITY_RATIOS', displayName: 'Probability & Ratios' },
  ];

  /* ════════════════════════════════════════════════════════════════════════
   * SECTION 4 — CANONICAL SUBTOPICS (id → topicId + displayName)
   * IDs are PERMANENT, OPAQUE, and NAME-INDEPENDENT: e.g. ALG_001 stays forever
   * even if its displayName changes from "Order of Operations" to "PEMDAS". The
   * numeric suffix is a stable allocation, NOT derived from the name or position;
   * never renumber an existing id. New lessons take the next free number in their
   * topic block; numbers of retired lessons are never reused.
   * ════════════════════════════════════════════════════════════════════════ */
  var SUBTOPICS = [
    // ── Algebra ──
    { id: 'ALG_001', topicId: 'ALGEBRA', displayName: 'Order of Operations' },
    { id: 'ALG_002', topicId: 'ALGEBRA', displayName: 'Exponents' },
    { id: 'ALG_003', topicId: 'ALGEBRA', displayName: 'Radicals' },
    { id: 'ALG_004', topicId: 'ALGEBRA', displayName: 'Polynomials' },
    { id: 'ALG_005', topicId: 'ALGEBRA', displayName: 'Complex Numbers' },
    { id: 'ALG_006', topicId: 'ALGEBRA', displayName: 'Linear Equations & Functions' },
    { id: 'ALG_007', topicId: 'ALGEBRA', displayName: 'Systems of Equations' },
    { id: 'ALG_008', topicId: 'ALGEBRA', displayName: 'Inequalities' },
    { id: 'ALG_009', topicId: 'ALGEBRA', displayName: 'Absolute Value' },
    { id: 'ALG_010', topicId: 'ALGEBRA', displayName: 'Quadratic Equations & Functions' },
    { id: 'ALG_011', topicId: 'ALGEBRA', displayName: 'Exponential Functions' },
    { id: 'ALG_012', topicId: 'ALGEBRA', displayName: 'Sequences' },
    // ── Functions ──
    { id: 'FUN_001', topicId: 'FUNCTIONS', displayName: 'Functions' },
    { id: 'FUN_002', topicId: 'FUNCTIONS', displayName: 'Function Transformations' },
    // ── Geometry ──
    { id: 'GEO_001', topicId: 'GEOMETRY', displayName: 'Lines & Angles' },
    { id: 'GEO_002', topicId: 'GEOMETRY', displayName: 'Triangles' },
    { id: 'GEO_003', topicId: 'GEOMETRY', displayName: 'Polygons' },
    { id: 'GEO_004', topicId: 'GEOMETRY', displayName: 'Similarity' },
    { id: 'GEO_005', topicId: 'GEOMETRY', displayName: 'Trigonometry' },
    { id: 'GEO_006', topicId: 'GEOMETRY', displayName: 'Circle & Equation of the Circle' },
    { id: 'GEO_007', topicId: 'GEOMETRY', displayName: 'Solid Geometry' },
    { id: 'GEO_008', topicId: 'GEOMETRY', displayName: 'Coordinate Geometry' },
    // ── Statistics ──
    { id: 'STA_001', topicId: 'STATISTICS', displayName: 'Scatter Plots' },
    { id: 'STA_002', topicId: 'STATISTICS', displayName: 'Mean, Median & Mode' },
    { id: 'STA_003', topicId: 'STATISTICS', displayName: 'Range & Interval' },
    { id: 'STA_004', topicId: 'STATISTICS', displayName: 'Stem-and-Leaf Plots' },
    { id: 'STA_005', topicId: 'STATISTICS', displayName: 'Data Analysis' },
    // ── Probability & Ratios ──
    { id: 'PR_001', topicId: 'PROBABILITY_RATIOS', displayName: 'Probability' },
    { id: 'PR_002', topicId: 'PROBABILITY_RATIOS', displayName: 'Permutations & Combinations' },
    { id: 'PR_003', topicId: 'PROBABILITY_RATIOS', displayName: 'Percentages' },
    { id: 'PR_004', topicId: 'PROBABILITY_RATIOS', displayName: 'Ratio & Proportion' },
    { id: 'PR_005', topicId: 'PROBABILITY_RATIOS', displayName: 'Unit Rates' },
    { id: 'PR_006', topicId: 'PROBABILITY_RATIOS', displayName: 'Work & Time' },
  ];

  /* ── Derived lookups (built once) ── */
  var TOPIC_BY_ID = {};
  var TOPIC_ID_BY_NAME = {};
  TOPICS.forEach(function (t) {
    TOPIC_BY_ID[t.id] = t;
    TOPIC_ID_BY_NAME[t.displayName.toLowerCase()] = t.id;
  });
  var SUBTOPIC_BY_ID = {};
  var SUBTOPIC_IDS_BY_TOPIC = {};
  SUBTOPICS.forEach(function (s) {
    SUBTOPIC_BY_ID[s.id] = s;
    (SUBTOPIC_IDS_BY_TOPIC[s.topicId] = SUBTOPIC_IDS_BY_TOPIC[s.topicId] || []).push(s.id);
  });

  /* ════════════════════════════════════════════════════════════════════════
   * SECTION 5 — ALIAS MAPPING LAYER
   * Keys are normalizeKey()'d (lowercase, trimmed, parens-stripped, NFC).
   * Values are STABLE IDs that MUST exist above. An alias can only ever point
   * at an existing canonical id — never introduce a new topic/subtopic.
   * Seeded from the live production-data audit (Arabic, misspellings, AI wording).
   * ════════════════════════════════════════════════════════════════════════ */
  var TOPIC_ALIASES = {
    // Algebra
    'algebra': 'ALGEBRA', 'algebera': 'ALGEBRA', 'algepra': 'ALGEBRA', 'الجبر': 'ALGEBRA',
    'order of operations': 'ALGEBRA', 'exponents': 'ALGEBRA', 'radicals': 'ALGEBRA',
    'radicals and rational exponents': 'ALGEBRA', 'polynomials': 'ALGEBRA',
    'complex numbers': 'ALGEBRA', 'linear equations': 'ALGEBRA', 'linear functions': 'ALGEBRA',
    'systems of equations': 'ALGEBRA', 'inequalities': 'ALGEBRA', 'absolute value': 'ALGEBRA',
    'quadratic equations': 'ALGEBRA', 'quadratic functions': 'ALGEBRA',
    'exponential functions': 'ALGEBRA', 'exponential growth': 'ALGEBRA', 'sequences': 'ALGEBRA',
    // Functions
    'functions': 'FUNCTIONS', 'function transformations': 'FUNCTIONS',
    // Geometry
    'geometry': 'GEOMETRY', 'geometery': 'GEOMETRY', 'geomtry': 'GEOMETRY', 'الهندسة': 'GEOMETRY',
    'trigonometry': 'GEOMETRY', 'trig': 'GEOMETRY', 'المثلثات': 'GEOMETRY', 'حساب المثلثات': 'GEOMETRY',
    'circles': 'GEOMETRY', 'triangles': 'GEOMETRY', 'coordinate geometry': 'GEOMETRY',
    'solid geometry': 'GEOMETRY',
    // Statistics
    'statistics': 'STATISTICS', 'الإحصاء': 'STATISTICS', 'data analysis': 'STATISTICS',
    'scatter plots': 'STATISTICS',
    // Probability & Ratios
    'probability': 'PROBABILITY_RATIOS', 'الاحتمالات': 'PROBABILITY_RATIOS', 'احتمالات': 'PROBABILITY_RATIOS',
    'combinatorics': 'PROBABILITY_RATIOS', 'permutations and combinations': 'PROBABILITY_RATIOS',
    'percentages': 'PROBABILITY_RATIOS', 'percentage': 'PROBABILITY_RATIOS',
    'percentage calculation': 'PROBABILITY_RATIOS', 'percentage increase': 'PROBABILITY_RATIOS',
    'نسب مئوية': 'PROBABILITY_RATIOS', 'نسب': 'PROBABILITY_RATIOS',
    'النسب المئوية والتغيرات': 'PROBABILITY_RATIOS',
    'النسب المئوية والتغيرات النسبية': 'PROBABILITY_RATIOS',
    'ratio & proportion': 'PROBABILITY_RATIOS', 'ratios': 'PROBABILITY_RATIOS',
    'unit rates': 'PROBABILITY_RATIOS', 'work and time': 'PROBABILITY_RATIOS',
  };

  /* Subtopic aliases → SubtopicID. Resolver additionally verifies the resolved
   * subtopic actually belongs to the resolved topic (cross-topic guard). */
  var SUBTOPIC_ALIASES = {
    // Algebra
    'order of operations': 'ALG_001', 'pemdas': 'ALG_001',
    'exponents': 'ALG_002', 'exponent': 'ALG_002',
    'radicals': 'ALG_003', 'radicals and rational exponents': 'ALG_003',
    'rational exponents': 'ALG_003', 'square roots': 'ALG_003',
    'polynomials': 'ALG_004', 'polynomial': 'ALG_004',
    'complex numbers': 'ALG_005', 'imaginary numbers': 'ALG_005',
    'linear equations': 'ALG_006', 'linear equation': 'ALG_006',
    'linear functions': 'ALG_006', 'linear equations & functions': 'ALG_006',
    'slope-intercept form': 'ALG_006', 'slope': 'ALG_006',
    'intercepts': 'ALG_006',
    'systems of equations': 'ALG_007', 'system of equations': 'ALG_007',
    'inequalities': 'ALG_008', 'inequality': 'ALG_008',
    'absolute value': 'ALG_009',
    'quadratic equations': 'ALG_010', 'quadratic functions': 'ALG_010',
    'quadratics': 'ALG_010', 'quadratic equations & functions': 'ALG_010',
    'factoring': 'ALG_010', 'quadratic formula': 'ALG_010',
    'exponential functions': 'ALG_011', 'exponential growth': 'ALG_011',
    'exponential': 'ALG_011',
    'sequences': 'ALG_012', 'sequence': 'ALG_012',
    'arithmetic sequences': 'ALG_012', 'geometric sequences': 'ALG_012',
    // Functions
    'functions': 'FUN_001', 'function': 'FUN_001', 'function notation': 'FUN_001',
    'function transformations': 'FUN_002', 'transformations': 'FUN_002',
    // Geometry
    'lines & angles': 'GEO_001', 'lines and angles': 'GEO_001',
    'angles & lines': 'GEO_001', 'angles': 'GEO_001',
    'triangles': 'GEO_002', 'triangle': 'GEO_002',
    'polygons': 'GEO_003', 'polygon': 'GEO_003', 'quadrilaterals': 'GEO_003',
    'similarity': 'GEO_004', 'similar figures': 'GEO_004', 'similar triangles': 'GEO_004',
    'trigonometry': 'GEO_005', 'trig': 'GEO_005',
    'sin, cos, tan': 'GEO_005', 'unit circle': 'GEO_005',
    'circles': 'GEO_006', 'circle': 'GEO_006', 'equation of the circle': 'GEO_006',
    'circle & equation of the circle': 'GEO_006',
    'solid geometry': 'GEO_007', '3d shapes': 'GEO_007', 'volume': 'GEO_007',
    'surface area': 'GEO_007', 'area & volume': 'GEO_007',
    'coordinate geometry': 'GEO_008', 'coordinate plane': 'GEO_008',
    'distance formula': 'GEO_008', 'midpoint': 'GEO_008',
    // Statistics
    'scatter plots': 'STA_001', 'scatter plot': 'STA_001',
    'mean, median, mode': 'STA_002', 'mean median mode': 'STA_002',
    'mean, median & mode': 'STA_002', 'mean': 'STA_002',
    'median': 'STA_002', 'mode': 'STA_002', 'averages': 'STA_002',
    'range & interval': 'STA_003', 'range': 'STA_003',
    'interval': 'STA_003', 'interval and range': 'STA_003',
    'stem and leaf': 'STA_004', 'stem-and-leaf': 'STA_004', 'stem and leaf plot': 'STA_004',
    'data analysis': 'STA_005', 'data tables': 'STA_005',
    'data interpretation': 'STA_005', 'statistics': 'STA_005',
    // Probability & Ratios
    'probability': 'PR_001', 'basic probability': 'PR_001',
    'compound events': 'PR_001', 'conditional probability': 'PR_001',
    'permutations & combinations': 'PR_002',
    'permutations and combinations': 'PR_002',
    'combinations': 'PR_002', 'permutations': 'PR_002',
    'combinatorics': 'PR_002',
    'percentages': 'PR_003', 'percentage': 'PR_003', 'percent': 'PR_003',
    'percentage increase': 'PR_003', 'percentage calculation': 'PR_003',
    'ratio & proportion': 'PR_004', 'ratios': 'PR_004',
    'ratio': 'PR_004', 'proportion': 'PR_004',
    'ratios & proportions': 'PR_004', 'proportions': 'PR_004',
    'unit rates': 'PR_005', 'unit rate': 'PR_005', 'rates': 'PR_005',
    'work and time': 'PR_006', 'work & time': 'PR_006', 'work': 'PR_006',
    'rate & work problems': 'PR_006',
  };

  /* ── Word-problem detection hints (metadata only) ── */
  var WORD_PROBLEM_HINTS = {
    'word problems': true, 'word problem': true, 'مسائل كلامية': true,
    'linear word problems': true, 'percent problems': true, 'ratio problems': true,
    'distance & speed problems': true, 'mixture problems': true, 'statistics word problems': true,
  };

  /* ════════════════════════════════════════════════════════════════════════
   * SECTION 6 — NON-ACADEMIC / SYSTEM TOPICS (rejected from academic taxonomy)
   * ════════════════════════════════════════════════════════════════════════ */
  var SYSTEM_TOPICS = new Set([
    'confidence', 'session start', 'study coaching', 'problem clarification',
    'off-topic', 'off topic', 'off-topic / specialization', 'specialization', 'zero',
    'general', 'greeting', 'feedback', 'motivation', 'encouragement', 'clarification',
    'meta', 'system', 'chat', 'intro', 'introduction', 'explanation', 'review',
    'other', 'none', 'unknown', 'miscellaneous', 'hint', 'hints', 'coaching',
    'problem recognition / strategy', 'study strategy', 'multiple topics', 'math problem',
    'personal info', 'n/a', 'na', 'null', 'undefined', 'out_of_scope', 'غير محدد',
    // Generic math labels (too broad to be a topic)
    'math', 'mathematics', 'maths', 'general math', 'basic math', 'numbers', 'arithmetic',
    // Out-of-curriculum subjects detected in the wild — reject, do not guess
    'calculus', 'number theory', 'physics', 'finance', 'interest', 'graphing',
    // Arabic generic labels
    'الرياضيات', 'رياضيات', 'العلوم',
    // Test-taking / strategy
    'test taking', 'test-taking', 'test strategy', 'test strategies',
    'test-taking strategies', 'test taking strategies',
    'exam strategy', 'exam strategies', 'exam preparation', 'exam prep',
    'exam structure', 'exam tips', 'exam technique', 'exam techniques',
    'sat', 'gpa', 'est', 'sat prep', 'est prep', 'sat math', 'est math', 'est math 1',
    'sat mathematics', 'اختبار est', 'اختبار sat', 'امتحان est',
    // Study skills
    'study methods', 'study method', 'study techniques', 'study technique',
    'study skills', 'study skill', 'study tips', 'study tip', 'study habits',
    'study planning', 'study plan',
    'bubblesheet technique', 'bubble sheet', 'bubblesheets', 'answer sheet',
    // Time / planning
    'time management', 'planning', 'scheduling', 'organization',
    // Arabic equivalents
    'التخطيط', 'تخطيط', 'إدارة الوقت', 'إدارة الوقت في الامتحانات', 'استراتيجية',
    'استراتيجي', 'استراتيجيات حل الامتحانات', 'استعداد لاختبار sat',
    'اعلام عن امتحان est', 'التحضير للاختبار', 'التحضير للامتحان', 'التواصل',
    'التوجيه العام', 'التخطيط للامتحان', 'اختبار', 'الامتحان',
  ]);

  /* ════════════════════════════════════════════════════════════════════════
   * SECTION 7 — KEY NORMALIZATION + STRICT RESOLVER (ID-based, no passthrough)
   * ════════════════════════════════════════════════════════════════════════ */
  function stripParens(s) { return s.replace(/\s*\([^)]+\)\s*$/, '').trim(); }
  function normalizeKey(s) {
    if (s == null) return '';
    var t = String(s).normalize ? String(s).normalize('NFC') : String(s);
    return stripParens(t.trim().toLowerCase());
  }

  function isAcademicTopic(topic) {
    if (!topic || String(topic).trim().length < 2) return false;
    return !SYSTEM_TOPICS.has(normalizeKey(topic));
  }

  /* resolveTopicId(raw) → permanent TopicID | null (reject). */
  function resolveTopicId(raw) {
    var key = normalizeKey(raw);
    if (!key || SYSTEM_TOPICS.has(key)) return null;
    if (TOPIC_ALIASES[key]) return TOPIC_ALIASES[key];
    if (TOPIC_ID_BY_NAME[key]) return TOPIC_ID_BY_NAME[key]; // exact canonical name
    return null;
  }

  /* resolveSubtopicId(topicId, raw) → permanent SubtopicID | null.
   * Blank subtopic → null (topic-level only; not a reject). Non-blank but
   * unmapped, or mapped to a different topic → null (reject). */
  function resolveSubtopicId(topicId, raw) {
    var key = normalizeKey(raw);
    if (!key) return null;
    var id = SUBTOPIC_ALIASES[key] || null;
    if (!id && SUBTOPIC_BY_ID[String(raw).trim().toUpperCase()]) {
      id = String(raw).trim().toUpperCase(); // raw was already an id
    }
    if (!id) return null;
    var entry = SUBTOPIC_BY_ID[id];
    if (!entry) return null;
    if (topicId && entry.topicId !== topicId) return null; // cross-topic guard
    return id;
  }

  /* resolveProblemType — explicit boolean wins; else hint scan of raw strings. */
  function resolveProblemType(opts) {
    opts = opts || {};
    if (opts.wordProblem === true) return PROBLEM_TYPE.WORD_PROBLEM;
    if (opts.wordProblem === false) return PROBLEM_TYPE.CONCEPT;
    var hay = normalizeKey(opts.rawSubtopic) + ' ' + normalizeKey(opts.rawTopic);
    var keys = Object.keys(WORD_PROBLEM_HINTS);
    for (var i = 0; i < keys.length; i++) { if (hay.indexOf(keys[i]) !== -1) return PROBLEM_TYPE.WORD_PROBLEM; }
    return PROBLEM_TYPE.CONCEPT;
  }

  /* resolve(raw) — full pipeline. Returns a canonical record or null (reject).
   * { topicId, subtopicId|null, topicName, subtopicName|null, problemType, taxonomyVersion } */
  function resolve(input) {
    input = input || {};
    var topicId = resolveTopicId(input.topic);
    if (!topicId) return null; // unknown topic → reject (caller logs unmapped)
    var subtopicId = resolveSubtopicId(topicId, input.subtopic);
    // unknown (non-blank) subtopic → reject the whole detection per spec
    if (input.subtopic && String(input.subtopic).trim() && !subtopicId) return null;
    var problemType = resolveProblemType({
      wordProblem: input.wordProblem,
      rawTopic: input.topic, rawSubtopic: input.subtopic,
    });
    return {
      topicId: topicId,
      subtopicId: subtopicId,
      topicName: displayName(topicId),
      subtopicName: subtopicId ? displayName(subtopicId) : null,
      problemType: problemType,
      taxonomyVersion: TAXONOMY_VERSION,
    };
  }

  /* displayName(id) — the ONLY place IDs become human names. */
  function displayName(id) {
    if (TOPIC_BY_ID[id]) return TOPIC_BY_ID[id].displayName;
    if (SUBTOPIC_BY_ID[id]) return SUBTOPIC_BY_ID[id].displayName;
    return null;
  }

  function subtopicIdsForTopic(topicId) { return (SUBTOPIC_IDS_BY_TOPIC[topicId] || []).slice(); }

  /* Legacy name-valued views of the alias maps (alias → canonical displayName).
   * Preserved because existing consumers (e.g. mock-exam.html datalist) read the
   * alias VALUES expecting display names. The ID-valued maps remain authoritative
   * and are exposed separately as _topicAliasIds / _subtopicAliasIds. */
  var TOPIC_ALIASES_LEGACY = {};
  Object.keys(TOPIC_ALIASES).forEach(function (k) { TOPIC_ALIASES_LEGACY[k] = displayName(TOPIC_ALIASES[k]); });
  var SUBTOPIC_ALIASES_LEGACY = {};
  Object.keys(SUBTOPIC_ALIASES).forEach(function (k) { SUBTOPIC_ALIASES_LEGACY[k] = displayName(SUBTOPIC_ALIASES[k]); });

  /* ════════════════════════════════════════════════════════════════════════
   * SECTION 8 — CONCEPT NORMALIZATION (legacy, preserved verbatim)
   * ════════════════════════════════════════════════════════════════════════ */
  var CONCEPT_CANON = {
    'isolation of variable': 'Isolating Variables', 'isolating variable': 'Isolating Variables',
    'isolation of variables': 'Isolating Variables', 'isolating a variable': 'Isolating Variables',
    'isolate variable': 'Isolating Variables', 'isolate variables': 'Isolating Variables',
    'linear equation': 'Linear Equations', 'linear equations': 'Linear Equations',
    'inverse operation': 'Inverse Operations', 'inverse operations': 'Inverse Operations',
    'solving for variable': 'Solving for Variables', 'solving for variables': 'Solving for Variables',
    'solving for x': 'Solving for Variables', 'solve for x': 'Solving for Variables',
    'quadratic equation': 'Quadratic Equations', 'quadratic equations': 'Quadratic Equations',
    'systems of equation': 'Systems of Equations', 'system of equations': 'Systems of Equations',
    'slope intercept form': 'Slope-Intercept Form', 'slope-intercept': 'Slope-Intercept Form',
    'slope intercept': 'Slope-Intercept Form', 'order of operation': 'Order of Operations',
    'order of operations': 'Order of Operations', 'substitution method': 'Substitution Method',
    'elimination method': 'Elimination Method', 'distributive property': 'Distributive Property',
    'combining like terms': 'Combining Like Terms', 'combining like term': 'Combining Like Terms',
  };
  function normalizeConcept(c) {
    if (!c) return null;
    var t = c.trim();
    var key = t.toLowerCase();
    if (CONCEPT_CANON[key]) return CONCEPT_CANON[key];
    return t.replace(/\b\w/g, function (ch) { return ch.toUpperCase(); });
  }
  function dedupeConceptList(arr) {
    var seen = new Set(); var out = [];
    for (var i = 0; i < arr.length; i++) {
      var n = normalizeConcept(arr[i]); if (!n) continue;
      var k = n.toLowerCase(); if (!seen.has(k)) { seen.add(k); out.push(n); }
    }
    return out;
  }

  /* ════════════════════════════════════════════════════════════════════════
   * SECTION 9 — LEGACY NAME-BASED API (preserved for currently-shipping
   * consumers; these migrate to the ID API in a later phase, after which the
   * passthrough fallbacks below are removed). DO NOT add new callers of these.
   * ════════════════════════════════════════════════════════════════════════ */
  function normalizeTopic(s) {
    if (!s) return s;
    var id = resolveTopicId(s);
    if (id) return displayName(id);
    var t = String(s).trim();
    return t.charAt(0).toUpperCase() + t.slice(1); // TEMPORARY passthrough (legacy)
  }
  function normalizeSubtopic(s) {
    if (!s) return s;
    var t = stripParens(String(s).trim());
    var key = t.toLowerCase();
    var id = SUBTOPIC_ALIASES[key];
    if (id) return displayName(id);
    return t; // TEMPORARY passthrough (legacy)
  }
  function subtopicsFor(topic) {
    var id = resolveTopicId(topic);
    if (!id) return [];
    return subtopicIdsForTopic(id).map(displayName);
  }

  return {
    /* ── New ID-first API (use this in all new code) ── */
    TAXONOMY_VERSION: TAXONOMY_VERSION,
    PROBLEM_TYPE: PROBLEM_TYPE,
    PROBLEM_TYPES: PROBLEM_TYPES,
    TOPICS: TOPICS,
    SUBTOPICS: SUBTOPICS,
    resolve: resolve,
    resolveTopicId: resolveTopicId,
    resolveSubtopicId: resolveSubtopicId,
    resolveProblemType: resolveProblemType,
    displayName: displayName,
    subtopicIdsForTopic: subtopicIdsForTopic,
    isAcademicTopic: isAcademicTopic,
    normalizeKey: normalizeKey,
    /* ── Concept helpers (legacy, still current) ── */
    normalizeConcept: normalizeConcept,
    dedupeConceptList: dedupeConceptList,
    /* ── Legacy name-based API (do not add new callers) ── */
    normalizeTopic: normalizeTopic,
    normalizeSubtopic: normalizeSubtopic,
    subtopicsFor: subtopicsFor,
    /* ── Introspection (tests only — do not mutate at runtime) ── */
    _topicAliases: TOPIC_ALIASES_LEGACY,        // alias → displayName (legacy consumers)
    _subtopicAliases: SUBTOPIC_ALIASES_LEGACY,  // alias → displayName (legacy consumers)
    _topicAliasIds: TOPIC_ALIASES,              // alias → TopicID (authoritative)
    _subtopicAliasIds: SUBTOPIC_ALIASES,        // alias → SubtopicID (authoritative)
    _systemTopics: SYSTEM_TOPICS,
    _conceptAliases: CONCEPT_CANON,
    _topicById: TOPIC_BY_ID,
    _subtopicById: SUBTOPIC_BY_ID,
  };
}));
