const ACCOUNT_PROFILE_KEY = "dominoAuthProfile";
const PLATFORM_GAME_TOKEN_KEY = "dominoPlatformGameToken";
const PLATFORM_PROFILE_KEY = "dominoPlatformProfile";
const LOCAL_GAME_SESSION_KEY = "dominoLocalGameSessionId";
const GAME_RESUME_STATE_KEY = "dominoGameResumeState";
const DOMINO_ENDPOINTS = globalThis.DOMINO_ENDPOINTS || {
    API_BASE: "https://apid.simplesoft.az/api",
    GAME_HTTP_BASE: "https://gamed.simplesoft.az",
    GAME_WS_URL: "wss://gamed.simplesoft.az"
};

function safeJsonParse(value) {
    try {
        return value ? JSON.parse(value) : null;
    } catch {
        return null;
    }
}

function sanitizeName(value) {
    return String(value || "Player")
        .replace(/<[^>]*>/g, " ")
        .replace(/[^\p{L}\p{N} _.-]/gu, "")
        .trim()
        .slice(0, 24) || "Player";
}

function sanitizeEmail(value, fallbackName = "player") {
    const raw = String(value || "").trim();
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
    if (emailPattern.test(raw)) return raw.slice(0, 254);
    const alias = sanitizeName(fallbackName).toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.+|\.+$/g, "") || "player";
    return `${alias}@domino.local`;
}

function getFirstNameDisplayName(value, fallback = "Player") {
    const normalized = sanitizeName(value, "").trim();
    if (!normalized) return sanitizeName(fallback, "Player");
    const firstToken = normalized.split(/\s+/).find(Boolean);
    const candidate = sanitizeName(firstToken || fallback, "Player");
    const lowered = candidate.toLowerCase();
    if (!candidate || lowered === "undefined" || lowered === "null" || lowered === "nan") {
        return sanitizeName(fallback, "Player");
    }
    return candidate;
}

function createLocalSessionId() {
    if (window.crypto?.randomUUID) {
        return window.crypto.randomUUID();
    }
    const bytes = window.crypto?.getRandomValues ? window.crypto.getRandomValues(new Uint8Array(16)) : null;
    if (bytes) {
        const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
        return `local-${hex}`;
    }
    return `local-${Date.now().toString(36)}-${Math.floor(performance.now() * 1000).toString(36)}`;
}

