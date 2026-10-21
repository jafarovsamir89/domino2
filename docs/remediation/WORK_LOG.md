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

### S012/R-12 completed locally

Server runBotTurn now passes own hand + public handCounts/scores/bazaarCount/missingSuits. AI rejects raw hand/bazaar arrays; team estimates use public missing-suit observations, never partner/opponent tiles. Existing weights unchanged. Offline js/ai.js was outside this server takeover card and remains unchanged.

Before0/6 new regressions; after7/7 including contract rejection. Node22 with rulesets14/14, full server302/309 same seven original failures, source check pass. Boundary spies cover ordinary bot and takeover; paired worlds cover easy/medium/hard; changing public missing suits can change the move. Existing partner-friendly test now supplies public pass evidence and still requires a different team choice.

Benefit: server takeover bots no longer see other players tiles. Local task scopes12/42 including R09 disabled-path scope (external SSV deferred), R25 partial. Continue fifth item R42. Code checkpoint66f0962 pushed; this follow-up records the milestone after the first documentation writer failed decoding stdin.

### S013/R-42 completed locally; five-item batch finished

API adds receiptVersion1, room/match context, stable settlement/player ID, stakeAmount/returnedStake/winnings/net. Existing transfers, fee policy, payout compatibility and schema unchanged. Room forwards receipt metadata. Client records actual consumed stake as loss, profit as winnings, tracks returned/staked separately; IDs prevent duplicate results. Totals and IDs survive the local resume snapshot. Unknown owner/other room is ignored. Missing/legacy/malformed receipts do not invent losses or profit; incomplete totals are hidden. Both web/package assets synchronized.

Before: new API assertions6fail (134/140 pass), client0/16. After: API140/140 Node25/22; final client18/18 Node22 including actual Renderer class with minimal DOM, duplicate/cross-match/snapshot/invalid/owner/context tests; full server320/327. Exact seven old failure names match S008 in session-013/failure-delta.json, also comparing S009/S010/S012. Source check and asset parity pass.

Fresh real migrated PG on Node25 and22: actual EconomyService reserve/settle -> actual room economy helper -> actual DominoGame and Renderer for both assets, all players. Win/loss, draw/refund, 2v2, forfeit, 100% commission winner: receipt net equals wallet(balance+reserved) change and ledger delta and UI. The original stake200/profit180 case displays +180, loss -200, refund0. Twenty duplicate events per player/asset leave totals unchanged. API replay has no additional ledger writes. No production users or services accessed. Own PG stopped s013-pg-stop; own Redis was stopped after S010. Installed Android/visual browser not retested.

Plain benefit: returning your own stake no longer looks like a loss; the screen shows the actual profit/loss and repeated notifications cannot count it twice.

Batch S009-S013 handled R01/R04/R09/R12/R42. Four cards closed locally; R09 local unverified-path fix is complete while external verified-ad/SSV acceptance stays deferred. Accurate overall status:12 cards closed locally, R09 local safeguard complete/external acceptance pending, R25 partial,28 untouched open cards. Earlier counts11/12 "local scopes" included R09 disabled-path work and must not be read as full ad integration. No production/Play deployment, migrations or live wallet edits. New checkpoint subject: fix(ui): reconcile coin totals with per-player settlement receipts.

## Eight-item batch S014-S021

User requests8 items per turn. Start clean92fe188,12locallyclosed/R09externalpending/R25partial/28open. Selected R27(dependency triage),R11(public presence),R39(health),R41(forward migrations),R16(stale async turn),R17(phase recovery),R40(solo pause),R19(audio controls), in dependency order for client trio. No production/Play edits. ADB currently has no devices; optional request sent to reconnect, continue independent local work. S014 fresh copy/root ci and audit collected.

### S015/R-11 completed locally

Public game/platform summaries redact session/user/private room codes; public discovery cannot opt into closed rooms. Authenticated owners can inspect their own room code; legacy clients with an unlisted session retain only the minimal room-id resume probe. Private code reverse lookup requires membership. Client headers updated, admin keys no longer depend on sessions. Initial API attempt reused only root dependencies and selected TS6 instead of nested TS5; rerun uses the complete unchanged S013 dependency layout.

Checks: {"apiNode25And22":{"pass":142,"fail":0},"presenceAndRooms":"s015-presence-verified.json","http":"s015-http-final.json","fullServer":"s015-server-full.json"}. Benefit: Lists no longer expose closed room codes or game session identifiers; own resume and public room discovery remain available.

### S016/R-39 completed locally

Liveness/readiness bypass application Redis rate limiter. Readiness requires PING,750ms deadline, shared in-flight probe prevents queue growth. Real owned Redis pause: liveness under500ms, readiness503 under1000ms, recovery200 and exact room/snapshot preserved on Node25/22. Own Redis stopped. Initial recovery fixture was corrected to await completion of its released PING before probing recovery.

Checks: {"unit":"s016-health-verified.json","node22":"s016-node22.json","redis":"s016-real-redis-health.json","redisNode22":"s016-redis-node22.json","fullServer":"s016-server-full.json"}. Benefit: A Redis interruption no longer makes the running game server appear dead; readiness reports the actual problem and recovers.

