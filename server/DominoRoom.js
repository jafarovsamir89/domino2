const { Room } = require("colyseus");
const { GameState, Player } = require("./schema/GameState");
const { Board } = require("./board");
const { Tile, createFullSet, shuffle, getHandSize, determineFirstPlayer, handPoints, roundTo5 } = require("./model");

const TARGET = 365, MAX_R = 3, DLOSS = 255, IWIN = 35;

function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
}

class DominoRoom extends Room {
    maxClients = 2;

    onCreate(options) {
        // Use short room code if not already set
        if (!this.roomId || this.roomId.length > 6) {
            this.roomId = generateRoomCode();
        }

        this.setState(new GameState());
        this.state.isTeamMode = options.isTeamMode === true;
        this.numPlayers = options.playerCount || 2;
        if (this.state.isTeamMode) {
            this.maxClients = 4;
            this.numPlayers = 4;
        } else {
            this.maxClients = Math.min(Math.max(this.numPlayers, 2), 4);
        }
        this.state.playerCount = this.maxClients;
        
        this.hands = [];
        this.boneyard = [];
        this.internalBoard = new Board();
        this.lastDealWinner = null;
        this.dlossThreshold = options.dlossThreshold || DLOSS;
        this.instantWinEnabled = options.instantWinEnabled !== false;

        this.onMessage("play", (client, message) => this.handlePlay(client, message));
        this.onMessage("draw", (client) => this.handleDraw(client));
        this.onMessage("pass", (client) => this.handlePass(client));
        this.onMessage("gosha", (client) => this.handleGosha(client));
        this.onMessage("next_deal", (client) => this.handleNextDeal(client));

        console.log(`[ROOM] Created room ${this.roomId}, maxClients=${this.maxClients}, teamMode=${this.state.isTeamMode}`);
    }

    onJoin(client, options) {
        console.log(`[ROOM] Client ${client.sessionId} joining with name: ${options.name}`);
        const player = new Player();
        player.name = options.name || "Player";
        this.state.players.set(client.sessionId, player);
        this.state.playerOrder.push(client.sessionId);

        console.log(`[ROOM] Current player count: ${this.clients.length} / ${this.maxClients}`);
        if (this.clients.length === this.maxClients) {
            console.log(`[ROOM] Room full. Starting game...`);
            this.startGame();
        }
    }

    async onLeave(client, consented) {
        console.log(`[ROOM] Client ${client.sessionId} left (consented: ${consented})`);
        const player = this.state.players.get(client.sessionId);
        if (player) player.isConnected = false;

        try {
            if (consented) throw new Error("consented leave");
            console.log(`[ROOM] Waiting for reconnection for ${client.sessionId}...`);
            await this.allowReconnection(client, 60);
            player.isConnected = true;
            console.log(`[ROOM] Client ${client.sessionId} reconnected!`);
        } catch (e) {
            console.log(`[ROOM] Client ${client.sessionId} removed permanently.`);
            this.state.players.delete(client.sessionId);
            const idx = this.state.playerOrder.indexOf(client.sessionId);
            if (idx !== -1) this.state.playerOrder.splice(idx, 1);
        }
    }

    startGame() {
        this.state.matchRound = 1;
        this.state.deal = 1;
        this.startDeal();
    }

    startDeal() {
        this.internalBoard = new Board();
        this.state.gameActive = true;
        
        const all = shuffle(createFullSet());
        const hs = getHandSize(this.maxClients);
        this.hands = [];
        let idx = 0;
        for (let p = 0; p < this.maxClients; p++) {
            this.hands.push(all.slice(idx, idx + hs));
            idx += hs;
        }
        this.boneyard = all.slice(idx);
        
        if (this.lastDealWinner !== null) {
            this.state.currentPlayerIndex = this.lastDealWinner;
        } else {
            const f = determineFirstPlayer(this.hands);
            this.state.currentPlayerIndex = f.player;
        }
        
        this.syncState();
    }

    getPlayerIndex(client) {
        return this.state.playerOrder.indexOf(client.sessionId);
    }

    syncState() {
        this.state.boneyardCount = this.boneyard.length;
        this.state.boardJson = JSON.stringify(this.internalBoard);
        
        // Send private hand data to each client
        for (let i = 0; i < this.clients.length; i++) {
            const client = this.clients[i];
            const pIdx = this.getPlayerIndex(client);
            if (pIdx !== -1 && this.hands[pIdx]) {
                const player = this.state.players.get(client.sessionId);
                if (player) player.handCount = this.hands[pIdx].length;
                client.send("hand", this.hands[pIdx]);
            }
        }
        
        // Broadcast valid moves to the current player
        const cpSession = this.state.playerOrder[this.state.currentPlayerIndex];
        const cpClient = this.clients.find(c => c.sessionId === cpSession);
        if (cpClient && this.hands[this.state.currentPlayerIndex]) {
            const validMoves = this.internalBoard.getValidMoves(this.hands[this.state.currentPlayerIndex]);
            const goshaCombo = this.internalBoard.getGoshaCombo(this.hands[this.state.currentPlayerIndex]);
            cpClient.send("turn_info", { validMoves, goshaCombo });
        }
    }

