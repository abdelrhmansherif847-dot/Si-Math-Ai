-- Detector v2 Shadow Monitoring
-- Run these queries at the 50 / 100 / 200 math-record checkpoints.
-- All queries are read-only. Safe to run in production.
--
-- A "v2 record" is any question_records row where
--   verification_meta ? 'v2_tier'
-- which only happens when v1 fell back to default_medium AND
-- DIFFICULTY_DETECTOR_V2_ENABLED=true.

-- ─────────────────────────────────────────────────────────────────────────────
-- Q0. Checkpoint gate — how many v2 records exist so far?
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  COUNT(*) FILTER (WHERE verification_meta ? 'v2_tier')              AS v2_records,
  COUNT(*) FILTER (WHERE verification_tier IS NOT NULL)              AS v1_records,
  COUNT(*) FILTER (WHERE (verification_meta->>'reasons') LIKE '%default_medium%') AS v1_default_medium_records,
  MIN(created_at)                                                    AS earliest_record,
  MAX(created_at)                                                    AS latest_record
FROM question_records;

-- ─────────────────────────────────────────────────────────────────────────────
-- Q1. v2 tier distribution (easy / medium / hard / expert)
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  verification_meta->>'v2_tier' AS v2_tier,
  COUNT(*)                       AS count,
  ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 1) AS pct
FROM question_records
WHERE verification_meta ? 'v2_tier'
GROUP BY 1
ORDER BY count DESC;

-- ─────────────────────────────────────────────────────────────────────────────
-- Q2. v1 vs v2 distribution side-by-side (only over default_medium subset)
--     v1 is always 'medium' here by construction; v2 reveals real spread.
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  'v1' AS detector, verification_tier AS tier,
  COUNT(*) AS count,
  ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 1) AS pct
FROM question_records
WHERE verification_meta ? 'v2_tier'
GROUP BY verification_tier
UNION ALL
SELECT
  'v2' AS detector, verification_meta->>'v2_tier' AS tier,
  COUNT(*) AS count,
  ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 1) AS pct
FROM question_records
WHERE verification_meta ? 'v2_tier'
GROUP BY verification_meta->>'v2_tier'
ORDER BY detector, count DESC;

-- ─────────────────────────────────────────────────────────────────────────────
-- Q3. Detector v2 vs GPT-stated difficulty agreement rate
--     (across the default_medium subset where v2 actually ran)
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE (verification_meta->>'v2_agrees_with_gpt')::boolean)  AS agrees_with_gpt,
  COUNT(*) FILTER (WHERE (verification_meta->>'v2_agrees_with_v1')::boolean)   AS agrees_with_v1,
  ROUND(100.0 * COUNT(*) FILTER (WHERE (verification_meta->>'v2_agrees_with_gpt')::boolean) / NULLIF(COUNT(*),0), 1) AS gpt_agree_pct,
  ROUND(100.0 * COUNT(*) FILTER (WHERE (verification_meta->>'v2_agrees_with_v1')::boolean)  / NULLIF(COUNT(*),0), 1) AS v1_agree_pct
FROM question_records
WHERE verification_meta ? 'v2_tier';

-- ─────────────────────────────────────────────────────────────────────────────
-- Q4. v1=medium but v2=hard — sample of 10 (escalation candidates)
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  id,
  created_at,
  LEFT(question, 200) AS question_preview,
  topic,
  subtopic,
  verification_meta->>'gpt_difficulty' AS gpt_difficulty,
  verification_meta->>'v2_tier'        AS v2_tier,
  (verification_meta->>'v2_latency_ms')::int AS v2_latency_ms
FROM question_records
WHERE verification_meta ? 'v2_tier'
  AND verification_tier = 'medium'
  AND verification_meta->>'v2_tier' = 'hard'
ORDER BY created_at DESC
LIMIT 10;

-- ─────────────────────────────────────────────────────────────────────────────
-- Q5. v1=medium but v2=easy — sample of 10 (de-escalation candidates)
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  id,
  created_at,
  LEFT(question, 200) AS question_preview,
  topic,
  subtopic,
  verification_meta->>'gpt_difficulty' AS gpt_difficulty,
  verification_meta->>'v2_tier'        AS v2_tier,
  (verification_meta->>'v2_latency_ms')::int AS v2_latency_ms
FROM question_records
WHERE verification_meta ? 'v2_tier'
  AND verification_tier = 'medium'
  AND verification_meta->>'v2_tier' = 'easy'
ORDER BY created_at DESC
LIMIT 10;

-- ─────────────────────────────────────────────────────────────────────────────
-- Q6. v2 latency statistics (p50, p95, max, mean, error count)
-- ─────────────────────────────────────────────────────────────────────────────
SELECT
  COUNT(*)                                                         AS samples,
  ROUND(AVG((verification_meta->>'v2_latency_ms')::numeric))       AS mean_ms,
  PERCENTILE_CONT(0.50) WITHIN GROUP (ORDER BY (verification_meta->>'v2_latency_ms')::int) AS p50_ms,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY (verification_meta->>'v2_latency_ms')::int) AS p95_ms,
  MAX((verification_meta->>'v2_latency_ms')::int)                  AS max_ms,
  MIN((verification_meta->>'v2_latency_ms')::int)                  AS min_ms
FROM question_records
WHERE verification_meta ? 'v2_latency_ms';

-- ─────────────────────────────────────────────────────────────────────────────
-- Q7. Unexpected classifications — surface anything weird for human review
-- ─────────────────────────────────────────────────────────────────────────────
-- 7a. v2='expert' on a default_medium fallback (heuristic disagreed strongly)
SELECT
  id, created_at, topic, subtopic,
  LEFT(question, 200) AS question_preview,
  verification_meta->>'gpt_difficulty' AS gpt_difficulty,
  verification_meta->>'v2_tier'        AS v2_tier,
  verification_meta->>'v2_raw'         AS v2_raw
FROM question_records
WHERE verification_meta ? 'v2_tier'
  AND verification_meta->>'v2_tier' = 'expert'
ORDER BY created_at DESC
LIMIT 10;

-- 7b. v2_raw could not be parsed cleanly (raw text != tier label)
SELECT
  id, created_at,
  verification_meta->>'v2_tier' AS v2_tier,
  verification_meta->>'v2_raw'  AS v2_raw
FROM question_records
WHERE verification_meta ? 'v2_raw'
  AND LOWER(verification_meta->>'v2_raw') NOT IN ('easy','medium','hard','expert')
ORDER BY created_at DESC
LIMIT 10;

-- 7c. v2 latency outliers (>2s — should be rare for gpt-4o-mini @ 10 tokens)
SELECT
  id, created_at,
  (verification_meta->>'v2_latency_ms')::int AS v2_latency_ms,
  verification_meta->>'v2_tier'              AS v2_tier
FROM question_records
WHERE (verification_meta->>'v2_latency_ms')::int > 2000
ORDER BY (verification_meta->>'v2_latency_ms')::int DESC
LIMIT 10;
