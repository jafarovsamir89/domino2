const test = require("node:test");
const assert = require("node:assert/strict");

const { buildReadinessHealth } = require("../health");

test("readiness health reports degraded when Redis is not configured outside production", async () => {
    const health = await buildReadinessHealth({ redis: null, isProduction: false });
    assert.equal(health.httpStatus, 200);
    assert.equal(health.payload.status, "degraded");
    assert.equal(health.payload.redis, "not_configured");
});

test("readiness health reports unhealthy when Redis is unavailable in production", async () => {
    const health = await buildReadinessHealth({
        redis: {
            status: "connecting",
            connect: async () => {
                throw new Error("redis down");
            }
        },
        isProduction: true
    });

    assert.equal(health.httpStatus, 503);
    assert.equal(health.payload.status, "unhealthy");
    assert.equal(health.payload.redis, "unavailable");
    assert.match(health.payload.error, /redis down/);
});

test("readiness health reports ok when Redis is ready", async () => {
    let connected = false;
    const health = await buildReadinessHealth({
        redis: {
            status: "connecting",
            connect: async () => {
                connected = true;
            }
        },
        isProduction: true
    });

    assert.equal(connected, true);
    assert.equal(health.httpStatus, 200);
    assert.equal(health.payload.status, "ok");
    assert.equal(health.payload.redis, "ready");
});
