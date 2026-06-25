const test = require("node:test");
const assert = require("node:assert/strict");

process.env.DOMINO_SERVER_SECRET ||= "b7f4c2d9a1e8f6c3b5a7d0e9f1c4b8a6d2e7f9c1";
process.env.BETTER_AUTH_SECRET ||= process.env.DOMINO_SERVER_SECRET;

const DominoRoom = require("../DominoRoom");
const { Board } = require("../board");
const { Tile } = require("../model");

test("generateRoomCode returns compact upper-case codes", () => {
    const codes = new Set();
    for (let i = 0; i < 64; i++) {
        const code = DominoRoom.generateRoomCode();
        assert.match(code, /^[A-HJ-NP-Z2-9]{4}$/);
        codes.add(code);
    }
    assert.ok(codes.size > 1);
});

test("sanitizeName strips unsafe characters and trims length", () => {
    assert.equal(DominoRoom.sanitizeName(" <b>Alice</b>! "), "Alice");
    assert.equal(DominoRoom.sanitizeName("    "), "Player");
});

test("room payloads include server clock metadata and turn timer state", () => {
    const originalNow = Date.now;
    const originalSetTimeout = global.setTimeout;
    const originalClearTimeout = global.clearTimeout;
    const fixedNow = 1700000000000;
    Date.now = () => fixedNow;
    global.setTimeout = (fn, delay) => ({ fn, delay });
    global.clearTimeout = () => {};

    try {
        const room = Object.create(DominoRoom.prototype);
        Object.defineProperty(room, "roomId", { value: "room-1", writable: true, configurable: true });
        room.roomCode = "ABCD";
        room.roomVisibility = "open";
        room.turnTimeoutMs = 45000;
        room.currentStakeKey = "stake_200";
        room.currentDealStakeKey = "stake_200";
        room.currentDealBankAmount = 400;
        room.currentDealStakeAmount = 200;
        room.hands = [[new Tile(6, 6)]];
        room.boneyard = [];
        room.internalBoard = new Board();
        room.state = {
            playerOrder: ["session-1"],
            players: new Map([
                ["session-1", { name: "Alice", userId: "u1", score: 12, roundWins: 1, handCount: 1, isConnected: true, isBot: false, seatIndex: 0 }]
            ]),
            currentPlayerIndex: 0,
            boneyardCount: 0,
            gameActive: true,
            matchRound: 2,
            deal: 3,
            boardJson: "{}",
            isTeamMode: false,
            playerCount: 2,
            turnDeadlineAt: 0,
            turnDurationMs: 0,
            serverNow: 0,
            turnVersion: 5,
            matchOver: false,
            gameOverReason: "",
            gameOverPlayerName: "",
            gameOverWinnerIndex: -1,
            gameOverSummaryJson: "",
            teamScores: [0, 0],
            teamRoundWins: [0, 0]
        };
        room.getPlayerIndex = () => 0;
        room.buildTurnInfoForPlayer = () => ({ validMoves: [], goshaCombo: null });
        room.buildPlayerSyncRows = () => [{ sessionId: "session-1" }];
        room.buildPublicPlayerStats = () => [{ score: 12, roundWins: 1, handCount: 1 }];
        room.clearTurnTimer = () => {};
        room.syncState = () => {};
        room.pendingActionContext = null;

        room.scheduleTurnTimer();

        const full = room.buildFullStatePayloadForClient({ sessionId: "session-1" });
        const delta = room.buildGameDeltaPayload({ action: "draw", actorIndex: 0 });

        assert.equal(room.state.serverNow, fixedNow);
        assert.equal(room.state.turnDurationMs, 45000);
        assert.equal(room.state.turnDeadlineAt, fixedNow + 45000);
        assert.equal(full.turnDurationMs, 45000);
        assert.equal(full.serverNow, fixedNow);
        assert.equal(delta.turnDurationMs, 45000);
        assert.equal(delta.serverNow, fixedNow);
    } finally {
        Date.now = originalNow;
        global.setTimeout = originalSetTimeout;
        global.clearTimeout = originalClearTimeout;
    }
});

test("onCreate treats roomMode team as team mode even when isTeamMode is omitted", async () => {
    const room = Object.create(DominoRoom.prototype);
    Object.defineProperty(room, "roomId", { value: "room-team", writable: true, configurable: true });
    room.loadCustomStateForRestore = async () => null;
    room.setState = (state) => {
        room.state = state;
        room.state.players = new Map();
        room.state.playerOrder = [];
        room.state.teamScores = [];
        room.state.teamRoundWins = [];
    };
    room.onMessage = () => {};
    room.broadcast = () => {};
    room.clearTurnTimer = () => {};
    room.clearNextDealTimer = () => {};
    room.syncState = () => {};

    await room.onCreate({
        roomMode: "2v2",
        playerCount: 4,
        aiCount: 2,
        roomVisibility: "open"
    });

    assert.equal(room.roomMode, "team");
    assert.equal(room.state.isTeamMode, true);
    assert.equal(room.totalPlayers, 4);
    assert.equal(room.humanSeats, 2);
    assert.equal(room.maxClients, 2);
});

test("onCreate normalizes gameMode and selects the matching ruleset", async () => {
    const room = Object.create(DominoRoom.prototype);
    Object.defineProperty(room, "roomId", { value: "room-mode", writable: true, configurable: true });
    room.loadCustomStateForRestore = async () => null;
    room.setState = (state) => {
        room.state = state;
        room.state.players = new Map();
        room.state.playerOrder = [];
        room.state.teamScores = [];
        room.state.teamRoundWins = [];
    };
    room.onMessage = () => {};
    room.broadcast = () => {};
    room.clearTurnTimer = () => {};
    room.clearNextDealTimer = () => {};
    room.syncState = () => {};

    await room.onCreate({
        gameMode: "classic101",
        roomMode: "ffa",
        playerCount: 2,
        aiCount: 0,
        roomVisibility: "open"
    });

    assert.equal(room.gameMode, "classic101");
    assert.equal(room.mode, "classic101");
    assert.equal(room.state.gameMode, "classic101");
    assert.equal(room.state.mode, "classic101");
    assert.equal(room.getActiveRuleset().id, "classic101");
});

