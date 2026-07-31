-- ===========================================================================
-- Phase 4 fix: a WORK ITEM CAN SPAN REQUESTS
-- ===========================================================================
-- APPLIED to igvkyxkmjnkzscqgommj on 2026-07-31, immediately after
-- 20260731_aiecon_p4_cost_engine.sql, when the first production allocation
-- run failed.
--
-- WHAT WENT WRONG
--   allocate() grouped work items by (question_record_id, request_id), which
--   assumes a question belongs to exactly one request. Production disproves
--   it: `reference_resolver` resolves a follow-up against an EARLIER question
--   (architecture §8.8.1), so one question accumulated cost from two
--   request_ids 26 seconds apart. The grouping emitted two rows for one work
--   item and collided with qcf_current_item_uidx.
--
--   The run FAILED CLOSED exactly as designed: 0 work-item facts, 0
--   allocation runs, no partial state. Pricing was unaffected.
--
--   The local fixture could not have caught this: it modelled every question
--   as belonging to a single request. It now contains the production case.
--
-- WHAT CHANGED (allocation_version alloc-1.0.0 -> alloc-1.0.1)
--   1. Scope is the TRANSITIVE CLOSURE of requests sharing a work item,
--      computed to a fixed point, so a cross-request work item is always
--      recomputed from ALL of its calls.
--   2. `direct` groups by question ALONE. request_id on the fact is the
--      ORIGINATING request (earliest call, ties by id), so v_cost_by_request
--      attributes a work item to the request that created it.
--   3. The shared-cost split stays per-request but is summed per work item,
--      since an item in two requests receives a share from each.
--
--   Conservation is unaffected and still asserted.
--
-- This fix is also folded into 20260731_aiecon_p4_cost_engine.sql, so a fresh
-- deploy from that file alone is correct and this migration replays as a
-- harmless CREATE OR REPLACE.
-- ===========================================================================

CREATE OR REPLACE FUNCTION cost_engine.allocate(
  p_from   timestamptz,
  p_to     timestamptz,
  p_reason text DEFAULT 'scheduled'
)
RETURNS uuid
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = cost_engine, public, ai_catalog
AS $$
DECLARE
  -- 1.0.1: a work item is a QUESTION and may span requests (see the fix
  -- migration 20260731_aiecon_p4_fix_work_item_spans_requests.sql).
  c_alloc_version constant text := 'alloc-1.0.1';
  v_run_id    uuid;
  v_items     integer := 0;
  v_calls     integer := 0;
  v_allocated numeric;
  v_priced    numeric;
  v_variance  numeric;
