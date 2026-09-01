#!/usr/bin/env node
// Gate: ESTM1-2026-A's status restrictions cannot quietly lapse.
//
// The form is an INTERNAL VALIDATION artefact, not a product release. Five
// restrictions were set on it, and a document saying so is worth little on its
// own — a later change can contradict it without anything noticing. This check
// is what makes the document binding on the repository.
//
// It cannot see the database, so it cannot prove the form is unpublished. What
// it CAN do is fail if the repository starts describing the form as something
// it is not, or grows a scaled-score conversion for an exam that has no
// conversion table.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { KAR_CALIBRATION } from './est-blueprint.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const STATUS = 'docs/engineering/est-generation/STATUS-ESTM1-2026-A.md';
const fails = [];
const check = (ok, m) => { if (!ok) fails.push(m); };

let doc = '';
try { doc = readFileSync(resolve(REPO, STATUS), 'utf8'); }
catch { fails.push(`${STATUS} is missing — the form's status must be stated somewhere`); }

// ── the five restrictions must be present, in words ───────────────────────────
for (const phrase of [
  'DRAFT — INTERNAL REVIEW ONLY',
  'admin-only',
  'not student-visible',
  'not part of production exam inventory',
  'not represented as an official EST exam',
  'not assigned an EST-scaled score',
]) check(doc.includes(phrase), `${STATUS} must state: "${phrase}"`);

// ── the required difficulty label ─────────────────────────────────────────────
check(doc.includes('design-based difficulty estimate'),
  `${STATUS} must label the difficulty a "design-based difficulty estimate — not psychometrically calibrated"`);
const flat = doc.replace(/\s+/g, ' ');   // the phrases wrap across lines in the document
check(/not psychometrically calibrated/.test(flat),
  `${STATUS} must say the difficulty is not psychometrically calibrated`);

// ── KAR stays diagnostic ──────────────────────────────────────────────────────
check(KAR_CALIBRATION.claimAllowed === false,
  'KAR_CALIBRATION.claimAllowed must stay false: no form may claim the published KAR bands yet');
check(KAR_CALIBRATION.useMeasurementAsConstraint === false,
  'our KAR measurement must stay diagnostic, never a generation constraint');

// ── R1/R2 stay product requirements, not accepted substitutions ───────────────
check(/R1\b[^.]{0,140}product requirements/.test(flat),
  `${STATUS} must keep R1 and R2 as product requirements`);
check(/not accepted as a permanent answer/.test(flat),
  `${STATUS} must record that the prose substitutes are temporary`);

// ── nothing in the repo may call the form official or production ──────────────
const SKIP = new Set(['.git', 'node_modules', 'tests/visual-baselines', 'supabase/migrations']);
const walk = (d, out = []) => {
  for (const e of readdirSync(d)) {
    const p = join(d, e), rel = p.slice(REPO.length + 1);
    if (SKIP.has(rel) || e.startsWith('.')) continue;
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(md|js|mjs|html|css|py|sql)$/.test(e)) out.push(p);
  }
  return out;
};
// "official EST exam", "production form", "student-facing" NEAR the form code.
const BAD = [
  [/ESTM1-2026-A[^\n]{0,120}\b(official|production|published|live)\b/i,
   'describes ESTM1-2026-A as official, production, published or live'],
  [/\b(official|production)\b[^\n]{0,120}ESTM1-2026-A/i,
   'describes ESTM1-2026-A as official or production'],
];
for (const f of walk(REPO)) {
  const rel = f.slice(REPO.length + 1);
  // The status file says what the form is NOT, and this checker necessarily
  // contains the patterns it looks for. Neither is a claim about the form.
  if (rel === STATUS || rel === 'scripts/validate-est-form-status.mjs') continue;
  const src = readFileSync(f, 'utf8');
  for (const [re, why] of BAD) {
    const m = src.match(re);
    // A sentence that DENIES the claim is the point of these documents.
    if (m && !/\bnot\b|\bnever\b|must not|cannot|no student/i.test(m[0])) fails.push(`${rel}: ${why} — "${m[0].trim().slice(0, 90)}"`);
  }
}

// ── no scaled-score conversion may exist for an exam with no conversion table ──
for (const f of walk(REPO)) {
  const rel = f.slice(REPO.length + 1);
  if (rel.startsWith('docs/') || rel === 'scripts/validate-est-form-status.mjs') continue;
  const src = readFileSync(f, 'utf8');
  if (/function\s+(toScaled|scaleScore)|scaledScore\s*=|SCALE_TABLE|CONVERSION_TABLE/.test(src))
    fails.push(`${rel}: a scaled-score conversion exists, but no EST conversion table does — ` +
      `a generated form may report a raw score only`);
}

if (fails.length) {
  console.error(`FAIL  est-form-status: ${fails.length} problem(s)`);
  for (const f of fails) console.error(`  • ${f}`);
  process.exit(1);
}
console.log('PASS  est-form-status: ESTM1-2026-A is stated DRAFT / internal review only, ' +
  'KAR stays diagnostic, R1/R2 stay product requirements, no scaled-score conversion exists');
