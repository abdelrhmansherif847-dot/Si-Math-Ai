// Machine-readable form of docs/knowledge/exam-knowledge/01-exam-structure-and-kdg.md
//
// Two sources, both supplied as INLINE IMAGES in conversation on 2026-09-05:
//   S-EXAM  "Digital SAT – Math / ST1 Math (EST I) – Current Format"
//   S-KDG   "SI MATH – KNOWLEDGE DEPENDENCY GRAPH (KDG)"
//
// Neither reached the filesystem, so neither can be hashed or re-opened. That is
// a weaker provenance than the notebook of artifact 01 (which has a sha256), and
// it is recorded rather than glossed: this transcription IS the record. Every
// row carries a confidence grade for that reason.
//
// This module is a RECORD OF WHAT TWO DOCUMENTS SAY. It is not configuration.
// The generator does not import it. Nothing here is a rule the generator obeys.

export const SOURCES = [
  {
    id: 'S-EXAM', title: 'Digital SAT – Math / ST1 Math (EST I) – Current Format',
    kind: 'infographic', medium: 'inline image', received: '2026-09-05',
    hashable: false, authority: 'project-authored summary',
    scope: 'exam architecture: counts, timing, module structure, topic order, question ranges',
  },
  {
    id: 'S-KDG', title: 'SI MATH – KNOWLEDGE DEPENDENCY GRAPH (KDG)',
    kind: 'infographic', medium: 'inline image', received: '2026-09-05',
    hashable: false, authority: 'project-authored product architecture',
    scope: 'knowledge nodes, dependency edges, cross-topic skills, representations, lesson metadata, system flow',
  },
];

// ── exam architecture (S-EXAM) ───────────────────────────────────────────────
export const EXAMS = {
  DSAT: {
    id: 'DSAT', name: 'Digital SAT – Math', formatLabel: 'Current Format (Adaptive)',
    totalQuestions: 44, totalMinutes: 70,
    structure: '2 Modules (22 + 22)', calculator: 'Allowed (built-in)',
    modules: [
      { id: 'M1', name: 'Module 1', questions: 22, minutes: 35, note: 'Same for all students' },
      { id: 'M2', name: 'Module 2', questions: 22, minutes: 35, note: 'Adaptive (easier or harder based on Module 1)' },
    ],
  },
  ST1: {
    id: 'ST1', name: 'ST1 Math (EST I)', formatLabel: 'Current Format',
    totalQuestions: 50, totalMinutes: 75,
    structure: 'Single Section (no modules)', calculator: 'Allowed',
    modules: [],
  },
};

// Topic rows, in the source's order, with its own wording and question ranges.
// `qFrom`/`qTo` are the printed range; `count` is derived and validated.
const row = (n, topic, notes, qFrom, qTo) => ({ n, topic, notes, qFrom, qTo, count: qTo - qFrom + 1 });

export const DSAT_TOPICS = [
  row(1, 'Data Analysis (Basics)', 'Data in context, units, interpretation', 1, 2),
  row(2, 'Graphs (Data)', 'Bar graphs, line graphs, scatter plots, interpreting graphs', 3, 4),
  row(3, 'Tables (Data)', 'Reading and interpreting tables', 5, 6),
  row(4, 'Mean', 'Mean of a data set', 7, 7),
  row(5, 'Median', 'Median of a data set', 8, 8),
  row(6, 'Mode', 'Mode of a data set', 9, 9),
  row(7, 'Interquartile Range', 'IQR, box plots, spread', 10, 10),
  row(8, 'Probability', 'Basic probability, experimental vs theoretical, compound events', 11, 12),
  row(9, 'Ratios, Rates, Percent', 'Ratios, unit rates, percent, conversions', 13, 14),
  row(10, 'Units and Rates', 'Unit conversions, density, speed, proportional reasoning', 15, 16),
  row(11, 'Linear Equations', 'One variable, solving, modeling', 17, 18),
  row(12, 'Linear Inequalities', 'Solving and graphing inequalities', 19, 20),
  row(13, 'Linear Functions', 'Function notation, slope, intercept, rate of change', 21, 22),
  row(14, 'Systems of Equations', 'Two linear equations, applications', 23, 24),
  row(15, 'Polynomials', 'Polynomial operations, zeros, factoring (basic)', 25, 26),
  row(16, 'Quadratic Equations', 'Solving, factoring, quadratic formula', 27, 28),
  row(17, 'Exponential Functions', 'Exponential growth/decay, models, asymptotes', 29, 30),
  row(18, 'Absolute Value', '|x|, equations, inequalities, graphs', 31, 32),
  row(19, 'Geometry (Lines & Angles)', 'Angle relationships, parallel lines, transversals', 33, 34),
  row(20, 'Triangles', 'Triangle properties, similarity, congruence, trigonometric ratios (basic)', 35, 36),
  row(21, 'Polygons', 'Polygon properties, interior/exterior angles, area', 37, 40),
  row(22, 'Circle', 'Circle properties, equation of circle, arc length, sector area', 41, 44),
];

