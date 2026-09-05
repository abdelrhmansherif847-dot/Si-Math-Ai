// Registry access for the DSAT Question Knowledge Base.
//
// FOUR STORES, all JSON, all inside the repository, none containing question
// text:
//   sources.json     one row per ingested PDF, with its hash and provenance
//   questions.json   one coded record per question — metadata and fingerprints
//   archetypes.json  reusable constructions, defined by how they are built
//   conflicts.json   everything unresolved, never silently closed
//
// THE CORPUS IS SOMEWHERE ELSE. Question text, page images and extracted OCR
// live under CORPUS_ROOT, outside the repository, keyed by the source hash.
// That split is the whole copyright posture: the repository learns the
// construction logic, the corpus holds the copyrighted material, and the two
// are joined by a hash rather than by copying.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const REGISTRY_DIR = join(here, 'registry');
export const REPO_ROOT = join(here, '..', '..');

// Outside the repository, deliberately. Override with DSAT_CORPUS_ROOT.
export const CORPUS_ROOT = process.env.DSAT_CORPUS_ROOT
  || join(process.env.SCRATCHPAD || '/tmp/claude-0/-home-user-Si-Math-Ai/04b11b7c-9e5a-5d76-8bd0-64a172a5c12c/scratchpad', 'dsat-corpus');

export const STORES = {
  sources: { file: 'sources.json', key: 'sources' },
  questions: { file: 'questions.json', key: 'questions' },
  archetypes: { file: 'archetypes.json', key: 'archetypes' },
  conflicts: { file: 'conflicts.json', key: 'conflicts' },
};

export function load(name) {
  const s = STORES[name];
  if (!s) throw new Error(`unknown store: ${name}`);
  const path = join(REGISTRY_DIR, s.file);
  if (!existsSync(path)) return { schema_version: 1, [s.key]: [] };
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function save(name, data) {
  const s = STORES[name];
  if (!existsSync(REGISTRY_DIR)) mkdirSync(REGISTRY_DIR, { recursive: true });
  writeFileSync(join(REGISTRY_DIR, s.file), JSON.stringify(data, null, 2) + '\n');
}

export const rows = name => load(name)[STORES[name].key] ?? [];

// ── archetypes ───────────────────────────────────────────────────────────────
// An archetype is a CONSTRUCTION, not a topic. These eight fields are the
// brief's own list, and an archetype missing any of them is not one — it is a
// topic label wearing an id. The validator enforces that.
export const ARCHETYPE_FIELDS = [
  'given',                 // what the item hands the solver
  'find',                  // what it asks for
  'transformation',        // what must be done to get from one to the other
  'hidden_relationship',   // what link is not surface-visible ('none' is allowed)
  'representation',        // the form it arrives in
  'wrong_route',           // the route a student plausibly takes instead
  'distractor_basis',      // why the wrong options are believable
  'cognitive_demand',      // what actually makes it demanding
];

// ── conflicts ────────────────────────────────────────────────────────────────
export function conflictId(kind, n) {
  return `${kind.split('_')[0].slice(0, 3).toUpperCase()}-${String(n).padStart(4, '0')}`;
}

// ── id allocation ────────────────────────────────────────────────────────────
export function nextSourceId(existing = rows('sources')) {
  const used = new Set(existing.map(s => s.source_id));
  for (let i = 1; i < 1000; i++) {
    const id = `S-${String(i).padStart(3, '0')}`;
    if (!used.has(id)) return id;
  }
  throw new Error('source id space exhausted');
}

export const questionId = (sourceId, page, n) =>
  `Q-${sourceId.replace(/^S-/, '')}-p${page}-q${n}`;
