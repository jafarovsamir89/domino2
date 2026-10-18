# Реальные испытания и границы аудита

**Согласованный Android-этап завершён:** [матрица12 шагов](SINGLE_ANDROID_AUDIT.md). Новый результат: 343 принятые online-команды/34 совпавших state checks;453 settled матча в длительном API/PG тесте,100 сверенных кошельков;5 cold+5 warm; подтверждены R-40/R-41/R-42. Контролируемый resume имеет явно описанные ограничения, первоначальные неудачные harness-попытки исключены.

> Аудит 17 октября 2026. Репозиторий `jafarovsamir89/domino2`, ветка `release/play-prep`, коммит `508932ebeb45cde744e3e1dbd92bc5592ca66093`. Проверки только локальные. Игра уже опубликована в Google Play; production и реальные кошельки не изменялись.


## Воспроизводимость окружения

macOS arm64; root npm ci выполнен из lockfile. `server npm ci` завершился EUSAGE: package.json и отдельный server/package-lock.json рассинхронизированы, отсутствуют Sentry/OTel dependencies. Для продолжения только локального исследования выполнена установка server dependencies с `--package-lock=false`; продуктовый lockfile не исправлялся. Поэтому результат server tests относится к фактически установленному дереву, а не к гарантированно воспроизводимой clean CI-сборке.

Prisma generated и API build выполнены. Изолированная PostgreSQL14 на 127.0.0.1:55439, БД domino_audit; Redis core8.10.2 на 56379, отдельные DB для независимых прогонов. Локальные API4300/game4567/preview4174, дополнительные процессы для load/faults. Compose проекта предусматривает PostgreSQL17: реальный production major/config не проверены.

## Сводка

| Проверка | Факт | Evidence |
|---|---|---|
| Root syntax/check | passed | logs/check.log |
| API tests | 127 passed | logs/api-test.log |
| Server default command | 201 passed | logs/server-test-default.log |
| Все server test files | 243 total,236 pass,7 fail | logs/server-test-all.log |
| Playwright после установки Chromium | 39 total,30 pass,9 fail,0 flaky/skip | metrics/playwright-run.json |
| Admin Next build | passed | logs/admin-build.log |
| Android JDK17 | fail, Java21 dependency sources | logs/android-release.log |
| Android JDK21 release APK/AAB | passed, локально unsigned | logs/android-release-jdk21.log |
| Отдельная audit APK install | passed | logs/adb-install-audit.log |
| Чистые миграции | 18 applied | logs/migrations.log |
| Backup / restore | pg_dump -Fc → новая БД,39 public tables | logs/backup-restore.log |
| Игровые симуляции | 1800 раздач,36343 хода/parity,0 invariant failures | metrics/game-simulation.json |
| Полные headless матчи | 1280,328977 действий,14256 раздач,691 гоша;0invariant exceptions,904fish-state mismatches | metrics/full-match-audit.json |
| Границы правил | 6 проверок:4 соответствуют,2 несоответствия R-31/R-32 | metrics/gameplay-boundaries.json |
| Турнир AI | 960 игр,80paired seeds на пару/режим,bootstrap CI | metrics/full-match-summary.json |
| Daily schedule | 30claims,51050 выпущено,cap7 подтверждён | metrics/daily-schedule-check.json |
| Экономические профили | 40000 модельных траекторий 7/30/90 дней;денежное тождество проверено | metrics/coin-economy-simulation.json |
| Активные WebSocket-команды | 20/100/200 соединений по 45 с,9825 действий,0reject/timeout,80/80checkpoints | metrics/active-network-check.json |
| Stream delay/jitter/bandwidth | 48/48 команд,4 согласованных checkpoints; не IP loss | metrics/active-network-check.json |
| Redis pause | 32 команды за 10,15 с, recovery согласован;HTTP health timeout1500 мс R-39 | metrics/active-network-check.json,redis-readiness-check.json |
| Socket burst | 10/50/100/200/500/1000 connections,0 sync errors | metrics/network-load.json |
| Graceful restart | snapshot удалён,restore failed | metrics/network-faults.json |
| Android solo background | 5/15/30/60/120,28 tiles,меню отвечает | metrics/android-lifecycle.json |
| Performance | Android rAF23,8–26;CSS diagnostic54,5 | metrics/performance-android.json,android-ab.json |
| Локальные транзакционные проверки | several invariant failures confirmed | metrics/economy-probes.json |
| Клиентский async / звук | stale score10 после reset;mute не подавляет SFX | metrics/client-diagnostics.json |
| Public market research | 10 apps,600 reviews,manual sample30 | metrics/competitors.json,reviews.json |

