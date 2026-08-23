// exam-registry.js — exams as data, and the guard that makes Phase 1b safe.
//
// Mock Exam v2, Phase 1a. The registry is not consumed by anything yet:
// mock-exam.html still carries its own EXAM_CONFIGS literal and is untouched.
// That makes the central question of this suite a comparison, not a behaviour
// check — does compat() reproduce, field for field, what production runs today?
//
// So the drift guard below EXTRACTS THE REAL LITERAL from mock-exam.html and
// diffs it against the registry, the same way constants-drift.test.mjs holds the
// rank ladder's frozen copy in line. It is the reason Phase 1b can delete that
// literal without reading all 101 KB of the page: if the two ever disagree by
// anything other than the one approved correction, this goes red.
//
// Every assertion here could fail. Per docs/roadmap/verification-framework-audit.md:
// a green check is only evidence if it could have gone red. There are no
// existence checks in this file — each one pins a value or a rule.
import { suite } from './_assert.mjs';
import { read, evalSnippet } from './_source.mjs';

const t = suite('exam-registry');

// ── Load the registry ──────────────────────────────────────────────────────
const root = {};
evalSnippet(read('exam-registry.js'), { globalThis: root, window: root }, []);
const R = root.SiExamRegistry;

// ── Extract the REAL literal that ships in mock-exam.html today ────────────
const pageSrc = read('mock-exam.html');
const literalMatch = pageSrc.match(/const EXAM_CONFIGS = \{[\s\S]*?\n\};/);
if (!literalMatch) {
  // A silent miss would make every comparison below pass vacuously against an
  // empty object — the exact failure mode _source.mjs warns about.
  console.log('  FAIL  could not extract EXAM_CONFIGS from mock-exam.html');
  process.exit(1);
}
const { EXAM_CONFIGS: SHIPPED } = evalSnippet(literalMatch[0], {}, ['EXAM_CONFIGS']);

// The one correction approved for this project: EST is the Egyptian Scholastic
// Test, not the "Emirates Standardized Test". Student-facing copy on the exam
// card. Any OTHER difference is drift and must fail.
const APPROVED_DIFFS = [
  { code: 'EST_MATH_1',    field: 'org', from: 'Emirates Standardized Test', to: 'Egyptian Scholastic Test (EST)' },
  { code: 'EST_MATH_2_L1', field: 'org', from: 'Emirates Standardized Test', to: 'Egyptian Scholastic Test (EST)' },
];

// ───────────────────────────────────────────────────────────────────────────
t.section('Drift guard: compat() vs the literal shipping in mock-exam.html');

const compat = R.compat();
const shippedCodes = Object.keys(SHIPPED).sort();
const compatCodes = Object.keys(compat).sort();

t.is('same exam codes, no additions or removals', compatCodes, shippedCodes);
t.ok('the extracted literal is non-trivial (7 exams)', shippedCodes.length === 7);

// Diff every field of every exam, then compare the diff set to the approved list.
const diffs = [];
for (const code of shippedCodes) {
  const a = SHIPPED[code] || {};
  const b = compat[code] || {};
  const fields = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const f of fields) {
    if (JSON.stringify(a[f]) !== JSON.stringify(b[f])) {
      diffs.push({ code, field: f, from: a[f], to: b[f] });
    }
  }
}
const norm = (d) => `${d.code}.${d.field}: ${JSON.stringify(d.from)} -> ${JSON.stringify(d.to)}`;
t.is(
  'every field matches except the approved EST correction',
  diffs.map(norm).sort(),
  APPROVED_DIFFS.map(norm).sort(),
);

// Field-level equality is checked above; this pins the field SET too, so a
// silently-dropped key cannot pass by being absent from both sides.
t.is(
  'compat exposes exactly the literal\'s field names',
  Object.keys(compat.SAT_FULL).sort(),
  Object.keys(SHIPPED.SAT_FULL).sort(),
);

// ───────────────────────────────────────────────────────────────────────────
t.section('Totals are derived from modules, never typed');

// The anti-drift property: no exam may claim a total that disagrees with the
// sum of its parts. This is what buys us the two-module DSAT for free.
let derivedOk = true;
for (const e of R.all()) {
  if (e.modules === null) continue;
  const q = e.modules.reduce((n, m) => n + m.questions, 0);
  const d = e.modules.reduce((n, m) => n + m.durationMinutes, 0);
  if (compat[e.code].questions !== q || compat[e.code].duration !== d) derivedOk = false;
}
t.ok('every exam total equals the sum of its modules', derivedOk);

