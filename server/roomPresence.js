function buildLivePlayerPayload({
    sessionId,
    room,
    identity = {},
    player = {},
    hostPlayer = null,
    joinedAt = null
} = {}) {
    const isHost = room?.state?.playerOrder?.[0] === sessionId;
    return {
        sessionId,
        roomId: room?.roomId,
        roomCode: room?.roomCode,
        roomVisibility: room?.roomVisibility,
        roomMode: room?.state?.isTeamMode ? "team" : "ffa",
        stakeKey: room?.currentStakeKey,
        stakeAmount: room?.currentDealStakeAmount || 0,
        humanSeats: room?.humanSeats,
        totalPlayers: room?.totalPlayers,
        aiCount: room?.aiCount,
        isTeamMode: room?.state?.isTeamMode,
        provider: identity.provider || "platform",
        userId: player.userId || "",
        playerId: identity.playerId || player.userId || "",
        avatarUrl: identity.avatarUrl || "",
        displayName: player.name,
        hostName: hostPlayer?.name || player.name,
        role: identity.role || (isHost ? "host" : "player"),
        isConnected: true,
        isPlaying: Boolean(room?.state?.gameActive),
        joinedAt: joinedAt || new Date().toISOString()
    };
}

module.exports = {
    buildLivePlayerPayload
};
