-- ===========================================================================
-- verify-cost-engine.sql — Phase 4 (Cost Engine) verification
-- ===========================================================================
-- Checks every Phase 4 exit criterion in docs/roadmap/ai-economics.md §14.
--
-- USAGE
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/verify-cost-engine.sql
--
-- SAFETY
--   Sections A–D are pure reads.
--   Section E proves idempotence, determinism and rate-card correction, which
--   requires calling the engine's writers. It runs inside an explicit
--   transaction that ends in ROLLBACK, so production state is unchanged when
--   the script finishes. Nothing here is destructive even if interrupted.
--
-- READING THE OUTPUT
--   Every row is PASS, FAIL or WARN. Any FAIL blocks the Phase 4 exit.
-- ===========================================================================

\pset pager off
\timing off

\echo ''
\echo '=== A. Structure and posture ==============================================='

-- P4-01 — every architected object exists.
SELECT 'P4-01' AS check,
       CASE WHEN count(*) = 9 THEN 'PASS' ELSE 'FAIL' END AS result,
       count(*)::text || '/9 engine tables present' AS detail
  FROM information_schema.tables
 WHERE table_schema = 'cost_engine'
   AND table_name IN ('billing_units','rate_cards','rate_components','discount_rules',
                      'fx_rates','cost_runs','cost_facts','allocation_runs','question_cost_facts');

-- P4-02 — rate cards are keyed on the SKU, never on the capability (INV-14).
SELECT 'P4-02' AS check,
       CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END AS result,
       'rate_cards has ' || count(*)::text || ' service_code column(s) — must be 0' AS detail
  FROM information_schema.columns
 WHERE table_schema = 'cost_engine' AND table_name = 'rate_cards' AND column_name = 'service_code';

-- P4-03 — telemetry never carries money (INV-01).
SELECT 'P4-03' AS check,
       CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END AS result,
       'ai_model_calls money-ish columns: ' || count(*)::text || ' — must be 0' AS detail
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'ai_model_calls'
   AND (column_name ~* 'cost|price|usd|egp|currency|fx');

-- P4-04 — the engine is not reachable from the API surface.
SELECT 'P4-04' AS check,
       CASE WHEN bool_and(NOT has_schema_privilege(r, 'cost_engine', 'USAGE'))
            THEN 'PASS' ELSE 'FAIL' END AS result,
       'anon/authenticated USAGE on cost_engine must be denied' AS detail
  FROM unnest(ARRAY['anon','authenticated']) r;

-- P4-05 — every owner RPC is STABLE (INV-07) and owner-gated (INV-10).
SELECT 'P4-05' AS check,
       CASE WHEN count(*) FILTER (WHERE p.provolatile <> 's' OR NOT p.prosecdef) = 0
                 AND count(*) = 6
            THEN 'PASS' ELSE 'FAIL' END AS result,
       count(*)::text || '/6 owner_cost_* functions, '
         || count(*) FILTER (WHERE p.provolatile = 's' AND p.prosecdef)::text
         || ' STABLE+SECURITY DEFINER' AS detail
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname LIKE 'owner\_cost\_%';

-- P4-06 — no owner RPC is callable by anon (PostgREST exposure).
SELECT 'P4-06' AS check,
       CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END AS result,
       count(*)::text || ' owner_cost_* function(s) executable by anon — must be 0' AS detail
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname LIKE 'owner\_cost\_%'
   AND has_function_privilege('anon', p.oid, 'EXECUTE');

\echo ''
\echo '=== B. Pricing coverage and correctness ===================================='

-- P4-07 — every telemetry row has exactly one current cost fact.
SELECT 'P4-07' AS check,
       CASE WHEN unpriced_missing_fact = 0 THEN 'PASS' ELSE 'FAIL' END AS result,
       telemetry_calls::text || ' telemetry rows, ' || current_facts::text
         || ' current facts, ' || unpriced_missing_fact::text || ' with no fact' AS detail
  FROM cost_engine.v_pricing_coverage;

-- P4-08 — pricing coverage >= 99%.
SELECT 'P4-08' AS check,
       CASE WHEN coverage_pct >= 99 THEN 'PASS'
            WHEN coverage_pct IS NULL THEN 'WARN' ELSE 'FAIL' END AS result,
       'coverage ' || COALESCE(coverage_pct::text,'n/a') || '% (target >= 99%)' AS detail
  FROM cost_engine.v_pricing_coverage;

