# S035 — Server test matrix and reconnect cleanup

Date: 2026-10-20  
Branch: `fix/audit-foundation`  
Scope: local server test repair for partial audit card R-25. No production service, Play package, user account, or wallet was accessed.

## Findings and changes

The full server discovery run had three remaining failures. Two source-contract tests were stale: they searched for a method call instead of the current method declaration/payload builder, and expected the old room-open draw expression. Updated extraction and expected contracts to match current code while retaining assertions about intended state and behavior.

The duplicate `timeout_continue` case exposed a server race. Starting the next round clears public timeout-forfeit state while the original continuation is still asynchronous; this erased the in-flight guard and let a repeated client message enter the handler. `DominoRoom` now keeps a private pending snapshot until the request finishes, responds with `continue_in_progress` to duplicates, and clears the snapshot in `finally`/room destruction. Regression assertions verify cleanup after completion.

The reconnect-grace suite exposed stale presence after reconnect timeout forfeiture. `finalizeReconnectTimeout` now removes that player's live presence after publishing the final room state. Three other reconnect failures were fixture problems: bot takeover had no connected opponent, the presence test omitted settlement dependencies, and a reusable snapshot fixture omitted schema-update behavior. Fixtures now represent their intended scenarios.

## Verification

- `node --test server/test/last-move-reveal-ux.test.js server/test/open-room-client-flow.test.js server/test/turn-timeout-forfeit-flow.test.js server/test/disconnect-grace.test.js` — **37/37 pass**.
- `npm --prefix server test` — **413/413 pass**, 0 failed, 0 skipped.
- `npm run check` — pass.
- Audit validators and `git diff --check` — final results recorded at commit preparation.

R-25 remains partial: the last recorded E2E baseline (S025) is 53/62 with the same nine historical failures, and the required full CI gate has not yet passed. Those failures are not counted as fixed by this server-only work.

ADB currently reports no attached devices (`adb devices -l`: only “List of devices attached”). No Android, installed Play build, production endpoint, or real user data was exercised in S035.

## Для владельца

Если отключённый игрок окончательно выбыл по таймауту, сервер теперь убирает его старую отметку «в сети». Если клиент повторно отправит «продолжить», пока сервер уже открывает следующий раунд, второй запуск безопасно блокируется. Все серверные тесты проходят целиком. Проверки браузера и CI ещё остаются, поэтому R-25 и общий счёт 24/42 не закрыты.
