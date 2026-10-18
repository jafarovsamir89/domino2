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

## S003 — 18.10.2026 — R-07, daily на fresh database

Начало после опубликованного S002 commit30596eb, чистая ветка fix/audit-foundation. Fresh checkout `.tmp/remediation-s003/clean`, clean npm ci passed. Используется только собственный PG S002loopback55439. Созданы отдельные synthetic DB `domino_remediation_s003_before`/`after`, все18 migrations применились без schema repair.

До правки: новый unit regression даёт130/131, единственный fail — отсутствующий daily_login после startup. Реальный normal daily claim после fresh migrations+startup падает `Quest not found` (`s003-daily-before`), ручного seed нет. Existing MockDb заранее содержал quest, поэтому старый suite этот дефект не видел.

Исправление: startup initializer создаёт missing daily_login, update{} сохраняет owner changes. maxProgress1, active true, period daily; rewardAmount0 — ежедневные монеты выплачиваются существующим daily bonus, дополнительную награду не вводим. Historical audit fixtures использовали такой же нулевой quest reward. Существующие inactive quest не включать принудительно; R-07 устраняет отсутствие записи, не меняет админ-политику отключения/вознаграждений. R-02parallel/R-09x2 не входят в этот пакет.

### S003.1 — завершение

- Unit suite до130/131, после131/131 на Node25.6 и22.14; root source check pass. Real PG после18freshmigrations: startup без ручного quest, normal daily200, repeat same date claimedfalse/без начисления, следующий день300. Synthetic balance1000→1500,2claims/2daily ledger entries, progress completed, extraquestreward0.
- Повторный startup сохраняет title/description/reward17/maxProgress3/inactive/timestamps, дубликатов quest нет. Не считать existing disabled daily_login работающим daily: поведение отключённой админом записи не менялось.
- Полные команды и логи — `evidence/session-003/summary.json`. Только synthetic player/email @example.invalid, никаких real profiles/production endpoints. Собственный PG .tmp/remediation-s002/pg штатно остановлен (`s003-pg-stop`); временные DB остаются для повторного анализа, .env не копировались.
- Для владельца: ежедневный бонус теперь работает и на новой базе без ручного добавления служебной записи; суммы выплат остались прежними. На действующий сервер изменения не устанавливались.
- Итог3/42локально закрыты (R-06,R-05,R-07), R-25partial,38open. Следующий пакет S004/R-02: сначала failing100parallel/retry для ежедневного начисления и upgrade, затем атомарная проверка+изменение claim+wallet; не смешивать с решением о рекламном x2 (R-09) или изменением суммы наград. Проверки R-25/E2E и schema drift R-41 остаются открыты.

## Правило размера пакетов — 18.10.2026

Пользователь просит небольшие пункты выполнять подряд без остановки, до существенного большого пункта. Сохранять автономное продолжение и отдельные простые объяснения по завершённым пунктам.

## S004 — R-02, атомарное ежедневное начисление

Начало: clean fix/audit-foundation, HEAD8c69090, предыдущие3/42 закрыты локально. Подготовлена .tmp/remediation-s004/clean без .env. Production не используется. Цель:100одновременных normal/direct-x2/upgrade/mixed запросов не начисляют больше установленной награды и возвращают безопасный повтор. R-09подтверждение рекламы остаётся отдельным пунктом; существующие размеры и доступность x2 здесь не меняются.

Причина: проверка существующего claim выполняется до wallet lock. Поздняя блокировка защищает арифметику баланса, но не право начисления. План: транзакционная блокировка daily по player (включая отсутствие кошелька и смену дня), затем проверка/claim/credit в одной транзакции; устойчивые unique ledger keys initial/upgrade используют существующий nullable unique idempotencyKey, без schema migration. Проверить legacy claims без ключа и rollback/retry. Нужна реальная локальная PostgreSQL, MockDb не моделирует конкуренцию.

### S004.1 — результат

