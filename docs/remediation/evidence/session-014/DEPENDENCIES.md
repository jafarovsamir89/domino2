# S014 / R-27: dependency remediation, 2026-10-18

All checks used isolated local copies with synthetic configuration. These are dependency-tree warnings, not a claim that every advisory was reachable in production. No exploit requests, production login, deployment or Play release were performed.

## Selected compatible versions

| Surface | Before locked | After locked | Reason and local reachability |
|---|---:|---:|---|
| Capacitor Android/core/CLI |8.3.1|8.5.3|Android WebView and native plugins are shipped runtime. The upstream navigation advisory includes the previous version. Upgrade and rebuild are required; disabling the HTTP option alone is insufficient.|
| Better Auth and matching adapters/telemetry |1.6.x|1.7.10|API mounts authentication, uses bearer plus Google/Apple configuration. Optional OIDC/device/organization plugins are not configured here; patched library selected regardless. Actual auth-service unit suite and client request/token contracts pass.|
| Next |15.5.16|15.5.28|Admin uses Next server/runtime. Stayed on15 rather than combining remediation with a major framework migration. Fresh admin build passes.|
| proxy-addr |2.0.7|2.0.8|Express uses trust proxy; compatible patched transitive version locked.|
| tar |7.5.13|7.5.22|Capacitor tooling/build dependency; no runtime archive-upload endpoint found in this application. Compatible patched version locked.|

Other compatible workspace/server transitives were refreshed with ordinary npm update; no npm audit fix --force, major overrides or application feature dependencies added. Root and server lockfiles remain separate. Manifest minima now require the selected Capacitor/Better Auth/Next patch lines; clean npm ci was repeated on Node22/npm10.

## Audit result and remaining warnings

Root/workspaces: critical5→0, high21→4, total36→8. The four remaining high entries represent two underlying build/config packages plus inherited package warnings. Server lock: critical0/high0, total8 (3moderate,5low). These counts are the registry response captured in the adjacent logs, not a promise about future advisories.

| Remaining chain | Boundary found in this checkout | Disposition |
|---|---|---|
| prisma→@prisma/config→deepmerge-ts7.1.5 |Prisma CLI reads trusted repository configuration; API runtime uses generated Prisma Client. No route passes a recursive object graph into this config merger.|Recorded residual high. Advisory fixes8; do not force a major transitive override inside Prisma6. Reassess with a separately tested Prisma upgrade or compatible upstream patch.|
| next→postcss8.4.31 |Admin build processes CSS committed in the repository. No user-supplied CSS/source-map processing route found. An admin runtime dependency tree still contains the package.|Recorded residual high, not removed from audit output. Registry proposes Next16; separate major upgrade or reviewed compatible override needed. Treat untrusted build inputs as outside this assessed boundary.|
| @capacitor/cli→xcode→uuid |Local iOS project tooling, not Android shipped Java/JS runtime. This checkout only builds Android.|Residual moderate. Recheck before an iOS build; no forced downgrade of Capacitor.|
| colyseus→@colyseus/playground/@colyseus/auth→grant→request-oauth/jwk-to-pem→uuid/elliptic |Game server imports Colyseus Server; index.js does not mount playground or Grant OAuth provider routes. Platform authentication is the separate Better Auth service.|Residual low/moderate. No claim that optional transitive modules are absent; no affected OAuth route enabled in inspected entrypoint. Audit proposes an older major, rejected as a blind fix.|

These reachability statements are code inspection in this revision; enabling new routes, plugins, CSS inputs or iOS tooling requires revisiting them.

## Checks and limits

Fresh root/server npm ci on Node22, API142/142 on both tested Node versions, admin build, source syntax/mojibake gate, full server failure delta, client Google/Apple start + native token adoption and browser/native return routing. Android debug audit package was rebuilt using Capacitor8.5.3 and exercised on the connected device with the localhost preview. An explicitly targeted audit Activity return was checked; the installed Play app was preserved.

Actual external Google/Apple authorization, production cookie/domain configuration, Play signing/release and other devices remain deferred under ACCEPTED_SCOPE.md. Local contracts are not a substitute for that release acceptance. Full E2E/server dispositions are in summary/failure-delta; neither historical suite is called fully green.

## Sources

- [Capacitor upstream advisory](https://github.com/ionic-team/capacitor/security/advisories/GHSA-rvm3-566m-v7fv)
- [Capacitor Android changelog](https://github.com/ionic-team/capacitor/blob/main/android/CHANGELOG.md)
- [Better Auth1.7.10 release](https://github.com/better-auth/better-auth/releases/tag/v1.7.10)
- [DeepmergeTS advisory](https://github.com/advisories/GHSA-ggr8-5vv4-36mx)
- [PostCSS advisory](https://github.com/advisories/GHSA-r28c-9q8g-f849)
- Registry audit details: s014-audit-before.log, s014-audit-workspaces.log, s014-server-audit.log.
