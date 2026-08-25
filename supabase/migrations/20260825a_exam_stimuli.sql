-- =====================================================================
-- Mock Exam v2 · M4 — Assessment Capabilities: structured stimuli
-- =====================================================================
-- STATUS: APPLIED to production 2026-08-25, after explicit approval, as
--         version 20260825221601 (name: exam_stimuli). Revision 2 — the
--         revision that closed kind='figure' to the SVG exception path.
--
--         Verified live on PostgreSQL 17.6 immediately afterwards. The four
--         native kinds validate, seven missing-key cases fail closed, every
--         figure spec is refused, and the CHECK constraints bite: a table
--         carrying media, a figure with a free-form spec and a figure as
--         raster all returned 23514, while a native chart spec, a text body
--         and the SVG exception were accepted. The behavioural probe ran
--         inside a subtransaction that always rolls back and left ZERO rows.
--
--         publish_exam_form was captured before and after: its body md5 is
--         byte-identical (098d05724e2f2a34a7c17cb8c68ded3d) and its ACL
--         unchanged. B1's two triggers on exam_forms survive.
--
-- SCOPE: one new table, one new column, one new validator, two widened
--        functions, and the publish gate extended to cover them. The Core is
--        untouched: no change to the lifecycle, to B1, to B5, to security
--        boundaries, to originality controls or to the taxonomy.
--
-- =====================================================================
-- THE PRINCIPLE THIS FILE ENFORCES
-- =====================================================================
--   Standard assessment visuals are STRUCTURED CONTENT, not image assets.
--   Native rendering is the default; SVG media is a narrow exception path.
--
-- This is not a preference expressed in a comment. Below, a table, a chart, a
-- plot and a number line are STRUCTURALLY INCAPABLE of being an image: the
-- shape CHECK refuses any row of those kinds that carries media_ref. Only
-- kind='figure' may take the exception, only as SVG, only with a written
-- reason, and only with a content hash.
--
-- Grounding: of the eight distinct visuals in a complete official EST I Math
-- reference exam, SEVEN are natively representable (three tables, one plotted
-- curve, one grouped bar chart, four coordinate planes used AS CHOICES, four
-- number lines used AS CHOICES). Exactly one — a construction of two
-- intersecting circles with labelled points and a right-angle mark — is a
-- genuine exception. The rule matches observed reality; it is not aspiration.
--
-- =====================================================================
-- SEMANTIC CORE vs DISPLAY HINTS
-- =====================================================================
-- A published form is immutable, so its spec is frozen forever. Anything in
-- the spec that is really a RENDERING decision would freeze a UI choice into
-- content and outlive the renderer that motivated it.
--
-- So each spec separates:
--   * a semantic core  — what the visual MEANS, validated strictly below
--   * an optional "display" object — hints the renderer MAY honour, validated
--     only as "an object if present", never for content
--
-- Worked examples of the distinction:
--   table orientation (rows vs columns) → DISPLAY. The meaning is the headers
--        and the rows; which way it is drawn is presentation.
--   table note ("Key: 3 | 6 means 36 minutes") → SEMANTIC. Without it the data
--        cannot be interpreted at all.
--   number-line closed/open endpoints → SEMANTIC. They encode < versus <=.
--   grid spacing on a plot → DISPLAY.
--
-- The validator therefore checks STRUCTURE (types, required keys, array
-- consistency) and never editorial judgement (how many categories a chart
-- ought to have, what a label should say). Over-constraining here would make
-- the schema an editor rather than a store.
--
-- =====================================================================
-- WHAT THIS FILE DELIBERATELY DOES NOT DO
-- =====================================================================
--   * No storage bucket. Nothing needs one until a real 'figure' exception
--     exists, and an unused bucket is an unguarded surface.
--   * No accepted_answers column. EST and ACT are 100% multiple choice; only
--     the SAT's student-produced response needs answer equivalence, so it has
--     no consumer here and its validation could not be exercised against real
--     content. Deferring is safe and was checked: adding a nullable column
--     later is a plain ALTER, published MCQ rows would correctly hold NULL,
--     and no SPR question can exist before the column does, so no published
--     row ever needs back-filling.
--   * No renderer. Rendering is delivery-phase work and belongs in _shared/
--     so preview and delivery cannot draw the same question two ways.
--   * No geometry description language, and no free-form figure spec either.
--     kind='figure' accepts ONLY the SVG exception (media + hash + written
--     reason); a spec is refused outright. Accepting arbitrary JSON under
--     kind='figure' would be a hole in the schema, not a capability: it has
--     no contract, no guaranteed renderer, and publication would freeze it
--     forever. A native figure system becomes its own capability once real
--     cases show what it must express.
--
-- ATOMICITY: begin; first, commit; last, nothing after — the M1/M3/B1/B5 shape.
-- =====================================================================

