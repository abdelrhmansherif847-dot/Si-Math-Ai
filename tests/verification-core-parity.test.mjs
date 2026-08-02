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
  t.is('provider calls are identical', p.requests, g.requests);

  // Everything the pipeline writes, in order.
  t.is('database writes are identical (tables, ops and payloads)', p.writes, g.writes);

  // Called out individually so a failure names the artefact rather than
  // dumping the whole write list.
  t.is('verification_meta is identical', upd(p)?.verification_meta, upd(g)?.verification_meta);
  t.is('judge verdict is identical', upd(p)?.judge_verdict, upd(g)?.judge_verdict);
  t.is('verification confidence is identical', upd(p)?.verification_confidence, upd(g)?.verification_confidence);
  t.is('solver agreement is identical', upd(p)?.solver_agreement, upd(g)?.solver_agreement);
  t.is('quality score is identical',
    upd(p)?.verification_meta?.verification_quality_score,
    upd(g)?.verification_meta?.verification_quality_score);
  t.is('verification_reason is identical',
    upd(p)?.verification_meta?.verification_reason,
    upd(g)?.verification_meta?.verification_reason);
  t.is('the verification_decisions row is identical', dec(p), dec(g));
  t.is('the ai_model_calls rows are identical', call(p), call(g));
  t.is('the console telemetry payload is identical', p.shadow_log, g.shadow_log);
}

// ── Whole-fixture equality ──────────────────────────────────────────────────
// The per-artefact assertions above name what broke; this one guarantees
// nothing was missed by them. `source` is the only field allowed to differ,
// because it records which code path produced the capture.
t.section('whole-fixture equality');
{
  const strip = (o) => { const c = structuredClone(o); delete c.source; return c; };
  const a = JSON.stringify(strip(GOLDEN));
  const b = JSON.stringify(strip(POST));
  t.ok('every byte of the capture matches, except the source label', a === b);
  if (a !== b) {
    t.note(`golden ${a.length} bytes vs replay ${b.length} bytes`);
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      if (a[i] !== b[i]) { t.note(`first divergence at byte ${i}: ${JSON.stringify(a.slice(i - 80, i + 80))}`); break; }
    }
  }
}

t.done();
