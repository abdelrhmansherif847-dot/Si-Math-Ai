-- =====================================================================
-- Mock Exam v2 · M3 — Question Spine (content architecture only)
-- =====================================================================
-- STATUS: ⛔ PREPARED — NOT YET APPLIED. Awaiting owner approval.
--         Revision 2. Fixes five RAISE format strings in publish_exam_form()
--         whose '%%%' pattern left more arguments than placeholders — caught by
--         the validation harness at compile time, before anything else ran (the
--         file's begin/commit atomicity held: zero objects were created by the
--         failed rev 1 apply). Message formatting only; no check, constraint,
--         grant or behaviour differs from revision 1.
--         Revision 1 was drafted against the P6 design approved 2026-08-24,
--         all four explicit points YES and two clarifications locked.
-- DEPENDS ON: taxonomy_topics / taxonomy_subtopics (live, 5 + 33 rows,
--         text ids, version 1 — verified in production before drafting).
-- FOLLOWED BY: nothing automatic. Delivery, attempts, answers, scoring and
--         Saved Questions (M4) are separate future approvals.
--
-- WHAT THIS IS
-- ------------
-- The content spine for originally authored Si Math exams:
-- exam_forms → exam_form_sections → exam_questions. Authoring can begin the
-- moment it is applied. NOTHING here is reachable by a student: no student RLS
-- policy exists on any of the three tables, no client code consumes them, and
-- no delivery mechanism exists. Applying this changes no student's experience.
--
-- TRUTH OWNERSHIP (decision C, locked 2026-08-24)
-- -----------------------------------------------
-- The Question Spine is the sole authority for correctness of questions it
-- actually delivers — and only those. Self-reported performance remains a
-- separate, permanent evidence class for externally sourced work. The Weakness
-- Analyzer remains the sole authority for weakness across both. This migration
-- builds the authority's CONTENT; delivery and measurement come later, behind
-- their own approvals.
--
-- ADAPTIVE-READY, NOT ADAPTIVELY ROUTED
-- -------------------------------------
--   ┌───────────────────────────────────────────────────────────────────┐
--   │  exam_form_sections.variant_id exists so SAT_FULL Module 2 can    │
--   │  carry two content variants (standard / advanced). ITS PRESENCE   │
--   │  ACTIVATES NO ROUTING. No routing policy is implied, approved or  │
--   │  implemented anywhere. See exam-registry.js — the same box guards │
--   │  the client side, and the four gates in                           │
--   │  docs/roadmap/mock-exam-v2-p2-adaptive-proposal.md still stand.   │
--   └───────────────────────────────────────────────────────────────────┘
-- The variant VOCABULARY is registry-owned: no CHECK below names 'standard' or
-- 'advanced', exactly as M1 refused to CHECK exam_code against a list. The
-- publish gate validates stored variants against the registry-derived
-- expectation at publication time.
--
-- DRAFT-LENIENT, PUBLISH-STRICT
-- -----------------------------
-- Table constraints below enforce only always-true invariants (shape,
-- vocabulary, referential integrity). Publication-readiness — attestation,
-- difficulty set, counts matching the registry structure — is enforced by
-- publish_exam_form() in §8, fail-closed. An author can save half-finished
-- work; a half-finished form cannot become an exam.
--
-- PUBLISHED FORMS ARE IMMUTABLE (decision 1)
-- ------------------------------------------
-- Once published, a form and every section and question in it reject UPDATE,
-- DELETE and INSERT (§7). A correction is a NEW form code; the old form
-- retires and remains the historical record. This is not editorial preference:
-- when attempts later reference a form, the content they were graded against
-- must be tamper-evident, or "measured truth" quietly loses its meaning.
--
-- published_structure IS A HISTORICAL SNAPSHOT, NOT A SECOND AUTHORITY
-- --------------------------------------------------------------------
-- The registry remains the authority for CURRENT exam structure. At publish,
-- the form stores the exact expectation it was verified against, so a future
-- registry change never retroactively reinterprets or invalidates historical
-- content. Read it for audit; never validate future forms against it.
--
-- THE ONE TOUCH ON AN EXISTING TABLE (decision 3)
-- -----------------------------------------------
-- §0 adds a UNIQUE constraint on taxonomy_subtopics (id, topic_id) — additive,
-- no data change — so exam_questions can carry a composite FK making a
-- subtopic that disagrees with its topic UNSTORABLE (23503), not merely
-- unpublishable. Verified against production PG 17.6 before drafting, along
-- with UNIQUE NULLS NOT DISTINCT semantics and the choices validator.
--
-- ATOMICITY: begin; first, commit; last, nothing after — the M1 construction,
-- atomic under either reading of the migration runner.
-- =====================================================================

