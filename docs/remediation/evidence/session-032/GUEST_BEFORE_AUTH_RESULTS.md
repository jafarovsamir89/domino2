# S032 — Guest local solo before account verification

Date: 2026-10-19. R-20 implementation and acceptance used the synthetic Playwright browser on both the root site and its `www/` copy. No production services, user accounts, wallets, Android Play package, or deploy settings were accessed.

## Change

The startup overlay previously waited for `bootstrapAccount()` before it could disappear. The game now releases the overlay once its local UI and handlers are ready, while account verification continues in the background. While verification is pending, the start screen uses the guest-safe view: free solo and its explanation are available, and online, coin shop, and cosmetics controls stay hidden. Account failure after the overlay has gone still adds the localized offline notice with a retry action.

The existing local-game boundary remains intact: a free solo game can start without a token; match history, economic calls, and presence heartbeats are not sent for a guest. Online entry continues to call `requireRegisteredAccount()`.

## Acceptance

The focused startup suite passed **12/12** in Chromium on the root and `www/` assets, including:

- A guest starts solo while a synthetic account check is delayed for four seconds. The match becomes active before auth resolves.
- The online controls and coin shop stay unavailable while auth is pending and after the server identifies the player as a guest.
- A forced coin-shop event does not open the shop; `requireRegisteredAccount()` returns no profile for the guest.
- The local match emits no heartbeat, economy, or match-history API call.
- Slow/hung auth no longer blocks splash removal; it still times out at six seconds and shows the network notice.
- Offline retry, cached/warm startup, missing critical module, stalled module deadline, and existing start interaction still pass.

Checks: `node --check js/app.js`, `node --check js/splash.js`, `node --check e2e/startup.spec.mjs`, `npm run check`, `npx playwright test e2e/startup.spec.mjs` — passed. Root and `www/` app/splash copies are synchronized. Test output: 12 passed in 58.2 seconds.

## Limits

This is local browser acceptance with synthetic API responses, not a physical Android or installed Play/WebView test. R-20's browser acceptance is complete. R-15 remains open because cold/warm/offline timing on a physical Android is still unmeasured. No production or Play change was made.

**In plain language:** a player can start a free game with bots as soon as the game screen is ready. A slow or unavailable login server no longer makes them wait, and a guest cannot enter online or coin features.
