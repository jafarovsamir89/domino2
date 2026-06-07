const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");

const dominoRoomPath = require.resolve("../DominoRoom");

async function withDominoRoomStub(stub, fn) {
    const previousRedisUri = process.env.REDIS_URI;
    const previousCache = require.cache[dominoRoomPath];
    const originalLoad = Module._load;
    const store = stub.store instanceof Map ? stub.store : new Map(Object.entries(stub.store || {}));

    class FakeRedis {
        constructor() {
            this.status = stub.status || "ready";
            this.on = () => {};
            this._url = stub.redisUrl || "redis://restore-test";
            this._options = stub.options || {};
        }

        async connect() {
            if (stub.connect) return stub.connect(this);
            this.status = "ready";
        }

        async get(key) {
            if (stub.get) return stub.get(key);
            return store.has(key) ? store.get(key) : null;
        }
    }

    process.env.REDIS_URI = stub.redisUrl || "redis://restore-test";
    Module._load = function(request, parent, isMain) {
        if (request === "ioredis") {
            return FakeRedis;
        }
        return originalLoad.call(this, request, parent, isMain);
    };

    delete require.cache[dominoRoomPath];
    const DominoRoom = require("../DominoRoom");

    try {
        return await fn(DominoRoom);
    } finally {
        Module._load = originalLoad;
        if (previousCache) {
            require.cache[dominoRoomPath] = previousCache;
        } else {
            delete require.cache[dominoRoomPath];
        }
        if (previousRedisUri === undefined) {
            delete process.env.REDIS_URI;
        } else {
            process.env.REDIS_URI = previousRedisUri;
        }
    }
}

test("loadCustomStateForRestore returns the room-id snapshot when Redis has the room key", async () => {
    const snapshot = { roomId: "room-1", roomCode: "ROOM-1" };

    await withDominoRoomStub({
        store: new Map([
            ["domino:custom:room-1", JSON.stringify(snapshot)]
        ])
    }, async (DominoRoom) => {
        const room = Object.create(DominoRoom.prototype);
        const restored = await room.loadCustomStateForRestore({ restoreRoomId: "room-1" });
        assert.deepEqual(restored, snapshot);
    });
});

test("loadCustomStateForRestore returns the room-code snapshot when Redis has the code key", async () => {
    const snapshot = { roomId: "room-2", roomCode: "ROOM-2" };

    await withDominoRoomStub({
        store: new Map([
            ["domino:custom:code:ROOM-2", JSON.stringify(snapshot)]
        ])
    }, async (DominoRoom) => {
        const room = Object.create(DominoRoom.prototype);
        const restored = await room.loadCustomStateForRestore({ restoreRoomCode: "room-2" });
        assert.deepEqual(restored, snapshot);
    });
});

test("loadCustomStateForRestore skips snapshots whose roomCode does not match the requested code", async () => {
    await withDominoRoomStub({
        store: new Map([
            ["domino:custom:room-3", JSON.stringify({ roomId: "room-3", roomCode: "OTHER" })]
        ])
    }, async (DominoRoom) => {
        const room = Object.create(DominoRoom.prototype);
        const restored = await room.loadCustomStateForRestore({
            restoreRoomId: "room-3",
            restoreRoomCode: "ROOM-3"
        });
        assert.equal(restored, null);
    });
});

test("loadCustomStateForRestore returns null for invalid JSON and Redis errors", async () => {
    await withDominoRoomStub({
        store: new Map([
            ["domino:custom:room-4", "{not-json"]
        ])
    }, async (DominoRoom) => {
        const room = Object.create(DominoRoom.prototype);
        const restored = await room.loadCustomStateForRestore({ restoreRoomId: "room-4" });
        assert.equal(restored, null);
    });

    await withDominoRoomStub({
        status: "connecting",
        connect: async () => {
            throw new Error("redis unavailable");
        },
        store: new Map()
    }, async (DominoRoom) => {
        const room = Object.create(DominoRoom.prototype);
        const restored = await room.loadCustomStateForRestore({ restoreRoomId: "room-5" });
        assert.equal(restored, null);
    });
});

test("loadCustomStateForRestore returns null when no restore keys are provided", async () => {
    await withDominoRoomStub({}, async (DominoRoom) => {
        const room = Object.create(DominoRoom.prototype);
        const restored = await room.loadCustomStateForRestore({});
        assert.equal(restored, null);
    });
});

test("findReusableSessionId only falls back to userId during an explicit restore request", async () => {
    await withDominoRoomStub({}, async (DominoRoom) => {
        const room = Object.create(DominoRoom.prototype);
        room.state = {
            players: new Map([
                ["session-1", { isBot: false, userId: "u1" }],
                ["session-2", { isBot: false, userId: "u2" }]
            ]),
            playerOrder: ["session-1", "session-2"]
        };

        assert.equal(room.findReusableSessionId({ restoreSessionId: "session-2" }, { userId: "u1" }), "session-2");
        assert.equal(room.findReusableSessionId({ restoreSessionId: "missing" }, { userId: "u2" }), "");
        assert.equal(room.findReusableSessionId({ restoreRoomCode: "ROOM-2" }, { userId: "u2" }), "session-2");
        assert.equal(room.findReusableSessionId({ restoreSessionId: "missing" }, { userId: "" }), "");
    });
});
