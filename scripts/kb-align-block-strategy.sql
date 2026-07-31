-- scripts/kb-align-block-strategy.sql
--
-- Aligns public.zero_knowledge_entries with the v94 Zero Block Strategy and
-- with EXAM_FACTS. Ten entries change. NOT APPLIED — review, then run.
--
-- ⚠️ THIS SCRIPT IS LIVE THE MOMENT IT RUNS. There is no deploy gate in front
-- of it. search_zero_knowledge() reads these rows at request time, so the
-- currently deployed function (v93) starts serving the new text on the next
-- student message. It does not wait for the v94 Edge Function deploy.
--
-- Run it BEFORE deploying v94, not after: every edit here removes a statement
-- that contradicts v94's prompt, so applying it early only makes v93 more
-- correct than it is today. Deploying v94 first would leave a window where the
-- prompt teaches the 90-Second Rule while retrieval hands the model a rival
-- 3-Pass method with 60-second thresholds.
--
--
-- WHY THESE EDITS
--
-- The system prompt is the single authority. Two things broke that:
--
--   1. Stale ACT facts. Six entries taught 60 questions in 60 minutes at one
--      minute each. EXAM_FACTS states 45 questions in 50 minutes (~67 s), and
--      the prompt declares EXAM_FACTS authoritative and never to be
--      contradicted. Retrieval splices KB text into the same prompt, so an ACT
--      timing question handed the model both numbers and let it pick. That is
--      the self-contradiction class that produced v93.
--
--   2. A rival methodology. Two entries taught a named "3-Pass Method" with
--      60-second and 2-minute thresholds, competing with the Block Strategy's
--      blocks and 90-Second Rule for exactly the same question.
--
-- The rewrites deliberately do NOT restate the strategy. The prompt teaches
-- the method; the KB gives exam-specific application in the same vocabulary
-- (blocks, Fast & Confident, 90-Second Rule, First/Second Return, Score Per
-- Minute). Duplicating the method here is what created the drift being fixed.
--
-- Every rewritten body states the 90-Second Rule as a DECISION rule, not a
-- per-question time limit — a student rushing to beat 90 seconds on every
-- question is not maximizing Score Per Minute, only guessing faster.
--
--
-- CONSTRAINTS OBSERVED
--
--   • search_zero_knowledge() matches on title || ' ' || body ONLY. tags and
--     trigger_phrases do not affect retrieval (they are admin-facing), so the
--     rewritten bodies keep the words students actually type — skip, order,
--     easy first, run out of time — or the entry stops being reachable.
--   • MAX_KB_ENTRY_CHARS = 2000 per entry, MAX_KB_TOTAL_CHARS = 8000 across up
--     to 5 entries (index.ts). Every body below stays under ~1000 chars so a
--     multi-entry retrieval is not truncated mid-sentence.
--   • Data only. No DDL, no schema change, so this is not a migration and does
--     not belong in supabase/migrations/ (where db push would auto-apply it).
--
-- Rollback: the previous values are recorded verbatim at the bottom of this
-- file. zero_knowledge_entries has no history table — that block is the only
-- copy, so do not delete it.
--
-- Usage: Supabase Dashboard → SQL Editor, paste, Run. Aborts as a whole on any
-- failure: preflight raises if an id is missing, postflight raises if any
-- pre-Block-Strategy text survives.

BEGIN;

