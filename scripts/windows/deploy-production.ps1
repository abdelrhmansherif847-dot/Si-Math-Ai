#Requires -Version 7.0
<#
.SYNOPSIS
    Full production deployment for Si Math AI: migrations, then Edge Function,
    then verification.

.DESCRIPTION
    This is DEPLOY.md executed rather than followed by hand. The ordering and
    the guards are not stylistic - each one exists because of a specific
    production incident:

      * Migrations are applied and VERIFIED before any code that depends on
        them ships. Reversing that order caused the 2026-06-14 evidence-chain
        failure, where five hours of MOCK_EXAM signal writes failed silently
        against columns that did not exist yet.

      * The Edge Function is deployed ONLY through the Supabase CLI. Since v83
        `index.ts` imports `../_shared/taxonomy.core.js`, so the function is a
        multi-file bundle; any single-file deploy path ships an index.ts whose
        import resolves to nothing and 500s at cold start for every student.
        The 2026-06-17 truncated-stub incidents are the same failure class.

      * The source is validated before deploy, and the deployed version is
        confirmed after. A deploy that "succeeded" but shipped the wrong bytes
        is the failure mode with no natural alarm.

    Stops at the first failure. Idempotent: re-running after a partial failure
    re-checks everything and re-applies only what is outstanding.

.PARAMETER ConfigPath
    Alternate production.config.json.

.PARAMETER SkipTests
    Skip the local suite. Intended for a re-run minutes after a green run, not
    for routine use.

.PARAMETER SkipMigrations
    Do not apply migrations. Use when the schema is already current and only
    the Edge Function is being shipped.

.PARAMETER MigrationsOnly
    Apply and verify migrations, then stop before deploying code.

.PARAMETER AllowFrozenChanges
    Permit deploying with frozen files modified (CLAUDE.md section 2).

.PARAMETER AutoApprove
    Non-interactive. Required for CI.

.PARAMETER DryRun
    Show what would happen. Makes no change to production.

.EXAMPLE
    $env:SUPABASE_ACCESS_TOKEN = 'sbp_...'
    ./deploy-production.ps1

.EXAMPLE
    ./deploy-production.ps1 -DryRun

.OUTPUTS
    Exit 0 success | 1 failure | 2 inconclusive | 3 config error | 4 prerequisite | 5 aborted
