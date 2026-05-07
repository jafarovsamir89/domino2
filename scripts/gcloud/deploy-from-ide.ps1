param(
    [string]$Message = "",
    [string]$Branch = "main",
    [switch]$PlatformOnly,
    [switch]$LegacyOnly,
    [switch]$SkipChecks
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location $repoRoot

function Invoke-GitCommitIfNeeded {
    $status = git status --porcelain
    if (-not $status) {
        return
    }

    if ([string]::IsNullOrWhiteSpace($Message)) {
        $Message = "Sync from IDE $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
    }

    git add -A
    git commit -m $Message
}

Invoke-GitCommitIfNeeded
git push origin $Branch

$deployArgs = @(
    "-Branch", $Branch,
    "-ForceSync"
)

if ($PlatformOnly) {
    $deployArgs += "-PlatformOnly"
}

if ($LegacyOnly) {
    $deployArgs += "-LegacyOnly"
}

if ($SkipChecks) {
    $deployArgs += "-SkipChecks"
}

& (Join-Path $PSScriptRoot "update-server.ps1") @deployArgs
