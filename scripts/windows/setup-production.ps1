#Requires -Version 7.0
<#
.SYNOPSIS
    One-time production environment setup and validation for Si Math AI.

.DESCRIPTION
    Prepares a workstation to run the deployment pipeline, and configures the
    production Edge Function secrets that the v88/v89 security hardening
    depends on.

    Idempotent: safe to run repeatedly. It reports what is already correct and
    changes only what is not. Nothing here deploys code or applies migrations -
    that is deploy-production.ps1.

    Steps:
      1. PowerShell 7+ and required tooling
      2. Repository sanity (expected layout, config file)
      3. Configuration and secret-environment validation
      4. Supabase CLI authentication and project link
      5. Edge Function secrets (ALLOWED_ORIGINS, ZERO_PERSONALITY_SHA256)
      6. Connectivity checks

.PARAMETER ConfigPath
    Alternate production.config.json.

.PARAMETER AllowedOrigins
    Overrides the config file. Comma-separated or an array. These become the
    ALLOWED_ORIGINS secret, which is what switches the Edge Function from
    permissive CORS to strict enforcement.

.PARAMETER SkipSecrets
    Validate only; do not write any Edge Function secret.

.PARAMETER AutoApprove
    Run non-interactively (CI).

.EXAMPLE
    $env:SUPABASE_ACCESS_TOKEN = 'sbp_...'
    ./setup-production.ps1 -AllowedOrigins 'https://simathai.com','https://www.simathai.com'

.OUTPUTS
    Exit 0 success | 1 failure | 2 inconclusive | 3 config error | 4 prerequisite | 5 aborted
