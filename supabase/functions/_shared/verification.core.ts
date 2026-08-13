// ═══════════════════════════════════════════════════════════════════════════
// _shared/verification.core.ts — the L3 verification pipeline
// ═══════════════════════════════════════════════════════════════════════════
// EXTRACTED VERBATIM from ai-tutor/index.ts by V1-T16 (Truth System v2).
// Pure refactor: identical outputs for identical inputs. No behavioural change,
// no policy change, no logging change, no new features, no threshold change,
// no data-flow change.
//
// WHY THIS MODULE EXISTS
//   ai-tutor/index.ts had reached ~274 KB / 4,943 lines with a restricted
//   deploy path and two prior outages caused by shipping an incomplete bundle.
//   Its size guard had been raised five times. This extraction is the
//   structural answer, following the taxonomy.core.js single-source pattern
//   already in production.
//
// WHAT IS HERE
//   The entire logical verification pipeline, moved together: the answer
//   normalisation helpers, the Truth System v2 V0 observation surface, OCR
//   extraction and the ambiguity check, the solvers, the judge, and the
//   runL3ShadowPipeline orchestrator.
//
// PROOF OF EQUIVALENCE
//   tests/verification-core-parity.test.mjs replays six recorded scenarios
//   through this module and asserts deep equality against
//   tests/fixtures/v1-t16-golden.json, captured from the pre-extraction code by
//   scripts/capture-v1-t16-golden.mjs. verification_meta, the judge verdict,
//   the verification_decisions row, the quality score, the ai_model_calls rows
//   and the console telemetry payload are all compared byte-for-byte.

import { recordModelCall, flushModelCalls } from './telemetry.core.ts';
import type { ModelCallRow, SupabaseAdminClient } from './telemetry.core.ts';

// Re-derived here exactly as in index.ts. A one-line env read is duplicated in
// preference to threading it through every call site.
const OPENAI_KEY = Deno.env.get('OPENAI_API_KEY') ?? '';


const L3_PIPELINE_VERSION = 'l3-shadow-v3';

// ── L3 Shadow Verification Pipeline (Phase 2A) ───────────────────────────────
// Level 3 architecture: OCR ambiguity check → 2 parallel solvers (gpt-4o-mini,
// temperatures 0.1 + 0.3) → judge (gpt-4o-mini, temp 0). OCR disambiguation
// rerun uses gpt-4o for higher vision accuracy.
// Runs entirely in background via EdgeRuntime.waitUntil() — zero student latency.
// Double-gated: VERIFICATION_ENABLED=true AND VERIFICATION_SHADOW_ONLY=true.
// Never modifies student answer, hint, personality, or KB behavior.
// All columns written are the Phase 0 nullable columns — no schema change.
// Pipeline version: l3-shadow-v1

interface OcrAmbiguityResult {
  confidence: number;
  flags: string[];
  rerun_count: number;
  rerun_changed: boolean;
  final_text: string;
}
interface SolverResult {
  answer: string;        // legacy: equals final_answer (kept for back-compat)
  final_answer: string;  // extracted final answer only
  reasoning: string;     // multi-line derivation (everything before "Final Answer:")
  raw_output: string;    // full unparsed model output
}
interface JudgeResult {
  verdict: 'agrees' | 'disagrees' | 'ocr_uncertain' | 'inconclusive';
  confidence: number;
  reasoning: string;
}