### S017/R41 completed locally

Additive transactional migration19 adds DM clientMessageId, thread/fcm tables, missing enum/indexes/FKs. Backfills legacy threads, latest message (timestamp+ID tie break), unread counts. Existing four indexes are declared in schema rather than dropped. Fresh and populated18->19 upgrades on Node25/22 preserve history and wallets, read/send/read-state/retry and local FCM CRUD pass; repeated deploy is no-op and drift0. Initial schema edit put indexes on the wrong model; corrected before final fresh/upgrade checks. Exploratory drift DB is used; final and node22 DBs are independent fresh proofs. No production migration.

Benefit: a fresh or upgraded database supports messaging instead of returning missing-column/table errors; existing conversations are retained. API142/142; PostgreSQL14 fresh+upgrade on Node25/22, drift0. FCM test is local CRUD only, no external notifications. Migration uses BEGIN/COMMIT; migration history1-18 unchanged. Prisma current docs were consulted via Context7 but v8 examples were not applied to this pinned6 CLI.

### S018/R16 completed locally

Async local turns carry owner/generation/cycle/board/hands/player context. Tile travel and 101 draw continuations recheck ownership after awaits; stale success/rejection/RAF callbacks cannot change new scores, turn or lock. Timer reset invalidates work; DOM/Konva animations cancel and settle once, including Konva destroy. Source/www kept identical. Before2/6 pass (four real stale failures); final14 new tests + instant rules33 pass on Node25, new14 Node22. Full server332/339 before two additional cancellation tests, same seven original failures. Initial six failures without VM timer globals were harness-only and excluded.

Benefit: an animation or draw from an old deal cannot add points or unlock input in the replacement deal. Phone is connected again; separate audit package only for later pause/audio checks.

### S019/R17 completed locally

Watchdog now diagnoses phase and keeps online locks until authoritative sync. Local committed tile has once-only settlement continuation, independent of animation completion; drawing cancels old loop and recomputes from current hand; advance/reveal timers have owned resumable phases. Pre-result awaits and finalizers cannot clear a replacement phase. Unknown phases remain locked with diagnostics rather than guessed progress. Before0/8, final16new tests + R16(14) + instant(33)=63pass Node22; full355/362 with same original7, source check pass.

Benefit: a slow/lost animation can finish the already committed move once; a network client requests server state instead of allowing a second local move. Stale result-stage finally was also fixed as part of the shared phase lifecycle.

### S020/R40 completed locally

Local timer descriptors preserve exact remaining turn/stage/bot delays; pause settles a committed placement/result once before saving. Input, watchdog and async guards respect pause. Resume arms one timer; restored snapshot reconstructs the remaining phase. Online does not pause. New8pause tests pass; combined69previous lifecycle/rules tests Node25/22; source check pass. Actual Android audit WebView60.5s unchanged board/hands/bazaar/score/turn,20UIcycles one timer, force-stop restored exact persisted state and remaining turn. Important limit: after an immediate force-stop WebView retained a previous write462ms older; final persisted-state drill waits1200ms, so instantaneous-write durability is NOT claimed. Earlier PID/start/menu-reset/preview-expiry harness attempts excluded and retained in summary.

Benefit: solo menu really pauses the game; bots cannot win while the player reads the menu. Separate audit package only, Play app untouched. Six of eight batch items now complete; R27/R19 checks remain.

### S021/R19 local controls complete; external focus acceptance pending

Shared settings master/music/effects (legacy mute migration), effects gain bus, pre-node/delayed SFX gate, HTMLAudio pause/resume, browser lifecycle and native Activity bridge; AZ/RU/EN accessible labelled sliders/outputs. New tests before0/8, final10/10 Node25/22; actual Android audit package muted score/place/win creates0oscillators,23%music/37%effects/master survive force-stop after1200ms storage settle. HOME actual visibility stays visible but native foreground=false pauses media and blocks SFX; returning resumes and score produces3nodes. Explicit audit Activity deep-link return stays in localhost app. Screenshot visually checked. Native build passes on patched Capacitor.

Device found window.Capacitor.registerPlugin absent; use legacy Plugins bridge too, now unit-covered. An initial extra AudioManager focus owner competed with Chromium and prevented resume; it was removed before final build. Final bridge only forwards Activity lifecycle and does not claim incoming-call/Bluetooth/external-focus handling; R19 remains not fully accepted. Browser autoplay warning preserved after full E2E exposed two tests relying on it; rerun in progress. Benefit: mute really mutes effects/music, independent levels persist, background no longer keeps music running on this phone.

### S014/R27 completed locally; eight-item batch finished

Compatible dependency refresh: Capacitor8.5.3, Better Auth/adapters/telemetry1.7.10, Next15.5.28, proxy-addr2.0.8,tar7.5.22 and workspace/server transitives; raised manifest minima, separate matching lockfiles. Root audit critical5->0/high21->4/total36->8, server critical/high0,total8. Residual Prisma config/deepmerge-ts and Next/PostCSS build-input boundaries plus optional server OAuth/tooling warnings classified in session014/DEPENDENCIES.md; no forced major override/downgrade.

