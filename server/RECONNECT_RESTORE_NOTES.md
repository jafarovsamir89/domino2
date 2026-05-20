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

- `economyReservationMade`
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

- `economyReservationMade` is currently set in runtime, but it is not included in `buildCustomStateSnapshot()`, so it does not survive restart today.
  - This is an existing behavior gap.
  - It should be handled in a separate PR if we decide it should survive restart.

- Reconnect and restore logic still blends room lifecycle, snapshot recovery, and some state repair steps in `DominoRoom.js`.
- `loadCustomStateForRestore()` depends on Redis availability and on lookup by `restoreRoomId`, `restoreRoomCode`, or `restoreSessionId`.

## Manual Scenarios To Check Later

- Restore after server restart with an active match in progress.
- Rejoin using the same session id after a network drop.
- Rejoin using a different session id but the same platform identity.
- Restore when Redis snapshot is missing, stale, or partial.
- Restore when the room contains bot players and a timer should resume.

## Safe Next Refactor

The smallest safe follow-up refactor should focus on one narrow boundary:

- split reconnect / restore orchestration from room lifecycle setup
- keep snapshot format unchanged
- keep Redis and room registry behavior intact
- keep client reconnect semantics unchanged

The next best candidate is the restore/rejoin boundary around `onCreate`, `loadCustomStateForRestore`, and `applyCustomStateSnapshot`, while leaving transport and game rules untouched.
