// Verdict Pilot P1 — the ReasoningEngine contract and the replay engine.
//
// Models are interchangeable reasoning engines. Zero owns routing, evidence and
// the verdict; an engine's only job is to produce one solve attempt. This suite
// pins the contract that makes that substitutable, and the two properties that
// make the pilot trustworthy:
//
//   INDEPENDENCE — an engine is handed the question and nothing else. There is
//     no parameter through which one engine could see another's answer, so
//     "solve independently" is enforced by the type, not by discipline. If a
//     later PR wants cross-examination it has to add a parameter, in the open.
//
//   DETERMINISM — the replay engine reads a committed fixture and performs no
//     network, clock or RNG access, so every downstream suite is hermetic and
//     free to run. A pilot that called live providers could not be a test.
//
// The fixture is hand-written and encodes NO ground truth: no accuracy, no
// score, no "correct" engine. P1 proves outputs can be normalized, not that any
// of them are right.
import { suite } from './_assert.mjs';
import { read, importTS } from './_source.mjs';

const t = suite('reasoning-engine-contract');
const SRC = read('supabase/functions/_shared/evidence.core.ts');
const mod = await importTS(SRC, []);
const { createReplayEngine } = mod;

const FIX = JSON.parse(read('tests/fixtures/phase3-pilot-engines.json'));
const item = (id) => FIX.items.find((i) => i.id === id);
const inputFor = (id) => ({ question_text: item(id).question_text, choices: item(id).choices });

const alpha = createReplayEngine('engine_alpha', FIX);

// ───────────────────────────────────────────────────────────────────────────
t.section('E1. The contract shape');
{
  t.is('an engine has a stable id', alpha.id, 'engine_alpha');
  t.ok('and a solve function', typeof alpha.solve === 'function');
  t.is('solve takes exactly one argument — the input', alpha.solve.length, 1);
}

t.section('E2. INDEPENDENCE — an engine cannot see another engine\'s answer');
{
  // Structural, not aspirational: there is no second parameter to smuggle a
  // peer's output through, and the module never mentions one.
  t.is('solve has no channel for peer outputs', alpha.solve.length, 1);
  t.ok('the module defines no peer/prior-answer field',
    !/peer_?outputs|other_?answers|priorAnswer|siblingOutput/i.test(SRC), SRC.slice(0, 200));

  // SolverInput carries the question only.
  const iface = /interface SolverInput \{([\s\S]*?)\}/.exec(SRC);
  t.ok('SolverInput is declared', !!iface, 'SolverInput interface missing');
  if (iface) {
    const body = iface[1];
    t.ok('it carries the question', /question_text/.test(body), body);
    t.ok('it carries no answer of any kind',
      !/answer|verdict|solution|peer/i.test(body), body);
  }
}

t.section('E3. Replay returns the committed fixture output');
{
  const out = await alpha.solve(inputFor('Q79'));
  t.is('provider', out.provider, 'mock');
  t.is('model', out.model, 'alpha-1');
  t.is('the raw response is the fixture text verbatim',
    out.raw_response, item('Q79').engines.engine_alpha.text);
  t.is('and it arrives normalized — value preserved', out.raw_answer, '7');
  t.is('and label preserved separately', out.choice_letter, 'C');
}

t.section('E4. DETERMINISM — identical calls, identical bytes');
{
  const a = await alpha.solve(inputFor('Q79'));
  const b = await alpha.solve(inputFor('Q79'));
  t.is('two calls agree exactly', JSON.stringify(a), JSON.stringify(b));

  const fresh = createReplayEngine('engine_alpha', FIX);
  const c = await fresh.solve(inputFor('Q79'));
  t.is('a fresh instance agrees too', JSON.stringify(c), JSON.stringify(a));

  const beta = createReplayEngine('engine_beta', FIX);
  const bOut = await beta.solve(inputFor('Q79'));
  t.ok('different engines give different published labels',
    bOut.choice_letter !== a.choice_letter, `${bOut.choice_letter} vs ${a.choice_letter}`);
}