begin;

-- =====================================================================
-- 1. SPEC VALIDATOR — structure, not editorial judgement
-- =====================================================================
-- The exam_question_choices_ok pattern, applied to stimulus specs. Each kind
-- validates only its semantic core; a "display" key is permitted and left
-- unvalidated beyond being an object.
create or replace function public.exam_stimulus_spec_ok(k text, s jsonb)
returns boolean
language sql
immutable
parallel safe
as $$
  -- FAIL CLOSED. Every branch below compares jsonb_typeof(...) against a
  -- literal, and jsonb_typeof() of an ABSENT key is NULL, not a mismatch — so
  -- a missing required key produces NULL rather than false, and a CHECK
  -- constraint treats NULL as satisfied. That is the same NULL-propagation
  -- trap that made B1's "obvious" fix a silent no-op. The presence guards
  -- (s ?& array[...]) catch it at the source; this coalesce is the backstop.
  select coalesce((select case
    -- display, when present, must be an object; its contents are the
    -- renderer's business and are deliberately not constrained here.
    when s is null then false
    when jsonb_typeof(s) <> 'object' then false
    when s ? 'display' and jsonb_typeof(s -> 'display') <> 'object' then false

    -- TABLE: headers[] of text, rows[][] of text, every row the same width.
    -- note is optional and semantic (a stem-and-leaf key, for instance).
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

    -- CHART: categories[] of text and series[] of {name, values[]}, each
    -- series carrying exactly one value per category.
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
    when k = 'plot' then
      s ?& array['xRange','yRange','curves']
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

    -- NUMBER LINE: a visible interval plus segments and/or points. Closed and
    -- open endpoints are semantic — they are the difference between < and <=.
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

    -- FIGURE: there is NO native figure spec in M4, so nothing can satisfy
    -- this branch. We refused to invent a geometry description language on
    -- speculation — and the consequence must be faced rather than papered
    -- over: if no contract exists, the database must not accept content
    -- claiming to meet one. An open spec here would let arbitrary JSON in
    -- under a respectable name and then FREEZE it at publication, with no
    -- agreed meaning and no renderer guaranteed to draw it.
    --
    -- So kind='figure' is the SVG exception path only (the shape CHECK
    -- requires media_ref and forbids spec), and this branch returns false so
    -- a direct call cannot smuggle one in either. A real native figure system
    -- becomes its own capability once actual cases show what it must express.
    when k = 'figure' then false

    else false
  end), false);
$$;

comment on function public.exam_stimulus_spec_ok(text, jsonb) is
  'CHECK helper for exam_stimuli.spec. Validates the SEMANTIC core of each '
  'kind (structure, types, array consistency) and never editorial judgement. '
  'An optional "display" object carries renderer hints and is deliberately '
  'left unvalidated so a published spec never freezes a UI decision.';

revoke all on function public.exam_stimulus_spec_ok(text, jsonb) from public;
revoke all on function public.exam_stimulus_spec_ok(text, jsonb) from anon, authenticated;

-- =====================================================================
-- 2. exam_stimuli
-- =====================================================================
create table public.exam_stimuli (
  id            uuid        primary key default gen_random_uuid(),
  form_id       uuid        not null references public.exam_forms (id) on delete cascade,

  kind          text        not null,

  -- The line a real exam prints above a shared stimulus, e.g.
  -- "Questions 9 to 11 refer to the information below". Part of the
  -- experience, so it is content rather than presentation.
  label         text,

  -- kind='text' only: a displayed equation, a data list, a short passage.
  body          text,

  -- Native structured content for every visual kind. See the header for why
  -- this is the default rather than an image.
  spec          jsonb,

  -- THE EXCEPTION PATH. Constrained hard below.
  media_ref     text,
  media_kind    text,
  media_sha256  text,
  media_reason  text,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),

  constraint exam_stimuli_kind_check  check (kind in ('text','table','chart','plot','number_line','figure')),
  constraint exam_stimuli_label_check check (label is null or char_length(label) between 1 and 200),
  constraint exam_stimuli_body_check  check (body  is null or char_length(body)  between 1 and 8000),

  -- ── THE PRINCIPLE, AS A CONSTRAINT ────────────────────────────────────
  -- A table, chart, plot or number line CANNOT be an image. Not discouraged:
  -- impossible. The INSERT fails.
  constraint exam_stimuli_shape_check check (
       (kind = 'text'
          and body is not null and spec is null and media_ref is null)
    or (kind in ('table','chart','plot','number_line')
          and spec is not null and body is null and media_ref is null)
    -- figure is the EXCEPTION PATH ONLY: media required, spec forbidden.
    -- See the validator's figure branch for why there is no native spec.
    or (kind = 'figure'
          and media_ref is not null and spec is null and body is null)
  ),

  constraint exam_stimuli_spec_check check (spec is null or public.exam_stimulus_spec_ok(kind, spec)),

  -- ── THE EXCEPTION MUST JUSTIFY ITSELF ─────────────────────────────────
  -- Vector only, hashed so tampering with the stored object is detectable
  -- (the frozen guard freezes rows, never storage), and accompanied by a
  -- written reason an auditor can read.
  constraint exam_stimuli_media_check check (
    media_ref is null
    or (media_kind = 'svg' and media_sha256 is not null and media_reason is not null)
  ),
  constraint exam_stimuli_media_kind_check check (media_kind is null or media_kind = 'svg'),
  constraint exam_stimuli_sha_check       check (media_sha256 is null or media_sha256 ~ '^[0-9a-f]{64}$'),
  constraint exam_stimuli_reason_check    check (media_reason is null or char_length(media_reason) between 10 and 500)
);

