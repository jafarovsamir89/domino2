# Единый план исправления и улучшения Domino

Версия плана: **18 октября 2026**. Основание — аудит checkout `508932ebeb45cde744e3e1dbd92bc5592ca66093`, ветка `release/play-prep`. Игра уже опубликована в Google Play. На момент составления плана tracked-исходники соответствуют этому коммиту; исходные дефекты описаны для этого baseline. Исправления начаты; актуальный контекст — в [журнале агента](../remediation/AGENT_JOURNAL.md) и [журнале работ](../remediation/WORK_LOG.md).

**Это основной рабочий документ для начала исправлений.** В нём объединены все 42 задачи, порядок зависимостей, конкретные изменения и приёмка. [Главный отчёт](AUDIT_MASTER_REPORT.md), [полный backlog](14_PRIORITIZED_BACKLOG.md) и [Android-дополнение](SINGLE_ANDROID_AUDIT.md) служат доказательной базой; начинать чтение с них необязательно. Углубляться в соответствующий отчёт нужно перед изменением конкретной подсистемы.

## С чего начать

Первый пакет — **R-06 и подготовительная часть R-25**: чистая установка server, полный список тестов и сохранение baseline. Затем исправлять P0 в порядке этапа 1. Не ждать закрытия всех известных падающих тестов, чтобы написать регрессию P0: полный зелёный CI — результат исправлений, а не препятствие их началу.

В ближайшее исправляющее обновление включить 9 P0 и влияющие на нормальную партию P1: в первую очередь корректные правила, lifecycle, R-40/41/42, миграции и расчёты. Точный состав релиза определяется выполненной приёмкой, а не обещанием исправить все 42 задачи одновременно. P2/P3 идут после устойчивой основной игры.

| Очередь | Содержание | Результат этапа |
|---|---|---|
| 0 | R-06; R-25 — baseline/discovery | Зависимости воспроизводимы, все текущие падения видны |
| 1 | 9 P0: конфигурация, деньги, сессии, сохранение, правила, зависимости | Критические контракты исправлены и проверены |
| 2 | 12 P1: обычная партия, social, итог кошелька, recovery | Основной путь работает на локальном стенде |
| 3 | 9 P1: Android, доступность, голос, эксплуатация, решения владельца | Измеренное улучшение; внешние пункты имеют отдельный статус |
| 4 | 5 P2: вход, языки, звук, читаемость, модульность | Улучшения без повреждения core contracts |
| 5 | 5 P3: продуктовые эксперименты | Отложено до зависимостей и отдельного решения |

R-25 относится к этапу 0, но окончательно закрывается после прохождения всего обновлённого набора. Сумма всех задач: **42 = 9 P0 + 23 P1 + 5 P2 + 5 P3**. Оценка всего списка **93–177 человеко-дней** из аудита; это не срок ближайшего патча и не обещание завершить список за 90 календарных дней.

## Границы исполнения

Доступная приёмка: локальные сервисы, синтетические пользователи/кошельки и один Android с ADB. Сохранять Play-пакет и его данные; использовать отдельный audit/debug-пакет. В ходе этого шага создан только документ: публикация и изменения продукта не выполнялись.

[Согласованное сокращение объёма](ACCEPTED_SCOPE.md) остаётся в силе. Для начала локальных исправлений не требуется заново собирать доступы. Play Console, production deployment/Vitals/аналитика, дополнительные устройства, внешние OAuth/FCM/SSV/IAP/TURN/NAT, лицензии владельца и отложенные исследования отмечаются как внешняя часть приёмки, когда они относятся к задаче. Отложенные направления не возобновляются автоматически из-за наличия карточки в этом плане.

**«Проверено локально» и «готово к публикации» — разные статусы.** Если код исправлен, но требуется внешний сценарий, отметить его отдельно; не считать его пройденным и не блокировать несвязанные локальные задачи.

## Как выполнять и отмечать результат

В начале каждой карточки статус **«открыто»**. Значение «воспроизведено» в основании относится к дефекту в аудите. Для риска/продуктовой гипотезы сначала подтвердить контракт или получить решение по продукту; гипотеза не разрешает произвольно менять правила/экономику.

После завершения карточки заменить статус и записать: SHA/ветку или PR, изменённые файлы, команды и результаты проверок, новое evidence, остаток внешней приёмки. Вести текущие статусы здесь; исторические результаты аудита сохранять. При изменении требований синхронизировать соответствующий ID в [backlog.json](evidence/metrics/backlog.json), не заводить вторую задачу с другим номером.

Для поведения с деньгами, сессиями, правилами и migrations сначала получить целевую failing regression, затем минимальное исправление и повтор. Для локализации/малых обратимых UI-изменений достаточно проверки соответствующих экранов. Не расширять PR несвязанным рефакторингом и не удалять проверки ради зелёного CI. Карточки ниже — задачи, а не требование одного PR на целый этап.

Файлы/номера строк относятся к коммиту аудита. Перед правкой найти актуальную функцию: после предыдущего исправления строки могут сместиться. Зависимости указывают конкретные контракты; у R-25 на ранних этапах требуется baseline/discovery, а не уже законченный CI всего продукта.

## Карточки работ

### Этап 0. Подготовить воспроизводимое исправление

Сначала восстановить чистую установку и собрать полный baseline тестов. У R-25 здесь выполняется только подготовительная часть; полная CI-приёмка закрывается после исправления обнаруженных дефектов.

#### R-06 · P1 · Восстановить clean server install

Статус: **исправлено локально, S001**. Clean root/server installs прошли на Node25.6/npm11.8 и Node22.14.0/npm10.9.2; старые locked versions сохранены. [Проверки](../remediation/evidence/session-001/summary.json). Основание: сборка fail подтверждена; [доказательства](13_QA_TEST_RESULTS.md).

- **Изменение:** Согласовать server/package-lock.json с объявленными зависимостями; проверить npm ci в чистой копии. Зафиксировать используемые Node/JDK 21 и команды сборки. Установка с --package-lock=false была обходом для аудита, не решением.
- **Где:** `server/package.json,server/package-lock.json`.
- **Готово, когда:** npm ci root/server на чистом runner, pinned versions.
- **Зависимости:** —. **Исполнитель:** Build engineer. **Оценка:** 1–2 человеко-дня.

