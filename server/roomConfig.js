const crypto = require("crypto");

const ROOM_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const DEFAULT_STAKE_KEY = "stake_200";
const DEFAULT_AI_DIFFICULTY = "medium";
const DEFAULT_DLOSS_THRESHOLD = 255;

function generateRoomCode() {
    let code = "";
    const bytes = crypto.randomBytes(4);
    for (let i = 0; i < 4; i++) code += ROOM_CODE_CHARS[bytes[i] % ROOM_CODE_CHARS.length];
    return code;
}

function normalizeRoomVisibility(value) {
    return String(value || "closed").trim() === "open" ? "open" : "closed";
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
    normalizeStakeKey,
    normalizePlayerCount,
    normalizeAiCount,
    normalizeDlossThreshold,
    normalizeInstantWinEnabled,
    normalizeAiDifficulty
};
