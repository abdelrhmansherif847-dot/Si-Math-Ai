// Verdict Pilot P3 — the Disagreement Analyzer.
//
// P3 classifies WHY outputs disagree, from evidence alone. It does not pick a
// winner, score anything, or decide truth.
//
// THE HONESTY RULE THAT SHAPES THE WHOLE MODULE
// ────────────────────────────────────────────
// Most disagreement categories cannot be derived from the evidence P1/P2
// actually produce. Deciding that two engines differ because of an ALGEBRA
// error rather than an ARITHMETIC one means reading their prose and judging it
// — that is a model's opinion, not a deterministic fact, and P3 refuses to
// manufacture it.
//
// So the vocabulary is wider than what P3 will ever assign. Four categories have
// a deterministic basis in today's evidence:
//
//   CHOICE_MAPPING       a mapping mismatch, or raw answers that agree while
//                        labels diverge — the Q79 shape
//   ANSWER_EXTRACTION    an engine published a final answer from which no value
//                        could be recovered
//   MISSING_INFORMATION  a field absent inside a submitted output
//   MODEL_DISAGREEMENT   values genuinely diverge and nothing deterministic
//                        explains it — the honest unresolved bucket
//
// INTERPRETATION, ARITHMETIC, ALGEBRA, GEOMETRY and TRANSCRIPTION are reserved
// vocabulary. P3 must NEVER assign them: they need a verifier or a reasoning
// analysis that does not exist yet. A suite section below proves it cannot.
//
// COUNT-AGNOSTIC, inherited from P2 and re-proven here: N=0 is safe, N=1 is
// observation and never disagreement, N=2 detects, N>2 needs no assumption of
// three models, and no engine count becomes confidence or sufficiency.
import { suite } from './_assert.mjs';
import { read } from './_source.mjs';

const t = suite('disagreement-analyzer');

const P3 = '/home/user/Si-Math-Ai/supabase/functions/_shared/disagreement.core.ts';
const P2 = '/home/user/Si-Math-Ai/supabase/functions/_shared/evidence-builder.core.ts';
const P1 = '/home/user/Si-Math-Ai/supabase/functions/_shared/evidence.core.ts';
const { analyzeDisagreement, RESERVED_CATEGORIES, CATEGORY_ORDER } = await import(P3);
const { buildEvidence } = await import(P2);
const { normalizeSolverOutput } = await import(P1);
const SRC = read('supabase/functions/_shared/disagreement.core.ts');
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, ' ')
  .split('\n').map((l) => l.replace(/(^|[^:\\])\/\/.*$/, '$1')).join('\n');

const FIX = JSON.parse(read('tests/fixtures/phase3-pilot-engines.json'));
const item = (id) => FIX.items.find((i) => i.id === id);
const subs = (id, only) => {
  const it = item(id);
  return (only ?? Object.keys(it.engines)).map((eid) => ({
    engine_id: eid,
    output: normalizeSolverOutput(it.engines[eid], { question_text: it.question_text, choices: it.choices }),
  }));
};
const analyze = (id, only) => {
  const s = subs(id, only), opts = { choices: item(id).choices };
  return analyzeDisagreement(s, buildEvidence(s, opts), opts);
};
const cats = (f) => f.map((r) => r.category);
const ofCat = (f, c) => f.filter((r) => r.category === c);

// ───────────────────────────────────────────────────────────────────────────
t.section('D1. Q79 — a mapping mismatch is classified, deterministically');
{
  const f = analyze('Q79', ['engine_alpha']);
  const cm = ofCat(f, 'CHOICE_MAPPING');
  t.is('one mapping finding', cm.length, 1);
  t.is('attributed to the engine', cm[0].engines, ['engine_alpha']);
  t.ok('with a deterministic basis', /mismatch/.test(cm[0].basis), cm[0].basis);
  t.ok('and it is NOT called a model disagreement', !cats(f).includes('MODEL_DISAGREEMENT'), JSON.stringify(cats(f)));
}

t.section('D2. Raw answers agree while labels diverge — still CHOICE_MAPPING, not a model split');
{
  // alpha: 7/C · beta: 7/B — the value is not in dispute; the label is.
  const f = analyze('Q79', ['engine_alpha', 'engine_beta']);
  t.ok('a mapping finding exists', ofCat(f, 'CHOICE_MAPPING').length >= 1, JSON.stringify(cats(f)));
  t.is('and no MODEL_DISAGREEMENT is claimed', ofCat(f, 'MODEL_DISAGREEMENT').length, 0);
  const crossed = ofCat(f, 'CHOICE_MAPPING').find((r) => r.engines.length >= 2);
  t.ok('one finding spans both engines', !!crossed, JSON.stringify(ofCat(f, 'CHOICE_MAPPING')));
  t.ok('naming the deterministic rule', /raw_agree|choice/.test(crossed?.basis ?? ''), crossed?.basis);
}

