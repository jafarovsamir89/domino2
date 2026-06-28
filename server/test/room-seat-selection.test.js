const test = require("node:test");
const assert = require("node:assert/strict");

process.env.DOMINO_SERVER_SECRET ||= "b7f4c2d9a1e8f6c3b5a7d0e9f1c4b8a6d2e7f9c1";
process.env.BETTER_AUTH_SECRET ||= process.env.DOMINO_SERVER_SECRET;

const DominoRoom = require("../DominoRoom");
const { rememberRoom, resolveRoomIdByCode } = require("../roomRegistry");
const { upsertLivePlayer, getOpenRooms } = require("../livePresence");
const { resetJoinRateLimits } = require("../joinRateLimit");

test.beforeEach(() => {
    resetJoinRateLimits();
});

function createRoom({ totalPlayers = 4, aiCount = 0, isTeamMode = true } = {}) {
    const room = Object.create(DominoRoom.prototype);
    Object.defineProperty(room, "roomId", { value: "room-seat", writable: true, configurable: true });
    room.roomCode = "SEAT";
    room.roomVisibility = "closed";
    room.totalPlayers = totalPlayers;
    room.aiCount = aiCount;
    room.humanSeats = totalPlayers - aiCount;
    room.maxClients = room.humanSeats;
    room.aiDifficulty = "medium";
    room.state = {
        players: new Map(),
        playerOrder: [],
        gameActive: false,
        matchFinished: false,
        isTeamMode,
        turnVersion: 1,
        teamScores: [0, 0],
        teamRoundWins: [0, 0]
    };
    room.playerCount = totalPlayers;
    room.playerNames = Array.from({ length: totalPlayers }, (_, index) => `Player ${index + 1}`);
    room.hands = Array.from({ length: totalPlayers }, () => []);
    room.scores = Array.from({ length: totalPlayers }, () => 0);
    room.roundWins = Array.from({ length: totalPlayers }, () => 0);
    room.currentPlayer = 0;
    room.humanPlayerIndex = 0;
    room.identityBySessionId = new Map();
    room.broadcasts = [];
    room.clients = [];
    room.botIds = [];
    room.aiPlayers = new Map();
    room.currentStakeKey = "free";
    room.currentDealStakeAmount = 0;
    room.currentDealBankAmount = 0;
    room.matchRecorded = false;
    room.forfeitSettlementMade = false;
    room.explicitLeaveSessionIds = new Set();
    room.restoredFromSnapshot = false;
    room.lastReservedMatchRound = 0;
    room.pendingMatchRecording = null;
    room.matchRecordInFlight = false;
    room.pendingEconomySettlement = Promise.resolve();
    room.turnTimer = null;
    room.turnAdvanceTimer = null;
    room.nextDealTimer = null;
    room.botTimer = null;
    room.matchFinished = false;
    room.hasRestoredMatchInProgress = () => false;
    room.broadcast = (type, payload) => {
        room.broadcasts.push({ type, payload });
    };
    room.broadcastRoomState = () => {
        room.broadcasts.push({ type: "room_state" });
    };
    room.syncState = () => {};
    room.registerLivePlayer = () => {};
    room.maybeAutoStartGame = () => false;
    room.allowReconnection = async () => {};
    return room;
}

function createClient(sessionId) {
    const messages = [];
    return {
        sessionId,
        messages,
        send(type, payload) {
            messages.push({ type, payload });
        },
        leave() {}
    };
}

async function joinHuman(room, sessionId, name) {
    const client = createClient(sessionId);
    room.clients.push(client);
    await room.onJoin(client, { name }, {
        provider: "platform",
        userId: `u-${sessionId}`,
        displayName: name,
        playerId: `p-${sessionId}`
    });
    return client;
}

async function joinHumanWithoutClientList(room, sessionId, name) {
    const client = createClient(sessionId);
    await room.onJoin(client, { name }, {
        provider: "platform",
        userId: `u-${sessionId}`,
        displayName: name,
        playerId: `p-${sessionId}`
    });
    return client;
}

test("host joins Seat 1 automatically", async () => {
    const room = createRoom();
    const host = await joinHuman(room, "host", "Host");

    assert.equal(room.getPlayerSeatIndex("host"), 0);
    assert.deepEqual(room.state.playerOrder, ["host"]);
    assert.equal(room.state.players.get("host").seatIndex, 0);
    assert.equal(host.messages.length, 0);
});

