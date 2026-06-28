const crypto = require("crypto");

const ROOM_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const DEFAULT_STAKE_KEY = "stake_200";
const DEFAULT_AI_DIFFICULTY = "medium";
const DEFAULT_DLOSS_THRESHOLD = 255;
const DISCONNECT_GRACE_SECONDS = 120;

function generateRoomCode() {
    let code = "";
    const bytes = crypto.randomBytes(4);
    for (let i = 0; i < 4; i++) code += ROOM_CODE_CHARS[bytes[i] % ROOM_CODE_CHARS.length];
    return code;
}

function normalizeRoomVisibility(value) {
    return String(value || "closed").trim() === "open" ? "open" : "closed";
}

function normalizeRoomMode(value, isTeamMode) {
    const roomMode = String(value || "").trim().toLowerCase();
    if (roomMode === "team" || roomMode === "2v2" || roomMode === "partnership") {
        return "team";
    }
    if (roomMode === "ffa" || roomMode === "solo") {
        return "ffa";
    }
    return isTeamMode === true ? "team" : "ffa";
}

function normalizeGameMode(value) {
    const gameMode = String(value || "").trim().toLowerCase();
    if (!gameMode) return "telefon";
    if (gameMode === "classic101" || gameMode === "classic-101" || gameMode === "101" || gameMode === "classic") {
        return "classic101";
    }
    if (gameMode === "telefon" || gameMode === "tel" || gameMode === "phone" || gameMode === "muggins") {
        return "telefon";
    }
    return "telefon";
}

function normalizeStakeKey(value) {
    return String(value || DEFAULT_STAKE_KEY).trim() || DEFAULT_STAKE_KEY;
}

function normalizePlayerCount(value, isTeamMode) {
    return isTeamMode ? 4 : Math.min(Math.max(value || 2, 2), 4);
}

function normalizeAiCount(value, totalPlayers) {
    return Math.min(Math.max(value || 0, 0), totalPlayers - 1);
}

function normalizeDlossThreshold(value) {
    return value || DEFAULT_DLOSS_THRESHOLD;
}

function normalizeInstantWinEnabled(value) {
    return value !== false;
}

function normalizeAiDifficulty(value) {
    return value || DEFAULT_AI_DIFFICULTY;
}

module.exports = {
    generateRoomCode,
    normalizeRoomVisibility,
    normalizeRoomMode,
    normalizeGameMode,
    normalizeStakeKey,
    normalizePlayerCount,
    normalizeAiCount,
    normalizeDlossThreshold,
    normalizeInstantWinEnabled,
    normalizeAiDifficulty,
    DISCONNECT_GRACE_SECONDS
};
