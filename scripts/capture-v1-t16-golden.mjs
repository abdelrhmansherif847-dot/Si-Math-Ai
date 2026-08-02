#!/usr/bin/env node
/**
 * capture-v1-t16-golden.mjs — record the L3 verification pipeline's exact
 * outputs so the V1-T16 extraction can be proven behaviour-preserving.
 *
 * WHY THIS EXISTS
 *   V1-T16 moves the pipeline out of ai-tutor/index.ts into
 *   _shared/verification.core.ts. The refactor is only worth anything if it is
 *   provably pure, and "I read the diff" is not proof. This drives the pipeline
 *   with fully deterministic stubs and records every artefact it produces:
 *
 *     • the question_records UPDATE payload (verification_meta and its columns)
 *     • the verification_decisions row
 *     • the ai_model_calls rows (which provider calls were made, in order)
 *     • the console telemetry line
 *
 *   tests/verification-core-parity.test.mjs replays the same scenarios through
 *   the extracted module and asserts deep equality against the file this
 *   writes. A single differing byte fails the suite.
 *
 * DETERMINISM
 *   The pipeline reads the clock, crypto.randomUUID and Math.random. All three
 *   are stubbed to fixed sequences here, so the only thing that can vary
 *   between a capture and a replay is the code under test.
 *
 * USAGE
 *   node --experimental-strip-types --no-warnings scripts/capture-v1-t16-golden.mjs [--source=<pre|post>]
 *     pre  (default) load the pipeline from supabase/functions/ai-tutor/index.ts
 *     post              load it from supabase/functions/_shared/verification.core.ts
 *
 *     --out=<path>      write elsewhere (used by the parity suite so a failing
 *                       run cannot overwrite its own reference)
 *
 *   Writes tests/fixtures/v1-t16-golden.json by default.
 *   Committed as the provenance of that fixture — re-runnable, not a one-off.
 */
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { tmpdir } from 'node:os';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = (process.argv.find(a => a.startsWith('--source=')) || '--source=pre').split('=')[1];
// --out lets the parity suite capture to a scratch path instead of overwriting
// the committed golden, so a regression can never silently rewrite its own
// reference. Without it, a failing run would "fix" itself.
const OUT = (process.argv.find(a => a.startsWith('--out=')) || '').split('=')[1] || null;

// ── Deterministic runtime ───────────────────────────────────────────────────
// Installed before the module under test is imported, because it reads these
// at call time. FIXED_NOW is arbitrary but must never change once goldens
// exist, or every latency and timestamp in the fixture shifts.
const FIXED_NOW = 1785600000000;
let uuidCounter = 0;
let randomCounter = 0;
let loadCounter = 0;   // module-cache buster; Date.now() is stubbed so it cannot serve

globalThis.Date.now = () => FIXED_NOW;
// globalThis.crypto is a getter-only property in Node, so the object is patched
// in place rather than replaced. crypto.subtle is left real — sha256short must
// produce genuine digests or the fixture would not pin the hashing behaviour.
Object.defineProperty(globalThis.crypto, 'randomUUID', {
  configurable: true,
  value: () => `00000000-0000-4000-8000-${String(++uuidCounter).padStart(12, '0')}`,
});
globalThis.Math.random = () => {
  // Fixed repeating sequence, so the forced-exploration draw is reproducible.
  const seq = [0.01, 0.42, 0.77, 0.99];
  return seq[randomCounter++ % seq.length];
};

// ── Canned provider responses ───────────────────────────────────────────────
// Keyed by the stage the request is for, inferred from the outgoing body. The
// pipeline makes several calls per item and the fixture must pin which model
// was asked what, in what order.
function chat(content) {
  return { choices: [{ message: { content } }], usage: { prompt_tokens: 100, completion_tokens: 20 } };
}

function classifyRequest(body) {
  // Flatten EVERY message, including multipart content arrays. The OCR
  // extraction call sends a single user message whose content is an array of
  // {type:'text'} / {type:'image_url'} parts — an earlier version of this
  // function only looked at messages[0].content as a string and messages[1],
  // so it classified that call as "unknown", the harness threw, the pipeline
  // swallowed the error and fell back to the text path. The image scenario
  // silently tested nothing. Do not narrow this again.
  const flat = (c) => typeof c === 'string' ? c
    : Array.isArray(c) ? c.map(p => p?.text ?? p?.type ?? '').join(' ') : '';
  const all = (body.messages ?? []).map(m => `${m.role}: ${flat(m.content)}`).join('\n');
  if (/precise mathematician/i.test(all))            return 'precommit';
  if (/precise math solver/i.test(all))              return 'solver';
  if (/strict math verification judge/i.test(all))   return 'judge';
  if (/Re-extract this math expression/i.test(all))  return 'ocr_rerun';
  if (/Extract the .*math question/i.test(all))      return 'ocr_extract';
  return 'unknown';
}

