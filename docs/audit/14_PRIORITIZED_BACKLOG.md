# Приоритетный backlog

**Рабочая точка входа:** [единый план исправления и улучшения](REMEDIATION_PLAN.md). Там задачи расположены по зависимостям и объединены с действиями/приёмкой; этот backlog сохраняет основание и оценки аудита.

> Аудит 17 октября 2026. Репозиторий `jafarovsamir89/domino2`, ветка `release/play-prep`, коммит `508932ebeb45cde744e3e1dbd92bc5592ca66093`. Проверки только локальные. Игра уже опубликована в Google Play; production и реальные кошельки не изменялись.


Оценки — человеко-дни implementation+локальной проверки, диапазоны для небольшой знакомой с кодом команды. Независимый release QA, ожидание store review и согласование правил могут увеличить календарное время. Не складывать все задачи в обещание завершить весь список за 90 дней. P0 закрывается до монетизации/масштабирования; P1 — основной игровой опыт; P2 — следующая полезность. P3 оформлен отдельными задачами R-34–R-38 после gates.

«Подтверждено» означает указанный локальный тест/кодовый контракт, не частоту в production. «Риск» и «UX-гипотеза» требуют проверки, а не автоматического переписывания. Числа ожидаемого улучшения retention/revenue не придуманы.

## Объём и зависимости

Всего 42 задачи:9P0,23P1,5P2,5P3. Общая сумма диапазонов 93–177 человеко-дней; P3 не входит автоматически в 90-дневное обязательство.

