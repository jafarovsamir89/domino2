# Social Realtime Audit

Дата аудита: 2026-06-10

## Краткий вывод

Социальный realtime уже работает как отдельный контур поверх Socket.IO, SSE и REST/polling fallback. Основная нестабильность сейчас выглядит не как "сломанная логика", а как смесь:

- отсутствие общего Redis adapter для Socket.IO
- конкуренция между socket, SSE и polling refresh
- зависимость realtime от наличия свежего game token
- риск расхождений UI при поздних/дублирующихся событиях

Критичных изменений архитектуры на этом этапе не требуется. Ниже зафиксировано текущее поведение по коду.

## A) Backend Socket.IO

- Namespace: `/social`
- Path: `/api/socket.io`
- Gateway: `apps/api/src/modules/social-realtime/social-realtime.gateway.ts`
- Adapter: в коде не найден Redis adapter для Socket.IO, используется стандартный Nest + `IoAdapter`, значит realtime state in-memory на каждом процессе

### Какие events принимает gateway

- `social:hello`
- `presence:update`
- `dm:send`
- `dm:read`
- `invite:create`
- `invite:accept`
- `invite:decline`
- `invite:cancel`
- `typing:start`
- `typing:stop`

### Какие events отправляет gateway

- `social:error`
- `social:ready`
- `presence:update`
- `dm:new`
- `dm:ack`
- `dm:read`
- `invite:new`
- `invite:update`
- `typing:start`
- `typing:stop`

### connect/auth flow

1. При `handleConnection()` gateway вызывает `authenticateSocket()`.
2. Токен читается из `socket.handshake.auth.token`.
3. Если там пусто, fallback идет в `Authorization: Bearer ...` из headers.
4. Токен валидируется через `verifyGameToken()` из `apps/api/src/modules/auth/game-token.ts`.
5. Если claims отсутствуют, `playerId`/`userId` пустые или token просрочен, соединение считается невалидным.
6. На успешной авторизации сокет регистрируется в room `player:{playerId}`.

### Что происходит при invalid token

- socket получает `social:error` с `code: "unauthorized"`
- затем вызывается `socket.disconnect(true)`

### Как игрок join-ится в room `player:{playerId}`

- в `SocialRealtimeService.registerSocket()`
- после проверки claims вызывается `socket.join(\`player:${playerId}\`)`
- дополнительно socket получает `socket.data.socialPlayerId`, `socket.data.socialDisplayName`, `socket.data.socialSessionId`, `socket.data.socialPresenceStatus`

### Как отправляются live events

- `dm:send` вызывает `sendDirectMessageForPlayer(..., { emitEvents: false })`, затем вручную шлет:
  - отправителю `dm:ack`
  - получателю `dm:new`
- `invite:create` вызывает `inviteFriendToRoomForPlayer(..., { emitEvents: false })`, затем вручную шлет:
  - invitee `invite:new`
  - inviter `invite:update`
- `invite:accept`, `invite:decline`, `invite:cancel` также шлют `invite:update`
- `friend:update` и `presence:update` приходят через live broadcast из `SocialRealtimeService`

### Redis adapter / multi-instance risk

- Redis adapter для Socket.IO в коде не найден
- `SocialRealtimeService` хранит sockets/presence в `Map` внутри процесса
- если production поднимет несколько Node.js process/instances без sticky routing и общего adapter, возможны:
  - потеря live delivery между инстансами
  - разный presence state на разных воркерах
  - пропущенные `dm:new`, `invite:new`, `friend:update`, `presence:update`

### Какие env variables влияют на realtime

- `BETTER_AUTH_SECRET`
- `REDIS_URI`
- `ALLOW_IN_MEMORY_PRESENCE`
- `NODE_ENV`
- `API_PORT`

## B) Auth

### Как frontend получает game token

- `AccountClient.syncPlatformSession()` делает `GET {platformApiBase}/platform/game-token`
- `platformApiBase` по умолчанию:
  - `https://apid.simplesoft.az/api`
- если ответ содержит `token`, он сохраняется в localStorage под `dominoPlatformGameToken`

### Где токен хранится

- `localStorage["dominoPlatformGameToken"]`
- профиль также хранится в `dominoPlatformProfile` и `dominoAuthProfile`

### Как socket передаёт token

- frontend берет token из `AccountClient.getSocialSocketAuthToken()`
- это тот же `platformGameToken`
- socket создается с `auth: { token }`

### Чем socket auth отличается от Better Auth cookie/session

- Better Auth cookie/session используется для HTTP endpoints и платформенных запросов с `credentials: "include"`
- Socket.IO realtime не опирается на cookie session как primary auth
- realtime использует отдельный signed game token

### Что будет если token пустой/просроченный/подписан старым secret

- `verifyGameToken()` вернет `null`
- socket соединение будет отклонено
- frontend увидит `social:error` / `connect_error unauthorized`

### Может ли REST работать, а socket нет

