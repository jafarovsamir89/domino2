const { Room, ServerError } = require("colyseus");
const Redis = require("ioredis");
const { GameState, Player } = require("./schema/GameState");
const { Board, cloneBoard } = require("./board");
const { AIPlayer } = require("./ai");
const { Tile, createFullSet, shuffle, getHandSize, determineFirstPlayer, handPoints, getOpeningPlayScore, hasInvalidOpeningHand, roundTo5 } = require("./model");
const { verifyGameToken } = require("./platformAuth");
const { buildSignedRequestBody } = require("./signedRequest");
const { generateRoomCode, normalizeRoomVisibility, normalizeRoomMode, normalizeGameMode, normalizeStakeKey, normalizePlayerCount, normalizeAiCount, normalizeDlossThreshold, normalizeInstantWinEnabled, normalizeAiDifficulty } = require("./roomConfig");
const { normalizeAuthToken, buildRoomIdentity, getFirstNameDisplayName } = require("./roomIdentity");
const { buildLivePlayerPayload } = require("./roomPresence");
const { buildPlatformMatchPayload, sanitizeParticipant } = require("./matchResultPayload");
const { buildRoomStatePlayers, buildRoomStatePayload } = require("./roomStatePayload");
const { reserveEconomyStakeForRoom, settleEconomyRoundForRoom, settleForfeitStakeForRoom } = require("./economyService");
const { buildSnapshotIdentityEntries, restoreSnapshotIdentityEntries, sanitizeName } = require("./roomSnapshot");
const { buildRestoredRoomMetadata } = require("./roomRestore");
const { buildSchemaStateSnapshotData, buildRestoredSchemaStateData } = require("./schemaStateSnapshot");
const { getRuleset } = require("../shared/domino-rulesets.cjs");
const { loadCustomStateSnapshotForRestore } = require("./roomRestoreLookup");
const { upsertLivePlayer, removeLivePlayer, setRoomGameActive, removeRoomPlayers } = require("./livePresence");
const { rememberRoom, forgetRoom } = require("./roomRegistry");
const { BotTakeoverController, BOT_TAKEOVER_CONFIG, TAKEOVER_REASON } = require("./botTakeover");

const TARGET = 365, MAX_R = 3, DLOSS = 255, IWIN = 35;
const TURN_TIMEOUT_MS = 30000;
const TIMEOUT_CONTINUE_MS = 30000;
const BOT_THINK_DELAY_MS = 1500;
const LAST_MOVE_REVEAL_DELAY_MS = 1200;
const DEAL_END_MODAL_MS = 5000;
const ECONOMY_SETTLEMENT_RETRY_MS = 5000;
const RECONNECT_GRACE_MS = 120000; // 2 minutes
const AUTO_START_DELAY_MS = 500;
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

const DEBUG_LOGS = process.env.DOMINO_DEBUG_LOGS === "true" || (process.env.NODE_ENV !== "production" && process.env.DOMINO_DEBUG_LOGS !== "false");
function debugLog(...args) {
    if (DEBUG_LOGS) console.log(...args);
}

function debugPlayerSummary(room) {
    return Array.from(room?.state?.playerOrder || []).map((sessionId) => {
        const player = room?.state?.players?.get?.(sessionId) || {};
        const identity = room?.identityBySessionId?.get?.(sessionId) || {};
        const seatIndex = Number(player?.seatIndex);
        return {
            sessionId,
            isBot: Boolean(player?.isBot),
            isConnected: Boolean(player?.isConnected),
            seatIndex: Number.isInteger(seatIndex) ? seatIndex : -1,
            hasUserId: Boolean(String(player?.userId || identity?.userId || "").trim()),
            hasPlayerId: Boolean(String(identity?.playerId || player?.userId || "").trim()),
            hasAuthToken: Boolean(String(identity?.authToken || "").trim())
        };
    });
}

function getSafeRoomId(room) {
    try {
        return String(room?.roomId || "").trim();
    } catch {
        return String(room?.id || room?.state?.roomId || "").trim();
    }
}

function isRoomTeamMode(room) {
    return room?.roomMode === "team" || Boolean(room?.state?.isTeamMode);
}

class DominoRoom extends Room {
    maxClients = 2;

    getActiveRuleset() {
        const mode = String(this.state?.gameMode || this.state?.mode || this.gameMode || this.mode || "telefon").trim() || "telefon";
        if (!this.ruleset || this.ruleset.id !== mode) {
            this.ruleset = getRuleset(mode);
        }
        return this.ruleset;
    }

    parseMatchStateSnapshot(matchState) {
        if (!matchState) return null;
        if (typeof matchState === "string") {
            try {
                return JSON.parse(matchState);
            } catch {
                return null;
            }
        }
        if (typeof matchState === "object") {
            try {
                return JSON.parse(JSON.stringify(matchState));
            } catch {
                return matchState;
            }
        }
        return null;
    }

    createMatchStateForCurrentMode(playerCount = this.totalPlayers, isTeamMode = isRoomTeamMode(this)) {
        if (this.gameMode !== "classic101") return null;
        const ruleset = this.getActiveRuleset();
        return ruleset?.createMatchState?.(playerCount, isTeamMode) || null;
    }

    configureBoardForCurrentMode(board = this.internalBoard) {
        if (!board) return;
        const classic101 = this.gameMode === "classic101";
        board.telephoneEnabled = !classic101;
        board.scoringEnabled = !classic101;
    }

    normalizeMatchStateForCurrentMode(matchState = this.matchState, playerCount = this.totalPlayers, isTeamMode = isRoomTeamMode(this)) {
        if (this.gameMode !== "classic101") return null;
        const ruleset = this.getActiveRuleset();
        if (!ruleset?.normalizeMatchState) return this.parseMatchStateSnapshot(matchState);
        return ruleset.normalizeMatchState(matchState || ruleset.createMatchState?.(playerCount, isTeamMode) || null, playerCount, isTeamMode);
    }

    syncMatchStateToSchema() {
        if (!this.state) return;
        if (this.gameMode !== "classic101") {
            this.state.matchStateJson = "";
            return;
        }
        this.state.matchStateJson = this.matchState ? JSON.stringify(this.matchState) : "";
        this.syncClassic101ScoresFromMatchState();
    }

    syncClassic101ScoresFromMatchState(matchState = this.matchState) {
        if (this.gameMode !== "classic101" || !this.state) return;
        const ruleset = this.getActiveRuleset();
        const scoreboard = ruleset?.getScoreboard?.(matchState, isRoomTeamMode(this), this.totalPlayers);
        if (!scoreboard) return;
        if (isRoomTeamMode(this)) {
            const teamScores = Array.isArray(scoreboard.teamScores) ? scoreboard.teamScores.slice(0, 2) : [0, 0];
            this.replaceSchemaArray(this.state.teamScores, teamScores);
            for (let i = 0; i < this.totalPlayers; i++) {
                const sid = this.state.playerOrder[i];
                const player = sid ? this.state.players.get(sid) : null;
                if (!player) continue;
                player.score = Number(teamScores[i % 2] || 0);
            }
            return;
        }
        const scores = Array.isArray(scoreboard.scores) ? scoreboard.scores.slice(0, this.totalPlayers) : new Array(this.totalPlayers).fill(0);
        for (let i = 0; i < this.totalPlayers; i++) {
            const sid = this.state.playerOrder[i];
            const player = sid ? this.state.players.get(sid) : null;
            if (!player) continue;
            player.score = Number(scores[i] || 0);
        }
        this.replaceSchemaArray(this.state.teamScores, [0, 0]);
    }

    async onCreate(options = {}) {
        const restoreSnapshot = await this.loadCustomStateForRestore(options);
        if ((options.restoreRoomCode || options.restoreRoomId || options.restoreSessionId) && !restoreSnapshot) {
            throw new ServerError(404, "restore_snapshot_not_found");
        }

        if (restoreSnapshot?.roomId && restoreSnapshot.roomId !== this.roomId) {
            this.roomId = restoreSnapshot.roomId;
        }

        this.roomCode = restoreSnapshot?.roomCode || generateRoomCode();
        void rememberRoom(this.roomCode, this.roomId);

        this.setState(new GameState());
        this.attachStateCollections();
        this.gameMode = normalizeGameMode(restoreSnapshot?.gameMode || restoreSnapshot?.mode || options.gameMode || options.mode);
        this.mode = this.gameMode;
        this.ruleset = this.getActiveRuleset();
        this.botTakeover = new BotTakeoverController(this);
        this.voiceEnabledBySessionId = new Set();
        this.roomMode = normalizeRoomMode(options.roomMode, options.isTeamMode);
        this.boardStartAxis = options.boardStartAxis || options.boardStart || 'horizontal';
        this.state.isTeamMode = this.roomMode === "team";
        this.state.gameMode = this.gameMode;
        this.state.mode = this.gameMode;
        this.totalPlayers = normalizePlayerCount(options.playerCount, this.state.isTeamMode);
        this.matchState = this.createMatchStateForCurrentMode(this.totalPlayers, this.state.isTeamMode);
        this.syncMatchStateToSchema();
        this.aiCount = normalizeAiCount(options.aiCount, this.totalPlayers);
        this.humanSeats = this.totalPlayers - this.aiCount;
        this.maxClients = this.humanSeats;
        this.state.playerCount = this.totalPlayers;
        
        this.hands = [];
        this.boneyard = [];
        this.internalBoard = new Board();
        this.internalBoard.startAxis = this.boardStartAxis;
        this.configureBoardForCurrentMode(this.internalBoard);
        this.playerMissingSuits = Array.from({ length: this.totalPlayers }, () => new Set());
        this.lastDealWinner = null;
        this.dlossThreshold = normalizeDlossThreshold(options.dlossThreshold);
        this.instantWinEnabled = normalizeInstantWinEnabled(options.instantWinEnabled);
        this.aiDifficulty = normalizeAiDifficulty(options.difficulty);
        this.roomVisibility = normalizeRoomVisibility(options.roomVisibility);
        this.currentStakeKey = normalizeStakeKey(options.stakeKey);
        this.economyReservationMade = false;
        this.currentDealMatchId = "";
        this.currentDealStakeKey = this.currentStakeKey;
        this.currentDealStakeAmount = 0;
        this.currentDealBankAmount = 0;
        this.lastReservedMatchRound = 0;
        this.matchRecordId = "";
        this.pendingMatchRecording = null;
        this.matchRecordInFlight = false;
        this.matchRecordRetryTimer = null;
        this.pendingEconomySettlement = Promise.resolve();
        this.pendingEconomySettlementResolve = null;
        this.pendingEconomySettlementState = null;
        this.economySettlementRetryTimer = null;
        this.gameStarting = false;
        this.botTimer = null;
        this.turnTimer = null;
        this.turnTimeoutMs = TURN_TIMEOUT_MS;
        this.turnAdvanceMs = 2000;
        this.turnDeadlineAt = 0;
        this.turnAdvancePending = false;
        this.turnAdvanceTimer = null;
        this.lastMoveRevealTimer = null;
        this.lastMoveRevealPending = false;
        this.nextDealTimer = null;
        this.autoStartTimer = null;
        this.pendingActionContext = null;
        this.botIds = [];
        this.aiPlayers = new Map();
        this.matchRecorded = false;
        this.forfeitSettlementMade = false;
        this.identityBySessionId = new Map();
        this.lastRoundEconomySummary = null;
        this.lastFinishInfo = null;
        this.voiceModerationCache = new Map();
        this.timeoutForfeitPending = null;
        this.timeoutContinueTimer = null;
        this.timeoutContinueInFlight = false;
        this.restoredFromSnapshot = false;
        this.matchFinished = false;
        this.pendingAdvanceKind = null;
        this.pendingDisconnectTimers = new Map();
        this.pendingDisconnects = new Map();
        this.explicitLeaveSessionIds = new Set();
        this.lastLeaveConsentedValue = null;
        this.lastLeaveHadExplicitMarker = false;
        this.lastLeaveTreatedAsExplicit = false;
        this.lastDisconnectGraceStartedAt = 0;
        this.lastDisconnectGraceExpiresAt = 0;
        this.lastDisconnectGraceMs = 0;
        this.lastAllowReconnectionRejectedAt = 0;
        this.lastAllowReconnectionError = "";
        this.lastReconnectSuccessAt = 0;
        this.lastReconnectCompletedAt = 0;
        this.configureBoardForCurrentMode(this.internalBoard);
        this.lastReconnectCompletedBy = "";
        this.lastReconnectGraceExpiredAt = 0;
        this.lastReconnectTimeoutFinalizedAt = 0;
        this.lastTurnTimerPausedForReconnectAt = 0;
        this.lastTurnTimerPausedSessionId = "";
        this.lastTurnTimerPausedPlayerName = "";
        this.lastTurnTimerResumedAfterReconnectAt = 0;
        this.lastTurnTimerResumedSessionId = "";
        this.lastReconnectFullStateSentAt = 0;
        this.lastReconnectFullStateSessionId = "";
        this.lastReconnectFullStateSource = "";
        this.lastReconnectRestoredWasCurrentPlayer = false;
        this.lastForfeitReason = "";
        this.lastGameEndReason = "";
        this.lastGameEndWasExplicitLeave = false;
        this.lastGameEndWasGraceExpired = false;

        if (restoreSnapshot) {
            this.applyCustomStateSnapshot(restoreSnapshot);
            this.restoredFromSnapshot = true;
        }

        this.presenceInterval = setInterval(() => {
            try {
                for (const [sessionId, player] of this.state.players.entries()) {
                    if (player && !player.isBot && player.isConnected) {
                        const identity = this.identityBySessionId.get(sessionId);
                        if (identity) {
                            this.registerLivePlayer(sessionId, identity, player);
                        }
                    }
                }
            } catch (err) {
                console.error("[ROOM] Presence heartbeat error:", err);
            }
        }, 30000);
        if (this.presenceInterval && typeof this.presenceInterval.unref === "function") {
            this.presenceInterval.unref();
        }

        debugLog("[ROOM_DEBUG] create", {
            roomId: this.roomId,
            roomCode: this.roomCode,
            roomVisibility: this.roomVisibility,
            stakeKey: this.currentStakeKey,
            totalPlayers: this.totalPlayers,
            aiCount: this.aiCount,
            humanSeats: this.humanSeats,
            maxClients: this.maxClients,
            roomMode: this.roomMode,
            isTeamMode: isRoomTeamMode(this)
        });

        this.onMessage("play", (client, message) => this.handlePlay(client, message));
        this.onMessage("draw", (client, message) => this.handleDraw(client, message));
        this.onMessage("pass", (client, message) => this.handlePass(client, message));
        this.onMessage("gosha", (client, message) => this.handleGosha(client, message));
        this.onMessage("next_deal", (client) => this.handleNextDeal(client));
        this.onMessage("choose_seat", (client, message) => this.handleChooseSeat(client, message));
        this.onMessage("reaction", (client, message) => this.handleReaction(client, message));
        this.onMessage("gift", (client, message) => this.handleGift(client, message));
        this.onMessage("voice_signal", (client, message) => this.handleVoiceSignal(client, message));
        this.onMessage("timeout_continue", (client) => this.handleTimeoutContinue(client));
        this.onMessage("sync_request", (client) => this.handleSyncRequest(client));
        this.onMessage("resume_control", (client) => this.handleResumeControl(client));
        this.onMessage("explicit_leave", (client, message = {}) => {
            this.explicitLeaveSessionIds.add(client.sessionId);
            debugLog("[ROOM_DEBUG] explicit_leave", {
                roomId: this.roomId,
                roomCode: this.roomCode,
                sessionId: client.sessionId,
                reason: String(message?.reason || "").trim() || null
            });
        });

        if (this.pendingMatchRecording && !this.matchRecorded) {
            void this.retryPendingMatchRecording();
        }

        debugLog(`[ROOM] Created room ${this.roomId} (code ${this.roomCode}), humanSeats=${this.humanSeats}, totalPlayers=${this.totalPlayers}, aiCount=${this.aiCount}, teamMode=${this.state.isTeamMode}`);
    }

    attachStateCollections() {
        this._players = this._players instanceof Map ? this._players : new Map();
        this._playerOrder = Array.isArray(this._playerOrder) ? this._playerOrder : [];
        this._teamScores = Array.isArray(this._teamScores) ? this._teamScores : [0, 0];
        this._teamRoundWins = Array.isArray(this._teamRoundWins) ? this._teamRoundWins : [0, 0];

        const defineCollectionAccessor = (name, key) => {
            const descriptor = Object.getOwnPropertyDescriptor(this.state, name);
            if (descriptor?.get || descriptor?.set) return;
            Object.defineProperty(this.state, name, {
                configurable: true,
                enumerable: false,
                get: () => this[key],
                set: (value) => {
                    this[key] = value;
                }
            });
        };

        defineCollectionAccessor("players", "_players");
        defineCollectionAccessor("playerOrder", "_playerOrder");
        defineCollectionAccessor("teamScores", "_teamScores");
        defineCollectionAccessor("teamRoundWins", "_teamRoundWins");

        this.state.players = this._players;
        this.state.playerOrder = this._playerOrder;
        this.state.teamScores = this._teamScores;
        this.state.teamRoundWins = this._teamRoundWins;
    }