// Normalize a final-answer string for equality comparison. Strips wrapper
// prefixes ("answer:", "final answer:", "the answer is"), markdown bold,
// trailing punctuation, and whitespace; case-insensitive.
export function normalizeFinalAnswer(s: string): string {
  return String(s ?? '')
    .toLowerCase()
    .replace(/^\s*(final\s+answer|answer|the\s+answer\s+is)\s*[:=]\s*/i, '')
    .replace(/[*_`]/g, '')
    .replace(/[.\s]+$/g, '')
    .replace(/\s+/g, '')
    .trim();
}

// Parse a final-answer string to a finite number IFF it is a single clean
// scalar: integer, decimal, or fraction, with optional currency prefix and
// thousands separators. Returns null for anything else (expressions, words,
// MCQ letters, percentages, units) so the caller fails closed to string
// comparison. Scope is intentionally minimal — see answersEquivalent.
export function parseNumericAnswer(s: string): number | null {
  let t = normalizeFinalAnswer(s);                 // reuse marker/markdown/space normalizer
  if (!t) return null;
  t = t.replace(/[$£€]/g, '')                       // currency prefix ($3 -> 3)
       .replace(/(\d),(?=\d{3}(\D|$))/g, '$1');     // thousands separators (1,000 -> 1000)
  let val: number | null = null;
  const frac = /^[-+]?\d+(?:\.\d+)?\/[-+]?\d+(?:\.\d+)?$/;
  if (frac.test(t)) {
    const [n, d] = t.split('/').map(Number);
    if (d !== 0) val = n / d;                        // fraction -> rational value (9/4 -> 2.25)
  } else if (/^[-+]?\d+(?:\.\d+)?$/.test(t)) {
    val = Number(t);                                 // integer / decimal (2.0 -> 2, 0.410 -> 0.41)
  }
  return (val !== null && Number.isFinite(val)) ? val : null;
}

// Equivalence test used by solver_agreement. String path first (unchanged
// behavior), numeric path second, fail-closed otherwise. Can only ever return
// true where the old string compare returned true OR the two values are
// provably equal numbers — never the reverse — so solver_agreement can only
// move 0->1, never 1->0.
export function answersEquivalent(a: string, b: string): boolean {
  const na = normalizeFinalAnswer(a), nb = normalizeFinalAnswer(b);
  if (na && na === nb) return true;                  // EXISTING string match, preserved
  const va = parseNumericAnswer(a), vb = parseNumericAnswer(b);
  if (va === null || vb === null) return false;      // non-scalars never equate (fail-closed)
  return Math.abs(va - vb) <= 1e-9 * Math.max(1, Math.abs(va), Math.abs(vb));
}

// ── RC2 evidence record ──────────────────────────────────────────────────
// RC2 PR1 (audit requirement R9). TELEMETRY ONLY — nothing below decides a
// verdict. The clamp that uses these signals is PR3.
//
// The problem this exists to make measurable: a stored verdict currently
// carries no record of what produced it, so an RC1 extraction failure, a real
// tutor/solver conflict, a judge false positive, solver disagreement and thin
// reasoning are all indistinguishable after the fact.
//
// WHY A NAIVE COMPARISON IS NOT ENOUGH. `answersEquivalent(tutorFinalAnswer,
// solverAnswer)` looks like the obvious check and is wrong in production. RC1
// returns the tutor's sentence, not a token:
//
//   "The sum of the solutions is \(\frac{26}{5}\), which corresponds to
//    option D."                                          solver: "26/5"
//
// The same answer, and answersEquivalent returns false. Measured 2026-08-13:
// the answer-blind judge reads 100% `disagrees` (32/32, zero abstentions) —
// it is reporting incomparability, not disagreement.

/** Candidate answer tokens inside a tutor sentence, in reading order.
 *
 *  Deliberately generous — recall matters more than precision here, because
 *  the reducer below treats ANY match as agreement and treats ambiguity as
 *  incomparable. A missed token can only cost a `match`; it can never
 *  manufacture a `conflict`. */
export function extractAnswerTokens(s: unknown): string[] {
  const raw = String(s ?? '');
  if (!raw.trim()) return [];
  // Unwrap LaTeX so \frac{26}{5} and \(-25\) become comparable text.
  const text = raw
    .replace(/\\frac\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g, '$1/$2')
    .replace(/\\d?frac\s*\{([^{}]+)\}\s*\{([^{}]+)\}/g, '$1/$2')
    .replace(/\\[()[\]]/g, ' ')
    .replace(/\$+/g, ' ')
    .replace(/[{}]/g, ' ')
    .replace(/\\[a-zA-Z]+/g, ' ')
    .replace(/[−–—]/g, '-');     // unicode minus / dashes -> ASCII

  const out: string[] = [];
  const push = (v: string) => { const x = v.trim(); if (x && !out.includes(x)) out.push(x); };

  // Fractions first, so "26/5" is not split into "26" and "5".
  const consumed: Array<[number, number]> = [];
  const fracRe = /-?\d+(?:\.\d+)?\s*\/\s*-?\d+(?:\.\d+)?/g;
  for (let m = fracRe.exec(text); m; m = fracRe.exec(text)) {
    push(m[0].replace(/\s+/g, ''));
    consumed.push([m.index, m.index + m[0].length]);
  }
  const inFraction = (i: number, len: number) =>
    consumed.some(([a, b]) => i >= a && i + len <= b);

  // Bare numerics, including negatives, decimals and thousands separators.
  const numRe = /-?\d[\d,]*(?:\.\d+)?/g;
  for (let m = numRe.exec(text); m; m = numRe.exec(text)) {
    if (!inFraction(m.index, m[0].length)) push(m[0].replace(/,/g, ''));
  }

  // Option letters only in an explicitly option-shaped context, so ordinary
  // prose ("a triangle") cannot contribute a spurious candidate.
  const optRe = /(?:option|choice|answer)\s+\(?([A-E])\)?|\(([A-E])\)|\b([A-E])\)/gi;
  for (let m = optRe.exec(text); m; m = optRe.exec(text)) {
    push((m[1] || m[2] || m[3] || '').toUpperCase());
  }
  return out;
}

export type TutorVsSolver = 'match' | 'conflict' | 'incomparable';

/** How the tutor's published answer relates to a solver's — MATCH-DOMINANT.
 *
 *  The asymmetry is the safety property, and it is what makes the PR3 clamp
 *  able to promise that a `disagrees` never comes from a misread sentence:
 *
 *    no tokens                     -> incomparable
 *    ANY token equivalent          -> match
 *    exactly one token, differing  -> conflict
 *    several tokens, none matching -> incomparable   (never `conflict`)
 *
 *  The last rule is why "the value of c is -25, which corresponds to option C"
 *  cannot be read as conflicting with a solver that said "C", or with one that
 *  said "-25". Ambiguity refuses to accuse. */
export function tutorVsSolverFrom(tutorAnswer: unknown, solverAnswer: unknown): TutorVsSolver {
  const solver = String(solverAnswer ?? '').trim();
  if (!solver) return 'incomparable';
  const tokens = extractAnswerTokens(tutorAnswer);
  if (!tokens.length) return 'incomparable';
  if (tokens.some((tk) => answersEquivalent(tk, solver))) return 'match';
  return tokens.length === 1 ? 'conflict' : 'incomparable';
}

interface PreconditionInput {
  ocrConfidence: number;
  admissible: boolean;
  tutorVsSolver: TutorVsSolver;
  solversConverge: boolean;
  reasoningSufficient: boolean;
  judgeVerdict: string;
}

/** The FIRST precondition that would block a directional verdict, or null.
 *
 *  Recorded, never acted on — PR1 changes no verdict. Its purpose is to make
 *  the PR3 measurement window a single GROUP BY instead of a reconstruction. */
export function blockingPrecondition(i: PreconditionInput): string | null {
  if (!(i.ocrConfidence >= 0.75))        return 'ocr';
  if (!i.admissible)                     return 'admissible';
  if (i.tutorVsSolver === 'incomparable') return 'comparable';
  if (!i.solversConverge)                return 'solver_convergence';
  if (!i.reasoningSufficient)            return 'reasoning';
  if (i.judgeVerdict === 'inconclusive') return 'judge_downgrade';
  return null;
}
// ── end RC2 evidence record ──────────────────────────────────────────────

// ═══════════════════════════════════════════════════════════════════════════
// TRUTH SYSTEM v2 — V0 OBSERVATION SURFACE
// ═══════════════════════════════════════════════════════════════════════════
// Blueprint: docs/roadmap/truth-system-v2-migration-strategy.md §3 (Phase V0)
// Tasks V0-T01/T06/T10/T13. Rationale, assumptions and deferred work:
// docs/roadmap/v0-notes.md — read that before changing anything here.
//
// Additive, and the one behavioural switch is OFF BY DEFAULT. With no env
// change this deploy leaves L3 Shadow byte-identical: same OCR check, same two
// solvers, same judge, same verdict, same verification_meta keys, same
// question_records write. What is added is a second, identifier-free record of
// WHO decided and under WHAT policy.
//
// It ships before anything reads it because none of it can be retrofitted: a
// decision made without a policy version is permanently unattributable, and
// forced exploration is free only while the pipeline has no early exit.

// ── V0-T10 — policy identity ────────────────────────────────────────────────
// Today's pipeline is a fixed straight line with no branching and no early
// exit. That has always been a policy; it has never had a version, so no
// decision it made is attributable to the logic that made it.
//
// POLICY_VERSION moves when the DECISION LOGIC moves. L3_PIPELINE_VERSION moves
// when the pipeline's shape or prompts move. Separate on purpose — a prompt
// edit is not a policy change, and conflating them makes the propensity log
// unreadable the first time either moves alone.
export const POLICY_VERSION = 'v0-fixed-plan-1';
export const PLAN_ID        = 'l3-linear-v1';

// ── V0-T13 — forced exploration (v2 §10.7, principle P7) ────────────────────
// A fixed fraction verified BEYOND sufficiency, permanently: it is the audit
// sample, the calibration set, OPE support, and the only measurement of
// early-exit error. The fraction is 1.0 today and that is not a placeholder —
// with no early exit every math question already gets the full plan.
// NOTHING BRANCHES ON THE RESULT in V0. It is recorded, never acted on.
export const DEFAULT_EXPLORATION_FRACTION = 1;

export function explorationFraction(): number {
  const raw = Number(Deno.env.get('VERIFICATION_EXPLORATION_FRACTION') ?? DEFAULT_EXPLORATION_FRACTION);
  if (!Number.isFinite(raw)) return DEFAULT_EXPLORATION_FRACTION;   // junk config → today's behaviour
  return Math.min(1, Math.max(0, raw));
}

// Draw is a parameter, not an internal Math.random(), so the decision is
// reproducible under test. At fraction 1.0 every draw in [0,1) selects.
export function isForcedExploration(fraction: number, draw: number): boolean {
  return draw < fraction;
}

// ── V0-T01 — answer-blind judging (v2 §7.3) ─────────────────────────────────
// runJudge (below) receives Zero's explanation, Zero's final answer AND both
// solver answers before it rules. That is the answer-conditioned configuration
// measured at a false-positive rate of 0.719, against 0.012 for a judge that
// commits to its own answer first: shown a candidate, a judge measures
// plausibility rather than correctness.
//
// This adds the pre-committed judge ALONGSIDE it. The legacy verdict is still
// computed, still written to judge_verdict, and still drives
// verification_quality_score — nothing downstream moves. Both are recorded so
// their disagreement can be measured before anything depends on either.
//
// THE RULING IS DERIVED, NOT ASKED FOR. Once the judge has committed, comparing
// its answer to the candidate is a decision, not a judgement — and asking a
// model to make it would hand back the candidate the pre-commitment exists to
// withhold. This is the MODEL_OPINION assorter of v2 §9.1 verbatim, and it
// costs one call instead of two.
type BlindVerdict = 'agrees' | 'disagrees' | 'abstained';

export function judgeAnswerBlindEnabled(): boolean {
  return (Deno.env.get('JUDGE_ANSWER_BLIND') ?? 'false') === 'true';
}

export function blindVerdictFrom(
  precommitAnswer: string, candidateAnswer: string,
): { verdict: BlindVerdict; assorter: number } {
  const a = String(precommitAnswer ?? '').trim();
  const b = String(candidateAnswer  ?? '').trim();
  // Either side missing is an ABSTENTION, not a disagreement. A judge that
  // produced no answer expressed no opinion, and scoring that 0 would count a
  // failed call as evidence against the candidate.
  if (!a || !b) return { verdict: 'abstained', assorter: 0.5 };
  return answersEquivalent(a, b)
    ? { verdict: 'agrees',    assorter: 1 }
    : { verdict: 'disagrees', assorter: 0 };
}

// The pre-commitment. Given the question and NOTHING else — not Zero's
// explanation, not the tutor's final answer, not either solver's output.
//
// Enforced BY CONSTRUCTION: this function takes no candidate parameter, so
// there is none in scope to leak into the payload. verification-v0.test.mjs
// also asserts the outgoing body against known candidate strings, because "the
// signature makes it impossible" is an argument and the test is evidence.
//
// Model matches runJudge (gpt-4o) so the two verdicts are comparable; a weaker
// pre-committed judge would confound the comparison with a model gap.
// "mathematician", not "solver", deliberately: verification-v0.test.mjs rejects
// the words runJudge uses to label candidate material (tutor / candidate /
// solver / proposed answer) anywhere in this prompt, so a future copy-paste
// from runJudge fails the suite instead of quietly re-conditioning the judge.
const JUDGE_PRECOMMIT_SYSTEM_PROMPT =
  'You are a precise mathematician. Solve the problem and state only the final answer.\n' +
  'Respond with exactly one line and nothing else:\n' +
  'Final Answer: <single value, expression, or option letter>\n' +
  'No reasoning, no explanation, no markdown.';

export async function runJudgePrecommit(
  questionText: string, imageData: string | null, sink?: ModelCallRow[],
): Promise<{ answer: string; raw: string }> {
  const t0 = Date.now();
  let recorded = false;   // guards against double-counting one call
  try {
    const userContent: unknown = imageData
      ? [
          { type: 'text', text: `Solve this math problem. Extracted text (may be partial): "${questionText.slice(0, 800)}"` },
          { type: 'image_url', image_url: { url: imageData, detail: 'high' } },
        ]
      : questionText.slice(0, 1500);
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_KEY}` },
      body: JSON.stringify({
        model: 'gpt-4o', max_tokens: 300, temperature: 0,
        messages: [
          { role: 'system', content: JUDGE_PRECOMMIT_SYSTEM_PROMPT },
          { role: 'user', content: userContent },
        ],
      }),
    });
    const json = await res.json();
    recordModelCall(sink, {
      service_code: 'judge', stage: 'precommit', model: 'gpt-4o',
      started: t0, res, json,
      meta: { max_tokens: 300, temperature: 0, sees_image: !!imageData },
    });
    recorded = true;
    const raw = String(json.choices?.[0]?.message?.content || '').trim();
    const m = /^\s*final\s*answer\s*[:=]\s*(.+?)\s*$/im.exec(raw);
    const answer = (m ? m[1] : (raw.split('\n').map(l => l.trim()).filter(Boolean).at(-1) ?? ''));
    return { answer: answer.replace(/[*_`$]/g, '').trim().slice(0, 120), raw };
  } catch (e) {
    if (!recorded) {
      recordModelCall(sink, {
        service_code: 'judge', stage: 'precommit', model: 'gpt-4o',
        started: t0, err: e,
        meta: { max_tokens: 300, temperature: 0, sees_image: !!imageData },
      });
    }
    // A failed pre-commitment is an abstention, never a disagreement, and never
    // a reason for the pipeline to fail.
    return { answer: '', raw: '' };
  }
}

