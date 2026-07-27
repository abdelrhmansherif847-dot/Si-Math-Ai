#Requires -Version 7.0
<#
.SYNOPSIS
    Roll the Si Math AI Edge Function back to a previously deployed version.

.DESCRIPTION
    Reverts code, and only code. Migrations are deliberately NOT rolled back -
    see "Why migrations are not reverted" below.

    Rollback is a git-driven redeploy rather than a Dashboard click, because the
    function is a multi-file bundle: index.ts plus _shared/taxonomy.core.js.
    Restoring index.ts alone would leave the import unresolved and 500 for every
    student, which is the same failure the rollback is meant to escape. So this
    checks out the target commit into a temporary worktree and redeploys the
    whole tree through the CLI.

    WHY MIGRATIONS ARE NOT REVERTED
    DEPLOY.md section 7 is explicit: migrations are never auto-rolled-back in
    production. A down-migration against live data is at best lossy and at worst
    silently corrupting - dropping a column discards the rows written since the
    deploy, and re-adding it cannot bring them back. The supported remedy is a
    forward-fix migration. This script refuses to touch the schema and says so.

    Because the security fixes in this release are additive privilege
    REMOVALS (SEC-01, SEC-04), rolling the code back does NOT reopen them: the
    database controls stand on their own. What a code rollback does give up is
    the v88/v89 application layer - request admission control, session
    ownership checks, and the knowledge-base sanitiser. Roll back to restore
    availability, then fix forward promptly.

.PARAMETER ConfigPath
    Alternate production.config.json.

.PARAMETER ToCommit
    Git commit-ish to redeploy. Defaults to the commit before HEAD.

.PARAMETER ListOnly
    Show deployed versions and candidate commits, then exit. Changes nothing.

.PARAMETER AutoApprove
    Non-interactive.

.EXAMPLE
    ./rollback-production.ps1 -ListOnly

.EXAMPLE
    ./rollback-production.ps1 -ToCommit 02ef794

.OUTPUTS
    Exit 0 rolled back | 1 failure | 2 inconclusive | 3 config error | 4 prerequisite | 5 aborted