Fresh Node22root/server ci, API142/142, adminbuild, sourcegate, OAuth/navigation4/4, native sync + final155task Android build pass. Patched .audit package exercised on real Android through localhost; app native return explicitly targets test Activity. Actual external provider authorization/signing/release remains deferred. Full Node25server373/380 before4extra regressions; finalNode22server377/384, exact historical7; focused extra tests pass both runtimes. Final E2E31/40, exact historical9, no new failures. Initial missing browser attempt excluded; matching ordinary Chromium downloaded. Two interim E2E failures required preserving old autoplay warning; restored it, final full suite matches baseline without changing assertions. Last UI-only language-state sync checked on phone inAZ/RU/EN; sourcegate and10audio tests pass.

Cleanup: audit app stopped, owned ADB forwards9224/9225/9226 and reverse4175 removed, ownPG55439 and preview4175 stopped; Redis already stopped. Play app/data, production and wallets untouched. Pause capture duration clarified:60500ms continuous pause, original observedPauseMs also included resume cycles/restart; script now names scenarioElapsedMs separately.

All8selected scopes handled:7cards closed locally (R27,R11,R39,R41,R16,R17,R40), R19 local controls/lifecycle complete with external call/Bluetooth/audio-focus acceptance pending. Accurate overall19/42closed; R09/R19/R25have remaining scope,20other cards open. No all-green CI, production readiness or full42completion claimed. Benefit: patched shipped runtime/working local auth-navigation contracts, protected presence, resilient health, reproducible social schema, safer turns/recovery, real pause and reliable local sound controls. Next first card R29 response-loss/outbox regression; keep batch8. Final checkpoint includes all code/logs/batch handoff and is pushed to fix/audit-foundation.

## Two-item batch S022-S023 started

Latest user instruction is two more items (overrides previous batch8). Clean HEAD21df7ed; selected R13 real Canvas quality and R14 persistent effects, coherent local Android graphics scope. R29 remains the next financial reliability card; no partial outbox/auth implementation made. Read both contracts and historical perf limits before edits. Device2201117SG authorized, preserve Play app; use .audit plus guarded local preview. Reuse unchanged verified S014/final dependencies in isolated copies (no lock updates). Record separate animation/blur/shadow A/B and measured limits; do not equate rAF with GPU presentation or promise60FPS.

### S022/R13 completed locally

Actual sceneCanvas quality uses mobile cap1.25/desktop2; hitCanvas stays1. No global Konva pixelRatio mutation. Canvas resize invalidates cached signature and redraws; DPR media/resize/device-pixel-box observers removed on teardown. Actual Konva browser tests4DPRprofiles x web/www x5/10/20/28tiles, size/DPR changes, pixel readback and coordinate tap pass8/8 Node25/22. Observer/cancellation16pass. Physical Android portrait/landscape/return ratios1.25, buffer491x748 portrait, hit1, coordinate error<1px, native taps pass; three clarity captures visually reviewed.

True baseline4/8pass: highDPRscene buffers ignored intended caps. Initial harness intro-animation/readback/CDP-event expectations fixed without weakening buffer/coordinate assertions; details in summary. Pixel readback after2rAF catches a blank canvas if DPR changes while board signature is unchanged. Device rotation settings restored. Benefit: mobile board no longer allocates the oversized scene buffer; pips stay readable and placement markers stay aligned. Overall20/42closed locally; R14 remains this batch second item. Preview4175 still owned/running for R14; no other services started.

### S023/R14 completed locally; two-item batch finished

Removed infinite tileGlow/activeTurnPulse/arrowPulse shadow repaint; static gold outlined move/turn cues. Permanent hand/header/DOM arrow blur disabled, Konva marker big shadow/inline filter removed;2finite opacity fades and reduced-motion support. No rules/economy/auth/dependency/native-package changes. Web/www parity.

Device diagnostic:3randomized blocks x8s per variant, fixed scene1.25 ratio. First ab shadow_only also removed filter, so not pure attribution. Added3x pure box-shadow-only/filter-only/baseline: median rAF21.04base/53.78shadow-off/19.93filter-off, temperature38.2-38.3C. Animation-only and blur-only captured separately in original15window series. Then continuous-travel product A/B,3pairs alternate order,39.3-39.5C: native presentations23.44->50.85/s, rAF23.61->54.08/s, median p95FrameTimeline duration130.89->17.11ms (allnew17.11-17.19), jankflags551/551old vs5/1211new. Native/rAFintervalp95still33ms, stable60FPS NOT achieved/claimed. System FrameTimeline collected using official Perfetto58.2 normal developer-tool cache (not a Codex plugin); no upload. Raw system traces stay.tmp; six audit-only numeric CSV, hashes/method andJSON captured for review.

