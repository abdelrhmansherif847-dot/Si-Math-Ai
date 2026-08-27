-- =====================================================================
-- APPLIED 2026-08-27 as version 20260827135710, after individual approval.
-- Live verification before and after: docs/engineering/reading-field-proposal.md §7
-- =====================================================================
--
-- WHAT THIS IS FOR
--
-- The figure design system settled on a grammar per family with variants
-- computed rather than chosen. Two inputs drive every variant:
--
--   * resolutionOf(spec) — DERIVED. The coarsest step every marked value lands
--     on. Already implicit in the spec; nothing to store.
--   * reading            — AUTHORED. Does the student have to read a NUMBER off
--     the figure, or only judge its SHAPE? Nothing in the geometry can answer
--     that, so it has to be recorded.
--
-- And the renderer needs one more thing it currently has no way to know: what
-- KIND of plot a plot is. A triangle, a function graph and a scatterplot are
-- all kind='plot' today, and they want opposite treatments. The renderer must
-- never infer that from the shape of the data — inference is exactly what this
-- schema refuses everywhere else.
--
-- So two additions, and they sit in different places on purpose:
--
--   spec.frame            on exam_stimuli   — a property of the FIGURE.
--                                             A triangle is a triangle whatever
--                                             is asked about it.
--   exam_questions.reading                  — a property of the QUESTION.
--                                             exam_questions.stimulus_id is
--                                             documented as many-to-one ("several
--                                             questions may reference ONE
--                                             stimulus"), and two questions can
--                                             share a graph while asking for
--                                             different things. Putting reading
--                                             on the stimulus would force them
--                                             to agree.
--
-- WHAT THIS IS NOT
--
-- reading is NOT a design switch. It is refused wherever it has no meaning —
-- on a question with no stimulus, on a table, a number line, a passage, and on
-- a coordinate-geometry plot, whose grid is the measuring instrument and is
-- therefore never optional. Storing it there fails. That is what keeps it a
-- statement about the question rather than a knob.
--
-- NO BACKFILL. Measured on the live project immediately before writing this:
-- exam_forms 0, exam_form_sections 0, exam_questions 0, exam_stimuli 0. There
-- is no existing row to migrate and no default to invent, which is precisely
-- why this change is cheap now and expensive later.

begin;

-- =====================================================================
-- 1. WHERE reading APPLIES — the rule, in one named place
-- =====================================================================
-- Both triggers below consult this, and so can any pre-flight check. Keeping
-- the rule in one function is what stops "when does reading apply" from
-- drifting into two slightly different answers.
create or replace function public.exam_stimulus_needs_reading(k text, s jsonb)
returns boolean
language sql
immutable
parallel safe
as $$
  -- A chart is always measured data, so its reference lines always depend on
  -- what the question asks. A plot depends on which kind of plot it is:
  --   frame='plane' — coordinate geometry. The grid IS the instrument and is
  --                   always drawn, so reading changes nothing and is refused.
  --   frame='graph' — a function graph. The curve is the subject; a grid
  --                   appears only when a value must be read off it.
  --   frame='data'  — measured data. Same question, answered with horizontal
  --                   reference lines.
  select coalesce(
    k = 'chart'
    or (k = 'plot' and (s ->> 'frame') in ('graph', 'data')),
    false);
$$;

comment on function public.exam_stimulus_needs_reading(text, jsonb) is
  'True when a stimulus''s rendering depends on exam_questions.reading. The '
  'single source of truth for where reading applies: consulted by the triggers '
  'on both exam_questions and exam_stimuli so the two cannot disagree.';

revoke all on function public.exam_stimulus_needs_reading(text, jsonb) from public;
revoke all on function public.exam_stimulus_needs_reading(text, jsonb) from anon, authenticated;

-- =====================================================================
-- 2. spec.frame — required on every plot
-- =====================================================================
-- The plot branch gains two lines. Everything else in this function is
-- reproduced byte-for-byte from 20260825a so the diff is reviewable: the only
-- change is inside `when k = 'plot' then`.
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

    -- PLOT: a visible domain and range, plus curves given either as an
    -- expression or as explicit points. The visible window is semantic: it
    -- decides what a student can actually read off the graph.
    --
    -- NEW IN THIS MIGRATION — `frame`, required, enumerated. It says what the
    -- plot IS, which is a semantic fact about the mathematics and not a
    -- rendering hint:
    --   'plane' — a coordinate plane where SHAPE carries meaning. Equal scales
    --             are mandatory: a circle must be round, a right angle right.
    --   'graph' — the graph of a function. The curve is the subject; an x unit
    --             need not equal a y unit.
    --   'data'  — measured data on two different quantities. No origin, no
    --             equal scales, none of the plane's conventions apply.
    --
    -- It is REQUIRED rather than defaulted. A default would be the renderer
    -- guessing with extra steps, and there are no existing rows to accommodate.
    when k = 'plot' then
      s ?& array['xRange','yRange','curves','frame']
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
  'kind=plot additionally requires "frame" in (plane, graph, data): what the '
  'plot IS, so the renderer never infers it from the shape of the data. '
  'An optional "display" object carries renderer hints and is deliberately '
  'left unvalidated so a published spec never freezes a UI decision.';

revoke all on function public.exam_stimulus_spec_ok(text, jsonb) from public;
revoke all on function public.exam_stimulus_spec_ok(text, jsonb) from anon, authenticated;

-- =====================================================================
-- 3. exam_questions.reading
-- =====================================================================
alter table public.exam_questions
  add column reading text;

alter table public.exam_questions
  add constraint exam_questions_reading_check
  check (reading is null or reading in ('shape', 'value'));

comment on column public.exam_questions.reading is
  'What this question asks the student to get from its stimulus. '
  '"value" — read a numeric value or position off the figure with precision. '
  '"shape" — judge shape, relationship or behaviour, without extracting a '
  'precise value. SEMANTIC, not a design switch: it is REFUSED (must be NULL) '
  'wherever it has no meaning — no stimulus, a table, a number line, a '
  'passage, or a coordinate-geometry plot whose grid is never optional. '
  'Enforced by the exam_questions_reading_applies trigger.';

-- =====================================================================
-- 4. reading is required exactly where it is consumed, and refused elsewhere
-- =====================================================================
-- The house rule from the same-form trigger applies: a wrong combination is
-- made UNSTORABLE, not merely unpublishable. A nullable column with a renderer
-- default would be the "vague fallback" this whole design exists to avoid.
create or replace function public.exam_question_reading_applies()
returns trigger
language plpgsql
as $$
declare
  v_kind text;
  v_spec jsonb;
  v_needs boolean;
begin
  if new.stimulus_id is null then
    if new.reading is not null then
      raise exception
        'exam_questions: reading is meaningless without a stimulus and must be NULL'
        using errcode = '23514';
    end if;
    return new;
  end if;

  select st.kind, st.spec into v_kind, v_spec
    from public.exam_stimuli st
   where st.id = new.stimulus_id;

  -- A missing stimulus is the same-form trigger's problem, not this one.
  if v_kind is null then
    return new;
  end if;

  v_needs := public.exam_stimulus_needs_reading(v_kind, v_spec);

  if v_needs and new.reading is null then
    raise exception
      'exam_questions: stimulus % (kind=%, frame=%) renders differently by reading, so reading must be ''shape'' or ''value''',
      new.stimulus_id, v_kind, coalesce(v_spec ->> 'frame', '-')
      using errcode = '23514';
  end if;

  if not v_needs and new.reading is not null then
    raise exception
      'exam_questions: stimulus % (kind=%, frame=%) does not render by reading, so reading must be NULL',
      new.stimulus_id, v_kind, coalesce(v_spec ->> 'frame', '-')
      using errcode = '23514';
  end if;

  return new;
end;
$$;

comment on function public.exam_question_reading_applies() is
  'Requires exam_questions.reading exactly where the stimulus renders by it, '
  'and refuses it everywhere else. The second half is the important one: it is '
  'what stops reading becoming a general design knob applied at will.';

create trigger exam_questions_reading_applies
  before insert or update of reading, stimulus_id on public.exam_questions
  for each row execute function public.exam_question_reading_applies();

revoke all on function public.exam_question_reading_applies() from public;
revoke all on function public.exam_question_reading_applies() from anon, authenticated;

-- =====================================================================
-- 5. ...and the stimulus cannot change out from under it
-- =====================================================================
-- Editing spec.frame from 'plane' to 'graph' would leave every referencing
-- question needing a reading it does not have. Published forms are frozen, so
-- this can only happen in draft — which is exactly where it should be caught.
create or replace function public.exam_stimulus_reading_still_valid()
returns trigger
language plpgsql
as $$
declare
  v_before boolean;
  v_after  boolean;
  v_bad    uuid;
begin
  v_before := public.exam_stimulus_needs_reading(old.kind, old.spec);
  v_after  := public.exam_stimulus_needs_reading(new.kind, new.spec);

  if v_before = v_after then
    return new;
  end if;

  select q.id into v_bad
    from public.exam_questions q
   where q.stimulus_id = new.id
     and ((v_after and q.reading is null) or (not v_after and q.reading is not null))
   limit 1;

  if v_bad is not null then
    raise exception
      'exam_stimuli: changing this stimulus would leave question % with a reading that no longer applies; update the question first',
      v_bad
      using errcode = '23514';
  end if;

  return new;
end;
$$;

comment on function public.exam_stimulus_reading_still_valid() is
  'Refuses a stimulus edit that would invalidate reading on a question already '
  'referencing it. The exam_questions trigger guards the question side; this '
  'guards the stimulus side, so the pair cannot be desynchronised from either '
  'direction.';

create trigger exam_stimuli_reading_still_valid
  before update of kind, spec on public.exam_stimuli
  for each row execute function public.exam_stimulus_reading_still_valid();

revoke all on function public.exam_stimulus_reading_still_valid() from public;
revoke all on function public.exam_stimulus_reading_still_valid() from anon, authenticated;

commit;
