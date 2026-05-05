# Agent Work Log

## Date
- 2026-05-05

## Request
- Add a proper user registration/login foundation.
- Store player data, points, and ranking in a persistent database layer.
- Keep UX soft: guest play first, account creation later.
- Keep a log so another agent can continue the work.

## Current approach
- Build a lightweight account/ranking layer first.
- Keep the existing Colyseus room flow intact.
- Add guest sessions, register/login, profile fetch, leaderboard, and match persistence.
- Start with a small server-side store and expose clean APIs.

## Current repo state
- Frontend and multiplayer room system already exist.
- Server currently has no auth or persistence layer.
- The codebase uses duplicated web assets in both root and `www/`.

## Key files already inspected
- `server/index.js`
- `server/DominoRoom.js`
- `server/schema/GameState.js`
- `js/app.js`
- `js/translations.js`
- `index.html`
- `package.json`

## Notes
- The project currently starts games immediately and uses player name fields in solo/online modals.
- For now, the best UX path is:
  - guest start
  - soft account prompt
  - persisted profile, points, and rating
- Do not touch the unrelated untracked folder with the Cyrillic name in the repo root.

## Next implementation steps
1. Add a persistent server-side user store and auth endpoints.
2. Add client-side profile/auth UI and token persistence.
3. Record match results and update rating/history.
4. Sync `www/`, run checks, and push.

## Progress update
- Fixed the account/language crash caused by `account-btn` being treated like a language switch.
- Hardened account requests with timeout/offline handling so the UI degrades gracefully when the server is unavailable.
- Added a profile cabinet with:
  - avatar
  - rating / points / wins / matches cards
  - recent match history
  - leaderboard
  - refresh / logout actions
- Added `/api/auth/logout` and richer `/api/me` payloads with recent matches.
- Kept solo play independent from account availability, while online room actions now stop cleanly if auth/server setup is unavailable.

## Remaining focus
1. Sync the updated frontend to `www/`.
2. Run syntax checks and tests.
3. Push the fixes so the server can be updated.