-- P4-09 — binding resolution >= 99% registered.
SELECT 'P4-09' AS check,
       CASE WHEN binding_resolution_pct >= 99 THEN 'PASS'
            WHEN binding_resolution_pct IS NULL THEN 'WARN' ELSE 'FAIL' END AS result,
       'binding resolution ' || COALESCE(binding_resolution_pct::text,'n/a')
         || '% registered (target >= 99%)' AS detail
  FROM cost_engine.v_pricing_coverage;

-- P4-10 — every unpriced fact states WHY (INV-26: never silently zero).
SELECT 'P4-10' AS check,
       CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END AS result,
       count(*)::text || ' unpriced fact(s) with no unpriced_reason — must be 0' AS detail
  FROM cost_engine.cost_facts
 WHERE is_current AND pricing_status = 'unpriced' AND unpriced_reason IS NULL;

-- P4-11 — unknown cost is NULL, never 0 (INV-23).
SELECT 'P4-11' AS check,
       CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END AS result,
       count(*)::text || ' unpriced fact(s) carrying a non-NULL cost — must be 0' AS detail
  FROM cost_engine.cost_facts
 WHERE is_current AND pricing_status = 'unpriced'
   AND (net_cost_usd IS NOT NULL OR gross_cost_usd IS NOT NULL);

-- P4-12 — every priced fact traces to a rate card (INV-17).
SELECT 'P4-12' AS check,
       CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END AS result,
       count(*)::text || ' priced fact(s) with no rate_card_id — must be 0' AS detail
  FROM cost_engine.cost_facts
 WHERE is_current AND pricing_status <> 'unpriced' AND rate_card_id IS NULL;

-- P4-13 — every fact traces back to immutable telemetry (INV-16).
SELECT 'P4-13' AS check,
       CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END AS result,
       count(*)::text || ' fact(s) whose call_id is not in ai_model_calls — must be 0' AS detail
  FROM cost_engine.cost_facts f
 WHERE f.is_current
   AND NOT EXISTS (SELECT 1 FROM public.ai_model_calls c WHERE c.id = f.call_id);

-- P4-14 — exactly one current fact per call (the partial unique index).
SELECT 'P4-14' AS check,
       CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END AS result,
       count(*)::text || ' call(s) with more than one current fact — must be 0' AS detail
  FROM (SELECT call_id FROM cost_engine.cost_facts WHERE is_current
         GROUP BY call_id HAVING count(*) > 1) d;

-- P4-29 — provisional prices can never masquerade as verified ones (INV-22).
-- Every priced fact carries the confidence of the rate card that produced it,
-- and owner_cost_metrics maps 'list_price' to confidence='modeled'.
SELECT 'P4-29' AS check,
       CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END AS result,
       count(*)::text || ' priced fact(s) with no price_confidence — must be 0' AS detail
  FROM cost_engine.cost_facts
 WHERE is_current AND pricing_status <> 'unpriced' AND price_confidence IS NULL;

-- P4-30 — a work item's confidence degrades to its weakest input: one
-- list-priced contributing call makes the whole item modeled.
SELECT 'P4-30' AS check,
       CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END AS result,
       count(*)::text || ' work item(s) claiming invoice_verified despite a '
         || 'list-priced contributing call — must be 0' AS detail
  FROM cost_engine.question_cost_facts q
 WHERE q.is_current
   AND q.price_confidence = 'invoice_verified'
   AND EXISTS (
     SELECT 1 FROM cost_engine.cost_facts f
      WHERE f.is_current AND f.price_confidence = 'list_price'
        AND (f.question_record_id::text = q.work_item_id
             OR (f.question_record_id IS NULL AND f.request_id = q.request_id))
   );

-- P4-31 — how much of the current cost book rests on unverified prices.
-- Informational, but it is the number that decides whether these figures are
-- ready to be treated as financial truth.
SELECT 'P4-31' AS check,
       CASE WHEN count(*) FILTER (WHERE price_confidence = 'list_price') = 0
            THEN 'PASS' ELSE 'WARN' END AS result,
       count(*) FILTER (WHERE price_confidence = 'list_price')::text || ' of '
         || count(*)::text || ' priced facts use UNVERIFIED list prices; '
         || COALESCE(round(100.0 * sum(net_cost_usd) FILTER (WHERE price_confidence = 'list_price')
              / NULLIF(sum(net_cost_usd),0), 2)::text, '0')
         || '% of total cost is modeled, not actual' AS detail
  FROM cost_engine.cost_facts
 WHERE is_current AND pricing_status <> 'unpriced';

