const { Schema, type, MapSchema, ArraySchema } = require("@colyseus/schema");

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

class GameState extends Schema {
    constructor() {
        super();
        this.players = new MapSchema();
        this.playerOrder = new ArraySchema();
        this.currentPlayerIndex = 0;
        this.boneyardCount = 0;
        this.gameActive = false;
        this.matchRound = 1;
        this.deal = 1;
        this.boardJson = "{}"; // Send complex board state as JSON for now
        this.isTeamMode = false;
        this.playerCount = 2;
        this.turnDeadlineAt = 0;
        this.matchOver = false;
        this.gameOverReason = "";
        this.gameOverPlayerName = "";
        this.gameOverWinnerIndex = -1;
        this.gameOverSummaryJson = "";
        this.teamScores = new ArraySchema(0, 0);
        this.teamRoundWins = new ArraySchema(0, 0);
    }
}
type({ map: Player })(GameState.prototype, "players");
type(["string"])(GameState.prototype, "playerOrder");
type("number")(GameState.prototype, "currentPlayerIndex");
type("number")(GameState.prototype, "boneyardCount");
type("boolean")(GameState.prototype, "gameActive");
type("number")(GameState.prototype, "matchRound");
type("number")(GameState.prototype, "deal");
type("string")(GameState.prototype, "boardJson");
type("boolean")(GameState.prototype, "isTeamMode");
type("number")(GameState.prototype, "playerCount");
type("number")(GameState.prototype, "turnDeadlineAt");
type("boolean")(GameState.prototype, "matchOver");
type("string")(GameState.prototype, "gameOverReason");
type("string")(GameState.prototype, "gameOverPlayerName");
type("number")(GameState.prototype, "gameOverWinnerIndex");
type("string")(GameState.prototype, "gameOverSummaryJson");
type(["number"])(GameState.prototype, "teamScores");
type(["number"])(GameState.prototype, "teamRoundWins");

module.exports = { GameState, Player };
