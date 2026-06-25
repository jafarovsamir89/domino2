const { Schema, type } = require("@colyseus/schema");

class Player extends Schema {
    constructor() {
        super();
        this.name = "";
        this.userId = "";
        this.score = 0;
        this.roundWins = 0;
        this.handCount = 0;
        this.isConnected = true;
        this.isBot = false;
        this.avatarUrl = "";
        this.seatIndex = -1;
        // --- Bot Takeover (feature-flagged) ---
        // controller: who is currently acting for this seat — "human" or "bot".
        // An original AI opponent keeps controller === "human" and isBot === true;
        // only a SUBSTITUTE bot for an absent human sets controller === "bot".
        this.controller = "human";
        // takeoverActive: true while a substitute bot is playing this human's seat.
        this.takeoverActive = false;
        // takeoverReason: "disconnect" | "page_close" | "idle" (for UI/analytics).
        this.takeoverReason = "";
        // takeoverSince: epoch ms when the bot took over (debounce reclaim).
        this.takeoverSince = 0;
    }
}
type("string")(Player.prototype, "name");
type("string")(Player.prototype, "userId");
type("number")(Player.prototype, "score");
type("number")(Player.prototype, "roundWins");
type("number")(Player.prototype, "handCount");
type("boolean")(Player.prototype, "isConnected");
type("boolean")(Player.prototype, "isBot");
type("string")(Player.prototype, "avatarUrl");
type("number")(Player.prototype, "seatIndex");
type("string")(Player.prototype, "controller");
type("boolean")(Player.prototype, "takeoverActive");
type("string")(Player.prototype, "takeoverReason");
type("number")(Player.prototype, "takeoverSince");

class GameState extends Schema {
    constructor() {
        super();
        this.currentPlayerIndex = 0;
        this.boneyardCount = 0;
        this.gameActive = false;
        this.matchRound = 1;
        this.deal = 1;
        this.gameMode = "telefon";
        this.mode = "telefon";
        this.matchStateJson = "";
        this.boardJson = "{}"; // Send complex board state as JSON for now
        this.isTeamMode = false;
        this.playerCount = 2;
        this.turnDeadlineAt = 0;
        this.turnDurationMs = 0;
        this.serverNow = 0;
        this.turnVersion = 1;
        this.matchOver = false;
        this.gameOverReason = "";
        this.gameOverPlayerName = "";
        this.gameOverWinnerIndex = -1;
        this.gameOverSummaryJson = "";
    }
}
type("number")(GameState.prototype, "currentPlayerIndex");
type("number")(GameState.prototype, "boneyardCount");
type("boolean")(GameState.prototype, "gameActive");
type("number")(GameState.prototype, "matchRound");
type("number")(GameState.prototype, "deal");
type("string")(GameState.prototype, "gameMode");
type("string")(GameState.prototype, "mode");
type("string")(GameState.prototype, "matchStateJson");
type("string")(GameState.prototype, "boardJson");
type("boolean")(GameState.prototype, "isTeamMode");
type("number")(GameState.prototype, "playerCount");
type("number")(GameState.prototype, "turnDeadlineAt");
type("number")(GameState.prototype, "turnDurationMs");
type("number")(GameState.prototype, "serverNow");
type("number")(GameState.prototype, "turnVersion");
type("boolean")(GameState.prototype, "matchOver");
type("string")(GameState.prototype, "gameOverReason");
type("string")(GameState.prototype, "gameOverPlayerName");
type("number")(GameState.prototype, "gameOverWinnerIndex");
type("string")(GameState.prototype, "gameOverSummaryJson");

module.exports = { GameState, Player };
