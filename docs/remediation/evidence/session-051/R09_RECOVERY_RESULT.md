# S051 — восстановление ожидающего бонуса

2026-10-25, `codex/rewarded-acceptance`, от `b22c6cf`. Владелец поручил несколько связанных шагов. **R09 остаётся открытой;27/42.**

Сделаны три части: сервер находит прежние попытки после нового входа; клиент восстанавливает их после перезагрузки без повторного просмотра; экран позволяет выбирать исходный день бонуса и независимо обновляет кошелёк после подтверждения разных дней.

## Поведение

- GET`/economy/daily-bonus/rewarded/recovery` существует только в явно подключённом review module с `owner_8day`. Текущие session/player/ban и owner/provider/app/unit проверяются; клиент не выбирает игрока. Чтение не создаёт попытку, не отменяет и не начисляет монеты.
- Восемь прошедших суток пересекают максимум9Baku-дней×3попытки=27. История ограничена этим окном/числом; повреждённая избыточная история отклоняется. После начисления за день вместо ожидающих соседних попыток возвращается подтверждённая. `canStart` — подсказка после normal-ledger/cap/count/active checks; POSTissue всё равно заново проверяет правила и opt-in.
- Новый экземпляр UI сначала делает GET. Найденные попытки можно проверить без native provider. Потерянный ответ issue/discovery сначала восстанавливается через GET; повторное нажатие не вызывает автоматически новый POST/рекламу. Старый ответ после logout/dispose игнорируется.
- Идентификаторы рекламы и токены не сохраняются клиентом. В snapshot только номер строки/день/исходная сумма/статус. Исходный день не занимает сегодняшнее начисление. Выбор дня обновляет соответствующий статус; кошелёк берётся с сервера.

Изменены rewarded entitlement/access/controller и их tests; source/www app/Flow/Panel/translations/CSS, UI fixtures/tests. Legacy financial policy/consume/schema/production AppModule и flags не менялись. Новый status contract показан **только в локальной harness composition**, поверх настоящего `EconomyService.getDailyBonusStatus`; production endpoint его не выдаёт.

## Проверки

| Проверка | Результат |
|---|---|
| API build / full discovered tests |189/189,0skip; [api-tests.txt](api-tests.txt) |
| Source/www client |54/54, включая16новых recovery tests; [client-tests.txt](client-tests.txt) |
| Auth navigation/economy |10/10; [adjacent-tests.txt](adjacent-tests.txt) |
| Actual main UI AZ/EN/RU root/www |7/7; [browser-first.txt](browser-first.txt) |
| Обычный daily / root check |1/1, check проходит; [normal-daily-browser.txt](normal-daily-browser.txt), [root-check.txt](root-check.txt) |
| Actual Nest/Auth/Economy/PG + headless main UI |[recovery-browser-db.json](recovery-browser-db.json) |
| Тот же путь на физическом Android13 audit WebView |[recovery-phone-db.json](recovery-phone-db.json) |
| Fresh audit APK/JDK21/native JVM |169tasks/12JVM, build success; [android-build.txt](android-build.txt) |

В двух успешных независимых freshDB проверках: настоящая перезагрузка документа восстанавливает2дня; старые credentials после удаления session получают401; свежая session того же аккаунта видит прежний бонус, другой аккаунт пуст. Позднее подписанное **синтетическое** подтверждение после logout начисляет исходные200; повтор ACK без денег. Сегодняшние200 начисляются отдельно. В UI ни одного POSTissue/cancel и native bind/show. Три ad_reward ledger/600монет на весь стенд (включая отдельный sibling-cap fixture), reserved13 сохранён, закрытая сверка ledger/wallet residual0. Реальные SQL проверки:1/7/8days, exact8day expired,9day excluded, sibling winner, ban/delete.

Начальный browser-DB прогон остановился на1400vs400: настоящий AuthService добавляет штатный starter1000, который тест не учёл. Сохранён [первый результат](browser-db.txt) и нетронутая DB`domino_remediation_s051_recovery_1`. Исправлена подготовка/сверка: настоящий starter явно вызван и проверен отдельным ledger1000/typegrant; повторный вход/reload не повторяет его. Финальные ожидаемые балансы1400→1600→1800. Это не дефект продукта и не ослабление финансового утверждения. Успешные DB`_2` и `_phone` свежие,19migrations+draft, исходная DB не очищалась.

## Артефакты и ограничения

Снимки [браузер](browser-main-recovered.png) и [телефон](phone-main-recovered.png) просмотрены. День на экране — Asia/Baku, может отличаться от календарного дня владельца в America/Los_Angeles.

APK SHA`dc8b4a39c91827e86df12135c319f07d32b3f0567301b3cb9bf8fb8019ac46b4`,34725899bytes, `.audit`, native load/show compile-timefalse. Сохранён только локально `.tmp/mobile-review/artifacts/s051-rewarded-recovery.apk`, [metadata](install-metadata.json), [aapt](apk-badging.txt). Play version/install/update до/после идентичны. Только audit install-r/forceful document navigation; Play/data не тронуты. Native SDK/ad init/load/show не выполнялись, реальные деньги/провайдер не участвовали. Runtime gate override существовал только в тестовом браузере/audit WebView.

Собственная PostgreSQL55439 остановлена,3freshDB сохранены. Созданные harness reverse4186/CDPforward удалены, HTTP/static серверы закрыты. Нет deploy/migrations production/публичного callback/плагина/push.

Повторение: создать новую DB по проверяемому шаблону, применить19existing migrations с явным loopback DATABASE_URL, запустить `docs/remediation/scripts/rewarded-recovery-local-db.mjs --database FRESH_DB --output FRESH_RESULT`; нужны NODE_ENV=test и synthetic-only BETTER_AUTH_SECRET. Для телефона `--phone --serial EXPLICIT_DEVICE`, актуальный audit APK и свободный4186; helper сам ограничивает endpoints/удаляет свои mappings. Никогда не переиспользовать populatedDB или существующий output.

Для завершения R09 ещё нужны Console callback validation/ответ Unity, ordinary-auction Test mode, native init identity/retry и actualad→SSV→wallet/consent/release wiring. Нельзя считать это включённой монетизацией. По новому запросу владельца следующий независимый пункт в этой же серии — физическое сопоставимое измерение R15, пока ответа Unity нет.