// ── Scenarios ───────────────────────────────────────────────────────────────
// Chosen to exercise every branch that writes a different artefact: agreement,
// disagreement, the OCR hard gate, judge parse failure, and both states of the
// answer-blind flag.
const SCENARIOS = [
  {
    name: 'text_agree_blind_off',
    env: {},
    responses: { solver: 'Reasoning:\nDivide both sides by 6.\n6x = 252 so x = 42.\n\nFinal Answer: 42',
                 judge: '{"verdict":"agrees","confidence":0.92,"reasoning":"Both solvers derived 42. Tutor matches."}' },
    opts: { questionText: 'If 6x = 252, what is x?', imageData: null,
            zeroAnswer: 'Divide both sides by 6 to get x = 42.', tutorFinalAnswer: '42',
            detectorMeta: { tier: 'easy', reasons: ['short_single_concept'] }, lessonId: 'ALG_006' },
  },
  {
    name: 'text_agree_blind_on',
    env: { JUDGE_ANSWER_BLIND: 'true' },
    responses: { precommit: 'Final Answer: 42',
                 solver: 'Reasoning:\nDivide both sides by 6.\n6x = 252 so x = 42.\n\nFinal Answer: 42',
                 judge: '{"verdict":"agrees","confidence":0.92,"reasoning":"Both solvers derived 42. Tutor matches."}' },
    opts: { questionText: 'If 6x = 252, what is x?', imageData: null,
            zeroAnswer: 'Divide both sides by 6 to get x = 42.', tutorFinalAnswer: '42',
            detectorMeta: { tier: 'easy', reasons: ['short_single_concept'] }, lessonId: 'ALG_006' },
  },
  {
    name: 'text_blind_disagrees',
    env: { JUDGE_ANSWER_BLIND: 'true' },
    responses: { precommit: 'Final Answer: 7',
                 solver: 'Reasoning:\nWork through it.\n\nFinal Answer: 42',
                 judge: '{"verdict":"agrees","confidence":0.8,"reasoning":"Solvers agree with tutor."}' },
    opts: { questionText: 'If 6x = 252, what is x?', imageData: null,
            zeroAnswer: 'x = 42', tutorFinalAnswer: '42',
            detectorMeta: { tier: 'medium' }, lessonId: 'ALG_006' },
  },
  {
    name: 'text_solver_mismatch_short_reasoning',
    env: {},
    responses: { solver: 'B', judge: '{"verdict":"inconclusive","confidence":0.3,"reasoning":"Bare letters only."}' },
    opts: { questionText: 'Which option is correct?', imageData: null,
            zeroAnswer: 'The answer is B.', tutorFinalAnswer: 'B',
            detectorMeta: { tier: 'hard', gpt_tier: 'hard' }, lessonId: 'GEO_007' },
  },
  {
    name: 'image_ocr_low_confidence',
    env: {},
    responses: { ocr_extract: 'Solve 4667 / 7 = ?', ocr_rerun: 'Solve 4667 / 7 = ?',
                 solver: 'Reasoning:\nDivide.\n\nFinal Answer: 667',
                 judge: '{"verdict":"agrees","confidence":0.9,"reasoning":"ok"}' },
    opts: { questionText: 'help', imageData: 'data:image/png;base64,AAAA',
            zeroAnswer: '667', tutorFinalAnswer: '667',
            detectorMeta: { tier: 'medium' }, lessonId: null },
  },
  {
    // OCR confidence lands exactly on 0.85 — the rerun boundary — via the
    // coarse no_operator_sign flag alone (operators present, no minus sign,
    // no structural flags, no 4-digit number). 0.85 < 0.85 is false, so NO
    // rerun fires and the judge runs normally. Without this the rerun
    // threshold is untested: every other image case sits far below it.
    name: 'image_clean_boundary_no_rerun',
    env: {},
    responses: { ocr_extract: 'Solve 3 + 4 = ?',
                 solver: 'Reasoning:\nAdd the two numbers together carefully.\n\nFinal Answer: 7',
                 judge: '{"verdict":"agrees","confidence":0.88,"reasoning":"Straightforward."}' },
    opts: { questionText: 'help me', imageData: 'data:image/png;base64,BBBB',
            zeroAnswer: '7', tutorFinalAnswer: '7',
            detectorMeta: { tier: 'easy' }, lessonId: 'ALG_001' },
  },
  {
    // Solver A and B differ by 5e-9 relative — inside a 1e-8 tolerance but
    // OUTSIDE the 1e-9 the code actually uses, so answersEquivalent must return
    // false and solver_agreement must be 0. This is the only scenario that pins
    // the equivalence tolerance; without it, widening that constant silently
    // flips genuinely different answers to "agreeing".
    name: 'solver_near_equal_below_tolerance',
    env: {},
    responses: { solver: ['Reasoning:\nCompute the value precisely here.\n\nFinal Answer: 1',
                          'Reasoning:\nCompute the value precisely here.\n\nFinal Answer: 1.000000005'],
                 judge: '{"verdict":"inconclusive","confidence":0.5,"reasoning":"Solvers differ slightly."}' },
    opts: { questionText: 'Evaluate the limit to nine decimal places.', imageData: null,
            zeroAnswer: '1', tutorFinalAnswer: '1',
            detectorMeta: { tier: 'hard' }, lessonId: 'ALG_010' },
  },
  {
    name: 'judge_parse_failure',
    env: { JUDGE_ANSWER_BLIND: 'true' },
    responses: { precommit: '', solver: 'Reasoning:\nSteps here that are long enough to count.\n\nFinal Answer: 5',
                 judge: 'not json at all' },
    opts: { questionText: 'What is 2+3?', imageData: null,
            zeroAnswer: '5', tutorFinalAnswer: '5',
            detectorMeta: { tier: 'easy' }, lessonId: 'ALG_001' },
  },
];

