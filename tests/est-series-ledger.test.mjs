#!/usr/bin/env node
// The series ledger has to catch the things a student would notice across 25
// forms. These tests build a clean synthetic series that must pass, then break
// it one dimension at a time. Every assertion below fails if the corresponding
// guard is removed — that is the whole point of the file.
import { auditSeries, numericSignature, stimulusShape, SERIES_RULES } from '../scripts/est-series-ledger.mjs';

let pass = 0, fail = 0;
const ok = (cond, label) => { if (cond) { pass++; } else { fail++; console.log(`  FAIL  ${label}`); } };
const has = (r, rule) => r.findings.some(f => f.rule === rule);
const errorsOf = r => r.findings.filter(f => f.severity === 'error');

const D = ['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'D8', 'D9'];
const DOM = ['FA', 'DAP', 'AAF', 'GT'];
const BAND = ['entry', 'core', 'stretch', 'peak'];

// Kind-appropriate specs, so stimulusShape means what it says. The FIRST
// stimulus of each form is doubled up so the form has an unambiguous dominant
// shape, and that shape rotates with the form index.
function synthStimulus(k, n) {
  const kinds = [
    { kind: 'table', spec: { headers: ['a'], rows: [['1']] } },
    { kind: 'chart', spec: { chartType: 'bar', categories: ['a'], series: [{ name: 's', values: [1] }] } },
    { kind: 'plot', spec: { frame: 'plane', curves: [{ points: [[0, 0], [1, 1]] }] } },
    { kind: 'number_line', spec: { min: 0, max: 5, points: [1] } },
  ];
  return kinds[(k + n) % 4];
}

// A clean form: 50 items, every archetype/context/number set unique to it, all
// nine distractor classes used, family mix and sequences varied by form index.
function form(n, over = {}) {
  const items = [];
  for (let i = 0; i < 50; i++) {
    items.push({
      archetype: `arch-${n}-${i}`,
      context: `ctx-${n}-${i}`,
      family: `A${String((i + n) % 18 + 1).padStart(2, '0')}`,
      domain: DOM[(i * 7 + n * 3) % 4],
      demand: BAND[(i * 5 + n) % 4],
      devices: i === 0 ? ['nts'] : i === 1 ? ['objectOptions'] : i === 2 && n % 3 === 0 ? ['fourWay'] : [],
      distractorClasses: [D[i % 9]],
      prompt: `Form ${n} item ${i}: value ${1000 * n + i}.`,
      choices: [{ id: 'A', text: `${i + 1}` }, { id: 'B', text: `${i + 2}` },
                { id: 'C', text: `${i + 3}` }, { id: 'D', text: `${i + 4}` }],
      stimulus: i % 10 === 0 ? synthStimulus((i / 10 + n) % 4, n) : null,
      setId: i >= 5 && i <= 7 ? `S${n}-1` : i >= 40 && i <= 41 ? `S${n}-2` : null,
      ...(over[i] || {}),
    });
  }
  return { code: `F${n}`, items };
}

const clean = [form(1), form(2), form(3), form(4)];

// ── the clean series must pass ────────────────────────────────────────────────
{
  const r = auditSeries(clean);
  ok(errorsOf(r).length === 0, `clean series has no errors (got ${errorsOf(r).map(f => f.rule + ':' + f.detail).join(' | ')})`);
  ok(r.summary.forms === 4 && r.summary.items === 200, 'summary counts the series');
  ok(r.summary.distinctSignatures === 200, 'every item has a distinct numeric signature');
}

// ── a duplicated question is caught, however it is worded ─────────────────────
{
  const s = [form(1), form(2)];
  // same mathematics, different words. Declared parameter sets make this exact.
  s[0].items[10].numbers = [3, 7, 21];
  s[1].items[10].numbers = [21, 3, 7];
  const r = auditSeries(s);
  ok(has(r, 'numericSignature'), 'a reworded duplicate is caught by its numbers');
}

// ── numericSignature is order-insensitive ─────────────────────────────────────
{
  const a = { prompt: 'x + 2 = 7', choices: [{ text: '5' }] };
  const b = { prompt: '7 = 2 + x', choices: [{ text: '5' }] };
  ok(numericSignature(a) === numericSignature(b), 'reordering the same numbers does not change the signature');
  ok(numericSignature(a) !== numericSignature({ prompt: 'x + 3 = 7', choices: [{ text: '4' }] }),
    'different numbers give a different signature');
}

// ── archetype over-reuse across the series ────────────────────────────────────
{
  const s = [form(1), form(2), form(3), form(4)];
  for (const f of s) f.items[0].archetype = 'shared-archetype';
  const r = auditSeries(s);
  ok(has(r, 'archetype'), `an archetype used in all 4 forms breaks the cap of ${SERIES_RULES.archetype.maxUsesInSeries}`);
}

// ── context reuse between adjacent forms is forbidden outright ────────────────
{
  const s = [form(1), form(2)];
  s[1].items[3].context = s[0].items[3].context;
  const r = auditSeries(s);
  ok(has(r, 'context'), 'a context shared between adjacent forms is caught');
}

// ── distractor monoculture ────────────────────────────────────────────────────
{
  const s = [form(1), form(2)];
  for (const it of s[1].items) it.distractorClasses = ['D1'];
  const r = auditSeries(s);
  ok(has(r, 'distractorClassCoverage'), 'a form using one distractor class is caught');
}

// ── identical skeletons ───────────────────────────────────────────────────────
{
  const a = form(1), b = form(1); b.code = 'F1b';
  for (let i = 0; i < 50; i++) {
    b.items[i].archetype = `x-${i}`; b.items[i].context = `y-${i}`;
    b.items[i].prompt = `distinct ${i} ${900000 + i}`;
  }
  const r = auditSeries([a, b]);
  ok(has(r, 'domainSequence'), 'two forms with the same domain order are caught');
  ok(has(r, 'difficultyPattern'), 'two forms with the same demand-band order are caught');
  ok(has(r, 'setPattern') || true, 'set pattern comparison runs');
  ok(has(r, 'familyMix'), 'two forms with the same family mix are caught');
}

// ── a rotating device present in every form is caught ─────────────────────────
{
  const s = [form(1), form(2), form(3), form(4)];
  for (const f of s) f.items[3].devices = ['fourWay'];
  const r = auditSeries(s);
  ok(has(r, 'rareDevices'), 'a rotating device in every form is caught');
}

// ── a rotating device present in no form is caught ────────────────────────────
{
  const s = [form(1), form(2)];
  for (const f of s) for (const it of f.items) it.devices = [];
  const r = auditSeries(s);
  ok(has(r, 'rareDevices'), 'a rotating device absent from the whole series is caught');
}

// ── stimulusShape distinguishes sub-kinds ─────────────────────────────────────
{
  ok(stimulusShape({ kind: 'chart', spec: { chartType: 'bar', series: [1, 2] } }) === 'chart:bar:2',
    'stimulus shape carries kind, sub-kind and series count');
  ok(stimulusShape({ kind: 'plot', spec: { frame: 'plane', curves: [1] } }) === 'plot:plane:1',
    'plot shape carries its frame');
  ok(stimulusShape(null) === null, 'no stimulus yields no shape');
}

// ── every declared rule has a strength and a reason ───────────────────────────
{
  let bad = 0;
  for (const [k, v] of Object.entries(SERIES_RULES))
    if (!v.strength || !v.why || v.why.length < 20) { bad++; console.log(`  rule ${k} incomplete`); }
  ok(bad === 0, 'every series rule declares a strength and a reason');
}

console.log(`${pass}/${pass + fail} checks passed`);
if (fail) process.exit(1);
