# Refactoring Status

## What Has Been Extracted

- `roomSnapshot.js`
  - Snapshot identity sanitizing and restore helpers.
  - `sanitizeName`.
  - `sanitizeSnapshotIdentity`.
  - `buildSnapshotIdentityEntries`.
  - `restoreSnapshotIdentityEntries`.

- `signedRequest.js`
  - Shared signed payload builder for integrity-scoped requests.
  - `buildSignedRequestBody(scope, payload)`.

- `roomConfig.js`
  - Room code generation and room option normalization helpers.
  - `generateRoomCode`.
  - `normalizeRoomVisibility`.
  - `normalizeStakeKey`.
  - `normalizePlayerCount`.
  - `normalizeAiCount`.
  - `normalizeDlossThreshold`.
  - `normalizeInstantWinEnabled`.
  - `normalizeAiDifficulty`.

- `roomIdentity.js`
  - Identity/session normalization helpers used during join and reconnect flows.
  - `normalizeAuthToken`.
  - `normalizePlayerUserId`.
  - `normalizePlayerAvatarUrl`.
  - `normalizePlayerId`.
  - `normalizePlayerRole`.
  - `buildRoomIdentity`.

- `roomPresence.js`
  - Live presence payload assembly.
  - `buildLivePlayerPayload`.

- `economyConfig.js`
  - Economy base URL normalization and URL building.
  - `DEFAULT_PLATFORM_API_URL`.
  - `normalizePlatformApiUrl`.
  - `buildEconomyUrl`.

- `economyClient.js`
  - Thin transport wrapper for economy endpoints.
  - `postEconomyRequest`.
  - `postReserveEconomyMatch`.
  - `postSettleEconomyMatch`.
  - `postRefundEconomyMatch`.

- `economyParticipants.js`
  - Pure participant/winner selection helpers for economy flows.
  - `getSessionIdentities`.
  - `hasUnlinkedHuman`.
  - `buildReserveParticipants`.
  - `buildWinnerUserIds`.
  - `buildForfeitWinnerUserIds`.

- `matchResultPayload.js`
  - Pure platform match payload assembly helpers.
  - `buildWinnerKey`.
  - `buildMatchTeams`.
  - `buildMatchParticipantRows`.
  - `buildPlatformMatchPayload`.

- `roomStatePayload.js`
  - Pure `room_state` broadcast payload assembly helpers.
  - `buildRoomStatePlayers`.
  - `buildRoomStatePayload`.

- `economyService.js`
  - Economy settlement orchestration helpers.
  - `reserveEconomyStakeForRoom`.
  - `settleEconomyRoundForRoom`.
  - `settleForfeitStakeForRoom`.

## What DominoRoom.js Still Owns

`DominoRoom.js` should now be treated primarily as an orchestration layer. It still owns:

- Room lifecycle.
- Join and leave flow.
- Reconnect and replay handling.
- Snapshot load/apply/save orchestration.
- Game turn, deal, round, and match progression.
- Event broadcast timing.
- Gift and voice signaling transport.
- Platform match recording orchestration.
- Economy orchestration wrappers that call into `economyService.js`.

## Remaining Risk Areas

The following areas are still the most sensitive and should be changed carefully:

- Reconnect / restore flow.
- Deeper snapshot restore logic.
- Gifts.
- Voice signaling.
- Platform match recording transport.
- Any code that mixes room lifecycle with economy or persistence side effects.

## Recommended Next Step

The next refactor stage should focus on splitting the remaining high-risk orchestration zones one by one, starting with the reconnect / restore path and then snapshot restore details.

That order keeps the economy work isolated and avoids mixing recovery semantics with match logic.

## Current Safety Notes

- Economy reserve, settle, and forfeit flows have already been moved into `economyService.js`.
- The runtime behavior of the game should be treated as unchanged by this refactor series.
- New helpers are intentionally small and pure where possible to keep future changes low-risk.
