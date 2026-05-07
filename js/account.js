const ACCOUNT_TOKEN_KEY = "dominoAuthToken";
const ACCOUNT_PROFILE_KEY = "dominoAuthProfile";
const PLATFORM_GAME_TOKEN_KEY = "dominoPlatformGameToken";
const PLATFORM_PROFILE_KEY = "dominoPlatformProfile";

export class AccountClient {
    constructor(getServerUrl) {
        this.getServerUrl = getServerUrl;
        this.lastError = "";
    }

    get apiBase() {
        const url = typeof this.getServerUrl === "function" ? this.getServerUrl() : "";
        return String(url || "").replace(/\/$/, "");
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
            return raw ? JSON.parse(raw) : null;
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
            return raw ? JSON.parse(raw) : null;
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
                throw new Error(data.error || response.statusText || "Request failed");
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
        let legacyData = null;
        const token = this.storedToken;
        if (token) {
            try {
                legacyData = await this.request("/api/me", {
                    headers: { Authorization: `Bearer ${token}` }
                });
                this.setStoredProfile(legacyData.user || null);
            } catch {
                this.setStoredToken("");
                this.setStoredProfile(null);
            }
        }

        await this.syncPlatformSession();
        return legacyData;
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

            this.setPlatformGameToken(data.token);
            this.setPlatformProfile({
                user: data.user || null,
                player: data.player || null,
                session: data.session || null
            });
            if (data.user || data.player) {
                this.setStoredProfile(data.user || null);
            }
            return data;
        } catch {
            return null;
        }
    }

    async createGuest(name) {
        const data = await this.request("/api/auth/guest", {
            method: "POST",
            body: { name }
        });
        this.setStoredToken(data.token);
        this.setStoredProfile(data.user || null);
        return data;
    }

    async register(name, password) {
        const data = await this.request("/api/auth/register", {
            method: "POST",
            body: { name, password }
        });
        this.setStoredToken(data.token);
        this.setStoredProfile(data.user || null);
        return data;
    }

    async login(name, password) {
        const data = await this.request("/api/auth/login", {
            method: "POST",
            body: { name, password }
        });
        this.setStoredToken(data.token);
        this.setStoredProfile(data.user || null);
        return data;
    }

    async logout() {
        const token = this.storedToken;
        try {
            if (token) {
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
        const data = await this.request(`/api/leaderboard?limit=${encodeURIComponent(limit)}`);
        return data.leaderboard || [];
    }

    async getProfileDetails() {
        const token = this.storedToken;
        if (!token) return null;
        const data = await this.request("/api/me", {
            headers: { Authorization: `Bearer ${token}` }
        });
        this.setStoredProfile(data.user || null);
        return data;
    }

    async recordMatch(payload) {
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