// ── V0-T06 — the decision row payload ───────────────────────────────────────
// Built by a named pure function rather than inline at the insert, so the
// compliance boundary is testable: v2 §11/§23 require this row to carry no
// student identifier, no image and no free text, because it is the one
// verification store meant to be retained permanently.
// verification-v0.test.mjs asserts the exact key set.
export const DECISION_LOG_ENABLED =
  (Deno.env.get('VERIFICATION_DECISION_LOG_ENABLED') ?? 'true') !== 'false';

interface DecisionRowInput {
  decisionUid:         string;
  decidedAt:           string;
  pipelineVersion:     string;
  questionRecordId:    string;
  requestId?:          string | null;
  clientRequestId?:    string | null;
  lessonId?:           string | null;
  difficultyBin?:      string | null;
  forcedExploration:   boolean;
  explorationFraction: number;
  judgeAnswerBlind:    boolean;
  blindVerdict?:       BlindVerdict | null;
  blindAssorter?:      number | null;
  legacyJudgeVerdict?: string | null;
  solverAgreement?:    number | null;
  pipelineLatencyMs?:  number | null;
}

export function buildDecisionRow(i: DecisionRowInput): Record<string, unknown> {
  return {
    decision_uid:         i.decisionUid,
    decided_at:           i.decidedAt,
    question_record_id:   i.questionRecordId,
    request_id:           i.requestId       ?? null,
    client_request_id:    i.clientRequestId ?? null,
    pipeline_version:     i.pipelineVersion,
    policy_version:       POLICY_VERSION,
    plan_id:              PLAN_ID,
    lesson_id:            i.lessonId      ?? null,
    difficulty_bin:       i.difficultyBin ?? null,
    forced_exploration:   i.forcedExploration,
    exploration_fraction: i.explorationFraction,
    judge_answer_blind:   i.judgeAnswerBlind,
    // Null unless the blind judge ran — the table's coherence constraint
    // rejects a blind verdict recorded against a run that never made one.
    blind_verdict:        i.judgeAnswerBlind ? (i.blindVerdict  ?? null) : null,
    blind_assorter:       i.judgeAnswerBlind ? (i.blindAssorter ?? null) : null,
    legacy_judge_verdict: i.legacyJudgeVerdict ?? null,
    solver_agreement:     i.solverAgreement    ?? null,
    pipeline_latency_ms:  i.pipelineLatencyMs  ?? null,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// END V0 OBSERVATION SURFACE
// ═══════════════════════════════════════════════════════════════════════════

// For image questions: extract the math problem as plain text (pre-solver step).
// Uses gpt-4o (vision) — gpt-4o-mini dropped digits/strokes (4667 -> 467). The
// accuracy of this step gates the whole solve, so we pay for the stronger model.
export async function extractMathTextFromImage(
  imageData: string, studentText: string, sink?: ModelCallRow[],
): Promise<string> {
  const guard = ' Do NOT guess or autocomplete any digit, sign, or symbol — if a character is unclear, transcribe exactly what is visible. Preserve the exact number of digits in every number.';
  const prompt = (studentText
    ? `The student sent this image with the message: "${studentText.slice(0, 200)}". Extract the specific math question they are asking about as plain text. Preserve all numbers, operators, signs (especially negative/minus signs), and mathematical notation exactly. Return ONLY the extracted math question.`
    : 'Extract the math question shown in this image as plain text. Preserve all numbers, operators, signs (especially negative/minus signs), and mathematical notation exactly. Return ONLY the extracted math question.') + guard;
  const t0 = Date.now();
  let recorded = false;   // guards against double-counting one call
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_KEY}` },
      body: JSON.stringify({
        model: 'gpt-4o', max_tokens: 300, temperature: 0,
        messages: [{ role: 'user', content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: imageData, detail: 'high' } },
        ]}],
      }),
    });
    const json = await res.json();
    recordModelCall(sink, {
      service_code: 'ocr', stage: 'extract', model: 'gpt-4o',
      started: t0, res, json,
      meta: { max_tokens: 300, temperature: 0, image_count: 1, detail: 'high' },
    });
    recorded = true;
    return String(json.choices?.[0]?.message?.content || '').trim();
  } catch (e) {
    if (!recorded) {
      recordModelCall(sink, {
        service_code: 'ocr', stage: 'extract', model: 'gpt-4o',
        started: t0, err: e,
        meta: { max_tokens: 300, temperature: 0, image_count: 1, detail: 'high' },
      });
    }
    return studentText;
  }
}

// Scan extracted text for OCR ambiguity signals; optionally run disambiguation rerun.
// OCR rerun uses gpt-4o (higher vision accuracy) when confidence < 0.85.
export async function ocrAmbiguityCheck(
  extractedText: string, imageData: string | null, sink?: ModelCallRow[],
): Promise<OcrAmbiguityResult> {
  const flags: string[] = [];
  let confidence = 1.0;

  if (imageData && extractedText) {
    if (/[–—]/.test(extractedText))                                           flags.push('dash_lookalike');
    if (/[a-zA-Z]\d/.test(extractedText) && !/\^/.test(extractedText))        flags.push('implicit_exponent');
    if (/\d\s*\/\s*\d/.test(extractedText) && !/\\frac/.test(extractedText))  flags.push('fraction_ambiguity');
    // Coarse: operators present but zero minus signs — possible sign loss
    if (/[+×÷*]/.test(extractedText) && !/-/.test(extractedText) && extractedText.length > 5)
      flags.push('no_operator_sign');
    // Long numbers (4+ digits) are the most error-prone for OCR digit drops
    // (4667 -> 467). A bare gpt-4o-mini extraction gave no signal for these;
    // treat them as coarse risk so the gpt-4o rerun double-checks the digits.
    if (/\d{4,}/.test(extractedText)) flags.push('long_number');

    const structural = flags.filter(f => f !== 'no_operator_sign' && f !== 'long_number').length;
    const coarse     = flags.includes('no_operator_sign') ? 1 : 0;
    // long_number alone must drop below the 0.85 rerun threshold so the digits
    // get a second pass; 0.20 weight => 0.80, which triggers the gpt-4o rerun.
    const longNum    = flags.includes('long_number') ? 1 : 0;
    confidence = Math.max(0, 1.0 - structural * 0.25 - coarse * 0.15 - longNum * 0.20);
  }

  let rerun_count = 0, rerun_changed = false, final_text = extractedText;
  if (imageData && confidence < 0.85 && extractedText) {
    const t0 = Date.now();
    try {
      const rerunRes = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_KEY}` },
        body: JSON.stringify({
          model: 'gpt-4o', max_tokens: 300, temperature: 0,
          messages: [{ role: 'user', content: [
            { type: 'text', text: `Re-extract this math expression from the image very carefully. Pay specific attention to:\n- Negative/minus signs before numbers or expressions (−3, −x)\n- Exponents written as superscripts (x², x³)\n- Fraction bars vs division signs\n- Any dashes that might be minus signs\n\nOriginal extraction: "${extractedText}"\n\nReturn ONLY the corrected mathematical expression.` },
            { type: 'image_url', image_url: { url: imageData, detail: 'high' } },
          ]}],
        }),
      });
      const rerunJson = await rerunRes.json();
      recordModelCall(sink, {
        service_code: 'ocr', stage: 'rerun', model: 'gpt-4o',
        started: t0, res: rerunRes, json: rerunJson,
        meta: { max_tokens: 300, temperature: 0, image_count: 1, ocr_confidence: confidence },
      });
      const rerunText = String(rerunJson.choices?.[0]?.message?.content || '').trim();
      rerun_count = 1;
      if (rerunText && rerunText !== extractedText) { rerun_changed = true; final_text = rerunText; }
    } catch (e) {
      recordModelCall(sink, {
        service_code: 'ocr', stage: 'rerun', model: 'gpt-4o',
        started: t0, err: e,
        meta: { max_tokens: 300, temperature: 0, image_count: 1, ocr_confidence: confidence },
      });
      /* rerun failure is non-fatal */
    }
  }
  return { confidence, flags, rerun_count, rerun_changed, final_text };
}

