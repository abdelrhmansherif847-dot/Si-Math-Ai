#!/usr/bin/env node
/**
 * validate-study-planner.mjs — behavioural guards for the Study Planner engine.
 * Exit non-zero on any failure (CI gate). Pure engine → no DB, no network.
 *
 * Run:   node scripts/validate-study-planner.mjs
 * Demo:  node scripts/validate-study-planner.mjs --demo   (prints a sample plan)
 *
 * Checks:
 *   1. Shape          — buildStudyPlan returns the full documented envelope.
 *   2. No durations   — no minute/duration estimate is exposed on tasks, days,
 *                       or availability (used only internally to balance days).
 *   3. Prioritization — severity, tutor confusion, and mock misses raise rank.
 *   4. Exam importance— high-frequency topics outrank rare ones at equal
 *                       weakness; caller overrides win; weight is exposed.
 *   5. Focus sequence — remaining units kept in Focus order, never re-invented.
 *   6. Proportional   — days allocated in proportion to remaining Focus work.
 *   7. 7-day plan     — named days, rest days, one weekly mock, NO clock times,
 *                       units spread one-per-study-day in sequence across days.
 *   8. Availability   — study hours balance the day internally (fewer tasks on a
 *                       tighter budget) without surfacing any duration.
 *   9. Roadmap        — secondary; exam date sets horizon; high-impact week 1.
 *  10. Determinism    — identical inputs → byte-identical plan JSON.
 *  11. Empty state    — a brand-new student gets a safe diagnostic plan, no throw.
 *  12. Triggers       — week_elapsed / new mock / focus done / new weakness /
 *                       improvement fire; unchanged state does not.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { BANNER } from './sync-study-planner.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const SP = require(resolve(root, 'supabase/functions/_shared/study-planner.core.js'));

let failures = 0;
const fail = (m) => { console.error('  ✗', m); failures++; };
const ok = (m) => console.log('  ✓', m);
const assert = (cond, m) => (cond ? ok(m) : fail(m));
const codes = (res) => res.reasons.map((r) => r.code);

/* ── 0. Browser-copy drift guard ──────────────────────────────────────────── */
{
  const src = readFileSync(resolve(root, 'supabase/functions/_shared/study-planner.core.js'), 'utf8');
  let copy;
  try { copy = readFileSync(resolve(root, 'study-planner.js'), 'utf8'); }
  catch { copy = null; }
  assert(copy === BANNER + src, 'study-planner.js (browser copy) in sync with engine (run scripts/sync-study-planner.mjs)');
}

/* Fixed clock so every run is deterministic. 2026-07-19 is a SUNDAY, so the
 * rolling 7-day window opens on Sunday. */
const NOW = Date.parse('2026-07-19T12:00:00Z');
const DAY = 86400000;
const inDays = (n) => new Date(NOW + n * DAY).toISOString();
const allTasks = (plan) => plan.week.days.reduce((acc, d) => acc.concat(d.tasks), []);
const firstFocus = (d) => (d.tasks.find((t) => t.type === 'focus_lesson') || {}).label;

