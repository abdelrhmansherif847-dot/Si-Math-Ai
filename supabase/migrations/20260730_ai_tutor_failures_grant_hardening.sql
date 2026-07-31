-- ===========================================================================
-- ai_tutor_failures — grant hardening
-- Follow-up to 20260730_ai_tutor_failures.sql (applied 2026-07-30, v20260730231948)
-- ===========================================================================
-- Approved by the owner 2026-07-30 after post-apply verification of the parent
-- migration reported two deviations from its own stated design.
--
-- SCOPE: privileges and one COMMENT. No table, column, type, constraint,
-- index, default, policy, function or row is touched. `ai-tutor` is NOT
-- deployed by this change and does not need to be — v92 is still unshipped, so
-- the table has no writer yet and zero rows.
--
-- ── WHAT WAS WRONG ────────────────────────────────────────────────────────
--   D1  service_role held UPDATE and DELETE on public.ai_tutor_failures,
--       while the parent migration's own comment read "No UPDATE, no DELETE,
--       no TRUNCATE for anyone but the table owner".
--         ai_model_calls     service_role=arDxtm/postgres     (no w, no d)
--         ai_tutor_failures  service_role=arwdDxtm/postgres   (w and d present)
--
--   D2  anon and authenticated held rwU on the owned sequence, while the same
--       roles held nothing on the table itself.
--         ai_model_calls_id_seq     {postgres=rwU, service_role=rwU}
--         ai_tutor_failures_id_seq  {postgres=rwU, anon=rwU,
--                                    authenticated=rwU, service_role=rwU}
--
-- ── ROOT CAUSE — one mechanism, both deviations ───────────────────────────
-- Supabase ships ALTER DEFAULT PRIVILEGES entries in schema public. Verified
-- in pg_default_acl, granted by both `postgres` and `supabase_admin`:
--
--   tables (r)     anon, authenticated, service_role  ->  arwdDxtm  (ALL)
--   sequences (S)  anon, authenticated, service_role  ->  rwU
--
-- So a brand-new table in public starts fully open to all three roles, and a
-- GRANT can only ever add. The parent migration's
--
--   REVOKE ALL ON public.ai_tutor_failures FROM anon, authenticated;   -- worked
--   GRANT INSERT, SELECT ON public.ai_tutor_failures TO service_role;  -- no-op
--
-- did exactly that: the REVOKE was load-bearing and removed the client roles,
-- but the GRANT landed on top of an existing ALL and narrowed nothing. Nothing
-- revoked the sequence defaults at all.
--
--   RULE WORTH CARRYING FORWARD: in this schema every intended restriction has
--   to be written as an explicit REVOKE. A GRANT that names fewer privileges
--   than the default does not restrict anything — it only reads as though it
--   does, which is worse than saying nothing, because the next reader believes
--   it. Both deviations here were a comment describing a GRANT's intent rather
--   than the database's state.
--
-- ── DEPENDENCY REVIEW, done before revoking ───────────────────────────────
--   • Only code path that touches this table is the v92 writer:
--     supabase/functions/ai-tutor/index.ts:632 — `.from('ai_tutor_failures')
--     .insert(row)`. INSERT only. No UPDATE, no DELETE, no upsert, no
--     onConflict, anywhere in the repo (grep across ts/js/mjs/html/sh).
--   • No RPC, view, trigger or function body in schema public references the
--     table — confirmed against pg_proc.prosrc; the owner-gated read RPC named
--     in the table comment has not been written yet.
--   • Table holds 0 rows, so nothing existing depends on the old privileges.
--   • service_role keeps INSERT and SELECT, and keeps USAGE on the sequence,
--     so nextval() during INSERT is unaffected. Asserted at the bottom of this
--     file rather than assumed.
-- ===========================================================================

-- ── D1: service_role writes history, it does not rewrite it ───────────────
-- INSERT and SELECT are retained. A failure record is an observation.
REVOKE UPDATE, DELETE ON public.ai_tutor_failures FROM service_role;

