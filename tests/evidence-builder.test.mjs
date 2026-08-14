// Verdict Pilot P2 — the Evidence Builder.
//
// P2 answers exactly one question: WHAT EVIDENCE EXISTS in the submitted
// independent outputs? It does not decide truth, publish an answer, select a
// winner, or hold a verdict. Those belong to later architecture.
//
// THE INFERENCE THAT MUST BE IMPOSSIBLE
// ────────────────────────────────────
//     A says 7 · B says 7 · C says 7   ->   "therefore 7 is true"
//
// That step cannot exist here. Agreement may become evidence; agreement is
// never proof. A deterministic verifier in a later phase may outweigh unanimous
// model agreement, and UNANIMOUS-WRONG-1 in the fixture is three engines
// agreeing on a wrong value precisely so that this suite can prove P2 records
// it without promoting it.
//
// COUNT-AGNOSTIC (E8/E9/E10) — the part that is easy to get wrong
// ──────────────────────────────────────────────────────────────
// Future routing starts with one cheap engine and escalates only when evidence
// is insufficient. So P2 must be correct at N = 0, 1, 2, 5 — and must never
// let the count mean anything:
//
//   • ONE engine is not agreement. Absence of divergence is not agreement.
//     Agreement needs >= 2 engines that ACTUALLY STATED the field.
//   • MISSING_OBSERVATION is about a field absent inside a submitted output.
//     P2 has no notion of a missing ENGINE, no expected count, no minimum —
//     "how many engines are enough" is a routing decision, not an observation.
//   • Count is not quality. No sufficiency, confidence, strength or escalation
//     signal may emerge from having more engines.
//
// buildEvidence stays a pure function over the CURRENT set: the router escalates
// by calling it again with more outputs, and the builder never knows escalation
// exists.
//
// COMPARISON IS LITERAL. Two engines saying "9/4" and "2.25" are recorded as
// divergent with both values preserved. Deciding those are the same answer is
// interpretation, and interpretation is a later phase.
//
// The fixture encodes no answer key, no score and no model ranking. Nothing here
// asserts which engine was right.
import { suite } from './_assert.mjs';
import { read } from './_source.mjs';

const t = suite('evidence-builder');

// Direct path import, NOT importTS: this module has a real relative import and
// importTS writes to a temp dir, where './evidence.core.ts' would not resolve.
const P2 = '/home/user/Si-Math-Ai/supabase/functions/_shared/evidence-builder.core.ts';
const P1 = '/home/user/Si-Math-Ai/supabase/functions/_shared/evidence.core.ts';
const { buildEvidence, TYPE_ORDER } = await import(P2);
const { normalizeSolverOutput } = await import(P1);
const SRC = read('supabase/functions/_shared/evidence-builder.core.ts');

// Structural checks below examine CODE. The module documents at length which
// things it deliberately does not do — it names Deno.env and verification.core
// precisely to explain why they are absent — and scanning raw source would push
// toward deleting those explanations to satisfy a regex.
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, ' ')
  .split('\n').map((l) => l.replace(/(^|[^:\\])\/\/.*$/, '$1')).join('\n');

const FIX = JSON.parse(read('tests/fixtures/phase3-pilot-engines.json'));
const item = (id) => FIX.items.find((i) => i.id === id);

/** Submissions for an item: [{engine_id, output}], in fixture key order. */
const subs = (id, only) => {
  const it = item(id);
  const ids = only ?? Object.keys(it.engines);
  return ids.map((eid) => ({
    engine_id: eid,
    output: normalizeSolverOutput(it.engines[eid], { question_text: it.question_text, choices: it.choices }),
  }));
};
const build = (id, only) => buildEvidence(subs(id, only), { choices: item(id).choices });
const types = (ev) => ev.map((r) => r.type);
const ofType = (ev, ty) => ev.filter((r) => r.type === ty);
const enginesIn = (ev) => new Set(ev.flatMap((r) => r.engines));

// ───────────────────────────────────────────────────────────────────────────
t.section('B1. Single-engine provenance is preserved');
{
  const ev = build('NOANSWER-1');
  const obs = ofType(ev, 'ENGINE_OBSERVATION');
  t.is('one observation for one engine', obs.length, 1);
  t.is('named by engine_id', obs[0].engines, ['engine_alpha']);
  t.ok('with a basis', typeof obs[0].basis === 'string' && obs[0].basis.length > 0, obs[0].basis);
  t.ok('carrying what it said', obs[0].observed !== undefined, JSON.stringify(obs[0].observed));
}

