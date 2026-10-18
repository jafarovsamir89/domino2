# Agent journal — текущее состояние

Обновлено18.10.2026. Текущий пакет из трёх: S006/R-03 закрыт локально; далее S007/R-31 и S008/R-32.

## Миссия и ограничения

Исправлять42пункта docs/audit/REMEDIATION_PLAN.md, вести этот краткий журнал и append-only WORK_LOG.md. Игра развёрнута, около50пользователей. Локальные исправления разрешены; production deploy/migrations/real wallet edits/Play требуют прямого поручения. Никаких real.env/tokens в копиях/evidence. Новые Codex plugins согласовать, сейчас не нужны. Последнее правило пользователя: выполнять по3пункта за заход и после каждого отдельно объяснять простыми словами исправление/пользу.

## Git и готовность

Ветка fix/audit-foundation. S0019f1380a, S00230596eb, S0038c69090, S0043b5d3d7, S00546cc8c7 опубликованы. S006 checkpoint subject: fix(economy): bind reservation lifecycle to its match. Проверить фактический git status/log перед продолжением. Локально закрыты6/42: R-06,R-05,R-07,R-02,R-08,R-03. R-25partial,35open. No deploy/PR/Play edits.

## Проверенные пакеты

- S001/R-06: root/server npm ci Node25/22pass без обновления старых locked versions. Main node_modules старый, использовать isolated copies. Server discovery был37files/243cases236pass7fail; original E2E30/39 иboundary1/1. Старые7/9 описаны evidence/session-001/FAILURES.md, не считать все fixture failures доказанными product bugs.
- S002/R-05: defaults только в Nest onModuleInit transaction, existing stakes/config/products/prices/timestamps не перезаписываются. Advisorylock1464091701,5.4concurrentinit/restart проверены реальным PG.
- S003/R-07: missing daily_login startup seed reward0/maxProgress1/daily; admin edits/inactive сохранены. Fresh migrations→daily200/repeat0/next300,0дополнительной выдачи. Existing disabled quest по-прежнему блокирует daily — политику не меняли.
- S004/R-02: daily lock1464091702/hashtext(playerId) до lookup; ReadCommitted,maxWait/timeout30s; unique ledger keys initial/upgrade, no schema edit. Unit132/132 Node25/22;4сценария100parallel дают200/400/400/400 и0errors, rollback/retry/legacy/dates проверены. R-09ad entitlement открыт.
- S005/R-08: исправлено имя опции во всех2server/4client+www calls. Behavioral33/33, Node22+rulesets40/40; full server269/276, те же7fail,38files discovery. VM исполняет полный DominoGame class без DOM constructor, реальные play/gosha/checkEnd. Browser/installedAPK animations отдельно не тестировались. Asset parity подтверждена.
- S006/R-03: exact room/table/match filter, roomlock1464091703, frozen stake/commission, fixed active participants, old reserve replay via ledger history, stable wallet order. Paid missing-match отвергается, existing null-match funds не приписываются новому матчу. No migration: current row reuse сохраняется, history в immutable ledger. API134/134 Node25/22, real PG10scenarios включая100reserve/30settle, nextmatch/replay/rollback/config/legacy. evidence/session-006/summary.json. Старые API не участвуют в lock/filter — будущий rollout заменить всеinstances, это не разрешение deploy.

## Локальный стенд

.tmp/remediation-s006/clean: актуальные root deps/API build без.env. .tmp/remediation-s007/clean: подготовлена копия, server npm ci; R-31 пока не менялся. Own PG .tmp/remediation-s002/pg на127.0.0.1:55439 остановлен послеS006; role domino_remediation. DB имена domino_remediation_s006_before/after/final/node22 — synthetic used fixtures, не fresh. Старый auditPG такжеостановлен. Не останавливать чужие службы. Для unit REDIS_URI='' — отсутствующий Redis даёт вечные retries.

## Следующие два пункта

R-31: server.advanceTurn вызывает classic101.resolveBlocked, но игнорирует возвращённый matchState перед endDeal. performPlay уже применяет roundEnd.matchState. Нужны behavioral real-room79+50=129/одинфинал, tie/carry/2v2 и отсутствие повторного начисления. Golden 28tile fixture в docs/audit/evidence/metrics/full-match-audit.json diagnostics.fishStateMismatch.examples[0]. Исторический harness full-match-audit.cjs экспортирует makeRoom, но меняет global timers/random; не запускать записывающий audit main. Сохранить исторические evidence.

R-32: startDeal при отсутствии lastDealWinner получает determineFirstPlayer.player=-1/drawToOpen:true, но не вызывает ruleset.drawToOpen. Shared метод уже мутирует hands/boneyard и возвращает found/player/tileIndex. Seed225 из аудита; проверить допустимый игрок,28unique tiles, schema/full_state/snapshot согласованность, обычные openings и last winner не изменены. No live clients/Android changes.

## Как продолжать

AGENTS.md → этот журнал → WORK_LOG.md → карточки. prepare-checkout копирует tracked/staged source без.env/deps/evidence; untracked tests явно копировать/stage. run-check sNNN-* требует matching .tmp/remediation-sNNN/NAME и сохраняет synthetic env/commands/logs. После изменения audit docs запускать validate-audit, обновить SHA256 manifest, verify-manifest. После каждого закрытого пункта журналы+focused commit+pushfeaturebranch; пакет завершить послеR31/R32 с понятным объяснением каждого.
