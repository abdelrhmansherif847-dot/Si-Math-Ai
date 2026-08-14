// ═══════════════════════════════════════════════════════════════════════════
// evidence-builder.core.ts — Verdict Pilot, P2
// ═══════════════════════════════════════════════════════════════════════════
// P2 answers one question and no other:
//
//     WHAT EVIDENCE EXISTS IN THE SUBMITTED INDEPENDENT OUTPUTS?
//
// It does not decide truth, publish an answer, pick a winner, score anything or
// hold a verdict. Those belong to later architecture, above this layer.
//
// ───────────────────────────────────────────────────────────────────────────
// THE INFERENCE THAT MUST NOT EXIST HERE
//
//     A says 7 · B says 7 · C says 7   ->   "therefore 7 is true"
//
// Agreement may BE evidence; agreement is never proof. A deterministic verifier
// in a later phase may outweigh unanimous model agreement, so unanimity must
// arrive there as an observation it can overrule — not as a conclusion already
// drawn. UNANIMOUS-WRONG-1 in the fixture is three engines agreeing on a wrong
// value, and the suite proves this module records it without promoting it.
//
// Minority and contradictory outputs are preserved, never collapsed.
//
// ───────────────────────────────────────────────────────────────────────────
// COUNT-AGNOSTIC, AND THAT IS LOAD-BEARING
//
// Future routing starts with one cheap engine and adds another only when the
// evidence is insufficient. So this module is correct at N = 0, 1, 2, 5, and
// the count is never allowed to mean anything:
//
//   ONE ENGINE IS NOT AGREEMENT. Absence of divergence is not agreement.
//   Agreement requires >= 2 engines that ACTUALLY STATED the field. A lone
//   engine recorded as "agreeing" would be corroborated by nobody — the same
//   failure shape as reading silence as confirmation.
//
//   MISSING_OBSERVATION IS ABOUT FIELDS, NOT ENGINES. It marks a field absent
//   inside a submitted output. This module has no notion of a missing engine,
//   no expected count and no minimum: "how many engines are enough" is a
//   routing decision, and encoding it here would put escalation policy in the
//   evidence layer.
//
//   COUNT IS NOT QUALITY. No sufficiency, confidence, strength or escalation
//   signal emerges from having more engines. Every record exposes the same
//   fields at N=1 and N=5.
//
// buildEvidence is a pure function of the CURRENT set. The router escalates by
// calling it again with more outputs; this module never learns that happened,
// holds no accumulator and has no prior-evidence parameter.
//
// ───────────────────────────────────────────────────────────────────────────
// COMPARISON IS LITERAL
//
// Two engines saying "9/4" and "2.25" are recorded as DIVERGENT, with both
// values preserved. Deciding those are the same answer is interpretation, and
// interpretation belongs to a later stage. Nothing is lost: the raw values sit
// in `observed`, so a semantic pass can run later without re-running this one.
//
// When that pass is built it should reuse `answersEquivalent` from
// verification.core.ts rather than reinvent it. It is deliberately NOT imported
// here — that module reads Deno.env at module scope, which would make this file
// unloadable under plain Node and drag the offline pilot toward the deployed
// runtime.
//
// ───────────────────────────────────────────────────────────────────────────
// WHAT THIS FILE DOES NOT CONTAIN
//
// No verdict, no VERIFIED state, no majority voting, no winner selection, no
// confidence, no routing, no escalation, no cost or latency policy, no model
// ranking, no provider names. Offline: imports only P1, and nothing in the
// deployed bundle imports it.

import type { SolverOutput } from './evidence.core.ts';
import { choiceMappingConsistency } from './evidence.core.ts';

/** One engine's submission. The engine label is supplied by the caller — the
 *  router knows which engine it called — because SolverOutput carries provider
 *  and model but no identity of its own, and provider+model cannot distinguish
 *  two engines that differ only by temperature. */
export interface EngineSubmission {
  engine_id: string;
  output: SolverOutput;
}

