const test = require("node:test");
const assert = require("node:assert/strict");

const { loadCustomStateSnapshotForRestore } = require("../roomRestoreLookup");

test("loadCustomStateSnapshotForRestore returns null when redis is missing or no restore keys are provided", async () => {
    assert.equal(await loadCustomStateSnapshotForRestore({ redis: null, options: {} }), null);
    assert.equal(await loadCustomStateSnapshotForRestore({ redis: { status: "ready", connect: async () => {}, get: async () => null }, options: {} }), null);
});

test("loadCustomStateSnapshotForRestore prefers roomId then roomCode and respects roomCode matching", async () => {
    const calls = [];
    const redis = {
        status: "ready",
        async connect() {
            throw new Error("should not connect when ready");
        },
        async get(key) {
            calls.push(key);
            if (key === "domino:custom:room-1") return JSON.stringify({ roomId: "room-1", roomCode: "ROOM-1" });
            if (key === "domino:custom:code:ROOM-2") return JSON.stringify({ roomId: "room-2", roomCode: "ROOM-2" });
            return null;
        }
    };

    const roomIdSnapshot = await loadCustomStateSnapshotForRestore({
        redis,
        options: { restoreRoomId: "room-1" }
    });
    assert.deepEqual(roomIdSnapshot, { roomId: "room-1", roomCode: "ROOM-1" });

    const roomCodeSnapshot = await loadCustomStateSnapshotForRestore({
        redis,
        options: { restoreRoomCode: "room-2" }
    });
    assert.deepEqual(roomCodeSnapshot, { roomId: "room-2", roomCode: "ROOM-2" });

    const mismatch = await loadCustomStateSnapshotForRestore({
        redis: {
            status: "ready",
            connect: async () => {},
            get: async (key) => (key === "domino:custom:room-3" ? JSON.stringify({ roomId: "room-3", roomCode: "OTHER" }) : null)
        },
        options: { restoreRoomId: "room-3", restoreRoomCode: "ROOM-3" }
    });
    assert.equal(mismatch, null);
    assert.deepEqual(calls, [
        "domino:custom:room-1",
        "domino:custom:code:ROOM-2"
    ]);
});

test("loadCustomStateSnapshotForRestore returns null on invalid JSON or redis errors", async () => {
    const invalid = await loadCustomStateSnapshotForRestore({
        redis: {
            status: "ready",
            connect: async () => {},
            get: async () => "{not-json"
        },
        options: { restoreRoomId: "room-4" }
    });
    assert.equal(invalid, null);

    const failed = await loadCustomStateSnapshotForRestore({
        redis: {
            status: "connecting",
            connect: async () => {
                throw new Error("redis unavailable");
            },
            get: async () => null
        },
        options: { restoreRoomId: "room-5" }
    });
    assert.equal(failed, null);
});