Native screenshot reviewed and coordinate marker tap after finite fade passes; synthetic renderer fixture28board+7duplicatehand tiles is not a35tile rules game. New12browser checks Node25/22 pass, reduced-motion and hints preserved. Full server379/386 same7; E2E43/52 same9, exact failure delta. Initial test-fixture/port-conflict/post-marker callback/Perfetto-format attempts excluded, no assertions weakened. Sourcecheck/parity passed. No API changes; last API142baseline remains historical, not rerun this UI batch.

Cleanup: own preview4175 stopped, audit package only force-stopped, owned forward9227-9230/reverse4175 removed, own probe/tracefiles removed fromphone; R13rotationrestored0/0. Play app/data and production unchanged. R13checkpoint58d3ede pushed; R14final checkpoint subject fix(ui): reduce persistent game effects with Android frame evidence.

Benefit in plain language: graphics buffer now respects the intended quality; unnecessary pulsing/shadows no longer force expensive repainting while move/turn hints remain visible. Both selected local cards closed, overall21/42closed; R09/R19/R25remaining scopes,18other cards open. User latest batch size2, not8. Next first cardR29 remains response-loss/outbox; do not deploy these local changes without direct instruction.

## Two-item batch S024-S025 started (2026-10-19)

User requests two more cards. Clean pushed HEADeb8b21e,21/42locallyclosed. Selected R29/S024 durable settlement outbox and R15/S025 bounded startup (independent local card, R10 remains next auth candidate). No production/Play changes authorized/performed. R29 design starts with persisted immutable intent before HTTP, restart reconciliation independent of room/player-token expiry, exact match idempotency from R03; fail-closed storage and duplicate/rejected responses need tests. Disk survival requires persistent volume; record operational requirement explicitly. R15 will use actual critical-UI readiness rather than window.load/minimum5.5s, bounded recoverable error/offline UI and same-phone cold/warm measurements. No plugins/agents.

### S024/R29 completed locally

Persist exact monetary result before network: immutable intent fsync+atomic hard-link+directory fsync, no persisted bearer. Ack requires HTTP success and ok:true, separately fsynced receipt; rejected/corrupt/conflicting records stay pending. Singleton worker starts with actual server, bounded5s HTTP/32record cyclic passes, independent of room/token expiry via dedicated signed economy.reconcile scope; ordinary endpoint token checks retained. Room retry captures stake key, late success/failure cannot clear a replacement match, dispose clears its retry timer. Production requires explicit absolute persistent-volume path, documented in README/OUTBOX_OPERATIONS. No deploy config or production changed.

Baseline real HTTP+SIGKILL had0durable intents and failed; after intent survives. Fresh real PostgreSQL on Node25/22: kill before commit, commit with response loss, real5s timeout then kill; each restores winner1180/loser800/reserved0 from1000each/stake200.20duplicates don't add ledger credit; oldA cannot touch newB reserves. Actual server/index.js startup with zero rooms restores all3cases on Node22; no bearer provided for replay. API148/146 both runtimes,47focused Node22, full390/397 exactly previous7failures. Extra interim failure was persistent test receipt reuse, fixed with ephemeral per-test directories without assertion changes. First PG fixture omitted platform provider; initial Node22 PG overlapped dist rebuild; excluded, sequential fresh final runs pass.

Limits: persistent local volume must survive replacement; no physical-volume-loss/kill-before-calculation guarantee, no automatic retention purge, monitor pending/capacity. Initial full UI receipt/independent match-stat delivery are not guaranteed by monetary outbox.22/42closed locally. S025/R15 continues; user explicitly defers physical phone, so retain Android cold/warm acceptance pending. Benefit: a computed cash result survives process/API interruptions and duplicate delivery does not pay twice. Checkpoint subject fix(economy): persist settlement intents and reconcile after restart.

### S025/R15 code and browser verification complete; physical acceptance deferred

Removed minimum5.5s, session-marker skip and window.load dependency. Critical controls+account readiness release splash next frame; account HTTP/body abort6s, critical module/load failure shows8s recoverable retry (JS event-loop timer, not a cure for blocking JS). Offline/retry AZ/RU/EN uses actual domino-lang; cached-auth policy unchanged. Initial notice overlaid320px legal copy, corrected to start-shell flow, bounding boxes + final screenshots reviewed. Retry reload can recover a refused module or failed account request. No false server-recovered declaration on online event alone.

New10browser cases Node22 pass; Node25 all10pass inside full53/62 E2E. Server390/397 and browser failures exactly previous7/9; session025/failure-delta.json. Source and byte parity pass. Baseline cold-only uses immutableeb8b21e; earlier full-baseline/copy overlap and4173collision excluded. Missing-module fixture originally missed ?version suffix; fixed routepattern, assertions unchanged, final real refusal/recovery+stalled-module deadline pass. Metrics3pairs synthetic Chromium390x844: median verified menu after DOM removal6.35s->0.15s cold,0.117s->0.113s warm. This upper-bound probe waits splash DOM removal (old CSS released pointer-events earlier); not earliest-input or Android timing. No universal speed claim.