t.section('B2. Multi-engine raw-answer agreement is recorded — and nothing more');
{
  const ev = build('SWEEP-1', ['engine_e1', 'engine_e2', 'engine_e3']);
  const agree = ofType(ev, 'RAW_ANSWER_AGREEMENT');
  t.is('exactly one agreement record', agree.length, 1);
  t.is('naming all three engines, sorted', agree[0].engines, ['engine_e1', 'engine_e2', 'engine_e3']);
  t.is('on the raw_answer field', agree[0].fields, ['raw_answer']);
  t.is('no divergence', ofType(ev, 'RAW_ANSWER_DIVERGENCE').length, 0);
}

t.section('B3. Disagreement never loses the minority');
{
  // Q79: alpha/beta/gamma state 7, delta states only a letter.
  const ev = build('Q79');
  t.ok('every submitted engine appears somewhere',
    ['engine_alpha', 'engine_beta', 'engine_gamma', 'engine_delta'].every((e) => enginesIn(ev).has(e)),
    JSON.stringify([...enginesIn(ev)]));

  // A genuine value split: three say 7 (Q79), three say 9 (UNANIMOUS-WRONG-1).
  const mixed = [...subs('Q79', ['engine_alpha']), ...subs('UNANIMOUS-WRONG-1', ['engine_beta'])];
  const ev2 = buildEvidence(mixed, { choices: item('Q79').choices });
  const div = ofType(ev2, 'RAW_ANSWER_DIVERGENCE');
  t.is('divergence is recorded', div.length, 1);
  t.is('naming both engines', div[0].engines, ['engine_alpha', 'engine_beta']);
  t.ok('and preserving BOTH values', JSON.stringify(div[0].observed).includes('7')
    && JSON.stringify(div[0].observed).includes('9'), JSON.stringify(div[0].observed));
}

t.section('B4. Choice agreement is a SEPARATE fact from raw-answer agreement');
{
  // alpha: 7/C · beta: 7/B — same value, different label.
  const ev = build('Q79', ['engine_alpha', 'engine_beta']);
  t.is('raw answers agree', ofType(ev, 'RAW_ANSWER_AGREEMENT').length, 1);
  t.is('choices diverge', ofType(ev, 'CHOICE_DIVERGENCE').length, 1);
  t.is('and they are not the same record',
    ofType(ev, 'RAW_ANSWER_AGREEMENT')[0].fields, ['raw_answer']);
  t.is('the choice record names its own field',
    ofType(ev, 'CHOICE_DIVERGENCE')[0].fields, ['choice_letter']);
}

t.section('B5. THE Q79 CASE — right value, wrong label, mismatch visible');
{
  const ev = build('Q79', ['engine_alpha']);
  const map = ofType(ev, 'MAPPING_CONSISTENCY');
  t.is('a mapping record exists', map.length, 1);
  t.is('for that engine', map[0].engines, ['engine_alpha']);
  t.is('and it reports mismatch', map[0].observed, 'mismatch');

  const ok = ofType(build('Q79', ['engine_beta']), 'MAPPING_CONSISTENCY');
  t.is('a correctly mapped engine reads consistent', ok[0].observed, 'consistent');
}

t.section('B6. A missing FIELD is missing — never agreement');
{
  const ev = build('Q79', ['engine_gamma']);   // value only, no letter
  const miss = ofType(ev, 'MISSING_OBSERVATION');
  t.ok('the absent choice_letter is recorded',
    miss.some((r) => r.fields.includes('choice_letter')), JSON.stringify(miss));
  t.is('and it is attributed to the engine', miss[0].engines, ['engine_gamma']);
  t.is('no agreement is manufactured', ofType(ev, 'CHOICE_AGREEMENT').length, 0);

  const none = build('NOANSWER-1');            // no answer at all
  t.ok('a missing raw_answer is recorded',
    ofType(none, 'MISSING_OBSERVATION').some((r) => r.fields.includes('raw_answer')), JSON.stringify(none));
}

