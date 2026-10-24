# R09 — нативный модуль собран без телефона, S047

24 октября2026. Ветка `codex/rewarded-acceptance`, база `99ffe91`. Владелец разрешил подготовить nativebridge и проверить сборку. **R09 открыта,27/42.**

## Подготовленный модуль

Только в `docs/remediation/review/native/` добавлены `DominoRewardedFlowPlugin.java`, `RewardedFlowState.java` и9JUnitпроверок. Builder копирует их в игнорируемую `.tmp/mobile-review` при явном `--rewarded-flow`. Исходный `android/` и publishedpackage не менялись. `--rewarded-flow` и `--rewarded-suite` взаимоисключаются: они не могут инициализировать SDK с разными USER_ID в одном процессе этой сборки.

Модуль разрешён только debugпакету `az.simplesoft.dominotelefon.audit` на точной странице `https://localhost/review/rewarded-flow.html`; scheme/host/port/path/query/fragment нельзя подменить. Доступ проверяется до вызова и перед возвратом асинхронного результата. Nativebind требует явного adultOwner/testAccepted. Это только прежний взрослый диагностический сценарий, не возрастная/consentполитика для реальных игроков.

Процессный singleton удерживает исходный64hex nonce и срок через повторное обращение/пересоздание JS. Другой nonce и продление срока отклоняются; успешный init той же попытки не повторяется. Начать show можно только после готовности, для той же неистёкшей попытки, один раз. Callbacktickets отсекают устаревшие таймеры/результаты. Уничтожение владельца не освобождает SDKidentity для другого аккаунта.

Порядок close/rewarded обрабатывается в обе стороны; возвращается только информация о воспроизведении, без суммы, локальных монет или `credited`. Приватного S2Sключа/кошелька/APIклиента в nativecode нет. Ограниченные watchdogs завершают зависшую promise:30сinit/load, до180сshow в пределах TTL. Это диагностические ограничения, не принятые правила релиза/повторов.

## Почему показ выключен

Generated BuildConfig содержит `DOMINO_REWARDED_FLOW_SHOW=false`. Native show отклоняется до loadAd; изJavaScript этот compile-timeфлаг не включить. Дополнительный JSadapter `rewarded-native-adapter.js` отказывает даже bind, пока nativecapability не true. Страница `rewarded-flow.html` содержит только явную кнопку status: сама не вызывает init/bind/show/сервер, не создаёт финансовую попытку.

`is_test_suite=enable` включает диагностический инструмент и **не доказывает Testрежим обычного аукциона**. До его отдельного подтверждения код загрузки/показа не включается. SDKbind может вызывать внешние nativeсервисы при явном ручном вызове на разрешённой странице; loopbackendpoints в APKmetadata относятся к игровомуAPI, не ограничивают nativeSDK. В S047 SDK вообще не запускали.

## Проверки и APK

- `node docs/remediation/scripts/build-review-apk.mjs --rewarded-flow --output docs/remediation/evidence/session-047/review-apk.json`: `testDebugUnitTest` + `assembleDebug`, BUILD SUCCESSFUL19с,169tasks. `android-build.txt`.
- Реальные JUnitXML: **9новых тестов состояния**,2существующихAudioPermissionPolicy,1существующий арифметический template. Всего12/0fail/0skip;11содержательных, из них9новых. Это JVMлогика, **не реальная Androidlifecycle/SDKcallbackприёмка**. `native-checks.json`.
- JSadapter **4/4**: нет вызовов при создании, строгие adult/testподтверждения, nativefalsegate, фиксированный payload без чужих identities/сумм. `adapter-targeted.txt`. Syntax builder/JS и rootmojibake проходят.
- Guardchecks отклоняют Suite+Flow и существующий S041output до изменения рабочей копии; старый S041metadata сохранён. `builder-guards.json`.
- Публичные API проверены по pinned9.5.0AAR/javap: классы находятся в `com.unity3d.mediation.rewarded.*`. Первая проба прежнего общего package не нашла Rewardedклассы; исправлены imports до сборки, не подменяли интерфейсы stubклассами.
- Aapt подтвердил отдельный auditappId24/1.20 и отсутствие AD_ID. Apksigner проверил debugподпись; certSHA256 `1d5bf81541d66c56c79c3a7c36cbbeca06c353e4604abca671e2207ef88f7370`. `apk-inspection.json`.
- APK **34,712,762байт**, SHA256 `08327edf1679d2107c4c0fce4b4ff940f63b835daa9ff8a3bf12dba8d1013d94`, hash совпадает с metadata. Копия сохранена в игнорируемой `.tmp/s047-native/domino-review-flow.apk`; `install-metadata.json` указывает на неё, исходный `review-apk.json` не переписывали. Обаinstalledfalse. APKне вGit.
- sourceSha99ffe91 + workingTreeChangesIncludedtrue — состояние кода на момент сборки с S047изменениями; не claimточногокоммита/remoteCI/release. После сборки nativeкод не менялся.

## Что осталось

ADB/телефон/установка/SDKinit/показ/SSV/монеты в S047 не выполнялись. PG не запускался, production/Play/флаги/публичные rewardedмаршруты не менялись, секреты в native не переносились, плагины не ставили, поддержку повторно не писали. API179(S045), client20(S046) — исторические результаты неизменённых частей, не повторные проверки S047.

До настоящего показа: подтвердить Testрежим обычного adunit, затем конкретно пересмотреть compile-timegate и собрать новый артефакт. Даже после этого нужны реальный nativebridge/WebView/activity/закрытие/позднийreward, S2SвалидаторUnity, ad→servergrant и неизменность Playпакета на телефоне. Смена nonce после cancel/дня/аккаунта и поздний первый callback остаются непринятой политикой, их нельзя обходить unsigneddynamicUserId или предположением о reinit.

БезADB можно дальше готовить UIсвязь/решение по поздним callback и проверочный протокол. Текущее подтверждение — **компиляция настоящего SDK и проверка состояния**, не закрытие R09.

Официальные источники: [Unity initialization](https://docs.unity.com/en-us/grow/levelplay/sdk/android/sdk-integration), [Rewarded listener](https://docs.unity.com/en-us/grow/levelplay/sdk/android/rewarded-ads-integration), локальная реализация Capacitor PluginCall/Bridge lifecycle. Сверены web/Context7 и фактический pinnedAAR.