// ── Fake Supabase admin client ──────────────────────────────────────────────
// Captures every write the pipeline attempts, in order, without a network.
function makeFakeAdmin(capture) {
  return {
    from(table) {
      return {
        update(payload) {
          const rec = { table, op: 'update', payload, eq: [] };
          const chain = {
            eq(col, val) { rec.eq.push([col, val]); return chain; },
            then(res) { capture.writes.push(rec); return Promise.resolve({ error: null }).then(res); },
          };
          return chain;
        },
        upsert(rows, opts) {
          capture.writes.push({ table, op: 'upsert', rows, opts });
          return Promise.resolve({ error: null });
        },
        delete() { return { eq: () => Promise.resolve({ error: null }) }; },
        insert() { return Promise.resolve({ error: null }); },
      };
    },
  };
}

// ── Load the pipeline ───────────────────────────────────────────────────────
async function loadPipeline(env) {
  const denoStub = `
declare const globalThis: any;
(globalThis as any).Deno = { env: { get: (k: string) => (${JSON.stringify(env)} as any)[k] } };
`;
  if (SOURCE === 'post') {
    // Post-refactor: import the extracted module directly. Deno globals must be
    // present before module evaluation, because it reads env at module scope.
    globalThis.Deno = { env: { get: (k) => env[k] } };
    const mod = await import(pathToFileURL(
      resolve(REPO, 'supabase/functions/_shared/verification.core.ts')).href + `?v=${++loadCounter}`);
    return mod;
  }
  // Pre-refactor: take the real index.ts, neutralise its two top-level side
  // effects (the taxonomy side-effect import and the serve() call), and append
  // an export list. This exercises the ACTUAL shipped bytes, not a copy.
  let src = readFileSync(resolve(REPO, 'supabase/functions/ai-tutor/index.ts'), 'utf8');
  // taxonomy.core.js is UMD: it attaches globalThis.Taxonomy under Deno but not
  // under Node's ESM loader. Evaluate it CommonJS-style and publish the result
  // as the global the Edge Function expects, then drop the side-effect import.
  if (!globalThis.Taxonomy) {
    const tsrc = readFileSync(resolve(REPO, 'supabase/functions/_shared/taxonomy.core.js'), 'utf8');
    const m = { exports: {} };
    new Function('module', 'exports', tsrc)(m, m.exports);
    globalThis.Taxonomy = m.exports;
  }
  src = src.replace("import '../_shared/taxonomy.core.js';", '');
  // Node's ESM loader cannot fetch https: specifiers, so the two Deno-only
  // imports are replaced by local stand-ins. Neither is used by the pipeline:
  // serve() only wires the HTTP handler, and createClient is referenced solely
  // as a TYPE (ReturnType<typeof createClient>) — the pipeline always receives
  // its client via opts.sbAdmin, which the harness supplies.
  src = src.replace(/^import \{ serve \} from 'https:[^']*';$/m,
    'const serve = (_h: unknown) => {};');
  src = src.replace(/^import \{ createClient \} from 'https:[^']*';$/m,
    'const createClient = (..._a: unknown[]) => ({} as Record<string, unknown>);');
  // serve(handler) starts an HTTP listener; neutralise the call, keep the handler.
  src = src.replace(/\nserve\(/, '\nconst __unusedServe = (');
  const exports = ['runL3ShadowPipeline', 'L3_PIPELINE_VERSION', 'POLICY_VERSION', 'PLAN_ID',
    'normalizeFinalAnswer', 'parseNumericAnswer', 'answersEquivalent', 'blindVerdictFrom',
    'buildDecisionRow', 'explorationFraction', 'isForcedExploration', 'judgeAnswerBlindEnabled',
    'sha256short'];
  const dir = mkdtempSync(join(tmpdir(), 'v1t16-'));
  const file = join(dir, 'pre.ts');
  writeFileSync(file, denoStub + src + `\nexport { ${exports.join(', ')} };\n`);
  return import(pathToFileURL(file).href);
}

