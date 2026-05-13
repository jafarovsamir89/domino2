const test = require("node:test");
const assert = require("node:assert/strict");

global.__DOMINO_ROOM_CODES = new Map();
global.__DOMINO_ROOM_IDS = new Map();

const { rememberRoom, resolveRoomIdByCode, resolveRoomCodeById, forgetRoom } = require("../roomRegistry");

test("room registry remembers, resolves, and forgets mappings locally", async () => {
    await rememberRoom("ABCD", "room-1");

    assert.equal(await resolveRoomIdByCode("abcd"), "room-1");
    assert.equal(await resolveRoomCodeById("room-1"), "ABCD");

    await forgetRoom("ABCD", "room-1");
    assert.equal(await resolveRoomIdByCode("ABCD"), null);
    assert.equal(await resolveRoomCodeById("room-1"), null);
});
