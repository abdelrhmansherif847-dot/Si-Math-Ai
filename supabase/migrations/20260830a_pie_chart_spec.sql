-- =====================================================================
-- ⛔ PREPARED — NOT APPLIED. Awaiting individual approval.
-- Chosen treatment and why: scripts/pie-directions.html (direction C).
-- =====================================================================
--
-- A pie is a chart whose shape is a whole rather than an axis.
--
-- exam_stimulus_spec_ok allows chartType in ('bar','line') and requires
-- `categories` and `series` alongside it. That shape is right for a chart with
-- an axis, where every series is measured against the same categories. It is
-- the wrong shape for a pie, and forcing one into it would be a lie about what
-- the data is: a pie's parts are not a series over shared categories, they are
-- one whole divided.
--
-- So a pie carries `panels` instead — each with its own categories, its own
-- values, and optionally its own title.
--
-- WHY PANELS, PLURAL. A pie stimulus routinely shows one population cut two
-- ways: by destination and by age, by subject and by year. Those two charts are
-- ONE stimulus — a question comparing a share in the first with a share in the
-- second is only answerable because both describe the same whole — and a schema
-- that allowed a single pie per row would have split them into two rows and
-- thrown that fact away. Panels keep it.
--
-- FOUR SLICES, AT MOST. The figure grammar decided two categorical hues and
-- says in its own stylesheet that a third "is not in the decided vocabulary".
-- The chosen pie treatment answers a four-part distribution by spending those
-- two and then reaching for two NEUTRALS, so no colour was invented to draw
-- one. Five parts would have to invent one, so five parts are refused HERE as
-- well as in the renderer: a row that cannot be drawn should not be storable.
--
-- Percentages are NOT required to sum to 100. The renderer computes each
-- slice's share from the panel's own total, so counts work as well as
-- percentages, and a distribution stored as 40/30/20/10 and one stored as
-- 4/3/2/1 draw identically.
--
-- Existing rows are untouched: this widens what is accepted and narrows
-- nothing. Every bar and line spec that validates today still validates.
--
-- Rollback: 20260830a_pie_chart_spec_rollback.sql

create or replace function public.exam_pie_panels_ok(s jsonb)
returns boolean language sql immutable parallel safe as $$
  select s ? 'panels'
     and jsonb_typeof(s -> 'panels') = 'array'
     and jsonb_array_length(s -> 'panels') between 1 and 3
     and not exists (
           select 1 from jsonb_array_elements(s -> 'panels') p
            where jsonb_typeof(p) <> 'object'
               or not (p ?& array['categories','values'])
               or jsonb_typeof(p -> 'categories') <> 'array'
               or jsonb_typeof(p -> 'values') <> 'array'
               -- two parts is the fewest that divides a whole; four is what the
               -- decided vocabulary can fill
               or jsonb_array_length(p -> 'categories') not between 2 and 4
               or jsonb_array_length(p -> 'values') <> jsonb_array_length(p -> 'categories')
               or (p ? 'title' and jsonb_typeof(p -> 'title') <> 'string')
               or exists (select 1 from jsonb_array_elements(p -> 'categories') c
                           where jsonb_typeof(c) <> 'string' or length(c #>> '{}') = 0)
               or exists (select 1 from jsonb_array_elements(p -> 'values') v
                           where jsonb_typeof(v) <> 'number' or (v #>> '{}')::numeric < 0)
               -- a whole that sums to nothing has no parts to draw
               or (select coalesce(sum((v #>> '{}')::numeric), 0)
                     from jsonb_array_elements(p -> 'values') v) <= 0)
     -- a pie has no axis, so the keys that describe one are not merely unused,
     -- they are a sign the row was authored as the wrong kind of chart
     and not (s ?| array['categories','series','xLabel','yLabel']);
$$;

comment on function public.exam_pie_panels_ok(jsonb) is
  'Shape check for a chartType=pie stimulus spec: 1-3 panels, each a whole '
  'divided into 2-4 named non-negative parts summing above zero, and none of '
  'the axis keys a pie cannot have.';

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

    -- CHART: an axis chart, or a whole divided. The branch is on chartType
    -- because that is the field the renderer branches on too.
    when k = 'chart' and (s ->> 'chartType') = 'pie' then
      public.exam_pie_panels_ok(s)

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
