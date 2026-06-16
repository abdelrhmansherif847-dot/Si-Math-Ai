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

**DO NOT use the inline `mcp__Supabase__deploy_edge_function` MCP for
`ai-tutor`.** The function exceeds 40 KB and that path has produced
truncated-stub deploys (production incident, 2026-06-?).

Use one of:

1. **Supabase Dashboard copy-paste (default path)**
   - Dashboard → Edge Functions → `ai-tutor` → Edit.
   - Copy the full contents of `supabase/functions/ai-tutor/index.ts` from
     GitHub raw URL on the commit being deployed.
   - Paste, Save, Deploy.
   - Confirm the new platform version number appears in the version list.

2. **Supabase CLI with PAT**
   ```
   supabase functions deploy ai-tutor --project-ref <ref>
   ```

After deploy, verify:
```sql
SELECT version FROM supabase_functions.hooks WHERE function_name = 'ai-tutor';
```
or via Dashboard → Edge Functions → version list.

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
