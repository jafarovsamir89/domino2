function buildRestoredRoomMetadata({ room, data }) {
    return {
        roomCode: data.roomCode || room.roomCode,
        roomVisibility: String(data.roomVisibility || room.roomVisibility || "closed").trim() === "open" ? "open" : "closed",
        humanSeats: data.humanSeats ?? room.humanSeats,
        totalPlayers: data.totalPlayers ?? room.totalPlayers,
        aiCount: data.aiCount ?? room.aiCount,
        dlossThreshold: data.dlossThreshold ?? room.dlossThreshold,
        instantWinEnabled: data.instantWinEnabled ?? room.instantWinEnabled,
        aiDifficulty: data.aiDifficulty ?? room.aiDifficulty,
        gameMode: data.gameMode ?? data.mode ?? room.gameMode ?? room.mode ?? "telefon",
        currentStakeKey: data.currentStakeKey ?? room.currentStakeKey,
        currentDealMatchId: data.currentDealMatchId ?? room.currentDealMatchId,
        currentDealStakeKey: data.currentDealStakeKey ?? room.currentDealStakeKey,
        currentDealStakeAmount: data.currentDealStakeAmount ?? room.currentDealStakeAmount,
        currentDealBankAmount: data.currentDealBankAmount ?? room.currentDealBankAmount,
        economyReservationMade: Boolean(data.economyReservationMade),
        lastReservedMatchRound: data.lastReservedMatchRound ?? room.lastReservedMatchRound,
        matchRecorded: data.matchRecorded ?? room.matchRecorded,
        forfeitSettlementMade: data.forfeitSettlementMade ?? room.forfeitSettlementMade,
        lastRoundEconomySummary: data.lastRoundEconomySummary ?? room.lastRoundEconomySummary,
        lastDealWinner: data.lastDealWinner ?? room.lastDealWinner,
        botIds: Array.isArray(data.botIds) ? data.botIds : (Array.isArray(room.botIds) ? room.botIds : []),
        playerMissingSuits: Array.isArray(data.playerMissingSuits)
            ? data.playerMissingSuits.map((arr) => new Set(Array.isArray(arr) ? arr : []))
            : (Array.isArray(room.playerMissingSuits) ? room.playerMissingSuits : [])
    };
}

module.exports = {
    buildRestoredRoomMetadata
};
