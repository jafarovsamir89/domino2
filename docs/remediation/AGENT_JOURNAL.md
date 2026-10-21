# Domino remediation — current handoff

Updated2026-10-21, S038. Read this file, append-only WORK_LOG.md, then docs/audit/REMEDIATION_PLAN.md.

## Current state

- Continue on **`codex/audit-ten-card-batch`**. Base was `fix/audit-foundation` at312c2d2. Code checkpoints: R10/R26 d671bb8; Android1c17cf9; audio264b1da; UI05b3f37; observability ba811be; test discovery/CI081dae6. Journals/evidence/plan are committed with the final handoff checkpoint.
- **27/42 locally closed** (was25): R01,R02,R03,R04,R05,R06,R07,R08,R10,R11,R12,R13,R14,R16,R17,R20,R23,R25,R26,R27,R29,R31,R32,R39,R40,R41,R42.
- S038 ten-card scope: R10,R15,R18,R19,R22,R24,R26,R28,R30,R33. Two local card closures;8remain partial with external/owner criteria preserved. R26 closure is the acceptance of one module extracted in its own PR, not a claim that all monolith/rules debt is gone.
- Focused **draft PR5**: https://github.com/jafarovsamir89/domino2/pull/5, head codex/active-session-access, base fix/audit-foundation. No merge/deploy. Batch branch contains that commit plus the remaining changes. Focused branch CI passed twice:39683630700 and39683658720. Latest whole-batch CI must still be checked before claiming remote acceptance.
- Local acceptance: full npm test **server429/429, API151/151**,0fail/0skip; full E2E **77/77**. After last minor board-reset change4/4zoom cases repeated; after correlation-ID hook change8/8match-recording/telemetry cases repeated. npm run check/parity/diff checks pass.
- Native Java21: cap sync + testDebugUnitTest + assembleDebug pass; origin-policy2/2 (template ExampleUnitTest not counted). Debug APK has Play applicationId; **not installed**. APK SHA in evidence/session-038/checks.json.
- **ADB has no device** at latest check. Desktop startup harness smoke is not a phone/native cold result.
- No production deployment/migrations/live data edits, Play installation/publication, plugins or delegated agents.

## Owner decisions

- R10: after logout/ban/deletion close connection within60seconds, then existing disconnect/reconnect-grace/forfeit. Monitor never settles a wallet directly.
- R21: owner explicitly deferred actual deletion/retention policy for a separate careful discussion. Keep visible request UI. Existing privacy.html30/90day text is not evidence of a working process; don't invent policy or claim deletion complete.
- User requests real card progress and simple explanations, not counting test/doc subtasks as full cards. Evidence/session-038/TEN_CARD_RESULTS.md is the single summary of this batch and what's still missing.

## Changes/contracts to know

- R10/R26: roomSessionAccess.js extracts HTTP validation and adds20second active probes/3second deadlines. New signed API scope game.session.validate permits checking an existing connection after its5minute admission token expires, provided DB session/player/ban still allow it. Join/reconnect remain expiry-checked. Denied/unavailable validation blocks messages and closes4003; ordinary onLeave owns grace/forfeit. Client clears revoked retry token but keeps multiplayer mode so online cannot silently become solo. Generation/client/disposal guards preserve shutdown.
- **Future release must be API-first**, then game server with matching proof secret and synchronized clocks. New game server against old API404 (orAPI503/429/network outage) fails closed and disconnects seats. See SESSION_ACCESS_RESULTS.md. No release was performed.
- R18: AudioPermissionPolicy exact HTTPS origin/current port, cancellation and onStop cleanup, no pending-request replacement. R19: stale native configure reply cannot override newer lifecycle state; Chromium remains sole audio-focus owner.
- R22/R24: AZ/RU/EN missing keys, late controls/aria and plural forms; narrow social header/cards fixed. Board1–2× zoom, bounded drag/arrows, reset/Escape, same-object board-clear reset. Canvas scene cap mobile1.25/desktop2 and hit1 unchanged; geometry/parity tested.
- R28: build SHA + allowlisted final events; no IDs/tokens/chat/private code in new analytics. Final settlement event after durable receipt; cached receipt doesn't emit twice. Telemetry is best effort, never authoritative ledger. Actual Sentry transport tested only against localhost. Operational Sentry beforeSend also strips ambient user/request/breadcrumb context and unrelated extras/tags; loopback SDK test injects these and confirms they do not reach the receiver. Production dashboards/alerts/Vitals still unknown.
- API tests now discover all compiled test files recursively; Android policy unit tests included in CI. No lockfile/dependency installation needed.

## Exact next action

1. Inspect latest GitHub Actions for codex/audit-ten-card-batch and focused PR5. If green, preserve evidence; if red, repair the actual failing contract. Do not redo installations or broad suites just because the task resumed.
2. Check adb devices -l. With the authorized phone, follow **DEVICE_ACCEPTANCE_NEXT.md**. Prepare/reuse a separate .audit package + synthetic loopback preview; never install current debug APK over Play. Collect real cold/warm/offline R15, prompt/NAT/TURN R18, call/Bluetooth R19. No connected phone means these cards stay partial.
3. Remaining independent R22 work is a full AZ/RU/EN screen sweep, then TR native review; R24 needs actual players in the full game screen. R28 needs chosen operator/dashboard/alert destination and staging delivery confirmation. R30 needs rights evidence for82content hashes + Console/Data Safety review. R33 needs owner cap/cycle/budget choice; no automatic reward reduction. R21 stays deferred.
4. Remaining15cards: R09,R15,R18,R19,R21,R22,R24,R28,R30,R33,R34,R35,R36,R37,R38. R09 real SSV/rewarded and P3 experiments remain outside the previously reduced scope. Do not inflate the closure counter by renaming external acceptance as complete.

## Evidence and environment

- S038 results: evidence/session-038/TEN_CARD_RESULTS.md, checks.json, BOARD_REVIEW.md, SESSION_ACCESS_RESULTS.md, OBSERVABILITY_OPERATIONS.md, ECONOMY_DECISION.md, logs/screenshots/model JSON. Device instructions and ASSET_RIGHTS_REGISTER.json are at this directory root.
- Asset register:142tracked paths/82content hashes, all owner source/license evidence pending. node docs/remediation/scripts/asset-rights-register.mjs --check verifies freshness. Don't assume root ISC covers media.
- Economic model:36scenario/horizon cells,20synthetic wallets, residual0; defaults not production overrides. node docs/remediation/scripts/economy-policy-sensitivity.mjs reproduces it without DB/network.
- Root/server lockfiles separate; dependencies already installed. API test build deletes/replaces apps/api/dist; no concurrent PG imports during build. Owned synthetic PG14.20 .tmp/remediation-s002/pg on localhost55439 remains stopped; no database was started in S038.
- Local JDK21 .tmp/jdk21/Contents/Home; system Java remains17. Preview4174 belongs to user. Agent previews4173/4186 should be stopped on handoff. E2E root screenshots/C:/ generated PNGs were restored/removed; intentional S038 captures retained.
- Root/www source pairs must stay byte-identical. Audit edits: validate-audit.mjs, refresh only changed existing hashes in347-entry sha256-manifest.json, then verify-manifest.mjs. Preserve original audit failures/history.
- R03/R29 persistent absolute outbox volume and exact match reserves remain mandatory; never reassign legacy null-match reserves. Shutdown is not forfeit; timer ownership/generation guards and input watchdog contracts remain intact.
