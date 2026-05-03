$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$androidDir = Join-Path $root "android"
$apkPath = Join-Path $androidDir "app\build\outputs\apk\debug\app-debug.apk"

& powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "sync-www.ps1")
Push-Location $root
try {
    npx cap copy android
} finally {
    Pop-Location
}

Push-Location $androidDir
try {
    .\gradlew.bat assembleDebug
} finally {
    Pop-Location
}

if (Test-Path $apkPath) {
    Write-Host "APK ready: $apkPath"
} else {
    Write-Error "APK build finished, but the file was not found at $apkPath"
}
