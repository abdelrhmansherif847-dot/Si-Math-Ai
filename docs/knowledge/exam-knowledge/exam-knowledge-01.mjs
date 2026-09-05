// Machine-readable form of docs/knowledge/exam-knowledge/01-exam-knowledge-ingestion.md
//
// Source: one handwritten notebook, 24 image-only pages, sha256 b56e34e6…83c27.
// This module is a RECORD OF WHAT ONE DOCUMENT SAYS. It is not configuration,
// the generator does not import it, and nothing here is a rule the generator
// obeys. Its job is to make the ingestion auditable: every claim carries the
// evidence class it was graded at, and scripts/validate-exam-knowledge.mjs
// fails CI if a claim loses its grade, a page falls out of the inventory, or a
// recorded conflict is quietly resolved.
//
// The evidence classes are the ingestion brief's, and they are load-bearing:
//   SOURCE-STATED  written on the page
//   INFERRED       derived by the ingestion; the document does not say it
//   NOT-SPECIFIED  asked for, and absent
//   UNKNOWN        gestured at without being determined
// Nothing is graded HARD RULE, because the document asserts no obligations.

export const SOURCE = {
  filename: 'Exams_Knowledge_compressed.pdf',
  bytes: 5871907,
  md5: '5a12df07daf5962b3212df60d88545da',
  sha256: 'b56e34e6140df8986a2022b3f7b6880fc3f93e476637e432ecf3b3af17983c27',
  pages: 24,
  pdfVersion: '1.7',
  revisions: 1,
  textLayerChars: 0,          // image-only; every page read as an image
  scanner: 'CamScanner',
  kind: 'handwritten personal notebook',
  authority: 'notebook',      // NOT a specification, publisher document or blueprint
  ingestedOn: '2026-09-05',
  // The harness announced 58 pages. The page tree says /Count 24 with 24 kids,
  // in a single-revision file. 24 is the measured truth; 58 was not used.
  harnessReportedPages: 58,
};

// Every page classified. The validator checks this covers 1..24 exactly once.
export const PAGE_INVENTORY = [
  { page: 1, cls: 'topic-list', note: 'EST → Focus; braces HarD ParT and Mid' },
  { page: 2, cls: 'topic-list', note: 'Easy band; SAT 22/22 Mod 1,2 Adaptive; Hardest/Famous list' },
  { page: 3, cls: 'item-log', note: 'Form S1 module 1, items 1–15' },
  { page: 4, cls: 'item-log', note: 'S1 module 1 items 16–22; Mod 2 (H) items 1–8' },
  { page: 5, cls: 'item-log', note: 'S1 module 2, items 10–21' },
  { page: 6, cls: 'item-log', note: 'S1 module 2 item 22; Nov SAT Mod ① items 1–9' },
  { page: 7, cls: 'item-log', note: 'S2 module 1, items 10–22' },
  { page: 8, cls: 'item-log', note: 'S2 Mod ② Hard, items 1–12' },
  { page: 9, cls: 'item-log', note: 'S2 module 2, items 13–22' },
  { page: 10, cls: 'topic-map', note: 'EST for SAT most tricky Questions; mixing of Hard topics' },
  { page: 11, cls: 'teaching', note: 'Student main/famous problems; 30 Instagram + tiktok Reels' },
  { page: 12, cls: 'teaching', note: 'score-chasing; repetition without error review' },
  { page: 13, cls: 'teaching', note: 'same-topic re-failure; fear of tables/word problem/graph/probability' },
  { page: 14, cls: 'teaching', note: 'timing; calculator; one Arabic line' },
  { page: 15, cls: 'teaching', note: 'resource breadth; post-exam error review' },
  { page: 16, cls: 'teaching', note: 'silly mistakes; pure 800 → 58 Q true' },
  { page: 17, cls: 'score-bands', note: '400→500→600→700→750→800 IS NOT THE SAME WORK' },
  { page: 18, cls: 'teaching', note: 'retake expectations; Arabic-background belief rejected' },
  { page: 19, cls: 'topic-depth', note: 'written sideways; the work for each topic is not the same' },
  { page: 20, cls: 'teaching', note: 'no Hard Question; 5-step solving procedure' },
  { page: 21, cls: 'teaching', note: 'lesson ≠ mastery; min 80%; eliminate 2-choices' },
  { page: 22, cls: 'test-types', note: 'Tests Types ①–④; detail on ①' },
  { page: 23, cls: 'test-types', note: 'type ② and type ③' },
  { page: 24, cls: 'test-types', note: 'type ④; the 5/5/5/5 series table' },
];