    onAuth(client, options, context) {
        const token = String(context?.token || options?.authToken || options?._authToken || "").trim();
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

        const hasExplicitRestoreRequest = Boolean(
            String(options.restoreReconnectionToken || "").trim()
            || String(options.restoreRoomId || "").trim()
            || String(options.restoreRoomCode || "").trim()
        );
        if (!hasExplicitRestoreRequest) return "";

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

    getPendingDisconnectEntry(sessionId) {
        const normalizedSessionId = String(sessionId || "").trim();
        if (!normalizedSessionId) return null;
        return this.pendingDisconnects?.get(normalizedSessionId) || null;
    }

    clearPendingDisconnect(sessionId) {
        const normalizedSessionId = String(sessionId || "").trim();
        if (!normalizedSessionId) return false;
        const timer = this.pendingDisconnectTimers?.get(normalizedSessionId);
        if (timer) clearTimeout(timer);
        this.pendingDisconnectTimers?.delete(normalizedSessionId);
        const hadEntry = this.pendingDisconnects?.has(normalizedSessionId);
        this.pendingDisconnects?.delete(normalizedSessionId);
        return Boolean(hadEntry);
    }

    getPendingDisconnectSafeEntries() {
        return Array.from(this.pendingDisconnects?.values() || []).map((entry) => ({
            sessionId: String(entry?.sessionId || ""),
            playerName: String(entry?.playerName || ""),
            startedAt: Number(entry?.startedAt || 0) || 0,
            expiresAt: Number(entry?.expiresAt || 0) || 0,
            reason: String(entry?.reason || ""),
            leavingIndex: Number.isInteger(Number(entry?.leavingIndex)) ? Number(entry.leavingIndex) : -1,
            isTeamMode: Boolean(entry?.isTeamMode)
        }));
    }

    getCurrentPlayerReconnectHold() {
        const currentSessionId = String(this.state?.playerOrder?.[this.state?.currentPlayerIndex] || "").trim();
        if (!currentSessionId) return null;
        const player = this.state?.players?.get?.(currentSessionId) || null;
        if (!player || player.isBot) return null;
        if (this.isSeatUnderBotTakeover(player)) return null;
        const pending = this.getPendingDisconnectEntry(currentSessionId);
        if (pending && this.canUseBotTakeoverForSeat(player, { sessionId: currentSessionId, reason: TAKEOVER_REASON.DISCONNECT })) {
            return null;
        }
        if (!pending && player.isConnected !== false) return null;
        return {
            sessionId: currentSessionId,
            player,
            pending
        };
    }

    isCurrentPlayerDisconnectedOrReconnecting() {
        return Boolean(this.getCurrentPlayerReconnectHold());
    }

    pauseTurnTimerForReconnect({ sessionId = "", playerName = "", expiresAt = 0, source = "reconnect" } = {}) {
        this.lastTurnTimerPausedForReconnectAt = Date.now();
        this.lastTurnTimerPausedSessionId = String(sessionId || "").trim();
        this.lastTurnTimerPausedPlayerName = String(playerName || "").trim();
        this.clearTurnTimer();
        this.turnDeadlineAt = Number(expiresAt || 0) || 0;
        this.state.turnDeadlineAt = this.turnDeadlineAt;
        this.state.turnDurationMs = this.turnTimeoutMs;
        this.state.serverNow = Date.now();
        debugLog("[ROOM_DEBUG] turnTimerPausedForReconnect", {
            roomId: getSafeRoomId(this),
            roomCode: String(this.roomCode || "").trim(),
            sessionId: this.lastTurnTimerPausedSessionId,
            playerName: this.lastTurnTimerPausedPlayerName,
            expiresAt: this.turnDeadlineAt,
            source
        });
        this.broadcastRoomState();
    }

    resumeTurnTimerAfterReconnect({ sessionId = "", source = "reconnect" } = {}) {
        const normalizedSessionId = String(sessionId || "").trim();
        if (!normalizedSessionId) return false;
        const currentSessionId = String(this.state?.playerOrder?.[this.state?.currentPlayerIndex] || "").trim();
        if (currentSessionId !== normalizedSessionId) return false;
        const player = this.state?.players?.get?.(normalizedSessionId) || null;
        if (!player || player.isBot || player.isConnected === false) return false;

        this.lastTurnTimerResumedAfterReconnectAt = Date.now();
        this.lastTurnTimerResumedSessionId = normalizedSessionId;
        debugLog("[ROOM_DEBUG] turnTimerResumedAfterReconnect", {
            roomId: getSafeRoomId(this),
            roomCode: String(this.roomCode || "").trim(),
            sessionId: normalizedSessionId,
            source
        });
        this.clearTurnTimer();
        this.scheduleTurnTimer();
        return true;
    }

    sendReconnectRestoreState(sessionId, { source = "reconnect" } = {}) {
        const normalizedSessionId = String(sessionId || "").trim();
        if (!normalizedSessionId) return false;
        const client = this.clients.find((entry) => entry?.sessionId === normalizedSessionId);
        if (!client) return false;

        const currentSessionId = String(this.state?.playerOrder?.[this.state?.currentPlayerIndex] || "").trim();
        const wasCurrentPlayer = currentSessionId === normalizedSessionId;
        this.lastReconnectFullStateSentAt = Date.now();
        this.lastReconnectFullStateSessionId = normalizedSessionId;
        this.lastReconnectFullStateSource = String(source || "reconnect").trim() || "reconnect";
        this.lastReconnectRestoredWasCurrentPlayer = wasCurrentPlayer;

        this.sendFullState(client);
        this.sendHandToClient(client);
        if (wasCurrentPlayer) {
            this.sendTurnInfoToPlayerIndex(this.state.currentPlayerIndex);
        }
        return true;
    }

    startReconnectGrace(client, {
        player,
        identity,
        playerName = "",
        leavingIndex = -1,
        isTeamMode = false,
        reason = "accidental_disconnect"
    } = {}) {
        const sessionId = String(client?.sessionId || "").trim();
        if (!sessionId) return null;
        this.pendingDisconnectTimers = this.pendingDisconnectTimers instanceof Map ? this.pendingDisconnectTimers : new Map();
        this.pendingDisconnects = this.pendingDisconnects instanceof Map ? this.pendingDisconnects : new Map();
        if (this.pendingDisconnects?.has(sessionId)) {
            return this.pendingDisconnects.get(sessionId);
        }

        const resolvedPlayer = player || this.state.players.get(sessionId) || null;
        const resolvedPlayerName = String(playerName || resolvedPlayer?.name || "Player").trim() || "Player";
        const startedAt = Date.now();
        const expiresAt = startedAt + RECONNECT_GRACE_MS;
        const entry = {
            sessionId,
            playerName: resolvedPlayerName,
            startedAt,
            expiresAt,
            leavingIndex,
            isTeamMode: Boolean(isTeamMode),
            reason: String(reason || "accidental_disconnect").trim() || "accidental_disconnect"
        };

        this.pendingDisconnects.set(sessionId, entry);
        this.lastDisconnectGraceStartedAt = startedAt;
        this.lastDisconnectGraceExpiresAt = expiresAt;
        this.lastDisconnectGraceMs = RECONNECT_GRACE_MS;
        this.lastReconnectTimeoutFinalizedAt = 0;
        this.lastForfeitReason = "";
        this.lastGameEndWasExplicitLeave = false;
        this.lastGameEndWasGraceExpired = false;
        this.lastGameEndReason = "";

        if (resolvedPlayer) {
            resolvedPlayer.isConnected = false;
        }

        if (
            this.state?.gameActive
            && String(this.state?.playerOrder?.[this.state?.currentPlayerIndex] || "") === sessionId
            && !this.canUseBotTakeoverForSeat(resolvedPlayer, { sessionId, reason: TAKEOVER_REASON.DISCONNECT })
        ) {
            this.pauseTurnTimerForReconnect({
                sessionId,
                playerName: resolvedPlayerName,
                expiresAt,
                source: reason
            });
        }

        const resolvedIdentity = identity || this.identityBySessionId.get(sessionId) || null;
        if (resolvedIdentity) {
            upsertLivePlayer(sessionId, {
                sessionId,
                roomId: getSafeRoomId(this),
                roomCode: String(this.roomCode || "").trim(),
                roomVisibility: this.roomVisibility,
                gameMode: this.gameMode,
                roomMode: isTeamMode ? "team" : "ffa",
                stakeKey: this.currentStakeKey,
                stakeAmount: this.currentDealStakeAmount || 0,
                humanSeats: this.humanSeats,
                totalPlayers: this.totalPlayers,
                aiCount: this.aiCount,
                isTeamMode,
                provider: resolvedIdentity.provider || "platform",
                userId: resolvedIdentity.userId || "",
                playerId: resolvedIdentity.playerId || resolvedIdentity.userId || "",
                avatarUrl: resolvedIdentity.avatarUrl || "",
                displayName: resolvedIdentity.displayName || resolvedPlayer?.name || resolvedPlayerName,
                hostName: this.state.players.get(this.state.playerOrder[0])?.name || resolvedPlayer?.name || resolvedPlayerName,
                role: resolvedIdentity.role || (this.state.playerOrder[0] === sessionId ? "host" : "player"),
                isConnected: false,
                isPlaying: Boolean(this.state.gameActive)
            });
        }

        debugLog("[ROOM_DEBUG] leave:waiting_reconnect", {
            roomId: getSafeRoomId(this),
            roomCode: String(this.roomCode || "").trim(),
            sessionId,
            reason: entry.reason,
            graceStartedAt: startedAt,
            graceExpiresAt: expiresAt,
            graceMs: RECONNECT_GRACE_MS
        });

        this.broadcastRoomState();
        this.broadcast("msg", {
            key: "connection-reconnecting",
            values: { player: resolvedPlayerName },
            time: 2200
        });

        const timer = setTimeout(() => {
            void this.finalizeReconnectTimeout(sessionId);
        }, RECONNECT_GRACE_MS);
        if (typeof timer?.unref === "function") timer.unref();
        this.pendingDisconnectTimers.set(sessionId, timer);

        try {
            const maybePromise = this.allowReconnection(client, RECONNECT_GRACE_MS / 1000);
            if (maybePromise && typeof maybePromise.then === "function") {
                maybePromise
                    .then((reconnectedClient) => {
                        void this.completeReconnectGrace(sessionId, reconnectedClient?.sessionId || client?.sessionId || sessionId, { source: "allowReconnection" });
                    })
                    .catch((error) => {
                        this.lastAllowReconnectionRejectedAt = Date.now();
                        this.lastAllowReconnectionError = String(error?.message || error || "allowReconnection_failed");
                        debugLog("[ROOM_DEBUG] leave:allow_reconnection_rejected", {
                            roomId: getSafeRoomId(this),
                            roomCode: String(this.roomCode || "").trim(),
                            sessionId,
                            reason: this.lastAllowReconnectionError
                        });
                    });
            } else {
                this.lastAllowReconnectionRejectedAt = Date.now();
                this.lastAllowReconnectionError = "allowReconnection did not return a promise";
            }
        } catch (error) {
            this.lastAllowReconnectionRejectedAt = Date.now();
            this.lastAllowReconnectionError = String(error?.message || error || "allowReconnection_failed");
            debugLog("[ROOM_DEBUG] leave:allow_reconnection_threw", {
                roomId: getSafeRoomId(this),
                roomCode: String(this.roomCode || "").trim(),
                sessionId,
                reason: this.lastAllowReconnectionError
            });
        }

        return entry;
    }

    completeReconnectGrace(sessionId, nextSessionId = sessionId, { source = "reconnect" } = {}) {
        const normalizedSessionId = String(sessionId || "").trim();
        const normalizedNextSessionId = String(nextSessionId || sessionId || "").trim() || normalizedSessionId;
        if (!normalizedSessionId) return false;

        const pending = this.pendingDisconnects?.get(normalizedSessionId) || this.pendingDisconnects?.get(normalizedNextSessionId) || null;
        if (!pending) return false;

        // 1. Swap/update session ID references if they differ
        if (normalizedNextSessionId !== normalizedSessionId) {
            if (this.state.players.has(normalizedSessionId) && !this.state.players.has(normalizedNextSessionId)) {
                const p = this.state.players.get(normalizedSessionId);
                this.state.players.delete(normalizedSessionId);
                this.state.players.set(normalizedNextSessionId, p);
            }
            const orderIndex = this.state.playerOrder.indexOf(normalizedSessionId);
            if (orderIndex !== -1) {
                this.state.playerOrder.splice(orderIndex, 1, normalizedNextSessionId);
            }
            if (this.identityBySessionId.has(normalizedSessionId) && !this.identityBySessionId.has(normalizedNextSessionId)) {
                const ident = this.identityBySessionId.get(normalizedSessionId);
                this.identityBySessionId.delete(normalizedSessionId);
                this.identityBySessionId.set(normalizedNextSessionId, ident);
            }
            if (this.voiceEnabledBySessionId?.has?.(normalizedSessionId) && !this.voiceEnabledBySessionId?.has?.(normalizedNextSessionId)) {
                const voice = this.voiceEnabledBySessionId.get(normalizedSessionId);
                this.voiceEnabledBySessionId.delete(normalizedSessionId);
                this.voiceEnabledBySessionId.set(normalizedNextSessionId, voice);
            }
            removeLivePlayer(normalizedSessionId);
        }

        // 2. Mark player connected
        const player = this.state.players.get(normalizedNextSessionId);
        if (player) {
            player.isConnected = true;
        }

        // 3. Clear pending disconnect
        this.clearPendingDisconnect(normalizedSessionId);
        if (normalizedNextSessionId !== normalizedSessionId) {
            this.clearPendingDisconnect(normalizedNextSessionId);
        }

        const identity = this.identityBySessionId.get(normalizedNextSessionId);
        if (identity && player) {
            upsertLivePlayer(normalizedNextSessionId, {
                sessionId: normalizedNextSessionId,
                roomId: getSafeRoomId(this),
                roomCode: String(this.roomCode || "").trim(),
                roomVisibility: this.roomVisibility,
                gameMode: this.gameMode,
                roomMode: pending.isTeamMode ? "team" : "ffa",
                stakeKey: this.currentStakeKey,
                stakeAmount: this.currentDealStakeAmount || 0,
                humanSeats: this.humanSeats,
                totalPlayers: this.totalPlayers,
                aiCount: this.aiCount,
                isTeamMode: Boolean(pending.isTeamMode),
                provider: identity.provider || "platform",
                userId: identity.userId || "",
                playerId: identity.playerId || identity.userId || "",
                avatarUrl: identity.avatarUrl || "",
                displayName: identity.displayName || player.name || pending.playerName || "Player",
                hostName: this.state.players.get(this.state.playerOrder[0])?.name || player.name || pending.playerName || "Player",
                role: identity.role || (this.state.playerOrder[0] === normalizedNextSessionId ? "host" : "player"),
                isConnected: true,
                isPlaying: Boolean(this.state.gameActive)
            });
        }
        if (player && this.isSeatUnderBotTakeover(player)) {
            this.botTakeover?.resume?.(player, {
                requestUserId: identity?.userId || player.userId || ""
            });
        }

        this.lastReconnectSuccessAt = Date.now();
        this.lastReconnectCompletedAt = this.lastReconnectSuccessAt;
        this.lastReconnectCompletedBy = String(source || "reconnect");
        this.lastForfeitReason = "";
        this.lastGameEndReason = "";
        this.lastReconnectGraceExpiredAt = 0;

        const playerName = String(player?.name || pending.playerName || "Player").trim() || "Player";
        debugLog("[ROOM_DEBUG] leave:reconnected", {
            roomId: getSafeRoomId(this),
            roomCode: String(this.roomCode || "").trim(),
            sessionId: normalizedSessionId,
            nextSessionId: normalizedNextSessionId,
            reconnectSuccessAt: this.lastReconnectSuccessAt,
            source: this.lastReconnectCompletedBy,
            players: debugPlayerSummary(this)
        });
        this.broadcast("msg", {
            key: "msg-player-reconnected",
            values: { player: playerName },
            time: 1500
        });

        // 4. resume turn timer / update deadline
        this.resumeTurnTimerAfterReconnect({ sessionId: normalizedNextSessionId, source });

        // 5. send full_state or broadcast state if sessionId changed
        if (normalizedNextSessionId !== normalizedSessionId) {
            this.broadcastFullState({ includeRoomState: true });
        } else {
            this.sendReconnectRestoreState(normalizedNextSessionId, { source });
            // 6. sync state
            this.syncState();
        }

        return true;
    }

    async finalizeReconnectTimeout(sessionId) {
        const normalizedSessionId = String(sessionId || "").trim();
        if (!normalizedSessionId) return false;

        const pending = this.pendingDisconnects?.get(normalizedSessionId) || null;
        if (!pending) return false;

        const player = this.state.players.get(normalizedSessionId);
        if (player && player.isConnected) {
            this.clearPendingDisconnect(normalizedSessionId);
            return false;
        }

        this.clearPendingDisconnect(normalizedSessionId);
        this.lastReconnectTimeoutFinalizedAt = Date.now();
        this.lastReconnectGraceExpiredAt = this.lastReconnectTimeoutFinalizedAt;

        const playerName = String(player?.name || pending.playerName || "Player").trim() || "Player";
        const leavingIndex = Number.isInteger(Number(pending.leavingIndex)) ? Number(pending.leavingIndex) : this.state.playerOrder.indexOf(normalizedSessionId);
        const isTeamMode = Boolean(pending.isTeamMode);

        debugLog("[ROOM_DEBUG] leave:grace_timeout", {
            roomId: getSafeRoomId(this),
            roomCode: String(this.roomCode || "").trim(),
            sessionId: normalizedSessionId,
            playerName,
            expiresAt: Number(pending.expiresAt || 0) || 0
        });

        if (!this.state.gameActive) {
            this.state.players.delete(normalizedSessionId);
            this.identityBySessionId.delete(normalizedSessionId);
            removeLivePlayer(normalizedSessionId);
            const idx = this.state.playerOrder.indexOf(normalizedSessionId);
            if (idx !== -1) this.state.playerOrder.splice(idx, 1);
            this.rebuildPlayerOrderBySeats();
            this.broadcast("msg", { key: "msg-player-left-room", values: { player: playerName }, time: 1500 });
            this.broadcastRoomState();
            return true;
        }

        if (player && this.canUseBotTakeoverForSeat(player, { sessionId: normalizedSessionId, reason: TAKEOVER_REASON.DISCONNECT })) {
            const beganTakeover = this.botTakeover?.begin?.(player, TAKEOVER_REASON.DISCONNECT) === true;
            if (beganTakeover) {
                this.lastForfeitReason = "";
                this.lastGameEndReason = "";
                this.lastGameEndWasExplicitLeave = false;
                this.lastGameEndWasGraceExpired = false;
                this.syncState({ includeBoardJson: false });
                return true;
            }
        }

        this.lastForfeitReason = "reconnect_timeout";
        this.lastGameEndReason = "disconnect";
        this.lastGameEndWasExplicitLeave = false;
        this.lastGameEndWasGraceExpired = true;

        const settlement = await this.settleForfeitStake(normalizedSessionId).catch((err) => {
            console.error("[ROOM] Failed to settle forfeit stake during reconnect timeout:", err);
            return null;
        });
        if (!settlement) {
            console.warn("[ROOM] Forfeit settlement did not complete; notifying the player that support may be needed.");
            this.broadcast("msg", {
                key: "forfeit-settlement-failed",
                time: 3500
            });
        }
        await this.recordForfeitMatchResult(normalizedSessionId);
        this.state.gameActive = false;
        this.state.matchOver = true;
        this.state.gameOverReason = "disconnect";
        this.state.gameOverPlayerName = playerName;
        this.state.gameOverWinnerIndex = isTeamMode && leavingIndex !== -1 ? (leavingIndex % 2 === 0 ? 1 : 0) : -1;
        this.state.gameOverSummaryJson = settlement ? JSON.stringify(settlement) : "";
        this.clearTurnTimer();
        this.clearNextDealTimer();
        this.broadcastRoomState();
        this.broadcast("msg", {
            key: "game-over-disconnect",
            values: { player: playerName },
            time: 2500
        });
        this.syncState();
        return true;
    }

    getPlayerSeatIndex(sessionId) {
        const player = this.state.players.get(sessionId);
        const seatIndex = Number(player?.seatIndex);
        return Number.isInteger(seatIndex) && seatIndex >= 0 ? seatIndex : -1;
    }

    isSeatAvailable(seatIndex, ignoreSessionId = "") {
        const normalizedSeatIndex = Number(seatIndex);
        if (!Number.isInteger(normalizedSeatIndex) || normalizedSeatIndex < 0 || normalizedSeatIndex >= this.totalPlayers) {
            return false;
        }
        for (const [sessionId, player] of this.state.players.entries()) {
            if (!player || player.isBot || sessionId === ignoreSessionId) continue;
            if (Number(player.seatIndex) === normalizedSeatIndex) {
                return false;
            }
        }
        return true;
    }

    getFirstAvailableSeatIndex() {
        for (let seatIndex = 0; seatIndex < this.totalPlayers; seatIndex++) {
            if (this.isSeatAvailable(seatIndex)) return seatIndex;
        }
        return -1;
    }

    rebuildPlayerOrderBySeats() {
        const currentOrder = Array.from(this.state.playerOrder || []).filter((sessionId) => this.state.players.has(sessionId));
        const orderIndex = new Map(currentOrder.map((sessionId, index) => [sessionId, index]));
        for (const sessionId of this.state.players.keys()) {
            if (orderIndex.has(sessionId)) continue;
            orderIndex.set(sessionId, currentOrder.length);
            currentOrder.push(sessionId);
        }
        currentOrder.sort((a, b) => {
            const seatA = this.getPlayerSeatIndex(a);
            const seatB = this.getPlayerSeatIndex(b);
            const rankA = seatA >= 0 ? seatA : this.totalPlayers + (orderIndex.get(a) ?? 0);
            const rankB = seatB >= 0 ? seatB : this.totalPlayers + (orderIndex.get(b) ?? 0);
            if (rankA !== rankB) return rankA - rankB;
            return (orderIndex.get(a) ?? 0) - (orderIndex.get(b) ?? 0);
        });
        this.replaceSchemaArray(this.state.playerOrder, currentOrder);
    }

    countSeatedHumanPlayers() {
        let count = 0;
        for (const sessionId of this.state.playerOrder) {
            const player = this.state.players.get(sessionId);
            if (!player || player.isBot) continue;
            if (Number.isInteger(Number(player.seatIndex)) && Number(player.seatIndex) >= 0) {
                count += 1;
            }
        }
        return count;
    }

    countConnectedHumanPlayers() {
        let count = 0;
        for (const sessionId of this.state.playerOrder) {
            const player = this.state.players.get(sessionId);
            if (!player || player.isBot || !player.isConnected) continue;
            count += 1;
        }
        return count;
    }

    countReadyHumanPlayers() {
        let count = 0;
        for (const sessionId of this.state.playerOrder) {
            const player = this.state.players.get(sessionId);
            if (!player || player.isBot || !player.isConnected) continue;
            if (Number.isInteger(Number(player.seatIndex)) && Number(player.seatIndex) >= 0) {
                count += 1;
            }
        }
        return count;
    }

    getPlayerForTurnIndex(playerIndex) {
        const normalizedIndex = Number(playerIndex);
        if (!Number.isInteger(normalizedIndex) || normalizedIndex < 0) return null;
        const sessionId = String(this.state?.playerOrder?.[normalizedIndex] || "").trim();
        if (!sessionId) return null;
        return this.state?.players?.get?.(sessionId) || null;
    }

    isSeatUnderBotTakeover(player) {
        return Boolean(this.botTakeover?.isBotControlled?.(player));
    }

    isSeatDrivenByBot(player) {
        return Boolean(player?.isBot) || this.isSeatUnderBotTakeover(player);
    }

    canUseBotTakeoverForSeat(player, { sessionId = "", reason = TAKEOVER_REASON.DISCONNECT } = {}) {
        const normalizedSessionId = String(sessionId || "").trim();
        if (!this.botTakeover?.isEnabled?.()) return false;
        if (!player || player.isBot) return false;
        if (!this.state?.gameActive || this.matchFinished) return false;
        if (reason === "explicit_leave") return false;
        if (normalizedSessionId && this.explicitLeaveSessionIds?.has?.(normalizedSessionId)) return false;
        return !this.botTakeover?.hasReachedTakeoverLimit?.(player);
    }

    hasConnectedHumanController() {
        for (const sessionId of this.state?.playerOrder || []) {
            const player = this.state?.players?.get?.(sessionId);
            if (!player || player.isBot) continue;
            if (this.isSeatUnderBotTakeover(player)) continue;
            if (player.isConnected !== false) {
                return true;
            }
        }
        return false;
    }

    getAllAbsentPlayerRows() {
        return Array.from(this.state?.playerOrder || []).map((sessionId, index) => {
            const player = this.state?.players?.get?.(sessionId) || null;
            return {
                name: player?.name || `Player ${index + 1}`,
                score: Number(player?.score || 0),
                roundWins: Number(player?.roundWins || 0),
                isWinner: false
            };
        });
    }

    async endMatchAllAbsent() {
        if (this.matchFinished) return false;
        if (this.botTimer) {
            clearTimeout(this.botTimer);
            this.botTimer = null;
        }
        this.clearTurnTimer();
        this.clearTurnAdvanceTimer();
        this.clearLastMoveRevealTimer();
        this.clearNextDealTimer();
        this.pendingAdvanceKind = null;
        this.state.gameActive = false;
        this.state.matchOver = true;
        this.matchFinished = true;
        this.lastGameEndReason = "all_absent";
        this.state.gameOverReason = "all_absent";
        this.state.gameOverPlayerName = "";
        this.state.gameOverWinnerIndex = -1;

        const economySummary = this.currentStakeKey !== "free"
            ? await this.settleEconomyRound(-1, false, null, null, { matchOutcome: "all_absent" })
            : null;
        this.state.gameOverSummaryJson = economySummary ? JSON.stringify(economySummary) : "";
        await this.recordMatchResult(-1, false, this.getAllAbsentPlayerRows(), 0, { matchOutcome: "all_absent" });
        this.broadcastRoomState();
        this.broadcast("msg", {
            key: "bot-takeover-all-absent",
            time: 2600
        });
        this.syncState({ includeBoardJson: false });
        return true;
    }

    onBotTakeoverActivated(player) {
        if (!player) return;
        if (!this.hasConnectedHumanController()) {
            void this.endMatchAllAbsent();
            return;
        }
        this.syncState({ includeBoardJson: false });
        const currentSessionId = String(this.state?.playerOrder?.[this.state?.currentPlayerIndex] || "").trim();
        const playerSessionId = Array.from(this.state?.players?.entries?.() || []).find(([, value]) => value === player)?.[0] || "";
        if (currentSessionId && currentSessionId === playerSessionId && this.state?.gameActive) {
            this.scheduleBotTurn(BOT_THINK_DELAY_MS);
        }
    }

    onHumanControlResumed(player) {
        if (!player) return;
        if (this.botTimer) {
            clearTimeout(this.botTimer);
            this.botTimer = null;
        }
        this.syncState({ includeBoardJson: false });
        const currentSessionId = String(this.state?.playerOrder?.[this.state?.currentPlayerIndex] || "").trim();
        const playerSessionId = Array.from(this.state?.players?.entries?.() || []).find(([, value]) => value === player)?.[0] || "";
        if (currentSessionId && currentSessionId === playerSessionId && this.state?.gameActive) {
            this.scheduleTurnTimer();
        }
    }

    getAutoStartState() {
        const players = Array.from(this.state?.players?.values?.() || []);
        const humanPlayers = players.filter((player) => player && !player.isBot);
        const botPlayers = players.filter((player) => player && player.isBot);
        const connectedHumanPlayers = humanPlayers.filter((player) => Boolean(player.isConnected));
        const seatedHumanPlayers = connectedHumanPlayers.filter((player) => Number.isInteger(Number(player.seatIndex)) && Number(player.seatIndex) >= 0);
        const isTeamMode = Boolean(isRoomTeamMode(this));
        const roomMode = isTeamMode ? "team" : "ffa";
        const readyPlayersCount = isTeamMode ? seatedHumanPlayers.length : connectedHumanPlayers.length;
        const botsReadyCount = botPlayers.filter((player) => Boolean(player.isConnected)).length;
        const occupiedSeats = players.filter((player) => Number.isInteger(Number(player?.seatIndex)) && Number(player.seatIndex) >= 0).length;
        const canStart = isTeamMode
            ? seatedHumanPlayers.length >= this.humanSeats && connectedHumanPlayers.length >= this.humanSeats
            : connectedHumanPlayers.length >= this.humanSeats;
        let blockedReason = "";

        if (this.state.gameActive) {
            blockedReason = "already_game_active";
        } else if (this.gameStarting) {
            blockedReason = "game_starting";
        } else if (this.matchFinished) {
            blockedReason = "match_finished";
        } else if (this.hasRestoredMatchInProgress()) {
            blockedReason = "restored_match";
        } else if (connectedHumanPlayers.length < this.humanSeats) {
            blockedReason = "waiting-for-human";
        } else if (isTeamMode && seatedHumanPlayers.length < this.humanSeats) {
            blockedReason = "waiting-for-seat";
        } else if (!canStart) {
            blockedReason = "waiting-for-ready";
        }

        return {
            roomMode,
            isTeamMode,
            maxPlayers: Number(this.totalPlayers || 0),
            occupiedSeats,
            humanCount: connectedHumanPlayers.length,
            botCount: botPlayers.length,
            readyPlayersCount,
            botsReadyCount,
            canStart,
            blockedReason,
            connectedHumanPlayers,
            seatedHumanPlayers,
            botPlayers
        };
    }

    async closeWaitingOpenRoom(reason = "host_left") {
        this.state.gameActive = false;
        this.state.matchOver = true;
        this.state.gameOverReason = reason;
        this.gameStarting = false;
        this.matchFinished = true;
        this.clearTurnTimer();
        this.clearNextDealTimer();
        if (this.autoStartTimer) {
            clearTimeout(this.autoStartTimer);
            this.autoStartTimer = null;
        }
        this.broadcast("room_closed", {
            reasonKey: "open-room-host-left",
            returnTo: "open_rooms",
            roomVisibility: "open"
        });
        this.broadcast("msg", {
            key: "open-room-host-left",
            time: 2000
        });
        if (this.roomCode) {
            await forgetRoom(this.roomCode, this.roomId);
        }
        removeRoomPlayers(this.roomId);
        const closeClients = () => {
            for (const activeClient of (this.clients || []).slice()) {
                try {
                    activeClient.leave(4000);
                } catch {}
            }
            try {
                this.disconnect?.();
            } catch {}
        };
        if (this.clock?.setTimeout) {
            this.clock.setTimeout(closeClients, 150);
            return;
        }
        setTimeout(closeClients, 150);
    }

    areAllHumanPlayersSeated() {
        if (this.totalPlayers <= 2) return true;
        return this.countSeatedHumanPlayers() >= this.humanSeats;
    }

    setPlayerSeat(sessionId, seatIndex) {
        const player = this.state.players.get(sessionId);
        if (!player || player.isBot) return false;
        const normalizedSeatIndex = Number(seatIndex);
        if (!Number.isInteger(normalizedSeatIndex) || normalizedSeatIndex < 0 || normalizedSeatIndex >= this.totalPlayers) {
            return false;
        }
        const currentSeatIndex = this.getPlayerSeatIndex(sessionId);
        if (currentSeatIndex === normalizedSeatIndex) return true;
        if (!this.isSeatAvailable(normalizedSeatIndex, sessionId)) return false;
        player.seatIndex = normalizedSeatIndex;
        this.rebuildPlayerOrderBySeats();
        return true;
    }

    maybeAutoStartGame() {
        const autoStartState = this.getAutoStartState();
        this._lastAutoStartCheckAt = Date.now();
        if (this.gameStarting || this.autoStartTimer) {
            this._lastAutoStartBlockedReason = autoStartState.blockedReason || "game_starting";
            debugLog("[ROOM_DEBUG] autostart:decision", {
                roomId: this.roomId,
                roomCode: this.roomCode,
                roomMode: autoStartState.roomMode,
                isTeamMode: autoStartState.isTeamMode,
                totalPlayers: this.totalPlayers,
                maxPlayers: autoStartState.maxPlayers,
                maxClients: this.maxClients,
                clientsLength: this.clients.length,
                aiCount: this.aiCount,
                gameActive: this.state.gameActive,
                gameStarting: this.gameStarting,
                matchFinished: this.matchFinished,
                readyPlayersCount: autoStartState.readyPlayersCount,
                botsReadyCount: autoStartState.botsReadyCount,
                humanCount: autoStartState.humanCount,
                botCount: autoStartState.botCount,
                occupiedSeats: autoStartState.occupiedSeats,
                botIdsLength: this.botIds.length,
                playerOrder: Array.from(this.state.playerOrder || []),
                players: debugPlayerSummary(this),
                blockedReason: this._lastAutoStartBlockedReason || null,
                decision: "wait",
                reason: "game_starting"
            });
            return true;
        }
        const reason = autoStartState.canStart ? "start" : autoStartState.blockedReason || "waiting-for-ready";
        const decision = autoStartState.canStart ? "start" : "wait";
        this._lastAutoStartBlockedReason = autoStartState.canStart ? "" : reason;
        debugLog("[ROOM_DEBUG] autostart:decision", {
            roomId: this.roomId,
            roomCode: this.roomCode,
            roomMode: autoStartState.roomMode,
            isTeamMode: autoStartState.isTeamMode,
            totalPlayers: this.totalPlayers,
            maxPlayers: autoStartState.maxPlayers,
            maxClients: this.maxClients,
            clientsLength: this.clients.length,
            aiCount: this.aiCount,
            gameActive: this.state.gameActive,
            gameStarting: this.gameStarting,
            matchFinished: this.matchFinished,
            readyPlayersCount: autoStartState.readyPlayersCount,
            botsReadyCount: autoStartState.botsReadyCount,
            humanCount: autoStartState.humanCount,
            botCount: autoStartState.botCount,
            occupiedSeats: autoStartState.occupiedSeats,
            botIdsLength: this.botIds.length,
            playerOrder: Array.from(this.state.playerOrder || []),
            players: debugPlayerSummary(this),
            blockedReason: autoStartState.blockedReason || null,
            decision,
            reason
        });
        if (decision !== "start") return false;
        if (this.gameStarting || this.autoStartTimer) return true;
        this.gameStarting = true;
        this.autoStartTimer = setTimeout(() => {
            this.autoStartTimer = null;
            this._lastAutoStartTriggeredAt = Date.now();
            void this.startGame({ allowAlreadyStarting: true });
        }, AUTO_START_DELAY_MS);
        return true;
    }

    hasRestoredMatchInProgress() {
        if (!this.restoredFromSnapshot) return false;
        if (this.state.gameActive) return true;
        if (this.state.matchRound > 1 || this.state.deal > 1) return true;
        if (Array.isArray(this.hands) && this.hands.some((hand) => Array.isArray(hand) && hand.length > 0)) return true;
        return Boolean(this.internalBoard?.nodes?.length);
    }

    registerLivePlayer(sessionId, identity, player, joinedAt = null) {
        const hostPlayer = this.state.players.get(this.state.playerOrder[0]);
        upsertLivePlayer(sessionId, buildLivePlayerPayload({
            sessionId,
            room: this,
            identity,
            player,
            hostPlayer,
            joinedAt
        }));
    }

    onJoin(client, options, auth) {
        const identity = auth || {};
        debugLog(`[ROOM] Client ${client.sessionId} joining with name: ${options.name}`);
        debugLog("[ROOM_DEBUG] join:start", {
            roomId: this.roomId,
            roomCode: this.roomCode,
            sessionId: client.sessionId,
            clientsLength: this.clients.length,
            playerOrder: Array.from(this.state.playerOrder || []),
            totalPlayers: this.totalPlayers,
            aiCount: this.aiCount,
            humanSeats: this.humanSeats,
            maxClients: this.maxClients
        });
        const requestedGameMode = normalizeGameMode(options.gameMode || this.gameMode || this.mode);
        if (requestedGameMode && this.gameMode && requestedGameMode !== this.gameMode) {
            client.send("room_closed", { reasonKey: "room-closed-game-mode-mismatch" });
            void client.leave();
            return;
        }
        const authToken = normalizeAuthToken(identity, options);
        const reusableSessionId = this.findReusableSessionId(options, identity);
        const humanPlayers = this.state.playerOrder.filter((sessionId) => !this.state.players.get(sessionId)?.isBot).length;
        let player;
        let restoredJoin = false;
        let isFreshJoin = false;

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
                this.identityBySessionId.set(client.sessionId, buildRoomIdentity({
                    existingIdentity,
                    identity,
                    authToken,
                    player,
                    options,
                    isHost: this.state.playerOrder[0] === client.sessionId
                }));
            }
        } else {
            if (this.hasRestoredMatchInProgress() || humanPlayers >= this.humanSeats) {
                client.send("room_closed", { reasonKey: "room-closed-session-expired" });
                void client.leave();
                return;
            }

            player = {
                name: getFirstNameDisplayName(identity.displayName || options.name, options.name || "Player"),
                userId: String(identity.userId || ""),
                score: 0,
                roundWins: 0,
                handCount: 0,
                isConnected: true,
                isBot: false,
                avatarUrl: String(identity.avatarUrl || options.avatarUrl || "").trim(),
                seatIndex: this.state.isTeamMode
                    ? (this.state.playerOrder.length === 0 ? 0 : -1)
                    : (this.getFirstAvailableSeatIndex() >= 0 ? this.getFirstAvailableSeatIndex() : (this.state.playerOrder.length === 0 ? 0 : -1))
            };
            this.state.players.set(client.sessionId, player);
            this.state.playerOrder.push(client.sessionId);
            if (player.seatIndex >= 0) {
                this.rebuildPlayerOrderBySeats();
            }
            isFreshJoin = true;
        }

