<#
.SYNOPSIS
    Shared engine for the Si Math AI production deployment pipeline.

.DESCRIPTION
    Logging, colored output, configuration loading, prerequisite checks,
    native-command execution and result aggregation for:

        setup-production.ps1
        deploy-production.ps1
        verify-production.ps1
        rollback-production.ps1

    Everything the four scripts share lives here so a change to logging,
    exit-code policy or failure handling happens in exactly one place.

.NOTES
    Requires PowerShell 7.0+. Not compatible with Windows PowerShell 5.1.
#>

Set-StrictMode -Version Latest

# ── Exit codes ──────────────────────────────────────────────────────────────
# Shared by all four scripts. The distinction between 1 and 2 is load-bearing:
# "a check failed" and "a check could not run" are different claims, and a
# pipeline that conflates them either cries wolf or grants false confidence.
$script:ExitCodes = @{
    Success       = 0   # every step passed
    Failure       = 1   # a step failed outright
    Inconclusive  = 2   # a step could not be verified — NOT a pass
    ConfigError   = 3   # configuration missing or invalid
    Prerequisite  = 4   # required tool or version missing
    Aborted       = 5   # operator declined a confirmation
}
function Get-ExitCode { param([Parameter(Mandatory)][string]$Name) $script:ExitCodes[$Name] }

# ── Console styling ─────────────────────────────────────────────────────────
# ASCII tags rather than Unicode glyphs: conhost, the ISE and older Windows
# Terminal profiles mangle box-drawing and emoji depending on code page, and a
# deployment log that renders as mojibake is a log nobody reads.
$script:Sym = @{
    Ok = '[ OK ]'; Fail = '[FAIL]'; Warn = '[WARN]'; Info = '[INFO]'
    Skip = '[SKIP]'; Step = '[ >> ]'; Dot = '      '
}

$script:LogFile     = $null
$script:StepCounter = 0
$script:StepTotal   = 0

function Write-LogLine {
    param([string]$Text, [string]$Color = 'Gray', [switch]$NoConsole)
    if (-not $NoConsole) { Write-Host $Text -ForegroundColor $Color }
    if ($script:LogFile) {
        $stamp = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
        # Strip colour intent; the file is plain text with a UTC timestamp.
        Add-Content -LiteralPath $script:LogFile -Value "$stamp  $Text" -Encoding utf8
    }
}

function Write-Banner {
    param([Parameter(Mandatory)][string]$Title, [string]$Subtitle = '')
    $line = '=' * 74
    Write-LogLine ''
    Write-LogLine $line 'DarkCyan'
    Write-LogLine "  $Title" 'Cyan'
    if ($Subtitle) { Write-LogLine "  $Subtitle" 'DarkGray' }
    Write-LogLine $line 'DarkCyan'
}

function Write-Step {
    param([Parameter(Mandatory)][string]$Message)
    $script:StepCounter++
    $prefix = if ($script:StepTotal -gt 0) { "$($script:StepCounter)/$($script:StepTotal)" } else { "$($script:StepCounter)" }
    Write-LogLine ''
    Write-LogLine "$($script:Sym.Step) Step $prefix - $Message" 'White'
}

function Write-Ok     { param([string]$m) Write-LogLine "$($script:Sym.Ok) $m"   'Green' }
function Write-Fail   { param([string]$m) Write-LogLine "$($script:Sym.Fail) $m" 'Red' }
function Write-Warn   { param([string]$m) Write-LogLine "$($script:Sym.Warn) $m" 'Yellow' }
function Write-Info   { param([string]$m) Write-LogLine "$($script:Sym.Info) $m" 'Cyan' }
function Write-Skip   { param([string]$m) Write-LogLine "$($script:Sym.Skip) $m" 'DarkYellow' }
function Write-Detail { param([string]$m) Write-LogLine "$($script:Sym.Dot) $m"  'DarkGray' }

function Set-StepTotal { param([int]$Total) $script:StepTotal = $Total; $script:StepCounter = 0 }

