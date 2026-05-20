const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

const { verifyGameToken } = require("../platformAuth");

const DEV_FALLBACK_SECRET = "domino-dev-secret";

function makeToken(claims, secret) {
    const payload = Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
    const signature = crypto.createHmac("sha256", secret).update(payload).digest("base64url");
    return `${payload}.${signature}`;
}

test("server auth token verification uses the dev fallback secret outside production", () => {
    const previousEnv = process.env.NODE_ENV;
    const previousSecret = process.env.BETTER_AUTH_SECRET;

    try {
        process.env.NODE_ENV = "development";
        process.env.BETTER_AUTH_SECRET = "change-me";

        const claims = {
            userId: "user-1",
            playerId: "player-1",
            displayName: "Alice",
            role: "player",
            sessionId: "session-1",
            provider: "better-auth",
            issuedAt: Date.now(),
            expiresAt: Date.now() + 60_000
        };
        const token = makeToken(claims, DEV_FALLBACK_SECRET);

        assert.deepEqual(verifyGameToken(token), claims);
    } finally {
        if (previousEnv === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = previousEnv;
        if (previousSecret === undefined) delete process.env.BETTER_AUTH_SECRET;
        else process.env.BETTER_AUTH_SECRET = previousSecret;
    }
});

test("server auth token verification rejects weak secrets in production", () => {
    const previousEnv = process.env.NODE_ENV;
    const previousSecret = process.env.BETTER_AUTH_SECRET;

    try {
        process.env.NODE_ENV = "production";
        process.env.BETTER_AUTH_SECRET = "change-me";

        assert.throws(() => verifyGameToken("invalid.token"), /BETTER_AUTH_SECRET/);
    } finally {
        if (previousEnv === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = previousEnv;
        if (previousSecret === undefined) delete process.env.BETTER_AUTH_SECRET;
        else process.env.BETTER_AUTH_SECRET = previousSecret;
    }
});
