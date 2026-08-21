#!/usr/bin/env node
// Repo-wide gate for the Meta marketing integration.
//
// tests/meta-isolation.test.mjs asserts the boundaries of the two Meta modules
// by executing them. This gate is the other half: it scans the WHOLE tree for
// things no single module can check — a credential committed anywhere, a Graph
// call made outside the adapter, an unpinned API version.
//
// Auto-discovered by tests/run-all.mjs (every scripts/validate-*.mjs is), so it
// runs in CI with no workflow change. Plain Node, no TypeScript import, so it
// needs no type-stripping flag.
import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const SKIP_DIRS = new Set(['.git', 'node_modules', '.design-sync', 'logs', '.ds-sync', 'ds-bundle']);
const SCAN_EXT = new Set(['.ts', '.js', '.mjs', '.sh', '.json', '.html', '.sql', '.yml', '.toml', '.txt']);

/** The adapter is the ONLY module permitted to CALL the Graph host. Anything
 *  else doing so is a second place for credentials and version pinning to live
 *  — which is how the first one stops being the source of truth. */
const GRAPH_HOST_ALLOWED = new Set([
  'supabase/functions/_shared/meta-graph.core.ts',
]);

/** Files that may NAME the host without calling it, and why each is not the
 *  risk this rule guards against:
 *
 *    this file          — the rule has to quote the string it matches on.
 *    tests/meta-*       — the suites assert on the url the adapter BUILDS.
 *                         A test naming the host is the enforcement, not a
 *                         second caller; deleting these assertions is how the
 *                         pinning check stops being real.
 *
 *  Kept as an explicit list rather than a `tests/` wildcard, so a new file
 *  that starts calling Graph from the test tree still trips the gate. */
const GRAPH_HOST_EXEMPT = new Set([
  'scripts/validate-meta-source.mjs',
  'tests/meta-graph.test.mjs',
  'tests/meta-isolation.test.mjs',
]);

/** Files allowed to contain the literal string of a Graph host in PROSE.
 *  Documentation legitimately quotes endpoints while explaining them. */
const PROSE_EXT = new Set(['.md']);

const files = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = resolve(dir, name);
    if (statSync(full).isDirectory()) walk(full);
    else if (SCAN_EXT.has(extname(name))) files.push(full);
  }
})(REPO);

const failures = [];
const fail = (msg) => failures.push(msg);