begin;

-- =====================================================================
-- 0. TAXONOMY SUPPORT CONSTRAINT — enables the composite FK in §4
-- =====================================================================
-- Additive only. taxonomy_subtopics.id is already the primary key, so this
-- uniqueness is implied data-wise; declaring (id, topic_id) UNIQUE is what
-- PostgreSQL requires before a composite FK may reference the pair.
alter table public.taxonomy_subtopics
  add constraint taxonomy_subtopics_id_topic_uq unique (id, topic_id);

comment on constraint taxonomy_subtopics_id_topic_uq on public.taxonomy_subtopics is
  'Support constraint for exam_questions'' composite (subtopic_id, topic_id) FK, '
  'so a question can never store a subtopic that disagrees with its topic. '
  'Added by the Question Spine migration (M3); additive, no data change.';

-- =====================================================================
-- 1. CHOICES VALIDATOR — the M1 metadata_ok pattern, for answer choices
-- =====================================================================
-- mcq      → exactly 4 objects, keys exactly {id, text}, ids exactly A–D
--            (distinct), text 1..2000 chars.
-- grid_in  → choices must be NULL (the student types a numeric answer).
-- Widening the shape (5-choice formats, images) is a reviewed migration
-- editing this function — that is the point of it.
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
  'shape requires a reviewed migration editing this function.';

-- =====================================================================
-- 2. exam_forms
-- =====================================================================
create table public.exam_forms (
  id                   uuid        primary key default gen_random_uuid(),

  -- Human identity, e.g. 'SATF-2026-A'. A corrected form is a NEW code; codes
  -- are never reused, so history stays addressable forever.
  code                 text        not null unique,

  -- The registry exam this form fills ('SAT_FULL', 'ACT_MATH', ...).
  -- Deliberately NOT constrained to a list: exam-registry.js is the single
  -- source of truth for what exams exist (the M1 principle). The publish gate
  -- verifies the pairing against the registry-derived expectation.
  exam_code            text        not null,

  title                text        not null,
  status               text        not null default 'draft',
  taxonomy_version     smallint    not null default 1,

  -- HISTORICAL SNAPSHOT of the registry-derived expectation verified at
  -- publication (§8 stores it). Audit only — never a structure authority.
  published_structure  jsonb,

  created_by           uuid        references auth.users (id) on delete set null,
  created_at           timestamptz not null default now(),
  published_at         timestamptz,
  retired_at           timestamptz,

  constraint exam_forms_code_check      check (char_length(code) between 1 and 40),
  constraint exam_forms_exam_code_check check (char_length(exam_code) between 1 and 40),
  constraint exam_forms_title_check     check (char_length(title) between 1 and 200),
  constraint exam_forms_status_check    check (status in ('draft', 'review', 'published', 'retired'))
);

comment on table public.exam_forms is
  'One authored exam form (a complete sitting''s content). Lifecycle: draft ⇄ '
  'review → published → retired; published only via publish_exam_form(), and a '
  'published form is immutable — corrections are a new code. Admin-read, '
  'service-role-write; no student access of any kind (delivery is a future, '
  'separately approved phase).';

comment on column public.exam_forms.published_structure is
  'The registry-derived expectation this form was verified against at the '
  'moment of publication. HISTORICAL AUDIT SNAPSHOT ONLY: the registry remains '
  'the authority for current structure, and future registry changes never '
  'retroactively reinterpret this form.';

