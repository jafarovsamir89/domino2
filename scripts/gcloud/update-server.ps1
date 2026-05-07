param(
    [string]$Instance = "instance-20260418-225724",
    [string]$Zone = "us-central1-f",
    [string]$Project = "project-8fc391c2-e159-4215-800",
    [string]$Root = "/home/user/domino2",
    [string]$Branch = "main",
    [switch]$NoPull,
    [switch]$PlatformOnly,
    [switch]$LegacyOnly,
    [switch]$SkipChecks
)

$ErrorActionPreference = "Stop"

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

gcloud --quiet compute ssh $Instance `
    --zone=$Zone `
    --project=$Project `
    --ssh-key-file=.gcloud/domino2_gcloud_key `
    --command $remoteCommand