export const ST1_TOPICS = [
  ...DSAT_TOPICS.slice(0, 22).map(r => ({ ...r })),   // rows 1–22 are printed identically
  row(23, 'Trigonometry', 'Right triangle trigonometry, special angles, trig ratios (basic)', 45, 47),
  row(24, 'Asymptote', 'Horizontal/vertical/slant asymptotes (under exponential functions)', 48, 48),
  row(25, 'Word Problems / Mixed', 'Multi-step problems, real-world applications', 49, 50),
];

// Two of the ST1 rows differ in wording from their DSAT twins. Recorded so the
// "identical" claim of §3 is precise rather than approximate.
export const ST1_WORDING_DIFFS = [
  { n: 8, dsat: 'Basic probability, experimental vs theoretical, compound events', st1: 'Basic probability, experimental vs theoretical' },
  { n: 15, dsat: 'Polynomial operations, zeros, factoring (basic)', st1: 'Polynomial operations, zeros, factoring' },
  { n: 20, dsat: 'Triangle properties, similarity, congruence, trigonometric ratios (basic)', st1: 'Triangle properties, similarity, congruence, trigonometric ratios' },
];

// S-EXAM names these as topics in their own right, explicitly not folded into a
// generic "Data Analysis" or "Statistics" topic.
export const DEDICATED_TOPICS = [
  'Graphs', 'Tables', 'Mean', 'Median', 'Mode', 'Interquartile Range', 'Asymptote',
];

export const EXAM_KEY_NOTES = [
  'Digital SAT Math: 44 questions, 70 minutes (22 in Module 1, 22 in Module 2).',
  'ST1 Math (EST I): 50 questions, 75 minutes (single section).',
  'Both allow a calculator (built-in for digital SAT).',
  'Topics are shown in the typical order used in official practice tests.',
  'Graphs, tables, mean, median, mode, interquartile range, and asymptote are treated as separate topics.',
  'Exact order can vary slightly between forms.',
];

// ── knowledge dependency graph (S-KDG) ───────────────────────────────────────
export const KDG_CLUSTERS = [
  { id: 'ALG', name: 'Algebra & Functions', colour: 'blue' },
  { id: 'GEO', name: 'Geometry & Trigonometry', colour: 'green' },
  { id: 'DATA', name: 'Data, Probability & Statistics', colour: 'purple' },
  { id: 'XT', name: 'Cross-Topic Skills', colour: 'orange' },
];

const node = (id, name, sub, cluster, conf = 'high') => ({ id, name, sub, cluster, conf });

