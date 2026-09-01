-- =====================================================================
-- exam_stimulus_shape_ok() — one rule, given a name
-- =====================================================================
-- STATUS: 🟢 APPLIED 2026-09-01 as version 20260901150838.
--
-- Applied after a dry-run in a rolled-back transaction, then verified live:
-- prosrc byte-identical to this file (290 bytes), constraint reduced to
-- CHECK (exam_stimulus_shape_ok(kind, body, spec, media_ref)) and validated,
-- ACL postgres+service_role matching the other stimulus validators, the
-- 48-case truth table showing 0 disagreements with the rule it replaced, and
-- all 33 stored rows still passing. The 20260901z rollback was rehearsed in a
-- transaction that aborted: it returns both the whole-schema constraint md5
-- and the function-signature md5 to their pre-apply values exactly.
--
-- WHAT THIS IS, AND ALL IT IS
-- ---------------------------
-- A pure refactor. The three-shape rule that governs exam_stimuli lives as an
-- inline expression inside exam_stimuli_shape_check, so it can only ever guard
-- that one table. This lifts it into a function and points the existing
-- constraint at it. The rule itself is copied term for term:
--
--   kind 'text'                        -> body NOT NULL, spec NULL, media NULL
--   kind table|chart|plot|number_line  -> spec NOT NULL, body NULL, media NULL
--   kind 'figure'                      -> media_ref NOT NULL, spec NULL, body NULL
--
-- NOTHING ELSE CHANGES. No column, no type, no policy, no grant on any table,
-- no row. exam_stimulus_spec_ok() and every other validator are untouched. No
-- Teacher Exam table is created — that is a later increment, and the only
-- reason this one exists now is that a second table cannot share a rule that
-- is written inside a CHECK.
--
-- THE ONE BEHAVIOURAL DIFFERENCE, STATED BECAUSE IT IS EASY TO MISS
-- -----------------------------------------------------------------
-- A CHECK containing an inline expression is re-validated whenever the
-- constraint is altered. A CHECK that CALLS a function is not re-validated when
-- that function is later redefined: `create or replace function
-- exam_stimulus_shape_ok(...)` would change the rule for new rows while leaving
-- existing rows unexamined, silently. That is the price of sharing the rule.
-- Whoever edits this function must therefore also re-validate the tables that
-- use it — today exam_stimuli, later teacher_exam_stimuli — with
-- `alter table ... validate constraint ...` after a drop and re-add.
--
-- PRIVILEGES — matched to its siblings, not to the default
-- --------------------------------------------------------
-- exam_stimulus_spec_ok(), exam_plot_frame_mode_ok() and
-- exam_stimulus_needs_reading() are each IMMUTABLE, PARALLEL SAFE, security
-- invoker, owned by postgres and executable by postgres and service_role only.
-- This matches them exactly. The default ACL would grant EXECUTE to PUBLIC, so
-- the revoke below is load-bearing.
--
-- Only postgres and service_role hold any write privilege on exam_stimuli
-- (authenticated holds SELECT alone), so the writers of the table and the
-- callers of the function are the same set. A CHECK is evaluated as the user
-- performing the DML, so no client can be refused by a missing EXECUTE.
--
-- ROLLBACK: 20260901z_exam_stimulus_shape_ok_rollback.sql — restores the inline
-- expression verbatim and drops the function. Fully reversible, unlike most of
-- this project's migrations.
-- =====================================================================

begin;

-- ── 1 · the rule, lifted verbatim ────────────────────────────────────────
create or replace function exam_stimulus_shape_ok(k text, b text, s jsonb, m text)
returns boolean
language sql
immutable
parallel safe
as $$
  select (k = 'text'
            and b is not null and s is null and m is null)
      or (k = any (array['table', 'chart', 'plot', 'number_line'])
            and s is not null and b is null and m is null)
      or (k = 'figure'
            and m is not null and s is null and b is null);
$$;