#### R-25 · P1 · Вернуть полную тестовую матрицу в CI

Статус: **частично выполнено, S001–S008**. Discovery после S008 включает40файлов/286cases,279pass/7fail; [те же7падений](../remediation/evidence/session-008/failure-delta.json). Новый E2E boundary проверен, последний browser baseline30/39; API134/134. CI-gate и исправление оставшихся падений открыты. [Диспозиция](../remediation/evidence/session-001/FAILURES.md). [Исторические доказательства](13_QA_TEST_RESULTS.md).

- **Изменение:** Включить обнаружение всех test files и зафиксировать исходные 7 server/9 E2E падений с причинами. Обновлять fixtures по согласованному поведению, а не ослаблять проверки ради зелёного результата. После исправлений сделать CI обязательным для полного набора, миграций, сборок и web asset parity.
- **Где:** `server/package.json;e2e/domino.spec.mjs;CI отсутствует`.
- **Готово, когда:** Все актуальные test files обнаруживаются; исходная выборка243 учтена, E2E contracts и проверки сборок актуальны.
- **Зависимости:** R-06. **Исполнитель:** QA/build. **Оценка:** 3–6 человеко-дня.

### Этап 1. Устранить критические ошибки

Исправить конфигурацию, начисления, принадлежность сессии, сохранение партии и правила. P0 блокируют расширение аудитории и включение монетизации до приёмки.

#### R-05 · P0 · Убрать admin defaults из read path

Статус: **исправлено локально, S002**. В `fix/audit-foundation` bootstrap перенесён в Nest startup transaction с сериализацией экземпляров; request paths не инициализируют defaults. Existing config/stakes/products/prices и timestamps сохраняются. До правки127/130API (3 новых regression fail), после130/130 на Node25/22; fresh PostgreSQL migrations, четыре concurrent start/restart и rollback проверены. [Текущие проверки](../remediation/evidence/session-002/summary.json). Production не обновлялся. Основание: воспроизведено; [исторические доказательства](08_ECONOMY_BALANCE.md).

- **Изменение:** Сделать чтение конфигурации операцией без записи. Инициализировать defaults только при создании/миграции, сохраняя последующие административные изменения.
- **Где:** `apps/api/src/modules/economy/economy.service.ts:461–515`.
- **Готово, когда:** GET не меняет stake/price/commission; fresh seed повторяем.
- **Зависимости:** —. **Исполнитель:** Backend. **Оценка:** 1–2 человеко-дня.

#### R-02 · P0 · Однократное daily начисление/upgrade

Статус: **исправлено локально, S004**. В `fix/audit-foundation` DB transaction lock по player предшествует проверке daily; initial/upgrade имеют unique ledger keys, используются existing constraints без migration. До правки100parallel upgrade давали2600вместо400; после четыре100-request сценария дают200/400/400/400 без ошибок на Node25/22. Rollback/retry, legacy claim и даты проверены, API132/132. [Текущие проверки](../remediation/evidence/session-004/summary.json). R-09ad verification остаётся отдельно, production не обновлялся. Основание: воспроизведено; [исторические доказательства](08_ECONOMY_BALANCE.md).

- **Изменение:** Объединить проверку права на daily/upgrade и начисление в одну атомарную операцию. Добавить уникальный ключ начисления и безопасный повтор; не менять размер daily в этом исправлении.
- **Где:** `apps/api/src/modules/economy/economy.service.ts:1490–1506`.
- **Готово, когда:** 100 параллельных/retry дают ровно entitlement reward.
- **Зависимости:** —. **Исполнитель:** Backend + DB QA. **Оценка:** 2–4 человеко-дня.

#### R-03 · P0 · Связать reserve/settle/refund с matchId

Статус: **исправлено локально, S006**. В `fix/audit-foundation` exact room/table/match settlement, общий transaction lock, fixed participants, replay protection по immutable ledger, frozen stake/commission. Без migration. API134/134 Node25/22; real PG:late A при B,100reserve/30settle, refund/replay/rollback/legacy проверены. [Проверки](../remediation/evidence/session-006/summary.json). Legacy null-match reserves не переназначаются, production не обновлялся. Основание: воспроизведено; [исторические доказательства](08_ECONOMY_BALANCE.md).

- **Изменение:** Идентифицировать весь цикл reserve/settle/refund конкретным matchId, участником и ставкой. Поздний результат предыдущего матча не должен использовать резервы следующего.
- **Где:** `apps/api/src/modules/economy/economy.service.ts:1983–1990`.
- **Готово, когда:** Старый result не трогает новые резервы; повтор безопасен.
- **Зависимости:** —. **Исполнитель:** Backend + DB QA. **Оценка:** 3–5 человеко-дня.

#### R-01 · P0 · Привязать восстановление места к владельцу

Статус: **исправлено локально, S009**. Verified identity проверяется до переноса места/выдачи руки; supplied room/code/match context сверяется, клиент сохраняет matchId. Свой restore сохраняет место и руку; чужие user/player/provider и stale context отвергаются. Targeted24/24 на Node25/22; full server288/295, те же7старыхfail. [Проверки](../remediation/evidence/session-009/summary.json). Старые snapshots без matchId совместимы только с проверенным владельцем. Production/Play не обновлялись.

- **Изменение:** Связать восстановление места с подтверждённой identity и конкретным матчем; согласовать обычный reconnect и restore после перезапуска. Сервер проверяет владельца до выдачи руки и изменения места.
- **Где:** `server/DominoRoom.js:401,1324`.
- **Готово, когда:** Чужая identity отклонена; свой reconnect сохраняет руку/место.
- **Зависимости:** —. **Исполнитель:** Backend + independent QA. **Оценка:** 2–4 человеко-дня.

#### R-04 · P0 · Сохранить snapshots при shutdown