test("handleNextDeal only advances for the host during pending transitions", () => {
    const room = Object.create(DominoRoom.prototype);
    let cleared = 0;
    let roundStarted = 0;
    let dealStarted = 0;

    room.state = {
        gameActive: false,
        matchFinished: false,
        playerOrder: ["host-session", "guest-session"]
    };
    room.pendingAdvanceKind = "deal";
    room._lastNextDealAt = 0;
    room.clearNextDealTimer = () => { cleared += 1; };
    room.startRound = async () => { roundStarted += 1; };
    room.startDeal = async () => { dealStarted += 1; };
    room.identityBySessionId = new Map([
        ["host-session", { role: "host" }],
        ["guest-session", { role: "player" }]
    ]);

    room.handleNextDeal({ sessionId: "guest-session" });
    assert.equal(cleared, 0);
    assert.equal(roundStarted, 0);
    assert.equal(dealStarted, 0);

    room.handleNextDeal({ sessionId: "host-session" });
    assert.equal(cleared, 1);
    assert.equal(roundStarted, 0);
    assert.equal(dealStarted, 1);
});

test("custom snapshots strip auth tokens from persisted identities", () => {
    const room = Object.create(DominoRoom.prototype);
    Object.defineProperty(room, "roomId", { value: "room-1", writable: true, configurable: true });
    room.roomCode = "ABCD";
    room.roomVisibility = "open";
    room.humanSeats = 2;
    room.totalPlayers = 2;
    room.aiCount = 0;
    room.dlossThreshold = 255;
    room.instantWinEnabled = true;
    room.aiDifficulty = "medium";
    room.currentStakeKey = "stake_200";
    room.currentDealMatchId = "match-1";
    room.currentDealStakeKey = "stake_200";
    room.currentDealStakeAmount = 200;
    room.currentDealBankAmount = 400;
    room.economyReservationMade = true;
    room.lastReservedMatchRound = 1;
    room.matchRecorded = false;
    room.forfeitSettlementMade = false;
    room.lastRoundEconomySummary = null;
    room.hands = [];
    room.boneyard = [];
    room.internalBoard = { nodes: [] };
    room.lastDealWinner = null;
    room.botIds = [];
    room.playerMissingSuits = [];
    room.identityBySessionId = new Map([
        ["session-1", {
            provider: "platform",
            authToken: "secret-token",
            userId: "u1",
            displayName: "Alice",
            playerId: "p1",
            avatarUrl: "https://example.com/avatar.png",
            role: "host"
        }]
    ]);
    room.buildSchemaStateSnapshot = () => ({ playerOrder: ["session-1"], players: [] });

    const snapshot = room.buildCustomStateSnapshot();
    assert.equal(snapshot.identityBySessionId[0][0], "session-1");
    assert.equal(snapshot.identityBySessionId[0][1].authToken, undefined);
    assert.equal(snapshot.identityBySessionId[0][1].displayName, "Alice");
    assert.equal(snapshot.economyReservationMade, true);
    assert.deepEqual(Object.keys(snapshot.identityBySessionId[0][1]).sort(), [
        "avatarUrl",
        "displayName",
        "playerId",
        "provider",
        "role",
        "userId"
    ]);

    const restoredRoom = Object.create(DominoRoom.prototype);
    restoredRoom.state = { turnDeadlineAt: 0 };
    restoredRoom.identityBySessionId = new Map();
    restoredRoom.restoreSchemaState = () => {};

    restoredRoom.applyCustomStateSnapshot({
        identityBySessionId: [
            ["session-2", {
                provider: "platform",
                authToken: "old-secret",
                userId: "u2",
                displayName: "Bob",
                playerId: "p2",
                avatarUrl: "https://example.com/b.png",
                role: "player"
            }]
        ]
    });

    const restoredIdentity = restoredRoom.identityBySessionId.get("session-2");
    assert.equal(restoredIdentity.authToken, undefined);
    assert.equal(restoredIdentity.userId, "u2");
    assert.equal(restoredIdentity.displayName, "Bob");
});

test("onCreate restores room identity and snapshot state without mutating the source snapshot", async () => {
    const room = Object.create(DominoRoom.prototype);
    Object.defineProperty(room, "roomId", { value: "temp-room", writable: true, configurable: true });

    const sourceSnapshot = {
        roomId: "restored-room",
        roomCode: "REST",
        roomVisibility: "open",
        currentStakeKey: "stake_500",
        currentDealMatchId: "restored-room:round:3",
        currentDealStakeKey: "stake_500",
        currentDealStakeAmount: 150,
        currentDealBankAmount: 300,
        economyReservationMade: true,
        lastReservedMatchRound: 3,
        matchRecorded: true,
        forfeitSettlementMade: true,
        state: {
            playerOrder: ["session-1"],
            players: [
                {
                    sessionId: "session-1",
                    name: "Alice",
                    userId: "u1",
                    avatarUrl: "https://example.com/a.png",
                    score: 12,
                    roundWins: 1,
                    handCount: 2,
                    isConnected: true,
                    isBot: false,
                    seatIndex: 0
                }
            ],
            currentPlayerIndex: 0,
            boneyardCount: 1,
            gameActive: false,
            matchRound: 3,
            deal: 4,
            boardJson: "{\"nodes\":[{\"id\":\"n1\"}]}",
            isTeamMode: false,
            playerCount: 2,
            turnDeadlineAt: 0,
            turnVersion: 4,
            teamScores: [0, 0],
            teamRoundWins: [0, 0]
        },
        hands: [[{ a: 0, b: 1 }]],
        boneyard: [{ a: 2, b: 3 }],
        internalBoard: { nodes: [{ id: "n1" }] },
        identityBySessionId: [
            ["session-1", {
                provider: "platform",
                authToken: "secret-token",
                userId: "u1",
                displayName: "Alice",
                playerId: "p1",
                avatarUrl: "https://example.com/a.png",
                role: "host"
            }]
        ]
    };
    const snapshot = structuredClone(sourceSnapshot);
    const snapshotClone = structuredClone(sourceSnapshot);

    room.loadCustomStateForRestore = async () => snapshot;
    room.setState = (state) => {
        room.state = state;
        room.state.players = new Map();
        room.state.playerOrder = [];
        room.state.teamScores = [];
        room.state.teamRoundWins = [];
    };
    room.onMessage = () => {};
    room.broadcast = () => {};
    room.clearTurnTimer = () => {};
    room.clearNextDealTimer = () => {};
    room.ensureBotPlayers = () => {};
    room.syncState = () => {};

    await room.onCreate({ restoreRoomCode: "REST" });

    assert.equal(room.roomId, "restored-room");
    assert.equal(room.roomCode, "REST");
    assert.equal(room.currentStakeKey, "stake_500");
    assert.equal(room.currentDealMatchId, "restored-room:round:3");
    assert.equal(room.currentDealStakeKey, "stake_500");
    assert.equal(room.currentDealStakeAmount, 150);
    assert.equal(room.currentDealBankAmount, 300);
    assert.equal(room.economyReservationMade, true);
    assert.equal(room.lastReservedMatchRound, 3);
    assert.equal(room.matchRecorded, true);
    assert.equal(room.forfeitSettlementMade, true);
    assert.equal(room.hands.length, 1);
    assert.equal(room.boneyard.length, 1);
    assert.ok(room.internalBoard);
    assert.equal(room.state.playerOrder[0], "session-1");
    assert.equal(room.identityBySessionId.get("session-1").displayName, "Alice");
    assert.equal(room.state.players.get("session-1").seatIndex, 0);
    assert.deepEqual(snapshot, snapshotClone);
});