export const KDG_NODES = [
  node('N-ORDER', 'Order of Operations', 'Operations', 'ALG'),
  node('N-EXPON', 'Exponents', 'Powers & Roots', 'ALG'),
  node('N-FACTOR', 'Factors & Multiples', 'Prime, GCF, LCM', 'ALG'),
  node('N-POLY', 'Polynomials', 'Expressions', 'ALG'),
  node('N-LINEQ', 'Linear Equations', 'One Variable', 'ALG'),
  node('N-SYSEQ', 'Systems of Equations', 'Two Variables', 'ALG'),
  node('N-INEQ', 'Inequalities', 'Linear', 'ALG'),
  node('N-ABS', 'Absolute Value', 'Equations & Inequalities', 'ALG'),
  node('N-QUAD', 'Quadratic Equations', 'Factoring / Formula / Graphing', 'ALG'),
  node('N-RATEXP', 'Rational Expressions', 'Operations & Simplification', 'ALG'),
  node('N-RADICAL', 'Radicals & Rational Exponents', 'Simplify & Solve', 'ALG'),
  node('N-EXPLOG', 'Exponential & Logarithmic Functions', 'Growth, Decay, Models', 'ALG'),
  node('N-ADVALG', 'Advanced Topics', 'Sequences, Series, Complex, Matrices, etc.', 'ALG'),
  node('N-FUNC', 'Functions', 'All forms: Linear, Quadratic, Polynomial, Rational, Exponential, Absolute Value, Piecewise, Etc.', 'ALG'),
  node('N-LINES', 'Lines & Angles', 'Basics', 'GEO'),
  node('N-POLYG', 'Polygons', 'Properties', 'GEO'),
  node('N-TRI', 'Triangles', 'Congruence, Properties', 'GEO'),
  node('N-SIM', 'Similarity', 'Similar Figures', 'GEO'),
  node('N-TRIG', 'Trigonometry', 'Ratios, Identities', 'GEO'),
  node('N-CIRC', 'Circles', 'Angles, Arcs, Chords, Tangent, Theorems', 'GEO'),
  node('N-COORD', 'Coordinate Geometry', 'Distance, Midpoint, Slope, Equations', 'GEO'),
  node('N-SOLID', 'Solid Geometry', '3D Shapes, Surface Area, Volume', 'GEO'),
  node('N-ADVGEO', 'Advanced Geometry', 'Proofs, Transformations, Constructions', 'GEO'),
  node('N-DATAREP', 'Data Representation', 'Tables, Charts, Graphs', 'DATA'),
  node('N-CENTRAL', 'Measures of Central Tendency', 'Mean, Median, Mode', 'DATA'),
  node('N-SPREAD', 'Data Spread', 'Range, IQR, Variance, Std. Dev.', 'DATA'),
  node('N-PROBBAS', 'Probability Basics', 'Events, Rules', 'DATA'),
  node('N-PCT', 'Percentage', 'Percent, Percent Change, Percent of a Number', 'DATA'),
  node('N-PROB', 'Probability', 'Conditional, Independent, Combinations, Permutations', 'DATA'),
  node('N-DIST', 'Distributions', 'Discrete, Normal, Binomial', 'DATA'),
  node('N-INFER', 'Statistical Inference', 'Sampling, Estimates, Hypothesis', 'DATA'),
  node('N-WORD', 'Word Problems', 'Translation & Modeling', 'XT'),
  node('N-UNITS', 'Units & Rates', 'Conversions, Rate Problems', 'XT'),
  node('N-LOGIC', 'Logic & Reasoning', 'Patterns, Sequences, Logical Thinking', 'XT'),
  node('N-TIMEWORK', 'Time & Work', 'Work, Speed, Time Problems', 'XT'),
];

// The legend's four relation kinds, kept distinct. Collapsing them into one
// generic dependency would lose the whole point of the graph.
export const EDGE_TYPES = [
  { id: 'prerequisite', legend: 'Prerequisite (Must know before)', glyph: 'solid arrow', directed: true },
  { id: 'supporting', legend: 'Supporting / Related', glyph: 'dashed arrow', directed: true },
  { id: 'unlocks', legend: 'Enables / Unlocks', glyph: 'dotted arrow', directed: true },
  { id: 'strong', legend: 'Strong Relationship (Both ways)', glyph: 'double arrow', directed: false },
];

const e = (from, to, type, conf = 'high', src = 'panel') => ({ from, to, type, conf, src });