/* A realistic, multi-source student state. Focus units are titled "Round N". */
function sampleState() {
  return {
    now: NOW,
    student: {
      id: 'stu-1', name: 'Nour Hassan', examType: 'SAT',
      examDate: inDays(28), targetScore: 1400, xp: 640, rank: 'Scholar', currentStreak: 4,
      availability: { hoursPerDay: 2, studyDays: [0, 1, 2, 3, 4] }, // Sun–Thu
    },
    weakness: [
      { topic: 'Linear Functions', subtopic: 'Slope', masteryScore: 22, severityBand: 'critical',
        trend: 'declining', recent7: 5, recent14: 9, priorityRank: 1, totalSignals: 14, lastUpdatedAt: inDays(-1) },
      { topic: 'Circle', subtopic: 'Arc Length', masteryScore: 48, severityBand: 'high',
        trend: 'stable', recent7: 2, recent14: 4, priorityRank: 2, totalSignals: 7, lastUpdatedAt: inDays(-3) },
      { topic: 'Probability', subtopic: 'Compound Events', masteryScore: 74, severityBand: 'low',
        trend: 'improving', recent7: 0, recent14: 1, priorityRank: 3, totalSignals: 6, lastUpdatedAt: inDays(-5) },
    ],
    focus: [
      { id: 'fp-lin', title: 'Linear Functions', status: 'ACTIVE', topic: 'Linear Functions', subtopic: 'Slope',
        dominantSignal: 'exam_confused',
        lessons: [
          { id: 'l1', title: 'Round 1', order: 0, status: 'DONE', estimatedMinutes: 20 },
          { id: 'l2', title: 'Round 2', order: 1, status: 'IN_PROGRESS', estimatedMinutes: 20 },
          { id: 'l3', title: 'Round 3', order: 2, status: 'NOT_STARTED', estimatedMinutes: 25 },
        ] },
      { id: 'fp-cir', title: 'Circle', status: 'ACTIVE', topic: 'Circle', subtopic: 'Arc Length',
        lessons: [
          { id: 'c1', title: 'Round 1', order: 0, status: 'NOT_STARTED', estimatedMinutes: 20 },
          { id: 'c2', title: 'Round 2', order: 1, status: 'NOT_STARTED', estimatedMinutes: 20 },
        ] },
    ],
    mocks: [
      { id: 'm1', completedAt: inDays(-2), score: 1180, totalQuestions: 44, correct: 30,
        avgSecondsPerQuestion: 78, hadTimePressure: true,
        weakLessons: [
          { topic: 'Linear Functions', subtopic: 'Slope', missCount: 3 },
          { topic: 'Circle', subtopic: 'Arc Length', missCount: 1 },
        ] },
    ],
    tutor: {
      topics: [
        { topic: 'Linear Functions', subtopic: 'Slope', askCount: 6, explanationRepeats: 3, deepExplains: 2, lastAskedAt: inDays(-1) },
        { topic: 'Statistics', subtopic: 'Standard Deviation', askCount: 2, explanationRepeats: 0, deepExplains: 0, lastAskedAt: inDays(-4) },
      ],
    },
    progress: { xp: 640, rank: 'Scholar', completionRate: 0.35 },
  };
}

/* ── 1. Shape ─────────────────────────────────────────────────────────────── */
{
  const plan = SP.buildStudyPlan(sampleState());
  assert(plan.version === 'study-planner-v1', 'version stamped');
  assert(plan.meta.primary === 'week', 'week is declared the primary deliverable');
  assert(Array.isArray(plan.priorities) && plan.priorities.length >= 3, 'priorities present');
  assert(plan.week && Array.isArray(plan.week.days) && plan.week.days.length === 7, 'week has 7 days');
  assert(Array.isArray(plan.week.goals) && plan.week.goals.length > 0, 'week has measurable goals');
  assert(Array.isArray(plan.roadmap) && plan.roadmap.length > 0, 'roadmap present (secondary)');
  assert(plan.meta.creditCost === 20 && plan.meta.creditCost === SP.STUDY_PLAN_CREDIT_COST, 'credit cost 20 (matches constant)');
  assert(plan.today === plan.week.days[0], 'today points at the first day of the week');
}

/* ── 2. No study duration exposed to the student ──────────────────────────── */
{
  const plan = SP.buildStudyPlan(sampleState());
  const durKeys = ['estimatedMinutes', 'minutes', 'durationMinutes', 'time', 'startTime', 'endTime'];
  assert(allTasks(plan).every((t) => durKeys.every((k) => !(k in t))), 'no duration/time key on any task');
  assert(plan.week.days.every((d) => !('estimatedMinutes' in d) && !('minutes' in d)), 'no duration on any day');
  assert(!('weeklyMinutes' in plan.availability) && !('minutes' in plan.availability), 'availability exposes no minute figure');
  assert('hoursPerDay' in plan.availability && 'studyDays' in plan.availability, 'availability still echoes the inputs used');
  const json = JSON.stringify(plan);
  assert(!/estimatedMinutes|"minutes"|weeklyMinutes/.test(json), 'no minute field anywhere in the plan JSON');
}

