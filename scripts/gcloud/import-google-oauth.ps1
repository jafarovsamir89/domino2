param(
    [string]$JsonPath = "C:\domino2\rsa\client_secret_937880815596-c9hnm3hbko461mapsa304qebbhlsr5hr.apps.googleusercontent.com.json",
    [string]$Instance = "instance-20260418-225724",
    [string]$Zone = "us-central1-f",
    [string]$Project = "project-8fc391c2-e159-4215-800",
    [string]$Root = "/home/user/domino2",
    [string]$Branch = "main"
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path $JsonPath)) {
    throw "Google OAuth JSON file not found: $JsonPath"
}

$payload = Get-Content $JsonPath -Raw | ConvertFrom-Json
$clientId = [string]$payload.web.client_id
$clientSecret = [string]$payload.web.client_secret

if ([string]::IsNullOrWhiteSpace($clientId) -or [string]::IsNullOrWhiteSpace($clientSecret)) {
    throw "Google OAuth JSON does not contain web.client_id and web.client_secret."
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$sshKey = Join-Path $repoRoot ".gcloud\domino2_gcloud_key"
$remoteTemplate = @'
set -euo pipefail
cd __ROOT__
tmp="$(mktemp)"
if [ -f .env.platform ]; then
  grep -v '^GOOGLE_CLIENT_ID=' .env.platform | grep -v '^GOOGLE_CLIENT_SECRET=' > "$tmp" || true
else
  : > "$tmp"
fi
{
  printf '%s\n' 'GOOGLE_CLIENT_ID="__CLIENT_ID__"'
  printf '%s\n' 'GOOGLE_CLIENT_SECRET="__CLIENT_SECRET__"'
} >> "$tmp"
mv "$tmp" .env.platform
bash scripts/gcloud/update-server.sh --no-pull --skip-checks --platform-only
'@

$remoteCommand = $remoteTemplate.Replace('__ROOT__', $Root).Replace('__CLIENT_ID__', $clientId).Replace('__CLIENT_SECRET__', $clientSecret)

$sshArgs = @(
    '-i', $sshKey,
    '-o', 'StrictHostKeyChecking=no',
    '-o', 'UserKnownHostsFile=NUL',
    "user@34.28.23.216",
    $remoteCommand
)

$sshExe = 'C:\Windows\System32\OpenSSH\ssh.exe'
if (-not (Test-Path $sshExe)) {
    $sshExe = (Get-Command ssh).Source
}

Start-Process -FilePath $sshExe -NoNewWindow -Wait -ArgumentList $sshArgs
