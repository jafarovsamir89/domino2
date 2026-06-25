const test = require("node:test");
const assert = require("node:assert/strict");

const DominoRoom = require("../DominoRoom");
const {
    buildSchemaStateSnapshotData,
    normalizeRestoredPlayerOrder,
    buildRestoredPlayerRows,
    buildRestoredSchemaStateData
} = require("../schemaStateSnapshot");

test("buildSchemaStateSnapshotData returns the expected snapshot shape", () => {
    const state = {
        playerOrder: ["session-1", "session-2"],
        players: new Map([
            ["session-1", {
                name: "Alice",
                userId: "u1",
                avatarUrl: "a.png",
                score: 10,
                roundWins: 2,
                handCount: 3,
                isConnected: true,
                isBot: false,
                seatIndex: 0,
                controller: "human",
                takeoverActive: false,
                takeoverReason: "",
                takeoverSince: 0
            }],
            ["session-2", {
                name: "Bot",
                userId: "",
                avatarUrl: "",
                score: 0,
                roundWins: 0,
                handCount: 0,
                isConnected: false,
                isBot: true,
                seatIndex: 2,
                controller: "bot",
                takeoverActive: true,
                takeoverReason: "disconnect",
                takeoverSince: 1234
            }]
        ]),
        currentPlayerIndex: 1,
        boneyardCount: 4,
        gameActive: true,
        matchRound: 3,
        deal: 2,
        gameMode: "telefon",
        matchStateJson: "{\"mode\":\"classic101\",\"carryPoints\":5,\"sides\":[]}",
        boardJson: "{\"nodes\":[]}",
        isTeamMode: false,
        playerCount: 2,
        turnDeadlineAt: 123,
        turnVersion: 8,
        teamScores: [12, 6],
        teamRoundWins: [1, 0]
    };
    const stateClone = structuredClone({
        ...state,
        playerOrder: [...state.playerOrder],
        players: Array.from(state.players.entries()),
        roomMode: "ffa",
        scoreMode: "solo"
    });

    const snapshot = buildSchemaStateSnapshotData({ state });

    assert.deepEqual(snapshot.playerOrder, ["session-1", "session-2"]);
    assert.deepEqual(snapshot.players, [
        {
            sessionId: "session-1",
            name: "Alice",
            userId: "u1",
            avatarUrl: "a.png",
            score: 10,
            roundWins: 2,
            handCount: 3,
            isConnected: true,
            isBot: false,
            seatIndex: 0,
            controller: "human",
            takeoverActive: false,
            takeoverReason: "",
            takeoverSince: 0
        },
        {
            sessionId: "session-2",
            name: "Bot",
            userId: "",
            avatarUrl: "",
            score: 0,
            roundWins: 0,
            handCount: 0,
            isConnected: false,
            isBot: true,
            seatIndex: 2,
            controller: "bot",
            takeoverActive: true,
            takeoverReason: "disconnect",
            takeoverSince: 1234
        }
    ]);
    assert.equal(snapshot.currentPlayerIndex, 1);
    assert.equal(snapshot.boneyardCount, 4);
    assert.equal(snapshot.gameActive, true);
    assert.equal(snapshot.matchRound, 3);
    assert.equal(snapshot.deal, 2);
    assert.equal(snapshot.gameMode, "telefon");
    assert.equal(snapshot.matchStateJson, "{\"mode\":\"classic101\",\"carryPoints\":5,\"sides\":[]}");
    assert.equal(snapshot.boardJson, "{\"nodes\":[]}");
    assert.equal(snapshot.isTeamMode, false);
    assert.equal(snapshot.roomMode, "ffa");
    assert.equal(snapshot.scoreMode, "solo");
    assert.equal(snapshot.playerCount, 2);
    assert.equal(snapshot.turnDeadlineAt, 123);
    assert.equal(snapshot.turnVersion, 8);
    assert.deepEqual(snapshot.teamScores, [12, 6]);
    assert.deepEqual(snapshot.teamRoundWins, [1, 0]);
    assert.deepEqual({
        playerOrder: state.playerOrder,
        currentPlayerIndex: state.currentPlayerIndex,
        boneyardCount: state.boneyardCount,
        gameActive: state.gameActive,
        matchRound: state.matchRound,
        deal: state.deal,
        gameMode: "telefon",
        matchStateJson: state.matchStateJson,
        boardJson: state.boardJson,
        isTeamMode: state.isTeamMode,
        roomMode: "ffa",
        scoreMode: "solo",
        playerCount: state.playerCount,
        turnDeadlineAt: state.turnDeadlineAt,
        turnVersion: state.turnVersion,
        teamScores: state.teamScores,
        teamRoundWins: state.teamRoundWins,
        roomMode: snapshot.roomMode,
        scoreMode: snapshot.scoreMode,
        players: Array.from(state.players.entries())
    }, stateClone);
});

