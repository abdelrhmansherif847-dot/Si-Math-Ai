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
import { read, slice, importTS } from './_source.mjs';

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
// The rule is a decision gate, not a stopwatch. Read as a per-question budget
// it becomes the opposite of the method — a student rushing every question to
// beat 90 seconds is not maximizing Score Per Minute, they are guessing faster.
t.ok('states explicitly that it is a decision rule, not a time limit',
  /DECISION rule, NOT a per-question time limit/.test(STRAT));
t.ok('denies the "every question in 90 seconds" reading outright',
  /does NOT mean every question must be solved in 90 seconds/.test(STRAT));
t.ok('permits spending longer while progress is being made',
  /If you ARE making progress, keep going/.test(STRAT));
t.ok('acknowledges time per question varies by student and exam',
  /varies by student and by exam/.test(STRAT));

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
// v95: the flexibility rule is the sentence that licensed 6-question blocks.
// It must be scoped to unlisted exams BEFORE it grants anything, and it must
// forbid adapting a listed exam in as many words.
t.ok('flexibility rule is scoped to unlisted exams in its own heading',
  /FLEXIBILITY RULE — applies ONLY to an exam not in the table/.test(STRAT));
t.ok('forbids adapting, rounding, re-splitting or inventing a listed size',
  /Never adapt, round, re-split, or invent a block size/.test(STRAT));
t.ok('names the two tempting reasons to deviate and refuses both',
  /not to fit the time remaining, not to make the sections feel more manageable/.test(STRAT));
t.ok('separates the principle from the numbers',
  /The block \*numbers\* are not the principle/.test(STRAT));
t.ok('the v94 sentence that licensed arbitrary sizes is gone',
  !/guidelines, not fixed rules/.test(STRAT));
t.ok('presentation is pinned to a structured action plan, not a paragraph',
  /structured action plan, NOT as a paragraph/.test(STRAT));


// ── 2. The block plans, executed ──────────────────────────────────────────
// The table used to be literal markdown and the model was told to "use the
// correct row". Both halves failed: exam_type is 'EST', which matches two rows.
// Now the lists are computed here and handed over finished, so these tests run
// the real generator rather than reading text.

const gen = slice(SRC, '// ── Zero Block Strategy — block plans (v95)',
                  '// ── Phase 1 DifficultyDetector', 'block plan generator');
const { BLOCK_SIZE, ALL_BLOCK_PLANS, blockRanges, blockPlansFor, blockPlanRow,
        studentBlockDirective, estLevelFromConversation } = await importTS(gen,
  ['BLOCK_SIZE', 'ALL_BLOCK_PLANS', 'blockRanges', 'blockPlansFor', 'blockPlanRow',
   'studentBlockDirective', 'estLevelFromConversation']);

t.section('Block ranges tile every question exactly once');
t.is('the block size is 10', BLOCK_SIZE, 10);
for (const p of ALL_BLOCK_PLANS) {
  const r = blockRanges(p.questions).map(x => x.split('–').map(Number));
  const contiguous = r.every(([lo, hi], i) =>
    lo <= hi && (i === 0 ? lo === 1 : lo === r[i - 1][1] + 1));
  t.ok(`${p.label}: starts at 1, each block follows the last`, contiguous);
  t.is(`${p.label}: covers all ${p.questions} questions`,
    r.reduce((n, [lo, hi]) => n + (hi - lo + 1), 0), p.questions);
  t.is(`${p.label}: last block ends at ${p.questions}`, r.at(-1)[1], p.questions);
  t.ok(`${p.label}: no block longer than ${BLOCK_SIZE}`,
    r.every(([lo, hi]) => hi - lo + 1 <= BLOCK_SIZE));
}
// The uneven cases are the ones a human would get wrong by hand.
t.is('22 questions → 1–10 · 11–20 · 21–22', blockRanges(22).join(' · '),
  '1–10 · 11–20 · 21–22');
t.is('45 questions → five blocks, last one short', blockRanges(45).join(' · '),
  '1–10 · 11–20 · 21–30 · 31–40 · 41–45');
t.is('50 questions → five even blocks', blockRanges(50).join(' · '),
  '1–10 · 11–20 · 21–30 · 31–40 · 41–50');