- До: unit131/132, новый ledger-key regression fail. Real PG100parallel: normal11P2002, directx2также11P2002, upgrade12successfulgrants/balance2600вместо400, mixed11errors/balance2000. Это новые локальные synthetic DB, не реальные игроки.
- После: unit132/132 Node25.6/22.14, source check passed. Real PG14.20 на обеих Node версиях:4сценария по100запросов через4service objects/12DBconnections,0rejected, balance200/400/400/400. Отсутствующий wallet создаётся безопасно; повторные sequential retries, rollback initial+upgrade и успешный retry, legacy daily claim без ledger-key, полночь Баку и пропуск streak проверены. Wallet/claim/ledger amounts сверены, новые keys заполнены и уникальны. Evidence:session-004/summary.json и исходные logs.
- Изменение ограничено claimDailyBonus: pg_advisory_xact_lock(1464091702,hashtext(playerId)) до lookup, ReadCommitted после ожидания, maxWait/timeout30s; idempotency keys daily_bonus:player:date:initial|upgrade. Hash collision лишь сериализует разных игроков; не объединяет их claim/keys. Existing unique CoinLedgerEntry.idempotencyKey уже в миграциях; migration не нужна. Множители/размеры наград и ad eligibility не менялись.
- Официальная документация через существующий Context7: https://www.postgresql.org/docs/15/explicit-locking.html (transaction-level locks released on commit/rollback), https://www.postgresql.org/docs/15/transaction-iso.html (ReadCommitted command snapshots). ЛокальныйPG14подтвердил используемые SQL; plugins не устанавливались.
- Для владельца: повторные/одновременные нажатия больше не увеличивают бонус сверх нормы и не ломают получение; нормальная выдача и суммы сохранены. Рекламное право R-09 остаётся открытым.
- Production не обновлялся; при будущем внедрении все старые API instances должны быть заменены, иначе старый код не участвует в новой блокировке. Это примечание к будущему rollout, не поручение выполнить deploy. СобственныйPG остановлен s004-pg-stop.
- Итог4/42локально закрыты, R-25partial,37open. Продолжаем без остановки небольшой S005/R-08: неверное isInstantWinEnabled передаётся вместо instantWinEnabled в2server и4client calls. Затем крупный R-03 требует отдельной реальной проверки reserve/settle/refund.

## S005 — R-08, настройка мгновенной победы

Продолжаем малый пункт без остановки после S004 commit3b5d3d7. СобственныйPG остановлен, production/Play не затрагиваются. Fresh .tmp/remediation-s005/clean/server npm ci passed. Shared/fallback ruleset ожидают instantWinEnabled, но2server и4client calls передают isInstantWinEnabled; www/js/app.js полностью совпадал с root source.

Добавлен behavioral server/test/instant-win-setting.test.js: реальные performPlay/performGosha используют общий ruleset; полный DominoGame class+fallback загружены в VM без constructor/entrypoint (без brace parser), выполняются реальные playTile/playGoshaCombo→checkEnd в web/package assets. Score30/35/40 и flags проверяют server, client shared/fallback score35, empty-hand end и byte parity. Боковые эффекты renderer/timers/network изолированы, бизнес-решение о финале не подменяется. Исходный red и последующий green сохраняются отдельно. Исправление — только имя параметра во всех10calls (6уникальных +4packaged copies); правило и пороги не менялись.

### S005.1 — результат и переход к крупному пункту

- Новый behavioral suite: до21/33 (12fail именно false setting), после33/33. Node22regression+existingrulesets40/40, source check pass. Полный server269/276, те же7failure names S001,0newfailures; auto discovery38files включает новый файл. TAP baseline и spec текущего Node сопоставлены по названиям (`failure-delta.json`), historical logs не переписаны. E2E/Android package не запускались; проверялись реальные методы класса в VM, а не UI/анимации.
- Для владельца: выключенная мгновенная победа действительно выключена — партия не обрывается на35очках; включённая настройка сохраняет прежнее поведение. Обычное завершение при пустой руке осталось. Правила/пороги не менялись, только согласован ключ опции.
- Итог5/42локально закрыты (R-06,R-05,R-07,R-02,R-08), R-25partial,36open. Два текущих пакета отправляются отдельными commits; production/Play не обновлялись, локальные DB остановлены.

