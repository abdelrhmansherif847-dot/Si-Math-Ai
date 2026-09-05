// The DSAT Question Knowledge Base — canonical schema.
//
// This is the vocabulary every ingested question record is written in, and the
// only place these enumerations are defined. It imports the frozen taxonomy and
// the KDG node list rather than restating them, so "invalid topic" and "invalid
// KDG node" are checks against the real thing and cannot drift.
//
// THREE RULES THIS FILE ENFORCES BY ITS SHAPE
//
// 1. No question text lives in a record. The repository is public and the
//    sources are copyrighted. A record holds identifiers, fingerprints and
//    metadata; the text stays in the corpus outside the repository. FORBIDDEN_
//    TEXT_FIELDS and looksLikeSourceText() make that mechanical.
//
// 2. Provenance is never silently upgraded. `official_college_board` and
//    `real_released_practice` require written evidence; the default is
//    `unknown`, and unknown is a legitimate resting state.
//
// 3. Steps are not a reasoning mechanism. Step count is a time-budget
//    descriptor and lives in its own field. A mechanism is load-bearing only
//    with a counterfactual saying what changes when it is removed.

import TAX from '../../taxonomy.core.js';
import { KDG_NODES, DSAT_TOPICS, ST1_TOPICS, REPRESENTATIONS as KDG_REPS }
  from '../../docs/knowledge/exam-knowledge/exam-structure-and-kdg.mjs';

export const SCHEMA_VERSION = 1;

// ── the two canonical vocabularies this KB binds to, both read-only ──────────
export const TAXONOMY_TOPICS = TAX.TOPICS.map(t => t.id);
export const TAXONOMY_SUBTOPICS = TAX.SUBTOPICS.map(s => s.id);
export const TAXONOMY_SUBTOPIC_NAME = Object.fromEntries(TAX.SUBTOPICS.map(s => [s.id, s.displayName]));
export const KDG_NODE_IDS = KDG_NODES.map(n => n.id);
export const KDG_NODE_NAME = Object.fromEntries(KDG_NODES.map(n => [n.id, n.name]));
export const EXAM_TOPICS = {
  DSAT: DSAT_TOPICS.map(r => r.topic),
  ST1: ST1_TOPICS.map(r => r.topic),
};

// ── provenance ───────────────────────────────────────────────────────────────
// Ordered weakest to strongest. `rank` exists so an upgrade is detectable.
export const PROVENANCE = [
  { id: 'unknown', rank: 0, needsEvidence: false, label: 'Unknown' },
  { id: 'third_party', rank: 1, needsEvidence: false, label: 'Third-party' },
  // Attributed to live administrations by an unofficial compiler. A REAL grade,
  // not a euphemism: it says what the material is, and says nothing about
  // whether the KB may learn from it.
  { id: 'recalled_unofficial', rank: 1, needsEvidence: false, label: 'Recalled / unofficial' },
  { id: 'project_authored', rank: 1, needsEvidence: false, label: 'Project-authored' },
  { id: 'real_released_practice', rank: 2, needsEvidence: true, label: 'Real released / practice DSAT' },
  { id: 'official_college_board', rank: 3, needsEvidence: true, label: 'Official College Board / official DSAT' },
];
export const PROVENANCE_IDS = PROVENANCE.map(p => p.id);
export const provenanceRank = id => PROVENANCE.find(p => p.id === id)?.rank ?? -1;
export const provenanceNeedsEvidence = id => !!PROVENANCE.find(p => p.id === id)?.needsEvidence;

// ── knowledge use and generation eligibility ─────────────────────────────────
// The correction of 2026-09-05: provenance is METADATA, not a prohibition.
// "Unofficial source" must never silently become "cannot be learned from". Four
// independent axes replace the single reject/accept decision:
//
//   provenance             where it came from
//   provenance_confidence  how well that is established
//   knowledge_use          may the KB learn construction logic from it
//   generation_eligibility may the generator draw on it, and how directly
//
// A record can be provenance=recalled_unofficial, knowledge_use=REFERENCE,
// generation_eligibility=EXCLUDED: fully analysed, never a direct source.
export const KNOWLEDGE_USE = ['REFERENCE', 'REFERENCE_ONLY'];

