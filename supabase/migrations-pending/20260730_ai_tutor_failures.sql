-- ===========================================================================
-- ai_tutor_failures — record 5xx failures that reach the handler
-- ===========================================================================
-- ✅ DESIGN APPROVED by the owner, 2026-07-30.
-- ⛔ NOT APPLIED — and approval of the design is NOT authorization to apply it.
--    The owner asked for this to stay staged. Applying it needs a separate,
--    explicit go-ahead (CLAUDE.md §3).
--
--    Settled during review, so do not reopen without cause:
--      • dedicated table, never merged into ai_model_calls — different events,
--        and merging would distort telemetry validated on 2026-07-30
--      • error_message is optional metadata; nothing may depend on it
--      • user_id is stored but never returned by the operational RPC
--      • the stage_reached vocabulary is a contract; its derivation is not
--
--    Open but NOT blocking: retention policy. Because nothing depends on
--    error_message, a policy can redact just that column over an older window
--    rather than deleting rows, so it can be added on top later.
--
--    The Edge Function change that writes this table is a SEPARATE approval and
--    has not been written. It requires a CLI deploy (DEPLOY.md §4).
--
-- Design: docs/roadmap/ai-tutor-failures-design.md
-- Context: docs/roadmap/ai-tutor-failure-observability.md
--
-- WHY A DEDICATED TABLE RATHER THAN ai_model_calls
--   ai_model_calls has four NOT NULL columns with no default that describe a
--   provider call — service_code, stage, provider, model. A 5xx thrown before
--   any provider call has none of them, so writing there means inventing four
--   values for a call that never happened, and prompt_tokens/completion_tokens
--   default to 0, making the row read as "a call that used no tokens" rather
--   than "no call occurred". It would also inflate `calls` and depress the
--   success rate in ai_monitor_call_health, so the reporting applied on
--   2026-07-30 would start lying.
--
-- EVERY COLUMN IS A VALUE ALREADY IN SCOPE AT THE THROW SITE (index.ts:4070).
-- Nothing here is inferred or invented.
--
-- THIS TABLE CAN LAND BEFORE THE FUNCTION CHANGE. An unused table is harmless,
-- and it means the ai-tutor change (CLI deploy only, DEPLOY.md §4) ships into a
-- schema that already exists rather than the two needing to be simultaneous.
--
-- Target project: igvkyxkmjnkzscqgommj
-- ===========================================================================

CREATE TABLE IF NOT EXISTS public.ai_tutor_failures (
  id                 bigserial   PRIMARY KEY,
  occurred_at        timestamptz NOT NULL DEFAULT now(),

  -- The 8-char code the student was actually shown (index.ts:2260,
  -- crypto.randomUUID().slice(0,8), returned as `correlation_id` on the 500).
  -- Today it is persisted nowhere, so a student quoting their error code cannot
  -- be joined to anything. This column is what closes that loop.
  --
  -- NOT unique, and deliberately not the key: 8 hex chars collide by the
  -- birthday bound around ~65k rows. It is a lookup aid; request_id is identity.
  correlation_id     text        NOT NULL,

  -- Full UUID (index.ts:2271). Same value as ai_model_calls.request_id, so a
  -- failure joins to whatever provider calls did happen before the throw.
  request_id         uuid        NOT NULL,

  client_request_id  uuid,

  -- NULL means the request failed BEFORE the question_records insert. That is
  -- precisely the class this table exists to make visible — those failures
  -- currently leave no trace in any table.
  question_record_id uuid,

  session_id         uuid,

  -- Stored so an incident can distinguish "one student hitting a bad input"
  -- from "everyone is down" — the first question during an outage. NOT exposed
  -- by the read RPC, which returns a distinct-user count instead. Store and
  -- expose are separate decisions.
  user_id            uuid,

  operation          text,

  -- The furthest milestone the request reached before it failed.
  --
  -- THESE FOUR VALUES ARE A CONTRACT. They are milestones in the life of a
  -- tutoring request that any implementation has, phrased as what was achieved:
  --
  --   received     the request arrived; nothing further established — we do not
  --                even know who was asking
  --   identified   the caller is known
  --   interpreted  what is being asked is known
  --   recorded     the interaction is persisted and durable
  --
  -- Nothing here names a variable, a table, a framework or a function, so the
  -- values keep their meaning across refactors — which matters because rows
  -- outlive implementations. An earlier draft used pre_auth/pre_parse/
  -- pre_persist/post_persist; those were named after the mechanism that
  -- computed them and after internal steps, so a handler restructure would have
  -- left years of stored rows meaning something subtly different.
  --
  -- The list is in lifecycle order, so "failed before being recorded" is
  -- expressible without enumerating the earlier values. A new milestone can be
  -- inserted later without renaming or re-meaning an existing one: the values
  -- are names, not positions.
  --
  -- HOW it is computed is NOT a contract and is expected to change. Today it
  -- derives from which teleCtx fields were populated at the throw site — see
  -- docs/roadmap/ai-tutor-failures-design.md §2.1. If a future version of
  -- ai-tutor has no teleCtx at all, only the derivation changes; every stored
  -- row keeps its meaning.
  --
  -- Reaching the provider is deliberately NOT a milestone here — it is
  -- orthogonal to the lifecycle and lives in provider_calls below. Folding it in
  -- would tie this vocabulary to how many upstream calls an implementation
  -- happens to make.
  stage_reached      text        NOT NULL
    CHECK (stage_reached IN ('received','identified','interpreted','recorded')),

  error_class        text        NOT NULL,

  -- OPTIONAL DIAGNOSTIC METADATA — nothing may depend on it (owner decision,
  -- 2026-07-30). The primary operational signals are error_class and
  -- stage_reached; those two identify a regression like v90 on their own. This
  -- column only shortens the diagnosis.
  --
  -- Consequences of that, deliberately:
  --   • nullable, and legitimately NULL — a panel that breaks or misleads when
  --     it is absent is a defect in the panel
  --   • truncated by the writer to 500 chars
  --   • NOT returned by the operational RPC, so the contract cannot come to
  --     depend on it
  --   • the stack trace is never stored; it stays in the Edge Function logs,
  --     findable by correlation_id
  --   • it could later be dropped, redacted, or left permanently NULL without
  --     any panel changing
  --
  -- Precedent for the caution is in index.ts's own catch: echoing String(err)
  -- previously leaked Postgres constraint and column names, and column values
  -- can be student data.
  error_message      text,

  -- teleSink.length at throw time: how many provider calls were recorded before
  -- the failure. Distinguishes "died before reaching OpenAI" from "died after".
  provider_calls     integer     NOT NULL DEFAULT 0
);

