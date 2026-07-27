#!/usr/bin/env node
// Runs every tests/*.test.mjs plus the scripts/validate-*.mjs gates.
// Exits non-zero if anything fails, so CI needs no test framework — just node.
//
//   node tests/run-all.mjs            all suites + validators
//   node tests/run-all.mjs streak     only suites whose name matches
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const filter = process.argv[2] || '';

// Suites that read the Edge Function's TypeScript need Node's type stripping.
const NEEDS_TS = /scope-guardrail|zero-personality|edge-security/;

const suites = readdirSync(HERE).filter(f => f.endsWith('.test.mjs')).sort()
  .filter(f => !filter || f.includes(filter));
const validators = readdirSync(resolve(REPO, 'scripts'))
  .filter(f => /^validate-.*\.mjs$/.test(f)).sort()
  .filter(() => !filter);

const results = [];
const run = (label, cmd, args) => {
  const r = spawnSync(cmd, args, { cwd: REPO, encoding: 'utf8' });
  const ok = r.status === 0;
  results.push({ label, ok, out: (r.stdout || '') + (r.stderr || '') });
  console.log(`${ok ? '  PASS' : '  FAIL'}  ${label}`);
  if (!ok) console.log((r.stdout || '').split('\n').filter(l => /FAIL|Error|expected|actual/.test(l))
    .slice(0, 12).map(l => `        ${l}`).join('\n'));
};

console.log('── test suites ──');
for (const f of suites) {
  const args = NEEDS_TS.test(f)
    ? ['--experimental-strip-types', '--no-warnings', resolve(HERE, f)]
    : [resolve(HERE, f)];
  run(f.replace('.test.mjs', ''), process.execPath, args);
}

if (validators.length) {
  console.log('\n── repo validators ──');
  // validate-ai-tutor-source is discovered here like every other validator now
  // that it is Node. It used to be invoked separately via `bash`, which was the
  // suite's only non-Node dependency and failed outright on Windows — spawnSync
  // returned status null with no stdout or stderr, so the gate reported a bare
  // FAIL with no reason. See scripts/validate-ai-tutor-source.mjs.
  for (const f of validators) run(f.replace('.mjs', ''), process.execPath, [resolve(REPO, 'scripts', f)]);
}

const failed = results.filter(r => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} green`);
if (failed.length) {
  console.log('\nFailing:');
  for (const f of failed) console.log(`  • ${f.label}`);
  process.exit(1);
}
console.log('ALL GREEN');