Статус: **исправлено локально, S010**. Shutdown сохраняет versioned snapshot и registry, останавливает таймеры/входящие действия; onLeave не трактует остановку как forfeit. Последовательные Redis writes и обычный cleanup проверены. Real local Redis SIGTERM→restart на Node25/22 сохраняет hand/turn/version/match;0shutdown settlement/1final. [Проверки](../remediation/evidence/session-010/summary.json). Durable outbox/abrupt kill относятся к R-29; production/Play не обновлялись.

- **Изменение:** Разделить штатное завершение комнаты и shutdown процесса. Сохранить активные snapshots перед остановкой, не удалять их общим cleanup; восстановление сверяет принадлежность и версию матча.
- **Где:** `DominoRoom.js:1425,4337`.
- **Готово, когда:** SIGTERM restore совпадает по hand/turn/match; settlement один.
- **Зависимости:** R-01. **Исполнитель:** Game backend + QA. **Оценка:** 3–5 человеко-дня.

#### R-31 · P0 · Применять очки рыбы в серверном 101

Статус: **исправлено локально, S007**. В `fix/audit-foundation` blocked101matchState применяется до endDeal/score sync, повторный advance после завершения игнорируется. Golden28tiles79+50=129,1final/settlement; tiecarry и2v2 проверены. До0/3, после3/3; Node22+rulesets10/10. Full server272/279, те же7старыхfail. [Проверки](../remediation/evidence/session-007/summary.json). Production не обновлялся. Основание: воспроизведено:79→129 не применялось; [исторические доказательства](CONTINUATION_ANALYSIS.md).

- **Изменение:** Один раз применить matchState, возвращённый resolveBlocked для 101, до синхронизации очков и определения окончания. Контрольный пример:79+50=129 и один финал; исключить повторное начисление в endDeal.
- **Где:** `server/DominoRoom.js:3798,3869`.
- **Готово, когда:** Blocked fixture даёт 129 и один финал; carry/tie/2v2 и settlement без дублей.
- **Зависимости:** R-25. **Исполнитель:** Game backend + independent QA. **Оценка:** 2–4 человеко-дня.

#### R-32 · P0 · Обрабатывать drawToOpen в онлайн 101

Статус: **исправлено локально, S008**. В fix/audit-foundation drawToOpen выполняется до gameActive/schema/timer; seed225 даёт2добора, руки8/8, player1, tile3-3, bazaar12,28unique tiles. Full_state/stage/snapshot restore согласованы. Initial до4/5, после5/5; с2полными матчами7/7; Node22+fish/rulesets17/17. Full server279/286, те же7старыхfail. [Проверки](../remediation/evidence/session-008/summary.json). Production/Play не обновлялись. [Исторические доказательства](CONTINUATION_ANALYSIS.md).

- **Изменение:** Выполнить drawToOpen, когда первый положительный дубль остался в базаре. До объявления активного хода обновить руки, базар и допустимого текущего игрока. Контрольный seed 225 не должен оставлять currentPlayerIndex=-1.
- **Где:** `server/DominoRoom.js:1890;shared/domino-rulesets.cjs:611`.
- **Готово, когда:** Раздача без положительных дублей начинает допустимый ход;28tiles, руки/базар/snapshot согласованы.
- **Зависимости:** R-25. **Исполнитель:** Game backend + client QA. **Оценка:** 2–3 человеко-дня.

#### R-09 · P0 · Server entitlement для rewarded x2

Статус: **локальный объём выполнен, S011; реальные SSV отложены**. Unverified rewarded_x2 возвращает403 до DB mutation; initial/upgrade без права удалены. API объявляет rewardedAvailable=false/doubleClaimAvailable=false; web/www не запускают рекламу. Обычный daily сохранён. API134/134Node25/22; realPG4×100requests на обеих версиях без лишних монет. [Проверки](../remediation/evidence/session-011/summary.json). Подключение/положительная приёмка уникального ad event не выполнены, удвоение выключено. Production/Play не обновлялись.

- **Изменение:** Начислять rewarded x2 только по подтверждённому однократному серверному праву на награду. Пока внешняя интеграция отложена, путь без подтверждения должен оставаться недоступным; реальные SSV остаются отдельной приёмкой.
- **Где:** `apps/api/src/modules/economy/economy.service.ts:1466–1474`.
- **Готово, когда:** Только подтверждённый уникальный ad event начисляет reward.
- **Зависимости:** R-02. **Исполнитель:** Backend + monetization QA. **Оценка:** 3–5 человеко-дня.

#### R-27 · P0 · Triage и совместимое обновление critical dependencies

Статус: **открыто**. Основание: версии/advisory подтверждены; [доказательства](07_SECURITY_ANTICHEAT.md).

- **Изменение:** Повторно проверить актуальность advisories и достижимость затронутых поверхностей, подобрать совместимые исправленные версии и обновить lockfiles. Версия из аудита — исторический факт, не готовая рекомендация версии для сегодняшнего обновления.
- **Где:** `package-lock.json; Capacitor8.3.1`.
- **Готово, когда:** Reachability записана; patched runtime; OAuth/navigation regression.
- **Зависимости:** R-06. **Исполнитель:** Mobile/backend + reviewer. **Оценка:** 3–6 человеко-дня.

### Этап 2. Исправить поведение обычной партии и расчётов

После соответствующих зависимостей восстановить fresh install, честные решения AI, lifecycle, переписку, финансовый итог и обработку отказов. R-41 и R-42 следует включить в ближайшее исправляющее обновление.

#### R-07 · P1 · Fresh database daily quest seed

Статус: **исправлено локально, S003**. В `fix/audit-foundation` startup создаёт missing daily_login без дополнительной награды и сохраняет existing admin edits. Fresh18migrations→startup→normal daily прошёл без ручного seed:200монет первый день,0повторного начисления,300следующий; до правки Quest not found. API131/131 на Node25/22. [Проверки](../remediation/evidence/session-003/summary.json). Production не обновлялся. Основание: воспроизведено; [исторические доказательства](08_ECONOMY_BALANCE.md).

