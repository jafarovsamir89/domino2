$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$androidDir = Join-Path $root "android"
$apkPath = Join-Path $androidDir "app\build\outputs\apk\debug\app-debug.apk"
$browserGradlePath = Join-Path $root "node_modules\@capacitor\browser\android\build.gradle"
$generatedCapGradlePath = Join-Path $androidDir "app\capacitor.build.gradle"
$generatedPluginsPath = Join-Path $androidDir "app\src\main\assets\capacitor.plugins.json"

if (Test-Path $browserGradlePath) {
    $browserGradle = Get-Content $browserGradlePath -Raw
    if ($browserGradle -match "JavaVersion\.VERSION_21") {
        $browserGradle = $browserGradle -replace "JavaVersion\.VERSION_21", "JavaVersion.VERSION_17"
        Set-Content -Path $browserGradlePath -Value $browserGradle -NoNewline
        Write-Host "Patched @capacitor/browser for Java 17 compatibility."
    }
}

& powershell -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "sync-www.ps1")
Push-Location $root
try {
    npx cap sync android
} finally {
    Pop-Location
}

if (Test-Path $generatedCapGradlePath) {
    $generatedCapGradle = Get-Content $generatedCapGradlePath -Raw
    if ($generatedCapGradle -match "JavaVersion\.VERSION_21") {
        $generatedCapGradle = $generatedCapGradle -replace "JavaVersion\.VERSION_21", "JavaVersion.VERSION_17"
        Set-Content -Path $generatedCapGradlePath -Value $generatedCapGradle -NoNewline
        Write-Host "Patched generated Capacitor Android config for Java 17 compatibility."
    }
}

if (Test-Path $generatedPluginsPath) {
    $plugins = Get-Content $generatedPluginsPath -Raw | ConvertFrom-Json
    $customPlugins = @(
        @{ pkg = "com.domino.pyaterochka"; classpath = "com.domino.pyaterochka.DominoBrowserPlugin" },
        @{ pkg = "com.domino.pyaterochka"; classpath = "com.domino.pyaterochka.DominoGoogleAuthPlugin" }
    )
    $existingClasspaths = @($plugins | ForEach-Object { $_.classpath })
    $updatedPlugins = @($plugins)
    foreach ($customPlugin in $customPlugins) {
        if ($existingClasspaths -notcontains $customPlugin.classpath) {
            $updatedPlugins += [pscustomobject]$customPlugin
            Write-Host "Injected custom Capacitor plugin: $($customPlugin.classpath)"
        }
    }
    $updatedPlugins | ConvertTo-Json -Depth 5 | Set-Content -Path $generatedPluginsPath
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