        if (!player) return;

        if (!isFreshJoin) {
            player.name = getFirstNameDisplayName(identity.displayName || player.name || options.name, player.name || options.name || "Player");
            player.userId = String(identity.userId || player.userId || "");
            player.avatarUrl = String(identity.avatarUrl || player.avatarUrl || options.avatarUrl || "").trim();
            player.isConnected = true;
            if (!Number.isInteger(Number(player.seatIndex))) {
                player.seatIndex = -1;
            }
        }

        const existingIdentity = this.identityBySessionId.get(client.sessionId) || {};
        const nextIdentity = buildRoomIdentity({
            existingIdentity,
            identity,
            authToken,
            player,
            options,
            isHost: this.state.playerOrder[0] === client.sessionId
        });
        this.identityBySessionId.set(client.sessionId, nextIdentity);
        debugLog("[ROOM_DEBUG] join:identity", {
            sessionId: client.sessionId,
            hasUserId: Boolean(String(nextIdentity.userId || "").trim()),
            hasPlayerId: Boolean(String(nextIdentity.playerId || "").trim()),
            hasAuthToken: Boolean(String(nextIdentity.authToken || "").trim()),
            provider: nextIdentity.provider || "platform",
            displayName: nextIdentity.displayName || player.name || options.name || "Player"
        });

        this.registerLivePlayer(client.sessionId, nextIdentity, player);
        if (reusableSessionId && this.getPendingDisconnectEntry(reusableSessionId)) {
            this.completeReconnectGrace(reusableSessionId, client.sessionId, { source: "join" });
        } else if (player && this.isSeatUnderBotTakeover(player)) {
            this.botTakeover?.resume?.(player, {
                requestUserId: nextIdentity?.userId || player.userId || ""
            });
        }

