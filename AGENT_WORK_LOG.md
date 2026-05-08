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

## Date
- 2026-05-07

## New request
- Re-analyze the project and prepare a migration path to:
  - `NestJS` as backend core
  - `PostgreSQL` as main database
  - `Better Auth` for email/password and Google login
  - `Next.js` custom admin panel
  - `Stripe` later through Checkout + webhooks
- Save the new platform specification into the repo.
- Begin implementation without breaking the current game runtime.

## Migration approach
- Keep the current `server/` + Colyseus runtime alive as the legacy gameplay service.
- Build the new platform layer next to it under:
  - `apps/api`
  - `apps/admin`
  - `packages/db`
  - `packages/shared`
- Move users, stats, leaderboard, moderation, and future commerce into PostgreSQL first.
- Integrate realtime gameplay with the new identity model later, after the platform layer is stable.

## Progress update
- Saved the migration spec in `docs/platform-migration-tz.md`.
- Added a new `NestJS` API skeleton in `apps/api`.
- Added a new `Next.js` admin skeleton in `apps/admin`.
- Added `Prisma` schema and PostgreSQL foundation in `packages/db/prisma/schema.prisma`.
- Added a legacy import script from `server/data/accounts.json` to PostgreSQL.
- Added `docker-compose.platform.yml` for PostgreSQL bootstrap.
- Updated `.gitignore` for the new platform layout and env examples.

## Current implementation focus
1. Turn the scaffold into a runnable workspace.
2. Wire Prisma into NestJS.
3. Expose initial read endpoints on top of PostgreSQL.
4. Then mount Better Auth safely into the NestJS runtime.

## Important caveat
- Do not break the existing gameplay flow while building the new platform.
- Do not touch the unrelated untracked Cyrillic-named folder in the repo root.

## Deployment context
- Existing Google Cloud VM remains the target deployment environment for the new platform.
- Current known command:
  - `gcloud compute ssh instance-20260418-225724 --zone=us-central1-f --project=project-8fc391c2-e159-4215-800`
- `gcloud` is available in the current local environment.
- Local Docker is not available in the current environment, so PostgreSQL bootstrap may need either:
  - native local Postgres, or
  - remote provisioning on the existing GCloud VM.

## Progress update
- Installed and wired the official Prisma adapter package for `Better Auth`.
- Generated the official Better Auth Prisma schema with the CLI to validate the required auth tables.
- Reworked `packages/db/prisma/schema.prisma` so the platform schema now includes:
  - Better Auth core tables: `user`, `session`, `account`, `verification`
  - Domino domain tables: `players`, `player_stats`, `matches`, moderation, audit logs, payment foundation
- Chose a clean migration strategy for legacy accounts:
  - legacy users are imported as `player` profiles first
  - the new Better Auth identity layer becomes the source of truth for new email/Google logins
  - this avoids poisoning future Google login flows with fake legacy emails
- Mounted the real Better Auth handler into the NestJS runtime and updated bootstrap requirements:
  - Nest body parser disabled
  - Better Auth mounted before JSON middleware
  - CORS configured against trusted origins
- Added initial real auth-backed API reads:
  - `GET /api/auth/status`
  - `GET /api/auth/session`
  - `GET /api/me`
- Added automatic player profile creation/sync for Better Auth users through database hooks and profile upsert logic.
- Upgraded `/api/admin/overview` from a stub to live counts from Prisma.
- Reworked the legacy import script to import `accounts.json` into PostgreSQL player/match tables using `legacyUserId`.
- Added a basic but real admin dashboard shell that fetches:
  - `/api/admin/overview`
  - `/api/auth/status`

## Remote VM findings
- Verified the target GCloud VM again.
- Current state on the VM:
  - `pm2` is installed
  - current game process `domino-server` is online
  - port `2567` is active
  - `postgresql` is not installed
  - `nginx` is not installed
  - `docker` is not installed
- Added `docs/platform-deploy-gcloud.md` with side-by-side deployment notes.
- Added provisioning helpers for the target VM:
  - `scripts/gcloud/provision-platform.sh`
  - `scripts/sql/bootstrap-platform.sql`
- Added a self-contained remote provisioning script and nginx reverse-proxy templates:
  - `scripts/gcloud/provision-platform-remote.sh`
  - `scripts/gcloud/nginx-domino2.conf`
  - `scripts/gcloud/install-nginx-config.sh`

## Checks completed
- `prisma validate` passes from `packages/db`
- `npm run generate -w @domino2/db` passes
- `npm run build -w @domino2/api` passes

