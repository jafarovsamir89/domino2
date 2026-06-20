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

test("placeTile rejects tiles that do not match the selected open end", () => {
    const board = new Board();
    board.placeFirst(new Tile(0, 0));
    const before = board.toJSON();

    const score = board.placeTile(new Tile(1, 3), 0);

    assert.equal(score, 0);
    assert.deepEqual(board.toJSON(), before);
});

test("placeTile keeps legal 0/3 placements on the 0 end and exposes 3 as the next open end", () => {
    const board = new Board();
    board.placeFirst(new Tile(0, 0));

    const score = board.placeTile(new Tile(0, 3), 0);

    assert.equal(score, 0);
    assert.equal(board.nodes.length, 2);
    assert.equal(board.nodes[1].displayA, 3);
    assert.equal(board.nodes[1].displayB, 0);
    assert.ok(board.openEnds.some((oe) => oe.value === 3));
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

test("Default horizontal mode layout behavior", () => {
    // Normal tile
    const board1 = new Board();
    board1.startAxis = "horizontal";
    board1.placeFirst(new Tile(3, 2));
    assert.equal(board1.nodes[0].orientation, "horizontal");
    assert.deepEqual(board1.openEnds.map(oe => oe.side), ["left", "right"]);

    // Double tile
    const board2 = new Board();
    board2.startAxis = "horizontal";
    board2.placeFirst(new Tile(5, 5));
    assert.equal(board2.nodes[0].orientation, "vertical");
    assert.deepEqual(board2.openEnds.map(oe => oe.side), ["left", "right"]);
});

test("Vertical mode layout behavior for normal tile", () => {
    const board = new Board();
    board.startAxis = "vertical";
    board.placeFirst(new Tile(3, 2));
    assert.equal(board.nodes[0].orientation, "vertical");
    assert.deepEqual(board.openEnds.map(oe => oe.side), ["top", "bottom"]);
    assert.equal(board.openEnds[0].value, 3);
    assert.equal(board.openEnds[1].value, 2);
});

test("Vertical mode layout behavior for first double/gosha", () => {
    // [5|5]
    const board1 = new Board();
    board1.startAxis = "vertical";
    const score1 = board1.placeFirst(new Tile(5, 5));
    assert.equal(board1.nodes[0].orientation, "horizontal");
    assert.deepEqual(board1.openEnds.map(oe => oe.side), ["top", "bottom"]);
    assert.equal(board1.openEnds[0].value, 5);
    assert.equal(board1.openEnds[1].value, 5);
    assert.equal(score1, 10);

    // [6|6]
    const board2 = new Board();
    board2.startAxis = "vertical";
    const score2 = board2.placeFirst(new Tile(6, 6));
    assert.equal(board2.nodes[0].orientation, "horizontal");
    assert.deepEqual(board2.openEnds.map(oe => oe.side), ["top", "bottom"]);
    assert.equal(score2, 0);
});

test("Subsequent moves and score calculation after first double in vertical mode", () => {
    const board = new Board();
    board.startAxis = "vertical";
    board.placeFirst(new Tile(5, 5));

    // Place [5|2] on the bottom open end (index 1)
    const score1 = board.placeTile(new Tile(5, 2), 1);
    assert.equal(board.nodes.length, 2);
    assert.ok(board.openEnds.some(oe => oe.value === 2));

    // Place [5|3] on the top open end (index 0)
    const score2 = board.placeTile(new Tile(5, 3), 0);
    assert.equal(board.nodes.length, 3);
    assert.ok(board.openEnds.some(oe => oe.value === 3));

    assert.equal(board.calculateScore(), 5); // 2 + 3 = 5
});