comment on function exam_stimulus_shape_ok(text, text, jsonb, text) is
  'The three-shape rule for a stimulus: prose, structured data, or an image — '
  'exactly one of them. Extracted from exam_stimuli_shape_check so a second '
  'stimulus table can share the rule instead of copying it. Redefining this '
  'does NOT re-validate rows already in any table that uses it.';

revoke all on function exam_stimulus_shape_ok(text, text, jsonb, text)
  from public, anon, authenticated;
grant execute on function exam_stimulus_shape_ok(text, text, jsonb, text)
  to service_role;

-- ── 2 · point the existing constraint at it ──────────────────────────────
-- Same drop-and-re-add shape as 20260804_streak_server_side.sql. The table is
-- small — tens of rows — so the revalidation the ADD performs is instant, and
-- that revalidation is the point: if any existing row failed the extracted
-- rule, this migration would abort here rather than leaving behind a
-- constraint nobody had checked. No row count is asserted anywhere in this
-- file; see section 3.
alter table exam_stimuli
  drop constraint if exists exam_stimuli_shape_check;

alter table exam_stimuli
  add constraint exam_stimuli_shape_check
  check (exam_stimulus_shape_ok(kind, body, spec, media_ref));

-- ── 3 · prove it, or abort ───────────────────────────────────────────────
do $$
declare v_bad integer;
begin
  -- Deliberately NOT a row count. An earlier draft asserted "expected 25
  -- stimuli" — and the EST form was rewritten mid-review, taking the table to
  -- 33. A migration that refuses to run because authors did their job is a
  -- migration that gets edited under pressure. The invariant is that no row
  -- fails the extracted rule, whatever the rows are.
  select count(*) into v_bad from exam_stimuli
   where not exam_stimulus_shape_ok(kind, body, spec, media_ref);
  if v_bad > 0 then
    raise exception 'shape_ok: % stored stimulus row(s) fail the extracted rule', v_bad;
  end if;

  -- EQUIVALENCE, PROVED EXHAUSTIVELY RATHER THAN BY SAMPLE.
  --
  -- Comparing the two rules over the stored rows is the obvious check and it is
  -- not sufficient: mutation testing this migration showed that deleting the
  -- `media_ref is null` term from the structured branch produces ZERO
  -- disagreements on real data, because no stored row carries both a spec and a
  -- media_ref. A rule can only be tested by rows that exercise it.
  --
  -- So the comparison runs over the whole input space instead: every kind the
  -- CHECK permits, crossed with every null/not-null combination of the three
  -- payload columns. 6 x 2 x 2 x 2 = 48 cases, every one of which must agree.
  -- That is a proof of equivalence rather than evidence for it.
  select count(*) into v_bad
    from (select k, b, s, m,
                 exam_stimulus_shape_ok(k, b, s, m) as extracted,
                 (   ((k = 'text') and (b is not null) and (s is null) and (m is null))
                  or ((k = any (array['table', 'chart', 'plot', 'number_line']))
                      and (s is not null) and (b is null) and (m is null))
                  or ((k = 'figure') and (m is not null) and (s is null) and (b is null))
                 ) as original
            from unnest(array['text','table','chart','plot','number_line','figure']) as k
           cross join unnest(array[null, 'prose']) as b
           cross join unnest(array[null, '{}'::jsonb]) as s
           cross join unnest(array[null, 'ref']) as m) t
   where extracted is distinct from original;
  if v_bad > 0 then
    raise exception 'shape_ok: extracted rule differs from the original in % of 48 cases', v_bad;
  end if;

  -- The constraint exists, is validated, and calls the function.
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'exam_stimuli'::regclass
       and conname = 'exam_stimuli_shape_check'
       and convalidated
       and pg_get_constraintdef(oid) like '%exam_stimulus_shape_ok%'
  ) then
    raise exception 'shape_ok: the constraint was not repointed at the function';
  end if;
end $$;

commit;
