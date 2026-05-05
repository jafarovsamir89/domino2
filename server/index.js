const express = require("express");
const cors = require("cors");
const http = require("http");
const path = require("path");
const { Server } = require("colyseus");
const DominoRoom = require("./DominoRoom");
const accountStore = require("./accountStore");

const port = process.env.PORT || 2567;
const app = express();
global.__DOMINO_ROOM_CODES = global.__DOMINO_ROOM_CODES || new Map();
global.__DOMINO_ROOM_IDS = global.__DOMINO_ROOM_IDS || new Map();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "www")));

function readAuthToken(req) {
    const header = String(req.headers.authorization || "").trim();
    if (header.toLowerCase().startsWith("bearer ")) {
        return header.slice(7).trim();
    }
    const bodyToken = String(req.body?.token || "").trim();
    const queryToken = String(req.query?.token || "").trim();
    return bodyToken || queryToken;
}

app.get("/health", (req, res) => {
    res.send("Domino Telefon Server is running!");
});

app.post("/api/auth/guest", (req, res) => {
    try {
        const { token, user } = accountStore.createGuest(req.body?.name);
        res.json({ token, user });
    } catch (err) {
        res.status(400).json({ error: err.message || "Unable to create guest profile" });
    }
});

app.post("/api/auth/register", (req, res) => {
    try {
        const { token, user } = accountStore.register(req.body?.name, req.body?.password);
        res.json({ token, user });
    } catch (err) {
        res.status(400).json({ error: err.message || "Unable to register" });
    }
});

app.post("/api/auth/login", (req, res) => {
    try {
        const { token, user } = accountStore.login(req.body?.name, req.body?.password);
        res.json({ token, user });
    } catch (err) {
        res.status(401).json({ error: err.message || "Invalid credentials" });
    }
});

app.get("/api/me", (req, res) => {
    const profile = accountStore.getProfile(readAuthToken(req));
    if (!profile) {
        res.status(401).json({ error: "Not authenticated" });
        return;
    }
    res.json({ user: profile });
});

app.get("/api/leaderboard", (req, res) => {
    const limit = parseInt(req.query.limit || "10", 10);
    res.json({ leaderboard: accountStore.getLeaderboard(limit) });
});

app.post("/api/matches", (req, res) => {
    try {
        const payload = req.body || {};
        const authToken = readAuthToken(req);
        const profile = accountStore.getProfile(authToken);
        const matchPayload = {
            ...payload,
            // Allow the caller to omit the user id when the token is known.
            participants: Array.isArray(payload.participants)
                ? payload.participants.map((participant) => {
                    if (participant.userId) return participant;
                    if (profile && participant.isSelf) {
                        return { ...participant, userId: profile.id };
                    }
                    return participant;
                })
                : []
        };
        const match = accountStore.recordMatch(matchPayload);
        res.json({ ok: true, match });
    } catch (err) {
        res.status(400).json({ error: err.message || "Unable to record match" });
    }
});

app.get("/room-id/:code", (req, res) => {
    const code = String(req.params.code || "").trim().toUpperCase();
    if (!code) {
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
    if (!roomId) {
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

const server = http.createServer(app);
const gameServer = new Server({
    server,
});

gameServer.define('domino', DominoRoom);

gameServer.listen(port);
console.log(`[GameServer] Listening on http://localhost:${port}`);