comment on table public.exam_stimuli is
  'Structured stimuli for exam questions: shared passages/graphs/tables, '
  'single-question figures, and displayed equations. Standard visuals are '
  'NATIVE structured data (spec) — table, chart, plot and number_line are '
  'constrained so they can never be an image. kind=figure is the SVG exception '
  'path ONLY — media with a hash and a written reason; a free-form spec is '
  'refused, because content with no contract must not become immutable.';

comment on column public.exam_stimuli.spec is
  'Semantic structured content, validated by exam_stimulus_spec_ok(). An '
  'optional "display" object may carry renderer hints and is left '
  'unvalidated: a published spec must not freeze a UI decision.';

comment on column public.exam_stimuli.media_kind is
  'CHECK-locked to ''svg''. Widening to raster is a reviewed migration '
  'dropping exam_stimuli_media_kind_check — deliberate and visible.';

-- =====================================================================
-- 3. exam_questions.stimulus_id
-- =====================================================================
-- Nullable: most questions carry no stimulus. RESTRICT rather than SET NULL,
-- so deleting a stimulus that questions still reference fails loudly instead
-- of silently detaching content from the question that needs it.
alter table public.exam_questions
  add column stimulus_id uuid references public.exam_stimuli (id) on delete restrict;

comment on column public.exam_questions.stimulus_id is
  'Optional stimulus. Several questions may reference ONE stimulus — that is '
  'how a shared passage is modelled. A reference may not cross forms: '
  'exam_questions carries no form_id so a composite FK is unavailable, and '
  'the guarantee is made instead by the exam_questions_stimulus_same_form '
  'trigger at write time, which makes a wrong reference unstorable rather '
  'than merely unpublishable. publish_exam_form() is not involved.';

-- =====================================================================
-- 4. CHOICES MAY CARRY A NATIVE VISUAL — NEVER AN IMAGE
-- =====================================================================
-- Widened from {id,text} to allow an optional "visual" spec, so a question
-- whose OPTIONS are graphs or number lines is representable. Both real cases
-- observed (four coordinate planes; four number lines) are native.
--
-- text stays REQUIRED even when a visual is present: it is the alt text, and
-- an option a screen reader cannot announce is an option some students cannot
-- answer. There is deliberately no media path in choices at all.
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
               or (select count(*) from jsonb_object_keys(e)) not between 2 and 3
               or not (e ? 'id') or not (e ? 'text')
               or jsonb_typeof(e -> 'id') <> 'string'
               or jsonb_typeof(e -> 'text') <> 'string'
               or (e ->> 'id') not in ('A', 'B', 'C', 'D')
               or char_length(e ->> 'text') not between 1 and 2000
               -- the only permitted third key, and it must be a native spec
               or ((select count(*) from jsonb_object_keys(e)) = 3
                   and not (e ? 'visual'))
               or (e ? 'visual'
                   and not (jsonb_typeof(e -> 'visual') = 'object'
                            and jsonb_typeof(e -> 'visual' -> 'kind') = 'string'
                            and public.exam_stimulus_spec_ok(e -> 'visual' ->> 'kind',
                                                             e -> 'visual' -> 'spec')))
          )
      and (select count(distinct e ->> 'id') from jsonb_array_elements(ch) e) = 4
    else false
  end;
$$;

