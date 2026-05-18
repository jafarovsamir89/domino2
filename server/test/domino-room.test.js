const test = require("node:test");
const assert = require("node:assert/strict");

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

    const snapshot = room.buildCustomStateSnapshot();
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
    assert.equal(restoredRoom.state.turnVersion, 1);
    assert.equal(restoredRoom.state.gameActive, true);

    let plays = 0;
    restoredRoom.turnAdvancePending = false;
    restoredRoom.getPlayerIndex = () => 0;
    restoredRoom.performPlay = () => { plays += 1; };
    restoredRoom.handlePlay({ sessionId: "session-1" }, { tileIndex: 0, openEndIndex: 0, turnVersion: 0 });
    assert.equal(plays, 0);
});
