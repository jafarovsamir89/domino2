const express = require("express");
const cors = require("cors");
const http = require("http");
const path = require("path");
const { Server } = require("colyseus");
const DominoRoom = require("./DominoRoom");

const port = process.env.PORT || 2567;
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "..", "www")));

app.get("/health", (req, res) => {
    res.send("Domino Telefon Server is running!");
});

const server = http.createServer(app);
const gameServer = new Server({
    server,
});

gameServer.define('domino', DominoRoom);

gameServer.listen(port);
console.log(`[GameServer] Listening on http://localhost:${port}`);