t.section('B7. Duplicate or malformed engine identity is flagged, never merged');
{
  const dup = [...subs('Q79', ['engine_alpha']), ...subs('Q79', ['engine_alpha'])];
  const ev = buildEvidence(dup, { choices: item('Q79').choices });
  t.is('the conflict is recorded', ofType(ev, 'ENGINE_IDENTITY_CONFLICT').length, 1);
  t.is('both submissions still observed', ofType(ev, 'ENGINE_OBSERVATION').length, 2);

  for (const badId of ['', '   ', null, undefined, 42, {}]) {
    const bad = [{ engine_id: badId, output: subs('Q79', ['engine_alpha'])[0].output }];
    let threw = false, out;
    try { out = buildEvidence(bad, { choices: item('Q79').choices }); } catch (e) { threw = true; }
    t.ok(`id ${JSON.stringify(badId) ?? String(badId)} does not throw`, !threw);
    if (!threw) t.ok('  and is flagged', ofType(out, 'ENGINE_IDENTITY_CONFLICT').length >= 1, JSON.stringify(out));
  }
}

t.section('B8. Ordering is explicitly deterministic');
{
  // The contract is the DECLARED order, not alphabetical accident, so this
  // asserts against the module's own exported declaration.
  t.ok('the module exports an explicit type order',
    Array.isArray(TYPE_ORDER) && TYPE_ORDER.length > 0, JSON.stringify(TYPE_ORDER));

  const ev = build('Q79');
  const ranks = ev.map((r) => TYPE_ORDER.indexOf(r.type));
  t.ok('every emitted type is declared', ranks.every((i) => i >= 0), JSON.stringify(types(ev)));
  t.is('records are grouped in declared-type order', ranks.slice().sort((a, b) => a - b), ranks);

  // Within one type, ties break on engines then fields then observed.
  for (const ty of new Set(types(ev))) {
    const keys = ofType(ev, ty).map((r) =>
      `${r.engines.join(',')}|${r.fields.join(',')}|${JSON.stringify(r.observed)}`);
    t.is(`  ${ty} ties are sorted`, keys.slice().sort(), keys);
  }
}

