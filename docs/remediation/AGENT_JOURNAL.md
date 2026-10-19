# Agent journal: current handoff

Updated2026-10-18. Read this first, then append-only WORK_LOG.md and docs/audit/REMEDIATION_PLAN.md. Latest user instruction is two more items (overrides earlier batches of8), with a simple Russian explanation for each result. S022-S023 / R13-R14 are finished locally; final checkpoint subject is fix(ui): reduce persistent game effects with Android frame evidence. Obtain its hash from git log after push.

## Authorization

User owns deployed Domino with about50 users. Local fixes, synthetic tests, separate Android audit package and feature-branch push authorized. Production deployment/migrations, live wallets and installed Play package changes require a direct instruction. No real .env/tokens/data in tests or commits. No Codex plugin installation without confirmation; none installed. No agents requested/spawned.

## Git and accurate status

Branch fix/audit-foundation; origin https://github.com/jafarovsamir89/domino2. Batch started92fe188. Check actual git log/status before continuing.

Current checkpoints:21df7ed finalizes S014-S021;58d3ede is pushed R13/S022. R14/S023 plus final journals/evidence form the next focused checkpoint. Before further work verify actual git status and origin match.

21/42 cards closed locally: R01,R02,R03,R04,R05,R06,R07,R08,R11,R12,R13,R14,R16,R17,R27,R31,R32,R39,R40,R41,R42. R09 unverified rewarded_x2 disabled/external SSV pending; R19 controls/lifecycle fixed/external call/Bluetooth/audio-focus acceptance pending; R25 partial.18other cards open. These are local statuses, not production releases.

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

## Latest batch S022-S023

- R13/S022: actual Konva layer sceneCanvas ratio cap1.25mobile/2desktop, hitCanvas1; previous Stage attribute did not change backing buffers. No global Konva pixelRatio mutation. Ratio/size changes invalidate cached board signature for normal redraw. Resize/DPR media observers rearm and remove on destroy. Eight real-browser cases cover4DPRprofiles x web/www,5/10/20/28tile scenes, buffers/coordinates/resize/DPR/pixel readback/tap; Node25/22 pass. Observer/cancellation16pass. Android portrait/landscape/return and marker tap pass, three ratio clarity captures viewed. Scene buffer491x748 portrait, hit1, coordinate error<1px. No proportional total-app-memory claim. Evidence session022.
- R14/S023: static gold outlines replace infinite playable-tile/active-turn/arrow shadow animations. Permanent hand/header/DOM-arrow blur removed, small Konva-marker shadow/no inline filter,2finite opacity fades with reduced-motion suppression. Root/www identical. Rules/economy/native dependencies unchanged. Four actual computed-style/tap/reduced-motion browser cases, combined R13/R14 twelve pass Node25/22.
- Android measurements: randomized3x8s diagnostic variants then continuous-travel old/new CSS3paired blocks, fixedCanvas1.25. First shadow_only label also removed filter: explicitly confounded, supplemented by3x pure box-shadow-only/filter-only/baseline series. Pure shadow removal rAF21->54/s, filter-only~20. Product A/B own-app FrameTimeline processing p95median130.89->17.11ms (eachnew17.11-17.19), native presentations23.44->50.85/s, rAF23.61->54.08/s. Presentation/rAFintervalp95 remains~33ms; no stable60FPS claim. Synthetic28board+7duplicatehand renderer stress is not a legal35tile game. One debug phone/charging, no battery/release/multidevice/long-soak proof.
- Official Perfetto Trace Processor58.2 cache downloaded as ordinary developer tool, not a Codex plugin. Minimal FrameTimeline capture only; no upload. Six PID/layer-filtered numeric CSV and provenance committed, raw system traces stay.tmp. Actual final screenshot reviewed; physical marker tap after finite fade passed. All scripts/evidence/method in session023/PERFORMANCE_RESULTS.md and BATCH_022_023.md.

## Verification and limits

Latest full server Node22:379/386, exact same7 historical failures. Latest full E2E43/52, exact same9 historical failures; session023/failure-delta.json asserts no new failures. New12browser cases pass both Node25/22. Source check and web/www parity pass. Initial wrong fixture ID/diagnostic stacking, Node22port4173collision, stale probe callback and Perfetto config format attempts retained/excluded; final true tests passed without weakening assertions. Node22 final browser run used temporary isolated config port4176. No need repeat long suites absent new changes.

Last API142/142 Node25/22 and fresh admin/native builds belong to S014-S021; not rerun this UI-only batch. API/source/native package did not change. Historical audit evidence preserved; not all-green CI.

No production/Play changes, no real users/wallets contacted. Device UI API is a guarded localhost synthetic harness, not a real OAuth/provider/backend acceptance; API/real migration checks were separate. Physical checks use az.simplesoft.dominotelefon.audit only.

## Environment and cleanup

Main node_modules still old; use isolated clean installs. .tmp/remediation-s014/final has clean updated Node22root/server dependencies and API/admin outputs; .tmp/remediation-s014/clean has patched native build/4175audit overlay. Do not copy isolated audit server URL into production config. Native final artifact SHA/bytes in session014/android-artifact.json; APK not committed.

Own PG14.20 .tmp/remediation-s002/pg127.0.0.1:55439 is STOPPED; prior final/upgrade DBs contain synthetic fixtures and are used, not fresh. Owned Redis56380 was stopped after S016;56379 prior service stopped. Latest preview4175 STOPPED (session023/s023-device-preview.json), audit app force-stopped, owned forwards9227-9230 and reverse4175 removed; session023/cleanup.json. Earlier9224-9226 cleanup remains recorded. R13rotationauto/value0/0 restored. Own Perfetto device files/probe removed; raw system traces remain.tmp only. Unrelated user preview4174 retained. Play app/data retained. No global/project Codex plugins installed.

prepare-checkout.mjs copies tracked/staged working contents, omits .env/deps/heavy evidence. Untracked tests must stage or explicitly copy. run-check.mjs requires matching .tmp/remediation-sNNN copy, fresh allowlist/synthetic endpoints/Redis disabled,10minute deadline; long preview must be restarted before expiry. Node25.6/npm11.8 and22.14/npm10.9.2 used. Root API TypeScript requires its nested apps/api/node_modules (TS5); reusing only root picks TS6 and a false baseUrl failure. Prefer fresh npmci root/server with separate locks.

Node22 invocation: npm exec --yes --package=node@22.14.0 --package=npm@10.9.2 -- COMMAND. API package test file list is explicit; server recursively discovers .test.js/.cjs/.mjs. Seven old server failures are not to be excluded or assertions weakened.

After audit-plan edits run validate-audit.mjs, update existing347SHA256 manifest entries, verify-manifest.mjs. Preserve historical evidence. App source/www matching files must be byte-identical.

## Exact next action

Finish/confirm final R14 docs/evidence push, clean status and origin match; then this two-item batch is done. On the next authorized continuation, first unhandled high-priority card is R29 durable outbox/reconciliation (depends R03/R04, locally done). No R29 changes exist in this batch. Read its acceptance plus server/economyService.js and result-delivery flow, start with guarded synthetic response-loss/restart regression proving no lost/double settlement. Ordinary retry alone is insufficient. R10 revocation and R15/R23/R21 are other candidates; consult dependencies and latest user batch-size instruction. Keep R09/R19 external and R25 acceptance limits explicit. Do not deploy because local cards are closed.
