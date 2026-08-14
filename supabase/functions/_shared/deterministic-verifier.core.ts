// ═══════════════════════════════════════════════════════════════════════════
// deterministic-verifier.core.ts — Verdict Pilot, P4
// ═══════════════════════════════════════════════════════════════════════════
// The provider-independent contract a future deterministic verifier implements:
//
//     CANDIDATE ANSWER + ORIGINAL QUESTION / STRUCTURED PROBLEM
//                            |
//                     DETERMINISTIC VERIFIER
//                            |
//                    VERIFICATION EVIDENCE
//
// There is no SymPy, no CAS, no Python, no subprocess, no container and no
// external service here, and no dependency was installed. This file is the
// shape those will fill, plus a table-lookup stub that performs NO MATHEMATICS
// AT ALL and exists only to prove the contract carries what it claims to.
//
// ───────────────────────────────────────────────────────────────────────────
// THE SENTENCE THE WHOLE PHASE TURNS ON
//
//   A verifier reporting `verified` means ONE DETERMINISTIC CHECK SUCCEEDED FOR
//   ONE CANDIDATE. It does not mean the item's verdict is VERIFIED.
//
// Those are different words in different modules on purpose. The lowercase
// outcome lives here; the uppercase verdict state lives in verdict-state.core.ts
// and this file does not import it — so a verifier cannot name a verdict, let
// alone assign one. A verifier's output is EVIDENCE for a later layer, and that
// layer's authority is not delegated backwards to whoever produced the input.
//
// ───────────────────────────────────────────────────────────────────────────
// SUPPORT AND OUTCOME ARE TWO AXES, AND THAT IS THE SAFETY PROPERTY
//
// The dangerous failure is a verifier that COULD NOT RUN being read as a
// verifier that AGREED. So support is asked separately from outcome, and
// buildVerificationResult enforces the relationship rather than documenting it:
//
//   unsupported          -> outcome is forced to `not_attempted`, evidence is
//                           dropped, and a reason is required. No path through
//                           this constructor turns an absent check into
//                           `verified`, including one that explicitly asks for it.
//   supported, silent    -> `inconclusive`. Silence is not success.
//   supported, unknown   -> `inconclusive`. An outcome nobody recognizes is not
//                           a pass.
//   no candidate         -> `insufficient_information`. There was nothing to check.
//   no subject           -> `insufficient_information`. There was nothing to check it against.
//
// Every non-decisive outcome carries a reason, so a reader can always ask why
// verification did not happen and get an answer.
//
// ───────────────────────────────────────────────────────────────────────────
// INDEPENDENCE, ENFORCED BY THE TYPE
//
// The request carries the question and the candidate. There is deliberately no
// field for what other models said, how many there were, or what they agreed
// on — a verifier that could see those would be contaminated by them, and
// "the verifier contradicts every model" would stop being evidence and start
// being an echo. A later phase wanting cross-examination must add a parameter
// here, in the open.
//
// This is also why the count of models never appears: it is not an input. The
// contract is identical whether zero models or five produced the candidate.
//
// ───────────────────────────────────────────────────────────────────────────
// OFFLINE. Imports nothing. No clock, no randomness, no I/O, no environment
// read, no throw. Nothing in the deployed bundle imports this file.

/** Whether this verifier handles this problem at all. Asked separately from
 *  the outcome so that "could not run" can never be read as "agreed". */
export type VerifierSupport = 'supported' | 'unsupported';

/** What the check concluded.
 *
 *  `verified` and `contradicted` are the decisive pair. `inconclusive` ran and
 *  did not conclude, `insufficient_information` lacked an input, and
 *  `not_attempted` is reserved for the unsupported path — it is the only
 *  outcome that means no check took place. */
export type VerifierOutcome =
  | 'verified'
  | 'contradicted'
  | 'inconclusive'
  | 'insufficient_information'
  | 'not_attempted';

export const VERIFIER_SUPPORT: VerifierSupport[] = ['supported', 'unsupported'];
export const VERIFIER_OUTCOMES: VerifierOutcome[] = [
  'verified', 'contradicted', 'inconclusive', 'insufficient_information', 'not_attempted',
];

/** Who checked, which build of them, and how.
 *
 *  `version` is not decoration: a verifier that is fixed must be a different
 *  verifier as far as every downstream record and cache is concerned, or it
 *  serves its own old defect forever. */
export interface VerifierIdentity {
  verifier_id: string;
  version: string;
  method: string;
}

/** What is being verified. The question, and a structured interpretation of it
 *  when one exists — never another model's answer. */
