# Social Realtime QA Checklist

Дата: 2026-06-10

## Подготовка

- [ ] Открыть два разных браузера или normal + incognito
- [ ] Залогиниться двумя разными аккаунтами
- [ ] Открыть DevTools Console
- [ ] Включить debug mode, если он есть
- [ ] Проверить `localStorage` token

## Базовые проверки

- [ ] Game token существует
- [ ] Socket подключился
- [ ] Socket URL заканчивается на `/social`
- [ ] Socket path равен `/api/socket.io`
- [ ] Нет `connect_error unauthorized`

## Friends flow

- [ ] Игрок A добавляет игрока B в друзья
- [ ] Игрок B видит friend request
- [ ] Игрок B принимает request
- [ ] Игрок A получает `friend:update`

## Direct messages flow

- [ ] Игрок A отправляет сообщение B
- [ ] Игрок A получает `dm:ack`
- [ ] Игрок B получает `dm:new`
- [ ] Badge обновился

## Room invitations flow

- [ ] Игрок A создает комнату
- [ ] Игрок A приглашает B
- [ ] Игрок B получает `invite:new`
- [ ] Игрок B принимает invite
- [ ] Игрок A получает `invite:update`
- [ ] Игрок B попадает / подключается к комнате

## Presence flow

- [ ] Закрыть вкладку B
- [ ] Игрок A видит presence `offline`
- [ ] Перезагрузить страницу A
- [ ] Socket reconnect работает

## Logout/login flow

- [ ] Logout закрывает socket
- [ ] Повторный login не создает duplicate events

## Что смотреть в Network

- [ ] `/api/platform/game-token`
- [ ] `/api/socket.io/?EIO=4`
- [ ] `/api/social/summary`
- [ ] `/api/social/invitations`
- [ ] `/api/social/messages`

## Что смотреть в Console

События и сообщения:

- [ ] `connect`
- [ ] `disconnect`
- [ ] `connect_error`
- [ ] `social:ready`
- [ ] `social:error`
- [ ] `dm:new`
- [ ] `dm:ack`
- [ ] `invite:new`
- [ ] `invite:update`
- [ ] `friend:update`
- [ ] `presence:update`

Debug helper:

- [ ] Вызвать `window.__dominoSocialRealtimeStatus()`
- [ ] Проверить, что возвращаются:
  - `socketAvailable`
  - `socketConnected`
  - `socketReady`
  - `socketUrl`
  - `socketPath`
  - `tokenExists`
  - `fallbackMode`
  - `lastConnectError`
  - `lastEventAt`
  - `sseConnectedApprox`
  - `invitePollingActive`

## Красные флаги

- [ ] `socketUrl` содержит `/api/social`
- [ ] `socket path` равен `/socket.io` вместо `/api/socket.io`
- [ ] `tokenExists = false`
- [ ] `connect_error unauthorized`
- [ ] duplicate `dm:new`
- [ ] invite приходит только после polling
- [ ] badge не меняется
- [ ] REST работает, socket нет

## Что считать успешным

- [ ] Socket подключен сразу или корректно уходит в SSE/polling fallback
- [ ] DM, invites, friends, presence обновляются без ручного refresh
- [ ] Logout/login не создает duplicate listeners
- [ ] Никаких секретов, токенов, cookie, email или полного текста приватных сообщений в console logs