export const KDG_EDGES = [
  // Panel 1 — the Algebra & Functions spine, read top to bottom.
  e('N-ORDER', 'N-EXPON', 'prerequisite'),
  e('N-EXPON', 'N-FACTOR', 'prerequisite'),
  e('N-FACTOR', 'N-POLY', 'prerequisite'),
  e('N-POLY', 'N-LINEQ', 'prerequisite'),
  e('N-LINEQ', 'N-SYSEQ', 'prerequisite'),
  e('N-SYSEQ', 'N-QUAD', 'prerequisite'),
  e('N-QUAD', 'N-RATEXP', 'prerequisite'),
  e('N-RATEXP', 'N-RADICAL', 'prerequisite'),
  e('N-RADICAL', 'N-EXPLOG', 'prerequisite'),
  e('N-EXPLOG', 'N-ADVALG', 'prerequisite'),
  e('N-SYSEQ', 'N-INEQ', 'supporting', 'med'),
  e('N-SYSEQ', 'N-ABS', 'supporting', 'med'),
  // Panel 2 — Geometry & Trigonometry spine.
  e('N-LINES', 'N-POLYG', 'prerequisite'),
  e('N-POLYG', 'N-TRI', 'prerequisite'),
  e('N-TRI', 'N-SIM', 'prerequisite'),
  e('N-SIM', 'N-TRIG', 'prerequisite'),
  e('N-TRIG', 'N-CIRC', 'prerequisite'),
  e('N-CIRC', 'N-COORD', 'prerequisite'),
  e('N-COORD', 'N-SOLID', 'prerequisite'),
  e('N-SOLID', 'N-ADVGEO', 'prerequisite'),
  // Panel 3 — Data, Probability & Statistics spine.
  e('N-DATAREP', 'N-CENTRAL', 'prerequisite'),
  e('N-CENTRAL', 'N-SPREAD', 'prerequisite'),
  e('N-SPREAD', 'N-PROBBAS', 'prerequisite'),
  e('N-PROBBAS', 'N-PCT', 'prerequisite'),
  e('N-PCT', 'N-PROB', 'prerequisite'),
  e('N-PROB', 'N-DIST', 'prerequisite'),
  e('N-DIST', 'N-INFER', 'prerequisite'),
  // Panel 5 — the high-level cross-topic map.
  e('N-ORDER', 'N-EXPON', 'strong', 'high', 'panel5'),
  e('N-ORDER', 'N-POLY', 'prerequisite', 'high', 'panel5'),
  e('N-EXPON', 'N-POLY', 'prerequisite', 'high', 'panel5'),
  e('N-TRI', 'N-POLY', 'supporting', 'med', 'panel5'),
  e('N-POLY', 'N-DATAREP', 'supporting', 'med', 'panel5'),
  e('N-POLY', 'N-LINEQ', 'prerequisite', 'high', 'panel5'),
  e('N-LINEQ', 'N-SIM', 'supporting', 'med', 'panel5'),
  e('N-LINEQ', 'N-SYSEQ', 'prerequisite', 'high', 'panel5'),
  e('N-LINEQ', 'N-FUNC', 'prerequisite', 'high', 'panel5'),
  e('N-LINEQ', 'N-PROBBAS', 'supporting', 'med', 'panel5'),
  e('N-SIM', 'N-WORD', 'supporting', 'med', 'panel5'),
  e('N-SYSEQ', 'N-WORD', 'supporting', 'med', 'panel5'),
  e('N-FUNC', 'N-WORD', 'supporting', 'med', 'panel5'),
  e('N-PROBBAS', 'N-WORD', 'supporting', 'med', 'panel5'),
  // Panel 8 — the Quadratic Equations metadata example, which states its own
  // prerequisite and unlock sets explicitly rather than by arrow.
  e('N-ORDER', 'N-QUAD', 'prerequisite', 'high', 'panel8'),
  e('N-EXPON', 'N-QUAD', 'prerequisite', 'high', 'panel8'),
  e('N-POLY', 'N-QUAD', 'prerequisite', 'high', 'panel8'),
  e('N-LINEQ', 'N-QUAD', 'prerequisite', 'high', 'panel8'),
  e('N-ABS', 'N-QUAD', 'prerequisite', 'high', 'panel8'),
  e('N-QUAD', 'N-FUNC', 'unlocks', 'high', 'panel8'),
  e('N-QUAD', 'N-SYSEQ', 'unlocks', 'high', 'panel8'),
  e('N-QUAD', 'N-INEQ', 'unlocks', 'high', 'panel8'),
  e('N-QUAD', 'N-EXPLOG', 'unlocks', 'high', 'panel8'),
  e('N-QUAD', 'N-ADVALG', 'unlocks', 'high', 'panel8'),
  e('N-QUAD', 'N-RATEXP', 'supporting', 'high', 'panel8'),
  e('N-QUAD', 'N-ABS', 'supporting', 'high', 'panel8'),
];

// Panel 1 draws dashed connectors from several algebra nodes into the FUNCTIONS
// box. The bundle is dense enough that the exact membership cannot be read off
// the graphic, so it is recorded as a stated fact with an unread member list
// rather than guessed edge by edge.
export const FUNCTIONS_BUNDLE = {
  target: 'N-FUNC',
  stated: 'multiple Algebra & Functions nodes connect into the FUNCTIONS (All forms) box',
  memberList: 'UNREADABLE',
  formsListedInsideBox: ['Linear', 'Quadratic', 'Polynomial', 'Rational', 'Exponential', 'Absolute Value', 'Piecewise', 'Etc.'],
};

export const CROSS_TOPIC_SKILLS = [
  { id: 'N-WORD', name: 'Word Problems', sub: 'Translation & Modeling' },
  { id: 'N-UNITS', name: 'Units & Rates', sub: 'Conversions, Rate Problems' },
  { id: 'N-LOGIC', name: 'Logic & Reasoning', sub: 'Patterns, Sequences, Logical Thinking' },
  { id: 'N-TIMEWORK', name: 'Time & Work', sub: 'Work, Speed, Time Problems' },
];

export const CROSS_TOPIC_STATEMENT = {
  hub: 'Can be related to ALL topics',
  note: 'These skills are not tied to one lesson. They are cross-topic and essential for all problem types.',
};

export const REPRESENTATIONS = [
  { id: 'R-WORD', name: 'Word Problem', form: 'Real Life' },
  { id: 'R-TABLE', name: 'Table', form: 'Data Form' },
  { id: 'R-GRAPH', name: 'Graph', form: 'Visual Form' },
  { id: 'R-NEQ', name: 'Normal Equation', form: 'Symbolic Form', example: 'ax + by = c' },
  { id: 'R-SEQ', name: 'Small Equation', form: 'Simple Form', example: 'x + 3 = 7' },
];

