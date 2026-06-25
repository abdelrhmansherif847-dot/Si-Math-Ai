#!/usr/bin/env node
/**
 * gen-registry-seed.mjs — generate the canonical taxonomy registry migration
 * from the single source (taxonomy.core.js), so the DB registry never drifts
 * from the code taxonomy.
 *
 *   taxonomy.core.js  →  supabase/migrations/20260625_taxv1_m1_taxonomy_registry.sql
 *
 * The registry tables back topic_id / subtopic_id with real rows so FK
 * constraints can be added in a later phase. Seed uses ON CONFLICT (id) DO
 * UPDATE of display_name only — IDs are permanent and never rewritten.
 * Re-run after editing taxonomy.core.js.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const T = require(resolve(root, 'taxonomy.core.js'));
const OUT = resolve(root, 'supabase/migrations/20260625_taxv1_m1_taxonomy_registry.sql');

const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";
const v = T.TAXONOMY_VERSION;

const topicRows = T.TOPICS.map((t) => `  (${q(t.id)}, ${q(t.displayName)}, ${v})`).join(',\n');
const subRows = T.SUBTOPICS.map((s) => `  (${q(s.id)}, ${q(s.topicId)}, ${q(s.displayName)}, ${v})`).join(',\n');

const sql = `-- ============================================================================
-- Phase 2 · M1 — canonical taxonomy registry (AUTO-GENERATED from taxonomy.core.js
-- by scripts/gen-registry-seed.mjs — DO NOT EDIT BY HAND; re-generate instead).
--
-- Backs topic_id / subtopic_id with real rows so FOREIGN KEY constraints can be
-- added in a later phase (deferred until after MIG-B backfill, per design). IDs
-- are PERMANENT: the seed updates display_name on conflict but never rewrites ids.
-- Additive & isolated. NOT YET APPLIED — awaiting individual approval.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.taxonomy_topics (
  id               text PRIMARY KEY,
  display_name     text     NOT NULL,
  taxonomy_version smallint NOT NULL DEFAULT 1,
  is_active        boolean  NOT NULL DEFAULT true,
  CONSTRAINT taxonomy_topics_version_chk CHECK (taxonomy_version > 0)
);

CREATE TABLE IF NOT EXISTS public.taxonomy_subtopics (
  id               text PRIMARY KEY,
  topic_id         text     NOT NULL REFERENCES public.taxonomy_topics(id),
  display_name     text     NOT NULL,
  taxonomy_version smallint NOT NULL DEFAULT 1,
  is_active        boolean  NOT NULL DEFAULT true,
  CONSTRAINT taxonomy_subtopics_version_chk CHECK (taxonomy_version > 0)
);

INSERT INTO public.taxonomy_topics (id, display_name, taxonomy_version) VALUES
${topicRows}
ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name;

INSERT INTO public.taxonomy_subtopics (id, topic_id, display_name, taxonomy_version) VALUES
${subRows}
ON CONFLICT (id) DO UPDATE SET display_name = EXCLUDED.display_name, topic_id = EXCLUDED.topic_id;

-- ── Rollback ──
-- DROP TABLE IF EXISTS public.taxonomy_subtopics;
-- DROP TABLE IF EXISTS public.taxonomy_topics;
`;

writeFileSync(OUT, sql);
console.log('wrote', OUT.replace(root + '/', ''), `(${T.TOPICS.length} topics, ${T.SUBTOPICS.length} subtopics)`);
