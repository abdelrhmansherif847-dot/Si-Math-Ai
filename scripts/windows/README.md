# Si Math AI — Windows deployment pipeline

Four PowerShell 7 scripts that take production from "code committed" to
"verified live", with the guardrails from `DEPLOY.md` and `CLAUDE.md` enforced
by the tooling rather than by memory.

```
setup-production.ps1     one-time workstation + project setup
deploy-production.ps1    migrations -> Edge Function -> verification
verify-production.ps1    six-layer read-only security verification
rollback-production.ps1  redeploy a previous Edge Function version
SiMathAi.Deploy.psm1     shared engine (logging, config, exec, reporting)
production.config.json   non-secret configuration
```

## Requirements

| Tool | Why | Install |
|---|---|---|
| PowerShell **7.0+** | the scripts use 7-only syntax | `winget install --id Microsoft.PowerShell -e` |
| Supabase CLI | migrations + Edge Function deploy | `winget install --id Supabase.CLI -e` |
| Git | branch, tree and frozen-file checks | `winget install --id Git.Git -e` |
| Node **22+** | repository test suites | `winget install --id OpenJS.NodeJS.LTS -e` |
| psql | *optional* — database-layer verification | `winget install --id PostgreSQL.PostgreSQL -e` |

Windows PowerShell 5.1 is **not** supported.

## Configuration

`production.config.json` holds only values that are already public. **It must
never contain a secret.** Secrets are read from the environment at run time,
never written to disk, and never echoed into a log:

```powershell
$env:SUPABASE_ACCESS_TOKEN = 'sbp_...'   # required to deploy
$env:SUPABASE_DB_URL       = 'postgresql://...'  # optional: DB verification
$env:SUPABASE_TEST_JWT     = 'eyJ...'    # optional: authenticated smoke tests
$env:SUPABASE_ANON_KEY     = 'sb_publishable_...'
```

Any config value can be overridden by an environment variable of the same name
in SCREAMING_SNAKE_CASE (`SUPABASE_PROJECT_REF`, `PRODUCTION_DOMAIN`,
`EXPECTED_VERSION`, `ALLOWED_ORIGINS`, `DEPLOY_BRANCH`, `EDGE_FUNCTION_NAME`).

## Exit codes

Shared by all four scripts.

| Code | Meaning |
|---|---|
| 0 | success — every check passed |
| 1 | a check **failed** |
| 2 | **inconclusive** — a check could not run |
| 3 | configuration missing or invalid |
| 4 | required tool or version missing |
| 5 | operator declined a confirmation |

**2 is not a pass.** "I could not reach it" and "it is broken" are different
claims; a pipeline that conflates them either cries wolf or grants false
confidence. Anything that cannot be verified is reported `SKIP` and blocks a
clean result.

## Usage

### First time

```powershell
cd scripts\windows
$env:SUPABASE_ACCESS_TOKEN = 'sbp_...'
.\setup-production.ps1 -AllowedOrigins 'https://simathai.com','https://www.simathai.com'
```

Setting `ALLOWED_ORIGINS` is what switches the Edge Function from permissive
CORS to strict enforcement (`SECURITY.md` SEC-03). Until it is set, the
function accepts every origin and logs a warning on cold start — a deliberate
fail-open default so that deploying v88+ without the secret cannot take the
tutor down for every student.

If `SUPABASE_DB_URL` and `psql` are available, setup also computes and sets
`ZERO_PERSONALITY_SHA256`, which pins the platform-wide system prompt so
tampering fails safe (SEC-04).

### Deploy

```powershell
.\deploy-production.ps1 -DryRun     # preview, changes nothing
.\deploy-production.ps1             # live, prompts before each production change
.\deploy-production.ps1 -AutoApprove  # unattended (CI)
```

Nine steps, stopping at the first failure:

1. Prerequisites
2. Repository state — branch, clean tree, frozen files
3. Local test suites and validators
4. Edge Function source validation
5. Migrations (preview → confirm → apply)
6. **Verify migrations landed** before any dependent code ships
7. Edge Function deploy (Supabase CLI only)
8. Post-deploy verification — auth gate, deployed version
9. Hand-off to `verify-production.ps1`

Useful switches: `-SkipTests`, `-SkipMigrations`, `-MigrationsOnly`,
`-AllowFrozenChanges`, `-MigrationMode`.

**On step 5 and `-MigrationMode`.** `supabase db push` does not work on this
project and never has: local migration files are 8-digit date prefixes while the
remote history table holds 14-digit timestamps, so the two sets are disjoint and
the CLI reports *"Remote migration versions not found in local migrations
directory"*. See `docs/supabase-migrations.md` for the full explanation and
the reconciliation route.

