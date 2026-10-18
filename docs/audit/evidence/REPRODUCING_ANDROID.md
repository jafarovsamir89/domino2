# Повторение этапа с одним Android

Проверенные результаты находятся в [SINGLE_ANDROID_AUDIT.md](../SINGLE_ANDROID_AUDIT.md). Скрипты используют только локальные тестовые сервисы и отдельный Android-пакет. Продуктовый код не исправлялся.

## Требования стенда

Checkout указанного в отчёте SHA, установленные root/server зависимости и собранный API; Node25.6.0, локальные PostgreSQL14.20 и Redis8.10.2, Playwright/core и Colyseus SDK из checkout. Android SDK platform-tools/ADB, один разрешённый телефон, JDK21 для сборки debug overlay. Бинарники PG/Redis/JDK, APK, dump и `.tmp` не включены в архив. Ошибка `server npm ci` остаётся R-06; не считать этот документ проверенным универсальным bootstrap.

Использованные адреса: PostgreSQL127.0.0.1:55439/domino_audit, Redis127.0.0.1:56379, API4300, game4567, preview4174. Paid soak запускает свой game4585/Redis DB11; основной device game использует другую Redis DB. Сервисы и пути запуска описаны также в [QA](../13_QA_TEST_RESULTS.md), [предыдущем воспроизведении](REPRODUCING_CONTINUATION.md) и самих scripts. Секрет в scripts строго синтетический, не production credential.

Перед повторением нужны все18репозиторных миграций и seed/bootstrap справочников. **Не исправлять R-41 через db push/reset перед её воспроизведением:** цель — проверить фактический результат migrations. `schema-drift-check.mjs` генерирует diff, не применяет его.

## Синтетические пользователи и телефон

`scripts/single-device-fixtures.mjs` создаёт настоящие локальные User/Player/Session и тестовые кошельки, затем пишет `.tmp/audit-device-profiles.json` и `.tmp/audit-profile.json`. Он проверяет локальный DATABASE_URL. Токены не нужно копировать из отчёта. `preview-server.mjs` использует fixture только для страницы с query `audit-device=1`.

```sh
DATABASE_URL='postgresql://domino_audit@127.0.0.1:55439/domino_audit?schema=public' node docs/audit/evidence/scripts/single-device-fixtures.mjs
node docs/audit/evidence/scripts/preview-server.mjs
```

Установить отдельный `az.simplesoft.dominotelefon.audit`; overlay меняет packageId, debug cleartext и server URL на localhost4174, не заменяет Play-пакет. Переносимая копия [Gradle overlay](../android/init.gradle), manifest/assets/resources включена в Git. Исходная конфигурация хранилась в `.tmp/audit-android`; новая копия разрешает пути относительно checkout. APK собирается заново. В исходный Android-проект изменения не вносились.

После настройки локальных Android SDK и JDK21 собрать тестовый пакет из корня checkout:

```sh
cd android
sh ./gradlew --init-script ../docs/audit/android/init.gradle :app:assembleDebug
```

На Windows использовать `gradlew.bat` и настроить соответствующие SDK/JAVA_HOME. На POSIX wrapper вызывается через `sh`, поэтому execute bit не требуется. Пакет создаётся в обычном debug output; этот init-script применяется только при его явном указании. Для CDP определить PID audit-пакета, добавить reverse4174/4300/4567 и forward9222→его `webview_devtools_remote_<PID>`. Скрипты ожидают этот forward; после force-stop он обновляется новым PID. Для ADB нужен `adb` в PATH либо переменная `ADB` с локальным путём к бинарнику; домашняя папка автора скриптам больше не нужна.

Перед работой сохранить system font_scale/rotation и исходное состояние RECORD_AUDIO тестового пакета. После работы восстановить их, убрать только созданные тестом mappings. [Фактическое восстановление](metrics/android-cleanup.json).

```sh
node docs/audit/evidence/scripts/android-online-match.mjs
node docs/audit/evidence/scripts/android-final-checks.mjs
```

Запускать последовательно: оба управляют одним телефоном. Online harness использует аккаунт0на Android и аккаунт1как SDK peer, stake200, штатный online optimistic play и pointerup для draw/pass. Он не измеряет точность пальца. Финальная версия3приняла343команды, сохранила34совпавших checkpoint и итоговый экран. Первые две попытки исключены и помечены в отчёте.

Final checks выполняет5force-stop cold и5HOME-return, ждёт splash removal+game/profile, затем проверяет естественный ход человека для AX/Tab, звук и сохраняет meminfo/battery/thermal. `clearTurnTimers` применяется **после достижения хода человека только для стабильного accessibility snapshot**, не для доказательства работы паузы. Сохранённый фактический повтор этого шага — screenshot40 и `accessibility` в JSON; `accessibilityInitial`/screenshot39 относятся к раннему промежуточному кадру. Исходные настройки в конце автоматически не восстанавливаются этим скриптом: это отдельный обязательный шаг по cleanup protocol.

R-40 повторяется вручную: новая обычная4-player solo → меню Pause →50–60с без действий → сравнить roundWins/очки/очередь и вернуть стол. В этой проверке не вызывать clearTurnTimers. Другие ручные шаги и before/after сохранены в `single-device-runtime.json`.

## Длительные расчётные матчи

```sh
DATABASE_URL='postgresql://domino_audit@127.0.0.1:55439/domino_audit?schema=public' AUDIT_CLIENTS=100 AUDIT_DURATION_MS=1800000 node docs/audit/evidence/scripts/paid-match-soak.mjs
```

Проверенные100клиентов/25комнат играютclassic101ставка50с реальными локальными API/PG/ledger. После30мин новые комнаты не создаются, активные доигрываются до10мин дополнительного времени. Известный R-31 не исправляется, поэтому проверяется согласованность расчётов с серверным исходом, не корректность правил101.

В фактическом прогоне финальный повторный `leave()` закрытой комнаты остановил cleanup driver. После подтверждения reserved0driver завершён, [finalize-soak.mjs](scripts/finalize-soak.mjs) read-only сверил БД. Периодический snapshot сохранён отдельно;123075команд — нижняя граница,453settled матча установлены БД, group checkpoint totals недоступны. В audit-script добавлен bounded leave и исправлен подсчёт комиссии: полная комиссия матча повторяется в каждой participant row, суммировать её надо один раз на матч. Новый30-минутный повтор после этих исправлений не заявляется.

Финальная сверка:100wallets,1812settled rows,453матча, резервов0, отрицательных0, 1 000 000 +100 000 =1 093 205 +6 795. Повторный прогон создаёт другие IDs и последовательности; точное число матчей/команд не обязано совпадать.

## Известные пределы

Это audit-specific harness, не готовая CI-система и не portable mobile lab. Синтетические fixtures и локальные бинарники требуется создать заново. Live debug FPS, native launch и UI proxy нельзя выдавать за Play release TTI/автономность. NAT/TURN, OAuth/FCM delivery, внешний audio focus, production deployment и другие устройства отложены пользователем. Остановка local services после этого этапа штатна; файлы результатов остаются доступными.