t.is('SAT_FULL is two modules', R.modulesOf('SAT_FULL').map(m => m.label), ['Module 1', 'Module 2']);
t.is('SAT_FULL derives 44 questions', R.totalQuestions('SAT_FULL'), 44);
t.is('SAT_FULL derives 70 minutes', R.totalDurationMinutes('SAT_FULL'), 70);
t.is('each DSAT module is 22 q / 35 min',
  R.modulesOf('SAT_FULL').map(m => [m.questions, m.durationMinutes]), [[22, 35], [22, 35]]);
t.is('ACT_MATH is 45 q / 50 min', [R.totalQuestions('ACT_MATH'), R.totalDurationMinutes('ACT_MATH')], [45, 50]);

// ───────────────────────────────────────────────────────────────────────────
t.section('Dynamic exam (Practice Timer)');

t.ok('PRACTICE is dynamic', R.isDynamic('PRACTICE'));
t.is('PRACTICE reports null totals, as production does',
  [R.totalQuestions('PRACTICE'), R.totalDurationMinutes('PRACTICE')], [null, null]);
t.is('PRACTICE has no module list', R.modulesOf('PRACTICE'), []);
t.ok('no fixed-length exam is dynamic',
  R.EXAM_CODES.filter(c => c !== 'PRACTICE').every(c => !R.isDynamic(c)));

// Production computes Math.ceil(questions * 1.5) minutes. Pinned so the registry
// cannot quietly repace practice sessions.
t.is('practice pacing matches production for 1/20/21 questions',
  [1, 20, 21].map(R.practiceDurationMinutes), [2, 30, 32]);
t.is('practice pacing floors at 0 for junk input',
  [0, -5, NaN].map(R.practiceDurationMinutes), [0, 0, 0]);

// ───────────────────────────────────────────────────────────────────────────
t.section('Announcement schedules');

const ann = R.get('SAT_FULL').announcements;

// A DSAT module is 35 minutes, not 70. Getting this wrong is the specific bug
// the per-module flag exists to prevent.
const dsatMod = R.scheduleFor('SAT_FULL', 1);
t.is('DSAT module 1 schedule is built from 35 min, not 70',
  dsatMod.map(x => x.atRemainingSec), [1050, 300, 180, 60, 0]);
t.is('module 2 gets the same schedule as module 1',
  R.scheduleFor('SAT_FULL', 2).map(x => x.key), dsatMod.map(x => x.key));

t.is('entries run in the order the student meets them',
  dsatMod.map(x => x.atRemainingSec),
  [...dsatMod.map(x => x.atRemainingSec)].sort((a, b) => b - a));
t.is('time_up is always last and at zero',
  [dsatMod[dsatMod.length - 1].key, dsatMod[dsatMod.length - 1].atRemainingSec], ['time_up', 0]);

// A mark outside the block must not fire. "Five minutes remaining" on a
// five-minute block would announce at t=0, before the first question is read.
const fiveMin = R.buildAnnouncementSchedule(300, ann);
t.is('a 5-min block drops the 5-min mark (strictly inside only)',
  fiveMin.map(x => x.key), ['three_minutes', 'one_minute', 'time_up']);
t.ok('a 5-min block gets no halfway (below HALFWAY_MIN_SEC)',
  !fiveMin.some(x => x.key === 'halfway'));
// 15 min: halfway lands at 450 s, clear of every mark, so it survives.
t.ok('a 15-min block does get a halfway',
  R.buildAnnouncementSchedule(900, ann).some(x => x.key === 'halfway'));

// Halfway landing exactly on a mark must produce ONE announcement, and the
// mark's more specific wording must win. A 10-minute block is exactly that
// case — halfway is 300 s, which IS the five-minute mark — so it deliberately
// carries no separate "halfway" entry. "Five minutes remaining" says the same
// thing and says it better.
const collide = R.buildAnnouncementSchedule(600, ann);
t.is('halfway colliding with the 5-min mark yields one entry, mark wins',
  collide.filter(x => x.atRemainingSec === 300).map(x => x.key), ['five_minutes']);
t.ok('...so a 10-min block has no standalone halfway',
  !collide.some(x => x.key === 'halfway'));
t.ok('no duplicate timestamps in any schedule',
  R.EXAM_CODES.every(c => {
    const s = c === 'PRACTICE' ? R.scheduleFor(c, 1, 3600) : R.scheduleFor(c, 1);
    return new Set(s.map(x => x.atRemainingSec)).size === s.length;
  }));

t.is('a zero/negative duration yields no schedule at all',
  [R.buildAnnouncementSchedule(0, ann), R.buildAnnouncementSchedule(-60, ann)], [[], []]);
t.is('a dynamic exam needs an explicit duration', R.scheduleFor('PRACTICE', 1), []);
t.ok('given one, it builds a schedule', R.scheduleFor('PRACTICE', 1, 1800).length > 0);