ADB empty; user explicitly chose continue without phone. Same-device Android cold/warm/offline interactive acceptance NOT performed, R15 not fully closed. R29 locally closed checkpoint85b10a5; total22/42closed, R09/R15/R19/R25remaining scopes,16other open. All selected code changes complete. No production/Play/native/schema/lock/plugin changes. Own PG55439 stopped, ephemeral previews/workers exited, user4174retained. Next candidateR10; do not deploy without direct instruction and persistent-volume/API-first preparation. Final checkpoint subject fix(startup): replace splash delay with bounded readiness and retry.


### Portable Git handoff (2026-10-19)

User requests commit/push so another computer/agent can resume. Initial checkout clean, local HEAD f6a395e equals remote fix/audit-foundation; code checkpoints85b10a5/f6a395e already pushed. Added CONTINUE_ON_NEW_COMPUTER.md with clone/update commands, reading order, exact status/checks, next R10 candidate, deferred Android acceptance, synthetic isolated dependency setup, old Mac cache/path limits and production outbox prerequisite. Agent journal now names the actual pushed startup hash and distinguishes original-machine caches from portable setup. No new implementation or deployment.

Correction to S024 prose above: API148/146 was a documentation typo; final result is148/148 on both Node22/25, as the committed logs and summary show. Historical WORK_LOG text retained; active plan corrected. Documentation links/JSON, audit manifest and git diff checked; product tests need not repeat for this documentation-only handoff.

## S026 — 2026-10-19 — R-10 и R-18, локально частично

Поручение пользователя: продолжить и выполнить ещё два пункта. Перед началом checkout чистый, `fix/audit-foundation` совпадал с origin на `f7409bb`. Взяты следующие независимые P1-карточки R-10 и R-18. Production и Google Play не менялись.

**R-10:** оба пути выдачи game token теперь используют TTL5минут вместо12часов. API `POST /api/platform/game-token/validate` проверяет подпись/срок, живую сессию, соответствие player и user, активный ban. `server/DominoRoom.js` вызывает API при входе/reconnect с deadline3с; timeout/ошибка API запрещает новый допуск fail-closed. Проверки нет на каждом ходе. Уже сидящий в комнате игрок автоматически не отключается после logout/ban/delete; решение об активном матче осталось открытым, поэтому карточка частичная, не закрытая. Нужен выпуск API до game server: старая версия API не знает validation endpoint.

**R-18:** `VOICE_ICE_SERVERS_JSON` принимает строковый STUN, строки в `urls` и прежние массивы; не-ICE схемы отбрасываются. Клиентская нормализация одинаково принимает строку/массив; `js/voice.js` и `www/js/voice.js` синхронизированы. Android разрешает микрофон только origin `https://localhost` или `https://gamed.simplesoft.az`; после Android prompt разрешение выдаётся лишь при неизменном доверенном origin; pending-запрос отклоняется при уничтожении Activity. Wi-Fi/LTE, relay-only и реальный permission UI не проверены, R-18 частичен.

**Проверка:** `npm run check` pass; `node --check server/index.js` и `server/DominoRoom.js` pass; из `apps/api`: `./node_modules/.bin/tsc -p tsconfig.json --noEmit` pass; `git diff --check` pass. Android compile через `bash gradlew :app:compileDebugJavaWithJavac` остановился на `invalid source release: 21`: доступен только Temurin JDK17. Прямой `./gradlew` также не запускается без executable bit; через `bash` Gradle выполнился и выявил несовпадение JDK. Функциональные тесты не запускались. Детали: `evidence/session-026/SECURITY_REALTIME_RESULTS.md`, сводка `summary.json`.

Для владельца: новый вход проверяет, действует ли аккаунт и не заблокирован ли игрок; STUN-адрес теперь доходит до WebRTC, а посторонняя страница не получает разрешение микрофона. Текущая партия автоматически не прерывается, и мобильная связь через разные сети ещё не проверена.

**Следующий шаг:** получить локальный JDK21 и собрать Android debug; затем проверить валидную/отозванную/истёкшую/заблокированную/удалённую сессию на API/game-server boundary в синтетической среде, без production. До закрытия R-10 отдельно принять поведение уже начатого матча. Проверить Android mic allow/deny и NAT/TURN при наличии устройства/двух сетей. Общий статус остаётся22/42 полностью закрытых; R-10/R-18 добавили локальные изменения, но не засчитываются как завершённые карточки.
# S027 — 2026-10-19 — R-21 и R-23, локальная доработка

Поручение пользователя: продолжить и выполнить ещё два пункта. Ветка `fix/audit-foundation`, перед началом чистый HEAD `15a265c`. Выбраны независимые UI пункты запроса удаления аккаунта и доступности руки. Production/Play не трогались.

**R-21:** в account profile появилась ссылка на `delete-account.html#request`. Страница объясняет проверку владельца и предлагает mailto-кнопку с темой и заготовкой запроса. Текст предупреждает, что email не удаляет аккаунт автоматически. Backend удаления не добавлялся; владелец должен подтвердить фактический mailbox workflow, retention/deletion policy и сверить URL/disclosures с Play Console/Data Safety. Статус частичный.