## Immediate next steps
1. Build and verify the updated Next.js admin app.
2. Add a first protected admin/session gate instead of placeholder auth pages.
3. Prepare production env files and remote PostgreSQL provisioning steps for the GCloud VM.

## Progress update
- Added a real Better Auth client to the admin app.
- Implemented a working admin login page with:
  - email/password sign-in
  - Google sign-in
  - redirect to `/dashboard`
- Added a client-side dashboard session card that:
  - checks the current Better Auth session
  - shows the current role
  - warns when the user is not yet promoted to `admin` / `superadmin`
  - supports sign-out
- Added a small promotion utility:
  - `npm run platform:promote-admin -- --email=...`
  - this promotes the first real account to `admin` without manual DB editing
- Upgraded the admin UI shell to use better typography and a more intentional visual language:
  - `Space Grotesk`
  - `IBM Plex Mono`
  - atmospheric background gradients
- Updated the admin API fetch helper to include credentials for cross-origin auth-aware requests.
- Confirmed again that the current `gcloud` VM still only has the legacy `domino-server` on port `2567` and still lacks PostgreSQL / Nginx / Docker.
- Re-ran validations:
  - `npm run generate -w @domino2/db`
  - `npm run build -w @domino2/api`
  - `npm run build -w @domino2/admin`

## Current state
- The platform layer is now functional enough to:
  - authenticate with Better Auth
  - read the current session from the admin app
  - render a real operational dashboard scaffold
  - keep the legacy game server untouched

## Remote infrastructure status
- On the GCloud VM:
  - PostgreSQL is installed and running
  - Nginx is installed and running
  - the database role `domino_platform` exists
  - the database `domino2_platform` exists
- The default Nginx config is still active; reverse-proxy site wiring will be the next deployment step once API/admin are running on the VM.

## Remote verification
- Confirmed from the VM:
  - `postgresql` is `active`
  - `nginx` is `active`
  - `domino2_platform` exists and is owned by `domino_platform`

## Next focus
1. Add a clean way to promote the first human account to `admin` so the dashboard can be truly locked down.
2. Provision PostgreSQL on the GCloud VM and connect the new API to it.
3. Start replacing the remaining legacy JSON-backed account flow with the new PostgreSQL-backed platform endpoints.

## 2026-05-07 Platform rollout: data layer + admin expansion
- Expanded the platform API with a bridge token for the game server:
  - `GET /api/platform/game-token`
  - HMAC-signed identity claims for `userId`, `playerId`, `displayName`, and session metadata
- Wired the legacy Colyseus room flow to prefer the platform token while still falling back to legacy account tokens.
- Added platform match persistence so online matches can now be written into PostgreSQL instead of only the JSON store.
- Expanded the admin API to cover:
  - overview metrics
  - player directory
  - player detail
  - reports
  - bans
  - moderation actions with audit logging
- Built out the admin app with real pages for:
  - `dashboard`
  - `players`
  - `players/[id]`
  - `reports`
  - `bans`
- Reworked the VM rollout path:
  - platform code sync stays side-by-side with the old `domino-server`
  - PM2 restarts only the platform API/admin processes
- Applied the initial Prisma migration on the VM and imported the existing legacy dataset from `server/data/accounts.json`.
- Verified the live VM again after the database rollout:
  - `GET /api/platform/status` returns `200`
  - `GET /api/health` returns `200`
  - database reports as reachable
- Google login plumbing is wired in Better Auth, but the VM environment still has empty `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`, so `googleEnabled` is currently `false`.
- Rotated `BETTER_AUTH_SECRET` on the VM to a real random value so Better Auth sessions and the signed room-token bridge are no longer backed by a placeholder secret.
- Reworked the admin pages so unauthenticated visitors now see a clear `Admin access required` screen instead of the misleading `API offline` fallback.
- Added `packages/db/scripts/bootstrap-admin-user.mjs` to create the first admin user through Better Auth and promote the account to `admin`.
- Bootstrapped the first admin account on the VM:
  - email: `jafarovsamir@gmail.com`
  - temporary password: `Domino2-cec9cca7734d90b69d99278c33588892`

## 2026-05-07 Platform rollout update
- Confirmed the target GCloud VM `instance-20260418-225724` on `us-central1-f` is reachable with a dedicated SSH key file stored under `.gcloud/` in the repo workspace.
- Verified the VM has:
  - PostgreSQL running
  - Nginx running
  - the legacy game server still alive on `2567`
  - the new platform API on `3000`
  - the admin app on `3001`
