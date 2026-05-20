# Security Notes

## Production Secret Guard

- `BETTER_AUTH_SECRET` and the Domino server signing secret now reject weak fallback values in production.
- Dev/test keep working with a shared in-process fallback secret so local startup and tests do not break.

## XSS Review

- User-controlled names and display names are rendered with `textContent` in the active beta-facing paths.
- The only remaining `innerHTML` usage is for static templates, icons, or intentionally authored markup.
- `loadLeaderboard()` was fixed so it no longer depends on undeclared DOM nodes and does not insert user data with `innerHTML`.

## Token Storage Risk

- `platformGameToken` is still stored in `localStorage` in `www/js/account.js`.
- This is a known beta risk because it survives reloads and is accessible to injected script if a future XSS appears.
- The current sprint does not migrate auth storage to memory-only; that would be a larger auth-architecture change.
- The risk should be revisited after closed beta if we want stronger session isolation.
