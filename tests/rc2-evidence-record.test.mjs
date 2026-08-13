// RC2 PR1 — the evidence record (audit requirement R9).
//
// WHAT THIS IS FOR
// ────────────────
// Today a verdict is stored with no record of what produced it. `tutorFinalAnswer`
// reaches runJudge and blindVerdictFrom and is then DISCARDED; verification_meta
// keeps only `zero_answer_hash`, a hash of the whole explanation. So for any
// stored row it is impossible to tell apart:
//
//   • an RC1 extraction failure        • a real tutor/solver conflict
//   • a judge false positive           • solver disagreement
//   • insufficient reasoning
//
// This suite pins the record that makes those separable. It is TELEMETRY ONLY:
// no verdict changes, no student-visible behaviour changes, no migration
// (verification_meta is jsonb).
//
// THE REDUCER IS THE LOAD-BEARING PART
// ────────────────────────────────────
// The naive comparison — answersEquivalent(tutorFinalAnswer, solverAnswer) —
// is WRONG, and production proves it. RC1 returns prose, not a token:
//
//   tutor "The sum of the solutions is \(\frac{26}{5}\), which corresponds to
//          option D."                                    solver "26/5"
//
// Same answer. answersEquivalent says false. That single defect is why the
// answer-blind judge reads 100% `disagrees` (32/32 on 2026-08-13, zero
// abstentions) — it is measuring incomparability, not correctness.
//
// So the reducer is MATCH-DOMINANT and refuses to guess:
//   tokens empty                        -> incomparable
//   ANY token equivalent to the solver   -> match
//   exactly one token, not equivalent    -> conflict
//   several tokens, none equivalent      -> incomparable   (never `conflict`)
//
// The last line is the safety property: an ambiguous tutor sentence can never
// manufacture a conflict. `conflict` requires a single unambiguous token.
//
// Sections E1/E2 run against VERBATIM strings pulled from production rows on
// 2026-08-13 (record ids in the comments), so this is measured against real
// tutor output rather than invented fixtures.
import { suite } from './_assert.mjs';
import { read, slice, importTS } from './_source.mjs';

const t = suite('rc2-evidence-record');
const SRC = read('supabase/functions/_shared/verification.core.ts');

const region = slice(SRC,
  '// ── RC2 evidence record ──────────────────────────────────────────────────',
  '// ── end RC2 evidence record',
  'rc2 evidence helpers');
// The region re-exports nothing; answersEquivalent lives above it, so the slice
// carries both or the reducer cannot run.
const deps = slice(SRC, 'export function normalizeFinalAnswer',
  '// ── RC2 evidence record', 'answer equivalence');
const mod = await importTS(deps + '\n' + region, []);
const { extractAnswerTokens, tutorVsSolverFrom, blockingPrecondition } = mod;

// ── Verbatim production strings ─────────────────────────────────────────────
// Pulled from question_records on 2026-08-13. Kept exactly as stored, escapes
// and all — a cleaned-up copy would test a string production never produces.
const PROD = {
  // 42b92375 — legacy judge said "agrees", blind said "disagrees"
  minus25: 'The value of \\(c\\) is \\(-25\\), which corresponds to option C.',
  // 2abe2534 — legacy "agrees", blind "disagrees"; tutor and solver AGREE (26/5)
  frac26_5: 'The sum of the solutions is \\(\\frac{26}{5}\\), which corresponds to option D.',
  // ac84a623 — a HINT response: no final answer exists at all
  hint: 'The discriminant \\(b^2 - 4ac\\) needs to be zero for the equation to have one solution. Use this to find the value of \\(c',
};

// ───────────────────────────────────────────────────────────────────────────
t.section('E1. Token extraction on REAL tutor prose');
{
  const a = extractAnswerTokens(PROD.minus25);
  t.ok('the numeric answer is recovered from prose', a.some(x => x === '-25' || x === '−25'), JSON.stringify(a));
  t.ok('the option letter is also recovered as a candidate', a.some(x => /^C$/i.test(x)), JSON.stringify(a));
  t.ok('so the sentence is AMBIGUOUS — more than one candidate', a.length >= 2, JSON.stringify(a));

  const b = extractAnswerTokens(PROD.frac26_5);
  t.ok('a LaTeX fraction becomes a comparable token', b.some(x => x === '26/5'), JSON.stringify(b));

  t.is('empty input yields no tokens', extractAnswerTokens(''), []);
  t.is('null-ish input yields no tokens', extractAnswerTokens(null), []);
}

t.section('E2. MATCH-DOMINANT reducer — the safety property');
{
  // The two records that today produce a spurious `disagrees` must read `match`.
  t.is('prose containing -25 vs solver -25 -> match',
    tutorVsSolverFrom(PROD.minus25, '-25'), 'match');
  t.is('prose containing 26/5 vs solver 26/5 -> match',
    tutorVsSolverFrom(PROD.frac26_5, '26/5'), 'match');
  t.is('and equivalent forms still match', tutorVsSolverFrom(PROD.frac26_5, '5.2'), 'match');

  // Ambiguity may NEVER become a conflict.
  t.is('several candidates, none matching -> incomparable, NOT conflict',
    tutorVsSolverFrom(PROD.minus25, '999'), 'incomparable');

  // A single unambiguous token that genuinely differs is the only route to conflict.
  t.is('one token, differs -> conflict', tutorVsSolverFrom('42', '43'), 'conflict');
  t.is('one token, equivalent -> match', tutorVsSolverFrom('9/4', '2.25'), 'match');

  // Nothing to compare.
  t.is('no tokens -> incomparable', tutorVsSolverFrom('I hope that helps!', '7'), 'incomparable');
  t.is('empty tutor answer -> incomparable', tutorVsSolverFrom('', '7'), 'incomparable');
  t.is('empty solver answer -> incomparable', tutorVsSolverFrom('42', ''), 'incomparable');
  t.is('hint prose with no answer -> never conflict',
    tutorVsSolverFrom(PROD.hint, '-25') === 'conflict', false);
}

