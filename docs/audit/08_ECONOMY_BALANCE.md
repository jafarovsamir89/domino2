# Экономика, ставки и монеты

**Дополнение:** обычный подарок1000→получатель→обмен700 прошёл. В453 длительных локальных матчах сверены100 кошельков: 1 000 000 +100 000 grant =1 093 205 balance +0 reserved +6 795 commission. Обнаружен **R-42/P1**: UI победителя показывает −20 вместо фактического +180, поскольку повторно вычитает возвращённую ставку. Это подтверждённая ошибка summary, лишнего списания в этой партии нет. [Ledger, методика и ограничения](SINGLE_ANDROID_AUDIT.md).

Продолжение:30 нормальных последовательных daily claims подтвердили 51 050 монет; четыре модельных профиля рассчитаны на 7/30/90 дней. Политика cap/cycle требует решения владельца R-33. [Методика и результаты](CONTINUATION_ANALYSIS.md) отделяют наблюдаемое поведение сервиса от модельных предположений. Это не production-статистика и не оценка общей инфляции.

> Аудит 17 октября 2026. Репозиторий `jafarovsamir89/domino2`, ветка `release/play-prep`, коммит `508932ebeb45cde744e3e1dbd92bc5592ca66093`. Проверки только локальные. Игра уже опубликована в Google Play; production и реальные кошельки не изменялись.


## Финансовая модель продукта в коде

Монеты виртуальные, ledger и wallet находятся в PostgreSQL. Online резервирует средства перед матчем и рассчитывает их через подписанный серверный результат. Commission в default stakes — 1 000 bps, то есть 10% проигранного банка, а не автоматически 10% суммы всех кошельков. Бесплатная ставка есть в backend-логике, но default config скрывает её как неактивную. Solo-stake endpoints отключены; клиентские тесты ожидают отсутствие их вызовов. Покупки и реклама выключены флагами, поэтому модель выручки в отдельном документе относится к будущей реализации.

## Доказанные проблемы

Все операции ниже проведены только на `127.0.0.1:55439/domino_audit`. Скрипт [economy-probes.mjs](evidence/scripts/economy-probes.mjs) отказывается работать с другим host/port/db. [Результаты](evidence/metrics/economy-probes.json).

| ID | Условия и результат | Причина / минимальное исправление | Проверка |
|---|---|---|---|
| R-02 P0 | normal 200, затем 8 concurrent rewarded_x2 → 1 800 вместо 400 | `economy.service.ts:1490–1506`: read/update/credit без CAS по upgrade; условный UPDATE/row lock + unique ledger key | 100 concurrent и retry после timeout, balance=400 |
| R-09 P0 | direct x2 без ad proof, flag unset → 400 | `1466–1474`: доверие claimMode; server-verified reward entitlement | forged/expired/replayed event отклонён; valid SSV один раз |
| R-03 P0 | signed old-match-A settles reserves current-match-B | `1983–1990`: FOR UPDATE по room/stake/status без matchId; фильтр/unique lifecycle по matchId | old result оставляет B reserved; B settled ровно один раз |
| R-05 P0 | admin isActive=false, commission=250 → public config → true,1000 | `461–515` ensureBootstrap upsert.update содержит defaults | чтение не меняет config; seed только migration/bootstrap once |
| R-07 P1 | чистые миграции + daily claim → Quest not found | `1586` вызывает daily_login; `3240` требует quest, а bootstrap его не создаёт | fresh install + migrations + claim работает без ручного seed |

Административный «выключатель» ставки нельзя считать рабочей аварийной защитой до R-05. Если нужны production-меры, владелец сначала проверяет deployment и готовит отдельное согласованное изменение. В аудите настройки боевого сервиса не трогались.

## Как исправлять транзакции

Уникальная сущность reward entitlement: `(playerId, rewardDateUTC, rewardKind, version)`; ad event `(provider,eventId)` отдельно уникален. Проверка и начисление внутри одной PG-транзакции. CAS на appliedAt/upgradeApplied и INSERT ledger с уникальным idempotencyKey. Не полагаться на disable кнопки.

Reserve/settle/refund имеют один immutable matchId. State machine `created → reserved → settled | refunded`, терминальные состояния необратимы. Сверять participants, stakeTable version, winner set, totalDebits/credits/commission. HMAC защищает происхождение, но не порядок старого и нового события. Результат сначала durable, повторная доставка безопасна. Зависшие резервы reconciler проверяет с room-finality, а не просто возвращает деньги по возрасту.

## Баланс и инфляция

Нужен ежедневный отчёт: minted starter/daily/ads/admin; spent cosmetics/gifts; transferred wins; destroyed commission; reserved; refunds; изменение total circulating. Проверка: сумма wallet balance + reserved согласуется с ledger и выбранной семантикой available balance. Не считать «покупку подарка» сжиганием всех монет, если получатель может их обменять.

При 50 на двух игроков локальный тест показал payout=45 и commission=5; победителю также возвращается его собственный reserve в расчёте баланса. Для UX показывать «ваш риск 50, возможный чистый выигрыш 45», а не неоднозначное «банк 100». Для 2v2 отдельно описать распределение по победителям и rounding remainder.

Starter/daily должны обеспечивать несколько бесплатных партий, но не подменять подбор соперников постоянным пополнением. Рекомендуется бесплатный нерейтинговый online и opt-in ставки виртуальными монетами; paid cosmetics не влияют на раздачу/подсказки/силу бота. До исправления R-02 нельзя оценивать инфляцию по данным, включающим возможные дубли.

## Не доказанные гипотезы

Конкурентная отправка inventory gifts читает quantity и затем decrement; однако ensureGiftCatalog может сериализовать операции общими writes. Не объявлено подтверждённым double-spend. Проверить 50 send одного inventory item, simultaneous exchange, accepted invite twice, reserve в двух комнатах, HTTP retry after commit. Existing unit tests не заменяют реальные row-lock tests.

Цены skins/gifts имеют migrations и defaults; повторный bootstrap может отменять ценовые решения. Сначала исправить источник истины, затем проводить A/B цен. Нужны лимит дневных faucet, антифрод без наказания честных пользователей и понятная история начислений/возвратов.