// ── 1 · no credential may be committed, anywhere ───────────────────────────
// Real Facebook tokens are ~150+ characters. The threshold is set well above
// any test fixture so the gate catches a genuine paste without going red on
// the deliberately-short stand-ins the suites use.
const TOKEN_RE = /\bEAA[A-Za-z0-9_-]{80,}/;
// A System User token pasted into a shell export is the likeliest accident.
const EXPORT_RE = /\b(META_APP_SECRET|META_SYSTEM_USER_TOKEN|META_ADS_TOKEN)\s*=\s*["']?[A-Za-z0-9_-]{16,}/;

for (const f of files) {
  const rel = relative(REPO, f).replace(/\\/g, '/');
  const src = readFileSync(f, 'utf8');

  if (TOKEN_RE.test(src)) fail(`${rel}: contains a Facebook-token-shaped literal`);
  if (EXPORT_RE.test(src)) fail(`${rel}: assigns a value to a Meta secret env var`);

  // ── 2 · Graph calls live in the adapter only ─────────────────────────────
  // Matched as a URL (`https://graph.facebook.com`), not as a bare hostname.
  // The risk this rule guards against is a second module CALLING Graph; a
  // module that names the host in an operator-facing sentence — "confirm this
  // machine can reach graph.facebook.com" — is help, not a call. Matching the
  // bare hostname flagged exactly that sentence, which would have pushed the
  // useful half of a diagnostic message out of the code to satisfy a lint.
  const hostExempt = GRAPH_HOST_ALLOWED.has(rel) || GRAPH_HOST_EXEMPT.has(rel) || PROSE_EXT.has(extname(f));
  if (/https?:\/\/graph\.facebook\.com/.test(src) && !hostExempt) {
    fail(`${rel}: references graph.facebook.com outside the adapter ` +
      `(only ${[...GRAPH_HOST_ALLOWED].join(', ')} may)`);
  }

  // ── 3 · the API version is pinned from the environment, never inline ─────
  // A hardcoded version is a silent behaviour change on the day Meta sunsets
  // it. Prose may name a version; code may not embed one in a URL.
  if (!hostExempt && /https?:\/\/graph\.facebook\.com\/v\d+\.\d+/.test(src)) {
    fail(`${rel}: hardcodes a Graph API version in a URL — build it from META_GRAPH_VERSION`);
  }
}

// ── 4 · no env file may be TRACKED ─────────────────────────────────────────
// Tracked, not merely present. A local .env is a reasonable way to hold
// credentials for an L0 run — safer than shell history, which keeps a
// permanent System User token in plain text forever. The failure mode worth
// gating is committing one, and an earlier version of this rule failed on mere
// existence, which would have made the safe local workflow break CI and pushed
// an operator toward the unsafe one.
{
  const ls = spawnSync('git', ['ls-files'], { cwd: REPO, encoding: 'utf8' });
  if (ls.status === 0) {
    const tracked = ls.stdout.split('\n').map((l) => l.trim()).filter(Boolean);
    for (const f of tracked) {
      if (/(^|\/)\.env(\.|$)/.test(f)) {
        fail(`${f} is TRACKED by git — a committed env file is a committed credential. ` +
          `Run: git rm --cached ${f}`);
      }
    }
  } else {
    // No git (a tarball, a sandbox). Fall back to the stricter check rather
    // than skipping silently — a gate that quietly does nothing is worse than
    // one that is occasionally annoying.
    for (const name of ['.env', '.env.local', 'supabase/.env']) {
      try { statSync(resolve(REPO, name)); fail(`${name} exists and git is unavailable to ` +
        'confirm it is untracked — verify it is not committed'); } catch { /* absent */ }
    }
  }
}

// ── 5 · the L0 checker stays read-only ─────────────────────────────────────
// Duplicated deliberately from the isolation suite. That suite proves it by
// execution; this proves it by inspection, and the two fail independently.
const L0 = [
  'supabase/functions/_shared/meta-connection.core.ts',
  'scripts/meta-connection-check.mjs',
];
for (const rel of L0) {
  const src = readFileSync(resolve(REPO, rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n');
  if (/method\s*:\s*['"](POST|PUT|PATCH|DELETE)['"]/.test(src)) {
    fail(`${rel}: names a write HTTP method — L0 is read-only`);
  }
  if (/\.(post|del)\s*\(/.test(src)) {
    fail(`${rel}: calls a write method on the client — L0 is read-only`);
  }
  for (const needle of ['media_publish', 'execution_options', 'adcreatives']) {
    if (src.includes(needle)) fail(`${rel}: references ${needle} — L0 publishes and creates nothing`);
  }
}

// ── 5b · L1-0 stays a dry run, and cannot publish ──────────────────────────
// L0's rules above keep the connection checker read-only. These keep the L1
// dry-run runner incapable of sending, and keep the one irreversible,
// externally-visible operation out of L1 entirely.
{
  const rel = 'scripts/meta-l1-check.mjs';
  try {
    const src = readFileSync(resolve(REPO, rel), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n');
    if (!/dryRun:\s*true/.test(src)) fail(`${rel}: does not hardcode dryRun: true`);
    if (/media_publish/.test(src)) fail(`${rel}: references media_publish — L1 publishes nothing`);
    if (/validateOnly:\s*false/.test(src)) fail(`${rel}: disables validate-only — L1 creates nothing`);
    if (/process\.env\.META_DRY/.test(src)) {
      fail(`${rel}: reads dry-run state from the environment — it must be hardcoded, so no ` +
        'env edit can turn the dry run into a live writer');
    }
  } catch (e) {
    if (e && e.code === 'ENOENT') fail(`${rel} is missing`);
    else throw e;
  }

  // Ads must never accept a status parameter: PAUSED is the only status a
  // builder may produce, and a parameter is one typo away from ACTIVE.
  const adsRel = 'supabase/functions/_shared/meta-ads.core.ts';
  try {
    const ads = readFileSync(resolve(REPO, adsRel), 'utf8');
    if (/status:\s*args\./.test(ads)) fail(`${adsRel}: status is caller-supplied — it must be a literal`);
    if (!/status:\s*'PAUSED'/.test(ads)) fail(`${adsRel}: no literal PAUSED status found`);
    if (/['"]ACTIVE['"]/.test(ads)) fail(`${adsRel}: names the ACTIVE status — going live is not a builder's job`);
  } catch (e) {
    if (!e || e.code !== 'ENOENT') throw e;
  }
}

// ── 5c · the L1-1 runner stays a single validate-only request ──────────────
{
  const rel = 'scripts/meta-l1-1-validate.mjs';
  try {
    const raw = readFileSync(resolve(REPO, rel), 'utf8');
    // Skip the runner's own self-inspection fence: it must name the endpoints
    // it forbids, so scanning it would fire on its own needles.
    const fs2 = raw.indexOf('// SELF-INSPECT-BEGIN');
    const fe2 = raw.lastIndexOf('// SELF-INSPECT-END');
    if (fs2 < 0 || fe2 <= fs2) fail(`${rel}: self-inspection fence is missing`);
    const src = (fs2 >= 0 && fe2 > fs2 ? raw.slice(0, fs2) + raw.slice(fe2) : raw)
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n');

    const writes = (src.match(/client\.write\s*\(/g) ?? []).length;
    if (writes !== 1) fail(`${rel}: ${writes} client.write() calls — L1-1 sends exactly one`);
    if (/publish:\s*true/.test(src)) fail(`${rel}: grants the publish capability — L1-1 is ads-only`);
    if (/['"]DELETE['"]/.test(src)) fail(`${rel}: names DELETE`);
    if (/validateOnly:\s*false/.test(src)) fail(`${rel}: disables validate-only — it would CREATE a campaign`);
    for (const n of ['media_publish', '/media', '/feed', '/adsets', '/adcreatives']) {
      if (src.includes(n)) fail(`${rel}: references ${n}`);
    }
  } catch (e) {
    if (e && e.code === 'ENOENT') fail(`${rel} is missing`);
    else throw e;
  }
}

// ── 6 · the spec exists and stays in step ──────────────────────────────────
const SPEC = 'docs/engineering/meta-marketing-integration.md';
try {
  const spec = readFileSync(resolve(REPO, SPEC), 'utf8');
  for (const name of ['META_GRAPH_VERSION', 'META_SYSTEM_USER_TOKEN', 'appsecret_proof']) {
    if (!spec.includes(name)) fail(`${SPEC}: no longer documents ${name}`);
  }
} catch {
  fail(`${SPEC} is missing — the integration's specification must stay with the code`);
}

console.log(`  scanned ${files.length} files`);
if (failures.length) {
  console.log(`\n  FAIL — ${failures.length} problem(s):`);
  for (const f of failures) console.log(`    • ${f}`);
  process.exit(1);
}
console.log('  PASS — no committed credential, no Graph call outside the adapter, L0 read-only');