// Single solver pass. Model: gpt-4o-mini. Returns structured reasoning + final_answer.
// If imageData provided, solver sees the image directly (vision) — fixes the
// image-questions-not-verifiable bug where solvers relied only on mini-OCR text.
// v80: enforces "Reasoning:" / "Final Answer:" markers so the judge can evaluate
// the actual derivation, not just the choice letter.
const SOLVER_SYSTEM_PROMPT =
  'You are a precise math solver. You MUST respond in this exact format and nothing else:\n\n' +
  'Reasoning:\n' +
  '<step-by-step derivation across multiple lines>\n\n' +
  'Final Answer: <single value, expression, or option letter>\n\n' +
  'Rules:\n' +
  '- The "Reasoning:" block must contain the actual mathematical steps, not a restatement of the problem.\n' +
  '- "Final Answer:" must appear exactly once, on its own line, at the very end.\n' +
  '- No markdown formatting, no commentary outside this structure.';

export async function runSolver(
  questionText: string, temperature: number, imageData: string | null = null,
  sink?: ModelCallRow[], stage: string = 'solver',
): Promise<SolverResult> {
  const t0 = Date.now();
  let recorded = false;   // guards against double-counting one call (see detectQuestionsInImages)
  try {
    const userContent: unknown = imageData
      ? [
          { type: 'text', text: `Solve this math problem. Extracted text (may be partial): "${questionText.slice(0, 800)}"` },
          { type: 'image_url', image_url: { url: imageData, detail: 'high' } },
        ]
      : questionText.slice(0, 1500);
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_KEY}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini', max_tokens: 1200, temperature,
        messages: [
          { role: 'system', content: SOLVER_SYSTEM_PROMPT },
          { role: 'user', content: userContent },
        ],
      }),
    });
    const json = await res.json();
    recordModelCall(sink, {
      service_code: 'solver', stage, model: 'gpt-4o-mini',
      started: t0, res, json,
      meta: { max_tokens: 1200, temperature, sees_image: !!imageData },
    });
    recorded = true;
    const raw_output = String(json.choices?.[0]?.message?.content || '').trim();

    // Split into reasoning + final_answer using "Final Answer:" marker (case-insensitive).
    // Fallback: legacy "Answer:" marker. Last fallback: last non-empty line.
    let reasoning = '';
    let final_answer = '';
    const finalMatch = /^\s*final\s*answer\s*[:=]\s*(.+?)\s*$/im.exec(raw_output);
    const legacyMatch = !finalMatch && /^\s*answer\s*[:=]\s*(.+?)\s*$/im.exec(raw_output);
    if (finalMatch) {
      final_answer = finalMatch[1].trim();
      reasoning = raw_output.slice(0, finalMatch.index).replace(/^\s*reasoning\s*[:=]\s*/i, '').trim();
    } else if (legacyMatch) {
      final_answer = legacyMatch[1].trim();
      reasoning = raw_output.slice(0, legacyMatch.index).replace(/^\s*reasoning\s*[:=]\s*/i, '').trim();
    } else {
      const lines = raw_output.split('\n').map(l => l.trim()).filter(Boolean);
      final_answer = (lines.at(-1) ?? raw_output).trim();
      reasoning = lines.slice(0, -1).join('\n').replace(/^\s*reasoning\s*[:=]\s*/i, '').trim();
    }

    return { answer: final_answer, final_answer, reasoning, raw_output };
  } catch (e) {
    if (!recorded) {
      recordModelCall(sink, {
        service_code: 'solver', stage, model: 'gpt-4o-mini',
        started: t0, err: e,
        meta: { max_tokens: 1200, temperature, sees_image: !!imageData },
      });
    }
    return { answer: 'solver_error', final_answer: 'solver_error', reasoning: '', raw_output: '' };
  }
}

// Judge: compares Zero's answer against two solver derivations on three axes:
//   (1) final-answer agreement
//   (2) reasoning quality (steps present, not a bare letter / restatement)
//   (3) logical consistency (reasoning actually supports the stated final answer)
//
// v80: model upgraded gpt-4o-mini → gpt-4o. A weaker judge evaluating GPT-4o
// tutor output produces false disagreements; upgrading just the judge gives the
// largest verification-quality win per cost dollar.
//
// Hard rule retained: OCR confidence < 0.75 locks verdict to 'ocr_uncertain' —
// solver consensus cannot override OCR uncertainty.
const JUDGE_SYSTEM_PROMPT =
  'You are a strict math verification judge. You are given a math question, the tutor\'s explanation, ' +
  'and two independent solver derivations (each with reasoning and a final answer).\n\n' +
  'Evaluate on three axes:\n' +
  '  1. Final-answer agreement — does the tutor\'s final value match what the solvers derived (formatting differences OK)?\n' +
  '  2. Reasoning quality — do the solver derivations contain real mathematical steps, or just a restated problem / a bare letter?\n' +
  '  3. Logical consistency — does each solver\'s reasoning actually justify its stated final answer?\n\n' +
  'Respond with JSON only:\n' +
  '{"verdict":"agrees"|"disagrees"|"inconclusive","confidence":0.0-1.0,"reasoning":"two short sentences covering the three axes"}\n\n' +
  '- "agrees": both solvers reach the same final value as the tutor AND at least one solver shows valid reasoning that justifies it.\n' +
  '- "disagrees": solvers agree with each other on a final value but it differs from the tutor.\n' +
  '- "inconclusive": solvers disagree with each other, OR neither solver shows real reasoning (e.g. both returned only a letter), OR the reasoning contradicts the stated final answer.\n' +
  '- confidence reflects evidence strength: high when both solvers show genuine derivations that converge, low when reasoning is missing or shallow even if labels match.';