// ── Drive one scenario ──────────────────────────────────────────────────────
async function run(scenario) {
  uuidCounter = 0; randomCounter = 0;
  const capture = { writes: [], logs: [], requests: [] };
  const kindSeq = {};   // per-kind call counter, so a scenario can vary solver A vs B

  const realFetch = globalThis.fetch;
  const realLog = console.log;
  globalThis.fetch = async (_url, init) => {
    const body = JSON.parse(init.body);
    const kind = classifyRequest(body);
    capture.requests.push({ kind, model: body.model, max_tokens: body.max_tokens,
                            temperature: body.temperature, messages: body.messages.length });
    // A response may be a single string or an array consumed in call order —
    // the latter is how a scenario gives solver A and solver B different
    // answers, which is the only way to exercise the equivalence tolerance.
    const seq = kindSeq[kind] = (kindSeq[kind] ?? -1) + 1;
    const canned = scenario.responses[kind];
    const content = Array.isArray(canned) ? canned[Math.min(seq, canned.length - 1)] : canned;
    if (content === undefined) {
      // Fail the whole run, not just this call. The pipeline catches provider
      // errors by design, so a throw here would be swallowed and the scenario
      // would appear to pass while testing a different code path.
      capture.fatal = `no canned response for request kind "${kind}"`;
      return { ok: false, status: 500, json: async () => ({ error: { code: 'harness_unmapped' } }) };
    }
    return { ok: true, status: 200, json: async () => chat(content) };
  };
  console.log = (...a) => capture.logs.push(a.map(String).join(' '));

  try {
    const mod = await loadPipeline(scenario.env);
    await mod.runL3ShadowPipeline({
      sbAdmin: makeFakeAdmin(capture),
      recordId: '22222222-2222-4222-8222-222222222222',
      userId: '33333333-3333-4333-8333-333333333333',
      startTime: FIXED_NOW - 4200,
      requestId: '44444444-4444-4444-8444-444444444444',
      clientRequestId: '55555555-5555-4555-8555-555555555555',
      sessionId: '66666666-6666-4666-8666-666666666666',
      operation: 'ask',
      ...scenario.opts,
    });
  } finally {
    globalThis.fetch = realFetch;
    console.log = realLog;
  }

  // Only keep the verification telemetry line; ai_model_calls rows are captured
  // as writes and their call_uid/started_at are already deterministic.
  if (capture.fatal) throw new Error(`${scenario.name}: ${capture.fatal}`);
  const shadowLog = capture.logs.find(l => l.includes('verification-shadow')) ?? null;
  return {
    scenario: scenario.name,
    requests: capture.requests,
    writes: capture.writes,
    shadow_log: shadowLog ? JSON.parse(shadowLog.replace('[ai-tutor] verification-shadow ', '')) : null,
  };
}

const results = [];
for (const s of SCENARIOS) results.push(await run(s));

const out = {
  _comment: 'Golden fixture for V1-T16. Generated by scripts/capture-v1-t16-golden.mjs. '
          + 'Any diff here between pre- and post-extraction is a behaviour change.',
  fixed_now: FIXED_NOW,
  source: SOURCE,
  scenarios: results,
};
mkdirSync(resolve(REPO, 'tests/fixtures'), { recursive: true });
const dest = OUT ? resolve(OUT) : resolve(REPO, 'tests/fixtures/v1-t16-golden.json');
writeFileSync(dest, JSON.stringify(out, null, 2) + '\n');
console.log(`captured ${results.length} scenarios from "${SOURCE}" -> ${dest}`);
for (const r of results) {
  console.log(`  ${r.scenario}: ${r.requests.length} provider call(s), ${r.writes.length} write(s), log=${r.shadow_log ? 'yes' : 'no'}`);
}