| ID / P | Задача и основание | Файлы / подсистема | Дни | Зависимости | Риск / ответственный |
|---|---|---|---:|---|---|
| R-01 P0 | [Привязать восстановление места к владельцу](07_SECURITY_ANTICHEAT.md); воспроизведено | server/DominoRoom.js:401,1324 | 2–4 | — | высокий; Backend + independent QA |
| R-02 P0 | [Однократное daily начисление/upgrade](08_ECONOMY_BALANCE.md); воспроизведено | economy.service.ts:1490–1506 | 2–4 | — | высокий; Backend + DB QA |
| R-03 P0 | [Связать reserve/settle/refund с matchId](08_ECONOMY_BALANCE.md); воспроизведено | economy.service.ts:1983–1990 | 3–5 | — | высокий; Backend + DB QA |
| R-04 P0 | [Сохранить snapshots при shutdown](05_MULTIPLAYER_RECONNECT.md); воспроизведено | DominoRoom.js:1425,4337 | 3–5 | R-01 | высокий; Game backend + QA |
| R-05 P0 | [Убрать admin defaults из read path](08_ECONOMY_BALANCE.md); воспроизведено | economy.service.ts:461–515 | 1–2 | — | средний; Backend |
| R-09 P0 | [Server entitlement для rewarded x2](08_ECONOMY_BALANCE.md); воспроизведено | economy.service.ts:1466–1474 | 3–5 | R-02 | высокий; Backend + monetization QA |
| R-27 P0 | [Triage и совместимое обновление critical dependencies](07_SECURITY_ANTICHEAT.md); версии/advisory подтверждены | package-lock.json; Capacitor8.3.1 | 3–6 | R-06 | высокий; Mobile/backend + reviewer |
| R-31 P0 | [Применять очки рыбы в серверном 101](CONTINUATION_ANALYSIS.md); воспроизведено:79→129 не применяется | server/DominoRoom.js:3798,3869 | 2–4 | R-25 | высокий; Game backend + independent QA |
| R-32 P0 | [Обрабатывать drawToOpen в онлайн 101](CONTINUATION_ANALYSIS.md); воспроизведено:seed225, player=-1 | server/DominoRoom.js:1890;shared/domino-rulesets.cjs:611 | 2–3 | R-25 | средний; Game backend + client QA |
| R-06 P1 | [Восстановить clean server install](13_QA_TEST_RESULTS.md); сборка fail подтверждена | server/package.json,server/package-lock.json | 1–2 | — | низкий; Build engineer |
| R-21 P1 | [Заметный путь удаления аккаунта](12_ANDROID_GOOGLE_PLAY.md); пробел UI подтверждён; Console неизвестен | index.html:179,620;delete-account.html:105 | 1–3 | — | средний; Frontend + owner |
| R-08 P1 | [Исправить параметр instant win](02_GAMEPLAY_RULES.md); контрактный дефект подтверждён | shared/domino-rulesets.cjs:100;app.js:19894;DominoRoom.js:3489 | 1–2 | — | средний; Game logic + QA |
| R-16 P1 | [Отменять устаревший async turn](04_FREEZES_AND_STATE.md); controlled test подтверждён | js/app.js:19908–19980 | 2–4 | — | высокий; Game frontend + QA |
| R-14 P1 | [Упростить дорогие постоянные эффекты](03_PERFORMANCE_FPS.md); измерено, группа CSS | css/style.css:6020,6364,6420 | 3–6 | — | средний; Frontend perf + visual QA |
| R-07 P1 | [Fresh database daily quest seed](08_ECONOMY_BALANCE.md); воспроизведено | economy.service.ts:1586,3240;prisma migrations | 1–2 | R-05 | низкий; Backend |
| R-11 P1 | [Минимизировать public presence](07_SECURITY_ANTICHEAT.md); воспроизведено | server/index.js:/api/realtime/players;livePresence.js | 1–2 | R-01 | средний; Backend |
| R-12 P1 | [Убрать hidden hands из takeover AI](02_GAMEPLAY_RULES.md); paired-world подтверждён | server/ai.js:101–125;DominoRoom.js:2502 | 2–4 | — | средний; Game logic + independent QA |
| R-10 P1 | [Определить отзыв игрового допуска](07_SECURITY_ANTICHEAT.md); риск по коду | server/platformAuth.js:27–44 | 2–4 | R-01 | высокий; Auth/backend |
| R-29 P1 | [Durable outbox и reconciliation результата](05_MULTIPLAYER_RECONNECT.md); риск, fault drill не завершён | DominoRoom.js:3108–3164,4337 | 4–7 | R-03,R-04 | высокий; Backend + DB QA |
| R-25 P1 | [Вернуть полную тестовую матрицу в CI](13_QA_TEST_RESULTS.md); пробел/падения подтверждены | server/package.json;e2e/domino.spec.mjs;CI отсутствует | 3–6 | R-06 | средний; QA/build |
| R-17 P1 | [Phase recovery вместо boolean watchdog](04_FREEZES_AND_STATE.md); риск по механизму | js/app.js:763–768 | 2–4 | R-16 | высокий; Game frontend |
| R-18 P1 | [Voice ICE contract и NAT проверка](05_MULTIPLAYER_RECONNECT.md); config defect; NAT неизвестен | server/index.js:63–95;js/voice.js | 2–4 | — | средний; Realtime/mobile QA |
| R-13 P1 | [Применить реальный canvas pixel ratio](03_PERFORMANCE_FPS.md); измерено | js/konvaBoardRenderer.js:238–246 | 1–2 | — | средний; Renderer engineer |
| R-15 P1 | [Сократить искусственный startup](03_PERFORMANCE_FPS.md); код подтверждён | js/splash.js:3–4,83–108 | 1–2 | — | низкий; Frontend/mobile QA |
| R-23 P1 | [Touch targets и доступная рука](06_UI_UX_DESIGN.md); размеры/скриншоты | index.html;ui-capture.json;renderer.js | 2–4 | R-14 | средний; UX/frontend + device QA |
| R-28 P1 | [Метрики, vitals и экономический audit trail](11_RETENTION_GROWTH_ASO.md); доступ/наблюдаемость неизвестны | server/instrument.js;apps/api/src/instrument.ts | 3–5 | — | средний; Backend/product analytics |
| R-30 P1 | [Реестр прав на assets и policy сверка](12_ANDROID_GOOGLE_PLAY.md); доказательства не найдены | assets/;privacy.html;Play Console | 1–3 | — | низкий; Owner + legal/content reviewer |
| R-33 P1 | [Утвердить daily faucet и бюджет монет](CONTINUATION_ANALYSIS.md); политика подтверждена; намерение требует решения | economy.service.ts:125,1399;coin-economy-simulation.cjs | 2–4 | R-02,R-05,R-07 | средний; Product owner + economy analyst |
| R-39 P1 | [Отвязать liveness от зависания Redis](05_MULTIPLAYER_RECONNECT.md); воспроизведено: оба health timeout1500 мс | server/index.js:197,233;server/health.js | 1–2 | R-25 | средний; Backend + DevOps + independent QA |
| R-40 P1 | [Останавливать solo таймер в меню паузы](SINGLE_ANDROID_AUDIT.md); воспроизведено на Android | js/app.js:17210,13184,13223 | 1–2 | R-16,R-17 | средний; Frontend + mobile QA |
| R-41 P1 | [Добавить forward migrations текущей social schema](SINGLE_ANDROID_AUDIT.md); 18 миграций применены; DM500 и schema drift подтверждены | packages/db/prisma/schema.prisma:509,516,529,790;packages/db/prisma/migrations | 2–4 | R-25 | средний; Backend/DB + independent QA |
| R-42 P1 | [Сверять итог монет UI с фактическим settlement](SINGLE_ANDROID_AUDIT.md); воспроизведено: UI −20 при фактических +180 | js/app.js:19417;js/renderer.js:1376–1383;economy.service.ts:2074–2116 | 1–2 | R-03,R-25 | средний; Frontend/backend contract + QA |
| R-20 P2 | [Быстрый локальный solo до auth](06_UI_UX_DESIGN.md); UX-гипотеза | index.html login;js/app.js bootstrapAccount | 3–5 | R-15,R-25 | средний; Frontend + product |
| R-22 P2 | [Цельная локализация AZ/RU/EN и TR pilot](06_UI_UX_DESIGN.md); скриншоты подтверждают строки | js/translations.js;index.html;cosmetics UI | 2–4 | — | низкий; Frontend + native speaker |
| R-19 P2 | [Music/effects/master mute](06_UI_UX_DESIGN.md); probe подтверждён | js/sounds.js:88,96,249–259 | 1–2 | — | низкий; Frontend/mobile QA |
| R-24 P2 | [Читаемый стол и центр поля](06_UI_UX_DESIGN.md); UX-оценка screenshots | css/style.css game screen;table skin assets | 2–4 | R-14 | низкий; Designer/frontend |
| R-26 P2 | [Разделять монолит и единый rules source](01_ARCHITECTURE.md); долг подтверждён | app.js;DominoRoom.js;shared/board/model duplicates | 8–14 | R-25,R-08,R-16 | высокий; Senior engineer + reviewer |
| R-34 P3 | [Проверить onboarding эксперимент](11_RETENTION_GROWTH_ASO.md); продуктовая гипотеза | js/app.js start/auth/tutorial;analytics | 2–4 | R-20,R-28;Gate60 | низкий; Product + frontend + analyst |
| R-35 P3 | [Проверить rematch и приглашение после партии](11_RETENTION_GROWTH_ASO.md); продуктовая гипотеза | js/app.js result/invite;social module | 3–5 | R-01,R-28,R-31,R-32;Gate60 | средний; Frontend + backend QA + product |
| R-36 P3 | [Ограниченный rewarded pilot](10_MONETIZATION_BUSINESS.md); будущая монетизация, сейчас выключена | ads integration;economy reward entitlement | 4–7 | R-02,R-09,R-28,R-33;Gate90 | высокий; Monetization engineer + independent QA + owner |
| R-37 P3 | [Пилот ASO одной локали](11_RETENTION_GROWTH_ASO.md); рыночная гипотеза | Play listing;localized screenshots/translations | 2–4 | R-22,R-28,R-30;Gate90 | низкий; Owner + native speaker + designer |
| R-38 P3 | [Небольшой косметический сезон](16_DOMINO_NEXT_VISION.md); продуктовая гипотеза | cosmetics catalog;assets;season UI | 5–10 | R-14,R-28,R-30,R-33;Gate90 | средний; Designer + frontend + content owner |

