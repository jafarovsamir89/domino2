# Reconnect / Restore Notes

## Current Flow

The reconnect and restore path currently involves these pieces:

- `server/DominoRoom.js`
  - `onCreate(options)`
  - `loadCustomStateForRestore(options)`
  - `applyCustomStateSnapshot(data)`
  - `buildCustomStateSnapshot()`
  - `onCacheRoom()`
  - `onRestoreRoom(cachedData)`
  - `findReusableSessionId(options, identity)`
  - `hasRestoredMatchInProgress()`

- `server/roomSnapshot.js`
  - identity sanitizing for persisted snapshots
  - snapshot restore sanitizing for persisted identities

- `server/roomRegistry.js`
  - room code <-> room id registration and lookup

- `server/index.js`
  - room bootstrapping and server wiring

- `www/js/network.js`
  - client reconnect attempts and fallback behavior

## Redis Restore Lookup Behavior

`loadCustomStateForRestore(options)` now delegates to `server/roomRestoreLookup.js`, and the lookup behavior is unchanged.

Current lookup order:

1. `domino:custom:{restoreRoomId}`
2. `domino:custom:code:{restoreRoomCode}`

Matching rules today:

- `restoreRoomId` is normalized with `String(...).trim()`.
- `restoreRoomCode` is normalized with `String(...).trim().toUpperCase()`.
- A snapshot returned from Redis is parsed with `JSON.parse`.
- If `restoreRoomCode` was requested, the parsed snapshot is only accepted when `parsed.roomCode` matches that code.
- If Redis returns invalid JSON, the method logs the error and returns `null`.
- If Redis is unavailable or `connect()` / `get()` throws, the method logs the error and returns `null`.
- If no restore keys are provided, the method returns `null` immediately.

Important limitation:

- `restoreSessionId` is not part of Redis snapshot lookup.
- Session reuse is handled separately by `findReusableSessionId(options, identity)` during join flow.

## What Is Saved In Snapshot Today

The persisted custom room snapshot currently includes:

- `roomId`
- `roomCode`
- `state`
- `roomVisibility`
- `humanSeats`
- `totalPlayers`
- `aiCount`
- `dlossThreshold`
- `instantWinEnabled`
- `aiDifficulty`
- `currentStakeKey`
- `currentDealMatchId`
- `currentDealStakeKey`
- `currentDealStakeAmount`
- `currentDealBankAmount`
- `economyReservationMade`
- `lastReservedMatchRound`
- `matchRecorded`
- `forfeitSettlementMade`
- `lastRoundEconomySummary`
- `hands`
- `boneyard`
- `internalBoard`
- `lastDealWinner`
- `botIds`
- `playerMissingSuits`
- `identityBySessionId`

## What Is Not Saved

The following runtime/transient values are not persisted today:

- `pendingEconomySettlement`
- `pendingAdvanceKind`
- `turnAdvancePending`
- `turnAdvanceTimer`
- `nextDealTimer`
- `botTimer`
- `turnTimer`
- `restoredFromSnapshot`
- `matchFinished`

## Important Risks

- `economyReservationMade` is now included in `buildCustomStateSnapshot()` and restored in `applyCustomStateSnapshot()`.
  - The restart gap was closed in PR #18.

- Reconnect and restore logic still blends room lifecycle, snapshot recovery, and some state repair steps in `DominoRoom.js`.
- `loadCustomStateForRestore()` depends on Redis availability and on lookup by `restoreRoomId`, `restoreRoomCode`, or `restoreSessionId`.
- The Redis lookup logic is now isolated in `server/roomRestoreLookup.js`.

## Manual Scenarios To Check Later

- Restore after server restart with an active match in progress.
- Rejoin using the same session id after a network drop.
- Rejoin using a different session id but the same platform identity.
- Restore when Redis snapshot is missing, stale, or partial.
- Restore when the room contains bot players and a timer should resume.
- Restore/rejoin with a requested `restoreSessionId` that already exists in the active room state.

## PR #21 Coverage

The following restore lookup cases are now covered by tests:

- restore by `restoreRoomId`
- restore by `restoreRoomCode`
- room-code mismatch rejection
- invalid JSON handling
- Redis unavailable / throws handling
- no restore options
- `restoreSessionId` fallback behavior in `findReusableSessionId`
- direct helper coverage for `server/roomRestoreLookup.js`

## Safe Next Refactor

The smallest safe follow-up refactor should focus on one narrow boundary:

- split reconnect / restore orchestration from room lifecycle setup
- keep snapshot format unchanged
- keep Redis and room registry behavior intact
- keep client reconnect semantics unchanged

The next best candidate is the restore/rejoin boundary around `onCreate`, `loadCustomStateForRestore`, and `applyCustomStateSnapshot`, while leaving transport and game rules untouched.
