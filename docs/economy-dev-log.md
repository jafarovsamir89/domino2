# Economy Dev Log

## 2026-05-08
- Defined the coin economy scope and kept it separate from rating and tile logic.
- Added PostgreSQL models for:
  - config
  - wallets
  - ledger entries
  - daily claims
  - quests
  - stake tables
  - match stakes
  - tournaments
  - catalog items and entitlements
- Added a NestJS `EconomyModule` with public and admin endpoints.
- Wired match reservation and settlement into the current game server flow.
- Added admin support for economy metrics and wallet data.
- Added a dedicated economy admin page.
- Added stake selection to the online room UI.
- Added docs for the economy plan and this development log.
- Recovered the first production migration attempt by marking the failed migration as rolled back, then replayed it after making the appended SQL idempotent.
- Fixed a bootstrap race in `getPublicConfig()` so default quests and other seeded economy rows are guaranteed to appear on a fresh database.

## Notes
- Coins are implemented as a soft currency only.
- Free play stays available even if a player has zero coins.
- Guests default to free tables until they create/link an account.
- Every coin movement should be represented by a ledger entry.

## Next Steps
- Run compile and runtime verification on the API, admin and game client.
- Check the new economy page and wallet flows on the VM.
- Verify stake reservation and settlement under:
  - win
  - draw
  - abort / disconnect
- Add more admin shortcuts if daily operations need them.
