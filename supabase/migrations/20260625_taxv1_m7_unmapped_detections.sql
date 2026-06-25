-- ============================================================================
-- Phase 2 · M7 — unmapped_detections (frequency + analytics)
-- Canonical Taxonomy: detections that do not resolve to a canonical id are
-- logged here (NEVER stored as a guessed topic/subtopic). Upsert-on-raw keeps a
-- frequency count so aliases can be prioritized. Additive & isolated.
-- NOT YET APPLIED — awaiting individual approval.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.unmapped_detections (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_topic         text,
  raw_subtopic      text,
  raw_problem_type  text,
  hit_count         integer     NOT NULL DEFAULT 1,
  first_seen        timestamptz NOT NULL DEFAULT now(),
  last_seen         timestamptz NOT NULL DEFAULT now(),
  last_source       text,                  -- 'chat' | 'mock' | 'focus'
  last_user_id      uuid,
  context_excerpt   text,
  taxonomy_version  smallint    NOT NULL DEFAULT 1,
  reviewed_at       timestamptz,
  resolved_alias_id text                   -- canonical id an alias was later mapped to
);

-- Upsert key: one row per distinct (raw_topic, raw_subtopic), case-insensitive.
CREATE UNIQUE INDEX IF NOT EXISTS ux_unmapped_raw
  ON public.unmapped_detections (lower(coalesce(raw_topic,'')), lower(coalesce(raw_subtopic,'')));

-- Triage queue ordering: most frequent, least recently reviewed first.
CREATE INDEX IF NOT EXISTS ix_unmapped_triage
  ON public.unmapped_detections (reviewed_at NULLS FIRST, hit_count DESC);

-- RLS: writers (chat/mock/focus) insert; edge writes via service role (bypasses RLS).
-- SELECT is intentionally NOT granted here — admin read policy is decided with the
-- admin panel work (Phase 5) so we do not over-expose raw student strings now.
ALTER TABLE public.unmapped_detections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS unmapped_insert_authenticated ON public.unmapped_detections;
CREATE POLICY unmapped_insert_authenticated
  ON public.unmapped_detections FOR INSERT TO authenticated
  WITH CHECK (true);

-- ── Rollback ──
-- DROP TABLE IF EXISTS public.unmapped_detections;
