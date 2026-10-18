# Начало работы с другого компьютера

Исправления начаты: текущее состояние и рабочая ветка — в [журнале агента](../remediation/AGENT_JOURNAL.md), ход проверок — в [журнале работ](../remediation/WORK_LOG.md). Исторические материалы ниже описывают audit baseline; для продолжения активной работы сначала читать журналы.

Все отчёты, план, audit scripts, JSON-метрики, SQL diff, скриншоты, CPU profiles и логи находятся в этой папке и включены в Git. Архив из `.tmp` скачивать отдельно не требуется. Исходный код игры находится в том же репозитории.

## Получить файлы

Для нового checkout:

```sh
git clone --branch fix/audit-foundation https://github.com/jafarovsamir89/domino2.git
cd domino2
```

Для существующего checkout без собственных незавершённых изменений:

```sh
git fetch origin
git switch fix/audit-foundation
git pull --ff-only
```

## Начать исправления

Основное задание — **[REMEDIATION_PLAN.md](REMEDIATION_PLAN.md)**. В нём42карточки, зависимости, критерии приёмки и формулировка первого поручения. Начать с R-06 и подготовительной части R-25, затем P0. Исторический код аудита: `508932ebeb45cde744e3e1dbd92bc5592ca66093`; последующие commits с документами не являются исправлением игры.

Перед работой установить зависимости из root lockfile (`npm ci`) и зафиксировать полный baseline. Отдельный `npm --prefix server ci` в проверенном checkout падал из-за R-06 — это первая задача исправления, а не пропавший файл. Не запускать обычную серверную команду как доказательство полного набора: она исключает часть test files. Подробности и команды — в плане и [QA](13_QA_TEST_RESULTS.md).

В аудите использовались Node25.6.0, PostgreSQL14.20, Redis8.10.2 и JDK21; это описание проверенного окружения, не новая политика поддерживаемых версий. Продуктовый Compose предусматривает PostgreSQL17. Согласовать runtime для своей платформы при подготовке R-06/R-25. Некоторые root scripts требуют PowerShell; параметры Android SDK и `JAVA_HOME` задаются на новом компьютере локально.

## Повторять аудит при необходимости

- [Общий отчёт](AUDIT_MASTER_REPORT.md), [Android-результаты](SINGLE_ANDROID_AUDIT.md), [согласованный объём](ACCEPTED_SCOPE.md).
- [Воспроизведение серверных сценариев](evidence/REPRODUCING_CONTINUATION.md), [Android/local сценариев](evidence/REPRODUCING_ANDROID.md).
- [Android debug overlay](android/init.gradle) и его manifest/assets/resources включены в Git; пути не привязаны к домашней папке автора.

Локальные `.env`, signing keys, APK/AAB, скачанные JDK/SDK/Redis, БД, `node_modules` и временные session tokens не являются переносимыми исходниками и не коммитятся. Синтетические аккаунты создаёт `evidence/scripts/single-device-fixtures.mjs` после подготовки локальных API/БД. Для начала исправлений не нужны реальные пользовательские кошельки или доступ к production.

Часть старых captures относится к инфраструктурным ошибкам и исключённым попыткам harness. Они сохранены для полноты передачи; принимать результаты по классификации в отчётах. Содержимое `initial-playwright-results`, `playwright-results`, `legacy-e2e-captures` не добавляет новых успешных тестов.

Файл `evidence/metrics/sha256-manifest.json` позволяет проверить целостность переданных файлов. После clone/pull выполнить из корня:

```sh
node docs/audit/evidence/scripts/verify-manifest.mjs
```

Ожидаемый результат — пустой список `problems`. Проверка использует только встроенные модули Node, поэтому `npm ci` для неё не требуется. Эта папка содержит материалы исходного аудита; актуальная реализация исправлений и checks ведутся отдельно в `docs/remediation`.
