#!/usr/bin/env node
/**
 * gen-exam-expectation.mjs — derive the publish-gate expectation from the
 * exam registry, so a form's structure can never be typed by hand.
 *
 *   exam-registry.js  →  p_expected  →  publish_exam_form(form_id, p_expected)
 *
 * WHY THIS EXISTS
 * ---------------
 * supabase/migrations/20260824a_question_spine.sql documents the publish gate
 * with this promise:
 *
 *     "p_expected comes from the repo's generator over exam-registry.js,
 *      never typed by hand"
 *     "a CI test pins the generator"
 *
 * Neither existed. The gate shipped, the generator did not, so the only way to
 * publish was to hand-type the exact JSON the design says must never be
 * hand-typed. That failure mode is quiet rather than loud: a mistyped
 * `questions` does not fail — it redefines what "correct structure" means for
 * that form, the gate then validates against the typo, and publish_exam_form
 * freezes it into published_structure permanently. This file closes that hole;
 * tests/exam-expectation.test.mjs is the CI pin the migration promised.
 *
 * THE SHAPE THE GATE CONSUMES
 * ---------------------------
 *   { "exam_code": "EST_MATH_1",
 *     "modules": [ { "ordinal": 1, "questions": 50,
 *                    "durationMinutes": 75, "variants": [] } ] }
 *
 * ONE NON-OBVIOUS CONVERSION
 * --------------------------
 * The registry stores variants as OBJECTS — `[{ id: 'standard' }, { id:
 * 'advanced' }]` (exam-registry.js, SAT_FULL module 2, the only place they
 * appear). The gate reads STRINGS: it iterates with jsonb_array_elements_text()
 * and tests membership with `v_variants ? sec.variant_id`. Mapping objects to
 * ids belongs here, at the boundary, because the DB contract is already settled
 * on strings and the registry's shape is the one free to change.
 *
 * TWO FAILURE MODES THAT MUST NOT BE ONE
 * --------------------------------------
 * R.modulesOf() returns [] for BOTH an unknown code and a dynamic exam
 * (PRACTICE). Relying on it alone would turn a typo into an empty expectation
 * instead of an error. The gate would still refuse that — jsonb_array_length(
 * ... 'modules') = 0 raises — but a typo must fail at the source, loudly, not
 * several steps downstream wearing a different error's clothes. So this reads
 * get() and isDynamic() and raises a distinct message for each.
 *
 * USAGE
 *   node scripts/gen-exam-expectation.mjs                 list valid codes
 *   node scripts/gen-exam-expectation.mjs EST_MATH_1      pretty JSON
 *   node scripts/gen-exam-expectation.mjs EST_MATH_1 --compact   one line
 *
 * No build step, no dependencies — the repo convention. Importable so the CI
 * suite exercises THIS code rather than a paraphrase of it.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import vm from 'node:vm';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Load exam-registry.js the way the browser does.
 *
 * The registry is a classic IIFE that assigns to `root.SiExamRegistry`, where
 * root is `globalThis`. Seeding the sandbox with `globalThis`/`window` pointing
 * at a plain object is the same trick tests/_source.mjs evalSnippet() uses, and
 * it keeps the real shipped bytes as the thing under test. Deliberately NOT
 * imported from tests/ — a script should not depend on the test helpers.
 */
function loadRegistry() {
  const root = {};
  const ctx = vm.createContext({
    globalThis: root, window: root,
    console, Math, JSON, Date, RegExp, String, Number, Array, Object, Map, Set,
  });
  vm.runInContext(readFileSync(resolve(REPO, 'exam-registry.js'), 'utf8'), ctx);
  if (!root.SiExamRegistry) throw new Error('exam-registry.js did not define SiExamRegistry');
  return root.SiExamRegistry;
}

export const registry = loadRegistry();

/** Every code the registry knows, in registry order. */
export const EXAM_CODES = registry.EXAM_CODES.slice();

