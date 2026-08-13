// RC2 PR0 — the parity guard's comparison mechanism.
//
// WHY THIS EXISTS
// ───────────────
// tests/fixtures/v1-t16-golden.json is the evidence that the V1-T16 extraction
// of the L3 pipeline into _shared/verification.core.ts was behaviour-preserving.
// It is also UNREGENERABLE:
//
//   • capture --source=pre rebuilds the pipeline from ai-tutor/index.ts, but
//     V1-T16 moved the definition out — `grep -c "async function
//     runL3ShadowPipeline" index.ts` is 0, and the capture crashes;
//   • capture --source=post would compare the code against itself, and the
//     parity suite correctly refuses it by asserting golden.source === 'pre'.
//
// So the golden is frozen historical evidence. But the parity suite compared it
// by WHOLE-OBJECT deep equality, which cannot survive any deliberate ADDITIVE
// change to pipeline output. That is not a property of the evidence — it is a
// property of the comparison — and it would block every future telemetry
// addition, forever, unless someone regenerated the golden and destroyed the
// proof.
//
// This suite pins the narrowed comparison: the golden is treated as a LOWER
// BOUND. Everything it witnessed must still hold exactly; anything it never
// witnessed is out of its jurisdiction.
//
//   changed value on a captured key   -> FAIL
//   captured key deleted              -> FAIL
//   captured array reordered/resized  -> FAIL
//   type of a captured value changed  -> FAIL
//   NEW key the golden never saw      -> PASS
//
// The four proofs the PR0 brief asks for are P2, P3, P4 and P1 respectively.
import { suite } from './_assert.mjs';
import { read } from './_source.mjs';
import { goldenSubsetDiff } from './_subset.mjs';

const t = suite('parity-guard');

const ok   = (g, p) => goldenSubsetDiff(g, p) === null;
const diff = (g, p) => goldenSubsetDiff(g, p);

// A miniature of the real fixture's shape: nested payloads, arrays of objects,
// mixed scalar types. Anything the comparator gets wrong here it gets wrong on
// the real golden too.
const GOLDEN = {
  scenario: 'text_agree_blind_off',
  requests: [{ kind: 'solver', temperature: 0.1 }, { kind: 'judge', model: 'gpt-4o' }],
  writes: [{
    table: 'question_records', op: 'update',
    payload: {
      judge_verdict: 'agrees',
      solver_agreement: 1,
      verification_meta: {
        pipeline_version: 'l3-shadow-v3',
        solver_answers: ['42', '42'],
        judge_answer_blind: false,
        verification_quality_score: 0.976,
        zero_answer_hash: 'abc123',
      },
    },
  }],
  shadow_log: { record_id: 'r1', judge_verdict: 'agrees' },
};
const clone = () => structuredClone(GOLDEN);

// ───────────────────────────────────────────────────────────────────────────
t.section('P1. PROOF 4 — the untouched implementation passes');
{
  t.ok('an identical replay satisfies the golden', ok(GOLDEN, clone()));
  t.is('and reports no diff', diff(GOLDEN, clone()), null);
}

t.section('P2. PROOF 1 — changing an existing captured key FAILS');
{
  const scalar = clone(); scalar.writes[0].payload.judge_verdict = 'disagrees';
  const d1 = diff(GOLDEN, scalar);
  t.ok('a changed verdict is caught', d1 !== null, JSON.stringify(d1));
  t.ok('and the path names it', /judge_verdict/.test(d1?.path ?? ''), d1?.path);

  const nested = clone(); nested.writes[0].payload.verification_meta.pipeline_version = 'l3-shadow-v4';
  t.ok('a changed value deep inside verification_meta is caught', !ok(GOLDEN, nested));

  const num = clone(); num.writes[0].payload.verification_meta.verification_quality_score = 0.975;
  t.ok('a one-digit score drift is caught', !ok(GOLDEN, num));

  const inArray = clone(); inArray.writes[0].payload.verification_meta.solver_answers[1] = '43';
  t.ok('a changed element inside a captured array is caught', !ok(GOLDEN, inArray));

  const req = clone(); req.requests[0].temperature = 0.2;
  t.ok('a changed provider-call parameter is caught', !ok(GOLDEN, req));

  const log = clone(); log.shadow_log.judge_verdict = 'inconclusive';
  t.ok('a changed console telemetry field is caught', !ok(GOLDEN, log));
}

