#!/usr/bin/env node
/**
 * check-exam-form-renders.mjs — draw every stimulus in a form, through the
 * SHIPPED renderer, from the rows the database actually holds.
 *
 *   node scripts/check-exam-form-renders.mjs <rows.json>
 *
 * WHAT MAKES THIS DIFFERENT FROM THE PRE-FLIGHT
 * ---------------------------------------------
 * The pre-flight asks whether a form may be published. This asks whether its
 * figures can be DRAWN — a different question, and historically the one nobody
 * asked. Every defect in student-facing-rendering-validation.md §3 passed item
 * review; two also passed a DOM-level check. They were found by rendering.
 *
 * Nothing is supplied out of band here. `frame`, `figures[]` and `reading` come
 * off the rows, exactly as they will in delivery, so a row that cannot say what
 * its own figure is fails here rather than in front of a student.
 *
 * NOT a substitute for looking. This runs in Node against a minimal SVG fake:
 * it proves the renderer accepts every row and emits a figure, not that the
 * figure is right. Geometry and pixels are the author's harness, which lives
 * with the content — see that document, §2 and §5.
 *
 * rows.json is produced by verify-exam-form-draft.sh and holds question
 * ordinals and stimulus specs. It is content-adjacent: keep it out of this
 * repository.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/* The same minimal DOM the renderer's own suite uses — this repo has no test
 * runner and no DOM library, deliberately. */
function makeDoc() {
  const mk = (tag, ns) => ({
    tag, ns, children: [], attrs: {}, style: {}, _text: '',
    setAttribute(k, v) { this.attrs[k] = String(v); },
    getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; },
    appendChild(c) { this.children.push(c); return c; },
    set textContent(v) { this._text = String(v); },
    get textContent() { return this._text || this.children.map(c => c.textContent).join(''); },
    set className(v) { this.attrs.class = v; },
    get className() { return this.attrs.class || ''; },
  });
  return { createElementNS: (ns, tag) => mk(tag, ns), createElement: (tag) => mk(tag, null) };
}
const all = (n, out = []) => { for (const c of n.children) { out.push(c); all(c, out); } return out; };

const g = {};
new Function('document', 'globalThis', readFileSync(resolve(REPO, 'exam-stimulus.js'), 'utf8'))
  .call(g, makeDoc(), g);
const R = g.SiExamStimulus;
if (!R || !R.renderForQuestion) {
  console.error('exam-stimulus.js did not export renderForQuestion');
  process.exit(1);
}

const rows = JSON.parse(readFileSync(process.argv[2] || 'rows.json', 'utf8'));
const byKind = {};
const failed = [];
let drawn = 0;

for (const r of rows) {
  const where = `M${r.section}${r.variant_id ? '/' + r.variant_id : ''} Q${r.ordinal}`;
  const what = r.kind + (r.spec && r.spec.frame ? '/' + r.spec.frame : '');
  try {
    const svg = R.renderForQuestion({ id: r.qid, reading: r.reading },
                                    { id: r.sid, kind: r.kind, spec: r.spec });
    // "It returned something" is not the check. An empty node would satisfy a
    // truthiness test and show a student a blank space where the figure was.
    if (all(svg).length === 0) failed.push(`${where} (${what}) — drew an empty figure`);
    else { drawn++; byKind[r.kind] = (byKind[r.kind] || 0) + 1; }
  } catch (e) {
    failed.push(`${where} (${what}) — ${e.message}`);
  }
}

console.log(`drew ${drawn}/${rows.length}  ${JSON.stringify(byKind)}`);
if (failed.length) {
  console.log('FAILED:');
  for (const f of failed) console.log('  ' + f);
  process.exit(1);
}
console.log('every stimulus renders from its own row, nothing passed out of band');