**R-23:** рука рендерится семью именованными кнопками, локализованными на AZ/EN/RU, с номером, значениями и доступностью хода. Делегированный click принимает pointer и клавиатурный click. Touch-area 44×66 CSS px; мобильный ряд не масштабируется, при необходимости прокручивается. Неоднозначный выбор стороны теперь доступен через именованные DOM-кнопки и поверх Konva: начальный фокус, видимый контур, Enter/Space, Escape и возврат фокуса. Статус частичный до проверки на 320px/TalkBack.

**Проверка:** `npm run check`, `node --check js/renderer.js`, `node --check js/translations.js`, `git diff --check` прошли. Шесть root/www пар совпадают побайтно. Продуктовые тесты, браузер и Android/TalkBack не запускались. Полный отчёт: `evidence/session-027/ACCESSIBILITY_DELETION_RESULTS.md`; summary — `summary.json`.

Для пользователя: теперь можно найти, как попросить удалить аккаунт, а игру можно выбирать с клавиатуры/экранного диктора. Запрос пока отправляется вручную по email, и речь TalkBack нужно проверить на телефоне. Общий статус остаётся 22/42 полностью закрытыми; R21/R23 пока не добавлены к числу завершённых.
# S028 — 2026-10-19 — R-20 и R-22, локальная доработка

Поручение пользователя: продолжить и сделать ещё два пункта. Ветка `fix/audit-foundation`, перед началом чистый HEAD `3828192`. Выбраны бесплатная solo без обязательного аккаунта и целевые пробелы AZ/RU/EN локализации. Production/Play не менялись.

**R-20:** на гостевой стартовой странице теперь остаётся кнопка бесплатной solo и краткая AZ/RU/EN подсказка. Online/coin/магазинные действия остаются скрытыми; обработчик solo пропускает auth только для `free`, проверка для других режимов сохранена. Старт solo без зарегистрированного профиля не дёргает повторный profile refresh, prepare stake разрешает бесплатный режим без токена, а гостевой local solo больше не публикует local-presence heartbeat. Подлинность online всё ещё требует аккаунт. Статус частичный: startup account readiness пока остаётся предварительным условием; browser/Android/E2E не проверены.

**R-22:** добавлены локальные подписи AZ/RU/EN для возврата в игру, гостевой free-solo поясняющей строки, 12 placeholder gift names, rarity common/rare/epic, inventory quantity/empty state/shop controls. Исправлена подпись RU количества ботов; AZ — `Botların sayı`. Raw API gift key/name/rarity больше не видны на целевых UI карточках; outgoing note/event остаётся canonical. Полный language sweep, long-label/plural review и TR native-speaker pilot остаются открытыми.

**Проверка:** `npm run check`, `node --check js/app.js`, `node --check js/translations.js`, статическая проверка ключей AZ/EN/RU и `git diff --check` прошли. Root/www парность проверена после копирования. Продуктовые/E2E тесты, живой браузер и Android не запускались. Полный отчёт: `evidence/session-028/LOCAL_SOLO_LOCALIZATION_RESULTS.md`, summary: `summary.json`.

Для владельца: теперь можно запустить бесплатную игру с ботами без регистрации, при этом онлайн и монетные действия не открываются гостю. В разделе подарков вместо технических английских слов появились переводы. На экране входа по-прежнему выполняется стартовая проверка аккаунта; игру на телефоне и перевод человеком ещё не проверяли. Общий статус остаётся 22/42 закрытыми полностью; R20/R22 пока частичные.

## S030 — 2026-10-19 — regression coverage R-10 и R-18

Поручение пользователя продолжить по два пункта. Укреплена приёмка двух уже частично исправленных карточек — допуска по игровому токену и voice ICE-конфигурации. Production и опубликованный Play APK не использовались.

**R-10:** в `apps/api/test/auth.service.test.ts` добавлен тест `validateGameToken`: пропускается только подписанный токен с незавершённой сессией, совпадающими user/player и отсутствием активного бана. Проверяются expired token (и отсутствие DB lookups), missing/expired session, неверный владелец session, удалённый/чужой player и активный ban. Colyseus join boundary и политика уже начатого матча всё ещё не тестировались/не выбраны; карта частичная.

**R-18:** логика построения серверной ICE-конфигурации перенесена без изменения поведения из `server/index.js` в `server/voice-config.js`, чтобы проверять её без запуска сервера. Добавлены случаи строк/legacy-массивов, STUN/STUNS/TURN/TURNS, credentials, запрет иных URL-схем, deduplication, ошибочный JSON, transport policy и границы candidate pool. В коде Android и выдаче микрофона в этом пакете изменений нет; permission prompt не вызывался.

**Проверка:** `npm run check`; `node --test server/test/voice-safety.test.js` — 4/4; `tsc -p apps/api/tsconfig.json`; `node --test apps/api/dist/test/auth.service.test.js` — 6/6; changed JS syntax и `git diff --check` — всё pass. Android build невозможен на установленном JDK17 при требуемом проектом Java21. Реальные Wi-Fi/LTE/TURN и mic UI не проверялись. Полные результаты — `evidence/session-030/SECURITY_VOICE_REGRESSION_RESULTS.md` и `summary.json`.

