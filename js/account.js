const ACCOUNT_TOKEN_KEY = "dominoAuthToken";
const ACCOUNT_PROFILE_KEY = "dominoAuthProfile";
const PLATFORM_GAME_TOKEN_KEY = "dominoPlatformGameToken";
const PLATFORM_PROFILE_KEY = "dominoPlatformProfile";

function safeJsonParse(value) {
    try {
        return value ? JSON.parse(value) : null;
    } catch {
        return null;
    }
}

function sanitizeName(value) {
    return String(value || "Player").replace(/[<>&"']/g, "").trim().slice(0, 24) || "Player";
}

function sanitizeEmail(value, fallbackName = "player") {
    const raw = String(value || "").trim();
    if (raw.includes("@")) return raw.slice(0, 254);
    const alias = sanitizeName(fallbackName).toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.+|\.+$/g, "") || "player";
    return `${alias}@domino.local`;
}

function normalizeProfile(payload = {}, source = "legacy") {
    const user = payload.user || payload;
    const player = payload.player || null;
    const stats = payload.stats || payload.player?.stats || null;
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
        bestStreak: Number(stats.bestStreak ?? payload.bestStreak ?? 0)
    } : null;

    const profile = {
        id: String(player?.id || user?.id || payload.id || ""),
        userId: String(user?.id || payload.userId || payload.id || ""),
        playerId: String(player?.id || payload.playerId || payload.id || ""),
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

            const { protocol, hostname } = window.location;
            if (hostname === "localhost" || hostname === "127.0.0.1") {
                return "http://localhost:3000/api";
            }

            return `${protocol}//${hostname}/api`;
        } catch {
            return "http://localhost:3000/api";
        }
    }

    get storedToken() {
        try {
            return window.localStorage?.getItem(ACCOUNT_TOKEN_KEY) || "";
        } catch {
            return "";
        }
    }

    setStoredToken(token) {
        try {
            if (token) window.localStorage?.setItem(ACCOUNT_TOKEN_KEY, token);
            else window.localStorage?.removeItem(ACCOUNT_TOKEN_KEY);
        } catch {}
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

    clearSession() {
        this.setStoredToken("");
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
            const response = await fetch(`${this.apiBase}${path}`, {
                headers: {
                    "Content-Type": "application/json",
                    ...(options.headers || {})
                },
                ...options,
                signal: controller.signal,
                body: options.body ? JSON.stringify(options.body) : undefined
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
            const response = await fetch(`${this.platformApiBase}${path}`, {
                headers: {
                    "Content-Type": "application/json",
                    ...(options.headers || {})
                },
                credentials: "include",
                ...options,
                signal: controller.signal,
                body: options.body ? JSON.stringify(options.body) : undefined
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

        let legacyData = null;
        const token = this.storedToken;
        if (token) {
            try {
                legacyData = await this.request("/api/me", {
                    headers: { Authorization: `Bearer ${token}` }
                });
                const normalized = normalizeProfile(legacyData.user || legacyData, "legacy");
                this.setStoredProfile(normalized.profile);
            } catch {
                this.setStoredToken("");
                this.setStoredProfile(null);
            }
        }

        return legacyData ? normalizeProfile(legacyData.user || legacyData, "legacy") : null;
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
            this.setStoredToken("");
            return normalized;
        } catch {
            return null;
        }
    }

    async createGuest(name) {
        const data = await this.request("/api/auth/guest", {
            method: "POST",
            body: { name }
        });
        const normalized = normalizeProfile(data.user || data, "legacy");
        this.setStoredToken(data.token || "");
        this.setStoredProfile(normalized.profile);
        return normalized;
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
            try {
                const data = await this.request("/api/auth/register", {
                    method: "POST",
                    body: { name: displayName, password }
                });
                const normalized = normalizeProfile(data.user || data, "legacy");
                this.setStoredToken(data.token || "");
                this.setStoredProfile(normalized.profile);
                return normalized;
            } catch {
                throw platformError;
            }
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
            try {
                const data = await this.request("/api/auth/login", {
                    method: "POST",
                    body: { name: displayName, password }
                });
                const normalized = normalizeProfile(data.user || data, "legacy");
                this.setStoredToken(data.token || "");
                this.setStoredProfile(normalized.profile);
                return normalized;
            } catch {
                throw platformError;
            }
        }
    }

    async logout() {
        const token = this.storedToken || this.platformGameToken;
        try {
            await this.platformRequest("/auth/sign-out", {
                method: "POST"
            });
        } catch {}

        try {
            if (token && this.storedToken) {
                await this.request("/api/auth/logout", {
                    method: "POST",
                    headers: { Authorization: `Bearer ${token}` }
                });
            }
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
                points: Number(row.points ?? 0),
                wins: Number(row.wins ?? 0),
                matchesPlayed: Number(row.matchesPlayed ?? 0)
            }));
        } catch {
            const data = await this.request(`/api/leaderboard?limit=${encodeURIComponent(limit)}`);
            const rows = Array.isArray(data?.leaderboard) ? data.leaderboard : [];
            return rows.map((row, index) => ({
                rank: Number(row.rank ?? index + 1),
                id: String(row.id || ""),
                name: String(row.name || row.displayName || "Player"),
                rating: Number(row.rating ?? 1000),
                points: Number(row.points ?? 0),
                wins: Number(row.wins ?? 0),
                matchesPlayed: Number(row.matchesPlayed ?? 0)
            }));
        }
    }

    async getProfileDetails() {
        const platform = await this.syncPlatformSession();
        if (platform) {
            return platform;
        }

        const token = this.storedToken;
        if (!token) return null;
        const data = await this.request("/api/me", {
            headers: { Authorization: `Bearer ${token}` }
        });
        const normalized = normalizeProfile(data.user || data, "legacy");
        this.setStoredProfile(normalized.profile);
        return normalized;
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
            } catch {}
        }

        const token = this.storedToken;
        if (!token) return null;
        const data = await this.request("/api/matches", {
            method: "POST",
            headers: { Authorization: `Bearer ${token}` },
            body: payload
        });
        return data.match || null;
    }

    getRoomAuthToken() {
        return this.platformGameToken || this.storedToken || "";
    }
}