export async function runJudge(
  questionText: string, zeroAnswer: string,
  solverA: SolverResult, solverB: SolverResult, ocrConfidence: number,
  tutorFinalAnswer?: string, sink?: ModelCallRow[],
): Promise<JudgeResult> {
  if (ocrConfidence < 0.75) {
    // Short-circuit: no model call is made, so there is nothing to record.
    return {
      verdict: 'ocr_uncertain', confidence: ocrConfidence,
      reasoning: `OCR confidence ${ocrConfidence.toFixed(2)} below 0.75 — verdict locked; solver agreement does not override.`,
    };
  }
  const t0 = Date.now();
  let recorded = false;   // guards against double-counting one call
  try {
    // Tutor's final value is surfaced explicitly so a long, truncated
    // explanation can never hide it from the judge (Example A root cause).
    const tutorFinalLine = (tutorFinalAnswer || '').trim()
      ? `Tutor final answer: ${tutorFinalAnswer!.trim().slice(0, 120)}\n\n`
      : '';
    const userContent =
      `Question:\n${questionText.slice(0, 500)}\n\n` +
      `Tutor explanation (excerpt):\n${zeroAnswer.slice(0, 600)}\n\n` +
      tutorFinalLine +
      `Solver A reasoning:\n${(solverA.reasoning || '(none)').slice(0, 1500)}\n` +
      `Solver A final answer: ${solverA.final_answer.slice(0, 120)}\n\n` +
      `Solver B reasoning:\n${(solverB.reasoning || '(none)').slice(0, 1500)}\n` +
      `Solver B final answer: ${solverB.final_answer.slice(0, 120)}`;

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${OPENAI_KEY}` },
      body: JSON.stringify({
        model: 'gpt-4o', max_tokens: 500, temperature: 0,
        messages: [
          { role: 'system', content: JUDGE_SYSTEM_PROMPT },
          { role: 'user', content: userContent },
        ],
      }),
    });
    const json = await res.json();
    recordModelCall(sink, {
      service_code: 'judge', stage: 'verdict', model: 'gpt-4o',
      started: t0, res, json,
      meta: { max_tokens: 500, temperature: 0, ocr_confidence: ocrConfidence },
    });
    recorded = true;
    const raw = String(json.choices?.[0]?.message?.content || '{}');
    const p = JSON.parse(raw.replace(/^```(?:json)?\n?|```$/gm, '').trim());
    const validVerdicts = ['agrees', 'disagrees', 'inconclusive'];
    return {
      verdict: validVerdicts.includes(p.verdict) ? p.verdict as JudgeResult['verdict'] : 'inconclusive',
      confidence: typeof p.confidence === 'number' ? Math.min(1, Math.max(0, p.confidence)) : 0.5,
      reasoning: String(p.reasoning || '').slice(0, 500),
    };
  } catch (e) {
    if (!recorded) {
      recordModelCall(sink, {
        service_code: 'judge', stage: 'verdict', model: 'gpt-4o',
        started: t0, err: e,
        meta: { max_tokens: 500, temperature: 0, ocr_confidence: ocrConfidence },
      });
    }
    return { verdict: 'inconclusive', confidence: 0.5, reasoning: 'Judge parse failed.' };
  }
}

// SHA-256 prefix (16 hex chars) for answer deduplication
export async function sha256short(text: string): Promise<string> {
  try {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);
  } catch { return 'hash_unavailable'; }
}

// ═══════════════════════════════════════════════════════════════════════════
// V3 SHADOW ROUTING GATE
// ═══════════════════════════════════════════════════════════════════════════
// WHY THIS EXISTS
//   Routing into this pipeline used to be `is_math` alone. That flag answers
//   "did the student work a math problem this turn?" and it is authored by the
//   classifier, which sees the conversation history. The pipeline needs a
//   strictly STRONGER precondition: the text it is about to hand to Solver A,
//   Solver B and the Judge must itself be a solvable problem statement,
//   because all three are instructed to solve it.
//
//   Production turns where the two diverged (observed 2026-08-03):
//     • "okk good" — a bare acknowledgement one turn after a radicals question.
//       The classifier carried the previous topic forward (Algebra / Exponents,
//       is_math=true), the shadow was handed the phrase "okk good", and both
//       solvers returned an empty answer. Row 3f52f205, confidence 0.200.
//     • "Give me a similar SAT/ACT question on this topic" — the problem lives
//       in Zero's OUTPUT, never in the student's input. The solvers were handed
//       the request sentence and returned "x = 2 or x = 3" and "20". Row
//       6f019c9d.
//   Each wrote an l3-shadow-v3 row, so each appeared in the Question Inspector
//   and each moved the solver-agreement and judge-verdict series that the
//   verification programme reads as signal.
//
// DIRECTION OF FAILURE — deliberately asymmetric, and the opposite way round
// from the domain scope guard, which fails open because refusing a real student
// is the expensive error. Nothing here is student-facing: a false REJECT costs
// one shadow sample and no one sees it, while a false ACCEPT poisons the corpus
// the verification programme is built on. But dropping a real math question
// would break "every math question is verified", so the rule is: reject only on
// POSITIVE evidence that there is nothing to solve — no mathematical content at
// all, or a request for a question to be generated. Anything carrying a digit,
// an operator, LaTeX or a math term is accepted, however vague.
//
// PURE AND SYNCHRONOUS. No model call: the pipeline is meant to be cheap enough
// to run on every math turn, and spending a classification call to decide
// whether to spend four more would defeat that. Deterministic input produces
// deterministic routing, which is what makes it testable.

export type ShadowRoutingReason =
  | 'image' | 'equation' | 'math_content'
  | 'empty_input' | 'generation_request' | 'no_math_content';

export interface ShadowRoutingDecision {
  eligible: boolean;
  reason: ShadowRoutingReason;
}

// Franco-Arabic ("Arabizi") spells Arabic sounds with digits — 3=ع, 7=ح, 2=ء,
// 5=خ, 9=ق — and Egyptian students write that way constantly. "3amel eh",
// "7aga", "2wel", "3am", "so2al" contain no numbers at all, so a bare digit test
// routes every Franco greeting straight into the pipeline.
//
// Counting letters alone does not separate the two — "3am" is Franco and "5cm"
// is a measurement, and both are one digit plus two letters. What separates
// them is HOW MANY letters ride along, because the letters beside a numeral in
// real math are a variable ("2x"), a question label ("Q17"), or a unit ("5cm"),
// and a Franco word's letter run is arbitrary ("3amel", "7aga", "2wel").
//
// Replayed over 500 production turns. An earlier form of this rule required the
// token to START with its digits, which silently dropped every worksheet
// reference ("Q17", "q36") and "2x2" — the exact false negative this gate must
// never produce.
const NUMERAL_SUFFIXES = new Set(
  ['cm', 'mm', 'km', 'kg', 'ml', 'hr', 'st', 'nd', 'rd', 'th', 'in', 'ft', 'sq']);

function hasNumericEvidence(s: string): boolean {
  // Arabic-Indic digits are never Franco — Franco is written in Latin script —
  // so ٠-٩ counts on sight.
  if (/[٠-٩]/.test(s)) return true;
  return (s.match(/[A-Za-z0-9]+/g) || []).some((tok) => {
    if (!/[0-9]/.test(tok)) return false;
    const letters = tok.replace(/[0-9]/g, '');
    // Bare digits ("1200"), or digits carrying one variable or label letter
    // ("2x", "x2", "Q17", "2x2") — a numeral. Two letters only when they are a
    // unit or an ordinal ("5cm", "3rd"). Anything longer is a Franco word.
    if (letters.length <= 1) return true;
    if (letters.length === 2) return NUMERAL_SUFFIXES.has(letters.toLowerCase());
    return false;
  });
}

// A relation symbol. Next to any operand it is the strongest single signal that
// the message STATES a problem rather than talks about one.
const SHADOW_RELATION_RE = /[=<>≤≥≠≈]/;
const SHADOW_OPERAND_RE  = /[0-9٠-٩A-Za-zء-ي]/;

// Operators that effectively never appear in conversational prose. Bare "-",
// "*" and "/" are excluded on purpose — hyphens, emphasis and "SAT/ACT" are all
// ordinary in chat, and any genuine use of them as operators arrives alongside
// digits, which hasNumericEvidence already catches.
const SHADOW_OPERATOR_RE = /[+×÷√^%∑∫π±]/;

// LaTeX / MathJax delimiters and macros. chat.html renders these and the
// classifier emits them, so they are a first-class signal.
const SHADOW_LATEX_RE = /\\\(|\\\[|\\frac|\\sqrt|\\times|\\div|\$[^$]+\$/;

// English math vocabulary. Deliberately EXCLUDES the bare topic word "math"
// ("I love math", "math is amazing" are small talk, not problems) and excludes
// short or collision-prone tokens — "log" (log in), "mean" (what do you mean),
// "mode", "find" (find my report), "sin"/"cos"/"tan".
const SHADOW_TERM_EN_RE = new RegExp('\\b(' + [
  'solve', 'simplify', 'factori[sz]e', 'factor', 'expand', 'evaluate', 'compute',
  'calculate', 'derivative', 'differentiate', 'integral', 'integrate', 'limit',
  'equation', 'inequality', 'expression', 'polynomial', 'quadratic', 'linear',
  'logarithm', 'exponent', 'radical', 'root', 'square', 'cube', 'squared',
  'sine', 'cosine', 'tangent', 'angle', 'triangle', 'circle', 'rectangle',
  'polygon', 'area', 'perimeter', 'circumference', 'volume', 'radius', 'diameter',
  'slope', 'intercept', 'coordinate', 'vertex', 'parabola', 'graph',
  'probability', 'permutation', 'combination', 'median', 'average', 'percent',
  'percentage', 'ratio', 'proportion', 'fraction', 'decimal', 'integer',
  'matrix', 'vector', 'sequence', 'numerator', 'denominator',
].join('|') + ')\\b', 'i');

// Arabic math vocabulary. Two traps, both of which this had to survive.
//
//   • JS \b is defined over ASCII word characters, so a naive test for "حل"
//     also fires inside "مرحلة" and every Arabic sentence routes in. Hence the
//     explicit non-letter boundary on both sides.
//   • Arabic is agglutinative at the edges. Requiring a hard boundary alone
//     then MISSES "المساحة" — the term is glued to the definite article — and
//     "حلها". So a short, closed set of proclitics and enclitics is allowed
//     between the boundary and the term, and nothing else is. "حلو" ("nice",
//     ubiquitous small talk) is rejected because "و" is not an enclitic, and
//     "مرحلة" is rejected because "مر" is not a proclitic.
const SHADOW_TERM_AR_SOURCE = [
  'احسب', 'أحسب', 'اوجد', 'أوجد', 'حل', 'بسط', 'بسّط', 'اختصر', 'عوض',
  'معادلة', 'معادلات', 'متباينة', 'مقدار', 'دالة', 'مشتقة', 'تكامل',
  'مساحة', 'محيط', 'حجم', 'مثلث', 'دائرة', 'مستطيل', 'زاوية', 'قطر',
  'ميل', 'احتمال', 'نسبة', 'تناسب', 'كسر', 'جذر',
  'متوسط', 'وسيط', 'متتابعة', 'مجموع', 'ناتج', 'قيمة',
].join('|');
const AR_LETTER     = '\\u0621-\\u064A';
// Definite article and its combinations, the one-letter particles, and the
// imperfect-verb prefixes — "احل", "نحل", "تحل", "يحل" are all how a student
// says "solve". The boundary requirement still holds in front of these, which
// is why "مرحلة" and "راحل" stay out: their "حل" is preceded by an Arabic
// letter that no proclitic can absorb.
const AR_PROCLITIC  = '(?:وال|فال|بال|كال|لل|ال|و|ف|ب|ك|ل|ي|ت|ن|أ|ا)?';
const AR_ENCLITIC   = '(?:ها|هم|هن|نا|ات|ين|ون|ه|ي|ك|ة|ت)?';
const SHADOW_TERM_AR_RE = new RegExp(
  `(?:^|[^${AR_LETTER}])${AR_PROCLITIC}(?:${SHADOW_TERM_AR_SOURCE})${AR_ENCLITIC}(?:[^${AR_LETTER}]|$)`);

// "Give me a similar question" — the student is asking Zero to PRODUCE a
// problem. Whatever gets produced lives in the answer, so the request sentence
// is not a problem statement and must not be solved.
const SHADOW_GENERATION_RES: RegExp[] = [
  // A verb of supply followed, within one clause, by a practice noun.
  /\b(give|gimme|send|show|make|generate|create|set|bring)\b[^.?!\n]{0,40}?\b(questions?|problems?|exercises?|quiz|mcqs?|practice)\b/i,
  // "another one", "one more question", "more practice", "a similar problem".
  /\b(another|one more|more|extra|similar|new)\b[^.?!\n]{0,24}?\b(questions?|problems?|exercises?|practice|one)\b/i,
  /\bquiz me\b/i,
  /\b(practice|sample|similar)\s+(questions?|problems?|exercises?)\b/i,
  // Arabic / Franco: هاتلي سؤال، عايز مسألة تانية، ابعتلي تمرين
  /(هاتلي|هات لي|اديني|ادّيني|ابعتلي|ابعت لي|اعطني|أعطني|عايز|عاوز|عايزة|محتاج)[^.؟!\n]{0,30}?(سؤال|أسئلة|اسئلة|مسأل|مسائل|تمرين|تمارين)/,
  /(سؤال|مسألة|تمرين)\s*(تاني|ثاني|آخر|اخر|جديد|كمان|زي ده|مشابه)/,
  /\b(hatli|edini|3ayez|3awez)\b[^.?!\n]{0,24}?\b(so2al|mas2ala|tamrin)\b/i,
];

/**
 * Decide whether the L3 shadow pipeline may run on a given input.
 *
 * Called with the EXACT inputs the pipeline would receive — on a turn that
 * resolved a worksheet reference that is the indexed question text and its
 * source image, not the student's bare phrase — so the gate judges the bytes
 * the solvers will actually see.
 *
 * @param questionText the text Solver A, Solver B and the Judge will be told to solve
 * @param hasImage     whether the pipeline will also receive an image
 */
export function isShadowEligibleInput(
  questionText: string | null | undefined,
  hasImage: boolean,
): ShadowRoutingDecision {
  // An upload is always a problem on this platform — the same axiom resolveScope
  // and the is_math classifier already run on. The text may legitimately be
  // empty or a bare "حل" / "help", and the solvers see the image directly, so
  // the text carries no routing weight once an image is present.
  if (hasImage) return { eligible: true, reason: 'image' };

  const t = String(questionText ?? '').trim();
  if (!t) return { eligible: false, reason: 'empty_input' };

  // A relation or LaTeX means the message states a problem, whatever else it
  // says around it. Checked BEFORE the generation rule on purpose, so
  // "another question: 2x+5=11" routes on its equation, not on its phrasing.
  if (SHADOW_LATEX_RE.test(t) ||
      (SHADOW_RELATION_RE.test(t) && SHADOW_OPERAND_RE.test(t))) {
    return { eligible: true, reason: 'equation' };
  }

  if (SHADOW_GENERATION_RES.some((re) => re.test(t))) {
    return { eligible: false, reason: 'generation_request' };
  }

  if (hasNumericEvidence(t) || SHADOW_OPERATOR_RE.test(t) ||
      SHADOW_TERM_EN_RE.test(t) || SHADOW_TERM_AR_RE.test(t)) {
    return { eligible: true, reason: 'math_content' };
  }

  return { eligible: false, reason: 'no_math_content' };
}

// L3 shadow pipeline orchestrator. Runs after Response() is returned.
// Writes telemetry to existing question_records row (UPDATE, not INSERT).
export async function runL3ShadowPipeline(opts: {
  sbAdmin: SupabaseAdminClient;
  recordId: string; userId: string;
  questionText: string; imageData: string | null; zeroAnswer: string;
  tutorFinalAnswer?: string;
  detectorMeta: Record<string, unknown>; startTime: number;
  requestId?: string; sessionId?: string | null; operation?: string | null;
  clientRequestId?: string | null;
  // V0-T06 segment key. Canonical taxonomy subtopic id (e.g. ALG_006), already
  // resolved by the taxonomy gate on the main path. Optional and defaulted to
  // null so every existing call site stays valid.
  lessonId?: string | null;
  // RC2 PR1 (R9). A hint turn publishes no final answer, so there is nothing
  // for the judge to compare. RECORDED ONLY here; PR2 is what makes it
  // inadmissible. Optional and defaulted so existing call sites stay valid.
  hintMode?: boolean;
}): Promise<void> {
  const { sbAdmin, recordId, userId, questionText, imageData, zeroAnswer, tutorFinalAnswer, detectorMeta, startTime } = opts;
  const hintMode = opts.hintMode === true;

  // v90: this pipeline runs entirely after the student response, so its four to
  // five model calls belong to a sink of its own — the main path has already
  // flushed by the time these fire. Flushed in the `finally` below.
  const teleSink: ModelCallRow[] = [];

  try {

  // 1. Extract math text (image questions only)
  const isImageQ = !!imageData;
  let mathText = questionText;
  if (isImageQ) {
    const extracted = await extractMathTextFromImage(imageData!, questionText, teleSink);
    if (extracted) mathText = extracted;
  }

  // 2. OCR ambiguity check (image questions only; text questions get confidence=1.0)
  const ocr = isImageQ
    ? await ocrAmbiguityCheck(mathText, imageData, teleSink)
    : { confidence: 1.0, flags: [], rerun_count: 0, rerun_changed: false, final_text: mathText };
  const solveText = ocr.rerun_changed ? ocr.final_text : mathText;

  // 3. Two parallel solver passes — for image questions, solvers see the image directly.
  const [solverA, solverB] = await Promise.all([
    runSolver(solveText, 0.1, isImageQ ? imageData : null, teleSink, 'solver_a'),
    runSolver(solveText, 0.3, isImageQ ? imageData : null, teleSink, 'solver_b'),
  ]);

  // 4. Solver agreement — robust normalization (strips "answer:"/"final answer:"/markdown)
  // plus deterministic numeric equivalence (fraction<->decimal, trailing zeros,
  // thousands separators, currency prefix). Fail-closed: only upgrades 0->1.
  const normA = normalizeFinalAnswer(solverA.final_answer);
  const normB = normalizeFinalAnswer(solverB.final_answer);
  const stringMatch = !!(normA && normA === normB);
  const solver_agreement = answersEquivalent(solverA.final_answer, solverB.final_answer) ? 1.0 : 0.0;
  // True when agreement was reached only via numeric equivalence, not identical
  // strings — used to word verification_reason precisely.
  const agreementViaEquivalence = solver_agreement === 1.0 && !stringMatch;

  // 5. Judge (uses OCR confidence for hard ocr_uncertain rule)
  const judge = await runJudge(solveText, zeroAnswer, solverA, solverB, isImageQ ? ocr.confidence : 1.0, tutorFinalAnswer, teleSink);

  // 5b. V0-T01 — answer-blind pre-commitment. OFF by default.
  // Deliberately sequenced AFTER runJudge: the legacy verdict is produced from
  // exactly the inputs it always was, in exactly the order it always was, so
  // this addition cannot perturb the series ai-monitor.html has been charting.
  const judgeAnswerBlind = judgeAnswerBlindEnabled();
  let precommit: { answer: string; raw: string } | null = null;
  let blind: { verdict: BlindVerdict; assorter: number } | null = null;
  if (judgeAnswerBlind) {
    precommit = await runJudgePrecommit(solveText, isImageQ ? imageData : null, teleSink);
    // The candidate is what Zero actually published — the tutor's final answer.
    blind = blindVerdictFrom(precommit.answer, tutorFinalAnswer ?? '');
  }

  // 5c. V0-T13 — forced-exploration selection. Recorded, never acted on.
  const explorationFrac  = explorationFraction();
  const forcedExploration = isForcedExploration(explorationFrac, Math.random());

  const pipeline_latency_ms = Date.now() - startTime;
  const isExpertTier = detectorMeta.tier === 'expert' || detectorMeta.gpt_tier === 'expert';

  // 6. Quality telemetry — surface solver evidence depth so the dashboard can
  //    distinguish "two solvers genuinely derived B" from "two solvers spat out 'B'".
  const LOW_QUALITY_REASONING_THRESHOLD = 50;
  const solver_answer_lengths    = [solverA.final_answer.length, solverB.final_answer.length];
  const solver_reasoning_lengths = [solverA.reasoning.length,    solverB.reasoning.length];
  const judge_reasoning_length   = judge.reasoning.length;
  const low_quality_solver       =
    solverA.reasoning.length < LOW_QUALITY_REASONING_THRESHOLD ||
    solverB.reasoning.length < LOW_QUALITY_REASONING_THRESHOLD;

  // 6b. RC2 PR1 (R9) — the evidence record. OBSERVED, NEVER ACTED ON.
  //
  // Everything below is computed from values the pipeline already has; no
  // extra model call, no change to any verdict. It exists so that a stored row
  // can later be classified as an RC1 extraction failure, a real tutor/solver
  // conflict, a judge false positive, solver disagreement or thin reasoning —
  // which is impossible today, because the string the judge was shown is
  // discarded the moment runJudge returns.
  //
  // Compared against solver A: when the solvers converge the choice is
  // immaterial, and when they do not, solver_convergence is already the
  // blocking precondition, so the comparison is recorded for measurement
  // rather than relied upon.
  const rc2TutorRaw   = (tutorFinalAnswer ?? '').trim().slice(0, 120);
  const rc2Tokens     = extractAnswerTokens(rc2TutorRaw);
  const rc2VsSolver   = tutorVsSolverFrom(rc2TutorRaw, solverA.final_answer);
  // A hint turn has no published answer by construction, so there is nothing
  // to compare. PR1 only records that; PR2 is what makes it inadmissible.
  const rc2Admissible = !hintMode && !!rc2TutorRaw;
  const rc2Blocking   = blockingPrecondition({
    ocrConfidence:       isImageQ ? ocr.confidence : 1.0,
    admissible:          rc2Admissible,
    tutorVsSolver:       rc2VsSolver,
    solversConverge:     solver_agreement === 1.0,
    reasoningSufficient: !low_quality_solver,
    judgeVerdict:        judge.verdict,
  });

  // verification_quality_score ∈ [0, 1]:
  //   0.40 * solver final-answer agreement
  //   0.30 * reasoning completeness  (both ≥50 chars → 1.0, scales down to 0)
  //   0.30 * judge confidence
  const reasoningCompleteness = Math.min(
    1,
    (Math.min(solverA.reasoning.length, LOW_QUALITY_REASONING_THRESHOLD) +
     Math.min(solverB.reasoning.length, LOW_QUALITY_REASONING_THRESHOLD)) /
      (2 * LOW_QUALITY_REASONING_THRESHOLD),
  );
  const verification_quality_score = Number(
    (0.40 * solver_agreement + 0.30 * reasoningCompleteness + 0.30 * judge.confidence).toFixed(3),
  );

  // Human-readable summary of WHY the score landed where it did.
  // Built deterministically from the same inputs so dashboards / admin tools
  // can show a one-line rationale without parsing the full meta blob.
  const reasonParts: string[] = [];
  if (judge.verdict === 'ocr_uncertain') {
    reasonParts.push('OCR confidence below 0.75 — verdict locked to ocr_uncertain.');
  } else {
    // Clause 1 — solver-vs-solver agreement (the solver_agreement metric).
    // Three cases: identical strings, numerically equivalent (different form),
    // or different. When strings differ but the judge ruled them equivalent,
    // say so rather than asserting "different" — that contradicted judge_verdict.
    reasonParts.push(
      solver_agreement === 1.0
        ? (agreementViaEquivalence
            ? 'Solvers A and B produced equivalent answers (different form).'
            : 'Solvers A and B produced matching answers.')
        : judge.verdict === 'agrees'
          ? 'Solver answers differed in form but were judged equivalent.'
          : 'Solvers A and B produced different answers.',
    );
    // Clause 2 — the judge ruling (solver-vs-tutor). Always states the verdict
    // verbatim, so verification_reason can never contradict judge_verdict.
    reasonParts.push(
      judge.verdict === 'agrees'    ? "The judge confirmed the solution matches the tutor's answer."
        : judge.verdict === 'disagrees' ? "The judge flagged a mismatch with the tutor's answer."
        : 'The judge was inconclusive.',
    );
    if (reasoningCompleteness >= 1.0) {
      reasonParts.push('Both produced complete reasoning chains.');
    } else if (reasoningCompleteness >= 0.5) {
      reasonParts.push('Reasoning was partial — at least one solver was short.');
    } else {
      reasonParts.push('Solver outputs were short; reasoning quality was weak.');
    }
    reasonParts.push(
      judge.confidence >= 0.8 ? 'Judge confidence was high.'
        : judge.confidence >= 0.5 ? 'Judge confidence was moderate.'
        : 'Judge confidence was low.',
    );
  }
  const verification_reason = reasonParts.join(' ');

  // 7. Merge Phase 1 detector meta + Phase 2A pipeline meta
  const verificationMeta = {
    ...detectorMeta,
    pipeline_version:            L3_PIPELINE_VERSION,
    ocr_ambiguity_flags:         ocr.flags,
    ocr_rerun_count:             ocr.rerun_count,
    ocr_rerun_changed:           ocr.rerun_changed,
    solver_answers:              [solverA.final_answer.slice(0, 200), solverB.final_answer.slice(0, 200)],
    solver_reasonings:           [solverA.reasoning.slice(0, 2000),   solverB.reasoning.slice(0, 2000)],
    solver_raw_outputs:          [solverA.raw_output.slice(0, 1200),  solverB.raw_output.slice(0, 1200)],
    solver_answer_lengths,
    solver_reasoning_lengths,
    solver_model:                'gpt-4o-mini',
    solver_temperatures:         [0.1, 0.3],
    solver_max_tokens:           1200,
    solver_sees_image:           isImageQ,
    judge_model:                 'gpt-4o',
    judge_reasoning:             judge.reasoning,
    judge_reasoning_length,
    low_quality_solver,
    verification_quality_score,
    verification_reason,
    zero_answer_hash:            await sha256short(zeroAnswer),
    pipeline_latency_ms,
    expert_trigger:              isExpertTier,

    // ── Truth System v2 V0 — APPEND-ONLY additions ──────────────────────────
    // Every key above is untouched. ai-monitor.html reads this object's
    // internal shape (pipeline_version, verification_quality_score, v2_tier,
    // reasons, tier, pipeline_latency_ms) and already handles version skew, so
    // new keys are safe and renamed or removed keys are not. Nothing may ever
    // be renamed here.
    policy_version:              POLICY_VERSION,
    plan_id:                     PLAN_ID,
    forced_exploration:          forcedExploration,
    exploration_fraction:        explorationFrac,
    judge_answer_blind:          judgeAnswerBlind,

    // ── RC2 PR1 (R9) — the evidence record. Append-only, telemetry only.
    // Stored RAW rather than hashed on purpose: a hash proves two runs saw the
    // same string, which is not the question. The question is WHICH string,
    // because that is what separates an RC1 extraction failure from a genuine
    // answer conflict. zero_answer_hash above is unchanged and stays a hash.
    rc2_tutor_answer_raw:        (tutorFinalAnswer ?? '').trim().slice(0, 120),
    rc2_tutor_tokens:            rc2Tokens.slice(0, 12),
    rc2_tutor_vs_solver:         rc2VsSolver,
    rc2_solvers_converge:        solver_agreement === 1.0,
    rc2_reasoning_sufficient:    !low_quality_solver,
    rc2_admissible:              rc2Admissible,
    rc2_hint_mode:               hintMode,
    // The judge's UNCLAMPED opinion. Identical to judge_verdict today; recorded
    // separately so that when PR3's clamp lands, the raw opinion it overrode is
    // still on the record instead of being silently replaced.
    rc2_judge_raw_verdict:       judge.verdict,
    rc2_blocking_precondition:   rc2Blocking,

    ...(judgeAnswerBlind ? {
      judge_precommit_model:     'gpt-4o',
      judge_precommit_answer:    (precommit?.answer ?? '').slice(0, 120),
      judge_blind_verdict:       blind?.verdict  ?? null,
      judge_blind_assorter:      blind?.assorter ?? null,
    } : {}),
  };

  // 8. UPDATE question_records — all Phase 0 columns, nullable
  const { error: updateErr } = await sbAdmin
    .from('question_records')
    .update({
      verification_status:     judge.verdict === 'ocr_uncertain' ? 'ocr_uncertain' : 'pipeline_complete',
      verification_confidence: judge.confidence,
      solver_count:            2,
      solver_agreement,
      judge_verdict:           judge.verdict,
      ocr_confidence:          isImageQ ? ocr.confidence : null,
      verification_path:       'l3_shadow_pipeline',
      verification_meta:       verificationMeta,
    })
    .eq('id', recordId)
    .eq('user_id', userId);

  if (updateErr) {
    console.log('[ai-tutor] l3-pipeline-db-error', JSON.stringify({
      uid: userId.slice(0, 8), record_id: recordId, msg: updateErr.message,
    }));
  }

  // 8b. V0-T06/T10/T13 — the decision row. Written BESIDE the update above,
  // never instead of it: question_records keeps receiving exactly what it
  // always did, and this is a second, identifier-free store.
  //
  // Isolated by construction. The whole write is wrapped, its failure is
  // logged and swallowed, and it is placed AFTER the question_records update so
  // that even a thrown error cannot cost L3 Shadow its telemetry. The decision
  // log is a measurement substrate; it may never be able to damage the thing it
  // measures.
  //
  // Idempotent on decision_uid, matching flushModelCalls' ON CONFLICT pattern.
  // The uid is minted OUTSIDE the try, when the decision is made rather than
  // when it is written — the same reason ai_model_calls mints call_uid at
  // observation time (Phase 3 F1). Minted inside, a retry would generate a new
  // uid and the ON CONFLICT clause would be decorative. The pipeline writes
  // once today; this is what makes adding a retry a one-line change instead of
  // a correctness question.
  const decisionUid = crypto.randomUUID();
  if (DECISION_LOG_ENABLED) {
    try {
      const decisionRow = buildDecisionRow({
        decisionUid,
        decidedAt:           new Date(startTime + pipeline_latency_ms).toISOString(),
        pipelineVersion:     L3_PIPELINE_VERSION,
        questionRecordId:    recordId,
        requestId:           opts.requestId ?? null,
        clientRequestId:     opts.clientRequestId ?? null,
        lessonId:            opts.lessonId ?? null,
        difficultyBin:       (detectorMeta.tier as string) ?? null,
        forcedExploration,
        explorationFraction: explorationFrac,
        judgeAnswerBlind,
        blindVerdict:        blind?.verdict  ?? null,
        blindAssorter:       blind?.assorter ?? null,
        legacyJudgeVerdict:  judge.verdict,
        solverAgreement:     solver_agreement,
        pipelineLatencyMs:   pipeline_latency_ms,
      });
      const { error: decisionErr } = await sbAdmin
        .from('verification_decisions')
        .upsert([decisionRow], { onConflict: 'decision_uid', ignoreDuplicates: true });
      if (decisionErr) {
        console.log('[ai-tutor] v0-decision-log-error', JSON.stringify({
          record_id: recordId, msg: decisionErr.message,
        }));
      }
    } catch (e) {
      console.log('[ai-tutor] v0-decision-log-error', JSON.stringify({
        record_id: recordId, msg: e instanceof Error ? e.message : String(e),
      }));
    }
  }

  // 9. Structured telemetry
  console.log('[ai-tutor] verification-shadow', JSON.stringify({
    uid:                         userId.slice(0, 8),
    record_id:                   recordId,
    pipeline_version:            L3_PIPELINE_VERSION,
    verification_tier:           detectorMeta.tier ?? null,
    ocr_confidence:              isImageQ ? ocr.confidence : null,
    ocr_ambiguity_flags:         ocr.flags,
    ocr_rerun_count:             ocr.rerun_count,
    ocr_rerun_changed:           ocr.rerun_changed,
    solver_agreement,
    solver_answer_lengths,
    solver_reasoning_lengths,
    judge_reasoning_length,
    low_quality_solver,
    judge_model:                 'gpt-4o',
    judge_verdict:               judge.verdict,
    verification_confidence:     judge.confidence,
    verification_quality_score,
    verification_reason,
    expert_trigger:              isExpertTier,
    pipeline_latency_ms,
    // V0 — the same additions, on the log line, so the comparison window is
    // readable from logs alone before anything queries the new table.
    policy_version:              POLICY_VERSION,
    plan_id:                     PLAN_ID,
    forced_exploration:          forcedExploration,
    exploration_fraction:        explorationFrac,
    judge_answer_blind:          judgeAnswerBlind,
    judge_blind_verdict:         blind?.verdict  ?? null,
    judge_blind_assorter:        blind?.assorter ?? null,
  }));

  } finally {
    // v90: flush the pipeline's model calls whatever happened above. `finally`
    // covers the early-return and throw paths, so a pipeline failure still
    // records the spend it already incurred — money is spent whether or not
    // the verification completed.
    if (opts.requestId) {
      await flushModelCalls(sbAdmin, teleSink, {
        requestId:        opts.requestId,
        clientRequestId:  opts.clientRequestId ?? null,
        questionRecordId: recordId,
        sessionId:        opts.sessionId ?? null,
        userId,
        operation:        opts.operation ?? null,
      });
    }
  }
}

