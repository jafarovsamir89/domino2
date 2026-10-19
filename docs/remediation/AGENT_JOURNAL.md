# Agent journal: current handoff

Updated 2026-10-19 after S028. Read this, then append-only WORK_LOG.md and docs/audit/REMEDIATION_PLAN.md. Latest request completed two more points, R-20 and R-22, partially locally. Keep explaining each result simply in Russian. The user previously said to continue without the Android phone; don't claim phone/browser acceptance unless performed. S026/R10/R18 and S027/R21/R23 acceptance remains as recorded below. Latest details: `evidence/session-028/LOCAL_SOLO_LOCALIZATION_RESULTS.md`.

## Authorization and Git

Owner's deployed Domino has about50 users. Local fixes, synthetic tests, separate .audit Android app and feature-branch commits/push authorized. Production deploy/migrations, real wallet edits or installed Play package changes require direct instruction. No Codex plugins installed or agents spawned; neither requested. No .env/real tokens/signing keys/production data in tests or Git.

Branch fix/audit-foundation, origin https://github.com/jafarovsamir89/domino2. S022/S023 pushed eb8b21e. S024 monetary outbox checkpoint85b10a5. S025 startup checkpoint f6a395e is pushed and verified. Portable setup and a ready-to-paste agent prompt: CONTINUE_ON_NEW_COMPUTER.md. Confirm clean status/origin match before continuation.

22/42 cards closed locally: R01,R02,R03,R04,R05,R06,R07,R08,R11,R12,R13,R14,R16,R17,R27,R29,R31,R32,R39,R40,R41,R42. Remaining scope: R09 verified-ad/SSV (unverified x2 disabled), R15 same-device Android startup acceptance, R19 external call/Bluetooth/audio-focus, R25 old failures/CI.16other cards open. No production release or all-green CI claim.

## Latest two items

R29/S024: exact room/match/stake monetary intent fsynced synchronously before HTTP; immutable hard-link publication and directory fsync, no persisted bearer. Separately fsynced receipt only after ok:true. Conflict/rejection/corruption retained. Unknown reserve/stake never acknowledges delivery: reconciliation skipped requires exact ledger evidence. Cached receipt prevents repeat foreground HTTP. Actual server/index.js starts a bounded rotating worker;5s HTTP/32record pass, independent of live room/token expiry via dedicated signed economy.reconcile scope. Ordinary endpoint still requires token+its own scope. Late success/failure cannot clear replacement match bank/pending state, room disposal clears its retry timer.

CRITICAL future release requirement: ECONOMY_OUTBOX_DIR absolute persistent LOCAL volume, preserved across restart/container replacement/rollback. Production startup fails without it. API endpoint must be released before game server. No deployment config changed. Read session024/OUTBOX_OPERATIONS.md before any release. Data0700/0600 contains IDs/receipts; monitor pending/errors/capacity, back up, do not purge unresolved records. No automatic retention purge; no physical-volume-loss, pre-calculation crash, independent match-stat delivery or lost UI-event/full-original-receipt guarantee. Monetary balances reconcile; response-loss replay may have skipped:true rather than original UI receipt.

True baseline HTTP+SIGKILL lost intent. Final fresh PostgreSQL faults before commit/after commit+response-loss/real5s timeout then kill pass Node25/22. Each winner1180/loser800/reserved0 from1000each/stake200;20duplicate replays no ledger change, oldA does not touch newB reserves. Real server entrypoint restarts with zero rooms and replays on both runtimes (final proof logs). API148/148 Node25/22, focused47/47 Node22. New tests cover persistence/conflicts/permissions/storage errors/rejections/corrupt records/fair queue/production path/late callback/unknown reservation/proof scope. Existing room test now gets fresh per-test storage; its duplicate-settle assertion is retained. Initial PG provider omission, API dist rebuild race, mock missing payloadJson and reused durable fixture receipt attempts are retained/excluded; final independent proofs pass.

R15/S025: splash no longer waits minimum5.5s, session marker or window.load. Actual controls and account readiness release splash on next frame; account HTTP/body has6s AbortController, critical load gets recoverable error+retry after8s JS timer. Offline notice/retry and successful reload preserve existing auth/cached-account policy. AZ/RU/EN use domino-lang. Notice sits in normal start-shell flow;320px geometry and final screenshots reviewed (no legal/sign-in overlay). No auto declaration of server recovery from an online event alone.

