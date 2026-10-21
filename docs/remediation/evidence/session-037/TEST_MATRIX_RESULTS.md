# S037 — Full local test matrix and CI workflow

**Date:** 2026-10-20  
**Branch:** `fix/audit-foundation`  
**Card:** R-25, still partial  
**Production or Play touched:** no

## Results

| Check | Result |
|---|---:|
| `npm test` — source checks, server and API suites | pass; server 413/413, API 149/149 |
| `npm run test:e2e` — root and `www` browser scenarios | 64/64 pass |
| Root/package app parity | `js/app.js` matches `www/js/app.js`; `js/konvaBoardRenderer.js` matches `www/js/konvaBoardRenderer.js` |
| `git diff --check` | pass |

## Findings fixed

- `loadSocialInvitesPage` merged two independent API snapshots one after another. The empty second response could prune invitations returned by the first endpoint. It now combines both endpoints' rows and applies one merge.
- Deleting a message thread could leave its locally cached conversation visible after refresh. The delete handler now removes that player from inbox and chat state; refresh invalidates older in-flight inbox and thread loads, and updates the cached thread list. The profile E2E now holds an old thread-list response until after deletion to prove that it cannot restore the deleted row.
- Konva's invisible DOM tile anchor used top-left coordinates with CSS that centers the tile on those coordinates. Its rectangle was shifted by half a tile. The anchor now uses the tile center, matching its DOM bounds to the canvas geometry.
- The Konva E2E expectation counted intentional screen-reader controls as duplicate visible arrows. It now checks the accessible controls and their labels.
- The expired-seat reconnect fixture omitted `client.http`; production code threw before reaching the mocked reconnect error. The fixture now models the client shape and exercises the expired-token branch.
- The daily-bonus test's init script removed the test credentials on every navigation, including the authenticated reload. It now clears credentials only on its first document load.

## CI workflow

Added `.github/workflows/ci.yml`. On pushes and pull requests it installs locked dependencies, generates and validates Prisma, applies migrations to a fresh PostgreSQL 14.20 service, runs `npm test`, builds admin, runs the full Playwright suite, copies web assets into Android, and assembles the Android debug package using Java 21.

The workflow has not yet run on GitHub. A read-only branch-protection query confirmed `fix/audit-foundation` is currently unprotected. The workflow can provide a required status check after its first successful run; repository protection settings still need to be enabled by an authorized maintainer. Therefore R-25 is not closed and the 42-card count does not change in S037.

## Reproduction

```sh
npm test
npm run test:e2e
cmp -s js/app.js www/js/app.js
cmp -s js/konvaBoardRenderer.js www/js/konvaBoardRenderer.js
```
