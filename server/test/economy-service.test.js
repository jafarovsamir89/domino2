const test = require("node:test");
const assert = require("node:assert/strict");

process.env.DOMINO_SERVER_SECRET ||= "b7f4c2d9a1e8f6c3b5a7d0e9f1c4b8a6d2e7f9c1";
process.env.BETTER_AUTH_SECRET ||= process.env.DOMINO_SERVER_SECRET;

const { normalizePlatformApiUrl } = require("../economyConfig");
const { reserveEconomyStakeForRoom, settleEconomyRoundForRoom, settleForfeitStakeForRoom } = require("../economyService");

const expectedPlatformApiUrl = normalizePlatformApiUrl(process.env.PLATFORM_API_URL);

function createSettleRoom(overrides = {}) {
    return {
        currentStakeKey: "stake_200",
        currentDealMatchId: "match-1",
        currentDealStakeKey: "stake_200",
        currentDealStakeAmount: 400,
        currentDealBankAmount: 800,
        economyReservationMade: true,
        matchRecorded: false,
        forfeitSettlementMade: false,
        pendingEconomySettlement: Promise.resolve("pending"),
        lastRoundEconomySummary: { stale: true },
        roomId: "room-1",
        roomCode: "ABCD",
        state: {
            playerOrder: ["s1", "s2", "s3", "s4"],
            players: new Map([
                ["s1", { name: "Alice", userId: "u1" }],
                ["s2", { name: "Bob", userId: "u2" }],
                ["s3", { name: "Carol", userId: "u3" }],
                ["s4", { name: "Dave", userId: "u4" }]
            ]),
            isTeamMode: false
        },
        identityBySessionId: new Map([
            ["s1", { provider: "platform", userId: "u1", playerId: "p1", displayName: "Alice" }],
            ["s2", { provider: "platform", userId: "u2", playerId: "p2", displayName: "Bob" }],
            ["s3", { provider: "platform", userId: "u3", playerId: "p3", displayName: "Carol" }],
            ["s4", { provider: "platform", userId: "u4", playerId: "p4", displayName: "Dave" }]
        ]),
        getPlatformMatchIdentity: () => ({ authToken: "token" }),
        broadcast: () => {},
        ...overrides
    };
}

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
        assert.equal(fetchCalls[0].url, `${expectedPlatformApiUrl}/api/economy/matches/reserve`);
        assert.equal(fetchCalls[0].init.method, "POST");
        assert.equal(fetchCalls[0].init.headers["content-type"], "application/json");
        const body = JSON.parse(fetchCalls[0].init.body);
        assert.equal(body.integrityScope, "economy.reserve");
        assert.equal(typeof body.proof, "string");
        assert.equal(body.participants[0].teamIndex, null);
        assert.equal(body.participants[1].teamIndex, null);
    } finally {
        global.fetch = originalFetch;
    }
});

test("reserveEconomyStakeForRoom maps DTO validation errors to a safe reason", async () => {
    const room = {
        currentStakeKey: "stake_500",
        currentDealMatchId: "match-1",
        roomId: "room-1",
        roomCode: "ABCD",
        state: {
            playerOrder: ["s1", "s2"],
            players: new Map([
                ["s1", { name: "Alice", userId: "u1" }],
                ["s2", { name: "Bob", userId: "u2" }]
            ]),
            isTeamMode: true
        },
        identityBySessionId: new Map([
            ["s1", { provider: "platform", userId: "u1", playerId: "p1", displayName: "Alice" }],
            ["s2", { provider: "platform", userId: "u2", playerId: "p2", displayName: "Bob" }]
        ]),
        getPlatformMatchIdentity: () => ({ authToken: "token" })
    };

    const originalFetch = global.fetch;
    global.fetch = async () => ({
        ok: false,
        status: 400,
        headers: {
            get: () => "application/json; charset=utf-8"
        },
        text: async () => JSON.stringify({
            message: [
                "property integrityScope should not exist",
                "property proof should not exist",
                "participants.0.property teamIndex should not exist"
            ],
            error: "Bad Request",
            statusCode: 400
        })
    });

    try {
        const result = await reserveEconomyStakeForRoom(room);
        assert.equal(result.ok, false);
        assert.equal(result.reason, "economy_validation_failed");
        assert.equal(result.status, 400);
        assert.equal(Array.isArray(result.message), true);
        assert.equal(result.message.length > 0, true);
        assert.equal(String(result.message.join(" ")).includes("integrityScope should not exist"), true);
    } finally {
        global.fetch = originalFetch;
    }
});

