const test = require("node:test");
const assert = require("node:assert/strict");

const { buildLivePlayerPayload } = require("../roomPresence");

test("buildLivePlayerPayload uses team mode and host fallback correctly", () => {
    const room = {
        roomId: "room-1",
        roomCode: "ABCD",
        roomVisibility: "open",
        state: {
            isTeamMode: true,
            gameActive: true,
            playerOrder: ["session-1", "session-2"]
        },
        currentStakeKey: "stake_500",
        currentDealStakeAmount: 500,
        humanSeats: 2,
        totalPlayers: 4,
        aiCount: 1
    };
    const payload = buildLivePlayerPayload({
        sessionId: "session-1",
        room,
        identity: { provider: "platform", playerId: "player-1", avatarUrl: "https://example.com/a.png", role: "host" },
        player: { userId: "user-1", name: "Alice Doe" },
        hostPlayer: { name: "Host Alice" },
        joinedAt: "2026-05-20T10:00:00.000Z"
    });

    assert.equal(payload.roomMode, "team");
    assert.equal(payload.role, "host");
    assert.equal(payload.hostName, "Host");
    assert.equal(payload.stakeAmount, 500);
    assert.equal(payload.joinedAt, "2026-05-20T10:00:00.000Z");
});

test("buildLivePlayerPayload uses ffa mode and preserves current fallbacks", () => {
    const room = {
        roomId: "room-2",
        roomCode: "WXYZ",
        roomVisibility: "closed",
        state: {
            isTeamMode: false,
            gameActive: false,
            playerOrder: ["session-1", "session-2"]
        },
        currentStakeKey: "stake_200",
        currentDealStakeAmount: 0,
        humanSeats: 3,
        totalPlayers: 4,
        aiCount: 1
    };
    const identity = {};
    const player = { userId: "user-2", name: "Bob Marley" };
    const roomClone = structuredClone(room);
    const identityClone = structuredClone(identity);
    const playerClone = structuredClone(player);

    const payload = buildLivePlayerPayload({
        sessionId: "session-2",
        room,
        identity,
        player,
        hostPlayer: null
    });

    assert.equal(payload.roomMode, "ffa");
    assert.equal(payload.role, "player");
    assert.equal(payload.hostName, "Bob");
    assert.equal(payload.stakeAmount, 0);
    assert.match(payload.joinedAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.deepEqual(room, roomClone);
    assert.deepEqual(identity, identityClone);
    assert.deepEqual(player, playerClone);
});
