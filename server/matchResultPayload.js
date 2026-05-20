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
    winnerIndex = 0
} = {}) {
    const winnerTeamIndex = isTeamMode ? (winnerIndex % 2) : null;
    const rows = [];
    for (let i = 0; i < playerOrder.length; i++) {
        const sid = playerOrder[i];
        const player = players?.get(sid);
        if (!player || !player.userId) continue;
        const teamIndex = isTeamMode ? (i % 2) : null;
        rows.push({
            userId: player.userId,
            name: player.name,
            isSelf: false,
            teamIndex,
            winnerKey: isTeamMode ? `team:${teamIndex}` : `player:${i}`,
            points: isTeamMode ? teamScores[teamIndex] : player.score,
            roundWins: isTeamMode ? teamRoundWins[teamIndex] : player.roundWins,
            result: isTeamMode
                ? (teamIndex === winnerTeamIndex ? "win" : "loss")
                : (i === winnerIndex ? "win" : "loss")
        });
    }
    return rows;
}

function buildPlatformMatchPayload({
    isTeamMode = false,
    roomId,
    stakeKey,
    playerOrder = [],
    players,
    teamScores = [],
    teamRoundWins = [],
    winnerIndex = 0
} = {}) {
    const winnerKey = buildWinnerKey({ isTeamMode, winnerIndex });
    const teams = buildMatchTeams({ isTeamMode, teamScores, teamRoundWins });
    const participants = buildMatchParticipantRows({
        playerOrder,
        players,
        isTeamMode,
        teamScores,
        teamRoundWins,
        winnerIndex
    });

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
        winnerKey,
        result: "win",
        stakeKey,
        teams,
        participants
    };
}

module.exports = {
    buildWinnerKey,
    buildMatchTeams,
    buildMatchParticipantRows,
    buildPlatformMatchPayload
};
