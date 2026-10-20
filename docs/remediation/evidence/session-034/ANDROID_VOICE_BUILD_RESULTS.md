# S034 — Android voice native build check (R-18)

Date: 2026-10-19. Local debug build only; no production endpoint or Play release was changed.

## Finding and correction

The Android app had `MainActivity.onDestroy()` declared `protected`, but the installed Capacitor `BridgeActivity` declares it `public`. A Java 21 Android build failed with “attempting to assign weaker access privileges”. Changed the override to `public`; no permission policy or lifecycle behavior changed.

## Verification

- The first local attempt using the machine JDK17 failed earlier in Capacitor with `invalid source release: 21`.
- Downloaded the official Eclipse Temurin JDK21 macOS/AArch64 archive to ignored `.tmp/jdk21` for this build only; the system Java setting remains JDK17. [Official Temurin JDK21 releases](https://adoptium.net/temurin/releases?arch=aarch64&mode=filter&os=any&version=21).
- `JAVA_HOME=<workspace>/.tmp/jdk21/Contents/Home bash gradlew :app:assembleDebug` passed. Debug APK: `android/app/build/outputs/apk/debug/app-debug.apk`.
- No APK was installed. The connected phone has the Play version, and this debug build has the same application ID; installing it could replace or conflict with the Play app.
- The Android manifest/source was not changed by the build. The test validates compilation only; it does not establish that Android's permission prompt appeared, that an allowed origin captures audio, or that Wi-Fi/LTE/TURN media flows work.

## Remaining R-18 acceptance

Install a separately identified `.audit` build (or use a second test device) before exercising the native microphone prompt, trusted/untrusted origins and lifecycle cancellation. Then verify voice on Wi-Fi and LTE with an independent peer and relay-only TURN evidence. R-18 remains partial.

**Для владельца:** исправил ошибку, которая не давала собрать Android-приложение. APK теперь собирается, но не заменял версию из Play и не запускал микрофон. Проверка разрешения и реального голосового соединения ещё впереди.