- **Изменение:** Создать необходимые daily quest справочники в повторяемом bootstrap/migration. Проверить пустую БД без ручного добавления daily_login.
- **Где:** `apps/api/src/modules/economy/economy.service.ts:1586,3240;prisma migrations`.
- **Готово, когда:** Fresh migrations→normal daily без ручного quest.
- **Зависимости:** R-05. **Исполнитель:** Backend. **Оценка:** 1–2 человеко-дня.

#### R-08 · P1 · Исправить параметр instant win

Статус: **исправлено локально, S005**. В `fix/audit-foundation` все2server/4client calls передают instantWinEnabled, www parity сохранена. До33behavioral checks21pass/12fail, после33/33; Node22 с rulesets40/40. Score35 при false продолжает, при true завершает; play/gosha, shared/fallback и empty hand проверены. Full server269/276, те же7старыхfail. [Проверки](../remediation/evidence/session-005/summary.json). Production/Play не обновлялись. Основание: контрактный дефект подтверждён; [исторические доказательства](02_GAMEPLAY_RULES.md).

- **Изменение:** Передавать instant-win настройку под фактически ожидаемым именем в общий ruleset из клиента и сервера. Пример приёмки: результат 35 при выключенной настройке не завершает матч.
- **Где:** `shared/domino-rulesets.cjs:100;app.js:19894;DominoRoom.js:3489`.
- **Готово, когда:** 35 при false не завершает матч; обе реализации parity.
- **Зависимости:** —. **Исполнитель:** Game logic + QA. **Оценка:** 1–2 человеко-дня.

#### R-12 · P1 · Убрать hidden hands из takeover AI

Status: **fixed locally, S012**. Server AI receives only its own hand and public hand counts, scores, bazaar count and missing suits. Paired hidden worlds and input boundary verified; 7/7, Node22 + rulesets14/14, full server302/309 with the same seven original failures. [Evidence](../remediation/evidence/session-012/summary.json). Offline client AI unchanged; no production/Play deployment.

- **Изменение:** Передавать takeover AI только разрешённую публичную информацию и его собственную руку. Одинаковая публичная позиция должна давать одинаковое решение при замене скрытых рук соперников/партнёра.
- **Где:** `server/ai.js:101–125;DominoRoom.js:2502`.
- **Готово, когда:** При одинаковой публичной информации решения независимы от secret hand.
- **Зависимости:** —. **Исполнитель:** Game logic + independent QA. **Оценка:** 2–4 человеко-дня.

#### R-16 · P1 · Отменять устаревший async turn

Status: **fixed locally, S018**. Async local turns carry owner/generation/cycle/board/hands/player context. Tile travel and 101 draw continuations recheck ownership after awaits; stale success/rejection/RAF callbacks cannot change new scores, turn or lock. Timer reset invalidates work; DOM/Konva animations cancel and settle once, including Konva destroy. Source/www kept identical. Before2/6 pass (four real stale failures); final14 new tests + instant rules33 pass on Node25, new14 Node22. Full server332/339 before two additional cancellation tests, same seven original failures. Initial six failures without VM timer globals were harness-only and excluded. [Evidence](../remediation/evidence/session-018/summary.json).

- **Изменение:** После каждого await проверять актуальную сессию/цикл до изменения очков, поля и UI; отменять старую анимацию. Старый finally не должен разблокировать новый ход.
- **Где:** `js/app.js:19908–19980`.
- **Готово, когда:** После reset старый Promise не меняет score/phase.
- **Зависимости:** —. **Исполнитель:** Game frontend + QA. **Оценка:** 2–4 человеко-дня.

#### R-17 · P1 · Phase recovery вместо boolean watchdog

Статус: **открыто**. Основание: риск по механизму; [доказательства](04_FREEZES_AND_STATE.md).

- **Изменение:** Заменить безусловный сброс turnInProgress диагностикой фазы и контролируемым восстановлением. В online сверяться с сервером; в solo восстанавливать детерминированный переход без повторного хода. Бесконечное зависание именно от watchdog в аудите не доказано.
- **Где:** `js/app.js:763–768`.
- **Готово, когда:** Recovery отменяет старую работу и сверяет state; нет двойного хода.
- **Зависимости:** R-16. **Исполнитель:** Game frontend. **Оценка:** 2–4 человеко-дня.

#### R-40 · P1 · Останавливать solo таймер в меню паузы

Статус: **открыто**. Основание: воспроизведено на Android; [доказательства](SINGLE_ANDROID_AUDIT.md).

- **Изменение:** Останавливать solo deadline и сохранять остаток времени при открытии Pause, продолжать ровно один таймер при возврате. На телефоне 50,321 с в меню дали боту 2 победы. Сетевой серверный deadline продолжает идти.
- **Где:** `js/app.js:17210,13184,13223`.
- **Готово, когда:** Solo меню 60 с не меняет поле/руки/очки/очередь; resume сохраняет остаток; 20 циклов/force-stop; online deadline продолжает идти.
- **Зависимости:** R-16,R-17. **Исполнитель:** Frontend + mobile QA. **Оценка:** 1–2 человеко-дня.

#### R-41 · P1 · Добавить forward migrations текущей social schema

Status: **fixed locally, S017**. Additive transactional migration19 adds DM clientMessageId, thread/fcm tables, missing enum/indexes/FKs. Backfills legacy threads, latest message (timestamp+ID tie break), unread counts. Existing four indexes are declared in schema rather than dropped. Fresh and populated18->19 upgrades on Node25/22 preserve history and wallets, read/send/read-state/retry and local FCM CRUD pass; repeated deploy is no-op and drift0. Initial schema edit put indexes on the wrong model; corrected before final fresh/upgrade checks. Exploratory drift DB is used; final and node22 DBs are independent fresh proofs. No production migration. [Evidence](../remediation/evidence/session-017/summary.json).