function normalizeProfile(payload = {}, source = "legacy") {
    const user = payload.user || payload;
    const player = payload.player || null;
    const stats = payload.stats || payload.player?.stats || null;
    const ratingsPayload = payload.ratings || payload.player?.ratings || null;
    const wallet = payload.wallet || payload.player?.wallet || null;
    const displayName = sanitizeName(
        payload.profile?.name ||
        player?.displayName ||
        user?.name ||
        payload.displayName ||
        payload.name ||
        "Player"
    );

    const normalizeRatingBucket = (bucket, fallback = null, fallbackTitleCode = "rookie") => {
        const seed = bucket || fallback || {};
        const rating = Number(seed.rating ?? 1000);
        return {
            rating,
            points: Number(seed.points ?? 0),
            wins: Number(seed.wins ?? 0),
            losses: Number(seed.losses ?? 0),
            draws: Number(seed.draws ?? 0),
            matchesPlayed: Number(seed.matchesPlayed ?? 0),
            currentStreak: Number(seed.currentStreak ?? 0),
            bestStreak: Number(seed.bestStreak ?? 0),
            titleCode: String(seed.titleCode ?? fallbackTitleCode ?? "rookie").trim() || "rookie"
        };
    };

    const normalizedStats = stats ? {
        rating: Number(stats.rating ?? payload.rating ?? 1000),
        points: Number(stats.points ?? payload.points ?? 0),
        wins: Number(stats.wins ?? payload.wins ?? 0),
        losses: Number(stats.losses ?? payload.losses ?? 0),
        draws: Number(stats.draws ?? payload.draws ?? 0),
        matchesPlayed: Number(stats.matchesPlayed ?? payload.matchesPlayed ?? 0),
        currentStreak: Number(stats.currentStreak ?? payload.currentStreak ?? 0),
        bestStreak: Number(stats.bestStreak ?? payload.bestStreak ?? 0),
        titleCode: String(stats.titleCode ?? payload.titleCode ?? payload.title ?? "rookie").trim() || "rookie"
    } : null;
    const normalizedRatings = {
        telefon: normalizeRatingBucket(
            ratingsPayload?.telefon || normalizedStats || stats || null,
            normalizedStats || stats || null,
            normalizedStats?.titleCode || stats?.titleCode || payload.titleCode || payload.title || "rookie"
        ),
        classic101: normalizeRatingBucket(
            ratingsPayload?.classic101 || payload.classic101Stats || null,
            null,
            "rookie"
        )
    };
    const walletBalance = Number(wallet?.balance ?? payload.coins ?? payload.balance ?? 0);
    const titleCode = String(payload.titleCode || normalizedRatings.telefon?.titleCode || normalizedStats?.titleCode || payload.title || "rookie").trim() || "rookie";

    const profile = {
        id: String(player?.id || user?.id || payload.id || ""),
        userId: String(user?.id || payload.userId || payload.id || ""),
        playerId: String(player?.id || payload.playerId || payload.id || ""),
        sessionId: String(payload.sessionId || payload.guestSessionId || player?.sessionId || user?.sessionId || ""),
        name: displayName,
        displayName,
        email: String(user?.email || payload.email || ""),
        image: player?.avatarUrl || payload.avatarUrl || user?.image || payload.image || null,
        providerImage: user?.image || payload.providerImage || null,
        avatarUrl: player?.avatarUrl || payload.avatarUrl || null,
        role: String(user?.role || payload.role || "player"),
        isGuest: Boolean(payload.isGuest || player?.isGuest || user?.isGuest),
        avatarSeed: player?.avatarSeed || payload.avatarSeed || null,
        tableSkinKey: player?.tableSkinKey || payload.tableSkinKey || null,
        language: player?.language || payload.language || null,
        gameDisplayName: getFirstNameDisplayName(displayName, displayName),
        rating: normalizedRatings.telefon?.rating ?? normalizedStats?.rating ?? Number(payload.rating ?? 1000),
        points: normalizedRatings.telefon?.points ?? normalizedStats?.points ?? Number(payload.points ?? 0),
        wins: normalizedRatings.telefon?.wins ?? normalizedStats?.wins ?? Number(payload.wins ?? 0),
        losses: normalizedRatings.telefon?.losses ?? normalizedStats?.losses ?? Number(payload.losses ?? 0),
        draws: normalizedRatings.telefon?.draws ?? normalizedStats?.draws ?? Number(payload.draws ?? 0),
        matchesPlayed: normalizedRatings.telefon?.matchesPlayed ?? normalizedStats?.matchesPlayed ?? Number(payload.matchesPlayed ?? 0),
        currentStreak: normalizedRatings.telefon?.currentStreak ?? normalizedStats?.currentStreak ?? Number(payload.currentStreak ?? 0),
        bestStreak: normalizedRatings.telefon?.bestStreak ?? normalizedStats?.bestStreak ?? Number(payload.bestStreak ?? 0),
        titleCode,
        ratings: normalizedRatings,
        coins: walletBalance,
        wallet: wallet ? {
            ...wallet,
            balance: walletBalance,
            availableBalance: Number(wallet.availableBalance ?? walletBalance),
            spendableBalance: Number(wallet.spendableBalance ?? walletBalance),
            reservedBalance: Number(wallet.reservedBalance ?? wallet.reserved ?? 0)
        } : null,
        recentMatches: Array.isArray(payload.recentMatches) ? payload.recentMatches : [],
        provider: source
    };

    return {
        profile,
        user: payload.user || null,
        player: payload.player || null,
        stats: normalizedStats,
        recentMatches: profile.recentMatches,
        session: payload.session || null,
        token: payload.token || null
    };
}

export class AccountClient {
    constructor(getServerUrl) {
        this.getServerUrl = getServerUrl;
        this.lastError = "";
    }

    get apiBase() {
        return String(DOMINO_ENDPOINTS.API_BASE || "https://apid.simplesoft.az/api").replace(/\/$/, "");
    }

    get platformApiBase() {
        try {
            if (window.DOMINO_PLATFORM_API_URL) {
                return String(window.DOMINO_PLATFORM_API_URL).replace(/\/$/, "");
            }

            if (window.Capacitor) {
                return this.apiBase;
            }

            const { hostname } = window.location;
            if (hostname === "localhost" || hostname === "127.0.0.1") {
                return "http://localhost:3000/api";
            }

            return this.apiBase;
        } catch {
            return "http://localhost:3000/api";
        }
    }

    getStoredProfile() {
        try {
            const raw = window.localStorage?.getItem(ACCOUNT_PROFILE_KEY);
            return safeJsonParse(raw);
        } catch {
            return null;
        }
    }