    handlePlay(client, message) {
        if (!this.state.gameActive) return;
        const pi = this.getPlayerIndex(client);
        if (pi !== this.state.currentPlayerIndex) return;

        const { tileIndex, openEndIndex } = message;
        const hand = this.hands[pi];
        const tile = hand[tileIndex];
        
        if (!tile) return;
        
        // Validate
        const moves = this.internalBoard.getValidMoves(hand);
        const isValid = moves.some(m => m.tileIndex === tileIndex && m.openEndIndex === openEndIndex);
        if (!isValid) return;

        hand.splice(tileIndex, 1);
        this.broadcast("sound", "place");
        
        let score = this.internalBoard.isEmpty ? this.internalBoard.placeFirst(tile) : this.internalBoard.placeTile(tile, openEndIndex);
        
        if (score > 0) this.addScore(pi, score);
        
        // Check instant win
        if (this.instantWinEnabled && score >= IWIN) {
            this.endRound(pi, true);
            return;
        }
        
        if (hand.length === 0) {
            this.endDeal(pi, false);
            return;
        }
        if (this.internalBoard.isBlocked(this.hands, this.boneyard)) {
            this.endDeal(this.findFishWinner(), true);
            return;
        }
        
        this.advanceTurn();
    }

    handleDraw(client) {
        if (!this.state.gameActive) return;
        const pi = this.getPlayerIndex(client);
        if (pi !== this.state.currentPlayerIndex) return;

        if (this.internalBoard.canPlayAny(this.hands[pi])) return;
        if (!this.boneyard.length) return;

        this.hands[pi].push(this.boneyard.pop());
        this.broadcast("sound", "draw");
        this.broadcast("msg", { text: `${this.state.players.get(client.sessionId).name} взял кость`, time: 1500 });
        this.syncState();
    }

    handlePass(client) {
        if (!this.state.gameActive) return;
        const pi = this.getPlayerIndex(client);
        if (pi !== this.state.currentPlayerIndex) return;

        if (this.internalBoard.canPlayAny(this.hands[pi])) return;
        if (this.boneyard.length > 0) return;

        this.broadcast("sound", "pass");
        this.broadcast("msg", { text: `${this.state.players.get(client.sessionId).name} пас`, time: 1500 });
        this.advanceTurn();
    }

    handleGosha(client) {
        if (!this.state.gameActive) return;
        const pi = this.getPlayerIndex(client);
        if (pi !== this.state.currentPlayerIndex) return;

        const combo = this.internalBoard.getGoshaCombo(this.hands[pi]);
        if (!combo) return;

        this.broadcast("sound", "gosha");
        const hand = this.hands[pi];
        const matches = combo.matches;
        const sorted = [...matches].sort((a, b) => b.tileIndex - a.tileIndex);
        const tiles = sorted.map(m => hand[m.tileIndex]);
        for (const m of sorted) hand.splice(m.tileIndex, 1);
        
        const bySorted = [...matches].sort((a, b) => b.openEndIndex - a.openEndIndex);
        let score = 0;
        for (const m of bySorted) {
            const tile = tiles.find(t => t.isDouble && t.a === this.internalBoard.openEnds[m.openEndIndex].value);
            score = this.internalBoard.placeTile(tile, m.openEndIndex);
        }

        if (score > 0) this.addScore(pi, score);
        this.broadcast("msg", { text: `${this.state.players.get(client.sessionId).name} Гоша ×${matches.length}! +${score}`, time: 2000 });

        // Check instant win
        if (this.instantWinEnabled && score >= IWIN) {
            this.endRound(pi, true);
            return;
        }

        if (hand.length === 0) {
            this.endDeal(pi, false);
            return;
        }
        if (this.internalBoard.isBlocked(this.hands, this.boneyard)) {
            this.endDeal(this.findFishWinner(), true);
            return;
        }

        this.advanceTurn();
    }

    handleNextDeal(client) {
        // Only proceed if game is not active (waiting for next deal)
        if (this.state.gameActive) return;
        this.startDeal();
    }

    advanceTurn() {
        if (this.internalBoard.isBlocked(this.hands, this.boneyard)) {
            this.endDeal(this.findFishWinner(), true);
            return;
        }
        this.state.currentPlayerIndex = (this.state.currentPlayerIndex + 1) % this.maxClients;
        this.syncState();
    }

