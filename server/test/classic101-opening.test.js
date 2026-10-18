const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const {makeRoom} = require("./helpers/classic101-room.cjs");
const {createFullSet, shuffle} = require("../model");
const {getRuleset} = require("../../shared/domino-rulesets.cjs");

function seededDeck(t, initial) {
    let state = initial;
    t.mock.method(crypto, "randomInt", (min, max) => {
        if (max === undefined) {max = min; min = 0;}
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return min + Math.floor(state / 2 ** 32 * (max - min));
    });
    return seed => {state = seed;};
}

function assertConservation(room) {
    const tiles = [...room.hands.flat(), ...room.boneyard, ...room.internalBoard.nodes.map(node => node.tile)];
    assert.equal(tiles.length, 28);
    assert.equal(new Set(tiles.map(tile => tile.id)).size, 28);
    assert.ok(room.state.currentPlayerIndex >= 0 && room.state.currentPlayerIndex < room.totalPlayers);
    assert.equal(room.state.gameActive, true);
    assert.equal(room.state.boneyardCount, room.boneyard.length);
    for (let index = 0; index < room.totalPlayers; index++) {
        assert.equal(room.state.players.get(`s${index}`).handCount, room.hands[index].length);
    }
}

test("101 seed225 draws to opening double before turn, schema, payload and snapshot are published", async t => {
    const {room, stats} = await makeRoom(t);
    const reset = seededDeck(t, 225);
    const deck = shuffle(createFullSet());
    assert.equal(getRuleset("classic101").determineFirstPlayer([deck.slice(0, 7), deck.slice(7, 14)]).drawToOpen, true);
    reset(225);
    t.mock.timers.enable({apis: ["setTimeout"]});
    await room.startDeal();
    assertConservation(room);
    assert.equal(room.state.currentPlayerIndex, 1);
    assert.deepEqual(room.hands.map(hand => hand.length), [8, 8]);
    assert.equal(room.boneyard.length, 12);
    const opening = room.getOpeningMoveRequirement();
    assert.deepEqual(opening, {playerIndex: 1, tileIndex: 7, tileId: "3-3"});
    assert.deepEqual(room.getValidMovesForPlayer(1), [{tileIndex: 7, openEndIndex: -1}]);
    assert.deepEqual(room.getValidMovesForPlayer(0), []);
    const payload = room.buildFullStatePayloadForClient({sessionId: "s1"});
    assert.equal(payload.currentPlayerIndex, 1);
    assert.equal(payload.boneyardCount, 12);
    assert.equal(payload.selfHand.length, 8);
    assert.deepEqual(payload.turnInfo.validMoves, [{tileIndex: 7, openEndIndex: -1}]);
    assert.equal(stats.timers, 1);
    t.mock.timers.tick(1200);
    const stage = stats.events.filter(event => event.type === "round_stage" && event.payload.phase === "opening-turn").at(-1);
    assert.equal(stage.payload.actorIndex, 1);

    const snapshot = JSON.parse(JSON.stringify(room.buildCustomStateSnapshot()));
    const restored = (await makeRoom(t)).room;
    restored.applyCustomStateSnapshot(snapshot);
    assertConservation(restored);
    assert.equal(restored.state.currentPlayerIndex, 1);
    assert.deepEqual(restored.hands.map(hand => hand.map(tile => tile.id)), room.hands.map(hand => hand.map(tile => tile.id)));
    assert.deepEqual(restored.boneyard.map(tile => tile.id), room.boneyard.map(tile => tile.id));
    assert.deepEqual(restored.getOpeningMoveRequirement(), opening);
});

test("101 previous deal winner still opens without drawing extra tiles", async t => {
    const {room} = await makeRoom(t);
    seededDeck(t, 225);
    t.mock.timers.enable({apis: ["setTimeout"]});
    room.lastDealWinner = 0;
    await room.startDeal();
    assertConservation(room);
    assert.equal(room.state.currentPlayerIndex, 0);
    assert.deepEqual(room.hands.map(hand => hand.length), [7, 7]);
    assert.equal(room.boneyard.length, 14);
    assert.equal(room.getOpeningMoveRequirement(), null);
});

for (const [count, team] of [[2, false], [3, false], [4, true]]) {
    test(`101 normal opening distribution and tile conservation for ${count} players, team=${team}`, async t => {
        const {room} = await makeRoom(t, count, team);
        const reset = seededDeck(t, 1);
        t.mock.timers.enable({apis: ["setTimeout"]});
        for (const seed of [1, 17, 87]) {
            reset(seed);
            const deck = shuffle(createFullSet());
            const originalHands = Array.from({length: count}, (_, index) => deck.slice(index * 7, index * 7 + 7));
            const opening = getRuleset("classic101").determineFirstPlayer(originalHands);
            reset(seed);
            await room.startDeal();
            assertConservation(room);
            if (!opening.drawToOpen) {
                assert.equal(room.state.currentPlayerIndex, opening.player);
                assert.deepEqual(room.hands.map(hand => hand.map(tile => tile.id)), originalHands.map(hand => hand.map(tile => tile.id)));
                assert.equal(room.boneyard.length, 28 - count * 7);
            }
        }
    });
}

for (const [count, team, seed] of [[2, false, 225], [4, true, 17]]) {
    test(`101 complete match from seed${seed}, players=${count} keeps a valid turn and all28tiles`, async t => {
        const {room, stats} = await makeRoom(t, count, team);
        seededDeck(t, seed);
        t.mock.timers.enable({apis: ["setTimeout"]});
        let advancePending = false, actions = 0, deals = 1;
        room.scheduleTurnAdvance = () => {advancePending = true;};
        await room.startDeal();
        while (!room.matchFinished && actions < 10_000 && deals < 200) {
            if (!room.state.gameActive) {
                deals++;
                if (room.pendingAdvanceKind === "round") await room.startRound();
                else await room.startDeal();
                continue;
            }
            assertConservation(room);
            const player = room.state.currentPlayerIndex;
            const move = room.getValidMovesForPlayer(player)[0];
            const accepted = move ? room.performPlay(player, move.tileIndex, move.openEndIndex, true)
                : room.boneyard.length ? room.performDraw(player, true) : room.performPass(player, true);
            assert.equal(accepted, true);
            actions++;
            if (advancePending) {advancePending = false; room.advanceTurn();}
            await stats.finalPromise;
        }
        assert.equal(room.matchFinished, true, `Match must finish within bounds: ${actions}actions/${deals}deals`);
        assert.equal(stats.records, 1);
        assert.equal(stats.finals, 1);
        assert.equal(stats.settlements, 0, "Free simulation must not call monetary services");
        const allTiles = [...room.hands.flat(), ...room.boneyard, ...room.internalBoard.nodes.map(node => node.tile)];
        assert.equal(new Set(allTiles.map(tile => tile.id)).size, 28);
        t.diagnostic(JSON.stringify({seed, count, team, actions, deals, scores: room.matchState.sides.map(side => side.scored)}));
    });
}