t.section('P3. PROOF 2 — deleting an existing captured key FAILS');
{
  const gone = clone(); delete gone.writes[0].payload.verification_meta.zero_answer_hash;
  const d = diff(GOLDEN, gone);
  t.ok('a removed captured key is caught', d !== null, JSON.stringify(d));
  t.ok('and it is reported as missing', /missing/.test(d?.reason ?? ''), d?.reason);
  t.ok('the path names the removed key', /zero_answer_hash/.test(d?.path ?? ''), d?.path);

  const topGone = clone(); delete topGone.shadow_log;
  t.ok('a removed top-level artefact is caught', !ok(GOLDEN, topGone));

  const writeGone = clone(); writeGone.writes = [];
  t.ok('a dropped database write is caught', !ok(GOLDEN, writeGone));

  // A key present but null is NOT the same as absent, and must also fail.
  const nulled = clone(); nulled.writes[0].payload.verification_meta.zero_answer_hash = null;
  t.ok('nulling a captured key is caught', !ok(GOLDEN, nulled));
}

t.section('P4. PROOF 3 — purely additive new keys PASS');
{
  const added = clone();
  added.writes[0].payload.verification_meta.rc2_tutor_answer_raw = 'x = 12';
  added.writes[0].payload.verification_meta.rc2_tutor_vs_solver  = 'match';
  t.ok('new verification_meta keys are out of the golden\'s jurisdiction', ok(GOLDEN, added));

  const addedTop = clone(); addedTop.new_artefact = { anything: true };
  t.ok('a whole new top-level artefact is allowed', ok(GOLDEN, addedTop));

  const addedInWrite = clone(); addedInWrite.writes[0].payload.new_column = 7;
  t.ok('a new key beside a captured payload is allowed', ok(GOLDEN, addedInWrite));

  // Additive must not become a loophole: adding a key while changing another
  // still fails.
  const both = clone();
  both.writes[0].payload.verification_meta.rc2_new = 1;
  both.writes[0].payload.judge_verdict = 'disagrees';
  t.ok('an addition cannot mask a regression', !ok(GOLDEN, both));
}

t.section('P5. Structural changes to the captured surface FAIL');
{
  const grew = clone(); grew.writes[0].payload.verification_meta.solver_answers.push('42');
  t.ok('growing a captured array is caught', !ok(GOLDEN, grew));

  const shrank = clone(); shrank.requests.pop();
  t.ok('dropping a captured provider call is caught', !ok(GOLDEN, shrank));

  const reordered = clone(); reordered.requests.reverse();
  t.ok('reordering captured provider calls is caught', !ok(GOLDEN, reordered));

  const retyped = clone(); retyped.writes[0].payload.solver_agreement = '1';
  t.ok('a number becoming a string is caught', !ok(GOLDEN, retyped));

  const objToScalar = clone(); objToScalar.writes[0].payload.verification_meta = 'gone';
  t.ok('an object collapsing to a scalar is caught', !ok(GOLDEN, objToScalar));

  const arrToObj = clone(); arrToObj.writes[0].payload.verification_meta.solver_answers = { 0: '42', 1: '42' };
  t.ok('an array becoming an object is caught', !ok(GOLDEN, arrToObj));
}

t.section('P6. The parity suite actually USES this comparator');
{
  // Without this, PR0 could pass while verification-core-parity kept its old
  // whole-object equality and nothing would have changed.
  const PARITY = read('tests/verification-core-parity.test.mjs');
  t.ok('it imports the comparator', /from '\.\/_subset\.mjs'/.test(PARITY), PARITY.slice(0, 400));
  t.ok('it calls it', /goldenSubsetDiff\s*\(/.test(PARITY), 'comparator never invoked');
  t.ok('the whole-fixture check no longer demands byte equality',
    !/every byte of the capture matches/.test(PARITY), 'byte-equality assertion still present');

  // The golden must remain the reference, and `pre` must remain its source.
  t.ok('the golden is still read from the committed fixture',
    /v1-t16-golden\.json/.test(PARITY), 'golden path changed');
  t.ok('the suite still refuses a post-sourced golden',
    /GOLDEN\.source, 'pre'/.test(PARITY), 'the --source=post guard was removed');
}

t.done();