export interface VerificationSubject {
  item_id?: string | null;
  question_text?: string | null;
  choices?: string[] | null;
  interpretation?: unknown;
  interpretation_version?: string | null;
}

/** One verification request: a subject, and the single candidate to check
 *  against it. `candidate_source` is provenance — where the candidate came
 *  from — and confers no authority whatsoever. */
export interface VerificationRequest {
  subject?: VerificationSubject | null;
  candidate?: string | null;
  candidate_source?: string | null;
  policy_version?: string | null;
}

/** What a verifier implementation hands to the constructor. Everything is
 *  optional because the constructor's job is to make a well-formed, honest
 *  result out of whatever it is given. */
export interface VerifierReport {
  support?: VerifierSupport;
  outcome?: VerifierOutcome;
  method?: string;
  evidence?: unknown;
  reason?: string | null;
}

/** Evidence produced by one verifier about one candidate.
 *
 *  Provenance is not optional and is present on every path, including the ones
 *  where nothing was checked — otherwise a reader of an unsupported result
 *  cannot tell what it was that went unverified.
 *
 *  There is deliberately no verdict, no confidence and no score. A number here
 *  would be summable, and summable is one refactor away from a vote. */
export interface VerificationResult {
  verifier: VerifierIdentity;
  support: VerifierSupport;
  outcome: VerifierOutcome;
  candidate: string | null;
  candidate_source: string | null;
  subject: {
    item_id: string | null;
    question_text_canonical: string;
    choices_canonical: string[] | null;
    interpretation_present: boolean;
    interpretation_version: string | null;
  };
  method: string;
  evidence: unknown;
  reason: string | null;
  policy_version: string | null;
}

/** A substitutable deterministic verifier. Implementations differ wildly; this
 *  does not. Async because a later implementation will run out of process. */
export interface DeterministicVerifier {
  identity: VerifierIdentity;
  verify(request: VerificationRequest): Promise<VerificationResult>;
}

// ───────────────────────────────────────────────────────────────────────────
// CANONICALIZATION
//
// P4's single definition of "the same string", used by the verifier, the verdict
// contract and the item key alike. One definition rather than three copies is
// the point: if these ever disagree, a cached result can be served for an item
// the dispute logic considers different.

/** Identity of a piece of TEXT. Whitespace is presentation and is collapsed;
 *  case is NOT — X and x can be different variables, and over-splitting costs a
 *  cache miss while under-splitting verifies the wrong item. */
export function canonicalizeText(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = typeof v === 'string' ? v : String(v);
  return s.normalize('NFC').replace(/[−–—]/g, '-').replace(/\s+/g, ' ').trim();
}

/** Literal identity of an ANSWER. Case-folded and stripped of a trailing full
 *  stop, because "Seven." and "seven" are one answer — but nothing numeric or
 *  symbolic is attempted, because deciding that 9/4 and 2.25 are one answer is
 *  interpretation and belongs to a later stage. */
export function canonicalizeAnswer(v: unknown): string {
  return canonicalizeText(v).toLowerCase().replace(/\.+$/, '').trim();
}

const text = (v: unknown): string => (typeof v === 'string' ? v : '');
const named = (v: unknown): string | null =>
  (typeof v === 'string' && v.trim().length > 0) ? v : null;

/** Turn one verifier's report into a well-formed result, enforcing every
 *  invariant that keeps an absent check from reading as a successful one.
 *
 *  Total: any input, however malformed, yields a result rather than a throw —
 *  one bad item must not take down a batch. */
