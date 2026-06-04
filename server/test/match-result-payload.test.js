const test = require("node:test");
const assert = require("node:assert/strict");

const {
    buildWinnerKey,
    buildMatchTeams,
    buildMatchParticipantRows,
    buildPlatformMatchPayload
} = require("../matchResultPayload");

test("buildWinnerKey keeps ffa and team formats", () => {
    assert.equal(buildWinnerKey({ isTeamMode: false, winnerIndex: 2 }), "player:2");
    assert.equal(buildWinnerKey({ isTeamMode: true, winnerIndex: 3 }), "team:1");
});

test("buildMatchTeams returns empty list for ffa and two team shells for team mode", () => {
    assert.deepEqual(buildMatchTeams({ isTeamMode: false, teamScores: [1, 2], teamRoundWins: [3, 4] }), []);
    assert.deepEqual(buildMatchTeams({ isTeamMode: true, teamScores: [10, 20], teamRoundWins: [1, 2] }), [
        { memberIds: [], score: 10, roundWins: 1 },
        { memberIds: [], score: 20, roundWins: 2 }
    ]);
});

test("buildMatchParticipantRows keeps ffa shape and skips players without userId", () => {
    const players = new Map([
        ["s1", { userId: "u1", name: "Alice", score: 11, roundWins: 1 }],
        ["s2", { name: "Bob", score: 22, roundWins: 2 }],
        ["s3", { userId: "u3", name: "Carol", score: 33, roundWins: 3 }]
    ]);
    const playersClone = new Map(players);

    const rows = buildMatchParticipantRows({
        playerOrder: ["s1", "s2", "s3"],
        players,
        isTeamMode: false,
        teamScores: [0, 0],
        teamRoundWins: [0, 0],
        winnerIndex: 2
    });

    assert.deepEqual(rows, [
        { userId: "u1", name: "Alice", teamIndex: null, winnerKey: "player:0", points: 11, roundWins: 1, result: "loss" },
        { userId: "u3", name: "Carol", teamIndex: null, winnerKey: "player:2", points: 33, roundWins: 3, result: "win" }
    ]);
    assert.deepEqual(players, playersClone);
});

test("buildMatchParticipantRows keeps team shape", () => {
    const players = new Map([
        ["s1", { userId: "u1", name: "Alice", score: 11, roundWins: 1 }],
        ["s2", { userId: "u2", name: "Bob", score: 22, roundWins: 2 }],
        ["s3", { userId: "u3", name: "Carol", score: 33, roundWins: 3 }],
        ["s4", { userId: "u4", name: "Dave", score: 44, roundWins: 4 }]
    ]);

    const rows = buildMatchParticipantRows({
        playerOrder: ["s1", "s2", "s3", "s4"],
        players,
        isTeamMode: true,
        teamScores: [100, 200],
        teamRoundWins: [7, 8],
        winnerIndex: 1
    });

    assert.deepEqual(rows, [
        { userId: "u1", name: "Alice", teamIndex: 0, winnerKey: "team:0", points: 100, roundWins: 7, result: "loss" },
        { userId: "u2", name: "Bob", teamIndex: 1, winnerKey: "team:1", points: 200, roundWins: 8, result: "win" },
        { userId: "u3", name: "Carol", teamIndex: 0, winnerKey: "team:0", points: 100, roundWins: 7, result: "loss" },
        { userId: "u4", name: "Dave", teamIndex: 1, winnerKey: "team:1", points: 200, roundWins: 8, result: "win" }
    ]);
});

test("buildPlatformMatchPayload fills team memberIds and keeps payload shape", () => {
    const players = new Map([
        ["s1", { userId: "u1", name: "Alice", score: 11, roundWins: 1 }],
        ["s2", { userId: "u2", name: "Bob", score: 22, roundWins: 2 }],
        ["s3", { userId: "u3", name: "Carol", score: 33, roundWins: 3 }],
        ["s4", { userId: "u4", name: "Dave", score: 44, roundWins: 4 }]
    ]);
    const playerOrder = ["s1", "s2", "s3", "s4"];
    const playerOrderClone = playerOrder.slice();
    const playersClone = new Map(players);

    const payload = buildPlatformMatchPayload({
        isTeamMode: true,
        roomId: "room-1",
        stakeKey: "stake_200",
        sourceMatchId: "room-1:match:abc123",
        playerOrder,
        players,
        teamScores: [100, 200],
        teamRoundWins: [7, 8],
        winnerIndex: 1
    });

    assert.equal(payload.mode, "team");
    assert.equal(payload.result, "win");
    assert.equal(payload.winnerKey, "team:1");
    assert.equal(payload.sourceMatchId, "room-1:match:abc123");
    assert.deepEqual(payload.teams, [
        { memberIds: ["u1", "u3"], score: 100, roundWins: 7 },
        { memberIds: ["u2", "u4"], score: 200, roundWins: 8 }
    ]);
    assert.equal(payload.participants.length, 4);
    assert.deepEqual(playerOrder, playerOrderClone);
    assert.deepEqual(players, playersClone);
});

test("buildPlatformMatchPayload keeps ffa payload mode and result", () => {
    const players = new Map([
        ["s1", { userId: "u1", name: "Alice", score: 11, roundWins: 1 }],
        ["s2", { userId: "u2", name: "Bob", score: 22, roundWins: 2 }]
    ]);

    const payload = buildPlatformMatchPayload({
        isTeamMode: false,
        roomId: "room-1",
        stakeKey: "stake_200",
        sourceMatchId: "room-1:match:def456",
        playerOrder: ["s1", "s2"],
        players,
        teamScores: [0, 0],
        teamRoundWins: [0, 0],
        winnerIndex: 1
    });

    assert.equal(payload.mode, "ffa");
    assert.equal(payload.result, "win");
    assert.equal(payload.winnerKey, "player:1");
    assert.equal(payload.sourceMatchId, "room-1:match:def456");
    assert.deepEqual(payload.teams, []);
    assert.deepEqual(payload.participants.map((p) => p.result), ["loss", "win"]);
});
