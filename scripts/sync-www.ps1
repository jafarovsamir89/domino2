$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$www = Join-Path $root "www"

Push-Location $root
try {
    node scripts/check-mojibake.mjs
} finally {
    Pop-Location
}

if (-not (Test-Path $www)) {
    New-Item -ItemType Directory -Path $www | Out-Null
}

$items = @("js", "css", "assets", "shared")
foreach ($item in $items) {
    $source = Join-Path $root $item
    $target = Join-Path $www $item

    if (Test-Path $target) {
        Remove-Item -Recurse -Force $target
    }

    Copy-Item -Recurse -Force $source $target
}

$files = @("index.html", "manifest.json", "sw.js", "mobile-auth-complete.html", "auth-complete.html")
foreach ($file in $files) {
    Copy-Item -Force (Join-Path $root $file) (Join-Path $www $file)
}

Write-Host "Web assets synced to $www"
