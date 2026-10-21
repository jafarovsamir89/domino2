# Domino remediation — current handoff

Updated 2026-10-21, S038 in progress. Read this file, the append-only WORK_LOG.md, then docs/audit/REMEDIATION_PLAN.md.

## Current state

- Branch: `codex/active-session-access` (R-10/R-26 focused review); base `fix/audit-foundation` at `312c2d2`. Remaining S038 working-tree changes will continue on `codex/audit-ten-card-batch`.
- Accepted total before S038: **25/42 locally closed**: R01,R02,R03,R04,R05,R06,R07,R08,R11,R12,R13,R14,R16,R17,R20,R23,R25,R27,R29,R31,R32,R39,R40,R41,R42.
- S037 full matrix: server413/413, API149/149, E2E64/64, fresh migrations/admin/Android builds pass. Successful CI runs39525993872 and39526606183. `main` has no required-check protection; no GitHub protection policy was changed.
- S038 currently adds active-session revocation for R-10 and extracts its server validation boundary into `server/roomSessionAccess.js` (R-26). Targeted server/auth/network33/33, API auth7/7 pass. Full combined working-tree matrix427/427 server,150/150 API,77/77 E2E passed; after adding discovery and2more cases, final429/151 run is underway. S038 local Android Java21 unit tests2/2 plus assembleDebug pass; no install.
- No production deployment/migrations, live data edits, Play installation, plugins, or delegated agents.

## Owner decisions received 2026-10-21

- **R-10:** after logout/ban/account deletion, close the active connection within60seconds, then use the existing disconnect/reconnect-grace/forfeit behavior. Do not directly settle a wallet in the access monitor.
- **R-21:** owner explicitly deferred deletion/retention policy for a separate careful discussion. Keep visible request UI; do not invent a retention period or mark this card closed.
- Owner requested another10 plan items. Current batch targets R-10,R-15,R-18,R-19,R-22,R-24,R-26,R-28,R-30,R-33. Count whole card closures only; device/owner/external criteria remain explicit.

## In-progress R-10 implementation

- New signed server-only `POST /api/platform/game-session/validate` checks original token signature, current platform session/player/ban. Signed request scope `game.session.validate`, timestamp<=10seconds. Existing admission/reconnect endpoint still rejects expired tokens.
- This active-only boundary accepts an expired five-minute admission token when its underlying account session is live. A long match must not be disconnected just because its admission token aged out.
- `RoomSessionAccess` probes connected seats every20seconds with3second HTTP deadlines (expected upper bound23seconds). A denied/unavailable check blocks new room messages, closes code4003 and lets existing `onLeave` own grace/settlement. No per-move API requests.
- Guard ignores late results for replaced identities/clients and during shutdown/dispose. Network handler stops retries of revoked token and keeps multiplayer mode so the disconnected game cannot run locally.
- Tests: new guard contract was missing before implementation; API new-contract regression initially failed (missing method), then passed. Signed-boundary and synchronous-validator regression pass. API-first release order is mandatory; see evidence/session-038/SESSION_ACCESS_RESULTS.md.

## Next action

1. Push focused R-10 module branch and open draft PR against fix/audit-foundation. Keep production untouched. Continue remaining local S038 changes on codex/audit-ten-card-batch. R-26 closure requires this focused review artifact plus preserved contracts.
2. R-22: eight missing AZ/RU/EN translation keys plus hardcoded Cancel/Message/system-mail labels found; fix and verify narrow screens. Turkish native review remains external.
3. Continue the remaining independent cards in the ten-card scope. ADB currently lists no device; do not substitute browser evidence for phone measurements or real Wi-Fi/LTE voice/audio-focus acceptance.
4. Update plan/evidence/counts only when criteria are met; commit focused milestones and push authorized feature branches.

## Safety and environment

- Owner's deployed game has about50users. Local/synthetic checks and feature-branch commits/push are authorized. Production deploys/migrations/live wallets/published Play changes need direct owner instruction.
- Preserve Play app/data. Native tests use a separate `.audit` ID. Existing debug variant still uses Play ID; never install it over Play.
- Root/server lockfiles separate. Read WORK_LOG before reinstalling. Root/API/server dependencies already present; do not copy `.env` or print real tokens/signing credentials.
- API test build removes/replaces `apps/api/dist`; do not run PG imports concurrently with that rebuild. Owned synthetic PostgreSQL14.20 in `.tmp/remediation-s002/pg`, localhost55439, stopped at last handoff. User preview4174 is unrelated; keep it.
- Root/www source pairs must stay byte-identical. Audit documents: run `docs/audit/evidence/scripts/validate-audit.mjs`, refresh changed existing hashes in the347-entry audit manifest, then verify-manifest.mjs.
- E2E generates tracked screenshots and untracked `C:/` paths; restore/remove only outputs generated by our run from a clean baseline.

## Contracts to preserve

- R03/R29: exact room/match reserves and idempotent settlement. Durable outbox must use an absolute persistent local volume on a future release; API-first order. See session024/OUTBOX_OPERATIONS.md. Do not reassign legacy null-match reserves or purge unresolved outbox records.
- R04/R16/R17/R40: shutdown is not forfeit; owned async generations and pause timer descriptors survive recovery. Watchdog never blindly unlocks online actions.
- R19: Chromium owns audio focus; don't add a competing native AudioManager owner. Native Activity lifecycle bridge already gates both sound engines. Call/Bluetooth tests remain open.
- R13/R14: actual scene-canvas ratio mobile<=1.25, desktop<=2, hit=1; resize/DPR invalidates render signature. Previous Android stress evidence is not a Play-release60FPS guarantee.

History and detailed prior results live in WORK_LOG.md and evidence/session-001 through session-037. This file intentionally replaces stale duplicated baseline/status paragraphs from the previous handoff.