export type EvidenceType =
  | 'ENGINE_OBSERVATION'
  | 'ENGINE_IDENTITY_CONFLICT'
  | 'MISSING_OBSERVATION'
  | 'MAPPING_CONSISTENCY'
  | 'RAW_ANSWER_AGREEMENT'
  | 'RAW_ANSWER_DIVERGENCE'
  | 'CHOICE_AGREEMENT'
  | 'CHOICE_DIVERGENCE';

/** One evidence record.
 *
 *  Provenance is not optional: `engines` names who produced it, `fields` names
 *  which normalized field it came from, and `basis` names the deterministic
 *  comparison that produced it — so a later resolver can always ask "why does
 *  this evidence exist?" and recover the answer.
 *
 *  There is deliberately no strength or weight. A number here would be summable,
 *  and summable is one refactor away from a vote. Weighting is a resolver
 *  policy, not an observation. */
export interface EvidenceRecord {
  type: EvidenceType;
  engines: string[];
  fields: string[];
  observed: unknown;
  basis: string;
}

/** Explicit ordering. Declared rather than incidental, so output order is a
 *  contract instead of an artifact of how the code happens to run — and
 *  exported so a test can assert against the declaration itself rather than
 *  re-guessing it. */
export const TYPE_ORDER: EvidenceType[] = [
  'ENGINE_OBSERVATION',
  'ENGINE_IDENTITY_CONFLICT',
  'MISSING_OBSERVATION',
  'MAPPING_CONSISTENCY',
  'RAW_ANSWER_AGREEMENT',
  'RAW_ANSWER_DIVERGENCE',
  'CHOICE_AGREEMENT',
  'CHOICE_DIVERGENCE',
];

/** Literal comparison key. Trim, case-fold, drop a trailing full stop, collapse
 *  inner whitespace — presentation noise only. No numeric parsing, no symbolic
 *  work: those are interpretation. */
function literalKey(v: string): string {
  return String(v ?? '').trim().toLowerCase().replace(/\.+$/, '').replace(/\s+/g, ' ');
}

function isUsableId(id: unknown): id is string {
  return typeof id === 'string' && id.trim().length > 0;
}

/** Group the engines that STATED a field, keyed by literal value.
 *  Engines that did not state it are absent from every group — which is what
 *  keeps silence out of both agreement and divergence. */
function groupStated(
  subs: EngineSubmission[], pick: (o: SolverOutput) => string | null,
): Map<string, { value: string; engines: string[] }> {
  const groups = new Map<string, { value: string; engines: string[] }>();
  for (const s of subs) {
    const v = s.output ? pick(s.output) : null;
    if (v === null || v === undefined || String(v).trim() === '') continue;
    const k = literalKey(String(v));
    const g = groups.get(k);
    if (g) g.engines.push(labelOf(s));
    else groups.set(k, { value: String(v), engines: [labelOf(s)] });
  }
  for (const g of groups.values()) g.engines.sort();
  return groups;
}

function labelOf(s: EngineSubmission): string {
  return isUsableId(s.engine_id) ? s.engine_id : '(unidentified)';
}

/** Agreement and divergence for one field, from the engines that stated it.
 *
 *  AGREEMENT needs >= 2 engines sharing a value. DIVERGENCE needs >= 2 distinct
 *  values. With a single stating engine there is neither: nothing to agree with
 *  and nothing to contradict. */
function comparisonRecords(
  subs: EngineSubmission[], field: string,
  pick: (o: SolverOutput) => string | null,
  agreeType: EvidenceType, divergeType: EvidenceType,
): EvidenceRecord[] {
  const groups = [...groupStated(subs, pick).values()]
    .sort((a, b) => (literalKey(a.value) < literalKey(b.value) ? -1 : 1));
  const out: EvidenceRecord[] = [];

  for (const g of groups) {
    if (g.engines.length >= 2) {
      out.push({
        type: agreeType, engines: g.engines.slice(), fields: [field],
        observed: g.value, basis: 'normalized_string_equality',
      });
    }
  }
  if (groups.length >= 2) {
    out.push({
      type: divergeType,
      engines: groups.flatMap((g) => g.engines).sort(),
      fields: [field],
      observed: groups.map((g) => ({ value: g.value, engines: g.engines.slice() })),
      basis: 'normalized_string_inequality',
    });
  }
  return out;
}

