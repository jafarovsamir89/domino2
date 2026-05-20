const test = require("node:test");
const assert = require("node:assert/strict");

process.env.DOMINO_SERVER_SECRET ||= "b7f4c2d9a1e8f6c3b5a7d0e9f1c4b8a6d2e7f9c1";
process.env.BETTER_AUTH_SECRET ||= process.env.DOMINO_SERVER_SECRET;

const DominoRoom = require("../DominoRoom");

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
                    isBot: false
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
        assert.equal(room.matchRecorded, true);
        assert.equal(second, false);
        assert.equal(fetchCalls.length, 1);
        assert.equal(fetchCalls[0].body.matchId, "match-forfeit");
        assert.equal(fetchCalls[0].body.result, "loss");
    } finally {
        global.fetch = originalFetch;
    }
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
