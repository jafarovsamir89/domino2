# Журнал работ

Записи добавляются по завершённым действиям и решениям. Текущий краткий контекст — в `AGENT_JOURNAL.md`. Исторические audit logs не перезаписывать.

## Правило объяснения результатов — 18.10.2026

Пользователь просит после каждого завершённого пункта или пакета отдельно простыми словами объяснять, что исправлено и какую пользу это дало. Сохранять это правило в последующих сессиях.

## S001 — 18.10.2026 — подготовка исправлений

**Поручение:** начать выполнение единого плана, вести журнал работ и памятку агента; учитывать действующий сервер и около 50 пользователей. Новые Codex plugins устанавливать только после подтверждения владельца.

**Начальное состояние:** `release/play-prep`, HEAD `e56d80d275bbef929251203dc1d463da4fe574a0`, чистое дерево. Создана рабочая ветка `fix/audit-foundation`. Production endpoints не вызывались, deploy scripts не запускались.

**Сделано:** прочитан план и package manifests; создан `AGENTS.md` с маршрутом восстановления контекста и двумя журналами. Зафиксированы исходные версии Node 25.6.0/npm 11.8.0.

**Предварительное наблюдение R-06:** server manifest объявляет `@sentry/node`, lockfile не содержит соответствующий direct dependency. Нужна проверка в чистой копии; рабочая установка после аудита не считается доказательством исправного lockfile.

**Решение:** первый пакет ограничить foundation R-06 и baseline/discovery R-25. Не смешивать его с изменением правил, экономики, БД или публикацией. Зависимости восстанавливать с сохранением существующих locked версий, а не массовым update.

**План проверки:** clean install на изолированной копии без `.env`; полный server test inventory/default/full, API, syntax и E2E с локальным стендом. Результаты и расхождения с историческим baseline дописать ниже по факту.

### S001.1 — lockfile и безопасность локальных проверок

- Причина R-06 воспроизведена: `server-ci-before` exit1/EUSAGE, lock не содержит объявленный Sentry. `root-ci` прошёл на чистой копии (731 пакет), `server-ci-after` прошёл после правки.
- `server/package-lock.json`: добавлены 31entries;0existing versions changed,0removed. Выбран Sentry10.63.0 из root lock, unchanged manifest range^10.62.0; root lock не менялся. Подробное сравнение — `evidence/session-001/lock-diff.json`.
- Node 25.6/npm 11.8 — исходный local runtime. Дополнительно загружены для временных проверок Node 22.14.0/npm 10.9.2, соответствующие Dockerfile в repo. Это не обновление production runtime и не установка Codex plugin. Root clean install на второй паре прошёл; server production-style install ещё проверяется.
- API127/127 и root syntax прошли в fresh copy. Сервисы на production не использовались, реальные `.env` не копировались; `run-check.mjs` формирует ограниченное окружение с локальными synthetic endpoints и пишет command/exit/duration/log.
- Уточнение инфраструктуры: initial server baseline с недоступным локальным Redis оставлял retry handles. Собственные дочерние процессы остановлены, попытки исключены (`aborted-redis-baseline.json`). Для unit-only runs Redis отключён; добавлен timeout/cleanup в runner. Это не продуктовый дефект и не production outage.
- E2E boundary: service workers block, разрешены loopback и статические Google fonts; остальные unmocked HTTP/WebSocket прерываются до отправки. Page-level mocks имеют приоритет. Новый test с reserved `.invalid` domain подтвердил HTTP block и WebSocket close1008. Полный guarded baseline ещё идёт.
- Официальные источники, прочитанные существующим Context7: npm-ci / npm-install (`https://github.com/npm/cli/blob/latest/docs/lib/content/commands/npm-ci.md`, `npm-install.md`), Playwright BrowserContext.route/routeWebSocket (`https://github.com/microsoft/playwright/blob/main/docs/src/api/class-browsercontext.md`). Никаких plugins не устанавливалось.

### S001.2 — завершённые проверки и точка продолжения

**Результат R-06:** root/server clean install passed на Node 25.6/npm 11.8; root clean install и server `npm ci --omit=dev` passed на Node 22.14.0/npm 10.9.2. После всех npm ci SHA256root/server lockfiles совпали с рабочими файлами. Ошибка EUSAGE воспроизводилась до исправления и исчезла после. Manifest dependency ranges и существующие locked versions сохранены.

**Результат R-25 foundation:** старый default30files/201cases201pass. Новый runner обнаруживает 37files и запускает 243cases236pass/7fail на обеих версиях Node. Nested JS/CJS/ESM discovery и failing exit проверены отдельным временным probe; non-test fixtures не выполняются. Исходные 39E2E30pass/9fail, список падающих tests полностью совпадает с audit baseline. Новый network-boundary1/1. API127/127 на обеих версиях Node; syntax passed.

**Материалы:** `evidence/session-001/summary.json` — сводка, `FAILURES.md` — адресная диспозиция 7server/9E2E; `test-inventory-before.json`/`after.json`, `discovery-probe.json`, `lock-diff.json`, исходные логи и результаты commands. Две прерванные Redis-попытки явно исключены и не считаются regression/pass. Никаких production-действий, миграций или установки plugins.