// Panel 7: every row carries a tick in every column.
export const REPRESENTATION_MATRIX = {
  rows: ['Algebra Topics', 'Geometry Topics', 'Trigonometry Topics', 'Data / Statistics Topics', 'Probability Topics', 'All Other Math Topics'],
  allTicked: true,
  note: 'The same concept may look different, but the underlying math is the same. Si Math connects all representations to the same knowledge.',
};

export const METADATA_TEMPLATE_COLUMNS = [
  'Basic Info', 'Prerequisites (Must Know Before)', 'Unlocks (Enables)',
  'Related Lessons (Supporting)', 'Skills Required', 'Common Root Causes',
  'Common Mistakes', 'Skill Tags (Type)', 'Percent Contributions (Example)',
  'Appears As (Representations)',
];

export const METADATA_EXAMPLE = {
  node: 'Quadratic Equations',
  basicInfo: { type: 'Concept + Calculation', difficulty: '3 / 5', examWeightSAT: 'High', examWeightACT: 'High', examWeightEST: 'High' },
  prerequisites: ['Order of Operations', 'Exponents', 'Polynomials', 'Linear Equations', 'Factoring', 'Fractions & Decimals', 'Absolute Value'],
  unlocks: ['Functions', 'Parabola', 'Systems of Equations', 'Inequalities', 'Exponential Functions', 'Advanced Algebra'],
  relatedLessons: ['Rational Expressions', 'Inequalities', 'Absolute Value', 'Systems of Equations', 'Functions'],
  skillsRequired: ['Factoring', 'Equation Solving', 'Graph Reading', 'Algebraic Manipulation', 'Logic & Reasoning'],
  commonRootCauses: ['Factoring Errors', 'Sign Errors', 'Misapplying Formula', 'Arithmetic Errors', 'Dropping Solutions'],
  commonMistakes: ['Incorrect Factoring', 'Wrong Discriminant', 'Forgetting ± in Formula', 'Calculation Mistakes', 'Dropping Solutions'],
  skillTags: ['Calculation', 'Algebraic', 'Concept', 'Logic', 'Reasoning'],
  appearsAs: ['R-WORD', 'R-TABLE', 'R-GRAPH', 'R-NEQ', 'R-SEQ'],
};

// The same example is printed twice, and the two printings disagree. Both are
// kept; see the conflict register.
export const PERCENT_CONTRIBUTION = {
  targetLesson: 'Quadratic Equations',
  panel6: [
    ['Polynomials', 24], ['Linear Equations', 20], ['Factoring', 16],
    ['Order of Operations', 12], ['Exponents', 8], ['Fractions & Decimals', 6],
    ['Inequalities', 4], ['Absolute Value', 3], ['Other / Minor Skills', 1],
  ],
  panel6StatedTotal: 100,
  panel8: [
    ['Polynomials', 24], ['Linear Equations', 20], ['Factoring', 16],
    ['Order of Operations', 12], ['Exponents', 8], ['Fractions', 6], ['Others', 14],
  ],
  readConfidence: 'med',   // small bar labels on an infographic
};

export const GRAPH_RULES = [
  { n: 1, name: 'Prerequisite Rule', text: 'You must master the prerequisites before moving forward.' },
  { n: 2, name: 'Root Cause Rule', text: 'If a student is weak in a lesson, the system checks prerequisites to find the true gap.' },
  { n: 3, name: 'Recovery Path Rule', text: 'Focus Practice builds a personalized path starting from the root cause and moving forward.' },
  { n: 4, name: 'Dynamic Weight Rule', text: 'Percent contributions are not fixed. They are learned from real student performance.' },
  { n: 5, name: 'Continuous Update Rule', text: 'The graph improves as more students solve questions.' },
];

export const SYSTEM_FLOW = [
  'Student Solves Question', 'Truth Engine Verifies Answer', 'Weakness Analyzer Finds Weak Lesson',
  'Root Cause Analyzer Finds True Cause (Using KDG)', 'Focus Practice Builds Recovery Path (Following KDG)',
  'Learning Timeline Tracks Progress Over Time', 'Improvement & Mastery',
];

export const EXAMPLE_FLOW = {
  trigger: 'Student gets wrong answer in Quadratic Equation (Word Problem).',
  steps: [
    'Truth Engine: Verifies the correct answer and steps.',
    'Weakness Analyzer: Marks weakness in Quadratic Equations.',
    'Root Cause Analyzer (using KDG): Finds true gap → Polynomials.',
    'Focus Practice: Sends practice on Polynomials → then Quadratics.',
    'Learning Timeline: Tracks improvement in Polynomials & Quadratics.',
    'Student improves → graph updates → path shortens.',
  ],
};

