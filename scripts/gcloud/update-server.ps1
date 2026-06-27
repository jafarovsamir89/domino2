param(
    [string]$Instance = "instance-20260418-225724",
    [string]$Zone = "us-central1-f",
    [string]$Project = "project-8fc391c2-e159-4215-800",
    [string]$Root = "/home/user/domino2",
    [string]$Branch = "",
    [switch]$NoPull,
    [switch]$ForceSync,
    [switch]$PlatformOnly,
    [switch]$LegacyOnly,
    [switch]$SkipChecks
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($Branch)) {
    $Branch = (git rev-parse --abbrev-ref HEAD 2>$null).Trim()
    if ([string]::IsNullOrWhiteSpace($Branch) -or $Branch -eq "HEAD") {
        $Branch = "main"
    }
}
Write-Host "[deploy] target branch: $Branch"

$argsList = @(
    "bash",
    "$Root/scripts/gcloud/update-server.sh",
    "--root",
    $Root,
    "--branch",
    $Branch
)

if ($NoPull) {
    $argsList += "--no-pull"
}

if ($ForceSync) {
    $argsList += "--force-sync"
}

if ($PlatformOnly) {
    $argsList += "--platform-only"
}

if ($LegacyOnly) {
    $argsList += "--legacy-only"
}

if ($SkipChecks) {
    $argsList += "--skip-checks"
}

$remoteCommand = ($argsList | ForEach-Object {
    if ($_ -match "\s") {
        "'" + ($_ -replace "'", "'\''") + "'"
    } else {
        $_
    }
}) -join " "

$sshKeyFile = Join-Path $PSScriptRoot "..\..\.gcloud\domino2_gcloud_key"

gcloud --quiet compute ssh $Instance `
    --zone=$Zone `
    --project=$Project `
    --ssh-key-file=$sshKeyFile `
    --command $remoteCommand
