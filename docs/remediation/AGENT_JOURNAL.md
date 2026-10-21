# Agent journal: current handoff

Updated 2026-10-20 after S037. Read this, then append-only WORK_LOG.md and docs/audit/REMEDIATION_PLAN.md. S037 makes the local matrix green: server 413/413, API 149/149, E2E 64/64; fixes social invite snapshot merging, stale thread deletion, and Konva anchor geometry; adds `.github/workflows/ci.yml`. Two GitHub runs passed migrations, tests, admin build and E2E, then failed Android build: first wrong working directory, second missing executable bit on `android/gradlew`. Wrapper mode is now executable; rerun pending. Branch has no protection rule, so R-25 remains partial and count stays 24/42. ADB currently shows no connected device. Keep explaining each result simply in Russian. No production or Play changes. S037 evidence: `evidence/session-037/TEST_MATRIX_RESULTS.md`.

## Authorization and Git

Owner's deployed Domino has about50 users. Local fixes, synthetic tests, separate .audit Android app and feature-branch commits/push authorized. Production deploy/migrations, real wallet edits or installed Play package changes require direct instruction. No Codex plugins installed or agents spawned; neither requested. No .env/real tokens/signing keys/production data in tests or Git.

Branch fix/audit-foundation, origin https://github.com/jafarovsamir89/domino2. S022/S023 pushed eb8b21e. S024 monetary outbox checkpoint85b10a5. S025 startup checkpoint f6a395e is pushed and verified. Portable setup and a ready-to-paste agent prompt: CONTINUE_ON_NEW_COMPUTER.md. Confirm clean status/origin match before continuation.

24/42 cards closed locally: R01,R02,R03,R04,R05,R06,R07,R08,R11,R12,R13,R14,R16,R17,R20,R23,R27,R29,R31,R32,R39,R40,R41,R42. Eighteen cards remain open or partial; see their individual plan acceptance criteria. Key remaining scopes include R09 verified-ad/SSV, R10 active-match revocation policy, R15 same-device Android startup acceptance, R18 Wi-Fi/LTE/TURN, R19 external call/Bluetooth/audio-focus, R21/R22 product acceptance, and R25 historical CI failures. No production release or all-green CI claim.

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

## S029 current status — R-23 Android Chrome layout partial

- Actual connected Android Chrome opened current tracked assets through a temporary localhost-only preview with synthetic API responses. At 320 CSS px dominoes retained their touch size and horizontal swipe revealed the final tile; normal 393px layout also captured.
- This is browser-based Android evidence, not the installed Capacitor WebView or audit APK. TalkBack's first-run guide interrupted speech/focus acceptance; service and display size were restored. No production calls or Play changes.
- Report and three visual captures: `evidence/session-029/ANDROID_ACCESSIBILITY_RESULTS.md`. R-23 remains partial; total still22/42.

## S030 current status — R-10 and R-18 regression coverage

- R-10 API validation tests now cover a live matching signed token/session/player and rejects expired token, missing/expired session, owner mismatch, deleted/mismatched player and active ban. Expired-token rejection is confirmed to happen before DB calls. Auth service tests6/6 and TypeScript compile pass.
- R-18 moved the same ICE config builder to `server/voice-config.js` and added direct tests for accepted URL shapes/schemes, TURN credentials, bad JSON/schemes, deduplication and bounds. Focused server voice tests4/4 pass; root `npm run check` and syntax checks pass.
- Both cards remain partial: Colyseus join boundary and active-game policy remain for R-10; Android Java21 build/origin prompt, real microphone UI and Wi-Fi/LTE/TURN remain for R-18. No microphone prompt or production/Play request. Report: `evidence/session-030/SECURITY_VOICE_REGRESSION_RESULTS.md`.

## S031/S032 current status — R-23 and R-20 closed locally

- S031 fixes Android Chrome dropping `aria-label` from `aria-pressed` hand tiles: hidden localized text now supplies each native ToggleButton name. On Xiaomi Android13 with TalkBack active, 7 named/focusable tile nodes and both named end-choice buttons were present; tile and first end focus were verified in the Android accessibility hierarchy. Existing S029 evidence covers 320 CSS px and horizontal swipe. Evidence: `evidence/session-031/ANDROID_TALKBACK_RESULTS.md`. This was Android Chrome + synthetic localhost, not Play/WebView.
- S032 lets the splash finish when UI is ready while auth resolves in background. Guest start interaction completed before a4s synthetic auth response; online/coins stayed blocked; guest API trace contained no heartbeat/economy/match-history call. Offline/hung-auth retry behavior remains covered. Startup suite12/12 on root/www; `npm run check` and parity pass. R-20 closed locally; R-15 stays partial pending physical cold/warm startup metrics. Evidence: `evidence/session-032/GUEST_BEFORE_AUTH_RESULTS.md`.
- Combined count: **24/42 locally closed**. No production, Play package, or wallet changes.

## S033 current status — R-10 Colyseus reconnect guarded

