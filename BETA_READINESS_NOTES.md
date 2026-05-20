# Beta Readiness Notes

## What Is Already Closed

- PR A:
  - stake table sanity
  - low-balance reason normalization
  - Redis readiness health check
  - reconnect banner / reconnect UX
- PR B:
  - forfeit settlement failure warning and support message
  - match wording aligned to current beta behavior
  - production secret guard with dev/test fallback
  - security audit notes for token storage and DOM insertion risk

## Manual Beta Checklist

- 2 players
- 4 players
- team mode
- bots
- disconnect / reconnect
- server restart restore
- forfeit
- low balance
- repeated click
- mobile browser
- Android build

## Remaining Risks Before Closed Beta

- reconnect / restore still needs a real-device pass on unstable Wi-Fi
- `platformGameToken` still uses `localStorage`, so token persistence is not memory-only yet
- mobile/Android focus and background behavior still needs manual QA
- voice/gifts were not touched in this sprint and should be verified in beta smoke tests

## Notes

- The current match wording now matches the beta behavior: a 365-point target with a 3-round cap.
- If a forfeit settlement transport fails, the room now warns the player that the stake settlement was not completed and suggests support contact.
