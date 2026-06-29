/**
 * phase4-wordproblems-override.js — Phase 4 deterministic backfill override for
 * legacy rows whose TOPIC was the (now-retired) "Word Problems".
 *
 * BACKFILL-ONLY. This is NOT part of the runtime resolver — new detections never
 * produce topic="Word Problems" (the edge emits canonical topics directly). The
 * MIG-B generator consults this fixed table FIRST for any legacy row where
 * lower(trim(topic)) === 'word problems', then falls back to the resolver.
 *
 * Keys are the normalized (lowercase, trimmed) legacy subtopic. Values are the
 * canonical target. All map problem_type='word_problem' EXCEPT where noted.
 * Approved 2026-06-29. No heuristics at migration time — pure lookup.
 *
 *   Linear Word Problems     -> Algebra / Linear Equations & Functions / word_problem
 *   System of equation       -> Algebra / Systems of Equations        / word_problem
 *   Statistics Word Problems -> Statistics / Data Analysis            / word_problem
 *   Rate & Work Problems     -> Probability & Ratios / Work & Time     / word_problem
 *   Percent Problems         -> Probability & Ratios / Percentages     / word_problem
 *   Ratio Problems           -> Probability & Ratios / Ratio & Proportion / word_problem
 *   Algebra                  -> Algebra / (topic-level, subtopic NULL) / word_problem
 *   (blank)                  -> NOT mapped: no math-topic signal; stays NEEDS_REVIEW.
 */
const WORD_PROBLEM_OVERRIDE = {
  'linear word problems':     { topicId: 'ALGEBRA',            subtopicId: 'ALG_006', problemType: 'word_problem' },
  'system of equation':       { topicId: 'ALGEBRA',            subtopicId: 'ALG_007', problemType: 'word_problem' },
  'statistics word problems': { topicId: 'STATISTICS',         subtopicId: 'STA_005', problemType: 'word_problem' },
  'rate & work problems':     { topicId: 'PROBABILITY_RATIOS', subtopicId: 'PR_006',  problemType: 'word_problem' },
  'percent problems':         { topicId: 'PROBABILITY_RATIOS', subtopicId: 'PR_003',  problemType: 'word_problem' },
  'ratio problems':           { topicId: 'PROBABILITY_RATIOS', subtopicId: 'PR_004',  problemType: 'word_problem' },
  'algebra':                  { topicId: 'ALGEBRA',            subtopicId: null,      problemType: 'word_problem' },
  // '' (blank subtopic) intentionally absent → leaves the row in NEEDS_REVIEW.
};

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { WORD_PROBLEM_OVERRIDE };
}