- **Изменение:** Добавить forward migrations для clientMessageId, direct_message_thread, fcm_token, индексов и связей текущей schema. На пустой БД все 18 миграций применились, DM вернул 500. Проверять и пустую установку, и upgrade без reset/db push.
- **Где:** `packages/db/prisma/schema.prisma:509,516,529,790;packages/db/prisma/migrations`.
- **Готово, когда:** Empty/upgrade migrate deploy без reset; zero unexpected schema drift; DM read/send/read-state/retry и локальный fcm_token CRUD.
- **Зависимости:** R-25. **Исполнитель:** Backend/DB + independent QA. **Оценка:** 2–4 человеко-дня.

#### R-42 · P1 · Сверять итог монет UI с фактическим settlement

Status: **fixed locally, S013**. API emits versioned per-player stake/returnedStake/winnings/net receipts with stable IDs. Room forwards them; web/www count consumed stake as loss and profit as winnings, persist totals and ignore repeated IDs. Real PostgreSQL -> API -> room helper -> actual client/renderer agrees with wallet+reserved and ledger delta for win/loss/draw/refund/2v2/forfeit/zero-profit winner on Node25/22. API140/140; client18/18; full server320/327, same seven original failures. [Evidence](../remediation/evidence/session-013/summary.json). Legacy/missing receipts hide incomplete totals; no production/Play deployment.

- **Изменение:** Учитывать возврат собственного reserve отдельно от чистого выигрыша в online summary. Контроль: UI−20 при фактических+180; ledger вернул 200 и начислил 180. Предпочесть явный per-player settlement contract и защиту от повторного события.
- **Где:** `js/app.js:19417;js/renderer.js:1376–1383;apps/api/src/modules/economy/economy.service.ts:2074–2116`.
- **Готово, когда:** UI net равен delta(balance+reserved) для win/loss/draw/refund/2v2; duplicate settlement не меняет summary.
- **Зависимости:** R-03,R-25. **Исполнитель:** Frontend/backend contract + QA. **Оценка:** 1–2 человеко-дня.

#### R-29 · P1 · Durable outbox и reconciliation результата

Статус: **открыто**. Основание: риск, fault drill не завершён; [доказательства](05_MULTIPLAYER_RECONNECT.md).

- **Изменение:** Сохранить результат до уничтожения room/process и доставлять его повторяемо через durable outbox/reconciliation. Начать с локальных сбоя API/процесса и проверки одного итога. Обычный 30-минутный soak не закрыл этот fault drill.
- **Где:** `DominoRoom.js:3108–3164,4337`.
- **Готово, когда:** API timeout/process kill не теряет итог и не удваивает credit.
- **Зависимости:** R-03,R-04. **Исполнитель:** Backend + DB QA. **Оценка:** 4–7 человеко-дня.

#### R-10 · P1 · Определить отзыв игрового допуска

Статус: **открыто**. Основание: риск по коду; [доказательства](07_SECURITY_ANTICHEAT.md).

- **Изменение:** Определить срок действия и отзыв игрового допуска при logout/ban/delete. Это риск по коду: сначала сформулировать контракт и локальные проверки, затем выбрать механизм без избыточных запросов на каждый ход.
- **Где:** `server/platformAuth.js:27–44`.
- **Готово, когда:** Ban/logout/delete действует в установленный SLA; expiry tests.
- **Зависимости:** R-01. **Исполнитель:** Auth/backend. **Оценка:** 2–4 человеко-дня.

#### R-11 · P1 · Минимизировать public presence

Status: **fixed locally, S015**. Public game/platform summaries redact session/user/private room codes; public discovery cannot opt into closed rooms. Authenticated owners can inspect their own room code; legacy clients with an unlisted session retain only the minimal room-id resume probe. Private code reverse lookup requires membership. Client headers updated, admin keys no longer depend on sessions. Initial API attempt reused only root dependencies and selected TS6 instead of nested TS5; rerun uses the complete unchanged S013 dependency layout. [Evidence](../remediation/evidence/session-015/summary.json). No production/Play deployment.

- **Изменение:** Оставить в публичной выдаче только необходимые поля присутствия. Закрытые коды комнат и session identifiers не должны попадать в общий список.
- **Где:** `server/index.js:/api/realtime/players;livePresence.js`.
- **Готово, когда:** Public response не раскрывает private codes/sessionIds.
- **Зависимости:** R-01. **Исполнитель:** Backend. **Оценка:** 1–2 человеко-дня.

#### R-39 · P1 · Отвязать liveness от зависания Redis

Status: **fixed locally, S016**. Liveness/readiness bypass application Redis rate limiter. Readiness requires PING,750ms deadline, shared in-flight probe prevents queue growth. Real owned Redis pause: liveness under500ms, readiness503 under1000ms, recovery200 and exact room/snapshot preserved on Node25/22. Own Redis stopped. Initial recovery fixture was corrected to await completion of its released PING before probing recovery. [Evidence](../remediation/evidence/session-016/summary.json). No production/Play deployment.

- **Изменение:** Вынести liveness из пути ожидания Redis rate limiter; readiness проверяет зависимости с ограниченным временем. При паузе Redis liveness отвечает, readiness возвращает контролируемое 503, после восстановления возвращается 200.
- **Где:** `server/index.js:197,233;server/health.js`.
- **Готово, когда:** При SIGSTOP Redis liveness отвечает <500 мс; readiness503 с deadline<1000 мс; после recovery200, игровое состояние сохранено.
- **Зависимости:** R-25. **Исполнитель:** Backend + DevOps + independent QA. **Оценка:** 1–2 человеко-дня.

### Этап 3. Улучшить Android, доступность и эксплуатацию

Сначала реальные canvas buffers и дорогие эффекты, затем интерфейс и доступность. Кодовые части можно делать локально; проверки внешних сервисов и решения владельца сохраняют отдельный статус.

#### R-13 · P1 · Применить реальный canvas pixel ratio

Статус: **открыто**. Основание: измерено; [доказательства](03_PERFORMANCE_FPS.md).

- **Изменение:** Применить quality pixel ratio к реальным Konva scene/hit canvas, а не только к атрибуту Stage. Проверить фактические размеры buffer, DPR, поворот и точность выбора костяшек.
- **Где:** `js/konvaBoardRenderer.js:238–246`.
- **Готово, когда:** Layer ratio соответствует quality preset; точки/стрелки точны.
- **Зависимости:** —. **Исполнитель:** Renderer engineer. **Оценка:** 1–2 человеко-дня.

