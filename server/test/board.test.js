const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const { Board, cloneBoard, reconstructBoard } = require("../board");
const { Tile, getOpeningPlayScore, hasInvalidOpeningHand } = require("../model");

function makeTile(a, b) {
    return {
        a,
        b,
        id: `${a}-${b}`,
        isDouble: a === b,
        total: a + b,
        hasValue(value) {
            return this.a === value || this.b === value;
        },
        otherSide(value) {
            return this.a === value ? this.b : (this.b === value ? this.a : -1);
        }
    };
}

function getTileRect(node, padding = 0.9) {
    const isHorizontal = node.orientation === "horizontal";
    const halfWidth = (isHorizontal ? 66 : 34) / 2 + padding;
    const halfHeight = (isHorizontal ? 34 : 66) / 2 + padding;
    return {
        left: node.x - halfWidth,
        right: node.x + halfWidth,
        top: node.y - halfHeight,
        bottom: node.y + halfHeight
    };
}

function assertCollisionFree(board, context = "board") {
    for (let i = 0; i < board.nodes.length; i++) {
        const a = getTileRect(board.nodes[i]);
        for (let j = i + 1; j < board.nodes.length; j++) {
            const b = getTileRect(board.nodes[j]);
            const intersects = a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
            assert.equal(intersects, false, `${context}: nodes ${i} and ${j} overlap`);
        }
    }
}

function createTelephoneBoard(BoardClass = Board, tileFactory = (a, b) => new Tile(a, b), startAxis = "vertical") {
    const board = new BoardClass();
    board.startAxis = startAxis;
    board.placeFirst(tileFactory(1, 1));

    const firstSide = startAxis === "vertical" ? "top" : "left";
    const secondSide = startAxis === "vertical" ? "bottom" : "right";
    board.placeTile(tileFactory(1, 2), board.findOpenEndIndex(0, firstSide));
    board.placeTile(tileFactory(1, 2), board.findOpenEndIndex(0, secondSide));
    assert.equal(board.openEnds.length, 4);
    return board;
}

function extendTelephoneBoard(board, tileFactory, chooseOpenEnd, targetNodeCount = 28) {
    while (board.nodes.length < targetNodeCount) {
        const openEndIndex = chooseOpenEnd(board);
        const value = board.openEnds[openEndIndex].value;
        const nextValue = value === 1 ? 2 : 1;
        board.placeTile(tileFactory(value, nextValue), openEndIndex);
        assertCollisionFree(board, `after node ${board.nodes.length - 1}`);
    }
}

async function loadClientBoardModule() {
    const previousWindow = global.window;
    global.window = {
        performance: { now: () => 0 },
        crypto: {
            getRandomValues(array) {
                if (array && typeof array.length === "number") {
                    for (let i = 0; i < array.length; i++) array[i] = 1;
                }
                return array;
            }
        }
    };
    try {
        const url = pathToFileURL(path.join(__dirname, "../../js/board.js")).href;
        return await import(`${url}?t=${Date.now()}-${Math.random()}`);
    } finally {
        if (previousWindow === undefined) delete global.window;
        else global.window = previousWindow;
    }
}

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
    assert.equal(restored.telephoneEnabled, board.telephoneEnabled);
    assert.equal(restored.scoringEnabled, board.scoringEnabled);
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

