const { buildSignedRequestBody } = require("./signedRequest");
const { postReserveEconomyMatch, postSettleEconomyMatch } = require("./economyClient");
const { getSessionIdentities, hasUnlinkedHuman, buildReserveParticipants, buildWinnerUserIds, buildForfeitWinnerUserIds } = require("./economyParticipants");

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

function getResponseContentType(response) {
    return String(response?.headers?.get?.("content-type") || "").toLowerCase();
}

function isLikelyHtmlResponse(text, contentType) {
    const sample = String(text || "").trim();
    return contentType.includes("text/html") || sample.startsWith("<!DOCTYPE html") || sample.startsWith("<!doctype html") || sample.startsWith("<html");
}

function buildSafePlatformApiReason(status, isHtml) {
    if (isHtml) {
        return status === 404 ? "reserve_endpoint_not_found" : "platform_api_unreachable";
    }
    if (status === 404) {
        return "reserve_endpoint_not_found";
    }
    return "platform_api_unreachable";
}

function isDtoValidationErrorPayload(payload) {
    return Boolean(
        payload &&
        typeof payload === "object" &&
        Number(payload.statusCode) === 400 &&
        String(payload.error || "").toLowerCase() === "bad request" &&
        Array.isArray(payload.message)
    );
}

function summarizeValidationMessages(messages) {
    return Array.isArray(messages)
        ? messages
            .map((message) => String(message || "").trim())
            .filter(Boolean)
            .slice(0, 4)
        : [];
}

function previewEconomyResponse(text) {
    return String(text || "").replace(/\s+/g, " ").trim().slice(0, 200);
}

async function readEconomyResponse(response) {
    const contentType = getResponseContentType(response);
    const text = await response.text().catch(() => "");
    const preview = previewEconomyResponse(text);
    const isHtml = isLikelyHtmlResponse(text, contentType);
    let json = null;

    if (!isHtml) {
        const trimmed = String(text || "").trim();
        if (trimmed) {
            try {
                json = JSON.parse(trimmed);
            } catch {
                json = null;
            }
        }
        if (!json && typeof response?.json === "function") {
            try {
                json = await response.json();
            } catch {
                json = null;
            }
        }
    }

    return {
        contentType,
        text,
        preview,
        isHtml,
        json
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
            authToken: platformIdentity.authToken,
            body: buildSignedRequestBody("economy.reserve", {
                roomId: room.roomId,
                roomCode: room.roomCode,
                matchId: room.currentDealMatchId,
                stakeKey: room.currentStakeKey,
                participants
            })
        });
        const economyResponse = await readEconomyResponse(response);

        if (!response.ok) {
            if (isDtoValidationErrorPayload(economyResponse.json)) {
                const validationMessages = summarizeValidationMessages(economyResponse.json.message);
                console.warn("[ROOM] Economy reserve validation failed:", {
                    status: response.status,
                    contentType: economyResponse.contentType,
                    preview: economyResponse.preview,
                    message: validationMessages
                });
                return {
                    ok: false,
                    reason: "economy_validation_failed",
                    status: response.status,
                    contentType: economyResponse.contentType,
                    preview: economyResponse.preview,
                    message: validationMessages
                };
            }
            const reason = buildSafePlatformApiReason(response.status, economyResponse.isHtml);
            console.warn("[ROOM] Economy reserve failed:", {
                status: response.status,
                contentType: economyResponse.contentType,
                preview: economyResponse.preview
            });
            return economyResponse.isHtml
                ? {
                    ok: false,
                    reason,
                    status: response.status,
                    contentType: economyResponse.contentType,
                    preview: economyResponse.preview
                }
                : { ok: false, reason: economyResponse.text || "reserve_failed" };
        }

        const data = economyResponse.json;
        if (!data?.ok) {
            const reason = economyResponse.isHtml
                ? buildSafePlatformApiReason(response.status, true)
                : data?.reason || "reserve_failed";
            console.warn("[ROOM] Economy reserve rejected:", {
                status: response.status,
                contentType: economyResponse.contentType,
                preview: economyResponse.preview,
                reason: data?.reason || "unknown"
            });
            return economyResponse.isHtml
                ? {
                    ok: false,
                    reason,
                    status: response.status,
                    contentType: economyResponse.contentType,
                    preview: economyResponse.preview
                }
                : { ok: false, reason };
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
            authToken: platformIdentity.authToken,
            body: buildSignedRequestBody("economy.settle", {
                roomId: room.roomId,
                matchId: room.currentDealMatchId,
                stakeKey: room.currentDealStakeKey,
                result: winnerUserIds.length ? "win" : "refund",
                winnerUserIds
            })
        });
        const economyResponse = await readEconomyResponse(response);

        if (!response.ok) {
            if (isDtoValidationErrorPayload(economyResponse.json)) {
                const validationMessages = summarizeValidationMessages(economyResponse.json.message);
                throw new Error(`Economy validation failed: ${validationMessages.join("; ") || "Bad Request"}`);
            }
            throw new Error(
                economyResponse.isHtml
                    ? `Round settle failed with ${response.status} (${economyResponse.contentType || "unknown"}): ${economyResponse.preview}`
                    : economyResponse.text || `Round settle failed with ${response.status}`
            );
        }

        const settlement = economyResponse.json;
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

async function settleForfeitStakeForRoom(room, leavingSessionId) {
    if (room.forfeitSettlementMade || room.currentDealStakeKey === "free") {
        return false;
    }

    const platformIdentity = room.getPlatformMatchIdentity();
    if (!platformIdentity) {
        return false;
    }

    const leavingIndex = room.state.playerOrder.indexOf(leavingSessionId);
    const leavingIdentity = room.identityBySessionId.get(leavingSessionId);
    if (leavingIndex === -1 || !leavingIdentity?.userId) {
        return false;
    }

    const winnerUserIds = buildForfeitWinnerUserIds({
        playerOrder: room.state.playerOrder,
        identityBySessionId: room.identityBySessionId,
        isTeamMode: room.state.isTeamMode,
        leavingSessionId,
        leavingIndex
    });

    try {
        const response = await postSettleEconomyMatch({
            baseUrl: process.env.PLATFORM_API_URL,
            authToken: platformIdentity.authToken,
            body: buildSignedRequestBody("economy.settle", {
                roomId: room.roomId,
                matchId: room.currentDealMatchId,
                stakeKey: room.currentDealStakeKey,
                result: winnerUserIds.length ? "loss" : "refund",
                winnerUserIds
            })
        });
        const economyResponse = await readEconomyResponse(response);

        if (!response.ok) {
            if (isDtoValidationErrorPayload(economyResponse.json)) {
                const validationMessages = summarizeValidationMessages(economyResponse.json.message);
                throw new Error(`Economy validation failed: ${validationMessages.join("; ") || "Bad Request"}`);
            }
            throw new Error(
                economyResponse.isHtml
                    ? `Stake forfeit settle failed with ${response.status} (${economyResponse.contentType || "unknown"}): ${economyResponse.preview}`
                    : economyResponse.text || `Stake forfeit settle failed with ${response.status}`
            );
        }

        const summary = economyResponse.json;
        room.forfeitSettlementMade = true;
        room.matchRecorded = true;
        return summary;
    } catch (error) {
        console.warn("[ROOM] Failed to settle forfeit stake:", error);
        return false;
    }
}

module.exports = {
    reserveEconomyStakeForRoom,
    settleEconomyRoundForRoom,
    settleForfeitStakeForRoom
};
