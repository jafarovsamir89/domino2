# Agent journal: current handoff

Updated2026-10-18. Read this first, then append-only WORK_LOG.md and docs/audit/REMEDIATION_PLAN.md. User asks for batches of8 and a simple Russian explanation of each result. Current batch S014-S021 finished; exact evidence and dependency checkpoint are in WORK_LOG and git log.

## Authorization

User owns deployed Domino with about50 users. Local fixes, synthetic tests, separate Android audit package and feature-branch push authorized. Production deployment/migrations, live wallets and installed Play package changes require a direct instruction. No real .env/tokens/data in tests or commits. No Codex plugin installation without confirmation; none installed. No agents requested/spawned.

## Git and accurate status

Branch fix/audit-foundation; origin https://github.com/jafarovsamir89/domino2. Batch started92fe188. Check actual git log/status before continuing.

Current checkpoints:4ecf5be(R11/R39),10254ae(R41),b356c72(R16),066f1bc(R17),a449a97(R40),db47e67(R19 local). R27 dependency locks/triage and final batch docs are the final checkpoint of this batch; obtain hash from git log after push.

19/42 cards closed locally: R01,R02,R03,R04,R05,R06,R07,R08,R11,R12,R16,R17,R27,R31,R32,R39,R40,R41,R42. R09 unverified rewarded_x2 disabled/external SSV pending; R19 controls/lifecycle fixed/external call/Bluetooth/audio-focus acceptance pending; R25 partial.20other cards open. These are local statuses, not production releases.

Earlier12 fixes and their commands/evidence are preserved in session001-013 and WORK_LOG. R09 historical x2-upgrade tests/scripts are superseded; do not re-enable unverified rewards. R42 receipt UI counts actual net/stake return and deduplicates results; no new fee/payout policy. R29 response-loss/outbox remains open.

## This batch: what matters for continuation

- R27/S014: compatible updated root/server locks; Capacitor8.5.3, Better Auth/adapters/telemetry1.7.10, Next15.5.28, proxy-addr2.0.8,tar7.5.22 plus compatible transitives. Critical5→0, root high21→4, server high/critical0. Residual deepmerge-ts/Prisma config and Next/PostCSS build-input boundaries are recorded in session014/DEPENDENCIES.md; no forced major override. Fresh Node22root/server ci, API142, admin build, OAuth/navigation contract4tests, native sync+build verified. External OAuth/Play acceptance deferred. Debug APK is .audit; production app unchanged.
- R11/S015: public allowlist DTOs redact sessions/user IDs/private codes; closed discovery always excludes closed rooms. Private code lookup requires verified membership. Legacy bearer-less client possessing an unlisted session capability retains only roomId/status, preserving installed-client resume; don't blindly change it to mandatory401. Verified owner gets code. Admin no longer keys by session. API142Node25/22 + real synthetic HTTP probes pass.
- R39/S016: liveness/readiness bypass Redis-backed limiter; readiness requires PING with750ms deadline, shared in-flight probe prevents queued retry growth. Owned real Redis pause/recovery verifies healthy process,503readiness,200recovery, unchanged snapshot/room. Redis stopped.
- R41/S017: additive transactional migration19 completes DM/clientMessageId/thread/fcm/enum/indexes/FKs; backfills legacy thread latest message/unread counts, preserves messages/wallets. Schema declares existing4indexes rather than dropping them. Fresh and18→19upgrade Node25/22 drift0/read-send-readstate/retry/FCMCRUD pass. No reset/db push. Production may contain manual schema drift: review actual migration state before any later authorized deploy; don't blindly run it.
- R16/S018: owned async operation generation/cycle/board/hands/player checks after awaits/RAFs; old resolve/reject cannot unlock/score new turn. DOM/Konva cancel resolves once.14tests plus instant33pass Node25/22.
- R17/S019: watchdog uses known phase continuation exactly once; online asks authoritative sync, never blindly unlocks. Drawing cancels/recomputes, result-reveal and advance have owned resumes; stale finally cannot clear new stage. Unknown phase remains diagnosed/locked; not all possible freezes claimed solved.16tests+R16+instant63Node22pass.
- R40/S020: pausable local-game timer descriptors preserve turn/stage/bot delays; committed placement settles once before paused snapshot. Input/watchdog guards pause.8tests; real phone60.5s state unchanged,20cycles one timer, force-stop exact persisted snapshot/remaining time. Storage caveat: immediate kill retained a previous write462ms older; final drill waits1200ms for WebView storage. This is not abrupt-kill durability; R29 separate. Online deadlines continue.
- R19/S021: shared master/music/effects settings and legacy migration, effects gain bus/pre-node gating, music pause/resume, browser lifecycle + custom DominoAudio Activity bridge. Native bridge uses Capacitor.Plugins fallback because global registerPlugin is absent on this phone. Do not add a second AudioManager focus owner: it competed with Chromium and blocked resume in the rejected initial attempt. Final bridge only supplies lifecycle.10tests pass; real mute0nodes/settings23%37%persist/HOME pauses despite visible document/foreground resumes/targeted .audit return pass.3language master labels and aria state checked on phone. External call/Bluetooth/focus and acoustic output unverified; card not fully closed.