export const KEY_BENEFITS = [
  'Finds the real root cause of weakness.', 'Builds the shortest recovery path.',
  'Works for all question types & representations.', 'Personalizes learning for every student.',
  'Improves accuracy of diagnosis.', 'Saves time and increases mastery.',
  'Works for all subjects and exams.',
];

export const KEY_IDEA = 'Si Math connects concepts, skills, and representations in one intelligent graph. ' +
  'It does not just tell students where they are weak, but why, and how to fix it in the most efficient path.';

// ── exam topic ↔ knowledge node ──────────────────────────────────────────────
// INFERRED THROUGHOUT. The two sources do not cross-reference each other: S-EXAM
// names topics, S-KDG names nodes, and neither says which is which. Every row
// here is this ingestion's mapping, not either document's claim.
//
// The mapping is many-to-many on purpose. Where several exam topics land on one
// node, the exam source is FINER than the graph; where one exam topic spans
// several nodes, it is COARSER. Both directions occur, and §11 of the artifact
// reads the pattern.
export const TOPIC_NODE_MAP = [
  { topic: 'Data Analysis (Basics)', nodes: ['N-DATAREP'] },
  { topic: 'Graphs (Data)', nodes: ['N-DATAREP'] },
  { topic: 'Tables (Data)', nodes: ['N-DATAREP'] },
  { topic: 'Mean', nodes: ['N-CENTRAL'] },
  { topic: 'Median', nodes: ['N-CENTRAL'] },
  { topic: 'Mode', nodes: ['N-CENTRAL'] },
  { topic: 'Interquartile Range', nodes: ['N-SPREAD'] },
  { topic: 'Probability', nodes: ['N-PROBBAS', 'N-PROB'] },
  { topic: 'Ratios, Rates, Percent', nodes: ['N-PCT', 'N-UNITS'] },
  { topic: 'Units and Rates', nodes: ['N-UNITS'] },
  { topic: 'Linear Equations', nodes: ['N-LINEQ'] },
  { topic: 'Linear Inequalities', nodes: ['N-INEQ'] },
  { topic: 'Linear Functions', nodes: ['N-FUNC', 'N-COORD'] },
  { topic: 'Systems of Equations', nodes: ['N-SYSEQ'] },
  { topic: 'Polynomials', nodes: ['N-POLY', 'N-FACTOR'] },
  { topic: 'Quadratic Equations', nodes: ['N-QUAD'] },
  { topic: 'Exponential Functions', nodes: ['N-EXPLOG', 'N-FUNC'] },
  { topic: 'Absolute Value', nodes: ['N-ABS'] },
  { topic: 'Geometry (Lines & Angles)', nodes: ['N-LINES'] },
  { topic: 'Triangles', nodes: ['N-TRI', 'N-SIM', 'N-TRIG'] },
  { topic: 'Polygons', nodes: ['N-POLYG'] },
  { topic: 'Circle', nodes: ['N-CIRC', 'N-COORD'] },
  { topic: 'Trigonometry', nodes: ['N-TRIG'] },
  { topic: 'Asymptote', nodes: ['N-EXPLOG'] },
  { topic: 'Word Problems / Mixed', nodes: ['N-WORD'] },
];

// The live production taxonomy, for reconciliation only. Read from
// taxonomy.core.js on 2026-09-05: 5 topics, 33 subtopics. taxonomy.core.js is
// FROZEN in practice (CLAUDE.md §2 — taxonomy.js is generated from it and CI
// fails on drift), so any move toward the S-EXAM or S-KDG model is a deliberate
// unfreeze decision, not a refactor. Nothing here proposes one.
export const LIVE_TAXONOMY_SNAPSHOT = {
  readOn: '2026-09-05', version: 1, topics: 5, subtopics: 33,
  frozen: true,
  granularityConflicts: [
    { live: 'Mean, Median & Mode (one subtopic)', sExam: 'Mean, Median, Mode (three dedicated topics)', sKdg: 'Measures of Central Tendency (one node)' },
    { live: 'Range & Interval (one subtopic)', sExam: 'Interquartile Range (dedicated topic)', sKdg: 'Data Spread (one node)' },
    { live: 'Data Analysis; Scatter Plots; Stem-and-Leaf Plots', sExam: 'Graphs and Tables (two dedicated topics)', sKdg: 'Data Representation (one node)' },
    { live: 'no Asymptote subtopic', sExam: 'Asymptote (dedicated topic, ST1 Q48)', sKdg: 'no Asymptote node' },
  ],
};

