#!/usr/bin/env node
/**
 * validate-study-planner-client.mjs — guards for the Phase 2 platform adapter
 * (study-planner-client.js). Exit non-zero on any failure (CI gate).
 *
 * Uses a mock Supabase client that mimics the chainable query builder, so the
 * mapping / fault-tolerance / persistence logic is tested without a database.
 * Also runs a full gather → StudyPlanner.buildStudyPlan round-trip.
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const SP = require(resolve(root, 'supabase/functions/_shared/study-planner.core.js'));
const C = require(resolve(root, 'study-planner-client.js'));

let failures = 0;
const fail = (m) => { console.error('  ✗', m); failures++; };
const ok = (m) => console.log('  ✓', m);
const assert = (cond, m) => (cond ? ok(m) : fail(m));

/* ── Mock Supabase client ─────────────────────────────────────────────────────
   A thenable, chainable builder per `from(table)`. Chain methods return `this`;
   awaiting resolves to { data:rows, error }. single()/maybeSingle() resolve to
   the first row. insert()/update() are recorded on `__calls`. errorTables force
   a query error for a given table (to test fault tolerance). */
function makeSb(tables, opts) {
  opts = opts || {};
  const errorTables = opts.errorTables || {};
  const calls = { inserts: [], updates: [] };
  function from(table) {
    const data = (tables[table] || []).slice();
    let inserted = null;
    const err = errorTables[table] ? { message: table + ' forced error' } : null;
    const b = {
      select() { return b; }, eq() { return b; }, neq() { return b; }, in() { return b; },
      is() { return b; }, gte() { return b; }, lte() { return b; }, order() { return b; }, limit() { return b; },
      update(vals) { calls.updates.push({ table, vals }); return b; },
      insert(vals) { inserted = vals; calls.inserts.push({ table, vals }); return b; },
      single() { return Promise.resolve(err ? { data: null, error: err } : { data: inserted ? { id: 'new-row-id' } : (data[0] || null), error: null }); },
      maybeSingle() { return Promise.resolve(err ? { data: null, error: err } : { data: data[0] || null, error: null }); },
      then(res, rej) { return Promise.resolve(err ? { data: null, error: err } : { data, error: null }).then(res, rej); },
    };
    return b;
  }
  return { from, __calls: calls };
}

function fixtures() {
  return {
    profiles: [{ id: 'u1', full_name: 'Nour Hassan', exam_type: 'SAT', exam_date: '2026-08-16',
      target_score: 1400, xp: 640, rank_name: 'Scholar', current_streak: 4 }],
    weakness_reports: [
      { topic: 'Linear Functions', subtopic: 'Slope', mastery_score: 22, severity_band: 'critical',
        trend: 'declining', recent7_count: 5, recent14_count: 9, priority_rank: 1, total_signals: 14,
        weakness_score: 80, last_updated: '2026-07-18T00:00:00Z' },
      { topic: 'Circle', subtopic: 'Arc Length', mastery_score: 48, severity_band: 'high',
        trend: 'stable', recent7_count: 2, priority_rank: 2, total_signals: 7, last_updated: '2026-07-16T00:00:00Z' },
    ],
    focus_plans: [{ id: 'fp-lin', title: 'Linear Functions', status: 'ACTIVE', dominant_signal: 'exam_confused' }],
    focus_tasks: [
      { id: 'l2', plan_id: 'fp-lin', topic: 'Linear Functions', subtopic: 'Slope', task_title: 'Round 2', priority: 1, estimated_minutes: 20, status: 'IN_PROGRESS' },
      { id: 'l3', plan_id: 'fp-lin', topic: 'Linear Functions', subtopic: 'Slope', task_title: 'Round 3', priority: 2, estimated_minutes: 25, status: 'NOT_STARTED' },
    ],
    exam_practice_sessions: [{ id: 'm1', score: 1180, correct: 30, wrong: 14, omitted: 0, total_questions: 44, created_at: '2026-07-17T00:00:00Z' }],
    exam_mistakes: [
      { topic: 'Linear Functions', subtopic: 'Slope', session_id: 'm1' },
      { topic: 'Linear Functions', subtopic: 'Slope', session_id: 'm1' },
      { topic: 'Circle', subtopic: 'Arc Length', session_id: 'm1' },
    ],
    weakness_signals: [
      { topic: 'Linear Functions', subtopic: 'Slope', signal_type: 'explanation_repeated' },
      { topic: 'Linear Functions', subtopic: 'Slope', signal_type: 'explanation_repeated' },
      { topic: 'Linear Functions', subtopic: 'Slope', signal_type: 'repeated' },
    ],
  };
}

const NOW = Date.parse('2026-07-19T12:00:00Z');
const AVAIL = { hoursPerDay: 2, studyDays: [0, 1, 2, 3, 4] };

