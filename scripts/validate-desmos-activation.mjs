#!/usr/bin/env node
// Desmos activation gate — "not production-proven" made structural.
//
// WHY THIS FILE EXISTS
// --------------------
// The Desmos integration is written against documented behaviour and has never
// been run against the real API: www.desmos.com is unreachable from the
// environment it was built in, and no key exists. A promise not to treat it as
// proven is worth nothing across sessions and people, so the promise is a check
// instead.
//
// It is a gate, not a test of Desmos. Three things it will not let happen:
//
//   1. An exam naming a calculator provider while the record still says the
//      integration is unproven. Naming a provider is the last of the three
//      gates in exam-calculator.js and the only one a student can feel.
//   2. The record claiming ACTIVATED without evidence a human could check —
//      a date, the API version that was mounted, and the tier of the key.
//   3. An API key reaching this repository, which is PUBLIC. Desmos API Terms
//      §5.c requires reasonable efforts to keep it confidential; a key in a
//      public git history is the opposite of that, and unlike the other two
//      this one cannot be undone by a revert.
//
// Every one of these can go red. #1 goes red the moment someone edits
// exam-registry.js ahead of the activation test; #3 goes red on a committed key.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const RECORD = 'docs/engineering/desmos-integration.md';
const fails = [];
const read = p => readFileSync(join(REPO, p), 'utf8');

// ── 1. the record's own status ────────────────────────────────────────────────
//
// The marker lives in the record's HEADER — the first few lines — and nowhere
// else. That is not fussiness: the runbook further down quotes the marker as an
// example of what to write, and an earlier version of this check happily read
// that example instead of the real one. A mutation test caught it. Restricting
// the parse to the header makes the example inert, and the field formats below
// reject its placeholders on their own merits.
const record = read(RECORD);
const HEADER = record.split('\n').slice(0, 10).join('\n');
const MARKER = /^<!--\s*desmos-activation:\s*(UNPROVEN|ACTIVATED)\s*-->$/m;
const m = HEADER.match(MARKER);
if (!m) {
  fails.push(`${RECORD} carries no activation marker in its first 10 lines. ` +
             `Expected "<!-- desmos-activation: UNPROVEN -->" or "... ACTIVATED -->".`);
}
const status = m ? m[1] : 'UNPROVEN';

// ── 2. ACTIVATED must come with evidence, and the evidence must be real ──────
//
// Every field is format-checked. A copied-and-not-filled-in template is the
// realistic failure here, not a missing line, so "YYYY-MM-DD" must fail exactly
// as hard as an absent date.
if (status === 'ACTIVATED') {
  const ev = HEADER.match(/^<!--\s*desmos-evidence:\s*(.+?)\s*-->$/m);
  const fields = ev ? Object.fromEntries(
    ev[1].split(';').map(s => s.split('=').map(x => x.trim())).filter(p => p.length === 2)) : {};
  const SHAPE = {
    date: /^\d{4}-\d{2}-\d{2}$/,
    apiVersion: /^v\d+\.\d+$/,
    tier: /^(commercial|trial)$/,
    checkedBy: /^(?!name$|<)[^<>]{2,}$/,
  };
  if (!ev) {
    fails.push(`${RECORD} says ACTIVATED but carries no desmos-evidence line in its ` +
               `first 10 lines. Expected: <!-- desmos-evidence: date=YYYY-MM-DD; ` +
               `apiVersion=vX.Y; tier=commercial; checkedBy=name -->`);
  } else {
    for (const [k, re] of Object.entries(SHAPE)) {
      if (!fields[k]) {
        fails.push(`${RECORD} evidence has no "${k}".`);
      } else if (!re.test(fields[k])) {
        fails.push(`${RECORD} evidence field ${k}="${fields[k]}" is not a filled-in value ` +
                   `(expected ${re}). The activation test prints the line to paste; ` +
                   `paste its output rather than the template.`);
      }
    }
  }
}