# ── Logging ─────────────────────────────────────────────────────────────────
function Start-DeployLog {
    <#
        Opens a timestamped log under logs/. Every Write-* call from this
        module is mirrored there, so the console can stay readable while the
        file keeps the full detail needed for an incident review.
    #>
    param(
        [Parameter(Mandatory)][string]$RepoRoot,
        [Parameter(Mandatory)][string]$Name
    )
    $dir = Join-Path $RepoRoot 'logs'
    if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    $stamp = (Get-Date).ToUniversalTime().ToString('yyyyMMdd-HHmmss')
    $script:LogFile = Join-Path $dir "$Name-$stamp.log"
    Set-Content -LiteralPath $script:LogFile -Value "# Si Math AI $Name log - started $stamp UTC" -Encoding utf8
    return $script:LogFile
}

function Get-DeployLogPath { $script:LogFile }

# ── Results ─────────────────────────────────────────────────────────────────
function New-ResultSet {
    # The unary comma is required, not stylistic. PowerShell enumerates
    # collections on return, so a bare `[System.Collections.ArrayList]::new()`
    # returns an EMPTY enumeration - i.e. $null - and every later Add-Result
    # fails with "cannot bind argument ... because it is null". Wrapping in an
    # outer array makes the pipeline unwrap exactly one level and hand back the
    # list itself.
    return , ([System.Collections.ArrayList]::new())
}

function Add-Result {
    param(
        # AllowEmptyCollection: a Mandatory collection parameter rejects an
        # empty list, so the very first Add-Result into a fresh result set
        # would fail without it.
        [Parameter(Mandatory)][AllowEmptyCollection()][System.Collections.ArrayList]$Results,
        [Parameter(Mandatory)][ValidateSet('PASS','FAIL','WARN','SKIP')][string]$Status,
        [Parameter(Mandatory)][string]$Name,
        [string]$Detail = ''
    )
    [void]$Results.Add([pscustomobject]@{ Status = $Status; Name = $Name; Detail = $Detail })
    switch ($Status) {
        'PASS' { Write-Ok   $Name }
        'FAIL' { Write-Fail "$Name$(if ($Detail) { " - $Detail" })" }
        'WARN' { Write-Warn "$Name$(if ($Detail) { " - $Detail" })" }
        'SKIP' { Write-Skip "$Name$(if ($Detail) { " - $Detail" })" }
    }
}

function Write-FinalReport {
    <#
        Prints the summary table and returns the exit code the caller should
        use. FAIL wins over SKIP: a run with both is a failure, not merely
        inconclusive.
    #>
    param(
        [Parameter(Mandatory)][AllowEmptyCollection()][System.Collections.ArrayList]$Results,
        [Parameter(Mandatory)][string]$Title
    )
    $pass = @($Results | Where-Object Status -eq 'PASS').Count
    $fail = @($Results | Where-Object Status -eq 'FAIL').Count
    $warn = @($Results | Where-Object Status -eq 'WARN').Count
    $skip = @($Results | Where-Object Status -eq 'SKIP').Count

    Write-Banner -Title $Title
    Write-LogLine ('{0,-6}  {1,-50}  {2}' -f 'STATUS','CHECK','DETAIL') 'White'
    Write-LogLine ('{0,-6}  {1,-50}  {2}' -f '------','--------------------------------------------------','------') 'DarkGray'
    foreach ($r in $Results) {
        $color = switch ($r.Status) { 'PASS' { 'Green' } 'FAIL' { 'Red' } 'WARN' { 'Yellow' } default { 'DarkYellow' } }
        Write-LogLine ('{0,-6}  {1,-50}  {2}' -f $r.Status, $r.Name, $r.Detail) $color
    }

    Write-LogLine ''
    Write-LogLine "PASS $pass   FAIL $fail   WARN $warn   SKIP $skip" 'White'
    if ($script:LogFile) { Write-LogLine "Log: $script:LogFile" 'DarkGray' }
    Write-LogLine ''

    if ($fail -gt 0) {
        Write-LogLine 'RESULT: FAILED - do not release. Resolve every FAIL above and re-run.' 'Red'
        return (Get-ExitCode Failure)
    }
    if ($skip -gt 0) {
        Write-LogLine "RESULT: INCONCLUSIVE - $skip check(s) could not be verified." 'Yellow'
        Write-LogLine 'An unverified control is not a verified one. Supply the missing' 'Yellow'
        Write-LogLine 'configuration and re-run before releasing.' 'Yellow'
        return (Get-ExitCode Inconclusive)
    }
    Write-LogLine 'RESULT: PASSED - every check verified.' 'Green'
    return (Get-ExitCode Success)
}