/* ── 3. Prioritization (weakness / confusion / mock) ──────────────────────── */
{
  const plan = SP.buildStudyPlan(sampleState());
  assert(plan.priorities[0].topic === 'Linear Functions', 'critical + confusion + mock misses → Linear #1');

  const base = { now: NOW, student: { examType: 'SAT' },
    weakness: [{ topic: 'A', subtopic: 'x', masteryScore: 55, severityBand: 'high' },
               { topic: 'B', subtopic: 'y', masteryScore: 55, severityBand: 'high' }],
    tutor: { topics: [{ topic: 'B', subtopic: 'y', explanationRepeats: 4, deepExplains: 2 }] } };
  const pr = SP._prioritize(base);
  assert(pr.find((p) => p.topic === 'B').impactScore > pr.find((p) => p.topic === 'A').impactScore, 'repeated confusion raises impact');

  const mk = { now: NOW, student: { examType: 'SAT' },
    weakness: [{ topic: 'C', subtopic: 'z', masteryScore: 60, severityBand: 'medium' },
               { topic: 'D', subtopic: 'w', masteryScore: 60, severityBand: 'medium' }],
    mocks: [{ completedAt: inDays(-1), weakLessons: [{ topic: 'D', subtopic: 'w', missCount: 2 }] }] };
  const pr2 = SP._prioritize(mk);
  assert(pr2.find((p) => p.topic === 'D').impactScore > pr2.find((p) => p.topic === 'C').impactScore, 'mock misses raise impact');
}

/* ── 4. Exam importance (the score-leverage differentiator) ───────────────── */
{
  // Equal weakness, different real-exam frequency → importance breaks the tie.
  const imp = { now: NOW, student: { examType: 'SAT' },
    weakness: [{ topic: 'Linear Functions', subtopic: 'Slope', masteryScore: 50, severityBand: 'high' },
               { topic: 'Complex Numbers', subtopic: 'Operations', masteryScore: 50, severityBand: 'high' }] };
  const pr = SP._prioritize(imp);
  assert(pr[0].topic === 'Linear Functions', 'high-frequency topic outranks a rare one at equal weakness');
  const lin = pr.find((p) => p.topic === 'Linear Functions');
  const cx = pr.find((p) => p.topic === 'Complex Numbers');
  assert(lin.examImportance > cx.examImportance, 'examImportance weight exposed and higher for Linear');
  assert(lin.reasons.some((r) => /exam frequency/i.test(r)), 'exam-importance reason surfaced');

  // Caller override wins over the default table.
  const ov = { now: NOW, student: { examType: 'SAT' },
    examImportance: { 'complex numbers': 1.0, 'linear functions': 0.1 },
    weakness: [{ topic: 'Linear Functions', subtopic: 'Slope', masteryScore: 50, severityBand: 'high' },
               { topic: 'Complex Numbers', subtopic: 'Operations', masteryScore: 50, severityBand: 'high' }] };
  assert(SP._prioritize(ov)[0].topic === 'Complex Numbers', 'caller importance override flips the ranking');
}

/* ── 5. Focus Practice sequencing (order preserved) ───────────────────────── */
{
  const lin = SP.buildStudyPlan(sampleState()).priorities.find((p) => p.topic === 'Linear Functions');
  assert(lin.hasFocusPlan && lin.remainingLessons.length === 2, 'DONE unit excluded from remaining');
  assert(lin.remainingLessons[0].id === 'l2' && lin.remainingLessons[1].id === 'l3', 'unit order kept, never re-invented');
  assert(lin.progressPct === 33 && lin.focusRemaining === 2, 'focus progress + remaining count exposed');
}

/* ── 6. Proportional day allocation (by remaining Focus work) ─────────────── */
{
  const st = { now: NOW,
    student: { examType: 'SAT', examDate: inDays(60), availability: { hoursPerDay: 2, studyDays: [0, 1, 2, 3, 4, 5, 6] } },
    weakness: [
      { topic: 'Circle', subtopic: 'Arc Length', masteryScore: 40, severityBand: 'high' },
      { topic: 'Probability', subtopic: 'Compound Events', masteryScore: 45, severityBand: 'high' },
    ],
    focus: [
      { id: 'fp-cir', title: 'Circle', status: 'ACTIVE', topic: 'Circle', subtopic: 'Arc Length',
        lessons: [0, 1, 2, 3, 4].map((i) => ({ id: 'cir' + i, title: 'Round ' + (i + 1), order: i, status: 'NOT_STARTED' })) },
      { id: 'fp-prob', title: 'Probability', status: 'ACTIVE', topic: 'Probability', subtopic: 'Compound Events',
        lessons: [{ id: 'pr1', title: 'Round 1', order: 0, status: 'NOT_STARTED' }] },
    ] };
  const plan = SP.buildStudyPlan(st);
  const days = plan.week.days.filter((d) => d.isStudyDay);
  const circleDays = days.filter((d) => /^Circle →/.test(firstFocus(d) || '')).length;
  const probDays = days.filter((d) => /^Probability →/.test(firstFocus(d) || '')).length;
  assert(circleDays === 5, 'Circle (5 remaining rounds) spans 5 days');
  assert(probDays === 1, 'Probability (1 remaining round) occupies 1 day');
  assert(circleDays > probDays, 'more remaining work → proportionally more days');
}