-- ── Preflight ─────────────────────────────────────────────────────────────
-- A renamed or deleted entry must abort the run, not silently update 0 rows.
DO $do$
DECLARE missing uuid[];
BEGIN
  SELECT array_agg(t.id) INTO missing
  FROM unnest(ARRAY[
    '3801fbd8-7c13-4d6c-be50-d157893aee86',  -- ACT Math: Format and Timing
    '4d316098-7788-4115-82f6-b5b7b20f1e45',  -- ACT Timing Is the Hardest Challenge
    'c3183cd1-8a9e-4f24-b83e-713fd37a8be8',  -- ACT is taken digitally on a computer
    '4e427e3b-2e6a-4853-8bff-724a3e237c33',  -- ACT practice environment
    '1975b722-d66b-4cc9-bf1e-0a966b9cd8f9',  -- ACT Calculator Policy
    'ff5f99e1-fcc4-4676-a313-17bdaa288f99',  -- Every Question Has a Time Budget
    '2cdeb82d-89f7-4fc1-8db2-250a6f775501',  -- 3-Pass Method
    '0e3e5e65-4719-47d2-a9fe-415e1cc67297',  -- ACT Skip and Return Strategy
    'd73af2d7-e14c-474a-a149-f74283eda56c',  -- Build ACT Speed Through Timed Drills
    '071650ea-c5f0-463c-8374-9a4893425e08'   -- Score Stuck or Not Improving
  ]::uuid[]) AS t(id)
  WHERE NOT EXISTS (SELECT 1 FROM public.zero_knowledge_entries e WHERE e.id = t.id);

  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'kb-align: % expected entries not found: %',
      array_length(missing, 1), missing;
  END IF;
END
$do$;


-- ══════════════════════════════════════════════════════════════════════════
-- GROUP A — ACT facts: 60 Q / 60 min / 1 min per question  →  45 Q / 50 min
-- ══════════════════════════════════════════════════════════════════════════

-- A1. The primary ACT format entry. Every number in it was wrong, and its tags
-- carried the wrong numbers in Arabic too ("٦٠ دقيقة" equivalents), which is
-- what an Arabic-speaking student's query would have matched on.
UPDATE public.zero_knowledge_entries SET
  body = $body$ACT Math is 50 minutes long and contains 45 multiple-choice questions — an average of about 67 seconds per question (roughly 1 minute 7 seconds). This is the tightest per-question pace of the three exams, so timing strategy matters more on ACT than anywhere else. That average is a planning figure, not a target for each question: some take 30 seconds, some take longer and are worth it. Zero should remind ACT students to work the section in blocks and to use the 90-Second Rule when progress stalls.$body$,
  tags = ARRAY['act','act math','50 minutes','45 questions','multiple choice',
               'act format','timing','67 seconds per question','50 دقيقة',
               '45 سؤال','act timing','وقت act','مدة act','عدد اسئلة act',
               'كام دقيقه act','كام سوال act'],
  trigger_phrases = ARRAY['how long is act math','how many questions on act math',
                          'act math format','act math timing','act math structure',
                          'act pace per question'],
  updated_at = now()
WHERE id = '3801fbd8-7c13-4d6c-be50-d157893aee86';

-- A2. Also carried the two thresholds that conflict with the 90-Second Rule:
-- "under 60 seconds on easy questions, 90 seconds max on hard ones". The
-- second is the rule stated as a time limit — the exact misreading v94 names.
UPDATE public.zero_knowledge_entries SET
  body = $body$ACT Math is 45 questions in 50 minutes — about 67 seconds per question on average. That is the tightest pace of any major math exam. Most students who struggle with ACT Math are not weak in math — they are slow.
⏱ Timing is the primary skill to train for ACT.
- Work the section in blocks of about 10 questions (the Zero Block Strategy)
- In each block, bank your Fast & Confident questions first
- Apply the 90-Second Rule: if about 90 seconds pass with no meaningful progress, mark it, skip it, return later
- This is a decision rule, not a per-question time limit. If you are making real progress, finish the question
- Build speed through repetition and pattern recognition

Students who run out of time on ACT Math typically spend too long on hard questions early, leaving easy points on the table. The solution is not to work faster — it is to skip smarter.$body$,
  tags = ARRAY['ACT','timing','speed','45 questions','67 seconds','run out of time',
               'running out of time','pacing','ACT pacing','timing problems',
               'not enough time','ACT slow','90-second rule'],
  trigger_phrases = ARRAY['ACT timing','ACT speed','ACT math','45 questions',
                          'ACT practice','run out of time','running out of time',
                          'not enough time ACT','ACT too slow','ACT pacing',
                          'ACT timing issues','timing problems ACT','always run out'],
  updated_at = now()