test("reserveEconomyStakeForRoom includes teamIndex in the signed reserve body for team rooms", async () => {
    const room = {
        currentStakeKey: "stake_500",
        currentDealMatchId: "match-1",
        roomId: "room-1",
        roomCode: "ABCD",
        state: {
            playerOrder: ["s1", "s2", "s3", "s4"],
            players: new Map([
                ["s1", { name: "Alice", userId: "u1" }],
                ["s2", { name: "Bob", userId: "u2" }],
                ["s3", { name: "Carol", userId: "u3" }],
                ["s4", { name: "Dave", userId: "u4" }]
            ]),
            isTeamMode: true
        },
        identityBySessionId: new Map([
            ["s1", { provider: "platform", userId: "u1", playerId: "p1", displayName: "Alice" }],
            ["s2", { provider: "platform", userId: "u2", playerId: "p2", displayName: "Bob" }],
            ["s3", { provider: "platform", userId: "u3", playerId: "p3", displayName: "Carol" }],
            ["s4", { provider: "platform", userId: "u4", playerId: "p4", displayName: "Dave" }]
        ]),
        getPlatformMatchIdentity: () => ({ authToken: "token" }),
        broadcast: () => {}
    };

    const fetchCalls = [];
    const originalFetch = global.fetch;
    global.fetch = async (url, init) => {
        fetchCalls.push({ url, init });
        return {
            ok: true,
            status: 200,
            text: async () => "",
            json: async () => ({ ok: true, reserved: 2000 })
        };
    };

    try {
        const result = await reserveEconomyStakeForRoom(room);
        assert.equal(result.ok, true);
        assert.equal(fetchCalls.length, 1);
        const body = JSON.parse(fetchCalls[0].init.body);
        assert.equal(body.integrityScope, "economy.reserve");
        assert.equal(typeof body.proof, "string");
        assert.equal(body.participants[0].teamIndex, 0);
        assert.equal(body.participants[1].teamIndex, 1);
    } finally {
        global.fetch = originalFetch;
    }
});

