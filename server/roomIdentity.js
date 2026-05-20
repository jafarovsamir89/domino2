const { sanitizeName } = require("./roomSnapshot");

function normalizeAuthToken(identity = {}, options = {}) {
    return String(identity.authToken || options.authToken || "").trim();
}

function normalizePlayerUserId(identity = {}, player = {}) {
    return String(identity.userId || player.userId || "");
}

function normalizePlayerAvatarUrl(identity = {}, existingIdentity = {}, options = {}) {
    return String(identity.avatarUrl || existingIdentity.avatarUrl || options.avatarUrl || "").trim();
}

function normalizePlayerId(identity = {}, existingIdentity = {}, player = {}) {
    return String(identity.playerId || existingIdentity.playerId || identity.userId || player.userId || "");
}

function normalizePlayerRole(identity = {}, existingIdentity = {}, isHost = false) {
    return identity.role || existingIdentity.role || (isHost ? "host" : "player");
}

function buildRoomIdentity({ existingIdentity = {}, identity = {}, authToken = "", player = {}, options = {}, isHost = false } = {}) {
    return {
        ...existingIdentity,
        provider: identity.provider || existingIdentity.provider || "platform",
        authToken: authToken || existingIdentity.authToken || "",
        userId: String(identity.userId || existingIdentity.userId || player.userId || ""),
        displayName: sanitizeName(identity.displayName || existingIdentity.displayName || player.name || options.name),
        playerId: normalizePlayerId(identity, existingIdentity, player),
        avatarUrl: normalizePlayerAvatarUrl(identity, existingIdentity, options),
        role: normalizePlayerRole(identity, existingIdentity, isHost)
    };
}

module.exports = {
    normalizeAuthToken,
    normalizePlayerUserId,
    normalizePlayerAvatarUrl,
    normalizePlayerId,
    normalizePlayerRole,
    buildRoomIdentity
};