-- ── D2: the sequence gets the same client posture as its table ────────────
-- anon and authenticated hold nothing on ai_tutor_failures; holding rwU on its
-- sequence was an accident of the default ACL, not a decision. Latent rather
-- than live — nextval/setval live in pg_catalog and PostgREST exposes only
-- functions in the exposed schema, so there was no route to them over HTTP —
-- but an unnecessary privilege that happens to be unreachable is still an
-- unnecessary privilege, and the thing making it unreachable is not this
-- table's to control.
REVOKE ALL ON SEQUENCE public.ai_tutor_failures_id_seq FROM anon, authenticated;

-- Deliberately NOT re-granting to service_role here. It already holds rwU from
-- the sequence default ACL, which is byte-identical to ai_model_calls_id_seq.
-- A `GRANT USAGE, SELECT` at this point would be the same no-op-that-reads-as-
-- a-restriction that caused D1 and D2 in the first place.

-- ── DELIBERATELY NOT DONE HERE: TRUNCATE, and sequence UPDATE ─────────────
-- Two privileges remain that an append-only table arguably should not have:
--
--   ai_tutor_failures       service_role TRUNCATE  (D)  — bypasses RLS
--   ai_tutor_failures_id_seq service_role UPDATE   (w)  — allows setval()
--
-- Both are left in place ON PURPOSE. ai_model_calls holds exactly the same two,
-- and sec08(b) revoked TRUNCATE from anon and authenticated only, by design.
-- Revoking them here would make ai_tutor_failures stricter than the table it
-- was explicitly modelled on and create a fresh inconsistency while closing an
-- old one. Owner decision, 2026-07-30: they belong in one dedicated follow-up
-- that changes both tables together.
--
-- The end state after this migration is therefore exact parity with
-- ai_model_calls on both objects — asserted below, not asserted in prose.

-- ── The table comment described intent, not reality. Corrected. ───────────
-- Removed: the claim of an owner-gated read RPC, which does not exist.
-- Added: the actual privilege posture, including what is still outstanding.
COMMENT ON TABLE public.ai_tutor_failures IS
  'Unhandled 5xx failures from ai-tutor that reach the top-level handler. Does '
  'NOT cover cold-start or bundle failures, where serve() never runs and no '
  'in-function mechanism can record anything — check Edge Function logs for '
  'those. Written by ai-tutor via service_role, which holds INSERT and SELECT '
  'only: no UPDATE and no DELETE, so records are not edited. service_role does '
  'still hold TRUNCATE, matching ai_model_calls, pending a follow-up that '
  'revokes it on both. Clients have no access at all — RLS is on with no '
  'policy and anon/authenticated hold no privileges on the table or its '
  'sequence. An owner-gated RPC is the intended read path and has not been '
  'written yet, so today there is no read path outside service_role.';

-- ===========================================================================
-- Assertions — this migration fails rather than reporting a false success
-- ===========================================================================
-- The defect being fixed was a migration whose comments claimed a posture the
-- database did not have, and which applied cleanly anyway. Prose cannot catch
-- that a second time, so the intended end state is checked here as executable
-- statements. Any failure aborts the migration and rolls it back.
DO $$
DECLARE
  svc_new text;
  svc_ref text;
