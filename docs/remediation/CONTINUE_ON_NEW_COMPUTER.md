# Продолжение работы на другом компьютере

Репозиторий: https://github.com/jafarovsamir89/domino2. Рабочая ветка: **`fix/audit-foundation`**.

## Получить файлы

Для нового checkout:

```sh
git clone --branch fix/audit-foundation https://github.com/jafarovsamir89/domino2.git
cd domino2
```

Если репозиторий уже есть, сначала проверить `git status`. Не сбрасывать чужие локальные изменения. В чистом checkout:

```sh
git fetch origin
git switch fix/audit-foundation
git pull --ff-only
```

Все исходники, тесты, журналы, план и сохранённые результаты проверок находятся в Git. `.tmp`, зависимости, локальные базы, APK, сырые системные traces и секреты не переносятся через Git. Для продолжения анализа они не обязательны; для новых проверок нужен свой локальный стенд.

## Что агенту читать первым

1. [Корневой AGENTS.md](../../AGENTS.md).
2. [AGENT_JOURNAL.md](AGENT_JOURNAL.md) — актуальный контекст, решения, ограничения и следующий шаг.
3. [WORK_LOG.md](WORK_LOG.md) — история действий и проверок; дополнять, не переписывать.
4. [REMEDIATION_PLAN.md](../audit/REMEDIATION_PLAN.md) — единый план из 42 карточек.
5. [Последний результат S028: R-20 и R-22](evidence/session-028/LOCAL_SOLO_LOCALIZATION_RESULTS.md).
6. [Результат S027: R-21 и R-23](evidence/session-027/ACCESSIBILITY_DELETION_RESULTS.md).
7. [Предыдущий результат S026: R-10 и R-18](evidence/session-026/SECURITY_REALTIME_RESULTS.md).

Полностью закрыты локально **22/42 карточки**. R-09/R-15/R-19/R-25 имеют оставшийся объём. R-20/R-22 частичны по S028: бесплатный solo доступен гостю после startup account-readiness; онлайн остаётся gated; видимые подарки/редкость локализованы AZ/RU/EN. Ещё нужна браузерная/Android приёмка и полный localization review/TR pilot. R-21/R-23 частичны по S027, R-10/R-18 по S026. Предыдущие продуктовые изменения: `85b10a5` — сохранение денежного итога; `f6a395e` — запуск без обязательной паузы. S026: Android compile требует JDK21, функциональные проверки отложены.

Проверено: API **148/148** на Node 22/25; server **390/397** и E2E **53/62** содержат прежние 7/9 падений. Новые 10 браузерных сценариев запуска прошли. Это не полностью зелёный набор. Точные имена и доказательства: [failure-delta.json](evidence/session-025/failure-delta.json), [проверки R-29](evidence/session-024/summary.json), [проверки R-15](evidence/session-025/summary.json).

Следующий шаг — проверить guest solo start/resume и online/coin denial в изолированном браузере; проверить 320px/TalkBack на Android при наличии устройства; запросить владельческий/Console review для S027 до публикации. Параллельно продолжить S026: JDK21 Android compile, synthetic token states and active-room policy, mic/NAT/TURN. S028 static checks pass; product/E2E tests were not run. Последний размер пакета — два пункта.

Телефонные замеры запуска R-15 и внешняя приёмка звука R-19 остаются открытыми. Владелец разрешил продолжать без телефона; не блокировать этим независимую работу и не выдавать браузерные результаты за Android.

## Подготовить чистые зависимости для новых проверок

Проверенные версии стенда: Node **22.14.0**, npm **10.9.2**. Включить Node 22 своим менеджером версий. На другом компьютере старых `.tmp/remediation-s014/...` и ссылок из журнала не будет — это описание прежнего стенда, а не файлы, которые нужно найти.

Из корня checkout создать новую изолированную копию без `.env`, затем установить обе группы зависимостей из lockfiles:

```sh
node docs/remediation/scripts/prepare-checkout.mjs .tmp/remediation-s027/clean
node docs/remediation/scripts/run-check.mjs s027-root-ci .tmp/remediation-s027/clean -- npm ci
node docs/remediation/scripts/run-check.mjs s027-server-ci .tmp/remediation-s027/clean -- npm --prefix server ci
node docs/remediation/scripts/run-check.mjs s027-source .tmp/remediation-s027/clean -- npm run check
```

Путь должен быть новым. Если S027 уже занят, выбрать следующий свободный номер и одинаково изменить пути/метки. `run-check.mjs` даёт дочернему процессу только разрешённые переменные и синтетические localhost endpoints. Проверять exitCode каждого шага перед следующим.

Для новых E2E установить соответствующий lockfile Chromium обычной командой Playwright в этой копии. Это зависимость тестового инструмента, не плагин Codex. API имеет отдельные workspace-зависимости и TS5; не подменять их одним чужим root node_modules. Не запускать API rebuild одновременно со скриптами, импортирующими его dist.

PostgreSQL/Redis нужны только соответствующим проверкам. Поднимать собственные локальные экземпляры и новые синтетические базы. Вспомогательные PG/ADB-скрипты содержат некоторые пути старого macOS-стенда: адаптировать их под свою ОС, сохранив localhost-проверки и запрет production. Старые `.env`, реальные токены, базы пользователей и ключи для этого не нужны.

## Что нельзя потерять при продолжении

Игра уже обслуживает около 50 пользователей. Текущие исправления **не развёрнуты** на рабочем сервере и в Play. Не запускать deploy, реальные миграции и операции с рабочими кошельками без прямого поручения.

Для будущего выпуска R-29 обязателен `ECONOMY_OUTBOX_DIR` — абсолютный путь на постоянном локальном томе, переживающем замену сервера/контейнера. Сначала выпускать соответствующий API. Без настройки production game server намеренно не стартует. Полные условия: [OUTBOX_OPERATIONS.md](evidence/session-024/OUTBOX_OPERATIONS.md).

Сохранять соответствие исходников и `www`, старые доказательства аудита и честный статус оставшихся проверок. После каждого рабочего пакета обновлять оба журнала, единый план и отправлять код вместе с результатами в эту ветку.

## Сообщение для нового агента

> Продолжи исправления Domino в ветке fix/audit-foundation. Сначала прочитай AGENTS.md, docs/remediation/CONTINUE_ON_NEW_COMPUTER.md и указанные там журналы и план. Игра работает на сервере, около 50 пользователей: изменения готовим локально, без production-деплоя. Сначала проверь S028 guest solo start/resume и online/coin denial изолированным браузером, затем продолжи приёмку частичных R-20/R-22. При наличии Android проверь S027 TalkBack/320px для R-23; по R-21 владелец должен подтвердить mailbox/deletion/retention policy и Google Play Console. Продолжи S026 по `evidence/session-026/SECURITY_REALTIME_RESULTS.md`: JDK21, синтетические token cases и политика уже начатой партии, затем mic/NAT/TURN. Веди журналы и объясняй результат простым русским языком. Не считать приёмку выполненной без реальных проверок.
