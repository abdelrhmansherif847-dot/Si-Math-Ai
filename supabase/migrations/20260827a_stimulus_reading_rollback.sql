-- Rollback for 20260827a_stimulus_reading.sql.
--
-- Safe only while no row depends on what it removes. Check first:
--   select count(*) from public.exam_questions where reading is not null;   -- expect 0
--   select count(*) from public.exam_stimuli where kind = 'plot';           -- expect 0
-- A plot row stored under the new validator has spec.frame; dropping the
-- column and restoring the old validator leaves that key as an unvalidated
-- extra, which the old function tolerates. A question with a non-null reading
-- would simply lose it, which is why the first check matters.

begin;

drop trigger if exists exam_stimuli_reading_still_valid on public.exam_stimuli;
drop function if exists public.exam_stimulus_reading_still_valid();

drop trigger if exists exam_questions_reading_applies on public.exam_questions;
drop function if exists public.exam_question_reading_applies();

alter table public.exam_questions drop constraint if exists exam_questions_reading_check;
alter table public.exam_questions drop column if exists reading;

drop function if exists public.exam_stimulus_needs_reading(text, jsonb);

-- Restore the 20260825a validator verbatim: the plot branch loses `frame`.
-- Re-run the plot branch of 20260825a_exam_stimuli.sql from that file rather
-- than transcribing it here, so the two cannot drift.
\echo 'NOW re-run the exam_stimulus_spec_ok definition from 20260825a_exam_stimuli.sql'

commit;