t.section('D3. A published answer with no recoverable value is an EXTRACTION finding');
{
  // engine_delta published "C" — a label, no value.
  const f = analyze('Q79', ['engine_delta']);
  const ex = ofCat(f, 'ANSWER_EXTRACTION');
  t.is('one extraction finding', ex.length, 1);
  t.is('for that engine', ex[0].engines, ['engine_delta']);
  t.ok('naming the field it could not recover', ex[0].fields.includes('raw_answer'), JSON.stringify(ex[0].fields));
}

t.section('D4. An absent field is MISSING_INFORMATION, never a disagreement');
{
  const f = analyze('NOANSWER-1');   // no final answer at all
  t.ok('missing information is recorded', ofCat(f, 'MISSING_INFORMATION').length >= 1, JSON.stringify(cats(f)));
  t.is('no model disagreement is invented', ofCat(f, 'MODEL_DISAGREEMENT').length, 0);
  t.is('and no extraction claim either', ofCat(f, 'ANSWER_EXTRACTION').length, 0);
}

t.section('D5. Genuine value divergence with no deterministic cause -> MODEL_DISAGREEMENT');
{
  const mixed = [...subs('Q79', ['engine_alpha']), ...subs('UNANIMOUS-WRONG-1', ['engine_beta'])];
  const opts = { choices: item('Q79').choices };
  const f = analyzeDisagreement(mixed, buildEvidence(mixed, opts), opts);
  const md = ofCat(f, 'MODEL_DISAGREEMENT');
  t.is('one unresolved finding', md.length, 1);
  t.ok('naming both engines', md[0].engines.length === 2, JSON.stringify(md[0].engines));
  t.ok('preserving both values', /7/.test(JSON.stringify(md[0].observed)) && /9/.test(JSON.stringify(md[0].observed)),
    JSON.stringify(md[0].observed));
  t.ok('and admitting no cause was determined', /no_deterministic|unresolved/.test(md[0].basis), md[0].basis);
}

t.section('D6. RESERVED CATEGORIES ARE NEVER ASSIGNED');
{
  // The categories that would need a verifier or prose judgement.
  t.ok('the module declares them reserved',
    Array.isArray(RESERVED_CATEGORIES) && RESERVED_CATEGORIES.length >= 5, JSON.stringify(RESERVED_CATEGORIES));
  for (const c of ['INTERPRETATION', 'ARITHMETIC', 'ALGEBRA', 'GEOMETRY', 'TRANSCRIPTION']) {
    t.ok(`${c} is reserved`, RESERVED_CATEGORIES.includes(c), JSON.stringify(RESERVED_CATEGORIES));
  }
  // Across every fixture item and every subset size, none may ever appear.
  const seen = new Set();
  for (const it of FIX.items) {
    const ids = Object.keys(it.engines);
    for (let n = 1; n <= ids.length; n++) analyze(it.id, ids.slice(0, n)).forEach((r) => seen.add(r.category));
  }
  t.ok('none is ever emitted',
    RESERVED_CATEGORIES.every((c) => !seen.has(c)), JSON.stringify([...seen]));
  t.ok('the analyzer never guesses a cause from prose',
    !/reasoning\s*\.\s*(match|includes|test)|\/algebra\/i|\/geometry\/i/.test(CODE), CODE.slice(0, 300));
}

t.section('D7. N=0 and N=1 — safe, and never disagreement');
{
  t.is('N=0 returns nothing', analyzeDisagreement([], [], { choices: null }), []);
  let threw = false;
  try { analyzeDisagreement(null, null, null); } catch (e) { threw = true; }
  t.ok('null input does not throw', !threw);

  const one = analyze('SWEEP-1', ['engine_e1']);
  t.is('a lone engine yields no disagreement of any kind',
    one.filter((r) => /DISAGREEMENT|MAPPING|EXTRACTION/.test(r.category) && r.engines.length > 1).length, 0);
  t.is('and certainly no MODEL_DISAGREEMENT', ofCat(one, 'MODEL_DISAGREEMENT').length, 0);
}

