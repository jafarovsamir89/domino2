# Domino Telefon (Пятёрочка)

A modern mobile-first implementation of the classic "Telefon" (Five Club / Пятёрочка) domino game. Built with web technologies and wrapped for Android using Capacitor.

## 🎮 Game Rules

The goal of the game is to score points by making the sum of all open ends of the domino chain a multiple of **5**.

### Key Mechanics:
- **The Telephone (Spinner)**: The first double played on the board becomes the "Telephone". Unlike regular tiles, it allows connections on all four sides (top, bottom, left, right).
- **Scoring**: If the sum of open ends is 5, 10, 15, 20, etc., you get that many points.
- **Gosha (Combo)**: If you have tiles that match all open ends and the resulting sum is a multiple of 5, you can play them all at once as a "Gosha" combo.
- **Fish (Рыба)**: If no player can make a move and the boneyard is empty, the round ends in a "Fish". The player with the fewest points in hand wins the bonus.

## 🚀 Features
- **Solo Play**: Compete against smart AI bots with adjustable difficulty.
- **Wi-Fi Multiplayer**: Play with friends on the same network using P2P (PeerJS).
- **Team Mode**: Support for 2 vs 2 gameplay.
- **Responsive Board**: Dynamic "Zoom-to-Fit" engine ensures the entire chain is always visible.
- **Premium Aesthetics**: Smooth CSS animations, dark-themed UI, and procedural sound effects.

## 🛠 Tech Stack
- **Frontend**: HTML5, Vanilla CSS, Modern JavaScript (ES6+).
- **Mobile Wrapper**: [Capacitor](https://capacitorjs.com/).
- **Networking**: [PeerJS](https://peerjs.com/) for P2P communication.
- **Sound**: Web Audio API (procedural generation).

## 📦 Building and Deployment

### Prerequisites:
- Node.js & NPM
- Android Studio (for Android builds)

### Build Steps:
1. **Sync web assets**:
   ```powershell
   Copy-Item -Recurse js, css, assets, index.html, manifest.json -Destination www/
   ```
2. **Update Capacitor**:
   ```bash
   npx cap copy android
   ```
3. **Build APK**:
   ```powershell
   cd android
   ./gradlew assembleDebug
   ```
The resulting APK will be located at `android/app/build/outputs/apk/debug/app-debug.apk`.

## 📜 License
Internal Project - Development Version 1.18.
