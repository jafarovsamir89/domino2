# S029 — Android acceptance for R-23

Date: 2026-10-19. Reviewed the current tracked web assets on the connected Xiaomi 2201117SG (Android 13, Chrome 155.0.8059.84). The Play-installed application and its data were not opened or modified.

## Isolated test setup

The current source was copied to `.tmp/remediation-s029/clean`. The phone opened that source in Android Chrome through a temporary ADB reverse mapping to a disposable server bound only to `127.0.0.1:4175`. The server returned synthetic local API responses; injected Content Security Policy allowed connections only to that same localhost origin. This tested responsive UI in Chrome, not the installed Capacitor WebView or Play package.

## R-23 results

- At the phone's normal 393 CSS-pixel width, the game rendered the hand and seven full-size domino buttons.
- At 320 CSS pixels (temporary display override `880x2400` at the phone's unchanged density), dominoes retained their 44x66 CSS-pixel minimum size. The seventh domino extended beyond the initial viewport instead of shrinking the whole hand.
- A horizontal touch swipe moved the hand and brought the last domino fully into view. The display size was restored to `1080x2400` immediately after the capture.
- Visual evidence: [normal width](android-393px.jpg), [320px before scrolling](android-320px-before-scroll.jpg), and [320px after scrolling](android-320px-after-scroll.jpg).

TalkBack speech and per-tile focus were **not accepted**. Enabling TalkBack opened the device's first-run guide and notification prompt, which prevented a clean check in this pass. TalkBack was returned to its original disabled state (`enabled_accessibility_services=null`, `accessibility_enabled=0`, `touch_exploration_enabled=0`). R-23 therefore remains partial.

## Cleanup and limits

Restored the original display size, removed the ADB reverse/forward mappings, stopped the local preview, and left Chrome in the background. No request was sent to the production API, no app was installed, and no Play application or user data was changed. The test proves a real Android Chrome layout and swipe at 320 CSS pixels; it does not prove native WebView behavior or TalkBack announcements.

Overall fully closed count remains **22/42**. R-20, R-22, R-21, and R-23 remain partial as recorded in their session reports.