// The four test types (§7). NOT four assembly blueprints — they vary stress,
// traps, step length and ordering over a content model they share.
export const TEST_TYPES = [
  {
    id: 'TT-1', ordinal: 1, name: 'Tests take more the normal time',
    difficulty: 'Qeustion most Easy and medium',
    steps: 'Large steps more than normal',
    numbers: 'Numbers is complicated',
    demand: 'need organize not smart',
    risk: 'More risk than Hard Qeustion',
    failureMode: 'waste alot of time in easy questions',
  },
  {
    id: 'TT-2', ordinal: 2, name: 'Tests have a Easy, but tricky Qeustion',
    trap: 'small change in a word of question',
    demand: 'need to read well not calculate or solve fast',
    failureMode: 'Student solve fast and wrong',
  },
  {
    id: 'TT-3', ordinal: 3, name: 'Tests make the student so stressfull while solving',
    ordering: 'first to is Hard … and after question get easy at last',
    trains: 'recovery — don\'t collapse at the start, continue even if the start was bad',
  },
  {
    id: 'TT-4', ordinal: 4, name: 'Perfect Normal test',
    alsoCalled: '(Real Simulation) Perfect test',
    hard: 'clear and not alot', medium: 'need foucs', easy: 'end fast',
    ordering: 'Normal arrange',   // never defined — SK-ORDER-03
    purpose: 'student get out of it this is near to his score',
    scorePredictor: true,
  },
];

export const DIFFICULTY_BANDS = [
  { id: 'DB-EASY', name: 'Easy', page: 2, clear: ['Polynomial', 'Complex', 'calc.'] },
  { id: 'DB-MID', name: 'Mid', page: 1, clear: ['Linear Function', 'circle', 'trigonometry', 'Qaudratic / Prapola'] },
  {
    id: 'DB-HARD', name: 'HarD ParT', page: 1,
    clear: ['exp + comp. in', 'Ratio / prop', 'solid geo', 'similarity', 'time/work/s.', 'graphes', 'tables'],
  },
];

// Two topics act as vehicles that other topics arrive through (SK-TOPIC-01).
// Kept separate from topics on purpose — conflating them loses the idea.
export const CARRIERS = [
  { id: 'C-WORD', name: 'word problem' },
  { id: 'C-GRAPHTAB', name: 'GRAPHS / TABLES' },
];

// Labels, not definitions. The document did not define its topics, so these
// cannot either; a later source that defines them keeps the identifier.
export const TOPICS = [
  ['T-ALG-LIN', 'Linear equations & functions'], ['T-ALG-SYS', 'Systems of equations'],
  ['T-ALG-INEQ', 'Inequalities'], ['T-ALG-ABS', 'Absolute value'],
  ['T-ALG-QUAD', 'Quadratics & parabolas'], ['T-ALG-POLY', 'Polynomials'],
  ['T-ALG-EXPR', 'Expressions & factoring'], ['T-ALG-EXP', 'Exponents & exponentials'],
  ['T-ALG-COMPINT', 'Compound interest'], ['T-FUN-GEN', 'Functions (general)'],
  ['T-FUN-RAT', 'Rational functions'], ['T-FUN-TRANS', 'Transformations'],
  ['T-NUM-PCT', 'Percent'], ['T-NUM-RATIO', 'Ratio & proportion'], ['T-NUM-RATE', 'Rates'],
  ['T-STA-DATA', 'Data analysis'], ['T-STA-CENTRE', 'Mean / median / mode / range'],
  ['T-STA-MOE', 'Margin of error'], ['T-STA-SCATTER', 'Scatter plots'],
  ['T-STA-PROB', 'Probability'], ['T-CMB-PERCOMB', 'Permutations & combinations'],
  ['T-GEO-GEN', 'Geometry (general)'], ['T-GEO-TRI', 'Triangles'],
  ['T-GEO-ANG', 'Angles & lines'], ['T-GEO-POLY', 'Polygons'], ['T-GEO-CIRC', 'Circles'],
  ['T-GEO-SOLID', 'Solid geometry'], ['T-GEO-SIM', 'Similarity'], ['T-GEO-TRIG', 'Trigonometry'],
  ['T-LOG-GEN', 'Logic'], ['T-CPX-GEN', 'Complex numbers'],
].map(([id, name]) => ({ id, name }));

