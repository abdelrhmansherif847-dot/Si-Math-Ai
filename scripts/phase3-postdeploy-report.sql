-- ===========================================================================
-- AI Economics · Phase 3 — Post-deployment report data collection
-- ===========================================================================
-- Read-only. Writes nothing, locks nothing, safe to run against production at
-- any time, as many times as you like.
--
-- Produces every number the Post-Deployment Report needs, in one pass. Run it
-- after the v90 deployment and paste the output into
-- docs/roadmap/phase-3-post-deployment-report.md.
--
-- Usage:
--   psql "$SUPABASE_DB_URL" -f scripts/phase3-postdeploy-report.sql
-- or paste section by section into the Supabase SQL Editor.
--
-- THE DEPLOY BOUNDARY IS DERIVED, NOT TYPED. Every "since deployment" figure
-- uses the timestamp of the first telemetry row — the moment v90 first wrote
-- anything. That removes a hand-edited variable from a maintenance window,
-- where a mistyped timestamp would silently skew every result. Override the
-- `deploy_boundary` CTE with a literal only if you need a different cut.
--
-- Every section is labelled so results are self-identifying when pasted.
-- ===========================================================================

-- ── R0 · Deploy boundary and headline counts ───────────────────────────────
WITH b AS (SELECT min(created_at) AS t0 FROM public.ai_model_calls)
SELECT 'R0 · headline'                                      AS section,
       (SELECT t0 FROM b)                                   AS deploy_boundary,
       (SELECT count(*) FROM public.ai_model_calls)         AS telemetry_rows,
       (SELECT count(DISTINCT request_id)  FROM public.ai_model_calls) AS requests,
       (SELECT count(DISTINCT question_record_id)
          FROM public.ai_model_calls
         WHERE question_record_id IS NOT NULL)              AS questions_covered,
       (SELECT count(DISTINCT user_id) FROM public.ai_model_calls)     AS students,
       (SELECT count(*) FROM question_records
         WHERE created_at >= (SELECT t0 FROM b))            AS questions_since_deploy,
       (SELECT max(created_at) FROM public.ai_model_calls)  AS newest_row;

-- ── R1 · Successful telemetry insertion  [PASS: rows > 0] ──────────────────
SELECT 'R1 · insertion' AS section,
       count(*)                                        AS rows,
       min(created_at)                                 AS first_row,
       max(created_at)                                 AS last_row,
       CASE WHEN count(*) > 0 THEN 'PASS' ELSE 'FAIL' END AS verdict
FROM public.ai_model_calls;

-- ── R2 · No duplicate call_uid  [PASS: 0] ──────────────────────────────────
SELECT 'R2 · duplicates' AS section,
       count(*)                                          AS duplicate_call_uids,
       CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END AS verdict
FROM (SELECT call_uid FROM public.ai_model_calls
      GROUP BY call_uid HAVING count(*) > 1) d;

-- ── R3 · 100% service resolution  [PASS: every row in_catalog AND bound] ───
SELECT 'R3 · resolution' AS section,
       t.service_code, t.model, t.provider, count(*) AS calls,
       (s.service_code IS NOT NULL)                                AS in_catalog,
       EXISTS (SELECT 1 FROM ai_catalog.service_bindings b
                WHERE b.service_code  = t.service_code
                  AND b.model         = t.model
                  AND b.provider_code = t.provider
                  AND b.effective_to IS NULL)                      AS bound
FROM public.ai_model_calls t
LEFT JOIN ai_catalog.services s ON s.service_code = t.service_code
GROUP BY t.service_code, t.model, t.provider, s.service_code
ORDER BY calls DESC;

-- R3b · one-line verdict
SELECT 'R3b · resolution verdict' AS section,
       count(*) FILTER (WHERE NOT in_catalog OR NOT bound)          AS unresolved_groups,
       CASE WHEN count(*) FILTER (WHERE NOT in_catalog OR NOT bound) = 0
            THEN 'PASS' ELSE 'FAIL' END                            AS verdict
FROM (
  SELECT (s.service_code IS NOT NULL) AS in_catalog,
         EXISTS (SELECT 1 FROM ai_catalog.service_bindings b
                  WHERE b.service_code=t.service_code AND b.model=t.model
                    AND b.provider_code=t.provider AND b.effective_to IS NULL) AS bound
  FROM public.ai_model_calls t
  LEFT JOIN ai_catalog.services s ON s.service_code = t.service_code
  GROUP BY t.service_code, t.model, t.provider, s.service_code
) x;

