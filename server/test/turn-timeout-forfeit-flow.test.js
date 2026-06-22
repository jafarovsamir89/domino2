const test = require("node:test");
const assert = require("node:assert/strict");

const DominoRoom = require("../DominoRoom");

test("endRoundByTimeoutForfeit broadcasts timeout forfeit state and arms continue expiry", async () => {
    const room = Object.create(DominoRoom.prototype);
    const events = [];
    Object.defineProperty(room, "roomId", { value: "room-1", configurable: true, writable: true });
    room.roomCode = "ABCD";
    room.currentStakeKey = "stake_200";
    room.currentDealStakeKey = "stake_200";
    room.currentDealStakeAmount = 200;
    room.currentDealBankAmount = 800;
    room.dlossThreshold = 255;
    room.totalPlayers = 2;
    room.roomMode = "ffa";
    room.matchFinished = false;
    room.pendingAdvanceKind = null;
    room.state = {
        gameActive: true,
        matchRound: 2,
        playerOrder: ["loser-session", "winner-session"],
        players: new Map([
            ["loser-session", { name: "Loser", score: 10, roundWins: 0 }],
            ["winner-session", { name: "Winner", score: 120, roundWins: 1 }]
        ]),
        teamScores: [0, 0],
        teamRoundWins: [0, 0],
        matchOver: false
    };
    room.clearTurnTimer = () => {};
    room.clearTurnAdvanceTimer = () => {};
    room.clearTimeoutForfeitTimer = () => {};
    room.broadcast = (kind, payload) => events.push([kind, payload]);
    room.broadcastRoomState = () => events.push(["room_state"]);
    room.settleForfeitStake = async () => ({ result: "loss", winners: 1, bank: 800 });

    const result = await room.endRoundByTimeoutForfeit({ loserIndex: 0, winnerIndex: 1 });

    assert.equal(result, true);
    assert.equal(room.state.matchRound, 3);
    assert.equal(room.pendingAdvanceKind, "timeout_continue");
    assert.ok(room.timeoutForfeitPending);
    assert.equal(room.timeoutForfeitPending.loserSessionId, "loser-session");
    assert.equal(room.timeoutForfeitPending.loserName, "Loser");
    assert.equal(room.timeoutForfeitPending.settled, true);
    const roundEnd = events.find(([kind]) => kind === "round_end")?.[1];
    assert.equal(roundEnd?.finishKind, "timeout_forfeit");
    assert.equal(roundEnd?.forfeitReason, "turn_timeout");
    assert.equal(roundEnd?.timeoutLoserSessionId, "loser-session");
    assert.equal(roundEnd?.canContinueSessionId, "loser-session");
    assert.ok(roundEnd?.continueExpiresAt > Date.now());
    assert.ok(events.some(([kind]) => kind === "room_state"));

    room.clearTimeoutForfeitTimer();
});

test("handleTimeoutContinue only accepts the timeout loser and starts the next round on success", async () => {
    const room = Object.create(DominoRoom.prototype);
    const messages = [];
    let reserveCalls = 0;
    let startRoundCalls = 0;
    Object.defineProperty(room, "roomId", { value: "room-2", configurable: true, writable: true });
    room.currentStakeKey = "stake_200";
    room.currentDealMatchId = "";
    room.currentDealStakeKey = "stake_200";
    room.currentDealStakeAmount = 200;
    room.currentDealBankAmount = 800;
    room.lastReservedMatchRound = 0;
    room.state = { matchRound: 3 };
    room.timeoutForfeitPending = {
        loserSessionId: "loser-session",
        loserIndex: 0,
        loserName: "Loser",
        winnerIndex: 1,
        createdAt: Date.now(),
        expiresAt: Date.now() + 5000,
        stakeKey: "stake_200",
        bankAmount: 800,
        settled: true
    };
    room.reserveEconomyStake = async () => {
        reserveCalls += 1;
        return { ok: true, reserved: 200, stakeKey: "stake_200", bankAmount: 800 };
    };
    room.startRound = async () => {
        startRoundCalls += 1;
    };
    room.clearTimeoutForfeitTimer = () => {};
    room.clearTimeoutForfeitState = () => {
        room.timeoutForfeitPending = null;
    };

    const loserClient = { sessionId: "loser-session", send: (kind, payload) => messages.push([kind, payload]) };
    const otherClient = { sessionId: "winner-session", send: (kind, payload) => messages.push([kind, payload]) };

    const rejected = await room.handleTimeoutContinue(otherClient);
    assert.equal(rejected, false);
    assert.equal(reserveCalls, 0);
    assert.equal(startRoundCalls, 0);
    assert.equal(messages.find(([kind]) => kind === "timeout_continue_result")?.[1]?.reason, "forbidden");

    messages.length = 0;
    const accepted = await room.handleTimeoutContinue(loserClient);
    assert.equal(accepted, true);
    assert.equal(reserveCalls, 1);
    assert.equal(startRoundCalls, 1);
    const okPayload = messages.find(([kind]) => kind === "timeout_continue_result")?.[1];
    assert.equal(okPayload?.ok, true);
    assert.equal(room.timeoutForfeitPending, null);
    assert.equal(room.lastReservedMatchRound, 3);
});

test("handleTimeoutContinue closes the room when the continue window expires", async () => {
    const room = Object.create(DominoRoom.prototype);
    const messages = [];
    let closed = 0;
    Object.defineProperty(room, "roomId", { value: "room-3", configurable: true, writable: true });
    room.state = { matchRound: 4 };
    room.currentDealMatchId = "";
    room.currentStakeKey = "stake_200";
    room.timeoutForfeitPending = {
        loserSessionId: "loser-session",
        loserIndex: 0,
        loserName: "Loser",
        winnerIndex: 1,
        createdAt: Date.now() - 6000,
        expiresAt: Date.now() - 1,
        stakeKey: "stake_200",
        bankAmount: 800,
        settled: true
    };
    room.closeTimeoutForfeitRoom = async () => {
        closed += 1;
    };
    room.clearTimeoutForfeitTimer = () => {};
    room.clearTimeoutForfeitState = () => {
        room.timeoutForfeitPending = null;
    };

    const client = { sessionId: "loser-session", send: (kind, payload) => messages.push([kind, payload]) };
    const accepted = await room.handleTimeoutContinue(client);

    assert.equal(accepted, false);
    assert.equal(closed, 1);
    assert.equal(messages.find(([kind]) => kind === "timeout_continue_result")?.[1]?.reason, "expired");
});