Первый Playwright запуск без Chromium дал инфраструктурные падения; он не считается проверкой игры. После установки браузера выполнен полноценный запуск. Во время подготовки load/faults были конфликты порта и общей Redis registry; результаты этих промежуточных попыток исключены. Финальные файлы получены на отдельных портах/Redis DB. Первая неверная performance fixture заменена; таблицы используют последний валидный прогон.

## Почему npm test зелёный, а полный набор нет

`server/package.json` перечисляет test files явно. Семь файлов остаются вне default command: last-move-reveal-ux, solo-bazaar-button, turn-timeout-forfeit-flow, game-mode-routing, result-overlay-test, open-room-client-flow, disconnect-grace. Точный diff — [test-exclusions.json](evidence/metrics/test-exclusions.json). Исключение файла не обязательно намеренное сокрытие: это дефект maintenance/discovery.

Падения полного server run: три disconnect-grace fixtures несовместимы с private roomId state/ожиданиями takeover и explicit leave; один restore fixture обращается к undefined.length; один source assertion ждёт немедленный full sync после final delta; один ищет старую реализацию bazaar; один ждёт continue_in_progress. Требуется обновить fixtures на реальные конструкторы/контракты, затем заново проверить поведение. Все 7 не объявлены 7 продуктовыми багами.

## Девять E2E падений

| Тестовая область | Наблюдение | Диспозиция |
|---|---|---|
| Start screen | ожидание старого query version social-live-1 | устаревший source assertion |
| Konva tile rects | разница координат примерно 18,7px | возможный coordinate/fixture defect; отдельно воспроизвести, не закрывать косметическим tolerance |
| Profile invite button | hidden вместо visible | проверить identity/permissions fixture и актуальный UX |
| Invite polling | 0 вместо≥2 | проверить auth и polling contract |
| Open/closed menus | старого DOM id нет | устаревший сценарий |
| Pause | Resume/4 действия против старого текста/2 действий | устаревшая спецификация/локализация |
| Expired reservation restore | restore-token вместо fallback empty | важная ветка recovery, проверить после ownership patch |
| Invite room code | null | проверить реальное room resolution и fixture |
| Daily visibility | hidden при ожидаемом auth | fixture/auth contract; реальный daily race проверен независимо |

Не заменять assertions на новые строки ради зелёного статуса. Для каждого теста: актуальный продуктовый договор → fixture → assertion → независимое ручное подтверждение, если затрагивается деньги/сессия.

## CI/CD, который нужен

1. Clean root и server install из lockfiles, pinned Node/JDK21/SDK, проверка drift.
2. Syntax/types/static checks и dependency audit с triage по reachable surfaces.
3. Auto-discovery всех unit tests; одинаковая команда локально и в CI.
4. PG/Redis integration: fresh migrations, reward/reserve/settle/refund, concurrent retries, identity ownership.
5. Seeded game golden/parity simulations для Telefon/101/2v2.
6. Playwright authenticated/unauthenticated, two real local users, mobile sizes, final-move/reconnect/last-tile.
7. Hash gate root→www→Android assets, release manifest и лицензии.
8. Admin/API/game builds, Android release unsigned validation; signing только защищённым release job.
9. Internal track/manual OAuth/voice/permissions, performance device gate и staged rollout.

P0 regression, миграция, деньги, auth или assets mismatch блокируют release. Неизвестная dependency advisory проходит формальную triage, а не слепой ignore. Для UI low-impact не требуются бессмысленные unit tests, повторяющие markup.

## Что не проверено и как закрыть

По согласованному сокращению отложены production deployment SHA/config, реальные balances, логи/Android Vitals, Play Console/Data Safety, release signing/OAuth client, оплата/SSV/push; дополнительные классы Android; входящий звонок и естественный low-memory kill (force-stop проверен отдельно); двухсторонний voice через NAT; packet-loss/Wi-Fi→LTE; Redis data loss/API commit-ACK outage и SIGKILL persistence; часовой combined active-match/social/voice memory soak; journey с двумя физическими участниками; rollback на staging-major PG17 и production backup. Новые local device/social/30-minute paid результаты приведены в дополнении; успешный DM заблокирован подтверждённой R-41, а не отсутствием разрешения владельца.

Backup restore здесь проверяет применимость локального dump и 39 таблиц, но не production RPO/RTO, полноту медиа/секретов/внешних сервисов или возможность вернуть финансовые операции во времени. Требуется отдельный согласованный restore drill, checksums/row counts/ledger reconciliation и документированный rollback.

## Evidence и изменения рабочего дерева

Все отчёты и audit tools находятся в docs/audit; временные DB/JDK/build fixtures — .tmp и ignored build directories. Продуктовая логика не исправлялась. E2E перезаписал несколько исходных reference PNG и test-results; они восстановлены из HEAD, новые captures сохранены отдельно. Большие APK/AAB/backup не добавлялись в Git. Скриншоты и profiles доступны локально; их добавление в репозиторий должно быть выборочным.
