#!/usr/bin/env node
// Emit the SQL that replaces an EST form's items and stimuli from an authored
// payload.
//
//   node scripts/build-est-form-sql.mjs <content-dir> <out.sql>
//
// ⚠️  THE CONTENT IS NOT IN THIS REPOSITORY, AND MUST NOT BE. This repository is
//     public. This script is the TOOLING; it reads <content-dir>/payload.json
//     and writes SQL you read before running.
//
// WHY THIS EXISTS ALONGSIDE build-exam-form-draft.py
// -------------------------------------------------
// That script builds a form from the DSAT-era content format: two files merged,
// because the schema decisions were taken after the items were written. This one
// reads the format artifact 6's blueprint produces, in which every item already
// carries its family, domain, demand band, devices, distractor classes and
// declared parameter set. They are two readers of two content formats, not two
// implementations of one thing; new EST work uses this one.
//
// WHY IT IS A REPLACEMENT AND NOT A PATCH
// ---------------------------------------
// The rebuild changes what a third of the paper is. Updating rows in place
// would leave the form's identity intact while making every property of it
// false, and would make the change impossible to review as a diff. The emitted
// SQL deletes the form's questions and stimuli inside ONE transaction and
// re-inserts them, so the form is never half-rebuilt.
//
// Nothing here publishes. Everything lands as DRAFT.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const dir = process.argv[2], out = process.argv[3] || 'est-form.sql';
if (!dir) { console.error('usage: build-est-form-sql.mjs <content-dir> <out.sql>'); process.exit(2); }
const form = JSON.parse(readFileSync(resolve(dir, 'payload.json'), 'utf8'));