t.section('E3. blockingPrecondition names the FIRST failing gate, and nothing else');
{
  const ok = { ocrConfidence: 1, admissible: true, tutorVsSolver: 'match',
               solversConverge: true, reasoningSufficient: true, judgeVerdict: 'agrees' };
  t.is('all clear -> null', blockingPrecondition(ok), null);
  t.is('low OCR wins over everything', blockingPrecondition({ ...ok, ocrConfidence: 0.5, admissible: false }), 'ocr');
  t.is('inadmissible', blockingPrecondition({ ...ok, admissible: false }), 'admissible');
  t.is('incomparable', blockingPrecondition({ ...ok, tutorVsSolver: 'incomparable' }), 'comparable');
  t.is('solvers diverge', blockingPrecondition({ ...ok, solversConverge: false }), 'solver_convergence');
  t.is('thin reasoning', blockingPrecondition({ ...ok, reasoningSufficient: false }), 'reasoning');
  t.is('judge downgraded', blockingPrecondition({ ...ok, judgeVerdict: 'inconclusive' }), 'judge_downgrade');
  t.is('a conflict with everything else clear is NOT blocked',
    blockingPrecondition({ ...ok, tutorVsSolver: 'conflict', judgeVerdict: 'disagrees' }), null);
}

t.section('E4. The record is wired into verification_meta, append-only');
{
  const meta = slice(SRC, 'const verificationMeta = {', '\n  };', 'verificationMeta');
  for (const k of ['rc2_tutor_answer_raw', 'rc2_tutor_tokens', 'rc2_tutor_vs_solver',
                   'rc2_solvers_converge', 'rc2_reasoning_sufficient', 'rc2_admissible',
                   'rc2_hint_mode', 'rc2_judge_raw_verdict', 'rc2_blocking_precondition']) {
    t.ok(`meta carries ${k}`, new RegExp(`\\b${k}:`).test(meta), meta.slice(0, 200));
  }

  // Every pre-existing key must survive. ai-monitor.html reads this object's
  // internal shape; a rename is a dashboard outage, not a refactor.
  for (const k of ['pipeline_version', 'ocr_ambiguity_flags', 'ocr_rerun_count', 'ocr_rerun_changed',
                   'solver_answers', 'solver_reasonings', 'solver_raw_outputs', 'solver_model',
                   'solver_temperatures', 'solver_max_tokens', 'solver_sees_image', 'judge_model',
                   'judge_reasoning', 'zero_answer_hash', 'expert_trigger', 'policy_version',
                   'plan_id', 'forced_exploration', 'exploration_fraction', 'judge_answer_blind']) {
    t.ok(`pre-existing key ${k} still present`, new RegExp(`\\b${k}:`).test(meta), k);
  }
}

t.section('E5. The tutor answer is stored RAW — a hash cannot separate the failure modes');
{
  const meta = slice(SRC, 'const verificationMeta = {', '\n  };', 'verificationMeta');
  t.ok('rc2_tutor_answer_raw is not hashed',
    !/rc2_tutor_answer_raw:\s*await sha256short/.test(meta), meta);
  t.ok('it is sourced from the same value runJudge receives',
    /rc2_tutor_answer_raw:\s*\(tutorFinalAnswer/.test(meta), meta);
  t.ok('zero_answer_hash is untouched and still a hash',
    /zero_answer_hash:\s*await sha256short\(zeroAnswer\)/.test(meta), meta);
}

t.section('E6. NO BEHAVIOUR CHANGE — the verdict path is untouched');
{
  // PR1 is telemetry. If any of these moved, it is not a telemetry PR.
  t.ok('the judge is still called with exactly the arguments it had',
    /const judge = await runJudge\(solveText, zeroAnswer, solverA, solverB, isImageQ \? ocr\.confidence : 1\.0, tutorFinalAnswer, teleSink\)/.test(SRC), 'runJudge call changed');
  t.ok('judge_verdict is still written straight from the judge',
    /judge_verdict:\s*judge\.verdict/.test(SRC), 'judge_verdict no longer comes from the judge');
  t.ok('verification_status logic is unchanged',
    /verification_status:\s*judge\.verdict === 'ocr_uncertain' \? 'ocr_uncertain' : 'pipeline_complete'/.test(SRC), 'status logic changed');
  t.ok('solver_agreement is still the deterministic answersEquivalent result',
    /const solver_agreement = answersEquivalent\(solverA\.final_answer, solverB\.final_answer\) \? 1\.0 : 0\.0/.test(SRC), 'solver_agreement changed');
  t.ok('the quality score formula is unchanged',
    SRC.includes('0.40 * solver_agreement + 0.30 * reasoningCompleteness + 0.30 * judge.confidence'), 'score formula changed');
  t.ok('no clamp/envelope resolver has been introduced yet — that is PR3',
    !/rc2_verdict_gated|resolveVerdictEnvelope/.test(SRC), 'PR3 scope leaked into PR1');
}

t.done();