#>
[CmdletBinding()]
param(
    [string]$ConfigPath,
    [switch]$SkipTests,
    [switch]$SkipMigrations,
    [switch]$MigrationsOnly,
    [switch]$AllowFrozenChanges,
    [switch]$AutoApprove,
    [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Import-Module (Join-Path $PSScriptRoot 'SiMathAi.Deploy.psm1') -Force

$results = New-ResultSet

try {
    $repoRoot = Get-RepoRoot
    $log = Start-DeployLog -RepoRoot $repoRoot -Name 'deploy'

    Write-Banner -Title 'Si Math AI - Production Deployment' `
                 -Subtitle "$(if ($DryRun) { 'DRY RUN - no production change will be made' } else { 'LIVE' })  |  log: $log"
    Set-StepTotal 9

    $cfg = Get-ProductionConfig -ConfigPath $ConfigPath
    Write-ConfigSummary $cfg

    # ── 1. Prerequisites ────────────────────────────────────────────────────
    Write-Step 'Prerequisites'
    Assert-PowerShellVersion -Minimum 7

    foreach ($name in @('supabase','git','node')) {
        $t = Test-Prerequisite -Command $name -Purpose 'deployment'
        if ($t.Present) { Add-Result $results 'PASS' "tool: $name" $t.Version }
        else {
            Add-Result $results 'FAIL' "tool: $name missing" 'run setup-production.ps1'
            [void](Write-FinalReport -Results $results -Title 'DEPLOYMENT REPORT')
            exit (Get-ExitCode Prerequisite)
        }
    }
    if ((Get-NodeMajorVersion) -lt 22) {
        Add-Result $results 'FAIL' 'node >= 22 required' 'the Edge Function suites need built-in type stripping'
        [void](Write-FinalReport -Results $results -Title 'DEPLOYMENT REPORT')
        exit (Get-ExitCode Prerequisite)
    }
    if (-not $cfg.AccessToken) {
        Add-Result $results 'FAIL' 'SUPABASE_ACCESS_TOKEN missing' 'required to deploy'
        [void](Write-FinalReport -Results $results -Title 'DEPLOYMENT REPORT')
        exit (Get-ExitCode ConfigError)
    }
    Add-Result $results 'PASS' 'SUPABASE_ACCESS_TOKEN present' ''

    Push-Location $repoRoot
    try {
        # ── 2. Repository state ─────────────────────────────────────────────
        Write-Step 'Repository state'

        $branch = (Invoke-Native -FilePath 'git' -Arguments @('rev-parse','--abbrev-ref','HEAD') -Quiet).Output.Trim()
        if ($cfg.DeployBranch -and $branch -ne $cfg.DeployBranch) {
            Add-Result $results 'WARN' 'branch differs from configured deploy branch' "on '$branch', expected '$($cfg.DeployBranch)'"
        } else {
            Add-Result $results 'PASS' 'git branch' $branch
        }

        $status = (Invoke-Native -FilePath 'git' -Arguments @('status','--porcelain') -Quiet).Output
        if ($status.Trim()) {
            # A dirty tree means the artefact being deployed is not the artefact
            # in version control, so a later rollback has nothing to return to.
            Add-Result $results 'FAIL' 'working tree is dirty' 'commit or stash before deploying - a deploy must be reproducible from a commit'
            foreach ($line in ($status -split "`r?`n" | Select-Object -First 10)) { Write-Detail $line }
            [void](Write-FinalReport -Results $results -Title 'DEPLOYMENT REPORT')
            exit (Get-ExitCode Failure)
        }
        Add-Result $results 'PASS' 'working tree clean' ''

        $commit = (Invoke-Native -FilePath 'git' -Arguments @('rev-parse','--short','HEAD') -Quiet).Output.Trim()
        Add-Result $results 'PASS' 'deploying commit' $commit

        # Frozen files (CLAUDE.md section 2).
        if ($cfg.FrozenFiles.Count) {
            $baseRef = 'origin/main'
            $haveBase = (Invoke-Native -FilePath 'git' -Arguments @('rev-parse','--verify','--quiet',$baseRef) -AllowFailure -Quiet).ExitCode -eq 0
            if (-not $haveBase) {
                Add-Result $results 'SKIP' 'frozen-file check' "$baseRef not available locally (run: git fetch origin main)"
            } else {
                $changed = (Invoke-Native -FilePath 'git' `
                    -Arguments (@('diff','--name-only',"$baseRef...HEAD","--") + $cfg.FrozenFiles) -Quiet).Output
                $touched = @($changed -split "`r?`n" | Where-Object { $_.Trim() })
                if ($touched.Count -and -not $AllowFrozenChanges) {
                    Add-Result $results 'FAIL' 'frozen files modified' `
                        "$($touched -join ', ') - pass -AllowFrozenChanges only with explicit owner approval"
                    [void](Write-FinalReport -Results $results -Title 'DEPLOYMENT REPORT')
                    exit (Get-ExitCode Failure)
                } elseif ($touched.Count) {
                    Add-Result $results 'WARN' 'frozen files modified (approved)' ($touched -join ', ')
                } else {
                    Add-Result $results 'PASS' 'frozen files untouched' "$($cfg.FrozenFiles.Count) checked"
                }
            }
        }

        # ── 3. Local gates ──────────────────────────────────────────────────
        Write-Step 'Local test suites and validators'
        if ($SkipTests) {
            Add-Result $results 'SKIP' 'test suites' '-SkipTests specified'
        } else {
            $t = Invoke-Native -FilePath 'node' -Arguments @('tests/run-all.mjs') -AllowFailure
            if ($t.ExitCode -eq 0) { Add-Result $results 'PASS' 'test suites + validators' 'all green' }
            else {
                Add-Result $results 'FAIL' 'test suites' "node tests/run-all.mjs exited $($t.ExitCode)"
                [void](Write-FinalReport -Results $results -Title 'DEPLOYMENT REPORT')
                exit (Get-ExitCode Failure)
            }
        }

        # ── 4. Edge Function source validation ──────────────────────────────
        # Structural check before deploy: catches a truncated or stubbed source
        # while it is still cheap, rather than after every student sees a 500.
        Write-Step 'Edge Function source validation'
        $fnPath = "supabase/functions/$($cfg.EdgeFunction)/index.ts"
        if (-not (Test-Path -LiteralPath $fnPath)) {
            Add-Result $results 'FAIL' 'edge function source missing' $fnPath
            [void](Write-FinalReport -Results $results -Title 'DEPLOYMENT REPORT')
            exit (Get-ExitCode Failure)
        }

        $src = Get-Content -LiteralPath $fnPath -Raw
        $bytes = (Get-Item -LiteralPath $fnPath).Length

        if ($src -match 'serve\(async \(req\)') { Add-Result $results 'PASS' 'serve() handler present' "$([math]::Round($bytes/1KB)) KB" }
        else {
            Add-Result $results 'FAIL' 'serve() handler ABSENT' 'this is the 2026-06-17 stub signature - do not deploy'
            [void](Write-FinalReport -Results $results -Title 'DEPLOYMENT REPORT')
            exit (Get-ExitCode Failure)
        }

        if ($bytes -lt 40KB) {
            Add-Result $results 'FAIL' 'source suspiciously small' "$bytes bytes - expected >= 40 KB"
            [void](Write-FinalReport -Results $results -Title 'DEPLOYMENT REPORT')
            exit (Get-ExitCode Failure)
        }

        $sharedImport = $src -match "from\s+'\.\./_shared/|import\s+'\.\./_shared/"
        if ($sharedImport) {
            $sharedPath = "supabase/functions/_shared/taxonomy.core.js"
            if (Test-Path -LiteralPath $sharedPath) {
                Add-Result $results 'PASS' 'multi-file bundle intact' '_shared/taxonomy.core.js present - CLI deploy required'
            } else {
                Add-Result $results 'FAIL' '_shared dependency missing' "$sharedPath - the function would 500 at cold start"
                [void](Write-FinalReport -Results $results -Title 'DEPLOYMENT REPORT')
                exit (Get-ExitCode Failure)
            }
        }

        $srcVersion = ''
        if ($src -match "AI_TUTOR_VERSION\s*=\s*'([^']+)'") { $srcVersion = $Matches[1] }
        if ($cfg.ExpectedVersion -and $srcVersion -and $srcVersion -ne $cfg.ExpectedVersion) {
            Add-Result $results 'FAIL' 'version mismatch' "source is '$srcVersion', config expects '$($cfg.ExpectedVersion)'"
            [void](Write-FinalReport -Results $results -Title 'DEPLOYMENT REPORT')
            exit (Get-ExitCode ConfigError)
        }
        Add-Result $results 'PASS' 'source version' $srcVersion

        # ── 5. Migrations ───────────────────────────────────────────────────
        Write-Step 'Database migrations'
        if ($SkipMigrations) {
            Add-Result $results 'SKIP' 'migrations' '-SkipMigrations specified'
        } else {
            $link = Invoke-Native -FilePath 'supabase' -Arguments @('link','--project-ref',$cfg.ProjectRef) -AllowFailure -Quiet
            if ($link.ExitCode -ne 0) {
                Add-Result $results 'FAIL' 'supabase link' "exit $($link.ExitCode) - check SUPABASE_ACCESS_TOKEN"
                [void](Write-FinalReport -Results $results -Title 'DEPLOYMENT REPORT')
                exit (Get-ExitCode Failure)
            }
            Add-Result $results 'PASS' 'supabase link' $cfg.ProjectRef

            # Preview first. `db push --dry-run` lists what would be applied, so
            # the operator approves a concrete list rather than a blank cheque.
            $dry = Invoke-Native -FilePath 'supabase' -Arguments @('db','push','--dry-run','--linked') -AllowFailure
            if ($dry.ExitCode -ne 0) {
                Add-Result $results 'FAIL' 'migration dry-run' "exit $($dry.ExitCode)"
                [void](Write-FinalReport -Results $results -Title 'DEPLOYMENT REPORT')
                exit (Get-ExitCode Failure)
            }

            $pending = @($dry.Output -split "`r?`n" | Where-Object { $_ -match '^\s*\d{14}|\.sql\s*$' })
            if (-not $pending.Count -and $dry.Output -match 'up to date|no migrations|nothing to') {
                Add-Result $results 'PASS' 'migrations already current' 'nothing to apply'
            } elseif ($DryRun) {
                Add-Result $results 'SKIP' 'migrations (dry run)' "$($pending.Count) pending; -DryRun makes no change"
            } else {
                Write-Warn 'Migrations are irreversible in production (DEPLOY.md section 7: forward-fix only).'
                foreach ($p in $pending) { Write-Detail $p.Trim() }
                if (-not (Confirm-Action -Prompt "Apply the migration(s) above to $($cfg.ProjectRef)?" -AutoApprove:$AutoApprove)) {
                    Add-Result $results 'SKIP' 'migrations' 'operator declined'
                    [void](Write-FinalReport -Results $results -Title 'DEPLOYMENT REPORT')
                    exit (Get-ExitCode Aborted)
                }
                $push = Invoke-Native -FilePath 'supabase' -Arguments @('db','push','--linked') -AllowFailure
                if ($push.ExitCode -eq 0) { Add-Result $results 'PASS' 'migrations applied' "$($pending.Count) migration(s)" }
                else {
                    Add-Result $results 'FAIL' 'migration apply' "exit $($push.ExitCode) - schema may be partially applied; inspect before retrying"
                    [void](Write-FinalReport -Results $results -Title 'DEPLOYMENT REPORT')
                    exit (Get-ExitCode Failure)
                }
            }

            # ── 6. Verify the schema actually landed ────────────────────────
            # DEPLOY.md section 3: confirm before shipping dependent code.
            Write-Step 'Verify migrations landed'
            $list = Invoke-Native -FilePath 'supabase' -Arguments @('migration','list','--linked') -AllowFailure -Quiet
            if ($list.ExitCode -eq 0) {
                $stillPending = @($list.Output -split "`r?`n" |
                    Where-Object { $_ -match '^\s*\d{14}\s*\|\s*$' -or $_ -match '\|\s*$' -and $_ -match '\d{14}' })
                if ($DryRun) {
                    Add-Result $results 'SKIP' 'schema parity' '-DryRun'
                } elseif ($stillPending.Count -eq 0) {
                    Add-Result $results 'PASS' 'schema parity' 'local and remote migration histories agree'
                } else {
                    Add-Result $results 'WARN' 'schema parity' "$($stillPending.Count) row(s) look unapplied - review 'supabase migration list --linked'"
                }
            } else {
                Add-Result $results 'SKIP' 'schema parity' 'migration list unavailable'
            }

            if ($cfg.DbUrl -and (Test-CommandExists 'psql') -and -not $DryRun) {
                $sqlFile = Join-Path $repoRoot 'scripts/verify-security-sql.sql'
                if (Test-Path -LiteralPath $sqlFile) {
                    $sec = Invoke-Native -FilePath 'psql' -Arguments @($cfg.DbUrl,'-X','-q','-f',$sqlFile) -AllowFailure
                    if ($sec.ExitCode -ne 0) {
                        Add-Result $results 'WARN' 'security SQL checks' "psql exited $($sec.ExitCode)"
                    } elseif ($sec.Output -match '(?m)^\s*FAIL') {
                        Add-Result $results 'FAIL' 'security SQL checks' 'a database-layer control is not in force - see output above'
                        [void](Write-FinalReport -Results $results -Title 'DEPLOYMENT REPORT')
                        exit (Get-ExitCode Failure)
                    } else {
                        Add-Result $results 'PASS' 'security SQL checks' 'SEC-01 / SEC-04 / AUTHZ-01 in force'
                    }
                }
            } else {
                Add-Result $results 'SKIP' 'security SQL checks' 'needs SUPABASE_DB_URL and psql'
            }
        }

        if ($MigrationsOnly) {
            Write-Info '-MigrationsOnly: stopping before Edge Function deploy.'
            exit (Write-FinalReport -Results $results -Title 'DEPLOYMENT REPORT')
        }

        # ── 7. Deploy the Edge Function ─────────────────────────────────────
        Write-Step "Deploy Edge Function '$($cfg.EdgeFunction)'"
        if ($DryRun) {
            Add-Result $results 'SKIP' 'edge function deploy' "-DryRun (would run: supabase functions deploy $($cfg.EdgeFunction))"
        } else {
            if (-not (Confirm-Action -Prompt "Deploy $($cfg.EdgeFunction) $srcVersion to $($cfg.ProjectRef)?" -AutoApprove:$AutoApprove)) {
                Add-Result $results 'SKIP' 'edge function deploy' 'operator declined'
                [void](Write-FinalReport -Results $results -Title 'DEPLOYMENT REPORT')
                exit (Get-ExitCode Aborted)
            }
            # CLI only. This is the sole approved path for a multi-file bundle:
            # it uploads the whole supabase/functions/<name>/ tree including
            # _shared. See DEPLOY.md section 4.
            $dep = Invoke-Native -FilePath 'supabase' `
                -Arguments @('functions','deploy',$cfg.EdgeFunction,'--project-ref',$cfg.ProjectRef) -AllowFailure
            if ($dep.ExitCode -eq 0) { Add-Result $results 'PASS' 'edge function deployed' "$($cfg.EdgeFunction) $srcVersion" }
            else {
                Add-Result $results 'FAIL' 'edge function deploy' "exit $($dep.ExitCode) - previous version remains live"
                [void](Write-FinalReport -Results $results -Title 'DEPLOYMENT REPORT')
                exit (Get-ExitCode Failure)
            }
        }

        # ── 8. Post-deploy verification ─────────────────────────────────────
        Write-Step 'Post-deploy verification'
        $fnUrl = "https://$($cfg.ProjectRef).supabase.co/functions/v1/$($cfg.EdgeFunction)"

        if ($DryRun) {
            Add-Result $results 'SKIP' 'post-deploy verification' '-DryRun'
        } else {
            # Cold start can lag the deploy by a few seconds.
            Start-Sleep -Seconds 5

            # Unauthenticated probe. A healthy function rejects with 401; a
            # stub or broken bundle 500s. This distinguishes them without
            # needing credentials.
            $probe = Invoke-HttpProbe -Uri $fnUrl -Method 'POST' `
                -Headers @{ 'Content-Type' = 'application/json' } -Body '{"question":"1+1"}'
            if (-not $probe.Reachable) {
                Add-Result $results 'SKIP' 'auth gate probe' "endpoint unreachable from this host - $($probe.Error)"
            } elseif ($probe.StatusCode -eq 401) {
                Add-Result $results 'PASS' 'auth gate engaged' 'unauthenticated request rejected with 401'
            } elseif ($probe.StatusCode -ge 500) {
                Add-Result $results 'FAIL' 'function returns 5xx' `
                    "HTTP $($probe.StatusCode) - likely a broken bundle. ROLL BACK: ./rollback-production.ps1"
            } else {
                Add-Result $results 'WARN' 'auth gate probe' "HTTP $($probe.StatusCode) (expected 401)"
            }

            # Authenticated round-trip confirms the deployed version string.
            if ($cfg.TestJwt -and $cfg.AnonKey -and $probe.Reachable) {
                $body = @{ question = 'What is 2+2?'; client_request_id = [guid]::NewGuid().ToString() } | ConvertTo-Json -Compress
                $auth = Invoke-HttpProbe -Uri $fnUrl -Method 'POST' -Body $body -Headers @{
                    'Content-Type'  = 'application/json'
                    'Authorization' = "Bearer $($cfg.TestJwt)"
                    'apikey'        = $cfg.AnonKey
                } -TimeoutSec 90
                if ($auth.Reachable -and $auth.StatusCode -eq 200) {
                    $deployedVersion = ''
                    try { $deployedVersion = ($auth.Content | ConvertFrom-Json).version } catch { }
                    if ($cfg.ExpectedVersion -and $deployedVersion -eq $cfg.ExpectedVersion) {
                        Add-Result $results 'PASS' 'deployed version confirmed' $deployedVersion
                    } elseif ($deployedVersion) {
                        Add-Result $results 'FAIL' 'deployed version mismatch' `
                            "live reports '$deployedVersion', expected '$($cfg.ExpectedVersion)' - the deploy did not take"
                    } else {
                        Add-Result $results 'WARN' 'deployed version' 'response carried no version field'
                    }
                } elseif ($auth.Reachable) {
                    Add-Result $results 'FAIL' 'authenticated smoke test' "HTTP $($auth.StatusCode)"
                } else {
                    Add-Result $results 'SKIP' 'authenticated smoke test' $auth.Error
                }
            } else {
                Add-Result $results 'SKIP' 'authenticated smoke test' 'needs SUPABASE_TEST_JWT and SUPABASE_ANON_KEY'
            }
        }

        # ── 9. Security verification ────────────────────────────────────────
        Write-Step 'Security verification'
        if ($DryRun) {
            Add-Result $results 'SKIP' 'security verification' '-DryRun'
        } else {
            $verify = Join-Path $PSScriptRoot 'verify-production.ps1'
            if (Test-Path -LiteralPath $verify) {
                Write-Info 'Handing off to verify-production.ps1 ...'
                # Run in a CHILD PROCESS, not with the call operator. Both
                # scripts import the same module, and the child's
                # `Import-Module -Force` re-initialises module-scoped state in
                # a shared process - which silently repointed this run's log
                # path at the verify log, so the deployment report cited the
                # wrong file. A separate process keeps each script's logging
                # and step counters its own, and makes the exit code
                # unambiguous.
                $hostExe = (Get-Process -Id $PID).Path
                if (-not $hostExe) { $hostExe = 'pwsh' }
                & $hostExe -NoProfile -File $verify -ConfigPath $cfg.ConfigPath -Quiet
                switch ($LASTEXITCODE) {
                    0 { Add-Result $results 'PASS' 'production verification' 'all layers verified' }
                    2 { Add-Result $results 'SKIP' 'production verification' 'inconclusive - see verify log' }
                    default { Add-Result $results 'FAIL' 'production verification' "verify-production.ps1 exited $LASTEXITCODE" }
                }
            } else {
                Add-Result $results 'SKIP' 'production verification' 'verify-production.ps1 not found'
            }
        }
    }
    finally { Pop-Location }

    $exit = Write-FinalReport -Results $results -Title 'DEPLOYMENT REPORT'
    if ($exit -eq (Get-ExitCode Success) -and -not $DryRun) {
        Write-LogLine ''
        Write-Info 'Deployment complete. Watch Edge Function logs for 30 minutes (DEPLOY.md section 8).'
        Write-Detail 'Tags to watch: unhandled-error, session-ownership-denied, blocked-origin, rate-limited'
        Write-Detail 'Roll back with: ./rollback-production.ps1'
    }
    exit $exit
}
catch {
    try {
        Write-Fail "Deployment aborted: $($_.Exception.Message)"
        Write-Detail $_.ScriptStackTrace
        Write-Warn 'Production may be in a partial state. Check what completed above before retrying.'
        Write-Warn 'If the Edge Function was deployed and is unhealthy: ./rollback-production.ps1'
        if ($null -ne $results -and $results.Count -gt 0) {
            [void](Write-FinalReport -Results $results -Title 'DEPLOYMENT REPORT (ABORTED)')
        }
    } catch {
        Write-Host "[FAIL] Deployment aborted and the error handler failed: $($_.Exception.Message)" -ForegroundColor Red
    }
    exit (Get-ExitCode Failure)
}
