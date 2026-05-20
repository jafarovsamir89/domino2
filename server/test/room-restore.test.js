const test = require("node:test");
const assert = require("node:assert/strict");

const { buildRestoredRoomMetadata } = require("../roomRestore");

test("buildRestoredRoomMetadata falls back to room values when data fields are missing", () => {
    const room = {
        roomCode: "ROOM",
        roomVisibility: "open",
        humanSeats: 2,
        totalPlayers: 4,
        aiCount: 1,
        dlossThreshold: 255,
        instantWinEnabled: true,
        aiDifficulty: "hard",
        currentStakeKey: "stake_200",
        currentDealMatchId: "match-1",
        currentDealStakeKey: "stake_200",
        currentDealStakeAmount: 200,
        currentDealBankAmount: 400,
        economyReservationMade: true,
        lastReservedMatchRound: 3,
        matchRecorded: true,
        forfeitSettlementMade: false,
        lastRoundEconomySummary: { ok: true },
        lastDealWinner: "session-1",
        botIds: ["bot-a"],
        playerMissingSuits: [new Set(["hearts"])]
    };
    const data = {};
    const roomClone = structuredClone({
        ...room,
        playerMissingSuits: room.playerMissingSuits.map((set) => Array.from(set))
    });
    const dataClone = structuredClone(data);

    const restored = buildRestoredRoomMetadata({ room, data });

    assert.equal(restored.roomCode, "ROOM");
    assert.equal(restored.roomVisibility, "open");
    assert.equal(restored.humanSeats, 2);
    assert.equal(restored.totalPlayers, 4);
    assert.equal(restored.aiCount, 1);
    assert.equal(restored.dlossThreshold, 255);
    assert.equal(restored.instantWinEnabled, true);
    assert.equal(restored.aiDifficulty, "hard");
    assert.equal(restored.currentStakeKey, "stake_200");
    assert.equal(restored.currentDealMatchId, "match-1");
    assert.equal(restored.currentDealStakeKey, "stake_200");
    assert.equal(restored.currentDealStakeAmount, 200);
    assert.equal(restored.currentDealBankAmount, 400);
    assert.equal(restored.economyReservationMade, false);
    assert.equal(restored.lastReservedMatchRound, 3);
    assert.equal(restored.matchRecorded, true);
    assert.equal(restored.forfeitSettlementMade, false);
    assert.deepEqual(restored.lastRoundEconomySummary, { ok: true });
    assert.equal(restored.lastDealWinner, "session-1");
    assert.deepEqual(restored.botIds, ["bot-a"]);
    assert.equal(restored.playerMissingSuits.length, 1);
    assert.deepEqual(Array.from(restored.playerMissingSuits[0]), ["hearts"]);
    assert.deepEqual(
        {
            roomCode: room.roomCode,
            roomVisibility: room.roomVisibility,
            humanSeats: room.humanSeats,
            totalPlayers: room.totalPlayers,
            aiCount: room.aiCount,
            dlossThreshold: room.dlossThreshold,
            instantWinEnabled: room.instantWinEnabled,
            aiDifficulty: room.aiDifficulty,
            currentStakeKey: room.currentStakeKey,
            currentDealMatchId: room.currentDealMatchId,
            currentDealStakeKey: room.currentDealStakeKey,
            currentDealStakeAmount: room.currentDealStakeAmount,
            currentDealBankAmount: room.currentDealBankAmount,
            economyReservationMade: room.economyReservationMade,
            lastReservedMatchRound: room.lastReservedMatchRound,
            matchRecorded: room.matchRecorded,
            forfeitSettlementMade: room.forfeitSettlementMade,
            lastRoundEconomySummary: room.lastRoundEconomySummary,
            lastDealWinner: room.lastDealWinner,
            botIds: room.botIds,
            playerMissingSuits: room.playerMissingSuits.map((set) => Array.from(set))
        },
        roomClone
    );
    assert.deepEqual(data, dataClone);
});