#>
[CmdletBinding()]
param(
    [string]$ConfigPath,
    [string[]]$AllowedOrigins,
    [switch]$SkipSecrets,
    [switch]$AutoApprove
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Import-Module (Join-Path $PSScriptRoot 'SiMathAi.Deploy.psm1') -Force

$results = New-ResultSet
$exit    = 0

try {
    $repoRoot = Get-RepoRoot
    $log = Start-DeployLog -RepoRoot $repoRoot -Name 'setup'

    Write-Banner -Title 'Si Math AI - Production Setup' -Subtitle "log: $log"
    Set-StepTotal 6

    # ── 1. Tooling ──────────────────────────────────────────────────────────
    Write-Step 'Prerequisites'
    Assert-PowerShellVersion -Minimum 7

    $tools = @(
        (Test-Prerequisite -Command 'supabase' -Purpose 'migrations + Edge Function deploy' `
            -InstallHint 'winget install --id Supabase.CLI -e   (or: scoop install supabase)'),
        (Test-Prerequisite -Command 'git'  -Purpose 'branch and working-tree checks' `
            -InstallHint 'winget install --id Git.Git -e'),
        (Test-Prerequisite -Command 'node' -Purpose 'repository test suites' `
            -InstallHint 'winget install --id OpenJS.NodeJS.LTS -e'),
        (Test-Prerequisite -Command 'psql' -Purpose 'database-layer verification' -Optional `
            -InstallHint 'winget install --id PostgreSQL.PostgreSQL -e  (optional)')
    )

    $missingRequired = @()
    foreach ($t in $tools) {
        if ($t.Present) {
            Add-Result $results 'PASS' "tool: $($t.Name)" $t.Version
        } elseif ($t.Optional) {
            Add-Result $results 'WARN' "tool: $($t.Name) not found" "$($t.Purpose) will be skipped. $($t.InstallHint)"
        } else {
            Add-Result $results 'FAIL' "tool: $($t.Name) not found" $t.InstallHint
            $missingRequired += $t.Name
        }
    }

    $nodeMajor = Get-NodeMajorVersion
    if ($nodeMajor -ge 22) {
        Add-Result $results 'PASS' 'node >= 22' "major $nodeMajor (type-stripping required by the suites)"
    } elseif ($nodeMajor -gt 0) {
        Add-Result $results 'FAIL' 'node >= 22 required' "found major $nodeMajor; the Edge Function suites need built-in type stripping"
        $missingRequired += 'node>=22'
    }

    if ($missingRequired.Count) {
        Write-Fail "Missing required tooling: $($missingRequired -join ', ')"
        $exit = Write-FinalReport -Results $results -Title 'SETUP REPORT'
        exit (Get-ExitCode Prerequisite)
    }

    # ── 2. Repository ───────────────────────────────────────────────────────
    Write-Step 'Repository layout'
    $expected = @(
        'DEPLOY.md', 'SECURITY.md',
        'supabase/functions/ai-tutor/index.ts',
        'supabase/functions/_shared/taxonomy.core.js',
        'supabase/migrations',
        'tests/run-all.mjs'
    )
    $missingPaths = @()
    foreach ($rel in $expected) {
        if (-not (Test-Path -LiteralPath (Join-Path $repoRoot $rel))) { $missingPaths += $rel }
    }
    if ($missingPaths.Count) {
        Add-Result $results 'FAIL' 'repository layout' "missing: $($missingPaths -join ', ')"
    } else {
        Add-Result $results 'PASS' 'repository layout' "$($expected.Count) expected paths present"
    }

    # ── 3. Configuration ────────────────────────────────────────────────────
    Write-Step 'Configuration and secrets'
    $cfg = Get-ProductionConfig -ConfigPath $ConfigPath
    Write-ConfigSummary $cfg

    if ($AllowedOrigins -and $AllowedOrigins.Count) {
        $cfg.AllowedOrigins = @($AllowedOrigins | ForEach-Object { $_ -split ',' } | ForEach-Object { $_.Trim() } | Where-Object { $_ })
    }

    Add-Result $results 'PASS' 'config: project ref' $cfg.ProjectRef

    if ($cfg.ProductionDomain) {
        Add-Result $results 'PASS' 'config: production domain' $cfg.ProductionDomain
    } else {
        Add-Result $results 'WARN' 'config: production domain unset' 'header and CORS verification will be skipped'
    }

    # Origin shape matters: a trailing slash or a bare hostname will never match
    # a browser Origin header, and the mismatch surfaces as students getting 403.
    if ($cfg.AllowedOrigins.Count) {
        $badOrigins = @($cfg.AllowedOrigins | Where-Object { $_ -notmatch '^https://[^/]+$' })
        if ($badOrigins.Count) {
            Add-Result $results 'FAIL' 'config: malformed allowed origin' `
                "must be scheme+host with no trailing slash or path: $($badOrigins -join ', ')"
        } else {
            Add-Result $results 'PASS' 'config: allowed origins' ($cfg.AllowedOrigins -join ', ')
        }
    } else {
        Add-Result $results 'WARN' 'config: ALLOWED_ORIGINS unset' `
            'Edge Function CORS enforcement stays DISABLED until this is set (SECURITY.md SEC-03)'
    }

    if ($cfg.AccessToken) {
        Add-Result $results 'PASS' 'secret: SUPABASE_ACCESS_TOKEN' 'present in environment'
    } else {
        Add-Result $results 'FAIL' 'secret: SUPABASE_ACCESS_TOKEN missing' `
            'required to link and deploy. Create at https://supabase.com/dashboard/account/tokens'
    }
    foreach ($opt in @(
        @{ N = 'SUPABASE_DB_URL';   V = $cfg.DbUrl;   Why = 'database-layer verification' },
        @{ N = 'SUPABASE_TEST_JWT'; V = $cfg.TestJwt; Why = 'authenticated smoke tests' },
        @{ N = 'SUPABASE_ANON_KEY'; V = $cfg.AnonKey; Why = 'authenticated smoke tests' })) {
        if ($opt.V) { Add-Result $results 'PASS' "secret: $($opt.N)" 'present' }
        else        { Add-Result $results 'WARN' "secret: $($opt.N) absent" "$($opt.Why) will be skipped" }
    }

    if (-not $cfg.AccessToken) {
        $exit = Write-FinalReport -Results $results -Title 'SETUP REPORT'
        exit (Get-ExitCode ConfigError)
    }

    # ── 4. Supabase CLI auth + link ─────────────────────────────────────────
    Write-Step 'Supabase CLI authentication and project link'
    Push-Location $repoRoot
    try {
        # `link` is idempotent; re-linking an already-linked project is a no-op.
        $link = Invoke-Native -FilePath 'supabase' `
            -Arguments @('link', '--project-ref', $cfg.ProjectRef) `
            -AllowFailure -Quiet `
            -Because 'Check SUPABASE_ACCESS_TOKEN is valid and has access to this project.'
        if ($link.ExitCode -eq 0) {
            Add-Result $results 'PASS' 'supabase link' $cfg.ProjectRef
        } else {
            Add-Result $results 'FAIL' 'supabase link' "exit $($link.ExitCode) - token invalid, or no access to $($cfg.ProjectRef)"
        }

        $projects = Invoke-Native -FilePath 'supabase' -Arguments @('projects', 'list') -AllowFailure -Quiet
        if ($projects.ExitCode -eq 0 -and $projects.Output -match [regex]::Escape($cfg.ProjectRef)) {
            Add-Result $results 'PASS' 'project visible to this token' $cfg.ProjectRef
        } elseif ($projects.ExitCode -eq 0) {
            Add-Result $results 'FAIL' 'project not visible to this token' `
                "$($cfg.ProjectRef) is not in the account's project list"
        } else {
            Add-Result $results 'SKIP' 'project visibility' 'projects list unavailable'
        }
    } finally { Pop-Location }

    # ── 5. Edge Function secrets ────────────────────────────────────────────
    Write-Step 'Edge Function secrets'
    if ($SkipSecrets) {
        Add-Result $results 'SKIP' 'edge function secrets' '-SkipSecrets specified'
    } elseif (-not $cfg.AllowedOrigins.Count) {
        Add-Result $results 'WARN' 'ALLOWED_ORIGINS not written' `
            'nothing to set. CORS enforcement remains off until you supply -AllowedOrigins.'
    } else {
        Push-Location $repoRoot
        try {
            $existing = Invoke-Native -FilePath 'supabase' `
                -Arguments @('secrets', 'list', '--project-ref', $cfg.ProjectRef) -AllowFailure -Quiet
            $already = ($existing.ExitCode -eq 0 -and $existing.Output -match 'ALLOWED_ORIGINS')

            $joined = $cfg.AllowedOrigins -join ','
            $proceed = $true
            if ($already) {
                Write-Info "ALLOWED_ORIGINS already set on the project; it will be overwritten."
                $proceed = Confirm-Action -Prompt "Overwrite ALLOWED_ORIGINS with '$joined'?" -AutoApprove:$AutoApprove
            }

            if (-not $proceed) {
                Add-Result $results 'SKIP' 'ALLOWED_ORIGINS' 'operator declined overwrite'
            } else {
                # Quiet: the CLI echoes the value back, and this is the one place
                # a config value could end up in a shared log.
                $set = Invoke-Native -FilePath 'supabase' `
                    -Arguments @('secrets', 'set', "ALLOWED_ORIGINS=$joined", '--project-ref', $cfg.ProjectRef) `
                    -AllowFailure -Quiet
                if ($set.ExitCode -eq 0) {
                    Add-Result $results 'PASS' 'ALLOWED_ORIGINS set' $joined
                    Write-Detail 'CORS enforcement activates on the next Edge Function cold start.'
                } else {
                    Add-Result $results 'FAIL' 'ALLOWED_ORIGINS' "supabase secrets set exited $($set.ExitCode)"
                }
            }

            # ZERO_PERSONALITY_SHA256 (SEC-04) needs the live row, so it can only
            # be computed when a DB URL is available.
            if ($cfg.DbUrl -and (Test-CommandExists 'psql')) {
                $q = "SELECT encode(digest(body,'sha256'),'hex') FROM zero_knowledge_entries WHERE slug='zero_personality' AND is_active=true LIMIT 1;"
                $hashOut = Invoke-Native -FilePath 'psql' `
                    -Arguments @($cfg.DbUrl, '-X', '-A', '-t', '-c', $q) -AllowFailure -Quiet
                $hash = ($hashOut.Output -split "`r?`n" | Where-Object { $_ -match '^[0-9a-f]{64}$' } | Select-Object -First 1)
                if ($hash) {
                    $setHash = Invoke-Native -FilePath 'supabase' `
                        -Arguments @('secrets', 'set', "ZERO_PERSONALITY_SHA256=$hash", '--project-ref', $cfg.ProjectRef) `
                        -AllowFailure -Quiet
                    if ($setHash.ExitCode -eq 0) {
                        Add-Result $results 'PASS' 'ZERO_PERSONALITY_SHA256 set' "$($hash.Substring(0,12))..."
                        Write-Detail 'Tampering with the platform-wide system prompt now fails safe (SEC-04).'
                    } else {
                        Add-Result $results 'WARN' 'ZERO_PERSONALITY_SHA256' "secrets set exited $($setHash.ExitCode)"
                    }
                } else {
                    Add-Result $results 'WARN' 'ZERO_PERSONALITY_SHA256' `
                        'could not read the zero_personality row (pgcrypto missing, or row absent)'
                }
            } else {
                Add-Result $results 'SKIP' 'ZERO_PERSONALITY_SHA256' 'needs SUPABASE_DB_URL and psql'
            }
        } finally { Pop-Location }
    }

    # ── 6. Connectivity ─────────────────────────────────────────────────────
    Write-Step 'Connectivity'
    $fnUrl = "https://$($cfg.ProjectRef).supabase.co/functions/v1/$($cfg.EdgeFunction)"
    $probe = Invoke-HttpProbe -Uri $fnUrl -Method 'OPTIONS' -TimeoutSec 25
    if ($probe.Reachable) {
        Add-Result $results 'PASS' 'edge function endpoint reachable' "HTTP $($probe.StatusCode)"
    } else {
        Add-Result $results 'SKIP' 'edge function endpoint' "unreachable from this host - $($probe.Error)"
    }

    if ($cfg.ProductionDomain) {
        $siteUrl = if ($cfg.ProductionDomain -match '^https?://') { $cfg.ProductionDomain } else { "https://$($cfg.ProductionDomain)" }
        $siteProbe = Invoke-HttpProbe -Uri $siteUrl -TimeoutSec 25
        if ($siteProbe.Reachable) {
            Add-Result $results 'PASS' 'production site reachable' "HTTP $($siteProbe.StatusCode)"
        } else {
            Add-Result $results 'SKIP' 'production site' "unreachable - $($siteProbe.Error)"
        }
    }

    $exit = Write-FinalReport -Results $results -Title 'SETUP REPORT'

    if ($exit -eq (Get-ExitCode Success)) {
        Write-LogLine ''
        Write-Info 'Next: ./deploy-production.ps1'
    }
    exit $exit
}
catch {
    # The handler must never throw: an exception here would mask the real
    # failure and exit 0, reporting a broken run as a successful one.
    try {
        Write-Fail "Setup aborted: $($_.Exception.Message)"
        Write-Detail $_.ScriptStackTrace
        if ($null -ne $results -and $results.Count -gt 0) {
            [void](Write-FinalReport -Results $results -Title 'SETUP REPORT (ABORTED)')
        }
    } catch {
        Write-Host "[FAIL] Setup aborted and the error handler failed: $($_.Exception.Message)" -ForegroundColor Red
    }
    exit (Get-ExitCode Failure)
}