`-MigrationMode Auto` (the default) detects that condition and asserts the
schema directly with `scripts/verify-security-sql.sql` instead. That is not a
weaker check — push compares filenames against a history table, while
verification reads `information_schema` and `pg_policies` and confirms the
controls are actually in force. It is what caught the silent column-`REVOKE`
no-op behind SEC-01.

It is also not a bypass: if the schema check cannot run (no `SUPABASE_DB_URL`,
no `psql`) the step reports `SKIP` and the deployment result becomes
`INCONCLUSIVE`, which blocks the release exactly as a failure would. Use
`-MigrationMode Push` to require the CLI path once a `supabase db pull`
reconciliation has made it viable.

### Verify

```powershell
.\verify-production.ps1
```

Read-only, safe against production at any time. Six layers: repo suites, CDN
pins and SRI, database privileges and policies, live CSP and security headers,
live CORS enforcement, Edge Function version and auth gate.

Layer 5 probes **`admin-actions`** as well as `ai-tutor`. That function's source
is not in this repository (`SECURITY.md` SEC-11), so a live probe is the only
audit currently available for it.

**Layer 5 probes with OPTIONS, not an unauthenticated POST.** Supabase Edge
Functions sit behind a platform gateway that verifies the JWT *before* the
function runs. An unauthenticated POST is rejected by that gateway, which
answers with its own headers — including `Access-Control-Allow-Origin: *`. The
function's code never executes, so that wildcard says nothing about the
function's CORS. An earlier version of this layer probed that way and reported
"wildcard CORS" against a function whose source cannot emit a wildcard at all.
Preflight is passed through un-authenticated, reaches `corsHeaders()`, and is
what a browser actually sends — so it is the correct probe. The authenticated
POST check still runs when `SUPABASE_TEST_JWT` is available.

**Layer 4 failing usually means the frontend was not redeployed.** `vercel.json`
is build-time config: nothing in this repo deploys the static site — not CI, not
`deploy-production.ps1` — so header changes sit in git until a hosting deploy is
triggered (`DEPLOY.md` §5). The layer says so when CSP is absent rather than
implying the config is wrong.

### Roll back

```powershell
.\rollback-production.ps1 -ListOnly          # show candidates, change nothing
.\rollback-production.ps1                    # previous version
.\rollback-production.ps1 -ToCommit 02ef794  # a specific commit
```

Rollback checks the target commit out into a temporary git worktree, validates
it (handler present, plausible size, `_shared` intact), redeploys the **whole
tree**, then verifies. It reverts code only — see below.

## Why the pipeline is shaped this way

Each guard exists because of a specific incident, not as ceremony.

**Migrations are applied and verified before dependent code ships.** Reversing
that order caused the 2026-06-14 evidence-chain failure: five hours of
`MOCK_EXAM` signal writes failed silently against columns that did not exist
yet.

**The Edge Function deploys only through the Supabase CLI.** Since v83
`index.ts` imports `../_shared/taxonomy.core.js`, so it is a multi-file bundle.
Any single-file path ships an `index.ts` whose import resolves to nothing and
500s at cold start for every student — the 2026-06-17 truncated-stub incidents.
The deploy script refuses to proceed if `_shared` is missing, and checks for the
`serve()` handler and a plausible file size before shipping.

**The deployed version is confirmed after deploy, not assumed.** A deploy that
"succeeded" but shipped the wrong bytes has no natural alarm; the script
compares the live `version` field against the source.

**A dirty working tree fails the deploy.** If the artefact being deployed is not
the artefact in version control, a later rollback has nothing to return to.

**Migrations are never rolled back.** `DEPLOY.md` §7: a down-migration against
live data is at best lossy — dropping a column discards every row written since
the deploy, and re-adding it cannot bring them back. Forward-fix only, and
`rollback-production.ps1` refuses to touch the schema.

Because the security fixes in this release are privilege **removals** (SEC-01,
SEC-04), a code rollback does not reopen them — the database controls stand on
their own. What a rollback gives up is the v88/v89 application layer: request
admission control, session-ownership checks, and the knowledge-base sanitiser.
Roll back to restore availability, then fix forward promptly.

## Logging

Every run writes `logs/<script>-<UTC timestamp>.log` alongside the coloured
console output. `logs/` is git-ignored. Secrets are never written — the config
summary reports each one as `present` or `absent` only.

## CI

```powershell
$env:SUPABASE_ACCESS_TOKEN = $env:SUPABASE_TOKEN_SECRET
pwsh -NoProfile -File scripts/windows/deploy-production.ps1 -AutoApprove
if ($LASTEXITCODE -ne 0) { throw "Deployment failed with exit code $LASTEXITCODE" }
```

`-AutoApprove` is required for unattended runs; without it the script waits for
the operator to type `yes` before each production change.