// ── the claim register ───────────────────────────────────────────────────────
// One entry per assertion the artifact makes about the two sources, with the
// class it was graded at. The §18 table is DERIVED from this by the validator;
// it is not typed by hand. (It was, once, and read 47 against a true 60.)
const C = (id, cls, text) => ({ id, cls, text });
export const CLAIMS = [
  C('EK-DSAT-01', 'SOURCE-STATED', '44 questions, 70 minutes, two modules of 22 at 35 minutes'),
  C('EK-DSAT-02', 'SOURCE-STATED', 'Module 1 identical for all; Module 2 adaptive on Module 1'),
  C('EK-DSAT-03', 'SOURCE-STATED', 'calculator allowed, built in'),
  C('EK-DSAT-04', 'NOT-SPECIFIED', 'what the adaptive branch changes beyond easier/harder'),
  C('EK-ST1-01', 'SOURCE-STATED', '50 questions, 75 minutes, single section, no modules'),
  C('EK-ST1-02', 'SOURCE-STATED', 'calculator allowed'),
  C('EK-ST1-03', 'INFERRED', 'ST1 is not adaptive — it has no modules to adapt between'),
  C('EK-ST1-04', 'NOT-SPECIFIED', 'ST1 internal timing, breaks, pacing'),
  C('EK-REL-01', 'SOURCE-STATED', 'rows 1–22 identical in both exams; ST1 extends over Q45–50'),
  C('EK-REL-02', 'SOURCE-STATED', 'three ST1 rows carry shorter wording than their DSAT twins'),
  C('EK-REL-03', 'INFERRED', 'the identical 44-question mapping is more plausibly a template artefact than a claim'),
  C('EK-TOPIC-01', 'SOURCE-STATED', 'seven dedicated topics, not to be folded into a generic Data Analysis'),
  C('EK-TOPIC-02', 'NOT-SPECIFIED', 'topic hierarchy in S-EXAM'),
  C('EK-TOPIC-03', 'SOURCE-STATED', 'Asymptote sits under Exponential Functions while staying dedicated'),
  C('EK-ORDER-01', 'SOURCE-STATED', 'topics appear in a fixed printed order, numbered 1–22 and 1–25'),
  C('EK-ORDER-02', 'SOURCE-STATED', 'the order is the typical order used in official practice tests'),
  C('EK-ORDER-03', 'SOURCE-STATED', 'exact order can vary slightly between forms'),
  C('EK-ORDER-04', 'UNKNOWN', 'whether the data→algebra→geometry progression is design or convention'),
  C('EK-NUM-01', 'SOURCE-STATED', 'Digital SAT numbers 1–44 continuously across both modules'),
  C('EK-NUM-02', 'SOURCE-STATED', 'ST1 numbers 1–50 in one sequence'),
  C('EK-NUM-03', 'SOURCE-STATED', 'each topic occupies a contiguous question range'),
  C('EK-NUM-04', 'SOURCE-STATED', 'ranges print as an interval, or a bare number for one question'),
  C('EK-DIST-01', 'SOURCE-STATED', 'the default allocation is 2 questions per topic'),
  C('EK-DIST-02', 'SOURCE-STATED', 'the four single-question topics are Mean, Median, Mode, IQR'),
  C('EK-DIST-03', 'SOURCE-STATED', 'the two four-question topics are Polygons and Circle'),
  C('EK-DIST-04', 'NOT-SPECIFIED', 'percentage weights or allowed ranges for topic distribution'),
  C('EK-STRAT-01', 'NOT-SPECIFIED', 'four exam strategies in S-EXAM or S-KDG'),
  C('EK-STRAT-02', 'UNKNOWN', 'whether EP-1..EP-4 apply to the Digital SAT, ST1, or both'),
  C('EK-STRAT-03', 'INFERRED', 'the Digital SAT allows 1.59 min/question against ST1 1.50'),
  C('EK-KDG-01', 'SOURCE-STATED', 'multiple algebra nodes connect into FUNCTIONS (All forms)'),
  C('EK-KDG-02', 'UNKNOWN', 'which nodes exactly — the bundle is unreadable'),
  C('EK-KDG-03', 'UNKNOWN', 'the meaning of the red outlines and red connector in panel 3'),
  C('EK-KDG-04', 'SOURCE-STATED', 'percent contributions are learned from student data, not authored'),
  C('EK-KDG-05', 'SOURCE-STATED', 'the KDG is consumed by Root Cause Analyzer and Focus Practice'),
  C('EK-KDG-06', 'NOT-SPECIFIED', 'whether those components exist, and in what state'),
  C('EK-KDG-07', 'SOURCE-STATED', 'the metadata template is populated for one node of 35'),
  C('EK-KDG-08', 'SOURCE-STATED', 'the metadata names four items that are not nodes anywhere'),
  C('EK-KDG-09', 'UNKNOWN', 'the distinction between Common Root Causes and Common Mistakes'),
  C('EK-EDGE-01', 'SOURCE-STATED', 'four distinct relation kinds exist and are visually distinguished'),
  C('EK-EDGE-02', 'SOURCE-STATED', 'prerequisite and unlocks are converse but not redundant'),
  C('EK-EDGE-03', 'UNKNOWN', 'whether supporting implies ordering or is purely associative'),
  C('EK-EDGE-04', 'UNKNOWN', 'whether an edge carries a weight'),
  C('EK-MAP-01', 'INFERRED', '24 of 35 nodes are reached by an exam topic; 11 are not'),
  C('EK-MAP-02', 'INFERRED', 'Order of Operations and Exponents are absent because they are prerequisites'),
  C('EK-MAP-03', 'INFERRED', 'Logic & Reasoning and Time & Work are absent because they are cross-topic'),
  C('EK-MAP-04', 'INFERRED', 'seven nodes are genuinely out of blueprint scope for both exams'),
  C('EK-COV-01', 'INFERRED', "ST1's extra topics add one node the DSAT blueprint does not already reach"),
  C('EK-DEP-01', 'INFERRED', 'maximum prerequisite depth is 10, at Advanced Topics'),
  C('EK-DEP-02', 'INFERRED', 'Quadratic Equations is the only node with more than three direct prerequisites'),
  C('EK-DEP-03', 'INFERRED', 'depth is an artefact of the three drawn spines and should be treated as provisional'),
  C('EK-DEP-04', 'SOURCE-STATED', 'three of four cross-topic skills are drawn with no connectors at all'),
  C('EK-XT-01', 'SOURCE-STATED', 'four cross-topic skills, explicitly not tied to one lesson'),
  C('EK-XT-02', 'SOURCE-STATED', 'they relate to ALL topics'),
  C('EK-XT-03', 'INFERRED', 'cross-topic skills are given no parent in the taxonomy — a design decision of this ingestion'),
  C('EK-XT-04', 'SOURCE-STATED', 'a cross-topic skill can also be a numbered exam topic with its own range'),
  C('EK-REP-01', 'SOURCE-STATED', 'five representation forms are named, two with symbolic examples'),
  C('EK-REP-02', 'SOURCE-STATED', 'every topic family can appear in every representation'),
  C('EK-REP-03', 'INFERRED', 'because universally true, the matrix carries no discriminating information'),
  C('EK-REP-04', 'UNKNOWN', 'what separates Normal Equation from Small Equation'),
  C('EK-CONF-01', 'UNKNOWN', 'whether a panel 10 exists or the numbering slipped'),
];

