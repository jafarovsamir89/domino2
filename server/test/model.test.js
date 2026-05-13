const test = require("node:test");
const assert = require("node:assert/strict");

const { Tile, getHandSize, handPoints, roundTo5, determineFirstPlayer } = require("../model");

test("getHandSize keeps the classic 7-tile opening hand", () => {
    assert.equal(getHandSize(2), 7);
    assert.equal(getHandSize(4), 7);
    assert.equal(getHandSize(99), 7);
});

test("roundTo5 rounds up to the next multiple of five", () => {
    assert.equal(roundTo5(0), 0);
    assert.equal(roundTo5(1), 5);
    assert.equal(roundTo5(5), 5);
    assert.equal(roundTo5(11), 15);
});

test("handPoints gives 10 for the final zero double", () => {
    assert.equal(handPoints([new Tile(0, 0)]), 10);
    assert.equal(handPoints([new Tile(2, 5)]), 7);
});

test("determineFirstPlayer prioritizes 3|2, then smallest double, then fallback", () => {
    const hands = [
        [new Tile(6, 6)],
        [new Tile(3, 2)],
        [new Tile(1, 4)]
    ];
    const first = determineFirstPlayer(hands);
    assert.equal(first.player, 1);
    assert.equal(first.tileIndex, 0);
});
