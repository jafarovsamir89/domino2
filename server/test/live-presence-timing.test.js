const test = require("node:test");
const assert = require("node:assert/strict");

const { DISCONNECT_GRACE_SECONDS } = require("../roomConfig");
const { isStale, upsertLivePlayer } = require("../livePresence");

test("presence stale threshold follows disconnect grace", () => {
    const now = Date.now();
    const freshEntry = { updatedAt: new Date(now - (DISCONNECT_GRACE_SECONDS * 1000 - 1000)).toISOString() };
    const staleEntry = { updatedAt: new Date(now - (DISCONNECT_GRACE_SECONDS * 1000 + 1000)).toISOString() };

    assert.equal(isStale(freshEntry), false);
    assert.equal(isStale(staleEntry), true);
});

test("presence heartbeat refreshes updatedAt even with an empty payload", () => {
    global.__DOMINO_LIVE_PRESENCE = new Map();
    const originalUpdatedAt = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    global.__DOMINO_LIVE_PRESENCE.set("session-1", {
        sessionId: "session-1",
        roomId: "room-1",
        updatedAt: originalUpdatedAt,
        isConnected: true
    });

    const next = upsertLivePlayer("session-1", {});
    assert.ok(Date.parse(next.updatedAt) > Date.parse(originalUpdatedAt));
});