export const GENERATION_ELIGIBILITY = [
  'EXCLUDED',            // never a direct source; construction knowledge only
  'NOT_DIRECT_SOURCE',   // may inform construction, never be reproduced or renumbered
  'APPROVED',            // the user has explicitly authorised direct use
];

// Signals read from a file's CONTENT, not its name. They CLASSIFY, they do not
// discard — that is the D-1 correction. Each signal raises a provenance
// question and suggests a generation_eligibility; none of them blocks ingestion.
export const PROVENANCE_SIGNALS = [
  { id: 'telegram_channel', pattern: /t\.me\/|telegram/i, where: 'uri|text',
    means: 'distributed through a Telegram channel', suggests: 'recalled_unofficial' },
  // Whitespace is OPTIONAL, not required. Text recovered from a PDF's content
  // streams loses the inter-word spacing that lives in the kerning array, so a
  // real tag arrives as "[AugustUS2023]". A pattern that insisted on \s+ matched
  // nothing in the one file that carried 28 of these.
  { id: 'administration_tag', pattern: /\[\s*(January|March|April|May|June|August|October|November|December)\s*(US)?\s*20\d{2}\s*\]/,
    where: 'text', means: 'questions attributed to named live administrations', suggests: 'recalled_unofficial' },
  { id: 'real_labelling', pattern: /\b(Real|Recalled|Actual)\s+(SAT|Test|Exam|Questions?)\b|\bReal\s*$/m,
    where: 'text', means: 'material labelled as real/recalled exam content', suggests: 'recalled_unofficial' },
  { id: 'social_handle', pattern: /@[A-Za-z0-9_]{4,32}/, where: 'text',
    means: 'an individual or channel handle appears as a watermark', suggests: 'third_party' },
  { id: 'official_attribution', pattern: /College\s*Board|collegeboard\.org|satsuite/i, where: 'uri|text',
    means: 'explicit College Board attribution', suggests: 'official_college_board' },
];

// The ONE hard block that survives, and it is pinned by hash rather than by a
// filename pattern so it cannot catch anything else by accident. The March 2026
// Bluebook file was excluded by an explicit, separate instruction; the scope
// correction of 2026-09-05 widened what may be LEARNED FROM and did not revisit
// that specific artifact. If it should now be admitted, that is a decision to
// take deliberately, not a side effect.
export const HARD_EXCLUDED_SHA256 = [
  { sha256: 'feed3619ed8846f106a8a8bd6d1e666a98e61cb25af1c3e166e5522de9f42b9e',
    what: '2026_March_USA_EliteXSAT.pdf',
    why: 'excluded permanently by explicit instruction, predating the scope correction' },
];

// ── confidence ───────────────────────────────────────────────────────────────
// SOURCE-STATED  the source says it
// OBSERVED       read off the item itself without judgement (option count, figure present)
// INFERRED       this ingestion's judgement about the item
// UNKNOWN        not determinable — a legitimate answer, never a gap to fill
export const CONFIDENCE = ['SOURCE-STATED', 'OBSERVED', 'INFERRED', 'UNKNOWN'];

// ── representation ───────────────────────────────────────────────────────────
export const REPRESENTATIONS = [
  'symbolic_algebraic', 'verbal', 'table', 'graph', 'coordinate_plane',
  'geometry_figure', 'scatter_plot', 'number_line', 'function_representation',
  'mixed_representation', 'other',
];
// The five forms S-KDG names, kept as a separate axis: those are the graph's
// vocabulary, these are the item's. They are related but not the same list.
export const KDG_REPRESENTATION_IDS = KDG_REPS.map(r => r.id);

export const TARGET_TYPES = [
  'value', 'expression', 'equation', 'relationship', 'interpretation',
  'count', 'parameter', 'interval', 'statement_truth', 'other',
];

export const ANSWER_STRUCTURES = [
  'mcq_4', 'mcq_5', 'student_produced_response', 'other',
];

