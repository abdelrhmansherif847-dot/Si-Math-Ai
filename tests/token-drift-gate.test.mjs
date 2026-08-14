// scripts/validate-tokens.mjs — proof that the token drift gate can go red.
//
// The gate passing on a clean tree proves nothing on its own: a validator that
// always exits 0 would look identical. See
// docs/roadmap/verification-framework-audit.md — "a green check is only
// evidence if it could have gone red". This suite makes real drift and asserts
// the gate catches it, and makes changes it must IGNORE and asserts it stays
// quiet.
//
// Method: mutate a real page, run the real gate, restore. admin.html is used
// because it is not frozen and not a public knowledge page. Restoration is in a
// finally block AND re-asserted at the end from the original bytes, so a failure
// mid-suite cannot leave the working tree dirty.

import { readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { suite } from './_assert.mjs';

const t = suite('token-drift-gate');
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const GATE = resolve(REPO, 'scripts/validate-tokens.mjs');
const PAGE = resolve(REPO, 'admin.html');
const SECOND = resolve(REPO, 'devices.html');

const runGate = () => {
  const r = spawnSync(process.execPath, [GATE], { cwd: REPO, encoding: 'utf8' });
  return { code: r.status, out: (r.stdout ?? '') + (r.stderr ?? '') };
};

/** Mutate files via `edits`, run the gate, always restore. */
function withEdits(edits, fn) {
  const originals = edits.map(([file]) => [file, readFileSync(file)]);
  try {
    for (const [file, from, to] of edits) {
      const src = readFileSync(file, 'utf8');
      if (!src.includes(from)) throw new Error(`fixture stale: ${file} no longer contains "${from}"`);
      writeFileSync(file, src.replace(from, to));
    }
    return fn();
  } finally {
    for (const [file, buf] of originals) writeFileSync(file, buf);
  }
}

const PRISTINE = readFileSync(PAGE);
const PRISTINE_2 = readFileSync(SECOND);

t.section('the gate is green on the current tree');
{
  const r = runGate();
  t.is('exits 0', r.code, 0);
  t.ok('reports what it checked', /shared declarations across \d+ files agree/.test(r.out));
}

t.section('it goes red on real drift');
{
  const r = withEdits([[PAGE, '--green:#22c55e', '--green:#4ade80']], runGate);
  t.is('exits 1', r.code, 1);
  t.ok('names the category', r.out.includes('[TOKEN_DRIFT]'));
  t.ok('names the file', r.out.includes('admin.html'));
  t.ok('names the token', r.out.includes('--green'));
  t.ok('names both values', r.out.includes('#4ade80') && r.out.includes('#22c55e'));
}
{
  const r = withEdits([[PAGE, '--r-xl:24px', '--r-xl:30px']], runGate);
  t.is('catches a non-colour token too', r.code, 1);
  t.ok('names it', r.out.includes('--r-xl'));
}

t.section('it stays quiet on changes that are not drift');
{
  // Same rendered colour, different notation. The gate compares rendered values
  // deliberately, so this must NOT fail.
  const r = withEdits([[PAGE, '--text-100:#ffffff', '--text-100:#fff']], runGate);
  t.is('notation-only change passes', r.code, 0);
}
{
  // Per-surface by design: the marketing nav, app shell and dashboard differ.
  const r = withEdits([[PAGE, '--nav-h:56px', '--nav-h:72px']], runGate);
  t.is('per-surface token passes', r.code, 0);
}

t.section('it catches a new shared token nobody declared');
{
  const r = withEdits([
    [PAGE, '--r-sm:10px', '--r-sm:10px;--test-only-token:9px'],
    [SECOND, '--r-sm:10px', '--r-sm:10px;--test-only-token:11px'],
  ], runGate);
  t.is('exits 1', r.code, 1);
  t.ok('flags it as undeclared', r.out.includes('[UNDECLARED]'));
}
{
  // Defined by ONE file only — page-local, nothing to disagree with.
  const r = withEdits([[PAGE, '--r-sm:10px', '--r-sm:10px;--test-only-token:9px']], runGate);
  t.is('a page-local token passes', r.code, 0);
}

t.section('the working tree survived');
t.ok('admin.html restored byte-for-byte', readFileSync(PAGE).equals(PRISTINE));
t.ok('devices.html restored byte-for-byte', readFileSync(SECOND).equals(PRISTINE_2));

t.done();
