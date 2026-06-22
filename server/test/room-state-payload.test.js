const test = require("node:test");
const assert = require("node:assert/strict");

const { buildRoomStatePlayers, buildRoomStatePayload } = require("../roomStatePayload");

test("buildRoomStatePlayers builds rows in player order with current fallbacks", () => {
    const players = new Map([
        ["s1", { name: "Alice Johnson", userId: "u1", avatarUrl: "a1", isConnected: true, isBot: false, seatIndex: 0 }],
        ["s2", { name: "Bob Marley", userId: "u2", avatarUrl: "a2", isConnected: false, isBot: true, seatIndex: -1 }],
        ["s3", { name: "Carol Smith", userId: "u3", avatarUrl: "a3", isConnected: true, isBot: false, seatIndex: 2 }]
    ]);
    const identities = new Map([
        ["s1", { playerId: "p1", avatarUrl: "ia1" }],
        ["s3", { playerId: "p3", avatarUrl: "ia3" }]
    ]);
    const playersClone = new Map(players);
    const identitiesClone = new Map(identities);

    const rows = buildRoomStatePlayers({
        playerOrder: ["s1", "s2", "s3"],
        players,
        identityBySessionId: identities
    });

    assert.deepEqual(rows, [
        { sessionId: "s1", index: 0, name: "Alice", userId: "u1", playerId: "p1", avatarUrl: "a1", isConnected: true, isBot: false, seatIndex: 0, seatNumber: 1, voiceEnabled: false },
        { sessionId: "s2", index: 1, name: "Bob", userId: "u2", playerId: "u2", avatarUrl: "a2", isConnected: false, isBot: true, seatIndex: -1, seatNumber: 0, voiceEnabled: false },
        { sessionId: "s3", index: 2, name: "Carol", userId: "u3", playerId: "p3", avatarUrl: "a3", isConnected: true, isBot: false, seatIndex: 2, seatNumber: 3, voiceEnabled: false }
    ]);
    assert.deepEqual(players, playersClone);
    assert.deepEqual(identities, identitiesClone);
});

test("buildRoomStatePlayers keeps fallback values for missing players", () => {
    const rows = buildRoomStatePlayers({
        playerOrder: ["s1"],
        players: new Map(),
        identityBySessionId: new Map()
    });

    assert.deepEqual(rows, [{
        sessionId: "s1",
        index: 0,
        name: "Player",
        userId: "",
        playerId: "",
        avatarUrl: "",
        isConnected: false,
        isBot: false,
        seatIndex: -1,
        seatNumber: 0,
        voiceEnabled: false
    }]);
});

test("buildRoomStatePlayers falls back when identity name is undefined-like", () => {
    const rows = buildRoomStatePlayers({
        playerOrder: ["s1"],
        players: new Map([
            ["s1", { name: "undefined undefined", userId: "u1", isConnected: true, isBot: false, seatIndex: 0 }]
        ]),
        identityBySessionId: new Map()
    });

    assert.deepEqual(rows, [{
        sessionId: "s1",
        index: 0,
        name: "Player",
        userId: "u1",
        playerId: "u1",
        avatarUrl: "",
        isConnected: true,
        isBot: false,
        seatIndex: 0,
        seatNumber: 1,
        voiceEnabled: false
    }]);
});

test("buildRoomStatePayload preserves room_state fields and currentPlayers logic", () => {
    const room = {
        roomId: "room-1",
        roomCode: "ABCD",
        roomVisibility: "open",
        currentDealStakeKey: "stake_500",
        currentStakeKey: "stake_200",
        currentDealStakeAmount: 500,
        currentDealBankAmount: 1000,
        state: {
            gameActive: true,
            isTeamMode: true,
            turnDeadlineAt: 1234567890,
            turnDurationMs: 30000,
            serverNow: 1111111111111,
            turnVersion: 7,
            players: new Map([
                ["s1", { name: "Host Alpha", isConnected: true, isBot: false, seatIndex: 0 }],
                ["s2", { name: "Guest Beta", isConnected: true, isBot: false, seatIndex: 1 }]
            ]),
            playerOrder: ["s1", "s2"]
        },
        totalPlayers: 4,
        clients: [{}, {}],
        maxClients: 2,
        aiCount: 1
    };
    const players = [{ sessionId: "s1" }];

    const payload = buildRoomStatePayload({ room, players });
    assert.deepEqual(payload, {
        roomId: "room-1",
        roomCode: "ABCD",
        roomVisibility: "open",
        roomPhase: "playing",
        roomMode: "team",
        scoreMode: "team",
        stakeKey: "stake_500",
        stakeAmount: 500,
        bankAmount: 1000,
        turnDeadlineAt: 1234567890,
        turnDurationMs: 30000,
        serverNow: 1111111111111,
        turnVersion: 7,
        currentPlayers: 4,
        humanPlayers: 2,
        humanSeats: 2,
        aiCount: 1,
        totalPlayers: 4,
        isTeamMode: true,
        gameActive: true,
        matchOver: false,
        gameOverReason: "",
        timeoutForfeitPending: false,
        timeoutLoserIndex: -1,
        timeoutLoserName: "",
        continueExpiresAt: 0,
        seatSelectionRequired: false,
        hostName: "Host",
        players: [
            { sessionId: "s1", index: 0, name: "Host", userId: "", playerId: "", avatarUrl: "", isConnected: true, isBot: false, seatIndex: 0, seatNumber: 1, team: 0, voiceEnabled: false },
            { sessionId: "s2", index: 1, name: "Guest", userId: "", playerId: "", avatarUrl: "", isConnected: true, isBot: false, seatIndex: 1, seatNumber: 2, team: 1, voiceEnabled: false }
        ],
        roomStart: {
            roomMode: "team",
            isTeamMode: true,
            maxPlayers: 4,
            occupiedSeats: 2,
            humanCount: 2,
            botCount: 0,
            readyPlayersCount: 2,
            botsReadyCount: 0,
            pendingInvitesCount: 0,
            joinedInviteCount: 0,
            lastAutoStartCheckAt: 0,
            lastAutoStartBlockedReason: null,
            lastAutoStartTriggeredAt: 0
        },
        teamScores: [0, 0],
        teamRoundWins: [0, 0],
        teams: [
            { index: 0, name: "Team A", score: 0, roundWins: 0, memberSessionIds: ["s1"], memberPlayerIds: [] },
            { index: 1, name: "Team B", score: 0, roundWins: 0, memberSessionIds: ["s2"], memberPlayerIds: [] }
        ]
    });
});