    setStoredProfile(profile) {
        try {
            if (profile) window.localStorage?.setItem(ACCOUNT_PROFILE_KEY, JSON.stringify(profile));
            else window.localStorage?.removeItem(ACCOUNT_PROFILE_KEY);
        } catch {}
    }

    get platformGameToken() {
        try {
            return window.localStorage?.getItem(PLATFORM_GAME_TOKEN_KEY) || "";
        } catch {
            return "";
        }
    }

    setPlatformGameToken(token) {
        try {
            if (token) window.localStorage?.setItem(PLATFORM_GAME_TOKEN_KEY, token);
            else window.localStorage?.removeItem(PLATFORM_GAME_TOKEN_KEY);
        } catch {}
    }

    setStoredToken(token) {
        this.setPlatformGameToken(token);
    }

    getStoredToken() {
        return this.platformGameToken;
    }

    getPlatformProfile() {
        try {
            const raw = window.localStorage?.getItem(PLATFORM_PROFILE_KEY);
            return safeJsonParse(raw);
        } catch {
            return null;
        }
    }

    setPlatformProfile(profile) {
        try {
            if (profile) window.localStorage?.setItem(PLATFORM_PROFILE_KEY, JSON.stringify(profile));
            else window.localStorage?.removeItem(PLATFORM_PROFILE_KEY);
        } catch {}
    }

    getLocalGameSessionId() {
        try {
            return window.localStorage?.getItem(LOCAL_GAME_SESSION_KEY) || "";
        } catch {
            return "";
        }
    }

    setLocalGameSessionId(sessionId) {
        try {
            if (sessionId) window.localStorage?.setItem(LOCAL_GAME_SESSION_KEY, sessionId);
            else window.localStorage?.removeItem(LOCAL_GAME_SESSION_KEY);
        } catch {}
    }

    getOrCreateLocalGameSessionId() {
        const current = this.getLocalGameSessionId();
        if (current) return current;
        const next = createLocalSessionId();
        this.setLocalGameSessionId(next);
        return next;
    }

    clearLocalGameSessionId() {
        this.setLocalGameSessionId("");
    }

    getStoredGameResumeState() {
        try {
            const raw = window.localStorage?.getItem(GAME_RESUME_STATE_KEY);
            return safeJsonParse(raw);
        } catch {
            return null;
        }
    }

    setStoredGameResumeState(state) {
        try {
            if (state) window.localStorage?.setItem(GAME_RESUME_STATE_KEY, JSON.stringify(state));
            else window.localStorage?.removeItem(GAME_RESUME_STATE_KEY);
        } catch {}
    }

    clearStoredGameResumeState() {
        this.setStoredGameResumeState(null);
    }

    clearSession() {
        this.setStoredProfile(null);
        this.setPlatformGameToken("");
        this.setPlatformProfile(null);
    }

    normalizeError(error) {
        if (!error) return "Server unavailable";
        const message = String(error.message || error || "").trim();
        if (!message) return "Server unavailable";
        if (message === "Failed to fetch" || message.includes("NetworkError") || message.includes("timed out")) {
            return "Server unavailable";
        }
        if (message === "signal is aborted without reason" || message === "The operation was aborted.") {
            return "Server unavailable";
        }
        return message;
    }

