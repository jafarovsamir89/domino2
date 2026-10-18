# Конкуренты и рыночные возможности

> Аудит 17 октября 2026. Репозиторий `jafarovsamir89/domino2`, ветка `release/play-prep`, коммит `508932ebeb45cde744e3e1dbd92bc5592ca66093`. Проверки только локальные. Игра уже опубликована в Google Play; production и реальные кошельки не изменялись.


## Методика

Снимок Google Play получен 17.10.2026: metadata 10 приложений и 60 newest доступных отзывов en_US каждого — **600 отзывов**. Это удобная выборка, а не репрезентативный опрос всех стран. Рейтинги/установки относятся к листингу; installs — порог, не точное число активных игроков. Географическая выручка и CCU из листинга неизвестны. Приложения конкурентов не запускались на устройстве: их FPS, startup и реальное качество сети не измерены.

[Метаданные](evidence/metrics/competitors.json), [отзывы без имён авторов](evidence/metrics/reviews.json), [сводка](evidence/metrics/review-summary.json), [30 прочитанных примеров](evidence/metrics/review-manual-sample.json). Тематическая разметка 600 записей автоматическая по ключевым словам, с ручной проверкой 30 примеров; не утверждается, что каждый отзыв вручную классифицирован. Короткие «good» с 1 звездой и другие несоответствия показывают шум выборки.

## Сравнение десяти приложений