export const STIMULUS_TYPES = [
  'none', 'table', 'graph', 'scatter_plot', 'geometry_figure', 'number_line',
  'passage', 'equation_set', 'diagram', 'other',
];

// ── reasoning mechanisms ─────────────────────────────────────────────────────
// The ten of the brief, plus trap cost. `steps` is deliberately ABSENT: step
// count is a time-budget descriptor and lives in `step_count`.
export const REASONING_MECHANISMS = [
  { id: 'hidden_step', label: 'A required step the stem does not signal.' },
  { id: 'inference', label: 'A fact must be derived before the stated task can start.' },
  { id: 'multiconcept', label: 'Two or more distinct concepts are jointly required.' },
  { id: 'nonobvious_relationship', label: 'The relationship linking given to asked is not surface-visible.' },
  { id: 'representation_switch', label: 'The solver must move between representations.' },
  { id: 'abstraction', label: 'A concrete situation must be handled in general form.' },
  { id: 'reversal', label: 'The obvious solving direction must be run backwards.' },
  { id: 'filtering', label: 'Given information must be selected from or discarded.' },
  { id: 'competing_interpretations', label: 'More than one reading of the stem is defensible.' },
  { id: 'option_testing', label: 'The options are part of the route, not just the answer.' },
  { id: 'trap_cost', label: 'A wrong route is cheaper than the right one and lands on a printed option.' },
];
export const MECHANISM_IDS = REASONING_MECHANISMS.map(m => m.id);
// Never a mechanism. Named so the mistake fails loudly rather than passing.
export const NOT_MECHANISMS = ['steps', 'step_count', 'arithmetic_length', 'long', 'many_steps'];

// ── distractor taxonomy ──────────────────────────────────────────────────────
export const DISTRACTOR_CATEGORIES = [
  'arithmetic_slip', 'sign_error', 'wrong_equation_setup', 'wrong_interpretation',
  'wrong_representation', 'incomplete_reasoning', 'reversal_error',
  'omitted_condition', 'wrong_endpoint', 'wrong_statistical_operation',
  'plausible_competing_interpretation', 'common_misconception', 'weak_random',
  'unknown',
];

// ── difficulty ───────────────────────────────────────────────────────────────
export const DIFFICULTY_EVIDENCE_KINDS = ['SOURCE-STATED', 'OBSERVED', 'INFERRED', 'UNKNOWN'];
export const DIFFICULTY_BANDS = ['easy', 'medium', 'hard', 'unknown'];

// ── conflicts ────────────────────────────────────────────────────────────────
export const CONFLICT_KINDS = [
  'TAXONOMY_CONFLICT', 'SOURCE_CONFLICT', 'TOPIC_CLASSIFICATION_CONFLICT',
  'KDG_MAPPING_CONFLICT', 'AMBIGUOUS_ARCHETYPE', 'AMBIGUOUS_DIFFICULTY',
  'DUPLICATE_AMBIGUITY', 'REPRESENTATION_AMBIGUITY',
];

