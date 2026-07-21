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
 *   2. Prioritization — severity, tutor confusion, and mock misses raise rank.
 *   3. Focus sequence — next lesson is the first REMAINING lesson, order kept.
 *   4. Availability   — today's tasks respect hoursPerDay; weekly minutes math.
 *   5. Roadmap        — exam date sets the horizon; high-impact topic is week 1.
 *   6. Determinism    — identical inputs → byte-identical plan JSON.
 *   7. Empty state    — a brand-new student gets a safe diagnostic plan, no throw.
 *   8. Triggers       — new mock / focus done / new weakness / improvement fire.
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const SP = require(resolve(root, 'supabase/functions/_shared/study-planner.core.js'));

let failures = 0;
const fail = (m) => { console.error('  ✗', m); failures++; };
const ok = (m) => console.log('  ✓', m);
const assert = (cond, m) => (cond ? ok(m) : fail(m));

/* Fixed clock so every run is deterministic. 2026-07-21T12:00:00Z. */
const NOW = Date.parse('2026-07-21T12:00:00Z');
const inDays = (n) => new Date(NOW + n * 86400000).toISOString();

/* A realistic, multi-source student state. */
function sampleState() {
  return {
    now: NOW,
    student: {
      id: 'stu-1', name: 'Nour Hassan', examType: 'SAT',
      examDate: inDays(28), targetScore: 1400, xp: 640, rank: 'Scholar',
      currentStreak: 4,
      availability: { hoursPerDay: 2, studyDays: [0, 1, 2, 3, 4] },
    },
    weakness: [
      { topic: 'Linear Functions', subtopic: 'Slope', masteryScore: 22, severityBand: 'critical',
        trend: 'declining', recent7: 5, recent14: 9, priorityRank: 1, totalSignals: 14,
        lastUpdatedAt: inDays(-1) },
      { topic: 'Circle', subtopic: 'Arc Length', masteryScore: 48, severityBand: 'high',
        trend: 'stable', recent7: 2, recent14: 4, priorityRank: 2, totalSignals: 7,
        lastUpdatedAt: inDays(-3) },
      { topic: 'Probability', subtopic: 'Compound Events', masteryScore: 74, severityBand: 'low',
        trend: 'improving', recent7: 0, recent14: 1, priorityRank: 3, totalSignals: 6,
        lastUpdatedAt: inDays(-5) },
    ],
    focus: [
      { id: 'fp-lin', title: 'Linear Functions', status: 'ACTIVE', topic: 'Linear Functions', subtopic: 'Slope',
        dominantSignal: 'exam_confused',
        lessons: [
          { id: 'l1', title: 'Lesson 1', order: 0, status: 'DONE', estimatedMinutes: 20 },
          { id: 'l2', title: 'Lesson 2', order: 1, status: 'IN_PROGRESS', estimatedMinutes: 20 },
          { id: 'l3', title: 'Lesson 3', order: 2, status: 'NOT_STARTED', estimatedMinutes: 25 },
        ] },
      { id: 'fp-cir', title: 'Circle', status: 'ACTIVE', topic: 'Circle', subtopic: 'Arc Length',
        lessons: [
          { id: 'c1', title: 'Lesson 1', order: 0, status: 'NOT_STARTED', estimatedMinutes: 20 },
          { id: 'c2', title: 'Lesson 2', order: 1, status: 'NOT_STARTED', estimatedMinutes: 20 },
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
  assert(Array.isArray(plan.priorities) && plan.priorities.length >= 3, 'priorities present');
  assert(plan.today && Array.isArray(plan.today.tasks) && plan.today.tasks.length > 0, 'today has tasks');
  assert(plan.week && Array.isArray(plan.week.goals) && plan.week.goals.length > 0, 'week has goals');
  assert(Array.isArray(plan.roadmap) && plan.roadmap.length > 0, 'roadmap present');
  assert(Array.isArray(plan.rationale) && plan.rationale.length > 0, 'rationale present');
  assert(plan.meta && plan.meta.creditCost === 20, 'credit cost is 20');
  assert(plan.meta.creditCost === SP.STUDY_PLAN_CREDIT_COST, 'credit cost matches exported constant');
}

/* ── 2. Prioritization ────────────────────────────────────────────────────── */
{
  const plan = SP.buildStudyPlan(sampleState());
  const top = plan.priorities[0];
  assert(top.topic === 'Linear Functions' && top.subtopic === 'Slope',
    'critical + confusion + mock misses → Linear/Slope ranks #1');
  const probIdx = plan.priorities.findIndex((p) => p.topic === 'Probability');
  assert(probIdx === plan.priorities.length - 1 || probIdx > 0,
    'improving low-severity Probability ranks below the critical gap');

  // Tutor confusion must move the needle: same weakness, extra re-explains ranks higher.
  const base = { now: NOW, student: { examType: 'SAT' },
    weakness: [
      { topic: 'A', subtopic: 'x', masteryScore: 55, severityBand: 'high' },
      { topic: 'B', subtopic: 'y', masteryScore: 55, severityBand: 'high' },
    ], tutor: { topics: [{ topic: 'B', subtopic: 'y', explanationRepeats: 4, deepExplains: 2 }] } };
  const pr = SP._prioritize(base);
  const A = pr.find((p) => p.topic === 'A'), B = pr.find((p) => p.topic === 'B');
  assert(B.impactScore > A.impactScore, 'repeated confusion raises impact score');
  assert(B.reasons.some((r) => /re-explain/i.test(r)), 'confusion reason surfaced');

  // Mock misses raise impact on an otherwise-equal concept.
  const mk = { now: NOW, student: { examType: 'SAT' },
    weakness: [
      { topic: 'C', subtopic: 'z', masteryScore: 60, severityBand: 'medium' },
      { topic: 'D', subtopic: 'w', masteryScore: 60, severityBand: 'medium' },
    ], mocks: [{ completedAt: inDays(-1), weakLessons: [{ topic: 'D', subtopic: 'w', missCount: 2 }] }] };
  const pr2 = SP._prioritize(mk);
  assert(pr2.find((p) => p.topic === 'D').impactScore > pr2.find((p) => p.topic === 'C').impactScore,
    'mock misses raise impact score');
}

/* ── 3. Focus Practice sequencing ─────────────────────────────────────────── */
{
  const plan = SP.buildStudyPlan(sampleState());
  const lin = plan.priorities.find((p) => p.topic === 'Linear Functions');
  assert(lin.hasFocusPlan, 'Linear priority linked to its Focus plan');
  assert(lin.remainingLessons.length === 2, 'DONE lesson excluded from remaining');
  assert(lin.remainingLessons[0].id === 'l2', 'next remaining lesson is Lesson 2 (order preserved)');
  assert(lin.remainingLessons[1].id === 'l3', 'lesson order kept, never re-invented');
  const focusTask = plan.today.tasks.find((t) => t.type === 'focus_lesson');
  assert(focusTask && /Lesson 2/.test(focusTask.label), 'today schedules the first REMAINING lesson');
  assert(lin.progressPct === 33, 'progress percent derived from Focus plan (1/3 done)');
}

/* ── 4. Availability ──────────────────────────────────────────────────────── */
{
  const plan = SP.buildStudyPlan(sampleState());
  assert(plan.today.estimatedMinutes <= 2 * 60, 'today fits within 2h/day budget');
  assert(plan.availability.weeklyMinutes === 2 * 60 * 5, 'weekly minutes = hours*days');

  // A tiny budget still yields at least one actionable task and stays bounded.
  const tight = sampleState();
  tight.student.availability = { hoursPerDay: 0.5, studyDays: [1, 3, 5] };
  const p2 = SP.buildStudyPlan(tight);
  assert(p2.today.tasks.length >= 1, 'small budget still produces a task');
  assert(p2.availability.weeklyMinutes === 30 * 3, 'weekly minutes respects 3 study days');
}

/* ── 5. Roadmap ───────────────────────────────────────────────────────────── */
{
  const plan = SP.buildStudyPlan(sampleState());
  assert(plan.examCountdown && plan.examCountdown.daysRemaining === 28, 'exam countdown computed');
  assert(plan.roadmap.length === 4, 'exam in 28d → 4-week roadmap');
  assert(plan.roadmap[0].focusTopic === 'Linear Functions', 'week 1 targets highest-impact topic');
  const topics = plan.roadmap.filter((w) => !w.isConsolidation).map((w) => w.focusTopic);
  assert(new Set(topics).size === topics.length, 'roadmap weeks target distinct topics');

  // No exam date → default horizon.
  const noExam = sampleState(); noExam.student.examDate = null;
  const p2 = SP.buildStudyPlan(noExam);
  assert(p2.examCountdown === null, 'no exam date → null countdown');
  assert(p2.roadmap.length === 4, 'no exam date → default 4-week horizon');
}

/* ── 6. Determinism ───────────────────────────────────────────────────────── */
{
  const a = JSON.stringify(SP.buildStudyPlan(sampleState()));
  const b = JSON.stringify(SP.buildStudyPlan(sampleState()));
  assert(a === b, 'identical inputs → identical plan');
}

/* ── 7. Empty / brand-new student ─────────────────────────────────────────── */
{
  let plan;
  try { plan = SP.buildStudyPlan({ now: NOW, student: { name: 'New', examType: 'EST' } }); }
  catch (e) { fail('empty state threw: ' + e.message); plan = null; }
  if (plan) {
    assert(plan.priorities.length === 0, 'no data → no priorities');
    assert(plan.today.tasks.length === 1 && plan.today.tasks[0].type === 'diagnostic',
      'brand-new student gets a diagnostic first step');
    assert(plan.rationale.some((r) => /diagnostic|personalize/i.test(r)), 'rationale explains the cold start');
  }
}

/* ── 8. Regeneration triggers ─────────────────────────────────────────────── */
{
  const s0 = sampleState();
  const sig = SP.planSignature(s0);
  assert(SP.detectRegenerationTriggers(sig, s0).shouldRegenerate === false, 'unchanged state → no regen');

  const withMock = sampleState();
  withMock.mocks = withMock.mocks.concat([{ id: 'm2', completedAt: inDays(0), weakLessons: [] }]);
  assert(codes(SP.detectRegenerationTriggers(sig, withMock)).includes('mock_completed'), 'new mock triggers regen');

  const withFocus = sampleState();
  withFocus.focus[0].lessons[1].status = 'DONE';
  assert(codes(SP.detectRegenerationTriggers(sig, withFocus)).includes('focus_completed'), 'focus completion triggers regen');

  const withNewWeak = sampleState();
  withNewWeak.weakness = withNewWeak.weakness.concat([
    { topic: 'Statistics', subtopic: 'Standard Deviation', masteryScore: 28, severityBand: 'critical', lastUpdatedAt: inDays(0) },
  ]);
  assert(codes(SP.detectRegenerationTriggers(sig, withNewWeak)).includes('new_major_weakness'), 'new major weakness triggers regen');

  const improved = sampleState();
  improved.weakness = improved.weakness.map((w) =>
    w.topic === 'Probability' ? Object.assign({}, w, { masteryScore: 95 }) : w);
  assert(codes(SP.detectRegenerationTriggers(sig, improved)).includes('significant_improvement'), 'big mastery jump triggers regen');
}

function codes(res) { return res.reasons.map((r) => r.code); }

/* ── Result ───────────────────────────────────────────────────────────────── */
if (process.argv.includes('--demo')) {
  console.log('\n──────── SAMPLE PLAN ────────');
  console.log(JSON.stringify(SP.buildStudyPlan(sampleState()), null, 2));
}

if (failures) {
  console.error(`\nstudy-planner: ${failures} check(s) FAILED`);
  process.exit(1);
}
console.log('\nstudy-planner: all checks passed');
