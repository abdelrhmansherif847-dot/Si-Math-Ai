#Requires -Version 7.0
<#
.SYNOPSIS
    Complete production security verification for Si Math AI.

.DESCRIPTION
    Six layers, one verdict. Read-only throughout: writes nothing, locks
    nothing, safe against production at any time.

        1. Repository   test suites and validators (offline)
        2. Supply chain CDN pins and SRI (SEC-07)
        3. Database     SEC-01 / SEC-04 / AUTHZ-01 privileges and policies
        4. Headers      live CSP and security headers (SEC-03)
        5. CORS         live origin enforcement (SEC-03 / SEC-11)
        6. Edge fn      deployed version and auth gate

    A layer that cannot run is SKIPPED, never counted as a pass. "I could not
    reach it" and "it is broken" are different claims; a verification report
    that conflates them either cries wolf or grants false confidence. That is
    why exit 2 exists and is distinct from exit 1.

    Layer 3 reads information_schema and pg_catalog directly rather than
    trusting that a migration reported success - which is exactly how the
    silent column-REVOKE no-op behind SEC-01 was caught.

.PARAMETER ConfigPath
    Alternate production.config.json.

.PARAMETER Quiet
    Suppress per-layer detail; print only the final report. Used when
    deploy-production.ps1 calls this.

.PARAMETER SkipRepoTests
    Skip layer 1 (useful when the caller has just run it).

.EXAMPLE
    ./verify-production.ps1

.EXAMPLE
    $env:SUPABASE_DB_URL = 'postgresql://...'
    $env:SUPABASE_TEST_JWT = 'eyJ...'
    ./verify-production.ps1

.OUTPUTS
    Exit 0 all verified | 1 a layer FAILED | 2 INCONCLUSIVE | 3 config error