-- ── R4 · started_at / created_at validation  [PASS: missing=0, impossible=0] ─
SELECT 'R4 · clocks' AS section,
       count(*) FILTER (WHERE started_at IS NULL)                   AS missing_started_at,
       count(*) FILTER (WHERE started_at > created_at)              AS impossible,
       round(percentile_cont(0.5) WITHIN GROUP (
         ORDER BY EXTRACT(EPOCH FROM (created_at - started_at)))::numeric, 2) AS median_skew_s,
       round(percentile_cont(0.95) WITHIN GROUP (
         ORDER BY EXTRACT(EPOCH FROM (created_at - started_at)))::numeric, 2) AS p95_skew_s,
       round(max(EXTRACT(EPOCH FROM (created_at - started_at)))::numeric, 2)  AS max_skew_s,
       CASE WHEN count(*) FILTER (WHERE started_at IS NULL) = 0
             AND count(*) FILTER (WHERE started_at > created_at) = 0
            THEN 'PASS' ELSE 'FAIL' END                             AS verdict
FROM public.ai_model_calls;

-- R4b · skew by sink — main-path rows should be near zero, background seconds.
-- This is the number that justifies started_at existing at all (F2).
SELECT 'R4b · skew by sink' AS section,
       CASE WHEN stage IN ('tutor_main','resolve','question_detect')
            THEN 'main-path' ELSE 'background' END                  AS sink,
       count(*)                                                     AS rows,
       round(percentile_cont(0.5) WITHIN GROUP (
         ORDER BY EXTRACT(EPOCH FROM (created_at-started_at)))::numeric,2) AS median_skew_s,
       round(max(EXTRACT(EPOCH FROM (created_at-started_at)))::numeric,2)  AS max_skew_s
FROM public.ai_model_calls
WHERE started_at IS NOT NULL
GROUP BY 2 ORDER BY 2;

-- ── R5 · Units reconcile with the token mirrors  [PASS: 0] ─────────────────
-- input_token + cached_input_token must equal prompt_tokens, or the Cost
-- Engine will price a different quantity than the provider billed.
SELECT 'R5 · units reconcile' AS section,
       count(*)                                          AS unreconciled_rows,
       CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END AS verdict
FROM public.ai_model_calls
WHERE success AND prompt_tokens > 0
  AND COALESCE((units->>'input_token')::int, 0)
    + COALESCE((units->>'cached_input_token')::int, 0) <> prompt_tokens;

-- ── R6 · Telemetry coverage BY SERVICE  [PASS: with_tokens = ok on every row] ─
-- Never report this as one aggregate: ~66% of calls and ~71% of expensive
-- gpt-4o calls land in the background sink, so an aggregate hides loss exactly
-- where the money is.
SELECT 'R6 · coverage by service' AS section,
       service_code, stage, provider, model,
       count(*)                                              AS calls,
       count(*) FILTER (WHERE success)                       AS ok,
       count(*) FILTER (WHERE NOT success)                   AS failed,
       count(*) FILTER (WHERE success AND prompt_tokens > 0) AS with_tokens,
       sum(prompt_tokens)                                    AS prompt_tok,
       sum(completion_tokens)                                AS completion_tok,
       round(avg(latency_ms))                                AS avg_latency_ms,
       round(percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms)) AS p95_latency_ms
FROM public.ai_model_calls
GROUP BY service_code, stage, provider, model
ORDER BY service_code, stage;

-- ── R7 · Failure capture (GAP-7)  [informational] ──────────────────────────
SELECT 'R7 · failures' AS section,
       COALESCE(error_code, '(none)')  AS error_code,
       http_status, count(*)           AS calls,
       sum(prompt_tokens)              AS wasted_prompt_tok
FROM public.ai_model_calls
WHERE NOT success
GROUP BY 2,3 ORDER BY calls DESC;