Для владельца: проверка входа теперь защищена отдельными тестами на истёкший, отозванный, заблокированный и неверно привязанный доступ. Настройки голосового соединения тоже проверяются без поднятия реального сервера. Это предотвращает возврат уже найденных ошибок; подключение телефона к голосовой партии и правила завершения текущей игры ещё нужно принять отдельно. Общий статус 22/42; R-10/R-18 остаются частичными.
# S029 — 2026-10-19 — Android-приёмка R-23 (частично)

Телефон снова доступен по ADB. Проверка выполнена на Xiaomi 2201117SG (Android 13, Chrome 155.0.8059.84), но не в установленном приложении: текущий tracked web source открыт в Chrome через изолированный localhost preview. Ответы API синтетические; CSP и ADB reverse ограничивали соединения `127.0.0.1:4175`. Production и Play package не затрагивались.

На обычной ширине телефона 393 CSS px видны семь костяшек. При временном размере 880x2400 и исходной плотности 440 dpi (320 CSS px) костяшки сохраняют минимальный размер 44x66 CSS px, ряд не ужимается, а свайп по нему показывает крайнюю правую костяшку. Снимки и ограничения — `evidence/session-029/ANDROID_ACCESSIBILITY_RESULTS.md`.

TalkBack включили на время попытки проверки; Android показал первичное обучение и системный запрос, поэтому диктовку и фокус отдельных костяшек принять не удалось. TalkBack, touch exploration и размер экрана возвращены в исходное состояние; временные ADB mappings удалены, локальный preview остановлен. R-23 остаётся частичным. Всего полностью закрыто 22/42 карточки.

# S031 — 2026-10-19 — Android TalkBack R-23 fixed and accepted locally

**Что нашли:** в Android Chrome системная accessibility hierarchy превращала tile buttons с `aria-pressed` в `ToggleButton` и теряла их `aria-label`. До исправления семь плиток были focusable, но без имени; TalkBack не мог сообщить номер/значения и доступность хода.

**Что изменили:** `Renderer.renderHand()` добавляет к каждой костяшке тот же локализованный текст как visually hidden child; сохраняются `aria-label`, `aria-disabled`, `aria-pressed` и размер hit area. Повторена пара root/www копий. На Xiaomi 2201117SG / Android 13 / Chrome с TalkBack enabled системное дерево теперь выдаёт 7 отдельных узлов с полным текстом и state. Нативный node для первой костяшки был `focused=true` и имел имя. Реальный `showArrowChoices()` с синтетическим выбором двух краёв дал две подписанные Android-кнопки; первый край получил фокус. Снимок с фокусом и native hierarchy в `evidence/session-031/`. Предыдущая реальная проверка 320 CSS px и горизонтального swipe на том же телефоне в S029.

**Проверки:** `npm run check`, `node --check js/renderer.js`, `git diff --check`, byte parity `js/renderer.js`/`www/js/renderer.js` и `css/style.css`/`www/css/style.css` — pass. Синтетическая game screen; ни production, ни Play app, ни пользовательские данные не затрагивались. TalkBack был включён только для этой проверки; вернул `enabled_accessibility_services=null`, `accessibility_enabled=0`, `touch_exploration_enabled=0`; вернул display size1080×2400, снял ADB mappings, закрыл созданную вкладку, остановил localhost preview. Native WebView/Play acceptance не заявляется; audio recording TalkBack не делался.

**Пользе простыми словами:** экранный диктор теперь может назвать каждую костяшку и сказать, можно ли её поставить; если подходит любой из двух краёв, оба направления имеют понятные названия и фокус. На узком телефоне костяшки не уменьшаются, а пролистываются.

R-23 закрыта локально по согласованным критериям Android Chrome; общий счёт **23/42**. Следом — полная локальная приёмка R-20, затем синтетическая граница R-10. Глобальные тесты не повторялись, поскольку изменился только renderer/CSS; source checks и реальная device hierarchy были целевыми. Результаты и ограничения: `evidence/session-031/ANDROID_TALKBACK_RESULTS.md`, `summary.json`.

# S032 — 2026-10-19 — R-20: гостевая solo до окончания auth

**Что изменили:** заставка больше не ждёт account request; после готовности UI открывается гостевой безопасный стартовый экран, а профиль проверяется в фоне. При ожидании и для подтверждённого гостя доступны free solo и короткое объяснение; online и магазин монет закрыты. Принудительно отправленный обработчик coin shop тоже не открывает магазин. `requireRegisteredAccount()` возвращает отказ гостю. Auth timeout остаётся 6с, а network notice/retry добавляется и после снятия splash, если ответ потерялся. API-проверки нельзя использовать как основание доступа к локальной партии.

**Проверка:** Chromium e2e для обеих копий сайта прошёл12/12: cold/warm startup, offline/retry, hung auth, guest solo до ответа синтетического auth через4с, скрытые/заблокированные online/coins, отсутствие heartbeat/economy/match-history запросов во время локального старта, отсутствие critical module/recovery регрессии. `npm run check`, `node --check js/app.js`, `js/splash.js`, `e2e/startup.spec.mjs` прошли. Root/www app и splash синхронны. Выход Playwright — 12 passed/58.2s на Node25.