// Recorded, never resolved. The validator refuses to let these be emptied.
export const CONFLICTS = [
  { id: 'XC-1', about: 'the Digital SAT module boundary',
    a: 'header, module table and key note all say 22 + 22',
    b: 'the topic table draws the boundary after row 11 (Q18), implying 18 / 26',
    note: 'arithmetic favours A; the boundary belongs after row 13', resolved: false },
  { id: 'XC-2', about: 'the percent-contribution example, printed twice',
    a: 'panel 6 lists nine prerequisites summing to 94% under a stated total of 100%',
    b: 'panel 8 lists seven summing to 100% with a single Others 14%',
    note: 'bar labels read at medium confidence; by EK-KDG-04 the weights are learned anyway', resolved: false },
  { id: 'XC-3', about: 'two exams sharing one topic table',
    a: 'S-EXAM prints identical topics and ranges for all 44 shared questions',
    b: 'the key note says exact order can vary slightly between forms',
    note: 'likely a template artefact — EK-REL-03', resolved: false },
  { id: 'XC-4', about: 'three incompatible granularities for central tendency',
    a: 'S-EXAM: Mean, Median, Mode as three dedicated topics; S-KDG: one node',
    b: 'live taxonomy.core.js: one subtopic "Mean, Median & Mode" — and it is frozen',
    note: 'same split recurs for spread and for data display; Asymptote has no counterpart', resolved: false },
  { id: 'XC-5', about: 'question numbering across modules',
    a: 'S-EXAM: Digital SAT numbers 1–44 continuously',
    b: 'artifact 01N: the notebook item logs restart at 1 for module 2, twice',
    note: 'may both be true of different things — instrument versus note-taker', resolved: false },
];

// Fields a future question source must NOT populate from these two documents.
export const NOT_YET_DEFINABLE = [
  { field: 'archetype', why: 'neither source contains a single worked question; the existing archetype library came from 200 coded reference items' },
  { field: 'difficultyEvidence', why: 'S-KDG gives one node of 35 a difficulty of 3/5 with no scale defined; that is an illustration, not a model' },
];
