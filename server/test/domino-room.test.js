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

test("handleNextDeal only advances for the host during pending transitions", () => {
    const room = Object.create(DominoRoom.prototype);
    let cleared = 0;
    let roundStarted = 0;
    let dealStarted = 0;

    room.state = {
        gameActive: false,
        matchFinished: false,
        playerOrder: ["host-session", "guest-session"]
    };
    room.pendingAdvanceKind = "deal";
    room._lastNextDealAt = 0;
    room.clearNextDealTimer = () => { cleared += 1; };
    room.startRound = async () => { roundStarted += 1; };
    room.startDeal = async () => { dealStarted += 1; };
    room.identityBySessionId = new Map([
        ["host-session", { role: "host" }],
        ["guest-session", { role: "player" }]
    ]);

    room.handleNextDeal({ sessionId: "guest-session" });
    assert.equal(cleared, 0);
    assert.equal(roundStarted, 0);
    assert.equal(dealStarted, 0);

    room.handleNextDeal({ sessionId: "host-session" });
    assert.equal(cleared, 1);
    assert.equal(roundStarted, 0);
    assert.equal(dealStarted, 1);
});
