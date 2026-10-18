const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const DominoRoom = require("../DominoRoom");
const { Tile, handPoints } = require("../model");
const { getRuleset } = require("../../shared/domino-rulesets.cjs");
const ruleset = getRuleset("telefon");
const root = path.resolve(__dirname, "../..");

function boardWithScore(score) {
    return {
        isEmpty: false,
        openEnds: [{ value: 6 }],
        nodes: [],
        placeTile: () => score,
        calculateScore: () => score,
        findOpenEndIndex: () => 0,
        isBlocked: () => false
    };
}

// Evaluate the complete actual class, without its DOM/network constructor or
// application entrypoint. No brace-counting method extraction or reimplemented play logic.
function loadClient(relativePath) {
    const source = fs.readFileSync(path.join(root, relativePath), "utf8");
    const start = source.indexOf("class DominoGame {");
    const end = source.indexOf("\nlet game = null;", start);
    const fallbackStart = source.indexOf("const TELEFON_RULESET_FALLBACK =");
    const fallbackEnd = source.indexOf("\nfunction getRuleset(", fallbackStart);
    assert.ok(start >= 0 && end > start && fallbackStart >= 0 && fallbackEnd > fallbackStart, "client class/fallback boundaries must exist");
    return vm.runInNewContext(`${source.slice(fallbackStart, fallbackEnd)}\n${source.slice(start, end)}\n({DominoGame, fallback: TELEFON_RULESET_FALLBACK})`, {
        IWIN: 35, LAST_MOVE_REVEAL_DELAY_MS: 1200, handPoints, console,
        debugLog: () => {}, sndWin: () => {}
    }, { filename: relativePath });
}

function prepareClient(klass, activeRuleset, enabled, score = 35) {
    const game = Object.create(klass.prototype);
    const outcome = { ended: 0, advanced: 0 };
    Object.assign(game, {
        mode: "telefon", ruleset: activeRuleset, instantWinEnabled: enabled,
        hands: [[new Tile(6, 1), new Tile(2, 3)], [new Tile(4, 4)]],
        board: boardWithScore(score), boneyard: [], currentPlayer: 0,
        humanPlayerIndex: 0, gameActive: true, turnInProgress: false,
        postMoveWindowActive: false, isTeamMode: false, _turnCycleId: 1,
        network: { isMultiplayer: false }, renderer: {}, ais: [],
        goshaCombo: { score, matches: [{tileIndex: 0, nodeId: 0, side: "right"}] },
        getTeamMembers: index => [index], isInputBlockedByStage: () => false,
        clearTurnTimers: () => {}, playSound: () => {}, renderState: () => {}, log: () => {},
        addScore: (_index, amount) => amount, broadcastMsg: () => {},
        format: () => "", playerNames: ["Fixture", "Other"],
        shouldOpenGoshaChainWindow: () => false,
        inferFinalInfoFromLocalMove: () => ({}),
        delayLastMoveSettlement: callback => callback(),
        endRound: () => { outcome.ended++; },
        endDeal: () => { throw new Error("Nonempty, unblocked hand must not end the deal"); },
        scheduleTurnAdvance: () => { outcome.advanced++; }
    });
    return {game, outcome};
}

function prepareRoom(enabled, score = 35) {
    const room = Object.create(DominoRoom.prototype);
    const outcome = { ended: 0, advanced: 0, delta: null };
    Object.assign(room, {
        gameMode: "telefon", instantWinEnabled: enabled, totalPlayers: 2,
        hands: [[new Tile(6, 1), new Tile(2, 3)], [new Tile(4, 4)]],
        internalBoard: boardWithScore(score), boneyard: [],
        state: { players: new Map([["fixture", { name: "Fixture" }]]), playerOrder: ["fixture"], isTeamMode: false },
        getActiveRuleset: () => ruleset,
        getTeamMembers: index => [index],
        configureBoardForCurrentMode: () => {},
        getValidMovesForPlayer: () => [{tileIndex: 0, openEndIndex: 0}],
        clearTurnTimer: () => {}, broadcast: () => {}, addScore: (_index, amount) => amount,
        normalizeMatchStateForCurrentMode: state => state,
        syncMatchStateToSchema: () => {}, bumpTurnVersion: () => {},
        broadcastGameDelta: delta => { outcome.delta = delta; },
        endRound: () => { outcome.ended++; },
        endDeal: () => { throw new Error("Nonempty, unblocked hand must not end the deal"); },
        shouldOpenGoshaChainWindow: () => false,
        scheduleTurnAdvance: () => { outcome.advanced++; }
    });
    return {room, outcome};
}

for (const enabled of [false, true]) {
    for (const score of [30, 35, 40]) {
        const expected = enabled && score >= 35;
        for (const action of ["play", "gosha"]) {
            test(`server ${action}: instant=${enabled}, score=${score} honors the setting`, () => {
                const {room, outcome} = prepareRoom(enabled, score);
                const accepted = action === "play"
                    ? room.performPlay(0, 0, 0)
                    : room.performGosha(0, { score, matches: [{tileIndex: 0, nodeId: 0, side: "right"}] });
                assert.equal(accepted, true);
                assert.equal(outcome.ended, Number(expected));
                assert.equal(outcome.advanced, Number(!expected));
                assert.equal(outcome.delta.isFinalMove, expected);
            });
        }
    }
}

for (const relativePath of ["js/app.js", "www/js/app.js"]) {
    const {DominoGame, fallback} = loadClient(relativePath);
    for (const [name, activeRuleset] of [["shared", ruleset], ["fallback", fallback]]) {
        for (const enabled of [false, true]) {
            for (const action of ["playTile", "playGoshaCombo"]) {
                test(`${relativePath} ${name} ${action}: score35, instant=${enabled}`, async () => {
                    const {game, outcome} = prepareClient(DominoGame, activeRuleset, enabled);
                    if (action === "playTile") await game.playTile(0, 0, 0);
                    else game.playGoshaCombo();
                    assert.equal(game.hands[0].length, 1);
                    assert.equal(outcome.ended, Number(enabled));
                    assert.equal(outcome.advanced, Number(!enabled));
                });
            }
        }
        test(`${relativePath} ${name}: disabling instant win still ends an empty hand`, () => {
            const result = activeRuleset.resolveRoundEnd({score: 35, hand: [], instantWinEnabled: false});
            assert.equal(result.isInstantWin, false);
            assert.equal(result.dealEnd, true);
        });
    }
}

test("web and packaged app assets stay identical", () => {
    assert.equal(fs.readFileSync(path.join(root, "js/app.js"), "utf8"), fs.readFileSync(path.join(root, "www/js/app.js"), "utf8"));
});
