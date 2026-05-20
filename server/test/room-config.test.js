const test = require("node:test");
const assert = require("node:assert/strict");

const {
    generateRoomCode,
    normalizeRoomVisibility,
    normalizeStakeKey,
    normalizePlayerCount,
    normalizeAiCount,
    normalizeInstantWinEnabled,
    normalizeAiDifficulty
} = require("../roomConfig");

test("generateRoomCode returns 4 chars from the allowed alphabet", () => {
    const codes = new Set();
    for (let i = 0; i < 64; i++) {
        const code = generateRoomCode();
        assert.match(code, /^[A-HJ-NP-Z2-9]{4}$/);
        codes.add(code);
    }
    assert.ok(codes.size > 1);
});

test("normalizeRoomVisibility returns only open or closed", () => {
    assert.equal(normalizeRoomVisibility("open"), "open");
    assert.equal(normalizeRoomVisibility("anything else"), "closed");
    assert.equal(normalizeRoomVisibility(undefined), "closed");
});

test("normalizeStakeKey defaults to stake_200", () => {
    assert.equal(normalizeStakeKey(undefined), "stake_200");
    assert.equal(normalizeStakeKey("   "), "stake_200");
    assert.equal(normalizeStakeKey("stake_500"), "stake_500");
});

test("normalizePlayerCount clamps team and non-team modes", () => {
    assert.equal(normalizePlayerCount(undefined, true), 4);
    assert.equal(normalizePlayerCount(1, false), 2);
    assert.equal(normalizePlayerCount(3, false), 3);
    assert.equal(normalizePlayerCount(9, false), 4);
});

test("normalizeAiCount stays within bounds", () => {
    assert.equal(normalizeAiCount(undefined, 4), 0);
    assert.equal(normalizeAiCount(9, 4), 3);
    assert.equal(normalizeAiCount(2, 4), 2);
});

test("normalizeInstantWinEnabled preserves current behavior", () => {
    assert.equal(normalizeInstantWinEnabled(undefined), true);
    assert.equal(normalizeInstantWinEnabled(true), true);
    assert.equal(normalizeInstantWinEnabled(false), false);
});

test("normalizeAiDifficulty defaults to medium", () => {
    assert.equal(normalizeAiDifficulty(undefined), "medium");
    assert.equal(normalizeAiDifficulty("hard"), "hard");
});