WHERE id = '4d316098-7788-4115-82f6-b5b7b20f1e45';

-- A3/A4. Two near-duplicate entries about the digital ACT, both repeating the
-- stale pace. Left as separate rows — deduplicating them is a content decision
-- beyond this alignment.
UPDATE public.zero_knowledge_entries SET
  body = $body$The ACT is now taken digitally on a computer. Students should complete ACT practice sessions on a computer screen, not on paper. With 45 questions in 50 minutes — about 67 seconds per question — the pace requires fast, focused digital problem-solving. Zero should remind ACT students to practice pacing strategies specifically for the computer-based format.$body$,
  updated_at = now()
WHERE id = 'c3183cd1-8a9e-4f24-b83e-713fd37a8be8';

UPDATE public.zero_knowledge_entries SET
  body = $body$The ACT is now taken digitally on a computer. Students should complete ACT practice sessions on a computer screen. With 45 questions in 50 minutes — about 67 seconds per question — the pace requires fast, focused digital problem-solving. Zero should remind ACT students to practice pacing strategies specifically for the computer-based format.$body$,
  tags = ARRAY['act','act digital','computer practice','act testing environment',
               'pacing','67 seconds per question'],
  updated_at = now()
WHERE id = '4e427e3b-2e6a-4853-8bff-724a3e237c33';

-- A5. Calculator policy is correct; only its pace justification was stale.
UPDATE public.zero_knowledge_entries SET
  body = $body$Calculators are permitted for ACT Math. Given the tight pace — 45 questions in 50 minutes, about 67 seconds each — students cannot waste time on calculator use for simple arithmetic. Zero should advise ACT students to reserve the calculator for complex calculations and solve straightforward problems mentally or with quick written work.$body$,
  updated_at = now()
WHERE id = '1975b722-d66b-4cc9-bf1e-0a966b9cd8f9';

-- A6. The cross-exam pacing table. SAT and EST rows were right; the ACT row
-- was wrong. Also the entry most likely to be read as a per-question stopwatch,
-- so it now says outright that these are section averages.
UPDATE public.zero_knowledge_entries SET
  body = $body$Timing is not just about finishing — it is about scoring the most points possible in the time given. That is Score Per Minute.
⏱ Average pace by exam:
- SAT: ~1.5 minutes per question (35 min / 22 questions per module)
- EST Math 1: ~1.5 minutes per question (75 min / 50 questions)
- EST Math 2: ~1.5 minutes per question (60 min / 40 questions)
- ACT: ~67 seconds per question (50 min / 45 questions)
These are averages across a section, not a stopwatch for each question. Some questions take 30 seconds; others take longer and are worth it while you are making progress. What costs you points is stalling — a student who spends 4 minutes stuck on one hard question is trading 2-3 easy questions they never reached. When about 90 seconds pass with no meaningful progress, mark it and move on (the 90-Second Rule).

Synonyms: timing problems, pacing issues, running out of time, not finishing, too slow, time pressure, clock management, question skipping.$body$,
  updated_at = now()
WHERE id = 'ff5f99e1-fcc4-4676-a313-17bdaa288f99';


-- ══════════════════════════════════════════════════════════════════════════
-- GROUP B — the rival 3-Pass methodology  →  the Zero Block Strategy
-- ══════════════════════════════════════════════════════════════════════════

-- B1. The general prioritization entry, retitled off "3-Pass Method". The body
-- keeps "order", "easy", "skip" and "first" because retrieval matches on
-- title || body — dropping that vocabulary would make the entry unreachable
-- for the queries it exists to answer.
UPDATE public.zero_knowledge_entries SET
  title = 'Question Prioritization — The Zero Block Strategy',
  body = $body$Never solve questions in strict order. Solve them in order of ease FOR YOU. The goal is to maximize Score Per Minute.