**Пользе простыми словами:** человеку больше не нужно ждать вход, чтобы сыграть бесплатную партию с ботами. Пока сервер проверяет аккаунт или недоступен, игра остаётся локальной; онлайн и монеты не открываются.

R-20 закрыта локально по browser acceptance, общий счёт **24/42**. R-15 остаётся открытой: физические cold/warm/offline метрики на Android не сняты. Обновлены `js/app.js`, `js/splash.js`, `e2e/startup.spec.mjs` и их `www/` копии. Доказательства: `evidence/session-032/GUEST_BEFORE_AUTH_RESULTS.md`, `summary.json`. Нет production/Play deploy и пользовательских данных.

## S033 — 2026-10-19 — Colyseus reconnect boundary R-10

В Colyseus regular join вызывает `onAuth`, но reconnect-token path вызывает `onReconnect`. До S033 `DominoRoom` не имел такого hook, поэтому восстановление отсоединённого места могло миновать актуальную проверку платформенной сессии. Вынесена общая `validatePlatformGameToken`, добавлена `onReconnect`: сверяются подпись/срок токена и user/player с сохранённой identity, затем API подтверждает сессию и блокировку. 401/invalid deny, API errors fail closed503, timeout3s. Запросы на каждый ход нет.

`server/test/platform-game-auth.test.js` —14/14 pass: валидный вход и reconnect, expired/revoked/mismatch, API5xx/timeout, missing saved identity. `npm run check`, JS syntax и `git diff --check` pass. Смежный `disconnect-grace.test.js` имеет4 failures в fixture/forfeit expectations; отчёт их перечисляет, suite не считается зелёной.

Snapshot sanitization намеренно не сохраняет bearer token. Поэтому restart reconnect без нового механизма identity recovery закрывается fail-closed и переходит в существующий reconnect timeout. Уже подключённый пользователь не отключается сразу по logout/ban/delete. Эти политики/SLA не определены, поэтому R-10 остаётся partial, счёт24/42. Синтетика only; production/Play не использовались. Подробности — `evidence/session-033/PLATFORM_GAME_RECONNECT_RESULTS.md`.

Для владельца: теперь истёкшая или отозванная учётная запись не может вернуться в комнату по старой ссылке восстановления. Уже начатую партию сервер не обрывает; это правило нужно решить отдельно, чтобы не портить игру посреди матча.

## S034 — 2026-10-19 — Android voice build R-18

Проверена Android-сборка на подключённом телефоне, без установки APK. Сначала выявлен compile blocker: проектный Capacitor требует Java21; Java17 не поддерживала `--release 21`. Для локальной сборки загружен официальный Temurin21 в ignored `.tmp`; системная Java не менялась. При повторной сборке выявлено и исправлено несоответствие override: `MainActivity.onDestroy()` был `protected`, базовый `BridgeActivity` — `public`. После исправления `:app:assembleDebug` проходит. Debug APK имеет тот же application ID, поэтому его не ставили поверх Play app.

Голосовое разрешение, trusted/untrusted WebView origins и Wi-Fi/LTE/TURN не тестировались. R-18 partial, общий счёт24/42. Локальная сборка не обращалась к production. Результаты: `evidence/session-034/ANDROID_VOICE_BUILD_RESULTS.md`.

Для владельца: поправили ошибку, из-за которой Android приложение не собиралось. APK теперь собирается; проверка микрофона и реального голоса ещё нужна.

# S035 — 2026-10-20 — Server reconnect and timeout regressions

Полный `npm --prefix server test` завершился **413/413 pass**, без пропусков; четыре затронутых suite отдельно проходят **37/37**. `npm run check` тоже прошёл. Discovery выявил реальный дефект: после reconnect-timeout forfeiture строка live presence оставалась в базе; финализация теперь удаляет её. Также устранена гонка: `startRound()` сбрасывал публичное timeout-состояние до завершения async `timeout_continue`, после чего повторный запрос мог обойти guard. Временный snapshot и in-flight guard живут до `finally`, а после завершения проверяются очистка и повторный запрос.

Два остальных падения были устаревшими статическими ожиданиями расположения метода/payload и условия открытия комнаты; обновлены точные контракты. Остальные три сбоя reconnect suite были неточными fixture: теперь сценарии включают реального подключённого соперника и нужные settlement/schema dependencies. Поведенческие assertions не удалялись.

**Пользе простыми словами:** сервер больше не показывает выбывшего отключённого игрока как находящегося в сети и не запускает следующий раунд второй раз из-за повторного сообщения. Тесты сервера теперь проходят целиком. R-25 всё ещё частична: исторический E2E 53/62 с девятью старыми падениями и CI gate остаются открыты; общий счёт **24/42**.

Проверки: `npm --prefix server test` 413/413; четыре целевых файла 37/37; `npm run check` pass. ADB отсутствует, тесты выполнены локально; production/Play не затронуты. Полные детали — `evidence/session-035/TEST_MATRIX_RESULTS.md`, `summary.json`.
