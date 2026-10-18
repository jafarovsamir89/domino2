# Удержание, аналитика и ASO

> Аудит 17 октября 2026. Репозиторий `jafarovsamir89/domino2`, ветка `release/play-prep`, коммит `508932ebeb45cde744e3e1dbd92bc5592ca66093`. Проверки только локальные. Игра уже опубликована в Google Play; production и реальные кошельки не изменялись.


## Воронка и приоритет

Текущий путь: install → заставка минимум 5,5 с → обязательный вход → меню с daily/shop → solo settings → первая партия. Экспертные точки риска — задержка до полезного действия, auth до знакомства, неясные региональные правила, проигрыш без понятного объяснения, медленный rematch и отсутствие знакомого соперника. Реальные conversion/retention неизвестны; это гипотезы по UX, не измеренная воронка.

Первый продуктовый пакет: быстрый локальный solo, интерактивное объяснение одного первого хода, ясный результат и rematch одним действием. После завершённой партии предложить сохранить прогресс/пригласить друга. Daily должен поддерживать возвращение, а не перекрывать игру или выдавать неоднократные награды.

## План измерения

| Событие | Полезные свойства без персонального текста | Решение |
|---|---|---|
| app_open / interactive_ready | release, device tier, cold/warm, elapsed | скорость входа |
| auth_started / completed / failed | provider, elapsed, normalized error | точка отказа |
| tutorial_step / tutorial_complete | ruleset, step, assisted | понятность правил |
| match_created / joined / first_legal_move | mode, solo/online, players, timeToMove | активация |
| match_finished / abandoned | matchId, rulesetVersion, duration, reason | качество партии |
| rematch_clicked / started | elapsed, samePlayers | повторная игра |
| reconnect_started / recovered / finalized | phase, gap, recoveryMs | устойчивость |
| invite_created / opened / accepted / match_started | opaque inviteId, channel category | фактическая совместная игра |
| reward_requested / verified / credited | entitlementId, source, latency | экономика и доверие |
| ad_request / impression / revenue | placement, country bucket, provider | net ARPDAU |
| purchase_started / verified / refunded | productId, transaction reference | conversion и refunds |

Server-side events задают истину finished/credited/purchase. Client analytics не должен решать финансовые исходы. Дедупликация eventId, UTC timestamp и schema version обязательны. Не отправлять chat text, чужие руки, email, auth token или произвольные ошибки с секретами. Согласие/retention для analytics согласовать с Data Safety.

Определения: D1/D7/D30 — активность install cohort в конкретный день, отдельно rolling retention; activation=первый законный ход; completion=server-finalized матч; rematch=новый начатый матч, не tap. Сегменты: AZ/RU/EN/TR после локализации, device tier, mode, new/returning, source. Не смешивать solo и online в одном показателе удержания.

## Эксперименты по порядку

1. Меньше заставки + playable solo: time-to-first-move и completion; guardrails crash/ANR/auth success.
2. Короткое объяснение Telefon/101: illegal taps, завершённая первая партия и второй матч.
3. Ясный итог + rematch: started rematch, не клики.
4. Invite после совместного успеха: invited installs→совместный законченный матч; не массовые уведомления.
5. Rewarded placement вне игры: increment net revenue при неизменных completion/retention.

Один существенный эксперимент за раз в маленькой аудитории. Заранее задать минимально значимый эффект и размер выборки, считать интервалы; при десятках игроков качественные интервью и recordings с согласием полезнее недостоверного A/B. Внутренние тестовые профили исключить из analytics.

## Возвращение и социальный рост

Удобный private room, share code/link, статус готовности и честный fallback с помеченным ботом решают проблему низкого online в начале. Не показывать искусственную толпу «живых» игроков. При малом CCU matchmaking объединяет географии только при совпадении правил и приемлемом RTT; региональные лиги запускать после появления плотности.

Daily quests: закончить партию, попробовать правило, сыграть с другом; не стимулировать проигрыш/покупку преимуществ. Cosmetics коллекция может отмечать мастерство/сезон. Командные соревнования и сезон — P2 после восстановления/антифрода. Push только opt-in с конкретной ценностью: приглашение друга, ответ, начало выбранного события; тихие часы, лимит частоты, простой opt-out. Для неактивного пользователя — редкое релевантное сообщение, а не серия напоминаний о монетах.

## ASO

Для каждого рынка отдельные title/short description и первые screenshots: реальный стол, Telefon или выбранный 101, offline/online только если режим реально доступен. Показать понятный score, private friends и отсутствие помех во время хода. Не обещать «без рекламы» после включения межматчевых ads, «работает offline» при обязательном fresh auth или «реальные соперники» при AI.

AZ: региональные термины и правила с носителем языка. RU: «Пятёрочка / Телефон / 101» с ясным объяснением различий. TR: сначала перевод и интервью о нужном варианте. Не закупать запросы о другом домино. Получать оценку Play после хорошей завершённой партии, не за вознаграждение и не только у предположительно довольных игроков.

Цели первого 90-дневного этапа — достоверная аналитика, рост first-match completion и уменьшение reconnect failure. Численные D1/D7/D30 из финансовой модели — сценарии, а не текущие KPI или отраслевые гарантии.
