param(
    [string]$Message = "",
    [string]$Branch = "",
    [switch]$PlatformOnly,
    [switch]$LegacyOnly,
    [switch]$SkipChecks
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location $repoRoot

if ([string]::IsNullOrWhiteSpace($Branch)) {
    $Branch = (git rev-parse --abbrev-ref HEAD 2>$null).Trim()
    if ([string]::IsNullOrWhiteSpace($Branch) -or $Branch -eq "HEAD") {
        $Branch = "main"
    }
}
Write-Host "[deploy] target branch: $Branch"

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

$remoteCommand = 'cd ~/domino2; BACKUP_DIR="$(mktemp -d /tmp/domino2-backup.XXXXXX)"; if [ -f .env.platform ]; then cp .env.platform "$BACKUP_DIR/env.platform"; fi; if [ -d server/data ]; then mkdir -p "$BACKUP_DIR/server-data" && cp -a server/data/. "$BACKUP_DIR/server-data/"; fi; git fetch origin ' + $Branch + '; git reset --hard origin/' + $Branch + '; git clean -fd; if [ -f "$BACKUP_DIR/env.platform" ]; then cp "$BACKUP_DIR/env.platform" .env.platform; fi; if [ -d "$BACKUP_DIR/server-data" ]; then mkdir -p server/data && cp -a "$BACKUP_DIR/server-data/." server/data/; fi; bash scripts/gcloud/update-server.sh --no-pull'

if ($SkipChecks) {
    $remoteCommand += ' --skip-checks'
}

if ($PlatformOnly) {
    $remoteCommand += ' --platform-only'
}

if ($LegacyOnly) {
    $remoteCommand += ' --legacy-only'
}

$sshKey = Join-Path $repoRoot ".gcloud\domino2_gcloud_key"
$sshArgs = @(
    '-i', $sshKey,
    '-o', 'StrictHostKeyChecking=no',
    '-o', 'UserKnownHostsFile=NUL',
    'user@34.28.23.216',
    $remoteCommand
)

$sshExe = 'C:\Windows\System32\OpenSSH\ssh.exe'
if (-not (Test-Path $sshExe)) {
    $sshExe = (Get-Command ssh).Source
}

Start-Process -FilePath $sshExe -NoNewWindow -Wait -ArgumentList $sshArgs
