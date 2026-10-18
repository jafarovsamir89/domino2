const test = require("node:test");
const assert = require("node:assert/strict");
const {makeRoom} = require("./helpers/classic101-room.cjs");
const {Board} = require("../board");
const {Tile} = require("../model");
const golden = require("./fixtures/classic101-blocked.json");

test("real 28-tile fish applies 79+50=129 once before final scoring and settlement", async t => {
    const {room, stats} = await makeRoom(t);
    room.hands = golden.hands.map(hand => hand.map(id => new Tile(...id.split("-").map(Number))));
    room.boneyard = [];
    room.internalBoard = Board.fromJSON(golden.board);
    room.matchState = structuredClone(golden.before);
    room.syncMatchStateToSchema();
    room.state.gameActive = true;
    room.currentStakeKey = "stake_50";
    const tiles = [...room.hands.flat(), ...room.internalBoard.nodes.map(node => node.tile)];
    assert.equal(tiles.length, 28);
    assert.equal(new Set(tiles.map(tile => tile.id)).size, 28);
    assert.equal(room.internalBoard.isBlocked(room.hands, []), true);
    room.advanceTurn();
    await stats.finalPromise;
    assert.equal(room.matchState.sides[0].scored, 129);
    assert.equal(room.state.players.get("s0").score, 129);
    assert.equal(JSON.parse(room.state.matchStateJson).sides[0].scored, 129);
    assert.equal(room.matchFinished, true);
    assert.equal(stats.finals, 1);
    assert.equal(stats.settlements, 1);
    assert.equal(stats.records, 1);
    room.advanceTurn();
    await stats.finalPromise;
    assert.equal(stats.deals, 1);
    assert.equal(stats.settlements, 1);
    assert.equal(room.matchState.sides[0].scored, 129);
});

test("101 tie carry is applied once and consumed by the following fish", async t => {
    const {room, stats} = await makeRoom(t);
    room.internalBoard.isBlocked = () => true;
    room.hands = [[new Tile(1, 6)], [new Tile(3, 4)]];
    room.boneyard = [];
    room.state.gameActive = true;
    room.advanceTurn();
    assert.equal(room.matchState.carryPoints, 14);
    assert.equal(room.matchState.thresholdBypassNext, true);
    room.advanceTurn();
    assert.equal(room.matchState.carryPoints, 14);
    assert.equal(stats.deals, 1);

    room.hands = [[new Tile(0, 1)], [new Tile(1, 2)]];
    room.state.gameActive = true;
    room.advanceTurn();
    assert.equal(room.matchState.sides[0].scored, 17);
    assert.equal(room.matchState.carryPoints, 0);
    assert.equal(room.state.players.get("s0").score, 17);
    assert.equal(stats.deals, 2);
});

test("101 team fish updates both members and ends exactly once at 111", async t => {
    const {room, stats} = await makeRoom(t, 4, true);
    room.internalBoard.isBlocked = () => true;
    room.hands = [[new Tile(1, 2)], [new Tile(6, 6)], [new Tile(0, 1)], [new Tile(4, 5)]];
    room.boneyard = [];
    Object.assign(room.matchState.sides[0], {scored: 90, enteredBoard: true});
    room.syncMatchStateToSchema();
    room.state.gameActive = true;
    room.currentStakeKey = "stake_50";
    room.advanceTurn();
    await stats.finalPromise;
    assert.equal(room.matchState.sides[0].scored, 111);
    assert.equal(room.state.teamScores[0], 111);
    assert.equal(room.state.players.get("s0").score, 111);
    assert.equal(room.state.players.get("s2").score, 111);
    assert.equal(stats.settlements, 1);
    room.advanceTurn();
    assert.equal(stats.finals, 1);
    assert.equal(stats.records, 1);
});
