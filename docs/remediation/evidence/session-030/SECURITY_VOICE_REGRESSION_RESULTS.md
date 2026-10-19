# S030 — Regression coverage for R-10 and R-18

Date: 2026-10-19. Added focused local coverage for the existing game-admission and voice-configuration changes. No production endpoint, account, wallet, published app, or microphone was used.

## R-10 — game-token admission

`AuthService.validateGameToken` now has a regression test for a valid signed token and live session/player relationship, plus expired token, missing or expired session, mismatched session owner, deleted or mismatched player, and active ban. It also checks that an expired token is rejected before any database lookup. These tests protect the API-side admission decision; they do not test a running Colyseus server join or establish what happens to an already seated player after logout/ban/delete.

## R-18 — voice configuration

Moved the existing ICE configuration parser/builder unchanged from `server/index.js` to `server/voice-config.js` so it can be exercised without starting the server. Tests cover string URLs, legacy `urls` arrays, `stuns:`/`turns:`, TURN credentials, invalid schemes, deduplication, invalid JSON, transport policy and candidate-pool bounds. The route still computes `hasTurn` from the built ICE list.

No Android package was rebuilt. The current machine has JDK 17 while this Android project requires Java 21. We did not prompt for or grant microphone permission and did not attempt external STUN/TURN traffic. The native origin/permission flow, Wi-Fi/LTE connectivity and relay-only behavior remain open; R-10 and R-18 remain partial.

## Verification

- `npm run check` — passed.
- `node --test server/test/voice-safety.test.js` — 4/4 passed, including the two new configuration cases.
- `./apps/api/node_modules/.bin/tsc -p apps/api/tsconfig.json` — passed on TypeScript 5.9.3.
- `node --test apps/api/dist/test/auth.service.test.js` — 6/6 passed, including the new admission matrix.
- `node --check` for `server/index.js`, `server/voice-config.js`, and `server/test/voice-safety.test.js`; `git diff --check` — passed.

Overall fully closed count remains **22/42**. See S026 for the original implementation findings and remaining rollout constraints.
