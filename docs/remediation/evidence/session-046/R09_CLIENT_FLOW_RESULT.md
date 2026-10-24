# R09 — клиент ждёт серверное подтверждение, S046

24 октября2026. Ветка `codex/rewarded-acceptance`, база `20c542d`. Владелец просит продолжать без телефона. **R09 открыта,27/42.**

## Подготовленный клиент

Новый `js/rewardedDailyFlow.js` и идентичная копия в www содержат `RewardedDailyFlow` и `createRewardedDailyApi(account)`. Модуль выключен по умолчанию и **не импортирован в игру/index**. Не изменяли флаги, существующий ordinarydaily или старую UIкнопку. Это подготовленная часть будущей связи с S045маршрутами, не включённая реклама.

APIhelper использует существующий authenticated `account.platformRequest` и передаёт только optIn:true/attemptId. Новых playerId/сумм/клиентских assertion о награде нет. Flow не меняет кошелёк, не сохраняет данные в storage, не ведёт логи, не запускает таймеры/бесконечный polling. Публичный snapshot содержит только phase/code/busy/доступные действия, без nonce/токенов.

| Ситуация | Поведение |
|---|---|
| Начать после явного действия пользователя | Issue → status → привязка nativeUSER_ID → show → status |
| SDK сообщил завершение/закрытие/ошибку | Проверить сервер; самостоятельно не начислять и не отменять |
| Сервер ещё не подтвердил | Pending; повторный start только проверяет status, не показывает вторую рекламу |
| Сервер credited | Показать credited, без локального прибавления монет |
| Явная отмена | Доверять ответу cancel; гонка с уже выполненным grant остаётся credited |
| Двойное нажатие/start/check/cancel во время операции | Одна выполняющаяся операция, без второго issue/show |
| Logout/reset/dispose, поздний ответ | Игнорировать старое поколение; не обновлять новый аккаунт и не запускать следующую рекламу |
| SDK уже привязан к другому nonce | Blocked; не подменять USER_ID и не предполагать переинициализацию |

## Факты SDK и ограничения повторов

[Unity initialization](https://docs.unity.com/en-us/grow/levelplay/sdk/android/sdk-integration) и [checklist](https://docs.unity.com/en-us/grow/levelplay/sdk/android/sdk-integration-checklist) требуют USER_ID до init. [Rewarded guide](https://docs.unity.com/en-us/grow/levelplay/sdk/android/rewarded-ads-integration) описывает независимый порядок onAdClosed/onAdRewarded. [S2Ssignature](https://docs.unity.com/en-us/grow/levelplay/platform/settings/event-handlers) использует initUSER_ID; dynamicUserId в её документированную формулу не входит. Сверено через web/Context7; новая полная копия внешних документов в репозиторий не добавлялась.

Документированного способа заменить initUSER_ID после успешной инициализации в просмотренных источниках не найдено. Это **не доказательство абсолютной невозможности** и не разрешение сменить личность через unsigneddynamicUserId. Повтор init после неудачи описан отдельно и не доказывает смену пользователя после успеха.

Кандидат сохраняет `_nativeAttemptId` через JSreset и фиксирует его до ожидания bind. Будущий nativeadapter обязан самостоятельно удерживать настоящую привязку весь срок жизниSDK, включая пересоздание JSобъекта. `bindAttempt({attemptId,expiresAt})` должен возвращать `{bound:true,attemptId}` только для фактически допустимой привязки до SDKinit; `show` не вправе создавать финансовое право. **Настоящего nativeadapter здесь ещё нет.** Немедленный повтор после explicitcancel/новогоnonce и поздний первый callback требуют отдельной политики/приёмки до выпуска; перезапуск приложения как пользовательское правило не назначали.

## Проверки

- `server/test/rewarded-daily-flow.test.js`: **20/20** по двум настоящим JSкопиям. Defaultoff, missingadapter, SDKtrue/close/undefined, позднийservercredit, сериализация, cancelrace/networkfailure, logout во времяissue, reset во времяbind, nonce mismatch, malformedresponse, expired/credited до показа, SDKerror/statusretry, dispose/reentrantlogout/observererror, строгие APIpayload/пути. `client-flow-targeted.txt` — первый зелёный запуск; `client-flow-final.txt` — итоговый. Новый код, продуктового red до его появления не заявляем.
- Syntax обеих копий и harness + rootmojibake прошли. Source/www byte-identical.
- СвежаяБД `domino_remediation_s046_request_1` только127.0.0.1:55439,19existing migrations+draftDDL; старыеБД не меняли (`migrations.txt`). Harness запущен с `--nest-controller --client-flow`, explicit testenv/loopbackDATABASE_URL/syntheticsecret, как в S045.
- **Настоящий JSмодуль/APIhelper → HTTP → настоящий NestController/AuthService/Prisma/PostgreSQL. Nativeadapter FAKE.** После fake SDKcompleted/reward99999 состояние pending, баланс200. Повтор start не запускает рекламу заново: bind1/show1. Поздний подписанный SYNTHETICcallback выполняет транзакцию, check показывает credited/баланс400; duplicate даёт0, cancel после grant остаётся credited. `client-nest-db.json`.
- В общем harness2независимых syntheticgrant: прежний backendсценарий и новый клиентский;2ledger/400монет суммарно, reserved13сохранены. Это не2награды одному игроку. Cookie/bearer/ownership/logout/ban проверки S045 сохранены.
- APIисходники и финансовая транзакция не менялись; полный API179/179 остаётся результатом S045, не новым S046запуском. Полный сервер/browser/nativeнабор не повторяли; UI/реальныйSDK сейчас не принимались.

## Передача

OwnPG остановлен, свежаяБД сохранена (`cleanup.json`). БезADB/APK/production/Play/активацииcallback/сообщенийподдержке/плагинов/push/remoteCI. ПоддержкаUnity ждёт ответа по S043обращению; её повторно не беспокоили.

Следующий независимый шаг: подготовить origin-restricted nativebridge по этому контракту и проверить его компиляцию/состояния без телефона. Затем настоящая SDKпривязка и ad→callback→grant требуют ADB/провайдера. До включения нужны retry/late-firstcallback, serveractivation/migrations/retention/consent13–17/global/app-ads/rollout. Не объявлять R09 закрытой по тестам с fakeadapter.