\echo ''
\echo '=== C. Hierarchy reconciliation (§8.9) ====================================='

-- P4-15 — service totals reconcile EXACTLY to provider totals and to model
-- totals. All three read the same call facts, so any drift is a view defect.
WITH svc AS (SELECT COALESCE(sum(net_cost_usd),0) t FROM cost_engine.cost_facts WHERE is_current),
     prov AS (SELECT COALESCE(sum(total_cost_usd),0) t FROM cost_engine.v_cost_by_provider),
     mdl  AS (SELECT COALESCE(sum(total_cost_usd),0) t FROM cost_engine.v_cost_by_model),
     sbys AS (SELECT COALESCE(sum(total_cost_usd),0) t FROM cost_engine.v_cost_by_service)
SELECT 'P4-15' AS check,
       CASE WHEN svc.t = prov.t AND svc.t = mdl.t AND svc.t = sbys.t
            THEN 'PASS' ELSE 'FAIL' END AS result,
       'facts=' || svc.t || ' service=' || sbys.t || ' provider=' || prov.t
         || ' model=' || mdl.t AS detail
  FROM svc, prov, mdl, sbys;

\echo ''
\echo '=== D. Allocation: conservation and attribution (§8.8) ====================='

-- P4-16 — §8.8.5 CONSERVATION over ALL time, independently of any single run.
-- This is the architecture's literal statement of the law.
WITH allocated AS (
  SELECT COALESCE(sum(total_cost_usd),0) t FROM cost_engine.question_cost_facts WHERE is_current
), priced AS (
  SELECT COALESCE(sum(net_cost_usd),0) t FROM cost_engine.cost_facts WHERE is_current
)
SELECT 'P4-16' AS check,
       CASE WHEN allocated.t = priced.t THEN 'PASS' ELSE 'FAIL' END AS result,
       'allocated=' || allocated.t || ' priced=' || priced.t
         || ' variance=' || (allocated.t - priced.t) AS detail
  FROM allocated, priced;

-- P4-17 — the last allocation run asserted conservation and recorded it.
SELECT 'P4-17' AS check,
       CASE WHEN conserved AND variance_usd = 0 THEN 'PASS' ELSE 'FAIL' END AS result,
       'last run conserved=' || COALESCE(conserved::text,'?')
         || ' variance=' || COALESCE(variance_usd::text,'?') AS detail
  FROM cost_engine.allocation_runs ORDER BY started_at DESC LIMIT 1;

-- P4-18 — every call reaches a work item, and the ONLY reason a call is
-- counted more than once is legitimate sharing.
--
-- A shared call genuinely contributes to each work item it produced, so it
-- appears in each item's call_count by design — summing call_count across
-- items therefore exceeds the fact count. This check proves the excess is
-- EXACTLY the shared multiplicity Σ(shared_calls × (work_items − 1)) and not
-- a single call leaking into an item it never served. Money is covered
-- separately and exactly by P4-16.
WITH wi AS (SELECT COALESCE(sum(call_count),0) t FROM cost_engine.question_cost_facts WHERE is_current),
     cf AS (SELECT count(*) t FROM cost_engine.cost_facts WHERE is_current),
     sh AS (SELECT request_id, count(*) AS shared_calls
              FROM cost_engine.cost_facts
             WHERE is_current AND question_record_id IS NULL
             GROUP BY request_id),
     it AS (SELECT request_id, count(DISTINCT question_record_id) AS n_items
              FROM cost_engine.cost_facts
             WHERE is_current AND question_record_id IS NOT NULL
             GROUP BY request_id),
     ee AS (SELECT COALESCE(sum(sh.shared_calls * (it.n_items - 1)), 0) t
              FROM sh JOIN it ON it.request_id = sh.request_id)
SELECT 'P4-18' AS check,
       CASE WHEN wi.t - cf.t = ee.t THEN 'PASS' ELSE 'FAIL' END AS result,
       'work-item call_count sum=' || wi.t || ' current facts=' || cf.t
         || ' excess=' || (wi.t - cf.t) || ' expected shared multiplicity=' || ee.t AS detail
  FROM wi, cf, ee;