- Found a route collision between Better Auth and the internal status/session endpoints:
  - `Better Auth` is mounted at `/api/auth/*`
  - the dashboard was querying `/api/auth/status`
  - that path was returning `404` because the auth handler owned it
- Fixed the collision by moving the internal endpoints to:
  - `/api/platform/status`
  - `/api/platform/session`
- Updated the admin dashboard to read from `/platform/status` instead of `/auth/status`.
- Rebuilt both apps locally:
  - `npm run build -w @domino2/api`
  - `npm run build -w @domino2/admin`
- Synced the route fix to the VM, rebuilt both apps there, and restarted the platform processes with PM2.
- Verified live responses on the VM:
  - `GET /api/platform/status` returns `200` directly on `127.0.0.1:3000`
  - `GET /api/platform/status` returns `200` through Nginx on port `80`
  - `GET /api/health` returns `200` and reports the database as reachable
- The Next.js admin root is serving correctly through Nginx as well.

## 2026-05-07 Deploy workflow update
- Updated the GCloud deployment notes to reflect the real VM state after provisioning and side-by-side rollout.
- Added `scripts/gcloud/deploy-from-git.sh` as the intended ongoing update path for the new platform layer.
- The new recommended workflow is:
  - push changes to GitHub
  - SSH into the VM
  - run `bash scripts/gcloud/deploy-from-git.sh`
- This keeps the existing `domino-server` untouched while letting the new API/admin evolve through a repeatable git-based deploy cycle.

## 2026-05-07 Sign-in fix
- Diagnosed the admin sign-in failure as a Better Auth origin/callback mismatch on the public VM host.
- Updated the admin login flow to use a relative callback URL:
  - `"/dashboard"`
- Expanded the Better Auth trusted origins to include the public VM origin `http://34.28.23.216`.
- Kept the runtime safer by removing the temporary `disableOriginCheck` override after trusted origins were fixed.
- Added `scripts/gcloud/refresh-platform-env.sh` to bootstrap and persist a real platform env file on the VM:
  - `BETTER_AUTH_SECRET`
  - `BETTER_AUTH_URL`
  - `PUBLIC_APP_ORIGIN`
  - `ADMIN_APP_URL`
  - `GAME_WEB_URL`
- Updated `scripts/gcloud/deploy-from-git.sh` to source `.env.platform` before deploys.
- Verified end-to-end sign-in on the live host:
  - `POST http://34.28.23.216/api/auth/sign-in/email`
  - returns `200`
  - redirects to `/dashboard`

## 2026-05-07 Server update workflow
- Added a full VM update script:
  - `scripts/gcloud/update-server.sh`
- Added a local Windows helper:
  - `scripts/gcloud/update-server.ps1`
- Added npm shortcuts:
  - `npm run deploy:gcloud`
  - `npm run deploy:gcloud:platform`
  - `npm run deploy:gcloud:legacy`
- Added the workflow doc:
  - `docs/server-update-workflow.md`
- Kept `scripts/gcloud/deploy-from-git.sh` as a compatibility wrapper for platform-only deploys.
- The updater now supports:
  - GitHub pull from `origin/main`
  - `--no-pull` rebuilds for current VM files
  - platform-only updates
  - legacy-only updates
  - Prisma generate/migrate
  - API/admin builds
  - PM2 restarts
  - retrying health checks after restarts
- Reworked dependency installation to be incremental by default:
  - skips root/server npm installs when lockfiles are unchanged
  - keeps `--clean-install` available for explicit `npm ci`
- Important VM note:
  - the VM worktree is currently dirty because prior platform files were copied directly before the GitHub deploy workflow existed
  - default GitHub pull updates will become smooth after the current local/server changes are committed and pushed
- Recovery note:
  - a full `npm ci` run overloaded the small VM and left Prisma Client ungenerated
  - recovered by resetting the VM, running `npm run generate -w @domino2/db`, and restarting `domino-platform-api`
- Verified live services after recovery:
  - `http://34.28.23.216/api/health`
  - `http://34.28.23.216/api/platform/status`
  - `http://34.28.23.216/login`
  - `http://34.28.23.216:2567/health`
- Verified `bash scripts/gcloud/update-server.sh --no-pull --skip-checks --platform-only` completes successfully on the VM.

## 2026-05-07 Platform/auth follow-up
- Moved the browser account client toward the new platform source of truth:
  - platform session bootstrap is checked first
  - platform game tokens are now preferred for room auth and match recording
  - leaderboard/profile reads now prefer the platform API with legacy fallbacks only as backup
