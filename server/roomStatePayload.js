const { getFirstNameDisplayName } = require("./roomIdentity");

function buildRoomStatePlayers({ playerOrder = [], players, identityBySessionId, voiceEnabledBySessionId } = {}) {
    return playerOrder.map((sessionId, index) => {
        const player = players?.get(sessionId);
        const identity = identityBySessionId?.get(sessionId) || {};
        const displayName = getFirstNameDisplayName(
            player ? player.name : identity.displayName || "Player",
            identity.displayName || "Player"
        );
        return {
            sessionId,
            index,
            name: displayName,
            userId: player ? player.userId : "",
            playerId: identity.playerId || player?.userId || "",
            avatarUrl: player?.avatarUrl || identity.avatarUrl || "",
            isConnected: player ? player.isConnected : false,
            isBot: player ? player.isBot : false,
            seatIndex: Number.isInteger(Number(player?.seatIndex)) ? Number(player.seatIndex) : -1,
            seatNumber: Number.isInteger(Number(player?.seatIndex)) && Number(player.seatIndex) >= 0 ? Number(player.seatIndex) + 1 : 0,
            voiceEnabled: Boolean(voiceEnabledBySessionId?.has(sessionId))
        };
    });
}

function buildRoomStatePayload({ room, players } = {}) {
    const connectedHumanPlayers = (() => {
        const playerOrder = Array.from(room?.state?.playerOrder || []);
        const playersMap = room?.state?.players;
        if (playerOrder.length && playersMap) {
            let count = 0;
            for (const sessionId of playerOrder) {
                const player = playersMap.get(sessionId);
                if (!player || player.isBot || !player.isConnected) continue;
                count += 1;
            }
            return count;
        }
        return Array.isArray(room?.clients) ? room.clients.length : 0;
    })();
    return {
        roomId: room.roomId,
        roomCode: room.roomCode,
        roomVisibility: room.roomVisibility,
        stakeKey: room.currentDealStakeKey || room.currentStakeKey,
        stakeAmount: room.currentDealStakeAmount,
        bankAmount: room.currentDealBankAmount,
        currentPlayers: room.state.gameActive ? room.totalPlayers : connectedHumanPlayers,
        humanPlayers: connectedHumanPlayers,
        humanSeats: room.maxClients,
        aiCount: room.aiCount,
        totalPlayers: room.totalPlayers,
        isTeamMode: room.state.isTeamMode,
        gameActive: room.state.gameActive,
        seatSelectionRequired: !room.state.gameActive && room.totalPlayers > 2 && !room.areAllHumanPlayersSeated?.(),
        hostName: getFirstNameDisplayName(room.state.players.get(room.state.playerOrder[0])?.name || "Player", "Player"),
        players
    };
}

module.exports = {
    buildRoomStatePlayers,
    buildRoomStatePayload
};