test("startDeal maps low balance reserve failures to the insufficient-coins room message", async () => {
    const room = Object.create(DominoRoom.prototype);
    Object.defineProperty(room, "roomId", { value: "room-low", writable: true, configurable: true });
    room.totalPlayers = 2;
    room.currentStakeKey = "stake_200";
    room.currentDealStakeKey = "stake_200";
    room.currentDealStakeAmount = 0;
    room.currentDealBankAmount = 0;
    room.lastReservedMatchRound = 0;
    room.lastDealWinner = null;
    room.pendingEconomySettlement = Promise.resolve();
    room.hands = [];
    room.boneyard = [];
    room.board = { getGoshaCombo: () => null };
    room.state = {
        matchRound: 1,
        gameActive: false,
        matchOver: false,
        gameOverReason: "",
        gameOverPlayerName: "",
        gameOverWinnerIndex: -1,
        gameOverSummaryJson: "",
        turnVersion: 1,
        currentPlayerIndex: 0,
        playerOrder: [],
        players: new Map(),
        isTeamMode: false
    };

    let lastMsg = null;
    let lastRoomClosed = null;
    room.clearNextDealTimer = () => {};
    room.clearTurnTimer = () => {};
    room.scheduleTurnTimer = () => {};
    room.broadcast = (event, payload) => {
        if (event === "msg") lastMsg = payload;
        if (event === "room_closed") lastRoomClosed = payload;
    };
    room.broadcastRoomState = () => {};
    room.shouldRedealOpeningHands = () => false;
    room.reserveEconomyStake = async () => ({ ok: false, reason: "Insufficient coins for Alice" });

    await room.startDeal();

    assert.equal(lastMsg?.key, "room-closed-insufficient-coins");
    assert.equal(lastRoomClosed?.reasonKey, "room-closed-insufficient-coins");
});

test("startDeal keeps the reserved bank across deals inside the same round", async () => {
    const room = Object.create(DominoRoom.prototype);
    Object.defineProperty(room, "roomId", { value: "room-bank", writable: true, configurable: true });
    room.totalPlayers = 2;
    room.currentStakeKey = "stake_200";
    room.currentDealStakeKey = "stake_200";
    room.currentDealStakeAmount = 150;
    room.currentDealBankAmount = 300;
    room.lastReservedMatchRound = 1;
    room.lastDealWinner = null;
    room.pendingEconomySettlement = Promise.resolve();
    room.hands = [];
    room.boneyard = [];
    room.board = { getGoshaCombo: () => null };
    room.state = {
        matchRound: 1,
        gameActive: false,
        matchOver: false,
        gameOverReason: "",
        gameOverPlayerName: "",
        gameOverWinnerIndex: -1,
        gameOverSummaryJson: "",
        turnVersion: 1,
        currentPlayerIndex: 0,
        playerOrder: [],
        players: new Map(),
        isTeamMode: false
    };

    let reserveCalls = 0;
    room.clearNextDealTimer = () => {};
    room.clearTurnTimer = () => {};
    room.scheduleTurnTimer = () => {};
    room.broadcast = () => {};
    room.broadcastRoomState = () => {};
    room.shouldRedealOpeningHands = () => false;
    room.reserveEconomyStake = async () => {
        reserveCalls += 1;
        return { ok: true, reserved: 300, stakeKey: "stake_200", bankAmount: 300 };
    };
    room.syncState = () => {};

    await room.startDeal();

    assert.equal(reserveCalls, 0);
    assert.equal(room.currentDealStakeAmount, 150);
    assert.equal(room.currentDealBankAmount, 300);
    assert.equal(room.lastReservedMatchRound, 1);
    assert.equal(room.state.gameActive, true);
});

test("applyCustomStateSnapshot tolerates empty and partial snapshots and keeps fallbacks", () => {
    const room = Object.create(DominoRoom.prototype);
    Object.defineProperty(room, "roomId", { value: "room-partial", writable: true, configurable: true });
    room.roomCode = "BASE";
    room.roomVisibility = "closed";
    room.humanSeats = 2;
    room.totalPlayers = 2;
    room.aiCount = 0;
    room.dlossThreshold = 255;
    room.instantWinEnabled = false;
    room.aiDifficulty = "medium";
    room.currentStakeKey = "stake_200";
    room.currentDealMatchId = "match-base";
    room.currentDealStakeKey = "stake_200";
    room.currentDealStakeAmount = 111;
    room.currentDealBankAmount = 222;
    room.lastReservedMatchRound = 1;
    room.matchRecorded = false;
    room.forfeitSettlementMade = false;
    room.lastRoundEconomySummary = null;
    room.identityBySessionId = new Map();
    room.state = {
        turnDeadlineAt: 0,
        players: new Map(),
        playerOrder: [],
        teamScores: [],
        teamRoundWins: [],
        isTeamMode: false,
        gameActive: false,
        boneyardCount: 0,
        boardJson: "{}"
    };
    room.hands = [];
    room.boneyard = [];
    room.internalBoard = { nodes: [] };
    room.playerMissingSuits = [new Set()];
    room.ensureBotPlayers = () => {};
    room.clearTurnTimer = () => {};

    const emptySnapshot = {};
    assert.doesNotThrow(() => room.applyCustomStateSnapshot(emptySnapshot));
    assert.deepEqual(emptySnapshot, {});
    assert.equal(room.roomCode, "BASE");
    assert.equal(room.currentDealMatchId, "match-base");
    assert.equal(room.currentDealStakeAmount, 111);
    assert.equal(room.economyReservationMade, false);

    const partialSnapshot = {
        roomCode: "PART",
        currentDealStakeAmount: 333,
        hands: [[{ a: 4, b: 5 }]],
        boneyard: [{ a: 1, b: 1 }]
    };
    const partialClone = structuredClone(partialSnapshot);

    assert.doesNotThrow(() => room.applyCustomStateSnapshot(partialSnapshot));
    assert.deepEqual(partialSnapshot, partialClone);
    assert.equal(room.roomCode, "PART");
    assert.equal(room.currentDealStakeAmount, 333);
    assert.equal(room.currentDealMatchId, "match-base");
    assert.equal(room.currentDealBankAmount, 222);
    assert.equal(room.economyReservationMade, false);
    assert.equal(room.hands.length, 1);
    assert.equal(room.boneyard.length, 1);
});

