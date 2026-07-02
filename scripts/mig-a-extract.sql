-- mig-a-extract.sql — Phase 4 MIG-A extraction (READ-ONLY SELECT).
-- Produces the distinct (topic, subtopic, count) pairs that mig-a-classify.mjs
-- consumes on stdin. This is the ONLY step that reads production. It performs
-- NO writes. Review before running.
--
-- Source table : weakness_signals   (columns: topic, subtopic, source, created_at, ...)
-- Filters      : NONE by default — MIG-B1 normalizes taxonomy names across ALL
--                rows regardless of `source` (AI_CHAT / MOCK_EXAM / FOCUS_PRACTICE).
--                To scope a pilot, uncomment the WHERE clause below. DECISION NEEDED.
-- Blank handling: NULL or whitespace-only topic/subtopic is emitted as the literal
--                sentinel '(blank)', which the classifier maps back to '' (→ blank
--                subtopic = topic-level; blank topic = UNMAPPED).
-- Counts       : n = COUNT(*) rows per distinct pair.

SELECT
  COALESCE(NULLIF(TRIM(topic),    ''), '(blank)') AS topic,
  COALESCE(NULLIF(TRIM(subtopic), ''), '(blank)') AS subtopic,
  COUNT(*)                                        AS n
FROM weakness_signals
-- WHERE source = 'AI_CHAT'          -- optional pilot scope (leave commented for full run)
GROUP BY 1, 2
ORDER BY n DESC;

-- Reconciliation companion (run separately; feed the number to the classifier as
-- MIGA_SOURCE_ROWCOUNT). Proves the GROUP BY extract covered every row:
--   SELECT COUNT(*) FROM weakness_signals;   -- must equal Σ(n) above
