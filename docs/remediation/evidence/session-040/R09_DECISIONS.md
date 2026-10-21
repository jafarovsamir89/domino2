# R09 — совместное решение, S040, 2026-10-21

Ветка `codex/rewarded-acceptance`, исходная точка `a11df89`. Полный счёт **27/42**, R09 открыта. Ниже — выключенный локальный кандидат, не опубликованный сервис.

## Подтверждено владельцем

- Аккаунт и выплаты: **физическое лицо, Азербайджан**. Основные игроки — Азербайджан, также СНГ и весь мир.
- Целевая аудитория: **13–17 лет и взрослые, без младше 13**. Это ответ владельца; сам раздел Play Console агент не проверял.
- AdMob не настроен; владелец сообщает о блокировке около 10 лет назад. Выбираем независимого поставщика. Другой аккаунт AdMob не предлагается.
- Сначала обычный ежедневный бонус. Затем добровольный завершённый просмотр даёт **такую же сумму дополнительно, один раз в сутки**. Пример: 200 + 200. Отмена сохраняет обычный бонус. Сумма из callback не определяет число монет.
- Провайдер **не выбран**. 3 попытки/10 минут и день Asia/Baku пока унаследованы от прототипа; окончательный контракт срока и повторных callbacks требует сверки с выбранным провайдером.

## Исправление и польза

S039 issue() принимал любую daily-запись как обычную, включая старую уже удвоенную. Теперь проверяется исходный ledger: игрок, тип, ключ, дата, сумма и metadata обычного начисления. Проверка есть при выдаче попытки и при начислении. Неоднозначное старое начисление не допускается к рекламному удвоению; обычный daily не меняется. День формируется как ISO-дата из календарных частей Asia/Baku.

Это предотвращает повторное удвоение уже удвоенной основы. Регрессия до правки: 2 failed/1 passed. После: 7/7 целевых проверок, полный API 159/159, без пропусков. Реальная локальная PostgreSQL: 100 подтверждений → 1 награда/99 повторных подтверждений; rollback/retry/restart, отмена, срок, лимиты и reserved проверены. Старый x2 и отсутствие исходного доказательства отклонены до попытки. Это синтетические AdMob callbacks для проверки транзакций, **не приёмка Unity/MAX и не реальный просмотр**.

Команды:

```sh
npm --prefix apps/api test
node --test apps/api/dist/test/rewarded-entitlement.test.js apps/api/dist/test/rewarded-ssv.test.js
node docs/remediation/scripts/rewarded-local-db.mjs --database domino_remediation_s040_r09_1 --output docs/remediation/evidence/session-040/rewarded-local-db.json
```

19 существующих миграций применены к новой синтетической БД 127.0.0.1:55439; draft DDL вне production migrations. PG затем остановлен, БД сохранена. Harness теперь принимает свежую session DB/output и сохраняет исторические доказательства.

Доказательства: [до](legacy-red.txt), [после](rewarded-green.txt), [API](api-full.txt), [миграции](local-migrations.txt), [DB](rewarded-local-db.json). S039 не перезаписана. Frontend/native/обычный daily не изменялись, широкие E2E/Android не повторялись. CI S039 — исторический baseline.

## Исследование поставщиков

**Предложение после ответа о возрасте: первым проверить Unity Ads.** До SDK подтвердить приём физлица из Азербайджана и способ выплат. Это предложение, не решение владельца и не гарантия одобрения/дохода.

- [Unity Ads FAQ](https://docs.unity.com/en-us/grow/ads/references/faq) допускает выплаты физлицам и использование SDK вне движка Unity. [Выплаты](https://docs.unity.com/en-us/grow/dashboard/finance/payment/earnings-payouts) требуют профиля; именно Азербайджан публичной страницей не подтверждён. Есть [настройки аудитории](https://docs.unity.com/en-us/grow/dashboard/get-started/project/settings); нельзя автоматически считать всех игроков взрослыми.
- [Unity Ads S2S](https://docs.unity.com/en-us/ads-unity/4.18.0/sdk-integration/s2s-redeem-callbacks) настраивается через поддержку. [LevelPlay](https://docs.unity.com/en-us/grow/levelplay/platform/settings/server-to-server-callback) — другой протокол со своим форматом подписи, ответа и инструментом тестирования callback. Не смешивать. Сначала определить прямой Unity Ads или LevelPlay, коммерческий допуск и порядок проверки S2S. В audit-сборке использовать тестовые объявления, реальные проверки — по согласованному с провайдером порядку.
- MAX первоначально рассматривался по техническим возможностям: [собственная реклама](https://support.applovin.com/en/max/getting-started), [серверное подтверждение](https://support-preview.axon.ai/en/max/faq/how-server-to-server-callback-works). Но [Android privacy](https://support.applovin.com/en/max/android/overview/privacy) запрещает запуск SDK для пользователя, являющегося ребёнком по применимым правилам. Для международной аудитории 13–17 исключения младше 13 недостаточно, нужен отдельный возрастной контракт. [Выплаты MAX](https://support.applovin.com/en/max/faq/faq-applovin-monetization-payment): минимум $100, способы зависят от страны; Азербайджан не подтверждён. Тестовые объявления MAX не дают S2S callback.
- [Yandex](https://ads.yandex.com/helpcenter/en/payments/payments) описывает выплаты физлицам «Other countries», но точный допуск Азербайджана и подходящий подписанный Android S2S пока не установлены. Клиентского сообщения о просмотре недостаточно для R09.

Официальные страницы проверены 2026-10-21. География игроков сама по себе не определяет подходящую сеть. SDK/плагины не установлены, аккаунты не созданы, обращения не отправлялись.

## Конкретный следующий шаг

Совместно выбрать первый сервис для проверки допуска; предложение — Unity Ads. Подтвердить работу с физлицом из Азербайджана, выплаты на его банк, аудиторию 13–17 + взрослые и порядок настройки/проверки S2S. Затем реализовывать выбранный протокол, auth/ban/deletion, отдельный audit APK и migration/retention review. Текущий AdMob ECDSA verifier нельзя использовать для Unity/MAX. Публичный rewarded_x2 остаётся403, флаги false. Нет production/Play изменений.

Текст для самостоятельного обращения владельца, **не отправлен**:

> I own a domino game already published on Google Play. I would register as an individual resident of Azerbaijan and receive payments to my own bank account in Azerbaijan. The intended audience is ages 13–17 and adults, mainly Azerbaijan, with CIS and worldwide users. AdMob is unavailable to me due to an old account suspension, and I am seeking independent monetization. Can you confirm publisher eligibility and available payout methods for this setup? Which Unity Ads or LevelPlay integration would you recommend for one optional rewarded ad per day, and how can we configure and validate authenticated server-to-server reward callbacks in an unpublished audit build? We do not want to generate invalid live ad traffic during testing.
