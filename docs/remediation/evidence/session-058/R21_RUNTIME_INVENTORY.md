# S058 — R21 runtime and external-service inventory

**Date:** 2026-11-12  
**Branch:** `codex/rewarded-acceptance`  
**Code checkpoint reviewed:** `ef4095b` (`feat: add fail-closed R21 game erasure adapter`)  
**Scope:** read-only review of tracked repository files. No `.env`, production credentials, server, database, or cloud account was accessed.

## Findings

1. **Runtime shape is documented, but not verified against today's host.** `DEPLOY_SERVER_GUIDE.md` and `docs/platform-deploy-gcloud.md` describe a Google Cloud VM at `~/domino2`, system PostgreSQL, and PM2 services. The local compose file describes a development PostgreSQL container. These files do not prove the live VM still matches that setup.
2. **No repository-defined recurring database backup or retention job was found.** The tracked gcloud update script's `sync_clean_worktree()` makes a temporary `/tmp/domino2-backup.*` directory to preserve `.env.platform` and `server/data` around a forced Git reset. It does not dump PostgreSQL, enumerate snapshots, or define expiry/retention. This is deploy-file preservation, not evidence of a recoverable database backup policy. A provider-level backup schedule may exist outside this repository and was not checked.
3. **FCM tokens are stored in the application database.** `FcmToken.player` has `onDelete: Cascade`; deleting the `Player` removes the token rows. The service sends notifications through Firebase Admin using the registered token and message sender name. The repository has no separate account-erasure call to Firebase. This establishes local database cleanup only; it does not establish Firebase's own token/telemetry retention or the production Firebase project in use.
4. **Deletion failure alerts are not connected to the requested owner email.** `AccountDeletionModule` logs only aggregate blocked counts and is not imported by `AppModule`. Sentry is configured by environment DSN, but the R21 worker does not emit an explicit deletion-failure event to Sentry or an email provider. No tracked email transport is wired for `jafarovsamir@gmail.com`.
5. **The restore-journal API still needs a real backup provider.** `ErasureStores.forgetAfterBackupsExpire()` is an abstract promise. It must establish that every backup covering the account has expired/deleted before `AccountErasureJournal.forget()` removes the durable marker. A timer-only implementation or an unavailable provider would violate the approved 60-day maximum and could let a restore recreate deleted accounts.
6. **Production composition remains disabled.** `AccountDeletionModule.register()` requires a complete executor and restore gate; the production `AppModule` does not import it, and `DOMINO_GAME_ERASURE_URL` is not set in tracked configuration. This is intentional while adapters are incomplete.

## Conclusion and next action

The repository does not identify a concrete source of production PostgreSQL backups, so a safe backup-retention adapter cannot yet be selected from local code alone. Continue with repository-local startup/restore and rollback safeguards, keeping the module disabled. Before implementing the backup adapter, establish the actual backup source and retention inventory from the operational owner/configuration; confirm the failure-notification delivery route as part of the same integration. Do not treat the deployment script's temporary file copy as a database backup or claim that cloud-level backups do not exist.

R21 remains open and the audit count remains **30/42**. This investigation made no production or user-account changes.
