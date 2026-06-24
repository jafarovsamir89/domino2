const test = require("node:test");
const assert = require("node:assert/strict");

const { Board } = require("../board");
const { Tile } = require("../model");
const { getRuleset } = require("../../shared/domino-rulesets.cjs");

const telefonRuleset = getRuleset("telefon");

test("telefon ruleset keeps the classic first-player order", () => {
    const hands = [
        [new Tile(6, 6)],
        [new Tile(1, 1)],
        [new Tile(3, 2)]
    ];

    const first = telefonRuleset.determineFirstPlayer(hands);

    assert.deepEqual(first, { player: 2, tileIndex: 0 });
});

test("telefon opening score keeps [5|5] at 10 below 300 and 0 at 300+", () => {
    const tile = new Tile(5, 5);

    assert.equal(telefonRuleset.openingPlayScore(tile, 0), 10);
    assert.equal(telefonRuleset.openingPlayScore(tile, 299), 10);
    assert.equal(telefonRuleset.openingPlayScore(tile, 300), 0);
});

test("telefon scoreDuringPlay keeps the board score on 5-multiples and telephone cross cases", () => {
    const boardA = new Board();
    boardA.placeFirst(new Tile(3, 2));
    assert.equal(telefonRuleset.scoreDuringPlay(boardA), 5);

    const boardB = new Board();
    boardB.placeFirst(new Tile(5, 5));
    boardB.placeTile(new Tile(5, 2), 0);
    boardB.placeTile(new Tile(5, 3), 1);
    assert.equal(telefonRuleset.scoreDuringPlay(boardB), 0);
    assert.equal(telefonRuleset.scoreDuringPlay(boardB) % 5, 0);

    const boardC = new Board();
    boardC.placeFirst(new Tile(5, 5));
    const hand = [new Tile(5, 5), new Tile(5, 5), new Tile(2, 2)];
    const combo = boardC.getGoshaCombo(hand);
    assert.ok(combo);
    for (const move of combo.matches) {
        const idx = boardC.findOpenEndIndex(move.nodeId, move.side);
        boardC.placeTile(hand[move.tileIndex], idx);
    }
    assert.equal(telefonRuleset.scoreDuringPlay(boardC), 20);
    assert.equal(telefonRuleset.scoreDuringPlay(boardC) % 5, 0);
});

test("telefon handPoints keeps the zero double bonus", () => {
    assert.equal(telefonRuleset.handPoints([new Tile(0, 0)]), 10);
    assert.equal(telefonRuleset.handPoints([new Tile(2, 5)]), 7);
});

test("telefon resolveBlocked picks the lowest hand points winner on a blocked board", () => {
    const board = new Board();
    board.placeFirst(new Tile(3, 2));

    const hands = [
        [new Tile(6, 6)],
        [new Tile(1, 1)]
    ];

    const resolved = telefonRuleset.resolveBlocked({
        board,
        hands,
        boneyard: [],
        isTeamMode: false
    });

    assert.deepEqual(resolved, {
        blocked: true,
        fish: true,
        winnerIndex: 1,
        teamIndex: null
    });
});
