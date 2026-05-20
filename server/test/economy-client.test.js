const test = require("node:test");
const assert = require("node:assert/strict");

const {
    postEconomyRequest,
    postReserveEconomyMatch,
    postSettleEconomyMatch,
    postRefundEconomyMatch
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

test("postRefundEconomyMatch calls the refund endpoint", async () => {
    const calls = [];
    const fetchImpl = async (url, init) => {
        calls.push({ url, init });
        return { ok: true, kind: "refund" };
    };

    const response = await postRefundEconomyMatch({
        baseUrl: "http://example.com",
        body: { matchId: "match-1" },
        fetchImpl
    });

    assert.equal(response.kind, "refund");
    assert.equal(calls[0].url, "http://example.com/api/economy/matches/refund");
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
