const { getFirstNameDisplayName } = require("./roomIdentity");

function buildRoomStatePlayers({ playerOrder = [], players, identityBySessionId, voiceEnabledBySessionId, isTeamMode = false } = {}) {
    return playerOrder.map((sessionId, index) => {
        const player = players?.get(sessionId);
        const identity = identityBySessionId?.get(sessionId) || {};
        const displayName = getFirstNameDisplayName(
            player ? player.name : identity.displayName || "Player",
            identity.displayName || "Player"
        );
        const row = {
            sessionId,
            index,
            name: displayName,
            userId: String(player?.userId || ""),
            playerId: identity.playerId || player?.userId || "",
            avatarUrl: player?.avatarUrl || identity.avatarUrl || "",
            isConnected: player ? player.isConnected : false,
            isBot: player ? player.isBot : false,
            // Bot Takeover (feature-flagged): expose who currently controls the seat
            // so the client can show a "bot is playing" badge and a reclaim button.
            controller: String(player?.controller || "human"),
            takeoverActive: Boolean(player?.takeoverActive),
            takeoverReason: String(player?.takeoverReason || ""),
            seatIndex: Number.isInteger(Number(player?.seatIndex)) ? Number(player.seatIndex) : -1,
            seatNumber: Number.isInteger(Number(player?.seatIndex)) && Number(player.seatIndex) >= 0 ? Number(player.seatIndex) + 1 : 0,
            voiceEnabled: Boolean(voiceEnabledBySessionId?.has(sessionId))
        };
        if (isTeamMode) {
            row.team = Number.isInteger(Number(player?.seatIndex)) && Number(player.seatIndex) >= 0
                ? Number(player.seatIndex) % 2
                : null;
        }
        return row;
    });
}

function buildRoomStartPayload(room, connectedHumanPlayers = 0) {
    const isTeamMode = Boolean(room?.state?.isTeamMode);
    const roomMode = String(room?.roomMode || (isTeamMode ? "team" : "ffa")).trim().toLowerCase();
    const safePlayers = Array.from(room?.state?.players?.values?.() || []);
    const humanPlayers = safePlayers.filter((player) => player && !player.isBot);
    const botPlayers = safePlayers.filter((player) => player && player.isBot);
    const connectedHumans = humanPlayers.filter((player) => Boolean(player.isConnected)).length;
    const seatedHumans = humanPlayers.filter((player) => Boolean(player.isConnected) && Number.isInteger(Number(player.seatIndex)) && Number(player.seatIndex) >= 0).length;

    return {
        roomMode: roomMode === "team" || roomMode === "2v2" || roomMode === "partnership" ? "team" : "ffa",
        isTeamMode,
        maxPlayers: Number(room?.totalPlayers || 0),
        occupiedSeats: safePlayers.filter((player) => Number.isInteger(Number(player?.seatIndex)) && Number(player.seatIndex) >= 0).length,
        humanCount: connectedHumans || Number(connectedHumanPlayers || 0),
        botCount: botPlayers.length,
        readyPlayersCount: isTeamMode ? seatedHumans : connectedHumans,
        botsReadyCount: botPlayers.filter((player) => Boolean(player.isConnected)).length,
        pendingInvitesCount: 0,
        joinedInviteCount: 0,
        lastAutoStartCheckAt: Number(room?._lastAutoStartCheckAt || 0) || 0,
        lastAutoStartBlockedReason: String(room?._lastAutoStartBlockedReason || "").trim() || null,
        lastAutoStartTriggeredAt: Number(room?._lastAutoStartTriggeredAt || 0) || 0
    };
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
        roomPhase: room.state.gameActive
            ? "playing"
            : room.timeoutForfeitPending
                ? "timeout_result"
            : room.lastMoveRevealPending
                ? "last_move_reveal"
                : (room.matchFinished || room.state?.matchOver)
                    ? "match_end"
                    : (room.pendingAdvanceKind === "deal" || room.pendingAdvanceKind === "round")
                        ? "result"
                        : "lobby",
        roomMode,
        scoreMode: isTeamMode ? "team" : "solo",
        stakeKey: room.currentDealStakeKey || room.currentStakeKey,
        stakeAmount: room.currentDealStakeAmount,
        bankAmount: room.currentDealBankAmount,
        requiredStakeAmount: Number(room.timeoutForfeitPending?.requiredStakeAmount || room.currentDealStakeAmount || 0),
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
        matchOver: Boolean(room.state?.matchOver || room.matchFinished),
        gameOverReason: String(room.state?.gameOverReason || room.lastGameEndReason || "").trim(),
        timeoutForfeitPending: Boolean(room.timeoutForfeitPending),
        timeoutLoserIndex: Number.isInteger(Number(room.timeoutForfeitPending?.loserIndex))
            ? Number(room.timeoutForfeitPending.loserIndex)
            : -1,
        timeoutLoserName: String(room.timeoutForfeitPending?.loserName || "").trim(),
        continueExpiresAt: Number(room.timeoutForfeitPending?.expiresAt || 0),
        finishInfo: room.lastFinishInfo || null,
        seatSelectionRequired: !room.state.gameActive && room.totalPlayers > 2 && !room.areAllHumanPlayersSeated?.(),
        hostName: getFirstNameDisplayName(room.state.players.get(room.state.playerOrder[0])?.name || "Player", "Player"),
        players: safePlayers,
        roomStart: buildRoomStartPayload(room, connectedHumanPlayers),
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
