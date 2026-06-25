const test = require("node:test");
const assert = require("node:assert/strict");

const { Board } = require("../board");
const { Tile } = require("../model");
const { getRuleset, createClassic101MatchState } = require("../../shared/domino-rulesets.cjs");

const telefonRuleset = getRuleset("telefon");
const classic101Ruleset = getRuleset("classic101");

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

test("classic101 opens with the youngest double and raw scoring rules", () => {
    assert.equal(classic101Ruleset.matchTarget, 101);
    assert.deepEqual(classic101Ruleset.determineFirstPlayer([
        [new Tile(6, 6)],
        [new Tile(2, 2)],
        [new Tile(1, 1)],
        [new Tile(0, 0)],
        [new Tile(3, 4)]
    ]), {
        player: 2,
        tileIndex: 0,
        drawToOpen: false
    });
    assert.deepEqual(classic101Ruleset.determineFirstPlayer([
        [new Tile(6, 6)],
        [new Tile(2, 3)]
    ]), {
        player: 0,
        tileIndex: 0,
        drawToOpen: false
    });
    assert.deepEqual(classic101Ruleset.determineFirstPlayer([
        [new Tile(6, 5)],
        [new Tile(2, 3)]
    ]), {
        player: -1,
        tileIndex: -1,
        drawToOpen: true
    });
    assert.deepEqual(classic101Ruleset.determineFirstPlayer([
        [new Tile(0, 0)],
        [new Tile(6, 6)],
        [new Tile(2, 3)]
    ]), {
        player: 1,
        tileIndex: 0,
        drawToOpen: false
    });
    assert.deepEqual(classic101Ruleset.determineFirstPlayer([
        [new Tile(6, 6)],
        [new Tile(2, 2)],
        [new Tile(3, 3)]
    ]), {
        player: 1,
        tileIndex: 0,
        drawToOpen: false
    });

    const board = new Board();
    board.placeFirst(new Tile(3, 2));
    assert.equal(classic101Ruleset.scoreDuringPlay(board), 0);

    const hands = [
        [new Tile(6, 6)],
        [new Tile(2, 3)]
    ];
    const boneyard = [new Tile(1, 1), new Tile(0, 0)];
    const opened = classic101Ruleset.drawToOpen({ hands, boneyard, startPlayer: 0 });
    assert.deepEqual(opened, {
        found: true,
        player: 1,
        tileIndex: 1,
        draws: 2
    });
    assert.ok(hands[0].some((tile) => tile.a === 0 && tile.b === 0));
    assert.ok(hands[1].some((tile) => tile.a === 1 && tile.b === 1));
    assert.equal(boneyard.length, 0);

    const hand = [new Tile(1, 2)];
    const drawBoard = new Board();
    drawBoard.placeFirst(new Tile(3, 3));
    const drawOutcome = classic101Ruleset.drawToPlay({
        board: drawBoard,
        hand,
        boneyard: [new Tile(3, 1)]
    });
    assert.deepEqual(drawOutcome, {
        playable: true,
        draws: 1,
        exhausted: true
    });
    assert.equal(hand.length, 2);
});

test("classic101 awards raw points, handles fish, threshold entry, and dry wins", () => {
    const exitResult = classic101Ruleset.resolveRoundEnd({
        score: 0,
        hand: [],
        board: new Board(),
        hands: [
            [],
            [new Tile(6, 6), new Tile(5, 0)]
        ],
        boneyard: [],
        playerIndex: 0,
        isTeamMode: false,
        matchState: createClassic101MatchState(2, false)
    });

    assert.equal(exitResult.scoreDelta, 17);
    assert.equal(exitResult.matchTargetReached, false);
    assert.deepEqual(exitResult.scoreboard, [17, 0]);

    const fishBoard = new Board();
    fishBoard.placeFirst(new Tile(3, 2));
    const fishResult = classic101Ruleset.resolveBlocked({
        board: fishBoard,
        hands: [
            [new Tile(6, 6), new Tile(1, 0)],
            [new Tile(6, 6), new Tile(6, 5), new Tile(4, 0)]
        ],
        boneyard: [],
        isTeamMode: false,
        matchState: createClassic101MatchState(2, false)
    });

    assert.equal(fishResult.winnerIndex, 0);
    assert.equal(fishResult.scoreDelta, 27);
    assert.deepEqual(fishResult.scoreboard, [27, 0]);

    let matchState = createClassic101MatchState(2, false);
    for (const rawTile of [4, 5, 3]) {
        const roundResult = classic101Ruleset.resolveRoundEnd({
            score: 0,
            hand: [],
            board: new Board(),
            hands: [
                [],
                [new Tile(rawTile, 0)]
            ],
            boneyard: [],
            playerIndex: 0,
            isTeamMode: false,
            matchState
        });
        matchState = roundResult.matchState;
        assert.equal(roundResult.scoreDelta, 0);
    }
    assert.equal(matchState.sides[0].pending, 0);
    assert.equal(matchState.sides[0].missStreak, 0);

    const tieBoard = new Board();
    tieBoard.placeFirst(new Tile(3, 2));
    const tieResult = classic101Ruleset.resolveBlocked({
        board: tieBoard,
        hands: [
            [new Tile(4, 4)],
            [new Tile(4, 4)]
        ],
        boneyard: [],
        isTeamMode: false,
        matchState: createClassic101MatchState(2, false)
    });
    assert.equal(tieResult.tie, true);
    assert.equal(tieResult.carryPoints, 16);
    assert.equal(tieResult.matchState.thresholdBypassNext, true);

    const bypassResult = classic101Ruleset.resolveRoundEnd({
        score: 0,
        hand: [],
        board: new Board(),
        hands: [
            [],
            [new Tile(1, 1)]
        ],
        boneyard: [],
        playerIndex: 0,
        isTeamMode: false,
        matchState: tieResult.matchState
    });
    assert.equal(bypassResult.scoreDelta, 18);
    assert.equal(bypassResult.matchTargetReached, false);
    assert.equal(bypassResult.scoreboard[0], 18);

    const dryState = createClassic101MatchState(2, false);
    dryState.sides[0].scored = 99;
    dryState.sides[0].enteredBoard = true;
    const dryResult = classic101Ruleset.resolveRoundEnd({
        score: 0,
        hand: [],
        board: new Board(),
        hands: [
            [],
            [new Tile(1, 1)]
        ],
        boneyard: [],
        playerIndex: 0,
        isTeamMode: false,
        matchState: dryState
    });

    assert.equal(dryResult.matchTargetReached, true);
    assert.equal(dryResult.dryWin, true);
    assert.equal(dryResult.scoreDelta, 2);
    assert.equal(dryResult.scoreboard[0], 101);
});
