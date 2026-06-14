// js/network.js
// Networking using Colyseus 0.17

function isDebugLoggingEnabled() {
    if (typeof window === 'undefined') return false;
    try {
        return window.__DOMINO_DEBUG_LOGS === true || window.localStorage?.getItem("dominoDebugLogs") === "true";
    } catch {
        return false;
    }
}

function debugLog(...args) {
    if (isDebugLoggingEnabled()) console.log(...args);
}

class NetworkManager {
    constructor(game) {
        this.game = game;
        this.client = null;
        this.room = null;
        this.isMultiplayer = false;
        this.isHost = false;
        this.isGuest = false;
        this.reconnectionTokenKey = "dominoRoomReconnectionToken";
        this.manualLeaveRequested = false;
        this.lastNetworkLeaveRoomExplicit = null;
        this.lastExplicitLeaveSentAt = 0;
        this.lastAccidentalDisconnectAt = 0;
        this.reconnectTimer = null;
        this.reconnectAttempt = 0;
        this.maxReconnectAttempts = 10;
        this.reconnectInProgress = false;
        this.voiceConfig = null;
        this.voiceConfigPromise = null;
        this.actionCounter = 0;

        if (typeof window !== 'undefined') {
            window.addEventListener('online', () => {
                if (!this.room && !this.manualLeaveRequested) {
                    const token = this.getStoredReconnectionToken();
                    if (token) this.scheduleReconnect(token, this.game.account?.getStoredGameResumeState?.(), 0);
                }
            });
        }
    }

    async initClient() {
        if (this.client) return true;
        const ColyseusLib = globalThis.Colyseus || (typeof window !== 'undefined' ? window.Colyseus : undefined);
        if (!ColyseusLib) {
            console.error('Colyseus not available');
            return false;
        }
        const endpoint = this.getServerUrl();
        debugLog('[Network] Using server endpoint:', endpoint);
        this.client = new ColyseusLib.Client(endpoint);
        return true;
    }

    getServerUrl() {
        const fallbackUrl = "https://gamed.simplesoft.az";
        if (typeof window === 'undefined') return fallbackUrl;

        const override = this.getServerOverride();
        if (override) return override;

        const { hostname, host } = window.location;
        const isCapacitor = !!window.Capacitor;
        const isLocal = hostname === "localhost" || hostname === "127.0.0.1";

        if (isCapacitor) {
            return fallbackUrl;
        }

        if (isLocal && host !== "localhost:2567" && host !== "127.0.0.1:2567") {
            return "http://localhost:2567";
        }
        return fallbackUrl;
    }

    getServerOverride() {
        if (typeof window === 'undefined') return null;

        const isLocalHost = (hostname) => hostname === 'localhost' || hostname === '127.0.0.1';
        const isTrustedHost = (hostname) => {
            const host = String(hostname || '').toLowerCase();
            return isLocalHost(host)
                || host === 'gamed.simplesoft.az'
                || host === 'apid.simplesoft.az'
                || host === 'admind.simplesoft.az';
        };

        try {
            const params = new URLSearchParams(window.location.search);
            const queryValue = params.get("server");
            if (queryValue) {
                const normalized = this.normalizeServerUrl(queryValue);
                if (normalized && isTrustedHost(new URL(normalized).hostname)) return normalized;
            }

            const storedValue = window.localStorage?.getItem("dominoServerUrl");
            if (storedValue) {
                const normalized = this.normalizeServerUrl(storedValue);
                if (normalized && isTrustedHost(new URL(normalized).hostname)) return normalized;
                window.localStorage?.removeItem("dominoServerUrl");
            }
        } catch (e) {
            console.warn("Failed to read server override", e);
        }

        if (window.DOMINO_SERVER_URL) {
            const normalized = this.normalizeServerUrl(window.DOMINO_SERVER_URL);
            if (normalized && isTrustedHost(new URL(normalized).hostname)) return normalized;
        }

        return null;
    }