/* ── 7. 7-day execution plan ──────────────────────────────────────────────── */
{
  const plan = SP.buildStudyPlan(sampleState());
  const days = plan.week.days;
  assert(days[0].day === 'Sunday' && days[0].isStudyDay, 'window opens on Sunday (a study day)');
  assert(days.map((d) => d.day).join(',') === 'Sunday,Monday,Tuesday,Wednesday,Thursday,Friday,Saturday', 'days named Sun→Sat');

  const rest = days.filter((d) => !d.isStudyDay);
  assert(rest.length === 2 && rest.every((d) => d.day === 'Friday' || d.day === 'Saturday'), 'Fri/Sat are rest days');
  assert(rest.every((d) => d.tasks.length === 0 && d.note === 'Rest day'), 'rest days carry no work');
  assert(plan.week.studyDaysPerWeek === 5, 'five study days this week');

  const timey = /\b\d{1,2}\s*[:.]\s*\d{2}\b/;
  const ampm = /\b(a\.?m\.?|p\.?m\.?)\b/i;
  assert(allTasks(plan).every((t) => !timey.test(t.label) && !ampm.test(t.label)), 'no clock times in task labels');
  assert(allTasks(plan).filter((t) => t.type === 'mock').length === 1, 'exactly one Mock Practice in the week');

  assert(firstFocus(days[0]) === 'Linear Functions → Round 2', 'Sunday anchors the first remaining unit');
  assert(firstFocus(days[1]) === 'Linear Functions → Round 3', 'Monday anchors the next unit in sequence');
  assert(firstFocus(days[2]) === 'Circle → Round 1', 'Tuesday rolls into the next topic in priority order');

  const labels = allTasks(plan).map((t) => t.label);
  assert(labels.some((l) => /^Solve \d+ Practice Questions$/.test(l)), 'includes "Solve N Practice Questions"');
  assert(labels.includes('Review previous mistakes'), 'includes "Review previous mistakes"');
  assert(labels.includes('AI Tutor Review'), 'includes "AI Tutor Review"');
  assert(labels.includes('Timed Practice'), 'includes "Timed Practice"');
  assert(plan.week.regeneratesOn === '2026-07-26', 'regeneratesOn = start + 7 days');
}

/* ── 8. Availability balances the day internally (no minutes shown) ───────── */
{
  const big = SP.buildStudyPlan(sampleState());                 // 2h/day
  const tightState = sampleState(); tightState.student.availability = { hoursPerDay: 0.5, studyDays: [0, 1, 2, 3, 4] };
  const tight = SP.buildStudyPlan(tightState);                  // 0.5h/day
  const sunBig = big.week.days[0].tasks.length;
  const sunTight = tight.week.days[0].tasks.length;
  assert(sunBig >= 1 && sunTight >= 1, 'every study day has at least one task');
  assert(sunTight <= sunBig, 'a tighter hours budget yields no more tasks (internal balancing works)');
  assert(big.availability.studyDays.join(',') === '0,1,2,3,4', 'availability echoes study days');
}

/* ── 9. Roadmap (secondary) ───────────────────────────────────────────────── */
{
  const plan = SP.buildStudyPlan(sampleState());
  assert(plan.examCountdown && plan.examCountdown.daysRemaining === 28, 'exam countdown computed');
  assert(plan.roadmap.length === 4, 'exam in 28d → 4-week roadmap');
  assert(plan.roadmap[0].focusTopic === 'Linear Functions', 'roadmap week 1 targets highest-impact topic');
  const noExam = sampleState(); noExam.student.examDate = null;
  const p2 = SP.buildStudyPlan(noExam);
  assert(p2.examCountdown === null && p2.roadmap.length === 4, 'no exam date → null countdown + default horizon');
}