test("buildSchemaStateSnapshotData keeps fallback values for missing players", () => {
    const state = {
        playerOrder: ["session-1", "missing"],
        players: new Map([
            ["session-1", {
                name: "Alice",
                userId: "u1",
                avatarUrl: "",
                score: 1,
                roundWins: 0,
                handCount: 1,
                isConnected: false,
                isBot: false,
                seatIndex: -1,
                controller: "human",
                takeoverActive: false,
                takeoverReason: "",
                takeoverSince: 0
            }]
        ]),
        teamScores: [],
        teamRoundWins: []
    };

    const snapshot = buildSchemaStateSnapshotData({ state });

    assert.deepEqual(snapshot.players, [
        {
            sessionId: "session-1",
            name: "Alice",
            userId: "u1",
            avatarUrl: "",
            score: 1,
            roundWins: 0,
            handCount: 1,
            isConnected: false,
            isBot: false,
            seatIndex: -1,
            controller: "human",
            takeoverActive: false,
            takeoverReason: "",
            takeoverSince: 0
        },
        {
            sessionId: "missing",
            name: "Player",
            userId: "",
            avatarUrl: "",
            score: 0,
            roundWins: 0,
            handCount: 0,
            isConnected: false,
            isBot: false,
            seatIndex: -1,
            controller: "human",
            takeoverActive: false,
            takeoverReason: "",
            takeoverSince: 0
        }
    ]);
});

test("normalizeRestoredPlayerOrder prefers snapshot order and falls back to player row session ids", () => {
    assert.deepEqual(
        normalizeRestoredPlayerOrder({
            snapshot: { playerOrder: ["session-2", "session-1"] },
            playerRows: [{ sessionId: "session-1" }]
        }),
        ["session-2", "session-1"]
    );

    assert.deepEqual(
        normalizeRestoredPlayerOrder({
            snapshot: {},
            playerRows: [{ sessionId: "session-1" }, { sessionId: "session-2" }, { sessionId: "" }]
        }),
        ["session-1", "session-2"]
    );
});

test("buildRestoredPlayerRows sanitizes names and normalizes raw values", () => {
    const playerRows = [
        {
            sessionId: "session-1",
            name: " <b>Alice</b> ",
            userId: 123,
            score: "7",
            roundWins: "2",
            handCount: "3",
            avatarUrl: " https://example.com/a.png ",
            isBot: false,
            seatIndex: "2",
            controller: "bot",
            takeoverActive: true,
            takeoverReason: "idle",
            takeoverSince: "321"
        },
        {
            sessionId: "session-2",
            name: "Bot",
            userId: "",
            score: null,
            roundWins: undefined,
            handCount: undefined,
            avatarUrl: "",
            isBot: true,
            seatIndex: 0,
            controller: "human",
            takeoverActive: false,
            takeoverReason: "",
            takeoverSince: 0
        }
    ];
    const playerRowsClone = structuredClone(playerRows);

    const restored = buildRestoredPlayerRows({
        playerRows,
        sanitizeName: DominoRoom.sanitizeName
    });

    assert.deepEqual(restored, [
        {
            sessionId: "session-1",
            name: "Alice",
            userId: "123",
            score: 7,
            roundWins: 2,
            handCount: 3,
            avatarUrl: "https://example.com/a.png",
            isBot: false,
            isConnected: true,
            seatIndex: 2,
            controller: "bot",
            takeoverActive: true,
            takeoverReason: "idle",
            takeoverSince: 321
        },
        {
            sessionId: "session-2",
            name: "Bot",
            userId: "",
            score: 0,
            roundWins: 0,
            handCount: 0,
            avatarUrl: "",
            isBot: true,
            isConnected: true,
            seatIndex: 0,
            controller: "human",
            takeoverActive: false,
            takeoverReason: "",
            takeoverSince: 0
        }
    ]);
    assert.deepEqual(playerRows, playerRowsClone);
});

