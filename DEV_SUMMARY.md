# Domino Telefon - Project Status (v1.18)

## Overview
Classic Domino game "Telefon" ( Пятёрочка / Five Club) built with HTML/JS/CSS and Capacitor for Android.

## Recent Changes (v1.14 - v1.18)

### 1. Gameplay Stability & Synchronization
- **State Reconstruction**: Fixed a critical bug in networking where raw JSON data for the `Board` and `Tile` objects was missing class methods and getters (e.g., `isEmpty`, `getValidMoves`). Implemented `reconstructBoard()` in `board.js` to restore these objects on the receiver side.
- **UI Snappiness**: Reduced all gameplay timeouts (turn advance, pass, draw) from ~1500ms down to 300-800ms to eliminate the "frozen" feeling during bot turns.
- **Guard Logic**: Refined `turnInProgress` usage to ensure it doesn't get stuck in a 'true' state, which was preventing user interaction.

### 2. Visuals & Animations
- **CSS Animations**: Migrated tile placement animations to a CSS-based `flyIn` system. Used `.board-tile` class to decouple positioning from animation transforms.
- **Corrected Assets**:
  - Six-pip layout changed from vertical to horizontal.
  - Fixed duplicate "divider line" on double tiles.
- **Arrow Overlay**: The direction choice overlay is now full-screen with a higher z-index (100) to prevent accidental clicks on the hand while choosing a placement direction.

### 3. Debugging Tools
- **Debug Log**: Added a small, semi-transparent log area (`#debug-log`) in the bottom left of the game screen to trace events like `Play pi=0 ti=2`.
- **Version Label**: Added a version string (e.g., `v1.18`) to the start screen for build verification.

## Current Architecture

- **`js/app.js`**: Main controller. Handles game loop, turn management, and networking (PeerJS).
- **`js/board.js`**: Core logic. Manages `BoardNode` placements, `OpenEnd` tracking, and scoring (multiples of 5).
- **`js/renderer.js`**: View layer. Handles DOM updates, board scaling/zoom-to-fit, and arrow overlays.
- **`js/ai.js`**: Simple heuristic-based AI for bots.
- **`js/model.js`**: Basic data structures (`Tile`) and utility functions.

## Known Issues to Monitor
- **Turn Hangs**: If the game stops responding after the 2nd move, check the `#debug-log`. It is likely a state desync or an unhandled exception in `advanceTurn()`.
- **Scaling**: The board uses `getBoundingClientRect()` for zoom-to-fit. Ensure the container is fully rendered before `renderState()` is called.

## Handover Instructions
- To build the APK: `Copy-Item ... to www ; npx cap copy android ; cd android ; .\gradlew.bat assembleDebug`
- The `reconstructBoard` function in `board.js` is essential for any data coming from `JSON.parse` or networking.
