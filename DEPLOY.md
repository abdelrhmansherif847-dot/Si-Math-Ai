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

> ⛔ **MULTI-FILE BUNDLE (v83+): copy-paste Path A is DISALLOWED.**
>
> As of v83 the function is no longer a single file, and **as of V1-T16 it is a
> FOUR-file bundle.** The Dashboard copy-paste path ships ONLY `index.ts`; the
> imports would resolve to nothing, the function would fail at cold start, and
> every student request would 500 — exactly the outage class this section
> guards against.
>
> The import graph the bundler must follow:
>
> ```
> supabase/functions/ai-tutor/index.ts
> ├── ../_shared/telemetry.core.ts       recordModelCall, flushModelCalls
> ├── ../_shared/verification.core.ts    runL3ShadowPipeline (the L3 pipeline)
> │   └── ./telemetry.core.ts            nested import
> └── ../_shared/taxonomy.core.js        side-effect import
> ```
>
> `_shared/cors.ts` and `_shared/study-planner.core.js` are NOT reachable from
> `ai-tutor` (`cors.ts` belongs to `admin-actions`). Expect exactly four files.
>
> **For any version that imports from `_shared/`, deploy via Path B (CLI) ONLY.**
> The CLI follows the import graph out of `supabase/functions/ai-tutor/` and
> pulls in the `_shared/` modules it reaches — note they are SIBLINGS of the
> function directory, not inside it. Do NOT use Path A for v83+.
>
> Post-deploy, VERIFY the bundle: `get_edge_function` (or the Dashboard file
> list) must show **all four** of `index.ts`, `_shared/telemetry.core.ts`,
> `_shared/verification.core.ts` and `_shared/taxonomy.core.js`.
>
> **This check is now load-bearing rather than precautionary.** Before V1-T16 a
> partial bundle meant a missing taxonomy helper. It now means the ENTIRE
> verification pipeline is absent, and the function cannot start at all.

### Approved path A — Supabase Dashboard copy-paste (PRE-v83 single-file only)

> ⛔ Do NOT use for v83+ (multi-file bundle — see warning above). Kept only for
> historical single-file versions.

1. Open Supabase Dashboard → Edge Functions → `ai-tutor` → Edit.
2. Copy the full contents of `supabase/functions/ai-tutor/index.ts` from the
   GitHub raw URL at the exact commit being deployed (not HEAD, not a diff —
   the raw file).
3. Select-all in the editor, paste, Save, Deploy.
4. Confirm the new platform version number appears in the Versions list and
   status is ACTIVE.
5. Run smoke test (§6) before declaring deploy complete.

### Approved path B — Supabase CLI with PAT (REQUIRED for v83+ multi-file bundle)

```bash
supabase functions deploy ai-tutor --project-ref igvkyxkmjnkzscqgommj
```

Requires `SUPABASE_ACCESS_TOKEN` set to a valid personal access token.

### 4.1 Required env vars (v88+)

v88 added CORS origin enforcement. It is **opt-in**: with `ALLOWED_ORIGINS`
unset the function accepts every origin exactly as v87 did, and logs

```
[ai-tutor] WARNING: ALLOWED_ORIGINS unset — CORS origin enforcement is DISABLED
```

on cold start. That default is deliberate — a fail-closed default would mean
deploying v88 without the secret takes the tutor down for every student, which
is the outage class this runbook exists to prevent. It also means **the
hardening does nothing until you set the variable.**

Set it once, before or after the v88 deploy:

```bash
supabase secrets set \
  ALLOWED_ORIGINS="https://<prod-domain>,https://www.<prod-domain>" \
  --project-ref igvkyxkmjnkzscqgommj
```

Include every origin that legitimately calls the function — apex, `www`, and
any custom domain. Vercel preview domains are **not** matched by a pattern;
add them explicitly if previews must call production.

Verify after setting:

```bash
# Allowed origin → 200 with the origin echoed back
curl -si -X POST "https://igvkyxkmjnkzscqgommj.supabase.co/functions/v1/ai-tutor" \
  -H "Origin: https://<prod-domain>" -H "Authorization: Bearer <test-jwt>" \
  -H "Content-Type: application/json" -d '{"question":"2+2"}' \
  | grep -i access-control-allow-origin
# Expect: access-control-allow-origin: https://<prod-domain>

# Foreign origin → 403, and no ACAO header at all
curl -si -X POST "https://igvkyxkmjnkzscqgommj.supabase.co/functions/v1/ai-tutor" \
  -H "Origin: https://evil.example" -H "Authorization: Bearer <test-jwt>" \
  -H "Content-Type: application/json" -d '{"question":"2+2"}' | head -1
# Expect: HTTP/2 403
```

