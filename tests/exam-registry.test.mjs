// exam-registry.js — exams as data, and the guard around the migration to it.
//
// Mock Exam v2, Phase 1b complete. exam-registry.js is now THE single source of
// truth for every exam, and mock-exam.html consumes it through compat(); the
// literal that page used to carry is gone, so there is no second copy to drift.
//
// Through Phase 1a this suite answered its central question by diffing the
// registry against the real literal extracted from mock-exam.html. Phase 1b
// deleted that literal, so the comparison baseline is PINNED BELOW instead —
// a frozen snapshot of the pre-migration configuration, kept only to catch an
// unintended regression. See the block above SHIPPED: it is a historical
// artefact, not an authority.
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

// ── HISTORICAL MIGRATION BASELINE — NOT A SOURCE OF TRUTH ──────────────────
//
// After Phase 1b the architecture is:
//
//     exam-registry.js  →  the single source of truth for every exam
//
// This table is NOT a second one. It is a frozen snapshot of the EXAM_CONFIGS
// literal exactly as mock-exam.html shipped it before Phase 1b deleted that
// literal, and it exists for one purpose: to detect an UNINTENDED behavioural
// or configuration regression introduced by the migration. It answers "did
// moving exams into the registry silently change anything a student sees?" —
// nothing more.
//
// It is therefore historical and does not track the product. A deliberate,
// approved change to an exam belongs in exam-registry.js; this snapshot then
// records the divergence from the pre-migration state, which is exactly what
// the APPROVED_DIFFS list below is for. Do not "update the baseline to match"
// as a way of making this suite pass — that inverts the guard and turns a
// regression into a silent edit. Add the intended change to APPROVED_DIFFS,
// where it is visible and reviewable.
const pageSrc = read('mock-exam.html');
const SHIPPED = {
  SAT_MODULE_1: {"code":"SAT_MODULE_1","examType":"SAT","displayName":"SAT Math — Module 1","shortName":"Module 1","org":"College Board · Digital SAT","duration":35,"questions":22,"calculator":true,"scoreMin":200,"scoreMax":800},
  SAT_MODULE_2: {"code":"SAT_MODULE_2","examType":"SAT","displayName":"SAT Math — Module 2","shortName":"Module 2","org":"College Board · Digital SAT","duration":35,"questions":22,"calculator":true,"scoreMin":200,"scoreMax":800},
  SAT_FULL: {"code":"SAT_FULL","examType":"SAT","displayName":"Full SAT Math","shortName":"Full SAT","org":"College Board · Digital SAT (Both Modules)","duration":70,"questions":44,"calculator":true,"scoreMin":200,"scoreMax":800},
  EST_MATH_1: {"code":"EST_MATH_1","examType":"EST","displayName":"EST Math 1","shortName":"EST Math 1","org":"Emirates Standardized Test","duration":75,"questions":50,"calculator":true,"scoreMin":200,"scoreMax":800},
  EST_MATH_2_L1: {"code":"EST_MATH_2_L1","examType":"EST","displayName":"EST Math 2 — Level 1","shortName":"EST Math 2 L1","org":"Emirates Standardized Test","duration":60,"questions":40,"calculator":true,"scoreMin":200,"scoreMax":800},
  ACT_MATH: {"code":"ACT_MATH","examType":"ACT","displayName":"ACT Math","shortName":"ACT Math","org":"ACT Inc.","duration":50,"questions":45,"calculator":true,"scoreMin":1,"scoreMax":36},
  PRACTICE: {"code":"PRACTICE","examType":"PRACTICE","displayName":"Practice Timer","shortName":"Practice","org":"General Practice & Drills","duration":null,"questions":null,"calculator":true,"scoreMin":0,"scoreMax":9999},
};

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

// Every targeted exam allows a calculator for the whole section, so `scope`
// no longer distinguishes them and `byod` is the axis that does. Asserted per
// exam rather than as a blanket rule: a future exam that is genuinely partial
// must fail this and be thought about, not absorbed silently.
t.ok('every exam allows a calculator for the whole section',
  R.EXAM_CODES.every(c => R.calculatorPolicy(c).scope === 'exam'));
t.is('EST_MATH_1 allows a calculator throughout', R.calculatorPolicy('EST_MATH_1').scope, 'exam');
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

t.section('Phase 1b: the page consumes the registry and owns no second copy');
t.ok('mock-exam.html loads exam-registry.js',
  pageSrc.includes('<script src="exam-registry.js"></script>'));
t.ok('the registry loads before the inline script that uses it',
  pageSrc.indexOf('<script src="exam-registry.js"') < pageSrc.indexOf('window.SiExamRegistry.compat()'));