        debugLog(`[ROOM] Current player count: ${this.clients.length} / ${this.maxClients}`);
        this.broadcast("msg", {
            key: restoredJoin ? "msg-player-rejoined-room" : "msg-player-joined-room",
            values: { player: player.name },
            time: 1500
        });
        if (this.state.gameActive || this.hasRestoredMatchInProgress()) {
            this.syncState();
        } else {
            this.broadcastRoomState();
        }
        if (restoredJoin || reusableSessionId) {
            this.sendReconnectRestoreState(client.sessionId, { source: restoredJoin ? "join" : "restore" });
        }
        if (this.maybeAutoStartGame()) {
            debugLog(`[ROOM] Room full. Starting game...`);
        }
        debugLog("[ROOM_DEBUG] join:assigned", {
            sessionId: client.sessionId,
            seatIndex: Number.isInteger(Number(player.seatIndex)) ? Number(player.seatIndex) : -1,
            isHost: this.state.playerOrder[0] === client.sessionId,
            playerOrder: Array.from(this.state.playerOrder || []),
            connectedHumans: typeof this.countConnectedHumanPlayers === "function" ? this.countConnectedHumanPlayers() : this.clients.length,
            readyHumans: this.countReadyHumanPlayers(),
            seatedHumans: this.countSeatedHumanPlayers()
        });
    }

    onDispose() {
        if (this.roomCode) {
            void forgetRoom(this.roomCode, this.roomId);
        }
        removeRoomPlayers(this.roomId);
        if (this.presenceInterval) {
            clearInterval(this.presenceInterval);
            this.presenceInterval = null;
        }
        if (redis && this.roomId) {
            void redis.del(`domino:custom:${this.roomId}`).catch(() => {});
            if (this.roomCode) {
                void redis.del(`domino:custom:code:${this.roomCode}`).catch(() => {});
            }
        }
        this.botTimer && clearTimeout(this.botTimer);
        this.autoStartTimer && clearTimeout(this.autoStartTimer);
        this.clearLastMoveRevealTimer();
        this.clearNextDealTimer();
        this.clearTurnTimer();
        this.clearMatchRecordingRetryTimer();
        if (this.pendingDisconnectTimers instanceof Map) {
            for (const timer of this.pendingDisconnectTimers.values()) {
                clearTimeout(timer);
            }
        }
        this.pendingDisconnectTimers?.clear?.();
        this.pendingDisconnects?.clear?.();
        this.botTimer = null;
        this.aiPlayers?.clear?.();
        this.identityBySessionId?.clear?.();
    }

    ensureBotPlayers() {
        if (!this.aiCount) return;
        const occupiedSeats = new Set();
        for (const player of this.state.players.values()) {
            if (!player || player.isBot) continue;
            const seatIndex = Number(player.seatIndex);
            if (Number.isInteger(seatIndex) && seatIndex >= 0) {
                occupiedSeats.add(seatIndex);
            }
        }
        const freeSeats = [];
        for (let i = 0; i < this.totalPlayers; i++) {
            if (!occupiedSeats.has(i)) freeSeats.push(i);
        }
        debugLog("[ROOM_DEBUG] bots:ensure", {
            roomId: this.roomId,
            roomCode: this.roomCode,
            aiCount: this.aiCount,
            existingBotIds: Array.from(this.botIds || []),
            occupiedSeats: Array.from(occupiedSeats.values()),
            freeSeats
        });
        const nextBotIds = [];
        for (let i = 0; i < this.aiCount; i++) {
            const botId = `bot-${i}`;
            const botSeatIndex = freeSeats[i] ?? i;
            this.aiPlayers.set(botId, new AIPlayer(botSeatIndex, this.aiDifficulty));
            const existingBot = this.state.players.get(botId);
            if (existingBot) {
                existingBot.name = existingBot.name || `AI ${i + 1}`;
                existingBot.isBot = true;
                existingBot.isConnected = true;
                existingBot.seatIndex = botSeatIndex;
                nextBotIds.push(botId);
                continue;
            }

            const bot = {
                name: `AI ${i + 1}`,
                userId: "",
                score: 0,
                roundWins: 0,
                handCount: 0,
                isConnected: true,
                isBot: true,
                avatarUrl: "",
                seatIndex: botSeatIndex
            };
            this.state.players.set(botId, bot);
            nextBotIds.push(botId);
            debugLog("[ROOM_DEBUG] bots:added", {
                botId,
                seatIndex: botSeatIndex
            });
        }
        this.botIds = nextBotIds;
        this.rebuildPlayerOrderBySeats();
        this.state.playerCount = this.totalPlayers;
        debugLog("[ROOM_DEBUG] bots:final", {
            playerOrder: Array.from(this.state.playerOrder || []),
            botIds: Array.from(this.botIds || []),
            players: debugPlayerSummary(this)
        });
    }

    async onLeave(client, consented) {
        if (this.voiceEnabledBySessionId) {
            this.voiceEnabledBySessionId.delete(client.sessionId);
        }
        void this.relayVoiceSignal(client, {
            kind: "state",
            enabled: false,
            speaking: false,
            ts: Date.now()
        });

        const roomId = getSafeRoomId(this);
        const roomCode = String(this.roomCode || "").trim();
        debugLog("[ROOM_DEBUG] leave:start", {
            roomId,
            roomCode,
            sessionId: client.sessionId,
            consented,
            playerOrder: Array.from(this.state.playerOrder || []),
            players: debugPlayerSummary(this)
        });
        const player = this.state.players.get(client.sessionId);
        const leavingIndex = this.state.playerOrder.indexOf(client.sessionId);
        const isTeamMode = isRoomTeamMode(this);
        const hadExplicitMarker = Boolean(this.explicitLeaveSessionIds?.has(client.sessionId));
        const isOpenRoom = this.roomVisibility === "open";
        const isWaitingRoom = !this.state.gameActive && !this.matchFinished;
        const leftPlayerName = player ? player.name : "Player";
        this.lastLeaveConsentedValue = Boolean(consented);
        this.lastLeaveHadExplicitMarker = hadExplicitMarker;
        this.lastLeaveTreatedAsExplicit = hadExplicitMarker;
        if (player) player.isConnected = false;
        const identity = this.identityBySessionId.get(client.sessionId);
        if (identity) {
            upsertLivePlayer(client.sessionId, {
                sessionId: client.sessionId,
                roomId,
                roomCode,
                roomVisibility: this.roomVisibility,
                gameMode: this.gameMode,
                roomMode: isTeamMode ? "team" : "ffa",
                stakeKey: this.currentStakeKey,
                stakeAmount: this.currentDealStakeAmount || 0,
                humanSeats: this.humanSeats,
                totalPlayers: this.totalPlayers,
                aiCount: this.aiCount,
                isTeamMode,
                provider: identity.provider || "platform",
                userId: identity.userId || "",
                playerId: identity.playerId || identity.userId || "",
                avatarUrl: identity.avatarUrl || "",
                displayName: identity.displayName || player?.name || "Player",
                hostName: this.state.players.get(this.state.playerOrder[0])?.name || player?.name || "Player",
                role: identity.role || (this.state.playerOrder[0] === client.sessionId ? "host" : "player"),
                isConnected: false,
                isPlaying: Boolean(this.state.gameActive)
            });
        }

        if (isOpenRoom && isWaitingRoom && this.countConnectedHumanPlayers() <= 0) {
            debugLog("[ROOM_DEBUG] leave:close_empty_waiting_open_room", {
                roomId,
                roomCode,
                sessionId: client.sessionId,
                hadExplicitMarker,
                reason: "empty_open_room"
            });
            try {
                await this.closeWaitingOpenRoom("empty_open_room");
            } finally {
                this.explicitLeaveSessionIds?.delete(client.sessionId);
            }
            return;
        }

        try {
            debugLog("[ROOM_DEBUG] leave:explicit", {
                roomId,
                roomCode,
                sessionId: client.sessionId,
                playerName: leftPlayerName
            });
            if (!hadExplicitMarker) {
                this.startReconnectGrace(client, {
                    player,
                    identity,
                    playerName: leftPlayerName,
                    leavingIndex,
                    isTeamMode,
                    reason: "accidental_disconnect"
                });
                return;
            }

            throw new Error("explicit leave");
        } catch (e) {
            debugLog("[ROOM_DEBUG] leave:removed", {
                roomId,
                roomCode,
                sessionId: client.sessionId,
                reason: e?.message || "leave_error",
                explicitLeave: hadExplicitMarker
            });
            if (this.state.gameActive) {
                if (hadExplicitMarker) {
                    this.lastDisconnectGraceStartedAt = 0;
                    this.lastDisconnectGraceMs = 0;
                    this.lastReconnectGraceExpiredAt = 0;
                    this.lastForfeitReason = "explicit_leave";
                    this.lastGameEndReason = "disconnect";
                    this.lastGameEndWasExplicitLeave = true;
                    this.lastGameEndWasGraceExpired = false;
                } else {
                    this.lastReconnectGraceExpiredAt = Date.now();
                    this.lastForfeitReason = e?.message || "reconnect_failed";
                    this.lastGameEndReason = "disconnect";
                    this.lastGameEndWasExplicitLeave = false;
                    this.lastGameEndWasGraceExpired = true;
                }
                const settlement = await this.settleForfeitStake(client.sessionId).catch((err) => {
                    console.error("[ROOM] Failed to settle forfeit stake during cleanup:", err);
                    return null;
                });
                if (!settlement) {
                    console.warn("[ROOM] Forfeit settlement did not complete; notifying the player that support may be needed.");
                    this.broadcast("msg", {
                        key: "forfeit-settlement-failed",
                        time: 3500
                    });
                }
                await this.recordForfeitMatchResult(client.sessionId);
                this.state.gameActive = false;
                this.state.matchOver = true;
                this.state.gameOverReason = "disconnect";
                this.state.gameOverPlayerName = leftPlayerName;
                this.state.gameOverWinnerIndex = isTeamMode && leavingIndex !== -1 ? (leavingIndex % 2 === 0 ? 1 : 0) : -1;
                this.state.gameOverSummaryJson = settlement ? JSON.stringify(settlement) : "";
                this.clearTurnTimer();
                this.clearNextDealTimer();
                this.broadcastRoomState();
                this.broadcast("msg", {
                    key: "game-over-disconnect",
                    values: { player: leftPlayerName },
                    time: 2500
                });
                this.syncState();
                return;
            }

            this.state.players.delete(client.sessionId);
            this.identityBySessionId.delete(client.sessionId);
            removeLivePlayer(client.sessionId);
            const idx = this.state.playerOrder.indexOf(client.sessionId);
            if (idx !== -1) this.state.playerOrder.splice(idx, 1);
            this.rebuildPlayerOrderBySeats();
            this.broadcast("msg", { key: "msg-player-left-room", values: { player: leftPlayerName }, time: 1500 });
            this.broadcastRoomState();
        }
        finally {
            this.explicitLeaveSessionIds?.delete(client.sessionId);
        }
    }

    async startGame({ allowAlreadyStarting = false } = {}) {
        if (this.autoStartTimer) {
            clearTimeout(this.autoStartTimer);
            this.autoStartTimer = null;
        }
        debugLog("[ROOM_DEBUG] startGame:enter", {
            roomId: this.roomId,
            roomCode: this.roomCode,
            gameActive: this.state.gameActive,
            gameStarting: this.gameStarting,
            matchFinished: this.matchFinished,
            playerOrder: Array.from(this.state.playerOrder || []),
            players: debugPlayerSummary(this)
        });
        if (this.state.gameActive || (!allowAlreadyStarting && this.gameStarting) || this.matchFinished) {
            debugLog("[ROOM_DEBUG] startGame:blocked", {
                roomId: this.roomId,
                roomCode: this.roomCode,
                reason: this.state.gameActive ? "already_game_active" : this.gameStarting ? "game_starting" : "match_finished"
            });
            return;
        }
        this.gameStarting = true;
        if ((this.pendingMatchRecording && !this.matchRecorded) || this.matchRecordInFlight) {
            debugLog("[ROOM_DEBUG] startGame:pending_match_recording", {
                roomId: this.roomId,
                roomCode: this.roomCode,
                reason: "pending_match_recording"
            });
            console.warn("[ROOM] Previous match recording is still pending; continuing with the new game start.");
        }
        const autoStartState = this.getAutoStartState();
        if (!autoStartState.canStart) {
            this.gameStarting = false;
            debugLog("[ROOM_DEBUG] startGame:blocked", {
                roomId: this.roomId,
                roomCode: this.roomCode,
                reason: autoStartState.blockedReason || "not_enough_ready_humans",
                roomMode: autoStartState.roomMode,
                isTeamMode: autoStartState.isTeamMode,
                readyPlayersCount: autoStartState.readyPlayersCount,
                botsReadyCount: autoStartState.botsReadyCount,
                humanCount: autoStartState.humanCount,
                botCount: autoStartState.botCount,
                occupiedSeats: autoStartState.occupiedSeats,
                humanSeats: this.humanSeats,
                players: debugPlayerSummary(this)
            });
                if (autoStartState.isTeamMode) {
                    this.broadcast("msg", {
                        key: "seat-selection-required",
                        time: 2200
                    });
                }
                this.broadcastRoomState();
                return;
            }
        try {
            this.state.matchRound = 1;
            this.state.deal = 1;
            this.state.matchOver = false;
            this.state.gameOverReason = "";
            this.state.gameOverPlayerName = "";
            this.state.gameOverWinnerIndex = -1;
            this.state.gameOverSummaryJson = "";
            this.matchRecorded = false;
            this.matchFinished = false;
            this.pendingAdvanceKind = null;
            this.forfeitSettlementMade = false;
            this.clearTimeoutForfeitState();
            this.pendingEconomySettlement = Promise.resolve();
            this.botTakeover?.resetForNewMatch?.();
            this.matchRecordId = `${this.roomId}:match:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 10)}`;
            this.matchRecordInFlight = false;
            this.currentDealMatchId = "";
            this.currentDealStakeKey = this.currentStakeKey;
            this.currentDealStakeAmount = 0;
            this.currentDealBankAmount = 0;
            this.lastReservedMatchRound = 0;
            this.matchState = this.createMatchStateForCurrentMode(this.totalPlayers, this.state.isTeamMode);
            this.syncMatchStateToSchema();
            for (const sessionId of this.state.playerOrder || []) {
                const player = this.state.players.get(sessionId);
                if (!player) continue;
                player.controller = "human";
                player.takeoverActive = false;
                player.takeoverReason = "";
                player.takeoverSince = 0;
            }
            this.rebuildPlayerOrderBySeats();
            debugLog("[ROOM_DEBUG] startGame:beforeBots", {
                roomId: this.roomId,
                roomCode: this.roomCode,
                playerOrder: Array.from(this.state.playerOrder || []),
                players: debugPlayerSummary(this)
            });
            this.ensureBotPlayers();
            debugLog("[ROOM_DEBUG] startGame:afterBots", {
                roomId: this.roomId,
                roomCode: this.roomCode,
                playerOrder: Array.from(this.state.playerOrder || []),
                players: debugPlayerSummary(this)
            });
            this.broadcastRoomState();
            await this.startDeal();
        } finally {
            this.gameStarting = false;
        }
    }

    handleChooseSeat(client, message = {}) {
        if (this.state.gameActive || this.matchFinished) return;
        if (this.hasRestoredMatchInProgress()) return;
        const seatIndex = Number(message?.seatIndex);
        if (!Number.isInteger(seatIndex) || seatIndex < 0 || seatIndex >= this.totalPlayers) return;
        const player = this.state.players.get(client.sessionId);
        if (!player || player.isBot) return;

        const currentSeatIndex = this.getPlayerSeatIndex(client.sessionId);
        if (currentSeatIndex === seatIndex) {
            this.broadcastRoomState();
            return;
        }

        if (!this.isSeatAvailable(seatIndex, client.sessionId)) {
            client.send("msg", {
                key: "seat-taken",
                values: { seat: seatIndex + 1 },
                time: 2000
            });
            return;
        }

        player.seatIndex = seatIndex;
        this.rebuildPlayerOrderBySeats();
        this.syncState();
        this.broadcast("msg", {
            key: "seat-selected",
            values: { seat: seatIndex + 1, player: player.name },
            time: 1600
        });
        this.broadcastRoomState();
        this.maybeAutoStartGame();
    }

    async startDeal() {
        debugLog("[ROOM_DEBUG] startDeal:enter", {
            roomId: this.roomId,
            roomCode: this.roomCode,
            stakeKey: this.currentStakeKey,
            currentDealMatchId: this.currentDealMatchId,
            matchRound: this.state.matchRound,
            playerOrder: Array.from(this.state.playerOrder || []),
            players: debugPlayerSummary(this)
        });
        if (this.botTimer) {
            clearTimeout(this.botTimer);
            this.botTimer = null;
        }
        this.clearLastMoveRevealTimer();
        this.clearNextDealTimer();
        this.clearTurnTimer();
        this.clearTimeoutForfeitState();
        this.timeoutContinueInFlight = false;
        await this.pendingEconomySettlement.catch(() => {});
        this.matchRecorded = false;
        this.pendingAdvanceKind = null;
        this.state.matchOver = false;
        this.state.gameOverReason = "";
        this.state.gameOverPlayerName = "";
        this.state.gameOverWinnerIndex = -1;
        this.state.gameOverSummaryJson = "";
        this.lastFinishInfo = null;
        this.internalBoard = new Board();
        this.internalBoard.startAxis = this.boardStartAxis || 'horizontal';
        this.configureBoardForCurrentMode(this.internalBoard);
        this.state.gameActive = false;
        this.currentDealMatchId = `${this.roomId}:round:${this.state.matchRound}`;
        this.currentDealStakeKey = this.currentStakeKey;
        const isNewRoundReservation = this.currentStakeKey !== "free" && this.lastReservedMatchRound !== this.state.matchRound;
        if (this.currentStakeKey === "free" || isNewRoundReservation) {
            this.currentDealStakeAmount = 0;
            this.currentDealBankAmount = 0;
        }
        this.state.turnVersion = 1;

        const hs = this.getActiveRuleset().getHandSize(this.totalPlayers);
        let attempts = 0;
        do {
            const all = shuffle(createFullSet());
            this.hands = [];
            let idx = 0;
            for (let p = 0; p < this.totalPlayers; p++) {
                this.hands.push(all.slice(idx, idx + hs));
                idx += hs;
            }
            this.boneyard = all.slice(idx);
            attempts += 1;
        } while (this.shouldRedealOpeningHands(this.hands) && attempts < 128);
        
        if (this.lastDealWinner !== null) {
            this.state.currentPlayerIndex = this.lastDealWinner;
        } else {
            const f = this.getActiveRuleset().determineFirstPlayer(this.hands);
            this.state.currentPlayerIndex = f.player;
        }

        if (this.currentStakeKey !== "free" && this.lastReservedMatchRound !== this.state.matchRound) {
            debugLog("[ROOM_DEBUG] reserve:before", {
                roomId: this.roomId,
                roomCode: this.roomCode,
                stakeKey: this.currentStakeKey,
                currentDealMatchId: this.currentDealMatchId,
                humans: Array.from(this.state.playerOrder || []).map((sessionId) => {
                    const player = this.state.players.get(sessionId) || {};
                    const identity = this.identityBySessionId.get(sessionId) || {};
                    return {
                        sessionId,
                        seatIndex: Number.isInteger(Number(player.seatIndex)) ? Number(player.seatIndex) : -1,
                        isBot: Boolean(player.isBot),
                        isConnected: Boolean(player.isConnected),
                        hasUserId: Boolean(String(player.userId || identity.userId || "").trim()),
                        hasPlayerId: Boolean(String(identity.playerId || player.userId || "").trim()),
                        hasAuthToken: Boolean(String(identity.authToken || "").trim())
                    };
                }).filter((item) => !item.isBot)
            });
            const reserveResult = await this.reserveEconomyStake();
            debugLog("[ROOM_DEBUG] reserve:result", {
                roomId: this.roomId,
                roomCode: this.roomCode,
                ok: Boolean(reserveResult?.ok),
                reason: reserveResult?.reason || "",
                status: reserveResult?.status || "",
                messageKey: reserveResult?.messageKey || ""
            });
            if (!reserveResult?.ok) {
                const reason = String(reserveResult?.reason || "stake_unavailable").trim().toLowerCase();
                const isLowBalance = reason === "insufficient_coins" || reason.includes("insufficient coins") || reason.includes("insufficient balance");
                const message = isLowBalance
                    ? "room-closed-insufficient-coins"
                    : reason === "auth_required"
                        ? "room-closed-auth-required"
                        : "room-closed-stake-unavailable";
                debugLog("[ROOM_DEBUG] startDeal:reserve_failed", {
                    roomId: this.roomId,
                    roomCode: this.roomCode,
                    roomVisibility: this.roomVisibility,
                    reason,
                    message,
                    willSendRoomClosed: this.roomVisibility !== "open"
                });
                this.state.gameActive = false;
                this.broadcast("msg", { key: message, time: 2500 });
                if (this.roomVisibility !== "open") {
                    this.broadcast("room_closed", { reasonKey: message });
                }
                this.broadcastRoomState();
                return;
            }
            this.lastReservedMatchRound = this.state.matchRound;
        }
        this.state.gameActive = true;
        this.syncState();
        this.scheduleTurnTimer();

        // Broadcast visual stages to all clients
        try {
            const firstIndex = this.state.currentPlayerIndex;
            const actor = this.state.players.get(this.state.playerOrder[firstIndex]);
            const actorName = actor ? actor.name : "Player";
            
            if (this.lastDealWinner !== null) {
                this.broadcast("round_stage", {
                    phase: "opening-turn",
                    titleKey: "stage-last-winner-starts",
                    values: { player: actorName },
                    actorIndex: firstIndex,
                    blocksInput: false
                });
            } else {
                const f = this.getActiveRuleset().determineFirstPlayer(this.hands);
                
                this.broadcast("round_stage", {
                    phase: "search-opening",
                    blocksInput: true
                });
                
                setTimeout(() => {
                    this.broadcast("round_stage", {
                        phase: "opening-turn",
                        actorIndex: f.player,
                        actorName: actorName,
                        blocksInput: true
                    });
                    
                    setTimeout(() => {
                        this.broadcast("round_stage", {
                            phase: "deal-start",
                            blocksInput: false
                        });
                    }, 1500);
                }, 1200);
            }
        } catch (e) {
            console.error("[DominoRoom] Error broadcasting opening stage:", e);
        }
    }

    async startRound() {
        if (this.botTimer) {
            clearTimeout(this.botTimer);
            this.botTimer = null;
        }
        this.clearLastMoveRevealTimer();
        this.clearNextDealTimer();
        this.clearTurnTimer();
        this.clearTimeoutForfeitState();
        this.pendingAdvanceKind = null;
        this.state.gameActive = false;

        for (const sessionId of this.state.playerOrder) {
            const player = this.state.players.get(sessionId);
            if (!player) continue;
            player.score = 0;
        }
        this.replaceSchemaArray(this.state.teamScores, [0, 0]);
        this.state.deal = 1;

        await this.startDeal();
    }

    clearTurnTimer() {
        if (this.turnTimer) {
            clearTimeout(this.turnTimer);
            this.turnTimer = null;
        }
        this.clearTurnAdvanceTimer();
        this.turnDeadlineAt = 0;
        if (this.state) this.state.turnDeadlineAt = 0;
    }

    bumpTurnVersion() {
        const nextVersion = Number(this.state?.turnVersion || 0) + 1;
        this.state.turnVersion = nextVersion;
        return nextVersion;
    }

    clearTurnAdvanceTimer() {
        if (this.turnAdvanceTimer) {
            clearTimeout(this.turnAdvanceTimer);
            this.turnAdvanceTimer = null;
        }
        this.turnAdvancePending = false;
    }

    clearLastMoveRevealTimer() {
        if (this.lastMoveRevealTimer) {
            clearTimeout(this.lastMoveRevealTimer);
            this.lastMoveRevealTimer = null;
        }
        this.lastMoveRevealPending = false;
    }

    clearNextDealTimer() {
        if (this.nextDealTimer) {
            clearTimeout(this.nextDealTimer);
            this.nextDealTimer = null;
        }
    }

    scheduleNextDeal(delay = 900) {
        this.clearNextDealTimer();
        this.pendingAdvanceKind = "deal";
        if (delay <= 0) {
            void this.startDeal();
            return;
        }
        this.nextDealTimer = setTimeout(() => {
            this.nextDealTimer = null;
            if (this.matchFinished || this.state.gameActive) return;
            void this.startDeal();
        }, delay);
    }

    scheduleNextRound(delay = 900) {
        this.clearNextDealTimer();
        this.pendingAdvanceKind = "round";
        if (delay <= 0) {
            void this.startRound();
            return;
        }
        this.nextDealTimer = setTimeout(() => {
            this.nextDealTimer = null;
            if (this.matchFinished || this.state.gameActive) return;
            void this.startRound();
        }, delay);
    }

    clearTimeoutForfeitState() {
        if (this.timeoutContinueTimer) {
            clearTimeout(this.timeoutContinueTimer);
            this.timeoutContinueTimer = null;
        }
        this.timeoutForfeitPending = null;
        this.timeoutContinueInFlight = false;
    }

    scheduleLastMoveSettlement(callback, delay = LAST_MOVE_REVEAL_DELAY_MS) {
        const adjustedDelay = Number(delay || 0) || 0;
        this.clearLastMoveRevealTimer();
        this.lastMoveRevealPending = true;
        this.clearTurnTimer();
        this.clearTurnAdvanceTimer();
        this.lastMoveRevealTimer = setTimeout(() => {
            this.lastMoveRevealTimer = null;
            this.lastMoveRevealPending = false;
            callback?.();
        }, Math.max(0, adjustedDelay));
    }

    scheduleTurnAdvance(delay = this.turnAdvanceMs) {
        this.clearTurnAdvanceTimer();
        if (delay <= 0) {
            this.turnAdvancePending = false;
            this.advanceTurn();
            return;
        }
        this.turnAdvancePending = true;
        this.turnAdvanceTimer = setTimeout(() => {
            this.turnAdvanceTimer = null;
            this.turnAdvancePending = false;
            this.advanceTurn();
        }, delay);
    }

    shouldOpenGoshaChainWindow(pi) {
        if (pi < 0 || pi >= this.hands.length) return false;
        const hand = this.hands[pi];
        if (!Array.isArray(hand) || hand.length === 0) return false;
        const nextCombo = this.internalBoard.getGoshaCombo(hand);
        return Boolean(nextCombo);
    }

    scheduleTurnTimer() {
        if (!this.state.gameActive) {
            this.clearTurnTimer();
            return;
        }
        const reconnectHold = this.getCurrentPlayerReconnectHold();
        if (reconnectHold) {
            this.pauseTurnTimerForReconnect({
                sessionId: reconnectHold.sessionId,
                playerName: reconnectHold.player?.name || reconnectHold.pending?.playerName || "Player",
                expiresAt: reconnectHold.pending?.expiresAt || 0,
                source: "scheduleTurnTimer"
            });
            return;
        }
        if (this.turnTimer) clearTimeout(this.turnTimer);
        this.state.turnDurationMs = this.turnTimeoutMs;
        this.state.serverNow = Date.now();
        this.turnDeadlineAt = Date.now() + this.turnTimeoutMs;
        this.state.turnDeadlineAt = this.turnDeadlineAt;
        if (this.pendingActionContext) {
            const pending = this.pendingActionContext;
            this.pendingActionContext = null;
            if (pending.client) {
                this.sendActionAck(pending.client, {
                    accepted: true,
                    action: pending.action,
                    actionId: pending.actionId
                });
            }
        }
        this.syncState();
        this.turnTimer = setTimeout(() => {
            this.turnTimer = null;
            this.handleTurnTimeout();
        }, this.turnTimeoutMs);
        const currentPlayer = this.getPlayerForTurnIndex(this.state.currentPlayerIndex);
        if (this.isSeatUnderBotTakeover(currentPlayer)) {
            this.scheduleBotTurn(BOT_THINK_DELAY_MS);
        }
    }

    findTimeoutWinner(timeoutIndex) {
        const isTeamMode = this.roomMode === "team";
        if (isTeamMode) {
            const losingTeam = timeoutIndex % 2;
            const winningTeam = losingTeam === 0 ? 1 : 0;
            const members = this.getTeamMembers(winningTeam);
            let minPoints = Infinity;
            let bestIndex = members[0] ?? 0;
            for (const pIdx of members) {
                const points = this.getActiveRuleset().handPoints(this.hands[pIdx] || []);
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
            const points = this.getActiveRuleset().handPoints(this.hands[i] || []);
            if (points < minPoints) {
                minPoints = points;
                bestIndex = i;
            }
        }
        return bestIndex === -1 ? 0 : bestIndex;
    }

    handleTurnTimeout() {
        if (!this.state.gameActive || this.matchFinished) return;
        if (this.isCurrentPlayerDisconnectedOrReconnecting()) return;
        const currentIndex = Number(this.state.currentPlayerIndex || 0);
        const currentSessionId = String(this.state.playerOrder?.[currentIndex] || "").trim();
        const actor = this.getPlayerForTurnIndex(currentIndex);
        if (this.isSeatUnderBotTakeover(actor)) {
            this.scheduleBotTurn(0);
            return;
        }
        const timeoutReason = this.getPendingDisconnectEntry(currentSessionId) ? TAKEOVER_REASON.DISCONNECT : TAKEOVER_REASON.IDLE;
        if (this.canUseBotTakeoverForSeat(actor, { sessionId: currentSessionId, reason: timeoutReason })) {
            const beganTakeover = this.botTakeover?.begin?.(actor, timeoutReason) === true;
            if (beganTakeover) {
                return;
            }
        }
        const winnerIndex = this.findTimeoutWinner(currentIndex);
        const actorName = actor ? actor.name : "Player";
        this.broadcast("msg", { key: "turn-timeout", values: { player: actorName }, time: 2000 });
        void this.endRoundByTimeoutForfeit({ loserIndex: currentIndex, winnerIndex });
    }

    async reserveEconomyStake() {
        return reserveEconomyStakeForRoom(this);
    }

    buildTimeoutForfeitPending({ loserSessionId, loserIndex, loserName, winnerIndex, economySummary, bankAmount, requiredStakeAmount } = {}) {
        const createdAt = Date.now();
        return {
            loserSessionId: String(loserSessionId || "").trim(),
            loserIndex: Number.isInteger(Number(loserIndex)) ? Number(loserIndex) : -1,
            loserName: String(loserName || "Player").trim() || "Player",
            winnerIndex: Number.isInteger(Number(winnerIndex)) ? Number(winnerIndex) : 0,
            createdAt,
            expiresAt: createdAt + TIMEOUT_CONTINUE_MS,
            stakeKey: this.currentDealStakeKey || this.currentStakeKey,
            requiredStakeAmount: Math.max(0, Number(requiredStakeAmount || this.currentDealStakeAmount || 0)),
            bankAmount: Math.max(0, Number(bankAmount || this.currentDealBankAmount || 0)),
            settled: true,
            economy: economySummary || null
        };
    }

    clearTimeoutForfeitTimer() {
        if (this.timeoutContinueTimer) {
            clearTimeout(this.timeoutContinueTimer);
            this.timeoutContinueTimer = null;
        }
    }

    async closeTimeoutForfeitRoom() {
        this.clearTimeoutForfeitTimer();
        this.clearTimeoutForfeitState();
        this.state.gameActive = false;
        this.state.matchOver = true;
        this.state.gameOverReason = "timeout-forfeit-room-closed";
        this.gameStarting = false;
        this.matchFinished = true;
        this.clearTurnTimer();
        this.clearNextDealTimer();
        if (this.autoStartTimer) {
            clearTimeout(this.autoStartTimer);
            this.autoStartTimer = null;
        }
        this.broadcast("room_closed", {
            reasonKey: "timeout-forfeit-room-closed"
        });
        if (this.roomCode) {
            await forgetRoom(this.roomCode, this.roomId);
        }
        removeRoomPlayers(this.roomId);
        const closeClients = () => {
            for (const activeClient of (this.clients || []).slice()) {
                try {
                    activeClient.leave(4000);
                } catch {}
            }
            try {
                this.disconnect?.();
            } catch {}
        };
        if (this.clock?.setTimeout) {
            this.clock.setTimeout(closeClients, 150);
            return;
        }
        setTimeout(closeClients, 150);
    }

    async endRoundByTimeoutForfeit({ loserIndex, winnerIndex } = {}) {
        if (!this.state.gameActive || this.matchFinished) return false;
        const actualLoserIndex = Number.isInteger(Number(loserIndex)) ? Number(loserIndex) : Number(this.state.currentPlayerIndex || 0);
        const actualWinnerIndex = Number.isInteger(Number(winnerIndex)) ? Number(winnerIndex) : this.findTimeoutWinner(actualLoserIndex);
        const loserSessionId = String(this.state.playerOrder?.[actualLoserIndex] || "").trim();
        const loserPlayer = loserSessionId ? this.state.players.get(loserSessionId) : null;
        const loserName = loserPlayer ? loserPlayer.name : "Player";
        const requiredStakeAmount = Math.max(0, Number(this.currentDealStakeAmount || 0));

        this.clearTurnTimer();
        this.clearTurnAdvanceTimer();
        this.state.gameActive = false;
        this.pendingAdvanceKind = "timeout_continue";
        this.lastGameEndReason = "timeout_forfeit";
        this.lastForfeitReason = "turn_timeout";
        const pendingBankAmount = Math.max(0, Number(this.currentDealBankAmount || 0));

        const economySummary = this.currentStakeKey !== "free"
            ? await this.settleForfeitStake(loserSessionId)
            : null;
        this.currentDealBankAmount = 0;
        this.currentDealStakeAmount = 0;
        this.timeoutForfeitPending = this.buildTimeoutForfeitPending({
            loserSessionId,
            loserIndex: actualLoserIndex,
            loserName,
            winnerIndex: actualWinnerIndex,
            economySummary,
            bankAmount: pendingBankAmount,
            requiredStakeAmount
        });

        let wins = 1;
        const isTeamMode = isRoomTeamMode(this);
        const winnerTeamIndex = isTeamMode ? (actualWinnerIndex % 2) : null;

        if (isTeamMode) {
            const wt = winnerTeamIndex;
            const loserTeamScore = this.state.teamScores[1 - wt];
            if (loserTeamScore < this.dlossThreshold) wins = 2;
            this.state.teamRoundWins[wt] += wins;
        } else {
            for (let i = 0; i < this.totalPlayers; i++) {
                if (i === actualWinnerIndex) continue;
                const sid = this.state.playerOrder[i];
                const pScore = this.state.players.get(sid) ? this.state.players.get(sid).score : 0;
                if (pScore < this.dlossThreshold) { wins = 2; break; }
            }
            const winnerSid = this.state.playerOrder[actualWinnerIndex];
            if (this.state.players.get(winnerSid)) this.state.players.get(winnerSid).roundWins += wins;
        }

        const finalScoreReached = isTeamMode
            ? (this.state.teamScores[0] >= this.getActiveRuleset().matchTarget || this.state.teamScores[1] >= this.getActiveRuleset().matchTarget)
            : (this.state.players.get(this.state.playerOrder[actualWinnerIndex])?.score || 0) >= this.getActiveRuleset().matchTarget;
        const isMatchOver = finalScoreReached;

        const playerData = [];
        for (let i = 0; i < this.state.playerOrder.length; i++) {
            const sid = this.state.playerOrder[i];
            const player = this.state.players.get(sid);
            playerData.push({
                name: player ? player.name : "Player",
                score: player ? player.score : 0,
                roundWins: player ? player.roundWins : 0,
                isWinner: isTeamMode ? (i % 2 === winnerTeamIndex) : i === actualWinnerIndex
            });
        }

        this.broadcast("round_end", {
            winnerIndex: actualWinnerIndex,
            wins,
            isInstantWin: false,
            isMatchOver,
            matchRound: this.state.matchRound,
            isTeamMode,
            teamScores: Array.from(this.state.teamScores),
            teamRoundWins: Array.from(this.state.teamRoundWins),
            players: playerData,
            economy: economySummary,
            finishKind: "timeout_forfeit",
            forfeitReason: "turn_timeout",
            timeoutLoserIndex: actualLoserIndex,
            timeoutLoserSessionId: loserSessionId,
            timeoutLoserName: loserName,
            stakeKey: this.currentDealStakeKey || this.currentStakeKey,
            requiredStakeAmount,
            finishInfo: this.lastFinishInfo || null,
            canContinueSessionId: loserSessionId,
            continueExpiresAt: this.timeoutForfeitPending.expiresAt
        });

        this.state.matchRound++;
        if (isMatchOver) {
            this.matchFinished = true;
            this.timeoutForfeitPending = null;
            this.recordMatchResult(actualWinnerIndex, false, playerData, wins);
            return true;
        }

        this.timeoutContinueTimer = setTimeout(() => {
            this.timeoutContinueTimer = null;
            void this.closeTimeoutForfeitRoom();
        }, TIMEOUT_CONTINUE_MS);
        if (this.timeoutContinueTimer && typeof this.timeoutContinueTimer.unref === "function") {
            this.timeoutContinueTimer.unref();
        }
        this.broadcastRoomState();
        return true;
    }

    sendTimeoutContinueResult(client, payload = {}) {
        if (!client || typeof client.send !== "function") return;
        client.send("timeout_continue_result", {
            ok: Boolean(payload.ok),
            reason: String(payload.reason || "").trim(),
            continueExpiresAt: Number(payload.continueExpiresAt || 0),
            roomPhase: String(payload.roomPhase || "").trim()
        });
    }

    async handleTimeoutContinue(client) {
        const pending = this.timeoutForfeitPending;
        if (!pending) return false;
        if (String(client?.sessionId || "").trim() !== pending.loserSessionId) {
            this.sendTimeoutContinueResult(client, { ok: false, reason: "forbidden", continueExpiresAt: pending.expiresAt, roomPhase: "timeout_result" });
            return false;
        }
        if (this.timeoutContinueInFlight) {
            this.sendTimeoutContinueResult(client, {
                ok: false,
                reason: "continue_in_progress",
                continueExpiresAt: pending.expiresAt,
                roomPhase: "timeout_result"
            });
            return false;
        }
        if (Date.now() > pending.expiresAt) {
            this.sendTimeoutContinueResult(client, { ok: false, reason: "expired", continueExpiresAt: pending.expiresAt, roomPhase: "timeout_result" });
            void this.closeTimeoutForfeitRoom();
            return false;
        }

        this.timeoutContinueInFlight = true;
        const originalMatchRound = Number(this.state.matchRound || 1);
        this.currentDealMatchId = `${this.roomId}:round:${originalMatchRound}`;
        try {
            const reserveResult = await this.reserveEconomyStake();
            if (!reserveResult?.ok) {
                const reason = String(reserveResult?.reason || "").toLowerCase();
                const isLowBalance = reason.includes("insufficient") || reason.includes("balance");
                this.sendTimeoutContinueResult(client, {
                    ok: false,
                    reason: isLowBalance ? "insufficient_balance" : "stake_unavailable",
                    continueExpiresAt: pending.expiresAt,
                    roomPhase: "timeout_result"
                });
                return false;
            }

            this.lastReservedMatchRound = originalMatchRound;
            this.clearTimeoutForfeitTimer();
            this.clearTimeoutForfeitState();
            await this.startRound();
            this.sendTimeoutContinueResult(client, { ok: true, continueExpiresAt: pending.expiresAt, roomPhase: "timeout_result" });
            return true;
        } catch (error) {
            console.warn("[ROOM] Timeout continue failed:", error);
            this.sendTimeoutContinueResult(client, {
                ok: false,
                reason: "continue_failed",
                continueExpiresAt: pending.expiresAt,
                roomPhase: "timeout_result"
            });
            return false;
        } finally {
            if (!this.timeoutForfeitPending) {
                this.timeoutContinueInFlight = false;
            } else {
                this.timeoutContinueInFlight = false;
            }
        }
    }

    scheduleBotTurn(delay = BOT_THINK_DELAY_MS) {
        if (this.botTimer) clearTimeout(this.botTimer);
        if (!this.state.gameActive) return;
        const cpSession = this.state.playerOrder[this.state.currentPlayerIndex];
        const currentPlayer = this.getPlayerForTurnIndex(this.state.currentPlayerIndex);
        if (!cpSession || !this.isSeatDrivenByBot(currentPlayer)) return;
        this.botTimer = setTimeout(() => this.runBotTurn(), delay);
    }

    runBotTurn() {
        if (!this.state.gameActive) return;
        this.configureBoardForCurrentMode(this.internalBoard);
        const pi = this.state.currentPlayerIndex;
        const sessionId = this.state.playerOrder[pi];
        const currentPlayer = this.getPlayerForTurnIndex(pi);
        if (!sessionId || !this.isSeatDrivenByBot(currentPlayer)) return;

        const isTakeoverSeat = this.isSeatUnderBotTakeover(currentPlayer);
        const aiKey = isTakeoverSeat ? `takeover:${sessionId}` : sessionId;
        const aiDifficulty = isTakeoverSeat ? (BOT_TAKEOVER_CONFIG.botDifficulty || this.aiDifficulty) : this.aiDifficulty;
        // TODO: team-mode takeover currently reuses the solo AI heuristics for v1.
        const bot = this.aiPlayers.get(aiKey) || new AIPlayer(pi, aiDifficulty);
        this.aiPlayers.set(aiKey, bot);
        const hand = this.hands[pi];
        if (!hand) return;
        const teamContext = isTakeoverSeat && this.state.isTeamMode
            ? {
                isTeamMode: true,
                partnerIndex: this.getTeamPartnerIndex(pi)
            }
            : null;

        const combo = this.gameMode === "classic101" ? null : this.internalBoard.getGoshaCombo(hand);
        if (combo) {
            this.performGosha(pi, combo, true);
            return;
        }

        const moves = this.getValidMovesForPlayer(pi);
        const move = bot.chooseMove(this.internalBoard, hand, moves, this.state.players, this.hands, this.boneyard, this.playerMissingSuits, teamContext);
        if (move) {
            this.performPlay(pi, move.tileIndex, move.openEndIndex, true);
            return;
        }

        if (this.boneyard.length > 0) {
            this.performDraw(pi, true);
            this.scheduleBotTurn(BOT_THINK_DELAY_MS);
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

    getTeamPartnerIndex(playerIndex) {
        if (!isRoomTeamMode(this)) return -1;
        const index = Number(playerIndex);
        if (!Number.isInteger(index) || index < 0) return -1;
        const partner = this.getTeamMembers(index % 2).find((memberIndex) => memberIndex !== index);
        return Number.isInteger(Number(partner)) ? Number(partner) : -1;
    }

    getTeamDisplayName(teamIndex) {
        const members = this.getTeamMembers(teamIndex);
        const names = members.map((idx) => {
            const sessionId = this.state.playerOrder[idx];
            return this.state.players.get(sessionId)?.name || `Player ${idx + 1}`;
        });
        return names.length ? names.join(" & ") : (teamIndex === 0 ? "Team A" : "Team B");
    }

    getTeamHandPoints(teamIndex) {
        return this.getTeamMembers(teamIndex).reduce((sum, idx) => sum + this.getActiveRuleset().handPoints(this.hands[idx] || []), 0);
    }
    getOpeningScoreContext(pi) {
        if (isRoomTeamMode(this)) {
            return Number(this.state.teamScores[pi % 2] || 0);
        }
        const sessionId = this.state.playerOrder[pi];
        return Number(this.state.players.get(sessionId)?.score || 0);
    }
    getOpeningMoveRequirement() {
        if (!this.state?.gameActive) return null;
        if (this.lastDealWinner !== null) return null;
        if (!this.internalBoard?.isEmpty) return null;
        if (!Array.isArray(this.hands) || !this.hands.length) return null;

        const opening = this.getActiveRuleset().determineFirstPlayer(this.hands);
        const playerIndex = Number(opening?.player);
        const tileIndex = Number(opening?.tileIndex);
        if (!Number.isInteger(playerIndex) || !Number.isInteger(tileIndex)) return null;

        const hand = this.hands[playerIndex];
        const tile = hand?.[tileIndex];
        if (!tile) return null;

        return {
            playerIndex,
            tileIndex,
            tileId: tile.id
        };
    }
    getValidMovesForPlayer(pi) {
        const hand = this.hands?.[pi] || [];
        if (!Array.isArray(hand)) return [];
        if (!this.internalBoard) return [];

        if (this.internalBoard.isEmpty) {
            const opening = this.getOpeningMoveRequirement();
            if (opening) {
                return opening.playerIndex === pi
                    ? [{ tileIndex: opening.tileIndex, openEndIndex: -1 }]
                    : [];
            }
        }

        return this.internalBoard.getValidMoves(hand);
    }
    shouldRedealOpeningHands(hands = []) {
        return (Array.isArray(hands) ? hands : []).some((hand) => this.getActiveRuleset().needsRedeal(hand));
    }

    updateSchemaState({ includeBoardJson = false } = {}) {
        this.state.turnDurationMs = this.turnTimeoutMs;
        this.state.serverNow = Date.now();
        this.syncPublicPlayerStatsToState();
        this.syncMatchStateToSchema();
        this.state.boneyardCount = this.boneyard.length;
        if (includeBoardJson) {
            this.state.boardJson = JSON.stringify(this.internalBoard);
        }
    }

    buildTurnInfoForPlayer(playerIndex) {
        if (!Number.isInteger(playerIndex) || playerIndex < 0) {
            return { validMoves: [], goshaCombo: null };
        }
        if (!this.hands[playerIndex]) {
            return { validMoves: [], goshaCombo: null };
        }
        const validMoves = this.getValidMovesForPlayer(playerIndex);
        const goshaCombo = this.gameMode === "classic101" ? null : this.internalBoard.getGoshaCombo(this.hands[playerIndex]);
        return { validMoves, goshaCombo };
    }

    sendTurnInfoToPlayerIndex(playerIndex) {
        const currentPlayerIndex = Number(this.state.currentPlayerIndex || 0);
        const targetIndex = Number.isInteger(playerIndex) ? playerIndex : currentPlayerIndex;
        const cpSession = this.state.playerOrder[targetIndex];
        const cpClient = this.clients.find(c => c.sessionId === cpSession);
        if (cpClient && this.hands[targetIndex]) {
            cpClient.send("turn_info", this.buildTurnInfoForPlayer(targetIndex));
        }
    }

    sendHandToClient(client, playerIndex = this.getPlayerIndex(client)) {
        if (!client) return;
        const pIdx = Number(playerIndex);
        if (!Number.isInteger(pIdx) || pIdx < 0 || !this.hands[pIdx]) return;
        client.send("hand", this.hands[pIdx]);
    }

    buildPlayerSyncRows() {
        return Array.from(this.state.playerOrder || []).map((sessionId, index) => {
            const player = this.state.players.get(sessionId) || {};
            return {
                sessionId,
                index,
                name: player.name || `Player ${index + 1}`,
                userId: player.userId || "",
                avatarUrl: player.avatarUrl || "",
                score: Number(player.score || 0),
                roundWins: Number(player.roundWins || 0),
                handCount: Number(player.handCount || 0),
                isConnected: Boolean(player.isConnected),
                isBot: Boolean(player.isBot),
                seatIndex: Number.isInteger(Number(player.seatIndex)) ? Number(player.seatIndex) : -1,
                controller: String(player.controller || "human"),
                takeoverActive: Boolean(player.takeoverActive),
                takeoverReason: String(player.takeoverReason || "")
            };
        });
    }

    buildPublicPlayerStats() {
        return Array.from(this.state.playerOrder || []).map((sessionId, index) => {
            const player = this.state.players.get(sessionId) || {};
            return {
                score: Number(player.score || 0),
                roundWins: Number(player.roundWins || 0),
                handCount: Number(player.handCount || 0)
            };
        });
    }

    syncPublicPlayerStatsToState() {
        const order = Array.isArray(this.state.playerOrder) ? this.state.playerOrder : [];
        for (let i = 0; i < order.length; i++) {
            const sessionId = order[i];
            const player = this.state.players.get(sessionId);
            if (!player) continue;
            player.score = Number(player.score || 0);
            player.roundWins = Number(player.roundWins || 0);
            player.handCount = Array.isArray(this.hands?.[i]) ? this.hands[i].length : Number(player.handCount || 0);
        }
    }

    buildFullStatePayloadForClient(client) {
        const playerIndex = this.getPlayerIndex(client);
        const turnInfo = playerIndex === Number(this.state.currentPlayerIndex || 0)
            ? this.buildTurnInfoForPlayer(playerIndex)
            : { validMoves: [], goshaCombo: null };
        return {
            roomId: getSafeRoomId(this),
            roomCode: String(this.roomCode || ""),
            roomVisibility: this.roomVisibility,
            gameMode: this.gameMode,
            matchState: this.matchState || null,
            playerOrder: Array.from(this.state.playerOrder || []),
            players: this.buildPlayerSyncRows(),
            currentPlayerIndex: Number(this.state.currentPlayerIndex || 0),
            boneyardCount: this.boneyard.length,
            gameActive: Boolean(this.state.gameActive),
            matchRound: Number(this.state.matchRound || 1),
            deal: Number(this.state.deal || 1),
            board: this.internalBoard.toJSON ? this.internalBoard.toJSON() : this.internalBoard,
            isTeamMode: isRoomTeamMode(this),
            playerCount: Number(this.state.playerCount || this.totalPlayers || 2),
            turnDeadlineAt: Number(this.state.turnDeadlineAt || 0),
            turnVersion: Number(this.state.turnVersion || 1),
            lastMoveRevealPending: Boolean(this.lastMoveRevealPending),
            finishInfo: this.lastFinishInfo || null,
            matchOver: Boolean(this.state.matchOver),
            gameOverReason: String(this.state.gameOverReason || ""),
            gameOverPlayerName: String(this.state.gameOverPlayerName || ""),
            gameOverWinnerIndex: Number(this.state.gameOverWinnerIndex ?? -1),
            gameOverSummaryJson: String(this.state.gameOverSummaryJson || ""),
            teamScores: Array.from(this.state.teamScores || [0, 0]),
            teamRoundWins: Array.from(this.state.teamRoundWins || [0, 0]),
            stakeKey: this.currentDealStakeKey || this.currentStakeKey,
            bankAmount: Number(this.currentDealBankAmount || 0),
            turnDurationMs: Number(this.state.turnDurationMs || this.turnTimeoutMs || TURN_TIMEOUT_MS),
            serverNow: Number(this.state.serverNow || Date.now()),
            selfHand: playerIndex >= 0 && this.hands[playerIndex] ? this.hands[playerIndex] : [],
            turnInfo
        };
    }

    sendFullState(client) {
        if (!client || typeof client.send !== "function") return;
        this.updateSchemaState({ includeBoardJson: true });
        client.send("full_state", this.buildFullStatePayloadForClient(client));
    }

    sendRoomStateToClient(client) {
        if (!client || typeof client.send !== "function") return;
        this.updateSchemaState({ includeBoardJson: false });
        const players = buildRoomStatePlayers({
            playerOrder: this.state.playerOrder,
            players: this.state.players,
            identityBySessionId: this.identityBySessionId,
            voiceEnabledBySessionId: this.voiceEnabledBySessionId
        });
        client.send("room_state", buildRoomStatePayload({
            room: this,
            players
        }));
    }

    handleSyncRequest(client) {
        this.sendRoomStateToClient(client);
        this.sendFullState(client);
        
        // In some unit tests, the room or its methods/state might be mocked or incomplete.
        // Also check if the client is actually in the game's player order before attempting player-specific messages.
        if (typeof this.getPlayerIndex === "function" && this.state && this.state.playerOrder) {
            const pi = this.getPlayerIndex(client);
            if (pi !== -1) {
                if (typeof this.sendHandToClient === "function") {
                    this.sendHandToClient(client);
                }
                if (pi === Number(this.state.currentPlayerIndex || 0) && typeof this.sendTurnInfoToPlayerIndex === "function") {
                    this.sendTurnInfoToPlayerIndex(pi);
                }
            }
        }
    }

    handleResumeControl(client) {
        if (!client) return false;
        const player = this.state?.players?.get?.(client.sessionId) || null;
        if (!player || !this.isSeatUnderBotTakeover(player)) return false;
        if (!this.botTakeover?.canHumanReclaim?.(player)) return false;
        const identity = this.identityBySessionId.get(client.sessionId);
        return this.botTakeover?.resume?.(player, {
            requestUserId: identity?.userId || player.userId || ""
        }) === true;
    }

    broadcastFullState({ includeRoomState = false } = {}) {
        this.updateSchemaState({ includeBoardJson: true });
        for (const client of this.clients) {
            this.sendFullState(client);
        }
        this.sendTurnInfoToPlayerIndex(this.state.currentPlayerIndex);
        if (includeRoomState) {
            this.broadcastRoomState();
        } else {
            void this.saveCustomStateToRedis();
        }
        this.scheduleBotTurn();
    }

    buildGameDeltaPayload(base = {}) {
        const isTeamMode = isRoomTeamMode(this);
        return {
            action: String(base.action || "").trim(),
            actorIndex: Number.isInteger(Number(base.actorIndex)) ? Number(base.actorIndex) : -1,
            boardDelta: base.boardDelta || null,
            scoreDelta: Number(base.scoreDelta || 0),
            scoreSource: String(base.scoreSource || "").trim() || null,
            scorePlayerIndex: Number.isInteger(Number(base.scorePlayerIndex)) ? Number(base.scorePlayerIndex) : -1,
            isFinalMove: Boolean(base.isFinalMove),
            finishKind: String(base.finishKind || "").trim() || null,
            finishInfo: base.finishInfo || null,
            isTeamMode,
            currentPlayerIndex: Number(this.state.currentPlayerIndex || 0),
            boneyardCount: this.boneyard.length,
            gameActive: Boolean(this.state.gameActive),
            matchRound: Number(this.state.matchRound || 1),
            deal: Number(this.state.deal || 1),
            turnDeadlineAt: Number(this.state.turnDeadlineAt || 0),
            turnVersion: Number(this.state.turnVersion || 1),
            lastMoveRevealPending: Boolean(this.lastMoveRevealPending),
            playerStats: this.buildPublicPlayerStats(),
            teamScores: Array.from(this.state.teamScores || [0, 0]),
            teamRoundWins: Array.from(this.state.teamRoundWins || [0, 0]),
            stakeKey: this.currentDealStakeKey || this.currentStakeKey,
            bankAmount: Number(this.currentDealBankAmount || 0),
            turnDurationMs: Number(this.state.turnDurationMs || this.turnTimeoutMs || TURN_TIMEOUT_MS),
            serverNow: Number(this.state.serverNow || Date.now())
        };
    }

    broadcastGameDelta(base = {}) {
        this.updateSchemaState({ includeBoardJson: false });
        this.broadcast("game_delta", this.buildGameDeltaPayload(base));
        void this.saveCustomStateToRedis();
    }

    sendActionAck(client, payload = {}) {
        if (!client || typeof client.send !== "function") return;
        client.send("action_ack", {
            accepted: Boolean(payload.accepted),
            action: String(payload.action || "").trim(),
            actionId: String(payload.actionId || "").trim(),
            reason: String(payload.reason || "").trim(),
            turnVersion: Number(this.state.turnVersion || 1),
            currentPlayerIndex: Number(this.state.currentPlayerIndex || 0),
            turnDurationMs: Number(this.state.turnDurationMs || this.turnTimeoutMs || TURN_TIMEOUT_MS),
            serverNow: Number(this.state.serverNow || Date.now()),
            selfHand: Array.isArray(payload.selfHand) ? payload.selfHand : undefined,
            turnInfo: payload.turnInfo || undefined
        });
    }

    syncState({ includeBoardJson = true } = {}) {
        console.log(`[FM-SRV ${Date.now()}] syncState includeBoardJson=${includeBoardJson}`);
        this.updateSchemaState({ includeBoardJson });
        for (const client of this.clients) {
            this.sendHandToClient(client);
        }
        this.sendTurnInfoToPlayerIndex(this.state.currentPlayerIndex);
        this.broadcastRoomState();
        this.scheduleBotTurn();
    }

    broadcastRoomState() {
        this.updateSchemaState({ includeBoardJson: false });
        this.syncPublicPlayerStatsToState();
        setRoomGameActive(this.roomId, this.state.gameActive);
        const players = buildRoomStatePlayers({
            playerOrder: this.state.playerOrder,
            players: this.state.players,
            identityBySessionId: this.identityBySessionId,
            voiceEnabledBySessionId: this.voiceEnabledBySessionId
        });
        const payload = buildRoomStatePayload({
            room: this,
            players
        });
        debugLog("[ROOM_DEBUG] room_state", {
            roomId: this.roomId,
            roomCode: this.roomCode,
            gameActive: payload.gameActive,
            seatSelectionRequired: payload.seatSelectionRequired,
            currentPlayers: payload.currentPlayers,
            humanPlayers: payload.humanPlayers,
            humanSeats: payload.humanSeats,
            aiCount: payload.aiCount,
            totalPlayers: payload.totalPlayers,
            players: debugPlayerSummary(this)
        });
        this.broadcast("room_state", payload);
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

    getPlayerIdentityForSession(sessionId) {
        const normalizedSessionId = String(sessionId || "").trim();
        if (!normalizedSessionId) return { playerId: "", authToken: "", identity: null, player: null };
        const identity = this.identityBySessionId.get(normalizedSessionId) || null;
        const player = this.state?.players?.get?.(normalizedSessionId) || null;
        const playerId = String(identity?.playerId || player?.playerId || player?.userId || player?.id || "").trim();
        const authToken = String(identity?.authToken || "").trim();
        return { playerId, authToken, identity, player };
    }

    getVoiceModerationCacheKey(senderPlayerId, targetPlayerId) {
        return `${String(senderPlayerId || "").trim()}:${String(targetPlayerId || "").trim()}`;
    }

    async canRelayVoiceBetweenSessions(senderSessionId, targetSessionId) {
        const sender = this.getPlayerIdentityForSession(senderSessionId);
        const target = this.getPlayerIdentityForSession(targetSessionId);
        if (!sender.playerId || !target.playerId) {
            return true;
        }
        if (!sender.authToken) {
            return true;
        }

        const cacheKey = this.getVoiceModerationCacheKey(sender.playerId, target.playerId);
        const now = Date.now();
        const cached = this.voiceModerationCache.get(cacheKey);
        if (cached && cached.expiresAt > now) {
            return !cached.blocked;
        }

        try {
            const response = await fetch(`${process.env.PLATFORM_API_URL || "http://127.0.0.1:3000"}/api/social/players/${encodeURIComponent(target.playerId)}/moderation`, {
                method: "GET",
                headers: {
                    Authorization: `Bearer ${sender.authToken}`
                }
            });
            if (!response.ok) {
                return true;
            }
            const data = await response.json().catch(() => null);
            const moderation = data?.item || data || {};
            const blocked = Boolean(moderation?.blocked || moderation?.currentPlayerBanned || moderation?.targetPlayerBanned);
            this.voiceModerationCache.set(cacheKey, {
                blocked,
                expiresAt: now + 10_000
            });
            return !blocked;
        } catch (error) {
            console.warn("[ROOM] Voice moderation check failed:", error);
            return true;
        }
    }

    async relayVoiceSignal(client, message = {}) {
        const kind = String(message?.kind || "").trim();
        if (!["offer", "answer", "candidate", "state", "renegotiate"].includes(kind)) return;
        const fromSessionId = String(client?.sessionId || "").trim();
        if (!fromSessionId) return;

        const basePayload = {
            kind,
            fromSessionId,
            enabled: Boolean(message?.enabled),
            speaking: Boolean(message?.speaking),
            name: String(message?.name || "").trim(),
            ts: Number(message?.ts || Date.now()) || Date.now()
        };

        if (kind === "state") {
            const recipients = Array.isArray(this.clients)
                ? this.clients.filter((entry) => entry?.sessionId && entry.sessionId !== fromSessionId)
                : [];
            for (const recipient of recipients) {
                if (!recipient?.sessionId) continue;
                if (!await this.canRelayVoiceBetweenSessions(fromSessionId, recipient.sessionId)) {
                    continue;
                }
                recipient.send("voice_signal", {
                    ...basePayload,
                    targetSessionId: recipient.sessionId
                });
            }
            return;
        }

        const targetSessionId = String(message?.targetSessionId || "").trim();
        if (!targetSessionId) return;
        if (!await this.canRelayVoiceBetweenSessions(fromSessionId, targetSessionId)) {
            return;
        }
        const targetClient = Array.isArray(this.clients)
            ? this.clients.find((entry) => entry?.sessionId === targetSessionId)
            : null;
        if (!targetClient) return;
        targetClient.send("voice_signal", {
            ...basePayload,
            targetSessionId,
            candidate: message?.candidate,
            description: message?.description,
            sdp: message?.sdp
        });
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

    clearMatchRecordingRetryTimer() {
        if (this.matchRecordRetryTimer) {
            clearTimeout(this.matchRecordRetryTimer);
            this.matchRecordRetryTimer = null;
        }
    }

    clearEconomySettlementRetryTimer() {
        if (this.economySettlementRetryTimer) {
            clearTimeout(this.economySettlementRetryTimer);
            this.economySettlementRetryTimer = null;
        }
    }

    beginPendingEconomySettlement() {
        if (this.pendingEconomySettlementResolve) {
            return this.pendingEconomySettlement;
        }
        this.pendingEconomySettlement = new Promise((resolve) => {
            this.pendingEconomySettlementResolve = resolve;
        });
        return this.pendingEconomySettlement;
    }

    resolvePendingEconomySettlement() {
        if (!this.pendingEconomySettlementResolve) {
            this.pendingEconomySettlement = Promise.resolve();
            return;
        }
        const resolve = this.pendingEconomySettlementResolve;
        this.pendingEconomySettlementResolve = null;
        this.pendingEconomySettlement = Promise.resolve();
        resolve();
    }

    scheduleEconomySettlementRetry() {
        const pending = this.pendingEconomySettlementState;
        if (!pending || this.economySettlementRetryTimer) {
            return;
        }
        const nextRetryAt = Number(pending.nextRetryAt || 0);
        const delay = Math.max(0, nextRetryAt ? nextRetryAt - Date.now() : ECONOMY_SETTLEMENT_RETRY_MS);
        this.economySettlementRetryTimer = setTimeout(() => {
            this.economySettlementRetryTimer = null;
            void this.retryPendingEconomySettlement();
        }, delay);
        if (this.economySettlementRetryTimer && typeof this.economySettlementRetryTimer.unref === "function") {
            this.economySettlementRetryTimer.unref();
        }
    }

    async retryPendingEconomySettlement() {
        const pending = this.pendingEconomySettlementState;
        if (!pending) {
            return false;
        }
        if (pending.kind === "forfeit") {
            return settleForfeitStakeForRoom(this, pending.leavingSessionId, {
                matchId: pending.matchId,
                winnerUserIds: Array.isArray(pending.winnerUserIds) ? pending.winnerUserIds : []
            });
        }
        return settleEconomyRoundForRoom(this, Number(pending.winnerIndex || 0), {
            matchOutcome: pending.matchOutcome || "normal",
            matchId: pending.matchId,
            winnerUserIds: Array.isArray(pending.winnerUserIds) ? pending.winnerUserIds : []
        });
    }

    scheduleMatchRecordingRetry() {
        if (this.matchRecorded || this.matchRecordRetryTimer || !this.pendingMatchRecording) {
            return;
        }
        const pendingMatchRecordId = String(this.pendingMatchRecording.sourceMatchId || "").trim();
        if (!pendingMatchRecordId) {
            return;
        }
        this.matchRecordRetryTimer = setTimeout(() => {
            this.matchRecordRetryTimer = null;
            if (this.matchRecorded || !this.pendingMatchRecording) return;
            if (String(this.pendingMatchRecording.sourceMatchId || "").trim() !== pendingMatchRecordId) return;
            void this.retryPendingMatchRecording();
        }, 5000);
    }

    async retryPendingMatchRecording() {
        if (this.matchRecorded || this.matchRecordInFlight || !this.pendingMatchRecording) {
            return false;
        }

        const payload = this.pendingMatchRecording;
        // Sanitize participants in case the payload was restored from Redis
        // with extra Colyseus Schema fields (isSelf, isConnected, avatarUrl, etc.)
        if (Array.isArray(payload.participants)) {
            payload.participants = payload.participants.map(sanitizeParticipant);
        }
        const identity = this.getPlatformMatchIdentity();
        if (!identity) {
            console.warn("[ROOM] Failed to record match: platform identity missing.");
            this.scheduleMatchRecordingRetry();
            return false;
        }

        this.matchRecordInFlight = true;
        try {
            const recorded = await this.recordPlatformMatch(buildSignedRequestBody("platform.match", payload));
            if (!recorded) {
                throw new Error("Platform match recording failed");
            }
            this.matchRecorded = true;
            this.pendingMatchRecording = null;
            this.clearMatchRecordingRetryTimer();
            void this.saveCustomStateToRedis();
            const clientCount = Array.isArray(this.clients) ? this.clients.length : 0;
            if (!this.state.gameActive && clientCount === this.maxClients) {
                setTimeout(() => {
                    void this.startGame();
                }, 0);
            }
            return true;
        } catch (err) {
            console.error("[ROOM] Failed to record match:", err);
            this.matchRecorded = false;
            this.scheduleMatchRecordingRetry();
            void this.saveCustomStateToRedis();
            return false;
        } finally {
            this.matchRecordInFlight = false;
        }
    }

    async settleForfeitStake(leavingSessionId) {
        return settleForfeitStakeForRoom(this, leavingSessionId);
    }

    async recordForfeitMatchResult(leavingSessionId) {
        if (this.matchRecorded || this.matchRecordInFlight) return false;
        const leavingIndex = this.state.playerOrder.indexOf(leavingSessionId);
        if (leavingIndex === -1) return false;
        const leavingPlayer = this.state.players.get(leavingSessionId);
        const leavingIdentity = this.identityBySessionId.get(leavingSessionId);
        if (!leavingPlayer || leavingPlayer.isBot || !leavingIdentity?.userId) {
            return false;
        }

        if (!this.matchRecordId) {
            this.matchRecordId = this.currentDealMatchId || `${this.roomId}:match:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 10)}`;
        }

        const isTeamMode = isRoomTeamMode(this);
        const winnerIndex = isTeamMode
            ? (leavingIndex % 2 === 0 ? 1 : 0)
            : (leavingIndex === 0 ? 1 : 0);
        const payload = buildPlatformMatchPayload({
            isTeamMode,
            gameMode: this.gameMode,
            roomId: this.roomId,
            stakeKey: this.currentStakeKey,
            sourceMatchId: this.matchRecordId,
            playerOrder: this.state.playerOrder,
            players: this.state.players,
            teamScores: this.state.teamScores,
            teamRoundWins: this.state.teamRoundWins,
            winnerIndex,
            matchOutcome: "forfeit",
            classic101DryWin: false,
            forfeitUserIds: [leavingIdentity.userId],
            forfeitPlayerIds: [leavingIdentity.playerId || leavingIdentity.userId]
        });

        if (!payload.participants.length) {
            return false;
        }

        this.pendingMatchRecording = payload;
        this.matchRecordInFlight = true;
        try {
            const recorded = await this.recordPlatformMatch(buildSignedRequestBody("platform.match", payload));
            if (!recorded) {
                throw new Error("Platform match recording failed");
            }
            this.matchRecorded = true;
            this.pendingMatchRecording = null;
            this.clearMatchRecordingRetryTimer();
            void this.saveCustomStateToRedis();
            return true;
        } catch (err) {
            console.error("[ROOM] Failed to record forfeit match:", err);
            this.matchRecorded = false;
            this.scheduleMatchRecordingRetry();
            void this.saveCustomStateToRedis();
            return false;
        } finally {
            this.matchRecordInFlight = false;
        }
    }

    async settleEconomyRound(wi, isInstantWin, players, wins, options = {}) {
        return settleEconomyRoundForRoom(this, wi, options);
    }

    async recordMatchResult(wi, isInstantWin, players, wins, options = {}) {
        if (this.matchRecorded || this.matchRecordInFlight) return false;
        if (!this.matchRecordId) {
            this.matchRecordId = this.currentDealMatchId || `${this.roomId}:match:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 10)}`;
        }
        const isTeamMode = this.roomMode === "team";
        const matchOutcome = String(options?.matchOutcome || "normal").trim() || "normal";
        const payload = buildPlatformMatchPayload({
            isTeamMode,
            gameMode: this.gameMode,
            roomId: this.roomId,
            stakeKey: this.currentStakeKey,
            sourceMatchId: this.matchRecordId,
            playerOrder: this.state.playerOrder,
            players: this.state.players,
            teamScores: this.state.teamScores,
            teamRoundWins: this.state.teamRoundWins,
            winnerIndex: wi,
            matchOutcome,
            classic101DryWin: this.gameMode === "classic101" && Number(wins || 0) >= 2
        });

        if (!payload.participants.length) {
            console.warn("[ROOM] Skipping match recording because no participants had userIds.");
            this.matchRecorded = true;
            this.pendingMatchRecording = null;
            this.clearMatchRecordingRetryTimer();
            return true;
        }

        this.pendingMatchRecording = payload;
        this.matchRecordInFlight = true;
        try {
            const recorded = await this.recordPlatformMatch(buildSignedRequestBody("platform.match", payload));
            if (!recorded) {
                throw new Error("Platform match recording failed");
            }
            this.matchRecorded = true;
            this.pendingMatchRecording = null;
            this.clearMatchRecordingRetryTimer();
            void this.saveCustomStateToRedis();
            const clientCount = Array.isArray(this.clients) ? this.clients.length : 0;
            if (!this.state.gameActive && clientCount === this.maxClients) {
                setTimeout(() => {
                    void this.startGame();
                }, 0);
            }
            return true;
        } catch (err) {
            console.error("[ROOM] Failed to record match:", err);
            this.matchRecorded = false;
            this.scheduleMatchRecordingRetry();
            void this.saveCustomStateToRedis();
            return false;
        } finally {
            this.matchRecordInFlight = false;
        }
    }

    validateClientAction(client, message = {}, { allowTurnAdvancePending = false } = {}) {
        if (!this.state.gameActive) return { ok: false, reason: "game_inactive", pi: -1 };
        if (this.state.players) {
            const player = this.state.players.get(client.sessionId);
            if (!player) return { ok: false, reason: "player_not_found", pi: -1 };
            if (player.isConnected === false) return { ok: false, reason: "player_reconnecting", pi: -1 };
            if (this.isSeatUnderBotTakeover(player)) return { ok: false, reason: "bot_takeover_active", pi: -1 };
        }
        if (this.pendingDisconnects?.has?.(client.sessionId)) return { ok: false, reason: "player_reconnecting", pi: -1 };

        const pi = this.getPlayerIndex(client);
        if (pi !== this.state.currentPlayerIndex) return { ok: false, reason: "not_your_turn", pi };
        if (!allowTurnAdvancePending && this.turnAdvancePending) return { ok: false, reason: "turn_advancing", pi };
        if (this.lastMoveRevealPending) return { ok: false, reason: "result_reveal_pending", pi };
        if (Number(message?.turnVersion || 0) !== Number(this.state.turnVersion || 0)) return { ok: false, reason: "stale_turn", pi };
        return { ok: true, pi };
    }

    handlePlay(client, message = {}) {
        const validation = this.validateClientAction(client, message);
        if (!validation.ok) {
            this.sendActionAck(client, {
                accepted: false,
                action: "play",
                actionId: message?.actionId,
                reason: validation.reason
            });
            return;
        }
        const { tileIndex, openEndIndex } = message;
        const accepted = this.performPlay(validation.pi, tileIndex, openEndIndex, false, {
            client,
            actionId: message?.actionId
        });
        if (!accepted) {
            this.sendActionAck(client, {
                accepted: false,
                action: "play",
                actionId: message?.actionId,
                reason: "invalid_move"
            });
        }
    }

    handleDraw(client, message = {}) {
        const validation = this.validateClientAction(client, message);
        if (!validation.ok) {
            this.sendActionAck(client, {
                accepted: false,
                action: "draw",
                actionId: message?.actionId,
                reason: validation.reason
            });
            return;
        }
        const accepted = this.performDraw(validation.pi, false, {
            client,
            actionId: message?.actionId
        });
        if (!accepted) {
            this.sendActionAck(client, {
                accepted: false,
                action: "draw",
                actionId: message?.actionId,
                reason: "invalid_draw"
            });
        }
    }

    handlePass(client, message = {}) {
        const validation = this.validateClientAction(client, message);
        if (!validation.ok) {
            this.sendActionAck(client, {
                accepted: false,
                action: "pass",
                actionId: message?.actionId,
                reason: validation.reason
            });
            return;
        }
        const accepted = this.performPass(validation.pi, false, {
            client,
            actionId: message?.actionId
        });
        if (!accepted) {
            this.sendActionAck(client, {
                accepted: false,
                action: "pass",
                actionId: message?.actionId,
                reason: "invalid_pass"
            });
        }
    }

    handleGosha(client, message = {}) {
        const validation = this.validateClientAction(client, message, { allowTurnAdvancePending: true });
        if (!validation.ok) {
            this.sendActionAck(client, {
                accepted: false,
                action: "gosha",
                actionId: message?.actionId,
                reason: validation.reason
            });
            return;
        }

        const combo = this.internalBoard.getGoshaCombo(this.hands[validation.pi]);
        if (!combo) {
            this.sendActionAck(client, {
                accepted: false,
                action: "gosha",
                actionId: message?.actionId,
                reason: "invalid_gosha"
            });
            return;
        }

        const accepted = this.performGosha(validation.pi, combo, false, {
            client,
            actionId: message?.actionId
        });
        if (!accepted) {
            this.sendActionAck(client, {
                accepted: false,
                action: "gosha",
                actionId: message?.actionId,
                reason: "invalid_gosha"
            });
        }
    }

    performPlay(pi, tileIndex, openEndIndex, isBot = false, meta = {}) {
        this.configureBoardForCurrentMode(this.internalBoard);
        const hand = this.hands[pi];
        const tile = hand && hand[tileIndex];
        if (!tile) return false;

        if (!this.internalBoard.isEmpty) {
            const currentOpenEnd = this.internalBoard.openEnds?.[openEndIndex];
            if (!currentOpenEnd || !tile.hasValue(currentOpenEnd.value)) return false;
        }

        const moves = this.getValidMovesForPlayer(pi);
        const isValid = moves.some((m) => m.tileIndex === tileIndex && m.openEndIndex === openEndIndex);
        if (!isValid) return false;

        hand.splice(tileIndex, 1);
        this.clearTurnTimer();
        this.broadcast("sound", "place");

        const wasEmpty = this.internalBoard.isEmpty;
        let score = 0;
        let boardDelta = null;
        if (wasEmpty) {
            this.internalBoard.placeFirst(tile);
            score = this.getActiveRuleset().openingPlayScore(tile, this.getOpeningScoreContext(pi));
            boardDelta = {
                kind: "first",
                tile: { a: tile.a, b: tile.b, id: tile.id }
            };
        } else {
            score = this.internalBoard.placeTile(tile, openEndIndex);
            boardDelta = {
                kind: "play",
                tile: { a: tile.a, b: tile.b, id: tile.id },
                openEndIndex
            };
        }
        this.state.boardJson = JSON.stringify(this.internalBoard);

        if (!wasEmpty) {
            score = this.getActiveRuleset().scoreDuringPlay(this.internalBoard, {
                tile,
                playerIndex: pi,
                board: this.internalBoard,
                hand,
                hands: this.hands,
                boneyard: this.boneyard,
                isTeamMode: isRoomTeamMode(this),
                wasEmpty
            });
        }
        const scoreDelta = score > 0 ? this.addScore(pi, score, { broadcast: false }) : 0;
        const roundEnd = this.getActiveRuleset().resolveRoundEnd({
            score,
            hand,
            board: this.internalBoard,
            hands: this.hands,
            boneyard: this.boneyard,
            playerIndex: pi,
            isInstantWinEnabled: this.instantWinEnabled,
            isGosha: false,
            isTeamMode: isRoomTeamMode(this),
            matchState: this.matchState,
            getTeamMembers: this.getTeamMembers.bind(this)
        });
        this.matchState = this.normalizeMatchStateForCurrentMode(roundEnd?.matchState || this.matchState, this.totalPlayers, isRoomTeamMode(this));
        this.syncMatchStateToSchema();
        const isFinalMove = Boolean(roundEnd?.isFinalMove);
        const finishKind = roundEnd?.finishKind || null;
        this.lastFinishInfo = isFinalMove ? {
            actorIndex: pi,
            winnerIndex: Number.isInteger(Number(roundEnd?.winnerIndex)) ? Number(roundEnd.winnerIndex) : pi,
            finishKind: finishKind || "tile",
            tileCount: 1,
            action: "play",
            fish: Boolean(roundEnd?.fish),
            tableScoreDelta: scoreDelta,
            handBonus: 0
        } : null;
        this.bumpTurnVersion();
        this.broadcastGameDelta({
            action: "play",
            actorIndex: pi,
            boardDelta,
            scoreDelta,
            scoreSource: "table",
            scorePlayerIndex: scoreDelta > 0 ? pi : -1,
            isFinalMove,
            finishKind,
            finishInfo: this.lastFinishInfo
        });
        console.log(`[FM-SRV ${Date.now()}] gameDelta isFinalMove=${isFinalMove}`);

        if (roundEnd?.isInstantWin) {
            console.log(`[FM-SRV ${Date.now()}] end immediate`);
            this.endRound(pi, true);
            return true;
        }

        if (roundEnd?.dealEnd && !roundEnd?.fish) {
            console.log(`[FM-SRV ${Date.now()}] end immediate`);
            this.endDeal(pi, false);
            return true;
        }
        if (roundEnd?.dealEnd && roundEnd?.fish) {
            console.log(`[FM-SRV ${Date.now()}] end immediate`);
            this.endDeal(Number.isInteger(Number(roundEnd?.winnerIndex)) ? Number(roundEnd.winnerIndex) : this.findFishWinner(), true);
            return true;
        }

        this.bumpTurnVersion();
        this.pendingActionContext = {
            client: meta.client || null,
            action: "play",
            actionId: meta.actionId || ""
        };
        this.scheduleTurnAdvance(0);
        return true;
    }

    performDraw(pi, isBot = false, meta = {}) {
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
        this.bumpTurnVersion();
        this.broadcastGameDelta({
            action: "draw",
            actorIndex: pi
        });
        if (meta.client) {
            this.sendActionAck(meta.client, {
                accepted: true,
                action: "draw",
                actionId: meta.actionId || "",
                selfHand: this.hands[pi],
                turnInfo: this.buildTurnInfoForPlayer(pi)
            });
        }
        this.syncState();
        return true;
    }

    performPass(pi, isBot = false, meta = {}) {
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
            this.broadcast("msg", { key: "msg-player-passed", values: { player: actorName }, time: 1500 });
        }
        this.clearTurnTimer();
        this.clearTurnAdvanceTimer();
        this.bumpTurnVersion();
        this.broadcastGameDelta({
            action: "pass",
            actorIndex: pi
        });
        this.pendingActionContext = {
            client: meta.client || null,
            action: "pass",
            actionId: meta.actionId || ""
        };
        this.advanceTurn();
        return true;
    }

    performGosha(pi, combo, isBot = false, meta = {}) {
        if (this.gameMode === "classic101") {
            return false;
        }
        this.configureBoardForCurrentMode(this.internalBoard);
        this.broadcast("sound", "gosha");
        const hand = this.hands[pi];
        const matches = combo.matches;
        const sorted = [...matches].sort((a, b) => b.tileIndex - a.tileIndex);
        const tilesByIndex = new Map(matches.map((m) => [m.tileIndex, hand[m.tileIndex]]));
        const placements = matches.map((m) => {
            const tile = tilesByIndex.get(m.tileIndex);
            return {
                nodeId: Number(m.nodeId),
                side: String(m.side || ""),
                tile: tile ? { a: tile.a, b: tile.b } : null
            };
        });
        for (const m of sorted) hand.splice(m.tileIndex, 1);

        for (const m of matches) {
            const openEndIndex = this.internalBoard.findOpenEndIndex(m.nodeId, m.side);
            const tile = tilesByIndex.get(m.tileIndex);
            if (openEndIndex === -1 || !tile) {
                return false;
            }
            this.internalBoard.placeTile(tile, openEndIndex);
        }
        this.state.boardJson = JSON.stringify(this.internalBoard);

        const score = combo.score || this.getActiveRuleset().scoreDuringPlay(this.internalBoard);
        const scoreDelta = score > 0 ? this.addScore(pi, score, { broadcast: false }) : 0;
        const roundEnd = this.getActiveRuleset().resolveRoundEnd({
            score,
            hand,
            board: this.internalBoard,
            hands: this.hands,
            boneyard: this.boneyard,
            playerIndex: pi,
            isInstantWinEnabled: this.instantWinEnabled,
            isGosha: true,
            isTeamMode: isRoomTeamMode(this),
            matchState: this.matchState,
            getTeamMembers: this.getTeamMembers.bind(this)
        });
        this.matchState = this.normalizeMatchStateForCurrentMode(roundEnd?.matchState || this.matchState, this.totalPlayers, isRoomTeamMode(this));
        this.syncMatchStateToSchema();
        const isFinalMove = Boolean(roundEnd?.isFinalMove);
        const finishKind = roundEnd?.finishKind || null;
        this.clearTurnTimer();
        const actor = this.state.players.get(this.state.playerOrder[pi]);
        const actorName = actor ? actor.name : "Player";
        if (!isBot) {
            this.broadcast("msg", { key: "msg-player-gosha", values: { player: actorName }, time: 2000 });
        }
        this.lastFinishInfo = isFinalMove ? {
            actorIndex: pi,
            winnerIndex: Number.isInteger(Number(roundEnd?.winnerIndex)) ? Number(roundEnd.winnerIndex) : pi,
            finishKind: finishKind || "gosha",
            tileCount: matches.length,
            action: "gosha",
            fish: Boolean(roundEnd?.fish),
            tableScoreDelta: scoreDelta,
            handBonus: 0
        } : null;
        this.bumpTurnVersion();
        this.broadcastGameDelta({
            action: "gosha",
            actorIndex: pi,
            boardDelta: {
                kind: "gosha",
                placements
            },
            scoreDelta,
            scoreSource: "table",
            scorePlayerIndex: scoreDelta > 0 ? pi : -1,
            isFinalMove,
            finishKind,
            finishInfo: this.lastFinishInfo
        });
        console.log(`[FM-SRV ${Date.now()}] gameDelta isFinalMove=${isFinalMove}`);

        if (roundEnd?.isInstantWin) {
            console.log(`[FM-SRV ${Date.now()}] end immediate`);
            this.endRound(pi, true);
            return true;
        }

        if (roundEnd?.dealEnd && !roundEnd?.fish) {
            console.log(`[FM-SRV ${Date.now()}] end immediate`);
            this.endDeal(pi, false);
            return true;
        }
        if (roundEnd?.dealEnd && roundEnd?.fish) {
            console.log(`[FM-SRV ${Date.now()}] end immediate`);
            this.endDeal(Number.isInteger(Number(roundEnd?.winnerIndex)) ? Number(roundEnd.winnerIndex) : this.findFishWinner(), true);
            return true;
        }

        this.pendingActionContext = {
            client: meta.client || null,
            action: "gosha",
            actionId: meta.actionId || ""
        };
        const advanceDelay = isBot ? 0 : (this.shouldOpenGoshaChainWindow(pi) ? this.turnAdvanceMs : 0);
        this.scheduleTurnAdvance(advanceDelay);
        return true;
    }

    handleNextDeal(client) {
        if (this.state.gameActive) return;
        if (this.matchFinished) return;
        if (!this.pendingAdvanceKind) return;
        const isHost = this.state.playerOrder[0] === client?.sessionId;
        if (!isHost) return;
        if (this._lastNextDealAt && Date.now() - this._lastNextDealAt < 1500) return;
        this._lastNextDealAt = Date.now();
        this.clearNextDealTimer();
        if (this.pendingAdvanceKind === "timeout_continue") return;
        if (this.pendingAdvanceKind === "round") {
            void this.startRound();
            return;
        }
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

    handleGift(client, message) {
        const sender = this.state.players.get(client.sessionId);
        if (!sender) return;
        const payload = {
            giftKey: String(message?.giftKey || "").trim(),
            giftName: String(message?.giftName || "").trim(),
            assetKey: String(message?.assetKey || "").trim(),
            recipientPlayerId: String(message?.recipientPlayerId || "").trim(),
            recipientName: String(message?.recipientName || "").trim(),
            senderName: sender.name,
            sessionId: client.sessionId,
            roomId: this.roomId,
            contextType: String(message?.contextType || "match").trim() || "match",
            contextId: String(message?.contextId || "").trim() || null
        };
        if (!payload.giftKey || !payload.recipientPlayerId) return;
        this.broadcast("gift", payload);
    }

    handleVoiceSignal(client, message = {}) {
        if (!client || !this.state?.players?.has(client.sessionId)) return;
        const kind = String(message.kind || "").trim();
        if (!["offer", "answer", "candidate", "state", "renegotiate"].includes(kind)) return;

        if (kind === "state") {
            const enabled = Boolean(message.enabled);
            if (enabled) {
                this.voiceEnabledBySessionId.add(client.sessionId);
            } else {
                this.voiceEnabledBySessionId.delete(client.sessionId);
            }
        }

        void this.relayVoiceSignal(client, {
            ...message,
            kind,
            ts: Date.now()
        });
    }

    advanceTurn() {
        this.clearTurnAdvanceTimer();
        const blocked = this.getActiveRuleset().resolveBlocked({
            board: this.internalBoard,
            hands: this.hands,
            boneyard: this.boneyard,
            isTeamMode: isRoomTeamMode(this),
            matchState: this.matchState,
            getTeamMembers: this.getTeamMembers.bind(this)
        });
        if (blocked?.blocked) {
            this.endDeal(Number.isInteger(Number(blocked?.winnerIndex)) ? Number(blocked.winnerIndex) : this.findFishWinner(), true);
            return;
        }
        this.state.currentPlayerIndex = (this.state.currentPlayerIndex + 1) % this.totalPlayers;
        this.scheduleTurnTimer();
    }

    applyScore(pi, score) {
        const sessionId = this.state.playerOrder[pi];
        const player = this.state.players.get(sessionId);
        if (!player) return 0;

        player.score += score;

        if (isRoomTeamMode(this)) {
            const team = pi % 2;
            this.state.teamScores[team] += score;
        }
        return score;
    }

    addScore(pi, score, { broadcast = true, scoreSource = "table" } = {}) {
        const applied = this.applyScore(pi, score);
        if (!applied) return 0;

        if (broadcast) {
            const sessionId = this.state.playerOrder[pi];
            const player = this.state.players.get(sessionId);
            const playerName = player ? player.name : "Player";
            this.broadcast("sound", "score");
            this.broadcast("score_popup", {
                score,
                scoreSource,
                actorIndex: pi
            });
            this.broadcast("msg", { text: `${playerName} +${score}!`, time: 2000 });
            this.broadcastGameDelta({
                action: "score",
                actorIndex: pi,
                scoreDelta: score,
                scorePlayerIndex: pi,
                scoreSource
            });
        }

        return applied;
    }

    findFishWinner() {
        const resolved = this.getActiveRuleset().resolveBlocked({
            board: this.internalBoard,
            hands: this.hands,
            boneyard: this.boneyard,
            isTeamMode: isRoomTeamMode(this),
            matchState: this.matchState,
            getTeamMembers: this.getTeamMembers.bind(this)
        });
        return Number.isInteger(Number(resolved?.winnerIndex)) ? Number(resolved.winnerIndex) : 0;
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
        const classic101 = this.gameMode === "classic101";

        if (classic101) {
            this.syncClassic101ScoresFromMatchState();
        }

        const isTeamMode = isRoomTeamMode(this);
        if (!classic101) {
            if (isTeamMode) {
                const wt = wi % 2;
                let os = 0;
                const teamMembers = this.getTeamMembers(wt);
                const otherMembers = this.getTeamMembers(1 - wt);
                for (const i of otherMembers) os += this.getActiveRuleset().handPoints(this.hands[i] || []);
                if (fish) for (const i of teamMembers) os -= this.getActiveRuleset().handPoints(this.hands[i] || []);
                const currentScore = this.state.teamScores[wt] || 0;
                bonus = currentScore > 300 ? 0 : roundTo5(Math.max(0, os));
                if (bonus > 0) bonus = this.addScore(wi, bonus, { broadcast: false, scoreSource: "hand_bonus" });
            } else {
                let os = 0;
                for (let i = 0; i < this.totalPlayers; i++) if (i !== wi) os += this.getActiveRuleset().handPoints(this.hands[i] || []);
                if (fish) os -= this.getActiveRuleset().handPoints(this.hands[wi] || []);
                const currentScore = this.state.players.get(this.state.playerOrder[wi])?.score || 0;
                bonus = currentScore > 300 ? 0 : roundTo5(Math.max(0, os));
                if (bonus > 0) bonus = this.addScore(wi, bonus, { broadcast: false, scoreSource: "hand_bonus" });
            }
        }

        this.broadcast("sound", "win");
        
        // Check for round win (target score reached)
        const scorePool = isTeamMode
            ? this.state.teamScores
            : Array.from(this.state.players.values()).map(p => p.score);
        const cs = scorePool.length > 0 ? Math.max(...scorePool) : 0;
        if (cs >= this.getActiveRuleset().matchTarget) {
            const rw = isTeamMode
                ? scorePool.indexOf(cs)
                : this.state.playerOrder.findIndex((sid) => (this.state.players.get(sid)?.score || 0) >= this.getActiveRuleset().matchTarget);
            if (rw === -1) return;
            this.endRound(isTeamMode ? (rw === 0 ? 0 : 1) : rw, false);
            return;
        }

        // Notify clients to show deal end screen
        const finishInfo = {
            ...(this.lastFinishInfo || {
                actorIndex: wi,
                winnerIndex: wi,
                finishKind: fish ? "fish" : "tile",
                tileCount: 1,
                action: "play",
                fish: Boolean(fish),
                tableScoreDelta: 0,
                handBonus: 0
            }),
            handBonus: bonus,
            bonusSource: "hand_bonus"
        };
        if (typeof finishInfo.tableScoreDelta !== "number") {
            finishInfo.tableScoreDelta = 0;
        }
        this.broadcast("deal_end", {
            winnerIndex: wi,
            fish,
            bonus,
            hands: this.hands,
            finishInfo,
            bonusSource: "hand_bonus",
            tableScoreDelta: Number(finishInfo.tableScoreDelta || 0)
        });
        this.pendingAdvanceKind = "deal";
        this.state.deal++;
        this.syncState({ includeBoardJson: false });
        this.scheduleNextDeal(DEAL_END_MODAL_MS);
    }

    async endRound(wi, isInstantWin) {
        if (this.botTimer) {
            clearTimeout(this.botTimer);
            this.botTimer = null;
        }
        this.clearTurnTimer();
        this.state.gameActive = false;
        this.pendingAdvanceKind = "round";
        this.syncState();
        const economySummary = this.currentStakeKey !== "free"
            ? await this.settleEconomyRound(wi, !!isInstantWin, null, null)
            : null;
        let wins = 1;
        const isTeamMode = isRoomTeamMode(this);
        const classic101 = this.gameMode === "classic101";
        const winnerTeamIndex = isTeamMode ? (wi % 2) : null;

        if (classic101) {
            this.syncClassic101ScoresFromMatchState();
            const scorePool = isTeamMode
                ? Array.from(this.state.teamScores || [0, 0]).map((score) => Number(score || 0))
                : Array.from(this.state.playerOrder || []).map((sid) => Number(this.state.players.get(sid)?.score || 0));
            const dryWin = isTeamMode
                ? Number(scorePool[1 - winnerTeamIndex] || 0) === 0
                : scorePool.every((score, index) => index === wi || Number(score || 0) === 0);
            wins = dryWin ? 2 : 1;
            if (isTeamMode) {
                this.state.teamRoundWins[winnerTeamIndex] += wins;
            } else {
                const winnerSid = this.state.playerOrder[wi];
                if (this.state.players.get(winnerSid)) this.state.players.get(winnerSid).roundWins += wins;
            }
        } else {
            if (isTeamMode) {
                const wt = winnerTeamIndex;
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
        }

        const finalScoreReached = isTeamMode
            ? (this.state.teamScores[0] >= this.getActiveRuleset().matchTarget || this.state.teamScores[1] >= this.getActiveRuleset().matchTarget)
            : (this.state.players.get(this.state.playerOrder[wi])?.score || 0) >= this.getActiveRuleset().matchTarget;
        const isMatchOver = finalScoreReached;

        // Build player data for the round end screen
        const playerData = [];
        for (let i = 0; i < this.state.playerOrder.length; i++) {
            const sid = this.state.playerOrder[i];
            const p = this.state.players.get(sid);
            playerData.push({
                name: p ? p.name : "Player",
                score: p ? p.score : 0,
                roundWins: p ? p.roundWins : 0,
                isWinner: isTeamMode ? (i % 2 === winnerTeamIndex) : i === wi
            });
        }

        const finishInfo = this.lastFinishInfo || {
            actorIndex: wi,
            winnerIndex: wi,
            finishKind: isInstantWin ? "instant_win" : "tile",
            tileCount: 1,
            action: "play",
            fish: false
        };
        this.broadcast("round_end", {
            winnerIndex: wi,
            wins,
            isInstantWin: !!isInstantWin,
            isMatchOver,
            matchRound: this.state.matchRound,
            isTeamMode,
            teamScores: Array.from(this.state.teamScores),
            teamRoundWins: Array.from(this.state.teamRoundWins),
            players: playerData,
            economy: economySummary,
            finishInfo
        });

        if (isMatchOver) {
            this.matchFinished = true;
            this.recordMatchResult(wi, !!isInstantWin, playerData, wins);
        } else {
            this.scheduleNextRound(2000);
        }

        this.state.matchRound++;
        this.syncState({ includeBoardJson: false });
    }

    async loadCustomStateForRestore(options = {}) {
        return loadCustomStateSnapshotForRestore({ redis, options });
    }

    buildSchemaStateSnapshot() {
        return buildSchemaStateSnapshotData({
            state: this.state,
            roomMode: this.roomMode,
            scoreMode: isRoomTeamMode(this) ? "team" : "solo"
        });
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

        const restored = buildRestoredSchemaStateData({
            snapshot,
            currentState: this.state,
            totalPlayers: this.totalPlayers,
            sanitizeName
        });

        for (const entry of restored.players) {
            const player = {
                name: getFirstNameDisplayName(entry.name, entry.name || "Player"),
                userId: entry.userId,
                score: entry.score,
                roundWins: entry.roundWins,
                handCount: entry.handCount,
                avatarUrl: entry.avatarUrl,
                isBot: entry.isBot,
                isConnected: entry.isConnected,
                seatIndex: entry.seatIndex,
                controller: entry.controller,
                takeoverActive: entry.takeoverActive,
                takeoverReason: entry.takeoverReason,
                takeoverSince: entry.takeoverSince
            };
            this.state.players.set(entry.sessionId, player);
        }

        this.replaceSchemaArray(this.state.playerOrder, restored.playerOrder);
        this.state.currentPlayerIndex = restored.currentPlayerIndex;
        this.state.boneyardCount = restored.boneyardCount;
        this.state.gameActive = restored.gameActive;
        this.state.matchRound = restored.matchRound;
        this.state.deal = restored.deal;
        this.state.boardJson = restored.boardJson;
        this.gameMode = normalizeGameMode(restored.gameMode || restored.mode || this.state.gameMode || this.state.mode || this.gameMode || this.mode);
        this.mode = this.gameMode;
        this.state.gameMode = this.gameMode;
        this.state.mode = this.gameMode;
        this.ruleset = this.getActiveRuleset();
        this.configureBoardForCurrentMode(this.internalBoard);
        this.roomMode = normalizeRoomMode(restored.roomMode || this.roomMode, restored.isTeamMode);
        this.state.isTeamMode = isRoomTeamMode(this);
        this.state.playerCount = restored.playerCount;
        this.state.turnDeadlineAt = restored.turnDeadlineAt;
        this.state.turnVersion = restored.turnVersion;
        this.replaceSchemaArray(this.state.teamScores, restored.teamScores);
        this.replaceSchemaArray(this.state.teamRoundWins, restored.teamRoundWins);
        this.matchState = this.normalizeMatchStateForCurrentMode(
            this.parseMatchStateSnapshot(restored.matchStateJson || snapshot?.matchState || this.state.matchStateJson),
            this.totalPlayers,
            this.state.isTeamMode
        );
        this.syncMatchStateToSchema();
    }

    restoreTile(tile) {
        if (tile instanceof Tile) return tile;
        return new Tile(Number(tile?.a || 0), Number(tile?.b || 0));
    }

    buildCustomStateSnapshot() {
        const identityBySessionId = buildSnapshotIdentityEntries(this.identityBySessionId);

        return {
            roomId: this.roomId,
            roomCode: this.roomCode,
            roomMode: this.roomMode,
            scoreMode: isRoomTeamMode(this) ? "team" : "solo",
            gameMode: this.gameMode,
            mode: this.mode,
            state: this.buildSchemaStateSnapshot(),
            roomVisibility: this.roomVisibility,
            matchState: this.matchState ? this.parseMatchStateSnapshot(this.matchState) : null,
            matchStateJson: this.state?.matchStateJson || "",
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
            economyReservationMade: Boolean(this.economyReservationMade),
            lastReservedMatchRound: this.lastReservedMatchRound,
            matchRecorded: this.matchRecorded,
            forfeitSettlementMade: this.forfeitSettlementMade,
            pendingEconomySettlementState: this.pendingEconomySettlementState,
            lastRoundEconomySummary: this.lastRoundEconomySummary,
            timeoutForfeitPending: this.timeoutForfeitPending,
            matchRecordId: this.matchRecordId,
            pendingMatchRecording: this.pendingMatchRecording,
            hands: this.hands,
            boneyard: this.boneyard,
            internalBoard: this.internalBoard,
            lastDealWinner: this.lastDealWinner,
            botIds: this.botIds,
            boardStartAxis: this.boardStartAxis,
            playerMissingSuits: this.playerMissingSuits ? this.playerMissingSuits.map((s) => Array.from(s)) : [],
            identityBySessionId
        };
    }

    applyCustomStateSnapshot(data = {}) {
        const restoredMetadata = buildRestoredRoomMetadata({ room: this, data });

        this.roomCode = restoredMetadata.roomCode;
        this.roomVisibility = restoredMetadata.roomVisibility;
        if (this.roomCode) {
            void rememberRoom(this.roomCode, this.roomId);
        }

        this.humanSeats = restoredMetadata.humanSeats;
        this.totalPlayers = restoredMetadata.totalPlayers;
        this.aiCount = restoredMetadata.aiCount;
        this.maxClients = this.humanSeats;
        this.dlossThreshold = restoredMetadata.dlossThreshold;
        this.instantWinEnabled = restoredMetadata.instantWinEnabled;
        this.aiDifficulty = restoredMetadata.aiDifficulty;
        this.currentStakeKey = restoredMetadata.currentStakeKey;
        this.currentDealMatchId = restoredMetadata.currentDealMatchId;
        this.currentDealStakeKey = restoredMetadata.currentDealStakeKey;
        this.currentDealStakeAmount = restoredMetadata.currentDealStakeAmount;
        this.currentDealBankAmount = restoredMetadata.currentDealBankAmount;
        this.economyReservationMade = restoredMetadata.economyReservationMade;
        this.lastReservedMatchRound = restoredMetadata.lastReservedMatchRound;
        this.matchRecorded = restoredMetadata.matchRecorded;
        this.forfeitSettlementMade = restoredMetadata.forfeitSettlementMade;
        this.pendingEconomySettlementState = restoredMetadata.pendingEconomySettlementState;
        this.gameMode = normalizeGameMode(data.gameMode || data.mode || data.state?.gameMode || data.state?.mode || this.gameMode || this.mode);
        this.mode = this.gameMode;
        this.ruleset = this.getActiveRuleset();
        this.configureBoardForCurrentMode(this.internalBoard);
        this.state.turnDeadlineAt = Number(data?.state?.turnDeadlineAt || this.state.turnDeadlineAt || 0);
        this.lastRoundEconomySummary = restoredMetadata.lastRoundEconomySummary;
        this.timeoutForfeitPending = data.timeoutForfeitPending || null;
        this.lastDealWinner = restoredMetadata.lastDealWinner;
        this.botIds = restoredMetadata.botIds;
        this.boardStartAxis = data.boardStartAxis || 'horizontal';
        this.playerMissingSuits = restoredMetadata.playerMissingSuits;
        this.matchRecordId = String(data.matchRecordId || this.matchRecordId || "");
        this.pendingMatchRecording = data.pendingMatchRecording || this.pendingMatchRecording || null;
        this.identityBySessionId = restoreSnapshotIdentityEntries(data.identityBySessionId, this.identityBySessionId);
        this.roomMode = normalizeRoomMode(data.roomMode || this.roomMode, data.state?.isTeamMode);

        if (data.state) {
            this.restoreSchemaState(data.state);
        }
        this.matchState = this.normalizeMatchStateForCurrentMode(
            this.parseMatchStateSnapshot(data.matchState || data.matchStateJson || data.state?.matchStateJson || this.state.matchStateJson),
            this.totalPlayers,
            this.roomMode === "team"
        );
        this.state.gameMode = this.gameMode;
        this.state.mode = this.gameMode;
        this.syncMatchStateToSchema();
        if (this.pendingEconomySettlementState) {
            this.beginPendingEconomySettlement();
        } else {
            this.resolvePendingEconomySettlement();
        }

        if (this.timeoutForfeitPending?.expiresAt && Date.now() < Number(this.timeoutForfeitPending.expiresAt)) {
            this.clearTimeoutForfeitTimer();
            const delay = Math.max(0, Number(this.timeoutForfeitPending.expiresAt) - Date.now());
            this.timeoutContinueTimer = setTimeout(() => {
                this.timeoutContinueTimer = null;
                void this.closeTimeoutForfeitRoom();
            }, delay);
            if (this.timeoutContinueTimer && typeof this.timeoutContinueTimer.unref === "function") {
                this.timeoutContinueTimer.unref();
            }
        } else {
            this.clearTimeoutForfeitState();
        }

        if (!this.pendingEconomySettlementState) {
            this.clearEconomySettlementRetryTimer();
        } else {
            this.scheduleEconomySettlementRetry();
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

        this.hands = Array.isArray(this.hands) ? this.hands : [];
        this.boneyard = Array.isArray(this.boneyard) ? this.boneyard : [];
        this.internalBoard = this.internalBoard || new Board();
        this.internalBoard.startAxis = this.boardStartAxis || 'horizontal';
        this.configureBoardForCurrentMode(this.internalBoard);
        this.state.playerCount = this.totalPlayers;
        this.state.isTeamMode = this.roomMode === "team";
        this.state.boneyardCount = this.boneyard.length;
        this.state.boardJson = JSON.stringify(this.internalBoard);
        if (this.matchRecorded) {
            this.pendingMatchRecording = null;
            this.clearMatchRecordingRetryTimer();
        }
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
        const roomId = getSafeRoomId(this);
        if (!roomId || !redis) return;
        try {
            if (redis.status !== "ready") {
                await redis.connect();
            }
            const snapshot = JSON.stringify(this.buildCustomStateSnapshot());
            await redis.setex(`domino:custom:${roomId}`, CUSTOM_STATE_TTL, snapshot);
            if (this.roomCode) {
                await redis.setex(`domino:custom:code:${this.roomCode}`, CUSTOM_STATE_TTL, snapshot);
                await rememberRoom(this.roomCode, roomId);
            }
        } catch (e) {
            console.error("Redis error", e);
        }
    }

    onCacheRoom() {
        return this.buildCustomStateSnapshot();
    }

    onRestoreRoom(cachedData) {
        debugLog(`[ROOM] Restoring room ${this.roomId}`);
        this.applyCustomStateSnapshot(cachedData || {});
        if (this.pendingMatchRecording && !this.matchRecorded) {
            void this.retryPendingMatchRecording();
        }
        if (this.state.gameActive && this.isSeatDrivenByBot(this.getPlayerForTurnIndex(this.state.currentPlayerIndex))) {
            this.scheduleBotTurn(BOT_THINK_DELAY_MS);
        }
    }

    async onBeforeShutdown() {
        this.clearMatchRecordingRetryTimer();
        await this.saveCustomStateToRedis();
        return this.disconnect();
    }
}

module.exports = DominoRoom;
module.exports.generateRoomCode = generateRoomCode;
module.exports.sanitizeName = sanitizeName;
