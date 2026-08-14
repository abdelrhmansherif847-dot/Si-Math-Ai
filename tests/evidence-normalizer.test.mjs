// Verdict Pilot P1 — SolverOutput normalization.
//
// WHAT P1 IS FOR
// ──────────────
// Zero owns the verdict; models only supply evidence. Before any of that can be
// built, heterogeneous engine outputs have to become ONE representation — and
// the single most important property of that representation is this:
//
//     a mathematical value and a multiple-choice label are DIFFERENT FACTS.
//
// Q79 is why. |n - 1| < 4  ->  -3 < n < 5  ->  {-2,-1,0,1,2,3,4}  ->  7 values.
// An engine can derive 7 perfectly and then publish the wrong letter. If the
// representation stores one flat "final answer" string, that failure is
// invisible: the answer looks stated, the reasoning looks sound, and the turn
// is wrong for a reason nothing can see.
//
//     CORRECT REASONING -> CORRECT RAW ANSWER -> WRONG CHOICE MAPPING -> WRONG FINAL ANSWER
//
// So `raw_answer`, `choice_index`, `choice_letter` and `final_answer` are four
// separate fields, and `choiceMappingConsistency` is the one predicate that
// makes the mismatch checkable rather than merely representable.
//
// WHAT THIS SUITE DOES NOT DO
// ───────────────────────────
// It asserts nothing about which engine is correct. The fixture is hand-written,
// the 106-question sheet's key is NOT established ground truth, and no score
// appears anywhere in P1. Normalization is a representation problem; correctness
// is a later, evidence-based question that P1 deliberately does not answer.
import { suite } from './_assert.mjs';
import { read, slice, importTS } from './_source.mjs';

const t = suite('evidence-normalizer');
const SRC = read('supabase/functions/_shared/evidence.core.ts');
const mod = await importTS(SRC, []);
const { normalizeSolverOutput, choiceMappingConsistency, letterToIndex, indexToLetter } = mod;

const FIX = JSON.parse(read('tests/fixtures/phase3-pilot-engines.json'));
const item = (id) => FIX.items.find((i) => i.id === id);
const raw  = (id, eng) => item(id).engines[eng];
const norm = (id, eng) =>
  normalizeSolverOutput(raw(id, eng), { question_text: item(id).question_text, choices: item(id).choices });

// ───────────────────────────────────────────────────────────────────────────
t.section('N1. Letter/index mapping is pure syntax, not inference');
{
  t.is('A -> 0', letterToIndex('A'), 0);
  t.is('C -> 2', letterToIndex('C'), 2);
  t.is('lowercase d -> 3', letterToIndex('d'), 3);
  t.is('a non-letter -> null', letterToIndex('7'), null);
  t.is('empty -> null', letterToIndex(''), null);
  t.is('out of range -> null', letterToIndex('Z'), null);
  t.is('0 -> A', indexToLetter(0), 'A');
  t.is('2 -> C', indexToLetter(2), 'C');
  t.is('negative -> null', indexToLetter(-1), null);
  t.is('non-integer -> null', indexToLetter(1.5), null);
}

t.section('N2. THE Q79 CASE — value right, label wrong, and both survive');
{
  const o = norm('Q79', 'engine_alpha');   // published "C) 7"; 7 is at index 1 (B)
  t.is('the derived value is preserved', o.raw_answer, '7');
  t.is('the published label is preserved', o.choice_letter, 'C');
  t.is('and its index is 2, not the index of the value', o.choice_index, 2);
  t.ok('the final answer keeps what the engine actually published',
    /C/.test(o.final_answer) && /7/.test(o.final_answer), o.final_answer);

  // The whole point: the two facts disagree, and that is detectable.
  t.is('the mismatch is CHECKABLE', choiceMappingConsistency(o, item('Q79').choices), 'mismatch');

  // If these ever collapse into one field, the mismatch becomes invisible.
  t.ok('raw_answer and choice_letter are not the same field',
    o.raw_answer !== o.choice_letter, `${o.raw_answer} / ${o.choice_letter}`);
}

t.section('N3. A correctly mapped engine reads as consistent');
{
  const o = norm('Q79', 'engine_beta');    // published "B) 7"; 7 is at index 1
  t.is('value', o.raw_answer, '7');
  t.is('letter', o.choice_letter, 'B');
  t.is('index', o.choice_index, 1);
  t.is('consistent', choiceMappingConsistency(o, item('Q79').choices), 'consistent');
}