// ── 2b. COMMERCIAL AUTHORISATION — the half no test can discover ─────────────
//
// A green activation test proves the calculator renders. It says nothing about
// whether we are licensed to render it to paying students, and that question
// lives in a Desmos account this repository cannot query. So the requirement is
// that somebody wrote the answer down, in a form the activation test can check
// the deployment against.
//
// This is not paperwork for its own sake. `approvedApiVersion` is compared to
// the version the deployment actually served — API Terms §5.d makes the version
// a compliance question, not a preference — and `permittedUse` is what stops a
// personal or trial key being pressed into commercial service under §2.a.
const AUTH_SHAPE = {
  plan: /^(self-serve|commercial-addendum)$/,
  permittedUse: /^commercial-production$/,
  approvedApiVersion: /^v\d+\.\d+$/,
  confirmedBy: /^(?!name$|<)[^<>]{2,}$/,
  confirmedOn: /^\d{4}-\d{2}-\d{2}$/,
  source: /^(?!<)[^<>]{4,}$/,
};
const authLine = HEADER.match(/^<!--\s*desmos-authorization:\s*(.+?)\s*-->$/m);
const auth = authLine ? Object.fromEntries(
  authLine[1].split(';').map(x => x.split('=').map(y => y.trim())).filter(p => p.length === 2)) : null;
if (status === 'ACTIVATED') {
  if (!auth) {
    fails.push(`${RECORD} says ACTIVATED but records no commercial authorisation. ` +
      `Expected in its header: <!-- desmos-authorization: plan=self-serve; ` +
      `permittedUse=commercial-production; approvedApiVersion=vX.Y; confirmedBy=<name>; ` +
      `confirmedOn=YYYY-MM-DD; source=<where this was confirmed> -->`);
  } else {
    for (const [k, re] of Object.entries(AUTH_SHAPE)) {
      if (!auth[k]) fails.push(`${RECORD} authorisation has no "${k}".`);
      else if (!re.test(auth[k])) {
        fails.push(`${RECORD} authorisation field ${k}="${auth[k]}" is not a filled-in ` +
                   `value (expected ${re}).`);
      }
    }
    // The two records must agree with each other. A version approved in one and
    // run in the other is exactly the drift both lines exist to prevent.
    const evLine = HEADER.match(/^<!--\s*desmos-evidence:\s*(.+?)\s*-->$/m);
    const ev = evLine ? Object.fromEntries(
      evLine[1].split(';').map(x => x.split('=').map(y => y.trim())).filter(p => p.length === 2)) : {};
    if (ev.apiVersion && auth.approvedApiVersion && ev.apiVersion !== auth.approvedApiVersion) {
      fails.push(`${RECORD}: the activation ran API ${ev.apiVersion} but the approved ` +
                 `version is ${auth.approvedApiVersion}. Re-run the activation test against ` +
                 `the approved version, or update the approval.`);
    }
  }
}

// ── 2c. NEVER proxy or self-host Desmos's bundle ─────────────────────────────
//
// Re-serving a licensor's code from our origin is much closer to the mirroring
// the desmos.com website terms prohibit than to the embedding API Terms §5.a
// licenses, and §5.b(i) forbids distributing "the Software Service (or any part
// thereof) other than as specifically authorized". It is also the one design
// that would make the key a true server secret, which makes it a standing
// temptation. So it is refused mechanically rather than remembered.
for (const f of ['api/desmos-config.js']) {
  let src;
  try { src = read(f); } catch { continue; }
  const code = src.split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');
  if (/desmos\.com/.test(code)) {
    fails.push(`${f} references desmos.com in code. A server-side fetch or proxy of ` +
               `Desmos's bundle is not authorised — see desmos-integration.md §9. The ` +
               `browser loads their script directly, from their origin.`);
  }
}