#>
[CmdletBinding()]
param(
    [string]$ConfigPath,
    [switch]$Quiet,
    [switch]$SkipRepoTests
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Import-Module (Join-Path $PSScriptRoot 'SiMathAi.Deploy.psm1') -Force

$results = New-ResultSet

try {
    $repoRoot = Get-RepoRoot
    $log = Start-DeployLog -RepoRoot $repoRoot -Name 'verify'

    Write-Banner -Title 'Si Math AI - Production Security Verification' -Subtitle "log: $log"
    Set-StepTotal 6

    $cfg = Get-ProductionConfig -ConfigPath $ConfigPath
    if (-not $Quiet) { Write-ConfigSummary $cfg }

    $siteUrl = ''
    if ($cfg.ProductionDomain) {
        $siteUrl = if ($cfg.ProductionDomain -match '^https?://') { $cfg.ProductionDomain.TrimEnd('/') }
                   else { "https://$($cfg.ProductionDomain)" }
    }
    $fnBase = "https://$($cfg.ProjectRef).supabase.co/functions/v1"

    Push-Location $repoRoot
    try {
        # ── Layer 1: repository ─────────────────────────────────────────────
        Write-Step 'Repository test suites and validators'
        if ($SkipRepoTests) {
            Add-Result $results 'SKIP' 'repo suites' '-SkipRepoTests'
        } elseif (-not (Test-CommandExists 'node')) {
            Add-Result $results 'SKIP' 'repo suites' 'node not installed'
        } else {
            $t = Invoke-Native -FilePath 'node' -Arguments @('tests/run-all.mjs') -AllowFailure -Quiet:$Quiet
            if ($t.ExitCode -eq 0) { Add-Result $results 'PASS' 'repo suites + validators' 'all green' }
            else { Add-Result $results 'FAIL' 'repo suites + validators' "exit $($t.ExitCode)" }
        }

        # ── Layer 2: supply chain ───────────────────────────────────────────
        Write-Step 'CDN pins and SRI hashes (SEC-07)'
        $pages   = @(Get-ChildItem -LiteralPath $repoRoot -Filter '*.html' -File)
        $noSri   = [System.Collections.Generic.List[string]]::new()
        $floating= [System.Collections.Generic.List[string]]::new()
        foreach ($p in $pages) {
            $html = Get-Content -LiteralPath $p.FullName -Raw
            foreach ($m in [regex]::Matches($html, '<(script|link)[^>]*(src|href)="https://cdn\.jsdelivr\.net[^"]*"[^>]*>')) {
                if ($m.Value -notmatch 'integrity=')   { $noSri.Add("$($p.Name): no integrity") }
                if ($m.Value -notmatch 'crossorigin=') { $noSri.Add("$($p.Name): no crossorigin (SRI unenforced)") }
            }
            if ($html -match '<script[^>]*src="[^"]*supabase-js@\d+["/]') { $floating.Add("$($p.Name): floating range") }
            if ($html -match '<script[^>]*supabase-js/\+esm')             { $floating.Add("$($p.Name): unpinned +esm") }
            if ($html -match 'umd/supabase\.min\.js')                     { $floating.Add("$($p.Name): CDN-minified path has no stable hash") }
        }
        if ($noSri.Count)    { Add-Result $results 'FAIL' 'CDN tags carry SRI' (($noSri    | Select-Object -Unique) -join '; ') }
        else                 { Add-Result $results 'PASS' 'CDN tags carry SRI + crossorigin' "$($pages.Count) page(s) checked" }
        if ($floating.Count) { Add-Result $results 'FAIL' 'no floating CDN reference' (($floating | Select-Object -Unique) -join '; ') }
        else                 { Add-Result $results 'PASS' 'no floating CDN reference' '' }

        # ── Layer 3: database ───────────────────────────────────────────────
        Write-Step 'Database privileges and policies (SEC-01 / SEC-04)'
        $sqlFile = Join-Path $repoRoot 'scripts/verify-security-sql.sql'
        if (-not $cfg.DbUrl) {
            Add-Result $results 'SKIP' 'database controls' 'SUPABASE_DB_URL not set'
            Write-Detail 'Alternative: paste scripts/verify-security-sql.sql into the Supabase SQL Editor.'
        } elseif (-not (Test-CommandExists 'psql')) {
            Add-Result $results 'SKIP' 'database controls' 'psql not installed'
            Write-Detail 'Alternative: paste scripts/verify-security-sql.sql into the Supabase SQL Editor.'
        } elseif (-not (Test-Path -LiteralPath $sqlFile)) {
            Add-Result $results 'SKIP' 'database controls' 'verify-security-sql.sql not found'
        } else {
            $sec = Invoke-Native -FilePath 'psql' -Arguments @($cfg.DbUrl,'-X','-q','-f',$sqlFile) -AllowFailure -Quiet:$Quiet
            if ($sec.ExitCode -ne 0) {
                Add-Result $results 'SKIP' 'database controls' "psql exited $($sec.ExitCode) - could not connect"
            } elseif ($sec.Output -match '(?m)^\s*FAIL') {
                $failing = @($sec.Output -split "`r?`n" | Where-Object { $_ -match '^\s*FAIL' })
                Add-Result $results 'FAIL' 'database controls' "$($failing.Count) check(s) failed"
                foreach ($f in $failing) { Write-Detail $f.Trim() }
            } elseif ($sec.Output -match '(?m)^\s*PASS') {
                Add-Result $results 'PASS' 'database controls' 'SEC-01, SEC-04, AUTHZ-01, RLS baseline'
            } else {
                Add-Result $results 'SKIP' 'database controls' 'query produced no verdict rows'
            }
        }

        # ── Layer 4: security headers ───────────────────────────────────────
        Write-Step 'Live security headers and CSP (SEC-03)'
        if (-not $siteUrl) {
            Add-Result $results 'SKIP' 'security headers' 'ProductionDomain not configured'
        } else {
            # admin.html and login.html matter most: an owner session and the
            # credential entry point. A shadowed header rule shows up there.
            $paths = @('/', '/login.html', '/admin.html')
            $anyReachable = $false
            foreach ($path in $paths) {
                $r = Invoke-HttpProbe -Uri "$siteUrl$path" -TimeoutSec 25
                if (-not $r.Reachable) { continue }
                $anyReachable = $true

                $csp = Get-HeaderValue $r.Headers 'content-security-policy'
                if (-not $csp) {
                    Add-Result $results 'FAIL' "CSP present ($path)" 'no Content-Security-Policy header'
                } else {
                    $cspIssues = [System.Collections.Generic.List[string]]::new()
                    if ($csp -match "'unsafe-eval'")        { $cspIssues.Add("allows 'unsafe-eval'") }
                    if ($csp -notmatch "object-src 'none'") { $cspIssues.Add('object-src not none') }
                    if ($csp -notmatch "frame-ancestors 'none'") { $cspIssues.Add('frame-ancestors not none') }
                    if ($csp -notmatch "base-uri 'self'")   { $cspIssues.Add('base-uri not self') }
                    if ($csp -notmatch "form-action 'self'"){ $cspIssues.Add('form-action not self') }
                    if ($cspIssues.Count) { Add-Result $results 'FAIL' "CSP shape ($path)" ($cspIssues -join '; ') }
                    else                  { Add-Result $results 'PASS' "CSP shape ($path)" 'no unsafe-eval; object/frame/base/form locked' }
                }

                $hsts = Get-HeaderValue $r.Headers 'strict-transport-security'
                if ($hsts -match 'max-age=(\d+)' -and [int]$Matches[1] -ge 31536000) {
                    Add-Result $results 'PASS' "HSTS ($path)" "max-age=$($Matches[1])"
                } else {
                    Add-Result $results 'FAIL' "HSTS ($path)" "missing or under 1 year: '$hsts'"
                }

                $missing = [System.Collections.Generic.List[string]]::new()
                foreach ($h in @('x-content-type-options','x-frame-options','referrer-policy',
                                 'permissions-policy','cross-origin-opener-policy')) {
                    if (-not (Get-HeaderValue $r.Headers $h)) { $missing.Add($h) }
                }
                if ($missing.Count) { Add-Result $results 'FAIL' "security headers ($path)" "missing: $($missing -join ', ')" }
                else                { Add-Result $results 'PASS' "security headers ($path)" '5 present' }

                $poweredBy = Get-HeaderValue $r.Headers 'x-powered-by'
                if ($poweredBy) { Add-Result $results 'WARN' "info disclosure ($path)" "X-Powered-By: $poweredBy" }
            }
            if (-not $anyReachable) { Add-Result $results 'SKIP' 'security headers' "site unreachable: $siteUrl" }
        }

        # ── Layer 5: CORS ───────────────────────────────────────────────────
        Write-Step 'Live CORS origin enforcement (SEC-03 / SEC-11)'
        # admin-actions is included deliberately: its source is not in this
        # repository (SEC-11), so a live probe is the only audit available.
        foreach ($fn in @($cfg.EdgeFunction, 'admin-actions')) {
            $url = "$fnBase/$fn"
            $hostile  = 'https://evil.example'
            $lookalike = if ($siteUrl) { "$siteUrl.evil.example" } else { 'https://simathai.com.evil.example' }

            $probeHostile = Invoke-HttpProbe -Uri $url -Method 'POST' -Body '{"question":"1+1"}' `
                -Headers @{ 'Content-Type' = 'application/json'; 'Origin' = $hostile }
            if (-not $probeHostile.Reachable) {
                Add-Result $results 'SKIP' "CORS: $fn" "unreachable - $($probeHostile.Error)"
                continue
            }

            $acao = Get-HeaderValue $probeHostile.Headers 'access-control-allow-origin'
            if ($acao -eq '*') {
                Add-Result $results 'FAIL' "CORS: $fn wildcard" 'any site can read this endpoint with a visiting student session'
            } elseif ($acao -eq $hostile) {
                Add-Result $results 'FAIL' "CORS: $fn reflects Origin" 'equivalent to a wildcard, and worse with credentials'
            } else {
                Add-Result $results 'PASS' "CORS: $fn rejects hostile origin" "no ACAO returned"
            }

            $probeLook = Invoke-HttpProbe -Uri $url -Method 'POST' -Body '{"question":"1+1"}' `
                -Headers @{ 'Content-Type' = 'application/json'; 'Origin' = $lookalike }
            $acaoLook = Get-HeaderValue $probeLook.Headers 'access-control-allow-origin'
            if ($acaoLook -eq $lookalike) {
                Add-Result $results 'FAIL' "CORS: $fn accepts lookalike" 'allow-list matches by suffix/substring, not exact equality'
            } else {
                Add-Result $results 'PASS' "CORS: $fn rejects lookalike origin" ''
            }

            if ($siteUrl) {
                $probeProd = Invoke-HttpProbe -Uri $url -Method 'POST' -Body '{"question":"1+1"}' `
                    -Headers @{ 'Content-Type' = 'application/json'; 'Origin' = $siteUrl }
                $acaoProd = Get-HeaderValue $probeProd.Headers 'access-control-allow-origin'
                if ($acaoProd -eq $siteUrl) {
                    Add-Result $results 'PASS' "CORS: $fn allows production origin" $siteUrl
                } elseif (-not $acaoProd) {
                    Add-Result $results 'FAIL' "CORS: $fn blocks production origin" `
                        "legitimate traffic from $siteUrl will fail - add it to ALLOWED_ORIGINS"
                } else {
                    Add-Result $results 'WARN' "CORS: $fn production origin" "echoed '$acaoProd', expected '$siteUrl'"
                }
            }
        }

        # ── Layer 6: Edge Function ──────────────────────────────────────────
        Write-Step 'Edge Function version and auth gate'
        $fnUrl = "$fnBase/$($cfg.EdgeFunction)"
        $anon = Invoke-HttpProbe -Uri $fnUrl -Method 'POST' -Body '{"question":"1+1"}' `
            -Headers @{ 'Content-Type' = 'application/json' }
        if (-not $anon.Reachable) {
            Add-Result $results 'SKIP' 'auth gate' "unreachable - $($anon.Error)"
        } elseif ($anon.StatusCode -eq 401) {
            Add-Result $results 'PASS' 'auth gate engaged' 'unauthenticated request rejected with 401'
        } elseif ($anon.StatusCode -ge 500) {
            Add-Result $results 'FAIL' 'edge function 5xx' "HTTP $($anon.StatusCode) - likely a broken bundle"
        } else {
            Add-Result $results 'WARN' 'auth gate' "HTTP $($anon.StatusCode) (expected 401)"
        }

        # Content-Type enforcement (v88): a non-JSON body must be refused
        # before authentication, so this needs no credentials.
        if ($anon.Reachable) {
            $ct = Invoke-HttpProbe -Uri $fnUrl -Method 'POST' -Body 'question=1' `
                -Headers @{ 'Content-Type' = 'text/plain' }
            if ($ct.Reachable -and $ct.StatusCode -eq 415) {
                Add-Result $results 'PASS' 'Content-Type enforcement' 'text/plain rejected with 415'
            } elseif ($ct.Reachable -and $ct.StatusCode -eq 401) {
                Add-Result $results 'WARN' 'Content-Type enforcement' 'auth checked before content type (401 first) - acceptable'
            } elseif ($ct.Reachable) {
                Add-Result $results 'WARN' 'Content-Type enforcement' "HTTP $($ct.StatusCode) (expected 415)"
            }
        }

        if ($cfg.TestJwt -and $cfg.AnonKey -and $anon.Reachable) {
            $body = @{ question = 'What is 2+2?'; client_request_id = [guid]::NewGuid().ToString() } | ConvertTo-Json -Compress
            $auth = Invoke-HttpProbe -Uri $fnUrl -Method 'POST' -Body $body -TimeoutSec 90 -Headers @{
                'Content-Type' = 'application/json'; 'Authorization' = "Bearer $($cfg.TestJwt)"; 'apikey' = $cfg.AnonKey
            }
            if ($auth.Reachable -and $auth.StatusCode -eq 200) {
                $v = ''
                try { $v = ($auth.Content | ConvertFrom-Json).version } catch { }
                if ($cfg.ExpectedVersion -and $v -eq $cfg.ExpectedVersion) {
                    Add-Result $results 'PASS' 'deployed version' $v
                } elseif ($v) {
                    Add-Result $results 'FAIL' 'deployed version mismatch' "live '$v', expected '$($cfg.ExpectedVersion)'"
                } else {
                    Add-Result $results 'WARN' 'deployed version' 'no version field in response'
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
    finally { Pop-Location }

    exit (Write-FinalReport -Results $results -Title 'PRODUCTION VERIFICATION REPORT')
}
catch {
    try {
        Write-Fail "Verification aborted: $($_.Exception.Message)"
        Write-Detail $_.ScriptStackTrace
        if ($null -ne $results -and $results.Count -gt 0) {
            [void](Write-FinalReport -Results $results -Title 'VERIFICATION REPORT (ABORTED)')
        }
    } catch {
        Write-Host "[FAIL] Verification aborted and the error handler failed: $($_.Exception.Message)" -ForegroundColor Red
    }
    exit (Get-ExitCode Failure)
}