/** A positive integer, and nothing that merely looks like one. */
function positiveInt(value, what, code) {
  if (typeof value !== 'number' || !Number.isInteger(value) || value <= 0) {
    throw new Error(`registry: ${code} module ${what} must be a positive integer, got ${JSON.stringify(value)}`);
  }
  return value;
}

/**
 * The publish-gate expectation for one exam code.
 *
 * Throws — never returns a partial or empty structure — because every caller
 * either publishes with this or builds a form's sections from it. A silent
 * empty answer would produce a form that cannot be published, discovered much
 * later and far from the cause.
 */
export function expectationFor(examCode) {
  const exam = registry.get(examCode);
  if (!exam) {
    throw new Error(
      `unknown exam code: ${JSON.stringify(examCode)} — valid codes: ${EXAM_CODES.join(', ')}`);
  }
  if (registry.isDynamic(examCode)) {
    throw new Error(
      `dynamic exam has no fixed structure: ${JSON.stringify(examCode)} — ` +
      'its length is chosen by the student at run time, so no form can be authored against it');
  }

  const modules = registry.modulesOf(examCode)
    // Sorted by ordinal so output is a function of the exam, not of the order
    // someone happened to type the modules in.
    .slice()
    .sort((a, b) => a.ordinal - b.ordinal)
    .map((m) => ({
      ordinal:         positiveInt(m.ordinal, 'ordinal', examCode),
      questions:       positiveInt(m.questions, 'questions', examCode),
      durationMinutes: positiveInt(m.durationMinutes, 'durationMinutes', examCode),
      variants:        variantIds(m, examCode),
    }));

  if (!modules.length) {
    throw new Error(`registry: ${examCode} is not dynamic but declares no modules`);
  }
  return { exam_code: examCode, modules };
}

/**
 * Variant ids as the strings the gate compares against, or [] when the module
 * declares none. A variant object without a usable id is a hard error: letting
 * `undefined` through would produce the JSON literal `null` inside the array,
 * which the gate would compare against a real variant_id and reject with a
 * message pointing at the form rather than at the registry.
 */
function variantIds(module, code) {
  const raw = module.variants;
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    throw new Error(`registry: ${code} module ${module.ordinal} has a non-array variants field`);
  }
  return raw.map((v, i) => {
    const id = v && typeof v === 'object' ? v.id : v;
    if (typeof id !== 'string' || !id.trim()) {
      throw new Error(`registry: ${code} module ${module.ordinal} variant #${i} has no usable id`);
    }
    return id;
  });
}

/**
 * Total questions an author must write for a whole form.
 *
 * NOT the same as the registry's totalQuestions(): a variant module needs one
 * FULL set per variant, because each variant is its own section that the gate
 * requires to be complete. SAT_FULL is 66 here and 44 there, and the difference
 * is the entire point — a form authored to 44 fails the gate.
 */
export function totalAuthoredQuestions(examCode) {
  return expectationFor(examCode).modules
    .reduce((sum, m) => sum + m.questions * Math.max(1, m.variants.length), 0);
}

// ── CLI ────────────────────────────────────────────────────────────────────
const isCLI = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isCLI) {
  const args = process.argv.slice(2);
  const code = args.find((a) => !a.startsWith('--'));
  const compact = args.includes('--compact');

  if (!code) {
    console.log('usage: node scripts/gen-exam-expectation.mjs <EXAM_CODE> [--compact]\n');
    console.log('valid codes:');
    for (const c of EXAM_CODES) {
      let note;
      try {
        note = `${totalAuthoredQuestions(c)} questions to author`;
      } catch (e) {
        note = e.message.startsWith('dynamic') ? 'dynamic — no form can be authored' : 'unavailable';
      }
      console.log(`  ${c.padEnd(16)} ${note}`);
    }
    process.exit(1);
  }

  try {
    const expectation = expectationFor(code);
    console.log(compact ? JSON.stringify(expectation) : JSON.stringify(expectation, null, 2));
  } catch (e) {
    console.error(`error: ${e.message}`);
    process.exit(1);
  }
}