New10browser cases pass Node22 and Node25 full suite: cold/warm actual menu click,600ms warm-auth delay, optional stalled image/load, offline/retry, hung account, module refusal/recovery, stalled critical module deadline, root/www. Browser timing3cold/warm pairs uses synthetic API/headless Chromium. Median verified menu open after splash DOM removal~6.35s->0.15s cold, warm~0.117->0.113s. This waits for DOM removal (old pointer-events disabled earlier): upper bound of demonstrated interaction, NOT earliest input/Android/OS cache purge or production-speed guarantee. No physical phone measurements this batch by user decision; do not mark R15 fully accepted.

## Current checks

Latest API148/148 Node25/22 (S024 final). Full server Node22:390/397, exact historical7 failures. Full E2E Node25:53/62, exact historical9 failures; all10new startup tests included/pass. session025/failure-delta.json compares names with session023. Node22 startup10/10, source check and root/www byte parity pass. Final cold-only red baseline uses immutable eb8b21e source. Earlier blocked-module fixture missed query suffix; fixed the fixture, not assertions. Initial baseline overlap and port4173 collision excluded; isolated runs final.

No broad test repeats needed absent new source changes. Seven/nine old failures remain R25 work, never hide/exclude them for green CI. Last native build and API/admin OAuth contracts belong to S014-S021; no native/lock/schema changes in this batch. No production/Play changes and no real user data contacted.

## Prior constraints worth preserving

- R03/R04: exact-match reservations/idempotent settlement and shutdown-safe snapshots. Do not reassign legacy null-match reserves or treat shutdown as forfeit.
- R11: public summaries redact identities/private codes. Legacy bearerless unlisted session capability retains only minimal roomId/status for installed-client resume; do not blindly make it401.
- R41: additive transaction migration19/backfill/4declared existing indexes; fresh and18->19 drift0. Review real production migration state before future authorized deploy; never blindly reset/db push.
- R16/R17/R40: owned async generations/phase continuations, watchdog never blindly unlocks online, solo pause preserves timer descriptors. Persisted WebView snapshot verified after1200ms settle, not immediate-kill write durability.
- R19: master/music/effects controls + native Activity lifecycle bridge. Capacitor.Plugins fallback needed. Do not add competing AudioManager focus owner (previous attempt blocked Chromium resume). External focus/acoustic/call/Bluetooth acceptance open.
- R13/R14: actual Konva sceneCanvas cap1.25mobile/2desktop/hit1, signature invalidation on resize/DPR. Finite/static cues replace expensive recurring effects. Android debug renderer fixture~51native presentations/s vs23, FrameTimeline processing p95~17ms vs131, but intervalp95~33ms; no stable60FPS/battery/release/multi-device claim.28board+7duplicatehand is stress, not a legal35tile game.

## Environment and cleanup

On another computer, follow CONTINUE_ON_NEW_COMPUTER.md: ignored .tmp caches and symlinks are NOT in Git. Install fresh from both lockfiles in a new isolated copy; do not look for the old Mac paths. On this original machine, main node_modules are old. Reuse .tmp/remediation-s014/final verified updated root/server + nested apps/api dependencies in clean copies; do not reinstall unnecessarily. S024/clean and S025/clean use symlinks. S025/baseline has immutable eb8b21e startup sources; leave it baseline. API tests rebuild/remove dist: do NOT run PG imports concurrently with that rebuild. Root API requires nested TS5; root-only picks TS6 and false baseUrl failure.

Owned PostgreSQL14.20 .tmp/remediation-s002/pg,127.0.0.1:55439 STOPPED (session024/s024-pg-stop.json). Synthetic drill DBs are used, not fresh. Redis not started. Owned ephemeral previews4173/4176/4177 and port0 game workers exited; unrelated user4174 retained. Phone absent, no ADB/Play changes. No plugins installed. Source scripts/test outputs are guarded localhost and synthetic identities only.

prepare-checkout.mjs copies tracked/staged working contents, skips .env/dependencies/heavy evidence; new tests/modules must stage or explicitly copy. run-check.mjs requires matching .tmp/remediation-sNNN copy, fresh allowlist/synthetic localhost endpoints/Redis disabled,10minute deadline. Node22 invocation: npm exec --yes --package=node@22.14.0 --package=npm@10.9.2 -- COMMAND. Root/server lockfiles separate. API test-file list explicit; server recursively discovers tests.

