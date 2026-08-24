-- =====================================================================
-- Mock Exam v2 · B1 — close the INSERT path to status='published'
-- =====================================================================
-- STATUS: ✅ APPLIED to production 2026-08-24, after explicit approval, as
--         version 20260824015733 (name: exam_forms_insert_guard).
--
--         Verified live on PostgreSQL 17.6 immediately afterwards — which
--         also closed the one caveat carried into the apply, that the harness
--         ran on 16.13. Both refusals produce 42501 in production, an ordinary
--         draft is still accepted, and the probe left ZERO rows behind, so no
--         form code was consumed by verifying. The publish_exam_form ACL was
--         captured before and after and is byte-identical: B5 untouched.
--
-- SCOPE: this file fixes B1 and ONLY B1. The PUBLIC EXECUTE grant on
--        publish_exam_form (finding B5) is a separate, separately reviewed
--        migration by explicit decision — two security findings of different
--        origin do not share one change, one review, or one rollback.
--        Nothing here alters publish_exam_form or its ACL.
--
-- =====================================================================
-- WHAT IS WRONG TODAY
-- =====================================================================
-- 20260824a_question_spine.sql documents publish_exam_form() as
--
--     "The ONLY path to status=published (enforced by exam_forms_guard)"
--
-- and that is false for INSERT. exam_forms_guard_row is declared
--
--     before update or delete on public.exam_forms
--
-- so it never runs on INSERT, and a single statement walks past every check
-- the gate performs:
--
--     insert into public.exam_forms (code, exam_code, title, status)
--     values ('X', 'EST_MATH_1', '...', 'published');
--
-- Verified on the harness (PostgreSQL 16.13, real M3 migration applied
-- unmodified, production's pg_default_acl reproduced) on 2026-08-24. The row
-- is created with status='published', published_at IS NULL and
-- published_structure IS NULL — a "published" form that was never validated
-- against any expectation, in a state no legitimate path can produce.
--
-- THE DAMAGE IS PERMANENT, which is why this is worth a migration on a table
-- holding zero rows. Every one of these was observed, not reasoned about:
--
--   DELETE   → refused: "published form X cannot be deleted — it is
--              historical record" (exam_forms_guard, DELETE branch)
--   add content → refused: exam_content_frozen_guard rejects INSERT on
--              sections whose parent form is published
--   back to draft → refused: "published form X is immutable"
--   reuse the code → refused: exam_forms_code_key is UNIQUE
--
-- So one typo yields an empty, un-deletable, un-correctable, permanently
-- "published" form, and burns its code forever. Authoring Workflow v1 is
-- entirely service_role-driven, which is exactly the privilege level that can
-- do this.
--
-- =====================================================================
-- WHY NOT SIMPLY ADD `insert` TO THE EXISTING TRIGGER
-- =====================================================================
-- Because it does not work, and it fails SILENTLY — the most dangerous
-- possible outcome for a fix, since the diff reads like a fix.
--
-- Tested on the harness: after recreating exam_forms_guard_row as
-- `before insert or update or delete`, the bypass INSERT still succeeded with
-- no error at all. On INSERT, OLD is unassigned, so exam_forms_guard()'s
--
--     if new.status = 'published' and old.status <> 'published' ...
--
-- evaluates `old.status` to NULL, `NULL <> 'published'` to NULL, the whole
-- condition to NULL — never true — and the function returns NEW untouched.
--
-- Rewriting exam_forms_guard() to branch on TG_OP would also work, but that
-- function is live, correct, and referenced by six OLD-dependent conditions.
-- A separate INSERT-only trigger leaves it untouched and is reviewable on its
-- own terms. A CHECK constraint cannot express this at all: CHECK applies to
-- INSERT and UPDATE alike, so it would also block publish_exam_form()'s own
-- legitimate UPDATE to 'published'.
--
-- =====================================================================
-- REGRESSION SURFACE: NONE FOUND
-- =====================================================================
--   • public.exam_forms holds 0 rows in production (read 2026-08-24).
--   • No client, Edge Function, or script INSERTs into exam_forms — grepped
--     across *.js, *.html, *.ts, *.mjs; the only references are the M3
--     migration, its rollback, and scripts/preflight-exam-form.mjs (SELECT).
--   • The trigger fires on INSERT only, so publish_exam_form()'s UPDATE path
--     is untouched. Proven end-to-end on the harness after applying this file:
--     a full draft → sections → questions → review → publish cycle still
--     reaches status='published' with published_structure stored.
--
-- ATOMICITY: begin; first, commit; last, nothing after — the M1/M3 shape.
-- =====================================================================

begin;

-- =====================================================================
-- 1. THE GUARD
-- =====================================================================
-- Deliberately narrow: it decides what a form may look like at BIRTH, and
-- nothing else. Every later transition stays the existing guard's business.
--
-- Only 'draft' is accepted. The documented lifecycle is
-- draft ⇄ review → published → retired, which begins at draft, and the
-- authoring workflow creates forms as drafts. Should bulk authoring ever need
-- to insert directly at 'review', widening this to
-- `not in ('draft', 'review')` is a one-line reviewed change — but it must be
-- a decision, not a default.
create or replace function public.exam_forms_insert_guard()
returns trigger
language plpgsql
as $$
begin
  if new.status <> 'draft' then
    raise exception
      'exam_forms: a new form must be created as ''draft'' (got ''%''); publication happens only through publish_exam_form()',
      new.status
      using errcode = '42501';
  end if;

  -- A draft carrying publication metadata is either a mistake or an attempt to
  -- forge provenance. publish_exam_form() is the only thing that may write
  -- these, and it writes all three consistently.
  if new.published_at is not null
     or new.published_structure is not null
     or new.retired_at is not null then
    raise exception
      'exam_forms: published_at, published_structure and retired_at cannot be set at INSERT (form %)',
      new.code
      using errcode = '42501';
  end if;

  return new;
end;
$$;

comment on function public.exam_forms_insert_guard() is
  'BEFORE INSERT guard on exam_forms: a new form must be born as ''draft'' '
  'with no publication metadata. Closes the INSERT path around '
  'publish_exam_form(), which exam_forms_guard() cannot cover because it is '
  'declared for UPDATE/DELETE and its conditions read OLD.';

create trigger exam_forms_insert_guard_row
  before insert on public.exam_forms
  for each row execute function public.exam_forms_insert_guard();

-- =====================================================================
-- 2. PRIVILEGES — get the default right on the way in
-- =====================================================================
-- This database carries TWO overlapping defaults on a new function, and M3
-- handled only one of them:
--
--   pg_default_acl for functions in public  → EXECUTE to anon, authenticated,
--                                             service_role  (Supabase)
--   PostgreSQL's own CREATE FUNCTION default → EXECUTE to PUBLIC
--
-- Revoking a role's explicit grant does nothing about the grant it also holds
-- through PUBLIC, which is why M3's `revoke ... from anon, authenticated` on
-- publish_exam_form executed successfully and changed nothing about who can
-- call it. PUBLIC is revoked FIRST here for that reason.
--
-- This is hygiene on an object THIS migration creates, not a fix to any
-- existing object: publish_exam_form's ACL is untouched and remains B5's
-- subject. A trigger function cannot be invoked directly in any case
-- (PostgreSQL refuses), so this closes a door that is already bolted — which
-- is precisely when it is cheap to close.
revoke all on function public.exam_forms_insert_guard() from public;
revoke all on function public.exam_forms_insert_guard() from anon, authenticated;

commit;

-- =====================================================================
-- VERIFICATION — run AFTER applying; every line should report as noted
-- =====================================================================
-- 1. The trigger exists and fires on INSERT only:
--      select t.tgname,
--             case when (t.tgtype::int & 4)>0 then 'INSERT ' else '' end ||
--             case when (t.tgtype::int & 16)>0 then 'UPDATE ' else '' end ||
--             case when (t.tgtype::int & 8)>0 then 'DELETE ' else '' end as fires_on
--        from pg_trigger t join pg_class c on c.oid=t.tgrelid
--       where not t.tgisinternal and c.relname='exam_forms'
--       order by t.tgname;
--    -- exam_forms_guard_row        UPDATE DELETE     (unchanged)
--    -- exam_forms_insert_guard_row INSERT            (new)
--
-- 2. PUBLIC really is gone from the new function (the check M3 lacked):
--      select p.proname, p.proacl::text,
--             has_function_privilege('authenticated', p.oid, 'EXECUTE') as authd,
--             has_function_privilege('anon', p.oid, 'EXECUTE') as anon
--        from pg_proc p join pg_namespace n on n.oid=p.pronamespace
--       where n.nspname='public' and p.proname='exam_forms_insert_guard';
--    -- acl shows NO bare "=X/..." entry; authd = false; anon = false
--    -- (p.oid must be qualified — the join makes a bare `oid` ambiguous.)
--
-- 3. The bypass is closed (expect 42501, and NO row created):
--      insert into public.exam_forms (code, exam_code, title, status)
--      values ('B1-VERIFY-DELETEME', 'EST_MATH_1', 'should fail', 'published');
--    -- ERROR: exam_forms: a new form must be created as 'draft' ...
--      select count(*) from public.exam_forms where code='B1-VERIFY-DELETEME';  -- 0
--
-- 4. Forged provenance is refused (expect 42501):
--      insert into public.exam_forms (code, exam_code, title, published_at)
--      values ('B1-VERIFY-DELETEME', 'EST_MATH_1', 'should fail', now());
--
-- 5. An ordinary draft INSERT still works, and can still be deleted:
--      insert into public.exam_forms (code, exam_code, title)
--      values ('B1-VERIFY-DELETEME', 'EST_MATH_1', 'ordinary draft');
--      select status from public.exam_forms where code='B1-VERIFY-DELETEME';  -- draft
--      delete from public.exam_forms where code='B1-VERIFY-DELETEME';         -- succeeds
--
-- 6. publish_exam_form() still reaches 'published' — the point of the table.
--    Exercised on the harness rather than in production, since publishing in
--    production would create a permanent form. See the B1 validation report.
