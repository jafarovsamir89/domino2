# Agent journal — текущее состояние

Обновлено18.10.2026. Пакет из трёх завершён: S006/R-03, S007/R-31, S008/R-32 закрыты локально.

## Миссия и ограничения

Исправлять42пункта docs/audit/REMEDIATION_PLAN.md, вести этот краткий журнал и append-only WORK_LOG.md. Игра развёрнута, около50пользователей. Локальные исправления разрешены; production deploy/migrations/real wallet edits/Play требуют прямого поручения. Никаких real.env/tokens в копиях/evidence. Новые Codex plugins согласовать, сейчас не нужны. Последнее правило пользователя: выполнять по3пункта за заход и после каждого отдельно объяснять простыми словами исправление/пользу.

## Git и готовность

Ветка fix/audit-foundation. S0019f1380a, S00230596eb, S0038c69090, S0043b5d3d7, S00546cc8c7 опубликованы. S006fd86a81 иS007a643f39 опубликованы. S008checkpoint subject: fix(rules): draw to a valid opening before activating 101. Проверить фактический git status/log перед продолжением. Локально закрыты8/42: R-06,R-05,R-07,R-02,R-08,R-03,R-31,R-32. R-25partial,33open. No deploy/PR/Play edits.

## Проверенные пакеты

- S001/R-06: root/server npm ci Node25/22pass без обновления старых locked versions. Main node_modules старый, использовать isolated copies. Server discovery был37files/243cases236pass7fail; original E2E30/39 иboundary1/1. Старые7/9 описаны evidence/session-001/FAILURES.md, не считать все fixture failures доказанными product bugs.
- S002/R-05: defaults только в Nest onModuleInit transaction, existing stakes/config/products/prices/timestamps не перезаписываются. Advisorylock1464091701,5.4concurrentinit/restart проверены реальным PG.
- S003/R-07: missing daily_login startup seed reward0/maxProgress1/daily; admin edits/inactive сохранены. Fresh migrations→daily200/repeat0/next300,0дополнительной выдачи. Existing disabled quest по-прежнему блокирует daily — политику не меняли.
- S004/R-02: daily lock1464091702/hashtext(playerId) до lookup; ReadCommitted,maxWait/timeout30s; unique ledger keys initial/upgrade, no schema edit. Unit132/132 Node25/22;4сценария100parallel дают200/400/400/400 и0errors, rollback/retry/legacy/dates проверены. R-09ad entitlement открыт.
- S005/R-08: исправлено имя опции во всех2server/4client+www calls. Behavioral33/33, Node22+rulesets40/40; full server269/276, те же7fail,38files discovery. VM исполняет полный DominoGame class без DOM constructor, реальные play/gosha/checkEnd. Browser/installedAPK animations отдельно не тестировались. Asset parity подтверждена.
- S006/R-03: exact room/table/match filter, roomlock1464091703, frozen stake/commission, fixed active participants, old reserve replay via ledger history, stable wallet order. Paid missing-match отвергается, existing null-match funds не приписываются новому матчу. No migration: current row reuse сохраняется, history в immutable ledger. API134/134 Node25/22, real PG10scenarios включая100reserve/30settle, nextmatch/replay/rollback/config/legacy. evidence/session-006/summary.json. Старые API не участвуют в lock/filter — будущий rollout заменить всеinstances, это не разрешение deploy.

## Локальный стенд

.tmp/remediation-s006/clean: актуальные root deps/API build без.env. .tmp/remediation-s007/clean: server deps иR-31fixture/tests. .tmp/remediation-s008/clean: актуальный сервер/R31/R32tests иserver deps, rootdepsнеставились. Own PG .tmp/remediation-s002/pg на127.0.0.1:55439 остановлен послеS006; role domino_remediation. DB имена domino_remediation_s006_before/after/final/node22 — synthetic used fixtures, не fresh. Старый auditPG такжеостановлен. Не останавливать чужие службы. Для unit REDIS_URI='' — отсутствующий Redis даёт вечные retries.

## Последний пакет и следующая точка

R-31 закрыт локально S007. Checkpoint subject: fix(rules): apply blocked 101 state once before settlement. Evidence session-007/summary.json. До0/3, после3/3; Node22+rulesets10/10; server272/279, те же7fail. Golden79+50=129/1final/1settlement, tiecarry14→17, team90+21=111 проверены. Реальный constructor/schema, сеть/денежныйI/O заменены spies. Применение blocked.matchState перед endDeal, guardinactive/finished от дубля. Историческая причина: server.advanceTurn вызывал classic101.resolveBlocked, но игнорировал возвращённый matchState перед endDeal. performPlay уже применяет roundEnd.matchState. Готовые tests в server/test/classic101-blocked-state.test.js; golden28tilefixture в server/test/fixtures/classic101-blocked.json, источник исторический full-match-audit.json. Исторический harness full-match-audit.cjs экспортирует makeRoom, но меняет global timers/random; не запускать записывающий audit main. Сохранить исторические evidence.

R-32 закрыт S008. startDeal вызывает existing drawToOpen до gameActive/schema/timer. Seed225:2draws,hands8/8,player1,tile3-3/index7,bazaar12.28unique tiles/schema/full_state/stage/snapshotrestore проверены, lastwinner/normal2/3/4team openings не меняются. Initial before4/5, after5/5; добавлены полные free matches2FFAseed225(267actions9deals,scores140/32) и4teamseed17(228actions9deals,105/85),1final/record. Final7/7, Node22+fish/rulesets17/17. Fullserver279/286, те же7старыхfail,40discovered files; sourcecheckpass. evidence/session-008/summary.json. Browser/installedAndroid animations не проверялись, local payload contract проверен.

Следующий пакет из3 предварительно R-01 (restore ownership), R-04 (shutdown snapshots), R-09 (server right for rewarded x2). Сначала прочитать соответствующие карточки; начатьR-01 с failing local identity regression. Это подготовленная очередь, код ещё не менялся. R-09dependsR02 выполнено, external SSV отложены — unverified path должен быть закрыт по карточке, не включать ad integration автоматически. R-27dependency upgrade остаётся P0 и требует отдельного совместимого triage. Не возобновлять полный аудит и не считать внешний доступ необходимым для локальных исправлений.

## Как продолжать

AGENTS.md → этот журнал → WORK_LOG.md → карточки. prepare-checkout копирует tracked/staged source без.env/deps/evidence; untracked tests явно копировать/stage. run-check sNNN-* требует matching .tmp/remediation-sNNN/NAME и сохраняет synthetic env/commands/logs. После изменения audit docs запускать validate-audit, обновить SHA256 manifest, verify-manifest. После каждого закрытого пункта журналы+focused commit+pushfeaturebranch; следующий заход выполнять по3пункта с понятным объяснением каждого.
