const express = require("express");
const cors = require("cors");
const http = require("http");
const path = require("path");
const Redis = require("ioredis");
const { Server } = require("colyseus");
const { RedisPresence } = require("@colyseus/redis-presence");
const { RedisDriver } = require("@colyseus/redis-driver");
const DominoRoom = require("./DominoRoom");
const { getLiveSummary, getOpenRooms, getLiveSession } = require("./livePresence");
const { resolveRoomIdByCode, resolveRoomCodeById } = require("./roomRegistry");
const { buildReadinessHealth } = require("./health");

const port = process.env.PORT || 2567;
const redisUrl = process.env.REDIS_URI || "";
const isProduction = process.env.NODE_ENV === "production";
if (isProduction && !redisUrl && process.env.ALLOW_IN_MEMORY_PRESENCE !== "true") {
    throw new Error("REDIS_URI is required in production. Set ALLOW_IN_MEMORY_PRESENCE=true only for local/dev testing.");
}
const app = express();
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
        console.warn("[Redis] Game server redis unavailable:", err.message);
    });
}

function parseJsonIceServers(raw) {
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed)) return [];
        return parsed
            .filter((entry) => entry && Array.isArray(entry.urls) && entry.urls.length > 0)
            .map((entry) => ({
                urls: entry.urls.map((url) => String(url || "").trim()).filter(Boolean),
                username: entry.username ? String(entry.username).trim() : undefined,
                credential: entry.credential ? String(entry.credential).trim() : undefined
            }))
            .filter((entry) => entry.urls.length > 0);
    } catch (err) {
        console.warn("[Voice] Invalid VOICE_ICE_SERVERS_JSON:", err.message);
        return [];
    }
}

function buildVoiceConfig() {
    const defaultIceServers = [
        { urls: ["stun:stun.l.google.com:19302"] },
        { urls: ["stun:global.stun.twilio.com:3478"] }
    ];
    const servers = [...defaultIceServers, ...parseJsonIceServers(process.env.VOICE_ICE_SERVERS_JSON || "")];
    const turnUrls = String(process.env.VOICE_TURN_URLS || process.env.TURN_URLS || "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
    const turnUsername = String(process.env.VOICE_TURN_USERNAME || process.env.TURN_USERNAME || "").trim();
    const turnCredential = String(process.env.VOICE_TURN_CREDENTIAL || process.env.TURN_CREDENTIAL || "").trim();

    if (turnUrls.length > 0) {
        servers.push({
            urls: turnUrls,
            ...(turnUsername ? { username: turnUsername } : {}),
            ...(turnCredential ? { credential: turnCredential } : {})
        });
    }

    const deduped = [];
    const seen = new Set();
    for (const server of servers) {
        const urls = Array.isArray(server.urls) ? server.urls.map((url) => String(url || "").trim()).filter(Boolean) : [];
        if (!urls.length) continue;
        const key = JSON.stringify({
            urls,
            username: server.username || "",
            credential: server.credential || ""
        });
        if (seen.has(key)) continue;
        seen.add(key);
        deduped.push({
            urls,
            ...(server.username ? { username: server.username } : {}),
            ...(server.credential ? { credential: server.credential } : {})
        });
    }

    return {
        iceServers: deduped,
        iceTransportPolicy: String(process.env.VOICE_ICE_TRANSPORT_POLICY || "").trim() || "all",
        iceCandidatePoolSize: Math.max(0, Math.min(8, Number(process.env.VOICE_ICE_CANDIDATE_POOL_SIZE || 2) || 2))
    };
}

const voiceConfig = buildVoiceConfig();

async function getRedisClient() {
    if (!redis) return null;
    try {
        if (redis.status !== "ready") {
            await redis.connect();
        }
        return redis;
    } catch (err) {
        console.warn("[Redis] Game server connect failed:", err.message);
        return null;
    }
}

function createRateLimiter(limit, windowMs, namespace) {
    const buckets = new Map();
    return (req, res, next) => {
        void (async () => {
            const now = Date.now();
            const key = `${req.ip}:${req.path}`;
            const client = await getRedisClient();

            if (!client) {
                const current = buckets.get(key);
                if (!current || current.resetAt <= now) {
                    buckets.set(key, { count: 1, resetAt: now + windowMs });
                    next();
                    return;
                }
                if (current.count >= limit) {
                    res.setHeader("Retry-After", Math.ceil((current.resetAt - now) / 1000));
                    res.status(429).json({ error: "Too many requests" });
                    return;
                }
                current.count += 1;
                next();
                return;
            }

            const redisKey = `domino:ratelimit:${namespace}:${key}`;
            const current = await client.incr(redisKey);
            if (current === 1) {
                await client.pexpire(redisKey, windowMs);
            }
            if (current > limit) {
                const ttl = await client.pttl(redisKey).catch(() => windowMs);
                res.setHeader("Retry-After", Math.max(1, Math.ceil(Math.max(ttl, 0) / 1000)));
                res.status(429).json({ error: "Too many requests" });
                return;
            }
            next();
        })().catch((err) => {
            console.warn("[RateLimit] Game limiter fallback:", err.message);
            next();
        });
    };
}

const allowedOrigins = new Set(
    [
        "http://localhost:3000",
        "http://localhost:3001",
        "http://localhost:2567",
        "https://gamed.simplesoft.az",
        "https://apid.simplesoft.az",
        "https://admind.simplesoft.az",
        ...(process.env.ALLOWED_ORIGINS || "")
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean)
    ]
);

