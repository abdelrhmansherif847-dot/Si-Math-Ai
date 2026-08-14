// ═══════════════════════════════════════════════════════════════════════════
// verification-cache-key.core.ts — Verdict Pilot, P4
// ═══════════════════════════════════════════════════════════════════════════
// A deterministic, content-addressed key for future item-level verification
// caching. THIS IS THE KEY CONTRACT ONLY. There is no table, no schema change,
// no stored data and no cache — nothing here reads or writes anything. It exists
// so that when caching is built, the identity question is already settled and
// not decided in a hurry by whoever builds it.
//
// ───────────────────────────────────────────────────────────────────────────
// THE ASYMMETRY THAT DECIDES EVERY CHOICE HERE
//
//   OVER-SPLITTING costs a cache miss.
//   UNDER-SPLITTING serves a stale verification for a DIFFERENT item — a wrong
//   answer delivered to a student with a verifier's authority behind it.
//
// So every doubt resolves toward splitting:
//
//   CASE IS PART OF THE QUESTION. X and x can be different variables.
//   CHOICE ORDER IS PART OF THE KEY. Reordering the options changes what "C"
//     means, so the same question with shuffled choices is a different
//     verification — this is Q79's failure mode reaching the cache layer.
//   THE VERIFIER'S VERSION IS IN THE KEY. Without it, a verifier that has been
//     fixed serves its own old defect out of cache forever.
//   THE POLICY VERSION IS IN THE KEY. Changing what verification MEANS must
//     invalidate what it previously concluded.
//
// ───────────────────────────────────────────────────────────────────────────
// WHAT THE KEY MUST NOT SEE, AND WHY IT STRUCTURALLY CANNOT
//
// Timestamps, student identity, session identity, request metadata, execution
// order, retry counts, randomness — none of these change what verification is
// being asked, and a key that included any of them would miss on every request
// while looking like it worked.
//
// They are excluded STRUCTURALLY, not carefully: the material is assembled from
// CACHE_KEY_FIELDS, an explicit allow-list. An undeclared property on the input
// is not filtered out — it is never read. Nothing here stringifies the input
// object, because that is exactly how mutable request metadata leaks into an
// identity that was supposed to be content-addressed.
//
// The count of models and the order they ran in need no defending at all: there
// is no such input. This key describes THE ITEM AND THE VERIFIER, never the
// models — which is why it is equally valid at N = 0 and N = 5 without
// mentioning either.
//
// ───────────────────────────────────────────────────────────────────────────
// THE MATERIAL IS THE CONTRACT; THE DIGEST IS A HANDLE
//
// cacheKeyMaterial returns the full canonical pre-image: inspectable,
// collision-free and diffable when two items that should share a key do not.
// verificationCacheKey hashes it to a fixed width for use as an identifier.
// Every field is length-prefixed, so no value can impersonate a field boundary
// — without that, ["a","b"] and ["a|b"] are one cache entry.
//
// The digest is FNV-1a/64: a content-addressing function, NOT a security
// primitive, and nothing here depends on it being one. Swapping in SHA-256
// later changes the digest and not the material, which is why the material is
// the part that must stay stable.
//
// OFFLINE. One type-only import, no clock, no randomness, no I/O, no throw;
// nothing in the deployed bundle imports this file.

import type { VerifierIdentity } from './deterministic-verifier.core.ts';
import { canonicalizeText } from './deterministic-verifier.core.ts';

/** Everything that is part of a verification's identity. The verifier and the
 *  policy are as much a part of it as the question: the same item checked by a
 *  different build, or under a different definition of verification, is a
 *  different verification. */
export interface CacheKeyInput {
  source_id?: string | null;
  question_text?: string | null;
  choices?: string[] | null;
  interpretation?: unknown;
  interpretation_version?: string | null;
  verifier?: VerifierIdentity | null;
  policy_version?: string | null;
}

/** The allow-list, in material order. Exported so a suite can assert against
 *  the declaration itself, and so that adding a field to the key is a visible
 *  edit here rather than an incidental consequence of touching the builder. */
export const CACHE_KEY_FIELDS: string[] = [
  'policy',
  'verifier_id',
  'verifier_version',
  'verifier_method',
  'source_id',
  'question',
  'choices',
  'interpretation_version',
  'interpretation',
];

const FORMAT = 'vk1';

/** JSON with object keys sorted recursively, so that key order — which is not
 *  information — cannot split one item into two cache entries. Array order IS
 *  information and is preserved. */
export function stableStringify(v: unknown): string {
  if (v === undefined) return 'null';
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  const obj = v as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

/** Choices, length-prefixed element by element.
 *
 *  A free-response item (no choice list) is marked distinctly from an item with
 *  an empty one: those are different statements about the item, and collapsing
 *  them would be under-splitting. */
function choiceMaterial(choices: unknown): string {
  if (!Array.isArray(choices)) return '-';
  let out = '';
  for (const c of choices) {
    const t = canonicalizeText(c);
    out += `${t.length}:${t}`;
  }
  return out;
}

/** The canonical pre-image of the key: one declared field per line, each
 *  length-prefixed so no value can forge a boundary and share another item's
 *  entry. Pure and total. */
export function cacheKeyMaterial(input?: CacheKeyInput | null): string {
  const src = (input && typeof input === 'object') ? input : {};
  const ver = (src.verifier && typeof src.verifier === 'object') ? src.verifier : {} as VerifierIdentity;
  const hasInterpretation = src.interpretation !== null && src.interpretation !== undefined;

  const values: Record<string, string> = {
    policy: canonicalizeText(src.policy_version),
    verifier_id: canonicalizeText(ver.verifier_id),
    verifier_version: canonicalizeText(ver.version),
    verifier_method: canonicalizeText(ver.method),
    source_id: canonicalizeText(src.source_id),
    question: canonicalizeText(src.question_text),
    choices: choiceMaterial(src.choices),
    interpretation_version: canonicalizeText(src.interpretation_version),
    interpretation: hasInterpretation ? stableStringify(src.interpretation) : '',
  };

  const lines = [FORMAT];
  for (const field of CACHE_KEY_FIELDS) {
    const v = values[field] ?? '';
    lines.push(`${field}=${v.length}:${v}`);
  }
  return lines.join('\n');
}

const OFFSET = 0xcbf29ce484222325n;
const PRIME = 0x100000001b3n;
const MASK = 0xffffffffffffffffn;

/** FNV-1a/64 over UTF-16 code units, low byte first. Deterministic in Deno, in
 *  Node and in the browser, with no dependency — which is what lets the same
 *  bytes produce the same key everywhere this repo runs. Not a security
 *  primitive and never used as one. */
function digest(s: string): string {
  let h = OFFSET;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h = ((h ^ BigInt(c & 0xff)) * PRIME) & MASK;
    h = ((h ^ BigInt((c >> 8) & 0xff)) * PRIME) & MASK;
  }
  return h.toString(16).padStart(16, '0');
}

/** The fixed-width handle for one verification's identity.
 *
 *  Stable for the same verification-relevant inputs, different when any of them
 *  differs, and blind to everything else because everything else is not read. */
export function verificationCacheKey(input?: CacheKeyInput | null): string {
  return `${FORMAT}_${digest(cacheKeyMaterial(input))}`;
}
