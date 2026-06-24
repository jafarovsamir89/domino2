"use strict";

/**
 * Bot Takeover
 * ------------
 * When a human seat becomes "absent" for longer than the inactivity timer —
 * for ANY reason (lost internet, closed app/page, or simply not moving) — a bot
 * takes control of that seat and plays on to the end of the match. The other
 * players are notified that the player left and a bot is now playing. If the
 * human comes back (reconnect, or pressing "resume control" while still online),
 * the bot steps aside and the human continues; the table is notified again.
 *
 * Product decisions baked in (locked with product owner):
 *  - Explicit "Leave" button = instant forfeit, NOT a bot takeover.
 *  - The bot plays for REAL stakes on behalf of the absent human.
 *  - Bot difficulty is "medium" (fair) to avoid "disconnect-to-win" exploits.
 *  - Takeover triggers ~30s after the seat goes absent (same as the turn timer).
 *  - If BOTH humans are gone, the match is settled by current points (no full
 *    bot-vs-bot simulation) — handled in DominoRoom (see integration doc).
 *
 * This module is self-contained and only touches the `room` object passed in.
 * It is gated behind a default-off feature flag, so merging it changes nothing
 * until DominoRoom.js is wired up (see server/BOT_TAKEOVER_INTEGRATION.md).
 */