app.set("trust proxy", 1);
app.use(cors({
    origin(origin, callback) {
        if (!origin || allowedOrigins.has(origin)) {
            callback(null, true);
            return;
        }
        callback(new Error(`Origin ${origin} is not allowed by CORS`));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Accept", "Origin"]
}));
app.use(createRateLimiter(300, 60 * 1000, "game"));
app.use(express.json({ limit: "2mb" }));

const wwwRoot = path.join(__dirname, "..", "www");
app.use(express.static(wwwRoot, {
    setHeaders(res, filePath) {
        const ext = path.extname(filePath).toLowerCase();
        if (ext === ".html") {
            res.setHeader("Content-Type", "text/html; charset=UTF-8");
        } else if (ext === ".js") {
            res.setHeader("Content-Type", "application/javascript; charset=UTF-8");
        } else if (ext === ".css") {
            res.setHeader("Content-Type", "text/css; charset=UTF-8");
        } else if (ext === ".json" || ext === ".webmanifest") {
            res.setHeader("Content-Type", "application/json; charset=UTF-8");
        }
    }
}));

function legacyAuthGone(res) {
    res.status(410).json({
        error: "Legacy auth has been removed. Use the platform login at /login."
    });
}

app.get("/health", (req, res) => {
    res.send("Domino Telefon Server is running!");
});

app.get("/health/ready", async (req, res) => {
    const health = await buildReadinessHealth({ redis, isProduction });
    res.status(health.httpStatus).json(health.payload);
});

app.post("/api/auth/guest", (req, res) => {
    legacyAuthGone(res);
});

app.post("/api/auth/register", (req, res) => {
    legacyAuthGone(res);
});

app.post("/api/auth/login", (req, res) => {
    legacyAuthGone(res);
});

app.post("/api/auth/logout", (req, res) => {
    legacyAuthGone(res);
});

app.get("/api/me", (req, res) => {
    legacyAuthGone(res);
});

app.get("/api/leaderboard", (req, res) => {
    legacyAuthGone(res);
});

app.post("/api/matches", (req, res) => {
    legacyAuthGone(res);
});

app.get("/room-id/:code", (req, res) => {
    void (async () => {
        const code = String(req.params.code || "").trim().toUpperCase();
        if (!code || !/^[A-Z2-9]{4,12}$/.test(code)) {
            res.status(400).json({ error: "Missing code" });
            return;
        }
        const roomId = await resolveRoomIdByCode(code);
        if (!roomId) {
            res.status(404).json({ error: "Room not found" });
            return;
        }
        res.json({ code, roomId });
    })().catch((err) => {
        console.error("[GameServer] room-id lookup failed:", err);
        res.status(500).json({ error: "Room lookup failed" });
    });
});

app.get("/room-code/:roomId", (req, res) => {
    void (async () => {
        const roomId = String(req.params.roomId || "").trim();
        if (!roomId || roomId.length > 128) {
            res.status(400).json({ error: "Missing roomId" });
            return;
        }
        const roomCode = await resolveRoomCodeById(roomId);
        if (!roomCode) {
            res.status(404).json({ error: "Room not found" });
            return;
        }
        res.json({ roomId, roomCode });
    })().catch((err) => {
        console.error("[GameServer] room-code lookup failed:", err);
        res.status(500).json({ error: "Room lookup failed" });
    });
});

app.get("/api/realtime/summary", async (req, res) => {
    res.json(await getLiveSummary());
});

app.get("/api/realtime/players", async (req, res) => {
    const summary = await getLiveSummary();
    res.json({
        items: summary.players,
        counts: summary.counts,
        rooms: summary.rooms
    });
});

app.get("/api/realtime/sessions/:sessionId", async (req, res) => {
    const sessionId = String(req.params.sessionId || "").trim();
    if (!sessionId) {
        res.status(400).json({ error: "Missing sessionId" });
        return;
    }

    const item = await getLiveSession(sessionId);
    res.json({ item });
});

app.get("/api/realtime/rooms", async (req, res) => {
    res.json(await getOpenRooms(req.query));
});

app.get("/api/voice/config", (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.json({
        ...voiceConfig,
        hasTurn: voiceConfig.iceServers.some((server) =>
            Array.isArray(server.urls) && server.urls.some((url) => String(url).startsWith("turn:"))
        )
    });
});

const server = http.createServer(app);
const gameServerOptions = {
    server,
    gracefullyShutdown: false,
};

if (redisUrl) {
    gameServerOptions.presence = new RedisPresence(redisUrl);
    gameServerOptions.driver = new RedisDriver(redisUrl);
} else {
    console.warn("[GameServer] REDIS_URI not set, using local presence and driver");
}

const gameServer = new Server(gameServerOptions);

gameServer.define('domino', DominoRoom);

const shutdown = async () => {
    try {
        await gameServer.gracefullyShutdown();
    } catch (err) {
        console.error("[GameServer] Shutdown error:", err);
    }
    process.exit(0);
};

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);

if (require.main === module) {
    gameServer.listen(port);
    console.info(`[GameServer] Listening on http://localhost:${port}`);
}