COMMENT ON TABLE public.ai_tutor_failures IS
  'Unhandled 5xx failures from ai-tutor that reach the top-level handler. Does '
  'NOT cover cold-start or bundle failures, where serve() never runs and no '
  'in-function mechanism can record anything — check Edge Function logs for '
  'those. Written by ai-tutor via service_role; read only through an '
  'owner-gated RPC.';

CREATE INDEX IF NOT EXISTS ai_tutor_failures_occurred_idx
  ON public.ai_tutor_failures (occurred_at DESC);
CREATE INDEX IF NOT EXISTS ai_tutor_failures_correlation_idx
  ON public.ai_tutor_failures (correlation_id);
CREATE INDEX IF NOT EXISTS ai_tutor_failures_request_idx
  ON public.ai_tutor_failures (request_id);

-- ── Access: identical posture to ai_model_calls ───────────────────────────
-- RLS on with NO policy, and no grant to anon/authenticated. The table is
-- service-role only; all reads go through the owner-gated RPC that will be
-- added alongside. `rls_enabled_no_policy` in the Supabase advisor is the
-- correct steady state for this table, not an oversight.
ALTER TABLE public.ai_tutor_failures ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.ai_tutor_failures FROM anon, authenticated;
GRANT INSERT, SELECT ON public.ai_tutor_failures TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.ai_tutor_failures_id_seq TO service_role;

-- No UPDATE, no DELETE, no TRUNCATE for anyone but the table owner: a failure
-- record is an observation, and observations are not edited. This also matches
-- the INV-15 posture on ai_model_calls (service_role INSERT=true, UPDATE=false,
-- DELETE=false).

-- ===========================================================================
-- Post-apply verification
--   -- 1. locked down
--   SELECT relrowsecurity FROM pg_class WHERE oid='public.ai_tutor_failures'::regclass;  -- t
--   SELECT count(*) FROM pg_policies
--    WHERE schemaname='public' AND tablename='ai_tutor_failures';                        -- 0
--   SELECT has_table_privilege('authenticated','public.ai_tutor_failures','SELECT'),
--          has_table_privilege('anon','public.ai_tutor_failures','SELECT');              -- f, f
--
--   -- 2. service_role can write but not modify history
--   SELECT has_table_privilege('service_role','public.ai_tutor_failures','INSERT'),
--          has_table_privilege('service_role','public.ai_tutor_failures','UPDATE'),
--          has_table_privilege('service_role','public.ai_tutor_failures','DELETE');      -- t, f, f
--
--   -- 3. the stage vocabulary is enforced
--   INSERT INTO public.ai_tutor_failures
--     (correlation_id, request_id, stage_reached, error_class)
--     VALUES ('test1234', gen_random_uuid(), 'nonsense', 'TestError');
--   -- expect: CHECK constraint violation
-- ===========================================================================
