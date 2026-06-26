const test = require("node:test");
const assert = require("node:assert/strict");

const {
    postEconomyRequest,
    postReserveEconomyMatch,
    postSettleEconomyMatch
} = require("../economyClient");

test("postEconomyRequest posts JSON to the resolved economy URL", async () => {
    const calls = [];
    const fetchImpl = async (url, init) => {
        calls.push({ url, init });
        return { ok: true, marker: "response" };
    };
    const body = { roomId: "room-1", matchId: "match-1" };
    const bodyClone = structuredClone(body);

    const response = await postEconomyRequest({
        baseUrl: "http://example.com/",
        path: "/api/economy/matches/reserve",
        body,
        fetchImpl
    });

    assert.deepEqual(body, bodyClone);
    assert.equal(response.marker, "response");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "http://example.com/api/economy/matches/reserve");
    assert.equal(calls[0].init.method, "POST");
    assert.equal(calls[0].init.headers["content-type"], "application/json");
    assert.equal(calls[0].init.body, JSON.stringify(body));
});

test("postEconomyRequest adds Authorization when authToken is provided", async () => {
    const calls = [];
    const fetchImpl = async (url, init) => {
        calls.push({ url, init });
        return { ok: true, marker: "response" };
    };

    const response = await postEconomyRequest({
        baseUrl: "http://example.com/",
        path: "/api/economy/matches/reserve",
        body: { roomId: "room-1" },
        authToken: "token-123",
        fetchImpl
    });

    assert.equal(response.marker, "response");
    assert.equal(calls[0].init.headers.Authorization, "Bearer token-123");
    assert.equal(calls[0].init.headers["content-type"], "application/json");
});

test("postEconomyRequest does not add Authorization when authToken is missing", async () => {
    const calls = [];
    const fetchImpl = async (url, init) => {
        calls.push({ url, init });
        return { ok: true, marker: "response" };
    };

    await postEconomyRequest({
        baseUrl: "http://example.com/",
        path: "/api/economy/matches/reserve",
        body: { roomId: "room-1" },
        fetchImpl
    });

    assert.equal(Object.prototype.hasOwnProperty.call(calls[0].init.headers, "Authorization"), false);
});

test("postReserveEconomyMatch calls the reserve endpoint", async () => {
    const calls = [];
    const fetchImpl = async (url, init) => {
        calls.push({ url, init });
        return { ok: true, kind: "reserve" };
    };

    const response = await postReserveEconomyMatch({
        baseUrl: "http://example.com/",
        body: { matchId: "match-1" },
        fetchImpl
    });

    assert.equal(response.kind, "reserve");
    assert.equal(calls[0].url, "http://example.com/api/economy/matches/reserve");
    assert.equal(calls[0].init.method, "POST");
});

test("postSettleEconomyMatch calls the settle endpoint", async () => {
    const calls = [];
    const fetchImpl = async (url, init) => {
        calls.push({ url, init });
        return { ok: true, kind: "settle" };
    };

    const response = await postSettleEconomyMatch({
        baseUrl: "http://example.com",
        body: { matchId: "match-1" },
        fetchImpl
    });

    assert.equal(response.kind, "settle");
    assert.equal(calls[0].url, "http://example.com/api/economy/matches/settle");
    assert.equal(calls[0].init.method, "POST");
});

test("economy helpers return the same response object", async () => {
    const responseObject = { ok: false, status: 500 };
    const fetchImpl = async () => responseObject;

    const response = await postEconomyRequest({
        baseUrl: "http://example.com",
        path: "/api/economy/matches/settle",
        body: { result: "refund" },
        fetchImpl
    });

    assert.strictEqual(response, responseObject);
});
