const { buildSignedRequestBody } = require("./signedRequest");
const { postReserveEconomyMatch } = require("./economyClient");
const { getSessionIdentities, hasUnlinkedHuman, buildReserveParticipants } = require("./economyParticipants");

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

module.exports = {
    reserveEconomyStakeForRoom
};