#>
[CmdletBinding()]
param(
    [string]$ConfigPath,
    [string]$ToCommit,
    [switch]$ListOnly,
    [switch]$AutoApprove
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Import-Module (Join-Path $PSScriptRoot 'SiMathAi.Deploy.psm1') -Force

$results   = New-ResultSet
$worktree  = $null

try {
    $repoRoot = Get-RepoRoot
    $log = Start-DeployLog -RepoRoot $repoRoot -Name 'rollback'

    Write-Banner -Title 'Si Math AI - Production Rollback' -Subtitle "log: $log"
    Set-StepTotal 6

    $cfg = Get-ProductionConfig -ConfigPath $ConfigPath
    Write-ConfigSummary $cfg

    # ── 1. Prerequisites ────────────────────────────────────────────────────
    Write-Step 'Prerequisites'
    Assert-PowerShellVersion -Minimum 7
    foreach ($name in @('supabase','git')) {
        $t = Test-Prerequisite -Command $name -Purpose 'rollback'
        if ($t.Present) { Add-Result $results 'PASS' "tool: $name" $t.Version }
        else {
            Add-Result $results 'FAIL' "tool: $name missing" ''
            [void](Write-FinalReport -Results $results -Title 'ROLLBACK REPORT')
            exit (Get-ExitCode Prerequisite)
        }
    }
    if (-not $cfg.AccessToken) {
        Add-Result $results 'FAIL' 'SUPABASE_ACCESS_TOKEN missing' 'required to deploy'
        [void](Write-FinalReport -Results $results -Title 'ROLLBACK REPORT')
        exit (Get-ExitCode ConfigError)
    }

    Push-Location $repoRoot
    try {
        # ── 2. Current state ────────────────────────────────────────────────
        Write-Step 'Current deployment state'

        $fnList = Invoke-Native -FilePath 'supabase' `
            -Arguments @('functions','list','--project-ref',$cfg.ProjectRef) -AllowFailure
        if ($fnList.ExitCode -eq 0) { Add-Result $results 'PASS' 'queried deployed functions' '' }
        else { Add-Result $results 'SKIP' 'deployed function list' "exit $($fnList.ExitCode)" }

        $fnUrl = "https://$($cfg.ProjectRef).supabase.co/functions/v1/$($cfg.EdgeFunction)"
        $live  = Invoke-HttpProbe -Uri $fnUrl -Method 'POST' -Body '{"question":"1+1"}' `
            -Headers @{ 'Content-Type' = 'application/json' }
        if ($live.Reachable) {
            Add-Result $results 'PASS' 'live endpoint responding' "HTTP $($live.StatusCode)"
            if ($live.StatusCode -ge 500) { Write-Warn 'Function is returning 5xx - rollback is appropriate.' }
        } else {
            Add-Result $results 'SKIP' 'live endpoint' "unreachable - $($live.Error)"
        }

        # ── 3. Candidate commits ────────────────────────────────────────────
        Write-Step 'Rollback candidates'
        $fnPath = "supabase/functions/$($cfg.EdgeFunction)/index.ts"
        $hist = Invoke-Native -FilePath 'git' `
            -Arguments @('log','--oneline','-n','15','--','supabase/functions/') -Quiet
        Write-Info "Recent commits touching supabase/functions/:"
        foreach ($line in ($hist.Output -split "`r?`n" | Where-Object { $_.Trim() })) { Write-Detail $line }

        if ($ListOnly) {
            Add-Result $results 'PASS' 'list only' 'no change made'
            exit (Write-FinalReport -Results $results -Title 'ROLLBACK REPORT')
        }

        if (-not $ToCommit) {
            # Previous commit that actually changed the function tree, not
            # merely the previous commit on the branch.
            $prev = (Invoke-Native -FilePath 'git' `
                -Arguments @('log','--format=%H','-n','2','--','supabase/functions/') -Quiet).Output
            $lines = @($prev -split "`r?`n" | Where-Object { $_.Trim() })
            if ($lines.Count -lt 2) {
                Add-Result $results 'FAIL' 'no previous version' 'only one commit touches supabase/functions/ - nothing to roll back to'
                [void](Write-FinalReport -Results $results -Title 'ROLLBACK REPORT')
                exit (Get-ExitCode Failure)
            }
            $ToCommit = $lines[1].Trim()
        }

        $resolved = Invoke-Native -FilePath 'git' -Arguments @('rev-parse','--verify',"$ToCommit^{commit}") -AllowFailure -Quiet
        if ($resolved.ExitCode -ne 0) {
            Add-Result $results 'FAIL' 'target commit invalid' $ToCommit
            [void](Write-FinalReport -Results $results -Title 'ROLLBACK REPORT')
            exit (Get-ExitCode ConfigError)
        }
        $targetSha = $resolved.Output.Trim()
        $subject = (Invoke-Native -FilePath 'git' -Arguments @('log','-1','--format=%s',$targetSha) -Quiet).Output.Trim()
        Add-Result $results 'PASS' 'rollback target' "$($targetSha.Substring(0,8)) - $subject"

        # ── 4. Validate the target before shipping it ───────────────────────
        # A rollback target is still a deploy. Shipping an unvalidated older
        # commit can trade one outage for another.
        Write-Step 'Validate rollback target'
        $worktree = Join-Path ([System.IO.Path]::GetTempPath()) "simathai-rollback-$([guid]::NewGuid().ToString('N').Substring(0,8))"
        $wt = Invoke-Native -FilePath 'git' -Arguments @('worktree','add','--detach',$worktree,$targetSha) -AllowFailure -Quiet
        if ($wt.ExitCode -ne 0) {
            Add-Result $results 'FAIL' 'could not create worktree' "exit $($wt.ExitCode)"
            [void](Write-FinalReport -Results $results -Title 'ROLLBACK REPORT')
            exit (Get-ExitCode Failure)
        }
        Add-Result $results 'PASS' 'worktree created' $worktree

        $wtFn = Join-Path $worktree $fnPath
        if (-not (Test-Path -LiteralPath $wtFn)) {
            Add-Result $results 'FAIL' 'target has no Edge Function source' $fnPath
            [void](Write-FinalReport -Results $results -Title 'ROLLBACK REPORT')
            exit (Get-ExitCode Failure)
        }
        $wtSrc = Get-Content -LiteralPath $wtFn -Raw
        $wtBytes = (Get-Item -LiteralPath $wtFn).Length

        if ($wtSrc -notmatch 'serve\(async \(req\)') {
            Add-Result $results 'FAIL' 'target has no serve() handler' 'refusing to deploy a stub'
            [void](Write-FinalReport -Results $results -Title 'ROLLBACK REPORT')
            exit (Get-ExitCode Failure)
        }
        if ($wtBytes -lt 40KB) {
            Add-Result $results 'FAIL' 'target source suspiciously small' "$wtBytes bytes"
            [void](Write-FinalReport -Results $results -Title 'ROLLBACK REPORT')
            exit (Get-ExitCode Failure)
        }
        Add-Result $results 'PASS' 'target source validated' "$([math]::Round($wtBytes/1KB)) KB, serve() present"

        if ($wtSrc -match "from\s+'\.\./_shared/|import\s+'\.\./_shared/") {
            if (Test-Path -LiteralPath (Join-Path $worktree 'supabase/functions/_shared/taxonomy.core.js')) {
                Add-Result $results 'PASS' 'target bundle intact' '_shared present'
            } else {
                Add-Result $results 'FAIL' 'target bundle broken' '_shared/taxonomy.core.js missing - would 500 at cold start'
                [void](Write-FinalReport -Results $results -Title 'ROLLBACK REPORT')
                exit (Get-ExitCode Failure)
            }
        }

        $targetVersion = ''
        if ($wtSrc -match "AI_TUTOR_VERSION\s*=\s*'([^']+)'") { $targetVersion = $Matches[1] }
        Add-Result $results 'PASS' 'target version' $targetVersion

        # ── 5. Redeploy ─────────────────────────────────────────────────────
        Write-Step 'Redeploy previous version'
        Write-Warn 'Schema is NOT reverted. DEPLOY.md section 7: migrations are forward-fix only.'
        Write-Detail 'SEC-01 / SEC-04 database controls are privilege removals and remain in force.'
        Write-Detail 'Rolling back code gives up the v88/v89 application-layer protections only.'

        if (-not (Confirm-Action -Prompt "Redeploy $($cfg.EdgeFunction) $targetVersion ($($targetSha.Substring(0,8))) to $($cfg.ProjectRef)?" -AutoApprove:$AutoApprove)) {
            Add-Result $results 'SKIP' 'rollback' 'operator declined'
            [void](Write-FinalReport -Results $results -Title 'ROLLBACK REPORT')
            exit (Get-ExitCode Aborted)
        }

        Push-Location $worktree
        try {
            $link = Invoke-Native -FilePath 'supabase' -Arguments @('link','--project-ref',$cfg.ProjectRef) -AllowFailure -Quiet
            if ($link.ExitCode -ne 0) {
                Add-Result $results 'FAIL' 'supabase link' "exit $($link.ExitCode)"
                [void](Write-FinalReport -Results $results -Title 'ROLLBACK REPORT')
                exit (Get-ExitCode Failure)
            }
            $dep = Invoke-Native -FilePath 'supabase' `
                -Arguments @('functions','deploy',$cfg.EdgeFunction,'--project-ref',$cfg.ProjectRef) -AllowFailure
            if ($dep.ExitCode -eq 0) { Add-Result $results 'PASS' 'rollback deployed' "$($cfg.EdgeFunction) $targetVersion" }
            else {
                Add-Result $results 'FAIL' 'rollback deploy' "exit $($dep.ExitCode) - the broken version is still live"
                [void](Write-FinalReport -Results $results -Title 'ROLLBACK REPORT')
                exit (Get-ExitCode Failure)
            }
        }
        finally { Pop-Location }

        # ── 6. Verify the rollback took ─────────────────────────────────────
        Write-Step 'Verify rollback'
        Start-Sleep -Seconds 5
        $after = Invoke-HttpProbe -Uri $fnUrl -Method 'POST' -Body '{"question":"1+1"}' `
            -Headers @{ 'Content-Type' = 'application/json' }
        if (-not $after.Reachable) {
            Add-Result $results 'SKIP' 'post-rollback probe' "unreachable - $($after.Error)"
        } elseif ($after.StatusCode -eq 401) {
            Add-Result $results 'PASS' 'function healthy after rollback' 'auth gate responding with 401'
        } elseif ($after.StatusCode -ge 500) {
            Add-Result $results 'FAIL' 'still returning 5xx after rollback' `
                "HTTP $($after.StatusCode) - the fault may not be in the function; check the database and OpenAI quota"
        } else {
            Add-Result $results 'WARN' 'post-rollback probe' "HTTP $($after.StatusCode)"
        }

        if ($cfg.TestJwt -and $cfg.AnonKey -and $after.Reachable) {
            $body = @{ question = 'What is 2+2?'; client_request_id = [guid]::NewGuid().ToString() } | ConvertTo-Json -Compress
            $auth = Invoke-HttpProbe -Uri $fnUrl -Method 'POST' -Body $body -TimeoutSec 90 -Headers @{
                'Content-Type' = 'application/json'; 'Authorization' = "Bearer $($cfg.TestJwt)"; 'apikey' = $cfg.AnonKey
            }
            if ($auth.Reachable -and $auth.StatusCode -eq 200) {
                $v = ''
                try { $v = ($auth.Content | ConvertFrom-Json).version } catch { }
                if ($v -eq $targetVersion) { Add-Result $results 'PASS' 'rolled-back version live' $v }
                else { Add-Result $results 'WARN' 'live version' "reports '$v', expected '$targetVersion'" }
            } else {
                Add-Result $results 'SKIP' 'authenticated verification' 'smoke test unavailable'
            }
        }
    }
    finally { Pop-Location }

    $exit = Write-FinalReport -Results $results -Title 'ROLLBACK REPORT'
    if ($exit -eq (Get-ExitCode Success)) {
        Write-LogLine ''
        Write-Info "Rolled back to $($targetSha.Substring(0,8)). Production is running older code."
        Write-Detail 'This is a stopgap. Fix forward and redeploy - do not leave the platform here.'
        Write-Detail "The repository is unchanged; git HEAD still points at the newer commit."
    }
    exit $exit
}
catch {
    try {
        Write-Fail "Rollback aborted: $($_.Exception.Message)"
        Write-Detail $_.ScriptStackTrace
        if ($null -ne $results -and $results.Count -gt 0) {
            [void](Write-FinalReport -Results $results -Title 'ROLLBACK REPORT (ABORTED)')
        }
    } catch {
        Write-Host "[FAIL] Rollback aborted and the error handler failed: $($_.Exception.Message)" -ForegroundColor Red
    }
    exit (Get-ExitCode Failure)
}
finally {
    # Always remove the temporary worktree, including on failure - a stale
    # worktree makes the next rollback fail with a confusing git error.
    if ($worktree -and (Test-Path -LiteralPath $worktree)) {
        try {
            & git -C $repoRoot worktree remove --force $worktree 2>&1 | Out-Null
            Write-Detail "cleaned up worktree: $worktree"
        } catch {
            Write-Warn "Could not remove temporary worktree: $worktree"
        }
    }
}
