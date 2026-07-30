-- ===========================================================================
-- ai_tutor_failures — record 5xx failures that reach the handler
-- ===========================================================================
-- ⛔ NOT APPLIED. Requires explicit owner approval per CLAUDE.md §3.
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

  -- Derived from which teleCtx fields were populated when the throw happened
  -- (see design §2). Derived rather than hand-maintained so it cannot drift out
  -- of sync with the code the way a manually-updated marker would.
  stage_reached      text        NOT NULL
    CHECK (stage_reached IN ('pre_auth','pre_parse','pre_persist','post_persist')),

  error_class        text        NOT NULL,

  -- Truncated by the writer to 500 chars. The stack trace is deliberately NOT
  -- stored — it stays in the Edge Function logs, findable by correlation_id.
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