test("forfeit settle replay does not settle the same room twice", async () => {
    const room = Object.create(DominoRoom.prototype);
    const fetchCalls = [];
    const originalFetch = global.fetch;

    Object.defineProperty(room, "roomId", { value: "room-forfeit", writable: true, configurable: true });
    room.currentDealMatchId = "match-forfeit";
    room.currentDealStakeKey = "stake_200";
    room.forfeitSettlementMade = false;
    room.matchRecorded = false;
    room.state = {
        isTeamMode: false,
        playerOrder: ["session-1", "session-2"],
        players: new Map([
            ["session-1", { name: "Alice", userId: "user-a" }],
            ["session-2", { name: "Bob", userId: "user-b" }]
        ])
    };
    room.identityBySessionId = new Map([
        ["session-1", { provider: "platform", authToken: "token-a", userId: "user-a", displayName: "Alice", playerId: "player-a", avatarUrl: "", role: "player" }],
        ["session-2", { provider: "platform", authToken: "token-b", userId: "user-b", displayName: "Bob", playerId: "player-b", avatarUrl: "", role: "player" }]
    ]);
    room.getPlatformMatchIdentity = () => room.identityBySessionId.get("session-1");

    global.fetch = async (_url, init) => {
        fetchCalls.push({
            url: _url,
            body: JSON.parse(init.body)
        });
        return {
            ok: true,
            status: 200,
            text: async () => "",
            json: async () => ({ ok: true, result: "loss" })
        };
    };

    try {
        const first = await room.settleForfeitStake("session-1");
        const second = await room.settleForfeitStake("session-1");

        assert.ok(first);
        assert.equal(room.forfeitSettlementMade, true);
        assert.equal(room.matchRecorded, false);
        assert.equal(second, false);
        assert.equal(fetchCalls.length, 1);
        assert.equal(fetchCalls[0].body.matchId, "match-forfeit");
        assert.equal(fetchCalls[0].body.result, "loss");
    } finally {
        global.fetch = originalFetch;
    }
});

test("onLeave shows a support warning when forfeit settlement fails", async () => {
    const room = Object.create(DominoRoom.prototype);
    const messages = [];
    room.state = {
        gameActive: true,
        matchOver: false,
        isTeamMode: false,
        playerOrder: ["session-1"],
        players: new Map([["session-1", { name: "Alice", isConnected: true }]])
    };
    room.identityBySessionId = new Map();
    room.pendingDisconnects = new Map();
    room.pendingDisconnectTimers = new Map();
    room.allowReconnection = async () => {
        throw new Error("reconnect failed");
    };
    room.settleForfeitStake = async () => false;
    room.broadcastRoomState = () => {};
    room.broadcast = (event, payload) => {
        messages.push({ event, payload });
    };
    room.clearTurnTimer = () => {};
    room.clearNextDealTimer = () => {};
    room.syncState = () => {};

    await room.onLeave({ sessionId: "session-1" }, false);
    await room.finalizeReconnectTimeout("session-1");

    assert.ok(messages.some((item) => item.event === "msg" && item.payload?.key === "forfeit-settlement-failed"));
});

test("onLeave records a forfeit match after successful settlement", async () => {
    const room = Object.create(DominoRoom.prototype);
    let recorded = 0;
    room.state = {
        gameActive: true,
        matchOver: false,
        isTeamMode: false,
        playerOrder: ["session-1", "session-2"],
        players: new Map([
            ["session-1", { name: "Alice", isConnected: true }],
            ["session-2", { name: "Bob", isConnected: true }]
        ])
    };
    room.identityBySessionId = new Map([
        ["session-1", { provider: "platform", authToken: "token-a", userId: "user-a", displayName: "Alice", playerId: "player-a", avatarUrl: "", role: "player" }],
        ["session-2", { provider: "platform", authToken: "token-b", userId: "user-b", displayName: "Bob", playerId: "player-b", avatarUrl: "", role: "player" }]
    ]);
    room.pendingDisconnects = new Map();
    room.pendingDisconnectTimers = new Map();
    room.allowReconnection = async () => {
        throw new Error("reconnect failed");
    };
    room.settleForfeitStake = async () => ({ ok: true });
    room.recordForfeitMatchResult = async () => {
        recorded += 1;
        return true;
    };
    room.broadcastRoomState = () => {};
    room.broadcast = () => {};
    room.clearTurnTimer = () => {};
    room.clearNextDealTimer = () => {};
    room.syncState = () => {};

    await room.onLeave({ sessionId: "session-1" }, false);
    await room.finalizeReconnectTimeout("session-1");

    assert.equal(recorded, 1);
});

