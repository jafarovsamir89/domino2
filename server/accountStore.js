const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const fsp = fs.promises;

const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "accounts.json");
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 90;
const INITIAL_STATE = {
    version: 1,
    users: [],
    sessions: [],
    matches: []
};

let stateCache = { ...INITIAL_STATE };
let stateLoadPromise = null;
let writeQueue = Promise.resolve();

async function ensureDataFile() {
    await fsp.mkdir(DATA_DIR, { recursive: true });
    try {
        await fsp.access(DATA_FILE, fs.constants.F_OK);
    } catch {
        await fsp.writeFile(DATA_FILE, JSON.stringify(INITIAL_STATE, null, 2), "utf8");
    }
}

async function hydrateState() {
    if (stateLoadPromise) return stateLoadPromise;
    stateLoadPromise = (async () => {
        try {
            await ensureDataFile();
            const raw = await fsp.readFile(DATA_FILE, "utf8");
            const parsed = JSON.parse(raw);
            stateCache = {
                ...INITIAL_STATE,
                ...parsed,
                users: Array.isArray(parsed.users) ? parsed.users : [],
                sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
                matches: Array.isArray(parsed.matches) ? parsed.matches : []
            };
        } catch (err) {
            stateCache = { ...INITIAL_STATE };
        }
        return stateCache;
    })();
    return stateLoadPromise;
}

function loadState() {
    return stateCache || { ...INITIAL_STATE };
}

function saveState() {
    const payload = JSON.stringify(stateCache || INITIAL_STATE, null, 2);
    writeQueue = writeQueue.then(() => fsp.writeFile(DATA_FILE, payload, "utf8"));
    return writeQueue.catch((err) => {
        console.error("[AccountStore] Failed to save state:", err);
    });
}

void hydrateState();

function normalizeName(name) {
    return String(name || "").trim().replace(/\s+/g, " ").slice(0, 24);
}