test("1v1 online auto-starts without seat selection", async () => {
    const room = createRoom({ totalPlayers: 2, aiCount: 0, isTeamMode: false });
    let startCalls = 0;
    room.maybeAutoStartGame = DominoRoom.prototype.maybeAutoStartGame.bind(room);
    room.startGame = async () => {
        startCalls += 1;
    };

    await joinHuman(room, "host", "Host");
    const guest = await joinHumanWithoutClientList(room, "guest", "Guest");
    await new Promise((resolve) => setTimeout(resolve, 650));

    assert.equal(room.getPlayerSeatIndex("host"), 0);
    assert.equal(room.getPlayerSeatIndex("guest"), 1);
    assert.equal(room.state.playerOrder.join(","), "host,guest");
    assert.equal(startCalls, 1);
    assert.equal(room.clients.length, 1);
    assert.equal(guest.messages.length, 0);
});

test("a player can choose Seat 3 and playerOrder follows seat order", async () => {
    const room = createRoom();
    await joinHuman(room, "host", "Host");
    const guestA = await joinHuman(room, "guest-a", "Alice");
    const guestB = await joinHuman(room, "guest-b", "Bob");

    room.handleChooseSeat(guestA, { seatIndex: 3 });
    room.handleChooseSeat(guestB, { seatIndex: 1 });

    assert.equal(room.getPlayerSeatIndex("guest-a"), 3);
    assert.equal(room.getPlayerSeatIndex("guest-b"), 1);
    assert.deepEqual(room.state.playerOrder, ["host", "guest-b", "guest-a"]);
});

test("two players cannot choose the same seat", async () => {
    const room = createRoom();
    await joinHuman(room, "host", "Host");
    const guestA = await joinHuman(room, "guest-a", "Alice");
    const guestB = await joinHuman(room, "guest-b", "Bob");

    room.handleChooseSeat(guestA, { seatIndex: 2 });
    room.handleChooseSeat(guestB, { seatIndex: 2 });

    assert.equal(room.getPlayerSeatIndex("guest-a"), 2);
    assert.equal(room.getPlayerSeatIndex("guest-b"), -1);
    assert.equal(guestB.messages.some((item) => item.payload?.key === "seat-taken"), true);
});

test("startGame is called only once after the final seat is selected", async () => {
    const room = createRoom({ totalPlayers: 4, aiCount: 0, isTeamMode: true });
    let startCalls = 0;
    room.maybeAutoStartGame = DominoRoom.prototype.maybeAutoStartGame.bind(room);
    room.startGame = async () => {
        startCalls += 1;
    };

    await joinHuman(room, "host", "Host");
    const guestA = await joinHuman(room, "guest-a", "Alice");
    const guestB = await joinHuman(room, "guest-b", "Bob");
    const guestC = await joinHuman(room, "guest-c", "Carol");

    assert.equal(startCalls, 0);

    room.handleChooseSeat(guestA, { seatIndex: 1 });
    assert.equal(startCalls, 0);

    room.handleChooseSeat(guestB, { seatIndex: 2 });
    assert.equal(startCalls, 0);

    room.handleChooseSeat(guestC, { seatIndex: 3 });
    await new Promise((resolve) => setTimeout(resolve, 650));
    assert.equal(startCalls, 1);

    assert.deepEqual(room.state.playerOrder, ["host", "guest-a", "guest-b", "guest-c"]);
});

test("maybeAutoStartGame does not rely on clients length when humans are already ready", async () => {
    const room = createRoom({ totalPlayers: 2, aiCount: 0, isTeamMode: false });
    let startCalls = 0;
    room.maybeAutoStartGame = DominoRoom.prototype.maybeAutoStartGame.bind(room);
    room.startGame = async () => {
        startCalls += 1;
    };

    await joinHuman(room, "host", "Host");
    await joinHumanWithoutClientList(room, "guest", "Guest");
    await new Promise((resolve) => setTimeout(resolve, 650));

    assert.equal(startCalls, 1);
    assert.equal(room.countConnectedHumanPlayers(), 2);
    assert.equal(room.countReadyHumanPlayers(), 2);
});

test("ffa room auto-starts with bots once human seats are filled", async () => {
    const room = createRoom({ totalPlayers: 4, aiCount: 2, isTeamMode: false });
    let startCalls = 0;
    room.maybeAutoStartGame = DominoRoom.prototype.maybeAutoStartGame.bind(room);
    room.startGame = async () => {
        startCalls += 1;
    };

    await joinHuman(room, "host", "Host");
    await joinHumanWithoutClientList(room, "guest", "Guest");
    await new Promise((resolve) => setTimeout(resolve, 650));

    assert.equal(startCalls, 1);
    assert.equal(room._lastAutoStartCheckAt > 0, true);
    assert.equal(room._lastAutoStartTriggeredAt > 0, true);
    assert.equal(room._lastAutoStartBlockedReason, "");
});

