const test = require("node:test");
const assert = require("node:assert/strict");

const { LIMIT_WINDOW_MS, LIMIT_MAX_JOINS, checkJoinRateLimit, resetJoinRateLimits } = require("../joinRateLimit");

test("join rate limit blocks the ninth join within the window", () => {
    resetJoinRateLimits();
    const key = "player-1";
    const startedAt = 1_000_000;

    for (let i = 0; i < LIMIT_MAX_JOINS; i++) {
        const result = checkJoinRateLimit(key, startedAt + i * 1000);
        assert.equal(result.allowed, true);
        assert.equal(result.retryAfterMs, 0);
    }

    const blocked = checkJoinRateLimit(key, startedAt + LIMIT_MAX_JOINS * 1000);
    assert.equal(blocked.allowed, false);
    assert.ok(blocked.retryAfterMs > 0);
    assert.ok(blocked.retryAfterMs <= LIMIT_WINDOW_MS);
});

test("join rate limit resets after the window passes", () => {
    resetJoinRateLimits();
    const key = "player-2";
    const startedAt = 2_000_000;

    for (let i = 0; i < LIMIT_MAX_JOINS; i++) {
        assert.equal(checkJoinRateLimit(key, startedAt + i * 1000).allowed, true);
    }

    assert.equal(checkJoinRateLimit(key, startedAt + LIMIT_WINDOW_MS + 1).allowed, true);
});
