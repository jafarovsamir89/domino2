# Server Update Workflow

Target VM:

```bash
gcloud compute ssh instance-20260418-225724 --zone=us-central1-f --project=project-8fc391c2-e159-4215-800
```

Project path on the VM:

```bash
/home/user/domino2
```

## Normal Update From Local Windows

After committing and pushing your local changes to GitHub:

```powershell
npm run deploy:gcloud
```

This runs the remote updater through `gcloud` and updates:

- root npm workspace dependencies
- Prisma client and migrations
- NestJS platform API
- Next.js admin app
- legacy Colyseus game server
- PM2 process list
- health checks

## Normal Update From The VM

```bash
cd ~/domino2
bash scripts/gcloud/update-server.sh
```

## Update Only The New Platform

From Windows:

```powershell
npm run deploy:gcloud:platform
```

From the VM:

```bash
cd ~/domino2
bash scripts/gcloud/update-server.sh --platform-only
```

## Update Only The Legacy Game Server

From Windows:

```powershell
npm run deploy:gcloud:legacy
```

From the VM:

```bash
cd ~/domino2
bash scripts/gcloud/update-server.sh --legacy-only
```

## Rebuild Current Server Files Without Git Pull

Use this only when files were copied to the VM manually and you want to rebuild/restart them:

```bash
cd ~/domino2
bash scripts/gcloud/update-server.sh --no-pull
```

## Important Git Rule

The default update refuses to run if the VM has uncommitted changes. This is intentional.

If the script prints `git worktree is not clean`, push the current project state to GitHub first, then update the VM from GitHub. Avoid manual file copying as the normal workflow.

## Health Checks

The updater verifies:

```bash
curl http://127.0.0.1:3000/api/health
curl http://127.0.0.1:3000/api/platform/status
curl http://127.0.0.1:2567/health
pm2 status
```

## Persistent Env

Production secrets stay on the VM in:

```bash
/home/user/domino2/.env.platform
```

The updater loads this file before building/restarting platform services.
