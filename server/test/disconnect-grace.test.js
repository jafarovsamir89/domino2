const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const DominoRoom = require("../DominoRoom");

let cachedNetworkManagerClass = null;

function loadNetworkManager() {
    if (!cachedNetworkManagerClass) {
        const networkModulePath = path.resolve(__dirname, "../../js/network.js");
        delete require.cache[require.resolve(networkModulePath)];
        require(networkModulePath);
        cachedNetworkManagerClass = global.window.NetworkManager;
    }
    global.window.NetworkManager = cachedNetworkManagerClass;
    return cachedNetworkManagerClass;
}

function createActiveRoom() {
    const room = Object.create(DominoRoom.prototype);
    room.state = {
        gameActive: true,
        matchOver: false,
        currentPlayerIndex: 0,
        isTeamMode: false,
        playerOrder: ["session-1"],
        players: new Map([["session-1", { name: "Alice", isConnected: true, isBot: false }]]),
        turnDeadlineAt: 0,
        turnDurationMs: 45000,
        serverNow: Date.now()
    };
    room.identityBySessionId = new Map();
    room.pendingDisconnects = new Map();
    room.pendingDisconnectTimers = new Map();
    room.explicitLeaveSessionIds = new Set();
    room.clients = [{ sessionId: "session-1", send() {} }];
    room.turnTimeoutMs = 45000;
    room.turnTimer = null;
    room.lastReconnectGraceExpiredAt = 0;
    room.lastReconnectTimeoutFinalizedAt = 0;
    room.broadcastRoomState = () => {};
    room.broadcast = () => {};
    room.clearTurnTimer = DominoRoom.prototype.clearTurnTimer.bind(room);
    room.clearNextDealTimer = () => {};
    room.syncState = () => {};
    return room;
}

test("accidental disconnect during an active game uses reconnect grace and keeps the match alive", async () => {
    const room = createActiveRoom();
    let reconnectCalls = 0;
    room.allowReconnection = async () => {
        reconnectCalls += 1;
        return {};
    };
    room.settleForfeitStake = async () => {
        throw new Error("should not forfeit during reconnect grace");
    };
    room.recordForfeitMatchResult = async () => {
        throw new Error("should not record a forfeit during reconnect grace");
    };
    room.resumeTurnTimerAfterReconnect = () => false;
    room.sendReconnectRestoreState = () => true;
    const messages = [];
    room.broadcast = (event, payload) => {
        messages.push({ event, payload });
    };

    await room.onLeave({ sessionId: "session-1" }, false);
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(reconnectCalls, 1);
    assert.equal(room.state.players.get("session-1").isConnected, true);
    assert.equal(room.state.gameActive, true);
    assert.equal(room.state.matchOver, false);
    assert.equal(room.lastLeaveConsentedValue, false);
    assert.equal(room.lastLeaveHadExplicitMarker, false);
    assert.equal(room.lastLeaveTreatedAsExplicit, false);
    assert.ok(room.lastDisconnectGraceStartedAt > 0);
    assert.equal(room.lastReconnectSuccessAt > 0, true);
    assert.equal(room.lastGameEndWasExplicitLeave, false);
    assert.equal(room.lastGameEndWasGraceExpired, false);
    assert.ok(messages.some((item) => item.event === "msg" && item.payload?.key === "connection-reconnecting"));
    assert.ok(messages.some((item) => item.event === "msg" && item.payload?.key === "msg-player-reconnected"));
    assert.equal(messages.some((item) => item.event === "msg" && item.payload?.key === "game-over-disconnect"), false);
});

test("explicit leave marker for an active game ends the match immediately", async () => {
    const room = createActiveRoom();
    room.explicitLeaveSessionIds = new Set(["session-1"]);
    let reconnectCalls = 0;
    room.allowReconnection = async () => {
        reconnectCalls += 1;
        return {};
    };
    let forfeitCount = 0;
    room.settleForfeitStake = async () => ({ ok: true });
    room.recordForfeitMatchResult = async () => {
        forfeitCount += 1;
        return true;
    };
    const messages = [];
    room.broadcast = (event, payload) => {
        messages.push({ event, payload });
    };

    await room.onLeave({ sessionId: "session-1" }, true);

    assert.equal(reconnectCalls, 0);
    assert.equal(forfeitCount, 1);
    assert.equal(room.state.gameActive, false);
    assert.equal(room.state.matchOver, true);
    assert.equal(room.state.gameOverReason, "disconnect");
    assert.equal(room.lastLeaveConsentedValue, true);
    assert.equal(room.lastLeaveHadExplicitMarker, true);
    assert.equal(room.lastLeaveTreatedAsExplicit, true);
    assert.equal(room.lastGameEndWasExplicitLeave, true);
    assert.equal(room.lastGameEndWasGraceExpired, false);
    assert.equal(room.lastForfeitReason, "explicit_leave");
    assert.ok(messages.some((item) => item.event === "msg" && item.payload?.key === "game-over-disconnect"));
    assert.equal(messages.some((item) => item.event === "msg" && item.payload?.key === "connection-reconnecting"), false);
});