- `DominoRoom.onAuth` and `onReconnect` now share platform API validation. Colyseus reconnection tokens bypass `onAuth`; before this patch, that route restored a disconnected seat without rechecking the platform session. The new hook checks the saved signed token, expiry, matching user/player and API session/ban status. Revoked/invalid access returns401; API outage fails closed with503; no per-move API call.
- Synthetic focused suite `server/test/platform-game-auth.test.js` passes14/14; root `npm run check`, changed-file syntax and diff hygiene pass. No production/Play data was touched. Report: `evidence/session-033/PLATFORM_GAME_RECONNECT_RESULTS.md`.
- Existing snapshots deliberately omit bearer tokens. After server restart, a reconnect token without the in-memory auth token is rejected and falls through to the existing reconnect-timeout path. Confirm whether this recovery behavior is acceptable or add a fresh-auth seat recovery design.
- R-10 remains **partial**: an already-connected player is not immediately removed after logout/ban/delete, and no owner-defined SLA for that case exists. Do not add a mid-match disconnect without establishing fair match/economy behavior. API endpoint must deploy before a server relying on it.
- Adjacent `disconnect-grace.test.js` run reported4 existing fixture/forfeit failures in23 cases. One fails on private Colyseus `roomId` accessed from prototype-only fixture; other bot takeover/reusable-state fixture expectations fail. Not attributed to S033 auth code and not green. Repair as separate test baseline work.

**Current count remains24/42 locally closed.** S033 strengthens a partial card; it does not close R-10.

## Exact next action

Commit and push S037 on `fix/audit-foundation`, then inspect the triggered GitHub Actions run. If every job passes, enable the CI job as a required check on the branch through repository settings, then document that confirmation before considering R-25 closed. Run device acceptance only when `adb devices -l` lists the intended Android device. Native R-18 permission acceptance requires a separately identified audit package; never install the same-ID debug APK over the Play installation. R-10 active-match revocation/SLA and post-restart identity recovery, R-15 physical startup, and R-19 external audio focus remain open. Do not deploy to production or Play. Keep append-only evidence and accurate card counts.

## S037 current status — R-25 local matrix green

- `npm test` passes: server413/413, API149/149, plus source checks. `npm run test:e2e` passes64/64 across root and `www` scenarios.
- Fixed invitation snapshot pruning, stale inbox/chat/cache state after thread deletion, and Konva anchor offset. A delayed stale thread-list response is held across deletion in E2E to prove it cannot restore the deleted row. Updated E2E fixtures/expectations only where the old tests contradicted the current contract or test setup.
- Added `.github/workflows/ci.yml` for migrations, full tests, admin build, browser suite, web-to-Android asset copy and Java21 Android debug build. The workflow is not yet executed remotely; GitHub reports the branch is unprotected. No policy setting changed.
- R-25 partial; 0 new fully closed cards; total remains24/42. Production and Play untouched. No attached ADB device.

## S034 current status — R-18 Android compile repair

- Java21 build exposed an actual compile failure: `MainActivity.onDestroy()` had weaker `protected` visibility than Capacitor `BridgeActivity.public`. Changed the override to `public`.
- Downloaded official Temurin21 into ignored `.tmp` only; system JDK17 remains unchanged. `:app:assembleDebug` passes. No APK installed because it shares the Play application ID. Evidence: `evidence/session-034/ANDROID_VOICE_BUILD_RESULTS.md`.
- R-18 stays partial until the native permission prompt/origin cancellation and Wi-Fi/LTE/TURN are exercised. R-10 also stays partial per S033. Overall locally closed remains **24/42**.

## S035 current status — R-25 server regression repairs

- Full `npm --prefix server test` passes **413/413**. The four previously failing test files pass **37/37** together; `npm run check` also passes.
- Fixed reconnect timeout cleanup: final forfeit removes stale live presence. Fixed a duplicate `timeout_continue` race while asynchronous next-round startup clears public timeout state. Updated stale static assertions and inaccurate reconnect fixtures without dropping behavioral coverage.
- R-25 remains partial: S025 E2E baseline 53/62 with nine historical failures, and the full CI gate is not yet green. No audit card closes in S035; overall remains **24/42**.
- ADB reports no attached device. No device acceptance, production call, Play install, or deployment occurred. Details: `evidence/session-035/TEST_MATRIX_RESULTS.md` and `summary.json`.

## S036 current status — R-25 E2E baseline and stale expectations

- Three stale E2E contracts now match the current app: app cache-busting query is no longer pinned to a retired version; the open-room screen presents the list directly; English pause labels use “Resume”/“Quit”. Focused scenarios pass3/3.
- Full `npm run test:e2e` is **57/64**. Seven failures remain: two Konva geometry/highlight checks, profile invite visibility, incoming invitation polling, expired-seat restore cleanup, invite room-code payload, and daily bonus visibility/claim. Details and exact artifacts are in `evidence/session-036/E2E_BASELINE_RESULTS.md`.
- S025 was53/62 (9 failures); suite now has two additional cases and three stale test contracts corrected. This is test maintenance only; no product behavior changed in S036. R-25 stays partial, CI gate open, count **24/42**.
- No production/Play access. ADB unavailable in S035/S036; no Android acceptance.