// ── 3. no exam may name a provider before the record says ACTIVATED ──────────
const registry = read('exam-registry.js');
const named = [...registry.matchAll(/provider:\s*(?!null)('([^']*)'|"([^"]*)")/g)]
  .map(x => x[2] ?? x[3]);
if (named.length && status === 'ACTIVATED' && !auth) {
  fails.push(`exam-registry.js names a calculator provider and ${RECORD} says ACTIVATED, ` +
             `but no commercial authorisation is recorded. Students must not be served a ` +
             `calculator on a licence nobody has written down.`);
}
if (named.length && status !== 'ACTIVATED') {
  fails.push(`exam-registry.js names calculator provider(s) [${[...new Set(named)].join(', ')}] ` +
             `while ${RECORD} says ${status}. Naming a provider is what makes a calculator ` +
             `reach a student. Run scripts/check-desmos-activation.cjs against a real key ` +
             `first, record the result, then name the provider.`);
}

// ── 4. no API key in a public repository ─────────────────────────────────────
//
// Two checkers deliberately set a placeholder so the licensed path can be
// exercised. They are allowed by a sentinel suffix that no real key would carry,
// and nothing else is.
const SENTINEL = /-NOT-A-REAL-KEY$/;
const SKIP_DIRS = new Set(['.git', 'node_modules', '__pycache__', 'shots', 'shots2',
  'shots3', 'shots4', 'shots5', 'pgdata', '.design-sync', 'windows']);
const EXT = new Set(['.js', '.mjs', '.cjs', '.html', '.json', '.py', '.sh', '.md', '.ts']);
function* walk(dir) {
  for (const e of readdirSync(dir)) {
    if (SKIP_DIRS.has(e)) continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (EXT.has(extname(e))) yield p;
  }
}
const KEY_RE = /apiKey\s*:\s*['"]([^'"]{6,})['"]/g;
for (const file of walk(REPO)) {
  const rel = file.slice(REPO.length + 1);
  let txt;
  try { txt = readFileSync(file, 'utf8'); } catch { continue; }
  if (!txt.includes('apiKey')) continue;
  for (const hit of txt.matchAll(KEY_RE)) {
    const val = hit[1];
    if (SENTINEL.test(val)) continue;
    // config().apiKey reads and template interpolations are not literals.
    if (/^[<{$]/.test(val) || val.includes('${')) continue;
    fails.push(`${rel} contains a literal apiKey "${val.slice(0, 6)}…". This repository is ` +
               `PUBLIC. Desmos API Terms §5.c requires the key to be kept confidential — ` +
               `it belongs in SI_DESMOS_CONFIG at deploy time, never in a source file.`);
  }
}

// ── 5. the config endpoint must not log the key ──────────────────────────────
//
// /api/desmos-config is the one place the key is handled server-side, and
// Vercel captures console output into function logs that outlive the request.
// A well-meant `console.log('config', cfg)` added during a future debugging
// session would put a live credential into a log store, where it is durable and
// searchable — which is worse than the browser exposure, because the browser
// exposure is at least inherent and known.
const ENDPOINT = 'api/desmos-config.js';
let endpoint = null;
try { endpoint = read(ENDPOINT); } catch { /* reported below */ }
if (!endpoint) {
  fails.push(`${ENDPOINT} is missing. It is what supplies SI_DESMOS_CONFIG to the ` +
             `page; without it the calculator is inert however the environment is set.`);
} else {
  const LOGGABLE = /\b(raw|cfg|out|apiKey)\b/;
  for (const [i, line] of endpoint.split('\n').entries()) {
    if (!/console\.\w+\s*\(/.test(line)) continue;
    // The literal field NAME in a message is fine; a reference to the value is not.
    const args = line.slice(line.indexOf('(') + 1).replace(/'[^']*'|"[^"]*"/g, '');
    if (LOGGABLE.test(args)) {
      fails.push(`${ENDPOINT}:${i + 1} passes a config value to console. Vercel keeps ` +
                 `function logs; a key logged there is a durable, searchable credential. ` +
                 `Log the field NAME, never the value.`);
    }
  }
}

if (fails.length) {
  console.error('validate-desmos-activation: FAIL');
  for (const f of fails) console.error('  • ' + f);
  process.exit(1);
}
console.log(`validate-desmos-activation: OK (status ${status}, ` +
            `${named.length} exam(s) naming a provider)`);