-- ── R8 · Attribution  [PASS: majority carry a question_record_id] ──────────
SELECT 'R8 · attribution' AS section,
       count(*)                                                   AS rows,
       count(*) FILTER (WHERE question_record_id IS NOT NULL)      AS with_question,
       count(*) FILTER (WHERE user_id IS NOT NULL)                 AS with_user,
       count(*) FILTER (WHERE client_request_id IS NOT NULL)       AS with_client_req,
       count(*) FILTER (WHERE operation IS NOT NULL)               AS with_operation,
       round(100.0 * count(*) FILTER (WHERE question_record_id IS NOT NULL)
             / nullif(count(*),0), 1)                              AS question_pct
FROM public.ai_model_calls;

-- R8b · partial client_request_id coverage within a request  [PASS: 0]
SELECT 'R8b · client_request_id completeness' AS section,
       count(*)                                          AS partial_requests,
       CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END AS verdict
FROM (
  SELECT request_id FROM public.ai_model_calls
  GROUP BY request_id
  HAVING count(*) FILTER (WHERE client_request_id IS NOT NULL) > 0
     AND count(*) FILTER (WHERE client_request_id IS NULL)     > 0
) p;

-- ── R9 · Fan-out sanity  [PASS: 0 requests over 10 calls] ──────────────────
SELECT 'R9 · fan-out' AS section,
       calls_per_request, count(*) AS requests
FROM (SELECT request_id, count(*) AS calls_per_request
      FROM public.ai_model_calls GROUP BY request_id) f
GROUP BY 1 ORDER BY 1;

-- R9b · verdict
SELECT 'R9b · fan-out verdict' AS section,
       count(*)                                          AS requests_over_10,
       CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END AS verdict
FROM (SELECT request_id FROM public.ai_model_calls
      GROUP BY request_id HAVING count(*) > 10) n;

-- ── R10 · FIRST-DAY RECONCILIATION  [PASS: coverage_pct >= 95] ─────────────
-- The completeness oracle. Derives the expected call count per question from
-- question_records.verification_meta — written independently of the telemetry
-- — and subtracts what actually arrived. This is what makes loss detectable
-- without trusting the telemetry to report its own gaps.
WITH b AS (SELECT min(created_at) AS t0 FROM public.ai_model_calls),
q AS (
  SELECT id,
    (image IS NOT NULL OR (images IS NOT NULL AND jsonb_array_length(images) > 0)) AS has_image,
    (verification_meta ? 'pipeline_version')                  AS l3_ran,
    (verification_meta ? 'v2_version')                        AS v2_ran,
    COALESCE((verification_meta->>'ocr_rerun_count')::int, 0) AS ocr_reruns,
    (verification_status = 'ocr_uncertain')                   AS judge_short
  FROM question_records
  WHERE created_at >= (SELECT t0 FROM b)
),
expected AS (
  SELECT id,
      1
    + (CASE WHEN has_image                            THEN 1 ELSE 0 END)
    + (CASE WHEN l3_ran AND has_image                 THEN 1 ELSE 0 END)
    + (CASE WHEN l3_ran                               THEN ocr_reruns ELSE 0 END)
    + (CASE WHEN l3_ran                               THEN 2 ELSE 0 END)
    + (CASE WHEN l3_ran AND NOT judge_short           THEN 1 ELSE 0 END)
    + (CASE WHEN v2_ran                               THEN 1 ELSE 0 END) AS expected_calls
  FROM q
)
SELECT 'R10 · reconciliation' AS section,
       count(*)                          AS questions,
       COALESCE(sum(e.expected_calls),0) AS expected_calls,
       COALESCE(sum(a.actual),0)         AS actual_calls,
       round(100.0 * COALESCE(sum(a.actual),0)
             / nullif(sum(e.expected_calls),0), 2)                  AS coverage_pct,
       CASE WHEN sum(e.expected_calls) IS NULL THEN 'NO DATA'
            WHEN 100.0 * COALESCE(sum(a.actual),0)
                 / nullif(sum(e.expected_calls),0) >= 95 THEN 'PASS'
            WHEN 100.0 * COALESCE(sum(a.actual),0)
                 / nullif(sum(e.expected_calls),0) >= 80 THEN 'INVESTIGATE'
            ELSE 'FAIL' END                                         AS verdict
FROM expected e
LEFT JOIN LATERAL (
  SELECT count(*) AS actual FROM public.ai_model_calls t
   WHERE t.question_record_id = e.id
) a ON true;