### Подготовка следующего большого пакета S006/R-03

Первичный просмотр показывает: settle SQL блокирует reserved только по roomId+stakeTableId, игнорирует matchId, а после присваивает payload matchId строке. Reserve имеет unique(roomId,playerId,stakeTableId), пропускает existing reserved любого матча и переиспользует settled row для нового matchId. Поэтому недостаточно добавить один WHERE: нужны проверки reserve replay/active-other-match/повторного settlement, сохранение identity и корректный переход следующего матча. Возможна миграция identity/истории; сначала изучить server/economyService.js, currentDealMatchId и API validation DTO, а не ломать старые контракты. До изменения финансового кода получить guarded real-DB failing regression позднего результата A при резерве B и сверить все wallet/ledger/reserve. Новый пакет не считать начатым исправлением; код R-03 пока не менялся.

## Пакет из трёх пунктов — S006–S008

Пользователь18.10.2026 просит выполнять по3пункта за заход. Выбраны R-03 (match reserve identity), R-31 (101 fish scoring), R-32 (101 drawToOpen). Начало: чистый fix/audit-foundation HEAD46cc8c7,5/42локально закрыты. Production/Play не обновлять.

### S006/R-03 — решение до реализации

Прочитаны EconomyService, server/economyService.js, MatchesService и DTO. Сервер reserve/settle/forfeit передаёт canonical matchRecordId, MatchesService сохраняет sourceMatchId как Match.id; контракт совместим с обязательным matchId для платного резерва. Схему менять необязательно: existing уникальная строка room/player/stake остаётся текущим резервом, историческая identity хранится в immutable ledger keys/payload. Для предотвращения старого reserve replay после переиспользования row использовать существующий reserve ledger key. Это сохраняет совместимость schema с живой игрой и не требует migration.

План: room transaction lock для reserve+settle; exact match filter для settlement; reject active other match и completed reserve replay; idempotent same-match reserve до проверки остатка; freeze stake/commission из reservation, wallet locks в стабильном порядке. Старые rows без matchId не угадывать/не присваивать новому матчу; безопасный конфликт и существующий reconciliation отдельно. Проверить на fresh local PG до и после, без .env/real users.

### S006.1 — завершение R-03

До API132/134 (две новые регрессииfail), realPG1/8pass: чужой matchResult потреблял2новых резерва; repeatedreserve создавалdeadlocks/ошибки; config изменял reportedbank. ПослеAPI134/134 Node25/22, PG9/9Node25 и10/10Node22 (добавлен explicit legacy-null safety check).100concurrentreserve+30settle дают один bank100/commission5 и final95, никаких двойныхопераций. Проверены changedparticipantset/oldmatchwithnewplayers/rollback+retry/replayAпослеB/C. При повторном резерве сbalance0 сохранён receipt; ставки/комиссия заморожены, отключение таблицы не блокирует расчёт уже удержанных средств.

No migration: reused current row сохраняет схему, replay отсекается существующей immutable ledger history (indexed referenceType/referenceId плюс JSON room/match); initial/replay keys сохранены совместимыми. Roomlock1464091703, ReadCommitted/maxWait/timeout30s; wallets сортируются для lock order. Legacy null-match funds не переназначаются, future existing reconciliation отдельно. Production не трогали; свойPG остановлен s006-pg-stop. Будущий rollout требует убрать старые API instances. Evidence: session-006/summary.json.

Для владельца: результат старой партии больше не может списать/вернуть монеты новой; повторные запросы безопасны. Размеры ставок и политика выигрыша не менялись. Локально6/42, R-25partial. Продолжаем R-31/R-32 в этом же заходе.

