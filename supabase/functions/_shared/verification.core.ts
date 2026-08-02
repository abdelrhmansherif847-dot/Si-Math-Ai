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
}): Promise<void> {
  const { sbAdmin, recordId, userId, questionText, imageData, zeroAnswer, tutorFinalAnswer, detectorMeta, startTime } = opts;

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

