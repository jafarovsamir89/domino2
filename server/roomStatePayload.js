function buildRoomStatePlayers({ playerOrder = [], players, identityBySessionId } = {}) {
    return playerOrder.map((sessionId, index) => {
        const player = players?.get(sessionId);
        const identity = identityBySessionId?.get(sessionId) || {};
        return {
            sessionId,
            index,
            name: player ? player.name : "Player",
            userId: player ? player.userId : "",
            playerId: identity.playerId || player?.userId || "",
            avatarUrl: player?.avatarUrl || identity.avatarUrl || "",
            isConnected: player ? player.isConnected : false,
            isBot: player ? player.isBot : false
        };
    });
}

function buildRoomStatePayload({ room, players } = {}) {
    return {
        roomId: room.roomId,
        roomCode: room.roomCode,
        roomVisibility: room.roomVisibility,
        stakeKey: room.currentDealStakeKey || room.currentStakeKey,
        stakeAmount: room.currentDealStakeAmount,
        bankAmount: room.currentDealBankAmount,
        currentPlayers: room.state.gameActive ? room.totalPlayers : room.clients.length,
        humanPlayers: room.clients.length,
        humanSeats: room.maxClients,
        aiCount: room.aiCount,
        totalPlayers: room.totalPlayers,
        isTeamMode: room.state.isTeamMode,
        gameActive: room.state.gameActive,
        hostName: room.state.players.get(room.state.playerOrder[0])?.name || "Player",
        players
    };
}

module.exports = {
    buildRoomStatePlayers,
    buildRoomStatePayload
};
