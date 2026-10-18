async function loadCustomStateSnapshotForRestore({ redis, options = {} }) {
    if (!redis) return null;
    const restoreRoomId = String(options?.restoreRoomId || "").trim();
    const restoreRoomCode = String(options?.restoreRoomCode || "").trim().toUpperCase();
    if (!restoreRoomId && !restoreRoomCode) return null;

    const keys = [];
    if (restoreRoomId) keys.push(`domino:custom:${restoreRoomId}`);
    if (restoreRoomCode) keys.push(`domino:custom:code:${restoreRoomCode}`);

    try {
        if (redis.status !== "ready") {
            await redis.connect();
        }
        for (const key of keys) {
            const raw = await redis.get(key);
            if (!raw) continue;
            const parsed = JSON.parse(raw);
            if (parsed.snapshotVersion != null && parsed.snapshotVersion !== 1) continue;
            if (restoreRoomId && parsed.roomId !== restoreRoomId) continue;
            if (options.restoreMatchId && String(parsed.matchRecordId || parsed.currentDealMatchId || "") !== String(options.restoreMatchId).trim()) continue;
            if (!restoreRoomCode || String(parsed.roomCode || "").toUpperCase() === restoreRoomCode) {
                return parsed;
            }
        }
    } catch (e) {
        console.error("[ROOM] Redis restore error", e);
    }
    return null;
}

module.exports = {
    loadCustomStateSnapshotForRestore
};