test("startGame does not block a fresh match when a stale recording is still pending", async () => {
    const room = Object.create(DominoRoom.prototype);
    let started = 0;
    Object.defineProperty(room, "roomId", {
        value: "room-fresh",
        writable: true,
        configurable: true
    });
    room.roomCode = "FRESH";
    room.state = {
        gameActive: false,
        matchFinished: false,
        isTeamMode: false,
        matchRound: 1,
        deal: 1,
        currentPlayerIndex: 0,
        turnVersion: 1,
        teamScores: [0, 0],
        teamRoundWins: [0, 0],
        players: new Map([
            ["host", { name: "Host", isBot: false, isConnected: true, seatIndex: 0, userId: "user-a", score: 0, roundWins: 0 }],
            ["guest", { name: "Guest", isBot: false, isConnected: true, seatIndex: 1, userId: "user-b", score: 0, roundWins: 0 }]
        ]),
        playerOrder: ["host", "guest"]
    };
    room.humanSeats = 2;
    room.totalPlayers = 2;
    room.aiCount = 0;
    room.pendingMatchRecording = { sourceMatchId: "old-match" };
    room.matchRecordInFlight = true;
    room.matchRecorded = false;
    room.matchFinished = false;
    room.currentStakeKey = "stake_200";
    room.pendingEconomySettlement = Promise.resolve();
    room.clearNextDealTimer = () => {};
    room.clearTurnTimer = () => {};
    room.broadcastRoomState = () => {};
    room.ensureBotPlayers = () => {};
    room.rebuildPlayerOrderBySeats = () => {};
    room.startDeal = async () => {
        started += 1;
    };
    room.countReadyHumanPlayers = () => 2;
    room.countSeatedHumanPlayers = () => 2;

    await room.startGame();

    assert.equal(started, 1);
    assert.equal(room.gameStarting, false);
});

test("turnVersion rejects stale replayed turn actions", () => {
    const room = Object.create(DominoRoom.prototype);
    let plays = 0;
    room.state = {
        gameActive: true,
        currentPlayerIndex: 0,
        turnVersion: 7
    };
    room.turnAdvancePending = false;
    room.getPlayerIndex = () => 0;
    room.performPlay = () => { plays += 1; };

    room.handlePlay({ sessionId: "session-1" }, { tileIndex: 0, openEndIndex: 0, turnVersion: 6 });
    assert.equal(plays, 0);

    room.handlePlay({ sessionId: "session-1" }, { tileIndex: 0, openEndIndex: 0, turnVersion: 7 });
    assert.equal(plays, 1);
});

test("sync requests return both room state and full state to the same client", () => {
    const room = Object.create(DominoRoom.prototype);
    const calls = [];
    room.sendRoomStateToClient = (client) => calls.push(["room_state", client]);
    room.sendFullState = (client) => calls.push(["full_state", client]);

    const client = { sessionId: "session-1" };
    room.handleSyncRequest(client);

    assert.deepEqual(calls, [
        ["room_state", client],
        ["full_state", client]
    ]);
});

test("addScore updates team totals and emits a game delta", () => {
    const room = Object.create(DominoRoom.prototype);
    const deltas = [];
    const broadcasts = [];
    room.state = {
        isTeamMode: true,
        playerOrder: ["host"],
        players: new Map([["host", { name: "Host", score: 0 }]]),
        teamScores: [0, 0]
    };
    room.broadcast = (...args) => broadcasts.push(args);
    room.broadcastGameDelta = (payload) => deltas.push(payload);

    const result = room.addScore(0, 10);

    assert.equal(result, 10);
    assert.equal(room.state.players.get("host").score, 10);
    assert.equal(room.state.teamScores[0], 10);
    assert.deepEqual(deltas, [{ action: "score", actorIndex: 0, scoreDelta: 10, scorePlayerIndex: 0, scoreSource: "table" }]);
    assert.ok(broadcasts.some(([kind]) => kind === "score_popup"));
});

test("performPlay broadcasts the board delta before any score popup and includes score data in the play delta", () => {
    const room = Object.create(DominoRoom.prototype);
    const events = [];
    room.state = {
        gameActive: true,
        currentPlayerIndex: 0,
        turnVersion: 7,
        isTeamMode: false,
        playerOrder: ["session-1"],
        players: new Map([["session-1", { name: "Alice", score: 0, roundWins: 0, handCount: 2 }]])
    };
    room.internalBoard = {
        isEmpty: false,
        openEnds: [{ value: 6 }],
        placeTile: () => 10,
        isBlocked: () => false
    };
    room.hands = [[new Tile(6, 1), new Tile(2, 3)]];
    room.boneyard = [];
    room.playerMissingSuits = [new Set()];
    room.clearTurnTimer = () => {};
    room.clearTurnAdvanceTimer = () => {};
    room.broadcast = (event, payload) => events.push([event, payload]);
    room.saveCustomStateToRedis = () => {};
    room.endRound = () => {};
    room.endDeal = () => {};
    room.findFishWinner = () => 0;
    room.scheduleTurnAdvance = () => {};
    room.bumpTurnVersion = () => {};
    room.getValidMovesForPlayer = () => [{ tileIndex: 0, openEndIndex: 0 }];

    const accepted = room.performPlay(0, 0, 0, false);

    assert.equal(accepted, true);
    assert.equal(room.state.players.get("session-1").score, 10);
    assert.equal(room.state.players.get("session-1").handCount, 1);
    assert.equal(room.hands[0].length, 1);
    assert.deepEqual(events.map(([kind]) => kind).slice(0, 2), ["sound", "game_delta"]);
    assert.equal(events.some(([kind]) => kind === "score_popup"), false);
    const delta = events.find(([kind]) => kind === "game_delta")?.[1];
    assert.deepEqual(
        {
            action: delta?.action,
            actorIndex: delta?.actorIndex,
            boardDelta: delta?.boardDelta,
            scoreDelta: delta?.scoreDelta,
            scorePlayerIndex: delta?.scorePlayerIndex,
            scoreSource: delta?.scoreSource
        },
        {
        action: "play",
        actorIndex: 0,
        boardDelta: {
            kind: "play",
            tile: { a: 6, b: 1, id: "6-1" },
            openEndIndex: 0
        },
        scoreDelta: 10,
        scorePlayerIndex: 0,
        scoreSource: "table"
        }
    );
    assert.equal(delta?.finishInfo, null);
});

