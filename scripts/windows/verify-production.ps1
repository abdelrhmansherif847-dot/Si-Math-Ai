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
        $headersUndeployed = $false
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
                    # Almost always this means vercel.json is correct in git but
                    # the frontend has not been redeployed since. Nothing in this
                    # repo deploys the static site - not CI, not this pipeline -
                    # so header changes sit in version control until someone
                    # triggers a hosting deploy (DEPLOY.md section 5). Say that,
                    # rather than leaving the operator to re-edit a file that is
                    # already right.
                    Add-Result $results 'FAIL' "CSP present ($path)" `
                        'no Content-Security-Policy header - frontend likely not redeployed since vercel.json changed'
                    $headersUndeployed = $true
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
            if (-not $anyReachable) {
                # FAIL, not SKIP. An unset domain is "cannot verify"; a domain
                # that is set and does not answer is a CONFIGURATION ERROR, and
                # conflating the two hid a real one: ProductionDomain was
                # si-math-ai.com in reality but simathai.com in config (copied
                # from a placeholder in this repo's own README). Every header
                # probe went to a site that is not ours, reported "headers
                # missing", and sent us chasing a deploy that had already
                # happened. Worse, the same wrong value went into ALLOWED_ORIGINS,
                # so the CORS check asked the function about the value we had
                # just configured - a circular test that passed while real
                # students were being refused.
                Add-Result $results 'FAIL' 'production domain does not respond' `
                    "$siteUrl is configured but unreachable - is ProductionDomain correct? Check the domains on your hosting project."
            }

            if ($headersUndeployed) {
                Write-Warn 'Security headers are configured in vercel.json but absent from production.'
                Write-Detail 'vercel.json is a build-time config: it takes effect only on a NEW hosting deploy.'
                Write-Detail 'Nothing in this repo deploys the frontend - not CI, not this pipeline (DEPLOY.md section 5).'
                Write-Detail 'Redeploy the static site, then re-run:  vercel --prod   (or trigger a deploy in the dashboard)'
                Write-Detail 'Confirm with: curl -sSI https://<domain> | Select-String -Pattern content-security-policy'
            }
        }

        # ── Layer 5: CORS ───────────────────────────────────────────────────
        # PROBE WITH OPTIONS, NOT AN UNAUTHENTICATED POST.
        #
        # Supabase Edge Functions sit behind a platform gateway that enforces
        # JWT verification before the function runs. An unauthenticated POST is
        # rejected by that gateway, which answers with ITS OWN headers -
        # including `Access-Control-Allow-Origin: *`. The function's code never
        # executes, so the wildcard says nothing about the function's CORS: it
        # is the platform's 401, not ours.
        #
        # An earlier version of this layer probed with an unauthenticated POST
        # and duly reported "wildcard CORS" for a function whose source cannot
        # emit a wildcard at all. That is a false positive of the worst kind -
        # it points the fix at correct code.
        #
        # OPTIONS is the right probe on three counts: the gateway passes
        # preflight through un-authenticated (which is why every Supabase
        # function handles OPTIONS itself), it therefore reaches our
        # corsHeaders(), and it is exactly what a browser sends before a
        # cross-origin request. The POST checks still run, but only when a JWT
        # is available, and a wildcard on an unauthenticated POST is reported
        # as a gateway artefact rather than a failure.
        Write-Step 'Live CORS origin enforcement (SEC-03 / SEC-11)'

        foreach ($fn in @($cfg.EdgeFunction, 'admin-actions')) {
            $url = "$fnBase/$fn"
            $hostile   = 'https://evil.example'
            $lookalike = if ($siteUrl) { "$siteUrl.evil.example" } else { 'https://si-math-ai.com.evil.example' }

            $preflight = @{ 'Access-Control-Request-Method' = 'POST'
                            'Access-Control-Request-Headers' = 'authorization, content-type' }

            $optHostile = Invoke-HttpProbe -Uri $url -Method 'OPTIONS' `
                -Headers ($preflight + @{ 'Origin' = $hostile })
            if (-not $optHostile.Reachable) {
                Add-Result $results 'SKIP' "CORS: $fn" "unreachable - $($optHostile.Error)"
                continue
            }

            $acaoHostile = Get-HeaderValue $optHostile.Headers 'access-control-allow-origin'
            if ($acaoHostile -eq '*') {
                Add-Result $results 'FAIL' "CORS: $fn wildcard on preflight" `
                    'any site can read this endpoint with a visiting student session'
            } elseif ($acaoHostile -eq $hostile) {
                Add-Result $results 'FAIL' "CORS: $fn reflects Origin" `
                    'equivalent to a wildcard, and worse with credentials'
            } else {
                Add-Result $results 'PASS' "CORS: $fn rejects hostile origin" 'preflight returned no ACAO'
            }

            $optLook = Invoke-HttpProbe -Uri $url -Method 'OPTIONS' `
                -Headers ($preflight + @{ 'Origin' = $lookalike })
            $acaoLook = Get-HeaderValue $optLook.Headers 'access-control-allow-origin'
            if ($acaoLook -eq $lookalike) {
                Add-Result $results 'FAIL' "CORS: $fn accepts lookalike" `
                    'allow-list matches by suffix/substring, not exact equality'
            } else {
                Add-Result $results 'PASS' "CORS: $fn rejects lookalike origin" ''
            }

            if ($siteUrl) {
                $optProd = Invoke-HttpProbe -Uri $url -Method 'OPTIONS' `
                    -Headers ($preflight + @{ 'Origin' = $siteUrl })
                $acaoProd = Get-HeaderValue $optProd.Headers 'access-control-allow-origin'
                if ($acaoProd -eq $siteUrl) {
                    Add-Result $results 'PASS' "CORS: $fn allows production origin" $siteUrl
                } elseif (-not $acaoProd) {
                    Add-Result $results 'FAIL' "CORS: $fn blocks production origin" `
                        "browser traffic from $siteUrl will fail. ALLOWED_ORIGINS unset, or the function has not cold-started since it was set."
                } else {
                    Add-Result $results 'WARN' "CORS: $fn production origin" "echoed '$acaoProd', expected '$siteUrl'"
                }
            }

            # Unauthenticated POST: informational only. A wildcard here is the
            # platform's 401, not the function's answer.
            $postAnon = Invoke-HttpProbe -Uri $url -Method 'POST' -Body '{"question":"1+1"}' `
                -Headers @{ 'Content-Type' = 'application/json'; 'Origin' = $hostile }
            $acaoAnon = Get-HeaderValue $postAnon.Headers 'access-control-allow-origin'
            if ($acaoAnon -eq '*' -and $postAnon.StatusCode -eq 401) {
                Write-Detail "$fn : unauthenticated POST returned 401 with ACAO '*' - that is the Supabase gateway, not the function. Not a finding."
            }

            # Authenticated POST DOES reach the function, so it is a real check.
            if ($cfg.TestJwt -and $cfg.AnonKey) {
                $postAuth = Invoke-HttpProbe -Uri $url -Method 'POST' -TimeoutSec 90 `
                    -Body (@{ question = '1+1'; client_request_id = [guid]::NewGuid().ToString() } | ConvertTo-Json -Compress) `
                    -Headers @{ 'Content-Type' = 'application/json'; 'Origin' = $hostile
                                'Authorization' = "Bearer $($cfg.TestJwt)"; 'apikey' = $cfg.AnonKey }
                $acaoAuth = Get-HeaderValue $postAuth.Headers 'access-control-allow-origin'
                if ($acaoAuth -eq '*') {
                    Add-Result $results 'FAIL' "CORS: $fn wildcard on authenticated request" `
                        'the function itself is emitting a wildcard'
                } elseif ($acaoAuth -eq $hostile) {
                    Add-Result $results 'FAIL' "CORS: $fn reflects Origin on authenticated request" ''
                } else {
                    Add-Result $results 'PASS' "CORS: $fn rejects hostile origin (authenticated)" ''
                }
            } else {
                Add-Result $results 'SKIP' "CORS: $fn authenticated probe" 'needs SUPABASE_TEST_JWT and SUPABASE_ANON_KEY'
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
