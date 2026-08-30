-- 20260830c — widen the Spine's answer model so ACT can exist in it.
--
-- ✅ APPLIED 2026-08-30, individually approved per CLAUDE.md §3.
--    Rollback: 20260830c_question_spine_choice_sets_rollback.sql
--
--    Verified after applying, against production: the constraint now reads
--    CHECK (exam_question_answer_ok(question_format, choices, correct_answer));
--    A-E and F-K are storable; a set containing I is refused; an F-K question
--    answered 'A' is refused; and all 66 existing rows remain valid.
--
-- WHY
-- ---
-- M3 fixed the multiple-choice shape at exactly four options with ids A-D, and
-- fixed correct_answer to the literal list ('A','B','C','D'). That was right for
-- the SAT and it anticipated this moment in its own words:
--
--     "Widening the shape (5-choice formats, images) is a reviewed migration
--      editing this function — that is the point of it."
--
-- ACT Math is five-choice, and its option letters ALTERNATE: odd-numbered
-- questions run A B C D E, even-numbered run F G H J K. (No I — it reads as a
-- 1 next to the question number.) Both constraints refuse that outright, so
-- today an ACT form cannot be stored at all. Nothing else in the stack blocks
-- it: exam-registry.js already carries ACT_MATH, exam-delivery.js compares
-- answers as trimmed strings, exams.html prints whatever ids the row holds, and
-- publish_exam_form() never reads choices or correct_answer. This file is the
-- whole gap.
--
-- WHAT CHANGES
-- ------------
-- 1. exam_question_choices_ok() accepts three id sets and no others:
--        {A,B,C,D}      4-choice   — SAT, EST
--        {A,B,C,D,E}    5-choice   — ACT, odd-numbered
--        {F,G,H,J,K}    5-choice   — ACT, even-numbered
--
-- 2. correct_answer must be an id that the question ACTUALLY OFFERS, checked
--    against its own choices rather than against a fixed list.
--
-- THE SECOND CHANGE IS A TIGHTENING, NOT A LOOSENING, and it is the reason this
-- migration is not simply "allow E through K". Under a fixed list, an even ACT
-- question offering F G H J K with correct_answer 'A' would satisfy every
-- constraint on the table while naming an option that does not exist — a
-- silently unanswerable question, and exactly the defect a widened letter set
-- introduces. Deriving the rule from the row closes it for every exam at once,
-- including the SAT rows already stored.
--
-- WHAT DELIBERATELY DOES NOT CHANGE
-- ---------------------------------
-- The database does not learn ACT's odd/even alternation. Which letter set
-- belongs on which ordinal is a property of an EXAM, and M3 already settled
-- where exam vocabulary lives — it refused to CHECK exam_code against a list,
-- and refused to name variant ids, for the same reason. The registry owns the
-- convention and the pre-flight enforces it; this file owns only what is
-- storable. A DB that knew about ACT ordinals would have to be migrated the
-- next time an exam numbered its options differently.
--
-- question_format is untouched: 'mcq' and 'grid_in' describe how a student
-- RESPONDS, and five options is still one response from a list. A third format
-- would have said the option count is a kind of question, which it is not.
--
-- EXISTING ROWS
-- -------------
-- ADD CONSTRAINT validates the table, so this migration only succeeds if all 66
-- questions of DSAT-2026-A still pass. They are 4-choice A-D with answers drawn
-- from their own options, so they satisfy both the old rule and the new one —
-- and the validation pass is the proof rather than this sentence.

begin;

-- 1. THE CHOICE SET ────────────────────────────────────────────────────────────
-- The sorted id array IS the rule. Comparing the whole aggregated array against
-- the three permitted sets settles count, membership and distinctness together:
-- a duplicate yields {A,A,B,C} and a missing letter yields {A,B,C}, and neither
-- equals anything permitted. The old function needed a separate length test and
-- a separate count(distinct) for what one equality now says.
create or replace function public.exam_question_choices_ok(fmt text, ch jsonb)
returns boolean
language sql
immutable
parallel safe
as $$
  select case
    when fmt = 'grid_in' then ch is null
    when fmt = 'mcq' then
      ch is not null
      and jsonb_typeof(ch) = 'array'
      and not exists (
            select 1 from jsonb_array_elements(ch) e
            where jsonb_typeof(e) <> 'object'
               or (select count(*) from jsonb_object_keys(e)) <> 2
               or not (e ? 'id') or not (e ? 'text')
               or jsonb_typeof(e -> 'id') <> 'string'
               or jsonb_typeof(e -> 'text') <> 'string'
               or char_length(e ->> 'text') not between 1 and 2000
          )
      and (
            select array_agg(e ->> 'id' order by e ->> 'id')
            from jsonb_array_elements(ch) e
          ) in (
            array['A', 'B', 'C', 'D'],            -- 4-choice: SAT, EST
            array['A', 'B', 'C', 'D', 'E'],       -- 5-choice: ACT, odd-numbered
            array['F', 'G', 'H', 'J', 'K']        -- 5-choice: ACT, even-numbered
          )
    else false
  end;
$$;

comment on function public.exam_question_choices_ok(text, jsonb) is
  'CHECK helper for exam_questions.choices. mcq: {id,text} objects whose sorted '
  'id set is exactly A-D, A-E, or F-K (ACT even-numbered); text 1-2000 chars. '
  'grid_in: NULL. Which set belongs to which exam and ordinal is registry-owned '
  'and enforced at pre-flight, deliberately not here. Changing the accepted '
  'shape is a reviewed migration editing this function.';

-- 2. THE ANSWER ────────────────────────────────────────────────────────────────
-- Derived from the row, so it cannot name an option the question does not
-- offer. grid_in keeps the free-text bound it always had.
create or replace function public.exam_question_answer_ok(fmt text, ch jsonb, ans text)
returns boolean
language sql
immutable
parallel safe
as $$
  select case
    when fmt = 'grid_in' then char_length(ans) between 1 and 20
    when fmt = 'mcq' then exists (
      select 1 from jsonb_array_elements(coalesce(ch, '[]'::jsonb)) e
      where e ->> 'id' = ans
    )
    else false
  end;
$$;

comment on function public.exam_question_answer_ok(text, jsonb, text) is
  'CHECK helper for exam_questions.correct_answer. mcq: the answer must be one '
  'of the ids the row offers in choices — checked against the question itself, '
  'not a fixed letter list, so a widened choice set cannot admit an answer that '
  'names a non-existent option. grid_in: 1-20 chars.';

alter table public.exam_questions
  drop constraint exam_questions_correct_answer_check,
  add  constraint exam_questions_correct_answer_check
       check (public.exam_question_answer_ok(question_format, choices, correct_answer));

commit;
