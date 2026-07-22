#!/usr/bin/env node
/**
 * validate-study-plan-intent.mjs — regression guard for chat.html's
 * studyPlanIntent(), the router that decides whether a chat message triggers
 * the personalized Study Planner engine (charged 20 credits, op 'study_plan'),
 * views the existing plan (free), or is a normal chat message.
 *
 * History: the original /\bplan\b/ noun did NOT match "planner" or the "plane"
 * typo, so requests using the official name "Study Planner" (or "study plane")
 * fell through to the generic LLM path — no personalized data, no 20-credit
 * charge. This test locks the corrected behavior in place.
 *
 * Runs the EXACT function extracted from chat.html (not a copy), so drift is
 * impossible. Exit 0 on success, 1 on any mismatch.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(resolve(root, 'chat.html'), 'utf8');

const m = src.match(/function studyPlanIntent\(text\)\{[\s\S]*?\n  \}/);
if (!m) { console.error('✗ could not locate studyPlanIntent() in chat.html'); process.exit(2); }
// eslint-disable-next-line no-eval
const studyPlanIntent = eval('(' + m[0].replace(/^function /, 'function ') + ')');

const cases = [
  // Reported failures — must now GENERATE (route to the personalized engine).
  ['Make a Study Planner', 'generate'],
  ['I want a study plane', 'generate'],
  ['study planner', 'generate'],
  ['Study Planner', 'generate'],
  ['study plane', 'generate'],
  ['I want a study planner', 'generate'],
  ['can you make my study planner', 'generate'],
  ['make me a study planner', 'generate'],
  // Other generate phrasings.
  ['create a study plan', 'generate'],
  ['regenerate my study plan', 'generate'],   // was wrongly 'view' before the fix
  ['update my study planner', 'generate'],
  ['generate a study schedule', 'generate'],
  ['build me a study plan please', 'generate'],
  ['study plan', 'generate'],
  ['اعمل لي خطة مذاكرة', 'generate'],
  // View (free).
  ['show my study plan', 'view'],
  ['show my study planner', 'view'],
  ["what's my study plan", 'view'],
  ['check my study planner', 'view'],
  ['I want to see my study plan', 'view'],     // explicit view verb wins over "want"
  ['my study planner', 'view'],
  // Must NOT trigger — guards against false 20-credit charges.
  ['I want to plan a party', null],
  ['explain the quadratic formula', null],
  ['help me with algebra', null],
  ['what is a planet', null],
  ['tell me about the plant cell', null],
  ['generate a schedule', null],
];

let pass = 0, fail = 0;
for (const [text, expected] of cases) {
  const got = studyPlanIntent(text);
  if (got === expected) { pass++; console.log(`  ✓ ${JSON.stringify(text)} → ${got}`); }
  else { fail++; console.error(`  ✗ ${JSON.stringify(text)} → ${JSON.stringify(got)} (expected ${JSON.stringify(expected)})`); }
}
console.log(`\nstudy-plan-intent: ${pass}/${pass + fail} passed${fail ? ` — ${fail} FAILED` : ' — all checks passed'}`);
process.exit(fail ? 1 : 0);