**Статус:** R-06 закрыт локально; R-25 частично, полный CI и исправление старых падений не закрыты. Из 42 пунктов полностью локально завершён 1. Исходные audit результаты остаются историческими; новые результаты хранятся в remediation.

**Следующее действие:** S002/R-05: regression для сохранения admin-config при public read → минимальный create-only bootstrap → API/regression/локальная DB проверка. Предварительно просмотрен ensureBootstrap: stake upsert.update сбрасывает commission/isActive, catalogProduct update сбрасывает metadata/isActive, catalogPrice.update сбрасывает amount/isActive. Нельзя менять daily/монетизацию или редактировать боевую БД.

**Дополнительный startup check:** сервер на Node22.14.0 запускается с новым lock и отключённым Sentry transport. В первой попытке helper ошибочно запрашивал `/ready` вместо существующего `/health/ready` и получил404; это ошибка harness, не регрессия сервера. Исправлен путь, отдельный повтор сохраняется как `server-start-node22-final`. Все процессы принадлежат локальному smoke и останавливаются после проверки.

**Итог startup:** финальный запуск прошёл: `/health`200, `/health/ready`200с ожидаемым local/in-memory degraded status. Сервис импортирует Sentry из нового lockfile без ошибки; это smoke локального старта, не проверка production monitoring. Процесс штатно остановлен.

**Уточнение R-25/source gate:** повтор root `npm run check` обнаружил не повреждение продукта, а собственные detector patterns внутри `.tmp` copies: checker обходил ignored temporary tree. Добавлен skip только `.tmp` (не source directories). Независимый `verify-source-check.mjs` сначала воспроизвёл false positive, затем подтвердил пропуск generated files и сохранение отказа для повреждённого `js/app.js`. Логи: `source-scope-before.log`, `source-scope-after.json`, `root-check-final.log`.

## S002 — 18.10.2026 — R-05, настройки экономики

Начало: чистая ветка `fix/audit-foundation`, HEAD `9f1380ae8a037b08494f55fd601cc627b36efa8e`, опубликованный в origin S001. Создана `.tmp/remediation-s002/clean` без .env; fresh root npm ci прошёл. Production/Android не затрагиваются, plugins не нужны.

Уточнение реализации после чтения точной карточки: простой `upsert.update={}` сохранил бы данные, но оставил бы записи в GET. Поэтому bootstrap переносится из всех request paths в Nest `onModuleInit`, в транзакцию перед обслуживанием запросов. Existing stake/product/config/price сохраняются; создаются лишь отсутствующие defaults. Несколько экземпляров API должны сериализовать bootstrap, иначе findFirst/create prices допускает дубли. Схема/миграции и суммы наград не меняются.

Добавлены три regression cases в существующий economy.service.test.ts: read без конфигурационных writes, сохранение настроек после restart, повторяемый fresh startup/создание отсутствующей цены. Stateful fixture применяет фактические Prisma update payloads к строкам. Первый запуск до исправления сохраняется в `evidence/session-002/s002-api-before.*`.

### S002.1 — результат и ограничения

- До исправления финальный regression suite:127/130 (все исходные127pass, три новыхfail). После:130/130 на Node25.6 и22.14; source check pass. Логи/command metadata и сводка — `evidence/session-002/summary.json`.
- Реализация: EconomyService implements OnModuleInit, транзакция с pg_advisory_xact_lock(1464091701,5), timeout30s; 29 request-level bootstrap calls удалены, только lifecycle вызывает private initializer. Существующие rows не меняются; отсутствующие config/stakes/products/prices создаются. Нет миграции/изменения наград.
- Fresh отдельный PG14.20 в `.tmp/remediation-s002/pg`, loopback55439, synthetic role/database domino_remediation. Все18 migrations применились. Nest application contexts подтвердили4 concurrent fresh start и4 restart, 7 SELECT на проверяемые config/stakes/catalog reads,0writes, timestamps/custom/disabled rows сохранены,0wallets/ledger. Node22 повтор на свежей `domino_remediation_s002_node22` дополнительно подтвердил rollback всех defaults при искусственной startup error. Это не production DB.
- Первая green-попытка `s002-api-after` имела1fail из-за ID fixture: prices.size повторно использовал существующий ID после удаления другой цены. Исправлено monotonic counter; итоговый red и green выполнены заново, assertions не ослаблены. `s002-migrations-node22` — только schema export, не migration check; действительная проверка `s002-migrate-fresh-node22`.
- Простое объяснение владельцу: заданные цены, комиссии и отключённые столы больше не сбрасываются от просмотра настроек или перезапуска. На рабочий сервер это ещё не установлено.
- R-05 локально закрыт. Общий итог2/42, R-25partial. R-07 seed/R-41schema drift не закрыты этим пакетом. Browser/server matrix повторять без причины не нужно.
- Следом S003/R-07: daily claim использует обязательный daily_login, которого нет после fresh migrations. Изучить контракт, воспроизвести без ручного quest, добавить идемпотентный seed в startup и проверить реальное начисление. PG этого пакета пока запущен исключительно локально для следующей проверки; перед финальной передачей остановить собственный кластер через pg_ctl -D .tmp/remediation-s002/pg -m fast -w stop.