t.section('Plans agree with the authoritative EXAM_FACTS');
const factNum = (heading, re) => {
  const sec = FACTS.slice(FACTS.indexOf(`### ${heading}`));
  return +(re.exec(sec)?.[1] ?? NaN);
};
const EXPECT = {
  'EST Math 1': { q: factNum('EST Math 1',         /- Questions: (\d+)/),
                  m: factNum('EST Math 1',         /- Time: (\d+) minutes/) },
  'EST Math 2': { q: factNum('EST Math 2 Level 1', /- Questions: (\d+)/),
                  m: factNum('EST Math 2 Level 1', /- Time: (\d+) minutes/) },
  'ACT Math':   { q: factNum('ACT Math',           /- Questions: (\d+)/),
                  m: factNum('ACT Math',           /- Time: (\d+) minutes/) },
  'SAT Math':   { q: factNum('Digital SAT Math',   /- Each module: \d+ minutes, (\d+) questions/),
                  m: factNum('Digital SAT Math',   /- Each module: (\d+) minutes/) },
};
for (const [label, exp] of Object.entries(EXPECT)) {
  const p = ALL_BLOCK_PLANS.find(x => x.label === label);
  t.ok(`${label}: has a plan`, !!p);
  t.is(`${label}: ${exp.q} questions per EXAM_FACTS`, p?.questions, exp.q);
  t.is(`${label}: ${exp.m} minutes per EXAM_FACTS`,   p?.minutes,   exp.m);
}
t.ok('SAT is scoped per module, not per test',
  ALL_BLOCK_PLANS.find(p => p.label === 'SAT Math')?.per === 'module');
t.ok('SAT row still says the method runs independently inside each module',
  /independently inside EACH module/.test(blockPlanRow(ALL_BLOCK_PLANS.find(p => p.label === 'SAT Math'))));

// ── 3. The real production exam_type values ───────────────────────────────
// profiles.exam_type holds 'EST' (11 students), 'ACT' (2), 'SAT' (2) and null
// (4). Not one of them is 'EST Math 1'. The v94 prompt asked the model to pick
// "the correct row" for 'EST' when two rows match — this is that bug's guard.

t.section('Every stored exam_type resolves without the model choosing');
t.is("'SAT' → one plan",  blockPlansFor('SAT').length, 1);
t.is("'ACT' → one plan",  blockPlansFor('ACT').length, 1);
t.is("'EST' → BOTH levels, because the value does not say which",
  blockPlansFor('EST').map(p => p.label).join(','), 'EST Math 1,EST Math 2');
t.is("'EST Math 1' → just Math 1", blockPlansFor('EST Math 1').map(p => p.label).join(','), 'EST Math 1');
t.is("'EST Math 2' → just Math 2", blockPlansFor('EST Math 2').map(p => p.label).join(','), 'EST Math 2');
t.is("'est math 1' (lowercase) → just Math 1",
  blockPlansFor('est math 1').map(p => p.label).join(','), 'EST Math 1');
t.is("'Digital SAT' → SAT", blockPlansFor('Digital SAT').map(p => p.label).join(','), 'SAT Math');
t.is('null → unlisted, model builds them', blockPlansFor(null), null);
t.is("'' → unlisted",       blockPlansFor(''), null);
t.is("'IGCSE' → unlisted",  blockPlansFor('IGCSE'), null);

t.section('The directive removes the choice');
const est1 = studentBlockDirective('EST Math 1');
t.ok('EST Math 1: states the exact blocks', est1.includes('1–10 · 11–20 · 21–30 · 31–40 · 41–50'));
t.ok('EST Math 1: forbids any other size', /Do NOT use any other block size/.test(est1));
t.ok('EST Math 1: never offers a 6-question split', !/\b6\b/.test(est1));

const bareEst = studentBlockDirective('EST', []);
t.ok('bare EST: offers both levels', /EST Math 1/.test(bareEst) && /EST Math 2/.test(bareEst));
t.ok('bare EST: tells Zero to ask when the level is unnamed', /ask which level they are taking, ONCE/.test(bareEst));
t.ok('bare EST: forbids averaging the two', /never average the two/.test(bareEst));
t.ok('bare EST: carries both block lists',
  bareEst.includes('31–40 · 41–50') && bareEst.includes('21–30 · 31–40'));

const sat = studentBlockDirective('SAT');
t.ok('SAT: per-module framing survives', /per module/.test(sat));
t.ok('SAT: states 1–10 · 11–20 · 21–22', sat.includes('1–10 · 11–20 · 21–22'));

const unknown = studentBlockDirective('IGCSE');
t.ok('unlisted exam: this is the one case the model sizes blocks',
  /ONE case where you build the blocks yourself/.test(unknown));
t.ok('unlisted exam: still pinned to blocks of 10', /blocks of 10/.test(unknown));

// ── 3b. Conversation-aware EST level resolution ───────────────────────────
// Asking "which level?" when the student already said it is a worse experience
// than the bug this all started with. The level is resolved from the text, not
// left to the model, so the same conversation always resolves the same way.

t.section('Explicit level mentions resolve without asking');
const lvl = (...texts) => estLevelFromConversation(texts)?.label ?? null;
t.is('"I am taking EST Math 1"',        lvl('I am taking EST Math 1'),        'EST Math 1');
t.is('"est math2" (no space, lower)',   lvl('est math2'),                     'EST Math 2');
t.is('"EST 2"',                         lvl('EST 2'),                          'EST Math 2');
t.is('"Math - 1"',                      lvl('Math - 1'),                       'EST Math 1');
t.is('mention in an earlier turn',      lvl('I take EST Math 2', 'how do I manage my time?'), 'EST Math 2');
t.is('newest explicit mention wins',    lvl('EST Math 1 tips', 'actually I switched to EST Math 2'), 'EST Math 2');