- Updated the legacy room runtime to stop falling back to `accountStore` for multiplayer identity and match persistence.
- Added admin recovery flows for the new Better Auth stack:
  - `/forgot-password`
  - `/reset-password`
  - `/verify-email`
- Added helper client calls for:
  - request password reset
  - send verification email
  - verify email
  - reset password
- Added an email field to the in-game account modal so the platform auth path can be used from the game UI.
- Expanded the admin dashboard session card to show email verification status.
- Marked auth status as including email recovery/password reset capability in the platform dashboard.
- Verification:
  - `node --check js/account.js`
  - `node --check js/app.js`
  - `node --check server/DominoRoom.js`
  - `npm run build -w @domino2/api`
  - `npm run build -w @domino2/admin`

## 2026-05-07 GCloud deploy hardening
- Fixed the local GCloud SSH path by using repo-local key material instead of the broken `C:\\Users\\user\\.ssh` key store.
- Added a one-command IDE deploy flow:
  - `npm run deploy:gcloud:git`
  - it commits/pushes if the repo is dirty, then syncs the VM to `origin/main`, restores runtime files, and rebuilds the platform layer
- Updated the VM update script to support `--force-sync` so a dirty worktree can be reset safely from git.
- Cleaned up accidental deploy-key artifacts:
  - added `.deploy/` to `.gitignore`
  - removed committed temporary SSH keys from `.deploy/gcloud-ssh`
- Verified the repo-local SSH key can connect to the VM with plain `ssh` and the deploy flow can rebuild the platform stack.

## 2026-05-07 Google OAuth direct flow
- Replaced game Google redirect from /login?autogoogle=1 to /auth/google.
- Added dedicated Next.js route apps/admin/app/auth/google/page.tsx to start Better Auth Google sign-in without showing the dashboard login form.
- Fixed relative import path for authClient and re-ran admin build.

## 2026-05-08 Admin polish pass
- Added a shared `AdminFrame` shell for the main admin pages so dashboard, players, reports, bans and player detail share one visual language.
- Reworked the home, dashboard, players, reports, bans and player detail pages with cleaner headers, cards and actions.
- Cleaned the admin login screen and fixed the password placeholder and Google helper copy.
- Replaced the most visible mojibake / broken separator text on moderation pages with clean punctuation.

## 2026-05-08 Guest realtime visibility and account handoff
- Added a guest-friendly `Create account` action in the in-game account modal so a local guest can jump straight into registration.
- Added a lightweight local-game heartbeat path from the browser client to the platform API so solo guest games can appear in the admin realtime dashboard.
- Added a new platform realtime store and API endpoint to track local guest presence alongside the legacy game-server realtime feed.
- Merged platform-local and game-server realtime summaries in the admin dashboard so guest solo games are visible together with live multiplayer rooms.
- Verified the new guest flow and realtime code with:
  - `node --check js/app.js`
  - `node --check js/account.js`
  - `npm run build -w @domino2/api`
  - `npm run build -w @domino2/admin`

## 2026-05-08 Guest flow regression fix
- Fixed a runtime regression in `renderAccountModal()` where `createAccountBtn` was referenced before declaration, which was breaking registration and forcing guest flow back into the login state.
- Restored `setStoredToken()` / `getStoredToken()` compatibility in `AccountClient` so guest bootstrap can keep running while the platform token storage remains the real session source.
- Re-validated the client syntax with `node --check js/app.js` and `node --check js/account.js`.

## 2026-05-08 Guest logout fix
- Re-enabled the guest logout path by allowing the profile modal logout button to stay clickable for `local-guest` sessions even when no platform token exists.
- Kept the platform token as the real session source for registered users while still letting guests cleanly exit to the register/login flow.

## 2026-05-08 Admin filtering pass
- Added server-side filters and sort options to the admin player list for guests, linked accounts, flagged players, rating and match count.
- Added report filters by status and text query, ban filters by active/revoked state, and audit filters by action/entity type.
- Added revoke actions directly on active ban cards in the player detail page so moderation can happen from the profile view.

## 2026-05-08 Game rules fix pass
- Removed the 365 score cap from both the browser client and the game server so scores keep accumulating until the match truly ends.
- Reworked Gosha / TELEFON combo simulation to track open ends by node + side instead of stale array indexes, which fixes turn and branching cases.
- Changed the 35-point instant-win path so the server marks the match as finished immediately instead of allowing the game to continue into another deal.
- Updated the instant-win copy so it reads as a real match-ending state rather than a two-round continuation.