test("endDeal sends hand bonus only through deal_end and keeps it out of score popups", () => {
    const originalSndWin = global.sndWin;
    const room = Object.create(DominoRoom.prototype);
    const events = [];
    global.sndWin = () => {};
    room.state = {
        gameActive: true,
        currentPlayerIndex: 0,
        turnVersion: 7,
        isTeamMode: false,
        playerOrder: ["session-1", "session-2"],
        players: new Map([
            ["session-1", { name: "Alice", score: 0, roundWins: 0, handCount: 1 }],
            ["session-2", { name: "Bob", score: 0, roundWins: 0, handCount: 1 }]
        ]),
        teamScores: [0, 0],
        teamRoundWins: [0, 0]
    };
    room.playerNames = ["Alice", "Bob"];
    room.playerCount = 2;
    room.totalPlayers = 2;
    room.deal = 1;
    room.hands = [[new Tile(6, 1)], [new Tile(6, 6)]];
    room.boneyard = [];
    room.lastFinishInfo = {
        actorIndex: 0,
        winnerIndex: 0,
        finishKind: "tile",
        tileCount: 1,
        action: "play",
        fish: false,
        tableScoreDelta: 10,
        handBonus: 0
    };
    room.broadcast = (event, payload) => events.push([event, payload]);
    room.renderer = { renderDealEnd: () => {} };
    room.clients = [];
    room.clearTurnTimer = () => {};
    room.persistGameResumeSnapshot = () => {};
    room.syncLocalPresence = () => {};
    room.syncState = () => {};
    room.scheduleNextDeal = () => {};

    try {
        room.endDeal(0, false);
    } finally {
        global.sndWin = originalSndWin;
    }

    assert.equal(events.some(([kind]) => kind === "score_popup"), false);
    const dealEnd = events.find(([kind]) => kind === "deal_end")?.[1];
    assert.equal(dealEnd?.bonus > 0, true);
    assert.equal(dealEnd?.bonusSource, "hand_bonus");
    assert.equal(dealEnd?.tableScoreDelta, 10);
    assert.equal(dealEnd?.finishInfo?.handBonus, dealEnd?.bonus);
    assert.equal(dealEnd?.finishInfo?.bonusSource, "hand_bonus");
});

test("performDraw broadcasts a draw delta and keeps public hand counts in sync", () => {
    const room = Object.create(DominoRoom.prototype);
    const events = [];
    room.state = {
        gameActive: true,
        currentPlayerIndex: 0,
        turnVersion: 7,
        isTeamMode: false,
        playerOrder: ["session-1", "session-2"],
        players: new Map([
            ["session-1", { name: "Alice", score: 0, roundWins: 0, handCount: 1 }],
            ["session-2", { name: "Bob", score: 0, roundWins: 0, handCount: 2 }]
        ])
    };
    room.internalBoard = {
        canPlayAny: () => false,
        openEnds: [{ value: 6 }],
        isBlocked: () => false
    };
    room.hands = [[new Tile(1, 2)], [new Tile(3, 4)]];
    room.boneyard = [new Tile(6, 6)];
    room.playerMissingSuits = [new Set(), new Set()];
    room.clearTurnTimer = () => {};
    room.broadcast = (event, payload) => events.push([event, payload]);
    room.saveCustomStateToRedis = () => {};
    room.endRound = () => {};
    room.endDeal = () => {};
    room.findFishWinner = () => 0;
    room.scheduleTurnAdvance = () => {};
    room.bumpTurnVersion = () => {};
    room.sendActionAck = () => {};
    room.syncState = () => {};

    const accepted = room.performDraw(0, false, { client: null, actionId: "draw-1" });

    assert.equal(accepted, true);
    assert.equal(room.hands[0].length, 2);
    assert.equal(room.state.players.get("session-1").handCount, 2);
    const delta = events.find(([kind]) => kind === "game_delta")?.[1];
    assert.equal(delta?.action, "draw");
    assert.equal(delta?.actorIndex, 0);
    assert.equal(delta?.playerStats?.[0]?.handCount, 2);
});

test("syncPublicPlayerStatsToState copies live hand lengths into schema players", () => {
    const room = Object.create(DominoRoom.prototype);
    room.state = {
        playerOrder: ["session-1", "session-2"],
        players: new Map([
            ["session-1", { name: "Alice", score: 1, roundWins: 2, handCount: 0 }],
            ["session-2", { name: "Bob", score: 3, roundWins: 4, handCount: 1 }]
        ])
    };
    room.hands = [[new Tile(0, 0), new Tile(1, 1), new Tile(2, 2)], [new Tile(3, 3)]];

    room.syncPublicPlayerStatsToState();

    assert.equal(room.state.players.get("session-1").handCount, 3);
    assert.equal(room.state.players.get("session-2").handCount, 1);
    assert.equal(room.state.players.get("session-1").score, 1);
    assert.equal(room.state.players.get("session-2").roundWins, 4);
});

test("performPlay rejects a tile that does not match the selected open end and keeps the board unchanged", () => {
    const room = Object.create(DominoRoom.prototype);
    let advanced = 0;
    let bumped = 0;
    room.state = {
        gameActive: true,
        currentPlayerIndex: 0,
        turnVersion: 7,
        isTeamMode: false,
        playerOrder: ["session-1"],
        players: new Map([["session-1", { name: "Alice", score: 0, roundWins: 0 }]])
    };
    room.internalBoard = new Board();
    room.internalBoard.placeFirst(new Tile(0, 0));
    room.hands = [[new Tile(1, 3)]];
    room.playerMissingSuits = [new Set()];
    room.clearTurnTimer = () => {};
    room.broadcast = () => {};
    room.addScore = () => {};
    room.endRound = () => {};
    room.endDeal = () => {};
    room.findFishWinner = () => 0;
    room.scheduleTurnAdvance = () => { advanced += 1; };
    room.bumpTurnVersion = () => { bumped += 1; };
    room.getOpeningScoreContext = () => 0;

    room.performPlay(0, 0, 0, false);

    assert.equal(room.hands[0].length, 1);
    assert.equal(room.internalBoard.nodes.length, 1);
    assert.equal(room.state.turnVersion, 7);
    assert.equal(advanced, 0);
    assert.equal(bumped, 0);
});

test("performPlay keeps legal 0/3 placement on open end 0 and turns the new open end to 3", () => {
    const room = Object.create(DominoRoom.prototype);
    room.state = {
        gameActive: true,
        currentPlayerIndex: 0,
        turnVersion: 7,
        isTeamMode: false,
        playerOrder: ["session-1"],
        players: new Map([["session-1", { name: "Alice", score: 0, roundWins: 0 }]])
    };
    room.internalBoard = new Board();
    room.internalBoard.placeFirst(new Tile(0, 0));
    room.hands = [[new Tile(0, 3), new Tile(3, 6)]];
    room.boneyard = [];
    room.playerMissingSuits = [new Set()];
    room.clearTurnTimer = () => {};
    room.broadcast = () => {};
    room.addScore = () => {};
    room.endRound = () => {};
    room.endDeal = () => {};
    room.findFishWinner = () => 0;
    room.scheduleTurnAdvance = () => {};
    room.bumpTurnVersion = () => {};
    room.getOpeningScoreContext = () => 0;

    room.performPlay(0, 0, 0, false);

    assert.equal(room.hands[0].length, 1);
    assert.equal(room.internalBoard.nodes.length, 2);
    assert.equal(room.internalBoard.nodes[1].displayA, 3);
    assert.equal(room.internalBoard.nodes[1].displayB, 0);
    assert.ok(room.internalBoard.openEnds.some((oe) => oe.value === 3));
});

