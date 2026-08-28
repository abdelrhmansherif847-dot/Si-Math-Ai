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
//   1. An exam naming a calculator provider before BOTH of the record's two
//      markers say yes: that it renders (desmos-activation) and that we are
//      licensed to show it to students (desmos-commercial). Naming a provider is
//      the last of the three gates in exam-calculator.js and the only one a
//      student can feel.
//   2. Either marker claiming more than it can show — PROVEN without evidence a
//      human could check, APPROVED without a recorded authorisation.
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
const HEADER = record.split('\n').slice(0, 16).join('\n');
const MARKER = /^<!--\s*desmos-activation:\s*(UNPROVEN|PROVEN)\s*-->$/m;
const m = HEADER.match(MARKER);
if (!m) {
  fails.push(`${RECORD} carries no activation marker in its first 10 lines. ` +
             `Expected "<!-- desmos-activation: UNPROVEN -->" or "... PROVEN -->".`);
}
const status = m ? m[1] : 'UNPROVEN';

// ── 2. PROVEN must come with evidence, and the evidence must be real ─────────
//
// Every field is format-checked. A copied-and-not-filled-in template is the
// realistic failure here, not a missing line, so "YYYY-MM-DD" must fail exactly
// as hard as an absent date.
if (status === 'PROVEN') {
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
    fails.push(`${RECORD} says PROVEN but carries no desmos-evidence line in its ` +
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

// ── 2b. COMMERCIAL AUTHORISATION — a SECOND axis, not the same one ───────────
//
// This used to be one marker, and that conflated two independent questions:
//
//   does the calculator render?      desmos-activation:  UNPROVEN | PROVEN
//   may students be shown it?        desmos-commercial:  PENDING  | APPROVED
//
// They move independently and for different reasons. On 2026-08-28 the owner
// read their Desmos dashboard: an active 90-day TRIAL key, and an instruction to
// contact Desmos for commercial use. So the integration can legitimately be
// proven — mounted, rendered, checked — while commercial activation stays
// pending, and the old single marker had no way to say that. Worse, it accepted
// only permittedUse=commercial-production, which meant the sole way to record
// anything at all was to claim a licence nobody had.
//
// API Terms §2.a permits the trial for "internal testing to evaluate in
// preparation for commercial use", which is exactly what proving the render is.
// §3.a is what students need, and nothing here can grant it.
const COMMERCIAL = /^<!--\s*desmos-commercial:\s*(PENDING|APPROVED)\s*-->$/m;
const cm = HEADER.match(COMMERCIAL);
if (!cm) {
  fails.push(`${RECORD} carries no commercial marker in its first 14 lines. Expected ` +
             `"<!-- desmos-commercial: PENDING -->" or "... APPROVED -->".`);
}
const commercial = cm ? cm[1] : 'PENDING';

// APPROVED must come with evidence, and every field is format-checked. A copied
// template is the realistic failure, so "<vX.Y>" must fail as hard as an absent
// field. `source` is required because it is what lets a later reader check the
// claim rather than inherit it.
const AUTH_SHAPE = {
  route: /^(self-serve|commercial-addendum)$/,
  approvedApiVersion: /^v\d+\.\d+$/,
  confirmedBy: /^(?!name$|<)[^<>]{2,}$/,
  confirmedOn: /^\d{4}-\d{2}-\d{2}$/,
  source: /^(?!<)[^<>]{4,}$/,
};
const authLine = HEADER.match(/^<!--\s*desmos-authorization:\s*(.+?)\s*-->$/m);
const auth = authLine ? Object.fromEntries(
  authLine[1].split(';').map(x => x.split('=').map(y => y.trim())).filter(p => p.length === 2)) : null;
if (commercial === 'APPROVED') {
  if (!auth) {
    fails.push(`${RECORD} says desmos-commercial: APPROVED but records no authorisation ` +
      `line. Expected: <!-- desmos-authorization: route=<self-serve|commercial-addendum>; ` +
      `approvedApiVersion=<vX.Y>; confirmedBy=<who>; confirmedOn=<YYYY-MM-DD>; ` +
      `source=<what it was read from> -->`);
  } else {
    for (const [k, re] of Object.entries(AUTH_SHAPE)) {
      if (!auth[k]) fails.push(`${RECORD} authorisation has no "${k}".`);
      else if (!re.test(auth[k])) {
        fails.push(`${RECORD} authorisation field ${k}="${auth[k]}" is not a filled-in ` +
                   `value (expected ${re}).`);
      }
    }
  }
}

// Whichever axis they came from, an approved version and a run version that
// disagree are the drift both lines exist to prevent.
const evLine = HEADER.match(/^<!--\s*desmos-evidence:\s*(.+?)\s*-->$/m);
const ev = evLine ? Object.fromEntries(
  evLine[1].split(';').map(x => x.split('=').map(y => y.trim())).filter(p => p.length === 2)) : {};
if (ev.apiVersion && auth && auth.approvedApiVersion && ev.apiVersion !== auth.approvedApiVersion) {
  fails.push(`${RECORD}: the activation ran API ${ev.apiVersion} but the approved version ` +
             `is ${auth.approvedApiVersion}. Re-run against the approved version, or ` +
             `update the approval.`);
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

// ── 3. no exam may name a provider until BOTH axes are satisfied ─────────────
//
// Naming a provider in exam-registry.js is what makes a calculator reach a
// student, and it needs both answers to be yes: it renders, and we are licensed
// to show it to them. A trial key satisfies the first and not the second — API
// Terms §2.a is explicit that the trial is "for internal testing", and §3.a that
// "any use of the API in an Application that is accessed by End Users in
// production" is commercial use.
const registry = read('exam-registry.js');
const named = [...registry.matchAll(/provider:\s*(?!null)('([^']*)'|"([^"]*)")/g)]
  .map(x => x[2] ?? x[3]);
if (named.length) {
  const why = [];
  if (status !== 'PROVEN') {
    why.push(`${RECORD} says desmos-activation: ${status} — the calculator has not been ` +
             `shown to render. Run scripts/check-desmos-activation.cjs in deployed mode.`);
  }
  if (commercial !== 'APPROVED') {
    why.push(`${RECORD} says desmos-commercial: ${commercial} — no commercial licence is ` +
             `recorded. API Terms §2.a: the trial tier is for internal testing, and serving ` +
             `students is commercial use requiring §3.a.`);
  }
  if (why.length) {
    fails.push(`exam-registry.js names calculator provider(s) ` +
               `[${[...new Set(named)].join(', ')}], which is what puts a calculator in ` +
               `front of a student. ` + why.join(' '));
  }
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
console.log(`validate-desmos-activation: OK (render ${status}, commercial ${commercial}, ` +
            `${named.length} exam(s) naming a provider)`);
