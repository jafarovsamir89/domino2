const { getFirstNameDisplayName } = require("./roomIdentity");

function buildRoomStatePlayers({ playerOrder = [], players, identityBySessionId, voiceEnabledBySessionId, isTeamMode = false } = {}) {
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
            team: isTeamMode && Number.isInteger(Number(player?.seatIndex)) && Number(player.seatIndex) >= 0
                ? Number(player.seatIndex) % 2
                : null,
            voiceEnabled: Boolean(voiceEnabledBySessionId?.has(sessionId))
        };
    });
}

function buildRoomStatePayload({ room, players } = {}) {
    const isTeamMode = Boolean(room?.state?.isTeamMode);
    const normalizedRoomMode = String(room?.roomMode || (isTeamMode ? "team" : "ffa")).trim().toLowerCase();
    const roomMode = normalizedRoomMode === "team" || normalizedRoomMode === "2v2" || normalizedRoomMode === "partnership"
        ? "team"
        : normalizedRoomMode === "ffa" || normalizedRoomMode === "solo"
            ? "ffa"
            : (isTeamMode ? "team" : "ffa");
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
    const safePlayers = buildRoomStatePlayers({
        playerOrder: room?.state?.playerOrder,
        players: room?.state?.players,
        identityBySessionId: room?.identityBySessionId,
        voiceEnabledBySessionId: room?.voiceEnabledBySessionId,
        isTeamMode
    });
    return {
        roomId: room.roomId,
        roomCode: room.roomCode,
        roomVisibility: room.roomVisibility,
        roomMode,
        scoreMode: isTeamMode ? "team" : "solo",
        stakeKey: room.currentDealStakeKey || room.currentStakeKey,
        stakeAmount: room.currentDealStakeAmount,
        bankAmount: room.currentDealBankAmount,
        turnDeadlineAt: Number(room.state?.turnDeadlineAt || room.turnDeadlineAt || 0),
        turnDurationMs: Number(room.state?.turnDurationMs || room.turnTimeoutMs || 0),
        serverNow: Number(room.state?.serverNow || Date.now()),
        turnVersion: Number(room.state?.turnVersion || 1),
        currentPlayers: room.state.gameActive ? room.totalPlayers : connectedHumanPlayers,
        humanPlayers: connectedHumanPlayers,
        humanSeats: room.maxClients,
        aiCount: room.aiCount,
        totalPlayers: room.totalPlayers,
        isTeamMode,
        gameActive: room.state.gameActive,
        seatSelectionRequired: !room.state.gameActive && room.totalPlayers > 2 && !room.areAllHumanPlayersSeated?.(),
        hostName: getFirstNameDisplayName(room.state.players.get(room.state.playerOrder[0])?.name || "Player", "Player"),
        players: safePlayers,
        teamScores: isTeamMode ? Array.from(room?.state?.teamScores || [0, 0]) : [],
        teamRoundWins: isTeamMode ? Array.from(room?.state?.teamRoundWins || [0, 0]) : [],
        teams: isTeamMode ? [
            {
                index: 0,
                name: "Team A",
                score: Number(room?.state?.teamScores?.[0] || 0),
                roundWins: Number(room?.state?.teamRoundWins?.[0] || 0),
                memberSessionIds: safePlayers.filter((player) => player?.team === 0).map((player) => player.sessionId),
                memberPlayerIds: safePlayers.filter((player) => player?.team === 0).map((player) => player.playerId).filter(Boolean)
            },
            {
                index: 1,
                name: "Team B",
                score: Number(room?.state?.teamScores?.[1] || 0),
                roundWins: Number(room?.state?.teamRoundWins?.[1] || 0),
                memberSessionIds: safePlayers.filter((player) => player?.team === 1).map((player) => player.sessionId),
                memberPlayerIds: safePlayers.filter((player) => player?.team === 1).map((player) => player.playerId).filter(Boolean)
            }
        ] : []
    };
}

module.exports = {
    buildRoomStatePlayers,
    buildRoomStatePayload
};
