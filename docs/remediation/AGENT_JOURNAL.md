# Agent journal — текущее состояние

Обновлено18.10.2026. Текущий пакет из5: S009/R01 закрыт локально; далее S010/R04, S011/R09, S012/R12, S013/R42.

## Миссия и ограничения

Исправлять42пункта docs/audit/REMEDIATION_PLAN.md, вести этот краткий журнал и append-only WORK_LOG.md. Игра развёрнута, около50пользователей. Локальные исправления разрешены; production deploy/migrations/real wallet edits/Play требуют прямого поручения. Никаких real.env/tokens в копиях/evidence. Новые Codex plugins согласовать, сейчас не нужны. Последнее правило пользователя: выполнять по5пунктов за заход и после каждого отдельно объяснять простыми словами исправление/пользу.

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

Следующий пакет из5: R12/R42 плюс R-01 (restore ownership), R-04 (shutdown snapshots), R-09 (server right for rewarded x2). Сначала прочитать соответствующие карточки; начатьR-01 с failing local identity regression. Это подготовленная очередь, код ещё не менялся. R-09dependsR02 выполнено, external SSV отложены — unverified path должен быть закрыт по карточке, не включать ad integration автоматически. R-27dependency upgrade остаётся P0 и требует отдельного совместимого triage. Не возобновлять полный аудит и не считать внешний доступ необходимым для локальных исправлений.

## Как продолжать

AGENTS.md → этот журнал → WORK_LOG.md → карточки. prepare-checkout копирует tracked/staged source без.env/deps/evidence; untracked tests явно копировать/stage. run-check sNNN-* требует matching .tmp/remediation-sNNN/NAME и сохраняет synthetic env/commands/logs. После изменения audit docs запускать validate-audit, обновить SHA256 manifest, verify-manifest. После каждого закрытого пункта журналы+focused commit+pushfeaturebranch; следующий заход выполнять по5пунктов с понятным объяснением каждого.

## Текущий пакет S009–S013

Последнее правило пользователя —5пунктов за заход. S009/R01 готов: findReusableSessionId проверяет platform/userId/playerId и room/code/match context до mutation; explicit occupied seat conflict409. Клиент+www сохраняют/передают matchId, full_state/room_state его включают. Before9tests2pass7fail, после targeted24/24 Node25/22; fullserver288/295, те же7old failures. Два outdated assertions исправлены по новому контракту (old test разрешал чужое место). Evidence session-009/summary.json. Локально9/42, R25partial,32open.

S010/R04 начат: .tmp/remediation-s010/clean с server npmci; временно собран официальный Redis7.4.11 в .tmp/remediation-s010/redis-src, SHA проверен по redis/redis-hashes. Не plugin/global install. Redis ещё не запущен. Дефект: onBeforeShutdown сохраняет, disconnect→onDispose сразу удаляет snapshot+registry; onLeave может мутировать/forfeit приshutdown. Следующее: red subprocess SIGTERM с real localRedis127.0.0.1:56379, затем lifecycle guards/preserve snapshot/version/context; проверить samehand/turn/match,0shutdownsettlement/1final. Clean S010 создан до finalS009fixtures: синхронизировать source перед тестами.

S010/R04 завершён: summary session-010. Redis stopped (own127.0.0.1:56379,7.4.11temporarybinary); actual Colyseus MatchMaker SIGTERM save/restore + ordinarycleanup Node25/22pass; lifecycle21/21Node22/full291/298 sameold7. onBeforeShutdown pauses timers/actions, snapshotVersion1+remainingturn, serializedatomicRedisdualkeys, shutdownonLeaveguard (includingpendingreconnectcatch), preserveonDispose; normaldispose awaitdelete. roomRegistry sharedconnectpromise предотвращает latewrite. Локально10/42. R29pendingfinancialoutbox/abruptkill не закрыт.

S011/R09: .tmp/remediation-s011/clean rootnpmci готов. Новые rejection tests изменены в root и copy; initial attempt s011-ad-before был TS missingfuturefield, исправлен cast; s011-ad-repro проверяет исходный API red. Следующее: serverdeny authenticated rewarded_x2 до DB/config, убратьunverifiedupgrade, capabilityfalse+clientgate, нормальный бонус сохранить. Затем realPG100normal/100x2/mixed, Node25/22/APItests. S012/R12publicAI, S013/R42receipts ещёне начаты.

S011/R09 локальныйобъёмвыполнен: API134/134Node25/22, realPG4×100requests обеNodepass (0/100/100/50denied), clientVM4/4,sourcecheck. server403rewarded_daily_unavailable до DB; removedunverifiedupgrade; capabilityfalse иclientprovider gate. Обычныйbonus/streak/keysсохранены. SSV/positiveverifiedeventвнешнеотложены; не заявлятьготовуюadintegration. Локально11/42сэтимограничением. PG127.0.0.1:55439 ownS002работает, s011_after/node22 usedsyntheticDB.

S012/R12: .tmp/remediation-s012/clean prepared/servernpmci идёт; serverAIteambranch читаетhiddenpartner/opponent `.some`, runBotTurn передаётrawhands/bazaar. Следующее: pairedworld red + inputboundary spy, заменить на publichandCounts/bazaarCount иpublicmissing-suits estimate. Старый teamchoice test updateкpublicevidence, не удалить. S013/R42ещёне начат.

S012/R12 completed locally, code66f0962 pushed. Ownhand/public counts/scores/bazaar only; raw hidden hands rejected. Evidence session-012/summary.json: before0/6, after7/7, Node22+rulesets14/14, full302/309 same old7, source pass. Local scopes12/42, R09 external SSV deferred. S013/R42 next: isolated .tmp/remediation-s013/clean has fresh root/server deps; own PG55439 still running. Implement explicit per-player stake/returned/winnings/net/id receipt, room passthrough, client actual loss/profit summary and event dedupe; verify UI vs wallet+reserved delta for win/loss/draw/refund/2v2 and duplicates. No deployment.
