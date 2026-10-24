# R09 — проверка аккаунта перед рекламной попыткой, S044

24 октября 2026. Ветка `codex/rewarded-acceptance`, база `14c34ad`. **R09 открыта;27/42**. Независимая локальная подготовка, пока Unity отвечает на S043обращение.

## Изменения

`apps/api/src/modules/rewarded/request-access.ts` — выключенный по умолчанию кандидат, НЕ зарегистрирован в Nest, публичных маршрутов нет. Использует существующий AuthService для обычного токена сессии/cookie или действующий подписанный игровой токен. Повторно читает текущую сессию, владельца, игрока и бан из БД. Не создаёт профиль и не выдаёт стартовые монеты. Явный Bearer не переключается на другой аккаунт из cookie. Для изменения состояния с cookie обязателен точный доверенный Origin, как в существующем API.

Разрешены issue с `{optIn:true}`, cancel с `{attemptId}` и чтение состояния своей попытки. Нельзя передать чужой playerId/userId/sessionId, сумму или поддельный optIn. Номер попытки — выданный сервером64hex nonce. Другой игрок или другая сессия того же игрока не получает доступ к уже выданной попытке. Повторный issue той же сессии возвращает прежний nonce.

В `entitlement.ts` добавлено чтение состояния с проверкой доступа и привязки provider/app/unit/issuingsession: pending/cancelled/expired/credited. Оно не меняет кошелёк. Перед cancel проверяется владение, после него возвращается действительное состояние. Уже зафиксированная награда остаётся credited. Финансовая транзакция consume и обычный daily не изменены; SDK и публичный rewarded_x2 не включали.

## Проверки

- API build `npm run build -w @domino2/api` прошёл, обычная Prisma generation без изменения schema/lockfile.
- Новые целевые проверки **9/9**: defaultoff/provider guard, credentials/body tampering, запрет fallback на cookie, Origin, logout/ban/ownership/deletion, DB failure, cancel/status. `access-targeted.txt`. Это проверки добавленного поведения, не воспроизведение прежнего продуктового дефекта.
- Полный API runner `node apps/api/scripts/test-all.cjs`: **176/176,0fail,0skip**, `api-full.txt` (ранее167в S042).
- Новый guarded harness `docs/remediation/scripts/rewarded-request-local-db.mjs`: NodeHTTP только127.0.0.1/случайныйпорт + свежая реальная PostgreSQL `domino_remediation_s044_request_1` на127.0.0.1:55439. Все19существующих migrations + только локальный draftDDL. СтарыеБД не менялись. `migrations.txt`, `request-local-db.json`.
- Реальный BetterAuth lookup по обычному bearer и подписанный игровой bearer прошли. Неавторизованный запрос и подмена player отклонены до issue. Повторный issue даёт1попытку. Чужой игрок и вторая сессия не читают/не отменяют попытку; вторая сессия получает scopeconflict при issue.
- Подписанное синтетическое LevelPlay подтверждение даёт ровно1grant/200монет; повтор не начисляет. Status затем credited; cancel после grant остаётся credited. Другая собственная попытка отменяется. Logout отклоняет opaque/game bearer, бан отклоняет issue.1rewardledger, все reserved13сохранены. Это synthetic callback, **не реальный просмотр рекламы**.
- Cookie/Origin и expired status проверены модульно; реальный cookie login черезHTTP и полный Nestcontroller ещё не принимались.

## Границы и продолжение

OwnPG остановлен, свежаяБД сохранена (`cleanup.json`). Публичные rewarded маршруты не зарегистрированы, флаги игрыfalse, rewarded_x2 остаётся403. Нет productionмиграции/deploy/реальныхкошельков/Play/плагинов/повторныхсообщенийподдержке.

Следующий локальный шаг R09: review будущего HTTPcontroller и nativeflow/lifecycle initUSER_ID. Nonce должен быть установлен до SDK init; повтор/cancel при уже инициализированном SDK ещё требует решения. Контроллер должен сохранить существующие auth/origin/rate-limit middleware и правильно отображать ошибки. Внешний ConsoleTest ждёт ответаUnity. Реальные ad→callback→однократныйgrant, consent для13–17/global, app-ads.txt, retention/migration и rollout остаются открыты.

Повторение: только НОВАЯ БД `domino_remediation_sNNN_request_SUFFIX`; explicit DATABASE_URL на127.0.0.1:55439, NODE_ENV=test, отдельный BETTER_AUTH_SECRET с префиксом synthetic-only-, BETTER_AUTH_URL=http://127.0.0.1:4187, PUBLIC_APP_ORIGIN=http://127.0.0.1:4186. После19existing migrations запустить harness с --database и новым --output в evidence/session-NNN. Он откажет существующему output или населённойБД; reset не выполнять. Действующие токены не сохраняются в доказательствах.

Официальная справка черезContext7: [Bearer plugin](https://github.com/better-auth/better-auth/blob/main/docs/content/docs/plugins/bearer.mdx), [sessions](https://github.com/better-auth/better-auth/blob/main/docs/content/docs/concepts/session-management.mdx). При возможном cached logout перед действием проверяется текущая строкаБД.
