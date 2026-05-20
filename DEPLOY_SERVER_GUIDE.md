# Deploy Guide

Short checklist for a safe server deploy of Domino Telefon.

## Before deploy

1. Finish the change locally.
2. Run the relevant tests.
3. Commit the change.
4. Push to `origin/main`.

## Deploy to Google Cloud VM

Use the repo wrapper so the VM deploy stays consistent:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\gcloud\update-server.ps1 -ForceSync
```

Why `-ForceSync`:

- it resets the VM worktree to `origin/main`
- it keeps runtime files like `.env.platform` and `server/data`
- it avoids partial or dirty deploy states

## What the deploy script does

1. Pulls the latest `origin/main` on the VM.
2. Syncs web assets into `www/`.
3. Runs project tests.
4. Regenerates Prisma client.
5. Applies database migrations.
6. Rebuilds platform apps.
7. Restarts PM2 processes:
   - `domino-platform-api`
   - `domino-platform-admin`
   - `domino-server`
8. Saves the PM2 process list.
9. Runs health checks.

## After deploy

- Check that the menu footer shows the expected version.
- Confirm PM2 processes are online.
- If needed, inspect logs:

```bash
pm2 logs domino-server
```

## Notes

- The VM repo lives at `~/domino2`.
- The legacy game server process name is `domino-server`.
- `origin/main` must contain the commit before deploying.