test("buildRoomStatePayload uses connected human count when the game is inactive", () => {
    const room = {
        roomId: "room-2",
        roomCode: "EFGH",
        roomVisibility: "closed",
        roomMode: "ffa",
        currentDealStakeKey: "",
        currentStakeKey: "stake_200",
        currentDealStakeAmount: 0,
        currentDealBankAmount: 0,
        state: {
            gameActive: false,
            isTeamMode: false,
            turnDeadlineAt: 0,
            turnDurationMs: 30000,
            serverNow: 1111111111112,
            turnVersion: 4,
            players: new Map([
                ["s1", { name: "Host", isConnected: true, isBot: false, seatIndex: 0 }],
                ["s2", { name: "Guest", isConnected: true, isBot: false, seatIndex: 1 }],
                ["s3", { name: "Bot", isConnected: false, isBot: true, seatIndex: 2 }]
            ]),
            playerOrder: ["s1", "s2", "s3"]
        },
        totalPlayers: 4,
        clients: [{}, {}, {}],
        maxClients: 3,
        aiCount: 1
    };

    const payload = buildRoomStatePayload({ room, players: [] });
    assert.equal(payload.currentPlayers, 2);
    assert.equal(payload.humanPlayers, 2);
    assert.equal(payload.roomPhase, "lobby");
    assert.equal(payload.stakeKey, "stake_200");
    assert.equal(payload.hostName, "Host");
    assert.equal(payload.seatSelectionRequired, true);
    assert.equal(payload.scoreMode, "solo");
    assert.equal(payload.matchOver, false);
    assert.equal(payload.gameOverReason, "");
    assert.deepEqual(payload.teamScores, []);
    assert.deepEqual(payload.teamRoundWins, []);
    assert.deepEqual(payload.teams, []);
});

test("buildRoomStatePayload exposes timeout forfeit state", () => {
    const room = {
        roomId: "room-3",
        roomCode: "IJKL",
        roomVisibility: "open",
        currentDealStakeKey: "stake_200",
        currentStakeKey: "stake_200",
        currentDealStakeAmount: 200,
        currentDealBankAmount: 800,
        timeoutForfeitPending: {
            loserIndex: 1,
            loserName: "Alice",
            expiresAt: 1234567900
        },
        state: {
            gameActive: false,
            isTeamMode: false,
            turnDeadlineAt: 0,
            turnDurationMs: 30000,
            serverNow: 1111111111113,
            turnVersion: 5,
            matchOver: false,
            players: new Map([
                ["s1", { name: "Host", isConnected: true, isBot: false, seatIndex: 0 }],
                ["s2", { name: "Alice", isConnected: true, isBot: false, seatIndex: 1 }]
            ]),
            playerOrder: ["s1", "s2"]
        },
        totalPlayers: 2,
        clients: [{}, {}],
        maxClients: 2,
        aiCount: 0,
        areAllHumanPlayersSeated: () => true
    };

    const payload = buildRoomStatePayload({ room, players: [] });
    assert.equal(payload.roomPhase, "timeout_result");
    assert.equal(payload.timeoutForfeitPending, true);
    assert.equal(payload.timeoutLoserIndex, 1);
    assert.equal(payload.timeoutLoserName, "Alice");
    assert.equal(payload.continueExpiresAt, 1234567900);
});