## S007/R-31 — очки рыбы в101

S006 commitfd86a81 опубликован. Готова isolated server copy/clean npmci. Новые behavioral tests используют настоящий DominoRoom constructor/schema/onCreate, renderer/network заменены локальными event sinks, monetary settlement только spy. Golden fixture извлечена как данные из historical28-tile audit без перезаписи старых evidence. До3/3fail:79осталось79вместо129, tiecarry0вместо14, team90вместо111.

Причина: advanceTurn вызывал resolveBlocked, но не применял возвращённый matchState. Исправление: применить/синхронизировать state до endDeal; guard inactive/finished предотвращает повторное применение при очередном callback. endDeal не пересчитывает101award, только синхронизирует уже применённое состояние. Проверяются129/одинфинал/одинsettlement, tiecarry14→17следующаярыба,2v2score111иобаучастника. Ruleset/размерыочков не меняются.

### S007.1 — итог

Behavioral3/3pass, Node22+rulesets10/10; fullserver272/279, те же7failure names,0newfailures. Сеть/API/production не вызывались, golden28tilesfixture сохранена отдельно от historical audit. Нормальный ruleset не менялся. Для владельца: очки рыбы больше не теряются, финал/settlement не повторяется. Локально7/42, R-25partial. Продолжаем третий пункт R-32.

## S008/R-32 — первый ход101 при дубле в базаре

После опубликованного S007a643f39 подготовлена fresh server copy/npmci. Детерминированный seed225 сначала проверяется реальным shuffle/first-player: положительных дублей на руках нет. До новый suite4/5pass, golden fail currentPlayerIndex=-1. Expected после drawToOpen:2добора, руки8/8, базар12, игрок1, обязательная3-3/index7. Дополнительные случаи: предыдущий победитель без добора; обычные seed1/17/87 при2/3/4team сохраняют исходное распределение.

startDeal теперь выполняет существующий ruleset.drawToOpen до reserve/gameActive/schema/timer/payload; недопустимый opening не публикуется. Проверки включают28unique tiles, handCount/boneyardCount, full_state.validMoves/selfHand, визуальный opening-stage actor и roundtrip custom snapshot. Node test mocks ограничены собственными timers/random, реальные constructor/schema и startDeal. Browser/Play не трогаем.

### S008.1 — пакет из3 завершён

Initialbefore4/5, after5/5. Дополнительно проверены полные free101матчи:2FFAseed225267actions/9deals/scores140,32;4teamseed17228actions/9deals/scores105,85. Реальные startDeal/play/draw/pass/advance/endDeal/endRound, seeded deck/virtualtimers/firstlegalmove;1final/record и0monetarycalls. Final7/7, Node22fish+opening+rulesets17/17. Fullserver279/286,40files, те же7S001fail names (failure-delta.json),0newfailures. Sourcecheckpass. Более ранние s008-server-full/101-node22 — suite до добавления2wholematches, финальные s008-server-final/101-node22-final. Не считать fullCIзелёным.

Для владельца: раздача без дублей на руках больше не зависает — сервер добирает кости и назначает корректный первый ход; руки/базар/сохранение не расходятся. ПакетR03/R31/R32 локально завершён,8/42, R25partial. Живой сервер, реальные кошельки и Play не менялись; PGостановлен послеS006, новых pluginsнет. Следующая очередь из3: R01/R04/R09, сначала ownership regression по карточке.

## Пакет из пяти — S009–S013

Последнее поручение пользователя: выполнять сразу5пунктов. Выбраны R-01,R-04,R-09,R-12,R-42, зависимости закрыты/внутри пакета. Начало: clean fix/audit-foundation HEAD3fa26e0,8/42локально закрыты, R25partial. Все исправления/тесты локальные, никаких production/Play/realwallet edits; pluginsне нужны. Для каждого пункта red regression→fix→checks→focused commit; сохранить простое объяснение пользы и текущую точку агента.

