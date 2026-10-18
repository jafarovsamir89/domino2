# Agent journal — текущее состояние

Обновлено: 18.10.2026. S001–S004 завершены локально, продолжаем небольшой S005/R-08.

## Миссия и ограничения

Исправлять 42 пункта docs/audit/REMEDIATION_PLAN.md; вести этот краткий журнал и append-only WORK_LOG.md. Игра развёрнута, примерно50 пользователей. Локальная работа разрешена; production deploy/migrations/wallet edits и Play-пакет требуют прямого поручения. Не копировать .env/real tokens; использовать synthetic loopback fixtures. Новые Codex plugins сначала согласовать, сейчас не нужны. После каждого пакета отдельно объяснять владельцу простыми словами, что исправлено и что это дало. Маленькие пункты выполнять подряд без остановки до большого.

## Точка продолжения

- Ветка fix/audit-foundation, S001 commit9f1380a, S002 commit30596eb, S003 commit8c69090 опубликованы. Проверить git status/log: S004 checkpoint subject `fix(economy): serialize daily grants and key ledger entries`.
- R-06/R-05/R-07/R-02 локально закрыты:4/42. R-25частично,37остальныхоткрыты. Не считать незелёную матрицу закрытой.
- S001: root/server npm ci Node25/22pass, dependency versions сохранены. Server discovery37files/243cases236pass7fail; исходные E2E30/39 и boundary1/1; это исторические незакрытые7/9, диспозиция evidence/session-001/FAILURES.md. Main node_modules остался старым, для проверок использовать isolated copy.
- S002: bootstrap убран из всех request paths; Nest onModuleInit транзакционно создаёт только missing defaults, existing config/stakes/products/prices и timestamps не меняет. Advisory transaction lock(1464091701,5) защищает от дублей при нескольких API instances; prices не имеют unique(product,currency). Награды/схема/кошельки не менялись.
- S002regressions до127/130, после130/130 на Node25.6 и22.14, source check passed. Реальный PG14.20:18 fresh migrations,4 concurrent init/restart,0configurationwrites при read, owner edits/timestamps preserved,0wallet/ledger; Node22 также startup rollback. evidence/session-002/summary.json.
- .tmp/remediation-s002/clean: clean root deps, актуальный API build; без .env. Для unit запусков REDIS_URI='' в run-check wrapper; недоступный Redis оставляет retries, не повторять setup S001. run-check s003-* требует соответствующую .tmp/remediation-s003/NAME.
- S003: startup создаёт missing daily_login (reward0,maxProgress1,period daily), existing quest fields/inactive не сбрасывает. До130/131, после131/131 на Node25/22. Две fresh DB после18migrations: до normal claim Quest not found; после200первыйдень/0повтор/300следующий, balance1000→1500,2claims/ledger, completed progress; owner quest survives restart. evidence/session-003/summary.json. Existing disabled quest всё ещё блокирует daily как раньше; новую бизнес-политику не вводили. .tmp/remediation-s003/clean содержит актуальные deps/build без.env.
- **Локальный собственный PG остановлен после S003**: .tmp/remediation-s002/pg,127.0.0.1:55439,role domino_remediation,DB domino_remediation, domino_remediation_s002_node22, domino_remediation_s003_before/after. БД synthetic, owner edits из тестов; не использовать как fresh. Предыдущий audit PG .tmp/audit-pg остановлен. Cleanup подтверждён s003-pg-stop.json. Не останавливать чужие службы.
- S004: daily lock по player до entitlement lookup, explicit ReadCommitted, maxWait/timeout30s, unique ledger keys initial/upgrade на existing constraint. До unit131/132; после132/132 Node25/22. PG100parallel normal/directx2/upgrade/mixed: до11P2002 у initial и2600вместо400 у upgrade; после0errors, ровно200/400/400/400. Rollback initial/upgrade, retries, legacy claim, даты/пропуск streak проверены. evidence/session-004/summary.json. .tmp/remediation-s004/clean актуален, собственныйPG снова остановлен s004-pg-stop; добавлены DB domino_remediation_s004_before/after/node22. R-09ad entitlement открыт; размеры наград не менялись. При будущем rollout заменить все oldAPIinstances — legacy code не участвует в новом lock. Deploy не разрешён автоматически.

## Следующее действие

S005/R-08 — малый контрактный дефект: shared/domino-rulesets.cjs ожидает instantWinEnabled, а server/DominoRoom.js передаёт isInstantWinEnabled в2calls, js/app.js в4calls. www/js/app.js — копия, держать parity. Сначала regression35приfalse/true, nonempty hand и game caller integration; затем исправить ключ у всех callers. Не менять правило instant-win или classic101. Server suite содержит старые7fail; фиксировать дельту, не ослаблять их. Следующий крупный пункт после этого — R-03 reserve/settle/refund matchId.

## Файлы и проверки

AGENTS.md → этот журнал → WORK_LOG.md → нужная карточка плана. prepare-checkout копирует tracked/staged source без.env/deps/evidence, untracked tests явно копировать/stage. run-check сохраняет synthetic env/commands/logs, sNNN-prefix выбирает каталог evidence. API проверять npm --prefix apps/api test в isolated copy. Root/server lock separate; никаких deploy scripts.

Если менять audit plan/README, обновить SHA256 manifest после audit validator, затем verify-manifest. Старое audit evidence не переписывать. No PR/deploy/Play changes. После checkpoint и перед ответом обновить оба журнала и origin feature branch.
