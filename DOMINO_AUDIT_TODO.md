# Domino Audit TODO

Рабочий документ для исправления найденных проблем в проекте Domino: Telephone / Five.

## 0. Уже закрыто в текущем проходе
- `Forged settlement` и trust-boundary для матчей и экономики закрыты server-signed proof'ами.
- Публичный `GET /players/:id` больше не отдаёт `wallet`.
- `POST /realtime/heartbeat` требует auth token и DTO validation.
- Friend request `accept` больше не принимается со стороны requester.
- `authToken` больше не сохраняется в Redis snapshot комнаты.
- `next_deal` ограничен host-only и pending-окном.
- `turnVersion` добавлен для server-side anti-replay игровых действий.
- Добавлены DB constraints для ключевых money/match сущностей, leaderboard sorting moved to DB, health checks и system audit trail.

Статус документа:
- [ ] Разобрать и подтвердить приоритеты
- [ ] Ответить на вопросы выбора
- [ ] Разбить задачи по этапам
- [ ] Исправить критические дыры
- [ ] Довести до beta / production

## 1. Срочные задачи до любого релиза

### 1.1 Запретить эмиссию монет через forged settlement
- [ ] Убрать доверие к `result` от клиента в `apps/api/src/modules/economy/economy.service.ts`
- [ ] Сделать settlement только через server-side подтверждение завершения матча
- [ ] Добавить server-signed match ticket или иной proof of completion
- [ ] Добавить защиту от replay для settle-запросов
- [ ] Проверить, что solo и multiplayer используют один и тот же trust model

### 1.2 Закрыть подмену результатов матчей
- [ ] В `apps/api/src/modules/matches/matches.service.ts` перестать принимать произвольные `participants`
- [ ] Валидировать roster по server room state
- [ ] Дедуплицировать участников матча
- [ ] Запретить присваивать `winnerUserIds` и `winnerPlayerIds` из client payload
- [ ] Привязать запись матча к серверному завершению игры

### 1.3 Убрать утечку балансов игроков
- [ ] Ограничить `GET /players/:id`
- [ ] Убрать wallet из публичного профиля
- [ ] Разделить public profile и private profile
- [ ] Проверить, где еще wallet/coins показываются без авторизации

### 1.4 Закрыть spoofing realtime/presence
- [ ] Защитить `POST /realtime/heartbeat`
- [ ] Привязать heartbeat к auth session или signed token
- [ ] Добавить rate limit и schema validation
- [ ] Проверить, что fake room/presence нельзя создать без живой сессии

### 1.5 Исправить acceptFriend bypass
- [ ] Запретить requester-side self-accept в `apps/api/src/modules/social/social.service.ts`
- [ ] Разрешить accept/decline только addressee
- [ ] Оставить requester только для cancel own request
- [ ] Добавить тест на обход invite-gate

### 1.6 Удалить bearer token из room snapshot
- [ ] Перестать сохранять `authToken` в `server/DominoRoom.js`
- [ ] Оставить в snapshot только безопасный идентификатор
- [ ] Проверить Redis TTL и очистку snapshot-данных

## 2. Игровая логика

### 2.1 Единый authoritative game core
- [ ] Вынести правила домино в shared module
- [ ] Убрать дублирование правил между `server/` и `www/js/`
- [ ] Сделать сервер единственным источником истины по ходам и таймерам

### 2.2 Проверка правил Телефон / Пятёрочка
- [ ] Пройтись по стартовому раздающему и первому ходу
- [ ] Проверить обработку `[5|5]`, `gosha`, blocked board, pass, draw
- [ ] Проверить завершение партии при отсутствии ходов
- [ ] Проверить корректность подсчета очков
- [ ] Проверить бонусы за закрытие раунда и special tile rules

### 2.3 Защита от double move и повторной отправки
- [ ] Ввести command id / nonce для игровых действий
- [ ] Сделать серверный anti-replay на play / pass / draw / next-deal
- [ ] Отбрасывать повторный ход в одном и том же turn version

### 2.4 Disconnect / reconnect / resume
- [ ] Проверить восстановление активной партии после refresh
- [ ] Проверить reconnect при слабом интернете
- [ ] Проверить поведение при выходе игрока
- [ ] Проверить восстановление seat, hand, turn, timers

### 2.5 Next deal / round end
- [ ] Решить, должен ли `next_deal` быть ручным или авто-advance
- [ ] Если ручной, ограничить host-only
- [ ] Если авто, убрать кнопку из UI

## 3. Экономика

### 3.1 Ставки и резервы
- [ ] Проверить атомарность reserve / settle
- [ ] Запретить отрицательный баланс
- [ ] Запретить повторное списание и повторное начисление
- [ ] Добавить idempotency key для money-moving операций

### 3.2 Daily bonus / ad rewards
- [ ] Сделать proof-based claim для рекламы
- [ ] Проверить, что daily bonus нельзя фармить через timezone spoofing
- [ ] Проверить cooldown / daily limit на сервере

### 3.3 Подарки и обмен подарков
- [ ] Добавить защиту от replay
- [ ] Добавить уникальные ledger references
- [ ] Проверить обратный обмен на монеты
- [ ] Проверить race conditions при одновременных отправках

### 3.4 Match settlement economy
- [ ] Проверить возврат ставки при отмене игры
- [ ] Проверить комиссию системы, если она есть
- [ ] Проверить, что награды начисляются один раз

## 4. Архитектура и backend