t.section('D8. N=2..5 — no assumption of three models, no count-derived signal');
{
  const all = ['engine_e1', 'engine_e2', 'engine_e3', 'engine_e4', 'engine_e5'];
  const shapes = [];
  for (let n = 1; n <= 5; n++) {
    const f = analyze('SWEEP-1', all.slice(0, n));
    shapes.push(new Set(f.flatMap((r) => Object.keys(r))));
    t.ok(`N=${n} carries no quality signal`,
      !/sufficien|confidence|strength|score|weight|verdict/i.test(JSON.stringify(f)), JSON.stringify(f).slice(0, 200));
  }
  const first = [...shapes[0]].sort().join(',');
  for (let i = 1; i < shapes.length; i++) {
    t.is(`N=${i + 1} exposes the same fields as N=1`, [...shapes[i]].sort().join(','), first);
  }
}

t.section('D9. Provenance survives — every finding names its engines and basis');
{
  const f = analyze('Q79');
  t.ok('every finding names at least one engine',
    f.every((r) => Array.isArray(r.engines) && r.engines.length > 0), JSON.stringify(f.map((r) => r.engines)));
  t.ok('every finding names its fields',
    f.every((r) => Array.isArray(r.fields) && r.fields.length > 0), JSON.stringify(f.map((r) => r.fields)));
  t.ok('every finding names the rule that produced it',
    f.every((r) => typeof r.basis === 'string' && r.basis.length > 0), JSON.stringify(f.map((r) => r.basis)));
  t.ok('all four submitted engines are represented',
    ['engine_alpha', 'engine_beta', 'engine_gamma', 'engine_delta']
      .every((e) => new Set(f.flatMap((r) => r.engines)).has(e)), JSON.stringify(f.map((r) => r.engines)));
}

t.section('D9b. The finding shape is EXACTLY the declared one');
{
  // Without this, a guessed category could ride along in an extra field while
  // `category` itself stayed honest — mutation N1.
  // The sweep MUST include a case that produces MODEL_DISAGREEMENT. No single
  // fixture item does — every engine within an item agrees on the value — so
  // without the mixed case below an extra field on that record is invisible.
  const mixedSubs = [...subs('Q79', ['engine_alpha']), ...subs('UNANIMOUS-WRONG-1', ['engine_beta'])];
  const mixedOpts = { choices: item('Q79').choices };
  const mixed = analyzeDisagreement(mixedSubs, buildEvidence(mixedSubs, mixedOpts), mixedOpts);
  t.ok('the sweep really does cover MODEL_DISAGREEMENT',
    mixed.some((r) => r.category === 'MODEL_DISAGREEMENT'), JSON.stringify(cats(mixed)));

  const seen = new Set();
  const sweep = [mixed];
  for (const it of FIX.items) {
    const ids = Object.keys(it.engines);
    for (let n = 1; n <= ids.length; n++) sweep.push(analyze(it.id, ids.slice(0, n)));
  }
  sweep.flat().forEach((r) => Object.keys(r).forEach((k) => seen.add(k)));
  t.is('no field beyond the contract', [...seen].sort(), ['basis', 'category', 'engines', 'fields', 'observed']);
  const flat = sweep.flat();
  t.ok('no reserved category appears in ANY value',
    !RESERVED_CATEGORIES.some((c) => JSON.stringify(flat).includes(c)), JSON.stringify(flat).slice(0, 300));
}

t.section('D9c. Findings are emitted in the DECLARED order');
{
  // Kills mutation N8: returning findings in construction order happens to look
  // right on small fixtures, so sortedness must be asserted, not observed.
  t.ok('the module exports its category order',
    Array.isArray(CATEGORY_ORDER) && CATEGORY_ORDER.length >= 4, JSON.stringify(CATEGORY_ORDER));
  for (const it of FIX.items) {
    const f = analyze(it.id);
    const ranks = f.map((r) => CATEGORY_ORDER.indexOf(r.category));
    t.ok(`${it.id}: every category is declared`, ranks.every((i) => i >= 0), JSON.stringify(cats(f)));
    t.is(`${it.id}: grouped in declared order`, ranks.slice().sort((a, b) => a - b), ranks);
    for (const c of new Set(cats(f))) {
      // Compared COMPONENT-WISE, matching the declared tie-break. A single
      // concatenated key would be wrong: the '|' separator (124) sorts above
      // ',' (44), so "a|x" vs "a,b|y" compares in the opposite order to the
      // contract. That is a property of the separator, not of the module.
      const tup = ofCat(f, c).map((r) => [r.engines.join(','), r.fields.join(','), JSON.stringify(r.observed)]);
      const cmp = (x, y) => (x[0] !== y[0] ? (x[0] < y[0] ? -1 : 1)
                          : x[1] !== y[1] ? (x[1] < y[1] ? -1 : 1)
                          : x[2] === y[2] ? 0 : (x[2] < y[2] ? -1 : 1));
      t.is(`${it.id}: ${c} ties sorted`, tup.slice().sort(cmp), tup);
    }
  }
}

