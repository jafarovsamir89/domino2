const probes = new WeakMap();

async function buildReadinessHealth({ redis, isProduction = false, timeoutMs = 750 } = {}) {
    const payload = { service: "domino2-server", redis: "not_configured", status: isProduction ? "unhealthy" : "degraded" };
    if (!redis) return { httpStatus: isProduction ? 503 : 200, payload };
    // Share a probe until its command actually settles, including after timeout.
    // A paused Redis must not accumulate another queued PING on every health call.
    let probe = probes.get(redis);
    if (!probe) {
        probe = { startedAt: Date.now(), promise: null };
        probe.promise = Promise.resolve().then(async () => {
            if (redis.status === "wait" || redis.status === "end") await redis.connect();
            if (await redis.ping() !== "PONG") throw new Error("Unexpected Redis PING response");
        });
        probes.set(redis, probe);
        const cleanup = () => { if (probes.get(redis) === probe) probes.delete(redis); };
        probe.promise.then(cleanup, cleanup);
    }
    let timer;
    try {
        const remaining = Math.max(0, Math.min(750, timeoutMs) - (Date.now() - probe.startedAt));
        if (!remaining) throw new Error("Redis readiness deadline exceeded");
        await Promise.race([probe.promise, new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error("Redis readiness deadline exceeded")), remaining);
        })]);
        return { httpStatus: 200, payload: { service: "domino2-server", redis: "ready", status: "ok" } };
    } catch (error) {
        return { httpStatus: 503, payload: { service: "domino2-server", redis: "unavailable", status: "unhealthy",
            error: error instanceof Error ? error.message : "Redis unavailable" } };
    } finally { clearTimeout(timer); }
}
module.exports = { buildReadinessHealth };
