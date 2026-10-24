# R09 — сервер LevelPlay и внешний тест, S042

Дата:2026-10-24. Ветка `codex/rewarded-acceptance`, начало от1d5abb3. **R09 остаётся открытой,27/42.** Изменения подготовлены локально, публичный игровой API и Play не обновлены.

## Что получилось простыми словами

Подготовлен серверный вариант, который проверяет именно подпись LevelPlay, связывает просмотр с попыткой нужного игрока и защищает от повторной выдачи. В локальной БД100одинаковых сообщений дали1награду и99подтверждений повтора. Отмена, выход, бан, удаление пользователя и истёкшая сессия не позволили начислить дополнительный бонус. Это проверенный локальный кандидат, ещё не работающая функция для пользователей.

Из кабинета LevelPlay через согласованный временный HTTPS-адрес пришли3сообщения с корректной подписью. Приёмник сохранил подтверждения и ответил200. **Однако сам кабинет продолжает показывать “Your callback configuration is not valid…”** — положительную приёмку настройки не заявляем. Причина расхождения пока не установлена. Форму отменили без Save, временный адрес и приёмник остановили.

## Код и проверенные границы

- `apps/api/src/modules/rewarded/levelplay-ssv.ts`: протокол private-key MD5 из официальной документации. Подписанный init USER_ID —64hex nonce попытки; dynamicUserId/custom-параметры не используются для выдачи. `rewards=1` означает одно право на удвоение, сумму монет берём из доказанного нормального daily.
- Реальный Test callback дополнительно присылает **неподписанные** `publisherSubId` и `country`. Первый строгий parser отклонил их. Разрешены только эти два ограниченных служебных поля; они не попадают в проверенную identity/amount/scope. Новая проверка подтверждает, что изменение этих полей не меняет результат, а подмена подписанного игрока по-прежнему отклоняется. Прежние отрицательные проверки сохранены.
- `entitlement.ts`: provider/app-scope/ad-unit сохраняются с попыткой; receipt имеет provider+scope+event ключ. Проверяются пользователь, сессия, срок и бан перед новой выдачей. Уже сохранённый receipt можно подтвердить после logout/expiry без повторной мутации. Identity должна поступать от **доверенной auth-границы**: публичный контроллер/JWT adapter ещё не подключён, одних переданных клиентом IDs недостаточно.
- LevelPlay не подписывает adUnit/appKey в этом протоколе. Scope/unit задаются сервером и сверяются с попыткой, но это **не криптографическое доказательство конкретного unit**. Нужен отдельный per-app key и ограничение провайдерской конфигурации единственным согласованным rewarded unit до дальнейшего review.
- `rewarded-draft.sql` — только черновой DDL вне production migrations. Новые колонки и FK не применялись к старым БД; R21retention policy не выбрана. Синтетическое удаление в тесте не является процессом удаления реальных аккаунтов.
- TimestampYYYYMMDDHHMM имеет минутную точность; offset задаётся явно. Тестовые сообщения кабинета согласуются с UTC, разница до записанного receivedAt11–12секунд. Это не полная приёмка времени реальных ad callbacks/retries. Окно проверки подписи8дней отделено от10минутного окна новой выдачи/текущего Baku-day. Компенсация за поздний первый callback ещё требует решения.
- Nonce должен передаваться как SDK init UserID **до init**. Текущая native TestSuite использует другой случайный идентификатор; её нельзя считать связанной с этим entitlement. Повторная попытка после отмены в пределах уже инициализированного SDK требует отдельного решения, не подменять unsigned dynamicUserId.

## Матрица

| Проверка | Результат |
|---|---|
| Полный API после поправки фактического формата |167/167,0failed/0skipped — [вывод](api-final-167.txt) |
| Rewarded contracts |15/15 — [вывод](rewarded-final-15.txt) |
| Реальный HTTP probe |5/5 — [вывод](probe-final-5.txt) |
| LevelPlay на свежей PostgreSQL |100callbacks→1grant/99acks, rollback/retry/restart, auth-state/scope/protocol guards, residual0 — [JSON](levelplay-db-final.json) |
| Прежний AdMob кандидат на отдельной свежей БД |100callbacks→1grant/99acks, rollback/replay и residual0 — [JSON](admob-db-final.json) |
| Loopback и внешний HTTPS smoke |[локальный](probe-local-smoke.json), [внешний](probe-external-smoke.json): **самоподписанные synthetic requests, не провайдер** |
| Сообщения из LevelPlay Test |3verified, GET/7параметров, origin200, без кошелька — [доказательство](provider-callback-proof.json) |
| Проверка кабинета |Ошибка остаётся; пробовали plain ACK и XML ACK из официальных примеров — [снимок](levelplay-console-test-error.png) |
| Очистка |Туннель и4188закрыты, внешний health530, формаdiscarded безSave, PGостановлен — [JSON](cleanup.json), [снимок](levelplay-form-discarded.png) |