-- P4-19 — every call reaches a work item; orphans are bucketed, never dropped
-- (§8.8.4).
--
-- NOT a comparison of request_id sets: a work item records its ORIGINATING
-- request, and a follow-up resolved against an earlier question contributes
-- from a different request that therefore never appears on a work-item fact.
-- The real property is that every current cost fact is represented by the
-- resolver's own rules:
--   tagged   -> its question exists as a current work item
--   untagged -> its request has a work item to share into, or the request
--               itself exists as an 'unattributed' bucket
SELECT 'P4-19' AS check,
       CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END AS result,
       count(*)::text || ' cost fact(s) not represented by any work item — must be 0' AS detail
  FROM cost_engine.cost_facts f
 WHERE f.is_current
   AND NOT (
     CASE
       WHEN f.question_record_id IS NOT NULL THEN EXISTS (
         SELECT 1 FROM cost_engine.question_cost_facts q
          WHERE q.is_current AND q.work_item_type = 'question'
            AND q.work_item_id = f.question_record_id::text)
       ELSE EXISTS (
         SELECT 1 FROM cost_engine.cost_facts f2
          WHERE f2.is_current AND f2.request_id = f.request_id
            AND f2.question_record_id IS NOT NULL)
         OR EXISTS (
         SELECT 1 FROM cost_engine.question_cost_facts q
          WHERE q.is_current AND q.work_item_type = 'unattributed'
            AND q.work_item_id = f.request_id::text)
     END
   );

-- P4-20 — a shared call splits losslessly. For every request with a shared
-- call, the parts must sum to the original amount exactly.
WITH shared_src AS (
  SELECT f.request_id, round(sum(f.net_cost_usd),8) AS src
    FROM cost_engine.cost_facts f
   WHERE f.is_current AND f.question_record_id IS NULL
     AND EXISTS (SELECT 1 FROM cost_engine.cost_facts f2
                  WHERE f2.is_current AND f2.request_id = f.request_id
                    AND f2.question_record_id IS NOT NULL)
   GROUP BY f.request_id
), shared_dst AS (
  SELECT q.request_id, round(sum(q.shared_cost_usd),8) AS dst
    FROM cost_engine.question_cost_facts q
   WHERE q.is_current AND q.shared_cost_usd IS NOT NULL
   GROUP BY q.request_id
)
SELECT 'P4-20' AS check,
       CASE WHEN count(*) FILTER (WHERE s.src IS DISTINCT FROM d.dst) = 0
            THEN 'PASS' ELSE 'FAIL' END AS result,
       count(*)::text || ' request(s) with shared cost; '
         || count(*) FILTER (WHERE s.src IS DISTINCT FROM d.dst)::text
         || ' where the split does not sum back' AS detail
  FROM shared_src s FULL JOIN shared_dst d ON d.request_id = s.request_id;

-- P4-21 — incomplete aggregates are labelled, never silently completed (INV-24).
SELECT 'P4-21' AS check,
       CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END AS result,
       count(*)::text || ' work item(s) mislabelled complete despite unpriced calls' AS detail
  FROM cost_engine.question_cost_facts
 WHERE is_current AND cost_completeness = 'complete' AND unpriced_call_count > 0;

-- P4-22 — a work item with nothing priced reports NULL, never 0 (INV-23).
SELECT 'P4-22' AS check,
       CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END AS result,
       count(*)::text || ' unknown work item(s) reporting a number instead of NULL' AS detail
  FROM cost_engine.question_cost_facts
 WHERE is_current AND cost_completeness = 'unknown' AND total_cost_usd IS NOT NULL;

-- P4-23 — parent/child never double counts: thread_cost >= total_cost always,
-- and equals it when the item has no descendants (§8.8.4).
SELECT 'P4-23' AS check,
       CASE WHEN count(*) = 0 THEN 'PASS' ELSE 'FAIL' END AS result,
       count(*)::text || ' work item(s) where thread_cost < total_cost — must be 0' AS detail
  FROM cost_engine.question_cost_facts
 WHERE is_current AND thread_cost_usd IS NOT NULL AND total_cost_usd IS NOT NULL
   AND thread_cost_usd < total_cost_usd;