test("open ffa room reports waiting state until the final human joins", async () => {
    const room = createRoom({ totalPlayers: 2, aiCount: 0, isTeamMode: false });
    room.roomVisibility = "open";
    room.maybeAutoStartGame = DominoRoom.prototype.maybeAutoStartGame.bind(room);

    await joinHuman(room, "host", "Host");

    const waitingState = room.getAutoStartState();
    assert.equal(waitingState.roomMode, "ffa");
    assert.equal(waitingState.canStart, false);
    assert.equal(waitingState.humanCount, 1);
    assert.equal(waitingState.blockedReason, "waiting-for-human");
});

test("open waiting room host explicit leave keeps the room when another connected human remains", async () => {
    const room = createRoom({ totalPlayers: 4, aiCount: 0, isTeamMode: false });
    room.roomVisibility = "open";
    room.clock = { setTimeout: (fn) => fn() };
    room.disconnectCalls = 0;
    room.disconnect = () => { room.disconnectCalls += 1; };

    const host = await joinHuman(room, "host", "Host");
    await joinHuman(room, "guest-a", "Alice");

    room.explicitLeaveSessionIds.add("host");
    await room.onLeave(host, true);

    assert.equal(room.state.players.has("host"), false);
    assert.equal(room.state.players.has("guest-a"), true);
    assert.equal(room.broadcasts.some((entry) => entry.type === "room_closed"), false);
    assert.equal(room.disconnectCalls, 0);
});

test("open waiting room last connected human leave closes the room before start", async () => {
    const room = createRoom({ totalPlayers: 4, aiCount: 0, isTeamMode: false });
    room.roomVisibility = "open";
    room.clock = { setTimeout: (fn) => fn() };
    room.disconnectCalls = 0;
    room.disconnect = () => { room.disconnectCalls += 1; };
    room.closeWaitingOpenRoom = DominoRoom.prototype.closeWaitingOpenRoom.bind(room);

    const host = await joinHuman(room, "host", "Host");

    await room.onLeave(host, false);

    assert.equal(room.state.matchOver, true);
    assert.equal(room.state.gameOverReason, "empty_open_room");
    assert.equal(room.broadcasts.some((entry) => entry.type === "room_closed" && entry.payload?.returnTo === "open_rooms"), true);
    assert.equal(room.disconnectCalls, 1);
});

test("closing a waiting open room removes it from registry and open rooms listing", async () => {
    global.__DOMINO_ROOM_CODES = new Map();
    global.__DOMINO_ROOM_IDS = new Map();
    global.__DOMINO_LIVE_PRESENCE = new Map();

    const room = createRoom({ totalPlayers: 4, aiCount: 0, isTeamMode: false });
    room.roomVisibility = "open";
    room.roomCode = "OPEN";
    Object.defineProperty(room, "roomId", { value: "room-open", writable: true, configurable: true });
    room.clock = { setTimeout: (fn) => fn() };
    room.disconnect = () => {};

    await rememberRoom(room.roomCode, room.roomId);
    upsertLivePlayer("host", {
        sessionId: "host",
        roomId: room.roomId,
        roomCode: room.roomCode,
        roomVisibility: "open",
        roomMode: "ffa",
        stakeKey: "stake_200",
        humanSeats: 4,
        totalPlayers: 4,
        aiCount: 0,
        isTeamMode: false,
        displayName: "Host",
        hostName: "Host",
        isConnected: true,
        isPlaying: false
    });
    upsertLivePlayer("guest-a", {
        sessionId: "guest-a",
        roomId: room.roomId,
        roomCode: room.roomCode,
        roomVisibility: "open",
        roomMode: "ffa",
        stakeKey: "stake_200",
        humanSeats: 4,
        totalPlayers: 4,
        aiCount: 0,
        isTeamMode: false,
        displayName: "Alice",
        hostName: "Host",
        isConnected: true,
        isPlaying: false
    });

    let openRooms = await getOpenRooms({ roomVisibility: "open", joinableOnly: true, limit: 24 });
    assert.equal(openRooms.items.some((item) => item.roomId === room.roomId), true);
    assert.equal(await resolveRoomIdByCode(room.roomCode), room.roomId);

    await room.closeWaitingOpenRoom("host_left");

    openRooms = await getOpenRooms({ roomVisibility: "open", joinableOnly: true, limit: 24 });
    assert.equal(openRooms.items.some((item) => item.roomId === room.roomId), false);
    assert.equal(await resolveRoomIdByCode(room.roomCode), null);
});