// ── exam topic → frozen taxonomy subtopic ────────────────────────────────────
// TWO AXES, ON PURPOSE. The brief requires the dedicated topics stay distinct
// AND that taxonomy.core.js stays frozen and unsplit. Both hold, because a
// record carries an exam topic and a taxonomy subtopic separately.
//
// `conflict: true` marks a row where the exam axis is finer than the frozen
// taxonomy. Those rows are pre-registered in the conflict register: they are
// known, permanent, and must never be "fixed" by editing the taxonomy.
export const EXAM_TOPIC_TAXONOMY = [
  { topic: 'Data Analysis (Basics)', subtopics: ['STA_005'] },
  { topic: 'Graphs (Data)', subtopics: ['STA_005', 'STA_001'], conflict: true,
    why: 'S-EXAM makes Graphs a dedicated topic; the frozen taxonomy has no Graphs subtopic' },
  { topic: 'Tables (Data)', subtopics: ['STA_005'], conflict: true,
    why: 'S-EXAM makes Tables a dedicated topic; the frozen taxonomy has no Tables subtopic' },
  { topic: 'Mean', subtopics: ['STA_002'], conflict: true,
    why: 'three dedicated exam topics share one frozen subtopic, "Mean, Median & Mode"' },
  { topic: 'Median', subtopics: ['STA_002'], conflict: true,
    why: 'three dedicated exam topics share one frozen subtopic, "Mean, Median & Mode"' },
  { topic: 'Mode', subtopics: ['STA_002'], conflict: true,
    why: 'three dedicated exam topics share one frozen subtopic, "Mean, Median & Mode"' },
  { topic: 'Interquartile Range', subtopics: ['STA_003'], conflict: true,
    why: 'IQR is a dedicated exam topic; the frozen taxonomy has only "Range & Interval"' },
  { topic: 'Probability', subtopics: ['PR_001', 'PR_002'] },
  { topic: 'Ratios, Rates, Percent', subtopics: ['PR_003', 'PR_004', 'PR_005'] },
  { topic: 'Units and Rates', subtopics: ['PR_005', 'PR_004'] },
  { topic: 'Linear Equations', subtopics: ['ALG_006'] },
  { topic: 'Linear Inequalities', subtopics: ['ALG_008'] },
  { topic: 'Linear Functions', subtopics: ['ALG_006', 'FUN_001'] },
  { topic: 'Systems of Equations', subtopics: ['ALG_007'] },
  { topic: 'Polynomials', subtopics: ['ALG_004'] },
  { topic: 'Quadratic Equations', subtopics: ['ALG_010'] },
  { topic: 'Exponential Functions', subtopics: ['ALG_011'] },
  { topic: 'Absolute Value', subtopics: ['ALG_009'] },
  { topic: 'Geometry (Lines & Angles)', subtopics: ['GEO_001'] },
  { topic: 'Triangles', subtopics: ['GEO_002', 'GEO_004', 'GEO_005'] },
  { topic: 'Polygons', subtopics: ['GEO_003'] },
  { topic: 'Circle', subtopics: ['GEO_006', 'GEO_008'] },
  { topic: 'Trigonometry', subtopics: ['GEO_005'] },
  { topic: 'Asymptote', subtopics: ['ALG_011'], conflict: true,
    why: 'Asymptote is a dedicated exam topic with NO counterpart subtopic; it lands on Exponential Functions' },
  { topic: 'Word Problems / Mixed', subtopics: [], conflict: true,
    why: 'a cross-topic skill used as an exam topic; it has no single taxonomy home' },
];

// ── exam topic → KDG node, from artifact 01 §11 ──────────────────────────────
// Re-exported here so a record's KDG mapping can be checked against the same
// alignment the ingestion published, rather than a second private copy.
export { TOPIC_NODE_MAP } from '../../docs/knowledge/exam-knowledge/exam-structure-and-kdg.mjs';

// ── observed topics ─────────────────────────────────────────────────────────
// WHAT THE SOURCE ITSELF CALLS OR TESTS, normalised. This is deliberately NOT
// the canonical taxonomy and is deliberately NOT validated against
// taxonomy.core.js: the whole point is that the two can differ, so that
//
//     observed_topic  ->  canonical topic  ->  match or conflict
//
// can be compared and accumulated across sources. An entry here is a record of
// somebody else's vocabulary; it creates no taxonomy node and confers no
// standing on the term.
//
// A closed list on purpose. When the next PDF uses a word not in it, validation
// fails and the new source vocabulary becomes visible, instead of accumulating
// silently as free text. Adding an entry is not a taxonomy change.
export const OBSERVED_TOPICS = [
  'UNKNOWN',              // the source establishes no topic for the item
  // seen in the exponents pilot, 2026-09-05
  'exponents',            // block A section heading "Exponents Real"
  'negative_exponents',
  'exponential_functions',
  'exponential_models',
  'rational_exponents',
  'exponent_rules',
  'scientific_notation',
  // seen in Polynomial_Part_1, 2026-09-05
  'polynomials',            // block A section heading "Polynomials"
  'equivalent_expressions', // block B Skill label, printed on all 49 pages
  // seen in the linear-systems corpus, 2026-09-05
  'linear_system_of_equations', // the section heading, and the answer-key heading
  // seen in the circles corpus, 2026-09-05
  'circles',                    // the section heading, and the answer-key heading
  // seen in the areas-and-volumes corpus, 2026-09-05. The section carries TWO
  // headings and the answer key repeats only the first, so both are recorded.
  'areas_and_volumes',
  'solid_geometry',
  // seen in the triangles corpus, 2026-09-05. Block A's section heading only:
  // block B carries no topic word of its own, so its items observe UNKNOWN
  // however plainly a reader can see what they are about.
  'triangles',
  // seen in the statistics corpus, 2026-09-05. The heading names four measures
  // and the items test a fifth the heading does not mention — see SRC-0015.
  'mean_median_mode_range',
];

