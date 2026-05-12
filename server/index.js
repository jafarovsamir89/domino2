const express = require("express");
const cors = require("cors");
const http = require("http");
const path = require("path");
const { Server } = require("colyseus");
const { RedisPresence } = require("@colyseus/redis-presence");
const { RedisDriver } = require("@colyseus/redis-driver");
const DominoRoom = require("./DominoRoom");
const { getLiveSummary, getOpenRooms } = require("./livePresence");

const port = process.env.PORT || 2567;
const redisUrl = process.env.REDIS_URI || "";
const app = express();
global.__DOMINO_ROOM_CODES = global.__DOMINO_ROOM_CODES || new Map();
global.__DOMINO_ROOM_IDS = global.__DOMINO_ROOM_IDS || new Map();

function createRateLimiter(limit, windowMs) {
    const buckets = new Map();
    return (req, res, next) => {
        const now = Date.now();
        const key = `${req.ip}:${req.path}`;
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
app.use(createRateLimiter(300, 60 * 1000));
app.use(express.json({ limit: "100kb" }));

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
    const code = String(req.params.code || "").trim().toUpperCase();
    if (!code || !/^[A-Z2-9]{4,12}$/.test(code)) {
        res.status(400).json({ error: "Missing code" });
        return;
    }
    const roomId = global.__DOMINO_ROOM_CODES.get(code);
    if (!roomId) {
        res.status(404).json({ error: "Room not found" });
        return;
    }
    res.json({ code, roomId });
});

app.get("/room-code/:roomId", (req, res) => {
    const roomId = String(req.params.roomId || "").trim();
    if (!roomId || roomId.length > 128) {
        res.status(400).json({ error: "Missing roomId" });
        return;
    }
    const roomCode = global.__DOMINO_ROOM_IDS.get(roomId);
    if (!roomCode) {
        res.status(404).json({ error: "Room not found" });
        return;
    }
    res.json({ roomId, roomCode });
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

app.get("/api/realtime/rooms", async (req, res) => {
    res.json(await getOpenRooms(req.query));
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

gameServer.listen(port);
console.log(`[GameServer] Listening on http://localhost:${port}`);
