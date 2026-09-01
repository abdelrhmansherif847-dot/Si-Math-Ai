-- =====================================================================
-- Rollback for 20260901a — and this one really is an undo
-- =====================================================================
-- STATUS: 🟡 PREPARED, deliberately unapplied.
--
-- Unlike most rollbacks in this project, this restores the prior state exactly:
-- the constraint goes back to the inline expression it held before, copied
-- verbatim from pg_get_constraintdef() as read on 2026-09-01, and the function
-- is dropped. No row is touched by either direction.
--
-- The DROP will fail if anything else has come to depend on the function by
-- then — teacher_exam_stimuli is the expected candidate. That failure is
-- correct: rolling back a shared rule while a second table still relies on it
-- would leave that table unguarded. Drop the dependent constraint first, or do
-- not roll this back.
-- =====================================================================

begin;

alter table exam_stimuli
  drop constraint if exists exam_stimuli_shape_check;

alter table exam_stimuli
  add constraint exam_stimuli_shape_check
  check (
    ((kind = 'text'::text) AND (body IS NOT NULL) AND (spec IS NULL) AND (media_ref IS NULL))
    OR ((kind = ANY (ARRAY['table'::text, 'chart'::text, 'plot'::text, 'number_line'::text]))
        AND (spec IS NOT NULL) AND (body IS NULL) AND (media_ref IS NULL))
    OR ((kind = 'figure'::text) AND (media_ref IS NOT NULL) AND (spec IS NULL) AND (body IS NULL))
  );

drop function if exists exam_stimulus_shape_ok(text, text, jsonb, text);

do $$
declare v_bad integer;
begin
  select count(*) into v_bad from exam_stimuli
   where not (
     ((kind = 'text') and (body is not null) and (spec is null) and (media_ref is null))
     or ((kind = any (array['table','chart','plot','number_line']))
         and (spec is not null) and (body is null) and (media_ref is null))
     or ((kind = 'figure') and (media_ref is not null) and (spec is null) and (body is null))
   );
  if v_bad > 0 then
    raise exception 'rollback: % stored row(s) fail the restored rule', v_bad;
  end if;
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
              where n.nspname = 'public' and p.proname = 'exam_stimulus_shape_ok') then
    raise exception 'rollback: the function still exists';
  end if;
end $$;

commit;