## Приёмка

| ID | Критерий готовности и проверка | Ожидаемый эффект |
|---|---|---|
| R-01 | Чужая identity отклонена; свой reconnect сохраняет руку/место | Защита аккаунта и партии |
| R-02 | 100 параллельных/retry дают ровно entitlement reward | Предотвращение инфляции |
| R-03 | Старый result не трогает новые резервы; повтор безопасен | Правильный баланс и доверие |
| R-04 | SIGTERM restore совпадает по hand/turn/match; settlement один | Партия переживает обновление |
| R-05 | GET не меняет stake/price/commission; fresh seed повторяем | Рабочее управление экономикой |
| R-09 | Только подтверждённый уникальный ad event начисляет reward | Защита будущего дохода |
| R-27 | Reachability записана; patched runtime; OAuth/navigation regression | Снижение известных рисков |
| R-31 | Blocked fixture даёт 129 и один финал; carry/tie/2v2 и settlement без дублей | Верный результат и расчёт ставки |
| R-32 | Раздача без положительных дублей начинает допустимый ход;28tiles, руки/базар/snapshot согласованы | Устранение остановки до первого хода |
| R-06 | npm ci root/server на чистом runner, pinned versions | Воспроизводимый release |
| R-21 | Profile→request deletion; web request; локальная обработка/retention | Права пользователя и Play readiness |
| R-08 | 35 при false не завершает матч; обе реализации parity | Предсказуемые правила |
| R-16 | После reset старый Promise не меняет score/phase | Нет повреждения новой партии |
| R-14 | Отдельные A/B; device p95 target; допустимый ход различим | Плавность/graphics memory |
| R-07 | Fresh migrations→normal daily без ручного quest | Рабочий новый инстанс |
| R-11 | Public response не раскрывает private codes/sessionIds | Приватность комнат |
| R-12 | При одинаковой публичной информации решения независимы от secret hand | Честные командные боты |
| R-10 | Ban/logout/delete действует в установленный SLA; expiry tests | Управляемая авторизация |
| R-29 | API timeout/process kill не теряет итог и не удваивает credit | Надёжность расчётов |
| R-25 | 243 tests discovered, актуальные contracts E2E, gates артефактов | Предотвращение регрессий |
| R-17 | Recovery отменяет старую работу и сверяет state; нет двойного хода | Возврат управления |
| R-18 | Config STUN не теряется; Wi-Fi/LTE relay-only разговор | Рабочая социальная функция |
| R-13 | Layer ratio соответствует quality preset; точки/стрелки точны | Меньше buffer memory |
| R-15 | Bounded splash; cold/warm/offline interactive metrics | Меньше отказов до партии |
| R-23 | Удобные hit areas, 7 tiles, TalkBack/focus и 320px | Меньше промахов |
| R-28 | DeploySha+финальные события; dashboard; тестовый alert доставлен | Измеримые решения и быстрый rollback |
| R-30 | Источник/лицензия каждого asset, Data Safety/retention сверены | Снижение release/legal риска |
| R-33 | Утверждён cap/cycle, бюджет партий и бесплатный путь;7/30/90 sensitivity и closed-ledger метрики | Управляемый выпуск и доступность игры |
| R-39 | При SIGSTOP Redis liveness отвечает <500 мс; readiness503 с deadline<1000 мс; после recovery200, игровое состояние сохранено | Предсказуемый health и меньше ложных перезапусков |
| R-20 | Без аккаунта легальная solo партия; online identity защищена | Быстрая активация |
| R-22 | Нет смешения system text; long labels/number plurals | Понимание и региональный рост |
| R-19 | Mute подавляет SFX; настройки сохраняются; audio focus | Ожидаемое поведение звука |
| R-24 | 20/28 tiles читаемы; zoom/reset; тест с игроками | Быстрее находить ход |
| R-26 | Один модуль за PR, contracts и parity сохранены | Дешевле следующие изменения |
| R-34 | Один вариант, first-start/first-match events, заранее заданы метрика и stop rule; сравнение когорт | Проверка активации без обещанного uplift |
| R-35 | Два клиента проходят invite/rematch, duplicate/expired корректны; измерен invite→completed match | Меньше шагов до совместной игры |
| R-36 | SSV/replay/refund тесты, частотный лимит, opt-in, rollout/rollback; измерены net revenue и retention | Измерение дохода без нарушения игры |
| R-37 | Материалы соответствуют продукту, носитель проверил; conversion и качество когорты сопоставлены | Проверка регионального спроса |
| R-38 | Права на контент, budget устройств, сроки и sinks; косметика не меняет правила/силу | Проверка спроса; нужна постоянная поддержка |
| R-40 | Solo меню 60 с не меняет поле/руки/очки/очередь; resume сохраняет остаток; 20 циклов/force-stop; online deadline продолжает идти | Solo не проигрывается во время заявленной паузы |
| R-41 | Empty/upgrade migrate deploy без reset; zero unexpected schema drift; DM read/send/read-state/retry и локальный fcm_token CRUD | Воспроизводимая установка и рабочие личные сообщения |
| R-42 | UI net равен delta(balance+reserved) для win/loss/draw/refund/2v2; duplicate settlement не меняет summary | Понятный финансовый итог, совпадающий с кошельком |

## Как поручать AI coding agents

Один агент получает один ограниченный модуль, ID, исходный evidence, контракт до/после и acceptance. В PR он объясняет изменение и приводит результаты relevant tests. Другой reviewer проверяет тест на независимость от реализации и воспроизводит регрессию. Деньги, ownership, результат матча, migrations и signing нельзя закрывать только самоотчётом исполнителя.

Самостоятельно подходят R-06, R-07, R-08, R-13, R-15, R-19, R-22 при фиксированном scope. R-01/02/03/04/09/10/16/17/29 требуют независимого тестирования конкурентности/таймеров/identity. R-14/23/24 требуют реального устройства и визуальной проверки. R-21/30, OAuth/Play Console, правила 101 и тексты ASO подтверждает владелец/профильный специалист.

P3-задачи R-34–R-38 имеют ответственного, зависимости, диапазон и приёмку выше. Их не запускать одновременно; подключение рекламы и публикация остаются отдельными решениями владельца.
