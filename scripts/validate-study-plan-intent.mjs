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
  // ── The unqualified-phrasing regression ───────────────────────────────────
  // Requiring the literal word "study" was too strict. These are how students
  // actually ask, and every one of them fell through to the LLM — which
  // answered with a GENERIC written plan built from no student data and charged
  // chat credits instead of the 20-credit study_plan operation. The reported
  // symptoms (generic plans, no personalisation, wrong charge) were all this
  // one gap, so each phrasing is pinned here individually.
  ['make me a plan', 'generate'],
  ['create a plan for me', 'generate'],
  ['I need a plan', 'generate'],
  ['give me a plan', 'generate'],
  ['prepare a plan', 'generate'],
  ['plan my studies', 'generate'],
  ['plan my week', 'generate'],
  ['plan my revision', 'generate'],
  ['can you plan my week', 'generate'],
  ['اعمل خطة', 'generate'],
  ['اعملي خطة', 'generate'],
  ['عايز خطة', 'generate'],
  ['محتاج خطة', 'generate'],
  ['جهزلي خطة', 'generate'],
  // ...and the boundary that broadening must not cross. A "plan" with a maths
  // or non-study object is not a study plan, and charging 20 credits for one is
  // the same defect pointing the other way.
  ['I want to plan a party', null],
  ['new plan for factoring', null],
  ['make a plan to solve this equation', null],
  ['a plan for simplifying this', null],
  // The -ing exception: "for factoring" is maths, "for studying" is not. Needs
  // a request verb like every other generate case — a bare noun phrase with no
  // verb is a fragment, not a request.
  ['make a plan for studying', 'generate'],
  ['plan a trip', null],

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
  // Ordinary MATH vocabulary. "plan", "plane", "plans" and "planning" are words
  // an exam-prep student uses about geometry and about solving, so an
  // unqualified noun must never route to the planner. Each of these was routed
  // and CHARGED 20 credits before the noun was required to be qualified by
  // "study" — the student paid for a study plan instead of getting an answer.
  ['make a plane through points A and B', null],
  ['create a plane figure', null],
  ['redo the plane question', null],
  ['create a plan to solve this equation', null],
  ['make a game plan for this problem', null],
  ['new plan for factoring', null],
  ['build a plane mirror diagram', null],
  ["what's a coordinate plane", null],
  ['show me the coordinate plane', null],
  ['check the plans in this diagram', null],
  ['how do I find the equation of a plane', null],
  ['what is the xy-plane', null],
  // "Planner" is unambiguous, so it still stands alone.
  ['open the planner', 'view'],
  ['make me a planner', 'generate'],
  // A POSSESSIVE plan noun is unambiguous too — a student says "the plane" or
  // "a plane" about geometry, never "my plan". These are the natural ways to
  // ask for the plan you already have, and requiring the "study" qualifier
  // briefly broke every one of them into an ordinary (charged) chat turn.
  ['show my plan', 'view'],
  ['view my plan', 'view'],
  ['see my plan', 'view'],
  ['open my plan', 'view'],
  ["what's my plan", 'view'],
  ['my plan', 'view'],
  ['regenerate my plan', 'generate'],
  ['make my plan', 'generate'],
  ['update my plans', 'generate'],
  // ...and the possessive must not drag "plane" back in with it.
  ['what is the equation of my plane', null],
  // Arabic carries the same rule, for the same reason: خطة alone just means
  // "a plan", so asking for a plan to SOLVE something is a maths question, not
  // a study-plan request. Accepting the bare noun after any verb charged these
  // students 20 credits and answered with a study plan.
  ['خطة مذاكرة', 'generate'],
  ['اعمل خطة مذاكره', 'generate'],
  ['اعمل خطتي', 'generate'],      // possessive: "make my plan"
  ['جدد خطتي', 'generate'],       // "refresh my plan"
  ['خطتي', 'view'],               // bare possessive → free view
  ['اعمل خطة للحل', null],        // "make a plan for the solution"
  ['عايز خطة لحل المسألة', null], // "I want a plan to solve the problem"
  ['محتاج خطة للمسألة دي', null], // "I need a plan for this problem"
];

let pass = 0, fail = 0;
for (const [text, expected] of cases) {
  const got = studyPlanIntent(text);
  if (got === expected) { pass++; console.log(`  ✓ ${JSON.stringify(text)} → ${got}`); }
  else { fail++; console.error(`  ✗ ${JSON.stringify(text)} → ${JSON.stringify(got)} (expected ${JSON.stringify(expected)})`); }
}
console.log(`\nstudy-plan-intent: ${pass}/${pass + fail} passed${fail ? ` — ${fail} FAILED` : ' — all checks passed'}`);
process.exit(fail ? 1 : 0);
