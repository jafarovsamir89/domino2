# Повторение дополнительных проверок

Запускать из корня checkout. Проверенный коммит: `508932ebeb45cde744e3e1dbd92bc5592ca66093`. Нужны уже установленные root/server dependencies; отдельный server lockfile рассинхронизирован (R-06), поэтому clean reproducibility пока не гарантируется. Скрипты не являются продуктовым CI.

## Игровой движок и статистика

```sh
node docs/audit/evidence/scripts/full-match-audit.cjs
node docs/audit/evidence/scripts/gameplay-boundaries.cjs
node docs/audit/evidence/scripts/match-statistics.cjs
node docs/audit/evidence/scripts/coin-economy-simulation.cjs
```

Внешние сервисы не нужны. Первые три читают настоящий серверный движок. Временная подмена RNG/таймеров ограничена отдельным процессом harness; не импортировать его в работающий игровой сервер. Статистика зависит от созданного `full-match-audit.json`.

Ожидается 1280 завершённых матчей,328977 действий,904fish-state mismatches. В boundary JSON четыре `conforms:true` и два `false`. Код выхода 0 обозначает завершение записи диагностики, **не отсутствие найденных дефектов**. Изменение source/seed может изменить эти числа. После исправления правил прежние дефектные результаты не должны считаться ожидаемой успешной приёмкой.

Экономическая модель не вызывает сервисы, не изменяет кошельки. Она извлекает цены из исходников и записывает 24scenario/horizon cells:4 профиля ×2 политики ×3 горизонта, по 5000 траекторий на профиль/политику. Проверяется cash-flow identity. Поведение пользователей — предположения в `profiles`, не измеренные когорты.

## Последовательные daily claims

`daily-schedule-check.mjs` требует собранный API/Prisma и локальную PostgreSQL с 18 миграциями, `DATABASE_URL` на 127.0.0.1:55439/domino_audit. Скрипт проверяет host/port/database до работы, создаёт синтетический профиль, вызывает настоящий сервис. Нужен fixture `daily_login` (дефект R-07 описан отдельно). Секреты OAuth/production не нужны. Не заменять URL на боевой.

```sh
DATABASE_URL='postgresql://domino_audit@127.0.0.1:55439/domino_audit?schema=public' node docs/audit/evidence/scripts/daily-schedule-check.mjs
```

Ожидаемый результат:30 нормальных начислений, daily minted51050, final balance52050. Сроки искусственно передаются сервису; это не 30 дней наблюдения.

## Реальные WebSocket-команды и Redis pause

Для другого компьютера можно задать `AUDIT_REDIS_BIN` — полный путь к установленному `redis-server`. Если переменная отсутствует, harness использует исходный audit-путь `.tmp/audit-redis/src/redis-server`. Бинарник и его build directory в Git не включены.

`active-network-check.mjs` использует локальный API4300 для startup probe и бинарник `.tmp/audit-redis/src/redis-server`. Этот бинарник был собран отдельно и не включён в архив; нужна совместимая локальная установка/явное изменение пути в копии harness. Порты 4583/4783/56380 должны быть свободны. API auth/game-token module должен быть собран. Встроенный секрет строго тестовый, synthetic identities не являются реальными пользователями API.

```sh
AUDIT_SMOKE=1 node docs/audit/evidence/scripts/active-network-check.mjs
node docs/audit/evidence/scripts/active-network-check.mjs
```

Smoke сокращает нагрузку до 4 соединений/5 с, полный прогон:20/100/200 по 45 с плюс setup и pause. Комнаты бесплатные, четыре синтетических человека,101. Перед каждым действием harness запрашивает snapshot; это дополнительная нагрузка относительно обычного клиента. HTTP matchmake и WebSocket handshake выполняются без искусственной задержки; условия применяются к дальнейшему WebSocket-обмену. TCP relay сохраняет порядок байтов, добавляет задержку/jitter и ограничение потока; он **не эмулирует потерю IP-пакетов**. 16KiB/s — лимит направления отдельного TCP-соединения.

Скрипт запускает собственные game/Redis процессы и останавливает только их. Redis ставится на SIGSTOP примерно 10 с, затем SIGCONT: память/данные не теряются. Это не аварийная потеря Redis и не проверка failover. Никаких правил firewall, мобильной сети или production сервисов он не меняет. Входящие результаты бесплатных матчей с synthetic IDs не подтверждают запись API/ledger.

Метрики сохраняются в `metrics/active-network-check.json`, stdout сервера — в `logs/active-network-server.log`. Проверка snapshot выполняется при остановленных командах: одинаковый публичный state у 4 клиентов и 28 уникальных костяшек. Она не проверяет каждый промежуточный кадр UI.

Начальные попытки с несовпавшим тестовым секретом и нестабильной передачей HTTP через relay исключены. Финальная методика отделяет HTTP setup от проверки задержек WebSocket. Ошибки стенда не включаются в перечень дефектов игры.

Для сопутствующего health probe запустить `node docs/audit/evidence/scripts/redis-readiness-watch.mjs` в другом терминале после завершения первой нагрузочной ступени полного прогона, до Redis pause. Он только читает state выделенного процесса и HTTP endpoints. После исправления чтения plain-text `/health` выполнен отдельный короткий повтор `AUDIT_REDIS_ONLY=1 node docs/audit/evidence/scripts/active-network-check.mjs` с этим watcher; его данные пишутся отдельно в `active-network-check-redis-only.json` и не заменяют полный load result. Watcher должен стартовать до pause; короткий режим даёт 3 с на его запуск после старта сервера.