/* ── 10. Determinism ──────────────────────────────────────────────────────── */
assert(JSON.stringify(SP.buildStudyPlan(sampleState())) === JSON.stringify(SP.buildStudyPlan(sampleState())),
  'identical inputs → identical plan');

/* ── 11. Empty / brand-new student ────────────────────────────────────────── */
{
  let plan;
  try { plan = SP.buildStudyPlan({ now: NOW, student: { name: 'New', examType: 'EST' } }); }
  catch (e) { fail('empty state threw: ' + e.message); plan = null; }
  if (plan) {
    assert(plan.priorities.length === 0, 'no data → no priorities');
    assert(plan.today.tasks.length === 1 && plan.today.tasks[0].type === 'diagnostic', 'day one is a diagnostic first step');
    assert(plan.week.days.length === 7, 'still a full 7-day scaffold');
  }
}

/* ── 12. Regeneration triggers ────────────────────────────────────────────── */
{
  const s0 = sampleState();
  const sig = SP.planSignature(s0);
  assert(SP.detectRegenerationTriggers(sig, s0).shouldRegenerate === false, 'unchanged, same-day state → no regen');

  const later = sampleState(); later.now = NOW + 7 * DAY + 1000;
  assert(codes(SP.detectRegenerationTriggers(sig, later)).includes('week_elapsed'), 'a full week elapsed → regen');
  const sixDays = sampleState(); sixDays.now = NOW + 6 * DAY;
  assert(!codes(SP.detectRegenerationTriggers(sig, sixDays)).includes('week_elapsed'), '< 7 days → no week_elapsed');

  const withMock = sampleState();
  withMock.mocks = withMock.mocks.concat([{ id: 'm2', completedAt: inDays(0), weakLessons: [] }]);
  assert(codes(SP.detectRegenerationTriggers(sig, withMock)).includes('mock_completed'), 'new mock → regen');

  const withFocus = sampleState();
  withFocus.focus[0].lessons[1].status = 'DONE';
  assert(codes(SP.detectRegenerationTriggers(sig, withFocus)).includes('focus_completed'), 'focus completion → regen');

  const withNewWeak = sampleState();
  withNewWeak.weakness = withNewWeak.weakness.concat([
    { topic: 'Statistics', subtopic: 'Standard Deviation', masteryScore: 28, severityBand: 'critical', lastUpdatedAt: inDays(0) }]);
  assert(codes(SP.detectRegenerationTriggers(sig, withNewWeak)).includes('new_major_weakness'), 'new major weakness → regen');

  const improved = sampleState();
  improved.weakness = improved.weakness.map((w) => w.topic === 'Probability' ? Object.assign({}, w, { masteryScore: 95 }) : w);
  assert(codes(SP.detectRegenerationTriggers(sig, improved)).includes('significant_improvement'), 'big mastery jump → regen');
}

/* ── Demo / result ────────────────────────────────────────────────────────── */
if (process.argv.includes('--demo')) {
  const plan = SP.buildStudyPlan(sampleState());
  console.log('\n──────── PRIORITIES (impact-ranked) ────────');
  plan.priorities.slice(0, 4).forEach((p) =>
    console.log(`  ${p.rank}. ${p.label}  [impact ${p.impactScore}, exam-importance ${p.examImportance}]`));
  console.log('\n──────── SAMPLE 7-DAY PLAN (no times shown) ────────');
  plan.week.days.forEach((d) => {
    if (!d.isStudyDay) { console.log(`\n${d.day} — ${d.note}`); return; }
    console.log(`\n${d.day}`);
    d.tasks.forEach((t) => console.log('  • ' + t.label));
  });
  console.log('\n──────── FULL JSON ────────');
  console.log(JSON.stringify(plan, null, 2));
}

if (failures) {
  console.error(`\nstudy-planner: ${failures} check(s) FAILED`);
  process.exit(1);
}
console.log('\nstudy-planner: all checks passed');