t.section('E5. A question the engine has no entry for is ABSENT, not invented');
{
  const out = await alpha.solve({ question_text: 'a question no fixture covers', choices: null });
  t.ok('an output is still returned', out && typeof out === 'object');
  t.is('with no fabricated answer', out.raw_answer, null);
  t.is('and no fabricated label', out.choice_letter, null);
  t.is('and an empty raw response', out.raw_response, '');

  const missing = createReplayEngine('engine_beta', FIX);
  const noEntry = await missing.solve(inputFor('NOANSWER-1'));   // beta has no entry here
  t.is('an engine absent from an item yields no answer', noEntry.raw_answer, null);
}

t.section('E6. Engines are substitutable — the same loop drives all of them');
{
  const ids = ['engine_alpha', 'engine_beta', 'engine_gamma', 'engine_delta'];
  const outs = [];
  for (const id of ids) outs.push(await createReplayEngine(id, FIX).solve(inputFor('Q79')));
  t.is('every engine produced an output', outs.length, 4);
  t.ok('all share the same field set',
    new Set(outs.map((o) => Object.keys(o).sort().join(','))).size === 1,
    JSON.stringify(outs.map((o) => Object.keys(o).sort())));
  t.ok('and none of them carries a verdict, score or correctness flag',
    outs.every((o) => !('verdict' in o) && !('correct' in o) && !('score' in o)),
    JSON.stringify(Object.keys(outs[0])));
}

t.section('E7. P1 IS OFFLINE — the pilot module is not in the deployed bundle');
{
  // The Edge Function bundle is exactly what index.ts imports. If it ever
  // imports the pilot, this module ships to production and P1 stops being
  // offline-by-construction.
  const INDEX = read('supabase/functions/ai-tutor/index.ts');
  t.ok('ai-tutor/index.ts does NOT import evidence.core',
    !/evidence\.core/.test(INDEX), 'evidence.core is referenced from the deployed entrypoint');

  const VC = read('supabase/functions/_shared/verification.core.ts');
  t.ok('and neither does verification.core.ts',
    !/evidence\.core/.test(VC), 'evidence.core is reachable from the deployed bundle');

  // And the pilot pulls nothing from the deployed modules either, so it cannot
  // perturb them or be perturbed by their module-scope env reads.
  t.ok('the pilot imports nothing at all',
    !/^\s*import\s/m.test(SRC), 'P1 must stay dependency-free');
}

t.section('E8. NO VOTING, NO RANKING — P1 records, it does not decide');
{
  // These assertions are about CODE, so comments are stripped first. The module
  // documents at length that voting is forbidden and that no model is "best" —
  // prose that would trip every pattern below. Scanning raw source would push
  // toward deleting the explanation to satisfy a regex, which makes the file
  // worse and the guarantee no stronger.
  const code = SRC
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n').map((l) => l.replace(/(^|[^:\\])\/\/.*$/, '$1')).join('\n');

  // A stripper that removed everything would make each negative check pass
  // vacuously, so prove the remaining text is still the real module.
  t.ok('the stripped source is still substantial', code.length > 1500, `${code.length} chars`);
  for (const anchor of ['export function normalizeSolverOutput', 'export function createReplayEngine',
                        'export function choiceMappingConsistency', 'choice_letter']) {
    t.ok(`  code retained: ${anchor}`, code.includes(anchor), anchor);
  }

  t.ok('the module never counts agreement',
    !/majority|vote|voting|agreement_count|consensus/i.test(code), code.slice(0, 300));
  t.ok('it hard-codes no model preference',
    !/\b(best|preferred|strongest)[_ ]?(model|engine|provider)\b/i.test(code), code.slice(0, 300));
  t.ok('it encodes no accuracy or benchmark score',
    !/\b(94|96|106)\s*\/\s*106\b|accuracy\s*[:=]/i.test(code), code.slice(0, 300));
  t.ok('and no verdict vocabulary has leaked in from later phases',
    !/VERIFIED|HIGH_CONFIDENCE|ITEM_DISPUTED|EvidenceBuilder|DisagreementAnalyzer/.test(code),
    code.slice(0, 300));
}

t.done();
