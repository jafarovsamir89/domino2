function getSessionIdentities({ playerOrder = [], players, identityBySessionId } = {}) {
    return playerOrder
        .map((sessionId, index) => {
            const identity = identityBySessionId?.get(sessionId);
            const player = players?.get(sessionId);
            if (!identity) {
                return null;
            }
            return { identity, player, index };
        })
        .filter(Boolean);
}

function hasUnlinkedHuman(sessionIdentities = []) {
    return sessionIdentities.some(({ identity }) => identity.provider !== "platform" && identity.provider !== "bot");
}

function buildReserveParticipants({ sessionIdentities = [], isTeamMode = false } = {}) {
    return sessionIdentities
        .filter(({ identity }) => identity.provider === "platform" && identity.userId)
        .map(({ identity, player, index }) => ({
            playerId: identity.playerId || "",
            userId: identity.userId,
            displayName: player ? player.name : identity.displayName,
            teamIndex: isTeamMode ? index % 2 : null
        }));
}

function buildWinnerUserIds({ playerOrder = [], identityBySessionId, isTeamMode = false, winnerIndex } = {}) {
    return playerOrder
        .filter((sessionId, index) => {
            if (isTeamMode) {
                return (index % 2) === (winnerIndex % 2);
            }
            return index === winnerIndex;
        })
        .map((sessionId) => identityBySessionId?.get(sessionId))
        .filter((identity) => identity?.provider === "platform" && identity.userId)
        .map((identity) => identity.userId);
}

function buildForfeitWinnerUserIds({ playerOrder = [], identityBySessionId, isTeamMode = false, leavingSessionId, leavingIndex } = {}) {
    const leavingTeamIndex = isTeamMode ? leavingIndex % 2 : null;
    return playerOrder
        .filter((sessionId, index) => {
            if (sessionId === leavingSessionId) return false;
            if (isTeamMode && leavingTeamIndex !== null) {
                return (index % 2) !== leavingTeamIndex;
            }
            return true;
        })
        .map((sessionId) => identityBySessionId?.get(sessionId))
        .filter((identity) => identity?.provider === "platform" && identity.userId)
        .map((identity) => identity.userId);
}

module.exports = {
    getSessionIdentities,
    hasUnlinkedHuman,
    buildReserveParticipants,
    buildWinnerUserIds,
    buildForfeitWinnerUserIds
};