-- R10b · per-question shortfalls, worst first — where did the gap land?
WITH b AS (SELECT min(created_at) AS t0 FROM public.ai_model_calls),
q AS (
  SELECT id, created_at,
    (image IS NOT NULL OR (images IS NOT NULL AND jsonb_array_length(images) > 0)) AS has_image,
    (verification_meta ? 'pipeline_version')                  AS l3_ran,
    (verification_meta ? 'v2_version')                        AS v2_ran,
    COALESCE((verification_meta->>'ocr_rerun_count')::int, 0) AS ocr_reruns,
    (verification_status = 'ocr_uncertain')                   AS judge_short
  FROM question_records WHERE created_at >= (SELECT t0 FROM b)
)
SELECT 'R10b · shortfalls' AS section,
       q.id, q.created_at, q.has_image, q.l3_ran,
       1 + (CASE WHEN q.has_image THEN 1 ELSE 0 END)
         + (CASE WHEN q.l3_ran AND q.has_image THEN 1 ELSE 0 END)
         + (CASE WHEN q.l3_ran THEN q.ocr_reruns ELSE 0 END)
         + (CASE WHEN q.l3_ran THEN 2 ELSE 0 END)
         + (CASE WHEN q.l3_ran AND NOT q.judge_short THEN 1 ELSE 0 END)
         + (CASE WHEN q.v2_ran THEN 1 ELSE 0 END)             AS expected_calls,
       (SELECT count(*) FROM public.ai_model_calls t WHERE t.question_record_id = q.id) AS actual_calls
FROM q
ORDER BY (1 + (CASE WHEN q.has_image THEN 1 ELSE 0 END)
            + (CASE WHEN q.l3_ran AND q.has_image THEN 1 ELSE 0 END)
            + (CASE WHEN q.l3_ran THEN q.ocr_reruns ELSE 0 END)
            + (CASE WHEN q.l3_ran THEN 2 ELSE 0 END)
            + (CASE WHEN q.l3_ran AND NOT q.judge_short THEN 1 ELSE 0 END)
            + (CASE WHEN q.v2_ran THEN 1 ELSE 0 END))
         - (SELECT count(*) FROM public.ai_model_calls t WHERE t.question_record_id = q.id) DESC
LIMIT 20;

-- ── R11 · Tutoring health since deploy  [PASS: empty_answers = 0] ──────────
-- Baseline: 0 empty answers in 404 questions over the 30 days before v90.
WITH b AS (SELECT min(created_at) AS t0 FROM public.ai_model_calls)
SELECT 'R11 · tutoring health' AS section,
       count(*)                                                          AS questions,
       count(*) FILTER (WHERE oai_http_status IS NOT NULL)               AS upstream_errors,
       count(*) FILTER (WHERE ai_response IS NULL
                           OR length(trim(ai_response)) = 0)             AS empty_answers,
       count(DISTINCT user_id)                                           AS students,
       CASE WHEN count(*) FILTER (WHERE ai_response IS NULL
                                     OR length(trim(ai_response)) = 0) = 0
            THEN 'PASS' ELSE 'FAIL' END                                  AS verdict
FROM question_records WHERE created_at >= (SELECT t0 FROM b);

-- ── R12 · Volume gate  [PASS: >= 48h elapsed AND >= 20 student questions] ──
-- Success is declared on evidence, not on the clock. At ~4 questions/day the
-- 48-hour window can capture almost nothing, so both conditions must hold.
WITH b AS (SELECT min(created_at) AS t0 FROM public.ai_model_calls)
SELECT 'R12 · volume gate' AS section,
       (SELECT t0 FROM b)                                                AS deploy_boundary,
       round(EXTRACT(EPOCH FROM (now() - (SELECT t0 FROM b)))/3600.0, 1) AS hours_elapsed,
       (SELECT count(*) FROM question_records
         WHERE created_at >= (SELECT t0 FROM b))                         AS student_questions,
       CASE WHEN EXTRACT(EPOCH FROM (now() - (SELECT t0 FROM b)))/3600.0 >= 48
             AND (SELECT count(*) FROM question_records
                   WHERE created_at >= (SELECT t0 FROM b)) >= 20
            THEN 'GATE MET' ELSE 'KEEP MONITORING' END                   AS verdict;