#### R-14 · P1 · Упростить дорогие постоянные эффекты

Статус: **открыто**. Основание: измерено, группа CSS; [доказательства](03_PERFORMANCE_FPS.md).

- **Изменение:** Отдельно измерить animation, blur и shadow; ограничить самые дорогие постоянные эффекты. Сохранить видимость допустимого хода. Комбинированные 54,5 rAF/s из аудита не доказывают вклад каждого отдельного изменения.
- **Где:** `css/style.css:6020,6364,6420`.
- **Готово, когда:** Отдельные A/B; device p95 target; допустимый ход различим.
- **Зависимости:** —. **Исполнитель:** Frontend perf + visual QA. **Оценка:** 3–6 человеко-дня.

#### R-15 · P1 · Сократить искусственный startup

Статус: **открыто**. Основание: код подтверждён; [доказательства](03_PERFORMANCE_FPS.md).

- **Изменение:** Убрать обязательное ожидание 5,5 с после готовности критического UI, ограничить ожидание загрузки и предусмотреть offline/error состояние. Сравнить cold/warm UI readiness на том же телефоне.
- **Где:** `js/splash.js:3–4,83–108`.
- **Готово, когда:** Bounded splash; cold/warm/offline interactive metrics.
- **Зависимости:** —. **Исполнитель:** Frontend/mobile QA. **Оценка:** 1–2 человеко-дня.

#### R-23 · P1 · Touch targets и доступная рука

Статус: **открыто**. Основание: размеры/скриншоты; [доказательства](06_UI_UX_DESIGN.md).

- **Изменение:** Сделать 7 костяшек доступными именованными элементами с клавиатурным/assistive выбором конца. Увеличить hit areas без перекрытия. На естественном ходе человека Tab не достигал ни одной костяшки; actual TalkBack speech ещё предстоит проверить.
- **Где:** `index.html;ui-capture.json;renderer.js`.
- **Готово, когда:** Удобные hit areas, 7 tiles, TalkBack/focus и 320px.
- **Зависимости:** R-14. **Исполнитель:** UX/frontend + device QA. **Оценка:** 2–4 человеко-дня.

#### R-18 · P1 · Voice ICE contract и NAT проверка

Статус: **открыто**. Основание: config defect; NAT неизвестен; [доказательства](05_MULTIPLAYER_RECONNECT.md).

- **Изменение:** Исправить разбор ICE config, чтобы разрешённый строковый STUN не отбрасывался. Локально проверить конфигурацию и allow/deny микрофона; end-to-end NAT/TURN/операторская сеть остаются отложенными.
- **Где:** `server/index.js:63–95;js/voice.js`.
- **Готово, когда:** Config STUN не теряется; Wi-Fi/LTE relay-only разговор.
- **Зависимости:** —. **Исполнитель:** Realtime/mobile QA. **Оценка:** 2–4 человеко-дня.

#### R-21 · P1 · Заметный путь удаления аккаунта

Статус: **открыто**. Основание: пробел UI подтверждён; Console неизвестен; [доказательства](12_ANDROID_GOOGLE_PLAY.md).

- **Изменение:** Добавить понятный путь запроса удаления в профиле и согласовать его с web-страницей, обработкой запроса и retention. Console и окончательная policy-проверка остаются отложенными.
- **Где:** `index.html:179,620;delete-account.html:105`.
- **Готово, когда:** Profile→request deletion; web request; локальная обработка/retention.
- **Зависимости:** —. **Исполнитель:** Frontend + owner. **Оценка:** 1–3 человеко-дня.

#### R-28 · P1 · Метрики, vitals и экономический audit trail

Статус: **открыто**. Основание: доступ/наблюдаемость неизвестны; [доказательства](11_RETENTION_GROWTH_ASO.md).

- **Изменение:** Добавить версию сборки и финальные события партии/settlement/reconnect, локально проверить payload и доставку. Production dashboards, Vitals, alert delivery и реальные когорты остаются отложенными.
- **Где:** `server/instrument.js;apps/api/src/instrument.ts`.
- **Готово, когда:** DeploySha+финальные события; dashboard; тестовый alert доставлен.
- **Зависимости:** —. **Исполнитель:** Backend/product analytics. **Оценка:** 3–5 человеко-дня.

#### R-30 · P1 · Реестр прав на assets и policy сверка

Статус: **открыто**. Основание: доказательства не найдены; [доказательства](12_ANDROID_GOOGLE_PLAY.md).

- **Изменение:** Составить локальный реестр asset→источник→лицензия→подтверждение. Не удалять и не заменять контент на основании одного отсутствия документа в repo. Документы владельца и Console/Data Safety отмечать отдельно как ожидаемые.
- **Где:** `assets/;privacy.html;Play Console`.
- **Готово, когда:** Источник/лицензия каждого asset, Data Safety/retention сверены.
- **Зависимости:** —. **Исполнитель:** Owner + legal/content reviewer. **Оценка:** 1–3 человеко-дня.

#### R-33 · P1 · Утвердить daily faucet и бюджет монет

Статус: **открыто**. Основание: политика подтверждена; намерение требует решения; [доказательства](CONTINUATION_ANALYSIS.md).

- **Изменение:** Отделить подтверждённую политику daily от решения о её изменении. После исправления начислений сравнить cap/cycle, запас бесплатных партий и sinks; не урезать выдачу автоматически по сценарной модели.
- **Где:** `apps/api/src/modules/economy/economy.service.ts:125,1399;coin-economy-simulation.cjs`.
- **Готово, когда:** Утверждён cap/cycle, бюджет партий и бесплатный путь;7/30/90 sensitivity и closed-ledger метрики.
- **Зависимости:** R-02,R-05,R-07. **Исполнитель:** Product owner + economy analyst. **Оценка:** 2–4 человеко-дня.

### Этап 4. Упростить продукт и обслуживание кода

