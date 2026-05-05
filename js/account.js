const ACCOUNT_TOKEN_KEY = "dominoAuthToken";
const ACCOUNT_PROFILE_KEY = "dominoAuthProfile";

export class AccountClient {
    constructor(getServerUrl) {
        this.getServerUrl = getServerUrl;
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

    async request(path, options = {}) {
        const response = await fetch(`${this.apiBase}${path}`, {
            headers: {
                "Content-Type": "application/json",
                ...(options.headers || {})
            },
            ...options,
            body: options.body ? JSON.stringify(options.body) : undefined
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(data.error || response.statusText || "Request failed");
        }
        return data;
    }

    async bootstrap() {
        const token = this.storedToken;
        if (!token) return null;
        try {
            const data = await this.request("/api/me", {
                headers: { Authorization: `Bearer ${token}` }
            });
            this.setStoredProfile(data.user || null);
            return data.user || null;
        } catch {
            this.setStoredToken("");
            this.setStoredProfile(null);
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

    async getLeaderboard(limit = 10) {
        const data = await this.request(`/api/leaderboard?limit=${encodeURIComponent(limit)}`);
        return data.leaderboard || [];
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
}
