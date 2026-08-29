#!/usr/bin/env node
/**
 * validate-exam-stimulus.mjs — the single-source guard for the math stimulus
 * renderer. Exit non-zero on any failure (CI gate). Structural only; the
 * renderer's BEHAVIOUR is tests/exam-stimulus.test.mjs.
 *
 * Run:  node scripts/validate-exam-stimulus.mjs
 *
 * WHY THIS GATE EXISTS
 * --------------------
 * The M4 migration requires one renderer, "so preview and delivery cannot draw
 * the same question two ways". Two existed anyway, for three days, and the
 * labels were backwards: exam-stimulus.js called itself production and had
 * fallen a schema generation behind, while scripts/explore-render.js called
 * itself an exploration copy and was what every preview, every figure check and
 * one shipped module actually loaded. Nothing caught it, because nothing was
 * looking. This is the thing that looks.
 *
 * Checks:
 *   1. Browser copy      — exam-stimulus.js is byte-identical to the authored
 *                          core (run scripts/sync-exam-stimulus.mjs).
 *   2. One renderer      — the second export name is gone and stays gone (the
 *                          name itself is not spelled in this file — see the check).
 *   3. Honest header     — the core carries no DRAFT / BLOCKED status banner,
 *                          both of which were false by the time they were read.
 *   4. Fresh previews    — every generated page that inlines the renderer
 *                          inlines THIS one, not a snapshot of an older one.
 *   5. Schema-aware      — the core reads frame, figures and reading off the
 *                          row rather than taking them out of band.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { BANNER, SOURCE, TARGET } from './sync-exam-stimulus.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
let failures = 0;
const fail = (m) => { console.error('  ✗', m); failures++; };
const ok = (m) => console.log('  ✓', m);
const assert = (cond, m) => (cond ? ok(m) : fail(m));
const rel = (p) => relative(root, p);

const core = readFileSync(SOURCE, 'utf8');

/* ── 1. Browser copy in sync ──────────────────────────────────────────────── */
{
  let copy = null;
  try { copy = readFileSync(TARGET, 'utf8'); } catch { /* absent counts as drift */ }
  assert(copy === BANNER + core,
    `${rel(TARGET)} in sync with the authored core (run scripts/sync-exam-stimulus.mjs)`);
}

/* ── 2. One renderer, one name ────────────────────────────────────────────── */
{
  // git grep so the check reads exactly what is COMMITTED — node_modules, the
  // gitignored preview builds and the untracked scratchpad cannot make it pass
  // or fail by accident.
  const grep = (pattern, args = []) => {
    try {
      return execFileSync('git', ['grep', '-l', ...args, '--', pattern], { cwd: root, encoding: 'utf8' })
        .split('\n').filter(Boolean);
    } catch (e) {
      if (e.status === 1) return [];      // git grep: no match, which is the pass
      fail('git grep failed: ' + e.message);
      return [];
    }
  };

  // The forbidden name, never spelled here. The first version of this check
  // wrote it as a literal and passed only while this file was untracked; the
  // moment it was committed, git grep found the guard indicting itself. An
  // exemption would have been the wrong fix — a rule with a hole in it shaped
  // exactly like the file enforcing it — so the file simply does not contain
  // the string, and the rule stays uniform.
  const FORK = 'Si' + 'Explore';

  // The renderer's own header narrates the fork as history and must stay free
  // to. So the word is forbidden everywhere EXCEPT those two files, and any USE
  // of it — an assignment or a property read — is forbidden there as well.
  const SOURCE_FILES = new Set(['supabase/functions/_shared/exam-stimulus.core.js', 'exam-stimulus.js']);
  const mentions = grep(FORK).filter((p) => !SOURCE_FILES.has(p));
  assert(mentions.length === 0,
    `no ${FORK} fork anywhere in the tree` +
    (mentions.length ? ` — still referenced by: ${mentions.join(', ')}` : ''));

  const uses = grep(`${FORK}\\s*=|\\.${FORK}`, ['-E']).filter((p) => SOURCE_FILES.has(p));
  assert(uses.length === 0,
    `the renderer itself neither defines nor reads ${FORK}` +
    (uses.length ? ` — found in: ${uses.join(', ')}` : ''));

  assert(/^\s*root\.SiExamStimulus = \{/m.test(core), 'the core exports SiExamStimulus');
}

/* ── 3. The header does not claim a status that is no longer true ─────────── */
{
  // Matched as a STATUS BANNER at the head of a comment line, not as prose:
  // the header narrates both of these as history, and must be free to.
  assert(!/^\s*\*\s*⚠️ STATUS: DRAFT/m.test(core),
    'the core carries no "DRAFT — NOT WIRED" status banner');
  assert(!/^\s*\*\s*⛔ BLOCKED ON A SCHEMA DECISION/m.test(core),
    'the core carries no "BLOCKED ON A SCHEMA DECISION" banner (20260827a/b closed it)');
}

/* ── 4. Generated previews inline the current renderer ────────────────────── */
{
  // The body, minus the header comment: a preview is regenerated from the file
  // and so carries the code verbatim. Comparing the code rather than the whole
  // file keeps a header edit from failing a preview that draws identically.
  const bodyAt = core.indexOf('(function (root) {');
  if (bodyAt < 0) fail('cannot locate the renderer IIFE in the core');
  const body = core.slice(bodyAt);

  const MARK = 'MATH STIMULUS RENDERER';
  const pages = readdirSync(resolve(root, 'scripts'))
    .filter((f) => f.endsWith('.html'))
    .map((f) => resolve(root, 'scripts', f))
    .filter((p) => readFileSync(p, 'utf8').includes(MARK));

  // SAY WHAT THIS CHECK IS. The preview builds are gitignored — merging deploys
  // the repo root to Vercel production, so a committed preview would become a
  // public page — which means on a fresh clone there is nothing here to check
  // and this passes by having no subject. It is a LOCAL guard, for the person
  // who edits the renderer and forgets to rebuild. Claiming otherwise would
  // make it the kind of green check the verification audit exists to catch.
  if (!pages.length) console.log('  –  no generated preview builds present (nothing to check)');
  for (const p of pages)
    assert(readFileSync(p, 'utf8').includes(body),
      `${rel(p)} inlines the current renderer (rebuild it from scripts/)`);
}

/* ── 5. The schema fields are read off the row, not passed in ─────────────── */
{
  // Each of these was, at some point, supplied out of band or guessed. The
  // header now says they are read from the row; this is what makes that
  // checkable rather than a claim.
  assert(/\bspec\.frame\b/.test(core), 'the core reads spec.frame off the stimulus row');
  assert(/\bspec\.figures\b/.test(core), 'the core reads spec.figures off the stimulus row');
  assert(/\bquestion\.reading\b/.test(core), 'the core reads reading off the question row');
  assert(/function renderForQuestion\(question, stimulus\)/.test(core),
    'renderForQuestion(question, stimulus) is the entry point content goes through');
  assert(/renderForQuestion: renderForQuestion/.test(core), 'renderForQuestion is exported');
}

if (failures) {
  console.error(`\nexam-stimulus: ${failures} check(s) FAILED`);
  process.exit(1);
}
console.log('\nexam-stimulus: all checks passed');
