const test = require("node:test");
const assert = require("node:assert/strict");

const {
    getSessionIdentities,
    hasUnlinkedHuman,
    buildReserveParticipants,
    buildWinnerUserIds,
    buildForfeitWinnerUserIds
} = require("../economyParticipants");

test("getSessionIdentities builds entries in player order and filters missing identities", () => {
    const players = new Map([
        ["s1", { name: "Alice" }],
        ["s2", { name: "Bob" }],
        ["s3", { name: "Carol" }]
    ]);
    const identityBySessionId = new Map([
        ["s1", { provider: "platform", userId: "u1" }],
        ["s3", { provider: "bot", userId: "u3" }]
    ]);
    const playersClone = new Map(players);
    const identitiesClone = new Map(identityBySessionId);

    const sessionIdentities = getSessionIdentities({
        playerOrder: ["s1", "s2", "s3"],
        players,
        identityBySessionId
    });

    assert.deepEqual(sessionIdentities, [
        { identity: { provider: "platform", userId: "u1" }, player: { name: "Alice" }, index: 0 },
        { identity: { provider: "bot", userId: "u3" }, player: { name: "Carol" }, index: 2 }
    ]);
    assert.deepEqual(players, playersClone);
    assert.deepEqual(identityBySessionId, identitiesClone);
});

test("hasUnlinkedHuman matches the current room guard", () => {
    assert.equal(hasUnlinkedHuman([{ identity: { provider: "platform" } }]), false);
    assert.equal(hasUnlinkedHuman([{ identity: { provider: "bot" } }]), false);
    assert.equal(hasUnlinkedHuman([{ identity: { provider: "guest" } }]), true);
});

test("buildReserveParticipants keeps ffa shape", () => {
    const participants = buildReserveParticipants({
        sessionIdentities: [
            { identity: { provider: "platform", userId: "u1", playerId: "p1" }, player: { name: "Alice" }, index: 0 },
            { identity: { provider: "bot", userId: "u2", playerId: "p2" }, player: { name: "Bot" }, index: 1 }
        ],
        isTeamMode: false
    });

    assert.deepEqual(participants, [
        { playerId: "p1", userId: "u1", displayName: "Alice", teamIndex: null }
    ]);
});

test("buildReserveParticipants keeps team shape", () => {
    const participants = buildReserveParticipants({
        sessionIdentities: [
            { identity: { provider: "platform", userId: "u1", playerId: "p1" }, player: { name: "Alice" }, index: 0 },
            { identity: { provider: "platform", userId: "u2", playerId: "p2" }, player: { name: "Bob" }, index: 1 }
        ],
        isTeamMode: true
    });

    assert.deepEqual(participants, [
        { playerId: "p1", userId: "u1", displayName: "Alice", teamIndex: 0 },
        { playerId: "p2", userId: "u2", displayName: "Bob", teamIndex: 1 }
    ]);
});

test("buildWinnerUserIds keeps ffa winner selection", () => {
    const winnerUserIds = buildWinnerUserIds({
        playerOrder: ["s1", "s2", "s3"],
        identityBySessionId: new Map([
            ["s1", { provider: "platform", userId: "u1" }],
            ["s2", { provider: "guest", userId: "u2" }],
            ["s3", { provider: "platform", userId: "u3" }]
        ]),
        isTeamMode: false,
        winnerIndex: 2
    });

    assert.deepEqual(winnerUserIds, ["u3"]);
});

test("buildWinnerUserIds keeps team winner selection", () => {
    const winnerUserIds = buildWinnerUserIds({
        playerOrder: ["s1", "s2", "s3", "s4"],
        identityBySessionId: new Map([
            ["s1", { provider: "platform", userId: "u1" }],
            ["s2", { provider: "platform", userId: "u2" }],
            ["s3", { provider: "platform", userId: "u3" }],
            ["s4", { provider: "platform", userId: "u4" }]
        ]),
        isTeamMode: true,
        winnerIndex: 1
    });

    assert.deepEqual(winnerUserIds, ["u2", "u4"]);
});

test("buildForfeitWinnerUserIds excludes the leaving player and team", () => {
    const ffa = buildForfeitWinnerUserIds({
        playerOrder: ["s1", "s2", "s3"],
        identityBySessionId: new Map([
            ["s1", { provider: "platform", userId: "u1" }],
            ["s2", { provider: "platform", userId: "u2" }],
            ["s3", { provider: "platform", userId: "u3" }]
        ]),
        isTeamMode: false,
        leavingSessionId: "s2",
        leavingIndex: 1
    });
    assert.deepEqual(ffa, ["u1", "u3"]);

    const team = buildForfeitWinnerUserIds({
        playerOrder: ["s1", "s2", "s3", "s4"],
        identityBySessionId: new Map([
            ["s1", { provider: "platform", userId: "u1" }],
            ["s2", { provider: "platform", userId: "u2" }],
            ["s3", { provider: "platform", userId: "u3" }],
            ["s4", { provider: "platform", userId: "u4" }]
        ]),
        isTeamMode: true,
        leavingSessionId: "s1",
        leavingIndex: 0
    });
    assert.deepEqual(team, ["u2", "u4"]);
});
