# Deployment Runbook

This runbook prevents the migration-ordering race that caused the 2026-06-14
Mock Exam evidence-chain failure: code referencing `weakness_signals.source_session_id`
and `source_question_id` was live for ~5 hours before the migration that added
those columns was applied. Every MOCK_EXAM signal INSERT failed silently with
Postgres `42703: column does not exist`.

**Rule:** migrations are applied and verified *before* any code that depends
on them ships to production.

---

## 1. Pre-deploy checklist

- [ ] Working on the intended feature branch; `git status` clean.
- [ ] All migrations under `supabase/migrations/` that the new code depends
      on are present in the branch.
- [ ] `scripts/check-migration-parity.sh` exits 0 against the **current
      production database** (run locally with prod env vars).
- [ ] No frozen files modified without explicit unfreeze approval:
      `regenerate-reports.js`, `taxonomy.js`, `exam-mistakes-logger.js`,
      `mock-exam.html`, `weakness.html`, `focus.html`.

## 2. Apply migration FIRST

Migrations must land in production before any code that references the new
schema is deployed.

Option A — Supabase CLI (preferred):
```
supabase db push --linked
```

Option B — Dashboard SQL Editor:
- Open Supabase Dashboard → SQL Editor.
- Paste the migration file contents verbatim. Run.

## 3. Verify migration landed

Before deploying code, confirm the new columns/tables exist in the live DB.

```sql
-- Example: confirm 2026-06-14 columns
SELECT column_name
FROM   information_schema.columns
WHERE  table_schema = 'public'
  AND  table_name   = 'weakness_signals'
  AND  column_name IN ('source_session_id', 'source_question_id');
-- Expect: 2 rows.
```

Re-run `scripts/check-migration-parity.sh`. Must exit 0.

## 4. Deploy Edge Function (`ai-tutor`)

> ⛔ **FROZEN DEPLOY PATH — READ BEFORE CALLING ANY TOOL**
>
> `mcp__Supabase__deploy_edge_function` **MUST NOT be used for `ai-tutor`
> under any circumstances in any Claude Code session.**
>
> Reason: `ai-tutor/index.ts` is ~55 KB. The inline MCP deploy path has
> produced two truncated-stub incidents (2026-06-17 ×2). In both cases a
> partial or placeholder file was deployed, the `serve()` handler was absent,
> and every student request returned 500 for the duration.
>
> This prohibition applies even when the intent is to pass the full file
> content. The risk of truncation, placeholder error, or context-window
> corruption is not acceptable for a production function with no health check
> gate in front of it.
>
> **The only approved deploy paths are listed below.**

### Approved path A — Supabase Dashboard copy-paste (no PAT required)

1. Open Supabase Dashboard → Edge Functions → `ai-tutor` → Edit.
2. Copy the full contents of `supabase/functions/ai-tutor/index.ts` from the
   GitHub raw URL at the exact commit being deployed (not HEAD, not a diff —
   the raw file).
3. Select-all in the editor, paste, Save, Deploy.
4. Confirm the new platform version number appears in the Versions list and
   status is ACTIVE.
5. Run smoke test (§6) before declaring deploy complete.

### Approved path B — Supabase CLI with PAT

```bash
supabase functions deploy ai-tutor --project-ref igvkyxkmjnkzscqgommj
```

Requires `SUPABASE_ACCESS_TOKEN` set to a valid personal access token.

### Post-deploy version check

After deploy, confirm the deployed content matches the intended commit:

```bash
# From get_edge_function MCP result: check the first line of files[0].content
# Must match: // ai-tutor Edge Function v<N>
```

Or via Supabase Dashboard → Edge Functions → `ai-tutor` → version list —
confirm the expected version string in the code header.

## 5. Deploy client assets

`chat.html`, `mock-exam.html`, JS files → through the configured hosting
provider. Promote preview to production only after smoke test on preview.

## 6. Smoke test

After deploy, on production:

1. Sign in as a test account.
2. Send a chat message with text input. Expect:
   - HTTP 200, non-empty `answer`.
   - Response JSON includes `version: 'v65'`, `idempotency_recovered: false`,
     `degraded: false`.
   - Edge Function logs include no `[ai-tutor] unhandled-error` tags.
3. Confirm a new `question_records` row exists with a non-null
   `client_request_id`.
4. (Mock Exam path) Complete a 1-question mock exam with one wrong answer.
   Confirm a `weakness_signals` row with `source = 'MOCK_EXAM'` and non-null
   `source_session_id`.

## 7. Rollback

- **Edge Function:** Dashboard → Edge Functions → `ai-tutor` → Versions →
  select previous version → Restore.
- **Client assets:** revert deployment in hosting provider to previous build.
- **Migrations:** never auto-rollback in production. If a migration is
  unsafe, apply a forward-fix migration.

## 8. Post-deploy

- Watch Edge Function logs for 30 minutes for `[ai-tutor]` error tags.
- Confirm no spike in `degraded: true` responses (indicates GPT JSON parse
  failures or fallback dictionary use).