If students start seeing failures right after setting this, the list is
missing an origin — check the Edge Function logs for `blocked-origin` entries,
which record the exact rejected value. Unsetting the variable restores the
permissive behaviour immediately.

### Post-deploy version check

After deploy, confirm the deployed content matches the intended commit:

```bash
# From get_edge_function MCP result: check the first line of files[0].content
# Must match: // ai-tutor Edge Function v<N>
```

Or via Supabase Dashboard → Edge Functions → `ai-tutor` → version list —
confirm the expected version string in the code header.

> **Two version strings must agree, and they have drifted before.** The banner
> on line 1 is what this check reads; `AI_TUTOR_VERSION` (~line 161) is what
> the function reports in every response and what
> `scripts/validate-ai-tutor-source.mjs` prints. v92 was committed with
> `AI_TUTOR_VERSION` bumped and the banner left at `v91`, which would have made
> this check report the *previous* version after a successful deploy — the same
> "verification step disagrees with reality" failure this check exists to
> catch. Before deploying, confirm both read the same value:
>
> ```bash
> head -1 supabase/functions/ai-tutor/index.ts
> grep -n "AI_TUTOR_VERSION = " supabase/functions/ai-tutor/index.ts
> ```

## 5. Deploy client assets

`chat.html`, `mock-exam.html`, JS files → through the configured hosting
provider. Promote preview to production only after smoke test on preview.

## 6. Smoke test

After deploy, on production:

1. Sign in as a test account.
2. Send a chat message with text input. Expect:
   - HTTP 200, non-empty `answer`.
   - Response JSON includes `idempotency_recovered: false`, `degraded: false`,
     and a `version` equal to `AI_TUTOR_VERSION` in
     `supabase/functions/ai-tutor/index.ts` — **`'v98'` for the next deploy**.
     (This line read `'v65'` until 2026-07-31, 27 versions stale, then `'v92'`
     while v93 was already committed, then `'v95'` while v96 was live and v98
     committed; a smoke test that expects the wrong version either fails a good
     deploy or gets waved through. Re-read the constant rather than trusting
     this sentence.)
   - **v98 ships two source versions in one deploy.** v97 (L3 Shadow routing)
     and v98 (conversational-turn demotion) were developed together and must
     land together: v97 alone silences the symptom that made v98's defect
     visible. Only `AI_TUTOR_VERSION = 'v98'` appears on the wire.
   - Edge Function logs include no `[ai-tutor] unhandled-error` tags.
3. Confirm a new `question_records` row exists with a non-null
   `client_request_id`.
4. (Mock Exam path) Complete a 1-question mock exam with one wrong answer.
   Confirm a `weakness_signals` row with `source = 'MOCK_EXAM'` and non-null
   `source_session_id`.

## 7. Rollback

**Record the rollback target BEFORE deploying.** It is the platform version and
`ezbr_sha256` currently live, and it is the only unambiguous identity of the
bytes you would be restoring. Capture both in the release report:

```
list_edge_functions → ai-tutor → { version, ezbr_sha256 }
```

Do not rely on a version number written in this file — it is stale the moment
the next deploy lands. Read it from the live project each time.

- **Edge Function:** Dashboard → Edge Functions → `ai-tutor` → Versions →
  select the recorded previous version → Restore. A restore reinstates the
  **whole bundle**, all four files together, so there is no partial-restore
  state to reason about.
- **Client assets:** revert deployment in hosting provider to previous build.
- **Migrations:** never auto-rollback in production. If a migration is
  unsafe, apply a forward-fix migration.

### 7.1 Rolling back the function does NOT require rolling back the migration

The two layers are independent and should be treated that way.

An additive migration that only CREATES objects nothing else reads is inert
once the code referencing it is gone. Leaving the new table in place after a
function rollback is the **recommended** partial rollback: it is harmless, and
it leaves the database forward-compatible so the retry is a function deploy
alone.

Drop a newly-added table only if it is genuinely unwanted, and only while
nothing reads it — verify that claim before relying on it rather than assuming
it. For `verification_decisions` (Truth System V0) nothing reads it until the
Audit Engine arrives, and its rollback statement is in the migration header.

## 8. Post-deploy

- Watch Edge Function logs for 30 minutes for `[ai-tutor]` error tags.
- Confirm no spike in `degraded: true` responses (indicates GPT JSON parse
  failures or fallback dictionary use).