// The claim register. Each entry is one thing the ingestion asserts about the
// document, with the class it was graded at.
export const CLAIMS = [
  { id: 'SK-STRUCT-01', cls: 'SOURCE-STATED', text: 'SAT is delivered in two modules, Mod 1 and Mod 2' },
  { id: 'SK-STRUCT-02', cls: 'SOURCE-STATED', text: 'each module carries 22 questions' },
  { id: 'SK-STRUCT-03', cls: 'SOURCE-STATED', text: 'delivery is Adaptive (term used, mechanism not defined)' },
  { id: 'SK-STRUCT-04', cls: 'SOURCE-STATED', text: 'the second module is labelled hard; the first is unlabelled' },
  { id: 'SK-STRUCT-05', cls: 'UNKNOWN', text: 'whether Mod 2 (H) names the adaptive hard branch or one sitting' },
  { id: 'SK-STRUCT-06', cls: 'NOT-SPECIFIED', text: 'EST exam structure' },
  { id: 'SK-TIME-01', cls: 'NOT-SPECIFIED', text: 'exam timing, in any form' },
  { id: 'SK-TOPIC-01', cls: 'SOURCE-STATED', text: 'word problem and GRAPHS/TABLES are carriers for other topics' },
  { id: 'SK-TOPIC-02', cls: 'SOURCE-STATED', text: 'a question may span 2–3 topics; famous in D.SAT' },
  { id: 'SK-TOPIC-03', cls: 'NOT-SPECIFIED', text: 'topic hierarchy / subtopics' },
  { id: 'SK-DIST-01', cls: 'NOT-SPECIFIED', text: 'stated topic distribution — no %, count, range or quota' },
  { id: 'SK-DIST-02', cls: 'INFERRED', text: 'composite items are commoner in module 2 than module 1' },
  { id: 'SK-ORDER-01', cls: 'NOT-SPECIFIED', text: 'general question-ordering rule' },
  { id: 'SK-ORDER-02', cls: 'SOURCE-STATED', text: 'type TT-3 runs hard-first, easing to the end' },
  { id: 'SK-ORDER-03', cls: 'UNKNOWN', text: 'Normal arrange is named as TT-4 baseline and never defined' },
  { id: 'SK-NUM-01', cls: 'SOURCE-STATED', text: 'numbering is 1..22 within each module, restarting at 1' },
  { id: 'SK-NUM-02', cls: 'SOURCE-STATED', text: 'sequential integers, no gaps, no letter suffixes' },
  { id: 'SK-NUM-03', cls: 'NOT-SPECIFIED', text: 'any question-number to topic relationship' },
  { id: 'SK-TYPE-01', cls: 'SOURCE-STATED', text: 'there are exactly four test types, numbered ①–④' },
  { id: 'SK-TYPE-02', cls: 'SOURCE-STATED', text: 'type TT-4 alone is described as predicting the real score' },
  { id: 'SK-TYPE-03', cls: 'SOURCE-STATED', text: 'the four types differ by stress and time profile, not topic content' },
  { id: 'SK-TYPE-04', cls: 'NOT-SPECIFIED', text: 'construction consequences beyond the tabulated properties' },
  { id: 'SK-SERIES-01', cls: 'INFERRED', text: 'the four page-24 columns map onto the four test types' },
  { id: 'SK-SERIES-02', cls: 'INFERRED', text: 'each column\'s 5 means five tests per type, twenty in total' },
  { id: 'SK-SERIES-03', cls: 'SOURCE-STATED', text: 'Hard Level increase well spans the four columns' },
  { id: 'SK-SERIES-04', cls: 'INFERRED', text: 'the circled labels are the intended student reaction per stage' },
  { id: 'SK-QT-01', cls: 'SOURCE-STATED', text: 'GRAPHS / TABLES is a top-level carrier' },
  { id: 'SK-QT-02', cls: 'SOURCE-STATED', text: 'word problem is a top-level carrier' },
  { id: 'SK-QT-03', cls: 'SOURCE-STATED', text: 'named stimulus objects: scatter plot, tables, graphs, linear/function graph' },
  { id: 'SK-QT-04', cls: 'NOT-SPECIFIED', text: 'geometry figure conventions' },
  { id: 'SK-QT-05', cls: 'INFERRED', text: 'multiple choice with >2 options, implied by "eliminate 2-choices"' },
  { id: 'SK-QT-06', cls: 'NOT-SPECIFIED', text: 'multi-question stimuli' },
  { id: 'SK-DIFF-01', cls: 'SOURCE-STATED', text: 'topics sort into three named bands: Easy, Mid, HarD ParT' },
  { id: 'SK-DIFF-02', cls: 'UNKNOWN', text: 'exact membership of each difficulty band — the braces are freehand' },
  { id: 'SK-DIFF-03', cls: 'INFERRED', text: 'difficulty has two independent axes: topic, and test-experience' },
  { id: 'SK-DIFF-04', cls: 'UNKNOWN', text: 'the scale behind sporadic per-item easy/medium/Hard labels' },
  { id: 'SK-DIFF-05', cls: 'NOT-SPECIFIED', text: 'difficulty distribution per module' },
  { id: 'SK-DIFF-06', cls: 'NOT-SPECIFIED', text: 'difficulty progression within a module' },
  { id: 'SK-DIFF-07', cls: 'SOURCE-STATED', text: 'score bands 400→500→…→800 are not the same work' },
  { id: 'SK-DIFF-08', cls: 'SOURCE-STATED', text: 'a pure 800 requires 58 questions correct' },
];