# ── Native command execution ────────────────────────────────────────────────
function Invoke-Native {
    <#
        Runs an external command and fails loudly on a non-zero exit code.

        $ErrorActionPreference does not apply to native executables, so a bare
        `supabase db push` that fails would otherwise let the script sail on to
        deploying code against a schema that was never migrated - the exact
        ordering failure DEPLOY.md exists to prevent. Every external call in
        this pipeline goes through here.
    #>
    param(
        [Parameter(Mandatory)][string]$FilePath,
        [string[]]$Arguments = @(),
        [string]$Because = '',
        [switch]$AllowFailure,
        [switch]$Quiet
    )
    $shown = "$FilePath $($Arguments -join ' ')"
    Write-Detail "exec: $shown"

    $out = & $FilePath @Arguments 2>&1
    $code = $LASTEXITCODE

    $text = ($out | Out-String).TrimEnd()
    if ($text -and -not $Quiet) {
        foreach ($line in $text -split "`r?`n") { Write-LogLine "       | $line" 'DarkGray' }
    } elseif ($text) {
        # Still capture suppressed output in the log file.
        foreach ($line in $text -split "`r?`n") { Write-LogLine "       | $line" 'DarkGray' -NoConsole }
    }

    if ($code -ne 0 -and -not $AllowFailure) {
        $msg = "Command failed (exit $code): $shown"
        if ($Because) { $msg += "`n       $Because" }
        throw $msg
    }
    return [pscustomobject]@{ ExitCode = $code; Output = $text }
}

function Test-CommandExists {
    param([Parameter(Mandatory)][string]$Name)
    $null -ne (Get-Command $Name -ErrorAction SilentlyContinue)
}

# ── Prerequisites ───────────────────────────────────────────────────────────
function Assert-PowerShellVersion {
    param([int]$Minimum = 7)
    if ($PSVersionTable.PSVersion.Major -lt $Minimum) {
        Write-Fail "PowerShell $Minimum+ required; running $($PSVersionTable.PSVersion)."
        Write-Detail 'Windows PowerShell 5.1 is not supported. Install PowerShell 7:'
        Write-Detail '  winget install --id Microsoft.PowerShell -e'
        exit (Get-ExitCode Prerequisite)
    }
    Write-Ok "PowerShell $($PSVersionTable.PSVersion)"
}

function Test-Prerequisite {
    <#
        Checks one tool and, when it exposes a version, records it. Returns a
        result object rather than throwing so the caller can report every
        missing tool in one pass instead of one per run.
    #>
    param(
        [Parameter(Mandatory)][string]$Command,
        [Parameter(Mandatory)][string]$Purpose,
        [string[]]$VersionArgs = @('--version'),
        [string]$InstallHint = '',
        [switch]$Optional
    )
    if (-not (Test-CommandExists $Command)) {
        return [pscustomobject]@{
            Name = $Command; Present = $false; Version = ''
            Purpose = $Purpose; InstallHint = $InstallHint; Optional = [bool]$Optional
        }
    }
    $version = ''
    try {
        $raw = & $Command @VersionArgs 2>&1 | Out-String
        $version = ($raw -split "`r?`n" | Where-Object { $_.Trim() } | Select-Object -First 1).Trim()
    } catch { $version = '(version unavailable)' }
    return [pscustomobject]@{
        Name = $Command; Present = $true; Version = $version
        Purpose = $Purpose; InstallHint = $InstallHint; Optional = [bool]$Optional
    }
}

function Get-NodeMajorVersion {
    if (-not (Test-CommandExists 'node')) { return 0 }
    try {
        $v = (& node --version 2>&1 | Out-String).Trim().TrimStart('v')
        return [int]($v -split '\.')[0]
    } catch { return 0 }
}

