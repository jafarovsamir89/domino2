const { Room } = require("colyseus");
const crypto = require("crypto");
const Redis = require("ioredis");
const { GameState, Player } = require("./schema/GameState");
const { Board, cloneBoard } = require("./board");
const { AIPlayer } = require("./ai");
const { Tile, createFullSet, shuffle, getHandSize, determineFirstPlayer, handPoints, roundTo5 } = require("./model");
const { verifyGameToken } = require("./platformAuth");
const { upsertLivePlayer, removeLivePlayer, setRoomGameActive, removeRoomPlayers } = require("./livePresence");

const TARGET = 365, MAX_R = 3, DLOSS = 255, IWIN = 35;
const CUSTOM_STATE_TTL = 86400;
const redisUrl = process.env.REDIS_URI || "";
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
        console.warn("[Redis] Room snapshot persistence unavailable:", err.message);
    });
}

function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    const bytes = crypto.randomBytes(4);
    for (let i = 0; i < 4; i++) code += chars[bytes[i] % chars.length];
    return code;
}

function sanitizeName(name) {
    return String(name || "Player")
        .replace(/[^\p{L}\p{N} _.-]/gu, "")
        .trim()
        .slice(0, 24) || "Player";
}

class DominoRoom extends Room {
    maxClients = 2;

    async onCreate(options = {}) {
        const restoreSnapshot = await this.loadCustomStateForRestore(options);
        if ((options.restoreRoomCode || options.restoreRoomId || options.restoreSessionId) && !restoreSnapshot) {
            throw new Error("restore_snapshot_not_found");
        }

        if (restoreSnapshot?.roomId && restoreSnapshot.roomId !== this.roomId) {
            this.roomId = restoreSnapshot.roomId;
        }

        this.roomCode = restoreSnapshot?.roomCode || generateRoomCode();
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
        this.playerMissingSuits = Array.from({ length: this.totalPlayers }, () => new Set());
        this.lastDealWinner = null;
        this.dlossThreshold = options.dlossThreshold || DLOSS;
        this.instantWinEnabled = options.instantWinEnabled !== false;
        this.aiDifficulty = options.difficulty || "medium";
        this.roomVisibility = String(options.roomVisibility || "closed").trim() === "open" ? "open" : "closed";
        this.currentStakeKey = String(options.stakeKey || "stake_200").trim() || "stake_200";
        this.economyReservationMade = false;
        this.currentDealMatchId = "";
        this.currentDealStakeKey = this.currentStakeKey;
        this.currentDealStakeAmount = 0;
        this.currentDealBankAmount = 0;
        this.lastReservedMatchRound = 0;
        this.pendingEconomySettlement = Promise.resolve();
        this.botTimer = null;
        this.turnTimer = null;
        this.turnTimeoutMs = 20000;
        this.turnDeadlineAt = 0;
        this.botIds = [];
        this.aiPlayers = new Map();
        this.matchRecorded = false;
        this.forfeitSettlementMade = false;
        this.identityBySessionId = new Map();
        this.lastRoundEconomySummary = null;
        this.restoredFromSnapshot = false;
        this.matchFinished = false;

        if (restoreSnapshot) {
            this.applyCustomStateSnapshot(restoreSnapshot);
            this.restoredFromSnapshot = true;
        }

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
        throw new Error("auth_required");
    }

    findReusableSessionId(options = {}, identity = {}) {
        const requestedSessionId = String(options.restoreSessionId || "").trim();
        if (requestedSessionId && this.state.players.has(requestedSessionId)) {
            return requestedSessionId;
        }

        const userId = String(identity.userId || "").trim();
        if (!userId) return "";

        for (const sessionId of this.state.playerOrder) {
            const player = this.state.players.get(sessionId);
            if (player && !player.isBot && String(player.userId || "").trim() === userId) {
                return sessionId;
            }
        }
        return "";
    }

    hasRestoredMatchInProgress() {
        if (!this.restoredFromSnapshot) return false;
        if (this.state.gameActive) return true;
        if (this.state.matchRound > 1 || this.state.deal > 1) return true;
        if (Array.isArray(this.hands) && this.hands.some((hand) => Array.isArray(hand) && hand.length > 0)) return true;
        return Boolean(this.internalBoard?.nodes?.length);
    }

