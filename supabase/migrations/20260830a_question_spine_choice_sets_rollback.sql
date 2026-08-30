-- Rollback for 20260830a — back to the four-choice A-D Spine.
--
-- ⚠️  THIS IS DESTRUCTIVE IF ANY 5-CHOICE QUESTION EXISTS.
--     Restoring the narrow constraint runs a validation pass over the table, so
--     it will FAIL — loudly, without changing anything — while a single ACT
--     question is stored. That is the intended behaviour: a rollback must not
--     be able to leave the database holding rows its own rules forbid. Retire
--     or delete the ACT forms first if the widening is genuinely being undone.
--
-- Also note this restores the WEAKER answer rule: correct_answer goes back to a
-- fixed A-D list rather than being checked against the row's own choices. That
-- tightening was collateral to the widening and is reverted with it, because
-- leaving a constraint behind that 20260830a introduced would make the rollback
-- a partial one.

begin;

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
      and jsonb_array_length(ch) = 4
      and not exists (
            select 1 from jsonb_array_elements(ch) e
            where jsonb_typeof(e) <> 'object'
               or (select count(*) from jsonb_object_keys(e)) <> 2
               or not (e ? 'id') or not (e ? 'text')
               or jsonb_typeof(e -> 'id') <> 'string'
               or jsonb_typeof(e -> 'text') <> 'string'
               or (e ->> 'id') not in ('A', 'B', 'C', 'D')
               or char_length(e ->> 'text') not between 1 and 2000
          )
      and (select count(distinct e ->> 'id') from jsonb_array_elements(ch) e) = 4
    else false
  end;
$$;

comment on function public.exam_question_choices_ok(text, jsonb) is
  'CHECK helper for exam_questions.choices. mcq: exactly 4 {id,text} objects, '
  'ids A-D distinct, text 1-2000 chars. grid_in: NULL. Changing the accepted '
  'shape is a reviewed migration editing this function.';

alter table public.exam_questions
  drop constraint exam_questions_correct_answer_check,
  add  constraint exam_questions_correct_answer_check
       check (
         (question_format = 'mcq'     and correct_answer in ('A', 'B', 'C', 'D')) or
         (question_format = 'grid_in' and char_length(correct_answer) between 1 and 20)
       );

drop function if exists public.exam_question_answer_ok(text, jsonb, text);

commit;