- да
- REST fallback использует обычные HTTP routes и cookies
- socket требует валидный game token и доступный `/api/socket.io`

## C) Frontend Socket.IO

### Где создается socket

- `www/js/app.js`
- метод `initSocialSocket()`

### Как вычисляется socket URL

- через `AccountClient.getSocialSocketUrl()`
- `getSocialSocketBaseUrl()` удаляет `/api` из `platformApiBase`
- итог:
  - `https://apid.simplesoft.az/social`

### Как вычисляется socket path

- `AccountClient.getSocialSocketPath()`
- всегда:
  - `/api/socket.io`

### Проверка ожидаемого результата

Если `platformApiBase = https://apid.simplesoft.az/api`, то:

- `socketUrl = https://apid.simplesoft.az/social`
- `socketPath = /api/socket.io`

Текущее поведение соответствует ожидаемому.

## D) Fallback

### Где используется SSE

- `AccountClient.getSocialSseUrl()` -> `{platformApiBase}/social/sse`
- `initSocialSse()` в `www/js/app.js`

### Где используется polling / periodic refresh

- `startGameInviteRefresh()` периодически опрашивает invitations
- `loadSocialSummary()`, `loadFriendsPage()`, `loadSocialInvitesPage()` и `loadConversationWithPlayer()` используются как REST refresh для UI

### Какие события идут через socket

- `dm:new`
- `dm:ack`
- `dm:read`
- `invite:new`
- `invite:update`
- `friend:update`
- `presence:update`
- `social:ready`

### Какие события идут через SSE

- `message`
- `invite_update`
- `friend_update`
- heartbeat

### Какие события идут через periodic refresh

- invitations poll
- social summary refresh
- friends refresh
- conversation refresh

### Возможны ли дубли событий

- да
- одно и то же состояние может прийти через socket, SSE и затем confirm-refresh
- UI должен быть идемпотентным и обновляться по последней версии данных

### Может ли invite/message появиться только после polling

- да, если socket не поднялся и SSE еще не активен, UI может увидеть изменение только после следующего refresh tick

## E) UI state

### Как обновляется social center

- через `loadSocialSummary()`
- через `loadFriendsPage()`
- через `loadSocialInvitesPage()`
- через `loadConversationWithPlayer()`
- через socket/SSE handlers, которые вызывают refresh UI

### Как обновляется badge

- после получения `social:ready`, `dm:new`, `dm:ack`, `invite:new`, `invite:update`, `friend:update`, `presence:update`
- через `updateSocialCenterBadge()`

### Как обновляются messages

- socket events `dm:new` / `dm:ack`
- SSE `message`
- REST refresh conversation page

### Как обновляются room invitations

- socket `invite:new` / `invite:update`
- SSE `invite_update`
- periodic `startGameInviteRefresh()`
- REST `getRoomInvitations()`

### Как обновляются friend requests

- socket `friend:update`
- SSE `friend_update`
- REST refresh friends page / summary

### Как обновляется presence

- socket `presence:update`
- SSE / REST summary refresh indirectly

### Риск: server summary игнорируется локальным пустым state

- риск есть
- если UI состояние пустое, но сервер прислал summary позже, рендер должен не "затирать" серверный truth локальным default state

### Риск: socket event пришел, но UI список не обновился

- риск есть
- для этого в коде используются follow-up refresh'и, но при ошибке сети событие может быть принято, а список не перерисован до следующего refresh

## F) Tests

### Какие social/realtime тесты есть

- `apps/api/test/social.service.test.ts`
- `apps/api/test/social-realtime.gateway.test.ts`

### Что реально запускается через `npm --prefix apps/api test`

- script теперь включает:
  - `dist/test/social-realtime.gateway.test.js`
- остальной набор тестов не изменен

### Есть ли test file, который существовал, но не был включен

- да, `apps/api/test/social-realtime.gateway.test.ts` был в репозитории, но не был подключен в `apps/api/package.json`

### Есть ли настоящий socket.io-client integration test

- нет
- текущий gateway test использует fake socket и harness

### Какие flows не покрыты интеграционным socket test

1. two users connect
2. `dm:send -> dm:ack + dm:new`
3. `invite:create -> invite:new`
4. `invite:accept -> invite:update`
5. friend request update
6. invalid token disconnect
7. reconnect
8. duplicate listeners after logout/login

### Рекомендуемый следующий тест

- отдельный `socket.io-client` integration test можно добавить позже как минимальный smoke test
- сейчас это лучше оставить как TODO, чтобы не делать большой патч

## Технический план следующего этапа

Если дальше будем чинить нестабильность, я бы шел так:

1. Проверить, не теряются ли events между SSE, socket и polling при реальном login/logout цикле.
2. Добавить минимальный `socket.io-client` integration test для namespace/path/auth.
3. Затем отдельно закрыть multi-instance риск, если production действительно использует больше одного процесса.
