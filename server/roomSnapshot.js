function sanitizeName(name) {
    return String(name || "Player")
        .replace(/<[^>]*>/g, " ")
        .replace(/[^\p{L}\p{N} _.-]/gu, "")
        .trim()
        .slice(0, 24) || "Player";
}

function sanitizeSnapshotIdentity(identity = {}) {
    const sanitized = {
        provider: String(identity.provider || "platform").trim() || "platform",
        userId: String(identity.userId || "").trim(),
        displayName: sanitizeName(identity.displayName || identity.name || "Player"),
        playerId: String(identity.playerId || identity.userId || "").trim(),
        avatarUrl: String(identity.avatarUrl || "").trim(),
        role: String(identity.role || "").trim() || "player"
    };

    if (identity.sessionId) {
        sanitized.sessionId = String(identity.sessionId).trim();
    }

    return sanitized;
}

function buildSnapshotIdentityEntries(identityBySessionId) {
    return Array.from(identityBySessionId.entries()).map(([sessionId, identity]) => [
        sessionId,
        sanitizeSnapshotIdentity(identity)
    ]);
}

function restoreSnapshotIdentityEntries(identityEntries, fallbackIdentityBySessionId) {
    const entries = Array.isArray(identityEntries)
        ? identityEntries.map(([sessionId, identity]) => [sessionId, sanitizeSnapshotIdentity(identity)])
        : Array.from(fallbackIdentityBySessionId || [], ([sessionId, identity]) => [sessionId, sanitizeSnapshotIdentity(identity)]);
    return new Map(entries);
}

module.exports = {
    buildSnapshotIdentityEntries,
    restoreSnapshotIdentityEntries,
    sanitizeName,
    sanitizeSnapshotIdentity
};