BEGIN
  -- D1 closed
  IF has_table_privilege('service_role','public.ai_tutor_failures','UPDATE') THEN
    RAISE EXCEPTION 'ai_tutor_failures: service_role still holds UPDATE';
  END IF;
  IF has_table_privilege('service_role','public.ai_tutor_failures','DELETE') THEN
    RAISE EXCEPTION 'ai_tutor_failures: service_role still holds DELETE';
  END IF;

  -- ...without breaking the writer. v92 inserts and nothing else, but losing
  -- either of these would surface as a silent telemetry loss in production
  -- rather than as an error here, so check both.
  IF NOT has_table_privilege('service_role','public.ai_tutor_failures','INSERT') THEN
    RAISE EXCEPTION 'ai_tutor_failures: service_role lost INSERT — the v92 writer would 403';
  END IF;
  IF NOT has_table_privilege('service_role','public.ai_tutor_failures','SELECT') THEN
    RAISE EXCEPTION 'ai_tutor_failures: service_role lost SELECT';
  END IF;

  -- D2 closed
  IF has_sequence_privilege('anon','public.ai_tutor_failures_id_seq','USAGE')
     OR has_sequence_privilege('anon','public.ai_tutor_failures_id_seq','SELECT')
     OR has_sequence_privilege('anon','public.ai_tutor_failures_id_seq','UPDATE') THEN
    RAISE EXCEPTION 'ai_tutor_failures_id_seq: anon still holds privileges';
  END IF;
  IF has_sequence_privilege('authenticated','public.ai_tutor_failures_id_seq','USAGE')
     OR has_sequence_privilege('authenticated','public.ai_tutor_failures_id_seq','SELECT')
     OR has_sequence_privilege('authenticated','public.ai_tutor_failures_id_seq','UPDATE') THEN
    RAISE EXCEPTION 'ai_tutor_failures_id_seq: authenticated still holds privileges';
  END IF;

  -- ...without breaking nextval() on INSERT. bigserial's default calls nextval,
  -- which needs USAGE or UPDATE on the sequence; revoking the wrong role here
  -- would turn every failure-telemetry insert into an error.
  IF NOT has_sequence_privilege('service_role','public.ai_tutor_failures_id_seq','USAGE') THEN
    RAISE EXCEPTION 'ai_tutor_failures_id_seq: service_role lost USAGE — nextval would fail on every insert';
  END IF;

  -- Parity with the table this design was modelled on. This is the assertion
  -- that would have caught D1 at apply time: it compares service_role's actual
  -- privilege set on both tables instead of trusting either file's comments.
  SELECT string_agg(a.privilege_type, ',' ORDER BY a.privilege_type)
    INTO svc_new
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace,
         LATERAL aclexplode(c.relacl) a
   WHERE n.nspname = 'public' AND c.relname = 'ai_tutor_failures'
     AND a.grantee = 'service_role'::regrole;

  SELECT string_agg(a.privilege_type, ',' ORDER BY a.privilege_type)
    INTO svc_ref
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace,
         LATERAL aclexplode(c.relacl) a
   WHERE n.nspname = 'public' AND c.relname = 'ai_model_calls'
     AND a.grantee = 'service_role'::regrole;

  IF svc_new IS DISTINCT FROM svc_ref THEN
    RAISE EXCEPTION
      'ai_tutor_failures does not match ai_model_calls for service_role: got [%], expected [%]',
      coalesce(svc_new,'<none>'), coalesce(svc_ref,'<none>');
  END IF;

  RAISE NOTICE 'ai_tutor_failures grant hardening: service_role = [%] on both tables', svc_new;
END $$;

-- ===========================================================================
-- Post-apply verification (run separately; the assertions above already ran)
--
--   -- 1. service_role can write but not rewrite
--   SELECT has_table_privilege('service_role','public.ai_tutor_failures','INSERT') AS ins,
--          has_table_privilege('service_role','public.ai_tutor_failures','SELECT') AS sel,
--          has_table_privilege('service_role','public.ai_tutor_failures','UPDATE') AS upd,
--          has_table_privilege('service_role','public.ai_tutor_failures','DELETE') AS del;
--   -- expect: t, t, f, f
--
--   -- 2. clients hold nothing, on the table or its sequence
--   SELECT c.relname, c.relacl::text FROM pg_class c
--     JOIN pg_namespace n ON n.oid=c.relnamespace
--    WHERE n.nspname='public'
--      AND c.relname IN ('ai_tutor_failures','ai_tutor_failures_id_seq',
--                        'ai_model_calls','ai_model_calls_id_seq');
--   -- expect ai_tutor_failures      = ai_model_calls      for service_role
--   -- expect ai_tutor_failures_id_seq = ai_model_calls_id_seq exactly
--
--   -- 3. the writer still works end to end (rolls itself back)
--   BEGIN;
--     SET LOCAL ROLE service_role;
--     INSERT INTO public.ai_tutor_failures
--       (correlation_id, request_id, stage_reached, error_class)
--       VALUES ('hardchk1', gen_random_uuid(), 'received', 'HardeningCheck');
--     UPDATE public.ai_tutor_failures SET error_class='x';   -- expect 42501
--   ROLLBACK;
-- ===========================================================================
