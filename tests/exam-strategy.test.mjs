// The Zero Block Strategy, as it ships inside the ai-tutor system prompt.
//
// This is a declared core teaching methodology, not incidental prompt copy —
// it is the primary reference Zero must reach for on any exam-strategy, time
// management or "how do I approach the exam" turn. It had drifted from the
// official document: the 90-Second Rule, the "Maximize Score Per Minute"
// principle, the Golden Rule and the guard against volunteering the strategy
// during ordinary math explanations were all absent from the shipped text.
//
// A prompt rule cannot be unit-tested for model compliance — only a live
// request proves Zero follows it. What IS testable, and what this suite does:
//
//   1. the required elements are present in the bytes that ship, so a future
//      edit that drops one fails here instead of silently in production;
//   2. the block table stays arithmetically sound — the per-exam blocks cover
//      every question exactly once, with no gap and no overlap;
//   3. the table agrees with EXAM_FACTS, which is the authoritative source for
//      question counts and timing. These are two hand-maintained copies of the
//      same numbers ~40 lines apart in one file, which is exactly the shape
//      that drifts. EXAM_FACTS is declared authoritative, so it wins.
//
// Both blocks are sliced out of the real source; `slice` throws if a marker
// stops matching, so a restructure fails loudly rather than passing vacuously.
import { suite } from './_assert.mjs';
import { read, slice } from './_source.mjs';

const t = suite('exam-strategy');
const SRC = read('supabase/functions/ai-tutor/index.ts');

const FACTS = slice(SRC, 'const EXAM_FACTS = `', 'const STUDENT_PROFILE_BLOCK', 'EXAM_FACTS');
const STRAT = slice(SRC, 'const examStrategyForType = `',
                    '// Normal (non-hint) system prompt', 'exam strategy block');

// ── 1. The methodology's required elements ────────────────────────────────
// Each entry is a thing the official document declares, paired with what its
// absence would cost a student.

t.section('Core principle — the objective the whole method serves');
// At least twice: the section heading AND the prose that explains it. A
// heading on its own is a slogan — the model needs the statement of what it
// means (points come from questions the student CAN solve).
t.ok('names "Score Per Minute" as the objective, in a heading and in prose',
  (STRAT.match(/Score Per Minute/gi) || []).length >= 2);
t.ok('states the goal is NOT to solve in strict numerical order',
  /NOT to solve[\s\S]{0,120}Question 1/i.test(STRAT));

t.section('The 90-Second Rule — the only step a student can act on mid-question');
// "Mark it and skip it" is useless without a trigger: "solvable but slow" and
// "hard or confusing" are labels you can only apply after you have already
// spent the time. 90 seconds is the gate that stops the bleeding.
t.ok('states the ~90 second threshold', /90[- ]?[Ss]econd|90 seconds/.test(STRAT));
t.ok('gives the threshold in minutes too (1½ min)', /1½|1\.5 min|one and a half/i.test(STRAT));
t.ok('conditions on lack of meaningful progress, not on elapsed time alone',
  /meaningful progress/i.test(STRAT));
t.ok('prescribes mark → skip → move on', /Mark it\.[\s\S]{0,60}Skip it/i.test(STRAT));

t.section('The four in-block steps');
for (const [n, label] of [[1, 'Fast & Confident'], [2, 'The 90-Second Rule'],
                          [3, 'Solvable but Slow'], [4, 'Hard or Confusing']]) {
  t.ok(`Step ${n} — ${label}`, STRAT.includes(`**Step ${n} — ${label}`));
}
t.ok('"confident" is defined as easy FOR YOU, not globally easy',
  /easy FOR YOU, not globally easy/.test(STRAT));

t.section('The three phases and the two returns');
t.ok('PHASE 1 — set up blocks', /PHASE 1 — SET UP YOUR BLOCKS/.test(STRAT));
t.ok('PHASE 2 — inside each block', /PHASE 2 — INSIDE EACH BLOCK/.test(STRAT));
t.ok('PHASE 3 — after all blocks', /PHASE 3 — AFTER ALL BLOCKS/.test(STRAT));
// The returns must point at the medium pile first and the hard pile second.
// When the in-block steps were renumbered 3 -> 4, these references had to move
// with them; a stale number here sends the student to the wrong pile.
const firstReturn  = /\*\*First Return:\*\*[^\n]*Step (\d)/.exec(STRAT);
const secondReturn = /\*\*Second Return:\*\*[^\n]*Step (\d)/.exec(STRAT);
t.ok('First Return names a step', !!firstReturn);
t.ok('Second Return names a step', !!secondReturn);
t.is('First Return goes to the medium-time pile (Step 3)', firstReturn?.[1], '3');
t.is('Second Return goes to the hardest pile (Step 4)', secondReturn?.[1], '4');

t.section('Trigger rules — when Zero reaches for this');
for (const trigger of ['exam strategy', 'time management', 'what to do when stuck',
                       'how to finish the exam on time', 'how to approach an exam']) {
  t.ok(`listed trigger: "${trigger}"`, STRAT.includes(trigger));
}
// The negative guard is half the rule. Without it the strategy is a hammer:
// every "explain this quadratic" turn risks a block plan bolted onto the
// answer, which is noise the student did not ask for.
t.ok('guards against volunteering it during ordinary math explanations',
  /Do NOT introduce this strategy during ordinary math explanations/.test(STRAT));