🎯 The Zero Block Strategy — Zero's official method:
Divide the section into blocks of about 10 questions. Inside each block:
- Answer your Fast & Confident questions first and bank those points
- If about 90 seconds pass with no meaningful progress, mark the question and skip it
- Mark the ones you can solve but that need more time, and keep moving
After all blocks are done: First Return — the medium-time questions you marked. Second Return — the hardest ones, with whatever time is left.
Never leave an answer blank on SAT, EST or ACT. There is no wrong-answer penalty, so always guess.
The 90-Second Rule is a decision rule, not a time limit: if you are making real progress on a question, finish it.$body$,
  tags = ARRAY['question prioritization','zero block strategy','block method',
               'exam strategy','order of questions','skip and return',
               '90-second rule','score per minute'],
  trigger_phrases = ARRAY['which question first','order questions','skip hard',
                          'easy first','block strategy','how should I solve the exam'],
  updated_at = now()
WHERE id = '2cdeb82d-89f7-4fc1-8db2-250a6f775501';

-- B2. The ACT-specific pass strategy. Kept as an entry because the per-exam
-- block boundaries are genuinely useful; rewritten so it applies the strategy
-- rather than competing with it. Drops "under 60 seconds" and "never more than
-- 2 minutes", both of which contradict the 90-Second Rule.
UPDATE public.zero_knowledge_entries SET
  title = 'ACT — Applying the Zero Block Strategy',
  body = $body$On ACT Math, the cost of spending 3 minutes stuck on one hard question is losing 3 easy questions you never reached. Skipping well is essential at 45 questions in 50 minutes.
Work the section in blocks of about 10 questions: 1-10, 11-20, 21-30, 31-40, 41-45.
Inside each block:
- Solve your Fast & Confident questions first
- If about 90 seconds pass with no meaningful progress, mark it and move on
- Mark the ones you can solve but that need more time
After the last block: First Return for the medium-time questions, Second Return for the hardest.
Never leave a blank — there is no penalty for a wrong answer on ACT.
The 90-Second Rule is about stalled progress, not a stopwatch on every question. A question you are actively solving is worth finishing.$body$,
  tags = ARRAY['ACT','zero block strategy','skip strategy','timing','ACT pacing',
               'run out of time','pacing','ACT time','time management',
               '90-second rule'],
  trigger_phrases = ARRAY['ACT skip','ACT strategy','ACT hard questions',
                          'not enough time','ran out of time','finish ACT',
                          'ACT pacing','time on ACT','ACT block strategy'],
  updated_at = now()
WHERE id = '0e3e5e65-4719-47d2-a9fe-415e1cc67297';


-- ══════════════════════════════════════════════════════════════════════════
-- GROUP C — guidance derived from the stale numbers
-- ══════════════════════════════════════════════════════════════════════════

-- C1. "10-question mini-sets (10 min max)" was derived from the old 1-min pace.
-- At the real pace a 10-question set is ~11 minutes — and a 10-question set is
-- exactly one Zero block, so the drill now trains the unit students will use.
UPDATE public.zero_knowledge_entries SET
  body = $body$ACT speed cannot be built by studying more content. It is built by repeated timed practice.
- Do timed 10-question mini-sets — one Zero block — in about 11 minutes, matching the real ACT pace of 45 questions in 50 minutes
- Track your time per question and log it
- Identify which question types slow you down
- Drill those types specifically until speed improves
- Practise the 90-Second Rule during drills so skipping becomes automatic on exam day
- Full timed practice sections every week$body$,
  updated_at = now()
WHERE id = 'd73af2d7-e14c-474a-a149-f74283eda56c';

-- C2. "60-70 minutes of sustained focus" is wrong for two of the three exams
-- (ACT is 50, EST Math 1 is 75). Replaced with the real range. Lowest-severity
-- edit here — it is advice, not a stated exam fact.
UPDATE public.zero_knowledge_entries SET
  body = $body$A score plateau is one of the most frustrating situations in exam prep — and one of the most solvable. Students whose scores stop improving are almost always missing one of these:

