-- =====================================================================
-- PREPARED — NOT APPLIED.  Reviewed and approved individually before
-- apply_migration is called.  See docs/engineering/figures-field-proposal.md
-- =====================================================================
--
-- The other half of the decision the spec could not carry.
--
-- 20260827a added `frame`: what a plot IS. This adds `figures[]`: how each of
-- its curves is DRAWN — as a smooth curve, a straight-sided polygon, a set of
-- measured observations, or a set of named points. Until now that has lived in
-- a build-time table in the preview generator, whose own comment reads "the
-- second decision the spec cannot carry".
--
-- It is a semantic decision, not a rendering hint. The same array of points is
-- a parabola or a scatterplot depending on it, and the renderer must never
-- guess: a scatter drawn as a curve invents a continuous relationship the data
-- does not claim.
--
-- SCOPE, deliberately narrow. This locks ONLY the vocabulary the renderer
-- already understands today, read out of the shipped figure loop:
--
--     mode      curve | polygon | scatter | points        (the four it branches on)
--     closed    boolean, smooth curves only               (smoothPath's wrap flag)
--     vertices  boolean, polygons only                    (draws dots at corners)
--     dashed    boolean                                   (the sx-dashed class)
--     labels    string[], polygons and named points only
--
-- No new words are introduced here. Anything else is refused rather than
-- ignored, so a typo — `scattter`, or `label` for `labels` — fails at the
-- INSERT instead of silently drawing the wrong figure.
--
-- NO BACKFILL. exam_stimuli is empty; measured immediately before writing.

begin;

-- =====================================================================
-- 1. frame x mode — the combinations the system HAS a meaning for
-- =====================================================================
-- Validating each field alone is not enough: `frame` and `mode` are two halves
-- of one statement about what the figure is, and some pairs are contradictions
-- rather than merely unusual.
--
--   scatter on plane or graph — a scatter asserts MEASURED OBSERVATIONS. A
--     coordinate plane asserts geometry and a graph asserts a function; neither
--     is a sample. Named dots on a plane are `points`, which exists.
--   polygon on data — a closed straight-sided shape over measured data has no
--     reading. Refused.
--   points on data — observations on a data frame are `scatter`, and there is
--     no reason to have two ways to say it. Refused so there is exactly one.
--
-- Everything remaining is a shape the system can state a meaning for:
--   plane  curve (a circle), polygon (a triangle), points (named points)
--   graph  curve (a function), polygon (straight lines), points (a marked point)
--   data   curve (a line of best fit), scatter (the observations)
create or replace function public.exam_plot_frame_mode_ok(frame text, mode text)
returns boolean
language sql
immutable
parallel safe
as $$
  select case frame
    when 'plane' then mode in ('curve', 'polygon', 'points')
    when 'graph' then mode in ('curve', 'polygon', 'points')
    when 'data'  then mode in ('curve', 'scatter')
    else false
  end;
$$;

comment on function public.exam_plot_frame_mode_ok(text, text) is
  'Whether a plot frame and a curve mode make a statement the system has a '
  'meaning for. Refuses contradictions — a scatter on a coordinate plane, a '
  'polygon over measured data — rather than accepting any pair whose halves '
  'are individually valid.';

revoke all on function public.exam_plot_frame_mode_ok(text, text) from public;
revoke all on function public.exam_plot_frame_mode_ok(text, text) from anon, authenticated;

-- =====================================================================
-- 2. figures[] — structure, vocabulary, and agreement with curves[]
-- =====================================================================
create or replace function public.exam_plot_figures_ok(s jsonb)
returns boolean
language sql
immutable
parallel safe
as $$
  select coalesce((
    -- one figure decision per curve, in the same order. A mismatch is not a
    -- detail: figure[i] describes curve[i], and a short array silently leaves
    -- the last curve undrawn.
    jsonb_typeof(s -> 'figures') = 'array'
    and jsonb_array_length(s -> 'figures') = jsonb_array_length(s -> 'curves')
    and not exists (
      select 1
        from jsonb_array_elements(s -> 'figures') with ordinality as f(fig, n)
        join jsonb_array_elements(s -> 'curves')  with ordinality as c(cur, m)
          on m = n
       where jsonb_typeof(fig) <> 'object'
          -- the vocabulary, closed. An unknown KEY is refused too, so a typo
          -- cannot be quietly ignored by a renderer that never reads it.
          or exists (select 1 from jsonb_object_keys(fig) k
                      where k not in ('mode','closed','vertices','dashed','labels'))
          or not (fig ? 'mode')
          or (fig ->> 'mode') not in ('curve','polygon','scatter','points')
          or not public.exam_plot_frame_mode_ok(s ->> 'frame', fig ->> 'mode')

          -- booleans are booleans
          or (fig ? 'closed'   and jsonb_typeof(fig -> 'closed')   <> 'boolean')
          or (fig ? 'vertices' and jsonb_typeof(fig -> 'vertices') <> 'boolean')
          or (fig ? 'dashed'   and jsonb_typeof(fig -> 'dashed')   <> 'boolean')

          -- `closed` wraps a SMOOTH curve; linePath ignores it, so setting it on
          -- anything else is a statement the drawing will not honour.
          or (fig ? 'closed'   and (fig ->> 'mode') <> 'curve')
          -- `vertices` draws dots at a polygon's corners and means nothing else
          or (fig ? 'vertices' and (fig ->> 'mode') <> 'polygon')

          -- labels name vertices or named points, and nothing else
          or (fig ? 'labels' and (fig ->> 'mode') not in ('polygon','points'))
          or (fig ? 'labels' and (
                jsonb_typeof(fig -> 'labels') <> 'array'
                or exists (select 1 from jsonb_array_elements(fig -> 'labels') l
                            where jsonb_typeof(l) <> 'string')
                -- one label per DISTINCT vertex. A polygon that closes by
                -- repeating its first point has n-1 of them, and labelling the
                -- repeat would print the same letter twice at one corner.
                or jsonb_array_length(fig -> 'labels') <> (
                     jsonb_array_length(cur -> 'points')
                     - case when (cur -> 'points' -> 0)
                            = (cur -> 'points' -> (jsonb_array_length(cur -> 'points') - 1))
                            then 1 else 0 end)))
    )
  ), false);
$$;

comment on function public.exam_plot_figures_ok(jsonb) is
  'Validates a plot spec''s figures[]: one entry per curve in order, a mode '
  'from the four the renderer branches on, only the keys it reads, each key on '
  'a mode that honours it, one label per distinct vertex, and a frame/mode '
  'pair the system has a meaning for. Locks the existing vocabulary; it does '
  'not introduce any.';

revoke all on function public.exam_plot_figures_ok(jsonb) from public;
revoke all on function public.exam_plot_figures_ok(jsonb) from anon, authenticated;

-- =====================================================================
-- 3. required on every plot
-- =====================================================================
-- Reproduced from 20260827a byte-for-byte except inside `when k = 'plot' then`.
create or replace function public.exam_stimulus_spec_ok(k text, s jsonb)
returns boolean
language sql
immutable
parallel safe
as $$
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

    -- PLOT: a visible domain and range; what the plot IS (`frame`); the curves;
    -- and how each curve is DRAWN (`figures`). The last is new in this
    -- migration and required for the same reason frame was: the same array of
    -- points is a parabola or a scatterplot depending on it, and a renderer
    -- that guesses would invent a continuous relationship the data never
    -- claimed.
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

comment on function public.exam_stimulus_spec_ok(text, jsonb) is
  'CHECK helper for exam_stimuli.spec. Validates the SEMANTIC core of each '
  'kind (structure, types, array consistency) and never editorial judgement. '
  'kind=plot requires "frame" in (plane, graph, data) — what the plot IS — and '
  '"figures" — how each curve is DRAWN — so the renderer infers neither. '
  'An optional "display" object carries renderer hints and is deliberately '
  'left unvalidated so a published spec never freezes a UI decision.';

revoke all on function public.exam_stimulus_spec_ok(text, jsonb) from public;
revoke all on function public.exam_stimulus_spec_ok(text, jsonb) from anon, authenticated;

commit;