t.section('What a student remembers on exam day');
t.ok('Golden Rule is present',
  /Never let one difficult question steal the time needed to answer several easier ones/.test(STRAT));
t.ok('Official Zero Principle ordering is spelled out',
  /Fast & Confident[\s\S]{0,40}First[\s\S]{0,60}Medium-Time[\s\S]{0,40}Second[\s\S]{0,60}Hard[\s\S]{0,40}Last/i.test(STRAT));
t.ok('flexibility rule — teach the principle, adapt the numbers',
  /FLEXIBILITY RULE/.test(STRAT) && /guidelines, not fixed rules/.test(STRAT));
t.ok('presentation is pinned to a structured action plan, not a paragraph',
  /structured action plan, NOT as a paragraph/.test(STRAT));

// ── 2. The block table is arithmetically sound ────────────────────────────
// Blocks that skip a question, or cover one twice, would have a student
// mis-plan the exam. Parse the table and check the ranges tile 1..N exactly.

t.section('Block ranges tile every question exactly once');
const rows = [...STRAT.matchAll(/^\| ([A-Z][^|]*?) \| (\d+) Q \/ ([^|]+?) \| ([^|]+) \|$/gm)]
  .map(m => ({ exam: m[1].trim(), total: +m[2], per: m[3].trim(), blocks: m[4] }));

t.is('all four exams are in the table', rows.length, 4);

for (const row of rows) {
  const ranges = [...row.blocks.matchAll(/(\d+)–(\d+)/g)].map(m => [+m[1], +m[2]]);
  const contiguous = ranges.every(([lo, hi], i) =>
    lo <= hi && (i === 0 ? lo === 1 : lo === ranges[i - 1][1] + 1));
  const covered = ranges.reduce((n, [lo, hi]) => n + (hi - lo + 1), 0);

  t.ok(`${row.exam}: has blocks`, ranges.length > 0);
  t.ok(`${row.exam}: starts at 1 and each block follows the last`, contiguous);
  t.is(`${row.exam}: blocks cover all ${row.total} questions`, covered, row.total);
  t.is(`${row.exam}: last block ends at ${row.total}`, ranges.at(-1)?.[1], row.total);
}

// ── 3. The table agrees with EXAM_FACTS ───────────────────────────────────
// EXAM_FACTS is declared authoritative ("NEVER CONTRADICT THESE") and sits in
// the same prompt. If these disagree, the prompt contradicts itself and the
// model picks a side — the exact self-contradiction class that produced v93.

t.section('Question counts match the authoritative EXAM_FACTS');
const factCount = (heading, re) => {
  const section = FACTS.slice(FACTS.indexOf(`### ${heading}`));
  return +(re.exec(section)?.[1] ?? NaN);
};
const EXPECTED = {
  'EST Math 1': factCount('EST Math 1',        /- Questions: (\d+)/),
  'EST Math 2': factCount('EST Math 2 Level 1', /- Questions: (\d+)/),
  'ACT Math':   factCount('ACT Math',          /- Questions: (\d+)/),
  'SAT Math':   factCount('Digital SAT Math',  /- Each module: \d+ minutes, (\d+) questions/),
};

for (const [exam, expected] of Object.entries(EXPECTED)) {
  const row = rows.find(r => r.exam === exam);
  t.ok(`${exam}: present in the strategy table`, !!row);
  t.is(`${exam}: ${expected} questions per EXAM_FACTS`, row?.total, expected);
}
t.ok('SAT row is scoped per module, not per test',
  rows.find(r => r.exam === 'SAT Math')?.per === 'module');
t.ok('SAT row says the method runs independently inside each module',
  /independently inside EACH module/i.test(rows.find(r => r.exam === 'SAT Math')?.blocks ?? ''));

t.section('Timing matches EXAM_FACTS where the table states it');
for (const [exam, heading] of [['EST Math 1', 'EST Math 1'], ['EST Math 2', 'EST Math 2 Level 1'],
                               ['ACT Math', 'ACT Math']]) {
  const row = rows.find(r => r.exam === exam);
  const expected = factCount(heading, /- Time: (\d+) minutes/);
  t.is(`${exam}: ${expected} min per EXAM_FACTS`, +(/(\d+) min/.exec(row?.per ?? '')?.[1]), expected);
}

// ── 4. Still wired into the prompt that students actually get ─────────────
// Everything above tests a string. None of it matters if the string is never
// interpolated — the block would be dead code that every assertion still passes.

t.section('The block reaches the model');
t.ok('interpolated into NORMAL_SYSTEM_PROMPT', /\$\{examStrategyForType\}/.test(SRC));
t.ok('the student\'s own exam is named in the block',
  /The student's exam is \*\*\$\{examType\}\*\*/.test(STRAT));
t.ok('NORMAL_SYSTEM_PROMPT is what non-hint turns use',
  /const systemPrompt = hintMode \? HINT_SYSTEM_PROMPT : NORMAL_SYSTEM_PROMPT;/.test(SRC));

t.done();
