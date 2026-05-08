const { Room } = require("colyseus");
const { GameState, Player } = require("./schema/GameState");
const { Board } = require("./board");
const { AIPlayer } = require("./ai");
const { Tile, createFullSet, shuffle, getHandSize, determineFirstPlayer, handPoints, roundTo5 } = require("./model");
const { verifyGameToken } = require("./platformAuth");
const { upsertLivePlayer, removeLivePlayer, setRoomGameActive, removeRoomPlayers } = require("./livePresence");

const TARGET = 365, MAX_R = 3, DLOSS = 255, IWIN = 35;

function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
}

function sanitizeName(name) {
    return String(name || "Player").replace(/[<>&"']/g, "").trim().slice(0, 12) || "Player";
}

class DominoRoom extends Room {
    maxClients = 2;

    onCreate(options) {
        this.roomCode = generateRoomCode();
        global.__DOMINO_ROOM_CODES?.set(this.roomCode, this.roomId);
        global.__DOMINO_ROOM_IDS?.set(this.roomId, this.roomCode);

        this.setState(new GameState());
        this.state.isTeamMode = options.isTeamMode === true;
        this.totalPlayers = this.state.isTeamMode ? 4 : Math.min(Math.max(options.playerCount || 2, 2), 4);
        this.aiCount = Math.min(Math.max(options.aiCount || 0, 0), this.totalPlayers - 1);
        this.humanSeats = this.totalPlayers - this.aiCount;
        this.maxClients = this.humanSeats;
        this.state.playerCount = this.totalPlayers;
        
        this.hands = [];
        this.boneyard = [];
        this.internalBoard = new Board();
        this.lastDealWinner = null;
        this.dlossThreshold = options.dlossThreshold || DLOSS;
        this.instantWinEnabled = options.instantWinEnabled !== false;
        this.aiDifficulty = options.difficulty || "medium";
        this.currentStakeKey = String(options.stakeKey || "free").trim() || "free";
        this.economyReservationMade = false;
        this.currentDealMatchId = "";
        this.currentDealStakeKey = this.currentStakeKey;
        this.currentDealStakeAmount = 0;
        this.currentDealBankAmount = 0;
        this.pendingEconomySettlement = Promise.resolve();
        this.botTimer = null;
        this.botIds = [];
        this.aiPlayers = new Map();
        this.matchRecorded = false;
        this.forfeitSettlementMade = false;
        this.identityBySessionId = new Map();

        this.onMessage("play", (client, message) => this.handlePlay(client, message));
        this.onMessage("draw", (client) => this.handleDraw(client));
        this.onMessage("pass", (client) => this.handlePass(client));
        this.onMessage("gosha", (client) => this.handleGosha(client));
        this.onMessage("next_deal", (client) => this.handleNextDeal(client));
        this.onMessage("reaction", (client, message) => this.handleReaction(client, message));

        console.log(`[ROOM] Created room ${this.roomId} (code ${this.roomCode}), humanSeats=${this.humanSeats}, totalPlayers=${this.totalPlayers}, aiCount=${this.aiCount}, teamMode=${this.state.isTeamMode}`);
    }

    onAuth(client, options, context) {
        const token = String(context?.token || options?.authToken || "").trim();
        const platformIdentity = verifyGameToken(token);
        if (platformIdentity) {
            return {
                provider: "platform",
                authToken: token,
                userId: platformIdentity.userId,
                playerId: platformIdentity.playerId,
                displayName: platformIdentity.displayName,
                role: platformIdentity.role
            };
        }

        return {
            provider: "guest",
            authToken: "",
            userId: "",
            playerId: "",
            displayName: sanitizeName(options?.name),
            role: "player"
        };
    }

    onJoin(client, options, auth) {
        const identity = auth || {};
        console.log(`[ROOM] Client ${client.sessionId} joining with name: ${options.name}`);
        const player = new Player();
        const authToken = String(identity.authToken || options.authToken || "").trim();
        player.name = sanitizeName(identity.displayName || options.name);
        player.userId = String(identity.userId || "");
        this.state.players.set(client.sessionId, player);
        this.state.playerOrder.push(client.sessionId);
        this.identityBySessionId.set(client.sessionId, {
            provider: identity.provider || "guest",
            authToken,
            userId: player.userId,
            displayName: player.name,
            playerId: identity.playerId || player.userId,
            role: identity.role || "player"
        });

        upsertLivePlayer(client.sessionId, {
            sessionId: client.sessionId,
            roomId: this.roomId,
            roomCode: this.roomCode,
            provider: identity.provider || "guest",
            userId: player.userId,
            playerId: identity.playerId || player.userId,
            displayName: player.name,
            role: identity.role || "player",
            isConnected: true,
            isPlaying: Boolean(this.state.gameActive),
            joinedAt: new Date().toISOString()
        });

        console.log(`[ROOM] Current player count: ${this.clients.length} / ${this.maxClients}`);
        this.broadcast("msg", { text: `${player.name} joined the room`, time: 1500 });
        this.broadcastRoomState();
        if (this.clients.length === this.maxClients) {
            console.log(`[ROOM] Room full. Starting game...`);
            void this.startGame();
        }
    }

    onDispose() {
        if (this.roomCode) {
            global.__DOMINO_ROOM_CODES?.delete(this.roomCode);
        }
        global.__DOMINO_ROOM_IDS?.delete(this.roomId);
        removeRoomPlayers(this.roomId);
        this.identityBySessionId.clear();
    }

    ensureBotPlayers() {
        if (!this.aiCount) return;
        for (let i = 0; i < this.aiCount; i++) {
            const botId = `bot-${i}`;
            if (this.state.players.has(botId)) continue;

            const bot = new Player();
            bot.name = `AI ${i + 1}`;
            bot.isBot = true;
            bot.isConnected = true;
            this.state.players.set(botId, bot);
            this.state.playerOrder.push(botId);
            this.botIds.push(botId);
            this.aiPlayers.set(botId, new AIPlayer(this.state.playerOrder.length - 1, this.aiDifficulty));
        }
        this.state.playerCount = this.totalPlayers;
    }

    async onLeave(client, consented) {
        console.log(`[ROOM] Client ${client.sessionId} left (consented: ${consented})`);
        const player = this.state.players.get(client.sessionId);
        if (player) player.isConnected = false;
        const identity = this.identityBySessionId.get(client.sessionId);
        if (identity) {
            upsertLivePlayer(client.sessionId, {
                sessionId: client.sessionId,
                roomId: this.roomId,
                roomCode: this.roomCode,
                provider: identity.provider || "guest",
                userId: identity.userId || "",
                playerId: identity.playerId || identity.userId || "",
                displayName: identity.displayName || player?.name || "Player",
                role: identity.role || "player",
                isConnected: false,
                isPlaying: Boolean(this.state.gameActive)
            });
        }

        try {
            if (consented) throw new Error("consented leave");
            console.log(`[ROOM] Waiting for reconnection for ${client.sessionId}...`);
            this.broadcastRoomState();
            await this.allowReconnection(client, 60);
            player.isConnected = true;
            if (identity) {
                upsertLivePlayer(client.sessionId, {
                    sessionId: client.sessionId,
                    roomId: this.roomId,
                    roomCode: this.roomCode,
                    provider: identity.provider || "guest",
                    userId: identity.userId || "",
                    playerId: identity.playerId || identity.userId || "",
                    displayName: identity.displayName || player?.name || "Player",
                    role: identity.role || "player",
                    isConnected: true,
                    isPlaying: Boolean(this.state.gameActive)
                });
            }
            console.log(`[ROOM] Client ${client.sessionId} reconnected!`);
            this.broadcast("msg", { text: `${player.name} reconnected`, time: 1500 });
            this.broadcastRoomState();
        } catch (e) {
            console.log(`[ROOM] Client ${client.sessionId} removed permanently.`);
            const leftPlayerName = player ? player.name : "Player";
            if (this.state.gameActive && this.currentStakeKey !== "free") {
                await this.settleForfeitStake(client.sessionId);
            }
            this.state.players.delete(client.sessionId);
            this.identityBySessionId.delete(client.sessionId);
            removeLivePlayer(client.sessionId);
            const idx = this.state.playerOrder.indexOf(client.sessionId);
            if (idx !== -1) this.state.playerOrder.splice(idx, 1);

            if (this.state.gameActive) {
                this.state.gameActive = false;
                this.broadcast("room_closed", {
                    reason: `${leftPlayerName} left the match. Room closed.`
                });
            } else {
                this.broadcast("msg", { text: `${leftPlayerName} left the room`, time: 1500 });
            }
            this.broadcastRoomState();
        }
    }

    async startGame() {
        this.state.matchRound = 1;
        this.state.deal = 1;
        this.matchRecorded = false;
        this.forfeitSettlementMade = false;
        this.pendingEconomySettlement = Promise.resolve();
        this.currentDealMatchId = "";
        this.currentDealStakeKey = this.currentStakeKey;
        this.currentDealStakeAmount = 0;
        this.currentDealBankAmount = 0;
        this.ensureBotPlayers();
        this.broadcastRoomState();
        await this.startDeal();
    }

    async startDeal() {
        if (this.botTimer) {
            clearTimeout(this.botTimer);
            this.botTimer = null;
        }
        await this.pendingEconomySettlement.catch(() => {});
        this.matchRecorded = false;
        this.internalBoard = new Board();
        this.state.gameActive = false;
        this.currentDealMatchId = `${this.roomId}:round:${this.state.matchRound}:deal:${this.state.deal}`;
        this.currentDealStakeKey = this.currentStakeKey;
        this.currentDealStakeAmount = 0;
        this.currentDealBankAmount = 0;

        const all = shuffle(createFullSet());
        const hs = getHandSize(this.totalPlayers);
        this.hands = [];
        let idx = 0;
        for (let p = 0; p < this.totalPlayers; p++) {
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
        
        if (this.currentStakeKey !== "free") {
            const reserveResult = await this.reserveEconomyStake();
            if (!reserveResult?.ok) {
                const reason = reserveResult?.reason || "stake_unavailable";
                const message = reason === "insufficient_coins"
                    ? "Not enough coins for the next round"
                    : "Stake table unavailable, room closed";
                this.state.gameActive = false;
                this.broadcast("msg", { text: message, time: 2500 });
                this.broadcast("room_closed", { reason: message });
                this.broadcastRoomState();
                return;
            }
        }
        this.state.gameActive = true;
        this.syncState();
        this.scheduleBotTurn();
    }

    async reserveEconomyStake() {
        if (this.currentStakeKey === "free") {
            this.currentDealStakeAmount = 0;
            this.currentDealBankAmount = 0;
            this.economyReservationMade = true;
            return { ok: true, reserved: 0, stakeKey: "free", bankAmount: 0 };
        }

        const platformIdentity = this.getPlatformMatchIdentity();
        if (!platformIdentity) {
            return { ok: false, reason: "missing_platform_identity" };
        }

        const sessionIdentities = this.state.playerOrder
            .map((sessionId, index) => {
                const identity = this.identityBySessionId.get(sessionId);
                const player = this.state.players.get(sessionId);
                if (!identity) {
                    return null;
                }
                return { identity, player, index };
            })
            .filter(Boolean);

        const hasUnlinkedHuman = sessionIdentities.some(({ identity }) => identity.provider !== "platform" && identity.provider !== "bot");
        if (hasUnlinkedHuman) {
            this.currentStakeKey = "free";
            this.economyReservationMade = true;
            this.broadcast("msg", { text: "Stake table requires linked accounts, switched to free table", time: 2400 });
            this.currentDealStakeKey = "free";
            this.currentDealStakeAmount = 0;
            this.currentDealBankAmount = 0;
            return { ok: true, reserved: 0, stakeKey: "free", bankAmount: 0, switchedToFree: true };
        }

        const participants = sessionIdentities
            .filter(({ identity }) => identity.provider === "platform" && identity.userId)
            .map(({ identity, player, index }) => ({
                playerId: identity.playerId || "",
                userId: identity.userId,
                displayName: player ? player.name : identity.displayName,
                teamIndex: this.state.isTeamMode ? index % 2 : null
            }));

        if (!participants.length) {
            this.economyReservationMade = true;
            return { ok: true, reserved: 0, stakeKey: this.currentStakeKey, bankAmount: 0 };
        }

        try {
            const response = await fetch(`${process.env.PLATFORM_API_URL || "http://127.0.0.1:3000"}/api/economy/matches/reserve`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${platformIdentity.authToken}`
                },
                body: JSON.stringify({
                    roomId: this.roomId,
                    roomCode: this.roomCode,
                    matchId: this.currentDealMatchId,
                    stakeKey: this.currentStakeKey,
                    participants
                })
            });

            if (!response.ok) {
                const text = await response.text().catch(() => "");
                console.warn("[ROOM] Economy reserve failed:", text || response.status);
                return { ok: false, reason: text || "reserve_failed" };
            }

            const data = await response.json().catch(() => null);
            if (!data?.ok) {
                console.warn("[ROOM] Economy reserve rejected:", data?.reason || "unknown");
                return { ok: false, reason: data?.reason || "reserve_failed" };
            }

            this.economyReservationMade = true;
            this.currentDealStakeKey = this.currentStakeKey;
            this.currentDealStakeAmount = Math.max(0, data?.reserved ? Math.floor(data.reserved / Math.max(1, participants.length)) : 0);
            this.currentDealBankAmount = Math.max(0, data?.reserved || this.currentDealStakeAmount * participants.length);
            this.broadcast("msg", {
                text: `Bank ${this.currentDealBankAmount} coins reserved for ${participants.length} players`,
                time: 2000
            });
            return {
                ok: true,
                reserved: data?.reserved || 0,
                stakeKey: this.currentStakeKey,
                bankAmount: this.currentDealBankAmount,
                participants: participants.length
            };
        } catch (error) {
            console.warn("[ROOM] Economy reserve error:", error);
            return { ok: false, reason: "reserve_error" };
        }
    }

    scheduleBotTurn(delay = 650) {
        if (this.botTimer) clearTimeout(this.botTimer);
        if (!this.state.gameActive) return;
        const cpSession = this.state.playerOrder[this.state.currentPlayerIndex];
        if (!cpSession || !cpSession.startsWith("bot-")) return;
        this.botTimer = setTimeout(() => this.runBotTurn(), delay + Math.floor(Math.random() * 300));
    }

    runBotTurn() {
        if (!this.state.gameActive) return;
        const pi = this.state.currentPlayerIndex;
        const sessionId = this.state.playerOrder[pi];
        if (!sessionId || !sessionId.startsWith("bot-")) return;

        const bot = this.aiPlayers.get(sessionId) || new AIPlayer(pi, this.aiDifficulty);
        this.aiPlayers.set(sessionId, bot);
        const hand = this.hands[pi];
        if (!hand) return;

        const combo = this.internalBoard.getGoshaCombo(hand);
        if (combo) {
            this.performGosha(pi, combo, true);
            return;
        }

        const moves = this.internalBoard.getValidMoves(hand);
        const move = bot.chooseMove(this.internalBoard, hand, moves, this.state.players, this.hands, this.boneyard);
        if (move) {
            this.performPlay(pi, move.tileIndex, move.openEndIndex, true);
            return;
        }

        if (this.boneyard.length > 0) {
            this.performDraw(pi, true);
            this.scheduleBotTurn(350);
            return;
        }

        this.performPass(pi, true);
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

        for (let i = 0; i < this.state.playerOrder.length; i++) {
            const sessionId = this.state.playerOrder[i];
            const player = this.state.players.get(sessionId);
            if (player && this.hands[i]) {
                player.handCount = this.hands[i].length;
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

        this.broadcastRoomState();
        this.scheduleBotTurn();
    }

    broadcastRoomState() {
        setRoomGameActive(this.roomId, this.state.gameActive);
        const players = this.state.playerOrder.map((sessionId, index) => {
            const player = this.state.players.get(sessionId);
            return {
                sessionId,
                index,
                name: player ? player.name : "Player",
                userId: player ? player.userId : "",
                isConnected: player ? player.isConnected : false,
                isBot: player ? player.isBot : false
            };
        });

        this.broadcast("room_state", {
            roomId: this.roomId,
            roomCode: this.roomCode,
            stakeKey: this.currentDealStakeKey || this.currentStakeKey,
            stakeAmount: this.currentDealStakeAmount,
            bankAmount: this.currentDealBankAmount,
            currentPlayers: this.state.gameActive ? this.totalPlayers : this.clients.length,
            humanPlayers: this.clients.length,
            humanSeats: this.maxClients,
            aiCount: this.aiCount,
            totalPlayers: this.totalPlayers,
            isTeamMode: this.state.isTeamMode,
            gameActive: this.state.gameActive,
            players
        });
    }

    getPlatformMatchIdentity() {
        for (const identity of this.identityBySessionId.values()) {
            if (identity?.provider === "platform" && identity.authToken) {
                return identity;
            }
        }
        return null;
    }

    async recordPlatformMatch(payload) {
        const identity = this.getPlatformMatchIdentity();
        if (!identity) {
            return false;
        }

        try {
            const response = await fetch(`${process.env.PLATFORM_API_URL || "http://127.0.0.1:3000"}/api/platform/matches`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${identity.authToken}`
                },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                const text = await response.text().catch(() => "");
                throw new Error(text || `Platform match recording failed with ${response.status}`);
            }

            return true;
        } catch (error) {
            console.error("[ROOM] Failed to record platform match:", error);
            return false;
        }
    }

    async settleForfeitStake(leavingSessionId) {
        if (this.forfeitSettlementMade || this.currentDealStakeKey === "free") {
            return false;
        }

        const platformIdentity = this.getPlatformMatchIdentity();
        if (!platformIdentity) {
            return false;
        }

        const leavingIndex = this.state.playerOrder.indexOf(leavingSessionId);
        const leavingIdentity = this.identityBySessionId.get(leavingSessionId);
        if (leavingIndex === -1 || !leavingIdentity?.userId) {
            return false;
        }

        const leavingTeamIndex = this.state.isTeamMode ? leavingIndex % 2 : null;
        const winnerUserIds = this.state.playerOrder
            .filter((sessionId, index) => {
                if (sessionId === leavingSessionId) return false;
                if (this.state.isTeamMode && leavingTeamIndex !== null) {
                    return (index % 2) !== leavingTeamIndex;
                }
                return true;
            })
            .map((sessionId) => this.identityBySessionId.get(sessionId))
            .filter((identity) => identity?.provider === "platform" && identity.userId)
            .map((identity) => identity.userId);

        try {
            const response = await fetch(`${process.env.PLATFORM_API_URL || "http://127.0.0.1:3000"}/api/economy/matches/settle`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${platformIdentity.authToken}`
                },
                body: JSON.stringify({
                    roomId: this.roomId,
                    matchId: this.currentDealMatchId,
                    stakeKey: this.currentDealStakeKey,
                    result: winnerUserIds.length ? "loss" : "refund",
                    winnerUserIds
                })
            });

            if (!response.ok) {
                const text = await response.text().catch(() => "");
                throw new Error(text || `Stake forfeit settle failed with ${response.status}`);
            }

            this.forfeitSettlementMade = true;
            this.matchRecorded = true;
            return true;
        } catch (error) {
            console.warn("[ROOM] Failed to settle forfeit stake:", error);
            return false;
        }
    }

    async settleEconomyRound(wi, isInstantWin, players, wins) {
        if (this.currentStakeKey === "free") {
            this.pendingEconomySettlement = Promise.resolve();
            return false;
        }

        const platformIdentity = this.getPlatformMatchIdentity();
        if (!platformIdentity) {
            return false;
        }

        const winnerUserIds = this.state.playerOrder
            .filter((sessionId, index) => {
                if (this.state.isTeamMode) {
                    return (index % 2) === (wi % 2);
                }
                return index === wi;
            })
            .map((sessionId) => this.identityBySessionId.get(sessionId))
            .filter((identity) => identity?.provider === "platform" && identity.userId)
            .map((identity) => identity.userId);

        try {
            const response = await fetch(`${process.env.PLATFORM_API_URL || "http://127.0.0.1:3000"}/api/economy/matches/settle`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${platformIdentity.authToken}`
                },
                body: JSON.stringify({
                    roomId: this.roomId,
                    matchId: this.currentDealMatchId,
                    stakeKey: this.currentDealStakeKey,
                    result: winnerUserIds.length ? "win" : "refund",
                    winnerUserIds
                })
            });

            if (!response.ok) {
                const text = await response.text().catch(() => "");
                throw new Error(text || `Round settle failed with ${response.status}`);
            }

            this.currentDealBankAmount = 0;
            this.currentDealStakeAmount = 0;
            this.currentDealStakeKey = this.currentStakeKey;
            this.pendingEconomySettlement = Promise.resolve();
            return true;
        } catch (error) {
            console.warn("[ROOM] Failed to settle round stake:", error);
            return false;
        }
    }

    recordMatchResult(wi, isInstantWin, players, wins) {
        if (this.matchRecorded) return;
        const participantRows = [];
        const winnerKey = this.state.isTeamMode ? `team:${wi}` : `player:${wi}`;
        const teams = this.state.isTeamMode ? [
            { memberIds: [], score: this.state.teamScores[0], roundWins: this.state.teamRoundWins[0] },
            { memberIds: [], score: this.state.teamScores[1], roundWins: this.state.teamRoundWins[1] }
        ] : [];

        for (let i = 0; i < this.state.playerOrder.length; i++) {
            const sid = this.state.playerOrder[i];
            const player = this.state.players.get(sid);
            if (!player || !player.userId) continue;
            const teamIndex = this.state.isTeamMode ? (i % 2) : null;
            if (this.state.isTeamMode && teams[teamIndex]) {
                teams[teamIndex].memberIds.push(player.userId);
            }

            participantRows.push({
                userId: player.userId,
                name: player.name,
                isSelf: false,
                teamIndex,
                winnerKey: this.state.isTeamMode ? `team:${teamIndex}` : `player:${i}`,
                points: player.score,
                roundWins: this.state.isTeamMode ? this.state.teamRoundWins[teamIndex] : player.roundWins,
                result: this.state.isTeamMode
                    ? (teamIndex === wi ? "win" : "loss")
                    : (i === wi ? "win" : "loss")
            });
        }

        if (!participantRows.length) {
            this.matchRecorded = true;
            return;
        }

        try {
            const payload = {
                mode: this.state.isTeamMode ? "team" : "ffa",
                isTeamMode: this.state.isTeamMode,
                roomId: this.roomId,
                winnerKey,
                result: "win",
                stakeKey: this.currentStakeKey,
                teams,
                participants: participantRows
            };

            const platformIdentity = this.getPlatformMatchIdentity();
            if (platformIdentity) {
                void this.recordPlatformMatch(payload);
            }
            this.matchRecorded = true;
        } catch (err) {
            console.error("[ROOM] Failed to record match:", err);
        }
    }

    handlePlay(client, message) {
        if (!this.state.gameActive) return;
        const pi = this.getPlayerIndex(client);
        if (pi !== this.state.currentPlayerIndex) return;
        const { tileIndex, openEndIndex } = message;
        this.performPlay(pi, tileIndex, openEndIndex, false);
    }

    handleDraw(client) {
        if (!this.state.gameActive) return;
        const pi = this.getPlayerIndex(client);
        if (pi !== this.state.currentPlayerIndex) return;

        if (this.internalBoard.canPlayAny(this.hands[pi])) return;
        if (!this.boneyard.length) return;

        this.hands[pi].push(this.boneyard.pop());
        this.broadcast("sound", "draw");
        this.broadcast("msg", { text: `${this.state.players.get(client.sessionId).name} drew a tile`, time: 1500 });
        this.syncState();
    }

    handlePass(client) {
        if (!this.state.gameActive) return;
        const pi = this.getPlayerIndex(client);
        if (pi !== this.state.currentPlayerIndex) return;

        if (this.internalBoard.canPlayAny(this.hands[pi])) return;
        if (this.boneyard.length > 0) return;

        this.broadcast("sound", "pass");
        this.broadcast("msg", { text: `${this.state.players.get(client.sessionId).name} passed`, time: 1500 });
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
        this.broadcast("msg", { text: `${this.state.players.get(client.sessionId).name} Gosha x${matches.length}! +${score}`, time: 2000 });

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

    performPlay(pi, tileIndex, openEndIndex, isBot = false) {
        const hand = this.hands[pi];
        const tile = hand && hand[tileIndex];
        if (!tile) return;

        const moves = this.internalBoard.getValidMoves(hand);
        const isValid = moves.some((m) => m.tileIndex === tileIndex && m.openEndIndex === openEndIndex);
        if (!isValid) return;

        hand.splice(tileIndex, 1);
        this.broadcast("sound", "place");

        const actor = this.state.players.get(this.state.playerOrder[pi]);
        const actorName = actor ? actor.name : "Player";
        let score = this.internalBoard.isEmpty ? this.internalBoard.placeFirst(tile) : this.internalBoard.placeTile(tile, openEndIndex);

        if (score > 0) this.addScore(pi, score);

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

    performDraw(pi, isBot = false) {
        if (this.internalBoard.canPlayAny(this.hands[pi])) return false;
        if (!this.boneyard.length) return false;

        this.hands[pi].push(this.boneyard.pop());
        this.broadcast("sound", "draw");
        const actor = this.state.players.get(this.state.playerOrder[pi]);
        const actorName = actor ? actor.name : "Player";
        if (!isBot) {
            this.broadcast("msg", { text: `${actorName} drew a tile`, time: 1500 });
        }
        this.syncState();
        return true;
    }

    performPass(pi, isBot = false) {
        if (this.internalBoard.canPlayAny(this.hands[pi])) return false;
        if (this.boneyard.length > 0) return false;

        this.broadcast("sound", "pass");
        const actor = this.state.players.get(this.state.playerOrder[pi]);
        const actorName = actor ? actor.name : "Player";
        if (!isBot) {
            this.broadcast("msg", { text: `${actorName} passed`, time: 1500 });
        }
        this.advanceTurn();
        return true;
    }

    performGosha(pi, combo, isBot = false) {
        this.broadcast("sound", "gosha");
        const hand = this.hands[pi];
        const matches = combo.matches;
        const sorted = [...matches].sort((a, b) => b.tileIndex - a.tileIndex);
        const tilesByIndex = new Map(matches.map((m) => [m.tileIndex, hand[m.tileIndex]]));
        for (const m of sorted) hand.splice(m.tileIndex, 1);

        let score = 0;
        for (const m of matches) {
            const openEndIndex = this.internalBoard.findOpenEndIndex(m.nodeId, m.side);
            const tile = tilesByIndex.get(m.tileIndex);
            if (openEndIndex === -1 || !tile) {
                return;
            }
            score = this.internalBoard.placeTile(tile, openEndIndex);
        }

        if (score > 0) this.addScore(pi, score);
        const actor = this.state.players.get(this.state.playerOrder[pi]);
        const actorName = actor ? actor.name : "Player";
        if (!isBot) {
            this.broadcast("msg", { text: `${actorName} Gosha x${matches.length}! +${score}`, time: 2000 });
        }

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
        void this.startDeal();
    }

    handleReaction(client, message) {
        if (!this.state.gameActive) return;
        const type = String(message?.type || '').trim().toUpperCase();
        const allowed = new Set(['1F923', '1F609', '1F618', '1F929', '1F914', '1F62E-200D-1F4A8', '1F634', '1F62D', '1F92C', '1F48B']);
        if (!allowed.has(type)) return;
        const player = this.state.players.get(client.sessionId);
        this.broadcast("reaction", {
            type,
            name: player ? player.name : "Player",
            sessionId: client.sessionId
        });
    }

    advanceTurn() {
        if (this.internalBoard.isBlocked(this.hands, this.boneyard)) {
            this.endDeal(this.findFishWinner(), true);
            return;
        }
        this.state.currentPlayerIndex = (this.state.currentPlayerIndex + 1) % this.totalPlayers;
        this.syncState();
    }

    addScore(pi, score) {
        const sessionId = this.state.playerOrder[pi];
        const player = this.state.players.get(sessionId);
        if (!player) return 0;

        player.score += score;
        
        if (this.state.isTeamMode) {
            const team = pi % 2;
            this.state.teamScores[team] += score;
        }
        this.broadcast("sound", "score");
        this.broadcast("score_popup", score);
        this.broadcast("msg", { text: `${player.name} +${score}!`, time: 2000 });
        return score;
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
        for (let i = 0; i < this.totalPlayers; i++) {
            const p = handPoints(this.hands[i]);
            if (p < min) { min = p; w = i; }
        }
        return w;
    }

    endDeal(wi, fish) {
        if (this.botTimer) {
            clearTimeout(this.botTimer);
            this.botTimer = null;
        }
        this.state.gameActive = false;
        this.lastDealWinner = wi;
        let bonus = 0;

        if (this.state.isTeamMode) {
            const wt = wi % 2;
            let os = 0;
            for (let i = 0; i < 4; i++) if (i % 2 !== wt) os += handPoints(this.hands[i]);
            if (fish) for (let i = 0; i < 4; i++) if (i % 2 === wt) os -= handPoints(this.hands[i]);
            bonus = roundTo5(Math.max(0, os));
            bonus = this.addScore(wi, bonus);
        } else {
            let os = 0;
            for (let i = 0; i < this.totalPlayers; i++) if (i !== wi) os += handPoints(this.hands[i]);
            if (fish) os -= handPoints(this.hands[wi]);
            bonus = roundTo5(Math.max(0, os));
            bonus = this.addScore(wi, bonus);
        }

        this.broadcast("sound", "win");
        if (this.currentStakeKey !== "free") {
            this.pendingEconomySettlement = this.settleEconomyRound(wi, false, null, null);
        } else {
            this.pendingEconomySettlement = Promise.resolve();
        }
        
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
        if (this.botTimer) {
            clearTimeout(this.botTimer);
            this.botTimer = null;
        }
        this.state.gameActive = false;
        let wins = 1;

        if (this.state.isTeamMode) {
            const wt = wi % 2;
            const loserTeamScore = this.state.teamScores[1 - wt];
            if (loserTeamScore < this.dlossThreshold) wins = 2;
            if (isInstantWin) wins = 2;
            this.state.teamRoundWins[wt] += wins;
        } else {
            for (let i = 0; i < this.totalPlayers; i++) {
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

        const isMatchOver = !!isInstantWin || this.state.matchRound >= MAX_R;

        // Build player data for the round end screen
        const playerData = [];
        for (let i = 0; i < this.state.playerOrder.length; i++) {
            const sid = this.state.playerOrder[i];
            const p = this.state.players.get(sid);
            playerData.push({
                name: p ? p.name : "Player",
                score: p ? p.score : 0,
                roundWins: p ? p.roundWins : 0,
                isWinner: this.state.isTeamMode ? (i % 2 === wi) : i === wi
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

        if (isMatchOver) {
            this.recordMatchResult(wi, !!isInstantWin, playerData, wins);
        }

        this.state.matchRound++;
    }
}

module.exports = DominoRoom;
