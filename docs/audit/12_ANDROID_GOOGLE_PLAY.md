# Android и текущая публикация Google Play

**Обновление этапа с одним телефоном:** проверены физический поворот, текст130%, force-stop/resume, mic allow/deny, доступность руки, live online,5 cold/5 warm и native memory/thermal snapshots. [Итоговый протокол](SINGLE_ANDROID_AUDIT.md); настройки телефона и разрешение тестовой копии восстановлены. Это debug/local измерения, не release certification.

> Аудит 17 октября 2026. Репозиторий `jafarovsamir89/domino2`, ветка `release/play-prep`, коммит `508932ebeb45cde744e3e1dbd92bc5592ca66093`. Проверки только локальные. Игра уже опубликована в Google Play; production и реальные кошельки не изменялись.


## Что установлено

Игра уже опубликована. ADB подтвердил установщик Google Play, package `az.simplesoft.dominotelefon`, versionName 1.20/code24, target36/min24. Телефон 2201117SG, Android13, MT6781, около 6GB RAM. Данные существующего пакета сохранены. Для теста установлена отдельная копия `.audit` с debug signing и локальным сервером.

78 web-файлов установленного base APK сопоставлены с www: 66 побайтово, 11 после нормализации newline; содержательно отличается privacy.html. Нельзя из этого выводить SHA развёрнутого backend или точную версию всех native dependencies. Приложение из Play не переустанавливалось и не использовалось для изменения реального wallet.

## Сборка и startup

`cap sync android` выполнен. JDK17 не собрал dependency sources Java21; после изолированной JDK21 `assembleRelease` и `bundleRelease` прошли. Release AAB около 26,4MB, APK около 26,8MB; локальный AAB unsigned: keystore в окружении отсутствует. Это нормальная граница локального аудита, не доказательство, что опубликованное приложение не подписано. META-INF не определяет наличие APK v2/v3 signature.

Отдельная audit-копия установилась. Первый `am start -W`: TotalTime2312ms/WaitTime2342ms. Это время Activity launch debug-приложения, **не release time-to-interactive**: web splash имеет дополнительную задержку 5,5 с. В пяти возвратах из HOME до 120 с solo оставалось согласованным и меню отвечало; `HOT TotalTime` в сохранённых строках около сотен мс. Cold/warm статистика из 30 релизных запусков не выполнена.

## Состояние проверки

| Область | Результат / ограничение |
|---|---|
| Canvas / эффекты | Android rAF24–26, комплексное отключение эффектов 54,5; детали в performance report |
| Память | native PSS около 612–620MiB в stress; graphics доминирует; это не размер JS heap |
| Фон | solo5/15/30/60/120 прошёл, total28, меню отвечает |
| Батарея / нагрев | финальные snapshots41,0→41,6°C, AC/100%, Thermal Status0; автономность/причина нагрева/отсутствие троттлинга не установлены |
| Crash / ANR | debug capture не показал JS pageerror; production vitals неизвестны, это не доказательство отсутствия ANR |
| Google/Apple Sign-In | код интеграции есть, реальные OAuth flows не выполнены |
| Push | plugin есть; локально нет google-services.json; delivery не проверена |
| Microphone | native allow/deny и остановка tracks проверены в audit-пакете; реальный разговор не проверен |
| Voice / NAT | default ICE config defect, client fallback; два NAT/relay-only не тестировались |
| Orientation / incoming call | поворот portrait→landscape→portrait прошёл, total28; входящий звонок отложен |
| AAB / signing | сборка успешна, upload key/Play App Signing/Console не проверены |

## Policy checklist для исправляющего обновления

Политики проверены по официальным страницам на дату аудита; финальный статус конкретного приложения определяет Console и review. Публикация сейчас не доказывает соответствие будущего обновления всем требованиям.

| Пункт | Состояние | Критерий перед rollout |
|---|---|---|
| Target API | в коде/установке 36 | текущая политика phone/tablet updates требует API36; сверить Console extension/status |
| 16KB page sizes | AAB содержит libdatastore_shared_counter.so; PT_LOAD alignment всех четырёх ABI ≥16KB | zip alignment и запуск на 16KB emulator ещё проверить; ELF-результат сам по себе не закрывает весь gate |
| App signing | production из Play есть, локально ключей нет | fingerprint/Play App Signing, OAuth clients, upload-key recovery и versionCode>24 |
| Privacy / Data Safety | страницы есть, текст bundle отличается | актуальный URL, все фактические SDK/data types/purposes/retention соответствуют форме |
| Account deletion | delete-account.html есть; явный пункт в profile UI не найден | заметный in-app path к request deletion и отдельный web resource; локальный lifecycle deletion test |
| UGC | block/report UI и API есть | terms до UGC, реально работающие report/block, модераторская очередь и сроки реакции |
| Virtual coins / stakes | money-out не найден, IAP выключен | coins только внутри игры, никаких cash prizes; questionnaire проверяет реальные механики |
| Digital goods / billing | feature disabled | server receipt verification, unique transaction, refund/revoke, restore; текущая Payments policy |
| Ads | disabled | disclosures, consent где нужно, SDK Data Safety, SSV, frequency cap и отсутствие interruptions |
| Review access | auth gate | предоставить Play reviewer рабочий тестовый путь/учётку без настоящих кошельков |
| Permissions | INTERNET/RECORD_AUDIO/MODIFY_AUDIO_SETTINGS | запрашивать microphone по действию, понятный purpose, корректный deny/revoke |
| Technical quality | production vitals не получены | crash/ANR/reconnect dashboards и staged rollout halt thresholds |

[Target API](https://support.google.com/googleplay/android-developer/answer/11926878?hl=en), [16KB Android](https://developer.android.com/guide/practices/page-sizes), [account deletion](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en), [UGC](https://support.google.com/googleplay/android-developer/answer/9876937?hl=en), [technical quality](https://support.google.com/googleplay/android-developer/answer/17492799?hl=en-en).

На текущей странице Android указан срок 1 февраля 2027 для блокировки несовместимых updates по 16KB. Старые статьи называли другие сроки; пользоваться текущей страницей и сообщением Console именно этого приложения. Наличие native .so не доказывает несовместимость, но требует проверки. Обычная email-форма удаления может быть допустимым web resource; отсутствие automatic DELETE endpoint само по себе не нарушение. Проблема — отсутствие заметного in-app пути и подтверждённого процесса.

После сборки дополнительно прочитаны ELF program headers: все четыре включённые native-библиотеки имеют PT_LOAD alignment не менее 16KB. [Результат проверки](evidence/metrics/android-elf-alignment.json). Это локальная проверка AAB из checkout, не проверка установленного Play split APK или запуска на устройстве с 16KB pages.

## Практический release gate

Исправления → полный CI → internal track на тех же подписанных assets → проверка Google OAuth/микрофона/покупок только тестовыми средствами → pre-launch report → backup/rollback drill → staged rollout с ограниченной долей. Новый release manifest: git SHA, versions lockfiles, web hashes, target/min SDK, artifact hash и backend deployment SHA. Откат клиента не должен ломать новый API; миграции expand/contract, а не необратимые изменения в день релиза.

Порог crash/ANR взять из текущих Play quality requirements, но внутренний gate должен быть строже текущего baseline и реагировать на регрессии. Для маленькой аудитории отсутствие событий не равно доказанному нулю: учитывать экспозицию и число сессий.