test("grace timeout triggers a disconnect forfeit", async () => {
    const room = createActiveRoom();
    room.allowReconnection = () => new Promise(() => {});
    let forfeitCount = 0;
    room.settleForfeitStake = async () => ({ ok: true });
    room.recordForfeitMatchResult = async () => {
        forfeitCount += 1;
        return true;
    };
    const messages = [];
    room.broadcast = (event, payload) => {
        messages.push({ event, payload });
    };

    await room.onLeave({ sessionId: "session-1" }, false);

    assert.equal(forfeitCount, 0);
    assert.equal(room.state.gameActive, true);
    assert.equal(room.state.matchOver, false);
    assert.ok(room.lastDisconnectGraceStartedAt > 0);
    assert.equal(room.lastReconnectGraceExpiredAt, 0);

    await room.finalizeReconnectTimeout("session-1");

    assert.equal(forfeitCount, 1);
    assert.equal(room.state.gameActive, false);
    assert.equal(room.state.matchOver, true);
    assert.ok(room.lastDisconnectGraceStartedAt > 0);
    assert.ok(room.lastReconnectGraceExpiredAt > 0);
    assert.equal(room.lastGameEndWasExplicitLeave, false);
    assert.equal(room.lastGameEndWasGraceExpired, true);
    assert.equal(room.lastForfeitReason, "reconnect_timeout");
    assert.ok(messages.some((item) => item.event === "msg" && item.payload?.key === "game-over-disconnect"));
});

test("NetworkManager explicit leave sends the marker before room.leave", async () => {
    const originalWindow = global.window;
    global.window = {
        addEventListener() {},
        localStorage: {
            getItem() { return null; },
            setItem() {},
            removeItem() {}
        }
    };

    try {
        const NetworkManager = loadNetworkManager();
        const calls = [];
        const game = {
            gameActive: true,
            account: {},
            accountProfile: {},
            getOnlineDisplayName: () => "Alice"
        };
        const network = new NetworkManager(game);
        network.clearReconnectTimer = () => {};
        network.clearReconnectState = () => {};
        network.room = {
            state: { gameActive: true },
            send(event, payload) {
                calls.push({ type: "send", event, payload });
            },
            leave(consented) {
                calls.push({ type: "leave", consented });
            }
        };

        network.leaveRoom({ explicit: true, reason: "menu" });

        assert.equal(calls[0].type, "send");
        assert.equal(calls[0].event, "explicit_leave");
        assert.equal(calls[1].type, "leave");
        assert.equal(calls[1].consented, true);
        assert.equal(network.lastNetworkLeaveRoomExplicit, true);
        assert.ok(network.lastExplicitLeaveSentAt > 0);
        const debug = network.getDisconnectDebugState();
        assert.equal(debug.lastNetworkLeaveRoomExplicit, true);
        assert.ok(debug.lastExplicitLeaveSentAt > 0);
    } finally {
        global.window = originalWindow;
    }
});

test("non-explicit leave does not send the explicit leave marker", async () => {
    const originalWindow = global.window;
    global.window = {
        addEventListener() {},
        localStorage: {
            getItem() { return null; },
            setItem() {},
            removeItem() {}
        }
    };

    try {
        const NetworkManager = loadNetworkManager();
        const calls = [];
        const game = {
            gameActive: true,
            account: {},
            accountProfile: {},
            getOnlineDisplayName: () => "Alice"
        };
        const network = new NetworkManager(game);
        network.clearReconnectTimer = () => {};
        network.clearReconnectState = () => {};
        network.room = {
            state: { gameActive: true },
            send(event, payload) {
                calls.push({ type: "send", event, payload });
            },
            leave(consented) {
                calls.push({ type: "leave", consented });
            }
        };

        network.leaveRoom({ explicit: false, reason: "room_closed" });

        assert.equal(calls.length, 1);
        assert.equal(calls[0].type, "leave");
        assert.equal(calls[0].consented, false);
        assert.equal(network.lastNetworkLeaveRoomExplicit, false);
        assert.equal(network.lastExplicitLeaveSentAt, 0);
        const debug = network.getDisconnectDebugState();
        assert.equal(debug.lastNetworkLeaveRoomExplicit, false);
        assert.equal(debug.lastExplicitLeaveSentAt, 0);
    } finally {
        global.window = originalWindow;
    }
});

