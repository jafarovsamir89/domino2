const test = require("node:test");
const assert = require("node:assert/strict");

const { normalizeGameMode } = require("../roomConfig");
const { upsertLivePlayer, getOpenRooms } = require("../livePresence");

test("normalizeGameMode maps classic101 aliases and defaults to telefon", () => {
    assert.equal(normalizeGameMode("classic101"), "classic101");
    assert.equal(normalizeGameMode("101"), "classic101");
    assert.equal(normalizeGameMode("classic"), "classic101");
    assert.equal(normalizeGameMode("telefon"), "telefon");
    assert.equal(normalizeGameMode(""), "telefon");
    assert.equal(normalizeGameMode("unknown"), "telefon");
});

test("open rooms are filtered by gameMode without mixing classic101 and telefon", async () => {
    global.__DOMINO_LIVE_PRESENCE = new Map();

    upsertLivePlayer("telefon-host", {
        sessionId: "telefon-host",
        roomId: "room-telefon",
        roomCode: "TEL1",
        roomVisibility: "open",
        gameMode: "telefon",
        roomMode: "ffa",
        stakeKey: "stake_200",
        humanSeats: 4,
        totalPlayers: 4,
        aiCount: 0,
        isTeamMode: false,
        displayName: "Telefon Host",
        hostName: "Telefon Host",
        isConnected: true,
        isPlaying: false
    });

    upsertLivePlayer("classic-host", {
        sessionId: "classic-host",
        roomId: "room-classic",
        roomCode: "CLS1",
        roomVisibility: "open",
        gameMode: "classic101",
        roomMode: "ffa",
        stakeKey: "stake_200",
        humanSeats: 4,
        totalPlayers: 4,
        aiCount: 0,
        isTeamMode: false,
        displayName: "Classic Host",
        hostName: "Classic Host",
        isConnected: true,
        isPlaying: false
    });

    const telefonRooms = await getOpenRooms({ roomVisibility: "open", joinableOnly: true, gameMode: "telefon", limit: 24 });
    const classicRooms = await getOpenRooms({ roomVisibility: "open", joinableOnly: true, gameMode: "classic101", limit: 24 });
    const allRooms = await getOpenRooms({ roomVisibility: "open", joinableOnly: true, gameMode: "all", limit: 24 });

    assert.equal(telefonRooms.items.some((item) => item.roomId === "room-telefon"), true);
    assert.equal(telefonRooms.items.some((item) => item.roomId === "room-classic"), false);
    assert.equal(classicRooms.items.some((item) => item.roomId === "room-classic"), true);
    assert.equal(classicRooms.items.some((item) => item.roomId === "room-telefon"), false);
    assert.equal(allRooms.items.some((item) => item.roomId === "room-telefon"), true);
    assert.equal(allRooms.items.some((item) => item.roomId === "room-classic"), true);
});
