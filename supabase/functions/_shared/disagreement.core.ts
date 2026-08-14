// ═══════════════════════════════════════════════════════════════════════════
// disagreement.core.ts — Verdict Pilot, P3
// ═══════════════════════════════════════════════════════════════════════════
// Two offline capabilities, both pure:
//
//   1. a Disagreement Analyzer — classifies WHY outputs differ, from evidence
//   2. correlated-error metrics — measures how far engines fail TOGETHER
//
// P3 observes and classifies. It does not decide truth. Truth, sufficiency,
// escalation, routing, confidence and final verdict authority belong to later
// phases, and none of them exists here.
//
// ───────────────────────────────────────────────────────────────────────────
// THE HONESTY RULE THAT SHAPES THIS FILE
//
// Most disagreement categories cannot be derived from the evidence P1 and P2
// actually produce. Deciding that two engines differ because of an ALGEBRA
// mistake rather than an ARITHMETIC one means reading their prose and judging
// it — a model's opinion, not a deterministic fact. A classifier that guessed
// would produce confident labels with nothing behind them, which is worse than
// no label at all: it would look like evidence.
//
// So the vocabulary is deliberately wider than what this module will ever
// assign. Four categories have a deterministic basis today:
//
//   CHOICE_MAPPING       a mapping mismatch, or raw answers that agree while
//                        labels diverge — the Q79 shape
//   ANSWER_EXTRACTION    an engine published a final answer from which no value
//                        could be recovered
//   MISSING_INFORMATION  a field absent inside a submitted output
//   MODEL_DISAGREEMENT   values genuinely diverge and nothing deterministic
//                        explains it — the honest unresolved bucket
//
// INTERPRETATION, ARITHMETIC, ALGEBRA, GEOMETRY and TRANSCRIPTION are RESERVED.
// They need a verifier or a reasoning analysis that does not exist yet, so this
// module never assigns them. They are listed so a later phase with a real basis
// has a name to use, and so the tests can prove none is emitted.
//
// ───────────────────────────────────────────────────────────────────────────
// THE TWO RULES THAT KEEP THE METRICS HONEST
//
//   AGREEMENT IS NOT CORRECTNESS. Engines agreeing tells you they agree. The
//   preliminary sheet showed items where every model was wrong together —
//   exactly what a majority vote promotes to truth — so agreement metrics never
//   produce an error count.
//
//   AN ERROR REQUIRES AN INDEPENDENT REFERENCE. "Wrong" is undefined without a
//   separately verified answer. Items with no reference contribute to agreement
//   statistics and are EXCLUDED from every error statistic: not counted as
//   correct, not counted as incorrect, simply not counted.
//
// UNDEFINED IS REPORTED, NOT INVENTED. A correlation over zero paired items, or
// with a degenerate margin, returns null WITH A REASON. Returning 0 would read
// as "uncorrelated" — a claim the data does not support.
//
// No benchmark score, no model name and no ranking appears here. The preliminary
// per-model figures are not ground truth and are encoded nowhere.
//
// ───────────────────────────────────────────────────────────────────────────
// OFFLINE. Type-only imports, so nothing is pulled in at runtime; no clock, no
// randomness, no I/O; and nothing in the deployed bundle imports this file.
//
// literalKey below duplicates three lines of P2's normalizer rather than
// exporting it from there, because modifying a P2 source file for a trivial
// helper is a worse trade than a small, self-contained copy — and P3's notion of
// "same string" may legitimately diverge from P2's later.

import type { SolverOutput } from './evidence.core.ts';
import type { EngineSubmission, EvidenceRecord } from './evidence-builder.core.ts';

export type DisagreementCategory =
  // Assigned by this module, each from a deterministic rule.
  | 'CHOICE_MAPPING'
  | 'ANSWER_EXTRACTION'
  | 'MISSING_INFORMATION'
  | 'MODEL_DISAGREEMENT'
  // Reserved: named for later phases, never assigned here.
  | 'INTERPRETATION'
  | 'ARITHMETIC'
  | 'ALGEBRA'
  | 'GEOMETRY'
  | 'TRANSCRIPTION';

/** Categories this module must never emit, because no deterministic basis for
 *  them exists in the evidence available. Exported so the suite can assert the
 *  absence rather than trust the comment. */