# ── Configuration ───────────────────────────────────────────────────────────
function Get-RepoRoot {
    <# Walks up from this module until it finds the repository marker. #>
    $dir = Split-Path -Parent $PSScriptRoot
    $dir = Split-Path -Parent $dir
    if (Test-Path -LiteralPath (Join-Path $dir 'DEPLOY.md')) { return $dir }
    $probe = $PSScriptRoot
    for ($i = 0; $i -lt 6; $i++) {
        if (Test-Path -LiteralPath (Join-Path $probe 'DEPLOY.md')) { return $probe }
        $probe = Split-Path -Parent $probe
        if (-not $probe) { break }
    }
    throw 'Could not locate the repository root (no DEPLOY.md found walking up from the script directory).'
}

function Get-ProductionConfig {
    <#
        Loads production.config.json and applies environment-variable
        overrides. The file holds NO secrets - only identifiers that are
        already public (project ref, domain, function name). Every secret is
        read from the environment at run time and never written to disk or to
        the log.
    #>
    param([string]$ConfigPath)

    $root = Get-RepoRoot
    if (-not $ConfigPath) { $ConfigPath = Join-Path $PSScriptRoot 'production.config.json' }
    if (-not (Test-Path -LiteralPath $ConfigPath)) {
        Write-Fail "Configuration not found: $ConfigPath"
        Write-Detail 'Run setup-production.ps1 first, or copy production.config.example.json.'
        exit (Get-ExitCode ConfigError)
    }

    try { $raw = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json }
    catch {
        Write-Fail "Configuration is not valid JSON: $ConfigPath"
        Write-Detail $_.Exception.Message
        exit (Get-ExitCode ConfigError)
    }

    function Coalesce([string]$EnvName, $FileValue, $Default = '') {
        $e = [Environment]::GetEnvironmentVariable($EnvName)
        if ($e) { return $e }
        if ($null -ne $FileValue -and "$FileValue") { return $FileValue }
        return $Default
    }

    $cfg = [pscustomobject]@{
        RepoRoot          = $root
        ConfigPath        = $ConfigPath
        ProjectRef        = Coalesce 'SUPABASE_PROJECT_REF'  $raw.ProjectRef
        ProductionDomain  = Coalesce 'PRODUCTION_DOMAIN'     $raw.ProductionDomain
        EdgeFunction      = Coalesce 'EDGE_FUNCTION_NAME'    $raw.EdgeFunctionName 'ai-tutor'
        ExpectedVersion   = Coalesce 'EXPECTED_VERSION'      $raw.ExpectedVersion
        AllowedOrigins    = @(if ($raw.PSObject.Properties.Name -contains 'AllowedOrigins') { $raw.AllowedOrigins } else { @() })
        DeployBranch      = Coalesce 'DEPLOY_BRANCH'         $raw.DeployBranch
        FrozenFiles       = @(if ($raw.PSObject.Properties.Name -contains 'FrozenFiles') { $raw.FrozenFiles } else { @() })
        # Secrets - environment only. Never persisted, never logged.
        AccessToken       = [Environment]::GetEnvironmentVariable('SUPABASE_ACCESS_TOKEN')
        DbUrl             = [Environment]::GetEnvironmentVariable('SUPABASE_DB_URL')
        TestJwt           = [Environment]::GetEnvironmentVariable('SUPABASE_TEST_JWT')
        AnonKey           = [Environment]::GetEnvironmentVariable('SUPABASE_ANON_KEY')
    }

    $allowedFromEnv = [Environment]::GetEnvironmentVariable('ALLOWED_ORIGINS')
    if ($allowedFromEnv) { $cfg.AllowedOrigins = @($allowedFromEnv -split ',' | ForEach-Object { $_.Trim() } | Where-Object { $_ }) }

    if (-not $cfg.ProjectRef) {
        Write-Fail 'ProjectRef is not set (config file or SUPABASE_PROJECT_REF).'
        exit (Get-ExitCode ConfigError)
    }
    return $cfg
}