After audit-plan edits run validate-audit.mjs, update only existing347SHA manifest entries and verify-manifest.mjs. Preserve original audit evidence. Matching app root/www assets must stay byte-identical.

## S026 current status — R-10 and R-18 partial

- R-10 shortens both minted game-token TTLs from12h to5min. New API `POST /api/platform/game-token/validate` verifies token signature/expiry, extant session, player/user relationship and active player ban. Colyseus calls it on join/reconnect with a3s timeout; a failure denies new admission. No per-move DB/API request.
- Existing seats are not actively disconnected after logout/ban/delete. Keep R-10 partial until a safe active-match policy is chosen and tested; a 5-minute token alone does not eject a current room participant. API must be deployed before game server because old API returns404 and the server fails closed.
- R-18 parses ICE URLs as strings or arrays and restricts to stun/stuns/turn/turns. Client js/www accept both. Android audio permission now allows only exact HTTPS `localhost` and `gamed.simplesoft.az` origins, rechecks after the system prompt, and denies pending permission on Activity destruction.
- `npm run check`, JS syntax, API TypeScript `--noEmit`, and `git diff --check` passed. Android compile could not finish: local Temurin17 while Android sources require Java21. No functional tests or device/NAT checks were run; see `evidence/session-026/SECURITY_REALTIME_RESULTS.md`.
- Overall **22/42 fully closed**; R-10/R-18 are modified but are not counted as closed. R09/R15/R19/R25 remain partial; the other open scopes remain as plan.

## S027 current status — R-21 and R-23 partial

- R-21 now has a visible link in the account profile to `delete-account.html#request`; the page offers a mailto request with a prepared subject/body, asks for a request from the connected email, and explains that the email is not automatic deletion. No backend deletion flow was added. Owner must confirm mailbox handling, retention/deletion policy and Google Play Console/Data Safety alignment before publishing; do not claim account deletion is automated.
- R-23 hand tiles are named localized buttons with index, values and playable state. Delegated click supports keyboard activation. Touch areas are 44×66 CSS px; narrow mobile hand stays full size and scrolls horizontally. Ambiguous-end choices have accessible names, visible focus, keyboard click and Escape cancellation; focus returns to the tile. Konva retains visual pointer markers and has a DOM keyboard alternative.
- Root and `www` copies are byte-identical for six pairs. `npm run check`, renderer/translations syntax, and `git diff --check` passed. Product tests and live/browser/device checks were not run. Android TalkBack and actual 320px layout acceptance remain open, so neither card counts as fully closed. Report: `evidence/session-027/ACCESSIBILITY_DELETION_RESULTS.md`.
- Total remains **22/42 fully closed**. No production or Play change.

## S028 current status — R-20 and R-22 partial

- R-20 guest home now exposes a solo-only button and AZ/RU/EN copy explaining free solo vs account-only online/coin features. Free solo bypasses account-token checks, account refresh and guest presence heartbeats. Online handlers remain account-gated. Initial `bootstrapAccount` readiness still gates the screen, so “solo before auth” is not complete; no browser/Android/E2E acceptance was run. Current solo economy selector remains hardcoded to free. Report: `evidence/session-028/LOCAL_SOLO_LOCALIZATION_RESULTS.md`.
- R-22 visible dynamic gift strings now localize known `gift_001`–`gift_012` labels, `common/rare/epic`, inventory quantity, empty-state and catalog/inventory controls for AZ/RU/EN. `resume-session-return` is in the primary translation source; Russian bot-count label is translated. Canonical outgoing gift name/payload stays unchanged. This is not a full-screen language audit; narrow-width/native-speaker/Turkish checks are open.
- `npm run check`, root app/translation syntax, targeted locale-key presence and `git diff --check` pass after root/www parity. Product tests, browser and device acceptance were not run. Overall remains **22/42 fully closed**; no production/Play changes.

## Exact next action

Continue acceptance of partial cards without delaying unrelated local fixes: for S028 verify guest solo start/resume and online/coin blocking in isolated browser; then inspect the remaining account-readiness delay and all locales at narrow widths. For S027 verify TalkBack/320px when device is available and get owner/Console deletion-policy review before publication. Continue S026 with JDK21 Android compile and synthetic valid/expired/logout/ban/delete token checks; choose active-room revocation policy, then mic allow/deny and Wi-Fi/LTE relay-only NAT checks. Preserve fail-closed auth and API-first rollout. Do not deploy to production or Play. R15 Android startup and R19 external audio acceptance remain deferred.