t.section('D9d. Sortedness is exercised where construction order DIFFERS');
{
  // Every fixture item happens to be built in an order that already matches the
  // declared one, so sortedness passed without being tested. Three letter-only
  // engines each yield an ANSWER_EXTRACTION finding built in SUBMISSION order —
  // submit them reversed and the output must still come back sorted.
  const raw = (m) => ({ provider: 'mock', model: m, text: 'Reasoning:\nWork.\n\nFinal Answer: C' });
  const mk = (ids) => ids.map((id) => ({
    engine_id: id,
    output: normalizeSolverOutput(raw(id), { question_text: 'q', choices: ['6', '7', '8', '9'] }),
  }));
  const run = (ids) => {
    const s2 = mk(ids), o = { choices: ['6', '7', '8', '9'] };
    return analyzeDisagreement(s2, buildEvidence(s2, o), o);
  };
  const forward = run(['e_a', 'e_b', 'e_c']);
  const reversed = run(['e_c', 'e_b', 'e_a']);

  const ex = (f) => f.filter((r) => r.category === 'ANSWER_EXTRACTION').map((r) => r.engines[0]);
  t.is('three extraction findings exist', ex(forward).length, 3);
  t.is('forward order is sorted', ex(forward), ['e_a', 'e_b', 'e_c']);
  t.is('REVERSED submission still emits sorted', ex(reversed), ['e_a', 'e_b', 'e_c']);
  t.is('and the whole result is identical', JSON.stringify(reversed), JSON.stringify(forward));
}

t.section('D10. Deterministic and permutation-invariant');
{
  t.is('two runs agree exactly', JSON.stringify(analyze('Q79')), JSON.stringify(analyze('Q79')));
  const ids = ['engine_alpha', 'engine_beta', 'engine_gamma', 'engine_delta'];
  const base = JSON.stringify(analyze('Q79', ids));
  for (const p of [[...ids].reverse(), ['engine_beta', 'engine_delta', 'engine_alpha', 'engine_gamma']]) {
    t.is(`order ${p.map((s) => s.slice(7, 9)).join('')} -> identical`, JSON.stringify(analyze('Q79', p)), base);
  }
  t.ok('no clock', !/Date\.now|new Date\(/.test(CODE));
  t.ok('no randomness', !/Math\.random/.test(CODE));
  t.ok('no I/O', !/fetch\(|Deno\.env|localStorage/.test(CODE), CODE.slice(0, 200));
}

t.section('D11. NO VERDICT, NO WINNER, NO VOTING');
{
  const f = analyze('UNANIMOUS-WRONG-1');
  const json = JSON.stringify(f);
  t.ok('unanimity produces no verdict', !/VERIFIED|is_true|correct_answer|winner/i.test(json), json.slice(0, 200));
  const keys = new Set(f.flatMap((r) => Object.keys(r)));
  t.ok('no verdict-bearing key',
    ![...keys].some((k) => /verdict|correct|winner|truth|confidence|score/i.test(k)), [...keys].join(','));
  t.ok('no voting in code', !/majority|vote|voting|consensus|quorum/i.test(CODE), CODE.slice(0, 300));
  t.ok('no winner selection', !/select_?winner|best_?engine|pick_?answer/i.test(CODE), CODE.slice(0, 300));
  t.ok('no routing or escalation', !/escalat|routing|route\(/i.test(CODE), CODE.slice(0, 300));
  t.ok('no cost or latency policy', !/cost|latency|budget/i.test(CODE), CODE.slice(0, 300));
}

t.section('D12. Offline and correctly layered');
{
  const INDEX = read('supabase/functions/ai-tutor/index.ts');
  t.ok('index.ts does not import the analyzer', !/disagreement\.core/.test(INDEX));
  const VC = read('supabase/functions/_shared/verification.core.ts');
  t.ok('verification.core.ts does not either', !/disagreement\.core/.test(VC));
  const imports = CODE.match(/^\s*import\s[^\n]*/gm) ?? [];
  t.ok('any import targets the pilot only',
    imports.every((l) => /evidence(-builder)?\.core\.ts/.test(l)), imports.join('\n'));
  t.ok('never verification.core.ts', !/verification\.core/.test(CODE), CODE.slice(0, 200));
}

t.done();