function toPositiveInt(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

const BOT_TAKEOVER_CONFIG = {
    // Master switch. Off by default so merging this module changes nothing.
    enabled: String(process.env.DOMINO_BOT_TAKEOVER || "").trim() === "1",
    // How long after a seat becomes "absent" before a bot takes over.
    // Matches the existing 30s turn timer by product decision.
    takeoverDelayMs: toPositiveInt(process.env.DOMINO_BOT_TAKEOVER_DELAY_MS, 30000),
    // Minimum time a bot must hold the seat before a human can reclaim it,
    // to avoid flapping on a flaky connection.
    minBotControlMs: toPositiveInt(process.env.DOMINO_BOT_MIN_CONTROL_MS, 3000),
    // Anti-abuse: max number of bot takeovers a single user can trigger per match.
    maxTakeoversPerMatch: toPositiveInt(process.env.DOMINO_BOT_MAX_TAKEOVERS, 8),
    // Difficulty of the substitute bot. "medium" == fair by product decision.
    botDifficulty: String(process.env.DOMINO_BOT_TAKEOVER_DIFFICULTY || "medium").trim() || "medium",
};

const CONTROLLER_HUMAN = "human";
const CONTROLLER_BOT = "bot";

const TAKEOVER_REASON = {
    DISCONNECT: "disconnect",
    PAGE_CLOSE: "page_close",
    IDLE: "idle",
};

function isControlledByBotTakeover(player) {
    return Boolean(player) && player.controller === CONTROLLER_BOT && player.takeoverActive === true;
}

class BotTakeoverController {
    constructor(room) {
        this.room = room;
        // userId -> number of takeovers in the current match (anti-abuse).
        this.takeoverCounts = new Map();
    }

    get config() {
        return BOT_TAKEOVER_CONFIG;
    }

    isEnabled() {
        return BOT_TAKEOVER_CONFIG.enabled === true;
    }

    /** Call when a new match starts to clear anti-abuse counters. */
    resetForNewMatch() {
        this.takeoverCounts.clear();
    }

    isBotControlled(player) {
        return isControlledByBotTakeover(player);
    }

    /** A human may reclaim only after the bot has held the seat a minimum time. */
    canHumanReclaim(player) {
        if (!isControlledByBotTakeover(player)) return false;
        const since = Number(player.takeoverSince || 0);
        if (!since) return true;
        return Date.now() - since >= BOT_TAKEOVER_CONFIG.minBotControlMs;
    }

    getTakeoverCount(userId) {
        const key = String(userId || "").trim();
        if (!key) return 0;
        return this.takeoverCounts.get(key) || 0;
    }

    hasReachedTakeoverLimit(player) {
        const userId = String(player?.userId || "").trim();
        if (!userId) return false;
        return this.getTakeoverCount(userId) >= BOT_TAKEOVER_CONFIG.maxTakeoversPerMatch;
    }

    /**
     * Switch a human seat to bot control. Returns true on success.
     * Returns false when takeover is not allowed (flag off, not a human seat,
     * game not active, anti-abuse limit reached) so the caller can fall back to
     * the existing forfeit behaviour.
     */
    begin(player, reason = TAKEOVER_REASON.DISCONNECT) {
        if (!this.isEnabled()) return false;
        if (!player) return false;
        if (player.isBot) return false; // an original bot; nothing to take over
        if (isControlledByBotTakeover(player)) return true; // already taken over
        if (!this.room || !this.room.state || !this.room.state.gameActive) return false;
        if (this.hasReachedTakeoverLimit(player)) return false;

        player.controller = CONTROLLER_BOT;
        player.takeoverActive = true;
        player.takeoverReason = String(reason || TAKEOVER_REASON.DISCONNECT);
        player.takeoverSince = Date.now();
        player.isConnected = true;

        const userId = String(player.userId || "").trim();
        if (userId) this.takeoverCounts.set(userId, this.getTakeoverCount(userId) + 1);

        this._broadcastTakeover(player);

        // Let the room schedule the bot's move if it is this seat's turn now.
        try {
            if (typeof this.room.onBotTakeoverActivated === "function") {
                this.room.onBotTakeoverActivated(player);
            }
        } catch (err) {
            console.warn("[BotTakeover] onBotTakeoverActivated failed:", (err && err.message) || err);
        }
        return true;
    }

    /**
     * Hand control back to the human. Returns true on success.
     * `requestUserId` (optional) must match the seat's userId — prevents another
     * user from stealing the seat away from the bot.
     */
    resume(player, options) {
        const requestUserId = options && options.requestUserId != null ? options.requestUserId : null;
        if (!this.isEnabled()) return false;
        if (!isControlledByBotTakeover(player)) return false;
        if (options?.ignoreMinControlMs !== true && !this.canHumanReclaim(player)) return false;
        if (requestUserId != null) {
            const seatUser = String(player.userId || "").trim();
            if (seatUser && String(requestUserId).trim() !== seatUser) return false;
        }

        player.controller = CONTROLLER_HUMAN;
        player.takeoverActive = false;
        player.takeoverReason = "";
        player.takeoverSince = 0;
        player.isConnected = true;

        this._broadcastResume(player);

        try {
            if (typeof this.room.onHumanControlResumed === "function") {
                this.room.onHumanControlResumed(player);
            }
        } catch (err) {
            console.warn("[BotTakeover] onHumanControlResumed failed:", (err && err.message) || err);
        }
        return true;
    }

    _seatLabel(player) {
        return {
            seatIndex: Number.isInteger(Number(player && player.seatIndex)) ? Number(player.seatIndex) : -1,
            name: String((player && player.name) || "Player"),
            userId: String((player && player.userId) || ""),
        };
    }

    _broadcastTakeover(player) {
        const info = this._seatLabel(player);
        try {
            if (typeof this.room.broadcast === "function") {
                this.room.broadcast("bot_takeover", {
                    seatIndex: info.seatIndex,
                    name: info.name,
                    userId: info.userId,
                    reason: String(player.takeoverReason || ""),
                    ts: Date.now(),
                });
                this.room.broadcast("msg", {
                    key: "bot_takeover",
                    values: { name: info.name },
                    text: info.name + " \u043f\u043e\u043a\u0438\u043d\u0443\u043b(\u0430) \u043c\u0430\u0442\u0447 \u2014 \u0437\u0430 \u043d\u0435\u0433\u043e \u0438\u0433\u0440\u0430\u0435\u0442 \u0431\u043e\u0442",
                    time: 3500,
                });
            }
        } catch (err) {
            console.warn("[BotTakeover] broadcast takeover failed:", (err && err.message) || err);
        }
    }

    _broadcastResume(player) {
        const info = this._seatLabel(player);
        try {
            if (typeof this.room.broadcast === "function") {
                this.room.broadcast("bot_resume", {
                    seatIndex: info.seatIndex,
                    name: info.name,
                    userId: info.userId,
                    ts: Date.now(),
                });
                this.room.broadcast("msg", {
                    key: "bot_resume",
                    values: { name: info.name },
                    text: info.name + " \u0432\u0435\u0440\u043d\u0443\u043b\u0441\u044f(\u0430\u0441\u044c) \u2014 \u0431\u043e\u0442 \u043f\u043e\u043a\u0438\u043d\u0443\u043b \u0441\u0442\u043e\u043b",
                    time: 3500,
                });
            }
        } catch (err) {
            console.warn("[BotTakeover] broadcast resume failed:", (err && err.message) || err);
        }
    }
}

module.exports = {
    BOT_TAKEOVER_CONFIG,
    CONTROLLER_HUMAN,
    CONTROLLER_BOT,
    TAKEOVER_REASON,
    BotTakeoverController,
    isControlledByBotTakeover,
};