test("open rooms listing hides rooms with no connected players", async () => {
    global.__DOMINO_LIVE_PRESENCE = new Map();

    upsertLivePlayer("host", {
        sessionId: "host",
        roomId: "room-empty",
        roomCode: "EMPTY",
        roomVisibility: "open",
        roomMode: "ffa",
        stakeKey: "stake_200",
        humanSeats: 4,
        totalPlayers: 4,
        aiCount: 0,
        isTeamMode: false,
        displayName: "Host",
        hostName: "Host",
        isConnected: false,
        isPlaying: false
    });

    const openRooms = await getOpenRooms({ roomVisibility: "open", joinableOnly: true, limit: 24 });
    assert.equal(openRooms.items.some((item) => item.roomId === "room-empty"), false);
});

test("updateSchemaState syncs player handCount fields from live hands", async () => {
    const room = createRoom({ totalPlayers: 2, aiCount: 0, isTeamMode: false });
    await joinHuman(room, "host", "Host");
    const guest = await joinHuman(room, "guest", "Guest");

    room.hands = [
        [{ id: 1, a: 6, b: 6 }],
        [{ id: 2, a: 1, b: 1 }, { id: 3, a: 2, b: 2 }]
    ];
    room.boneyard = [{ id: 4, a: 3, b: 3 }];
    room.internalBoard = { toJSON: () => ({ nodes: [] }) };

    room.updateSchemaState({ includeBoardJson: true });

    assert.equal(room.state.players.get("host").handCount, 1);
    assert.equal(room.state.players.get("guest").handCount, 2);
    assert.equal(guest.messages.length, 0);
});

test("seat cannot be changed after the game starts", async () => {
    const room = createRoom();
    await joinHuman(room, "host", "Host");
    const guest = await joinHuman(room, "guest", "Guest");

    room.handleChooseSeat(guest, { seatIndex: 2 });
    room.state.gameActive = true;
    room.handleChooseSeat(guest, { seatIndex: 1 });

    assert.equal(room.getPlayerSeatIndex("guest"), 2);
});

test("team mode pairs Seat 1 + Seat 3 and Seat 2 + Seat 4", async () => {
    const room = createRoom({ totalPlayers: 4, aiCount: 0, isTeamMode: true });
    const host = await joinHuman(room, "host", "Host");
    const guestA = await joinHuman(room, "guest-a", "Alice");
    const guestB = await joinHuman(room, "guest-b", "Bob");
    const guestC = await joinHuman(room, "guest-c", "Carol");

    room.handleChooseSeat(guestA, { seatIndex: 2 });
    room.handleChooseSeat(guestB, { seatIndex: 1 });
    room.handleChooseSeat(guestC, { seatIndex: 3 });

    room.rebuildPlayerOrderBySeats();

    assert.equal(room.getPlayerSeatIndex(host.sessionId), 0);
    assert.deepEqual(room.getTeamMembers(0), [0, 2]);
    assert.deepEqual(room.getTeamMembers(1), [1, 3]);
});

test("leaving before the game starts frees the seat", async () => {
    const room = createRoom();
    await joinHuman(room, "host", "Host");
    const guest = await joinHuman(room, "guest", "Guest");

    room.handleChooseSeat(guest, { seatIndex: 2 });
    room.explicitLeaveSessionIds.add("guest");
    await room.onLeave(guest, true);

    assert.equal(room.state.players.has("guest"), false);
    assert.equal(room.isSeatAvailable(2), true);
});

test("reconnect before the game starts keeps the seat", async () => {
    const room = createRoom();
    await joinHuman(room, "host", "Host");
    const guest = await joinHuman(room, "guest", "Guest");

    room.handleChooseSeat(guest, { seatIndex: 2 });
    room.allowReconnection = async () => {};
    await room.onLeave(guest, false);

    assert.equal(room.state.players.get("guest").seatIndex, 2);
    assert.equal(room.state.players.get("guest").isConnected, true);
});