    addScore(pi, score) {
        const sessionId = this.state.playerOrder[pi];
        const player = this.state.players.get(sessionId);
        if (player) player.score += score;
        
        if (this.state.isTeamMode) {
            const team = pi % 2;
            this.state.teamScores[team] += score;
        }
        this.broadcast("sound", "score");
        this.broadcast("score_popup", score);
        this.broadcast("msg", { text: `${player.name} +${score}!`, time: 2000 });
    }

    findFishWinner() {
        if (this.state.isTeamMode) {
            const t0 = handPoints(this.hands[0]) + handPoints(this.hands[2]);
            const t1 = handPoints(this.hands[1]) + handPoints(this.hands[3]);
            const winningTeam = t0 <= t1 ? 0 : 1;
            const players = winningTeam === 0 ? [0, 2] : [1, 3];
            let minP = Infinity, bestP = players[0];
            for (const pIdx of players) {
                const p = handPoints(this.hands[pIdx]);
                if (p < minP) { minP = p; bestP = pIdx; }
            }
            return bestP;
        }
        let min = Infinity, w = 0;
        for (let i = 0; i < this.maxClients; i++) {
            const p = handPoints(this.hands[i]);
            if (p < min) { min = p; w = i; }
        }
        return w;
    }

    endDeal(wi, fish) {
        this.state.gameActive = false;
        this.lastDealWinner = wi;
        let bonus = 0;

        if (this.state.isTeamMode) {
            const wt = wi % 2;
            let os = 0;
            for (let i = 0; i < 4; i++) if (i % 2 !== wt) os += handPoints(this.hands[i]);
            if (fish) for (let i = 0; i < 4; i++) if (i % 2 === wt) os -= handPoints(this.hands[i]);
            bonus = roundTo5(Math.max(0, os));
            this.state.teamScores[wt] += bonus;
            const winnerSession = this.state.playerOrder[wi];
            if (this.state.players.get(winnerSession)) this.state.players.get(winnerSession).score += bonus;
        } else {
            let os = 0;
            for (let i = 0; i < this.maxClients; i++) if (i !== wi) os += handPoints(this.hands[i]);
            if (fish) os -= handPoints(this.hands[wi]);
            bonus = roundTo5(Math.max(0, os));
            const winnerSession = this.state.playerOrder[wi];
            if (this.state.players.get(winnerSession)) this.state.players.get(winnerSession).score += bonus;
        }

        this.broadcast("sound", "win");
        
        // Check for round win (target score reached)
        const cs = this.state.isTeamMode ? Math.max(...this.state.teamScores) : Math.max(...Array.from(this.state.players.values()).map(p => p.score));
        if (cs >= TARGET) {
            const rw = this.state.isTeamMode ? this.state.teamScores.indexOf(Math.max(...this.state.teamScores)) : 
                       this.state.playerOrder.findIndex(s => this.state.players.get(s).score >= TARGET);
            this.endRound(this.state.isTeamMode ? (rw === 0 ? 0 : 1) : rw, false);
            return;
        }

        // Notify clients to show deal end screen
        this.broadcast("deal_end", { winnerIndex: wi, fish, bonus, hands: this.hands });
        this.state.deal++;
        this.syncState();
    }

    endRound(wi, isInstantWin) {
        this.state.gameActive = false;
        let wins = 1;

        if (this.state.isTeamMode) {
            const wt = wi % 2;
            const loserTeamScore = this.state.teamScores[1 - wt];
            if (loserTeamScore < this.dlossThreshold) wins = 2;
            if (isInstantWin) wins = 2;
            this.state.teamRoundWins[wt] += wins;
        } else {
            for (let i = 0; i < this.maxClients; i++) {
                if (i !== wi) {
                    const sid = this.state.playerOrder[i];
                    const pScore = this.state.players.get(sid) ? this.state.players.get(sid).score : 0;
                    if (pScore < this.dlossThreshold) { wins = 2; break; }
                }
            }
            if (isInstantWin) wins = 2;
            const winnerSid = this.state.playerOrder[wi];
            if (this.state.players.get(winnerSid)) this.state.players.get(winnerSid).roundWins += wins;
        }

        const isMatchOver = this.state.matchRound >= MAX_R;

        // Build player data for the round end screen
        const playerData = [];
        for (let i = 0; i < this.state.playerOrder.length; i++) {
            const sid = this.state.playerOrder[i];
            const p = this.state.players.get(sid);
            playerData.push({
                name: p ? p.name : "Player",
                score: p ? p.score : 0,
                roundWins: p ? p.roundWins : 0,
                isWinner: i === wi
            });
        }

        this.broadcast("round_end", {
            winnerIndex: wi,
            wins,
            isInstantWin: !!isInstantWin,
            isMatchOver,
            matchRound: this.state.matchRound,
            isTeamMode: this.state.isTeamMode,
            teamScores: Array.from(this.state.teamScores),
            teamRoundWins: Array.from(this.state.teamRoundWins),
            players: playerData
        });

        this.state.matchRound++;
    }
}

module.exports = DominoRoom;