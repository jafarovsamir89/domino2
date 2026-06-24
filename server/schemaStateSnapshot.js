function buildSchemaStateSnapshotData({ state, roomMode = "", scoreMode = "" }) {
    const playerOrder = Array.from(state?.playerOrder || []);

    return {
        playerOrder,
        currentPlayerIndex: state?.currentPlayerIndex,
        boneyardCount: state?.boneyardCount,
        gameActive: state?.gameActive,
        matchRound: state?.matchRound,
        deal: state?.deal,
        mode: String(state?.mode || "telefon").trim() || "telefon",
        boardJson: state?.boardJson,
        isTeamMode: state?.isTeamMode,
        roomMode: String(roomMode || (state?.isTeamMode ? "team" : "ffa")).trim() || "ffa",
        scoreMode: String(scoreMode || (state?.isTeamMode ? "team" : "solo")).trim() || "solo",
        playerCount: state?.playerCount,
        turnDeadlineAt: state?.turnDeadlineAt || 0,
        turnVersion: state?.turnVersion || 1,
        teamScores: Array.from(state?.teamScores || [0, 0]),
        teamRoundWins: Array.from(state?.teamRoundWins || [0, 0]),
        players: playerOrder.map((sessionId) => {
            const player = state?.players?.get(sessionId);
            const seatIndex = Number.isInteger(Number(player?.seatIndex)) ? Number(player.seatIndex) : -1;
            return {
                sessionId,
                name: player?.name || "Player",
                userId: player?.userId || "",
                avatarUrl: player?.avatarUrl || "",
                score: player?.score || 0,
                roundWins: player?.roundWins || 0,
                handCount: player?.handCount || 0,
                isConnected: player?.isConnected || false,
                isBot: player?.isBot || false,
                seatIndex,
                controller: player?.controller || "human",
                takeoverActive: player?.takeoverActive || false,
                takeoverReason: player?.takeoverReason || "",
                takeoverSince: player?.takeoverSince || 0
            };
        })
    };
}

function normalizeRestoredPlayerOrder({ snapshot, playerRows }) {
    if (Array.isArray(snapshot?.playerOrder) && snapshot.playerOrder.length) {
        return Array.from(snapshot.playerOrder);
    }
    return Array.isArray(playerRows)
        ? playerRows.map((entry) => String(entry?.sessionId || "")).filter(Boolean)
        : [];
}

function buildRestoredPlayerRows({ playerRows, sanitizeName }) {
    return Array.isArray(playerRows)
        ? playerRows
            .map((entry) => {
                const sessionId = String(entry?.sessionId || "").trim();
                if (!sessionId) return null;
                return {
                    sessionId,
                    name: sanitizeName(entry?.name || "Player"),
                    userId: String(entry?.userId || ""),
                    score: Number(entry?.score || 0),
                    roundWins: Number(entry?.roundWins || 0),
                    handCount: Number(entry?.handCount || 0),
                    avatarUrl: String(entry?.avatarUrl || "").trim(),
                    isBot: Boolean(entry?.isBot),
                    isConnected: Boolean(entry?.isBot) || Boolean(entry?.takeoverActive),
                    seatIndex: Number.isInteger(Number(entry?.seatIndex)) ? Number(entry.seatIndex) : -1,
                    controller: String(entry?.controller || "human"),
                    takeoverActive: Boolean(entry?.takeoverActive),
                    takeoverReason: String(entry?.takeoverReason || ""),
                    takeoverSince: Number(entry?.takeoverSince || 0)
                };
            })
            .filter(Boolean)
        : [];
}

function buildRestoredSchemaStateData({ snapshot, currentState, totalPlayers, sanitizeName }) {
    const playerRows = Array.isArray(snapshot?.players) ? snapshot.players : [];
    const players = buildRestoredPlayerRows({ playerRows, sanitizeName });
    const playerOrder = normalizeRestoredPlayerOrder({ snapshot, playerRows });

    return {
        playerOrder,
        players,
        currentPlayerIndex: Number(snapshot?.currentPlayerIndex || 0),
        boneyardCount: Number(snapshot?.boneyardCount || 0),
        gameActive: Boolean(snapshot?.gameActive),
        matchRound: Number(snapshot?.matchRound || 1),
        deal: Number(snapshot?.deal || 1),
        mode: String(snapshot?.mode || "telefon").trim() || "telefon",
        boardJson: snapshot?.boardJson || "{}",
        isTeamMode: Boolean(snapshot?.isTeamMode),
        roomMode: String(snapshot?.roomMode || (snapshot?.isTeamMode ? "team" : "ffa")).trim() || "ffa",
        scoreMode: String(snapshot?.scoreMode || (snapshot?.isTeamMode ? "team" : "solo")).trim() || "solo",
        playerCount: Number(snapshot?.playerCount || totalPlayers || 2),
        turnDeadlineAt: Number(snapshot?.turnDeadlineAt || 0),
        turnVersion: Number(snapshot?.turnVersion || 1),
        teamScores: Array.isArray(snapshot?.teamScores) ? snapshot.teamScores.map((value) => Number(value || 0)) : [0, 0],
        teamRoundWins: Array.isArray(snapshot?.teamRoundWins) ? snapshot.teamRoundWins.map((value) => Number(value || 0)) : [0, 0]
    };
}

module.exports = {
    buildSchemaStateSnapshotData,
    normalizeRestoredPlayerOrder,
    buildRestoredPlayerRows,
    buildRestoredSchemaStateData
};