(async function run() {
  /* ── 1. gather maps every source correctly ──────────────────────────────── */
  {
    const sb = makeSb(fixtures());
    const st = await C.gatherStudentState(sb, 'u1', { now: NOW, availability: AVAIL });

    assert(st.student.name === 'Nour' && st.student.examType === 'SAT', 'profile → student (first name, exam type)');
    assert(st.student.examDate === '2026-08-16' && st.student.xp === 640 && st.student.currentStreak === 4, 'profile → exam date / xp / streak');
    assert(st.student.availability === AVAIL, 'availability threaded from opts');

    assert(st.weakness.length === 2 && st.weakness[0].topic === 'Linear Functions', 'weakness_reports → weakness[]');
    assert(st.weakness[0].masteryScore === 22 && st.weakness[0].severityBand === 'critical' && st.weakness[0].recent7 === 5, 'weakness columns mapped');
    assert(st.weakness[0].priorityRank === 1 && st.weakness[0].lastUpdatedAt === '2026-07-18T00:00:00Z', 'priority rank + last_updated mapped');

    assert(st.focus.length === 1 && st.focus[0].lessons.length === 2, 'focus_plans + focus_tasks → focus[] with units');
    assert(st.focus[0].lessons[0].title === 'Round 2' && st.focus[0].lessons[0].order === 1 && st.focus[0].lessons[0].status === 'IN_PROGRESS', 'task_title/priority/status mapped, ordered');

    assert(st.mocks.length === 1 && st.mocks[0].totalQuestions === 44, 'exam_practice_sessions → mocks[]');
    const wl = st.mocks[0].weakLessons;
    const lin = wl.find((w) => w.topic === 'Linear Functions');
    assert(lin && lin.missCount === 2, 'exam_mistakes aggregated per concept (Linear ×2)');
    assert(wl.find((w) => w.topic === 'Circle').missCount === 1, 'exam_mistakes aggregated (Circle ×1)');

    const tut = st.tutor.topics.find((t) => t.topic === 'Linear Functions');
    assert(tut && tut.explanationRepeats === 2 && tut.askCount === 3, 'weakness_signals(AI_CHAT) → tutor confusion');
  }

  /* ── 2. gather → engine round-trip produces a valid plan ─────────────────── */
  {
    const sb = makeSb(fixtures());
    const st = await C.gatherStudentState(sb, 'u1', { now: NOW, availability: AVAIL });
    const plan = SP.buildStudyPlan(st);
    assert(plan.week.days.length === 7, 'end-to-end: 7-day plan built from gathered data');
    assert(plan.priorities[0].topic === 'Linear Functions', 'end-to-end: Linear ranks #1 from real-shaped data');
    const focusTask = plan.week.days[0].tasks.find((t) => t.type === 'focus_lesson');
    assert(focusTask && /Linear Functions → Round 2/.test(focusTask.label), 'end-to-end: day 1 anchors the next Focus unit');
  }

  /* ── 3. Fault tolerance — a failing table degrades, never throws ─────────── */
  {
    const sb = makeSb(fixtures(), { errorTables: { weakness_reports: true, exam_mistakes: true } });
    let st;
    try { st = await C.gatherStudentState(sb, 'u1', { now: NOW, availability: AVAIL }); }
    catch (e) { fail('gather threw on table error: ' + e.message); st = null; }
    if (st) {
      assert(st.weakness.length === 0, 'errored weakness_reports → empty (no throw)');
      assert(st.focus.length === 1, 'other sources still load when one errors');
      const plan = SP.buildStudyPlan(st);
      assert(plan.week.days.length === 7, 'plan still generated from partial data');
    }
  }

  /* ── 4. Missing profile still yields a usable state ──────────────────────── */
  {
    const sb = makeSb({}, {}); // every table empty
    const st = await C.gatherStudentState(sb, 'u1', { now: NOW });
    assert(st.student.name === 'Student' && st.student.examType === 'SAT', 'empty profile → safe defaults');
    const plan = SP.buildStudyPlan(st);
    assert(plan.today.tasks[0].type === 'diagnostic', 'cold-start diagnostic when no data at all');
  }

  /* ── 5. saveStudyPlan supersedes + inserts ───────────────────────────────── */
  {
    const sb = makeSb({ study_plans: [] });
    const plan = SP.buildStudyPlan(await C.gatherStudentState(makeSb(fixtures()), 'u1', { now: NOW, availability: AVAIL }));
    const sig = SP.planSignature(await C.gatherStudentState(makeSb(fixtures()), 'u1', { now: NOW, availability: AVAIL }));
    const res = await C.saveStudyPlan(sb, 'u1', plan, sig, 20);
    assert(res.persisted === true, 'saveStudyPlan reports persisted');
    const upd = sb.__calls.updates.find((u) => u.table === 'study_plans');
    assert(upd && 'superseded_at' in upd.vals, 'previous plan superseded before insert');
    const ins = sb.__calls.inserts.find((i) => i.table === 'study_plans');
    assert(ins && ins.vals.credits_charged === 20 && ins.vals.plan_json.version, 'new plan inserted with credits + json + signature');
    assert(ins.vals.plan_signature && typeof ins.vals.plan_signature.generatedAt === 'number', 'signature stored for regen checks');
  }

  /* ── 6. saveStudyPlan never throws when the table is missing ──────────────── */
  {
    const sb = makeSb({}, { errorTables: { study_plans: true } });
    let res;
    try { res = await C.saveStudyPlan(sb, 'u1', { version: 'x' }, {}, 20); }
    catch (e) { fail('saveStudyPlan threw: ' + e.message); res = null; }
    assert(res && res.persisted === false, 'missing study_plans table → persisted:false, no throw (pre-migration safe)');
  }

  /* ── 7. getLatestStudyPlan returns the current plan ──────────────────────── */
  {
    const sb = makeSb({ study_plans: [{ id: 'sp1', plan_json: { version: 'study-planner-v1', week: {} }, plan_signature: { generatedAt: NOW }, generated_at: '2026-07-19T12:00:00Z' }] });
    const latest = await C.getLatestStudyPlan(sb, 'u1');
    assert(latest && latest.plan_json && latest.plan_json.version === 'study-planner-v1', 'getLatestStudyPlan returns stored plan');
    const none = await C.getLatestStudyPlan(makeSb({ study_plans: [] }), 'u1');
    assert(none === null, 'no plan → null');
  }

  if (failures) { console.error(`\nstudy-planner-client: ${failures} check(s) FAILED`); process.exit(1); }
  console.log('\nstudy-planner-client: all checks passed');
})().catch((e) => { console.error('unexpected:', e); process.exit(1); });
