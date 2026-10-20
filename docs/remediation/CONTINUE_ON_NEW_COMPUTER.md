# Продолжение работы на другом компьютере

Репозиторий: https://github.com/jafarovsamir89/domino2. Рабочая ветка: **`fix/audit-foundation`**.

## Получить файлы

Для нового checkout:

```sh
git clone --branch fix/audit-foundation https://github.com/jafarovsamir89/domino2.git
cd domino2
```

Если репозиторий уже есть, сначала проверить `git status`. Не сбрасывать чужие локальные изменения. В чистом checkout:

```sh
git fetch origin
git switch fix/audit-foundation
git pull --ff-only
```

Все исходники, тесты, журналы, план и сохранённые результаты проверок находятся в Git. `.tmp`, зависимости, локальные базы, APK, сырые системные traces и секреты не переносятся через Git. Для продолжения анализа они не обязательны; для новых проверок нужен свой локальный стенд.

## Что агенту читать первым

1. [Корневой AGENTS.md](../../AGENTS.md).
2. [AGENT_JOURNAL.md](AGENT_JOURNAL.md) — актуальный контекст, решения, ограничения и следующий шаг.
3. [WORK_LOG.md](WORK_LOG.md) — история действий и проверок; дополнять, не переписывать.
4. [REMEDIATION_PLAN.md](../audit/REMEDIATION_PLAN.md) — единый план из 42 карточек.
5. [Последний результат S031: Android TalkBack R-23](evidence/session-031/ANDROID_TALKBACK_RESULTS.md).
6. [Результат S032: guest solo до auth](evidence/session-032/GUEST_BEFORE_AUTH_RESULTS.md).
7. [Результат S034: Android build R-18](evidence/session-034/ANDROID_VOICE_BUILD_RESULTS.md).
8. [Результат S033: Colyseus reconnect R-10](evidence/session-033/PLATFORM_GAME_RECONNECT_RESULTS.md).
9. [Результат S030: regression tests R-10 и R-18](evidence/session-030/SECURITY_VOICE_REGRESSION_RESULTS.md).
10. [Результат S029: Android 320px для R-23](evidence/session-029/ANDROID_ACCESSIBILITY_RESULTS.md).
11. [Результат S028: R-20 и R-22](evidence/session-028/LOCAL_SOLO_LOCALIZATION_RESULTS.md).
12. [Результат S027: R-21 и R-23](evidence/session-027/ACCESSIBILITY_DELETION_RESULTS.md).
13. [Результат S026: исходная реализация R-10 и R-18](evidence/session-026/SECURITY_REALTIME_RESULTS.md).

Полностью закрыты локально **24/42 карточки**. R-23 закрыта в S031: на Android Chrome с TalkBack native tree получил имена и фокус костяшек и выбора конца; S029 подтвердил 320 CSS px и горизонтальную прокрутку. R-20 закрыта в S032: гость начинает локальную solo до медленного auth, online/coins закрыты, startup suite12/12 root/www. Тесты synthetic browser/localhost, не production или Play/WebView. S033 укрепил R-10 проверкой Colyseus reconnect (14/14), но active-match/restart policy остаётся. S034 исправил Android compile blocker, Java21 debug APK собрался; он не устанавливался. R-18 остаётся частичной до mic prompt и Wi-Fi/LTE/TURN. Остальные18 карточек открыты или частичны. S030 focused checks: API auth service6/6, server voice4/4. Последний пакет — S032–S034; проверьте актуальный `origin/fix/audit-foundation`.

Проверено: API **148/148** на Node 22/25; server **390/397** и E2E **53/62** содержат прежние 7/9 падений. Новые 10 браузерных сценариев запуска прошли. В S030 `npm run check`, API `tsc`, targeted API 6/6 и voice 4/4 проходят. Это не полностью зелёный набор. Точные имена и доказательства: [failure-delta.json](evidence/session-025/failure-delta.json), [проверки R-29](evidence/session-024/summary.json), [проверки R-15](evidence/session-025/summary.json).

