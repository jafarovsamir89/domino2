const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

process.env.NODE_ENV = "test";
process.env.BETTER_AUTH_SECRET = "r10-join-boundary-test-secret-32-characters";
process.env.PLATFORM_API_URL = "http://127.0.0.1:4300";

const DominoRoom = require("../DominoRoom");

function makeGameToken(overrides = {}) {
    const claims = {
        userId: "synthetic-user",
        playerId: "synthetic-player",
        displayName: "Synthetic Player",
        role: "player",
        sessionId: "synthetic-session",
        issuedAt: Date.now(),
        expiresAt: Date.now() + 60_000,
        ...overrides
    };
    const payload = Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
    const signature = crypto.createHmac("sha256", process.env.BETTER_AUTH_SECRET).update(payload).digest("base64url");
    return `${payload}.${signature}`;
}

function makeRoom() {
    return Object.create(DominoRoom.prototype);
}

function withFetch(handler) {
    const previousFetch = global.fetch;
    global.fetch = handler;
    return () => { global.fetch = previousFetch; };
}

test("Colyseus onAuth calls the API validation boundary before admitting a valid signed game token", async () => {
    const token = makeGameToken();
    let request;
    const restoreFetch = withFetch(async (url, options) => {
        request = { url, options };
        return { status: 200, ok: true };
    });
    try {
        const auth = await makeRoom().onAuth({}, { authToken: token }, {});
        assert.equal(request.url, "http://127.0.0.1:4300/api/platform/game-token/validate");
        assert.equal(request.options.method, "POST");
        assert.deepEqual(JSON.parse(request.options.body), { token });
        assert.ok(request.options.signal instanceof AbortSignal);
        assert.equal(auth.provider, "platform");
        assert.equal(auth.userId, "synthetic-user");
        assert.equal(auth.playerId, "synthetic-player");
    } finally {
        restoreFetch();
    }
});

test("Colyseus onAuth rejects expired tokens before calling the API", async () => {
    let calls = 0;
    const restoreFetch = withFetch(async () => { calls += 1; return { status: 200, ok: true }; });
    try {
        await assert.rejects(makeRoom().onAuth({}, { authToken: makeGameToken({ expiresAt: Date.now() - 1 }) }, {}), /auth_required/);
        assert.equal(calls, 0);
    } finally {
        restoreFetch();
    }
});

test("Colyseus onAuth denies a token when the API reports its session was revoked", async () => {
    const restoreFetch = withFetch(async () => ({ status: 401, ok: false }));
    try {
        await assert.rejects(makeRoom().onAuth({}, { authToken: makeGameToken() }, {}), error => error.code === 401 && error.message === "auth_required");
    } finally {
        restoreFetch();
    }
});

test("Colyseus onAuth fails closed when the API returns an error or times out", async t => {
    await t.test("API 5xx", async () => {
        const restoreFetch = withFetch(async () => ({ status: 503, ok: false }));
        try {
            await assert.rejects(makeRoom().onAuth({}, { authToken: makeGameToken() }, {}), error => error.code === 503 && error.message === "auth_validation_unavailable");
        } finally {
            restoreFetch();
        }
    });
    await t.test("network timeout", async () => {
        const restoreFetch = withFetch(async (_url, options) => {
            assert.ok(options.signal instanceof AbortSignal);
            throw new DOMException("API request timed out", "TimeoutError");
        });
        try {
            await assert.rejects(makeRoom().onAuth({}, { authToken: makeGameToken() }, {}), error => error.code === 503 && error.message === "auth_validation_unavailable");
        } finally {
            restoreFetch();
        }
    });
});

test("Colyseus reconnect revalidates the original platform token before restoring a seat", async () => {
    const token = makeGameToken();
    const room = makeRoom();
    room.identityBySessionId = new Map([["session-7", {
        provider: "platform",
        authToken: token,
        userId: "synthetic-user",
        playerId: "synthetic-player"
    }]]);
    let request;
    const restoreFetch = withFetch(async (url, options) => {
        request = { url, options };
        return { status: 200, ok: true };
    });
    try {
        await room.onReconnect({ sessionId: "session-7" });
        assert.equal(request.url, "http://127.0.0.1:4300/api/platform/game-token/validate");
        assert.deepEqual(JSON.parse(request.options.body), { token });
    } finally {
        restoreFetch();
    }
});

test("Colyseus reconnect rejects revoked or unavailable platform sessions", async t => {
    const token = makeGameToken();
    const room = makeRoom();
    room.identityBySessionId = new Map([["session-7", {
        provider: "platform",
        authToken: token,
        userId: "synthetic-user",
        playerId: "synthetic-player"
    }]]);
    await t.test("revoked token", async () => {
        const restoreFetch = withFetch(async () => ({ status: 401, ok: false }));
        try {
            await assert.rejects(room.onReconnect({ sessionId: "session-7" }), error => error.code === 401 && error.message === "auth_required");
        } finally {
            restoreFetch();
        }
    });
    await t.test("API unavailable", async () => {
        const restoreFetch = withFetch(async () => ({ status: 503, ok: false }));
        try {
            await assert.rejects(room.onReconnect({ sessionId: "session-7" }), error => error.code === 503 && error.message === "auth_validation_unavailable");
        } finally {
            restoreFetch();
        }
    });
});

test("Colyseus reconnect rejects missing, expired, or mismatched saved identities without contacting the API", async t => {
    let calls = 0;
    const restoreFetch = withFetch(async () => { calls += 1; return { status: 200, ok: true }; });
    const cases = [
        ["missing saved identity", undefined, "session-7"],
        ["expired saved token", { authToken: makeGameToken({ expiresAt: Date.now() - 1 }), userId: "synthetic-user", playerId: "synthetic-player" }, "session-7"],
        ["identity does not match signed token", { authToken: makeGameToken(), userId: "different-user", playerId: "synthetic-player" }, "session-7"]
    ];
    try {
        for (const [name, identity, sessionId] of cases) {
            await t.test(name, async () => {
                const room = makeRoom();
                room.identityBySessionId = new Map(identity ? [[sessionId, identity]] : []);
                await assert.rejects(room.onReconnect({ sessionId }), error => error.code === 401 && error.message === "auth_required");
            });
        }
        assert.equal(calls, 0);
    } finally {
        restoreFetch();
    }
});
