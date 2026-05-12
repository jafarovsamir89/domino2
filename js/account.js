const ACCOUNT_PROFILE_KEY = "dominoAuthProfile";
const PLATFORM_GAME_TOKEN_KEY = "dominoPlatformGameToken";
const PLATFORM_PROFILE_KEY = "dominoPlatformProfile";
const LOCAL_GAME_SESSION_KEY = "dominoLocalGameSessionId";
const GAME_RESUME_STATE_KEY = "dominoGameResumeState";

function safeJsonParse(value) {
    try {
        return value ? JSON.parse(value) : null;
    } catch {
        return null;
    }
}

function sanitizeName(value) {
    return String(value || "Player")
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
    const wallet = payload.wallet || payload.player?.wallet || null;
    const displayName = sanitizeName(
        payload.profile?.name ||
        player?.displayName ||
        user?.name ||
        payload.displayName ||
        payload.name ||
        "Player"
    );

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
    const walletBalance = Number(wallet?.balance ?? payload.coins ?? payload.balance ?? 0);
    const titleCode = String(payload.titleCode || normalizedStats?.titleCode || payload.title || "rookie").trim() || "rookie";

    const profile = {
        id: String(player?.id || user?.id || payload.id || ""),
        userId: String(user?.id || payload.userId || payload.id || ""),
        playerId: String(player?.id || payload.playerId || payload.id || ""),
        sessionId: String(payload.sessionId || payload.guestSessionId || player?.sessionId || user?.sessionId || ""),
        name: displayName,
        displayName,
        email: String(user?.email || payload.email || ""),
        image: user?.image || payload.image || null,
        role: String(user?.role || payload.role || "player"),
        isGuest: Boolean(payload.isGuest || player?.isGuest || user?.isGuest),
        avatarSeed: player?.avatarSeed || payload.avatarSeed || null,
        language: player?.language || payload.language || null,
        rating: normalizedStats?.rating ?? Number(payload.rating ?? 1000),
        points: normalizedStats?.points ?? Number(payload.points ?? 0),
        wins: normalizedStats?.wins ?? Number(payload.wins ?? 0),
        losses: normalizedStats?.losses ?? Number(payload.losses ?? 0),
        draws: normalizedStats?.draws ?? Number(payload.draws ?? 0),
        matchesPlayed: normalizedStats?.matchesPlayed ?? Number(payload.matchesPlayed ?? 0),
        currentStreak: normalizedStats?.currentStreak ?? Number(payload.currentStreak ?? 0),
        bestStreak: normalizedStats?.bestStreak ?? Number(payload.bestStreak ?? 0),
        titleCode,
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
        const url = typeof this.getServerUrl === "function" ? this.getServerUrl() : "";
        return String(url || "").replace(/\/$/, "");
    }

    get platformApiBase() {
        try {
            if (window.DOMINO_PLATFORM_API_URL) {
                return String(window.DOMINO_PLATFORM_API_URL).replace(/\/$/, "");
            }

            const { hostname } = window.location;
            if (hostname === "localhost" || hostname === "127.0.0.1") {
                return "http://localhost:3000/api";
            }

            return "https://apid.simplesoft.az/api";
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
            const response = await fetch(`${this.platformApiBase}${path}`, {
                headers: {
                    "Content-Type": "application/json",
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

    async bootstrap() {
        const platformData = await this.syncPlatformSession();
        if (platformData) {
            return platformData;
        }

        const storedProfile = this.getStoredProfile();
        if (storedProfile?.provider === "local-guest") {
            return normalizeProfile({ profile: storedProfile }, "local-guest");
        }

        this.setStoredToken("");
        this.setStoredProfile(null);
        return null;
    }

    async syncPlatformSession() {
        try {
            const response = await fetch(`${this.platformApiBase}/platform/game-token`, {
                method: "GET",
                credentials: "include",
                headers: {
                    "Content-Type": "application/json"
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
        const cleanName = sanitizeName(name || "Player");
        const sessionId = this.getLocalGameSessionId() || createLocalSessionId();
        this.setLocalGameSessionId(sessionId);
        const normalized = normalizeProfile({
            profile: {
                sessionId,
                name: cleanName,
                provider: "local-guest",
                isGuest: true,
                recentMatches: []
            },
            user: {
                id: "",
                sessionId,
                name: cleanName,
                isGuest: true,
                role: "player",
                email: "",
                image: null
            },
            player: {
                id: "",
                sessionId,
                displayName: cleanName,
                isGuest: true,
                avatarSeed: null,
                language: null
            },
            stats: {
                rating: 1000,
                points: 0,
                wins: 0,
                losses: 0,
                draws: 0,
                matchesPlayed: 0,
                currentStreak: 0,
                bestStreak: 0,
                titleCode: "rookie"
            },
            wallet: {
                balance: 0,
                reserved: 0,
                availableBalance: 0,
                spendableBalance: 0,
                reservedBalance: 0
            },
            coins: 0,
            titleCode: "rookie",
            recentMatches: []
        }, "local-guest");
        this.setStoredProfile(normalized.profile);
        return normalized;
    }

    async sendLocalGameHeartbeat(payload) {
        try {
            const response = await fetch(`${this.platformApiBase}/realtime/heartbeat`, {
                method: "POST",
                credentials: "include",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    sessionId: this.getLocalGameSessionId() || payload?.sessionId || "",
                    provider: payload?.provider || "local-guest",
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

    async getOpenRooms(filters = {}) {
        const params = new URLSearchParams();
        const entries = Object.entries(filters || {});
        for (const [key, value] of entries) {
            if (value === undefined || value === null || value === "") continue;
            params.set(key, String(value));
        }
        const query = params.toString();
        const data = await this.request(`/api/realtime/rooms${query ? `?${query}` : ""}`);
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

    async inviteFriendToRoom(roomId, payload = {}) {
        const body = payload && typeof payload === "object" ? payload : {};
        return this.platformRequest(`/social/rooms/${encodeURIComponent(roomId)}/invite`, {
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

    async logout() {
        try {
            await this.platformRequest("/auth/sign-out", {
                method: "POST"
            });
        } catch {}

        this.clearSession();
        return true;
    }

    async getLeaderboard(limit = 10) {
        try {
            const data = await this.platformRequest(`/leaderboard?limit=${encodeURIComponent(limit)}`);
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
                matchesPlayed: Number(row.matchesPlayed ?? 0)
            }));
        } catch (error) {
            throw error;
        }
    }

    async getProfileDetails() {
        const platform = await this.syncPlatformSession();
        if (platform) {
            return platform;
        }
        const storedProfile = this.getStoredProfile();
        if (storedProfile?.provider === "local-guest") {
            return normalizeProfile({ profile: storedProfile }, "local-guest");
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
}
