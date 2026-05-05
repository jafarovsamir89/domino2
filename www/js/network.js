// js/network.js
// Networking using Colyseus 0.17

class NetworkManager {
    constructor(game) {
        this.game = game;
        this.client = null;
        this.room = null;
        this.isMultiplayer = false;
        this.isHost = false;
        this.isGuest = false;
    }

    async initClient() {
        if (this.client) return true;
        const ColyseusLib = globalThis.Colyseus || (typeof window !== 'undefined' ? window.Colyseus : undefined);
        if (!ColyseusLib) {
            console.error('Colyseus not available');
            return false;
        }
        const endpoint = this.getServerUrl();
        console.log('[Network] Using server endpoint:', endpoint);
        this.client = new ColyseusLib.Client(endpoint);
        return true;
    }

    getServerUrl() {
        const fallbackUrl = "http://34.28.23.216:2567";
        if (typeof window === 'undefined') return fallbackUrl;

        const override = this.getServerOverride();
        if (override) return override;

        const { protocol, hostname, host } = window.location;
        const isCapacitor = !!window.Capacitor;
        const isLocal = hostname === "localhost" || hostname === "127.0.0.1";

        if (isCapacitor) {
            return fallbackUrl;
        }

        if (isLocal && host !== "localhost:2567" && host !== "127.0.0.1:2567") {
            return "http://localhost:2567";
        }
        return `${protocol}//${host}`;
    }

    getServerOverride() {
        if (typeof window === 'undefined') return null;

        try {
            const params = new URLSearchParams(window.location.search);
            const queryValue = params.get("server");
            if (queryValue) return this.normalizeServerUrl(queryValue);

            const storedValue = window.localStorage?.getItem("dominoServerUrl");
            if (storedValue) return this.normalizeServerUrl(storedValue);
        } catch (e) {
            console.warn("Failed to read server override", e);
        }

        if (window.DOMINO_SERVER_URL) {
            return this.normalizeServerUrl(window.DOMINO_SERVER_URL);
        }

        return null;
    }

    normalizeServerUrl(value) {
        if (!value) return null;
        if (value.startsWith("http://") || value.startsWith("https://")) return value;
        if (value.startsWith("ws://")) return `http://${value.slice("ws://".length)}`;
        if (value.startsWith("wss://")) return `https://${value.slice("wss://".length)}`;
        return `http://${value}`;
    }

    hostGame(onReady, onError) {
        this.connect("create", onReady, onError);
    }

    joinGame(code, onReady, onError) {
        this.connect("join", onReady, onError, code);
    }

    async resolveRoomId(code) {
        const roomCode = String(code || '').trim().toUpperCase();
        if (!roomCode) return null;
        const endpoint = this.getServerUrl().replace(/\/$/, '');
        try {
            const response = await fetch(`${endpoint}/room-id/${encodeURIComponent(roomCode)}`);
            if (!response.ok) return roomCode;
            const data = await response.json();
            return data?.roomId || roomCode;
        } catch (e) {
            console.warn('Failed to resolve room code:', e);
            return roomCode;
        }
    }

    async connect(mode, onReady, onError, roomId = null) {
        const initialized = await this.initClient();
        if (!initialized) {
            if (onError) onError('Colyseus not loaded');
            return;
        }
        try {
            const options = {
                name: this.game.playerName,
                isTeamMode: this.game.isTeamMode,
                playerCount: this.game.onlinePlayerCount,
                aiCount: this.game.onlineAiCount,
                instantWinEnabled: document.getElementById('instant-win-setting')?.checked,
                dlossThreshold: parseInt(document.getElementById('dloss-setting')?.value || '255', 10)
            };

            console.log(`Connecting to ${mode}...`);
            if (mode === "create") {
                this.room = await this.client.create("domino", options);
                this.isHost = true;
                this.isGuest = false;
            } else {
                const resolvedRoomId = await this.resolveRoomId(roomId);
                this.room = await this.client.joinById(resolvedRoomId, options);
                this.isHost = false;
                this.isGuest = true;
            }

            const connectedRoomId = this.room.roomId || this.room.id;
            console.log("Connected! Room ID:", connectedRoomId);
            this.isMultiplayer = true;
            this.setupListeners();
            if (onReady) onReady(connectedRoomId);

        } catch (e) {
            console.error("Connection error:", e);
            if (onError) onError(e.message);
        }
    }

    setupListeners() {
        if (!this.room) return;

        this.room.onMessage("room_state", (roomState) => {
            this.game.onRoomStateUpdate(roomState);
        });

        // Listen for state changes (the schema)
        this.room.onStateChange((state) => {
            this.game.onNetworkStateUpdate(state);
        });

        // Listen for discrete messages
        this.room.onMessage("hand", (handData) => {
            this.game.onNetworkHandUpdate(handData);
        });

        this.room.onMessage("turn_info", (info) => {
            this.game.onNetworkTurnInfo(info);
        });

        this.room.onMessage("reaction", (payload) => {
            this.game.onNetworkReaction(payload);
        });

        this.room.onMessage("msg", (msg) => {
            this.game.renderer.showMessage(msg.text, msg.time);
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
            this.game.onRoomClosed(payload);
        });

        this.room.onLeave((code) => {
            console.log("Left room, code:", code);
            this.isMultiplayer = false;
            this.isHost = false;
            this.isGuest = false;
            this.room = null;
        });

        this.room.onError((code, message) => {
            console.error("Room error:", code, message);
        });
    }

    leaveRoom() {
        if (this.room) {
            this.room.leave();
        }
        this.room = null;
        this.isMultiplayer = false;
        this.isHost = false;
        this.isGuest = false;
    }

    sendPlay(tileIndex, openEndIndex) {
        if (this.room) this.room.send("play", { tileIndex, openEndIndex });
    }

    sendDraw() {
        if (this.room) this.room.send("draw");
    }

    sendPass() {
        if (this.room) this.room.send("pass");
    }

    sendGosha() {
        if (this.room) this.room.send("gosha");
    }

    sendNextDeal() {
        if (this.room) this.room.send("next_deal");
    }

    sendReaction(type) {
        if (this.room) this.room.send("reaction", { type });
    }
}

// Make available globally for ES modules
if (typeof window !== 'undefined') {
    window.NetworkManager = NetworkManager;
}