function Write-ConfigSummary {
    param([Parameter(Mandatory)]$Config)
    Write-Info 'Configuration'
    Write-Detail "repo root        : $($Config.RepoRoot)"
    Write-Detail "config file      : $($Config.ConfigPath)"
    Write-Detail "project ref      : $($Config.ProjectRef)"
    Write-Detail "production domain: $(if ($Config.ProductionDomain) { $Config.ProductionDomain } else { '(unset)' })"
    Write-Detail "edge function    : $($Config.EdgeFunction)"
    Write-Detail "expected version : $(if ($Config.ExpectedVersion) { $Config.ExpectedVersion } else { '(unset)' })"
    Write-Detail "allowed origins  : $(if ($Config.AllowedOrigins.Count) { $Config.AllowedOrigins -join ', ' } else { '(unset)' })"
    # Secrets are reported as present/absent only - never echoed.
    Write-Detail "access token     : $(if ($Config.AccessToken) { 'present' } else { 'ABSENT' })"
    Write-Detail "db url           : $(if ($Config.DbUrl)       { 'present' } else { 'absent' })"
    Write-Detail "test jwt         : $(if ($Config.TestJwt)     { 'present' } else { 'absent' })"
}

# ── Confirmation ────────────────────────────────────────────────────────────
function Confirm-Action {
    <#
        Single gate before anything that changes production. -AutoApprove makes
        the pipeline non-interactive for CI; without it the operator must type
        the expected word, so a stray Enter cannot approve a migration.
    #>
    param(
        [Parameter(Mandatory)][string]$Prompt,
        [string]$Expected = 'yes',
        [switch]$AutoApprove
    )
    if ($AutoApprove) { Write-Warn "$Prompt -> auto-approved (-AutoApprove)"; return $true }
    Write-LogLine ''
    Write-Host "$($script:Sym.Warn) $Prompt" -ForegroundColor Yellow
    Write-Host "       Type '$Expected' to continue: " -ForegroundColor Yellow -NoNewline
    $answer = Read-Host
    if ($answer -ne $Expected) { Write-Warn "Aborted by operator (got '$answer')."; return $false }
    return $true
}

# ── HTTP helper ─────────────────────────────────────────────────────────────
function Invoke-HttpProbe {
    <#
        Thin wrapper over Invoke-WebRequest that never throws on an HTTP error
        status and distinguishes "server answered N" from "could not connect".
        That distinction is what lets the verify script report INCONCLUSIVE
        instead of accusing a healthy deployment of being down.
    #>
    param(
        [Parameter(Mandatory)][string]$Uri,
        [string]$Method = 'GET',
        [hashtable]$Headers = @{},
        $Body = $null,
        [int]$TimeoutSec = 30
    )
    try {
        $params = @{
            Uri = $Uri; Method = $Method; Headers = $Headers
            TimeoutSec = $TimeoutSec; SkipHttpErrorCheck = $true
            MaximumRedirection = 5; ErrorAction = 'Stop'
        }
        if ($null -ne $Body) { $params['Body'] = $Body }
        $r = Invoke-WebRequest @params
        return [pscustomobject]@{
            Reachable = $true; StatusCode = [int]$r.StatusCode
            Headers = $r.Headers; Content = $r.Content; Error = ''
        }
    } catch {
        return [pscustomobject]@{
            Reachable = $false; StatusCode = 0
            Headers = @{}; Content = ''; Error = $_.Exception.Message
        }
    }
}

function Get-HeaderValue {
    <# Invoke-WebRequest returns header values as string[]; normalise to one string. #>
    param($Headers, [Parameter(Mandatory)][string]$Name)
    if ($null -eq $Headers) { return '' }
    foreach ($key in $Headers.Keys) {
        if ($key -ieq $Name) {
            $v = $Headers[$key]
            if ($v -is [array]) { return ($v -join ', ') }
            return "$v"
        }
    }
    return ''
}

Export-ModuleMember -Function @(
    'Get-ExitCode','Write-LogLine','Write-Banner','Write-Step','Write-Ok','Write-Fail',
    'Write-Warn','Write-Info','Write-Skip','Write-Detail','Set-StepTotal',
    'Start-DeployLog','Get-DeployLogPath','New-ResultSet','Add-Result','Write-FinalReport',
    'Invoke-Native','Test-CommandExists','Assert-PowerShellVersion','Test-Prerequisite',
    'Get-NodeMajorVersion','Get-RepoRoot','Get-ProductionConfig','Write-ConfigSummary',
    'Confirm-Action','Invoke-HttpProbe','Get-HeaderValue'
)
