# R09 — работа без телефона, S045

24 октября2026. Ветка `codex/rewarded-acceptance`, база `7da9f2e`. Телефон отключён по сообщению владельца. **ADB не использовали. R09 остаётся открытой,27/42.**

## Подготовлены настоящие HTTP-запросы

`RewardedController` + `RewardedReviewModule.register(access)` подключаются только явной композицией локального стенда. В production AppModule не импортированы; без register у модуля нет маршрутов. Переданный RewardedRequestAccess имеет собственный defaultoff, внутренняя выдача также требует enabled. Настроек/ключей из окружения новый модуль сам не читает.

| Запрос локального стенда с prefix/api | Тело/результат |
|---|---|
| POST `/api/economy/daily-bonus/rewarded/attempt` | Только `{optIn:true}`; attemptId/expiresAt |
| GET `/api/economy/daily-bonus/rewarded/attempt/:attemptId` | Собственное состояние pending/cancelled/expired/credited |
| POST `/api/economy/daily-bonus/rewarded/cancel` | Только `{attemptId}`; действительное состояние после отмены |

Новых client complete/grant/consume/callback маршрутов нет. Известные ошибки имеют стабильные коды401/403/404/409/400; выключенный доступ503. Неизвестные ошибки БД/конфигурации дают только `rewarded_unavailable`503, без исходного текста. Успешные и обработанные ошибочные ответы имеют Cache-Control:no-store. При будущей регистрации должны сохраниться общие CORS/cookieOrigin/rate-limit middleware из main.ts; эта локальная композиция не доказывает их productionразвёртывание.

## Исправлено преждевременное завершение просмотра

В текущем клиентском коде пустой или непонятный ответ provider.show() считался завершённым просмотром и запускал запрос rewarded_x2. Ошибка спящая: реклама выключена, сервер не принимает неподтверждённый x2. Новая регрессия на обеих настоящих копиях app.js сначала дала6pass/2fail: undefinedresponse вызвал1claim вместо0.

Минимальная правка требует явного `{completed:true}` без error. Cancel/dismiss имеет приоритет над completed. Неопределённый/ошибочный результат больше не запускает запрос удвоения. Это только результат воспроизведения, **не доказательство права на монеты**. Legacy UI ещё не переключён на новый entitlement/nativeflow. Обычный daily сохранён; рекламы/флагов не включали.

## Проверки

- API build прошёл; `api-build.txt`.
- 3настоящих NestHTTPтеста: пустой модуль/defaultoff, маршрутизация, стабильные/обезличенные ошибки и отсутствие clientgrant. `controller-targeted.txt`.
- Полный API **179/179,0fail/0skip**, `api-full.txt`. Проверен после добавления контроллера; последующая правка только JSклиента APIне затрагивает.
- Свежая PostgreSQL `domino_remediation_s045_request_1`,127.0.0.1:55439,19существующих migrations+локальныйdraftDDL. Расширенный guarded harness `rewarded-request-local-db.mjs --nest-controller` использует настоящий NestController/AuthService/Prisma. СтарыеБД не трогали. `request-nest-db.json`, `migrations.txt`.
- Реальный локальный BetterAuth signInEmail по синтетическому account создал подписанную cookie. Через serverHTTP issue/status/cancel работают; изменение без Origin/с чужим Origin403. Оpaque/game bearer, повторный issue, чужой игрок/другая сессия, logout/ban также проверены. Cookie/токены только в памяти. Это не проверка браузерной domain/SameSiteполитики и не GoogleOAuth.
- Синтетический подписанный callback дал1grant200монет, повтор0.1rewardledger, reserved13сохранены; cancel после grant остаётся credited. Реальной рекламы не было.
- Клиент: `client-completion-red.txt`6pass/2fail сохранён; после правки `client-completion-green.txt` **8/8**. Source/www byte-identical. Root `npm run check` прошёл (`client-syntax.txt`).
- Существующая браузерная проверка обычного daily **1/1** (`daily-browser-green.txt`). Первый anchored grep выбрал0тестов; затем исправлен только фильтр, не тест/ожидания (`daily-browser-first-filter.txt`). Обновлённый самим запуском tracked test-results/.last-run.json восстановлен.

## Очистка и следующий шаг

OwnPG остановлен, свежаяБД сохранена (`cleanup.json`). Не использовали ADB, не собирали/ставилиAPK, не меняли production/кошельки/миграции/Play. AppModule и флаги монетизации не менялись. Текущий checkpoint локальный, безpush/remoteCI/плагинов. Unity повторно не писали; S043обращение ждёт ответа.

Далее внутри R09: решить SDK initUSER_ID/nonce lifecycle при повторе/отмене, затем подготовить клиентскую связь с этими маршрутами. Не использовать unsigned dynamicUserId как подтверждение попытки и не предполагать, что SDK можно переинициализировать произвольно. Nativeflow/реальный ad→S2S→grant, browsercookieполитика, consent13–17/global, app-ads.txt, поздниеcallback/retention/migration/rollout ещё открыты. Телефон потребуется для реальной nativeприёмки позже, не для выполненных здесь работ.

Источники через Context7: [Nest controllers/passthrough](https://github.com/nestjs/docs.nestjs.com/blob/master/content/controllers.md), [BetterAuth server sign-in](https://github.com/better-auth/better-auth/blob/main/docs/content/docs/basic-usage.mdx). Воспроизведение DB: требованияS044 к explicit loopbackURL/testenv/syntheticsecret и свежемуoutput сохранены, добавить `--nest-controller`.
