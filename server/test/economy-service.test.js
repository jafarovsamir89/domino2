const test = require("node:test");
const assert = require("node:assert/strict");

process.env.DOMINO_SERVER_SECRET ||= "b7f4c2d9a1e8f6c3b5a7d0e9f1c4b8a6d2e7f9c1";
process.env.BETTER_AUTH_SECRET ||= process.env.DOMINO_SERVER_SECRET;

const { reserveEconomyStakeForRoom } = require("../economyService");

test("reserveEconomyStakeForRoom handles the free stake path", async () => {
    const room = {
        currentStakeKey: "free",
        currentDealStakeAmount: 123,
        currentDealBankAmount: 456,
        economyReservationMade: false
    };

    const result = await reserveEconomyStakeForRoom(room);
    assert.deepEqual(result, { ok: true, reserved: 0, stakeKey: "free", bankAmount: 0 });
    assert.equal(room.currentDealStakeAmount, 0);
    assert.equal(room.currentDealBankAmount, 0);
    assert.equal(room.economyReservationMade, true);
});

test("reserveEconomyStakeForRoom returns missing_platform_identity when there is no platform identity", async () => {
    const room = {
        currentStakeKey: "stake_200",
        state: { playerOrder: [], players: new Map(), isTeamMode: false },
        identityBySessionId: new Map(),
        getPlatformMatchIdentity: () => null
    };

    const result = await reserveEconomyStakeForRoom(room);
    assert.deepEqual(result, { ok: false, reason: "missing_platform_identity" });
});

test("reserveEconomyStakeForRoom blocks unlinked humans and resets stake fields", async () => {
    const broadcasts = [];
    const room = {
        currentStakeKey: "stake_200",
        currentDealStakeAmount: 10,
        currentDealBankAmount: 20,
        state: {
            playerOrder: ["s1"],
            players: new Map([["s1", { name: "Alice" }]]),
            isTeamMode: false
        },
        identityBySessionId: new Map([["s1", { provider: "guest", userId: "u1" }]]),
        getPlatformMatchIdentity: () => ({ authToken: "token" }),
        broadcast: (...args) => broadcasts.push(args)
    };

    const result = await reserveEconomyStakeForRoom(room);
    assert.deepEqual(result, { ok: false, reason: "auth_required" });
    assert.equal(room.currentDealStakeAmount, 0);
    assert.equal(room.currentDealBankAmount, 0);
    assert.deepEqual(broadcasts, [["msg", { key: "room-closed-auth-required", time: 2400 }]]);
});

test("reserveEconomyStakeForRoom returns no-op when there are no participants", async () => {
    const room = {
        currentStakeKey: "stake_200",
        currentDealMatchId: "match-1",
        currentDealStakeKey: "stake_200",
        economyReservationMade: false,
        roomId: "room-1",
        roomCode: "ABCD",
        state: {
            playerOrder: [],
            players: new Map(),
            isTeamMode: false
        },
        identityBySessionId: new Map(),
        getPlatformMatchIdentity: () => ({ authToken: "token" })
    };

    const result = await reserveEconomyStakeForRoom(room);
    assert.deepEqual(result, { ok: true, reserved: 0, stakeKey: "stake_200", bankAmount: 0 });
    assert.equal(room.economyReservationMade, true);
});

