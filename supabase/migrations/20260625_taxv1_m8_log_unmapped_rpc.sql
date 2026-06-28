-- ============================================================================
-- Phase 3 · M8 — log_unmapped_detection RPC (the single, shared logging path).
-- Atomic upsert + hit_count increment on unmapped_detections, keyed by the
-- case-insensitive (raw_topic, raw_subtopic) unique index from M7. Used by BOTH
-- client writers (via taxonomy-write.js) and the Edge Function — no duplicate
-- logging implementations anywhere.
-- SECURITY DEFINER so client writers can log without a SELECT/UPDATE grant.
-- NOT YET APPLIED — awaiting individual approval.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.log_unmapped_detection(
  p_raw_topic         text,
  p_raw_subtopic      text     DEFAULT NULL,
  p_raw_problem_type  text     DEFAULT NULL,
  p_source            text     DEFAULT NULL,
  p_user_id           uuid     DEFAULT NULL,
  p_context           text     DEFAULT NULL,
  p_taxonomy_version  smallint DEFAULT 1
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Ignore empty topics (nothing actionable to triage).
  IF coalesce(btrim(p_raw_topic), '') = '' AND coalesce(btrim(p_raw_subtopic), '') = '' THEN
    RETURN;
  END IF;

  INSERT INTO public.unmapped_detections
    (raw_topic, raw_subtopic, raw_problem_type, last_source, last_user_id,
     context_excerpt, taxonomy_version)
  VALUES
    (p_raw_topic, p_raw_subtopic,
     CASE WHEN p_raw_problem_type IN ('concept','word_problem') THEN p_raw_problem_type ELSE NULL END,
     CASE WHEN p_source IN ('chat','mock','focus') THEN p_source ELSE NULL END,
     p_user_id, left(coalesce(p_context, ''), 500), coalesce(p_taxonomy_version, 1))
  ON CONFLICT (lower(coalesce(raw_topic,'')), lower(coalesce(raw_subtopic,'')))
  DO UPDATE SET
    hit_count        = public.unmapped_detections.hit_count + 1,
    last_seen        = now(),
    last_source      = COALESCE(EXCLUDED.last_source, public.unmapped_detections.last_source),
    last_user_id     = COALESCE(EXCLUDED.last_user_id, public.unmapped_detections.last_user_id),
    raw_problem_type = COALESCE(EXCLUDED.raw_problem_type, public.unmapped_detections.raw_problem_type);
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_unmapped_detection(text,text,text,text,uuid,text,smallint)
  TO authenticated, service_role;

-- ── Rollback ──
-- DROP FUNCTION IF EXISTS public.log_unmapped_detection(text,text,text,text,uuid,text,smallint);
