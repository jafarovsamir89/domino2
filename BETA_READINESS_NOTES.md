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

## What Is Ready

- stake sanity is aligned between client UI and backend-supported keys
- low balance errors normalize to `insufficient_coins`
- Redis readiness is exposed by `/health/ready`
- reconnect banner and reconnect failure messaging are in place
- forfeit settlement failures surface a user-facing warning
- production weak-secret guard is covered by tests
- snapshot and restore safety tests are in place

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
- Redis outage drill
- production weak secret check

## Beta Go / No-Go

Beta can start only if:

- `npm --prefix server test` passes
- `npm --prefix apps/api test` passes
- `npm run test` passes
- manual 2-player flow passes
- manual reconnect flow passes
- manual low balance flow passes
- manual forfeit flow passes
- `/health/ready` is configured in deployment
- production secrets are set and not weak

## Remaining Risks Before Closed Beta

- reconnect / restore still needs a real-device pass on unstable Wi-Fi
- `platformGameToken` still uses `localStorage`, so token persistence is not memory-only yet
- mobile/Android focus and background behavior still needs manual QA
- voice/gifts were not touched in this sprint and should be verified in beta smoke tests
- load/stress testing for 50 players still should be run before wider launch

## Notes

- The current match wording now matches the beta behavior: a 365-point target with a 3-round cap.
- If a forfeit settlement transport fails, the room now warns the player that the stake settlement was not completed and suggests support contact.