export const RESERVED_CATEGORIES: DisagreementCategory[] = [
  'INTERPRETATION', 'ARITHMETIC', 'ALGEBRA', 'GEOMETRY', 'TRANSCRIPTION',
];

/** One classified finding. Provenance is not optional: `basis` names the
 *  deterministic rule that assigned the category, so a reader can always ask
 *  why this label exists and get an answer that is not "a model thought so". */
export interface DisagreementFinding {
  category: DisagreementCategory;
  engines: string[];
  fields: string[];
  observed: unknown;
  basis: string;
}

/** Declared output order, exported so a suite can assert against the
 *  declaration itself rather than re-guessing it. */
export const CATEGORY_ORDER: DisagreementCategory[] = [
  'MISSING_INFORMATION', 'ANSWER_EXTRACTION', 'CHOICE_MAPPING', 'MODEL_DISAGREEMENT',
];

function literalKey(v: unknown): string {
  return String(v ?? '').trim().toLowerCase().replace(/\.+$/, '').replace(/\s+/g, ' ');
}

function labelOf(s: EngineSubmission): string {
  return (typeof s.engine_id === 'string' && s.engine_id.trim()) ? s.engine_id : '(unidentified)';
}

function sortFindings(f: DisagreementFinding[]): DisagreementFinding[] {
  const orderOf = (r: DisagreementFinding) => {
    const i = CATEGORY_ORDER.indexOf(r.category);
    return i === -1 ? CATEGORY_ORDER.length : i;
  };
  return f.sort((a, b) => {
    if (orderOf(a) !== orderOf(b)) return orderOf(a) - orderOf(b);
    const ae = a.engines.join(','), be = b.engines.join(',');
    if (ae !== be) return ae < be ? -1 : 1;
    const af = a.fields.join(','), bf = b.fields.join(',');
    if (af !== bf) return af < bf ? -1 : 1;
    const ao = JSON.stringify(a.observed), bo = JSON.stringify(b.observed);
    return ao === bo ? 0 : (ao < bo ? -1 : 1);
  });
}

/** Classify the disagreement present in a set of outputs and their evidence.
 *
 *  Pure and total. Returns [] when there is nothing to classify — including at
 *  N=1, where there is no one to disagree with. */
export function analyzeDisagreement(
  submissions: EngineSubmission[] | null | undefined,
  evidence: EvidenceRecord[] | null | undefined,
  options?: { choices?: string[] | null } | null,
): DisagreementFinding[] {
  const subs = Array.isArray(submissions) ? submissions.filter((s) => s && typeof s === 'object') : [];
  const ev = Array.isArray(evidence) ? evidence : [];
  if (!subs.length) return [];

  const findings: DisagreementFinding[] = [];
  const byType = (ty: string) => ev.filter((r) => r && r.type === ty);

  // ── MISSING_INFORMATION — a field absent inside a submitted output.
  // Never "a missing engine": how many engines is a routing question, and P2
  // deliberately has no expected count for this module to inherit.
  for (const r of byType('MISSING_OBSERVATION')) {
    findings.push({
      category: 'MISSING_INFORMATION',
      engines: r.engines.slice(), fields: r.fields.slice(),
      observed: null, basis: 'field_absent_in_submitted_output',
    });
  }

  // ── ANSWER_EXTRACTION — the engine published something, and no value could be
  // recovered from it. This is a property of one output, not a conflict between
  // engines, which is why it is separated from MODEL_DISAGREEMENT.
  for (const s of subs) {
    const o = s.output as SolverOutput | undefined;
    if (o && o.final_answer !== null && o.raw_answer === null) {
      findings.push({
        category: 'ANSWER_EXTRACTION',
        engines: [labelOf(s)], fields: ['raw_answer', 'final_answer'],
        observed: { final_answer: o.final_answer, raw_answer: null },
        basis: 'published_without_extractable_value',
      });
    }
  }

  // ── CHOICE_MAPPING, per engine: its own label does not point at its own value.
  // Q79 in one output.
  for (const r of byType('MAPPING_CONSISTENCY')) {
    if (r.observed === 'mismatch') {
      findings.push({
        category: 'CHOICE_MAPPING',
        engines: r.engines.slice(), fields: r.fields.slice(),
        observed: 'mismatch', basis: 'own_mapping_mismatch',
      });
    }
  }

  // ── CHOICE_MAPPING, across engines: they derived the SAME value and published
  // DIFFERENT labels. The value is not in dispute — the mapping is — so calling
  // this a model disagreement would misattribute it.
  const rawAgreements = byType('RAW_ANSWER_AGREEMENT');
  const choiceDivergences = byType('CHOICE_DIVERGENCE');
  for (const agree of rawAgreements) {
    for (const diverge of choiceDivergences) {
      const shared = agree.engines.filter((e) => diverge.engines.includes(e)).sort();
      if (shared.length >= 2) {
        findings.push({
          category: 'CHOICE_MAPPING',
          engines: shared, fields: ['raw_answer', 'choice_letter'],
          observed: { shared_raw_answer: agree.observed, diverging_choices: diverge.observed },
          basis: 'raw_agree_choice_diverge',
        });
      }
    }
  }

  // ── MODEL_DISAGREEMENT — values genuinely differ, and nothing above explains
  // it. This is the UNRESOLVED bucket, and it is named honestly: the cause was
  // not determined, rather than guessed at from prose.
  for (const r of byType('RAW_ANSWER_DIVERGENCE')) {
    const explained = findings.some(
      (f) => f.category === 'CHOICE_MAPPING' && f.engines.length >= 2 &&
             r.engines.every((e) => f.engines.includes(e)),
    );
    if (!explained) {
      findings.push({
        category: 'MODEL_DISAGREEMENT',
        engines: r.engines.slice(), fields: r.fields.slice(),
        observed: r.observed,
        basis: 'raw_answers_diverge_no_deterministic_cause',
      });
    }
  }

  return sortFindings(findings);
}