BEGIN
  INSERT INTO cost_engine.allocation_runs
    (allocation_version, window_from, window_to, reason)
  VALUES (c_alloc_version, p_from, p_to, p_reason)
  RETURNING id INTO v_run_id;

  -- ON COMMIT DROP is not enough: the determinism proof calls allocate()
  -- twice inside ONE transaction, and the second call would collide with the
  -- first call's still-live temp tables.
  DROP TABLE IF EXISTS _alloc_reqs;
  DROP TABLE IF EXISTS _alloc_scope;
  DROP TABLE IF EXISTS _alloc_items;
  DROP TABLE IF EXISTS _alloc_shared;
  DROP TABLE IF EXISTS _alloc_ranked;

  -- A WORK ITEM CAN SPAN REQUESTS. `reference_resolver` resolves a follow-up
  -- against an EARLIER question (§8.8.1), so one question_record_id legitimately
  -- accumulates cost from several request_ids, minutes apart. Scoping by the
  -- window's requests alone would therefore recompute a work item from only
  -- part of its calls.
  --
  -- So the scope is the TRANSITIVE CLOSURE: start from the requests the window
  -- touched, pull in every request that shares a work item with them, and
  -- repeat to a fixed point. UNION (not UNION ALL) terminates the recursion.
  -- This makes each affected work item whole, which is what the conservation
  -- assertion below is a statement about.
  CREATE TEMP TABLE _alloc_reqs ON COMMIT DROP AS
  WITH RECURSIVE seed AS (
    SELECT DISTINCT f.request_id
      FROM cost_engine.cost_facts f
      JOIN public.ai_model_calls c ON c.id = f.call_id
     WHERE f.is_current
       AND c.created_at >= p_from
       AND c.created_at <  p_to
  ),
  closure AS (
    SELECT s.request_id FROM seed s
    UNION
    SELECT f2.request_id
      FROM closure cl
      JOIN cost_engine.cost_facts f1
        ON f1.is_current AND f1.request_id = cl.request_id
       AND f1.question_record_id IS NOT NULL
      JOIN cost_engine.cost_facts f2
        ON f2.is_current AND f2.question_record_id = f1.question_record_id
  )
  SELECT DISTINCT request_id FROM closure;

  CREATE TEMP TABLE _alloc_scope ON COMMIT DROP AS
  SELECT f.*
    FROM cost_engine.cost_facts f
   WHERE f.is_current
     AND f.request_id IN (SELECT request_id FROM _alloc_reqs);

  -- Work items per request, and each request's shared (untagged) cost.
  CREATE TEMP TABLE _alloc_items ON COMMIT DROP AS
  SELECT DISTINCT
         s.request_id,
         s.question_record_id::text AS work_item_id
    FROM _alloc_scope s
   WHERE s.question_record_id IS NOT NULL;

  CREATE TEMP TABLE _alloc_shared ON COMMIT DROP AS
  SELECT s.request_id,
         round(COALESCE(sum(s.net_cost_usd), 0), 8) AS shared_usd,
         round(COALESCE(sum(s.net_cost_egp), 0), 4) AS shared_egp,
         count(*)                                   AS shared_calls,
         count(*) FILTER (WHERE s.pricing_status = 'unpriced') AS shared_unpriced,
         max(s.price_confidence)                    AS shared_conf
    FROM _alloc_scope s
   WHERE s.question_record_id IS NULL
   GROUP BY s.request_id;

  -- Rank work items within a request so the largest-remainder tie-break is
  -- deterministic: ascending work_item_id, exactly as §8.8.4 requires.
  CREATE TEMP TABLE _alloc_ranked ON COMMIT DROP AS
  SELECT i.request_id,
         i.work_item_id,
         row_number() OVER (PARTITION BY i.request_id ORDER BY i.work_item_id) AS rn,
         count(*)     OVER (PARTITION BY i.request_id)                          AS n_items
    FROM _alloc_items i;

  -- ── Supersede the previous facts for every item this run rewrites ───────
  UPDATE cost_engine.question_cost_facts q
     SET is_current = false
   WHERE q.is_current
     AND (
       (q.work_item_type = 'question'
        AND q.work_item_id IN (SELECT work_item_id FROM _alloc_ranked))
       OR
       (q.work_item_type = 'unattributed'
        AND q.work_item_id IN (
              SELECT sh.request_id::text FROM _alloc_shared sh
               WHERE NOT EXISTS (SELECT 1 FROM _alloc_ranked r WHERE r.request_id = sh.request_id)))
     );

  -- ── Question work items: direct cost + share of the request's shared cost ─
  WITH direct AS (
    -- Grouped by question ALONE. A question is the work item; the request that
    -- happened to carry a given call is not part of its identity. Grouping by
    -- (question, request) emitted one row per request and collided with the
    -- one-current-fact-per-work-item unique index the moment a follow-up
    -- resolved against an earlier question.
    SELECT s.question_record_id::text                        AS work_item_id,
           -- The ORIGINATING request: earliest call, ties broken by id so the
           -- pick is deterministic. v_cost_by_request therefore attributes a
           -- work item to the request that created it, not to every request
           -- that later touched it.
           (array_agg(s.request_id ORDER BY s.occurred_at, s.id))[1] AS request_id,
           min(s.occurred_at)                                AS occurred_at,
           round(COALESCE(sum(s.net_cost_usd), 0), 8)        AS direct_usd,
           round(COALESCE(sum(s.net_cost_egp), 0), 4)        AS direct_egp,
           count(*)                                          AS call_count,
           count(*) FILTER (WHERE s.pricing_status <> 'unpriced') AS priced_count,
           count(*) FILTER (WHERE s.pricing_status =  'unpriced') AS unpriced_count,
           count(*) FILTER (WHERE s.net_cost_usd IS NOT NULL)     AS costed_count,
           -- Business dimensions inherited from the contributing facts. min()
           -- over a single work item's calls is a stable pick, and every call
           -- of one question carries the same user/plan/topic by construction.
           min(s.user_id::text)::uuid                        AS user_id,
           bool_or(s.is_internal)                            AS is_internal,
           min(s.plan_code)                                  AS plan_code,
           min(s.topic_id)                                   AS topic_id,
           min(s.subtopic_id)                                AS subtopic_id,
           min(s.operation)                                  AS operation,
           -- max() picks the WORST confidence: 'list_price' > 'invoice_verified'
           -- alphabetically, so one unverified price taints the work item.
           max(s.price_confidence)                           AS price_confidence
      FROM _alloc_scope s
     WHERE s.question_record_id IS NOT NULL
     GROUP BY s.question_record_id
  ),
  direct_mix AS (
    SELECT s.question_record_id::text AS work_item_id,
           jsonb_object_agg(s.service_code, s.c ORDER BY s.service_code) AS mix
      FROM (
        SELECT s2.question_record_id, s2.service_code,
               round(sum(s2.net_cost_usd), 8) AS c
          FROM _alloc_scope s2
         WHERE s2.question_record_id IS NOT NULL
         GROUP BY s2.question_record_id, s2.service_code
      ) s
     GROUP BY s.question_record_id
  ),
  -- Per (request, work item): this item's share of THAT request's shared cost,
  -- by largest remainder. Unchanged in substance — the split is still a
  -- property of one request.
  per_request_share AS (
    SELECT r.work_item_id,
           r.rn,
           r.n_items,
           COALESCE(sh.shared_calls, 0)   AS shared_calls,
           COALESCE(sh.shared_unpriced,0) AS shared_unpriced,
           sh.shared_conf                 AS shared_conf,
           -- floor to 8dp, then hand out the remaining ulps to the lowest ids
           trunc(COALESCE(sh.shared_usd, 0) / r.n_items, 8)
             + CASE WHEN r.rn <= round((COALESCE(sh.shared_usd, 0)
                       - trunc(COALESCE(sh.shared_usd, 0) / r.n_items, 8) * r.n_items)
                       / 0.00000001)::bigint
                    THEN 0.00000001 ELSE 0 END               AS share_usd,
           trunc(COALESCE(sh.shared_egp, 0) / r.n_items, 4)
             + CASE WHEN r.rn <= round((COALESCE(sh.shared_egp, 0)
                       - trunc(COALESCE(sh.shared_egp, 0) / r.n_items, 4) * r.n_items)
                       / 0.0001)::bigint
                    THEN 0.0001 ELSE 0 END                   AS share_egp
      FROM _alloc_ranked r
      LEFT JOIN _alloc_shared sh ON sh.request_id = r.request_id
  ),
  -- Rolled up to the WORK ITEM. A question touched by two requests receives a
  -- share from each, so these must be summed rather than joined 1:1.
  split AS (
    SELECT p.work_item_id,
           sum(p.share_usd)       AS share_usd,
           sum(p.share_egp)       AS share_egp,
           sum(p.shared_calls)    AS shared_calls,
           sum(p.shared_unpriced) AS shared_unpriced,
           max(p.shared_conf)     AS shared_conf,
           max(p.n_items)         AS n_items
      FROM per_request_share p
     GROUP BY p.work_item_id
  )
  INSERT INTO cost_engine.question_cost_facts (
    allocation_run_id, work_item_type, work_item_id, parent_work_item_id,
    request_id, occurred_at, user_id, is_internal, plan_code, topic_id,
    subtopic_id, operation,
    direct_cost_usd, shared_cost_usd, total_cost_usd, total_cost_egp,
    thread_cost_usd, service_mix, call_count, priced_call_count,
    unpriced_call_count, cost_completeness, price_confidence,
    allocation_method, allocation_version
  )
  SELECT
    v_run_id,
    'question',
    d.work_item_id,
    -- parent_work_item_id: question_records carries no explicit parent link
    -- today, so this stays NULL rather than being guessed. `inherited` moves
    -- no cost (§8.8.4), so a NULL parent affects thread_cost only — never
    -- total_cost and never conservation. See the review doc, "Known gap G1".
    NULL,
    d.request_id,
    d.occurred_at,
    d.user_id,
    d.is_internal,
    d.plan_code,
    d.topic_id,
    d.subtopic_id,
    d.operation,
    CASE WHEN d.costed_count = 0 THEN NULL ELSE d.direct_usd END,
    CASE WHEN COALESCE(sp.shared_calls, 0) = 0 THEN NULL ELSE sp.share_usd END,
    CASE WHEN d.costed_count = 0 AND COALESCE(sp.shared_calls,0) = 0 THEN NULL
         ELSE round(d.direct_usd + COALESCE(sp.share_usd, 0), 8)
    END,
    CASE WHEN d.direct_egp IS NULL THEN NULL
         ELSE round(d.direct_egp + COALESCE(sp.share_egp, 0), 4)
    END,
    -- thread_cost = own cost until a parent link exists (G1). Recomputed as a
    -- descendant rollup the moment parent_work_item_id is populated.
    CASE WHEN d.costed_count = 0 AND COALESCE(sp.shared_calls,0) = 0 THEN NULL
         ELSE round(d.direct_usd + COALESCE(sp.share_usd, 0), 8)
    END,
    COALESCE(dm.mix, '{}'::jsonb),
    d.call_count + COALESCE(sp.shared_calls, 0),
    d.priced_count + COALESCE(sp.shared_calls, 0) - COALESCE(sp.shared_unpriced, 0),
    d.unpriced_count + COALESCE(sp.shared_unpriced, 0),
    CASE
      WHEN d.priced_count + COALESCE(sp.shared_calls,0) - COALESCE(sp.shared_unpriced,0) = 0 THEN 'unknown'
      WHEN d.unpriced_count + COALESCE(sp.shared_unpriced,0) > 0 THEN 'partial'
      ELSE 'complete'
    END,
    greatest(d.price_confidence, sp.shared_conf),
    CASE WHEN COALESCE(sp.n_items, 1) > 1 AND COALESCE(sp.shared_calls, 0) > 0
         THEN 'shared_equal' ELSE 'direct' END,
    c_alloc_version
  FROM direct d
  LEFT JOIN split      sp ON sp.work_item_id = d.work_item_id
  LEFT JOIN direct_mix dm ON dm.work_item_id = d.work_item_id;

  GET DIAGNOSTICS v_items = ROW_COUNT;

  -- ── Orphan bucket: requests that produced no work item ──────────────────
  -- Never dropped (§8.8.4 `unattributed`); silently discarding these would
  -- understate total cost.
  INSERT INTO cost_engine.question_cost_facts (
    allocation_run_id, work_item_type, work_item_id, parent_work_item_id,
    request_id, occurred_at, user_id, is_internal, plan_code, topic_id,
    subtopic_id, operation,
    direct_cost_usd, shared_cost_usd, total_cost_usd, total_cost_egp,
    thread_cost_usd, service_mix, call_count, priced_call_count,
    unpriced_call_count, cost_completeness, price_confidence,
    allocation_method, allocation_version
  )
  SELECT
    v_run_id, 'unattributed', s.request_id::text, NULL,
    s.request_id, min(s.occurred_at),
    min(s.user_id::text)::uuid, bool_or(s.is_internal), min(s.plan_code),
    min(s.topic_id), min(s.subtopic_id), min(s.operation),
    CASE WHEN count(*) FILTER (WHERE s.net_cost_usd IS NOT NULL) = 0
         THEN NULL ELSE round(COALESCE(sum(s.net_cost_usd), 0), 8) END,
    NULL,
    CASE WHEN count(*) FILTER (WHERE s.net_cost_usd IS NOT NULL) = 0
         THEN NULL ELSE round(COALESCE(sum(s.net_cost_usd), 0), 8) END,
    CASE WHEN count(*) FILTER (WHERE s.net_cost_egp IS NOT NULL) = 0
         THEN NULL ELSE round(COALESCE(sum(s.net_cost_egp), 0), 4) END,
    CASE WHEN count(*) FILTER (WHERE s.net_cost_usd IS NOT NULL) = 0
         THEN NULL ELSE round(COALESCE(sum(s.net_cost_usd), 0), 8) END,
    COALESCE(jsonb_object_agg(s.service_code, s.svc_cost ORDER BY s.service_code)
      FILTER (WHERE s.svc_cost IS NOT NULL), '{}'::jsonb),
    count(*),
    count(*) FILTER (WHERE s.pricing_status <> 'unpriced'),
    count(*) FILTER (WHERE s.pricing_status =  'unpriced'),
    CASE
      WHEN count(*) FILTER (WHERE s.pricing_status <> 'unpriced') = 0 THEN 'unknown'
      WHEN count(*) FILTER (WHERE s.pricing_status =  'unpriced') > 0 THEN 'partial'
      ELSE 'complete'
    END,
    max(s.price_confidence),
    'unattributed',
    c_alloc_version
  FROM (
    SELECT s2.*,
           sum(s2.net_cost_usd) OVER (PARTITION BY s2.request_id, s2.service_code) AS svc_cost
      FROM _alloc_scope s2
     WHERE s2.question_record_id IS NULL
       AND NOT EXISTS (SELECT 1 FROM _alloc_ranked r WHERE r.request_id = s2.request_id)
  ) s
  GROUP BY s.request_id;

  GET DIAGNOSTICS v_calls = ROW_COUNT;
  v_items := v_items + v_calls;

  SELECT count(*) INTO v_calls FROM _alloc_scope;

  -- ── §8.8.5 CONSERVATION ASSERTION ───────────────────────────────────────
  -- Allocation may move cost between work items; it may never create or
  -- destroy it (INV-20). A mismatch RAISEs, the transaction rolls back, and
  -- the previous allocation stays current — fail-closed, so the dashboard
  -- shows slightly stale but internally consistent numbers rather than fresh
  -- inconsistent ones.
  SELECT COALESCE(sum(q.total_cost_usd), 0) INTO v_allocated
    FROM cost_engine.question_cost_facts q
   WHERE q.allocation_run_id = v_run_id;

  SELECT COALESCE(sum(s.net_cost_usd), 0) INTO v_priced
    FROM _alloc_scope s;

  v_variance := round(v_allocated - v_priced, 8);

  UPDATE cost_engine.allocation_runs
     SET finished_at = now(),
         work_items_written = v_items,
         calls_allocated = v_calls,
         conserved = (v_variance = 0),
         variance_usd = v_variance
   WHERE id = v_run_id;

  IF v_variance <> 0 THEN
    RAISE EXCEPTION
      'allocation conservation failed (INV-20): allocated % <> priced %, variance % USD',
      v_allocated, v_priced, v_variance
      USING ERRCODE = 'data_exception';
  END IF;

  RETURN v_run_id;
END;
$$;

REVOKE ALL ON FUNCTION cost_engine.allocate(timestamptz,timestamptz,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION cost_engine.allocate(timestamptz,timestamptz,text) TO service_role;

COMMENT ON FUNCTION cost_engine.allocate(timestamptz,timestamptz,text) IS
  'Cost Allocation stage (§8.8). Redistributes already-priced amounts into '
  'work items; performs no pricing math (INV-06). A work item is a QUESTION '
  'and may span several requests (a follow-up resolved against an earlier '
  'question) — scope is the transitive closure of requests sharing a work '
  'item. Asserts conservation (INV-20) and RAISEs on any variance, leaving '
  'the previous allocation current.';
