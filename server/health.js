async function buildReadinessHealth({ redis, isProduction = false } = {}) {
    const base = {
        service: "domino2-server",
        redis: "not_configured",
        status: isProduction ? "unhealthy" : "degraded"
    };

    if (!redis) {
        return {
            httpStatus: isProduction ? 503 : 200,
            payload: base
        };
    }

    try {
        if (redis.status !== "ready") {
            await redis.connect();
        }

        return {
            httpStatus: 200,
            payload: {
                service: "domino2-server",
                redis: "ready",
                status: "ok"
            }
        };
    } catch (error) {
        return {
            httpStatus: isProduction ? 503 : 200,
            payload: {
                service: "domino2-server",
                redis: "unavailable",
                status: isProduction ? "unhealthy" : "degraded",
                error: error instanceof Error ? error.message : String(error || "redis unavailable")
            }
        };
    }
}

module.exports = {
    buildReadinessHealth
};