После стабильной основной партии улучшить вход, язык, звук и читаемость. Рефакторинг вести небольшими шагами под регрессиями; продуктовые гипотезы не считать доказанными дефектами.

#### R-20 · P2 · Быстрый локальный solo до auth

Статус: **открыто**. Основание: UX-гипотеза; [доказательства](06_UI_UX_DESIGN.md).

- **Изменение:** Сначала подтвердить продуктовый сценарий свободной solo без обязательного входа. Затем отделить локальную сессию от авторизации online, объяснить монеты и исправить предупреждение о монетах в бесплатной игре.
- **Где:** `index.html login;js/app.js bootstrapAccount`.
- **Готово, когда:** Без аккаунта легальная solo партия; online identity защищена.
- **Зависимости:** R-15,R-25. **Исполнитель:** Frontend + product. **Оценка:** 3–5 человеко-дня.

#### R-22 · P2 · Цельная локализация AZ/RU/EN и TR pilot

Статус: **открыто**. Основание: скриншоты подтверждают строки; [доказательства](06_UI_UX_DESIGN.md).

- **Изменение:** Убрать смешение языков и сырые ключи, включая Cancel, AI BOTLAR, Gift001/common и resume-session-return. Уточнить предупреждение бесплатной solo и текст приглашения до/после отправки. TR pilot требует отдельной проверки носителем.
- **Где:** `js/translations.js;index.html;cosmetics UI`.
- **Готово, когда:** Нет смешения system text; long labels/number plurals.
- **Зависимости:** —. **Исполнитель:** Frontend + native speaker. **Оценка:** 2–4 человеко-дня.

#### R-19 · P2 · Music/effects/master mute

Статус: **открыто**. Основание: probe подтверждён; [доказательства](06_UI_UX_DESIGN.md).

- **Изменение:** Определить master mute и отдельные music/effects уровни, применить настройку к Web Audio и HTMLAudio. На Android muted=true всё ещё создавал 3 score oscillators. Проверить сохранение настроек; внешний audio focus остаётся отдельным сценарием.
- **Где:** `js/sounds.js:88,96,249–259`.
- **Готово, когда:** Mute подавляет SFX; настройки сохраняются; audio focus.
- **Зависимости:** —. **Исполнитель:** Frontend/mobile QA. **Оценка:** 1–2 человеко-дня.

#### R-24 · P2 · Читаемый стол и центр поля

Статус: **открыто**. Основание: UX-оценка screenshots; [доказательства](06_UI_UX_DESIGN.md).

- **Изменение:** Уменьшить визуальный шум под полем и проверить читаемость 20–28 костяшек, центрирование и масштаб. Изменять оформление по небольшому прототипу; пользовательскую оценку не подменять только скриншотом.
- **Где:** `css/style.css game screen;table skin assets`.
- **Готово, когда:** 20/28 tiles читаемы; zoom/reset; тест с игроками.
- **Зависимости:** R-14. **Исполнитель:** Designer/frontend. **Оценка:** 2–4 человеко-дня.

#### R-26 · P2 · Разделять монолит и единый rules source

Статус: **открыто**. Основание: долг подтверждён; [доказательства](01_ARCHITECTURE.md).

- **Изменение:** Выделять по одному модулю из app.js/DominoRoom.js после покрытия контрактов. Начать с границ сессии/таймеров/правил; сохранить внешние сообщения и форматы snapshot. Массовое переписывание не является первым исправлением.
- **Где:** `app.js;DominoRoom.js;shared/board/model duplicates`.
- **Готово, когда:** Один модуль за PR, contracts и parity сохранены.
- **Зависимости:** R-25,R-08,R-16. **Исполнитель:** Senior engineer + reviewer. **Оценка:** 8–14 человеко-дня.

### Этап 5. Проверять гипотезы роста

Это последующие эксперименты, не обязательные исправления ближайшего релиза. В рамках текущего сокращённого объёма остаются отложенными. Возобновлять по очереди после зависимостей и измеренной стабильности.

#### R-34 · P3 · Проверить onboarding эксперимент

Статус: **открыто**. Основание: продуктовая гипотеза; [доказательства](11_RETENTION_GROWTH_ASO.md).

- **Изменение:** Подготовить один вариант onboarding с first-start/first-match событиями, метрикой и правилом остановки. Сначала обеспечить свободную solo и корректную аналитику; эффект удержания заранее не обещать.
- **Где:** `js/app.js start/auth/tutorial;analytics`.
- **Готово, когда:** Один вариант, first-start/first-match events, заранее заданы метрика и stop rule; сравнение когорт.
- **Зависимости:** R-20,R-28;Gate60. **Исполнитель:** Product + frontend + analyst. **Оценка:** 2–4 человеко-дня.

#### R-35 · P3 · Проверить rematch и приглашение после партии

Статус: **открыто**. Основание: продуктовая гипотеза; [доказательства](11_RETENTION_GROWTH_ASO.md).

- **Изменение:** Упростить рабочий путь приглашения/ответной партии и проверить его двумя локальными клиентами, включая истёкшее приглашение. Отсутствие кнопки invite в профиле само по себе не баг: текущий рабочий путь начинается со свободного места комнаты.
- **Где:** `js/app.js result/invite;social module`.
- **Готово, когда:** Два клиента проходят invite/rematch, duplicate/expired корректны; измерен invite→completed match.
- **Зависимости:** R-01,R-28,R-31,R-32;Gate60. **Исполнитель:** Frontend + backend QA + product. **Оценка:** 3–5 человеко-дня.

#### R-36 · P3 · Ограниченный rewarded pilot

Статус: **открыто**. Основание: будущая монетизация, сейчас выключена; [доказательства](10_MONETIZATION_BUSINESS.md).

