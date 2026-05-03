# Google Cloud Deployment Guide

This guide uses the simplest setup for this project:

- Google Compute Engine VM for the Node.js game server
- local development on your computer
- local APK builds on your computer

## 1. Check Google Cloud CLI

Run these commands on your computer:

```powershell
gcloud auth login
gcloud config list
gcloud projects list
```

Find your project id and set it:

```powershell
gcloud config set project YOUR_PROJECT_ID
```

## 2. Enable Compute Engine

```powershell
gcloud services enable compute.googleapis.com
```

## 3. Create a VM

```powershell
gcloud compute instances create domino-server `
  --zone=asia-southeast1-a `
  --machine-type=e2-micro `
  --image-family=ubuntu-2204-lts `
  --image-project=ubuntu-os-cloud `
  --boot-disk-size=20GB `
  --tags=domino-server
```

## 4. Open the game server port

The backend uses port `2567` in `server/index.js`.

```powershell
gcloud compute firewall-rules create allow-domino-2567 `
  --allow=tcp:2567 `
  --target-tags=domino-server
```

## 5. Connect to the VM

```powershell
gcloud compute ssh domino-server --zone=asia-southeast1-a
```

## 6. Install Node.js on the VM

Run these commands inside the VM:

```bash
sudo apt update
sudo apt install -y git curl
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
node -v
npm -v
```

## 7. Upload the project

Recommended: store the project in GitHub, then clone it on the VM.

```bash
git clone YOUR_REPOSITORY_URL ~/domino2
cd ~/domino2/server
npm install
```

## 8. Start the server

```bash
cd ~/domino2/server
npm start
```

Health check:

```text
http://YOUR_VM_EXTERNAL_IP:2567/health
```

## 9. Keep the server running with PM2

```bash
sudo npm install -g pm2
cd ~/domino2/server
pm2 start index.js --name domino-server
pm2 save
pm2 startup
```

Run the extra command shown by `pm2 startup`.

## 10. Update the server after code changes

On your computer:

```powershell
git add .
git commit -m "Update project"
git push
```

On the VM:

```bash
cd ~/domino2
git pull
cd server
npm install
pm2 restart domino-server
```

## 11. Build the Android APK locally

From the project root on your computer:

```powershell
npm run apk:debug
```

The APK should appear here:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```
