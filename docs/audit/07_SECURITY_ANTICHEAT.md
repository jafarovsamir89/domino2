# Безопасность и античит

> Аудит 17 октября 2026. Репозиторий `jafarovsamir89/domino2`, ветка `release/play-prep`, коммит `508932ebeb45cde744e3e1dbd92bc5592ca66093`. Проверки только локальные. Игра уже опубликована в Google Play; production и реальные кошельки не изменялись.


## Подтверждённые дефекты

### R-01 — чужое место через restore, P0

`server/DominoRoom.js:401–405` принимает существующий `options.restoreSessionId` до проверки владельца; `onJoin:1324–1370` переименовывает сессию и присваивает новой identity userId. Локально victim создаёт waiting room на 4 места, другой подписанный пользователь входит с victim.sessionId. Attacker получает full_state и host/seat 0. Артефакт: [network-probes.json](evidence/metrics/network-probes.json), воспроизведение: [network-probes.mjs](evidence/scripts/network-probes.mjs).

Предпосылки: обычная валидная авторизация и известный sessionId; admin и secret не нужны атакующему. Активная заполненная комната может ограничиваться lock/maxClients; нельзя объявлять захват любой активной комнаты доказанным. Тем не менее ownership должен проверяться всегда: userId **и** playerId старой записи равны новой identity; sessionId — не credential. Restore token подписывается и связывается с account, room, match и сроком. Negative test обязательно с двумя настоящими локальными профилями и чужой identity.

### R-11 — раскрытие закрытых комнат, P1

`server/index.js` маршрут `/api/realtime/players` отдаёт через livePresence user/session/roomCode, в том числе закрытые комнаты. Это воспроизведено без Authorization в том же probe. Закрытый код теряет смысл; данные упрощают R-01. Для public API оставить агрегаты и публичные display-поля. Private room lookup должен требовать членство/приглашение. Скрытие sessionId само по себе не исправляет ownership.

### R-02, R-03, R-05, R-09 — экономика

Повторная daily x2, отсутствие ad proof, settlement не по matchId и перезапись admin config доказаны на локальной PostgreSQL. Подробности и безопасные исправления в [экономике](08_ECONOMY_BALANCE.md). Тестовые подписанные payload создавались известным локальным секретом; это не доказательство утечки боевого ключа.

## Подтверждённый dependency риск, R-27

`npm audit` по root lock: 36 записей (5 critical, 21 high, 9 moderate, 1 low). Это дерево advisory-зависимостей, не число независимых эксплуатируемых дыр. Полный снимок — [npm-audit-root.json](evidence/metrics/npm-audit-root.json).

Особенно значим `@capacitor/android` 8.3.1. Официальное [advisory Capacitor](https://github.com/ionic-team/capacitor/security/advisories/GHSA-rvm3-566m-v7fv) включает эту версию: переход по внутреннему proxy path может загрузить сторонний контент под origin приложения. Применимость версии доказана; exploit конкретного UI и native-состава опубликованного APK не проводился. Исправить в совместимом patched release, пересобрать и проверить OAuth, deep links, microphone и navigation. Отключение CapacitorHttp не считается достаточным обходом по advisory.

Better Auth 1.6.9, Next 15.5.16, proxy-addr и tar тоже отмечены critical. В auth включён bearer, но не oidc-provider, device authorization или organization plugins; нельзя приписывать приложению все plugin-specific атаки. Проверить фактически используемые OAuth linking и email/password flows. Для Next определить доступные Server Actions/image optimizer и наличие дополнительной API-role проверки. Tar преимущественно относится к build toolchain. Не запускать слепой `npm audit fix --force`: разбить обновления и выполнить независимую матрицу регрессий.

## Риски, требующие отдельной проверки

- `server/platformAuth.js:7–16`: blacklist нескольких слабых secrets без проверки энтропии/длины. Наличие слабого production secret неизвестно. Fail-fast при менее 32 случайных байтах и отдельные ключи назначения.
- `platformAuth.js:27–44`: game token проверяется локально по HMAC и expiresAt. Отзыв session/ban на API не гарантирует немедленную инвалидизацию игрового допуска. Ввести короткий access TTL + revocation/version cache; проверить ban/logout/delete во время live game.
- `MainActivity.java:30–76`: microphone permission проверяет resource, но не origin. При уже выданном RECORD_AUDIO grant доступ автоматически разрешается. Нужен allowlist конкретного app origin и отмена pending request при navigation. Не заявляется доказанная прослушка.
- `apps/api/src/main.ts:27`: rate-limit buckets в Map. Нужны предел ключей/TTL, reverse-proxy trust и shared limiter при нескольких replicas; память/обход per-IP в этом аудите не атакованы.
- Social хранит блокировки и reports, DM сверяет пользователей. Проверить, что ban/block распространяется на invite, gift, voice и realtime, а не только HTTP.
- `pendingMatchRecording` и retry находятся в памяти комнаты; crash между окончанием и durable подтверждением требует outbox reconciliation.

## Положительные механизмы

Серверные legal moves и собственная рука в full_state; signed server→API proof; транзакции и wallet ledger; блокировки резервов FOR UPDATE; запрет backup и cleartext в release manifest; basic DTO validation; social block/report; local-only fixtures. Эти меры уменьшают поверхность, но не отменяют дефекты привязки identity и idempotency.

## Матрица приёмки исправлений

Чужой restore отклонён; повторный result/SSV даёт ровно одну ledger-запись; old match не затрагивает new reservations; отрицательный/NaN/overflow amount отклонён; outcome не принимается из клиента без proof; banned user не входит в новую комнату; revoked token прекращает допуск в заданный SLA; private presence не раскрывается; логи не содержат токенов. Проводить на отдельной БД с известными users, не на production balances.