/** Build the evidence present in a set of independently produced outputs.
 *
 *  Pure and total: no clock, no randomness, no I/O, no throw. Output is sorted
 *  by an explicit key, so submission order cannot change it — which also means
 *  no engine can become implicitly authoritative by being passed first. */
export function buildEvidence(
  submissions: EngineSubmission[] | null | undefined,
  options?: { choices?: string[] | null } | null,
): EvidenceRecord[] {
  const subs = Array.isArray(submissions) ? submissions.filter((s) => s && typeof s === 'object') : [];
  if (!subs.length) return [];
  const choices = (options && Array.isArray(options.choices)) ? options.choices : null;

  const records: EvidenceRecord[] = [];

  // Per-engine observations, identity problems, absent fields, own mapping.
  const idCounts = new Map<string, number>();
  for (const s of subs) {
    const label = labelOf(s);
    idCounts.set(label, (idCounts.get(label) ?? 0) + 1);
    const o = s.output;

    records.push({
      type: 'ENGINE_OBSERVATION',
      engines: [label],
      fields: ['raw_answer', 'choice_index', 'choice_letter', 'final_answer'],
      observed: {
        provider: o?.provider ?? null, model: o?.model ?? null,
        raw_answer: o?.raw_answer ?? null, choice_index: o?.choice_index ?? null,
        choice_letter: o?.choice_letter ?? null, final_answer: o?.final_answer ?? null,
      },
      basis: 'submitted_output',
    });

    if (!isUsableId(s.engine_id)) {
      records.push({
        type: 'ENGINE_IDENTITY_CONFLICT', engines: [label], fields: ['engine_id'],
        observed: { reason: 'unusable_identity', given: typeof s.engine_id },
        basis: 'identity_check',
      });
    }

    // Absent FIELDS inside a submitted output. Never an absent engine.
    if (!o || o.raw_answer === null) {
      records.push({
        type: 'MISSING_OBSERVATION', engines: [label], fields: ['raw_answer'],
        observed: null, basis: 'field_absent',
      });
    }
    if (choices && (!o || o.choice_letter === null)) {
      records.push({
        type: 'MISSING_OBSERVATION', engines: [label], fields: ['choice_letter'],
        observed: null, basis: 'field_absent',
      });
    }

    if (o) {
      records.push({
        type: 'MAPPING_CONSISTENCY',
        engines: [label], fields: ['raw_answer', 'choice_index'],
        observed: choiceMappingConsistency(o, choices),
        basis: 'choice_index_vs_raw_answer',
      });
    }
  }

  for (const [label, n] of idCounts) {
    if (n > 1) {
      records.push({
        type: 'ENGINE_IDENTITY_CONFLICT', engines: [label], fields: ['engine_id'],
        observed: { reason: 'duplicate_identity', submissions: n },
        basis: 'identity_check',
      });
    }
  }

  // Cross-engine comparisons. Raw answer and choice label are compared
  // SEPARATELY and never merged — a value and a label are different facts, and
  // an engine can be right about one while wrong about the other.
  records.push(...comparisonRecords(subs, 'raw_answer',
    (o) => o.raw_answer, 'RAW_ANSWER_AGREEMENT', 'RAW_ANSWER_DIVERGENCE'));
  records.push(...comparisonRecords(subs, 'choice_letter',
    (o) => o.choice_letter, 'CHOICE_AGREEMENT', 'CHOICE_DIVERGENCE'));

  const rank = (r: EvidenceRecord) => {
    const i = TYPE_ORDER.indexOf(r.type);
    return i === -1 ? TYPE_ORDER.length : i;
  };
  return records.sort((a, b) => {
    if (rank(a) !== rank(b)) return rank(a) - rank(b);
    const ae = a.engines.join(','), be = b.engines.join(',');
    if (ae !== be) return ae < be ? -1 : 1;
    const af = a.fields.join(','), bf = b.fields.join(',');
    if (af !== bf) return af < bf ? -1 : 1;
    const ao = JSON.stringify(a.observed), bo = JSON.stringify(b.observed);
    return ao === bo ? 0 : (ao < bo ? -1 : 1);
  });
}
