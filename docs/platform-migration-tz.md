# ТЗ: Платформенная миграция `domino2`

## Цель

Перевести проект `domino2` с текущего стека:

- `Express + Colyseus`
- file-based auth/store через `accounts.json`
- static web frontend

на новую платформенную основу:

- `NestJS` как backend-ядро
- `PostgreSQL` как главную БД
- `Better Auth` для `email/password` и `Google login`
- `Next.js` admin-панель под игру
- подготовить foundation для `Stripe Checkout + webhooks`

Игровая логика домино при этом не должна быть переписана в первом этапе.

## Текущее состояние проекта

В проекте уже есть:

- базовый account layer на клиенте и сервере;
- guest / register / login / logout;
- профиль игрока, история матчей и лидерборд;
- привязка bearer token к multiplayer room;
- запись локальных и online матчей;
- рейтинговая модель в file storage.

Ограничения текущей реализации:

- данные пользователей, сессий и матчей хранятся в JSON-файле;
- нет PostgreSQL, миграций и нормальной схемы данных;
- auth самописный и не готов к Google login;
- нет ролей, admin API и admin panel;
- нет платежного контура;
- backend не модульный.

## Область работ

### Входит

- новый backend `apps/api`;
- новая DB schema и миграции;
- интеграция `Better Auth`;
- перенос user/profile/match/history/rating в PostgreSQL;
- admin API;
- новая admin panel `apps/admin`;
- foundation под платежи.

### Не входит в первый этап

- полная интеграция Stripe;
- переписывание игровой логики домино;
- перенос realtime-сервера с Colyseus на Nest gateway;
- магазин и монетизация как законченный продукт.

## Целевая структура репозитория

```text
apps/
  api/
  admin/
packages/
  db/
  shared/
docs/
legacy runtime:
  server/
  js/
  www/
```

## Архитектурный принцип

- `NestJS` становится единым API-ядром для auth, players, stats, leaderboard, admin и будущих payments.
- Текущий realtime runtime на Colyseus временно остается рядом и позже переводится на новую identity-модель.
- Игрок идентифицируется по `user_id` / `player_id`, а не по имени из клиента.

## Миграция данных

Источник миграции:

- `server/data/accounts.json`

Мигрируются:

- пользователи;
- гостевые и зарегистрированные аккаунты;
- рейтинг и статистика;
- история матчей;
- timestamps;
- avatar seed.

Не мигрируются:

- старые session tokens;
- legacy bearer-сессии после релиза считаются невалидными.

## Модель данных

### Auth

Auth-таблицы создаются `Better Auth`.

### Игровые сущности

- `players`
- `player_stats`
- `matches`
- `match_participants`
- `player_bans`
- `player_reports`
- `admin_audit_logs`

### Payments foundation

- `catalog_products`
- `catalog_prices`
- `orders`
- `payments`
- `payment_events`
- `player_entitlements`

## Роли

- `player`
- `moderator`
- `admin`
- `superadmin`

## Backend-модули

Обязательные модули:

- `health`
- `auth`
- `users`
- `players`
- `stats`
- `leaderboard`
- `matches`
- `game-integration`
- `moderation`
- `admin`
- `catalog`
- `orders`
- `payments`

## API-группы

### Public / game

- `GET /health`
- `GET /me`
- `GET /leaderboard`
- `GET /players/:id`
- `GET /me/matches`
- `POST /reports`

### Admin

- `GET /admin/overview`
- `GET /admin/players`
- `GET /admin/players/:id`
- `POST /admin/players/:id/ban`
- `POST /admin/players/:id/unban`
- `GET /admin/reports`
- `POST /admin/reports/:id/resolve`
- `GET /admin/matches`
- `GET /admin/audit-logs`
- `GET /admin/catalog/products`
- `POST /admin/catalog/products`
- `PATCH /admin/catalog/products/:id`

### Payments later

- `POST /payments/checkout/session`
- `POST /payments/webhooks/stripe`

## Better Auth

Нужно реализовать:

- email/password registration;
- email/password login;
- logout;
- session management;
- Google login;
- `GET /me`;
- роль `player` по умолчанию;
- связку `auth user -> player`.

## Admin panel

Страницы v1:

- `/login`
- `/dashboard`
- `/players`
- `/players/[id]`
- `/reports`
- `/matches`
- `/leaderboard`
- `/moderation`
- `/catalog`
- `/audit`

Функции v1:

- логин админа;
- просмотр игроков;
- просмотр истории матчей и статов;
- бан/разбан;
- просмотр жалоб;
- журнал действий админов.

## Stripe foundation

В первом этапе требуется только foundation:

- DB schema;
- service contracts;
- enum статусов;
- webhook skeleton;
- checkout session skeleton без включения в production.

Статусы:

- `pending`
- `requires_action`
- `paid`
- `failed`
- `refunded`
- `canceled`

## Этапы реализации

### Этап 1. Foundation

- новая структура `apps/*`, `packages/*`;
- NestJS skeleton;
- PostgreSQL + Prisma schema;
- env/config scaffold.

### Этап 2. Auth

- Better Auth;
- email/password;
- Google login;
- роли;
- миграция пользователей.

### Этап 3. Player domain

- players;
- stats;
- leaderboard;
- history;
- запись локальных и online матчей.

### Этап 4. Legacy game integration

- адаптация текущего realtime к новой identity-модели;
- замена file storage на PostgreSQL.

### Этап 5. Admin

- Next.js admin panel;
- moderation;
- audit logs.

### Этап 6. Payments foundation

- каталог;
- orders/payments schema;
- Stripe skeleton.

## Критерии приемки

- новый `NestJS` backend запускается отдельно от legacy runtime;
- PostgreSQL schema описана и версионируется миграциями;
- есть скрипт миграции legacy accounts/matches;
- auth и player domain отделены;
- admin panel scaffold готова;
- foundation под Stripe заложен;
- legacy runtime не ломается в процессе внедрения новой платформы.

