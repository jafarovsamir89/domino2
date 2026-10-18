const test = require("node:test");
const assert = require("node:assert/strict");
const {makeRoom} = require("./helpers/classic101-room.cjs");
const {resetJoinRateLimits} = require("../joinRateLimit");

async function fixture(t) {
    resetJoinRateLimits();
    const {room} = await makeRoom(t);
    room.matchRecordId = "owned-match";
    room.state.gameActive = true;
    room.state.currentPlayerIndex = 0;
    room.hands = [[{id: "1-2"}], [{id: "3-4"}]];
    for (let index = 0; index < 2; index++) {
        room.state.players.get(`s${index}`).userId = `user-${index}`;
        room.identityBySessionId.set(`s${index}`, {provider: "platform", userId: `user-${index}`, playerId: `player-${index}`});
    }
    // Isolate presentation after authorization; real onJoin retains seat/hands.
    room.registerLivePlayer = () => {};
    room.syncState = () => {};
    room.maybeAutoStartGame = () => false;
    room.sendReconnectRestoreState = session => {room.deliveredHand = room.hands[room.state.playerOrder.indexOf(session)];};
    const identity = {provider: "platform", userId: "user-0", playerId: "player-0", displayName: "Owner"};
    const options = {restoreSessionId: "s0", restoreRoomId: room.roomId, restoreRoomCode: room.roomCode, restoreMatchId: "owned-match"};
    return {room, identity, options};
}

for (const changed of [{userId: "other"}, {playerId: "other"}, {provider: "guest"}, {userId: ""}]) {
    test(`explicit restore rejects mismatching owner ${JSON.stringify(changed)} before mutation or hand delivery`, async t => {
        const {room, identity, options} = await fixture(t);
        const before = structuredClone({order: room.state.playerOrder, player: room.state.players.get("s0"), hands: room.hands});
        assert.throws(() => room.onJoin({sessionId: "new", send() {}, leave() {}}, options, {...identity, ...changed}), /restore_identity_mismatch/);
        assert.deepEqual(structuredClone({order: room.state.playerOrder, player: room.state.players.get("s0"), hands: room.hands}), before);
        assert.equal(room.deliveredHand, undefined);
    });
}

for (const changed of [{restoreRoomId: "other"}, {restoreRoomCode: "OTHER"}, {restoreMatchId: "old-match"}]) {
    test(`restore rejects stale context ${JSON.stringify(changed)}`, async t => {
        const {room, identity, options} = await fixture(t);
        assert.throws(() => room.findReusableSessionId({...options, ...changed}, identity), /restore_context_mismatch/);
    });
}

for (const restored of [false, true]) {
    test(`owner restore preserves hand and seat, snapshot=${restored}`, async t => {
        const {room, identity, options} = await fixture(t);
        room.restoredFromSnapshot = restored;
        const hand = room.hands[0];
        room.onJoin({sessionId: "new", send() {}, leave() {}}, options, identity);
        assert.equal(room.state.playerOrder[0], "new");
        assert.equal(room.state.players.get("new").userId, "user-0");
        assert.equal(room.deliveredHand, hand);
        assert.equal(room.state.players.has("s0"), false);
        assert.equal(room.findReusableSessionId({restoreRoomId: room.roomId}, identity), "new");
    });
}