## 2026-05-08 Economy system foundation
- Added PostgreSQL-backed coin economy tables for wallets, ledger entries, daily claims, quests, stake tables, match stakes and tournaments.
- Added a NestJS economy module with public config/stakes/quests routes and admin routes for wallets, grants, spend, stakes, quests, catalog and tournaments.
- Integrated stake reservation and settlement into the game server flow so online rooms can run free tables or linked-account coin tables.
- Added a dedicated economy admin page with config editing, stake management, quest management, catalog management, wallet snapshots and tournament management.
- Added stake selection to the online room modal in the browser client and passed the selected stake through to room creation / join options.
- Added docs for the economy spec and a dedicated development log.

## 2026-05-08 Economy v1 trim
- Added a 1000-coin starter grant for every new registered player.
- Trimmed the live economy UI to free tables, stake tables, wallet balances, and admin coin grants.
- Deferred daily bonuses, quests, cosmetic shop, and tournament UX from the live flow for now.
- Kept the economy server-authoritative and preserved the free-play fallback path.

## 2026-05-08 Rating and economy UX update
- Replaced the old ELO-style match rating update with a game-stat based rating formula derived from wins, losses, draws, match count, streaks, and confidence.
- Added rating titles for the leaderboard and profile, and surfaced the current title in the account modal.
- Exposed the wallet coin balance in the player profile so the active balance is visible alongside rating and match stats.
- Added an online economy mode toggle for free play vs coin play, and kept the stake table hidden unless coin mode is selected.
- Wired leaderboard and player detail responses to return the computed title code and wallet-aware balances.

## 2026-05-08 Game polish and session resume
- Added solo coin table selection with a `free` / `coins` toggle and stake buttons up to 200 coins.
- Blocked coin play for the easiest bot difficulty so the easy solo path stays free-play only.
- Surfaced the selected stake in the in-game HUD and made the in-game menu expose the profile button.
- Added resume-state persistence for unfinished solo and online matches, including Colyseus reconnection tokens.
- Fixed the visible HUD and fallback text layer so the game shows a proper menu icon, a visible game info strip, and cleaner stake/banner UI.

## 2026-05-08 Stake HUD, quit warning, and startup text cleanup
- Forced solo matches to capture the current `free` vs `coins` selection directly from the UI before a game starts, so the in-game HUD uses the actual reserved stake instead of drifting back to `Free play`.
- Switched the HUD stake label to render from `stakeKey` values rather than button text, making it stable for both solo and online matches.
- Added a confirmed quit flow that clears the stored resume snapshot and warns the player that progress will be lost; coin games now settle a forfeit loss when the player quits.
- Added server-side online stake forfeits on permanent room leave so a player quitting a coin room gives the remaining linked player(s) the win payout.
- Cleaned the most visible startup HTML fallback strings and coin wording to remove the brief mojibake flash before runtime translations finish applying.

## 2026-05-08 Solo coin auth handoff hardening
- Changed solo game start to prefer restoring the real platform session before creating a local guest profile, so a signed-in player is not silently downgraded to guest/free mode.
- Updated account profile loading to try the platform session first and only fall back to a stored local guest when no Better Auth session exists.
- Stopped silently converting failed solo coin reservations into free matches; the client now aborts the start flow and returns to the solo modal instead.
- Bumped the service worker cache version so the updated solo stake logic reaches secondary devices instead of serving stale cached JS.

## 2026-05-08 Solo reserve 500 guard
- Traced a live production `500` on `/api/economy/solo/reserve` to `payload === undefined`, which caused `reserveSoloMatchStake` to crash while reading `matchId`.
- Added defensive defaults in the economy controller and service so reserve/settle endpoints always receive an object even if an old or malformed client sends no JSON body.
- Normalized the solo reserve/settle client calls to always send an object body, removing one more edge case from the browser side.

## 2026-05-08 Bank HUD and round-based stakes
- Switched the HUD copy from `Stake: X` to `Bank: X` so the live board shows the current round bank instead of the raw stake label.
- Converted solo coin play from a single match-wide charge to a round-based flow: each round now reserves its own stake before the round starts and settles it when the round ends.
- Added a coin match summary that accumulates `won`, `lost`, and `net` values across rounds, then shows them in the final modal.
- Added a round-start guard so a player without enough coins cannot begin the next round and is returned to the solo flow instead of silently continuing.

