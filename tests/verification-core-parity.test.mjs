// V1-T16 parity suite — proves the extraction is behaviour-preserving.
//
// The L3 verification pipeline moved out of ai-tutor/index.ts into
// _shared/verification.core.ts. A refactor of that size is only worth doing if
// it is provably pure, and reading the diff is not proof.
//
// tests/fixtures/v1-t16-golden.json was captured from the PRE-extraction code
// by scripts/capture-v1-t16-golden.mjs. This suite replays the identical
// scenarios through the POST-extraction module and asserts deep equality on
// every artefact the pipeline produces:
//
//   • the question_records UPDATE payload — verification_meta and its columns
//   • the judge verdict and confidence
//   • the verification_decisions row
//   • verification_quality_score
//   • the ai_model_calls rows (which provider calls were made, in what order)
//   • the console telemetry payload
//
// The capture runs in a subprocess writing to a scratch path, never to the
// committed golden — a regression must not be able to overwrite its own
// reference and pass.
//
// WHEN THIS FAILS: the extracted pipeline no longer behaves like the original.
// Do not regenerate the golden to make it pass. Find out what changed.
import { suite } from './_assert.mjs';
import { REPO } from './_source.mjs';
import { goldenSubsetDiff, describeDiff } from './_subset.mjs';
import { spawnSync } from 'node:child_process';
import { readFileSync, mkdtempSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';

const t = suite('verification-core-parity');

const GOLDEN = JSON.parse(readFileSync(resolve(REPO, 'tests/fixtures/v1-t16-golden.json'), 'utf8'));

// ── Capture from the extracted module ───────────────────────────────────────
const outFile = join(mkdtempSync(join(tmpdir(), 'v1t16-parity-')), 'post.json');
const proc = spawnSync(process.execPath, [
  '--experimental-strip-types', '--no-warnings',
  resolve(REPO, 'scripts/capture-v1-t16-golden.mjs'),
  '--source=post', `--out=${outFile}`,
], { cwd: REPO, encoding: 'utf8' });

t.section('capture');
t.ok('the extracted module ran all scenarios', proc.status === 0);
if (proc.status !== 0) {
  console.log((proc.stdout || '') + (proc.stderr || ''));
  t.done();
}

const POST = JSON.parse(readFileSync(outFile, 'utf8'));

t.is('golden was captured from the pre-extraction code', GOLDEN.source, 'pre');
t.is('replay was captured from the extracted module', POST.source, 'post');
t.is('the deterministic clock matches', POST.fixed_now, GOLDEN.fixed_now);
t.is('scenario count matches', POST.scenarios.length, GOLDEN.scenarios.length);
t.ok('the golden covers a meaningful number of scenarios', GOLDEN.scenarios.length >= 6);

// ── The comparison rule ─────────────────────────────────────────────────────
// The golden is a LOWER BOUND, not a photograph. Everything it witnessed must
// still hold exactly — same values, same keys, same array lengths and order,
// same types. Keys it never witnessed are outside its jurisdiction.
//
// This narrowing exists because the fixture is UNREGENERABLE: --source=pre
// rebuilds the pipeline from ai-tutor/index.ts and V1-T16 moved the definition
// out, so that capture crashes; --source=post would compare the code against
// itself, which the `GOLDEN.source === 'pre'` assertion above refuses. Under
// whole-object deep equality, any deliberate additive change to pipeline output
// could only be made green by regenerating the golden — destroying the proof it
// carries. See tests/_subset.mjs and tests/parity-guard.test.mjs.
//
// WHAT THIS NO LONGER CATCHES, stated plainly: a brand-new key added anywhere,
// including a new field in a provider request body. Everything else the guard
// caught before, it still catches.
const same = (label, golden, replay) => {
  const d = goldenSubsetDiff(golden, replay);
  t.ok(d === null ? label : `${label} — ${describeDiff(d)}`, d === null);
};

// ── Per-scenario, per-artefact equality ─────────────────────────────────────
const pick = (s, pred) => s.writes.find(pred);
const upd  = (s) => pick(s, w => w.op === 'update' && w.table === 'question_records')?.payload;
const dec  = (s) => pick(s, w => w.table === 'verification_decisions')?.rows;
const call = (s) => pick(s, w => w.table === 'ai_model_calls')?.rows;

for (let i = 0; i < GOLDEN.scenarios.length; i++) {
  const g = GOLDEN.scenarios[i];
  const p = POST.scenarios[i];

  t.section(`scenario: ${g.scenario}`);
  t.is('scenario name aligns', p.scenario, g.scenario);

  // The provider calls themselves: same stages, same models, same params, same
  // order. A refactor that reordered or dropped a call would show up here even
  // if the final payload happened to match.
  same('provider calls are preserved', g.requests, p.requests);

  // Everything the pipeline writes, in order.
  same('database writes are preserved (tables, ops and payloads)', g.writes, p.writes);

  // Called out individually so a failure names the artefact rather than
  // dumping the whole write list.
  same('verification_meta is preserved', upd(g)?.verification_meta, upd(p)?.verification_meta);
  t.is('judge verdict is identical', upd(p)?.judge_verdict, upd(g)?.judge_verdict);
  t.is('verification confidence is identical', upd(p)?.verification_confidence, upd(g)?.verification_confidence);
  t.is('solver agreement is identical', upd(p)?.solver_agreement, upd(g)?.solver_agreement);
  t.is('quality score is identical',
    upd(p)?.verification_meta?.verification_quality_score,
    upd(g)?.verification_meta?.verification_quality_score);
  t.is('verification_reason is identical',
    upd(p)?.verification_meta?.verification_reason,
    upd(g)?.verification_meta?.verification_reason);
  same('the verification_decisions row is preserved', dec(g), dec(p));
  same('the ai_model_calls rows are preserved', call(g), call(p));
  same('the console telemetry payload is preserved', g.shadow_log, p.shadow_log);
}

// ── Whole-fixture coverage ──────────────────────────────────────────────────
// The per-artefact assertions above name what broke; this one guarantees
// nothing was missed by them — it walks the ENTIRE golden, including any
// artefact the loop above never singles out. `source` is the only field allowed
// to differ, because it records which code path produced the capture.
t.section('whole-fixture coverage');
{
  const strip = (o) => { const c = structuredClone(o); delete c.source; return c; };
  const d = goldenSubsetDiff(strip(GOLDEN), strip(POST));
  t.ok(d === null
    ? 'every value the golden captured is still produced, unchanged'
    : `the replay diverges from the golden — ${describeDiff(d)}`, d === null);
}

t.done();