export function buildVerificationResult(
  identity: VerifierIdentity | null | undefined,
  request: VerificationRequest | null | undefined,
  report: VerifierReport | null | undefined,
): VerificationResult {
  const id = (identity && typeof identity === 'object') ? identity : {} as VerifierIdentity;
  const req = (request && typeof request === 'object') ? request : {} as VerificationRequest;
  const rep = (report && typeof report === 'object') ? report : {} as VerifierReport;
  const subj = (req.subject && typeof req.subject === 'object') ? req.subject : {} as VerificationSubject;

  const verifier: VerifierIdentity = {
    verifier_id: text(id.verifier_id),
    version: text(id.version),
    method: text(id.method),
  };
  const subject = {
    item_id: named(subj.item_id),
    question_text_canonical: canonicalizeText(subj.question_text),
    choices_canonical: Array.isArray(subj.choices) ? subj.choices.map(canonicalizeText) : null,
    interpretation_present: subj.interpretation !== null && subj.interpretation !== undefined,
    interpretation_version: named(subj.interpretation_version),
  };
  const candidate = (req.candidate === null || req.candidate === undefined) ? null : String(req.candidate);

  const base = {
    verifier,
    candidate,
    candidate_source: named(req.candidate_source),
    subject,
    method: text(rep.method) || verifier.method,
    policy_version: named(req.policy_version),
  };
  const decided = (
    support: VerifierSupport, outcome: VerifierOutcome, evidence: unknown, reason: string | null,
  ): VerificationResult => ({ ...base, support, outcome, evidence, reason });

  // 1. Unsupported wins over everything the report claims. A verifier that says
  //    both "I do not handle this" and "verified" is reporting one fact and one
  //    claim, and the fact is that no check happened.
  if (rep.support === 'unsupported') {
    return decided('unsupported', 'not_attempted', null, named(rep.reason) ?? 'unsupported_by_verifier');
  }

  // 2. Nothing to check against.
  if (!subject.question_text_canonical && !subject.interpretation_present) {
    return decided('supported', 'insufficient_information', null, 'subject_question_text_absent');
  }

  // 3. Nothing to check.
  if (candidate === null || candidate.trim() === '') {
    return decided('supported', 'insufficient_information', null, 'no_candidate_supplied');
  }

  // 4. Silence, and anything unrecognized, is inconclusive — never a pass.
  const reported = rep.outcome;
  if (reported === null || reported === undefined) {
    return decided('supported', 'inconclusive', null, 'no_outcome_reported');
  }
  if (!VERIFIER_OUTCOMES.includes(reported)) {
    return decided('supported', 'inconclusive', null, 'unrecognized_outcome_reported');
  }
  if (reported === 'not_attempted') {
    return decided('supported', 'inconclusive', null, 'reported_not_attempted_while_supported');
  }

  // 5. A decisive outcome needs no excuse; a non-decisive one always states its
  //    reason, so "why is this not settled" is answerable from the record.
  if (reported === 'verified' || reported === 'contradicted') {
    return decided('supported', reported, rep.evidence ?? null, named(rep.reason));
  }
  if (reported === 'inconclusive') {
    return decided('supported', 'inconclusive', rep.evidence ?? null, named(rep.reason) ?? 'inconclusive_unspecified');
  }
  return decided('supported', 'insufficient_information', null, named(rep.reason) ?? 'insufficient_information_unspecified');
}

interface TableRow {
  item_id: string;
  candidate: string;
  outcome: VerifierOutcome;
  evidence?: unknown;
  reason?: string | null;
  method?: string;
}

/** A deterministic verifier that looks up committed answers in a table.
 *
 *  IT PERFORMS NO MATHEMATICS. It solves nothing, checks nothing and knows
 *  nothing about the problem; it replays what a fixture already said, exactly
 *  the way P1's replay engine does. It exists to prove the contract carries the
 *  shape — never to stand in for a real verifier, and never to be read as one.
 *
 *  An item outside `supported_items` is unsupported. A supported item with no
 *  row is inconclusive with a stated reason: absence of an entry is absence of
 *  evidence, never agreement. */
export function createTableVerifier(
  identity: VerifierIdentity,
  table: TableRow[] | null | undefined,
  options?: { supported_items?: string[] | null } | null,
): DeterministicVerifier {
  const supported = new Set(
    (options && Array.isArray(options.supported_items) ? options.supported_items : []).map(String),
  );
  const rowKey = (item: unknown, candidate: unknown) => `${text(item)} ${canonicalizeAnswer(candidate)}`;
  const rows = new Map<string, TableRow>();
  for (const r of (Array.isArray(table) ? table : [])) {
    if (r && typeof r === 'object') rows.set(rowKey(r.item_id, r.candidate), r);
  }

  return {
    identity: { ...identity },
    verify(request: VerificationRequest): Promise<VerificationResult> {
      const req = (request && typeof request === 'object') ? request : {} as VerificationRequest;
      const subj = (req.subject && typeof req.subject === 'object') ? req.subject : {} as VerificationSubject;
      const item = named(subj.item_id);

      if (!item || !supported.has(item)) {
        return Promise.resolve(
          buildVerificationResult(identity, req, { support: 'unsupported', reason: 'unsupported_item_class' }),
        );
      }
      const row = rows.get(rowKey(item, req.candidate));
      if (!row) {
        return Promise.resolve(buildVerificationResult(identity, req, {
          support: 'supported', outcome: 'inconclusive', reason: 'no_table_entry',
        }));
      }
      return Promise.resolve(buildVerificationResult(identity, req, {
        support: 'supported', outcome: row.outcome,
        evidence: row.evidence, reason: row.reason ?? null, method: row.method,
      }));
    },
  };
}