function nameKey(name) {
    return normalizeName(name).toLowerCase();
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function toFiniteInt(value, fallback = 0) {
    const parsed = Number.parseInt(String(value ?? ""), 10);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function calculateLegacyPlayerRating(stats) {
    const matchesPlayed = Math.max(0, toFiniteInt(stats?.matchesPlayed, 0));
    if (matchesPlayed <= 0) {
        return 1000;
    }

    const wins = Math.max(0, toFiniteInt(stats?.wins, 0));
    const losses = Math.max(0, toFiniteInt(stats?.losses, 0));
    const draws = Math.max(0, toFiniteInt(stats?.draws, 0));
    const currentStreak = Math.max(0, toFiniteInt(stats?.currentStreak, 0));
    const bestStreak = Math.max(0, toFiniteInt(stats?.bestStreak, 0));

    const confidence = matchesPlayed / (matchesPlayed + 12);
    const winRate = (wins + draws * 0.5) / matchesPlayed;
    const balance = (wins - losses) / matchesPlayed;
    const volumeBonus = Math.log10(matchesPlayed + 1) * 70;
    const streakBonus = Math.min(100, currentStreak * 10 + bestStreak * 2);

    const raw = 1000
        + confidence * ((winRate - 0.5) * 850 + balance * 300)
        + volumeBonus
        + streakBonus;

    return clamp(Math.round(raw), 300, 5000);
}

function getLegacyPlayerRatingTitleCode(rating) {
    const tiers = [
        { code: "rookie", minRating: 0 },
        { code: "bronze", minRating: 1075 },
        { code: "silver", minRating: 1200 },
        { code: "gold", minRating: 1350 },
        { code: "platinum", minRating: 1500 },
        { code: "diamond", minRating: 1650 },
        { code: "master", minRating: 1800 },
        { code: "legend", minRating: 1950 }
    ];
    const safeRating = Number.isFinite(rating) ? rating : 1000;
    let current = tiers[0];
    for (const tier of tiers) {
        if (safeRating >= tier.minRating) {
            current = tier;
        }
    }
    return current.code;
}

function safePublicUser(user) {
    if (!user) return null;
    return {
        id: user.id,
        name: user.name,
        isGuest: !!user.isGuest,
        rating: user.rating,
        points: user.points,
        wins: user.wins,
        losses: user.losses,
        draws: user.draws,
        matchesPlayed: user.matchesPlayed,
        currentStreak: user.currentStreak,
        bestStreak: user.bestStreak,
        avatarSeed: user.avatarSeed,
        createdAt: user.createdAt,
        lastLoginAt: user.lastLoginAt,
        updatedAt: user.updatedAt
    };
}

function makePasswordHash(password, salt = crypto.randomBytes(16).toString("hex")) {
    const hash = crypto.scryptSync(String(password || ""), salt, 64).toString("hex");
    return { salt, hash };
}

function passwordMatches(user, password) {
    if (!user || !user.passwordHash || !user.passwordSalt) return false;
    const nextHash = crypto.scryptSync(String(password || ""), user.passwordSalt, 64);
    const currentHash = Buffer.from(user.passwordHash, "hex");
    if (currentHash.length !== nextHash.length) return false;
    return crypto.timingSafeEqual(currentHash, nextHash);
}

function findUserByName(name) {
    const key = nameKey(name);
    return loadState().users.find((user) => user.nameKey === key) || null;
}

function findRegisteredUserByName(name) {
    const key = nameKey(name);
    return loadState().users.find((user) => user.nameKey === key && !user.isGuest) || null;
}

function findUserById(id) {
    const userId = String(id || "").trim();
    if (!userId) return null;
    return loadState().users.find((user) => user.id === userId) || null;
}

function getSession(token) {
    const sessionToken = String(token || "").trim();
    if (!sessionToken) return null;
    const now = Date.now();
    const state = loadState();
    const session = state.sessions.find((item) => item.token === sessionToken);
    if (!session) return null;
    if (session.expiresAt && session.expiresAt < now) {
        state.sessions = state.sessions.filter((item) => item.token !== sessionToken);
        saveState();
        return null;
    }
    const user = findUserById(session.userId);
    if (!user) return null;
    return { session, user };
}

function createSession(userId) {
    const token = crypto.randomUUID();
    const now = Date.now();
    const state = loadState();
    state.sessions.push({
        token,
        userId,
        createdAt: now,
        expiresAt: now + SESSION_TTL_MS
    });
    saveState();
    return token;
}

function touchUser(user) {
    user.updatedAt = new Date().toISOString();
    user.lastLoginAt = user.updatedAt;
}

function createUserRecord({ name, password = null, isGuest = false }) {
    const state = loadState();
    const cleanName = normalizeName(name);
    if (!cleanName) {
        throw new Error("Name is required");
    }
    if (!isGuest) {
        const existing = findRegisteredUserByName(cleanName);
        if (existing) {
            throw new Error("Name is already taken");
        }
    }
    const now = new Date().toISOString();
    const user = {
        id: crypto.randomUUID(),
        name: cleanName,
        nameKey: nameKey(cleanName),
        isGuest: !!isGuest,
        avatarSeed: crypto.createHash("sha1").update(cleanName).digest("hex").slice(0, 8),
        rating: 1000,
        points: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        matchesPlayed: 0,
        currentStreak: 0,
        bestStreak: 0,
        createdAt: now,
        lastLoginAt: now,
        updatedAt: now
    };

    if (!isGuest) {
        const { salt, hash } = makePasswordHash(password);
        user.passwordSalt = salt;
        user.passwordHash = hash;
    }

    state.users.push(user);
    saveState();
    return user;
}

function createGuest(name) {
    const cleanName = normalizeName(name) || `Guest-${crypto.randomInt(1000, 10000)}`;
    const user = createUserRecord({ name: cleanName, isGuest: true });
    const token = createSession(user.id);
    return { token, user: safePublicUser(user) };
}

function register(name, password) {
    if (!String(password || "").trim()) {
        throw new Error("Password is required");
    }
    const user = createUserRecord({ name, password, isGuest: false });
    const token = createSession(user.id);
    return { token, user: safePublicUser(user) };
}

function login(name, password) {
    const user = findRegisteredUserByName(name);
    if (!user || !passwordMatches(user, password)) {
        throw new Error("Invalid credentials");
    }
    touchUser(user);
    saveState();
    const token = createSession(user.id);
    return { token, user: safePublicUser(user) };
}

function getProfile(token) {
    const session = getSession(token);
    if (!session) return null;
    return safePublicUser(session.user);
}

function listMatchesForUser(userId, limit = 10) {
    const targetId = String(userId || "").trim();
    if (!targetId) return [];
    return loadState().matches
        .filter((match) => Array.isArray(match.participants) && match.participants.some((participant) => participant.userId === targetId))
        .slice()
        .sort((a, b) => Date.parse(b.createdAt || 0) - Date.parse(a.createdAt || 0))
        .slice(0, Math.max(1, Math.min(20, parseInt(limit, 10) || 10)))
        .map((match) => {
            const self = match.participants.find((participant) => participant.userId === targetId);
            return {
                id: match.id,
                createdAt: match.createdAt,
                mode: match.mode,
                isTeamMode: !!match.isTeamMode,
                roomId: match.roomId || null,
                winnerKey: match.winnerKey,
                totalPoints: match.totalPoints || 0,
                result: self?.result || "unknown",
                points: parseInt(self?.points, 10) || 0,
                roundWins: parseInt(self?.roundWins, 10) || 0,
                ratingDelta: parseInt(self?.ratingDelta, 10) || 0
            };
        });
}

function getProfileDetails(token) {
    const session = getSession(token);
    if (!session) return null;
    return {
        user: safePublicUser(session.user),
        recentMatches: listMatchesForUser(session.user.id, 10)
    };
}

function logout(token) {
    const sessionToken = String(token || "").trim();
    if (!sessionToken) return false;
    const state = loadState();
    const before = state.sessions.length;
    state.sessions = state.sessions.filter((item) => item.token !== sessionToken);
    if (state.sessions.length !== before) {
        saveState();
        return true;
    }
    return false;
}

function getLeaderboard(limit = 10) {
    const count = Math.max(1, Math.min(50, parseInt(limit, 10) || 10));
    return loadState()
        .users
        .filter((user) => !user.isGuest || user.matchesPlayed > 0)
        .slice()
        .sort((a, b) => {
            if (b.rating !== a.rating) return b.rating - a.rating;
            if (b.points !== a.points) return b.points - a.points;
            return b.wins - a.wins;
        })
        .slice(0, count)
        .map((user, index) => ({
            rank: index + 1,
            ...safePublicUser(user)
        }));
}

function applyResult(user, { points = 0, nextStats = null, nextRating = null }) {
    user.points += points;
    if (nextStats) {
        user.wins = nextStats.wins;
        user.losses = nextStats.losses;
        user.draws = nextStats.draws;
        user.matchesPlayed = nextStats.matchesPlayed;
        user.currentStreak = nextStats.currentStreak;
        user.bestStreak = nextStats.bestStreak;
    }
    if (Number.isFinite(nextRating)) {
        user.rating = nextRating;
    }
    touchUser(user);
}

function recordMatch(payload) {
    const state = loadState();
    const createdAt = new Date().toISOString();
    const matchId = crypto.randomUUID();
    const participants = Array.isArray(payload?.participants) ? payload.participants : [];
    const isTeamMode = payload?.isTeamMode === true;

    const resolvedParticipants = participants.map((participant) => {
        const user = participant.userId ? findUserById(participant.userId) : findRegisteredUserByName(participant.name);
        return {
            ...participant,
            userId: user ? user.id : null,
            ratingBefore: user ? user.rating : null
        };
    });

    const winnerKey = String(payload?.winnerKey || "").trim();
    const totalPoints = resolvedParticipants.reduce((sum, item) => sum + (parseInt(item.points, 10) || 0), 0);

    const matchRecord = {
        id: matchId,
        createdAt,
        mode: payload?.mode || "local",
        isTeamMode,
        roomId: payload?.roomId || null,
        winnerKey,
        totalPoints,
        participants: resolvedParticipants
    };

    const isDraw = winnerKey === "draw" || payload?.result === "draw";
    for (const participant of resolvedParticipants) {
        if (!participant.userId) continue;
        const user = findUserById(participant.userId);
        if (!user) continue;

        const isWinner = isDraw ? false : (
            isTeamMode
                ? participant.teamIndex !== undefined && participant.teamIndex !== null && `team:${participant.teamIndex}` === winnerKey
                : participant.winnerKey === winnerKey || participant.result === "win"
        );
        const didWin = !isDraw && !!isWinner;
        const didLose = !didWin && !isDraw;
        const nextCurrentStreak = didWin ? user.currentStreak + 1 : 0;
        const nextStats = {
            wins: user.wins + (didWin ? 1 : 0),
            losses: user.losses + (didLose ? 1 : 0),
            draws: user.draws + (isDraw ? 1 : 0),
            matchesPlayed: user.matchesPlayed + 1,
            currentStreak: nextCurrentStreak,
            bestStreak: Math.max(user.bestStreak, nextCurrentStreak)
        };
        const nextRating = calculateLegacyPlayerRating(nextStats);

        applyResult(user, {
            points: parseInt(participant.points, 10) || 0,
            nextStats,
            nextRating
        });
        participant.ratingAfter = user.rating;
        participant.ratingDelta = user.rating - (participant.ratingBefore || 1000);
    }

    state.matches.push(matchRecord);
    saveState();
    return matchRecord;
}

module.exports = {
    createGuest,
    register,
    login,
    getProfile,
    getProfileDetails,
    getLeaderboard,
    listMatchesForUser,
    logout,
    recordMatch,
    findUserById,
    getSession,
    safePublicUser,
    calculateLegacyPlayerRating,
    getLegacyPlayerRatingTitleCode
};