test("bots fill remaining seats without stealing human seats", async () => {
    const room = createRoom({ totalPlayers: 4, aiCount: 2, isTeamMode: true });
    await joinHuman(room, "host", "Host");
    const guest = await joinHuman(room, "guest", "Guest");

    room.handleChooseSeat(guest, { seatIndex: 2 });
    room.ensureBotPlayers();

    assert.equal(room.botIds.length, 2);
    assert.equal(room.state.players.has("bot-0"), true);
    assert.equal(room.state.players.has("bot-1"), true);
    const botSeats = room.botIds.map((botId) => room.getPlayerSeatIndex(botId)).sort((a, b) => a - b);
    assert.deepEqual(botSeats, [1, 3]);
    assert.equal(room.getPlayerSeatIndex("host"), 0);
    assert.equal(room.getPlayerSeatIndex("guest"), 2);
    assert.equal(room.state.playerOrder.length, 4);
    assert.deepEqual(room.state.playerOrder, ["host", "bot-0", "guest", "bot-1"]);
});

test("startGame includes bots in playerOrder and reaches startDeal with four players", async () => {
    const room = createRoom({ totalPlayers: 4, aiCount: 2, isTeamMode: true });
    await joinHuman(room, "host", "Host");
    const guest = await joinHuman(room, "guest", "Guest");

    room.handleChooseSeat(guest, { seatIndex: 2 });
    room.clearTurnTimer = () => {};
    room.scheduleTurnTimer = () => {};
    room.reserveEconomyStake = async () => ({ ok: true, reserved: 0, stakeKey: "free", bankAmount: 0 });
    room.shouldRedealOpeningHands = () => false;
    room.getOpeningScoreContext = () => 0;

    let startDealCalls = 0;
    room.startDeal = async function () {
        startDealCalls += 1;
        assert.equal(this.state.playerOrder.length, 4);
        assert.deepEqual(this.state.playerOrder, ["host", "bot-0", "guest", "bot-1"]);
    };

    await room.startGame();

    assert.equal(startDealCalls, 1);
});

test("open room starts without closing after seats are chosen", async () => {
    const room = createRoom({ totalPlayers: 4, aiCount: 0, isTeamMode: true });
    room.roomVisibility = "open";
    room.humanSeats = 4;
    room.maxClients = 4;

    await joinHuman(room, "host", "Host");
    const guestA = await joinHuman(room, "guest-a", "Alice");
    const guestB = await joinHuman(room, "guest-b", "Bob");
    const guestC = await joinHuman(room, "guest-c", "Carol");

    room.handleChooseSeat(guestA, { seatIndex: 1 });
    room.handleChooseSeat(guestB, { seatIndex: 2 });
    room.handleChooseSeat(guestC, { seatIndex: 3 });

    room.clearTurnTimer = () => {};
    room.scheduleTurnTimer = () => {};
    room.reserveEconomyStake = async () => ({ ok: true, reserved: 0, stakeKey: "free", bankAmount: 0 });
    room.shouldRedealOpeningHands = () => false;
    room.getOpeningScoreContext = () => 0;
    room.internalBoard = new (require("../board").Board)();

    await room.startGame();

    assert.equal(room.state.gameActive, true);
    assert.equal(room.roomVisibility, "open");
    assert.ok(!room.broadcasts.some((item) => item.type === "room_closed"));
    assert.ok(room.broadcasts.some((item) => item.type === "room_state"));
});

test("open room keeps waiting when stake reserve fails at start", async () => {
    const room = createRoom({ totalPlayers: 2, aiCount: 0, isTeamMode: false });
    room.roomVisibility = "open";
    room.humanSeats = 2;
    room.maxClients = 2;
    room.currentStakeKey = "stake_200";
    room.currentDealStakeKey = "stake_200";

    await joinHuman(room, "host", "Host");
    const guest = await joinHuman(room, "guest", "Guest");

    room.handleChooseSeat(guest, { seatIndex: 1 });
    room.clearTurnTimer = () => {};
    room.scheduleTurnTimer = () => {};
    room.reserveEconomyStake = async () => ({ ok: false, reason: "insufficient_coins" });
    room.shouldRedealOpeningHands = () => false;
    room.getOpeningScoreContext = () => 0;
    room.internalBoard = new (require("../board").Board)();

    await room.startGame();

    assert.equal(room.state.gameActive, false);
    assert.equal(room.roomVisibility, "open");
    assert.ok(!room.broadcasts.some((item) => item.type === "room_closed"));
    assert.ok(room.broadcasts.some((item) => item.type === "msg" && item.payload?.key === "room-closed-insufficient-coins"));
    assert.ok(room.broadcasts.some((item) => item.type === "room_state"));
});