test("buildRestoredSchemaStateData applies current fallbacks and does not mutate inputs", () => {
    const snapshot = {
        playerOrder: ["session-2"],
        players: [
            {
                sessionId: "session-2",
                name: " <b>Bob</b> ",
                userId: "u2",
                score: "4",
                roundWins: "1",
                handCount: "2",
                avatarUrl: " https://example.com/b.png ",
                isBot: true,
                seatIndex: "1"
            }
        ],
        currentPlayerIndex: "2",
        boneyardCount: "5",
        gameActive: 1,
        matchRound: "3",
        deal: "4",
        gameMode: "classic101",
        matchStateJson: "{\"mode\":\"classic101\",\"carryPoints\":9,\"sides\":[{\"scored\":9,\"pending\":0,\"enteredBoard\":true,\"missStreak\":0}]}",
        boardJson: "{\"nodes\":[{\"id\":\"n1\"}]}",
        isTeamMode: 0,
        playerCount: "4",
        turnDeadlineAt: "123",
        turnVersion: "9",
        teamScores: ["10", "6"],
        teamRoundWins: ["1", "0"]
    };
    const snapshotClone = structuredClone(snapshot);
    const currentState = { turnDeadlineAt: 999 };
    const currentStateClone = structuredClone(currentState);

    const restored = buildRestoredSchemaStateData({
        snapshot,
        currentState,
        totalPlayers: 2,
        sanitizeName: DominoRoom.sanitizeName
    });

    assert.deepEqual(restored.playerOrder, ["session-2"]);
    assert.deepEqual(restored.players, [
        {
            sessionId: "session-2",
            name: "Bob",
            userId: "u2",
            score: 4,
            roundWins: 1,
            handCount: 2,
            avatarUrl: "https://example.com/b.png",
            isBot: true,
            isConnected: true,
            seatIndex: 1,
            controller: "human",
            takeoverActive: false,
            takeoverReason: "",
            takeoverSince: 0
        }
    ]);
    assert.equal(restored.currentPlayerIndex, 2);
    assert.equal(restored.boneyardCount, 5);
    assert.equal(restored.gameActive, true);
    assert.equal(restored.matchRound, 3);
    assert.equal(restored.deal, 4);
    assert.equal(restored.gameMode, "classic101");
    assert.equal(restored.matchStateJson, "{\"mode\":\"classic101\",\"carryPoints\":9,\"sides\":[{\"scored\":9,\"pending\":0,\"enteredBoard\":true,\"missStreak\":0}]}");
    assert.equal(restored.boardJson, "{\"nodes\":[{\"id\":\"n1\"}]}");
    assert.equal(restored.isTeamMode, false);
    assert.equal(restored.roomMode, "ffa");
    assert.equal(restored.scoreMode, "solo");
    assert.equal(restored.playerCount, 4);
    assert.equal(restored.turnDeadlineAt, 123);
    assert.equal(restored.turnVersion, 9);
    assert.deepEqual(restored.teamScores, [10, 6]);
    assert.deepEqual(restored.teamRoundWins, [1, 0]);
    assert.deepEqual(snapshot, snapshotClone);
    assert.deepEqual(currentState, currentStateClone);
});