test("opening move requirement forces 3|2 on the first deal and rejects any other opening tile", () => {
    const room = Object.create(DominoRoom.prototype);
    room.state = {
        gameActive: true,
        currentPlayerIndex: 0,
        turnVersion: 7,
        isTeamMode: false,
        playerOrder: ["session-1", "session-2"],
        players: new Map([
            ["session-1", { name: "Alice", score: 0, roundWins: 0, isBot: false }],
            ["session-2", { name: "Bob", score: 0, roundWins: 0, isBot: false }]
        ])
    };
    room.lastDealWinner = null;
    room.internalBoard = new Board();
    room.hands = [
        [new Tile(4, 4), new Tile(3, 2), new Tile(0, 6)],
        [new Tile(1, 1)]
    ];
    room.boneyard = [];
    room.playerMissingSuits = [new Set(), new Set()];
    room.clearTurnTimer = () => {};
    room.broadcast = () => {};
    room.addScore = () => {};
    room.endRound = () => {};
    room.endDeal = () => {};
    room.findFishWinner = () => 0;
    room.scheduleTurnAdvance = () => {};
    room.bumpTurnVersion = () => {};
    room.getOpeningScoreContext = () => 0;

    const opening = room.getOpeningMoveRequirement();
    assert.equal(opening.playerIndex, 0);
    assert.equal(opening.tileIndex, 1);
    assert.equal(opening.tileId, "3-2");

    room.performPlay(0, 0, -1, false);
    assert.equal(room.internalBoard.nodes.length, 0);
    assert.equal(room.hands[0].length, 3);

    room.performPlay(0, 1, -1, false);
    assert.equal(room.internalBoard.nodes.length, 1);
    assert.equal(room.internalBoard.nodes[0].tile.id, "3-2");
    assert.equal(room.hands[0].length, 2);
});

test("opening move requirement falls back to the smallest double when 3|2 is not dealt", () => {
    const room = Object.create(DominoRoom.prototype);
    room.state = {
        gameActive: true,
        currentPlayerIndex: 1,
        turnVersion: 7,
        isTeamMode: false,
        playerOrder: ["session-1", "session-2"],
        players: new Map([
            ["session-1", { name: "Alice", score: 0, roundWins: 0, isBot: false }],
            ["session-2", { name: "Bob", score: 0, roundWins: 0, isBot: false }]
        ])
    };
    room.lastDealWinner = null;
    room.internalBoard = new Board();
    room.hands = [
        [new Tile(4, 4), new Tile(6, 6)],
        [new Tile(1, 1), new Tile(2, 5)]
    ];
    room.boneyard = [];
    room.playerMissingSuits = [new Set(), new Set()];
    room.clearTurnTimer = () => {};
    room.broadcast = () => {};
    room.addScore = () => {};
    room.endRound = () => {};
    room.endDeal = () => {};
    room.findFishWinner = () => 0;
    room.scheduleTurnAdvance = () => {};
    room.bumpTurnVersion = () => {};
    room.getOpeningScoreContext = () => 0;

    const opening = room.getOpeningMoveRequirement();
    assert.equal(opening.playerIndex, 1);
    assert.equal(opening.tileIndex, 0);
    assert.equal(opening.tileId, "1-1");

    room.performPlay(1, 1, -1, false);
    assert.equal(room.internalBoard.nodes.length, 0);
    assert.equal(room.hands[1].length, 2);

    room.performPlay(1, 0, -1, false);
    assert.equal(room.internalBoard.nodes.length, 1);
    assert.equal(room.internalBoard.nodes[0].tile.id, "1-1");
    assert.equal(room.hands[1].length, 1);
});

test("startDeal turn_info sends only the required opening move on an empty board", () => {
    const room = Object.create(DominoRoom.prototype);
    const messages = [];
    const client = {
        sessionId: "session-1",
        send(type, payload) {
            messages.push({ type, payload });
        }
    };
    room.state = {
        gameActive: true,
        currentPlayerIndex: 0,
        turnVersion: 7,
        isTeamMode: false,
        playerOrder: ["session-1", "session-2"],
        players: new Map([
            ["session-1", { name: "Alice", score: 0, roundWins: 0, isBot: false, handCount: 2 }],
            ["session-2", { name: "Bob", score: 0, roundWins: 0, isBot: false, handCount: 2 }]
        ])
    };
    room.clients = [client];
    room.lastDealWinner = null;
    room.internalBoard = new Board();
    room.hands = [
        [new Tile(3, 2), new Tile(4, 4)],
        [new Tile(1, 1), new Tile(2, 5)]
    ];
    room.boneyard = [];
    room.broadcastRoomState = () => {};
    room.scheduleBotTurn = () => {};

    room.syncState();

    const turnInfo = messages.find((entry) => entry.type === "turn_info");
    assert.ok(turnInfo);
    assert.deepEqual(turnInfo.payload.validMoves, [{ tileIndex: 0, openEndIndex: -1 }]);
});

test("runBotTurn uses only the required opening move on the first deal", () => {
    const room = Object.create(DominoRoom.prototype);
    let played = null;
    room.state = {
        gameActive: true,
        currentPlayerIndex: 0,
        turnVersion: 7,
        isTeamMode: false,
        playerOrder: ["bot-0"],
        players: new Map([["bot-0", { name: "Bot", score: 0, roundWins: 0, isBot: true }]])
    };
    room.lastDealWinner = null;
    room.internalBoard = new Board();
    room.hands = [[new Tile(4, 4), new Tile(3, 2)]];
    room.boneyard = [];
    room.playerMissingSuits = [new Set()];
    room.clearTurnTimer = () => {};
    room.broadcast = () => {};
    room.performPlay = (pi, tileIndex, openEndIndex) => {
        played = { pi, tileIndex, openEndIndex };
    };
    room.performDraw = () => false;
    room.performPass = () => false;
    room.scheduleBotTurn = () => {};
    room.getOpeningScoreContext = () => 0;
    room.aiPlayers = new Map([
        ["bot-0", {
            chooseMove(board, hand, moves) {
                assert.deepEqual(moves, [{ tileIndex: 1, openEndIndex: -1 }]);
                return { tileIndex: 1, openEndIndex: -1 };
            }
        }]
    ]);

    room.runBotTurn();

    assert.deepEqual(played, { pi: 0, tileIndex: 1, openEndIndex: -1 });
});