t.section('N4. Partial statements stay partial — nothing is invented');
{
  const valueOnly = norm('Q79', 'engine_gamma');   // "7"
  t.is('a bare value keeps the value', valueOnly.raw_answer, '7');
  t.is('and does NOT invent a letter', valueOnly.choice_letter, null);
  t.is('nor an index', valueOnly.choice_index, null);
  t.is('so consistency is unknown, not consistent',
    choiceMappingConsistency(valueOnly, item('Q79').choices), 'unknown');

  const letterOnly = norm('Q79', 'engine_delta');  // "C"
  t.is('a bare letter keeps the letter', letterOnly.choice_letter, 'C');
  t.is('and its index', letterOnly.choice_index, 2);
  t.is('and does NOT invent a value', letterOnly.raw_answer, null);
  t.is('consistency is unknown without a value',
    choiceMappingConsistency(letterOnly, item('Q79').choices), 'unknown');
}

t.section('N5. Prose answers surface a value without inventing a mapping');
{
  const o = norm('PROSE-1', 'engine_alpha');
  t.is('the value is recovered from the sentence', o.raw_answer, '26/5');
  t.is('no choices exist, so no letter', o.choice_letter, null);
  t.is('and no index', o.choice_index, null);
  t.ok('the published sentence is preserved verbatim',
    /sum of the solutions is 26\/5/.test(o.final_answer), o.final_answer);
  t.is('consistency is unknown with no choices',
    choiceMappingConsistency(o, item('PROSE-1').choices), 'unknown');

  const bare = norm('PROSE-1', 'engine_beta');
  t.is('and a bare token gives the same value', bare.raw_answer, '26/5');
}

t.section('N6. No answer means ABSENT, never fabricated');
{
  const o = norm('NOANSWER-1', 'engine_alpha');
  t.is('no final answer', o.final_answer, null);
  t.is('no raw answer', o.raw_answer, null);
  t.is('no letter', o.choice_letter, null);
  t.is('no index', o.choice_index, null);
  t.ok('but the reasoning is still captured', o.reasoning.length > 10, o.reasoning);
  t.ok('and the raw response is preserved whole',
    o.raw_response === raw('NOANSWER-1', 'engine_alpha').text, o.raw_response);
}

t.section('N7. Provenance travels with every output');
{
  const o = norm('Q79', 'engine_alpha');
  t.is('provider', o.provider, 'mock');
  t.is('model', o.model, 'alpha-1');
  t.ok('the unparsed response is always kept', typeof o.raw_response === 'string' && o.raw_response.length > 0);
}

t.section('N8. Normalization is DETERMINISTIC and side-effect free');
{
  const a = JSON.stringify(norm('Q79', 'engine_alpha'));
  const b = JSON.stringify(norm('Q79', 'engine_alpha'));
  t.is('same input -> byte-identical output', a, b);

  const c = JSON.stringify(normalizeSolverOutput(raw('Q79', 'engine_alpha'),
    { question_text: item('Q79').question_text, choices: item('Q79').choices.slice() }));
  t.is('and it does not depend on array identity', c, a);

  t.ok('the module reads no clock', !/Date\.now|new Date\(/.test(SRC), 'a clock makes replay non-reproducible');
  t.ok('the module draws no randomness', !/Math\.random/.test(SRC), 'randomness makes replay non-reproducible');
  t.ok('the module performs no I/O', !/fetch\(|Deno\.env|localStorage/.test(SRC), 'P1 is offline by construction');
}

t.section('N9. Malformed input degrades safely, never throws');
{
  for (const bad of [null, undefined, {}, { text: null }, { text: '' }, { text: 123 }]) {
    let out, threw = false;
    try { out = normalizeSolverOutput(bad, { question_text: 'q', choices: null }); }
    catch (e) { threw = true; }
    t.ok(`${JSON.stringify(bad) ?? String(bad)} does not throw`, !threw);
    if (!threw) t.is('  and yields no fabricated answer', out.raw_answer, null);
  }
  let threw = false;
  try { normalizeSolverOutput(raw('Q79', 'engine_alpha'), null); } catch (e) { threw = true; }
  t.ok('a missing input descriptor does not throw', !threw);
}

t.done();
