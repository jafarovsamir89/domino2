# S057 — R21: локальный адаптер игровых данных

**Дата:** 2026-11-12
**Ветка:** `codex/rewarded-acceptance`
**Исходный commit:** `276fa62`
**Кодовый checkpoint:** `ef4095b`, опубликован в `origin/codex/rewarded-acceptance`
**Счёт карточек:** 30/42; R21 остаётся открытой.

## Что сделано

- Добавлен закрытый HMAC-маршрут игрового сервера `POST /internal/account-erasure/prepare`. Он принимает только точный scope, свежую подпись, nonce и истёкший 30-дневный срок удаления. Ответ тоже подписывается. В production API-клиент разрешает только HTTPS; HTTP доступен только для loopback-разработки.
- Адаптер запрашивает список комнат Colyseus и отдельно проверяет каждую через межпроцессный room RPC. Аккаунт в комнате, незавершённый расчёт/запись партии, недоступный RPC и неправильный ответ останавливают удаление.
- До очистки полностью читаются Redis snapshots и presence. Невалидный JSON/ключ/срок, активный snapshot или незавершённая работа блокируют операцию. Неактивный snapshot обезличивается через compare-and-set Lua с сохранением TTL; stale presence удаляется вместе с записью из индекса комнаты. При гонке с новой записью попытка останавливается и повторяется.
- Settlement outbox теперь проверяется без изменения его финансовых файлов. Незавершённый, выполняющийся, повреждённый или неоднозначный расчёт блокирует очистку. Проверяются ID матчей из `MatchParticipant`, из owner snapshot и `winnerUserIds`, поэтому проигрыш не теряется из-за отсутствия проигравшего в списке победителей. Ключи и подтверждённые финансовые receipts сохраняются.
- API передаёт адаптеру все связанные ID матчей. Клиент проверяет подпись/nonce ответа и обязан сначала записать fsync restore marker через `AccountErasureJournal`; без этого игровое удаление не вызывается.

## Проверки

- `node --test server/test/account-erasure.test.js server/test/settlement-outbox.test.js server/test/domino-room.test.js server/test/room-presence.test.js server/test/live-presence-timing.test.js` — **65/65**, 0 пропусков. Полный вывод: `server-account-erasure.txt`.
- `apps/api/node_modules/.bin/tsc -p apps/api/tsconfig.json --noEmit` — успешно; TypeScript 5.9.3 из API lockfile.
- Эмиссия в игнорируемый `.tmp/s057-api` и `node --test .tmp/s057-api/test/account-deletion.test.js` — **8/8**, 0 пропусков. Вывод: `api-account-deletion.txt`.
- `node --check` для `server/index.js`, `accountErasure.js`, `DominoRoom.js`, `settlementOutbox.js`, `livePresence.js` — успешно.
- `git diff --check` — успешно.
- Промежуточный тест обнаружил короткое замыкание обхода snapshot до извлечения match ID; обход исправлен и повторён. Дополнительно проверено, что stale presence связывает старый snapshot, содержащий только session ID, а свежая presence не удаляется раньше 120-секундного reconnect grace. Ни одно условие теста не ослаблялось.

## Границы и остаток

Это локальная реализация адаптера, не проверка подключения к настоящему Redis/Colyseus и не production-включение. `AccountDeletionModule` не добавлен в production `AppModule`; URL `DOMINO_GAME_ERASURE_URL` не задан. Production, миграции, реальные игроки, кошельки, Android и Play не затрагивались.

R21 нельзя закрывать, пока не добавлены и не испытаны фактические processor/backup-retention/notification adapters, полная композиция старта и restore gate, а также безопасный rollback после первых запросов. Неизвестные сервисы нельзя объявлять «данных нет» без проверки конфигурации.

**Следующее действие:** исследовать только репозиторные (без `.env` и production доступа) источники резервного копирования, Sentry/FCM и runtime-конфигурацию; определить конкретные локальные адаптеры. После этого соединить `GameErasureClient` с долговременным журналом и обязательными внешними адаптерами, сохраняя fail-closed поведение.