test("reserveEconomyStakeForRoom returns a safe reason for html 404 responses", async () => {
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
        status: 404,
        headers: {
            get: () => "text/html; charset=utf-8"
        },
        text: async () => "<!DOCTYPE html><html><body>Domino2 Admin 404: This page could not be found</body></html>"
    });

    try {
        const result = await reserveEconomyStakeForRoom(room);
        assert.equal(result.ok, false);
        assert.equal(result.reason, "reserve_endpoint_not_found");
        assert.equal(result.status, 404);
        assert.equal(result.contentType, "text/html; charset=utf-8");
        assert.equal(result.preview.includes("<!DOCTYPE html>"), true);
        assert.equal(result.preview.includes("Domino2 Admin"), true);
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

test("settleEconomyRoundForRoom handles the free stake path", async () => {
    const room = createSettleRoom({
        currentStakeKey: "free",
        currentDealStakeAmount: 123,
        currentDealBankAmount: 456,
        lastRoundEconomySummary: { stale: true }
    });

    const result = await settleEconomyRoundForRoom(room, 0);
    assert.equal(result, null);
    assert.equal(room.lastRoundEconomySummary, null);
    await room.pendingEconomySettlement;
});

test("settleEconomyRoundForRoom returns null when there is no platform identity", async () => {
    const room = createSettleRoom({
        getPlatformMatchIdentity: () => null
    });

    const result = await settleEconomyRoundForRoom(room, 0);
    assert.equal(result, null);
});

test("settleEconomyRoundForRoom updates room fields on success in ffa", async () => {
    const room = createSettleRoom({
        currentStakeKey: "stake_500",
        currentDealStakeKey: "stake_200",
        currentDealStakeAmount: 250,
        currentDealBankAmount: 500,
        state: {
            playerOrder: ["s1", "s2", "s3"],
            players: new Map([
                ["s1", { name: "Alice", userId: "u1" }],
                ["s2", { name: "Bob", userId: "u2" }],
                ["s3", { name: "Carol", userId: "u3" }]
            ]),
            isTeamMode: false
        },
        identityBySessionId: new Map([
            ["s1", { provider: "platform", userId: "u1", playerId: "p1", displayName: "Alice" }],
            ["s2", { provider: "guest", userId: "u2", playerId: "p2", displayName: "Bob" }],
            ["s3", { provider: "platform", userId: "u3", playerId: "p3", displayName: "Carol" }]
        ])
    });

    const fetchCalls = [];
    const originalFetch = global.fetch;
    global.fetch = async (url, init) => {
        fetchCalls.push({ url, init });
        return {
            ok: true,
            status: 200,
            text: async () => "",
            json: async () => ({
                ok: true,
                bank: 900,
                commission: 45,
                payout: 855,
                winners: 1,
                result: "win",
                reservations: [{ userId: "u3" }]
            })
        };
    };

    try {
        const result = await settleEconomyRoundForRoom(room, 2);
        assert.deepEqual(result, {
            stakeKey: "stake_200",
            stakeAmount: 250,
            bankAmount: 900,
            commission: 45,
            payout: 855,
            winners: 1,
            result: "win",
            reservations: [{ userId: "u3" }]
        });
        assert.equal(room.currentDealBankAmount, 0);
        assert.equal(room.currentDealStakeAmount, 0);
        assert.equal(room.currentDealStakeKey, "stake_500");
        assert.equal(room.forfeitSettlementMade, false);
        assert.deepEqual(room.lastRoundEconomySummary, result);
        await room.pendingEconomySettlement;
        assert.equal(fetchCalls.length, 1);
        assert.equal(fetchCalls[0].url, `${expectedPlatformApiUrl}/api/economy/matches/settle`);
        assert.equal(fetchCalls[0].init.method, "POST");
        assert.equal(fetchCalls[0].init.headers["content-type"], "application/json");
        const body = JSON.parse(fetchCalls[0].init.body);
        assert.equal(body.roomId, "room-1");
        assert.equal(body.matchId, "match-1");
        assert.equal(body.stakeKey, "stake_200");
        assert.equal(body.result, "win");
        assert.deepEqual(body.winnerUserIds, ["u3"]);
        assert.equal(body.integrityScope, "economy.settle");
    } finally {
        global.fetch = originalFetch;
    }
});

test("settleEconomyRoundForRoom sends the correct winnerUserIds in team mode", async () => {
    const room = createSettleRoom({
        currentStakeKey: "stake_500",
        currentDealStakeKey: "stake_500",
        state: {
            playerOrder: ["s1", "s2", "s3", "s4"],
            players: new Map([
                ["s1", { name: "Alice", userId: "u1" }],
                ["s2", { name: "Bob", userId: "u2" }],
                ["s3", { name: "Carol", userId: "u3" }],
                ["s4", { name: "Dave", userId: "u4" }]
            ]),
            isTeamMode: true
        },
        identityBySessionId: new Map([
            ["s1", { provider: "platform", userId: "u1", playerId: "p1", displayName: "Alice" }],
            ["s2", { provider: "platform", userId: "u2", playerId: "p2", displayName: "Bob" }],
            ["s3", { provider: "platform", userId: "u3", playerId: "p3", displayName: "Carol" }],
            ["s4", { provider: "platform", userId: "u4", playerId: "p4", displayName: "Dave" }]
        ])
    });

    let capturedBody = null;
    const originalFetch = global.fetch;
    global.fetch = async (url, init) => {
        capturedBody = JSON.parse(init.body);
        return {
            ok: true,
            status: 200,
            text: async () => "",
            json: async () => ({ ok: true, bank: 1000, commission: 0, payout: 1000, winners: 2, result: "win", reservations: [] })
        };
    };

    try {
        const result = await settleEconomyRoundForRoom(room, 1);
        assert.equal(result.result, "win");
        assert.deepEqual(capturedBody.winnerUserIds, ["u2", "u4"]);
        assert.equal(capturedBody.roomId, "room-1");
        assert.equal(capturedBody.matchId, "match-1");
        assert.equal(capturedBody.stakeKey, "stake_500");
        assert.equal(capturedBody.result, "win");
    } finally {
        global.fetch = originalFetch;
    }
});

test("settleEconomyRoundForRoom returns refund summary when response is not ok", async () => {
    const room = createSettleRoom({
        currentStakeKey: "stake_500",
        currentDealStakeKey: "stake_200",
        currentDealStakeAmount: 250,
        currentDealBankAmount: 500
    });

    const originalFetch = global.fetch;
    global.fetch = async () => ({
        ok: false,
        status: 500,
        text: async () => "settle failed",
        json: async () => ({})
    });

    try {
        const result = await settleEconomyRoundForRoom(room, 2);
        assert.deepEqual(result, {
            stakeKey: "stake_200",
            stakeAmount: 250,
            bankAmount: 500,
            commission: 0,
            payout: 0,
            winners: 0,
            result: "refund",
            reservations: []
        });
        assert.deepEqual(room.lastRoundEconomySummary, result);
        assert.equal(room.currentDealBankAmount, 500);
        assert.equal(room.currentDealStakeAmount, 250);
        assert.equal(room.currentDealStakeKey, "stake_200");
    } finally {
        global.fetch = originalFetch;
    }
});

test("settleEconomyRoundForRoom returns refund summary when the response body is rejected", async () => {
    const room = createSettleRoom({
        currentStakeKey: "stake_500",
        currentDealStakeKey: "stake_200",
        currentDealStakeAmount: 250,
        currentDealBankAmount: 500
    });

    const originalFetch = global.fetch;
    global.fetch = async () => ({
        ok: true,
        status: 200,
        text: async () => "",
        json: async () => ({ ok: false, reason: "rejected" })
    });

    try {
        const result = await settleEconomyRoundForRoom(room, 2);
        assert.deepEqual(result, {
            stakeKey: "stake_200",
            stakeAmount: 250,
            bankAmount: 500,
            commission: 0,
            payout: 0,
            winners: 0,
            result: "refund",
            reservations: []
        });
        assert.equal(room.currentDealBankAmount, 0);
        assert.equal(room.currentDealStakeAmount, 0);
        assert.equal(room.currentDealStakeKey, "stake_500");
        assert.deepEqual(room.lastRoundEconomySummary, result);
    } finally {
        global.fetch = originalFetch;
    }
});

test("settleEconomyRoundForRoom returns refund summary on transport failure", async () => {
    const room = createSettleRoom({
        currentStakeKey: "stake_500",
        currentDealStakeKey: "stake_200",
        currentDealStakeAmount: 250,
        currentDealBankAmount: 500
    });

    const originalFetch = global.fetch;
    global.fetch = async () => {
        throw new Error("boom");
    };

    try {
        const result = await settleEconomyRoundForRoom(room, 2);
        assert.deepEqual(result, {
            stakeKey: "stake_200",
            stakeAmount: 250,
            bankAmount: 500,
            commission: 0,
            payout: 0,
            winners: 0,
            result: "refund",
            reservations: []
        });
        assert.deepEqual(room.lastRoundEconomySummary, result);
    } finally {
        global.fetch = originalFetch;
    }
});

function createForfeitRoom(overrides = {}) {
    return createSettleRoom({
        currentDealStakeKey: "stake_200",
        currentDealStakeAmount: 250,
        currentDealBankAmount: 500,
        forfeitSettlementMade: false,
        matchRecorded: false,
        ...overrides
    });
}

test("settleForfeitStakeForRoom returns false when forfeitSettlementMade is true", async () => {
    const room = createForfeitRoom({ forfeitSettlementMade: true });
    const result = await settleForfeitStakeForRoom(room, "s2");
    assert.equal(result, false);
});

test("settleForfeitStakeForRoom returns false when currentDealStakeKey is free", async () => {
    const room = createForfeitRoom({ currentDealStakeKey: "free" });
    const result = await settleForfeitStakeForRoom(room, "s2");
    assert.equal(result, false);
});

test("settleForfeitStakeForRoom returns false when there is no platform identity", async () => {
    const room = createForfeitRoom({ getPlatformMatchIdentity: () => null });
    const result = await settleForfeitStakeForRoom(room, "s2");
    assert.equal(result, false);
});

test("settleForfeitStakeForRoom returns false when leaving session is missing", async () => {
    const room = createForfeitRoom({
        state: { playerOrder: ["s1", "s2"], players: new Map(), isTeamMode: false },
        identityBySessionId: new Map()
    });
    const result = await settleForfeitStakeForRoom(room, "missing");
    assert.equal(result, false);
});

test("settleForfeitStakeForRoom returns false when leaving identity has no userId", async () => {
    const room = createForfeitRoom({
        state: { playerOrder: ["s1", "s2"], players: new Map(), isTeamMode: false },
        identityBySessionId: new Map([["s2", { provider: "platform", userId: "" }]])
    });
    const result = await settleForfeitStakeForRoom(room, "s2");
    assert.equal(result, false);
});

test("settleForfeitStakeForRoom updates flags and request payload on success in ffa", async () => {
    const room = createForfeitRoom({
        state: {
            playerOrder: ["s1", "s2", "s3"],
            players: new Map([
                ["s1", { name: "Alice", userId: "u1" }],
                ["s2", { name: "Bob", userId: "u2" }],
                ["s3", { name: "Carol", userId: "u3" }]
            ]),
            isTeamMode: false
        },
        identityBySessionId: new Map([
            ["s1", { provider: "platform", userId: "u1", playerId: "p1", displayName: "Alice" }],
            ["s2", { provider: "platform", userId: "u2", playerId: "p2", displayName: "Bob" }],
            ["s3", { provider: "platform", userId: "u3", playerId: "p3", displayName: "Carol" }]
        ])
    });

    let capturedBody = null;
    const originalFetch = global.fetch;
    global.fetch = async (url, init) => {
        capturedBody = JSON.parse(init.body);
        return {
            ok: true,
            status: 200,
            text: async () => "",
            json: async () => ({ ok: true, winners: 2, reservations: [] })
        };
    };

    try {
        const result = await settleForfeitStakeForRoom(room, "s2");
        assert.deepEqual(result, { ok: true, winners: 2, reservations: [] });
        assert.equal(room.forfeitSettlementMade, true);
        assert.equal(room.matchRecorded, true);
        assert.equal(capturedBody.roomId, "room-1");
        assert.equal(capturedBody.matchId, "match-1");
        assert.equal(capturedBody.stakeKey, "stake_200");
        assert.equal(capturedBody.result, "loss");
        assert.deepEqual(capturedBody.winnerUserIds, ["u1", "u3"]);
        assert.equal(capturedBody.integrityScope, "economy.settle");
    } finally {
        global.fetch = originalFetch;
    }
});

test("settleForfeitStakeForRoom excludes the leaving team in team mode", async () => {
    const room = createForfeitRoom({
        state: {
            playerOrder: ["s1", "s2", "s3", "s4"],
            players: new Map([
                ["s1", { name: "Alice", userId: "u1" }],
                ["s2", { name: "Bob", userId: "u2" }],
                ["s3", { name: "Carol", userId: "u3" }],
                ["s4", { name: "Dave", userId: "u4" }]
            ]),
            isTeamMode: true
        },
        identityBySessionId: new Map([
            ["s1", { provider: "platform", userId: "u1", playerId: "p1", displayName: "Alice" }],
            ["s2", { provider: "platform", userId: "u2", playerId: "p2", displayName: "Bob" }],
            ["s3", { provider: "platform", userId: "u3", playerId: "p3", displayName: "Carol" }],
            ["s4", { provider: "platform", userId: "u4", playerId: "p4", displayName: "Dave" }]
        ])
    });

    let capturedBody = null;
    const originalFetch = global.fetch;
    global.fetch = async (url, init) => {
        capturedBody = JSON.parse(init.body);
        return {
            ok: true,
            status: 200,
            text: async () => "",
            json: async () => ({ ok: true, winners: 2, reservations: [] })
        };
    };

    try {
        const result = await settleForfeitStakeForRoom(room, "s1");
        assert.deepEqual(result, { ok: true, winners: 2, reservations: [] });
        assert.deepEqual(capturedBody.winnerUserIds, ["u2", "u4"]);
        assert.equal(capturedBody.result, "loss");
    } finally {
        global.fetch = originalFetch;
    }
});

test("settleForfeitStakeForRoom returns false when response is not ok", async () => {
    const room = createForfeitRoom();

    const originalFetch = global.fetch;
    global.fetch = async () => ({
        ok: false,
        status: 500,
        text: async () => "settle failed",
        json: async () => ({})
    });

    try {
        const result = await settleForfeitStakeForRoom(room, "s2");
        assert.equal(result, false);
        assert.equal(room.forfeitSettlementMade, false);
        assert.equal(room.matchRecorded, false);
    } finally {
        global.fetch = originalFetch;
    }
});

test("settleForfeitStakeForRoom returns false on transport failure", async () => {
    const room = createForfeitRoom();

    const originalFetch = global.fetch;
    global.fetch = async () => {
        throw new Error("boom");
    };

    try {
        const result = await settleForfeitStakeForRoom(room, "s2");
        assert.equal(result, false);
        assert.equal(room.forfeitSettlementMade, false);
        assert.equal(room.matchRecorded, false);
    } finally {
        global.fetch = originalFetch;
    }
});
