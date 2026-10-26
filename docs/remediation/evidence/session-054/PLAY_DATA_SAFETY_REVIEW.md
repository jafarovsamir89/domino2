# R30 — read-only Play Console review, 2026-10-26

The owner opened the actual app in Chrome. Verified package `az.simplesoft.dominotelefon`, listing name **Домино Клуб Онлайн**, current release24/1.20. No credentials, personal account details or player data are stored here. No answer, draft or release was saved.

Observed Console → App content → Processed → Data safety, last declaration change **2026-07-10**. Each category's question dialog was opened and closed without changing controls.

## Existing answers

- Data collected: yes. Encryption in transit: yes. Account creation: OAuth only.
- Account deletion URL and optional **data-only deletion without deleting the account** URL both point to `https://gamed.simplesoft.az/delete-account.html`; data-only deletion is currently answered **yes**.
- All13 selected data types say **collected**, **not shared**, **ephemeral processing**, **required collection**.

| Selected type | Existing selected purposes |
|---|---|
| Name | App functionality; advertising/marketing; fraud prevention/security/compliance |
| Email | App functionality; advertising/marketing; fraud prevention/security/compliance; personalization; account management |
| User IDs | App functionality; fraud prevention/security/compliance |
| Approximate location | App functionality; advertising/marketing; personalization |
| Other in-app messages | App functionality |
| Photos | App functionality |
| Audio recordings / voice messages | App functionality; advertising/marketing |
| Crash reports | App functionality; analytics; fraud prevention/security/compliance |
| Diagnostics | App functionality; analytics; developer communications; fraud prevention/security/compliance |
| In-app search history | App functionality |
| Other user-generated content | App functionality |
| Other actions | App functionality |
| Device or other IDs | App functionality |

These are observed selections, not endorsement of their accuracy.

## Corrections to prepare against the release

1. **Stored account identifiers/name/email, persisted chat, photos/voice-message data and stored diagnostics cannot all be described as ephemeral.** Check each actual storage path, including message-embedded media and provider storage, then answer separately. Live voice transport is distinct from saved voice messages.
2. **Advertising use of name/email/voice has not been established by the current code.** Native LevelPlay remains audit-only/default-off. Do not declare that private messages/voice/profile details are used for ads merely because advertising might be enabled later.
3. **Data-only deletion is not implemented/verified.** Owner approved whole-account deletion with30days waiting and bounded backups. Either implement a separate authenticated data-only flow or change the optional data-only answer to no when preparing the actual declaration; do not claim the account-erasure flow provides both.
4. **Required versus optional depends on the feature and release.** New free local solo needs no account; photos, voice messages and voice chat are user-initiated. Distinguish optional features from what is required to use them.
5. **Approximate location, search history and third-party sharing require specific evidence.** Device-region language selection alone does not establish server collection of location. Search inputs sent for an immediate query are different from stored search history. "Not shared" must be checked against SDK processors and Google's applicable exceptions rather than assumed from the presence/absence of a third-party SDK.
6. Verify actual Sentry/push/auth configuration, data handling/retention and authorized processor exceptions before finalizing the release answers. Do not read `.env` or production records for this local review.
7. Update deletion/privacy wording only to match the working approved process, then reconcile Console and the served public pages. The new robot is still being implemented locally; the published page was not changed during this check.

Primary requirements checked: [Google Play Data safety](https://support.google.com/googleplay/android-developer/answer/10787469?hl=en), [Account deletion](https://support.google.com/googleplay/android-developer/answer/13327111?hl=en). This is a code/declaration comparison, not a legal opinion or a guarantee of approval.
