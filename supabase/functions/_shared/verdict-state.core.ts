// ═══════════════════════════════════════════════════════════════════════════
// verdict-state.core.ts — Verdict Pilot, P4
// ═══════════════════════════════════════════════════════════════════════════
// The vocabulary and the container a later phase will need in order to express
// a verdict — and nothing that decides one.
//
// P4 IMPLEMENTS NO VERDICT SELECTION. No code here derives a state from how
// many models answered, from whether they agreed, from a verifier's outcome or
// from anything else. `createVerdictEnvelope` is a recorder whose `state` is
// always null, and `withVerdictState` carries a state a later phase has already
// chosen — it chooses nothing itself, and refuses to record an assignment whose
// author is not named.
//
// The purpose is representability. Six states must be expressible today so that
// a later phase does not have to redesign the data model to say them:
//
//   VERIFIED · HIGH_CONFIDENCE · LOW_CONFIDENCE · AMBIGUOUS ·
//   INSUFFICIENT_INFORMATION · ITEM_DISPUTED
//
// ───────────────────────────────────────────────────────────────────────────
// THE CASE THIS CONTRACT EXISTS FOR
//
// A deterministic verifier contradicts a candidate that every model agreed on.
//
// A majority vote resolves that by promoting the models — which is precisely
// how a correlated error becomes truth, and P3's UNANIMOUS-WRONG-1 exists to
// show the shape. A verifier-always-wins rule resolves it the other way, which
// assumes the verifier's interpretation of the problem was right; a verifier
// checking a misread question is confidently wrong in exactly the same way.
//
// BOTH ARE DECISIONS, AND P4 MAKES NEITHER. It records a dispute holding both
// sides in full, with `resolution: null` and `resolved_by: null`, and leaves it
// open. Nothing in the structure privileges either side: no weight, no order of
// precedence, no flag. Deciding is a later phase's job, and it will have to do
// it in the open.
//
// ───────────────────────────────────────────────────────────────────────────
// A DISPUTE IS OBSERVED, NEVER INFERRED
//
// Only an explicit `contradicted` outcome creates one, and only when some model
// actually stated the candidate that was contradicted. "The verifier verified X,
// therefore Y is wrong" is an inference this layer must not make: X and Y may be
// two renderings of one answer, and deciding that is interpretation.
//
// ───────────────────────────────────────────────────────────────────────────
// COUNT-AGNOSTIC, inherited from P2/P3. The engine count is provenance — who
// observed what — and is never allowed to become confidence, sufficiency,
// quality or truth. A verifier contradicting one model and a verifier
// contradicting five produce the same structure, equally unresolved. There is
// no expected count, no minimum and no threshold, because "how many is enough"
// is a routing question and encoding it here would put escalation policy in the
// verdict layer.
//
// OFFLINE. Type-only imports plus one canonicalizer, no clock, no randomness,
// no I/O, no throw; nothing in the deployed bundle imports this file.

import type { EvidenceRecord } from './evidence-builder.core.ts';
import type { VerificationResult } from './deterministic-verifier.core.ts';
import { canonicalizeAnswer } from './deterministic-verifier.core.ts';

/** The verdict vocabulary. Declared once and exported so a later phase — and a
 *  suite — can check against the declaration rather than re-guessing it. */
export type VerdictState =
  | 'VERIFIED'
  | 'HIGH_CONFIDENCE'
  | 'LOW_CONFIDENCE'
  | 'AMBIGUOUS'
  | 'INSUFFICIENT_INFORMATION'
  | 'ITEM_DISPUTED';

export const VERDICT_STATES: VerdictState[] = [
  'VERIFIED', 'HIGH_CONFIDENCE', 'LOW_CONFIDENCE',
  'AMBIGUOUS', 'INSUFFICIENT_INFORMATION', 'ITEM_DISPUTED',
];

/** Vocabulary check only. It says whether a string is a state, never which
 *  state anything should be. */
export function isVerdictState(v: unknown): v is VerdictState {
  return typeof v === 'string' && (VERDICT_STATES as string[]).includes(v);
}