test("board flags disable Telefon scoring and cross logic in classic101", () => {
    const board = new Board();
    board.telephoneEnabled = false;
    board.scoringEnabled = false;

    assert.equal(board.placeFirst(new Tile(5, 5)), 0);
    assert.equal(board.openEnds.length, 2);
    assert.equal(board.placeTile(new Tile(5, 2), 0), 0);
    assert.equal(board.crossNodeId, null);
    assert.equal(board.crossSidesClosed, 0);
    assert.equal(board.openEnds.length, 2);

    const cloned = cloneBoard(board);
    const reconstructed = reconstructBoard(board.toJSON());

    assert.equal(cloned.telephoneEnabled, false);
    assert.equal(cloned.scoringEnabled, false);
    assert.equal(reconstructed.telephoneEnabled, false);
    assert.equal(reconstructed.scoringEnabled, false);
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

test("default board keeps Telefon scoring and cross behavior", () => {
    const board = new Board();

    assert.equal(board.telephoneEnabled, true);
    assert.equal(board.scoringEnabled, true);
    assert.equal(board.placeFirst(new Tile(5, 5)), 10);
    assert.equal(board.placeTile(new Tile(5, 2), 0), 0);
    assert.equal(board.toJSON().telephoneEnabled, true);
    assert.equal(board.toJSON().scoringEnabled, true);
});

test("client board round-trip keeps classic101 flags and stays two-ended across serialization", async () => {
    const { Board: ClientBoard } = await loadClientBoardModule();
    const board = new ClientBoard();
    board.telephoneEnabled = false;
    board.scoringEnabled = false;

    assert.equal(board.placeFirst(makeTile(1, 1)), 0);
    assert.equal(board.placeTile(makeTile(1, 3), 1), 0);

    const restored = ClientBoard.fromJSON(board.toJSON());

    assert.equal(restored.telephoneEnabled, false);
    assert.equal(restored.scoringEnabled, false);

    assert.equal(restored.placeTile(makeTile(1, 2), 0), 0);
    assert.equal(restored.crossNodeId, null);
    assert.equal(restored.crossSidesClosed, 0);
    assert.equal(restored.openEnds.length, 2);
    assert.equal(restored.openEnds.some((oe) => oe.side === "top" || oe.side === "bottom"), false);
    assert.equal(restored.nodes[0].connections.left, 2);
    assert.equal(restored.nodes[0].connections.right, 1);
    assert.equal(restored.getValidMoves([makeTile(2, 3)]).length, 2);
});

test("client board keeps Telefon cross behavior by default", async () => {
    const { Board: ClientBoard } = await loadClientBoardModule();
    const board = new ClientBoard();

    board.placeFirst(makeTile(1, 1));
    board.placeTile(makeTile(1, 3), 1);
    board.placeTile(makeTile(1, 2), 0);
    assert.equal(board.crossNodeId, 0);
    assert.equal(board.openEnds.length, 4);
    assert.equal(board.openEnds.some((oe) => oe.side === "top"), true);
    assert.equal(board.openEnds.some((oe) => oe.side === "bottom"), true);
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

test("telephone snake avoids self-intersection when right and bottom branches grow together", () => {
    const board = createTelephoneBoard();
    let step = 0;
    extendTelephoneBoard(board, (a, b) => new Tile(a, b), (state) => {
        const axis = step++ % 2 === 0 ? "x" : "y";
        let bestIndex = 0;
        for (let i = 1; i < state.openEnds.length; i++) {
            const current = state.nodes[state.openEnds[i].nodeId];
            const best = state.nodes[state.openEnds[bestIndex].nodeId];
            if (current[axis] > best[axis]) bestIndex = i;
        }
        return bestIndex;
    });
});

test("telephone snake remains collision-free for varied 28-tile move orders", () => {
    for (let scenario = 1; scenario <= 100; scenario++) {
        const startAxis = scenario % 2 === 0 ? "horizontal" : "vertical";
        const board = createTelephoneBoard(Board, (a, b) => new Tile(a, b), startAxis);
        let seed = scenario * 2654435761;
        extendTelephoneBoard(board, (a, b) => new Tile(a, (seed & 4) === 0 ? a : b), (state) => {
            seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
            return seed % state.openEnds.length;
        });
    }
});

test("client and shared board engines choose identical collision-free coordinates", async () => {
    const { Board: ClientBoard } = await loadClientBoardModule();
    const serverBoard = createTelephoneBoard();
    const clientBoard = createTelephoneBoard(ClientBoard, makeTile);
    let seed = 0x51f15e;

    while (serverBoard.nodes.length < 28) {
        seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
        const openEndIndex = seed % serverBoard.openEnds.length;
        const value = serverBoard.openEnds[openEndIndex].value;
        const nextValue = value === 1 ? 2 : 1;
        serverBoard.placeTile(new Tile(value, nextValue), openEndIndex);
        clientBoard.placeTile(makeTile(value, nextValue), openEndIndex);
    }

    assertCollisionFree(serverBoard, "shared board");
    assertCollisionFree(clientBoard, "client board");
    assert.deepEqual(
        clientBoard.nodes.map(({ x, y, orientation }) => ({ x, y, orientation })),
        serverBoard.nodes.map(({ x, y, orientation }) => ({ x, y, orientation }))
    );
});