comment on function public.exam_question_choices_ok(text, jsonb) is
  'CHECK helper for exam_questions.choices. mcq: exactly 4 objects keyed '
  '{id,text} plus an optional native {visual:{kind,spec}}; ids A-D distinct; '
  'text 1-2000 chars and ALWAYS required, serving as alt text when a visual '
  'is present. Choices carry no media path by design. grid_in: NULL.';

-- =====================================================================
-- 5. STIMULI FREEZE WITH THE FORM THEY BELONG TO
-- =====================================================================
-- exam_content_frozen_guard() already resolves a form id per table. Stimuli
-- carry form_id directly, exactly as sections do, so this is a purely
-- additive one-condition change and the freeze rule stays in ONE place.
--
-- (Contrast B1, where extending the live exam_forms_guard() was rejected: OLD
-- is unassigned on INSERT, so that extension would have failed silently.
-- There is no such incompatibility here.)
create or replace function public.exam_content_frozen_guard()
returns trigger
language plpgsql
as $$
declare
  v_form_id uuid;
  v_status  text;
  v_code    text;
begin
  if tg_table_name in ('exam_form_sections', 'exam_stimuli') then
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

create trigger exam_stimuli_frozen
  before insert or update or delete on public.exam_stimuli
  for each row execute function public.exam_content_frozen_guard();

create trigger exam_stimuli_touch_row
  before update on public.exam_stimuli
  for each row execute function public.exam_questions_touch();

-- =====================================================================
-- 6. INDEXES
-- =====================================================================
create index exam_stimuli_form_idx      on public.exam_stimuli (form_id);
create index exam_questions_stimulus_idx on public.exam_questions (stimulus_id);

-- =====================================================================
-- 7. RLS AND PRIVILEGES — the M3 mirror, with the B5 ordering
-- =====================================================================
-- pg_default_acl grants full DML on every new table to anon, authenticated
-- and service_role at creation. Without the revoke below this table arrives
-- fully writable by anonymous traffic.
alter table public.exam_stimuli enable row level security;

revoke all on table public.exam_stimuli from anon, authenticated;
grant select on table public.exam_stimuli to authenticated;

-- Admin read only. No student path of any kind exists, exactly as for the
-- three tables this one joins.
create policy exam_stimuli_admin_read on public.exam_stimuli
  for select to authenticated
  using (has_role_at_least('admin'::user_role));

-- =====================================================================
-- 8. A STIMULUS REFERENCE MAY NOT CROSS FORMS — UNSTORABLE, NOT MERELY
--    UNPUBLISHABLE
-- =====================================================================
-- exam_questions carries no form_id (it reaches the form through its
-- section), so the composite-FK trick used for taxonomy is unavailable here.
-- But the RULE is the same one M3 stated when it made a subtopic that
-- disagrees with its topic unstorable rather than unpublishable: a reference
-- that is simply wrong should fail at the moment it is written, not hours
-- later at publication.
--
-- This is a single-row check (one question, one lookup), so unlike variant
-- mixing it is NOT a cross-row rule and does belong in a trigger.
--
-- NOTE ON THE PUBLISH GATE: publish_exam_form() is deliberately NOT modified
-- by this migration. The dangerous rule is enforced here, at write time. The
-- only remaining stimulus rule — a stimulus that no question references — is
-- untidiness rather than a hazard: it shows a student nothing and breaks
-- nothing. It is reported as a pre-flight WARNING, which costs no schema
-- change and leaves a security-critical function untouched.
create or replace function public.exam_question_stimulus_same_form()
returns trigger
language plpgsql
as $$
declare
  v_question_form uuid;
  v_stimulus_form uuid;
begin
  if new.stimulus_id is null then
    return new;
  end if;

  select s.form_id into v_question_form
    from public.exam_form_sections s
   where s.id = new.section_id;

  select st.form_id into v_stimulus_form
    from public.exam_stimuli st
   where st.id = new.stimulus_id;

  if v_question_form is distinct from v_stimulus_form then
    raise exception
      'exam_questions: stimulus % belongs to a different form than this question''s section',
      new.stimulus_id
      using errcode = '23503';
  end if;

  return new;
end;
$$;

comment on function public.exam_question_stimulus_same_form() is
  'Refuses a question whose stimulus belongs to another form. The composite-FK '
  'approach used for taxonomy is unavailable because exam_questions has no '
  'form_id, so the same guarantee is made with a single-row trigger: a wrong '
  'reference is unstorable, not merely unpublishable.';

create trigger exam_questions_stimulus_same_form
  before insert or update of stimulus_id, section_id on public.exam_questions
  for each row execute function public.exam_question_stimulus_same_form();

revoke all on function public.exam_question_stimulus_same_form() from public;
revoke all on function public.exam_question_stimulus_same_form() from anon, authenticated;

commit;
