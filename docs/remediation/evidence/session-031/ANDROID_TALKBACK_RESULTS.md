# S031 — Android TalkBack acceptance for R-23

Date: 2026-10-19. Device: Xiaomi 2201117SG, Android 13, Android Chrome. Test used the disposable synthetic preview on `127.0.0.1:4175`; no Play-installed package, production service, or user account was accessed.

## Finding and fix

Before the fix, Android's accessibility hierarchy represented each tile as a focusable `ToggleButton` but returned an empty accessible name, even though the page DOM had a correct `aria-label`. A minimal on-device probe reproduced the Chromium behavior: `aria-pressed` changed a labelled button into a toggle node and the native hierarchy dropped `aria-label`.

The hand renderer now adds the same localized tile name as visually hidden text inside the button, while retaining `aria-label`, `aria-disabled`, and `aria-pressed`. The text stays invisible and does not change the 44×66 CSS-pixel hit area. Root and `www/` assets remain identical.

## Device results

- With TalkBack enabled, the Android accessibility hierarchy exposed seven separate, focusable tile nodes. Each node carried its full tile index, pip values, and playable/not-playable state as text. `android-hand-accessibility.xml` records the focused first tile and all seven names.
- A focused tile was reported by Android as `focused=true` with its full name. This used the app's normal DOM focus path while TalkBack was active.
- Invoking the real `Renderer.showArrowChoices` path with a synthetic two-ended board produced a visible accessible group. Android exposed both “Place toward ←, on 3” and “Place toward →, on 3”; the first control received focus automatically. See `android-end-choice-accessibility.xml` and `android-talkback-end-choice.png`.
- S029 already verified on the same phone that all seven tiles retain 44×66 CSS-pixel minimums at a 320 CSS-pixel viewport and a horizontal swipe reveals the last tile: [S029 results](../session-029/ANDROID_ACCESSIBILITY_RESULTS.md).
- `npm run check`, `node --check js/renderer.js`, `git diff --check`, and root/`www` parity passed.

## Limits and cleanup

This establishes the names and focus in Android's native accessibility tree with TalkBack enabled; the device audio output was not captured as a recording. The layout and accessibility tests ran in Android Chrome against localhost synthetic data, not the installed Capacitor/WebView Play package. No production or Play changes were made. The preview, TalkBack service, display override, and ADB mappings were restored/stopped after evidence capture.

R-23's local implementation and Android Chrome acceptance criteria are complete. A separate native WebView/release-package check remains outside this card's local acceptance.
