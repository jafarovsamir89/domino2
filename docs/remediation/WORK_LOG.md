# Журнал работ

Записи добавляются по завершённым действиям и решениям. Текущий краткий контекст — в `AGENT_JOURNAL.md`. Исторические audit logs не перезаписывать.

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
