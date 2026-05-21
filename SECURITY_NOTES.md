# Security Notes

## Production Secret Guard

- `BETTER_AUTH_SECRET` rejects weak fallback values in production.
- `platformAuth.js dev/test fallback` keeps local startup and tests from breaking.
- `dominoProof.js strict secret behavior` still requires `DOMINO_SERVER_SECRET` or `BETTER_AUTH_SECRET` for signed server requests.
- `platformGameToken` is still persisted in `localStorage`, so browser storage remains a known beta risk.
- The PR does not migrate tokens to memory-only storage because that would be a broader auth/session architecture change.

## Future Hardening

- Move platform token/session handling to a memory-only or short-lived strategy after beta if we want stronger isolation.
- Add or tighten CSP before wider release.
- Keep auditing `innerHTML` usage for user-controlled values.
- Prefer HTTPS-only Android configuration where possible.
- Review token rotation and short TTL options after closed beta.
- `platformAuth.js` dev/test fallback
- `dominoProof.js` strict secret behavior
- `localStorage platformGameToken risk`
- `memory-only / short-lived token strategy`
- `CSP`
- `innerHTML audit`
- `HTTPS-only Android config`
- `token rotation / short TTL review`

## XSS Review

- User-controlled names and display names are rendered with `textContent` in the active beta-facing paths.
- The only remaining `innerHTML` usage is for static templates, icons, or intentionally authored markup.
- `loadLeaderboard()` was fixed so it no longer depends on undeclared DOM nodes and does not insert user data with `innerHTML`.

## Token Storage Risk

- `platformGameToken` is still stored in `localStorage` in `www/js/account.js`.
- This is a known beta risk because it survives reloads and is accessible to injected script if a future XSS appears.
- The current sprint does not migrate auth storage to memory-only; that would be a larger auth-architecture change.
- The risk should be revisited after closed beta if we want stronger session isolation.