    registerLivePlayer(sessionId, identity, player, joinedAt = null) {
        const isHost = this.state.playerOrder[0] === sessionId;
        const hostPlayer = this.state.players.get(this.state.playerOrder[0]);
        upsertLivePlayer(sessionId, {
            sessionId,
            roomId: this.roomId,
            roomCode: this.roomCode,
            roomVisibility: this.roomVisibility,
            roomMode: this.state.isTeamMode ? "team" : "ffa",
            stakeKey: this.currentStakeKey,
            stakeAmount: this.currentDealStakeAmount || 0,
            humanSeats: this.humanSeats,
            totalPlayers: this.totalPlayers,
            aiCount: this.aiCount,
            isTeamMode: this.state.isTeamMode,
            provider: identity.provider || "platform",
            userId: player.userId || "",
            playerId: identity.playerId || player.userId || "",
            displayName: player.name,
            hostName: hostPlayer?.name || player.name,
            role: identity.role || (isHost ? "host" : "player"),
            isConnected: true,
            isPlaying: Boolean(this.state.gameActive),
            joinedAt: joinedAt || new Date().toISOString()
        });
    }

    onJoin(client, options, auth) {
        const identity = auth || {};
        console.log(`[ROOM] Client ${client.sessionId} joining with name: ${options.name}`);
        const authToken = String(identity.authToken || options.authToken || "").trim();
        const reusableSessionId = this.findReusableSessionId(options, identity);
        const humanPlayers = this.state.playerOrder.filter((sessionId) => !this.state.players.get(sessionId)?.isBot).length;
        let player;
        let restoredJoin = false;

        if (reusableSessionId) {
            restoredJoin = reusableSessionId !== client.sessionId || this.restoredFromSnapshot;
            player = this.state.players.get(reusableSessionId);
            if (reusableSessionId !== client.sessionId) {
                this.state.players.delete(reusableSessionId);
                this.state.players.set(client.sessionId, player);
                const orderIndex = this.state.playerOrder.indexOf(reusableSessionId);
                if (orderIndex !== -1) this.state.playerOrder.splice(orderIndex, 1, client.sessionId);
                const existingIdentity = this.identityBySessionId.get(reusableSessionId) || {};
                this.identityBySessionId.delete(reusableSessionId);
                removeLivePlayer(reusableSessionId);
                this.identityBySessionId.set(client.sessionId, {
                    ...existingIdentity,
                    provider: identity.provider || existingIdentity.provider || "platform",
                    authToken: authToken || existingIdentity.authToken || "",
                    userId: String(identity.userId || existingIdentity.userId || player.userId || ""),
                    displayName: sanitizeName(identity.displayName || existingIdentity.displayName || player.name || options.name),
                    playerId: identity.playerId || existingIdentity.playerId || identity.userId || player.userId || "",
                    role: identity.role || existingIdentity.role || (this.state.playerOrder[0] === client.sessionId ? "host" : "player")
                });
            }
        } else {
            if (this.hasRestoredMatchInProgress() || humanPlayers >= this.humanSeats) {
                client.send("room_closed", { reason: "Session expired. Please start a new room." });
                void client.leave();
                return;
            }

            player = new Player();
            player.name = sanitizeName(identity.displayName || options.name);
            player.userId = String(identity.userId || "");
            this.state.players.set(client.sessionId, player);
            this.state.playerOrder.push(client.sessionId);
        }

        if (!player) return;

        player.name = sanitizeName(identity.displayName || player.name || options.name);
        player.userId = String(identity.userId || player.userId || "");
        player.isConnected = true;

        const existingIdentity = this.identityBySessionId.get(client.sessionId) || {};
        const nextIdentity = {
            ...existingIdentity,
            provider: identity.provider || "platform",
            authToken: authToken || existingIdentity.authToken || "",
            userId: player.userId,
            displayName: player.name,
            playerId: identity.playerId || existingIdentity.playerId || player.userId,
            role: identity.role || existingIdentity.role || (this.state.playerOrder[0] === client.sessionId ? "host" : "player")
        };
        this.identityBySessionId.set(client.sessionId, nextIdentity);

        this.registerLivePlayer(client.sessionId, nextIdentity, player);

        console.log(`[ROOM] Current player count: ${this.clients.length} / ${this.maxClients}`);
        this.broadcast("msg", { text: `${player.name} ${restoredJoin ? "rejoined" : "joined"} the room`, time: 1500 });
        if (this.state.gameActive || this.hasRestoredMatchInProgress()) {
            this.syncState();
        } else {
            this.broadcastRoomState();
        }
        if (!this.state.gameActive && this.clients.length === this.maxClients && !this.hasRestoredMatchInProgress()) {
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
        this.botTimer && clearTimeout(this.botTimer);
        this.clearTurnTimer();
        this.botTimer = null;
        this.aiPlayers?.clear?.();
        this.identityBySessionId?.clear?.();
    }

    ensureBotPlayers() {
        if (!this.aiCount) return;
        for (let i = 0; i < this.aiCount; i++) {
            const botId = `bot-${i}`;
            const botIndex = this.state.playerOrder.indexOf(botId);
            if (!this.aiPlayers.has(botId) && botIndex !== -1) {
                this.aiPlayers.set(botId, new AIPlayer(botIndex, this.aiDifficulty));
            }
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
                roomVisibility: this.roomVisibility,
                roomMode: this.state.isTeamMode ? "team" : "ffa",
                stakeKey: this.currentStakeKey,
                stakeAmount: this.currentDealStakeAmount || 0,
                humanSeats: this.humanSeats,
                totalPlayers: this.totalPlayers,
                aiCount: this.aiCount,
                isTeamMode: this.state.isTeamMode,
                provider: identity.provider || "platform",
                userId: identity.userId || "",
                playerId: identity.playerId || identity.userId || "",
                displayName: identity.displayName || player?.name || "Player",
                hostName: this.state.players.get(this.state.playerOrder[0])?.name || player?.name || "Player",
                role: identity.role || (this.state.playerOrder[0] === client.sessionId ? "host" : "player"),
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
                    roomVisibility: this.roomVisibility,
                    roomMode: this.state.isTeamMode ? "team" : "ffa",
                    stakeKey: this.currentStakeKey,
                    stakeAmount: this.currentDealStakeAmount || 0,
                    humanSeats: this.humanSeats,
                    totalPlayers: this.totalPlayers,
                    aiCount: this.aiCount,
                    isTeamMode: this.state.isTeamMode,
                    provider: identity.provider || "platform",
                    userId: identity.userId || "",
                    playerId: identity.playerId || identity.userId || "",
                    displayName: identity.displayName || player?.name || "Player",
                    hostName: this.state.players.get(this.state.playerOrder[0])?.name || player?.name || "Player",
                    role: identity.role || (this.state.playerOrder[0] === client.sessionId ? "host" : "player"),
                    isConnected: true,
                    isPlaying: Boolean(this.state.gameActive)
                });
            }
            console.log(`[ROOM] Client ${client.sessionId} reconnected!`);
            this.broadcast("msg", { text: `${player.name} reconnected`, time: 1500 });
            this.syncState();
        } catch (e) {
            console.log(`[ROOM] Client ${client.sessionId} removed permanently.`);
            const leftPlayerName = player ? player.name : "Player";
            if (this.state.gameActive && this.currentStakeKey !== "free") {
                void this.settleForfeitStake(client.sessionId).catch((err) => {
                    console.error("[ROOM] Failed to settle forfeit stake during cleanup:", err);
                });
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
        this.matchFinished = false;
        this.forfeitSettlementMade = false;
        this.pendingEconomySettlement = Promise.resolve();
        this.currentDealMatchId = "";
        this.currentDealStakeKey = this.currentStakeKey;
        this.currentDealStakeAmount = 0;
        this.currentDealBankAmount = 0;
        this.lastReservedMatchRound = 0;
        this.ensureBotPlayers();
        this.broadcastRoomState();
        await this.startDeal();
    }

    async startDeal() {
        if (this.botTimer) {
            clearTimeout(this.botTimer);
            this.botTimer = null;
        }
        this.clearTurnTimer();
        await this.pendingEconomySettlement.catch(() => {});
        this.matchRecorded = false;
        this.internalBoard = new Board();
        this.state.gameActive = false;
        this.currentDealMatchId = `${this.roomId}:round:${this.state.matchRound}`;
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
        
        if (this.currentStakeKey !== "free" && this.lastReservedMatchRound !== this.state.matchRound) {
            const reserveResult = await this.reserveEconomyStake();
            if (!reserveResult?.ok) {
                const reason = reserveResult?.reason || "stake_unavailable";
                const message = reason === "insufficient_coins"
                    ? "Not enough coins for the next round"
                    : reason === "auth_required"
                        ? "Registered accounts are required for coin tables"
                        : "Stake table unavailable, room closed";
                this.state.gameActive = false;
                this.broadcast("msg", { text: message, time: 2500 });
                this.broadcast("room_closed", { reason: message });
                this.broadcastRoomState();
                return;
            }
            this.lastReservedMatchRound = this.state.matchRound;
        }
        this.state.gameActive = true;
        this.scheduleTurnTimer();
    }

    clearTurnTimer() {
        if (this.turnTimer) {
            clearTimeout(this.turnTimer);
            this.turnTimer = null;
        }
        this.turnDeadlineAt = 0;
        if (this.state) this.state.turnDeadlineAt = 0;
    }

    scheduleTurnTimer() {
        if (!this.state.gameActive) {
            this.clearTurnTimer();
            return;
        }
        if (this.turnTimer) clearTimeout(this.turnTimer);
        this.turnDeadlineAt = Date.now() + this.turnTimeoutMs;
        this.state.turnDeadlineAt = this.turnDeadlineAt;
        this.syncState();
        this.turnTimer = setTimeout(() => {
            this.turnTimer = null;
            this.handleTurnTimeout();
        }, this.turnTimeoutMs);
    }

    findTimeoutWinner(timeoutIndex) {
        if (this.state.isTeamMode) {
            const losingTeam = timeoutIndex % 2;
            const winningTeam = losingTeam === 0 ? 1 : 0;
            const members = this.getTeamMembers(winningTeam);
            let minPoints = Infinity;
            let bestIndex = members[0] ?? 0;
            for (const pIdx of members) {
                const points = handPoints(this.hands[pIdx] || []);
                if (points < minPoints) {
                    minPoints = points;
                    bestIndex = pIdx;
                }
            }
            return bestIndex;
        }

        let minPoints = Infinity;
        let bestIndex = -1;
        for (let i = 0; i < this.totalPlayers; i++) {
            if (i === timeoutIndex) continue;
            const points = handPoints(this.hands[i] || []);
            if (points < minPoints) {
                minPoints = points;
                bestIndex = i;
            }
        }
        return bestIndex === -1 ? 0 : bestIndex;
    }

    handleTurnTimeout() {
        if (!this.state.gameActive || this.matchFinished) return;
        const currentIndex = Number(this.state.currentPlayerIndex || 0);
        const winnerIndex = this.findTimeoutWinner(currentIndex);
        const actor = this.state.players.get(this.state.playerOrder[currentIndex]);
        const actorName = actor ? actor.name : "Player";
        this.broadcast("msg", { text: `${actorName} ran out of time`, time: 2000 });
        void this.endRound(winnerIndex, false);
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
            this.broadcast("msg", { text: "Registered accounts are required for coin tables", time: 2400 });
            this.currentDealStakeAmount = 0;
            this.currentDealBankAmount = 0;
            return { ok: false, reason: "auth_required" };
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
        this.botTimer = setTimeout(() => this.runBotTurn(), delay + crypto.randomInt(0, 300));
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
        const move = bot.chooseMove(this.internalBoard, hand, moves, this.state.players, this.hands, this.boneyard, this.playerMissingSuits);
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

    getTeamMembers(teamIndex) {
        const limit = Math.min(this.totalPlayers, this.state.playerOrder.length, this.hands.length);
        const members = [];
        for (let i = 0; i < limit; i++) {
            if ((i % 2) === teamIndex) members.push(i);
        }
        return members;
    }

    getTeamDisplayName(teamIndex) {
        const members = this.getTeamMembers(teamIndex);
        const names = members.map((idx) => {
            const sessionId = this.state.playerOrder[idx];
            return this.state.players.get(sessionId)?.name || `P${idx + 1}`;
        });
        return names.length ? names.join(" & ") : (teamIndex === 0 ? "Team A" : "Team B");
    }

    getTeamHandPoints(teamIndex) {
        return this.getTeamMembers(teamIndex).reduce((sum, idx) => sum + handPoints(this.hands[idx] || []), 0);
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
            roomVisibility: this.roomVisibility,
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
            hostName: this.state.players.get(this.state.playerOrder[0])?.name || "Player",
            players
        });
        void this.saveCustomStateToRedis();
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
            this.lastRoundEconomySummary = null;
            return null;
        }

        const platformIdentity = this.getPlatformMatchIdentity();
        if (!platformIdentity) {
            return null;
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

            const settlement = await response.json().catch(() => null);
            const summary = settlement?.ok ? {
                stakeKey: this.currentDealStakeKey,
                stakeAmount: this.currentDealStakeAmount,
                bankAmount: Math.max(0, settlement.bank || this.currentDealBankAmount || 0),
                commission: Math.max(0, settlement.commission || 0),
                payout: Math.max(0, settlement.payout || 0),
                winners: Math.max(0, settlement.winners || 0),
                result: settlement.result || "win",
                reservations: Array.isArray(settlement.reservations) ? settlement.reservations : []
            } : {
                stakeKey: this.currentDealStakeKey,
                stakeAmount: this.currentDealStakeAmount,
                bankAmount: Math.max(0, this.currentDealBankAmount || 0),
                commission: 0,
                payout: 0,
                winners: 0,
                result: "refund",
                reservations: []
            };

            this.currentDealBankAmount = 0;
            this.currentDealStakeAmount = 0;
            this.currentDealStakeKey = this.currentStakeKey;
            this.pendingEconomySettlement = Promise.resolve();
            this.lastRoundEconomySummary = summary;
            return summary;
        } catch (error) {
            console.warn("[ROOM] Failed to settle round stake:", error);
            this.lastRoundEconomySummary = {
                stakeKey: this.currentDealStakeKey,
                stakeAmount: this.currentDealStakeAmount,
                bankAmount: Math.max(0, this.currentDealBankAmount || 0),
                commission: 0,
                payout: 0,
                winners: 0,
                result: "refund",
                reservations: []
            };
            return this.lastRoundEconomySummary;
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
        this.performDraw(pi, false);
    }

    handlePass(client) {
        if (!this.state.gameActive) return;
        const pi = this.getPlayerIndex(client);
        if (pi !== this.state.currentPlayerIndex) return;
        this.performPass(pi, false);
    }

    handleGosha(client) {
        if (!this.state.gameActive) return;
        const pi = this.getPlayerIndex(client);
        if (pi !== this.state.currentPlayerIndex) return;

        const combo = this.internalBoard.getGoshaCombo(this.hands[pi]);
        if (!combo) return;

        this.performGosha(pi, combo, false);
    }

    performPlay(pi, tileIndex, openEndIndex, isBot = false) {
        const hand = this.hands[pi];
        const tile = hand && hand[tileIndex];
        if (!tile) return;

        const moves = this.internalBoard.getValidMoves(hand);
        const isValid = moves.some((m) => m.tileIndex === tileIndex && m.openEndIndex === openEndIndex);
        if (!isValid) return;

        hand.splice(tileIndex, 1);
        this.clearTurnTimer();
        this.broadcast("sound", "place");

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

        const openValues = this.internalBoard.openEnds.map(e => e.value);
        for (const v of openValues) {
            this.playerMissingSuits[pi].add(v);
        }

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

        const openValues = this.internalBoard.openEnds.map(e => e.value);
        for (const v of openValues) {
            this.playerMissingSuits[pi].add(v);
        }

        this.broadcast("sound", "pass");
        const actor = this.state.players.get(this.state.playerOrder[pi]);
        const actorName = actor ? actor.name : "Player";
        if (!isBot) {
            this.broadcast("msg", { text: `${actorName} passed`, time: 1500 });
        }
        this.clearTurnTimer();
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
        this.clearTurnTimer();
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
        if (this.matchFinished) return;
        // Debounce to prevent one player from skipping results for others
        if (this._lastNextDealAt && Date.now() - this._lastNextDealAt < 1500) return;
        this._lastNextDealAt = Date.now();
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
        this.scheduleTurnTimer();
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
            const t0 = this.getTeamHandPoints(0);
            const t1 = this.getTeamHandPoints(1);
            const winningTeam = t0 <= t1 ? 0 : 1;
            const players = this.getTeamMembers(winningTeam);
            let minP = Infinity, bestP = players[0];
            for (const pIdx of players) {
                const p = handPoints(this.hands[pIdx] || []);
                if (p < minP) { minP = p; bestP = pIdx; }
            }
            return bestP;
        }
        let min = Infinity, w = 0;
        for (let i = 0; i < this.totalPlayers; i++) {
            const p = handPoints(this.hands[i] || []);
            if (p < min) { min = p; w = i; }
        }
        return w;
    }

    endDeal(wi, fish) {
        if (this.botTimer) {
            clearTimeout(this.botTimer);
            this.botTimer = null;
        }
        this.clearTurnTimer();
        this.state.gameActive = false;
        this.lastDealWinner = wi;
        let bonus = 0;

        if (this.state.isTeamMode) {
            const wt = wi % 2;
            let os = 0;
            const teamMembers = this.getTeamMembers(wt);
            const otherMembers = this.getTeamMembers(1 - wt);
            for (const i of otherMembers) os += handPoints(this.hands[i] || []);
            if (fish) for (const i of teamMembers) os -= handPoints(this.hands[i] || []);
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
        
        // Check for round win (target score reached)
        const scorePool = this.state.isTeamMode
            ? this.state.teamScores
            : Array.from(this.state.players.values()).map(p => p.score);
        const cs = scorePool.length > 0 ? Math.max(...scorePool) : 0;
        if (cs >= TARGET) {
            const rw = this.state.isTeamMode
                ? scorePool.indexOf(cs)
                : this.state.playerOrder.findIndex((sid) => (this.state.players.get(sid)?.score || 0) >= TARGET);
            if (rw === -1) return;
            this.endRound(this.state.isTeamMode ? (rw === 0 ? 0 : 1) : rw, false);
            return;
        }

        // Notify clients to show deal end screen
        this.broadcast("deal_end", { winnerIndex: wi, fish, bonus, hands: this.hands });
        this.state.deal++;
        this.syncState();
    }

    async endRound(wi, isInstantWin) {
        if (this.botTimer) {
            clearTimeout(this.botTimer);
            this.botTimer = null;
        }
        this.clearTurnTimer();
        this.state.gameActive = false;
        this.syncState();
        const economySummary = this.currentStakeKey !== "free"
            ? await this.settleEconomyRound(wi, !!isInstantWin, null, null)
            : null;
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
            players: playerData,
            economy: economySummary
        });

        if (isMatchOver) {
            this.matchFinished = true;
            this.recordMatchResult(wi, !!isInstantWin, playerData, wins);
        }

        this.state.matchRound++;
    }

    async loadCustomStateForRestore(options = {}) {
        if (!redis) return null;
        const restoreRoomId = String(options.restoreRoomId || "").trim();
        const restoreRoomCode = String(options.restoreRoomCode || "").trim().toUpperCase();
        const keys = [];
        if (restoreRoomId) keys.push(`domino:custom:${restoreRoomId}`);
        if (restoreRoomCode) keys.push(`domino:custom:code:${restoreRoomCode}`);
        if (!keys.length) return null;

        try {
            if (redis.status !== "ready") {
                await redis.connect();
            }
            for (const key of keys) {
                const raw = await redis.get(key);
                if (!raw) continue;
                const parsed = JSON.parse(raw);
                if (!restoreRoomCode || String(parsed.roomCode || "").toUpperCase() === restoreRoomCode) {
                    return parsed;
                }
            }
        } catch (e) {
            console.error("[ROOM] Redis restore error", e);
        }
        return null;
    }

    buildSchemaStateSnapshot() {
        const playerOrder = Array.from(this.state.playerOrder || []);
        return {
            playerOrder,
            currentPlayerIndex: this.state.currentPlayerIndex,
            boneyardCount: this.state.boneyardCount,
            gameActive: this.state.gameActive,
            matchRound: this.state.matchRound,
            deal: this.state.deal,
            boardJson: this.state.boardJson,
            isTeamMode: this.state.isTeamMode,
            playerCount: this.state.playerCount,
            turnDeadlineAt: this.state.turnDeadlineAt || 0,
            teamScores: Array.from(this.state.teamScores || [0, 0]),
            teamRoundWins: Array.from(this.state.teamRoundWins || [0, 0]),
            players: playerOrder.map((sessionId) => {
                const player = this.state.players.get(sessionId);
                return {
                    sessionId,
                    name: player?.name || "Player",
                    userId: player?.userId || "",
                    score: player?.score || 0,
                    roundWins: player?.roundWins || 0,
                    handCount: player?.handCount || 0,
                    isConnected: player?.isConnected || false,
                    isBot: player?.isBot || false
                };
            })
        };
    }

    replaceSchemaArray(target, values = []) {
        target.splice(0, target.length);
        for (const value of values) {
            target.push(value);
        }
    }

    restoreSchemaState(snapshot = {}) {
        if (!snapshot || typeof snapshot !== "object") return;

        for (const key of Array.from(this.state.players.keys())) {
            this.state.players.delete(key);
        }

        const playerRows = Array.isArray(snapshot.players) ? snapshot.players : [];
        const playerOrder = Array.isArray(snapshot.playerOrder) && snapshot.playerOrder.length
            ? snapshot.playerOrder
            : playerRows.map((entry) => String(entry.sessionId || "")).filter(Boolean);

        for (const entry of playerRows) {
            const sessionId = String(entry.sessionId || "").trim();
            if (!sessionId) continue;
            const player = new Player();
            player.name = sanitizeName(entry.name || "Player");
            player.userId = String(entry.userId || "");
            player.score = Number(entry.score || 0);
            player.roundWins = Number(entry.roundWins || 0);
            player.handCount = Number(entry.handCount || 0);
            player.isBot = Boolean(entry.isBot);
            player.isConnected = Boolean(entry.isBot);
            this.state.players.set(sessionId, player);
        }

        this.replaceSchemaArray(this.state.playerOrder, playerOrder);
        this.state.currentPlayerIndex = Number(snapshot.currentPlayerIndex || 0);
        this.state.boneyardCount = Number(snapshot.boneyardCount || 0);
        this.state.gameActive = Boolean(snapshot.gameActive);
        this.state.matchRound = Number(snapshot.matchRound || 1);
        this.state.deal = Number(snapshot.deal || 1);
        this.state.boardJson = snapshot.boardJson || "{}";
        this.state.isTeamMode = Boolean(snapshot.isTeamMode);
        this.state.playerCount = Number(snapshot.playerCount || this.totalPlayers || 2);
        this.state.turnDeadlineAt = Number(snapshot.turnDeadlineAt || 0);

        const teamScores = Array.isArray(snapshot.teamScores) ? snapshot.teamScores : [0, 0];
        const teamRoundWins = Array.isArray(snapshot.teamRoundWins) ? snapshot.teamRoundWins : [0, 0];
        this.replaceSchemaArray(this.state.teamScores, teamScores.map((value) => Number(value || 0)));
        this.replaceSchemaArray(this.state.teamRoundWins, teamRoundWins.map((value) => Number(value || 0)));
    }

    restoreTile(tile) {
        if (tile instanceof Tile) return tile;
        return new Tile(Number(tile?.a || 0), Number(tile?.b || 0));
    }

    buildCustomStateSnapshot() {
        return {
            roomId: this.roomId,
            roomCode: this.roomCode,
            state: this.buildSchemaStateSnapshot(),
            roomVisibility: this.roomVisibility,
            humanSeats: this.humanSeats,
            totalPlayers: this.totalPlayers,
            aiCount: this.aiCount,
            dlossThreshold: this.dlossThreshold,
            instantWinEnabled: this.instantWinEnabled,
            aiDifficulty: this.aiDifficulty,
            currentStakeKey: this.currentStakeKey,
            currentDealMatchId: this.currentDealMatchId,
            currentDealStakeKey: this.currentDealStakeKey,
            currentDealStakeAmount: this.currentDealStakeAmount,
            currentDealBankAmount: this.currentDealBankAmount,
            lastReservedMatchRound: this.lastReservedMatchRound,
            matchRecorded: this.matchRecorded,
            forfeitSettlementMade: this.forfeitSettlementMade,
            lastRoundEconomySummary: this.lastRoundEconomySummary,
            hands: this.hands,
            boneyard: this.boneyard,
            internalBoard: this.internalBoard,
            lastDealWinner: this.lastDealWinner,
            botIds: this.botIds,
            playerMissingSuits: this.playerMissingSuits ? this.playerMissingSuits.map((s) => Array.from(s)) : [],
            identityBySessionId: Array.from(this.identityBySessionId.entries())
        };
    }

    applyCustomStateSnapshot(data = {}) {
        this.roomCode = data.roomCode || this.roomCode;
        this.roomVisibility = String(data.roomVisibility || this.roomVisibility || "closed").trim() === "open" ? "open" : "closed";
        if (this.roomCode) {
            global.__DOMINO_ROOM_CODES?.set(this.roomCode, this.roomId);
            global.__DOMINO_ROOM_IDS?.set(this.roomId, this.roomCode);
        }

        this.humanSeats = data.humanSeats ?? this.humanSeats;
        this.totalPlayers = data.totalPlayers ?? this.totalPlayers;
        this.aiCount = data.aiCount ?? this.aiCount;
        this.maxClients = this.humanSeats;
        this.dlossThreshold = data.dlossThreshold ?? this.dlossThreshold;
        this.instantWinEnabled = data.instantWinEnabled ?? this.instantWinEnabled;
        this.aiDifficulty = data.aiDifficulty ?? this.aiDifficulty;
        this.currentStakeKey = data.currentStakeKey ?? this.currentStakeKey;
        this.currentDealMatchId = data.currentDealMatchId ?? this.currentDealMatchId;
        this.currentDealStakeKey = data.currentDealStakeKey ?? this.currentDealStakeKey;
        this.currentDealStakeAmount = data.currentDealStakeAmount ?? this.currentDealStakeAmount;
        this.currentDealBankAmount = data.currentDealBankAmount ?? this.currentDealBankAmount;
        this.lastReservedMatchRound = data.lastReservedMatchRound ?? this.lastReservedMatchRound;
        this.matchRecorded = data.matchRecorded ?? this.matchRecorded;
        this.forfeitSettlementMade = data.forfeitSettlementMade ?? this.forfeitSettlementMade;
        this.state.turnDeadlineAt = Number(data?.state?.turnDeadlineAt || this.state.turnDeadlineAt || 0);
        this.lastRoundEconomySummary = data.lastRoundEconomySummary ?? this.lastRoundEconomySummary;
        this.lastDealWinner = data.lastDealWinner ?? this.lastDealWinner;
        this.botIds = data.botIds || this.botIds || [];
        this.playerMissingSuits = (data.playerMissingSuits || []).map((arr) => new Set(arr));
        this.identityBySessionId = new Map(data.identityBySessionId || this.identityBySessionId || []);

        if (data.state) {
            this.restoreSchemaState(data.state);
        }

        if (data.hands) {
            this.hands = data.hands.map((hand) => hand.map((t) => this.restoreTile(t)));
        }
        if (data.boneyard) {
            this.boneyard = data.boneyard.map((t) => this.restoreTile(t));
        }
        if (data.internalBoard) {
            this.internalBoard = cloneBoard(data.internalBoard);
        }

        this.state.playerCount = this.totalPlayers;
        this.state.isTeamMode = data.state ? Boolean(data.state.isTeamMode) : Boolean(this.state.isTeamMode);
        this.state.boneyardCount = this.boneyard.length;
        this.state.boardJson = JSON.stringify(this.internalBoard);
        while (this.playerMissingSuits.length < this.totalPlayers) {
            this.playerMissingSuits.push(new Set());
        }
        this.ensureBotPlayers();
        if (this.state.gameActive && this.state.turnDeadlineAt) {
            if (this.turnTimer) clearTimeout(this.turnTimer);
            const remaining = Math.max(0, Number(this.state.turnDeadlineAt) - Date.now());
            this.turnTimer = setTimeout(() => {
                this.turnTimer = null;
                this.handleTurnTimeout();
            }, remaining);
        } else {
            this.clearTurnTimer();
        }
    }

    async saveCustomStateToRedis() {
        if (!this.roomId || !redis) return;
        try {
            if (redis.status !== "ready") {
                await redis.connect();
            }
            const snapshot = JSON.stringify(this.buildCustomStateSnapshot());
            await redis.setex(`domino:custom:${this.roomId}`, CUSTOM_STATE_TTL, snapshot);
            if (this.roomCode) {
                await redis.setex(`domino:custom:code:${this.roomCode}`, CUSTOM_STATE_TTL, snapshot);
            }
        } catch (e) {
            console.error("Redis error", e);
        }
    }

    onCacheRoom() {
        return this.buildCustomStateSnapshot();
    }

    onRestoreRoom(cachedData) {
        console.log(`[ROOM] Restoring room ${this.roomId}`);
        this.applyCustomStateSnapshot(cachedData || {});
        if (this.state.gameActive && this.state.playerOrder[this.state.currentPlayerIndex]?.startsWith('bot-')) {
            this.scheduleBotTurn(1500);
        }
    }

    async onBeforeShutdown() {
        await this.saveCustomStateToRedis();
        return this.disconnect();
    }
}

module.exports = DominoRoom;