1. **No timed practice** — Studying without a clock trains untimed thinking. The exam is timed.
2. **Wrong practice format** — SAT needs Bluebook digital practice. EST needs paper and bubble sheets. ACT needs computer practice under strict time.
3. **No mistake analysis** — Doing more questions without reviewing errors reinforces wrong patterns.
4. **Reviewing topics already mastered** — Time spent on strengths does not improve the score.
5. **No full simulation** — Short drills do not prepare you for a full timed section (50 to 75 minutes depending on your exam).

🎯 Focus Here: If your score is stuck, the answer is almost never "study more." It is usually "study differently."$body$,
  updated_at = now()
WHERE id = '071650ea-c5f0-463c-8374-9a4893425e08';


-- ── Postflight ────────────────────────────────────────────────────────────
-- Catches an entry that was missed, or one added between review and run.
-- Deliberately scans ALL active entries, not just the ten touched above.
DO $do$
DECLARE offenders text;
BEGIN
  -- The regex is parenthesised as a whole: `~*` binds tighter than `||`, so
  -- without the outer parens this reads as (bool || text) and the statement
  -- fails with "argument of AND must be type boolean" — a gate that aborts the
  -- transaction for a reason unrelated to what it is guarding.
  SELECT string_agg(title, ' | ') INTO offenders
  FROM public.zero_knowledge_entries
  WHERE is_active
    AND (title || ' ' || body) ~* ('(60 questions in 60 minutes'
      || '|60 minutes long and contains 60'
      || '|1[- ]minute[- ]per[- ]question'
      || '|one minute per question'
      || '|3-Pass'
      || '|Pass 1 —'
      || '|90 seconds max'
      -- The remaining three edits use wording none of the above would catch,
      -- and a gate that covers 7 of 10 changes reads as if it covers all 10.
      || '|\(60 min / 60 questions\)'
      || '|\(10 min max\)'
      || '|60-70 minutes)');

  IF offenders IS NOT NULL THEN
    RAISE EXCEPTION 'kb-align: pre-Block-Strategy text still present in: %', offenders;
  END IF;
END
$do$;

COMMIT;


-- ── Verification (run after COMMIT) ───────────────────────────────────────
-- Expect 10 rows, all updated_at within the last few minutes.
--
-- SELECT id, title, left(body, 90) AS body_head, updated_at
-- FROM   public.zero_knowledge_entries
-- WHERE  id IN ('3801fbd8-7c13-4d6c-be50-d157893aee86','4d316098-7788-4115-82f6-b5b7b20f1e45',
--               'c3183cd1-8a9e-4f24-b83e-713fd37a8be8','4e427e3b-2e6a-4853-8bff-724a3e237c33',
--               '1975b722-d66b-4cc9-bf1e-0a966b9cd8f9','ff5f99e1-fcc4-4676-a313-17bdaa288f99',
--               '2cdeb82d-89f7-4fc1-8db2-250a6f775501','0e3e5e65-4719-47d2-a9fe-415e1cc67297',
--               'd73af2d7-e14c-474a-a149-f74283eda56c','071650ea-c5f0-463c-8374-9a4893425e08')
-- ORDER  BY updated_at DESC;
--
-- Then confirm retrieval actually returns the new text for the queries that
-- surfaced the conflicts in the first place:
--
-- SELECT title, left(body, 70) FROM search_zero_knowledge('how long is act math', 5);
-- SELECT title, left(body, 70) FROM search_zero_knowledge('act timing strategy', 5);
-- SELECT title, left(body, 70) FROM search_zero_knowledge('which question should I do first', 5);
-- SELECT title, left(body, 70) FROM search_zero_knowledge('I keep running out of time', 5);