// ═══════════════════════════════════════════════════════════════════════════
// CORRELATED-ERROR METRICS
// ═══════════════════════════════════════════════════════════════════════════

/** One benchmark item. `reference` is present only when an INDEPENDENT verifier
 *  has supplied an answer; without it, error is undefined for this item and the
 *  item is excluded from every error statistic. */
export interface BenchmarkItem {
  item_id: string;
  answers: Record<string, string | null>;
  reference?: string | null;
}

export interface PairAgreement {
  engines: [string, string];
  comparable: number;
  agreed: number;
  disagreed: number;
  agreement_rate: number | null;
}

export interface PairErrorCorrelation {
  engines: [string, string];
  n: number;
  both_wrong: number;
  a_only_wrong: number;
  b_only_wrong: number;
  both_right: number;
  phi: number | null;
  undefined_reason: string | null;
  excluded_no_reference: number;
  excluded_no_answer: number;
}

function items(list: BenchmarkItem[] | null | undefined): BenchmarkItem[] {
  return Array.isArray(list) ? list.filter((i) => i && typeof i === 'object' && i.answers) : [];
}

function engineIds(list: BenchmarkItem[]): string[] {
  const s = new Set<string>();
  for (const it of list) for (const k of Object.keys(it.answers ?? {})) s.add(k);
  return [...s].sort();
}

function pairsOf(ids: string[]): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) out.push([ids[i], ids[j]]);
  return out;
}

const stated = (v: unknown): boolean => v !== null && v !== undefined && String(v).trim() !== '';

/** How often two engines said the same thing. NO reference is needed and none is
 *  used: this measures agreement, which is not correctness. */
export function pairwiseAgreement(list: BenchmarkItem[] | null | undefined): PairAgreement[] {
  const all = items(list);
  return pairsOf(engineIds(all)).map(([a, b]) => {
    let comparable = 0, agreed = 0;
    for (const it of all) {
      const va = it.answers[a], vb = it.answers[b];
      if (!stated(va) || !stated(vb)) continue;      // an abstention is not a disagreement
      comparable++;
      if (literalKey(va) === literalKey(vb)) agreed++;
    }
    return {
      engines: [a, b] as [string, string],
      comparable, agreed, disagreed: comparable - agreed,
      agreement_rate: comparable ? Number((agreed / comparable).toFixed(6)) : null,
    };
  });
}

