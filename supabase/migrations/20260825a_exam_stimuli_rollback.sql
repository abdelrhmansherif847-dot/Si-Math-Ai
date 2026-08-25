-- =====================================================================
-- Mock Exam v2 · M4 ROLLBACK — undoes 20260825a_exam_stimuli.sql
-- =====================================================================
-- STATUS: NOT APPLIED. Shipped WITH the forward migration, per the M1 rule
--         that a rollback composed at the moment something has gone wrong is
--         not a rollback.
--
-- Revision 1, written against forward-migration revision 1.
--
-- =====================================================================
-- READ THIS BEFORE RUNNING: THIS FILE DESTROYS AUTHORED CONTENT
-- =====================================================================
-- Dropping exam_stimuli destroys every authored stimulus — tables, charts,
-- plots, number lines, figures — and detaches every question that referenced
-- one. A question whose meaning depended on a shared graph becomes an
-- unanswerable fragment. If any published form carries stimuli, running this
-- erases part of the content students were examined against.
--
-- THE GUARD (M1/M3 pattern): section 0 counts rows and ABORTS if any exist,
-- unless the operator declares the loss in the same transaction:
--
--     begin;
--     set local si.confirm_stimuli_data_loss = 'yes';
--     \i 20260825a_exam_stimuli_rollback.sql
--
-- psql prints "WARNING: there is already a transaction in progress" when
-- invoked this way, because this file opens with its own begin;. That is
-- cosmetic and expected — the inner begin is a no-op inside an open
-- transaction, and the rollback proceeds normally. Verified on the harness.
--
-- On empty tables — the realistic case, a mistake caught right after applying
-- — no flag is needed and the rollback simply runs.
--
-- WHAT SURVIVES: exam_forms, exam_form_sections and exam_questions keep every
-- row. Only the stimulus_id column is removed from exam_questions, so the
-- questions themselves and their choices are untouched — EXCEPT that any
-- choice carrying a native {visual} object will now fail the restored
-- validator. Section 0 counts those too, for the same reason.
--
-- ORDER MATTERS: triggers before the functions they call; the column before
-- the table it references; the table before the validator its CHECK uses.
-- =====================================================================

begin;

-- =====================================================================
-- 0. DATA-LOSS GUARD
-- =====================================================================
do $$
declare
  v_stimuli   bigint;
  v_refs      bigint;
  v_visuals   bigint;
  v_published bigint;
begin
  select count(*) into v_stimuli from public.exam_stimuli;
  select count(*) into v_refs    from public.exam_questions where stimulus_id is not null;
  select count(*) into v_visuals from public.exam_questions q
   where q.choices is not null
     and exists (select 1 from jsonb_array_elements(q.choices) e where e ? 'visual');
  select count(*) into v_published from public.exam_stimuli st
    join public.exam_forms f on f.id = st.form_id
   where f.status in ('published', 'retired');

  if (v_stimuli + v_refs + v_visuals) > 0
     and coalesce(current_setting('si.confirm_stimuli_data_loss', true), '') <> 'yes' then
    raise exception
      'ROLLBACK REFUSED: % stimulus row(s) (% in published/retired forms), % question(s) referencing one, and % question(s) with a native choice visual would be destroyed. Set si.confirm_stimuli_data_loss to ''yes'' in this transaction to proceed.',
      v_stimuli, v_published, v_refs, v_visuals
      using errcode = '42501';
  end if;
end $$;

-- =====================================================================
-- 1. TRIGGERS FIRST
-- =====================================================================
drop trigger if exists exam_questions_stimulus_same_form on public.exam_questions;
drop trigger if exists exam_stimuli_touch_row            on public.exam_stimuli;
drop trigger if exists exam_stimuli_frozen               on public.exam_stimuli;

drop function if exists public.exam_question_stimulus_same_form();

-- =====================================================================
-- 2. RESTORE exam_content_frozen_guard() TO ITS M3 FORM
-- =====================================================================
-- Identical to 20260824a_question_spine.sql §7b: the only change the forward
-- file made was adding 'exam_stimuli' to the first condition.
create or replace function public.exam_content_frozen_guard()
returns trigger
language plpgsql
as $$
declare
  v_form_id uuid;
  v_status  text;
  v_code    text;
begin
  if tg_table_name = 'exam_form_sections' then
    v_form_id := coalesce(new.form_id, old.form_id);
  else
    select s.form_id into v_form_id
      from public.exam_form_sections s
     where s.id = coalesce(new.section_id, old.section_id);
  end if;

  select f.status, f.code into v_status, v_code
    from public.exam_forms f where f.id = v_form_id;

  if v_status in ('published', 'retired') then
    raise exception '%: form % is % and its content is immutable — corrections are a new form code',
      tg_table_name, v_code, v_status using errcode = '42501';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

-- =====================================================================
-- 3. RESTORE exam_question_choices_ok() TO ITS M3 FORM
-- =====================================================================
-- Identical to 20260824a_question_spine.sql §1: keys exactly {id,text}, no
-- visual path. Any choice still carrying a visual will now violate the CHECK,
-- which is why section 0 counted them.
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

-- =====================================================================
-- 4. COLUMN, THEN TABLE, THEN VALIDATOR
-- =====================================================================
drop index if exists public.exam_questions_stimulus_idx;
alter table public.exam_questions drop column if exists stimulus_id;

drop table if exists public.exam_stimuli;

drop function if exists public.exam_stimulus_spec_ok(text, jsonb);

commit;

-- =====================================================================
-- VERIFICATION — run AFTER rolling back
-- =====================================================================
-- 1. The table, column and validator are gone:
--      select to_regclass('public.exam_stimuli');                        -- NULL
--      select count(*) from information_schema.columns
--       where table_schema='public' and table_name='exam_questions'
--         and column_name='stimulus_id';                                 -- 0
--      select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--       where n.nspname='public' and p.proname in
--       ('exam_stimulus_spec_ok','exam_question_stimulus_same_form');    -- 0
--
-- 2. M3's five functions and B1's trigger are untouched:
--      select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--       where n.nspname='public' and p.proname in
--       ('publish_exam_form','exam_content_frozen_guard','exam_forms_guard',
--        'exam_questions_touch','exam_question_choices_ok');             -- 5
--      select string_agg(t.tgname, ', ' order by t.tgname) from pg_trigger t
--        join pg_class c on c.oid=t.tgrelid
--       where not t.tgisinternal and c.relname='exam_forms';
--    -- exam_forms_guard_row, exam_forms_insert_guard_row
--
-- 3. The restored validator rejects a visual again:
--      select public.exam_question_choices_ok('mcq',
--        '[{"id":"A","text":"a","visual":{}},{"id":"B","text":"b"},
--          {"id":"C","text":"c"},{"id":"D","text":"d"}]'::jsonb);        -- false
--
-- 4. Spine content is intact:
--      select count(*) from public.exam_forms;          -- unchanged
--      select count(*) from public.exam_form_sections;  -- unchanged
--      select count(*) from public.exam_questions;      -- unchanged