-- ══════════════════════════════════════════════════════════════════════════
-- ROLLBACK — pre-change values, captured 2026-07-31
-- ══════════════════════════════════════════════════════════════════════════
-- zero_knowledge_entries has no history table and no soft-delete. This block is
-- the ONLY copy of what these rows said before. Do not remove it.
--
-- Restoring re-introduces the EXAM_FACTS contradiction, so roll back the KB
-- only together with a rollback of the v94 Edge Function.
--
-- BEGIN;
--
-- UPDATE public.zero_knowledge_entries SET
--   body = 'ACT Math is 60 minutes long and contains 60 multiple-choice questions — exactly 1 minute per question. This is the tightest per-question pace of all three exams. Timing strategy is one of the most important factors in ACT Math performance. Zero should proactively remind ACT students: "ACT Math gives you about one minute per question. Timing strategy is a major part of success — practice with a clock at all times."',
--   tags = ARRAY['act','act math','60 minutes','60 questions','multiple choice','act format','timing','1 minute per question','act','60 دقيقة','60 سؤال','act timing','وقت act','مدة act','عدد اسئلة act','كام دقيقه act','كام سوال act'],
--   trigger_phrases = ARRAY['how long is act math','how many questions on act math','act math format','act math timing','act math structure','act 1 minute per question']
-- WHERE id = '3801fbd8-7c13-4d6c-be50-d157893aee86';
--
-- UPDATE public.zero_knowledge_entries SET
--   body = E'ACT Math is 60 questions in 60 minutes — 1 minute per question. This is the tightest timing of any major math exam. Most students who struggle with ACT Math are not weak in math — they are slow.\n⏱ Timing is the primary skill to train for ACT.\n- Track your time per question on every practice set\n- Target: under 60 seconds on easy questions, 90 seconds max on hard ones\n- If you spend more than 90 seconds — skip and return\n- Build speed through repetition and pattern recognition\n\nStudents who run out of time on ACT Math typically spend too long on hard questions early, leaving easy points on the table. The solution is not to work faster — it is to skip smarter.',
--   tags = ARRAY['ACT','timing','speed','60 questions','1 minute','run out of time','running out of time','pacing','ACT pacing','timing problems','not enough time','ACT slow','speed'],
--   trigger_phrases = ARRAY['ACT timing','ACT speed','ACT math','60 questions','ACT practice','run out of time','running out of time','not enough time ACT','ACT too slow','ACT pacing','ACT timing issues','timing problems ACT','always run out']
-- WHERE id = '4d316098-7788-4115-82f6-b5b7b20f1e45';
--
-- UPDATE public.zero_knowledge_entries SET
--   body = 'The ACT is now taken digitally on a computer. Students should complete ACT practice sessions on a computer screen, not on paper. The 1-minute-per-question pace requires fast, focused digital problem-solving. Zero should remind ACT students to practice pacing strategies specifically for the computer-based format.'
-- WHERE id = 'c3183cd1-8a9e-4f24-b83e-713fd37a8be8';
--
-- UPDATE public.zero_knowledge_entries SET
--   body = 'The ACT is now taken digitally on a computer. Students should complete ACT practice sessions on a computer screen. The 1-minute-per-question pace requires fast, focused digital problem-solving. Zero should remind ACT students to practice pacing strategies specifically for the computer-based format.',
--   tags = ARRAY['act','act digital','computer practice','act testing environment','pacing','1 minute per question']
-- WHERE id = '4e427e3b-2e6a-4853-8bff-724a3e237c33';
--
-- UPDATE public.zero_knowledge_entries SET
--   body = 'Calculators are permitted for ACT Math. Given the tight 1-minute-per-question pace, students cannot waste time on calculator use for simple arithmetic. Zero should advise ACT students to reserve the calculator for complex calculations and solve straightforward problems mentally or with quick written work.'
-- WHERE id = '1975b722-d66b-4cc9-bf1e-0a966b9cd8f9';
--
-- UPDATE public.zero_knowledge_entries SET
--   body = E'Timing is not just about finishing — it is about scoring the most points possible in the time given.\n⏱ Time budgets by exam:\n- SAT: ~1.5 minutes per question (35 min / 22 questions)\n- EST: ~1.5 minutes per question (same pacing)\n- ACT: ~1.0 minute per question (60 min / 60 questions)\nA student who spends 4 minutes on one hard question is trading 2-3 easy questions they never reached. That is a net score loss.\n\nSynonyms: timing problems, pacing issues, running out of time, not finishing, too slow, time pressure, clock management, question skipping.'
-- WHERE id = 'ff5f99e1-fcc4-4676-a313-17bdaa288f99';
--
-- UPDATE public.zero_knowledge_entries SET
--   title = 'Question Prioritization — The 3-Pass Method',
--   body = E'Never solve questions in order. Solve them in order of ease for YOU.\n\n🎯 The 3-Pass Method:\nPass 1 — Scan and solve: Only attempt questions you recognise immediately. Build momentum and bank easy points.\nPass 2 — Attempt: Return to questions you understand but need more time.\nPass 3 — Guess strategically: Use remaining time on hardest questions. On SAT/EST: never leave blank — always guess. On ACT: never leave blank either.\n\nThis method maximises your score by ensuring you never miss easy points while stuck on hard ones.',
--   tags = ARRAY['question prioritization','3-pass','pass method','exam strategy','order of questions'],
--   trigger_phrases = ARRAY['which question first','order questions','skip hard','easy first','pass method']
-- WHERE id = '2cdeb82d-89f7-4fc1-8db2-250a6f775501';
--
-- UPDATE public.zero_knowledge_entries SET
--   title = 'ACT Skip and Return Strategy',
--   body = E'On ACT Math, the cost of spending 3 minutes on one hard question is losing 3 easy questions you never reached. The skip strategy is essential.\nPass 1 — Solve every question you can do in under 60 seconds\nPass 2 — Return to questions that need more time\nPass 3 — Final minutes on hardest questions\nNever spend more than 2 minutes on any single question during Pass 1.',
--   tags = ARRAY['ACT','skip strategy','pass strategy','timing','ACT pacing','run out of time','timing','pacing','ACT time','skip strategy','time management'],
--   trigger_phrases = ARRAY['ACT skip','ACT strategy','ACT hard questions','ACT pass','ACT skip','not enough time','ran out of time','finish ACT','ACT pacing','time on ACT']
-- WHERE id = '0e3e5e65-4719-47d2-a9fe-415e1cc67297';
--
-- UPDATE public.zero_knowledge_entries SET
--   body = E'ACT speed cannot be built by studying more content. It is built by repeated timed practice.\n- Do timed 10-question mini-sets (10 min max)\n- Track your time per question — log it\n- Identify which question types slow you down\n- Drill those types specifically until speed improves\n- Full timed practice sections every week'
-- WHERE id = 'd73af2d7-e14c-474a-a149-f74283eda56c';
--
-- UPDATE public.zero_knowledge_entries SET
--   body = E'A score plateau is one of the most frustrating situations in exam prep — and one of the most solvable. Students whose scores stop improving are almost always missing one of these:\n\n1. **No timed practice** — Studying without a clock trains untimed thinking. The exam is timed.\n2. **Wrong practice format** — SAT needs Bluebook digital practice. EST needs paper and bubble sheets. ACT needs computer practice under strict time.\n3. **No mistake analysis** — Doing more questions without reviewing errors reinforces wrong patterns.\n4. **Reviewing topics already mastered** — Time spent on strengths does not improve the score.\n5. **No full simulation** — Short drills do not prepare you for 60-70 minutes of sustained focus.\n\n🎯 Focus Here: If your score is stuck, the answer is almost never "study more." It is usually "study differently."'
-- WHERE id = '071650ea-c5f0-463c-8374-9a4893425e08';
--
-- COMMIT;
