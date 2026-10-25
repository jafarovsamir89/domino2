# S050 — экран ожидания рекламного бонуса

2026-10-25, ветка `codex/rewarded-acceptance`, исходный HEAD `8b32e2f`. **R09 остаётся открытой, общий счёт27/42.** Владелец подтвердил подключение телефона и отсутствие ответа поддержки Unity.

## Что изменено и что это даёт

- В карточку ежедневного бонуса подключён отдельный экран «Смотреть рекламу / Проверить начисление / Закрыть». Закрытие прячет подробности, не отправляет отмену. Игрок может вернуться к проверке ожидаемого бонуса.
- Повторная проверка использует ту же попытку. Она не повторяет просмотр. Сообщение SDK о досмотре само по себе не меняет баланс: нужен статус сервера, затем загрузка кошелька. При ошибке загрузки кошелька можно проверить снова.
- Старый ответ после выхода, смены аккаунта/сессии или нового запроса не перезаписывает актуальный кошелёк. Новый профиль не использует старый путь `rewarded_x2`.
- Тексты AZ/EN/RU, статус для screen reader, кнопки от44CSSpx. Проверка носителем языка этим не заменяется.

Продуктовые файлы: `js/rewardedDailyPanel.js`, `js/app.js`, `js/translations.js`, `index.html`, `css/style.css`, идентичные копии в `www/`. Финансовый backend не менялся. Никакого локального прибавления монет в продуктовом экране нет; числа200/400 в диагностическом fixture явно синтетические.

## Границы включения

Клиентский `adsEnabled` остался **false**. Даже после его отдельного включения нужны одновременно авторизованный аккаунт, версия server contract `owner_8day_v1`, `rewardedAvailable=true`, полученный обычный бонус и провайдер с `bindAttempt/show`. Подключение панели не создаёт попытку и не запускает рекламу автоматически.

Этот новый server contract пока **не добавлен к production daily endpoint**, а native review adapter не является готовым provider для основного экрана. В production AppModule маршруты рекламного кандидата не регистрировались. Наличие подготовленного UI не означает готовность включения рекламы.

## Проверки

| Проверка | Результат и доказательство |
|---|---|
| Логика клиента source/www |38/38, включая8новых проверок stale account/session/request и запрета legacy claim; [client-tests.txt](client-tests.txt) |
| Соседние auth-navigation/economy |10/10; [adjacent-tests.txt](adjacent-tests.txt) |
| Новый экран в настоящем приложении root/www, AZ/EN/RU |7/7, в том числе default-off, неподдержанный contract, close без cancel, позднее подтверждение, ошибка/повтор загрузки кошелька,1issue/1bind/1show/0cancel, logout; [panel-browser.txt](panel-browser.txt) |
| Обычный ежедневный бонус |1/1 browser; [normal-daily-browser.txt](normal-daily-browser.txt) |
| Синтаксис/кодировка |`npm run check` проходит; [root-check.txt](root-check.txt) |
| Native build |JDK21,169tasks,12JVMtests без failures/skips, real LevelPlay9.5.0; [android-build.txt](android-build.txt) |
| Физический Android13 |Plugin status подтверждает доступность и gatefalse. Реальный Panel/Flow на3языках, синтетические API/playback, close/recheck/credit/expiry, нет overflow, кнопки>=44CSSpx; [android-ui.json](android-ui.json) |
| Сохранность Play |Scoped versionCode/versionName/firstInstallTime/lastUpdateTime совпадают до/после; [play-before.txt](play-before.txt), [play-after.txt](play-after.txt) |

Первый browser прогон6fail/1pass был ошибкой подготовки тестового входа: fixture сделал аккаунт авторизованным, но не вызвал реальный `syncStartAuthGate`. Исправлена подготовка, утверждения сохранены; [browser-first.txt](browser-first.txt), [browser-second.txt](browser-second.txt). Не выдаём эту ошибку теста за исправленный дефект продукта. Будущие E2E сохраняют снимки в собственный `test-results`, не поверх исторических S050.

Снимки проверены визуально: [Android ожидание RU](android-pending-ru.png), [Android подтверждение AZ](android-credited-az.png), [Android подтверждение EN](android-credited-en.png), [native gate](android-native-status.png), [карточка в браузере](panel-credited.png).

**На телефоне не вызывались реальный SDK init/load/show, внешняя реклама или финансовый сервер.** Браузерные API и телефонные ответы были синтетическими. Фактическая реклама→SSV→кошелёк этой проверкой не принята. Ранее183API и реальные локальные PostgreSQL proofs относятся к S049; в S050 backend не менялся и широкая API suite не повторялась.

## Артефакт и повторение

Новая debug `.audit` сборка установлена через `install -r`; Play пакет не был целью команд. APK SHA256 `4da0faca37274c0818f8dc069d2f84cd7039882d689e216db1b97f1cd151b878`,34724215bytes. [aapt badging](apk-badging.txt), [исходные metadata](review-apk.json), [metadata сохранённой копии](install-metadata.json), [проверка SHA](preserved-apk-check.txt). Копия только локально: `.tmp/mobile-review/artifacts/s050-rewarded-flow.apk`; не отправляется в Git. На другом компьютере потребуется свежая сборка, metadata не заменяют APK.

```sh
node --test server/test/daily-ad-capability.test.js server/test/rewarded-daily-flow.test.js server/test/daily-rewarded-integration.test.js
npx playwright test e2e/rewarded-panel.spec.mjs
npx playwright test e2e/domino.spec.mjs --grep 'daily bonus flow'
node docs/remediation/scripts/build-review-apk.mjs --rewarded-flow --output FRESH_IGNORED_METADATA_PATH.json
```

Для телефона сначала проверить `.audit` identity и SHA, затем установить отдельный audit APK на явно указанный serial. В его WebView открыть `https://localhost/review/rewarded-flow.html`, проверить статус; затем `https://localhost/review/rewarded-panel.html`. Нажать «Смотреть рекламу» в явно тестовом экране, закрыть/проверить, имитировать подтверждение и проверить снова. Новый тест→смотреть→имитировать истечение→проверить оставляет200. Диагностический экран не импортирует AccountClient/SDK, CSP запрещает connect. Скрипт проверки S050 был task-local `.tmp/s050-ui/device-ui.mjs`, автоматические product browser проверки находятся в Git.

Убраны созданные этой сессией CDPforward9227 и reverse4186. Нет новой БД/туннеля, deploy/migration/production wallet/Play update/плагина/поддержки/push; [cleanup](cleanup.json). Несвязанный `PULSE/` оставлен без изменений.

## Следующий шаг

Подготовить восстановление ожидающей попытки при перезагрузке WebView/повторном входе, с проверкой владельца/дня/срока и без автоматического повторного показа. Текущий flow хранит попытку только в памяти. Затем явная локальная review composition нового contract с `owner_8day` и настоящей авторизацией. Отдельно остаются ответ Unity о ConsoleTest, проверка обычного аукциона в Test mode, native binding/retry после успешного init, фактическое подтверждение сети и аудитория/consent. Наличие телефона само по себе не разрешает включить текущий native gate или реальную монетизацию.