/** One side of a dispute, as the models stated it. `engines` is who said it —
 *  provenance, not strength. There is no count field, because a count here
 *  would be one refactor away from a vote. */
export interface DisputeModelSide {
  value: string;
  engines: string[];
  evidence_type: string;
  field: string;
}

/** One side of a dispute, as a verifier reported it. */
export interface DisputeVerifierSide {
  verifier_id: string;
  version: string;
  method: string;
  outcome: string;
  evidence: unknown;
}

/** An open conflict between a deterministic check and what the models said.
 *
 *  `resolution` and `resolved_by` exist and are always null in P4. They are the
 *  slot a later phase fills, kept visible so that resolving is an explicit act
 *  with an author rather than something that quietly happened. */
export interface DisputeRecord {
  kind: 'VERIFIER_CONTRADICTS_MODEL_ANSWER';
  candidate: string;
  verifier_side: DisputeVerifierSide[];
  model_side: DisputeModelSide[];
  resolution: null;
  resolved_by: null;
  basis: string;
}

/** Everything known about one item's verification, with no conclusion drawn.
 *
 *  Both evidence sets are carried in full and neither is summarized, because a
 *  summary is where a decision hides. */
export interface VerdictEnvelope {
  state: VerdictState | null;
  state_assigned_by: string | null;
  state_basis: string | null;
  unassigned_reason: string | null;
  policy_version: string | null;
  model_evidence: EvidenceRecord[];
  verifier_results: VerificationResult[];
  disputes: DisputeRecord[];
}

const UNASSIGNED = 'verdict_selection_not_implemented_in_p4';

/** Copy so a caller mutating what it passed in cannot retroactively edit what
 *  was recorded. Falls back to a shallow copy for anything not plain data. */
function copyOf<T>(list: unknown): T[] {
  if (!Array.isArray(list)) return [];
  try {
    return JSON.parse(JSON.stringify(list)) as T[];
  } catch {
    return list.slice() as T[];
  }
}

const asString = (v: unknown): string => (typeof v === 'string' ? v : '');
const named = (v: unknown): string | null =>
  (typeof v === 'string' && v.trim().length > 0) ? v : null;

/** Every way the models stated a given canonical answer.
 *
 *  Aggregate agreement records AND individual observations are both collected,
 *  with no branch between them. Preferring one when the other is present would
 *  be a branch on how many models there were, and the count is not allowed to
 *  change what gets recorded. */
function modelSideFor(evidence: EvidenceRecord[], key: string): DisputeModelSide[] {
  const out: DisputeModelSide[] = [];
  for (const r of evidence) {
    if (!r || typeof r !== 'object') continue;

    if (r.type === 'RAW_ANSWER_AGREEMENT' || r.type === 'CHOICE_AGREEMENT') {
      if (canonicalizeAnswer(r.observed) === key) {
        out.push({
          value: String(r.observed), engines: (r.engines ?? []).slice(),
          evidence_type: r.type, field: asString((r.fields ?? [])[0]),
        });
      }
      continue;
    }

    if (r.type === 'ENGINE_OBSERVATION' && r.observed && typeof r.observed === 'object') {
      const o = r.observed as Record<string, unknown>;
      for (const field of ['raw_answer', 'choice_letter']) {
        const v = o[field];
        if (v !== null && v !== undefined && canonicalizeAnswer(v) === key) {
          out.push({
            value: String(v), engines: (r.engines ?? []).slice(),
            evidence_type: r.type, field,
          });
          break;
        }
      }
    }
  }
  return out.sort((a, b) => {
    const ka = `${a.evidence_type} ${a.field} ${canonicalizeAnswer(a.value)} ${a.engines.join(',')}`;
    const kb = `${b.evidence_type} ${b.field} ${canonicalizeAnswer(b.value)} ${b.engines.join(',')}`;
    return ka === kb ? 0 : (ka < kb ? -1 : 1);
  });
}

