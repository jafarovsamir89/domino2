# Platform Deploy Notes for GCloud VM

## Target VM
- Instance: `instance-20260418-225724`
- Zone: `us-central1-f`
- Project: `project-8fc391c2-e159-4215-800`

## SSH command
```bash
gcloud compute ssh instance-20260418-225724 --zone=us-central1-f --project=project-8fc391c2-e159-4215-800
```

## Current remote state as of 2026-05-07
- `pm2` is installed and currently runs `domino-server`
- current game server listens on port `2567`
- `postgresql` is installed and running
- `nginx` is installed and running
- the new platform API runs on port `3000`
- the new admin app runs on port `3001`
- Nginx proxies:
  - `/api/*` -> `127.0.0.1:3000`
  - `/` -> `127.0.0.1:3001`
- repo exists on the VM at `~/domino2`

## Implications for the new platform
- PostgreSQL is already provisioned, but Prisma migrations still need to become part of the normal deploy flow
- TLS still needs to be introduced later
- the safest migration path remains side-by-side:
  - keep current `pm2` game process alive
  - evolve the new NestJS API separately
  - evolve the Next.js admin separately
  - only migrate legacy game auth once the new platform layer is stable

## Current deploy model
- The VM already has the platform services wired.
- Future updates should happen through GitHub, then a pull/build/restart cycle on the VM.
- Do not manually copy files as the normal workflow anymore except for emergencies.
- The main update guide is `docs/server-update-workflow.md`.

Repo helpers already prepared:
- `scripts/gcloud/provision-platform.sh`
- `scripts/sql/bootstrap-platform.sql`
- `scripts/gcloud/provision-platform-remote.sh`
- `scripts/gcloud/nginx-domino2.conf`
- `scripts/gcloud/install-nginx-config.sh`
- `scripts/gcloud/deploy-from-git.sh`

## Suggested service ports
- `2567`: existing legacy game server
- `3000`: NestJS platform API
- `3001`: Next.js admin
- `5432`: PostgreSQL

## Important caution
- Do not stop or overwrite the current `domino-server` process until:
  - Prisma schema is migrated
  - Better Auth env values are configured
  - admin and API health checks pass

## Recommended update workflow
1. Commit local changes and push them to GitHub.
2. From local Windows, run:
```powershell
npm run deploy:gcloud
```

Or SSH into the VM and run:
```bash
cd ~/domino2
bash scripts/gcloud/update-server.sh
```
3. Verify:
```bash
curl http://127.0.0.1/api/health
curl http://127.0.0.1/api/platform/status
pm2 status
```

## Secrets and env files
- Keep secrets only on the VM:
  - `apps/api/.env`
  - `apps/admin/.env.local`
  - `packages/db/.env`
- Do not commit production secrets to GitHub.