test("after the opening move, valid moves return to normal board behavior", () => {
    const room = Object.create(DominoRoom.prototype);
    room.state = {
        gameActive: true,
        currentPlayerIndex: 0,
        turnVersion: 7,
        isTeamMode: false,
        playerOrder: ["session-1"],
        players: new Map([["session-1", { name: "Alice", score: 0, roundWins: 0, isBot: false }]])
    };
    room.lastDealWinner = 0;
    room.internalBoard = new Board();
    room.internalBoard.placeFirst(new Tile(0, 0));
    room.hands = [[new Tile(0, 3), new Tile(3, 6)]];
    room.playerMissingSuits = [new Set()];

    const moves = room.getValidMovesForPlayer(0);
    assert.deepEqual(moves, [
        { tileIndex: 0, openEndIndex: 0 },
        { tileIndex: 0, openEndIndex: 1 }
    ]);
});

test("startDeal snapshot restore keeps a playable turn state", async () => {
    const room = Object.create(DominoRoom.prototype);
    Object.defineProperty(room, "roomId", { value: "room-live", writable: true, configurable: true });
    room.roomCode = "LIVE";
    room.totalPlayers = 2;
    room.aiCount = 0;
    room.humanSeats = 2;
    room.currentStakeKey = "free";
    room.lastReservedMatchRound = 0;
    room.lastDealWinner = null;
    room.matchRecorded = false;
    room.forfeitSettlementMade = false;
    room.shouldRedealOpeningHands = () => false;
    room.reserveEconomyStake = async () => ({ ok: true });
    room.pendingEconomySettlement = Promise.resolve();
    room.scheduleTurnTimer = () => {};
    room.broadcastRoomState = () => {};
    room.clearNextDealTimer = () => {};
    room.clearTurnTimer = () => {};
    room.state = {
        matchRound: 1,
        gameActive: false,
        currentPlayerIndex: 0,
        turnVersion: 1,
        players: new Map(),
        playerOrder: [],
        teamScores: [],
        teamRoundWins: [],
        isTeamMode: false
    };
    room.hands = [];
    room.boneyard = [];
    room.playerMissingSuits = [new Set(), new Set()];
    room.identityBySessionId = new Map();
    room.internalBoard = {
        isBlocked: () => false,
        getGoshaCombo: () => null
    };
    room.syncState = () => {};
    room.broadcast = () => {};
    room.addScore = () => {};
    room.endRound = () => {};
    room.endDeal = () => {};
    room.findFishWinner = () => 0;
    room.getOpeningScoreContext = () => 0;

    await room.startDeal();
    assert.equal(room.state.turnVersion, 1);
    assert.equal(room.state.gameActive, true);
    assert.equal(room.hands.length, 2);
    room.state.boardJson = JSON.stringify(room.internalBoard);
    room.state.boneyardCount = room.boneyard.length;

    const snapshot = room.buildCustomStateSnapshot();
    assert.equal(snapshot.roomId, "room-live");
    assert.equal(snapshot.roomCode, "LIVE");
    assert.equal(snapshot.currentStakeKey, "free");
    assert.equal(snapshot.currentDealMatchId, "room-live:round:1");
    assert.equal(snapshot.currentDealStakeKey, "free");
    assert.equal(snapshot.currentDealStakeAmount, 0);
    assert.equal(snapshot.currentDealBankAmount, 0);
    assert.equal(snapshot.lastReservedMatchRound, 0);
    assert.equal(snapshot.matchRecorded, false);
    assert.equal(snapshot.forfeitSettlementMade, false);
    assert.ok(Array.isArray(snapshot.hands));
    assert.ok(Array.isArray(snapshot.boneyard));
    assert.ok(snapshot.internalBoard);
    assert.ok(snapshot.state);
    assert.equal(snapshot.state.boardJson, JSON.stringify(room.internalBoard));

    const restoredRoom = Object.create(DominoRoom.prototype);
    Object.defineProperty(restoredRoom, "roomId", { value: "room-live", writable: true, configurable: true });
    restoredRoom.state = {
        turnDeadlineAt: 0,
        players: new Map(),
        playerOrder: [],
        teamScores: [],
        teamRoundWins: []
    };
    restoredRoom.identityBySessionId = new Map();
    restoredRoom.internalBoard = null;
    restoredRoom.hands = null;
    restoredRoom.boneyard = null;
    restoredRoom.playerMissingSuits = null;
    restoredRoom.ensureBotPlayers = () => {};
    restoredRoom.clearTurnTimer = () => {};

    restoredRoom.applyCustomStateSnapshot(snapshot);
    assert.equal(restoredRoom.roomId, "room-live");
    assert.equal(restoredRoom.roomCode, "LIVE");
    assert.equal(restoredRoom.currentStakeKey, "free");
    assert.equal(restoredRoom.currentDealMatchId, "room-live:round:1");
    assert.equal(restoredRoom.currentDealStakeKey, "free");
    assert.equal(restoredRoom.currentDealStakeAmount, 0);
    assert.equal(restoredRoom.currentDealBankAmount, 0);
    assert.equal(restoredRoom.lastReservedMatchRound, 0);
    assert.equal(restoredRoom.matchRecorded, false);
    assert.equal(restoredRoom.forfeitSettlementMade, false);
    assert.equal(restoredRoom.state.turnVersion, 1);
    assert.equal(restoredRoom.state.gameActive, true);
    assert.equal(restoredRoom.hands.length, 2);
    assert.equal(restoredRoom.boneyard.length, room.boneyard.length);
    assert.equal(restoredRoom.state.boardJson, JSON.stringify(restoredRoom.internalBoard));

    let plays = 0;
    restoredRoom.turnAdvancePending = false;
    restoredRoom.getPlayerIndex = () => 0;
    restoredRoom.performPlay = () => { plays += 1; };
    restoredRoom.handlePlay({ sessionId: "session-1" }, { tileIndex: 0, openEndIndex: 0, turnVersion: 0 });
    assert.equal(plays, 0);
});