- [ ] Решить судьбу legacy `server/` и NestJS API
- [ ] Свести игровую логику и settlement к одному core
- [ ] Добавить DTO + validation pipes во все публичные endpoints
- [ ] Добавить транзакции там, где меняются деньги или статус матча
- [ ] Проверить lifecycle `PrismaClient` и shutdown handling
- [ ] Добавить health checks для API, Redis и DB
- [ ] Вынести leaderboard на SQL sorting / pagination
- [ ] Добавить audit logs для всех money/rating actions
- [ ] Проверить env-переменные и убрать опасные hardcoded values

## 5. Frontend / UX

- [ ] Проверить loading / error / empty states
- [ ] Проверить double click на critical buttons
- [ ] Проверить UI при refresh и reconnect
- [ ] Проверить mobile layout для gameplay screen
- [ ] Проверить, что UI не рисует bank / balance сам по себе без server state
- [ ] Упростить resume flow и показать, что состояние подтверждено сервером

## 6. База данных

- [ ] Добавить `@@unique([matchId, playerId])` для `MatchParticipant`
- [ ] Добавить уникальность для активных `RoomInvitation`
- [ ] Добавить CHECK constraints на неотрицательные денежные поля
- [ ] Проверить миграции и обратную совместимость
- [ ] Проверить историю ходов, истории игр и audit trail

## 7. Тесты

### Unit
- [ ] Scoring для всех режимов и финальных комбинаций
- [ ] Anti-replay для game actions
- [ ] Friend acceptance rules
- [ ] Public profile redaction
- [ ] Snapshot validation for reconnect/resume

### Integration
- [ ] Forged settlement should fail
- [ ] Public balance lookup should fail or redact
- [ ] Heartbeat spoofing should fail
- [ ] Duplicate participants should be rejected
- [ ] Gift / reward replay should fail

### E2E
- [ ] Create room, join, play, finish, next round
- [ ] Disconnect during active turn and reconnect
- [ ] Weak internet duplicate submit scenario
- [ ] Private invite flow and room access control
- [ ] Solo match settlement and anti-fraud flow

## 8. Вопросы для решений

### 8.1 Что делать с `next_deal`?
Ответ:
- [ ] Авто-переход после таймера
- [ ] Ручной переход только для host
- [ ] Оставить как сейчас, но с дополнительной валидацией

### 8.2 Какой trust model выбираем для результатов матча?
Ответ:
- [ ] Только server-authoritative result
- [ ] Server result + signed client acknowledgement
- [ ] Гибрид для legacy совместимости

### 8.3 Что делаем с `server/` legacy stack?
Ответ:
- [ ] Полностью удалить после миграции
- [ ] Оставить временно, но запретить settlement в legacy
- [ ] Поддерживать оба стека до отдельного решения

### 8.4 Нужно ли публично показывать баланс игрока?
Ответ:
- [ ] Нет, скрываем полностью
- [ ] Показать только общий wallet summary без точного баланса
- [ ] Оставить как есть

### 8.5 Какой подход к рекламе и daily bonus?
Ответ:
- [ ] Только server-verified receipt / provider callback
- [ ] Разрешить client claim с усиленным антифродом
- [ ] Убрать награды до интеграции провайдера

### 8.6 Что делать с room snapshot и reconnect?
Ответ:
- [ ] Сохранять только безопасный minimal snapshot
- [ ] Хранить расширенный snapshot без токенов
- [ ] Переписать reconnect/resume flow полностью

### 8.7 Нужен ли единый shared game engine?
Ответ:
- [ ] Да, обязательно
- [ ] Да, но после стабилизации текущего релиза
- [ ] Нет, оставляем дублирование

### 8.8 Какой уровень защиты хотим для экономических операций?
Ответ:
- [ ] Idempotency key + DB unique constraints + audit log
- [ ] Только idempotency key
- [ ] Только серверная проверка без ledger hardening

### 8.9 Что делать с public profile API?
Ответ:
- [ ] Разделить public/private endpoints
- [ ] Оставить один endpoint, но вырезать wallet
- [ ] Оставить как есть

### 8.10 Как поступаем с инвайтами в комнату?
Ответ:
- [ ] Только по mutual friendship
- [ ] По invitation token
- [ ] Оставить текущую модель с доработкой accept rules

## 9. Приоритеты работ

### Этап 1, срочно
- [ ] Forged settlement
- [ ] Match result trust boundary
- [ ] Public balance leak
- [ ] Heartbeat spoofing
- [ ] Friend accept bypass
- [ ] Token leakage in snapshot

### Этап 2, перед beta
- [ ] DTO / validation
- [ ] DB unique constraints
- [ ] Idempotency keys
- [ ] Realtime anti-flood
- [ ] Next-deal decision

### Этап 3, перед production
- [ ] Shared engine unification
- [ ] Observability / health checks
- [ ] Leaderboard scaling
- [ ] Audit logs
- [ ] E2E coverage

### Этап 4, после релиза
- [ ] Legacy cleanup
- [ ] UX polish
- [ ] Performance tuning
- [ ] Admin tooling
- [ ] Replay/debug tooling

## 10. Как отвечать в этом документе

- Пиши ответ прямо под вопросом.
- Если выбираешь вариант, ставь `x` у нужного пункта.
- Если нужен свой вариант, допиши его ниже.
- Если хочешь, я потом превращу этот документ в чеклист с задачами по коммитам.
