const test = require("node:test");
const assert = require("node:assert/strict");

const { Board, cloneBoard, reconstructBoard } = require("../board");
const { Tile } = require("../model");

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
