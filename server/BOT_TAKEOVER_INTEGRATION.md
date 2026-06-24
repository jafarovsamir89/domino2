# Bot Takeover — Integration Guide

This feature lets a **bot take over an absent human seat** and play to the end of
the match. Triggered when the inactivity/turn timer expires for ANY reason
(disconnect, closed app/page, or pure idle). Other players are notified that the
player left and a bot is now playing; when the human comes back the bot steps
aside and the table is notified again.

## What is already in this PR (safe, inert until wired)

| File | Change |
|------|--------|
| `server/botTakeover.js` | **New.** Self-contained `BotTakeoverController` + config + constants. |
| `server/schema/GameState.js` | Adds 4 backward-compatible `Player` fields: `controller`, `takeoverActive`, `takeoverReason`, `takeoverSince`. |
| `server/roomStatePayload.js` | Exposes `controller` / `takeoverActive` / `takeoverReason` per player to the client. |

Everything is gated behind `DOMINO_BOT_TAKEOVER=1` (off by default), so merging
this PR changes nothing in production until the wiring below is done **and** the
flag is enabled on staging.

## Locked product decisions

1. Explicit **"Leave"** button → stays an instant forfeit (NOT a bot takeover).
2. The bot plays for **real stakes** on behalf of the player (real win/loss).
3. Bot strength = **medium / fair** (anti "disconnect-to-win").
4. Takeover fires **30s** after the seat goes absent (current `TURN_TIMEOUT_MS`).
5. If **both** humans are gone → finish the match by current points / draw (no
   full bot-vs-bot simulation).

---

## Wiring required in `DominoRoom.js`

> `DominoRoom.js` is ~157 KB and is intentionally **not** auto-rewritten here to
> avoid a risky full-file replacement. Apply these targeted edits by hand.

### 1. Construct the controller

```js
const { BotTakeoverController, BOT_TAKEOVER_CONFIG } = require("./botTakeover");
// in onCreate(), after this.state is set:
this.botTakeover = new BotTakeoverController(this);
```

### 2. Reset anti-abuse counters when a match starts

```js
// wherever a new match begins (match init / first deal of a match):
this.botTakeover?.resetForNewMatch();
```

### 3. Replace the timeout-forfeit path with a takeover attempt

In `handleTurnTimeout(...)` (and `finalizeReconnectTimeout(...)` for the grace
expiry path), BEFORE running the existing forfeit logic
(`findTimeoutWinner` / `endRoundByTimeoutForfeit`):

```js
const seatPlayer = /* the Player whose turn/grace just expired */;
// Explicit leave is NOT eligible (decision #1):
const wasExplicitLeave = this.explicitLeaveSessionIds?.has(seatPlayer?.sessionId);
if (!wasExplicitLeave && this.botTakeover?.begin(seatPlayer, reason)) {
    // Bot now controls the seat — do NOT forfeit. Drive the bot move instead.
    this.scheduleTurnTimer?.();   // keep the turn clock running for the bot
    return;
}
// else: fall through to the existing forfeit / timeout-continue behaviour.
```

`reason` should be one of `"disconnect" | "page_close" | "idle"` — use `"idle"`
when the socket is still connected, otherwise `"disconnect"`.

### 4. Make the bot actually move for a taken-over seat

Add the room hook the controller calls after a successful takeover:

```js
onBotTakeoverActivated(player) {
    // If it is this seat's turn right now, kick off the bot move.
    const idx = this.getSeatIndexForPlayer?.(player); // map player -> turn index
    if (idx === this.state.currentPlayerIndex && this.state.gameActive) {
        this.runBotTurn(idx); // reuse existing bot driver
    }
}
```

Then, in `scheduleTurnTimer` / the place that decides whether the current seat is
a bot, treat `player.isBot || botTakeover.isBotControlled(player)` as “bot acts”
so the existing `runBotTurn` flow drives taken-over seats too. Use
`BOT_TAKEOVER_CONFIG.botDifficulty` when constructing the substitute `AIPlayer`.

### 5. Let the human reclaim the seat

**On reconnect** (`onJoin` reuse path / `completeReconnectGrace`):

```js
if (this.botTakeover?.isBotControlled(player)) {
    this.botTakeover.resume(player, { requestUserId: player.userId });
}
```

**While still online but idle** — add a message handler:

```js
this.onMessage("resume_control", (client, _payload) => {
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    if (!this.botTakeover?.canHumanReclaim(player)) return; // debounce flapping
    this.botTakeover.resume(player, { requestUserId: player.userId });
});
```

Add the matching hook:

```js
onHumanControlResumed(player) {
    // Cancel any pending bot move for this seat; refresh the turn timer so the
    // human gets a full window.
    this.scheduleTurnTimer?.();
}
```

### 6. Both players gone (decision #5)

After a takeover, if **no** connected human remains at the table, do NOT keep
simulating bot-vs-bot. End the match immediately by current points (existing
match-end path) and mark `gameOverReason = "all_absent"`.

### 7. Persistence

When snapshotting/restoring custom state (`schemaStateSnapshot.js` /
`roomSnapshot.js`), include the 4 new `Player` fields so a server restart / Redis
restore keeps the takeover state. They are plain scalars — add them next to
`seatIndex`.

---

## Client wiring (`www/js/network.js`)

### 1. Send a reclaim request (idle-but-online case)

```js
sendResumeControl() {
    if (!this.room) return;
    try { this.room.send("resume_control", {}); } catch (e) {}
}
```

### 2. Listen for takeover / resume notices

In `setupListeners()` (next to the other `this.room.onMessage(...)` handlers):

```js
this.room.onMessage("bot_takeover", (m) => {
    this.onBotTakeover?.(m);   // game.js: show “{name} left — bot is playing”
});
this.room.onMessage("bot_resume", (m) => {
    this.onBotResume?.(m);     // game.js: show “{name} is back — bot left”
});
```

The `"msg"` broadcasts already carry localized fallback text, so existing toast
handling shows a notice even before custom UI is added.

### 3. UI (game.js / render layer)

- Show a 🤖 badge over a seat where `player.controller === "bot"`.
- When the local user's own seat is bot-controlled, show a **«Return control»**
  button that calls `network.sendResumeControl()`.
- On `bot_takeover` / `bot_resume`, show a short system toast.

---

## Test plan (staging, flag ON)

1. Idle 30s on your turn → bot takes over, opponent sees the notice, bot plays.
2. Kill Wi-Fi mid-turn → same takeover path (reason `disconnect`).
3. Close the tab → takeover (reason `disconnect`; there is no `beforeunload`).
4. Reconnect → bot leaves, you resume, opponent sees “back” notice.
5. Press «Return control» while online → resume works after `minBotControlMs`.
6. Press the explicit **Leave** button → still an instant forfeit (no bot).
7. Both players leave → match ends by points, no bot-vs-bot grind.
8. Trigger >`maxTakeoversPerMatch` takeovers → falls back to forfeit.

## Config (env)

| Var | Default | Meaning |
|-----|---------|---------|
| `DOMINO_BOT_TAKEOVER` | `0` | Master switch (`1` to enable). |
| `DOMINO_BOT_TAKEOVER_DELAY_MS` | `30000` | Absence → takeover delay. |
| `DOMINO_BOT_MIN_CONTROL_MS` | `3000` | Min bot hold before reclaim (anti-flap). |
| `DOMINO_BOT_MAX_TAKEOVERS` | `8` | Max takeovers per user per match. |
| `DOMINO_BOT_TAKEOVER_DIFFICULTY` | `medium` | Substitute bot strength. |