    async request(path, options = {}) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6000);
        try {
            const method = String(options.method || "GET").toUpperCase();
            const response = await fetch(`${this.apiBase}${path}`, {
                headers: {
                    "Content-Type": "application/json",
                    ...(options.headers || {})
                },
                ...options,
                signal: controller.signal,
                body: options.body && method !== "GET" && method !== "HEAD"
                    ? JSON.stringify(options.body)
                    : undefined
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(data.error || data.message || response.statusText || "Request failed");
            }
            this.lastError = "";
            return data;
        } catch (error) {
            const normalized = this.normalizeError(error);
            this.lastError = normalized;
            throw new Error(normalized);
        } finally {
            clearTimeout(timeoutId);
        }
    }

    async platformRequest(path, options = {}) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6000);
        try {
            const method = String(options.method || "GET").toUpperCase();
            const token = this.platformGameToken;
            const response = await fetch(`${this.platformApiBase}${path}`, {
                headers: {
                    "Content-Type": "application/json",
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                    ...(options.headers || {})
                },
                credentials: "include",
                ...options,
                signal: controller.signal,
                body: options.body && method !== "GET" && method !== "HEAD"
                    ? JSON.stringify(options.body)
                    : undefined
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(data.error || data.message || response.statusText || "Request failed");
            }
            this.lastError = "";
            return data;
        } catch (error) {
            const normalized = this.normalizeError(error);
            this.lastError = normalized;
            throw new Error(normalized);
        } finally {
            clearTimeout(timeoutId);
        }
    }

    async getPlatformStatus() {
        return this.platformRequest("/platform/status");
    }

    async bootstrap(mode = null) {
        const platformData = await this.syncPlatformSession(mode);
        if (platformData) {
            return platformData;
        }

        const existingToken = this.platformGameToken;
        const existingProfile = this.getPlatformProfile();
        if (existingToken && existingProfile) {
            console.log('[Auth Debug] bootstrap: cookie sync failed, using localStorage cached token and profile.');
            return {
                token: existingToken,
                profile: existingProfile
            };
        }

        this.setStoredToken("");
        this.setStoredProfile(null);
        this.setPlatformProfile(null);
        return null;
    }

    async syncPlatformSession(mode = null) {
        try {
            const token = this.platformGameToken;
            const selectedMode = String(mode || "").trim();
            const params = new URLSearchParams();
            if (selectedMode === "telefon" || selectedMode === "classic101") {
                params.set("mode", selectedMode);
            }
            const query = params.toString();
            const response = await fetch(`${this.platformApiBase}/platform/game-token${query ? `?${query}` : ""}`, {
                method: "GET",
                credentials: "include",
                headers: {
                    "Content-Type": "application/json",
                    ...(token ? { Authorization: `Bearer ${token}` } : {})
                }
            });

            if (!response.ok) {
                return null;
            }

            const data = await response.json();
            if (!data?.token) {
                return null;
            }

            const normalized = normalizeProfile(data, "better-auth");
            this.setPlatformGameToken(data.token);
            this.setPlatformProfile(normalized.profile);
            this.setStoredProfile(normalized.profile);
            return normalized;
        } catch {
            return null;
        }
    }

    async createGuest(name) {
        void name;
        throw new Error("Guest mode is disabled");
    }

    async sendLocalGameHeartbeat(payload) {
        try {
            const platformToken = this.platformGameToken;
            if (!platformToken) {
                return null;
            }
            const response = await fetch(`${this.platformApiBase}/realtime/heartbeat`, {
                method: "POST",
                credentials: "include",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${platformToken}`
                },
                body: JSON.stringify({
                    sessionId: this.getLocalGameSessionId() || payload?.sessionId || "",
                    provider: payload?.provider || "platform",
                    displayName: payload?.displayName || payload?.name || "Player",
                    roomId: payload?.roomId || null,
                    roomCode: payload?.roomCode || null,
                    gameMode: payload?.gameMode || "solo",
                    roomMode: payload?.roomMode || payload?.gameMode || "solo",
                    stakeKey: payload?.stakeKey || null,
                    stakeAmount: Number(payload?.stakeAmount || 0),
                    humanSeats: Number(payload?.humanSeats || 0),
                    totalPlayers: Number(payload?.totalPlayers || 0),
                    aiCount: Number(payload?.aiCount || 0),
                    isTeamMode: Boolean(payload?.isTeamMode),
                    isPlaying: payload?.isPlaying !== false,
                    isConnected: payload?.isConnected !== false,
                    source: "client-local"
                })
            });

            if (!response.ok) return null;
            return await response.json().catch(() => null);
        } catch {
            return null;
        }
    }

    async getRealtimeSession(sessionId) {
        const key = String(sessionId || "").trim();
        if (!key) return null;
        try {
            const data = await this.platformRequest(`/realtime/sessions/${encodeURIComponent(key)}`);
            return data?.item || null;
        } catch {
            return null;
        }
    }

    async getGameSession(sessionId) {
        const key = String(sessionId || "").trim();
        if (!key) return null;
        try {
            const data = await this.request(`/realtime/sessions/${encodeURIComponent(key)}`);
            return data?.item || null;
        } catch {
            return null;
        }
    }

    async getOpenRooms(filters = {}) {
        const params = new URLSearchParams();
        const entries = Object.entries(filters || {});
        for (const [key, value] of entries) {
            if (value === undefined || value === null || value === "") continue;
            params.set(key, String(value));
        }
        const query = params.toString();
        const data = await this.request(`/realtime/rooms${query ? `?${query}` : ""}`);
        return Array.isArray(data?.items) ? data.items : [];
    }

    async getFriends() {
        const data = await this.platformRequest("/social/friends");
        return {
            accepted: Array.isArray(data?.accepted) ? data.accepted : [],
            incoming: Array.isArray(data?.incoming) ? data.incoming : [],
            outgoing: Array.isArray(data?.outgoing) ? data.outgoing : [],
            items: Array.isArray(data?.items) ? data.items : []
        };
    }

    async submitFeedback(payload = {}) {
        return this.platformRequest("/social/feedback", {
            method: "POST",
            body: {
                message: payload?.message,
                category: payload?.category,
                contactEmail: payload?.contactEmail,
                locale: payload?.locale,
                appVersion: payload?.appVersion
            }
        });
    }

    async searchPlayers(query) {
        const q = String(query || "").trim();
        if (!q) {
            return [];
        }
        const data = await this.platformRequest(`/social/players/search?query=${encodeURIComponent(q)}`);
        return Array.isArray(data?.items) ? data.items : [];
    }

    async sendFriendRequest(playerId, note = "") {
        return this.platformRequest("/social/friends/request", {
            method: "POST",
            body: {
                playerId,
                note
            }
        });
    }

    async acceptFriendRequest(id) {
        return this.platformRequest(`/social/friends/${encodeURIComponent(id)}/accept`, {
            method: "POST"
        });
    }

    async declineFriendRequest(id) {
        return this.platformRequest(`/social/friends/${encodeURIComponent(id)}/decline`, {
            method: "POST"
        });
    }

    async cancelFriendRequest(id) {
        return this.platformRequest(`/social/friends/${encodeURIComponent(id)}/cancel`, {
            method: "POST"
        });
    }

    async removeFriend(id) {
        return this.platformRequest(`/social/friends/${encodeURIComponent(id)}/remove`, {
            method: "POST"
        });
    }

    async getRoomInvitations() {
        const data = await this.platformRequest("/social/invitations");
        return {
            incoming: Array.isArray(data?.incoming) ? data.incoming : [],
            sent: Array.isArray(data?.sent) ? data.sent : [],
            items: Array.isArray(data?.items) ? data.items : []
        };
    }

    async getPlayInvites() {
        const data = await this.platformRequest("/social/play-invites");
        const outgoing = Array.isArray(data?.outgoing) ? data.outgoing : [];
        return {
            incoming: Array.isArray(data?.incoming) ? data.incoming : [],
            outgoing,
            sent: outgoing,
            waiting: Array.isArray(data?.waiting) ? data.waiting : [],
            acceptedWaiting: Array.isArray(data?.acceptedWaiting) ? data.acceptedWaiting : Array.isArray(data?.waiting) ? data.waiting : [],
            items: Array.isArray(data?.items) ? data.items : []
        };
    }

    async getRealtimeSummary() {
        const data = await this.platformRequest("/realtime/summary");
        return data || null;
    }

    async getInbox(filters = {}) {
        const params = new URLSearchParams();
        const status = String(filters?.status || "").trim();
        const limit = Number(filters?.limit);
        if (status) params.set("status", status);
        if (Number.isFinite(limit) && limit > 0) params.set("limit", String(Math.trunc(limit)));
        const query = params.toString();
        const data = await this.platformRequest(`/social/inbox${query ? `?${query}` : ""}`);
        return {
            items: Array.isArray(data?.items) ? data.items : [],
            unreadCount: Number(data?.unreadCount || 0)
        };
    }

    async markInboxRead(id) {
        const key = String(id || "").trim();
        if (!key) throw new Error("Inbox item not found");
        return this.platformRequest(`/social/inbox/${encodeURIComponent(key)}/read`, {
            method: "POST"
        });
    }

    async claimInboxMessage(id) {
        const key = String(id || "").trim();
        if (!key) throw new Error("Inbox item not found");
        return this.platformRequest(`/social/inbox/${encodeURIComponent(key)}/claim`, {
            method: "POST"
        });
    }

    async deleteInboxMessage(id) {
        const key = String(id || "").trim();
        if (!key) throw new Error("Inbox item not found");
        return this.platformRequest(`/social/inbox/${encodeURIComponent(key)}/delete`, {
            method: "POST"
        });
    }

    getSocialSseUrl() {
        return `${this.platformApiBase}/social/sse`;
    }

    getSocialSocketBaseUrl() {
        const base = String(this.platformApiBase || "").replace(/\/api\/?$/, "");
        return base || String(this.platformApiBase || "").replace(/\/api$/, "");
    }

    getSocialSocketUrl() {
        return `${this.getSocialSocketBaseUrl()}/social`;
    }

    getSocialSocketPath() {
        return "/api/socket.io";
    }

    getSocialSocketAuthToken() {
        return this.platformGameToken || "";
    }

    async getSocialSummary() {
        const data = await this.platformRequest("/social/summary");
        return {
            inboxUnreadCount: Number(data?.inboxUnreadCount || 0),
            chatUnreadCount: Number(data?.chatUnreadCount || 0),
            inviteUnreadCount: Number(data?.inviteUnreadCount || 0),
            friendRequestCount: Number(data?.friendRequestCount || 0),
            totalUnreadCount: Number(data?.totalUnreadCount || 0)
        };
    }

    async getCoinShopStatus() {
        const data = await this.platformRequest("/economy/coin-shop/status");
        return {
            ...(data || {}),
            wallet: data?.wallet || null,
            coinShop: data?.coinShop || {
                videoReward: { amount: 1000, cooldownMinutes: 30, dailyLimit: 6 },
                packs: []
            }
        };
    }

    async claimCoinShopVideoReward() {
        return this.platformRequest("/economy/coin-shop/video-reward", {
            method: "POST"
        });
    }

    async getGiftCatalog() {
        const data = await this.platformRequest("/social/gifts/catalog");
        return Array.isArray(data?.items) ? data.items : [];
    }

    async getGiftInventory() {
        const data = await this.platformRequest("/social/gifts/inventory");
        return {
            items: Array.isArray(data?.items) ? data.items : [],
            summary: data?.summary || { unique: 0, quantity: 0, exchangeValue: 0 }
        };
    }

    async getGiftHistory() {
        const data = await this.platformRequest("/social/gifts/history");
        return {
            sent: Array.isArray(data?.sent) ? data.sent : [],
            received: Array.isArray(data?.received) ? data.received : [],
            items: Array.isArray(data?.items) ? data.items : []
        };
    }

    async sendGift(payload = {}) {
        const body = payload && typeof payload === "object" ? payload : {};
        return this.platformRequest("/social/gifts/send", {
            method: "POST",
            body
        });
    }

    async exchangeGift(payload = {}) {
        const body = payload && typeof payload === "object" ? payload : {};
        return this.platformRequest("/social/gifts/exchange", {
            method: "POST",
            body
        });
    }

    async inviteFriendToRoom(roomId, payload = {}) {
        const body = payload && typeof payload === "object" ? payload : {};
        return this.platformRequest(`/social/rooms/${encodeURIComponent(roomId)}/invite`, {
            method: "POST",
            body
        });
    }

    async inviteFriendToPlay(payload = {}) {
        const body = payload && typeof payload === "object" ? payload : {};
        return this.platformRequest("/social/play-invites", {
            method: "POST",
            body
        });
    }

    async acceptPlayInvite(id) {
        return this.platformRequest(`/social/play-invites/${encodeURIComponent(id)}/accept`, {
            method: "POST"
        });
    }

    async declinePlayInvite(id) {
        return this.platformRequest(`/social/play-invites/${encodeURIComponent(id)}/decline`, {
            method: "POST"
        });
    }

    async cancelPlayInvite(id) {
        return this.platformRequest(`/social/play-invites/${encodeURIComponent(id)}/cancel`, {
            method: "POST"
        });
    }

    async attachPlayInviteRoom(payload = {}) {
        const body = payload && typeof payload === "object" ? payload : {};
        return this.platformRequest("/social/play-invites/attach-room", {
            method: "POST",
            body
        });
    }

    async markPlayInviteJoined(id, payload = {}) {
        const body = payload && typeof payload === "object" ? payload : {};
        return this.platformRequest(`/social/play-invites/${encodeURIComponent(id)}/joined`, {
            method: "POST",
            body
        });
    }

    async markPlayInviteFailedToJoin(id, payload = {}) {
        const body = payload && typeof payload === "object" ? payload : {};
        return this.platformRequest(`/social/play-invites/${encodeURIComponent(id)}/failed-to-join`, {
            method: "POST",
            body
        });
    }

    async acceptRoomInvitation(id) {
        return this.platformRequest(`/social/invitations/${encodeURIComponent(id)}/accept`, {
            method: "POST"
        });
    }

    async declineRoomInvitation(id) {
        return this.platformRequest(`/social/invitations/${encodeURIComponent(id)}/decline`, {
            method: "POST"
        });
    }

    async cancelRoomInvitation(id) {
        return this.platformRequest(`/social/invitations/${encodeURIComponent(id)}/cancel`, {
            method: "POST"
        });
    }

    async register(nameOrOptions, passwordMaybe) {
        const options = typeof nameOrOptions === "object" && nameOrOptions !== null
            ? nameOrOptions
            : { name: nameOrOptions, password: passwordMaybe };
        const displayName = sanitizeName(options.name || options.displayName || "Player");
        const email = sanitizeEmail(options.email || options.identifier || displayName, displayName);
        const password = String(options.password || passwordMaybe || "").trim();

        try {
            const data = await this.platformRequest("/auth/sign-up/email", {
                method: "POST",
                body: {
                    name: displayName,
                    email,
                    password,
                    callbackURL: "/dashboard",
                    rememberMe: true
                }
            });
            const normalized = await this.syncPlatformSession();
            return normalized || normalizeProfile(data.user || { name: displayName, email }, "better-auth");
        } catch (platformError) {
            throw platformError;
        }
    }

    async login(nameOrOptions, passwordMaybe) {
        const options = typeof nameOrOptions === "object" && nameOrOptions !== null
            ? nameOrOptions
            : { email: nameOrOptions, password: passwordMaybe };
        const displayName = sanitizeName(options.name || options.displayName || options.email || "Player");
        const email = sanitizeEmail(options.email || options.identifier || options.name || displayName, displayName);
        const password = String(options.password || passwordMaybe || "").trim();

        try {
            const data = await this.platformRequest("/auth/sign-in/email", {
                method: "POST",
                body: {
                    email,
                    password,
                    rememberMe: true,
                    callbackURL: "/dashboard"
                }
            });
            const normalized = await this.syncPlatformSession();
            return normalized || normalizeProfile(data.user || { name: displayName, email }, "better-auth");
        } catch (platformError) {
            throw platformError;
        }
    }

    async startGoogleSignIn(callbackURL) {
        const targetURL = String(callbackURL || "").trim() || "/";
        return this.platformRequest("/auth/sign-in/social", {
            method: "POST",
            body: {
                provider: "google",
                callbackURL: targetURL
            }
        });
    }

    async startAppleSignIn(callbackURL) {
        const targetURL = String(callbackURL || "").trim() || "/";
        return this.platformRequest("/auth/sign-in/social", {
            method: "POST",
            body: {
                provider: "apple",
                callbackURL: targetURL
            }
        });
    }

    async updateDisplayName(name) {
        const displayName = sanitizeName(name || "Player");
        const data = await this.platformRequest("/me", {
            method: "PATCH",
            body: { name: displayName }
        });
        const normalized = normalizeProfile(data, "better-auth");
        this.setPlatformProfile(normalized.profile);
        this.setStoredProfile(normalized.profile);
        return normalized;
    }

    async updateAvatar(avatarUrl) {
        const raw = avatarUrl === null || avatarUrl === undefined ? null : String(avatarUrl).trim();
        const data = await this.platformRequest("/me/avatar", {
            method: "PATCH",
            body: { avatarUrl: raw || null }
        });
        const normalized = normalizeProfile(data, "better-auth");
        this.setPlatformProfile(normalized.profile);
        this.setStoredProfile(normalized.profile);
        return normalized;
    }

    async getTableSkinShop() {
        return this.platformRequest("/economy/cosmetics/table-skins");
    }

    async purchaseTableSkin(key) {
        return this.platformRequest("/economy/cosmetics/table-skins/purchase", {
            method: "POST",
            body: { key }
        });
    }

    async equipTableSkin(key) {
        return this.platformRequest("/economy/cosmetics/table-skins/equip", {
            method: "POST",
            body: { key }
        });
    }

    async equipDefaultTableSkin() {
        return this.platformRequest("/economy/cosmetics/table-skins/equip-default", {
            method: "POST"
        });
    }

    async logout() {
        try {
            await this.platformRequest("/auth/sign-out", {
                method: "POST"
            });
        } catch {}

        this.clearSession();
        return true;
    }

    async getLeaderboard(limit = 10, scope = "overall", mode = "telefon") {
        try {
            const params = new URLSearchParams();
            params.set("limit", String(limit));
            if (scope) params.set("scope", String(scope));
            if (mode) params.set("mode", String(mode));
            const data = await this.platformRequest(`/leaderboard?${params.toString()}`);
            const items = Array.isArray(data?.items) ? data.items : [];
            return items.map((row, index) => ({
                rank: Number(row.rank ?? index + 1),
                id: String(row.id || ""),
                name: String(row.displayName || row.name || "Player"),
                rating: Number(row.rating ?? 1000),
                titleCode: String(row.titleCode || row.title || "rookie").trim() || "rookie",
                points: Number(row.points ?? 0),
                wins: Number(row.wins ?? 0),
                losses: Number(row.losses ?? 0),
                draws: Number(row.draws ?? 0),
                matchesPlayed: Number(row.matchesPlayed ?? 0),
                isSelf: Boolean(row.isSelf),
                weeklyRatingDelta: Number(row.weeklyRatingDelta ?? 0),
                weeklyWins: Number(row.weeklyWins ?? 0),
                weeklyLosses: Number(row.weeklyLosses ?? 0),
                weeklyMatchesPlayed: Number(row.weeklyMatchesPlayed ?? 0)
            }));
        } catch (error) {
            throw error;
        }
    }

    async getMessageThreads() {
        const data = await this.platformRequest("/social/messages");
        return Array.isArray(data?.items) ? data.items : [];
    }

    async getPlayerProfile(playerId) {
        const id = String(playerId || "").trim();
        if (!id) throw new Error("Player not found");
        const data = await this.platformRequest(`/social/players/${encodeURIComponent(id)}/profile`);
        return data?.item || null;
    }

    async getDirectMessages(playerId, options = {}) {
        const id = String(playerId || "").trim();
        if (!id) return [];
        const params = new URLSearchParams();
        const limit = Number(options?.limit);
        const before = String(options?.before || "").trim();
        const after = String(options?.after || "").trim();
        if (Number.isFinite(limit) && limit > 0) {
            params.set("limit", String(Math.trunc(limit)));
        }
        if (before) {
            params.set("before", before);
        }
        if (after) {
            params.set("afterMessageId", after);
        }
        const query = params.toString();
        const data = await this.platformRequest(`/social/messages/${encodeURIComponent(id)}${query ? `?${query}` : ""}`);
        return Array.isArray(data?.items) ? data.items : [];
    }

    async markMessageThreadRead(playerId) {
        const id = String(playerId || "").trim();
        if (!id) return { ok: true };
        return this.platformRequest(`/social/messages/${encodeURIComponent(id)}/read`, {
            method: "POST"
        });
    }

    async sendDirectMessage(playerId, text, clientMessageId = '') {
        const id = String(playerId || "").trim();
        const body = { 
            text: String(text || "").trim(),
            ...(clientMessageId ? { clientMessageId: String(clientMessageId).trim() } : {})
        };
        return this.platformRequest(`/social/messages/${encodeURIComponent(id)}`, {
            method: "POST",
            body
        });
    }

    async deleteMessageThread(playerId) {
        const id = String(playerId || "").trim();
        if (!id) return { ok: true };
        return this.platformRequest(`/social/messages/${encodeURIComponent(id)}/delete`, {
            method: "POST"
        });
    }

    async getPlayerMessages(playerId) {
        return this.getDirectMessages(playerId);
    }

    async sendPlayerMessage(playerId, text) {
        return this.sendDirectMessage(playerId, text);
    }

    async getProfileDetails(mode = null) {
        const platform = await this.syncPlatformSession(mode);
        if (platform) {
            return platform;
        }

        return null;
    }

    async recordMatch(payload) {
        const platformToken = this.platformGameToken;
        if (platformToken) {
            try {
                const data = await this.platformRequest("/platform/matches", {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${platformToken}`
                    },
                    body: payload
                });
                return data.match || data || null;
            } catch (error) {
                throw error;
            }
        }
        return null;
    }

    async reserveSoloMatchStake(payload) {
        const body = payload && typeof payload === "object" ? payload : {};
        return this.platformRequest("/economy/solo/reserve", {
            method: "POST",
            headers: this.platformGameToken
                ? {
                    Authorization: `Bearer ${this.platformGameToken}`
                }
                : {},
            body
        });
    }

    async settleSoloMatchStake(payload) {
        const body = payload && typeof payload === "object" ? payload : {};
        return this.platformRequest("/economy/solo/settle", {
            method: "POST",
            headers: this.platformGameToken
                ? {
                    Authorization: `Bearer ${this.platformGameToken}`
                }
                : {},
            body
        });
    }

    getRoomAuthToken() {
        return this.platformGameToken || "";
    }

    async getDailyBonusStatus() {
        return this.platformRequest("/economy/daily-bonus/status");
    }

    async claimDailyBonus(payload = {}) {
        return this.platformRequest("/economy/daily-bonus/claim", {
            method: "POST",
            body: {
                claimMode: payload?.claimMode === "rewarded_x2" ? "rewarded_x2" : "normal"
            }
        });
    }
}
