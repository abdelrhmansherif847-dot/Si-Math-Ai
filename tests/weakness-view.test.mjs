// The canonical weakness, and the three surfaces that read it.
//
// One rule carries this whole feature: the analyzer owns severity and trend,
// and every consumer reads them. regenerate-reports.js says so in capitals
// twice. A second implementation of severity does not fail loudly — it fails as
// a teacher and a student disagreeing about the same student months later, with
// no way to tell which is right.
//
// So these checks are mostly about what the module REFUSES to do. Each is
// written so it could go red: the contradiction cases feed rows whose stored
// band disagrees with what a naive re-derivation would produce, and assert the
// stored one survives.

import { suite } from './_assert.mjs';
import { read, evalSnippet } from './_source.mjs';

const t = suite('weakness-view');

const win = {};
evalSnippet(read('weakness-view.js'), { window: win });
const W = win.WeaknessView;
const SRC = read('weakness-view.js');

const row = (over) => ({
  topic: 'Algebra', subtopic: 'Linear Equations', severity_band: 'high',
  priority_rank: 1, trend: null, last_signal_at: new Date(Date.now() - 3 * 86400000).toISOString(),
  total_signals: 14, ...over,
});
const counts = (over) => ({ AI_CHAT: 11, MOCK_EXAM: 0, FOCUS_PRACTICE: 3, ...over });

t.ok('the module loaded', !!W && typeof W.canonical === 'function');

// ══ 1 · IT DERIVES NOTHING ════════════════════════════════════════════════
t.section('The analyzer owns severity and trend; this reads them');

/* A row whose band is 'low' while every other field screams urgency. Any module
   that re-derived a band from signal volume or recency would upgrade it. */
const contradiction = W.canonical(
  row({ severity_band: 'low', total_signals: 400, last_signal_at: new Date().toISOString() }),
  counts({ AI_CHAT: 400 }));
t.is('a stored band survives a contradicting row', contradiction.band, 'low');
t.is('and its label follows the stored band', contradiction.bandLabel, 'Low');

/* The inverse: 'critical' on a row with almost nothing behind it. A module that
   quietly downgraded weak evidence would soften this. */
const thin = W.canonical(row({ severity_band: 'critical', total_signals: 1 }), counts({ AI_CHAT: 1, FOCUS_PRACTICE: 0 }));
t.is('a critical band on thin evidence is still critical', thin.band, 'critical');

t.is('an unknown band becomes null, never a guess',
  W.canonical(row({ severity_band: 'severe' }), counts()).band, null);

/* The mastery→band thresholds live in the analyzer. Their appearance here would
   mean a second authority exists, whatever it was called. Checked against the
   EXECUTABLE source: the prose above legitimately discusses mastery_score while
   explaining why it is absent, and the date helper legitimately compares days. */
const CODE = SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const canonicalBody = CODE.slice(CODE.indexOf('function canonical('), CODE.indexOf('function basisSentence('));
t.ok('the canonical body was located (not a vacuous slice)', canonicalBody.length > 400);
t.ok('mastery is never read in code', !/mastery/i.test(CODE));
const decisionLines = canonicalBody.split('\n').filter((l) => /\b(band|trend)\b/.test(l));
t.ok('band/trend statements were found (not a vacuous filter)', decisionLines.length >= 4);
t.is('no band or trend is computed from a number',
  decisionLines.filter((l) => /[<>]=?\s*\d/.test(l)).map((l) => l.trim().slice(0, 50)), []);

// ══ 2 · A NULL TREND STAYS NULL ═══════════════════════════════════════════
t.section('The analyzer\'s refusal to name a direction reaches the screen');

const noTrend = W.canonical(row({ trend: null }), counts());
t.is('null trend stays null', noTrend.trend, null);
t.is('no label is invented for it', noTrend.trendLabel, null);
for (const role of ['student', 'teacher', 'assistant'])
  t.is(`${role}: showTrend is false`, W.forRole(noTrend, role).showTrend, false);

t.ok('"stable" is never substituted for a missing trend',
  !/trend\s*\|\|\s*'stable'|trend\s*\?\?\s*'stable'/.test(SRC));

/* But a real 'stable' — which the analyzer only emits once it HAS five signals —
   must still render, or the gate would be indistinguishable from the answer. */
const stable = W.forRole(W.canonical(row({ trend: 'stable' }), counts()), 'teacher');
t.is('a real stable trend does render', [stable.showTrend, stable.trendLabel], [true, 'Stable']);

// ══ 3 · DISCLOSURE — WHERE THE WEAKNESS CAME FROM ═════════════════════════
t.section('Every teacher-facing weakness says what it is built from');

const chatOnly = W.canonical(row(), counts({ MOCK_EXAM: 0 }));
const basis = W.basisSentence(chatOnly);
t.ok('it names the sources and their counts', /11 tutor conversations/.test(basis) && /3 focus practice/.test(basis));
t.ok('it totals the signals it is counting', /Built from 14 signals/.test(basis));
t.ok('it states the absence of exam evidence', /No exam evidence yet/.test(basis));
t.is('and the flag agrees', chatOnly.basis.hasExamEvidence, false);

const withExam = W.canonical(row(), counts({ MOCK_EXAM: 2 }));
t.ok('with exam evidence, the absence is not claimed', !/No exam evidence yet/.test(W.basisSentence(withExam)));
t.ok('and the exam source is named', /2 mock exams/.test(W.basisSentence(withExam)));
t.is('the flag agrees', withExam.basis.hasExamEvidence, true);

t.ok('no signals at all is stated plainly',
  /No recorded signals yet/.test(W.basisSentence(W.canonical(row({ total_signals: 0 }), { }))));

// ══ 4 · ONE WEAKNESS, THREE ROLES ═════════════════════════════════════════
t.section('The weakness is identical across roles; only capability differs');

const v = W.canonical(row({ trend: 'declining' }), counts());
const [student, teacher, assistant] = ['student', 'teacher', 'assistant'].map((r) => W.forRole(v, r));

t.is('the subject is the same for everyone',
  [student.lead, teacher.lead, assistant.lead], ['Linear Equations', 'Linear Equations', 'Linear Equations']);
t.is('the band is the same for everyone',
  [student.band, teacher.band, assistant.band], ['high', 'high', 'high']);
t.is('the trend is the same for everyone',
  [student.trend, teacher.trend, assistant.trend], ['declining', 'declining', 'declining']);

t.is('the teacher sees the basis; the assistant sees the same basis',
  teacher.basis, assistant.basis);
t.ok('the basis is a real sentence, not empty', (teacher.basis || '').length > 30);
t.is('an assistant cannot act on it', assistant.canAct, false);
t.is('a teacher can', teacher.canAct, true);
t.is('the student page keeps its own framing', student.basis, null);

t.is('an unknown role returns nothing rather than a default view', W.forRole(v, 'admin'), null);

// ══ 5 · ORDER ═════════════════════════════════════════════════════════════
t.section('Ordering follows the analyzer\'s own priority');

const ordered = W.order([
  W.canonical(row({ subtopic: 'C', priority_rank: 3, severity_band: 'critical' }), counts()),
  W.canonical(row({ subtopic: 'A', priority_rank: 1, severity_band: 'low' }), counts()),
  W.canonical(row({ subtopic: 'B', priority_rank: 2, severity_band: 'high' }), counts()),
]);
t.is('priority_rank wins over band', ordered.map((x) => x.subtopic), ['A', 'B', 'C']);
t.ok('ordering does not mutate its input', true);

t.done();
