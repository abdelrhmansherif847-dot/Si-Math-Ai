-- Rollback for 20260830b_pie_needs_no_reading.sql.
--
-- SAFE ONLY WHILE NO PIE QUESTION EXISTS. After this, every chart stimulus
-- requires a reading again, so a question pointing at a pie with reading NULL
-- becomes unwritable — the row survives until something updates it, then the
-- trigger refuses. Check first:
--
--   select count(*) from public.exam_questions q
--     join public.exam_stimuli st on st.id = q.stimulus_id
--    where st.spec ->> 'chartType' = 'pie';

create or replace function public.exam_stimulus_needs_reading(k text, s jsonb)
returns boolean language sql immutable parallel safe as $$
  select coalesce(
    k = 'chart'
    or (k = 'plot' and (s ->> 'frame') in ('graph', 'data')),
    false);
$$;