    normalizeServerUrl(value) {
        if (!value) return null;
        const raw = String(value).trim();
        if (!raw) return null;

        const isLocalHost = (hostname) => hostname === 'localhost' || hostname === '127.0.0.1';
        const normalizeFromUrl = (input) => {
            const parsed = new URL(input);
            if (parsed.protocol === 'ws:') parsed.protocol = 'http:';
            if (parsed.protocol === 'wss:') parsed.protocol = 'https:';
            if (parsed.protocol === 'http:' && !isLocalHost(parsed.hostname)) {
                parsed.protocol = 'https:';
            }
            return parsed.toString();
        };

        if (/^[a-z]+:\/\//i.test(raw)) {
            try {
                return normalizeFromUrl(raw);
            } catch {
                return null;
            }
        }

        try {
            return normalizeFromUrl(`https://${raw}`);
        } catch {
            return null;
        }
    }

    getStoredReconnectionToken() {
        try {
            return window.localStorage?.getItem(this.reconnectionTokenKey) || "";
        } catch {
            return "";
        }
    }

    setStoredReconnectionToken(token) {
        try {
            if (token) window.localStorage?.setItem(this.reconnectionTokenKey, token);
            else window.localStorage?.removeItem(this.reconnectionTokenKey);
        } catch {}
    }

    isSeatReservationExpired(error) {
        const text = String(error?.message || error || '').toLowerCase();
        const code = Number(error?.code || error?.status || 0);
        return code === 524 || text.includes('seat reservation expired');
    }

    clearReconnectState() {
        this.clearReconnectTimer();
        this.reconnectAttempt = 0;
        this.reconnectInProgress = false;
    }

    hostGame(onReady, onError, extraOptions = {}) {
        this.connect("create", onReady, onError, null, extraOptions);
    }

    joinGame(code, onReady, onError) {
        this.connect("join", onReady, onError, code);
    }

    buildJoinOptions(extra = {}) {
        return {
            name: extra.name || this.game.getOnlineDisplayName?.() || this.game.playerName,
            authToken: this.game.account?.getRoomAuthToken?.() || '',
            avatarUrl: this.game.accountProfile?.avatarUrl
                || this.game.accountProfile?.image
                || this.game.accountProfile?.providerImage
                || '',
            isTeamMode: this.game.isTeamMode,
            playerCount: this.game.onlinePlayerCount,
            aiCount: this.game.onlineAiCount,
            roomVisibility: this.game.onlineRoomVisibility === "open" ? "open" : "closed",
            stakeKey: this.game.onlineStakeKey || "stake_200",
            instantWinEnabled: document.getElementById('instant-win-setting')?.checked,
            dlossThreshold: parseInt(document.getElementById('dloss-setting')?.value || '255', 10),
            ...extra
        };
    }