t.section('Things that must NOT resolve a level');
t.is('no mention at all',               lvl('how should I approach my exam?'), null);
t.is('bare "EST"',                      lvl('I am taking EST'),                null);
t.is('a message naming BOTH levels',    lvl('should I take Math 1 or Math 2?'), null);
t.is('a bare digit',                    lvl('1'),                              null);
t.is('"I have 1 math question"',        lvl('I have 1 math question'),         null);
t.is('"question 1"',                    lvl('help me with question 1'),        null);
t.is('"MATH 12" is not Math 1',         lvl('MATH 12'),                        null);
// EXAM_FACTS calls the second exam "EST Math 2 Level 1". A naive /level 1/
// pattern would resolve it to Math 1 — backwards, on the platform's own string.
t.is('"EST Math 2 Level 1" resolves to Math 2, not Math 1',
  lvl('I am taking EST Math 2 Level 1'), 'EST Math 2');
t.is('both-levels turn falls back to an older explicit one',
  lvl('I take EST Math 1', 'is Math 1 or Math 2 harder?'), 'EST Math 1');

t.section('The directive uses the resolved level and stops asking');
const resolved = studentBlockDirective('EST', ['I am taking EST Math 2']);
t.ok('names the resolved level',      /this conversation names EST Math 2/.test(resolved));
t.ok('gives Math 2 blocks',           resolved.includes('1–10 · 11–20 · 21–30 · 31–40'));
t.ok('does not give Math 1 blocks',   !resolved.includes('41–50'));
t.ok('explicitly tells Zero not to ask', /do NOT ask which level/.test(resolved));
t.ok('still forbids other sizes',     /Do NOT use any other block size/.test(resolved));
// The loop this guards against: Zero asks, student replies "1", Zero asks again.
t.ok('unresolved case tells Zero to honour a short reply like "1" or "2"',
  /including a short reply such as "1" or "2" to a question you asked/.test(bareEst));
t.ok('unresolved case forbids asking twice', /Never ask twice/.test(bareEst));
// A named level must not change SAT/ACT, whose exam_type is already unambiguous.
t.is('an EST mention does not disturb an ACT student',
  studentBlockDirective('ACT', ['I also did EST Math 1 last year']),
  studentBlockDirective('ACT', []));

t.section('Deterministic — the same student always gets the same plan');
for (const ex of ['EST', 'EST Math 1', 'SAT', 'ACT', 'IGCSE', '']) {
  t.is(`${ex || '(empty)'}: repeated calls are identical`,
    studentBlockDirective(ex, []), studentBlockDirective(ex, []));
}
t.is('same conversation resolves the same way every time',
  studentBlockDirective('EST', ['EST Math 1 please']),
  studentBlockDirective('EST', ['EST Math 1 please']));
// No listed exam may ever produce a block size other than 10 (last block short).
const sizes = new Set(ALL_BLOCK_PLANS.flatMap(p =>
  blockRanges(p.questions).map(r => { const [lo, hi] = r.split('–').map(Number); return hi - lo + 1; })));
t.ok('every block across every listed exam is 10, or a short final block',
  [...sizes].every(n => n === 10 || n < 10));
t.ok('no block is ever 6 for a listed exam',
  !ALL_BLOCK_PLANS.some(p => blockRanges(p.questions).some(r => {
    const [lo, hi] = r.split('–').map(Number); return hi - lo + 1 === 6; })));

// ── 4. Still wired into the prompt that students actually get ─────────────
t.section('The block reaches the model');
t.ok('interpolated into NORMAL_SYSTEM_PROMPT', /\$\{examStrategyForType\}/.test(SRC));
t.ok("the student's own directive is interpolated, not a static row",
  /\$\{studentBlockDirective\(examType, \[\.\.\.messages\.map/.test(STRAT));
t.ok('the directive is fed the prior turns AND the current question',
  /messages\.map\(m => m\.content\), question\]/.test(STRAT));
t.ok('the reference table is rendered from the same plans',
  /\$\{ALL_BLOCK_PLANS\.map\(blockPlanRow\)\.join/.test(STRAT));
t.ok('the ambiguous "use the correct row" instruction is gone',
  !/Use the correct row from the table above/.test(STRAT));
t.ok('NORMAL_SYSTEM_PROMPT is what non-hint turns use',
  /const systemPrompt = hintMode \? HINT_SYSTEM_PROMPT : NORMAL_SYSTEM_PROMPT;/.test(SRC));

t.done();
