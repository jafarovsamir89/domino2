const test = require("node:test");
const assert = require("node:assert/strict");

const { Board, cloneBoard, reconstructBoard } = require("../board");
const { Tile, getOpeningPlayScore, hasInvalidOpeningHand } = require("../model");

test("board serializes and restores without losing structure", () => {
    const board = new Board();
    board.placeFirst(new Tile(5, 5));
    board.placeTile(new Tile(5, 2), 0);

    const json = board.toJSON();
    const restored = Board.fromJSON(json);

    assert.equal(restored.nodes.length, board.nodes.length);
    assert.equal(restored.openEnds.length, board.openEnds.length);
    assert.equal(restored.crossNodeId, board.crossNodeId);
    assert.equal(restored.crossSidesClosed, board.crossSidesClosed);
    assert.equal(typeof restored.nodes[0].toJSON, "function");
});

test("cloneBoard and reconstructBoard preserve the board snapshot", () => {
    const board = new Board();
    board.placeFirst(new Tile(3, 2));

    const cloned = cloneBoard(board);
    const reconstructed = reconstructBoard(board.toJSON());

    assert.equal(cloned.nodes.length, 1);
    assert.equal(reconstructed.nodes.length, 1);
    assert.equal(cloned.openEnds.length, 2);
    assert.equal(reconstructed.openEnds.length, 2);
});

test("getGoshaCombo keeps the full score for a double gosha sequence", () => {
    const board = new Board();
    board.placeFirst(new Tile(5, 5));

    const hand = [new Tile(5, 5), new Tile(5, 5), new Tile(2, 2)];
    const combo = board.getGoshaCombo(hand);

    assert.ok(combo);
    assert.equal(combo.matches.length, 2);
    assert.equal(combo.score, 20);

    for (const move of combo.matches) {
        const idx = board.findOpenEndIndex(move.nodeId, move.side);
        board.placeTile(hand[move.tileIndex], idx);
    }

    assert.equal(board.calculateScore(), 20);
});

test("opening [5|5] stops giving 10 points after 300 score", () => {
    assert.equal(getOpeningPlayScore(new Tile(5, 5), 0), 10);
    assert.equal(getOpeningPlayScore(new Tile(5, 5), 299), 10);
    assert.equal(getOpeningPlayScore(new Tile(5, 5), 300), 0);
    assert.equal(getOpeningPlayScore(new Tile(5, 5), 365), 0);
});

test("hand with five different doubles is invalid for opening deal", () => {
    const hand = [
        new Tile(0, 0),
        new Tile(1, 1),
        new Tile(2, 2),
        new Tile(3, 3),
        new Tile(4, 4),
        new Tile(6, 5),
        new Tile(6, 6)
    ];
    assert.equal(hasInvalidOpeningHand(hand), true);
    assert.equal(hasInvalidOpeningHand([new Tile(0, 0), new Tile(1, 1), new Tile(2, 2), new Tile(3, 3)]), false);
});