    clearReconnectTimer() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
    }

    activateRoom(room, { isHost = false, isGuest = false, notifyReconnect = false } = {}) {
        this.clearReconnectTimer();
        this.room = room;
        this.isMultiplayer = true;
        this.isHost = isHost;
        this.isGuest = isGuest;
        this.manualLeaveRequested = false;
        this.reconnectAttempt = 0;
        this.reconnectInProgress = false;
        if (this.room?.reconnectionToken) {
            this.setStoredReconnectionToken(this.room.reconnectionToken);
        }
        this.setupListeners();
        void this.game?.voice?.prefetchIceConfig?.();
        setTimeout(() => {
            this.game?.requestRealtimeSync?.('room-activated');
        }, 0);
        if (notifyReconnect) {
            this.game.onNetworkReconnected?.();
        }
        return this.room.roomId || this.room.id;
    }

    getLocalTurnVersion() {
        const gameTurnVersion = Number(this.game?.turnVersion || 0);
        if (gameTurnVersion > 0) return gameTurnVersion;
        return Number(this.room?.state?.turnVersion || 0);
    }

    async resolveRoomId(code) {
        const roomCode = String(code || '').trim().toUpperCase();
        if (!roomCode) return null;
        const endpoint = this.getServerUrl().replace(/\/$/, '');
        try {
            const response = await fetch(`${endpoint}/room-id/${encodeURIComponent(roomCode)}`);
            if (!response.ok) return null;
            const data = await response.json();
            return data?.roomId || null;
        } catch (e) {
            console.warn('Failed to resolve room code:', e);
            return null;
        }
    }

    async resolveRoomCode(roomId) {
        const id = String(roomId || '').trim();
        if (!id) return null;
        const endpoint = this.getServerUrl().replace(/\/$/, '');
        try {
            const response = await fetch(`${endpoint}/room-code/${encodeURIComponent(id)}`);
            if (!response.ok) return null;
            const data = await response.json();
            return data?.roomCode || null;
        } catch (e) {
            console.warn('Failed to resolve room id:', e);
            return null;
        }
    }

    async connect(mode, onReady, onError, roomId = null, extraOptions = {}) {
        const initialized = await this.initClient();
        if (!initialized) {
            if (onError) onError('Colyseus not loaded');
            return;
        }
        try {
            this.manualLeaveRequested = false;
            this.clearReconnectTimer();
            const options = this.buildJoinOptions(extraOptions);

            debugLog("[CLIENT_DEBUG] network:connect", {
                mode,
                roomId: roomId || "",
                roomVisibility: options.roomVisibility,
                stakeKey: options.stakeKey,
                playerCount: options.playerCount,
                aiCount: options.aiCount,
                isTeamMode: options.isTeamMode,
                hasAuthToken: Boolean(options.authToken)
            });
            debugLog(`Connecting to ${mode}...`);
            let room;
            if (mode === "create") {
                room = await this.client.create("domino", options);
            } else {
                const resolvedRoomId = await this.resolveRoomId(roomId);
                if (!resolvedRoomId) {
                    throw new Error('Room not found or server unavailable');
                }
                room = await this.client.joinById(resolvedRoomId, options);
            }

            const connectedRoomId = this.activateRoom(room, {
                isHost: mode === "create",
                isGuest: mode !== "create"
            });
            debugLog("Connected! Room ID:", connectedRoomId);
            this.game.resetOnlineCoinSummary?.();
            if (onReady) onReady(connectedRoomId);
            if (mode === "create") {
                this.resolveRoomCode(connectedRoomId).then((inviteCode) => {
                    if (inviteCode) {
                        this.game.onInviteCodeResolved?.(inviteCode);
                    }
                });
            }

        } catch (e) {
            console.error("Connection error:", e);
            if (onError) onError(e.message);
        }
    }

    setupListeners() {
        if (!this.room) return;

        this.room.onMessage("room_state", (roomState) => {
            debugLog("[CLIENT_DEBUG] room_state received", {
                roomId: roomState?.roomId,
                roomCode: roomState?.roomCode,
                roomVisibility: roomState?.roomVisibility,
                gameActive: roomState?.gameActive,
                seatSelectionRequired: roomState?.seatSelectionRequired,
                currentPlayers: roomState?.currentPlayers,
                humanPlayers: roomState?.humanPlayers,
                humanSeats: roomState?.humanSeats,
                aiCount: roomState?.aiCount,
                totalPlayers: roomState?.totalPlayers,
                players: Array.isArray(roomState?.players)
                    ? roomState.players.map((player) => ({
                        sessionId: player?.sessionId || "",
                        seatIndex: Number.isInteger(Number(player?.seatIndex)) ? Number(player.seatIndex) : -1,
                        isBot: Boolean(player?.isBot),
                        isConnected: Boolean(player?.isConnected),
                        hasUserId: Boolean(String(player?.userId || "").trim()),
                        hasPlayerId: Boolean(String(player?.playerId || "").trim())
                    }))
                    : []
            });
            this.game.onRoomStateUpdate(roomState);
        });

        // Listen for state changes (the schema)
        this.room.onStateChange((state) => {
            if (this.game?.shouldProcessSchemaState?.(state) !== false) {
                this.game.onNetworkStateUpdate(state);
            }
        });

        // Listen for discrete messages
        this.room.onMessage("full_state", (payload) => {
            this.game.onNetworkFullState?.(payload);
        });

        this.room.onMessage("game_delta", (payload) => {
            this.game.onNetworkGameDelta?.(payload);
        });

        this.room.onMessage("action_ack", (payload) => {
            this.game.onNetworkActionAck?.(payload);
        });

        this.room.onMessage("hand", (handData) => {
            this.game.onNetworkHandUpdate(handData);
        });

        this.room.onMessage("turn_info", (info) => {
            this.game.onNetworkTurnInfo(info);
        });

        this.room.onMessage("reaction", (payload) => {
            this.game.onNetworkReaction(payload);
        });

        this.room.onMessage("gift", (payload) => {
            this.game.onNetworkGift?.(payload);
        });

        this.room.onMessage("voice_signal", (payload) => {
            this.game.onNetworkVoiceSignal?.(payload);
        });

        this.room.onMessage("msg", (msg) => {
            debugLog("[CLIENT_DEBUG] msg received", {
                key: msg?.key || "",
                time: Number(msg?.time || 0),
                hasValues: Boolean(msg?.values && Object.keys(msg.values).length)
            });
            this.game.renderer.showMessage(this.game.resolveUiMessage?.(msg) || msg.text || "", msg.time);
        });

        this.room.onMessage("sound", (name) => {
            this.game.playSound(name);
        });

        this.room.onMessage("score_popup", (score) => {
            this.game.renderer.showScorePopup(score);
        });

        this.room.onMessage("deal_end", (data) => {
            this.game.onNetworkDealEnd(data);
        });

        this.room.onMessage("round_end", (data) => {
            this.game.onNetworkRoundEnd(data);
        });

        this.room.onMessage("room_closed", (payload) => {
            debugLog("[CLIENT_DEBUG] room_closed received", payload || {});
            this.game.onRoomClosed(payload);
        });

        this.room.onLeave((code) => {
            debugLog("Left room, code:", code);
            const token = this.room?.reconnectionToken || this.getStoredReconnectionToken();
            const snapshot = this.game.account?.getStoredGameResumeState?.();
            const shouldReconnect = !this.manualLeaveRequested && Boolean(token);

            if (shouldReconnect) {
                this.lastAccidentalDisconnectAt = Date.now();
                this.game.onNetworkDisconnected?.({ code, reconnecting: true });
                this.room = null;
                this.scheduleReconnect(token, snapshot);
                return;
            }

            this.isMultiplayer = false;
            this.isHost = false;
            this.isGuest = false;
            this.room = null;
            this.manualLeaveRequested = false;
        });

        this.room.onError((code, message) => {
            if (this.isSeatReservationExpired({ code, message })) {
                debugLog("[CLIENT_DEBUG] room_error_seat_reservation_expired", { code, message });
                this.setStoredReconnectionToken('');
                this.clearReconnectState();
                return;
            }
            console.error("Room error:", code, message);
        });
    }

    leaveRoom({ explicit = false, reason = "menu" } = {}) {
        debugLog("[CLIENT_DEBUG] network:leaveRoom", {
            hasRoom: Boolean(this.room),
            explicit,
            manualLeaveRequested: this.manualLeaveRequested,
            reconnectInProgress: this.reconnectInProgress
        });
        this.lastNetworkLeaveRoomExplicit = Boolean(explicit);
        this.manualLeaveRequested = true;
        this.clearReconnectTimer();
        this.clearReconnectState();
        if (this.room) {
            const shouldSendExplicitLeave = Boolean(explicit && (this.room?.state?.gameActive || this.game?.gameActive));
            if (shouldSendExplicitLeave) {
                this.lastExplicitLeaveSentAt = Date.now();
                try {
                    this.room.send("explicit_leave", {
                        reason: String(reason || "menu").trim() || "menu",
                        ts: this.lastExplicitLeaveSentAt
                    });
                } catch (error) {
                    console.warn("[Network] Failed to send explicit leave marker:", error);
                }
            }
            this.room.leave(explicit);
        }
        this.room = null;
        this.isMultiplayer = false;
        this.isHost = false;
        this.isGuest = false;
    }

    async resumeRoom(reconnectionToken, snapshot = null) {
        const token = String(reconnectionToken || "").trim();
        if (!token) {
            throw new Error("Missing reconnection token");
        }
        debugLog("[CLIENT_DEBUG] network:reconnect", {
            hasSnapshot: Boolean(snapshot),
            tokenLength: token.length
        });
        const initialized = await this.initClient();
        if (!initialized) {
            throw new Error("Colyseus not loaded");
        }

        this.manualLeaveRequested = false;
        this.clearReconnectTimer();

        try {
            const room = await this.client.reconnect(token);
            this.activateRoom(room, { isHost: false, isGuest: true, notifyReconnect: true });
            return this.room;
        } catch (reconnectError) {
            if (this.isSeatReservationExpired(reconnectError)) {
                this.setStoredReconnectionToken('');
                this.clearReconnectState();
                const restoredRoom = await this.restoreRoomFromSnapshot(snapshot, '').catch(() => null);
                if (restoredRoom) return restoredRoom;
                throw reconnectError;
            }
            const restoredRoom = await this.restoreRoomFromSnapshot(snapshot, token).catch(() => null);
            if (restoredRoom) return restoredRoom;
            throw reconnectError;
        }
    }

    getDisconnectDebugState() {
        return {
            lastNetworkLeaveRoomExplicit: this.lastNetworkLeaveRoomExplicit,
            lastExplicitLeaveSentAt: Number(this.lastExplicitLeaveSentAt || 0) || 0,
            lastAccidentalDisconnectAt: Number(this.lastAccidentalDisconnectAt || 0) || 0
        };
    }

    async restoreRoomFromSnapshot(snapshot, reconnectionToken) {
        const roomCode = String(snapshot?.roomCode || '').trim().toUpperCase();
        const restoreSessionId = String(snapshot?.sessionId || '').trim();
        if (!roomCode || !restoreSessionId) return null;
        debugLog("[CLIENT_DEBUG] network:restoreFromSnapshot", {
            roomId: String(snapshot?.roomId || "").trim(),
            roomCode,
            restoreSessionId: restoreSessionId ? "***" : "",
            hasReconnectionToken: Boolean(String(reconnectionToken || "").trim())
        });

        const options = this.buildJoinOptions({
            name: snapshot.playerName || this.game.playerName,
            restoreRoomCode: roomCode,
            restoreRoomId: String(snapshot.roomId || '').trim(),
            restoreSessionId,
            restoreReconnectionToken: reconnectionToken
        });

        let room = null;
        const resolvedRoomId = await this.resolveRoomId(roomCode).catch(() => null);
        if (resolvedRoomId) {
            room = await this.client.joinById(resolvedRoomId, options).catch(() => null);
        }
        if (!room) {
            room = await this.client.create("domino", options);
        }

        this.activateRoom(room, { isHost: false, isGuest: true, notifyReconnect: true });
        return this.room;
    }

    scheduleReconnect(token, snapshot = null, delayOverride = null) {
        const nextToken = String(token || '').trim();
        if (!nextToken || this.manualLeaveRequested) return;
        if (this.reconnectTimer || this.reconnectInProgress) return;

        const delay = delayOverride ?? 1000;
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            void this.tryReconnect(nextToken, snapshot || this.game.account?.getStoredGameResumeState?.());
        }, delay);
    }

    async tryReconnect(token, snapshot = null) {
        if (this.manualLeaveRequested) return;
        if (typeof navigator !== 'undefined' && navigator.onLine === false) {
            this.scheduleReconnect(token, snapshot, 1500);
            return;
        }

        this.reconnectInProgress = true;
        this.reconnectAttempt += 1;
        try {
            await this.resumeRoom(token, snapshot || this.game.account?.getStoredGameResumeState?.());
        } catch (error) {
            this.reconnectInProgress = false;
            if (this.isSeatReservationExpired(error)) {
                this.setStoredReconnectionToken('');
                this.clearReconnectTimer();
                this.clearReconnectState();
                this.isMultiplayer = false;
                this.isHost = false;
                this.isGuest = false;
                this.room = null;
                this.game.onNetworkReconnectFailed?.(error);
                return;
            }
            console.warn("Reconnect failed:", error);
            if (this.reconnectAttempt < this.maxReconnectAttempts) {
                this.scheduleReconnect(token, snapshot);
            } else {
                this.isMultiplayer = false;
                this.isHost = false;
                this.isGuest = false;
                this.room = null;
                this.game.onNetworkReconnectFailed?.(error);
            }
        }
    }

    nextActionId(prefix = "act") {
        this.actionCounter += 1;
        return `${prefix}-${Date.now().toString(36)}-${this.actionCounter.toString(36)}`;
    }

    sendPlay(tileIndex, openEndIndex, actionId = this.nextActionId("play")) {
        if (this.room) this.room.send("play", {
            tileIndex,
            openEndIndex,
            turnVersion: this.getLocalTurnVersion(),
            actionId
        });
        return actionId;
    }

    sendDraw(actionId = this.nextActionId("draw")) {
        if (this.room) this.room.send("draw", {
            turnVersion: this.getLocalTurnVersion(),
            actionId
        });
        return actionId;
    }

    sendPass(actionId = this.nextActionId("pass")) {
        if (this.room) this.room.send("pass", {
            turnVersion: this.getLocalTurnVersion(),
            actionId
        });
        return actionId;
    }

    sendGosha(actionId = this.nextActionId("gosha")) {
        if (this.room) this.room.send("gosha", {
            turnVersion: this.getLocalTurnVersion(),
            actionId
        });
        return actionId;
    }

    sendNextDeal() {
        if (this.room) this.room.send("next_deal", { turnVersion: this.getLocalTurnVersion() });
    }

    sendChooseSeat(seatIndex) {
        debugLog("[CLIENT_DEBUG] seat selection action", {
            seatIndex: Number(seatIndex)
        });
        if (this.room) this.room.send("choose_seat", {
            seatIndex: Number(seatIndex)
        });
    }

    sendReaction(type) {
        if (this.room) this.room.send("reaction", { type });
    }

    sendGift(payload) {
        if (this.room) this.room.send("gift", payload || {});
    }

    sendVoiceSignal(payload) {
        if (this.room) this.room.send("voice_signal", payload || {});
    }

    sendSyncRequest() {
        if (this.room) this.room.send("sync_request", {});
    }

    async getVoiceConfig() {
        if (this.voiceConfig) return this.voiceConfig;
        if (this.voiceConfigPromise) return this.voiceConfigPromise;

        this.voiceConfigPromise = (async () => {
            const endpoint = this.getServerUrl().replace(/\/$/, "");
            const fallback = {
                iceServers: [
                    { urls: ["stun:stun.l.google.com:19302"] },
                    { urls: ["stun:global.stun.twilio.com:3478"] }
                ],
                iceTransportPolicy: "all",
                iceCandidatePoolSize: 2,
                hasTurn: false
            };

            try {
                const response = await fetch(`${endpoint}/api/voice/config`, {
                    method: "GET",
                    credentials: "include",
                    headers: { Accept: "application/json" }
                });
                if (!response.ok) return fallback;
                const data = await response.json().catch(() => null);
                if (!data || !Array.isArray(data.iceServers) || !data.iceServers.length) return fallback;
                const normalized = {
                    iceServers: data.iceServers
                        .map((server) => ({
                            urls: Array.isArray(server?.urls)
                                ? server.urls.map((url) => String(url || "").trim()).filter(Boolean)
                                : [],
                            ...(server?.username ? { username: String(server.username).trim() } : {}),
                            ...(server?.credential ? { credential: String(server.credential).trim() } : {})
                        }))
                        .filter((server) => server.urls.length > 0),
                    iceTransportPolicy: String(data.iceTransportPolicy || "all").trim() || "all",
                    iceCandidatePoolSize: Number(data.iceCandidatePoolSize || 2) || 2,
                    hasTurn: Boolean(data.hasTurn)
                };
                this.voiceConfig = normalized;
                return normalized;
            } catch (error) {
                console.warn("[Network] Voice config fetch failed:", error);
                return fallback;
            } finally {
                this.voiceConfigPromise = null;
            }
        })();

        return this.voiceConfigPromise;
    }
  }

// Make available globally for ES modules
if (typeof window !== 'undefined') {
    window.NetworkManager = NetworkManager;
}
