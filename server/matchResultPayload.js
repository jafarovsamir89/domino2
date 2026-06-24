function buildWinnerKey({ isTeamMode = false, winnerIndex = 0 } = {}) {
    return isTeamMode ? `team:${winnerIndex % 2}` : `player:${winnerIndex}`;
}

function buildMatchTeams({ isTeamMode = false, teamScores = [], teamRoundWins = [] } = {}) {
    if (!isTeamMode) return [];
    return [
        { memberIds: [], score: teamScores[0], roundWins: teamRoundWins[0] },
        { memberIds: [], score: teamScores[1], roundWins: teamRoundWins[1] }
    ];
}

function buildMatchParticipantRows({
    playerOrder = [],
    players,
    isTeamMode = false,
    teamScores = [],
    teamRoundWins = [],
    winnerIndex = 0,
    matchOutcome = "normal"
} = {}) {
    const winnerTeamIndex = isTeamMode ? (winnerIndex % 2) : null;
    const normalizedMatchOutcome = String(matchOutcome || "normal").trim().toLowerCase() || "normal";
    const isDrawOutcome = normalizedMatchOutcome === "all_absent" || normalizedMatchOutcome === "draw" || normalizedMatchOutcome === "refund";
    const rows = [];
    for (let i = 0; i < playerOrder.length; i++) {
        const sid = playerOrder[i];
        const player = players?.get(sid);
        if (!player || !player.userId) continue;
        const teamIndex = isTeamMode ? (i % 2) : null;
        const row = {
            userId: player.userId,
            name: player.name,
            teamIndex,
            winnerKey: isDrawOutcome ? "" : (isTeamMode ? `team:${teamIndex}` : `player:${i}`),
            points: isTeamMode ? teamScores[teamIndex] : player.score,
            roundWins: isTeamMode ? teamRoundWins[teamIndex] : player.roundWins,
            result: isDrawOutcome
                ? "draw"
                : isTeamMode
                ? (teamIndex === winnerTeamIndex ? "win" : "loss")
                : (i === winnerIndex ? "win" : "loss")
        };
        if (player.isBot === true) {
            row.isBot = true;
        }
        rows.push(row);
    }
    return rows;
}

// Only these fields are accepted by the API MatchesParticipantDto.
// Any extra properties (e.g. isSelf, isConnected, avatarUrl, seatIndex, handCount, score)
// will cause a 400 Bad Request from the NestJS validation pipe (forbidNonWhitelisted).
const PARTICIPANT_ALLOWED_KEYS = ["userId", "name", "teamIndex", "winnerKey", "points", "roundWins", "result", "isBot"];

function sanitizeParticipant(row) {
    const clean = {};
    for (const key of PARTICIPANT_ALLOWED_KEYS) {
        if (key in row) clean[key] = row[key];
    }
    return clean;
}

function buildPlatformMatchPayload({
    isTeamMode = false,
    roomId,
    stakeKey,
    sourceMatchId = "",
    playerOrder = [],
    players,
    teamScores = [],
    teamRoundWins = [],
    winnerIndex = 0,
    matchOutcome = "normal",
    forfeitUserIds = [],
    forfeitPlayerIds = []
} = {}) {
    const normalizedMatchOutcome = String(matchOutcome || "normal").trim().toLowerCase() || "normal";
    const isDrawOutcome = normalizedMatchOutcome === "all_absent" || normalizedMatchOutcome === "draw" || normalizedMatchOutcome === "refund";
    const winnerKey = isDrawOutcome ? "" : buildWinnerKey({ isTeamMode, winnerIndex });
    const teams = buildMatchTeams({ isTeamMode, teamScores, teamRoundWins });
    const participants = buildMatchParticipantRows({
        playerOrder,
        players,
        isTeamMode,
        teamScores,
        teamRoundWins,
        winnerIndex,
        matchOutcome: normalizedMatchOutcome
    }).map(sanitizeParticipant);

    if (isTeamMode) {
        for (let i = 0; i < playerOrder.length; i++) {
            const sid = playerOrder[i];
            const player = players?.get(sid);
            if (!player || !player.userId) continue;
            const teamIndex = i % 2;
            if (teams[teamIndex]) {
                teams[teamIndex].memberIds.push(player.userId);
            }
        }
    }

    return {
        mode: isTeamMode ? "team" : "ffa",
        isTeamMode,
        roomId,
        sourceMatchId: String(sourceMatchId || "").trim(),
        winnerKey,
        result: isDrawOutcome ? "draw" : "win",
        stakeKey,
        matchOutcome: normalizedMatchOutcome,
        forfeitUserIds: Array.isArray(forfeitUserIds) ? forfeitUserIds.map((value) => String(value || "").trim()).filter(Boolean) : [],
        forfeitPlayerIds: Array.isArray(forfeitPlayerIds) ? forfeitPlayerIds.map((value) => String(value || "").trim()).filter(Boolean) : [],
        teams,
        participants
    };
}

module.exports = {
    buildWinnerKey,
    buildMatchTeams,
    buildMatchParticipantRows,
    buildPlatformMatchPayload,
    sanitizeParticipant
};