// Recorded, not resolved. The validator refuses to let these be emptied.
export const CONFLICTS = [
  {
    id: 'CF-1', about: 'two different "hard topic" lists',
    a: 'p.1 HarD ParT brace: exp+comp.in, Ratio/prop, solid geo, similarity, time/work/s., graphes, tables',
    b: 'p.2 The Hardest in?/Famous: Data analysis, word problem→story, Qaudratic, works/time/speed/distance, graphs/tables, Solid Geometry, probability, Comp/Per, circle, exponent+comp.int, Geometry word problem, Scatter Plot, percent word problem',
    resolved: false,
  },
  {
    id: 'CF-2', about: '44 questions versus 58',
    a: 'p.2: 22 + 22 across Mod 1,2 — corroborated by all four item logs — - 44 questions',
    b: 'p.16: pure 800 → 58 Q true — 58 questions',
    resolved: false,
  },
];

// Counted from the session corpus (ek/item-log.tsv, 87 rows), not from the
// document — the document states no distribution at all (SK-DIST-01).
// The per-item sequences stay out of this public repo; only aggregates here.
export const ITEM_LOG_AGGREGATE = {
  forms: 2, modules: 4, questionsPerModule: 22,
  rowsTranscribed: 87,          // 88 slots minus one the author skipped
  rowsWithTopic: 85,            // two entries left blank by the author
  missingIndex: { form: 'S1', module: 'MOD2', index: 9 },
  confidence: { high: 59, med: 21, low: 7 },
  composite: { total: 16, ofRows: 85, byModulePosition: { MOD1: [6, 44], MOD2: [10, 41] } },
};

// The chain the brief asked for, and where it breaks.
export const FORM_DNA = {
  exam: 'partial',            // SAT structurally; EST named but never described
  strategy: 'present',        // TT-1..TT-4
  sectionModule: 'present',   // MOD1/MOD2, 22 each — SAT only
  questionNumber: 'present',  // 1..22 per module
  topic: 'present',           // labels only
  subtopic: 'absent',         // SK-TOPIC-03
  questionType: 'absent',     // no format taxonomy
  structuralRole: 'absent',   // never discussed
};

// The construction-rule register (§10), graded on the ingestion brief's own
// scale. Deliberately conservative: nothing is HARD-RULE, because a notebook
// records observations and this one never asserts an obligation. `executable`
// marks whether the generator could act on it as written — none can, yet.
export const RULE_CLASSES = ['HARD-RULE', 'RANGE', 'PATTERN', 'PREFERENCE', 'EXAMPLE', 'UNKNOWN'];

export const CONSTRUCTION_RULES = [
  { id: 'SK-CR-01', cls: 'PATTERN', executable: false, text: 'each module holds 22 questions' },
  { id: 'SK-CR-02', cls: 'PATTERN', executable: false, text: 'numbering restarts at 1 in each module' },
  { id: 'SK-CR-03', cls: 'PATTERN', executable: false, text: 'a question may combine 2–3 topics' },
  { id: 'SK-CR-04', cls: 'PATTERN', executable: false, text: 'word problem and GRAPHS/TABLES carry other topics' },
  { id: 'SK-CR-05', cls: 'PATTERN', executable: false, text: 'topic mixing concentrates in the harder module' },
  { id: 'SK-CR-06', cls: 'PATTERN', executable: false, text: 'TT-1: long steps, complicated numbers, mostly easy/medium' },
  { id: 'SK-CR-07', cls: 'PATTERN', executable: false, text: 'TT-2: traps in wording; small change in a word' },
  { id: 'SK-CR-08', cls: 'PATTERN', executable: false, text: 'TT-3: hard first, easing toward the end' },
  { id: 'SK-CR-09', cls: 'PATTERN', executable: false, text: 'TT-4: hard questions clear and not alot; normal arrange' },
  { id: 'SK-CR-10', cls: 'PREFERENCE', executable: false, text: 'topics sit in three difficulty bands' },
  { id: 'SK-CR-11', cls: 'UNKNOWN', executable: false, text: '5 tests per type, 20 total, difficulty ascending' },
  { id: 'SK-CR-12', cls: 'PREFERENCE', executable: false, text: 'easy questions carry more time-risk than hard ones' },
  { id: 'SK-CR-13', cls: 'EXAMPLE', executable: false, text: '58 questions correct for a pure 800' },
  { id: 'SK-CR-14', cls: 'PREFERENCE', executable: false, text: 'topics differ in required depth' },
  { id: 'SK-CR-15', cls: 'PREFERENCE', executable: false, text: 'five-step solving procedure' },
  { id: 'SK-CR-16', cls: 'PREFERENCE', executable: false, text: 'eliminating 2 choices raises the odds' },
];
