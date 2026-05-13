const Redis = require("ioredis");

const ROOM_CODE_TTL_SECONDS = 86400;
const redisUrl = process.env.REDIS_URI || "";
const redis = redisUrl
    ? new Redis(redisUrl, {
        enableReadyCheck: false,
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        retryStrategy(times) {
            return Math.min(times * 200, 1000);
        }
    })
    : null;

if (redis) {
    redis.on("error", (err) => {
        console.warn("[Redis] Room registry unavailable:", err.message);
    });
}

const globalRef = globalThis;
globalRef.__DOMINO_ROOM_CODES = globalRef.__DOMINO_ROOM_CODES || new Map();
globalRef.__DOMINO_ROOM_IDS = globalRef.__DOMINO_ROOM_IDS || new Map();

function getCodeKey(code) {
    return `domino:room:code:${code}`;
}

function getRoomKey(roomId) {
    return `domino:room:id:${roomId}`;
}

async function getRedisClient() {
    if (!redis) return null;
    try {
        if (redis.status !== "ready") {
            await redis.connect();
        }
        return redis;
    } catch (err) {
        console.warn("[Redis] Room registry connect failed:", err.message);
        return null;
    }
}

function normalizeCode(code) {
    return String(code || "").trim().toUpperCase();
}

function normalizeRoomId(roomId) {
    return String(roomId || "").trim();
}

async function rememberRoom(roomCode, roomId) {
    const code = normalizeCode(roomCode);
    const id = normalizeRoomId(roomId);
    if (!code || !id) return null;

    globalRef.__DOMINO_ROOM_CODES.set(code, id);
    globalRef.__DOMINO_ROOM_IDS.set(id, code);

    const client = await getRedisClient();
    if (!client) return { roomCode: code, roomId: id };

    await client.pipeline()
        .setex(getCodeKey(code), ROOM_CODE_TTL_SECONDS, id)
        .setex(getRoomKey(id), ROOM_CODE_TTL_SECONDS, code)
        .exec()
        .catch((err) => {
            console.warn("[Redis] Room registry write failed:", err.message);
        });

    return { roomCode: code, roomId: id };
}

async function forgetRoom(roomCode, roomId) {
    const code = normalizeCode(roomCode);
    const id = normalizeRoomId(roomId);
    const resolvedCode = code || (id ? globalRef.__DOMINO_ROOM_IDS.get(id) || null : null);
    const resolvedRoomId = id || (code ? globalRef.__DOMINO_ROOM_CODES.get(code) || null : null);

    if (code) globalRef.__DOMINO_ROOM_CODES.delete(code);
    if (id) globalRef.__DOMINO_ROOM_IDS.delete(id);

    const client = await getRedisClient();
    if (!client) return;

    const pipeline = client.pipeline();
    if (resolvedCode) pipeline.del(getCodeKey(resolvedCode));
    if (resolvedRoomId) pipeline.del(getRoomKey(resolvedRoomId));
    await pipeline.exec().catch((err) => {
        console.warn("[Redis] Room registry delete failed:", err.message);
    });
}

async function resolveRoomIdByCode(roomCode) {
    const code = normalizeCode(roomCode);
    if (!code) return null;

    const local = globalRef.__DOMINO_ROOM_CODES.get(code);
    if (local) return local;

    const client = await getRedisClient();
    if (!client) return null;

    const roomId = await client.get(getCodeKey(code)).catch(() => null);
    if (!roomId) return null;
    globalRef.__DOMINO_ROOM_CODES.set(code, roomId);
    globalRef.__DOMINO_ROOM_IDS.set(roomId, code);
    return roomId;
}

async function resolveRoomCodeById(roomId) {
    const id = normalizeRoomId(roomId);
    if (!id) return null;

    const local = globalRef.__DOMINO_ROOM_IDS.get(id);
    if (local) return local;

    const client = await getRedisClient();
    if (!client) return null;

    const code = await client.get(getRoomKey(id)).catch(() => null);
    if (!code) return null;
    globalRef.__DOMINO_ROOM_CODES.set(code, id);
    globalRef.__DOMINO_ROOM_IDS.set(id, code);
    return code;
}

module.exports = {
    forgetRoom,
    rememberRoom,
    resolveRoomCodeById,
    resolveRoomIdByCode
};