### S009/R-01 — завершено локально

До9regressions2pass/7fail: чужая identity могла восстановить место. Теперь проверяется platform identity+user/player ownership до mutation/hand; supplied room/code/match сверяется, occupied target запрещён. Клиент+www сохраняют matchId, оба payload его передают. Legacy snapshots без matchId допускают только владельца. Targeted24/24 Node25/22; sourcecheckpass; full295tests288pass7fail — те же исходные7. Два старых assertions обновлены: wrongowner больше не allowed, payload теперь содержит matchId. Промежуточный misplaced fixture исправлен, не засчитан успешным прогоном. Evidence session-009/summary.json.

Для владельца: сохранённое место и костяшки получает только их владелец; свой возврат сохраняет игру. Локально9/42, R25partial. Продолжаем R04; production/Play не менялись.

### S010/R-04 — завершено локально

Real Redis7.4.11 из official source/hash во временной .tmp, без global/plugin установки. Red s010-shutdown-repro: snapshot послеSIGTERM/onDispose отсутствует. После: version1+paused remaining turn, guards messages/onLeave/reconnectcatch, остановка timers, serialized atomic dual-key Redis save; shutdown cleanup сохраняет snapshot/registry, ordinary cleanup awaitудаляет. Registry connection promise исправляет concurrent connect и late write послеforget.

Real Colyseus MatchMaker lifecycle в subprocess: SIGTERM→snapshot TTL/room+code keys→restart после задержки→те же руки/базар/turn1/version17/match; downtime не расходует оставшиеся20s.0settlement приshutdown,1приactual endRound послеrestore через synthetic fetch, повторныйshutdown не добавляет. Ordinary thirdprocessdisconnect удаляет обеsnapshotkeys+registry. Node25/22pass. Lifecycle+ownership+restore21/21Node22; fullserver291/298, те же7старыхfail; sourcecheckpass. s010-shutdown-before исключён (fixture принимал посторонний IPC message заready), s010-shutdown-final выявил registry connect race и теперьисправлен. Redis остановлен послеdrill. R29durableoutbox/abruptkill отдельно, это не гарантия сохранения приSIGKILL/потереRedis.

Для владельца: при штатном перезапуске сервера партия сохраняется; остановка не считается уходом игрока с поражением. Локально10/42, R25partial,31open. ПродолжаемR09.

### S011/R-09 — локальный объём завершён, SSV отложены

Без server entitlement весь rewarded_x2 закрыт authenticated403 до config/transaction; удалён код initial×2/upgrade. Статус rewardedAvailable=false/doubleClaimAvailable=false/canClaimfalse после normaldaily. Web/www не запускают ad provider без servercapability. Normal200/streak/date/idempotency сохранены; legacy claims не переписываются.

Новые expectations до128/134pass (6fail), после134/134Node25/22. Старые x2-grant tests заменены на запрет+неизменность wallet/claim/ledger, firstnormalпослеdenied,100rejected, keysplayer/date/retry — не удалены радиgreen. Initial TS futurefield attempt отдельноисключён. ClientVM4/4 предотвращаетпоказрекламы приfalse/missingcapability; sourcecheckpass. Real freshPG Node25/22 четыре×100requests (normal/directx2/upgrade/mixed), rejected0/100/100/50, итогeach200/1claim/1ledger. NoSQL/schema/deploy. Historical S004 x2upgrade contract намеренноsuperseded; егоnormal-lock/idempotency актуальны. Existing s004 scripts описывают historicalcontract; новыйguarded verify-unverified-daily.mjs —текущий.

Для владельца: лишние монеты за неподтверждённый просмотр больше не начисляются. Обычный ежедневный подарок работает. Удвоение выключено до настоящей серверной проверки рекламы; внешние SSV и положительный uniquead-event тест остаютсяотложенными.11/42локальныхобъёмов выполнены (R09сэтимограничением), R25partial. OwnPG покаработает дляS013 syntheticchecks.