// The 3-minute warning is the one the specification requires by name.
t.ok('every fixed exam warns at 3 minutes',
  R.EXAM_CODES.filter(c => c !== 'PRACTICE')
    .every(c => R.scheduleFor(c, 1).some(x => x.key === 'three_minutes')));

// A session-level exam schedules against the whole session.
t.is('EST_MATH_1 (perModule:false) uses the full 75 min',
  R.scheduleFor('EST_MATH_1', 1)[0].atRemainingSec, Math.floor(75 * 60 / 2));

// ───────────────────────────────────────────────────────────────────────────
t.section('Calculator policy');

// Decision 2/6: Desmos is separately licensed and no substitute may pose as it.
// The absence of a provider is a supported state, and it is the state of every
// exam. If a provider ever appears here without a licence, this goes red.
t.ok('NO exam renders a calculator (no provider is licensed)',
  R.EXAM_CODES.every(c => !R.hasRenderableCalculator(c)));
t.ok('every provider is explicitly null',
  R.EXAM_CODES.every(c => R.calculatorPolicy(c).provider === null));
t.ok('no config mentions Desmos as a provider',
  !JSON.stringify(R.EXAMS.map(e => e.calculator.provider)).toLowerCase().includes('desmos'));

t.ok('every scope is from the declared vocabulary',
  R.EXAM_CODES.every(c => R.CALC_SCOPES.includes(R.calculatorPolicy(c).scope)));

// Production preservation: the compat boolean must equal the policy's `allowed`.
t.ok('compat.calculator tracks policy.allowed for every exam',
  R.EXAM_CODES.every(c => compat[c].calculator === R.calculatorPolicy(c).allowed));

// The case the old boolean could not express.
t.is('EST_MATH_1 is partial-scope (part 2 only)', R.calculatorPolicy('EST_MATH_1').scope, 'partial');
t.ok('EST_MATH_1 is bring-your-own', R.calculatorPolicy('EST_MATH_1').byod === true);
t.ok('DSAT is not bring-your-own (test day provides one)',
  ['SAT_MODULE_1', 'SAT_MODULE_2', 'SAT_FULL'].every(c => R.calculatorPolicy(c).byod === false));
t.ok('every non-practice exam explains its real test-day calculator',
  R.EXAM_CODES.filter(c => c !== 'PRACTICE').every(c => R.calculatorPolicy(c).note.length > 20));

// ───────────────────────────────────────────────────────────────────────────
t.section('EST naming correction');

t.is('both EST exams carry the corrected name',
  ['EST_MATH_1', 'EST_MATH_2_L1'].map(c => R.get(c).org),
  ['Egyptian Scholastic Test (EST)', 'Egyptian Scholastic Test (EST)']);
// Scans the DATA, not the file text — the header comment legitimately names the
// old string to explain the correction, and a source-text scan would forbid
// documenting the very thing being fixed.
t.ok('no config value anywhere still says "Emirates"',
  !JSON.stringify(R.EXAMS).includes('Emirates'));
t.ok('nor does the compat view served to the page',
  !JSON.stringify(R.compat()).includes('Emirates'));

// ───────────────────────────────────────────────────────────────────────────
t.section('Ambience default and immutability');

// Encoded as data so a UI edit cannot quietly flip it on for every student.
t.is('ambient sound defaults to OFF', R.DEFAULT_AMBIENCE_ENABLED, false);

t.ok('the canonical table is deeply frozen',
  Object.isFrozen(R.EXAMS) && Object.isFrozen(R.EXAMS[0]) && Object.isFrozen(R.EXAMS[0].calculator));

// A write to shared config would corrupt every consumer on the page.
const before = R.get('SAT_FULL').scoreMax;
try { R.get('SAT_FULL').scoreMax = 1; } catch (_) { /* strict-mode throw is fine too */ }
t.is('a stray write to a config leaves it unchanged', R.get('SAT_FULL').scoreMax, before);

// compat() replaces a single `const`, so its identity must be stable — the page
// assigns EXAM_CONFIGS.PRACTICE to state and re-reads it.
t.ok('compat() returns a stable reference', R.compat() === R.compat());
t.ok('compat entries are stable too', R.compat().PRACTICE === R.compat().PRACTICE);

t.section('Phase 1a contract: nothing consumes the registry yet');
t.ok('mock-exam.html does not load exam-registry.js (Phase 1b does that)',
  !pageSrc.includes('exam-registry.js'));
t.ok('mock-exam.html still owns its literal, unmodified',
  pageSrc.includes('const EXAM_CONFIGS = {'));

t.done();
