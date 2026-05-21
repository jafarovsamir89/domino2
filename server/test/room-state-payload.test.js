const test = require("node:test");
const assert = require("node:assert/strict");

const { buildRoomStatePlayers, buildRoomStatePayload } = require("../roomStatePayload");

test("buildRoomStatePlayers builds rows in player order with current fallbacks", () => {
    const players = new Map([
        ["s1", { name: "Alice", userId: "u1", avatarUrl: "a1", isConnected: true, isBot: false, seatIndex: 0 }],
        ["s2", { name: "Bob", userId: "u2", avatarUrl: "a2", isConnected: false, isBot: true, seatIndex: -1 }],
        ["s3", { name: "Carol", userId: "u3", avatarUrl: "a3", isConnected: true, isBot: false, seatIndex: 2 }]
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
        { sessionId: "s1", index: 0, name: "Alice", userId: "u1", playerId: "p1", avatarUrl: "a1", isConnected: true, isBot: false, seatIndex: 0, seatNumber: 1 },
        { sessionId: "s2", index: 1, name: "Bob", userId: "u2", playerId: "u2", avatarUrl: "a2", isConnected: false, isBot: true, seatIndex: -1, seatNumber: 0 },
        { sessionId: "s3", index: 2, name: "Carol", userId: "u3", playerId: "p3", avatarUrl: "a3", isConnected: true, isBot: false, seatIndex: 2, seatNumber: 3 }
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
        seatNumber: 0
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
            players: new Map([
                ["s1", { name: "Host", isConnected: true, isBot: false, seatIndex: 0 }],
                ["s2", { name: "Guest", isConnected: true, isBot: false, seatIndex: 1 }]
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
        stakeKey: "stake_500",
        stakeAmount: 500,
        bankAmount: 1000,
        currentPlayers: 4,
        humanPlayers: 2,
        humanSeats: 2,
        aiCount: 1,
        totalPlayers: 4,
        isTeamMode: true,
        gameActive: true,
        seatSelectionRequired: false,
        hostName: "Host",
        players
    });
});

test("buildRoomStatePayload uses connected human count when the game is inactive", () => {
    const room = {
        roomId: "room-2",
        roomCode: "EFGH",
        roomVisibility: "closed",
        currentDealStakeKey: "",
        currentStakeKey: "stake_200",
        currentDealStakeAmount: 0,
        currentDealBankAmount: 0,
        state: {
            gameActive: false,
            isTeamMode: false,
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
    assert.equal(payload.stakeKey, "stake_200");
    assert.equal(payload.hostName, "Host");
    assert.equal(payload.seatSelectionRequired, true);
});
