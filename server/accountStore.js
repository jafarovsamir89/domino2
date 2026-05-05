const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DATA_DIR = path.join(__dirname, "data");
const DATA_FILE = path.join(DATA_DIR, "accounts.json");
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 90;
const INITIAL_STATE = {
    version: 1,
    users: [],
    sessions: [],
    matches: []
};

let stateCache = null;
let writeQueue = Promise.resolve();

function ensureDataFile() {
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(DATA_FILE)) {
        fs.writeFileSync(DATA_FILE, JSON.stringify(INITIAL_STATE, null, 2), "utf8");
    }
}

function loadState() {
    if (stateCache) return stateCache;
    ensureDataFile();
    try {
        const raw = fs.readFileSync(DATA_FILE, "utf8");
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
}

function saveState() {
    const payload = JSON.stringify(stateCache || INITIAL_STATE, null, 2);
    writeQueue = writeQueue.then(() => fs.promises.writeFile(DATA_FILE, payload, "utf8"));
    return writeQueue.catch((err) => {
        console.error("[AccountStore] Failed to save state:", err);
    });
}

function normalizeName(name) {
    return String(name || "").trim().replace(/\s+/g, " ").slice(0, 24);
}

function nameKey(name) {
    return normalizeName(name).toLowerCase();
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
    const cleanName = normalizeName(name) || `Guest-${Math.floor(Math.random() * 9000 + 1000)}`;
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

function eloDelta(userRating, oppRating, result, k = 32) {
    const expected = 1 / (1 + Math.pow(10, (oppRating - userRating) / 400));
    return Math.round(k * (result - expected));
}

function applyResult(user, { result, points = 0, ratingDelta = 0, won = false, lost = false, draw = false }) {
    user.points += points;
    user.matchesPlayed += 1;
    if (won) {
        user.wins += 1;
        user.currentStreak += 1;
        user.bestStreak = Math.max(user.bestStreak, user.currentStreak);
    } else if (lost) {
        user.losses += 1;
        user.currentStreak = 0;
    } else if (draw) {
        user.draws += 1;
        user.currentStreak = 0;
    }
    user.rating = Math.max(100, user.rating + ratingDelta);
    touchUser(user);
}

function recordMatch(payload) {
    const state = loadState();
    const createdAt = new Date().toISOString();
    const matchId = crypto.randomUUID();
    const participants = Array.isArray(payload?.participants) ? payload.participants : [];
    const teams = Array.isArray(payload?.teams) ? payload.teams : [];
    const isTeamMode = payload?.isTeamMode === true;

    const resolvedParticipants = participants.map((participant) => {
        const user = participant.userId ? findUserById(participant.userId) : findRegisteredUserByName(participant.name);
        return {
            ...participant,
            userId: user ? user.id : null,
            ratingBefore: user ? user.rating : null
        };
    });

    let teamRatings = null;
    if (isTeamMode && teams.length >= 2) {
        teamRatings = teams.map((team) => {
            const memberRatings = team.memberIds
                .map((id) => findUserById(id))
                .filter(Boolean)
                .map((user) => user.rating);
            const avg = memberRatings.length ? memberRatings.reduce((a, b) => a + b, 0) / memberRatings.length : 1000;
            return avg;
        });
    }

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

    if (teamRatings) {
        matchRecord.teamRatings = teamRatings;
    }

    for (const participant of resolvedParticipants) {
        if (!participant.userId) continue;
        const user = findUserById(participant.userId);
        if (!user) continue;

        const isWinner = winnerKey && participant.winnerKey === winnerKey;
        const isDraw = winnerKey === "draw" || payload?.result === "draw";
        const didWin = isDraw ? false : !!isWinner;
        const didLose = !didWin && !isDraw;

        let ratingDelta = 0;
        if (isTeamMode && teamRatings && participant.teamIndex !== undefined && participant.teamIndex !== null) {
            const ownTeam = teamRatings[participant.teamIndex] || 1000;
            const oppTeam = teamRatings[participant.teamIndex === 0 ? 1 : 0] || 1000;
            const result = isDraw ? 0.5 : (didWin ? 1 : 0);
            ratingDelta = eloDelta(ownTeam, oppTeam, result, 28);
        } else {
            const oppRatings = resolvedParticipants
                .filter((other) => other.userId && other.userId !== participant.userId)
                .map((other) => {
                    const otherUser = findUserById(other.userId);
                    return otherUser ? otherUser.rating : 1000;
                });
            const oppAvg = oppRatings.length ? oppRatings.reduce((a, b) => a + b, 0) / oppRatings.length : 1000;
            const result = isDraw ? 0.5 : (didWin ? 1 : 0);
            ratingDelta = eloDelta(user.rating, oppAvg, result, 32);
        }

        applyResult(user, {
            points: parseInt(participant.points, 10) || 0,
            ratingDelta,
            won: didWin,
            lost: didLose,
            draw: isDraw
        });

        participant.ratingAfter = user.rating;
        participant.ratingDelta = ratingDelta;
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
    getLeaderboard,
    recordMatch,
    findUserById,
    getSession,
    safePublicUser
};