// ── the copyright guard ──────────────────────────────────────────────────────
// A record must never carry question text. These field names are refused
// outright; looksLikeSourceText() catches prose smuggled into a field that is
// allowed to hold a short label.
export const FORBIDDEN_TEXT_FIELDS = [
  'stem', 'stem_text', 'question_text', 'text', 'body', 'prompt', 'passage',
  'options', 'choices', 'option_text', 'answer_text', 'explanation',
  'solution', 'solution_text', 'rationale_text', 'full_text', 'raw', 'ocr',
  'transcript', 'content',
];

// Short structured labels are fine; sentences of source prose are not. The test
// is deliberately blunt — it is a guard, not a classifier, and it is better for
// it to complain about a long note than to let a stem through.
export const TEXT_HEURISTIC = { maxWords: 25, maxChars: 200 };
export function looksLikeSourceText(value) {
  if (typeof value !== 'string') return false;
  const words = value.trim().split(/\s+/).length;
  if (value.length > TEXT_HEURISTIC.maxChars || words > TEXT_HEURISTIC.maxWords) return true;
  // A stem usually ends in a question mark or contains a mathematical sentence
  // next to an instruction verb.
  return /\?\s*$/.test(value.trim()) && words > 8;
}

// ── the question record ──────────────────────────────────────────────────────
// `required` fields must be present on every record. Everything else may be
// absent, but if present must validate.
export const QUESTION_RECORD_FIELDS = {
  required: [
    'question_id', 'source_id', 'source_file', 'source_page', 'provenance',
    'provenance_confidence', 'knowledge_use', 'generation_eligibility',
    'observed_topic', 'exam', 'topic', 'taxonomy_subtopics',
    'knowledge_nodes', 'representation', 'target_type', 'archetype',
    'archetype_confidence', 'reasoning_mechanisms', 'distractor_logic',
    'difficulty_evidence', 'difficulty_confidence', 'answer_structure',
    'stimulus_type', 'structural_fingerprint', 'mathematical_fingerprint',
  ],
  optional: [
    'source_question_number', 'source_block', 'source_label', 'source_administration',
    'mathematical_signature', 'provenance_evidence', 'subtopic_note', 'secondary_knowledge_nodes',
    'prerequisite_nodes', 'kdg_confidence', 'representation_transition',
    'step_count', 'stimulus_id', 'duplicate_group', 'near_duplicate_group',
    'fingerprint_components', 'source_notes', 'observed_notes',
    'inference_notes', 'unknown_notes', 'conflicts', 'ingested_on',
  ],
};

export const EXAMS = ['DSAT', 'ST1'];

// A question id is stable and carries its source: DSAT-<source>-<page>-<n>.
export const QUESTION_ID_RE = /^Q-[A-Z0-9]{2,12}-p\d{1,4}-q\d{1,3}$/;
export const SOURCE_ID_RE = /^S-[A-Z0-9]{2,12}$/;
export const ARCHETYPE_ID_RE = /^A-[A-Z0-9-]{3,40}$/;
export const FINGERPRINT_RE = /^[0-9a-f]{16}$/;