Первый compile-first запуск выявил отсутствующий новый модуль и ошибку типа fixture; это scaffolding failure, не объявляется product regression red/green. Ранний отказ реального запроса из-за двух неизвестных metadata полей сохранён отдельно: [shape-only журнал](provider-initial-rejection-shapes.ndjson). Не перезаписывать эти исходные результаты успешными.

В локальном кластере127.0.0.1:55439 созданы4новые synthetic DBs: `domino_remediation_s042_levelplay_1`, `_levelplay_2`, `_admob_1`, `_admob_2`. В каждую применены19существующих migrations и новый draft DDL. СтарыеS039/S040БД не менялись. Начальная попытка запуска без overrides не смогла занять5432; запросов к существующему сервису5432 не было, после этого кластер запускался с явными127.0.0.1:55439/task socket.

## Внешний тест и секреты

Владелец отдельно разрешил временный Cloudflare адрес, официальный cloudflared в`.tmp` и передачу нового S2S-only key в свой LevelPlay Test. Программа2026.10.3 взята из официального release, archive digest сверён — [публичные метаданные](cloudflared-source.json). Плагин Codex/глобальная служба не устанавливались.

Приёмник `levelplay-probe.mjs` не импортирует Prisma и не имеет wallet/auth/fileserver/API routes. Только health и signature/ACK endpoint, nonce allowlist,24часа, ограничения размера/частоты. Receipt записывается на диск с fsync доACK;20одновременных HTTPповторов+restart оставляют1строку. Сбой записи даёт503безACK, после исправления retryуспешен. Диагностика хранит только имена/длины/формы полей, не URL/ключ/nonce/подпись. Это проверено отдельным тестом.

Новый key и nonce хранятся только в игнорируемой`.tmp/levelplay-callback-probe/private-config.json`, mode600; значения не выводились в чат/Git. При первом чтении пустой формы LevelPlay показал свой короткий автосгенерированный draft key в техническом DOM-выводе; он не сохранялся и был заменён новым отдельным key до теста. Не воспроизводить это значение и не повторять полные snapshots/screenshot формы с заполненным ключом.

Временный callback вводился только в несохранённую форму, нажимался **Test callback**, а не Save. После тестов Cancel→Discard; UI вернулся к существующему приложению с пустой S2Sколонкой. Hold my payments не менялся. Пользователь вошёл в свой прежний аккаунт; новые аккаунты/платёжные профили не создавались.

## Точный следующий шаг

1. Разобраться с расхождением **verified GET+origin200 и ошибкой ConsoleTest**: проверить фактический полученный LevelPlay ответ/ожидаемый формат и deadline. Доставка после одного нажатия XMLтеста пришла через5745мс от клика; это включает frontend/backend/сеть, **не измерение origin response time и не доказанная причина ошибки**. Не отключать подпись и не включать callback ради зелёного индикатора.
2. Повторить на согласованном стабильном изолированном HTTPS endpoint при необходимости. Предыдущее разрешение относится к конкретному временному тесту, не к production deploy или покупке хостинга. Для обращения в поддержку подготовить обезличенный draft и попросить владельца отправить; агент ничего не отправлял.
3. После успешной внешней приёмки — настоящий authenticated issue/cancel/status adapter и native flow с nonce доinit, фактически подтверждённый testmode, privacy для13–17+взрослых, реальный callback завершённого просмотра и полный путь normal bonus→ad→одинupgrade. Ни ConsoleTest, ни старый TestSuite не заменяют этот путь.
4. До выпуска отдельно: миграция/retention/app-ads.txt/kill switch/rollout/late-callback compensation. Публичный rewarded_x2403/availabilityfalse остаётся.

Телефон в S042 найден поADB; новую APK не ставили и прежний успешный S041показ без необходимости не повторяли. Сервер/API/live wallets/опубликованныйAPK не менялись. Нет push/remoteCI/сообщений поддержке.

Источники: [официальный S2S формат](https://docs.unity.com/en-us/grow/levelplay/platform/settings/event-handlers), [настройка/ACK/retries](https://docs.unity.com/en-us/grow/levelplay/platform/settings/server-to-server-callback), [UserID доinit](https://docs.unity.com/en-us/grow/levelplay/sdk/android/sdk-integration), [Cloudflare Quick Tunnels](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/). Историческая native приёмка: [S041](../session-041/R09_PHONE_RESULT.md).