-- =====================================================================
-- 3. exam_form_sections
-- =====================================================================
create table public.exam_form_sections (
  id                 uuid    primary key default gen_random_uuid(),
  form_id            uuid    not null references public.exam_forms (id) on delete cascade,
  ordinal            integer not null,

  -- ADAPTIVE-READY, NOT ADAPTIVELY ROUTED (header box). NULL for every
  -- ordinary section; SAT_FULL ordinal 2 may carry one row per content
  -- variant. Vocabulary is registry-owned — no CHECK names variant ids here,
  -- and the publish gate validates stored values against the registry-derived
  -- expectation. Storing a variant activates no routing anywhere.
  variant_id         text,

  label              text    not null,
  question_count     integer not null,
  duration_minutes   integer not null,

  -- The structural home P4's calculator work deferred to: per-section policy
  -- (EST Math 1's "part 2 only") becomes expressible here when delivery lands.
  calculator_allowed boolean not null default true,

  constraint exam_form_sections_ordinal_check  check (ordinal > 0),
  constraint exam_form_sections_variant_check  check (variant_id is null or char_length(variant_id) between 1 and 40),
  constraint exam_form_sections_label_check    check (char_length(label) between 1 and 80),
  constraint exam_form_sections_qcount_check   check (question_count > 0),
  constraint exam_form_sections_duration_check check (duration_minutes > 0),

  -- PG15+ (production is 17.6, verified): two NULL-variant rows at one ordinal
  -- COLLIDE, two same-variant rows collide, standard+advanced coexist. Mixing
  -- a NULL-variant and variant rows at one ordinal is representable in draft
  -- and rejected by the publish gate — a cross-row rule, deliberately not a
  -- trigger.
  constraint exam_form_sections_slot_uq unique nulls not distinct (form_id, ordinal, variant_id)
);

comment on column public.exam_form_sections.variant_id is
  'Content-variant slot (adaptive-READY only — no routing exists or is implied '
  'by this column). NULL for ordinary sections. Vocabulary is owned by '
  'exam-registry.js and validated at publish; deliberately no CHECK list here.';

-- =====================================================================
-- 4. exam_questions
-- =====================================================================
create table public.exam_questions (
  id                       uuid        primary key default gen_random_uuid(),
  section_id               uuid        not null references public.exam_form_sections (id) on delete cascade,
  ordinal                  integer     not null,

  -- V1 content is TEXT + LaTeX only (decision 5): no media columns, no storage
  -- bucket, no pipeline. Media support is a separate future capability.
  prompt                   text        not null,
  question_format          text        not null,
  choices                  jsonb,
  correct_answer           text        not null,
  explanation              text,

  -- Draft-lenient: nullable here. Publish-strict: §8 refuses any question
  -- without a difficulty (decision 4).
  difficulty               text,

  -- Taxonomy linkage — the SAME registry the analyzer uses, never a parallel
  -- one. The composite FK (with §0's support constraint) makes a subtopic that
  -- disagrees with its topic unstorable, not merely unpublishable.
  topic_id                 text        not null references public.taxonomy_topics (id),
  subtopic_id              text,
  skill                    text,
  status                   text        not null default 'draft',

  -- THE EDITORIAL RULE, IN THE SCHEMA (approved M3 principle, named constraint):
  -- the database physically refuses a row claiming third-party provenance.
  -- Licensing content legitimately later means ALTER TABLE ... DROP CONSTRAINT
  -- in a reviewed migration — a deliberate, visible act.
  content_origin           text        not null default 'original_si_math',
  authored_by              uuid        references auth.users (id) on delete set null,
  originality_attested_at  timestamptz,
  originality_attested_by  uuid        references auth.users (id) on delete set null,

  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),

  constraint exam_questions_ordinal_check       check (ordinal > 0),
  constraint exam_questions_prompt_check        check (char_length(prompt) between 1 and 8000),
  constraint exam_questions_format_check        check (question_format in ('mcq', 'grid_in')),
  constraint exam_questions_choices_check       check (public.exam_question_choices_ok(question_format, choices)),
  constraint exam_questions_correct_answer_check check (
    (question_format = 'mcq'     and correct_answer in ('A', 'B', 'C', 'D')) or
    (question_format = 'grid_in' and char_length(correct_answer) between 1 and 20)
  ),
  constraint exam_questions_explanation_check   check (explanation is null or char_length(explanation) <= 8000),
  constraint exam_questions_difficulty_check    check (difficulty is null or difficulty in ('easy', 'medium', 'hard')),
  constraint exam_questions_skill_check         check (skill is null or char_length(skill) <= 120),
  constraint exam_questions_status_check        check (status in ('draft', 'review', 'approved', 'retired')),
  constraint exam_questions_content_origin_check check (content_origin = 'original_si_math'),
  constraint exam_questions_slot_uq             unique (section_id, ordinal),
  constraint exam_questions_subtopic_topic_fk   foreign key (subtopic_id, topic_id)
    references public.taxonomy_subtopics (id, topic_id)
);

comment on column public.exam_questions.content_origin is
  'CHECK-locked to ''original_si_math'': the database refuses third-party '
  'content. Widening this is a reviewed migration dropping the named '
  'constraint exam_questions_content_origin_check — deliberate and visible.';

comment on column public.exam_questions.correct_answer is
  'The answer key. Admin/service visibility only — no student RLS path exists '
  'on this table. When delivery ships, student-facing access is a separately '
  'approved, published-only read model that must exclude this column.';

-- =====================================================================
-- 5. INDEXES
-- =====================================================================
create index exam_form_sections_form_idx on public.exam_form_sections (form_id);
create index exam_questions_section_idx  on public.exam_questions (section_id);
create index exam_questions_topic_idx    on public.exam_questions (topic_id);
create index exam_forms_exam_status_idx  on public.exam_forms (exam_code, status);

-- =====================================================================
-- 6. RLS AND PRIVILEGES — the M1 mirror, tightened
-- =====================================================================
-- pg_default_acl on this database grants full DML on every new table to anon,
-- authenticated and service_role at creation (verified for M1; unchanged).
-- Without the revokes below these tables are fully writable by anon on arrival.
alter table public.exam_forms         enable row level security;
alter table public.exam_form_sections enable row level security;
alter table public.exam_questions     enable row level security;

revoke all on table public.exam_forms         from anon, authenticated;
revoke all on table public.exam_form_sections from anon, authenticated;
revoke all on table public.exam_questions     from anon, authenticated;

-- Admin READ path only. Unlike M1 there is no student INSERT: students never
-- write content. Authoring is service_role (v1: SQL / controlled workflow).
grant select on table public.exam_forms         to authenticated;
grant select on table public.exam_form_sections to authenticated;
grant select on table public.exam_questions     to authenticated;

create policy exam_forms_admin_read on public.exam_forms
  for select to authenticated using (public.has_role_at_least('admin'));
create policy exam_form_sections_admin_read on public.exam_form_sections
  for select to authenticated using (public.has_role_at_least('admin'));
create policy exam_questions_admin_read on public.exam_questions
  for select to authenticated using (public.has_role_at_least('admin'));

revoke all on function public.exam_question_choices_ok(text, jsonb) from anon;

-- =====================================================================
-- 7. LIFECYCLE GUARDS — immutability, enforced
-- =====================================================================
-- Guards against ACCIDENT, stated with M1's honesty: service_role and postgres
-- can drop these triggers, and the operator who can publish can also bypass.
-- What they stop completely is a backend script or a careless UPDATE quietly
-- rewriting a published exam.

-- 7a. Forms: legal transitions only; published is immutable except → retired.
create or replace function public.exam_forms_guard()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    if old.status not in ('draft', 'review') then
      raise exception 'exam_forms: % form % cannot be deleted — it is historical record',
        old.status, old.code using errcode = '42501';
    end if;
    return old;
  end if;

  -- Publishing happens ONLY through publish_exam_form(), which sets the
  -- transaction-local flag after validating. Any other write that lands on
  -- status='published' is refused.
  if new.status = 'published' and old.status <> 'published'
     and coalesce(current_setting('si.publishing', true), '') <> 'yes' then
    raise exception 'exam_forms: publish only via publish_exam_form() — direct status change refused'
      using errcode = '42501';
  end if;

  if old.status = 'published' then
    -- The only legal write to a published form is retiring it.
    if not (new.status = 'retired'
            and new.code is not distinct from old.code
            and new.exam_code is not distinct from old.exam_code
            and new.title is not distinct from old.title
            and new.taxonomy_version is not distinct from old.taxonomy_version
            and new.published_structure is not distinct from old.published_structure
            and new.published_at is not distinct from old.published_at) then
      raise exception 'exam_forms: published form % is immutable — corrections are a new form code',
        old.code using errcode = '42501';
    end if;
    if new.retired_at is null then new.retired_at := now(); end if;
  elsif old.status = 'retired' then
    raise exception 'exam_forms: retired form % is historical record and cannot change',
      old.code using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger exam_forms_guard_row
  before update or delete on public.exam_forms
  for each row execute function public.exam_forms_guard();

-- 7b. Sections and questions: frozen once the parent form is published/retired.
--     INSERT is blocked too — adding content to a published form is as much a
--     rewrite as editing it.
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

create trigger exam_form_sections_frozen
  before insert or update or delete on public.exam_form_sections
  for each row execute function public.exam_content_frozen_guard();

create trigger exam_questions_frozen
  before insert or update or delete on public.exam_questions
  for each row execute function public.exam_content_frozen_guard();

-- 7c. updated_at bookkeeping on questions (draft-phase edits only — 7b fires
--     first for published forms and aborts before this matters).
create or replace function public.exam_questions_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger exam_questions_touch_row
  before update on public.exam_questions
  for each row execute function public.exam_questions_touch();

revoke all on function public.exam_forms_guard()          from anon;
revoke all on function public.exam_content_frozen_guard() from anon;
revoke all on function public.exam_questions_touch()      from anon;

-- =====================================================================
-- 8. THE PUBLISH GATE — publish_exam_form(form_id, expected)
-- =====================================================================
-- THE CONSISTENCY BOUNDARY (decision 6), smallest reviewable shape:
--   * this function is the ONLY path to status='published' (7a enforces it);
--   * p_expected is DERIVED FROM exam-registry.js by a repo script — the
--     operator never hand-types structure, so registry↔expectation drift is
--     impossible by construction (a CI test pins the generator);
--   * every check below fails closed with a specific message;
--   * on success the expectation is stored as the historical snapshot.
--
-- Expected shape:
--   { "exam_code": "SAT_FULL",
--     "modules": [
--       { "ordinal": 1, "questions": 22, "durationMinutes": 35, "variants": [] },
--       { "ordinal": 2, "questions": 22, "durationMinutes": 35,
--         "variants": ["standard", "advanced"] } ] }
create or replace function public.publish_exam_form(p_form_id uuid, p_expected jsonb)
returns void
language plpgsql
as $$
declare
  v_form      public.exam_forms%rowtype;
  m           jsonb;
  v_ordinal   integer;
  v_questions integer;
  v_duration  integer;
  v_variants  jsonb;
  v_variant   text;
  sec         record;
  v_slots     integer := 0;
  v_seccount  integer;
  v_n         integer;
begin
  select * into v_form from public.exam_forms where id = p_form_id for update;
  if not found then
    raise exception 'publish: no form with id %', p_form_id;
  end if;
  if v_form.status <> 'review' then
    raise exception 'publish: form % is ''%'' — publishing is allowed only from ''review''',
      v_form.code, v_form.status;
  end if;

  -- Expectation sanity.
  if p_expected is null or jsonb_typeof(p_expected) <> 'object' then
    raise exception 'publish: p_expected must be a jsonb object';
  end if;
  if p_expected ->> 'exam_code' is distinct from v_form.exam_code then
    raise exception 'publish: expectation is for exam_code ''%'' but form % is ''%''',
      p_expected ->> 'exam_code', v_form.code, v_form.exam_code;
  end if;
  if jsonb_typeof(p_expected -> 'modules') <> 'array'
     or jsonb_array_length(p_expected -> 'modules') = 0 then
    raise exception 'publish: expectation carries no modules';
  end if;

  -- (a) Every expected slot has exactly one matching section.
  for m in select * from jsonb_array_elements(p_expected -> 'modules') loop
    v_ordinal   := (m ->> 'ordinal')::integer;
    v_questions := (m ->> 'questions')::integer;
    v_duration  := (m ->> 'durationMinutes')::integer;
    v_variants  := coalesce(m -> 'variants', '[]'::jsonb);

    if jsonb_array_length(v_variants) = 0 then
      v_slots := v_slots + 1;
      select count(*) into v_n from public.exam_form_sections s
       where s.form_id = p_form_id and s.ordinal = v_ordinal and s.variant_id is null
         and s.question_count = v_questions and s.duration_minutes = v_duration;
      if v_n <> 1 then
        raise exception 'publish: form % ordinal % — expected exactly one section (% questions, % min, no variant); found % matching',
          v_form.code, v_ordinal, v_questions, v_duration, v_n;
      end if;
    else
      for v_variant in select jsonb_array_elements_text(v_variants) loop
        v_slots := v_slots + 1;
        select count(*) into v_n from public.exam_form_sections s
         where s.form_id = p_form_id and s.ordinal = v_ordinal and s.variant_id = v_variant
           and s.question_count = v_questions and s.duration_minutes = v_duration;
        if v_n <> 1 then
          raise exception 'publish: form % ordinal % variant ''%'' — expected exactly one section (% questions, % min); found % matching',
            v_form.code, v_ordinal, v_variant, v_questions, v_duration, v_n;
        end if;
      end loop;
    end if;
  end loop;

  -- (b) No extra sections, no NULL/variant mixing, no unknown variants.
  select count(*) into v_seccount from public.exam_form_sections where form_id = p_form_id;
  if v_seccount <> v_slots then
    raise exception 'publish: form % has % sections but the expectation defines % slots',
      v_form.code, v_seccount, v_slots;
  end if;
  for sec in select * from public.exam_form_sections where form_id = p_form_id loop
    select mm into m from jsonb_array_elements(p_expected -> 'modules') mm
     where (mm ->> 'ordinal')::integer = sec.ordinal;
    if m is null then
      raise exception 'publish: form % has a section at ordinal % the expectation does not define',
        v_form.code, sec.ordinal;
    end if;
    v_variants := coalesce(m -> 'variants', '[]'::jsonb);
    if jsonb_array_length(v_variants) = 0 then
      if sec.variant_id is not null then
        raise exception 'publish: form % ordinal % expects no variants but section carries variant ''%''',
          v_form.code, sec.ordinal, sec.variant_id;
      end if;
    else
      if sec.variant_id is null then
        raise exception 'publish: form % ordinal % expects variants % but a NULL-variant section is present (mixing)',
          v_form.code, sec.ordinal, v_variants;
      end if;
      if not (v_variants ? sec.variant_id) then
        raise exception 'publish: form % ordinal % carries unknown variant ''%'' (expectation allows %)',
          v_form.code, sec.ordinal, sec.variant_id, v_variants;
      end if;
    end if;
  end loop;

  -- (c) Per section: exactly question_count rows, ALL approved, ordinals
  --     contiguous 1..n, difficulty set, originality attested. A leftover
  --     draft/retired row is a hard failure — the published set is exact.
  for sec in select * from public.exam_form_sections where form_id = p_form_id loop
    select count(*) into v_n from public.exam_questions q where q.section_id = sec.id;
    if v_n <> sec.question_count then
      raise exception 'publish: form % ordinal % variant % holds % question rows; question_count is %',
        v_form.code, sec.ordinal, coalesce(sec.variant_id, '(none)'), v_n, sec.question_count;
    end if;
    select count(*) into v_n from public.exam_questions q
     where q.section_id = sec.id and q.status <> 'approved';
    if v_n > 0 then
      raise exception 'publish: form % ordinal % variant % contains % non-approved question(s)',
        v_form.code, sec.ordinal, coalesce(sec.variant_id, '(none)'), v_n;
    end if;
    select count(distinct q.ordinal) into v_n from public.exam_questions q
     where q.section_id = sec.id and q.ordinal between 1 and sec.question_count;
    if v_n <> sec.question_count then
      raise exception 'publish: form % ordinal % variant % question ordinals are not contiguous 1..%',
        v_form.code, sec.ordinal, coalesce(sec.variant_id, '(none)'), sec.question_count;
    end if;
    select count(*) into v_n from public.exam_questions q
     where q.section_id = sec.id and q.difficulty is null;
    if v_n > 0 then
      raise exception 'publish: form % ordinal % variant % has % question(s) without difficulty (required at publish)',
        v_form.code, sec.ordinal, coalesce(sec.variant_id, '(none)'), v_n;
    end if;
    select count(*) into v_n from public.exam_questions q
     where q.section_id = sec.id
       and (q.originality_attested_at is null or q.originality_attested_by is null);
    if v_n > 0 then
      raise exception 'publish: form % ordinal % variant % has % question(s) without originality attestation',
        v_form.code, sec.ordinal, coalesce(sec.variant_id, '(none)'), v_n;
    end if;
  end loop;

  -- All checks passed: flip, snapshot, and clear the flag immediately so
  -- nothing else in this transaction can ride it.
  perform set_config('si.publishing', 'yes', true);
  update public.exam_forms
     set status = 'published', published_at = now(), published_structure = p_expected
   where id = p_form_id;
  perform set_config('si.publishing', '', true);
end;
$$;

comment on function public.publish_exam_form(uuid, jsonb) is
  'The ONLY path to status=published (enforced by exam_forms_guard). Validates '
  'the form against a registry-derived expectation — section slots incl. '
  'variants, exact approved question counts, contiguous ordinals, difficulty, '
  'originality attestation — all fail-closed, then stores the expectation as '
  'the historical published_structure snapshot. p_expected comes from the '
  'repo''s generator over exam-registry.js, never typed by hand.';

revoke all on function public.publish_exam_form(uuid, jsonb) from anon;
revoke all on function public.publish_exam_form(uuid, jsonb) from authenticated;

commit;

-- =====================================================================
-- VERIFICATION — run AFTER applying, expect every line to report ok
-- =====================================================================
-- 1. Structure: the three tables exist; taxonomy_subtopics carries the new
--    unique constraint; anon holds zero privileges on all three tables;
--    authenticated holds SELECT only.
-- 2. RLS: a non-admin authenticated SELECT returns zero rows on all three.
-- 3. Variant slots: inserting two NULL-variant sections at one ordinal fails
--    23505; standard+advanced at one ordinal both insert.
-- 4. Composite FK: a question pairing subtopic 'circles' with topic 'algebra'
--    fails 23503; a NULL subtopic inserts.
-- 5. content_origin: any value but 'original_si_math' fails 23514.
-- 6. Direct publish: UPDATE exam_forms SET status='published' fails 42501.
-- 7. The gate: a review-status form with a correct SAT_FULL shape (1 plain
--    section + 2 variant sections, each 22 approved/attested/difficulty-set
--    questions with ordinals 1..22) publishes; each failure class — wrong
--    counts, mixed variants, unknown variant, leftover draft question,
--    missing difficulty, missing attestation, extra section — raises with its
--    specific message.
-- 8. Immutability: any UPDATE/INSERT/DELETE on the published form's content
--    fails 42501; published → retired succeeds; retired → anything fails;
--    DELETE of a draft form succeeds, of a published form fails.
