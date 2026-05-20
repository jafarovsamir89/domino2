const { buildSignedRequestBody } = require("./signedRequest");
const { postReserveEconomyMatch, postSettleEconomyMatch } = require("./economyClient");
const { getSessionIdentities, hasUnlinkedHuman, buildReserveParticipants, buildWinnerUserIds } = require("./economyParticipants");

function buildRefundLikeSummary(room) {
    return {
        stakeKey: room.currentDealStakeKey,
        stakeAmount: room.currentDealStakeAmount,
        bankAmount: Math.max(0, room.currentDealBankAmount || 0),
        commission: 0,
        payout: 0,
        winners: 0,
        result: "refund",
        reservations: []
    };
}

async function reserveEconomyStakeForRoom(room) {
    if (room.currentStakeKey === "free") {
        room.currentDealStakeAmount = 0;
        room.currentDealBankAmount = 0;
        room.economyReservationMade = true;
        return { ok: true, reserved: 0, stakeKey: "free", bankAmount: 0 };
    }

    const platformIdentity = room.getPlatformMatchIdentity();
    if (!platformIdentity) {
        return { ok: false, reason: "missing_platform_identity" };
    }

    const sessionIdentities = getSessionIdentities({
        playerOrder: room.state.playerOrder,
        players: room.state.players,
        identityBySessionId: room.identityBySessionId
    });

    const unlinkedHuman = hasUnlinkedHuman(sessionIdentities);
    if (unlinkedHuman) {
        room.broadcast("msg", { key: "room-closed-auth-required", time: 2400 });
        room.currentDealStakeAmount = 0;
        room.currentDealBankAmount = 0;
        return { ok: false, reason: "auth_required" };
    }

    const participants = buildReserveParticipants({
        sessionIdentities,
        isTeamMode: room.state.isTeamMode
    });

    if (!participants.length) {
        room.economyReservationMade = true;
        return { ok: true, reserved: 0, stakeKey: room.currentStakeKey, bankAmount: 0 };
    }

    try {
        const response = await postReserveEconomyMatch({
            baseUrl: process.env.PLATFORM_API_URL,
            body: buildSignedRequestBody("economy.reserve", {
                roomId: room.roomId,
                roomCode: room.roomCode,
                matchId: room.currentDealMatchId,
                stakeKey: room.currentStakeKey,
                participants
            })
        });

        if (!response.ok) {
            const text = await response.text().catch(() => "");
            console.warn("[ROOM] Economy reserve failed:", text || response.status);
            return { ok: false, reason: text || "reserve_failed" };
        }

        const data = await response.json().catch(() => null);
        if (!data?.ok) {
            console.warn("[ROOM] Economy reserve rejected:", data?.reason || "unknown");
            return { ok: false, reason: data?.reason || "reserve_failed" };
        }

        room.economyReservationMade = true;
        room.currentDealStakeKey = room.currentStakeKey;
        room.currentDealStakeAmount = Math.max(0, data?.reserved ? Math.floor(data.reserved / Math.max(1, participants.length)) : 0);
        room.currentDealBankAmount = Math.max(0, data?.reserved || room.currentDealStakeAmount * participants.length);
        room.broadcast("msg", {
            key: "msg-bank-reserved",
            values: { amount: room.currentDealBankAmount, players: participants.length },
            time: 2000
        });
        return {
            ok: true,
            reserved: data?.reserved || 0,
            stakeKey: room.currentStakeKey,
            bankAmount: room.currentDealBankAmount,
            participants: participants.length
        };
    } catch (error) {
        console.warn("[ROOM] Economy reserve error:", error);
        return { ok: false, reason: "reserve_error" };
    }
}

async function settleEconomyRoundForRoom(room, winnerIndex) {
    if (room.currentStakeKey === "free") {
        room.pendingEconomySettlement = Promise.resolve();
        room.lastRoundEconomySummary = null;
        return null;
    }

    const platformIdentity = room.getPlatformMatchIdentity();
    if (!platformIdentity) {
        return null;
    }

    const winnerUserIds = buildWinnerUserIds({
        playerOrder: room.state.playerOrder,
        identityBySessionId: room.identityBySessionId,
        isTeamMode: room.state.isTeamMode,
        winnerIndex
    });

    try {
        const response = await postSettleEconomyMatch({
            baseUrl: process.env.PLATFORM_API_URL,
            body: buildSignedRequestBody("economy.settle", {
                roomId: room.roomId,
                matchId: room.currentDealMatchId,
                stakeKey: room.currentDealStakeKey,
                result: winnerUserIds.length ? "win" : "refund",
                winnerUserIds
            })
        });

        if (!response.ok) {
            const text = await response.text().catch(() => "");
            throw new Error(text || `Round settle failed with ${response.status}`);
        }

        const settlement = await response.json().catch(() => null);
        const summary = settlement?.ok ? {
            stakeKey: room.currentDealStakeKey,
            stakeAmount: room.currentDealStakeAmount,
            bankAmount: Math.max(0, settlement.bank || room.currentDealBankAmount || 0),
            commission: Math.max(0, settlement.commission || 0),
            payout: Math.max(0, settlement.payout || 0),
            winners: Math.max(0, settlement.winners || 0),
            result: settlement.result || "win",
            reservations: Array.isArray(settlement.reservations) ? settlement.reservations : []
        } : buildRefundLikeSummary(room);

        room.currentDealBankAmount = 0;
        room.currentDealStakeAmount = 0;
        room.currentDealStakeKey = room.currentStakeKey;
        room.pendingEconomySettlement = Promise.resolve();
        room.lastRoundEconomySummary = summary;
        return summary;
    } catch (error) {
        console.warn("[ROOM] Failed to settle round stake:", error);
        room.lastRoundEconomySummary = buildRefundLikeSummary(room);
        return room.lastRoundEconomySummary;
    }
}

module.exports = {
    reserveEconomyStakeForRoom,
    settleEconomyRoundForRoom
};
