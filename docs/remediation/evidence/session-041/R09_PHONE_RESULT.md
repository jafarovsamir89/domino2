# R09 — тест рекламы на Android, S041

**Unity Ads подключилась, тестовое объявление загрузилось и показалось.** Проверена отдельная `.audit` сборка, версия из Google Play не заменялась. Монеты не начислялись. R09 остаётся открытой, общий счёт27/42.

## Что это дало

Теперь подтверждено на физическом телефоне, что связка приложения, LevelPlay и Unity Ads может показывать тестовую рекламу. Мы прошли от настройки кабинетов к реальному показу. Следующий самостоятельный этап — доказать на сервере, что просмотр относится к нужному игроку и выдаёт дополнительный бонус только один раз.

## Условия и доказательства

Телефон2201117SG, Android13/API33, экран1080×2400, WebView155.0.8059.43; мобильная сеть4G. Владелец подтвердил свой телефон и возраст18+. Это debug-проверка интеграции, не измерение скорости или релизная приёмка.

Изолированная сборка использует LevelPlay9.5.0, UnityAds SDK4.21.0 и адаптер5.15.0. Все зависимости и новый native bridge добавляются только в копию `.tmp/mobile-review`. Исходный `android/`, root/www и публичный API не изменены. [Метаданные APK](review-apk.json), [фактический результат](phone-check.json).

1. Сборка `testDebugUnitTest assembleDebug` прошла:2origin-policy tests и1template test; aapt подтвердил пакет `.audit`.
2. Существующая audit-сборка и новая имеют одинаковую debug-подпись. Обновление `install -r` прошло без удаления/очистки данных. Версия24/1.20 и обе даты установки/обновления Play-пакета до и после совпадают.
3. SDK инициализирован после явного запуска диагностики, с синтетическим случайным UserID. В Test Suite видны [Unity SDK и адаптер](01-unity-integration.png).
4. Перед загрузкой явно выбран [Test](02-test-mode.png); само включение Test Suite **не включает Test автоматически**. Сначала получено [Ad loaded successfully](03-loaded.png), затем [Ad shown successfully](04-shown.png).
5. [Экран настроек](05-privacy-settings.png) подтверждает GDPR consent=False, CCPA=True, COPPA=False для этой взрослой проверки. Разрешение AD_ID исключено из merged manifest. Это переданные SDK сигналы, а не независимый аудит обработки данных провайдером.
6. В SDK виден [ранее созданный Rewarded ad unit](06-configured-ad-unit.png), в его аукционе ironSource и UnityAds. Сам аукцион unit дополнительно не загружался. Test выбран и на этом экране; network-test результат не выдаётся за проверку обычного аукциона.

При тестовом объявлении появлялась карточка Unity Remote5 в Play. Агент закрыл её, установку не запускал. Причина открытия не установлена; нельзя утверждать, что переходов по объявлению вообще не было. На подтверждение режима Test и итогового статуса это не влияет.

## Как повторить

Зависимости проекта и JDK21 уже есть; повторная установка npm не требуется. Из корня:

```sh
node docs/remediation/scripts/build-review-apk.mjs --rewarded-suite --output docs/remediation/evidence/session-NNN/review-apk.json
node docs/remediation/scripts/device-review-preview.mjs
node docs/remediation/scripts/install-review-apk.mjs --metadata docs/remediation/evidence/session-NNN/review-apk.json --install --serial DEVICE_SERIAL
```

`session-NNN` должен быть новым: builder отказывает, если указанный файл уже существует, ещё до изменения копии. Обычный build без `--rewarded-suite` не добавляет рекламные зависимости; метаданные по умолчанию сохраняются в игнорируемой `.tmp/mobile-review/review-apk.json`. Старый S039 файл не перезаписывается. Installer проверяет SHA и `.audit`.

На телефоне: Проверка игры → Тест рекламы → два явных подтверждения → Подключиться → Открыть тестовый экран → Ad networks → UnityAds → **Test** → Load ad → Show ad. Не использовать Live и не устанавливать приложения из объявления. Test переключатель отдельный на разных экранах. Native SDK обращается к внешним сервисам рекламы; loopback4186 относится только к синтетическому игровому API.

## Что остаётся для R09

- Существующий entitlement использует **AdMob ECDSA**, не подходит для LevelPlay. Публичный `rewarded_x2` по-прежнему403, флаги доступности false.
- Нужны отдельная проверка LevelPlay S2S, точная связь подписанного события с авторизованным игроком/попыткой, банами/удалением, сроком, отменой и однократным upgrade нормального daily. Сумма из callback не определяет число монет.
- По официальному протоколу подпись охватывает timestamp/event/user/rewards и серверный private key; `dynamicUserId` и произвольные custom-параметры нельзя автоматически считать подписанными. Не подставлять их в финансовую модель без подтверждения. Реальный callback, формат/часовой пояс timestamp, повторные доставки и успешный ACK ещё не проверены.
- Нужен публично доступный **изолированный** HTTPS callback для проверки провайдера. Владелец сообщил, что отдельного тестового сервера нет. Следующий агент должен подготовить конкретное окружение/план и согласовать требуемое внешнее действие; работающий сервер/БД не использовать автоматически.
- Затем нужны обычный добровольный native flow, возрастные/региональные privacy-настройки реальных пользователей13–17+взрослые, app-ads.txt, retention/migration review и совместная приёмка. Hold my payments остаётся по решению владельца.

Положительный Test Suite результат не означает финансовое начисление, проверенный S2S, одобренные выплаты, готовность релиза или результат рекламного пилота R36. Изменений production/Play/кошельков, установки Codex plugins, пуша и удалённого CI в S041 нет.

## Официальные источники

- [Android SDK и init](https://docs.unity.com/en-us/grow/levelplay/sdk/android/sdk-integration).
- [Unity Ads adapter](https://docs.unity.com/en-us/grow/levelplay/sdk/android/networks/guides/unity-ads).
- [Test Suite и различие Test/Live](https://docs.unity.com/en-us/grow/levelplay/sdk/android/integration-test-suite).
- [Privacy API](https://docs.unity.com/en-us/grow/levelplay/sdk/android/regulation-advanced-settings).
- [Rewarded и dynamic UserID](https://docs.unity.com/en-us/grow/levelplay/sdk/android/rewarded-ads-integration).
- [S2S settings](https://docs.unity.com/en-us/grow/levelplay/platform/settings/server-to-server-callback), [точный формат callback и подписи](https://docs.unity.com/en-us/grow/levelplay/platform/settings/event-handlers).
