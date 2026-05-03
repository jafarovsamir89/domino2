# Agent Handoff

## Project overview

- Project root: `C:\domino2`
- Frontend: static web app in `js/`, `css/`, `assets/`, `index.html`
- Synced web bundle for Capacitor and server: `www/`
- Backend: Node.js + Express + Colyseus in `server/`
- Android wrapper: Capacitor project in `android/`

## Repository

- GitHub repo: `https://github.com/jafarovsamir89/domino2`
- Default branch: `main`
- Repo was initialized locally during this session and pushed successfully
- `.gitignore` was added to exclude:
  - `node_modules/`
  - `server/node_modules/`
  - Android build folders
  - `.vscode/`
  - `android/local.properties`

## Local helper scripts

These were added in `package.json`:

- `npm run sync:www`
  - Runs [scripts/sync-www.ps1](/c:/domino2/scripts/sync-www.ps1)
  - Rebuilds `www/` from root web assets
- `npm run cap:copy`
  - Runs `npx cap copy android`
- `npm run apk:debug`
  - Runs [scripts/build-apk.ps1](/c:/domino2/scripts/build-apk.ps1)
  - Syncs `www/`
  - Copies Capacitor assets to Android
  - Builds debug APK with Gradle

APK output path:

- [android/app/build/outputs/apk/debug/app-debug.apk](/c:/domino2/android/app/build/outputs/apk/debug/app-debug.apk)

## Google Cloud

- Active project used for deployment: `project-8fc391c2-e159-4215-800`
- The other project `resolute-bloom-136514` was blocked because billing was not enabled
- Existing VM was reused instead of creating a new one

### VM details

- Instance name: `instance-20260418-225724`
- Zone: `us-central1-f`
- External IP: `34.28.23.216`
- OS: Debian

## Server deployment status

Server has already been deployed and is running.

### Verified working

- SSH access works via `gcloud compute ssh`
- `node`, `npm`, and `git` were installed on the VM
- Repo was cloned successfully on the VM after making the GitHub repo public
- Backend dependencies were installed with `npm install` inside `~/domino2/server`
- Server starts successfully with `npm start`
- Health endpoint works:
  - `http://34.28.23.216:2567/health`
  - Response seen by user: `Domino Telefon Server is running!`

### PM2 status

- `pm2` installed globally on VM
- Process name: `domino-server`
- Process status was confirmed as `online`
- `pm2 startup` was executed successfully
- `pm2 save` was executed successfully
- Service should restart on reboot

## Firewall/network

Port `2567` is open publicly and reachable, because the health check works from outside the VM.

The deployment used:

- firewall rule for TCP `2567`
- instance tag `domino-server`

## Important commands

### Local development

```powershell
cd C:\domino2
git add .
git commit -m "Update"
git push
```

### Update server after code changes

```bash
cd ~/domino2
git pull
cd server
npm install
pm2 restart domino-server
```

### Build debug APK locally

```powershell
cd C:\domino2
npm run apk:debug
```

### Check server status on VM

```bash
pm2 status
pm2 logs domino-server
```

## Existing docs

- [DEPLOY_GOOGLE_CLOUD.md](/c:/domino2/DEPLOY_GOOGLE_CLOUD.md)
- [README.md](/c:/domino2/README.md)
- [DEV_SUMMARY.md](/c:/domino2/DEV_SUMMARY.md)

## Important caveats

- GitHub repo had to be made public for simple VM cloning over HTTPS
- If the repo is made private again, future deploys will need:
  - SSH deploy keys on the VM, or
  - GitHub token authentication
- The backend currently listens on port `2567` in [server/index.js](/c:/domino2/server/index.js)
- The health endpoint is `/health`
- Frontend networking was updated in [js/network.js](/c:/domino2/js/network.js) and [www/js/network.js](/c:/domino2/www/js/network.js)
- Current client fallback server is `ws://34.28.23.216:2567`
- Capacitor/native builds now use the fallback server automatically
- Local browser development still uses `ws://localhost:2567`
- Optional runtime overrides are supported via:
  - `?server=...` query string
  - `localStorage.dominoServerUrl`
  - `window.DOMINO_SERVER_URL`
- Multiplayer lobby flow was redesigned in [index.html](/c:/domino2/index.html), [css/style.css](/c:/domino2/css/style.css), and [js/app.js](/c:/domino2/js/app.js)
- Online room size is now separate from solo player count via `onlinePlayerCount`
- Multiplayer create/join now shows room code, live player count, and a waiting list
- Server now broadcasts `room_state` messages from [server/DominoRoom.js](/c:/domino2/server/DominoRoom.js)
- Host settings `instantWinEnabled` and `dlossThreshold` are now sent to the server for multiplayer rooms
- Known structural issue remains: the repo keeps duplicated app assets in both root source folders and `www/`, so `npm run sync:www` is required after frontend edits

## Best next steps

1. Inspect frontend networking code and confirm what backend URL it uses.
2. Update the client configuration so the web app and Android app connect to `34.28.23.216:2567`.
3. Build and test a fresh APK against the deployed server.
4. Optionally automate deploy with a single script for `git pull`, `npm install`, and `pm2 restart`.
