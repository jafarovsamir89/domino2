# Доказательства аудита

Дата: 17.10.2026. Commit: `508932ebeb45cde744e3e1dbd92bc5592ca66093`. Runtime-проверки проводились локально с тестовыми профилями и отдельным Android debug-пакетом.

## Данные

- [Повторение Android-этапа](REPRODUCING_ANDROID.md), [результаты](../SINGLE_ANDROID_AUDIT.md): `single-device-runtime.json`, `schema-drift-check.json`, `android-online-match.json`, `android-online-wallet.json`, `android-final-checks.json`, `android-cleanup.json`, `paid-match-soak.json`.
- `device-02`–`device-40` — native ADB captures этого этапа. Принимать их с классификацией в отчёте:06не доказывает process death,10/11используют остановленный тестом таймер,12quit-dialog,19ранний polling,21пустой чат,39ранний accessibility кадр,40естественный human turn.22удалён как capture launcher.36–38относятся к финальной корректной online версии3harness.
- `android-online-match-invalid-solo-call.json` и `android-online-match-setup-failed.json` — исключённые попытки harness; не доказательства продуктовых дефектов. `paid-match-soak-periodic-snapshot.json` — сохранённое состояние до независимой финализации БД.

- [Повторение продолжения](REPRODUCING_CONTINUATION.md) — команды, prerequisites и ограничения новых harness.
- `metrics/full-match-audit.json`, `full-match-summary.json`, `gameplay-boundaries.json` —1280полных матчей, турнир AI и граничные проверки R-31/R-32.
- `metrics/daily-schedule-check.json`, `coin-economy-simulation.json` — фактическая политика daily и четыре сценарных профиля7/30/90дней.
- `metrics/active-network-check.json` — WebSocket delay/jitter/bandwidth, реальные команды под нагрузкой и отдельный Redis SIGSTOP/SIGCONT. `redis-readiness-check.json` — сопутствующий HTTP health probe.

- `metrics/game-simulation.json` — раздачи, ходы и паритет.
- `metrics/economy-probes.json`, `network-probes.json`, `client-diagnostics.json`, `bot-hidden-info.json` — результаты локальной диагностики.
- `metrics/network-load.json` — короткие sync bursts при 10–1000 подключениях.
- `metrics/network-faults.json` — reconnect и штатный restart.
- `metrics/performance-android.json`, `performance-desktop.json`, `android-ab.json` — renderer workload и последовательное диагностическое сравнение.
- `metrics/android-lifecycle.json`, `android-meminfo.txt`, `android-artifacts.json`, `installed-bundle.json`, `android-elf-alignment.json` — устройство, сборка и сверка assets.
- `metrics/playwright-run.json`, `test-exclusions.json` — E2E и исключённые server tests.
- `metrics/competitors.json`, `reviews.json`, `review-summary.json`, `review-manual-sample.json` — market snapshot: 600 отзывов, прочитанная выборка 30.
- `metrics/business-model.json`, `backlog.json` — сценарные расчёты и задачи.

## Скриншоты и профили

`screenshots/01-login-mobile.png`–`13-small-screen-pause.png` — просмотренные UX-экраны. `android-native-*.png` — native captures. CDP screenshots Android могли опускать GPU canvas и не служат доказательством исчезновения поля.

`traces/*.cpuprofile` открываются в Chrome DevTools как CPU flame chart. Полный compositor/Perfetto trace не снимался.

`logs/` содержит stdout тестов, сборок и миграций. Для этих audit-логов добавлено исключение из общего `*.log`, поэтому они включены в Git. Итоги и ограничения дублируются в `13_QA_TEST_RESULTS.md` уровнем выше. Промежуточные попытки с инфраструктурными ошибками исключены из продуктовых результатов.

По запросу переноса на другой компьютер captures, profiles, логи и старые test outputs включены в Git. Старые попытки остаются исключёнными из продуктовых выводов, но доступны для проверки истории. APK/AAB, тестовая БД, JDK и другие временные материалы остаются в ignored `.tmp`/build directories. Для работы достаточно checkout репозитория; [входная инструкция](../README.md).

## Инструменты

`scripts/` содержит audit-only harness. Часть требует локальной fixture `.tmp/audit-profile.json`, локальных API/Redis/PG и Playwright Chromium. Они не являются готовым переносимым CI-комплектом. Не применять тестовые harness к production endpoints.

Авторитетный перечень выполненных и оставшихся проверок: [QA](../13_QA_TEST_RESULTS.md).