const q = s => "'" + String(s).replace(/'/g, "''") + "'";
const j = o => q(JSON.stringify(o));
const nul = v => (v === null || v === undefined ? 'NULL' : q(v));

// Only stimuli that at least one item points at, so a held figure or an unused
// draft stimulus cannot slip into the database.
const used = [...new Set(form.items.map(i => i.stim).filter(Boolean))].sort();
const missing = used.filter(k => !form.stimuli[k]);
if (missing.length) { console.error('payload references unknown stimuli: ' + missing.join(', ')); process.exit(1); }

const held = form.items.filter(i => i.figureHeld);

const L = [];
L.push(`-- ${form.code} — full rebuild of the item set. Generated; review before running.`);
L.push(`-- ${form.items.length} items, ${used.length} stimuli. Everything stays DRAFT.`);
L.push(`-- ${held.length} item(s) are allocated to the not-to-scale budget and carry no`);
L.push(`-- stimulus row: their figures are authored and HELD pending the R1 renderer.`);
L.push('');
L.push('BEGIN;');
L.push('');
L.push(`-- Guard: refuse to run against a published form.`);
L.push(`DO $$`);
L.push(`DECLARE v_status text;`);
L.push(`BEGIN`);
L.push(`  SELECT status INTO v_status FROM public.exam_forms WHERE code = ${q(form.code)};`);
L.push(`  IF v_status IS NULL THEN RAISE EXCEPTION 'form % not found', ${q(form.code)}; END IF;`);
L.push(`  IF v_status <> 'draft' THEN RAISE EXCEPTION 'form % is %, not draft', ${q(form.code)}, v_status; END IF;`);
L.push(`END $$;`);
L.push('');
L.push(`DELETE FROM public.exam_questions q USING public.exam_form_sections s, public.exam_forms f`);
L.push(`  WHERE q.section_id = s.id AND s.form_id = f.id AND f.code = ${q(form.code)};`);
L.push(`DELETE FROM public.exam_stimuli st USING public.exam_forms f`);
L.push(`  WHERE st.form_id = f.id AND f.code = ${q(form.code)};`);
L.push('');

// One INSERT per table, driven by a jsonb array. Fifty repeated INSERT blocks
// would be the same rows with a thousand lines of scaffolding around them, and
// the scaffolding is what a reviewer has to read past to see the content.
const stimRows = used.map(k => ({ key: k, kind: form.stimuli[k].kind,
  label: `${k} — ${form.stimuli[k].label}`, spec: form.stimuli[k].spec }));
L.push(`INSERT INTO public.exam_stimuli (form_id, kind, label, spec)`);
L.push(`SELECT f.id, s->>'kind', s->>'label', s->'spec'`);
L.push(`  FROM jsonb_array_elements(${j(stimRows)}::jsonb) s, public.exam_forms f`);
L.push(` WHERE f.code = ${q(form.code)};`);
L.push('');

const DIFF = { entry: 'easy', core: 'medium', stretch: 'hard', peak: 'hard' };
const qRows = form.items.map(it => ({
  o: it.o, prompt: it.prompt, choices: it.choices, ans: it.ans, expl: it.expl,
  diff: DIFF[it.demand], topic: it.topic, sub: it.sub,
  stim: it.stim || null, reading: it.reading || null,
}));
L.push(`INSERT INTO public.exam_questions`);
L.push(`  (section_id, ordinal, prompt, question_format, choices, correct_answer, explanation,`);
L.push(`   difficulty, topic_id, subtopic_id, status, content_origin, stimulus_id, reading)`);
L.push(`SELECT sec.id, (i->>'o')::int, i->>'prompt', 'mcq', i->'choices', i->>'ans', i->>'expl',`);
L.push(`       i->>'diff', i->>'topic', i->>'sub', 'draft', 'original_si_math',`);
L.push(`       CASE WHEN i->>'stim' IS NULL THEN NULL ELSE`);
L.push(`         (SELECT st.id FROM public.exam_stimuli st`);
L.push(`           WHERE st.form_id = f.id AND st.label LIKE (i->>'stim') || ' — %') END,`);
L.push(`       i->>'reading'`);
L.push(`  FROM jsonb_array_elements(${j(qRows)}::jsonb) i`);
L.push(`  JOIN public.exam_forms f ON f.code = ${q(form.code)}`);
L.push(`  JOIN public.exam_form_sections sec ON sec.form_id = f.id AND sec.ordinal = 1;`);
L.push('');
L.push(`-- Post-conditions. Any failure aborts the whole transaction.`);
L.push(`DO $$`);
L.push(`DECLARE n_q int; n_s int; n_bad int;`);
L.push(`BEGIN`);
L.push(`  SELECT count(*) INTO n_q FROM public.exam_questions q`);
L.push(`    JOIN public.exam_form_sections s ON s.id = q.section_id`);
L.push(`    JOIN public.exam_forms f ON f.id = s.form_id WHERE f.code = ${q(form.code)};`);
L.push(`  IF n_q <> ${form.items.length} THEN RAISE EXCEPTION 'expected ${form.items.length} questions, found %', n_q; END IF;`);
L.push(`  SELECT count(*) INTO n_s FROM public.exam_stimuli st`);
L.push(`    JOIN public.exam_forms f ON f.id = st.form_id WHERE f.code = ${q(form.code)};`);
L.push(`  IF n_s <> ${used.length} THEN RAISE EXCEPTION 'expected ${used.length} stimuli, found %', n_s; END IF;`);
L.push(`  SELECT count(*) INTO n_bad FROM public.exam_questions q`);
L.push(`    JOIN public.exam_form_sections s ON s.id = q.section_id`);
L.push(`    JOIN public.exam_forms f ON f.id = s.form_id`);
L.push(`    WHERE f.code = ${q(form.code)} AND q.question_format <> 'mcq';`);
L.push(`  IF n_bad <> 0 THEN RAISE EXCEPTION '% non-mcq items survived', n_bad; END IF;`);
L.push(`  SELECT count(*) INTO n_bad FROM public.exam_questions q`);
L.push(`    JOIN public.exam_form_sections s ON s.id = q.section_id`);
L.push(`    JOIN public.exam_forms f ON f.id = s.form_id`);
L.push(`    WHERE f.code = ${q(form.code)} AND q.topic_id = 'GEOMETRY';`);
L.push(`  IF n_bad > 6 THEN RAISE EXCEPTION 'geometry is % items, above the published 8-13%% ceiling', n_bad; END IF;`);
L.push(`END $$;`);
L.push('');
L.push('COMMIT;');

writeFileSync(out, L.join('\n') + '\n');
console.log(`wrote ${out}: ${form.items.length} items, ${used.length} stimuli, ${held.length} held figure(s)`);
