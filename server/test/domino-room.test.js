const test = require("node:test");
const assert = require("node:assert/strict");

const DominoRoom = require("../DominoRoom");

test("generateRoomCode returns compact upper-case codes", () => {
    const codes = new Set();
    for (let i = 0; i < 64; i++) {
        const code = DominoRoom.generateRoomCode();
        assert.match(code, /^[A-HJ-NP-Z2-9]{4}$/);
        codes.add(code);
    }
    assert.ok(codes.size > 1);
});

test("sanitizeName strips unsafe characters and trims length", () => {
    assert.equal(DominoRoom.sanitizeName(" <b>Alice</b>! "), "Alice");
    assert.equal(DominoRoom.sanitizeName("    "), "Player");
});