Следующий шаг — отдельная `.audit` сборка R-18 для проверки native permission prompt рядом с Play app; затем R-19 и другие независимые partial cards. R-10 active-match revocation/SLA и restart recovery остаются product scope; не отключать игрока из середины партии вслепую. R-15 телефонные startup метрики, R-18 Wi-Fi/LTE/TURN, R-19 внешнее audio focus и R-21 owner/Console policy всё ещё открыты. Не развёртывать production или Play.

Телефонные замеры запуска R-15 и внешняя приёмка звука R-19 остаются открытыми. Владелец разрешил продолжать без телефона; не блокировать этим независимую работу и не выдавать браузерные результаты за Android.

## Подготовить чистые зависимости для новых проверок

Проверенные версии стенда: Node **22.14.0**, npm **10.9.2**. Включить Node 22 своим менеджером версий. На другом компьютере старых `.tmp/remediation-s014/...` и ссылок из журнала не будет — это описание прежнего стенда, а не файлы, которые нужно найти.

Из корня checkout создать новую изолированную копию без `.env`, затем установить обе группы зависимостей из lockfiles:

```sh
node docs/remediation/scripts/prepare-checkout.mjs .tmp/remediation-s027/clean
node docs/remediation/scripts/run-check.mjs s027-root-ci .tmp/remediation-s027/clean -- npm ci
node docs/remediation/scripts/run-check.mjs s027-server-ci .tmp/remediation-s027/clean -- npm --prefix server ci
node docs/remediation/scripts/run-check.mjs s027-source .tmp/remediation-s027/clean -- npm run check
```

Путь должен быть новым. Если S027 уже занят, выбрать следующий свободный номер и одинаково изменить пути/метки. `run-check.mjs` даёт дочернему процессу только разрешённые переменные и синтетические localhost endpoints. Проверять exitCode каждого шага перед следующим.

Для новых E2E установить соответствующий lockfile Chromium обычной командой Playwright в этой копии. Это зависимость тестового инструмента, не плагин Codex. API имеет отдельные workspace-зависимости и TS5; не подменять их одним чужим root node_modules. Не запускать API rebuild одновременно со скриптами, импортирующими его dist.

PostgreSQL/Redis нужны только соответствующим проверкам. Поднимать собственные локальные экземпляры и новые синтетические базы. Вспомогательные PG/ADB-скрипты содержат некоторые пути старого macOS-стенда: адаптировать их под свою ОС, сохранив localhost-проверки и запрет production. Старые `.env`, реальные токены, базы пользователей и ключи для этого не нужны.

## Что нельзя потерять при продолжении

Игра уже обслуживает около 50 пользователей. Текущие исправления **не развёрнуты** на рабочем сервере и в Play. Не запускать deploy, реальные миграции и операции с рабочими кошельками без прямого поручения.

Для будущего выпуска R-29 обязателен `ECONOMY_OUTBOX_DIR` — абсолютный путь на постоянном локальном томе, переживающем замену сервера/контейнера. Сначала выпускать соответствующий API. Без настройки production game server намеренно не стартует. Полные условия: [OUTBOX_OPERATIONS.md](evidence/session-024/OUTBOX_OPERATIONS.md).

Сохранять соответствие исходников и `www`, старые доказательства аудита и честный статус оставшихся проверок. После каждого рабочего пакета обновлять оба журнала, единый план и отправлять код вместе с результатами в эту ветку.

## Сообщение для нового агента

> Продолжи исправления Domino в ветке fix/audit-foundation с последнего origin commit. Прочитай AGENTS.md, docs/remediation/CONTINUE_ON_NEW_COMPUTER.md, AGENT_JOURNAL.md, WORK_LOG.md и REMEDIATION_PLAN.md. Игра обслуживает около 50 пользователей: работай локально, без production deploy, миграций и изменений Play package. S030 добавил проверки R-10/R-18, S029 проверил R-23 в Android Chrome на 320 CSS px; отчёты и границы указаны в handoff. Следующее: synthetic Colyseus join-boundary/timeout tests, обсудить политику уже начатой партии, изолированный Android audit build на JDK21 и native trusted-origin microphone prompt только на `.audit`; реальный Wi-Fi/LTE/TURN — только с локальной тестовой инфраструктурой. Отдельно довести TalkBack для R-23 и guest online/coin checks R-20. Обновляй журналы и объясняй результат простыми словами. Не считай приёмку сделанной, если сценарий не проверен.