test("beforeunload and visibility handlers do not send explicit leave", () => {
    const source = fs.readFileSync(path.resolve(__dirname, "../../js/app.js"), "utf8");
    const beforeUnloadIndex = source.indexOf("window.addEventListener('beforeunload'");
    assert.ok(beforeUnloadIndex >= 0);
    const beforeUnloadSnippet = source.slice(beforeUnloadIndex, beforeUnloadIndex + 140);
    assert.ok(beforeUnloadSnippet.includes("this.destroy()"));
    assert.equal(beforeUnloadSnippet.includes("leaveRoom"), false);
    const visibilityIndex = source.indexOf("visibilitychange");
    assert.ok(visibilityIndex >= 0);
    const visibilitySnippet = source.slice(visibilityIndex, visibilityIndex + 180);
    assert.equal(visibilitySnippet.includes("leaveRoom"), false);
    assert.equal(source.includes("pagehide"), false);
    assert.ok(source.includes("leaveRoom({ explicit: false, reason: 'room_closed' })"));
    assert.ok(source.includes("leaveRoom({ explicit: true, reason: 'menu' })"));
});

test("current-player reconnect grace pauses the turn timer and restores full state on reconnect", () => {
    const room = createActiveRoom();
    const events = [];
    const expiresAt = Date.now() + 120000;
    room.pendingDisconnects.set("session-1", {
        sessionId: "session-1",
        playerName: "Alice",
        startedAt: Date.now(),
        expiresAt,
        leavingIndex: 0,
        isTeamMode: false,
        reason: "accidental_disconnect"
    });
    room.broadcastRoomState = () => events.push(["room_state"]);
    room.sendFullState = (client) => events.push(["full_state", client.sessionId]);
    room.sendHandToClient = (client) => events.push(["hand", client.sessionId]);
    room.sendTurnInfoToPlayerIndex = (index) => events.push(["turn_info", index]);
    room.syncState = () => events.push(["syncState"]);

    DominoRoom.prototype.scheduleTurnTimer.call(room);

    assert.equal(room.state.turnDeadlineAt, expiresAt);
    assert.equal(room.lastTurnTimerPausedSessionId, "session-1");
    assert.equal(events.some(([kind]) => kind === "room_state"), true);

    room.scheduleTurnTimer = () => events.push(["scheduleTurnTimer"]);
    const resumed = room.completeReconnectGrace("session-1", "session-1", { source: "join" });

    assert.equal(resumed, true);
    assert.equal(room.state.players.get("session-1").isConnected, true);
    assert.equal(room.lastReconnectRestoredWasCurrentPlayer, true);
    assert.equal(room.lastReconnectFullStateSessionId, "session-1");
    assert.equal(room.lastReconnectFullStateSource, "join");
    assert.ok(room.lastTurnTimerResumedAfterReconnectAt > 0);
    assert.ok(events.some(([kind, sessionId]) => kind === "full_state" && sessionId === "session-1"));
    assert.ok(events.some(([kind, sessionId]) => kind === "hand" && sessionId === "session-1"));
    assert.ok(events.some(([kind]) => kind === "turn_info"));
    assert.ok(events.some(([kind]) => kind === "scheduleTurnTimer"));
});

test("handleTurnTimeout ignores a reconnect-hold current player", () => {
    const room = createActiveRoom();
    let ended = 0;
    room.state.players.set("session-1", { name: "Alice", isConnected: false, isBot: false });
    room.pendingDisconnects.set("session-1", {
        sessionId: "session-1",
        playerName: "Alice",
        startedAt: Date.now(),
        expiresAt: Date.now() + 120000,
        leavingIndex: 0,
        isTeamMode: false,
        reason: "accidental_disconnect"
    });
    room.endRound = () => { ended += 1; };

    room.handleTurnTimeout();

    assert.equal(ended, 0);
});

test("client reconnect restore clears stale turn state and requests sync", () => {
    const source = fs.readFileSync(path.resolve(__dirname, "../../js/app.js"), "utf8");
    assert.ok(source.includes("resetReconnectRestoreUiState()"));
    assert.ok(source.includes("this.resetReconnectRestoreUiState();"));
    assert.ok(source.includes("this.network?.sendSyncRequest?.();"));
    assert.ok(source.includes("onNetworkFullState(payload = {}) {"));
    assert.ok(source.includes("this.resetReconnectRestoreUiState();"));
    assert.ok(source.includes("this.renderState();"));
    assert.ok(source.includes("this.postMoveWindowActive = false;"));
    assert.ok(source.includes("this.selectedTileIndex = -1;"));
    assert.ok(source.includes("this.renderer?.removeArrows?.();"));
});
