# S001 — открытые падения после восстановления установки/discovery

Состояние18.10.2026. Полный server236/243 на обеих проверенных версиях Node; исходные39E2E дают30pass/9fail, набор падающих E2E names совпадает с аудитом. Никакие assertions не ослаблялись, тесты не исключались. Это baseline для следующих исправлений, не утверждение, что все падения — продуктовые дефекты или все они устарели.

## Server:7

| Тест | Наблюдение | Что делать дальше |
|---|---|---|
| disconnect keeps live presence offline during grace and removes it after timeout | Colyseus private #_roomId getter вызывается на объекте fixture без настоящего конструктора | Исправить fixture через актуальный room/schema contract, затем отдельно проверить production-поведение grace/presence |
| grace timeout starts bot takeover instead of forfeit when the feature is enabled | Ожидается true, получено false | Уточнить флаг/состав комнаты и реальный takeover contract; причину не считать доказанно только устаревшим тестом |
| explicit leave stays a forfeit and never starts bot takeover | Вместо controller human получено undefined | Проверить полноценность player/schema fixture и явный leave; не менять правила takeover ради assertion |
| reusable session restore sends full_state to new sessionId | updateSchemaState читает length отсутствующего поля fixture | Восстановить корректный state в fixture; отдельно проверить обработку настоящего неполного snapshot с R-01/R-04 |
| server keeps the final board on game_delta and omits it from the immediate result sync | Static extractBlock не видит ожидаемый вызов внутри syncState | Проверить парсер/актуальную функцию, заменить хрупкую source assertion поведенческой регрессией final board/result |
| client renders bazaar draw state from live solo hands and keeps multiplayer cache isolated | Source assertion ожидает старое выражение disabled | Проверить актуальный solo/online contract реальным вызовом helper/UI, не добавлять старую строку в продукт ради теста |
| handleTimeoutContinue only accepts the timeout loser and starts the next round on success | Вместо continue_in_progress получено undefined | Уточнить fixture pending timeout/участника и контракт повторного continue; ветку денежных операций принимать отдельно |

Детали и stack trace: `server-discovered-final.log`. Падения воспроизвелись и на Node22.14.0, поэтому они не объясняются только новым локальным Node25.

## E2E:9

| Сценарий | Наблюдение | Диспозиция |
|---|---|---|
| start screen | Ожидается query-version social-live-1 | Устаревший source/asset selector; сверить release contract |
| Konva tile rects | Expected157,60, actual176,3 | Coordinate/fixture defect не разрешён; не увеличивать tolerance без причины |
| authenticated profile | Invite button hidden | Текущий путь приглашения начинается со свободного места комнаты; профилю нельзя произвольно вернуть кнопку ради теста |
| invite polling | Count0 вместо≥2 | Уточнить auth fixture и актуальный polling contract |
| closed/open create flow | Ожидаемый элемент остаётся hidden | Сверить текущий выбор режима/DOM, отделить outdated scenario от реального отказа |
| pause menu | Старое ожидание Continue/двух действий | Обновить продуктовый договор текста/действий; реальная solo Pause ошибка — отдельная R-40 |
| expired reservation reconnect | Вместо clear-token/clear-state/restore-empty иной путь | Recovery branch требует независимой проверки после ownership patch |
| game invite room code | Получено null | Проверить room resolution/identity fixture, не подставлять код в assertion |
| daily bonus visible | Карточка hidden | Проверить auth/status fixture; фактическая конкурентность daily — R-02 |

Полные ошибки — `e2e-summary.json`, stdout JSON — `e2e-baseline-guarded.log`. Оригинальные39cases проверены отдельно от нового network-boundary case1/1. Защитная fixture не добавила новых падений.

## Не учитывать как продуктовые результаты

Initial `server-default-baseline`/`server-full-baseline` были остановлены: ненужный локальный REDIS_URI вызывал reconnect handles. Повтор `server-legacy-unit` и `server-discovered-final` с Redis disabled завершился нормально; именно их числа используются в summary. Сервис production не вызывался.
