# Google Play Data Safety Notes - Domino Telefon

Last updated: July 9, 2026

These notes are a working checklist for the Google Play Console Data safety form. They are not a substitute for reviewing the exact APK/AAB, enabled server flags, SDKs, and production configuration before release.

## Data categories to review

| Google Play category | Domino Telefon data | Typical purpose | Notes for Play Console |
| --- | --- | --- | --- |
| Personal info | Display name, email address if provided by Google Sign-In, profile/avatar information | Account management, profile, support, moderation | Declare only the fields actually collected in the release build and backend. |
| User IDs | Google account identifier, internal user ID, player ID/session ID | Authentication, account linking, gameplay, security | Used to identify the player account and connect gameplay records. |
| App activity | Gameplay, match history, ratings, coins, daily bonuses, gifts, inventory, rooms, tournaments | App functionality, analytics/diagnostics, fraud prevention | Required for core gameplay and economy. |
| User-generated content | Text chat, display name, avatar/profile content, reports, blocks, moderation records | App functionality, moderation, safety, abuse prevention | Chat is filtered and moderated; reports/blocks are safety features. |
| Audio | Voice chat/microphone stream and related voice signaling metadata if voice is enabled | App functionality, player communication, safety | Declare Audio if the shipped APK allows voice chat or captures/streams microphone data. |
| App info and performance | Crash logs, diagnostics, performance data, server/app logs | Diagnostics, security, app improvement | Sentry is used for crash/error diagnostics. Logs are normally limited-retention. |
| Device or other IDs | Push notification tokens, device/app identifiers, advertising identifiers only if ad SDK is enabled | Notifications, diagnostics, advertising if enabled | Advertising is not enabled in the current production version. Re-check before release if AppLovin, AdMob, or another ad SDK is enabled. |
| Approximate location | Approximate region inferred from IP address | Security, localization, abuse prevention, operations | Do not declare precise location unless the app starts collecting it. |
| Financial info / purchase history | Google Play Billing purchase tokens, order status, purchased item IDs, entitlement records if purchases are enabled | Purchases, fraud prevention, accounting, support | Only declare this if real-money purchases are enabled in the shipped release. Google handles payment card details. |

## Active and planned providers to verify

- Google Sign-In / Google Play services: authentication and platform functionality.
- Firebase Cloud Messaging: push notification tokens if push is enabled.
- Sentry: crash, error, and performance diagnostics.
- Google Play Billing: declare purchase-related data only if billing is enabled in production.
- Advertising SDKs such as AppLovin or AdMob: not enabled in the current production version. If enabled later, update the Privacy Policy and Data safety form before releasing that build.
- Hosting, database, networking, and infrastructure providers: used to operate the game.

## Manual checks before submitting the Data safety form

1. Confirm the final Android build and server flags match the form.
2. Confirm whether voice chat is available in the released APK; if yes, declare Audio.
3. Confirm whether purchases are enabled; if yes, declare purchase history / financial-related records as applicable.
4. Confirm whether any advertising SDK is packaged or enabled; if yes, declare identifiers and ad interaction data required by that SDK.
5. Confirm whether Firebase features beyond push notifications are enabled.
6. Confirm Sentry configuration and retention language remain accurate.
7. Confirm Privacy Policy URL is public and accessible: `https://gamed.simplesoft.az/privacy.html`.
8. Confirm account deletion URL is public and accessible: `https://gamed.simplesoft.az/delete-account.html`.

The Play Console Data safety answers must match the actual APK/AAB and production backend behavior. If SDKs, flags, ads, billing, analytics, or voice behavior change, update this checklist, the Privacy Policy, and the Play Console form before release.