\echo ''
\echo '=== E. Idempotence, determinism, correction (transactional — rolled back) ==='

BEGIN;

-- P4-24 — re-running run_pricing over a window already priced writes NO new
-- cost fact. (It does write a cost_runs audit row; that is the run log, not a
-- fact.) This is the idempotence exit criterion.
DO $$
DECLARE v_before bigint; v_after bigint; v_run uuid;
BEGIN
  SELECT count(*) INTO v_before FROM cost_engine.cost_facts;
  v_run := cost_engine.run_pricing('-infinity','infinity','verify_idempotence');
  SELECT count(*) INTO v_after FROM cost_engine.cost_facts;
  IF v_after = v_before THEN
    RAISE NOTICE 'P4-24 | PASS | re-run wrote 0 new facts (% before, % after)', v_before, v_after;
  ELSE
    RAISE WARNING 'P4-24 | FAIL | re-run wrote % new fact(s)', v_after - v_before;
  END IF;
END $$;

-- P4-25 — allocation is DETERMINISTIC: same facts + same allocation_version
-- produces byte-identical output (INV-19). Compared as an ordered digest of
-- every money and attribution column.
DO $$
DECLARE v_before text; v_after text;
BEGIN
  SELECT md5(string_agg(
           work_item_type||'|'||work_item_id||'|'||COALESCE(parent_work_item_id,'')||'|'
           ||COALESCE(direct_cost_usd::text,'')||'|'||COALESCE(shared_cost_usd::text,'')||'|'
           ||COALESCE(total_cost_usd::text,'')||'|'||COALESCE(thread_cost_usd::text,'')||'|'
           ||service_mix::text||'|'||call_count::text||'|'||cost_completeness||'|'||allocation_method,
           E'\n' ORDER BY work_item_type, work_item_id))
    INTO v_before
    FROM cost_engine.question_cost_facts WHERE is_current;

  PERFORM cost_engine.allocate('-infinity','infinity','verify_determinism');

  SELECT md5(string_agg(
           work_item_type||'|'||work_item_id||'|'||COALESCE(parent_work_item_id,'')||'|'
           ||COALESCE(direct_cost_usd::text,'')||'|'||COALESCE(shared_cost_usd::text,'')||'|'
           ||COALESCE(total_cost_usd::text,'')||'|'||COALESCE(thread_cost_usd::text,'')||'|'
           ||service_mix::text||'|'||call_count::text||'|'||cost_completeness||'|'||allocation_method,
           E'\n' ORDER BY work_item_type, work_item_id))
    INTO v_after
    FROM cost_engine.question_cost_facts WHERE is_current;

  IF v_before IS NOT DISTINCT FROM v_after THEN
    RAISE NOTICE 'P4-25 | PASS | allocation byte-identical on re-run (digest %)', left(COALESCE(v_after,'-'),12);
  ELSE
    RAISE WARNING 'P4-25 | FAIL | allocation differs on re-run: % -> %', v_before, v_after;
  END IF;
END $$;

-- P4-26 — a deliberate rate-card CORRECTION supersedes cleanly and leaves the
-- prior facts intact for audit (INV-15).
--
-- A correction is not the same operation as a price change. Closing a card at
-- now() only affects FUTURE calls — historical prices are deliberately never
-- rewritten (§8.4), so that would leave every existing fact untouched and
-- prove nothing. A correction says "the price we recorded was wrong for this
-- period", so the old card is closed AT THE START of the affected calls and
-- the corrected card opens there.
DO $$
DECLARE
  v_model text; v_boundary timestamptz;
  v_old_current bigint; v_new_current bigint; v_superseded bigint;
  v_old_total numeric; v_new_total numeric;
  v_card uuid;