t.ok('the registry tag is neither deferred nor async',
  !/<script src="exam-registry\.js"[^>]*(defer|async)/.test(pageSrc));
t.ok('the duplicate literal is GONE — one source of truth',
  !pageSrc.includes('const EXAM_CONFIGS = {'));
t.ok('EXAM_CONFIGS is assigned from the compat view',
  pageSrc.includes('const EXAM_CONFIGS = window.SiExamRegistry.compat();'));
t.ok('a missing registry is guarded like a missing SDK',
  pageSrc.includes('!window.SiExamRegistry'));

t.section('answer conventions — how many options, and what they are called');

// The convention is the reason an ACT form can exist at all: 20260830c widened
// the database to STORE five-choice questions and deliberately refused to learn
// which letters belong on which ordinal. This is where that lives, so it is
// where it has to be checked.
const conv = (c) => R.answerConvention(c);

t.is('SAT follows the four-option convention', conv('SAT_FULL').id, 'sat4');
t.is('EST Math 1 follows it too', conv('EST_MATH_1').id, 'sat4');
t.is('EST Math 2 follows it too', conv('EST_MATH_2_L1').id, 'sat4');
t.is('ACT has its own', conv('ACT_MATH').id, 'act5alt');
t.is('the Practice Timer has none — it holds no items', R.answerConvention('PRACTICE'), null);
t.is('every exam that holds questions declares one',
  R.all().filter((e) => e.modules && e.code !== 'PRACTICE' && !R.answerConvention(e.code))
    .map((e) => e.code), []);

t.is('SAT offers four options', R.choiceIdsFor('SAT_FULL', 1), ['A', 'B', 'C', 'D']);
t.is('EST offers four options', R.choiceIdsFor('EST_MATH_1', 7), ['A', 'B', 'C', 'D']);

// THE ALTERNATION IS THE WHOLE POINT. An ACT paper letters odd questions A-E
// and even questions F-K, and a student who practises A-D throughout learns to
// scan four options and to expect the same letters twice running.
t.is('ACT question 1 is lettered A-E', R.choiceIdsFor('ACT_MATH', 1), ['A', 'B', 'C', 'D', 'E']);
t.is('ACT question 2 is lettered F-K', R.choiceIdsFor('ACT_MATH', 2), ['F', 'G', 'H', 'J', 'K']);
t.is('ACT question 45 is lettered A-E', R.choiceIdsFor('ACT_MATH', 45), ['A', 'B', 'C', 'D', 'E']);
t.ok('ACT never letters an option I — it reads as a 1 beside the question number',
  ![1, 2, 3, 4].some((n) => R.choiceIdsFor('ACT_MATH', n).includes('I')));
t.ok('the two ACT sets never share a letter',
  R.choiceIdsFor('ACT_MATH', 1).every((x) => !R.choiceIdsFor('ACT_MATH', 2).includes(x)));

// The returned array must not be the registry's own, or one caller sorting it
// in place would re-letter the exam for every caller after it.
const ids = R.choiceIdsFor('ACT_MATH', 1);
ids.push('Z');
t.is('choiceIdsFor returns a copy', R.choiceIdsFor('ACT_MATH', 1).length, 5);

// Every set the registry can produce must be one the database will accept, or
// a form passes pre-flight and is refused on insert.
const STORABLE = [['A', 'B', 'C', 'D'], ['A', 'B', 'C', 'D', 'E'], ['F', 'G', 'H', 'J', 'K']]
  .map((a) => a.join(''));
t.is('every convention produces only sets 20260830c can store',
  Object.keys(R.ANSWER_CONVENTIONS)
    .flatMap((k) => R.ANSWER_CONVENTIONS[k].sets.map((a) => a.slice().sort().join('')))
    .filter((set) => !STORABLE.includes(set)), []);
t.is('and idsFor only ever returns one of its own declared sets',
  Object.keys(R.ANSWER_CONVENTIONS).flatMap((k) => {
    const c = R.ANSWER_CONVENTIONS[k];
    const declared = c.sets.map((a) => a.join(''));
    return [1, 2, 3, 4, 45, 50].map((n) => c.idsFor(n).join(''))
      .filter((got) => !declared.includes(got));
  }), []);

// The ACT is entirely multiple choice; the SAT and EST carry student-produced
// responses. A grid-in authored into an ACT form would be a question its
// answer sheet has no way to represent.
t.ok('the SAT permits student-produced responses', R.gridInAllowed('SAT_FULL'));
t.ok('the EST permits them', R.gridInAllowed('EST_MATH_1'));
t.ok('the ACT does not', !R.gridInAllowed('ACT_MATH'));

t.done();