| Приложение / разработчик | Установки / рейтинг | Ads / IAP по листингу | Заявленные особенности | Практический вывод |
|---|---|---|---|---|
| [Dominoes: Classic Dominos Game](https://play.google.com/store/apps/details?id=com.LoopGames.Domino) / Loop Games | 100,000,000+ / 4.74 | да / да | Draw/Block/Fives, offline, VIP | Простой понятный solo; рекламу и подписку оценивать по отзывам |
| [Dominos Online Jogatina: Game](https://play.google.com/store/apps/details?id=air.com.jogatina.domino.android) / Jogatina.com | 10,000,000+ / 4.30 | да / да | 2/4, команды, private, 3 AI levels | Социальная игра и выбор вариантов; быстрый rematch |
| [Domino! Multiplayer Dominoes](https://play.google.com/store/apps/details?id=com.flyclops.domino.android) / Flyclops LLC | 5,000,000+ / 4.67 | да / да | Fives/Block/Draw, async и live | Игра со знакомыми в удобном темпе |
| [Domino Go - Online Board Game](https://play.google.com/store/apps/details?id=com.beachbum.domino) / Beach Bum Ltd. | 1,000,000+ / 4.50 | да / да | Live board game, progression | Выразительная metagame; не перегружать ею стол |
| [Domino - Dominos online game](https://play.google.com/store/apps/details?id=ru.skillcap.dominoes) / ZiMAD | 10,000,000+ / 4.51 | да / да | 2/3/4, 6 вариантов, leagues | Региональные варианты и соревнования |
| [Dominoes: Classic Dominos Game](https://play.google.com/store/apps/details?id=loppipoppi.dominoes) / NewPubCo | 10,000,000+ / 4.72 | да / да | All Fives/Block/Draw | Доступный classic опыт и offline-first ожидания |
| [Domino Legends: Classic Game](https://play.google.com/store/apps/details?id=com.playvalve.dominoes) / Bluetile | 10,000,000+ / 4.73 | да / да | Online, leagues и progression | Статус и соревновательная мотивация |
| [Domino Dreams™](https://play.google.com/store/apps/details?id=com.screenshake.dominodreams) / SuperPlay. | 10,000,000+ / 4.74 | нет / да | Puzzle/metagame, смежный продукт | Референс эмоциональной подачи; не конкурент по тем же правилам |
| [Higgs Domino Global](https://play.google.com/store/apps/details?id=com.neptune.dominogl) / Higgs Games | 1,000,000+ / 3.78 | нет / да | Domino + другие игры/slots, смежный | Социальная оболочка; gambling-механики не переносить |
| [Dominoes All Fives - Offline](https://play.google.com/store/apps/details?id=com.tappaz.dominoes.free.game.reef.adventure.domino.ocean.fishes) / tappaz.studio | 100,000+ / 4.42 | да / да | Offline All Fives, без signup | Быстрый вход, правила и понятный solo |

Заявленные возможности взяты из store description; наличие галочки не доказывает одинаковый договор Telefon/101. Domino Dreams и Higgs намеренно отмечены смежными: первый полезен для подачи наград/прогрессии, второй демонстрирует социальную вовлечённость, но имеет существенно иную продуктовую и policy-модель.

## Жалобы и сильные стороны

| Тема | Упоминания из 600, multi-label | Из них score ≤2 | Вывод для Domino |
|---|---:|---:|---|
| Реклама | 82 | 54 | не прерывать ход, предсказуемые паузы и честное описание no-ads |
| Покупки / coins | 53 | 32 | прозрачная стоимость и история; запрет скрытой подстройки раздачи |
| Fairness / bots | 36 | 30 | явно обозначать AI, исключить доступ к hidden hands |
| Stability | 36 | 25 | восстановление важнее новой косметики |
| Social | 14 | 4 | invite должен приводить именно к совместной игре |
| Rules | 40 | 24 | объяснять выбранный региональный вариант и открытые концы |
| Positive enjoyment | 166 | 26 | слова не равны sentiment: даже негативный отзыв может говорить «было весело» |

Количество упоминаний не равно числу дефектов и не складывается до 600: один отзыв имеет несколько тем, часть не размечена. Проценты нельзя переносить на всю аудиторию.

Прочитанная выборка включает претензии к навязчивым/незакрываемым ads, долгому возвращению к следующему раунду, потере аккаунта, freeze при запуске и непонятному размещению костяшек. Положительные мотивы — спокойная умственная игра и реальные знакомые. Жалобы о «подкрученной раздаче» отражают **восприятие пользователей**, не доказанный алгоритмический обман конкурентов.

В [обсуждении приложений](https://www.reddit.com/r/dominoes/comments/1tvv7sq/dominoes_apps/) ценят игру с семьёй, private/voice и привычные правила; среди ответов есть самореклама разработчиков. В [обсуждении игры между друзьями](https://www.reddit.com/r/dominoes/comments/1lhzsp9/what_is_currently_the_best_app_for_play_between/) мнения о скорости расходятся. Эти сообщения — качественные сигналы, не статистика.

## Позиция Domino

Сильная потенциальная ниша — Telefon/Пятёрочка с привычными для региона правилами, AZ/RU и удобной частной компанией. Реализованные voice/gifts/2v2 создают основу социальной игры, но их преимущество над конкурентами не доказано полевыми тестами. Не заявлять «лучшие боты», «самая честная раздача» или «самое быстрое домино» без сравнительного протокола.

Сейчас слабее сильных листингов по ясности входа, tutorial, короткому rematch, объяснению правил и доверию к экономике. Визуальный характер узнаваем, но читаемость центра поля и плавность мобильного WebView нуждаются в улучшении. Рекламных помех сейчас нет из-за выключенной монетизации — это комфорт, но ещё не коммерческое преимущество.

## Географии

AZ — точное региональное правило, язык, удобный private code и вечерняя игра с друзьями; TR — проверить запрос на конкретный вариант, перевести UI/правила/ASO на турецкий; RU — привычное объяснение 101/Пятёрочки и доступный offline solo. Другие рынки: сначала подтвердить соответствие All Fives и ожиданиям Draw/Block. Данные о размере адресуемой аудитории этих стран не получены: оценивать спрос по organic listing experiments, interviews и first-match completion.

Не конкурировать с 100M installs числом экранов. Последовательность: стабильная партия → совместная игра за один invite → честный AI → локальные лиги после появления плотности. Каталог десятков skins и сезоны не компенсируют потерянную партию.