BEGIN
  -- Correct whichever model carries the most priced facts.
  SELECT model, min(occurred_at) INTO v_model, v_boundary
    FROM cost_engine.cost_facts
   WHERE is_current AND pricing_status = 'priced'
   GROUP BY model ORDER BY count(*) DESC, model LIMIT 1;

  IF v_model IS NULL THEN
    RAISE WARNING 'P4-26 | WARN | no priced facts to correct — cannot exercise supersede';
    RETURN;
  END IF;

  SELECT count(*), COALESCE(sum(net_cost_usd),0) INTO v_old_current, v_old_total
    FROM cost_engine.cost_facts WHERE is_current;

  -- Close the card at the boundary; guard the window CHECK constraint in the
  -- edge case where the card opened at the very first call.
  UPDATE cost_engine.rate_cards
     SET effective_to = greatest(v_boundary, effective_from + interval '1 microsecond')
   WHERE model = v_model AND api_surface = 'default' AND effective_to IS NULL;

  INSERT INTO cost_engine.rate_cards
    (provider_code, model, api_surface, billing_model, currency,
     effective_from, version, source_note)
  VALUES ('openai', v_model, 'default', 'per_token', 'USD',
          v_boundary, 'verify-correction', 'synthetic — this transaction is rolled back')
  RETURNING id INTO v_card;

  -- Corrected price: exactly double the closed card, so the expected effect
  -- on the total is unambiguous.
  INSERT INTO cost_engine.rate_components (rate_card_id, unit_code, unit_price, per_qty, tier_from, tier_to, min_qty)
  SELECT v_card, co.unit_code, co.unit_price * 2, co.per_qty, co.tier_from, co.tier_to, co.min_qty
    FROM cost_engine.rate_components co
    JOIN cost_engine.rate_cards rc ON rc.id = co.rate_card_id
   WHERE rc.model = v_model AND rc.api_surface = 'default' AND rc.version <> 'verify-correction';

  PERFORM cost_engine.recompute('-infinity','infinity','verify_rate_card_correction');

  SELECT count(*), COALESCE(sum(net_cost_usd),0) INTO v_new_current, v_new_total
    FROM cost_engine.cost_facts WHERE is_current;
  SELECT count(*) INTO v_superseded FROM cost_engine.cost_facts WHERE NOT is_current;

  IF v_new_current = v_old_current AND v_superseded >= v_old_current AND v_new_total > v_old_total THEN
    RAISE NOTICE 'P4-26 | PASS | corrected %: % current facts (unchanged), % superseded rows retained for audit, total % -> %',
      v_model, v_new_current, v_superseded, v_old_total, v_new_total;
  ELSE
    RAISE WARNING 'P4-26 | FAIL | model=% current=% (was %) superseded=% total % -> %',
      v_model, v_new_current, v_old_current, v_superseded, v_old_total, v_new_total;
  END IF;
END $$;

-- P4-27 — conservation still holds after the correction + re-allocation.
DO $$
DECLARE v_alloc numeric; v_priced numeric;
BEGIN
  SELECT COALESCE(sum(total_cost_usd),0) INTO v_alloc
    FROM cost_engine.question_cost_facts WHERE is_current;
  SELECT COALESCE(sum(net_cost_usd),0) INTO v_priced
    FROM cost_engine.cost_facts WHERE is_current;
  IF v_alloc = v_priced THEN
    RAISE NOTICE 'P4-27 | PASS | conservation holds after correction (% = %)', v_alloc, v_priced;
  ELSE
    RAISE WARNING 'P4-27 | FAIL | after correction allocated % <> priced %', v_alloc, v_priced;
  END IF;
END $$;

-- P4-28 — facts are immutable: a money column may not be rewritten, and a
-- fact may not be deleted (INV-15, enforced by the freeze trigger).
DO $$
DECLARE v_upd text := 'not blocked'; v_del text := 'not blocked';
BEGIN
  BEGIN
    UPDATE cost_engine.cost_facts SET net_cost_usd = 999 WHERE is_current;
  EXCEPTION WHEN insufficient_privilege THEN v_upd := 'blocked';
  END;
  BEGIN
    DELETE FROM cost_engine.cost_facts WHERE is_current;
  EXCEPTION WHEN insufficient_privilege THEN v_del := 'blocked';
  END;
  IF v_upd = 'blocked' AND v_del = 'blocked' THEN
    RAISE NOTICE 'P4-28 | PASS | UPDATE of a money column and DELETE both refused';
  ELSE
    RAISE WARNING 'P4-28 | FAIL | update=% delete=%', v_upd, v_del;
  END IF;
END $$;

ROLLBACK;

\echo ''
\echo '=== F. Engine health (informational) ======================================='

SELECT * FROM cost_engine.v_pricing_coverage;

\echo ''
\echo 'Section E ran inside a rolled-back transaction — production state unchanged.'
\echo 'Any FAIL above blocks the Phase 4 exit (docs/roadmap/ai-economics.md §14).'
\echo ''