- **Изменение:** Ограниченный добровольный rewarded pilot возможен после защищённого entitlement, измерений и решения по бюджету монет. Реальные ad/SSV, rollout и публикация сейчас отложены; новые деньги не должны менять силу AI или раздачу.
- **Где:** `ads integration;economy reward entitlement`.
- **Готово, когда:** SSV/replay/refund тесты, частотный лимит, opt-in, rollout/rollback; измерены net revenue и retention.
- **Зависимости:** R-02,R-09,R-28,R-33;Gate90. **Исполнитель:** Monetization engineer + independent QA + owner. **Оценка:** 4–7 человеко-дня.

#### R-37 · P3 · Пилот ASO одной локали

Статус: **открыто**. Основание: рыночная гипотеза; [доказательства](11_RETENTION_GROWTH_ASO.md).

- **Изменение:** Выбрать одну локаль и подготовить соответствующие реальному продукту тексты/скриншоты. Проверить перевод носителем и измерять качество привлечённой когорты. Не публиковать листинг автоматически.
- **Где:** `Play listing;localized screenshots/translations`.
- **Готово, когда:** Материалы соответствуют продукту, носитель проверил; conversion и качество когорты сопоставлены.
- **Зависимости:** R-22,R-28,R-30;Gate90. **Исполнитель:** Owner + native speaker + designer. **Оценка:** 2–4 человеко-дня.

#### R-38 · P3 · Небольшой косметический сезон

Статус: **открыто**. Основание: продуктовая гипотеза; [доказательства](16_DOMINO_NEXT_VISION.md).

- **Изменение:** Подготовить небольшой косметический набор с подтверждёнными правами, budget устройства и экономическими sinks. Сезон не меняет правила/силу и требует отдельного решения по постоянной поддержке.
- **Где:** `cosmetics catalog;assets;season UI`.
- **Готово, когда:** Права на контент, budget устройств, сроки и sinks; косметика не меняет правила/силу.
- **Зависимости:** R-14,R-28,R-30,R-33;Gate90. **Исполнитель:** Designer + frontend + content owner. **Оценка:** 5–10 человеко-дня.

## Проверка исправляющего обновления

Существующие команды из checkout, запускать из корня в изолированном окружении:

```sh
npm run check
npm --prefix server test
node --test server/test/*.test.js
npm --prefix apps/api test
npm run test:e2e
npm run build -w @domino2/admin
```

Это команды для будущей приёмки, сейчас они заново не запускались. До исправлений ожидаемые исходные результаты аудита: default server: 201 pass, полный server: 236/243, API: 127 pass, E2E: 30/39. Зелёная default server команда не заменяет discovery всех файлов. Количество тестов после исправлений будет расти; не привязывать приёмку к навсегда фиксированным 243.

Дополнить проверками затронутых контрактов:

1. **Fresh/upgrade БД:** все forward migrations, справочники, schema drift, DM read/send/retry. Работать на тестовой БД без reset существующих данных.
2. **Правила и итоги:** Telefon/101,2/3/4 и 2v2; конкретные fixtures R-31/R-32;28 костяшек; одинаковое состояние клиента/сервера; один итог.
3. **Кошельки:** начисления и upgrade однократны; reserve/settle/refund относятся к своему матчу; UI net совпадает с фактическим delta(balance+reserved). Учесть штатный grant и комиссию один раз на матч при общей сверке.
4. **Lifecycle:** stale animation после reset, Pause solo 60 с, resume/force-stop, разрыв и возврат соединения, graceful restart, поздний результат. Online deadline не останавливается локальным меню.
5. **Android:** реальная живая партия, целевые экраны, клавиатура/доступные имена, mute, текст 130%, поворот, cold/warm. Сравнивать одинаковые workload/температурные условия; не выдавать debug FPS за Play release.
6. **Артефакты:** source→www→Android assets соответствуют ожидаемому SHA; API/admin и Android APK/AAB собираются с согласованными runtime. JDK 21 требуется проверенной Android-сборке. Root scripts содержат PowerShell-команды — учитывать платформу runner.
7. **Длительная локальная игра:** повторить после исправлений rules/ledger/recovery; сверить balance+reserved+commission с начальными средствами и штатными начислениями. Исправленный cleanup audit-harness отдельно повторить: предыдущая цифра≥123075 команд была нижней границей, а 453 расчёта подтверждены независимой БД.
8. **Финальная CI-часть R-25:** все актуальные тестовые файлы обнаруживаются; каждая прежняя ошибка имеет подтверждённую диспозицию; P0-regressions и новый контракт проходят. Продуктовый дефект не закрывается исправлением только теста.

Описание окружения и известных ограничений: [QA](13_QA_TEST_RESULTS.md), [повторение серверных проверок](evidence/REPRODUCING_CONTINUATION.md), [повторение Android](evidence/REPRODUCING_ANDROID.md). Audit harness зависит от локальных fixtures/бинарников и не является готовым универсальным CI; его можно использовать как доказательство и основу регрессии после проверки методики.

## Условия перехода к улучшениям и публикации

**От исправлений к P2:** закрыты относящиеся к текущему продукту P0, новая регрессия не повреждает правила/кошелёк/сессию, основной локальный сценарий и Android-партия проходят. Незавершённые независимые внешние проверки перечислены явно.

**От P2 к P3:** продукт стабилен по согласованным метрикам, есть рабочие измерения и выполнены зависимости карточки. Предполагаемый рост retention/revenue не является критерием уже достигнутого результата.

**К публикации:** подготовлен конкретный build и перечень изменений; проверены актуальность backend/config, совместимость migrations, signing/Console и нужные внешние сценарии. Поскольку эти проверки сейчас отложены, успешная локальная приёмка сама по себе не означает разрешение или готовность выпуска. Публикация/монетизация не являются действиями этого документа.

## Готовая формулировка первого задания

> Начни исправления по docs/audit/REMEDIATION_PLAN.md с этапа 0: R-06 и подготовительной части R-25. Восстанови чистую установку server, собери baseline полного набора и причины падений. Сохрани рабочие изменения отдельно, не меняй игровые правила и экономику в этом пакете. Запиши результат и проверки в карточках. Затем сообщи, какие P0 готовы к следующему пакету.

Это исходная формулировка первого пакета, который уже начат. Перед повторным запуском проверить журналы: часть задач и проверок уже выполнена.
