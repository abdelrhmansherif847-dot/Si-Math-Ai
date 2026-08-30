-- Rollback for 20260830a_pie_chart_spec.sql.
--
-- Restores exam_stimulus_spec_ok to the definition in force before it — chart
-- accepts 'bar' and 'line' only — and drops the pie shape check.
--
-- SAFE ONLY WHILE NO PIE ROW EXISTS. The CHECK constraint is validated on write
-- rather than continuously, so an existing pie stimulus would survive this and
-- then fail the next time its row was updated. Verify first:
--
--   select count(*) from public.exam_stimuli
--    where kind = 'chart' and spec ->> 'chartType' = 'pie';
--
-- and delete or convert those rows before rolling back.

create or replace function public.exam_stimulus_spec_ok(k text, s jsonb)
returns boolean language sql immutable parallel safe as $$
  select coalesce((select case
    when s is null then false
    when jsonb_typeof(s) <> 'object' then false
    when s ? 'display' and jsonb_typeof(s -> 'display') <> 'object' then false

    when k = 'table' then
      s ?& array['headers','rows']
      and jsonb_typeof(s -> 'headers') = 'array'
      and jsonb_array_length(s -> 'headers') >= 1
      and not exists (select 1 from jsonb_array_elements(s -> 'headers') h
                       where jsonb_typeof(h) <> 'string')
      and jsonb_typeof(s -> 'rows') = 'array'
      and jsonb_array_length(s -> 'rows') >= 1
      and not exists (
            select 1 from jsonb_array_elements(s -> 'rows') r
             where jsonb_typeof(r) <> 'array'
                or jsonb_array_length(r) <> jsonb_array_length(s -> 'headers')
                or exists (select 1 from jsonb_array_elements(r) c
                            where jsonb_typeof(c) <> 'string'))
      and (not (s ? 'note') or jsonb_typeof(s -> 'note') = 'string')

    when k = 'chart' then
      s ?& array['chartType','categories','series']
      and (s ->> 'chartType') in ('bar', 'line')
      and jsonb_typeof(s -> 'categories') = 'array'
      and jsonb_array_length(s -> 'categories') >= 1
      and not exists (select 1 from jsonb_array_elements(s -> 'categories') c
                       where jsonb_typeof(c) <> 'string')
      and jsonb_typeof(s -> 'series') = 'array'
      and jsonb_array_length(s -> 'series') >= 1
      and not exists (
            select 1 from jsonb_array_elements(s -> 'series') ser
             where jsonb_typeof(ser) <> 'object'
                or not (ser ?& array['name','values'])
                or jsonb_typeof(ser -> 'name') <> 'string'
                or jsonb_typeof(ser -> 'values') <> 'array'
                or jsonb_array_length(ser -> 'values') <> jsonb_array_length(s -> 'categories')
                or exists (select 1 from jsonb_array_elements(ser -> 'values') v
                            where jsonb_typeof(v) <> 'number'))
      and (not (s ? 'xLabel') or jsonb_typeof(s -> 'xLabel') = 'string')
      and (not (s ? 'yLabel') or jsonb_typeof(s -> 'yLabel') = 'string')

    when k = 'plot' then
      s ?& array['xRange','yRange','curves','frame','figures']
      and (s ->> 'frame') in ('plane', 'graph', 'data')
      and jsonb_typeof(s -> 'xRange') = 'array' and jsonb_array_length(s -> 'xRange') = 2
      and jsonb_typeof(s -> 'yRange') = 'array' and jsonb_array_length(s -> 'yRange') = 2
      and not exists (select 1 from jsonb_array_elements(s -> 'xRange' || s -> 'yRange') n
                       where jsonb_typeof(n) <> 'number')
      and ((s -> 'xRange' ->> 0)::numeric < (s -> 'xRange' ->> 1)::numeric)
      and ((s -> 'yRange' ->> 0)::numeric < (s -> 'yRange' ->> 1)::numeric)
      and jsonb_typeof(s -> 'curves') = 'array'
      and jsonb_array_length(s -> 'curves') >= 1
      and not exists (
            select 1 from jsonb_array_elements(s -> 'curves') c
             where jsonb_typeof(c) <> 'object'
                or not ((jsonb_typeof(c -> 'expr') = 'string')
                        or (jsonb_typeof(c -> 'points') = 'array'
                            and jsonb_array_length(c -> 'points') >= 2)))
      and public.exam_plot_figures_ok(s)
      and (not (s ? 'xLabel') or jsonb_typeof(s -> 'xLabel') = 'string')
      and (not (s ? 'yLabel') or jsonb_typeof(s -> 'yLabel') = 'string')

    when k = 'number_line' then
      s ?& array['min','max']
      and jsonb_typeof(s -> 'min') = 'number'
      and jsonb_typeof(s -> 'max') = 'number'
      and (s ->> 'min')::numeric < (s ->> 'max')::numeric
      and (s ? 'segments' or s ? 'points')
      and (not (s ? 'segments') or (
            jsonb_typeof(s -> 'segments') = 'array'
            and not exists (
                  select 1 from jsonb_array_elements(s -> 'segments') g
                   where jsonb_typeof(g) <> 'object'
                      or not (g ?& array['from','to','fromClosed','toClosed'])
                      or jsonb_typeof(g -> 'from') <> 'number'
                      or jsonb_typeof(g -> 'to') <> 'number'
                      or jsonb_typeof(g -> 'fromClosed') <> 'boolean'
                      or jsonb_typeof(g -> 'toClosed') <> 'boolean')))
      and (not (s ? 'points') or (
            jsonb_typeof(s -> 'points') = 'array'
            and not exists (select 1 from jsonb_array_elements(s -> 'points') p
                             where jsonb_typeof(p) <> 'number')))

    when k = 'figure' then false

    else false
  end), false);
$$;

drop function if exists public.exam_pie_panels_ok(jsonb);