## Verification and limits

Final full server Node22:377/384, exact same7 historical failures; session014/failure-delta.json compares names. Earlier this batch Node25full373/380 before4extra regressions; all extra tests have focused passes. API142/142 Node25 and22; fresh Node22ci+API/admin pass. Source check and web/www parity pass. Matching ordinary Playwright Chromium was downloaded after dev-dependency update; this is not a Codex plugin.

E2E historical baseline30/39 plus boundary1/1. First new full29/40 had same9 plus two failures because autoplay warning was suppressed. Warning restored rather than weakening tests; final full rerun31/40 has exactly the original9failures, no new ones (session014/summary.json and failure-delta.json). Do not call the suite green. Last UI-only language-sync line was additionally checked on physical Android.

No production/Play changes, no real users/wallets contacted. Device UI API is a guarded localhost synthetic harness, not a real OAuth/provider/backend acceptance; API/real migration checks were separate. Physical checks use az.simplesoft.dominotelefon.audit only.

## Environment and cleanup

Main node_modules still old; use isolated clean installs. .tmp/remediation-s014/final has clean updated Node22root/server dependencies and API/admin outputs; .tmp/remediation-s014/clean has patched native build/4175audit overlay. Do not copy isolated audit server URL into production config. Native final artifact SHA/bytes in session014/android-artifact.json; APK not committed.

Own PG14.20 .tmp/remediation-s002/pg127.0.0.1:55439 is STOPPED; prior final/upgrade DBs contain synthetic fixtures and are used, not fresh. Owned Redis56380 was stopped after S016;56379 prior service stopped. Local preview4175 STOPPED, audit app force-stopped, owned forwards9224/9225/9226 and reverse4175 removed; session014/cleanup.json. Play app/data retained. No global/project Codex plugins installed.

prepare-checkout.mjs copies tracked/staged working contents, omits .env/deps/heavy evidence. Untracked tests must stage or explicitly copy. run-check.mjs requires matching .tmp/remediation-sNNN copy, fresh allowlist/synthetic endpoints/Redis disabled,10minute deadline; long preview must be restarted before expiry. Node25.6/npm11.8 and22.14/npm10.9.2 used. Root API TypeScript requires its nested apps/api/node_modules (TS5); reusing only root picks TS6 and a false baseUrl failure. Prefer fresh npmci root/server with separate locks.

Node22 invocation: npm exec --yes --package=node@22.14.0 --package=npm@10.9.2 -- COMMAND. API package test file list is explicit; server recursively discovers .test.js/.cjs/.mjs. Seven old server failures are not to be excluded or assertions weakened.

After audit-plan edits run validate-audit.mjs, update existing347SHA256 manifest entries, verify-manifest.mjs. Preserve historical evidence. App source/www matching files must be byte-identical.

## Exact next action

After confirming final dependency/docs push and clean status, next unhandled high-priority card is R29 durable outbox/reconciliation (depends R03/R04, now local done). Read its acceptance plus server/economyService.js and result-delivery flow before editing. Begin with a guarded synthetic response-loss/restart regression that checks no lost/double settlement; don't mark complete from ordinary retry alone. R10 revocation and R13/R14/R15/R23/R21 are further local candidates. Keep next batch8 per user; some remaining cards need explicit external acceptance and must retain those limits. Do not deploy merely because local cards are closed.