t.section('B9. Same input -> byte-identical output');
{
  t.is('two builds agree exactly',
    JSON.stringify(build('Q79')), JSON.stringify(build('Q79')));
  t.ok('no clock', !/Date\.now|new Date\(/.test(CODE));
  t.ok('no randomness', !/Math\.random/.test(CODE));
  t.ok('no I/O', !/fetch\(|Deno\.env|localStorage/.test(CODE), CODE.slice(0, 200));
}

t.section('B10. PERMUTATION-INVARIANT — submission order changes nothing');
{
  const ids = ['engine_alpha', 'engine_beta', 'engine_gamma', 'engine_delta'];
  const base = JSON.stringify(build('Q79', ids));
  const perms = [
    ['engine_delta', 'engine_gamma', 'engine_beta', 'engine_alpha'],
    ['engine_beta', 'engine_delta', 'engine_alpha', 'engine_gamma'],
    ['engine_gamma', 'engine_alpha', 'engine_delta', 'engine_beta'],
  ];
  for (const p of perms) {
    t.is(`order ${p.map((s) => s.slice(7, 9)).join('')} -> identical`, JSON.stringify(build('Q79', p)), base);
  }
}

t.section('B11. AGREEMENT SWEEP — no threshold exists');
{
  // The shape of the evidence must not change kind as the count rises. A
  // `>= 2 -> VERIFIED` rule would show up here as a new type appearing.
  const all = ['engine_e1', 'engine_e2', 'engine_e3', 'engine_e4', 'engine_e5'];
  const seen = [];
  for (let n = 1; n <= 5; n++) {
    const ev = build('SWEEP-1', all.slice(0, n));
    seen.push({ n, kinds: [...new Set(types(ev))].sort() });
  }
  t.is('N=1 has NO agreement record', seen[0].kinds.includes('RAW_ANSWER_AGREEMENT'), false);
  for (let i = 1; i < seen.length; i++) {
    t.is(`N=${seen[i].n} has the same record kinds as N=2`, seen[i].kinds, seen[1].kinds);
  }
  t.ok('no verdict-ish kind ever appears',
    seen.every((s) => s.kinds.every((k) => !/VERIF|CORRECT|WINNER|FINAL|TRUE/i.test(k))),
    JSON.stringify(seen));
}

t.section('B12. No truth authority anywhere in the output');
{
  const ev = build('SWEEP-1');
  const json = JSON.stringify(ev);
  t.ok('no verdict vocabulary in values',
    !/VERIFIED|CORRECT_ANSWER|winner|final_verdict|is_true/i.test(json), json.slice(0, 300));
  const keys = new Set(ev.flatMap((r) => Object.keys(r)));
  t.ok('no verdict-bearing key',
    ![...keys].some((k) => /verdict|correct|winner|truth|answer_is/i.test(k)), [...keys].join(','));
  t.is('the record shape is exactly the declared one',
    [...keys].sort(), ['basis', 'engines', 'fields', 'observed', 'type']);
}

t.section('B13. Provenance is recoverable for every record');
{
  const ev = build('Q79');
  t.ok('every record names at least one engine',
    ev.every((r) => Array.isArray(r.engines) && r.engines.length > 0), JSON.stringify(ev.map((r) => r.engines)));
  t.ok('every record names at least one field',
    ev.every((r) => Array.isArray(r.fields) && r.fields.length > 0), JSON.stringify(ev.map((r) => r.fields)));
  t.ok('every record names the comparison that produced it',
    ev.every((r) => typeof r.basis === 'string' && r.basis.length > 0), JSON.stringify(ev.map((r) => r.basis)));
  t.ok('every submitted engine is represented',
    ['engine_alpha', 'engine_beta', 'engine_gamma', 'engine_delta'].every((e) => enginesIn(ev).has(e)));
}

t.section('B14. THREE ENGINES, ONE WRONG ANSWER — recorded, never verified');
{
  const ev = build('UNANIMOUS-WRONG-1');
  const agree = ofType(ev, 'RAW_ANSWER_AGREEMENT');
  t.is('the agreement IS recorded', agree.length, 1);
  t.is('naming all three', agree[0].engines.length, 3);
  t.ok('and it is only an observation',
    !/VERIFIED|proof|true|correct/i.test(JSON.stringify(agree[0])), JSON.stringify(agree[0]));
  t.ok('nothing in the whole set claims truth',
    !/VERIFIED|is_true|correct_answer/i.test(JSON.stringify(ev)), JSON.stringify(ev).slice(0, 300));
  // Unanimity is indistinguishable in KIND from any other agreement.
  const two = build('SWEEP-1', ['engine_e1', 'engine_e2']);
  t.is('a 3-way agreement has the same record kinds as a 2-way one',
    [...new Set(types(ev))].sort().filter((k) => k !== 'MAPPING_CONSISTENCY'),
    [...new Set(types(two))].sort().filter((k) => k !== 'MAPPING_CONSISTENCY'));
}

t.section('B15. Offline and correctly layered');
{
  const imports = CODE.match(/^\s*import\s[^\n]*/gm) ?? [];
  t.ok('it does import something', imports.length >= 1, 'expected an import of P1');
  t.ok('and EVERY import targets P1 only',
    imports.every((l) => /['"]\.\/evidence\.core\.ts['"]/.test(l)), imports.join('\n'));
  t.ok('never imports verification.core.ts',
    !/verification\.core/.test(CODE), CODE.slice(0, 200));

  const INDEX = read('supabase/functions/ai-tutor/index.ts');
  t.ok('ai-tutor/index.ts does not import the builder', !/evidence-builder/.test(INDEX));
  const VC = read('supabase/functions/_shared/verification.core.ts');
  t.ok('nor does verification.core.ts', !/evidence-builder/.test(VC));
}

t.section('B16. N=1 IS NOT AGREEMENT — the single-engine trap');
{
  const ev = build('SWEEP-1', ['engine_e1']);
  t.is('no raw-answer agreement', ofType(ev, 'RAW_ANSWER_AGREEMENT').length, 0);
  t.is('no choice agreement', ofType(ev, 'CHOICE_AGREEMENT').length, 0);
  t.is('no divergence either', ofType(ev, 'RAW_ANSWER_DIVERGENCE').length, 0);
  t.ok('but the engine IS observed', ofType(ev, 'ENGINE_OBSERVATION').length === 1, JSON.stringify(ev));
  t.ok('and its mapping is still checkable', ofType(ev, 'MAPPING_CONSISTENCY').length === 1);

  // Absence of divergence must never be reported as agreement.
  t.ok('a lone engine is never corroborated by nobody',
    !JSON.stringify(ev).includes('AGREEMENT'), JSON.stringify(ev));
}

t.section('B17. N=0 returns empty evidence and does not throw');
{
  let threw = false, ev;
  try { ev = buildEvidence([], { choices: null }); } catch (e) { threw = true; }
  t.ok('no throw', !threw);
  t.is('empty evidence', ev, []);
  let threw2 = false;
  try { buildEvidence(null, null); } catch (e) { threw2 = true; }
  t.ok('null submissions do not throw', !threw2);
}

t.section('B18. N=2 works in both directions without a third engine');
{
  const agreeing = build('SWEEP-1', ['engine_e1', 'engine_e2']);
  t.is('two agreeing -> agreement', ofType(agreeing, 'RAW_ANSWER_AGREEMENT').length, 1);
  t.is('  naming exactly two', agreeing.find((r) => r.type === 'RAW_ANSWER_AGREEMENT').engines.length, 2);

  const differing = buildEvidence(
    [...subs('Q79', ['engine_alpha']), ...subs('UNANIMOUS-WRONG-1', ['engine_gamma'])],
    { choices: item('Q79').choices });
  t.is('two differing -> divergence', ofType(differing, 'RAW_ANSWER_DIVERGENCE').length, 1);
  t.is('  and no agreement', ofType(differing, 'RAW_ANSWER_AGREEMENT').length, 0);
}

t.section('B19. ESCALATION SHAPE — re-running with more engines is well defined');
{
  // The router escalates by calling buildEvidence again with more outputs. The
  // builder must not know that happened; each call is a pure function of its set.
  const s1 = build('SWEEP-1', ['engine_e1']);
  const s2 = build('SWEEP-1', ['engine_e1', 'engine_e2']);
  const s3 = build('SWEEP-1', ['engine_e1', 'engine_e2', 'engine_e3']);

  for (const [name, ev] of [['1', s1], ['2', s2], ['3', s3]]) {
    t.ok(`N=${name} is deterministic`, JSON.stringify(ev) === JSON.stringify(
      build('SWEEP-1', ['engine_e1', 'engine_e2', 'engine_e3'].slice(0, Number(name)))));
  }
  // What was observed about e1 alone is still observed once others join.
  const e1Obs = (ev) => JSON.stringify(ofType(ev, 'ENGINE_OBSERVATION').find((r) => r.engines[0] === 'engine_e1'));
  t.is('e1 observation survives escalation to N=2', e1Obs(s2), e1Obs(s1));
  t.is('and to N=3', e1Obs(s3), e1Obs(s1));
  t.ok('no record carries an escalation hint',
    !/escalat|next_engine|需要|more_engines/i.test(JSON.stringify(s1)), JSON.stringify(s1).slice(0, 200));
}

t.section('B20. COUNT IS NOT QUALITY');
{
  const all = ['engine_e1', 'engine_e2', 'engine_e3', 'engine_e4', 'engine_e5'];
  const shapes = [];
  for (let n = 1; n <= 5; n++) {
    const ev = build('SWEEP-1', all.slice(0, n));
    shapes.push(new Set(ev.flatMap((r) => Object.keys(r))));
  }
  const first = [...shapes[0]].sort().join(',');
  for (let i = 1; i < shapes.length; i++) {
    t.is(`N=${i + 1} exposes the same fields as N=1`, [...shapes[i]].sort().join(','), first);
  }
  for (let n = 1; n <= 5; n++) {
    const json = JSON.stringify(build('SWEEP-1', all.slice(0, n)));
    t.ok(`N=${n} carries no quality signal`,
      !/sufficien|confidence|strength|score|weight|reliab/i.test(json), json.slice(0, 200));
  }
}

t.section('B21. No escalation or sufficiency vocabulary, in code or output');
{
  const json = JSON.stringify(build('SWEEP-1'));
  t.ok('output has none', !/escalate|needs_more|insufficient|sufficient|confidence|strength/i.test(json),
    json.slice(0, 200));

  // Code check, comments stripped — the module documents at length that these
  // are forbidden, and that prose would trip the patterns.
  const code = SRC.replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n').map((l) => l.replace(/(^|[^:\\])\/\/.*$/, '$1')).join('\n');
  t.ok('the stripped source is still substantial', code.length > 1200, `${code.length} chars`);
  t.ok('  code retained: buildEvidence', code.includes('export function buildEvidence'));
  t.ok('no routing or escalation logic', !/escalat|route|routing|select_engine/i.test(code), code.slice(0, 300));
  t.ok('no voting', !/majority|vote|voting|consensus|quorum/i.test(code), code.slice(0, 300));
  t.ok('no cost or latency policy', !/cost|latency|budget|price/i.test(code), code.slice(0, 300));
  t.ok('no expected-count constant', !/(MIN|EXPECTED|REQUIRED)_(ENGINES|SOLVERS|COUNT)/i.test(code), code.slice(0, 300));
}

t.done();
