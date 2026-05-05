const express = require("express");
const cors = require("cors");
const http = require("http");
const path = require("path");
const { Server } = require("colyseus");
const DominoRoom = require("./DominoRoom");

const port = process.env.PORT || 2567;
const app = express();
global.__DOMINO_ROOM_CODES = global.__DOMINO_ROOM_CODES || new Map();
global.__DOMINO_ROOM_IDS = global.__DOMINO_ROOM_IDS || new Map();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "www")));

app.get("/health", (req, res) => {
    res.send("Domino Telefon Server is running!");
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