/** How far two engines are wrong TOGETHER — computed only over items where an
 *  independent reference exists AND both engines answered.
 *
 *  phi is the 2x2 correlation of (a wrong, b wrong). It is null, with a reason,
 *  whenever the data cannot support it: no paired items, a single item, or a
 *  degenerate margin where one engine is never wrong in the sample. Reporting 0
 *  there would assert independence the sample does not show. */
export function pairwiseErrorCorrelation(
  list: BenchmarkItem[] | null | undefined,
): PairErrorCorrelation[] {
  const all = items(list);
  return pairsOf(engineIds(all)).map(([a, b]) => {
    let n11 = 0, n10 = 0, n01 = 0, n00 = 0, noRef = 0, noAns = 0;
    for (const it of all) {
      const va = it.answers[a], vb = it.answers[b];
      if (!stated(it.reference)) { noRef++; continue; }
      if (!stated(va) || !stated(vb)) { noAns++; continue; }
      const ref = literalKey(it.reference);
      const aWrong = literalKey(va) !== ref;
      const bWrong = literalKey(vb) !== ref;
      if (aWrong && bWrong) n11++;
      else if (aWrong) n10++;
      else if (bWrong) n01++;
      else n00++;
    }
    const n = n11 + n10 + n01 + n00;

    let phi: number | null = null;
    let reason: string | null = null;
    if (n === 0) {
      reason = 'no_paired_items_with_reference';
    } else if (n < 2) {
      reason = 'sample_too_small';
    } else {
      const denom = Math.sqrt((n11 + n10) * (n01 + n00) * (n11 + n01) * (n10 + n00));
      if (denom === 0) reason = 'degenerate_margin_zero_variance';
      else phi = Number(((n11 * n00 - n10 * n01) / denom).toFixed(6));
    }

    return {
      engines: [a, b] as [string, string],
      n, both_wrong: n11, a_only_wrong: n10, b_only_wrong: n01, both_right: n00,
      phi, undefined_reason: reason,
      excluded_no_reference: noRef, excluded_no_answer: noAns,
    };
  });
}

export interface SharedErrorPatterns {
  sample_total: number;
  sample_with_reference: number;
  unanimous_wrong: Array<{ item_id: string; answer: string; engines: string[] }>;
  shared_wrong: Array<{ item_id: string; answer: string; engines: string[] }>;
}

/** Items where engines failed together — the pattern a majority vote would
 *  promote to truth. Only items carrying an independent reference are examined;
 *  the rest are counted in `sample_total` and otherwise ignored. */
export function sharedErrorPatterns(
  list: BenchmarkItem[] | null | undefined,
): SharedErrorPatterns {
  const all = items(list);
  const out: SharedErrorPatterns = {
    sample_total: all.length, sample_with_reference: 0,
    unanimous_wrong: [], shared_wrong: [],
  };

  for (const it of all) {
    if (!stated(it.reference)) continue;
    out.sample_with_reference++;
    const ref = literalKey(it.reference);

    const answered = Object.keys(it.answers ?? {}).filter((e) => stated(it.answers[e])).sort();
    if (!answered.length) continue;

    const wrongByValue = new Map<string, { answer: string; engines: string[] }>();
    for (const e of answered) {
      const v = String(it.answers[e]);
      if (literalKey(v) === ref) continue;
      const k = literalKey(v);
      const g = wrongByValue.get(k);
      if (g) g.engines.push(e);
      else wrongByValue.set(k, { answer: v, engines: [e] });
    }
    for (const g of wrongByValue.values()) g.engines.sort();

    // Unanimous: every engine that answered was wrong, on the same value.
    for (const g of wrongByValue.values()) {
      if (g.engines.length === answered.length && answered.length >= 2) {
        out.unanimous_wrong.push({ item_id: it.item_id, answer: g.answer, engines: g.engines.slice() });
      }
      if (g.engines.length >= 2) {
        out.shared_wrong.push({ item_id: it.item_id, answer: g.answer, engines: g.engines.slice() });
      }
    }
  }

  const key = (r: { item_id: string; answer: string }) => `${r.item_id}|${r.answer}`;
  out.unanimous_wrong.sort((a, b) => (key(a) < key(b) ? -1 : 1));
  out.shared_wrong.sort((a, b) => (key(a) < key(b) ? -1 : 1));
  return out;
}