/** Record everything known about one item, and conclude nothing.
 *
 *  Pure and total. `state` is always null: this function has no branch that can
 *  produce any other value, which is the property the suite exists to hold in
 *  place. */
export function createVerdictEnvelope(
  input?: {
    model_evidence?: EvidenceRecord[] | null;
    verifier_results?: VerificationResult[] | null;
    policy_version?: string | null;
  } | null,
): VerdictEnvelope {
  const src = (input && typeof input === 'object') ? input : {};
  const modelEvidence = copyOf<EvidenceRecord>(src.model_evidence);
  const verifierResults = copyOf<VerificationResult>(src.verifier_results);

  // Group contradictions by the canonical candidate, so two verifiers objecting
  // to the same answer are one dispute rather than two, and neither becomes
  // authoritative by being passed first.
  const byCandidate = new Map<string, VerificationResult[]>();
  for (const vr of verifierResults) {
    if (!vr || typeof vr !== 'object' || vr.outcome !== 'contradicted') continue;
    const key = canonicalizeAnswer(vr.candidate);
    if (!key) continue;
    const bucket = byCandidate.get(key);
    if (bucket) bucket.push(vr);
    else byCandidate.set(key, [vr]);
  }

  const disputes: DisputeRecord[] = [];
  for (const [key, results] of byCandidate) {
    const modelSide = modelSideFor(modelEvidence, key);
    if (!modelSide.length) continue;      // contradicting what nobody said is not a dispute

    const verifierSide = results.map((vr) => ({
      verifier_id: asString(vr.verifier?.verifier_id),
      version: asString(vr.verifier?.version),
      method: asString(vr.method) || asString(vr.verifier?.method),
      outcome: asString(vr.outcome),
      evidence: vr.evidence ?? null,
    })).sort((a, b) => {
      const ka = `${a.verifier_id} ${a.version} ${a.method}`;
      const kb = `${b.verifier_id} ${b.version} ${b.method}`;
      return ka === kb ? 0 : (ka < kb ? -1 : 1);
    });

    disputes.push({
      kind: 'VERIFIER_CONTRADICTS_MODEL_ANSWER',
      candidate: String(results[0].candidate),
      verifier_side: verifierSide,
      model_side: modelSide,
      resolution: null,
      resolved_by: null,
      basis: 'verifier_contradicted_a_candidate_the_models_stated',
    });
  }
  disputes.sort((a, b) => {
    const ka = canonicalizeAnswer(a.candidate), kb = canonicalizeAnswer(b.candidate);
    return ka === kb ? 0 : (ka < kb ? -1 : 1);
  });

  return {
    state: null,
    state_assigned_by: null,
    state_basis: null,
    unassigned_reason: UNASSIGNED,
    policy_version: named(src.policy_version),
    model_evidence: modelEvidence,
    verifier_results: verifierResults,
    disputes,
  };
}

/** Carry a state a later phase has already chosen.
 *
 *  This function performs no selection: the state arrives as an argument. What
 *  it does enforce is that an assignment is attributable — an unnamed assigner
 *  is refused, so "who decided this, and on what basis" can never be lost. An
 *  unrecognized state is refused for the same reason: vocabulary drift would
 *  make the states unreadable later.
 *
 *  Returns a new envelope; the input is never mutated. */
export function withVerdictState(
  envelope: VerdictEnvelope,
  state: VerdictState | string | null | undefined,
  attribution?: { assigned_by?: string | null; basis?: string | null } | null,
): VerdictEnvelope {
  const base = (envelope && typeof envelope === 'object') ? envelope : createVerdictEnvelope();
  const who = named(attribution && attribution.assigned_by);

  if (!isVerdictState(state)) {
    return { ...base, state: null, state_assigned_by: null, state_basis: null, unassigned_reason: 'unrecognized_state' };
  }
  if (!who) {
    return { ...base, state: null, state_assigned_by: null, state_basis: null, unassigned_reason: 'assigner_not_named' };
  }
  return {
    ...base,
    state,
    state_assigned_by: who,
    state_basis: named(attribution && attribution.basis),
    unassigned_reason: null,
  };
}