test("reserveEconomyStakeForRoom updates room fields on success", async () => {
    const broadcasts = [];
    const room = {
        currentStakeKey: "stake_500",
        currentDealMatchId: "match-1",
        currentDealStakeKey: "stake_200",
        currentDealStakeAmount: 0,
        currentDealBankAmount: 0,
        economyReservationMade: false,
        roomId: "room-1",
        roomCode: "ABCD",
        state: {
            playerOrder: ["s1", "s2"],
            players: new Map([
                ["s1", { name: "Alice", userId: "u1" }],
                ["s2", { name: "Bob", userId: "u2" }]
            ]),
            isTeamMode: false
        },
        identityBySessionId: new Map([
            ["s1", { provider: "platform", userId: "u1", playerId: "p1", displayName: "Alice" }],
            ["s2", { provider: "platform", userId: "u2", playerId: "p2", displayName: "Bob" }]
        ]),
        getPlatformMatchIdentity: () => ({ authToken: "token" }),
        broadcast: (...args) => broadcasts.push(args)
    };

    const fetchCalls = [];
    const originalFetch = global.fetch;
    global.fetch = async (url, init) => {
        fetchCalls.push({ url, init });
        return {
            ok: true,
            status: 200,
            text: async () => "",
            json: async () => ({ ok: true, reserved: 1000 })
        };
    };

    try {
        const result = await reserveEconomyStakeForRoom(room);
        assert.deepEqual(result, {
            ok: true,
            reserved: 1000,
            stakeKey: "stake_500",
            bankAmount: 1000,
            participants: 2
        });
        assert.equal(room.economyReservationMade, true);
        assert.equal(room.currentDealStakeKey, "stake_500");
        assert.equal(room.currentDealStakeAmount, 500);
        assert.equal(room.currentDealBankAmount, 1000);
        assert.deepEqual(broadcasts, [["msg", { key: "msg-bank-reserved", values: { amount: 1000, players: 2 }, time: 2000 }]]);
        assert.equal(fetchCalls.length, 1);
        assert.equal(fetchCalls[0].url, "http://localhost:3001/api/economy/matches/reserve");
        assert.equal(fetchCalls[0].init.method, "POST");
        assert.equal(fetchCalls[0].init.headers["content-type"], "application/json");
    } finally {
        global.fetch = originalFetch;
    }
});

test("reserveEconomyStakeForRoom returns reserve_failed when response is not ok", async () => {
    const room = {
        currentStakeKey: "stake_200",
        currentDealMatchId: "match-1",
        roomId: "room-1",
        roomCode: "ABCD",
        state: {
            playerOrder: ["s1"],
            players: new Map([["s1", { name: "Alice", userId: "u1" }]]),
            isTeamMode: false
        },
        identityBySessionId: new Map([["s1", { provider: "platform", userId: "u1", playerId: "p1", displayName: "Alice" }]]),
        getPlatformMatchIdentity: () => ({ authToken: "token" })
    };

    const originalFetch = global.fetch;
    global.fetch = async () => ({
        ok: false,
        status: 500,
        text: async () => "reserve failed",
        json: async () => ({})
    });

    try {
        const result = await reserveEconomyStakeForRoom(room);
        assert.deepEqual(result, { ok: false, reason: "reserve failed" });
    } finally {
        global.fetch = originalFetch;
    }
});

test("reserveEconomyStakeForRoom returns reserve_failed when body is rejected", async () => {
    const room = {
        currentStakeKey: "stake_200",
        currentDealMatchId: "match-1",
        roomId: "room-1",
        roomCode: "ABCD",
        state: {
            playerOrder: ["s1"],
            players: new Map([["s1", { name: "Alice", userId: "u1" }]]),
            isTeamMode: false
        },
        identityBySessionId: new Map([["s1", { provider: "platform", userId: "u1", playerId: "p1", displayName: "Alice" }]]),
        getPlatformMatchIdentity: () => ({ authToken: "token" })
    };

    const originalFetch = global.fetch;
    global.fetch = async () => ({
        ok: true,
        status: 200,
        text: async () => "",
        json: async () => ({ ok: false, reason: "rejected" })
    });

    try {
        const result = await reserveEconomyStakeForRoom(room);
        assert.deepEqual(result, { ok: false, reason: "rejected" });
    } finally {
        global.fetch = originalFetch;
    }
});

test("reserveEconomyStakeForRoom returns reserve_error on transport failure", async () => {
    const room = {
        currentStakeKey: "stake_200",
        currentDealMatchId: "match-1",
        roomId: "room-1",
        roomCode: "ABCD",
        state: {
            playerOrder: ["s1"],
            players: new Map([["s1", { name: "Alice", userId: "u1" }]]),
            isTeamMode: false
        },
        identityBySessionId: new Map([["s1", { provider: "platform", userId: "u1", playerId: "p1", displayName: "Alice" }]]),
        getPlatformMatchIdentity: () => ({ authToken: "token" })
    };

    const originalFetch = global.fetch;
    global.fetch = async () => {
        throw new Error("boom");
    };

    try {
        const result = await reserveEconomyStakeForRoom(room);
        assert.deepEqual(result, { ok: false, reason: "reserve_error" });
    } finally {
        global.fetch = originalFetch;
    }
});
