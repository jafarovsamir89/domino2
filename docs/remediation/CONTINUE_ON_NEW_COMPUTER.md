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
5. [Последний результат S030: regression tests R-10 и R-18](evidence/session-030/SECURITY_VOICE_REGRESSION_RESULTS.md).
6. [Результат S029: Android 320px для R-23](evidence/session-029/ANDROID_ACCESSIBILITY_RESULTS.md).
7. [Результат S028: R-20 и R-22](evidence/session-028/LOCAL_SOLO_LOCALIZATION_RESULTS.md).
8. [Результат S027: R-21 и R-23](evidence/session-027/ACCESSIBILITY_DELETION_RESULTS.md).
9. [Результат S026: исходная реализация R-10 и R-18](evidence/session-026/SECURITY_REALTIME_RESULTS.md).

Полностью закрыты локально **22/42 карточки**. R-09/R-15/R-19/R-25 имеют оставшийся объём. R-20/R-22 частичны по S028. R-21/R-23 частичны: S029 подтверждает Android Chrome layout/swipe для 320 CSS px, но TalkBack speech/focus не принят. R-10/R-18 получили targeted regression tests S030; native Android, active-room policy and Wi-Fi/LTE/TURN checks remain open. S030 focused checks pass: API auth service 6/6, server voice 4/4. Previous product checkpoints include `85b10a5` and `f6a395e`; latest docs checkpoint `7c22544`.

Проверено: API **148/148** на Node 22/25; server **390/397** и E2E **53/62** содержат прежние 7/9 падений. Новые 10 браузерных сценариев запуска прошли. В S030 `npm run check`, API `tsc`, targeted API 6/6 и voice 4/4 проходят. Это не полностью зелёный набор. Точные имена и доказательства: [failure-delta.json](evidence/session-025/failure-delta.json), [проверки R-29](evidence/session-024/summary.json), [проверки R-15](evidence/session-025/summary.json).

Следующий шаг — продолжить приёмку R-10/R-18: Colyseus join boundary, API timeout fail-closed, решение о поведении уже начатой партии, затем native `.audit` build на JDK21 и trusted/untrusted origin permission flow. Wi-Fi/LTE и relay-only TURN принимать только через локальный синтетический второй клиент/сервер. Параллельно выполнить TalkBack focus/speech для R-23; S029 принял только 320px layout/swipe в Android Chrome, не native WebView. Для R-20/R-22 ещё нужны guest start/resume и online/coin blocking в изолированном browser, полная локализация и narrow-width review. Для R-21 нужно подтверждение владельца/Console перед публикацией. Телефонные замеры R-15 и внешний audio focus R-19 всё ещё открыты. Не развёртывать production или Play.

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