test("buildRestoredRoomMetadata normalizes visibility and economy reservation state", () => {
    const room = {
        roomCode: "ROOM",
        roomVisibility: "closed",
        humanSeats: 2,
        totalPlayers: 2,
        aiCount: 0,
        dlossThreshold: 255,
        instantWinEnabled: false,
        aiDifficulty: "medium",
        currentStakeKey: "stake_200",
        currentDealMatchId: "",
        currentDealStakeKey: "stake_200",
        currentDealStakeAmount: 0,
        currentDealBankAmount: 0,
        economyReservationMade: true,
        lastReservedMatchRound: 0,
        matchRecorded: false,
        forfeitSettlementMade: false,
        lastRoundEconomySummary: null,
        lastDealWinner: null,
        botIds: [],
        playerMissingSuits: []
    };

    const restoredOpen = buildRestoredRoomMetadata({ room, data: { roomVisibility: " open ", economyReservationMade: true } });
    const restoredClosed = buildRestoredRoomMetadata({ room, data: { roomVisibility: "something else" } });
    const restoredMissing = buildRestoredRoomMetadata({ room, data: {} });

    assert.equal(restoredOpen.roomVisibility, "open");
    assert.equal(restoredOpen.economyReservationMade, true);
    assert.equal(restoredClosed.roomVisibility, "closed");
    assert.equal(restoredMissing.economyReservationMade, false);
});

test("buildRestoredRoomMetadata keeps botIds and playerMissingSuits fallbacks without mutation", () => {
    const room = {
        roomCode: "ROOM",
        roomVisibility: "closed",
        humanSeats: 2,
        totalPlayers: 2,
        aiCount: 1,
        dlossThreshold: 255,
        instantWinEnabled: false,
        aiDifficulty: "medium",
        currentStakeKey: "stake_200",
        currentDealMatchId: "match-2",
        currentDealStakeKey: "stake_200",
        currentDealStakeAmount: 100,
        currentDealBankAmount: 200,
        economyReservationMade: false,
        lastReservedMatchRound: 1,
        matchRecorded: false,
        forfeitSettlementMade: false,
        lastRoundEconomySummary: null,
        lastDealWinner: null,
        botIds: ["bot-a", "bot-b"],
        playerMissingSuits: [new Set(["spades"]), new Set(["clubs"])]
    };
    const data = {
        botIds: ["bot-c"],
        playerMissingSuits: [["hearts"], ["diamonds"]]
    };
    const roomClone = structuredClone({
        ...room,
        playerMissingSuits: room.playerMissingSuits.map((set) => Array.from(set))
    });
    const dataClone = structuredClone(data);

    const restored = buildRestoredRoomMetadata({ room, data });

    assert.deepEqual(restored.botIds, ["bot-c"]);
    assert.equal(restored.playerMissingSuits.length, 2);
    assert.deepEqual(Array.from(restored.playerMissingSuits[0]), ["hearts"]);
    assert.deepEqual(Array.from(restored.playerMissingSuits[1]), ["diamonds"]);
    assert.deepEqual(
        {
            roomCode: room.roomCode,
            roomVisibility: room.roomVisibility,
            humanSeats: room.humanSeats,
            totalPlayers: room.totalPlayers,
            aiCount: room.aiCount,
            dlossThreshold: room.dlossThreshold,
            instantWinEnabled: room.instantWinEnabled,
            aiDifficulty: room.aiDifficulty,
            currentStakeKey: room.currentStakeKey,
            currentDealMatchId: room.currentDealMatchId,
            currentDealStakeKey: room.currentDealStakeKey,
            currentDealStakeAmount: room.currentDealStakeAmount,
            currentDealBankAmount: room.currentDealBankAmount,
            economyReservationMade: room.economyReservationMade,
            lastReservedMatchRound: room.lastReservedMatchRound,
            matchRecorded: room.matchRecorded,
            forfeitSettlementMade: room.forfeitSettlementMade,
            lastRoundEconomySummary: room.lastRoundEconomySummary,
            lastDealWinner: room.lastDealWinner,
            botIds: room.botIds,
            playerMissingSuits: room.playerMissingSuits.map((set) => Array.from(set))
        },
        roomClone
    );
    assert.deepEqual(data, dataClone);
});
