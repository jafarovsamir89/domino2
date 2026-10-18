# Исправление Domino: текущая работа

Первым читать [AGENT_JOURNAL.md](AGENT_JOURNAL.md): там текущая ветка, состояние и ближайшее действие. Затем [WORK_LOG.md](WORK_LOG.md) и нужная карточка [единого плана](../audit/REMEDIATION_PLAN.md).

Пользователь сообщил о действующем сервере и примерно 50 пользователях. Исправления готовятся локально в `fix/audit-foundation`; production и Play-пакет не обновлялись. Отдельные production-действия требуют прямого поручения владельца.

## S001: первый пакет

- **R-06 исправлен локально:** clean root/server install проходит; существующие locked версии не менялись.
- **R-25 выполнен частично:** стандартный server test runner обнаруживает 37 файлов вместо 30, включая вложенные JS/CJS/ESM tests; полный CI не объявлен готовым.
- API127/127 на Node 25.6/npm 11.8 и Node 22.14/npm 10.9.2. Полный server236/243, исходный E2E30/39 — те же 7/9 падений, что в аудите, без новых.
- Новый browser network-boundary test прошёл; unmocked обращения к действующему API/game в локальных E2E блокируются.
- [Сводка проверок](evidence/session-001/summary.json), [диспозиция падений](evidence/session-001/FAILURES.md).

На другом компьютере получить эту работу:

```sh
git fetch origin
git switch fix/audit-foundation
git pull --ff-only
```

## S002: сохранение настроек экономики

**R-05 исправлен локально:** defaults создаются при запуске API, чтение конфигурации не записывает данные. Настроенные ставки, комиссии, названия, цены и отключённые позиции сохраняются даже после повторного запуска. API130/130 на Node25/22; отдельная PostgreSQL подтвердила отсутствие записей при чтении и дублей при четырёх одновременных запусках. [Проверки](evidence/session-002/summary.json). Всего локально завершены2/42, R-25 частично.

## S003: ежедневный бонус на новой базе

**R-07 исправлен локально:** startup создаёт обязательный daily_login; fresh migrations → normal daily работает без ручного добавления quest. Размеры daily не менялись, дополнительной награды нет, admin edits сохраняются. API131/131 на Node25/22. [Проверки](evidence/session-003/summary.json). Всего локально завершены3/42, R-25 частично.

Следующий пакет: R-02, защита ежедневных начислений от одновременных запросов; точные подсказки — в журнале агента.

## Изолированные проверки следующего пакета

Пример после получения текущего коммита; из корня репозитория:

```sh
node docs/remediation/scripts/prepare-checkout.mjs .tmp/remediation-s002/clean
node docs/remediation/scripts/run-check.mjs s002-root-ci .tmp/remediation-s002/clean -- npm ci
node docs/remediation/scripts/run-check.mjs s002-api .tmp/remediation-s002/clean -- npm --prefix apps/api test
```

`prepare-checkout` копирует текущие tracked/staged файлы без `.env`, node_modules и тяжёлых evidence, отказывается перезаписывать существующую копию. Новые исходники сначала добавить в index или явно перенести в копию. `run-check` формирует окружение без наследования боевых секретов, задаёт локальные endpoints и отключает optional Redis. Префикс `s002-` выбирает `evidence/session-002` и соответствующий temporary checkout; для следующего пакета менять номер. Это unit/build wrapper, не запуск production и не полноценный staging bootstrap.
