const test = require("node:test");
const assert = require("node:assert/strict");

const { postEconomyRequest } = require("../economyClient");

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

test("postEconomyRequest returns the same response object", async () => {
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
