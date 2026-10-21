const test = require('node:test');
const assert = require('node:assert/strict');
const { RoomSessionAccess, validateActivePlatformSession, CHECK_INTERVAL_MS, ACCESS_REVOKED_CODE } = require('../roomSessionAccess');

function fixture(validate) {
    const identity = { provider: 'platform', userId: 'synthetic-u', playerId: 'synthetic-p', authToken: 'synthetic-token' };
    const closes = [];
    const client = { sessionId: 'synthetic-seat', leave: code => closes.push(code) };
    const room = { clients: [client], identityBySessionId: new Map([[client.sessionId, identity]]) };
    const guard = new RoomSessionAccess(room, { validate });
    return { guard, room, client, identity, closes };
}

test('active validation uses a scoped server proof and an expired admission token cannot admit a new player', async () => {
    process.env.BETTER_AUTH_SECRET = 'synthetic-r10-active-session-secret';
    process.env.DOMINO_SERVER_SECRET = 'synthetic-r10-server-proof-secret';
    process.env.PLATFORM_API_URL = 'http://127.0.0.1:4300';
    const crypto = require('node:crypto');
    const { verifyDominoPayload } = require('../dominoProof');
    const { verifyGameToken } = require('../platformAuth');
    const claims = { userId: 'synthetic-u', playerId: 'synthetic-p', sessionId: 'synthetic-s', displayName: 'Synthetic', expiresAt: Date.now() - 1 };
    const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
    const token = `${payload}.${crypto.createHmac('sha256', process.env.BETTER_AUTH_SECRET).update(payload).digest('base64url')}`;
    const previousFetch = global.fetch;
    let calls = 0;
    global.fetch = async (url, init) => {
        calls++;
        assert.equal(url, 'http://127.0.0.1:4300/api/platform/game-session/validate');
        const { proof, ...body } = JSON.parse(init.body);
        assert.equal(body.integrityScope, 'game.session.validate');
        assert.equal(body.token, token);
        assert.equal(verifyDominoPayload(body, proof), true);
        assert.ok(init.signal instanceof AbortSignal);
        return { ok: true, status: 200 };
    };
    try {
        assert.equal(verifyGameToken(token), null, 'expired token stays invalid for new admission');
        await validateActivePlatformSession({ userId: claims.userId, playerId: claims.playerId, authToken: token });
        await assert.rejects(validateActivePlatformSession({ userId: 'different-owner', playerId: claims.playerId, authToken: token }));
        assert.equal(calls, 1, 'wrong owner is denied before the HTTP request');
    } finally { global.fetch = previousFetch; }
});

test('connected session revocation is checked within the approved 60-second bound', async t => {
    t.mock.timers.enable({ apis: ['setInterval'] });
    let allowed = true;
    const f = fixture(async () => { if (!allowed) throw new Error('revoked'); });
    f.guard.start();
    assert.ok(CHECK_INTERVAL_MS + 3000 < 60_000);
    t.mock.timers.tick(CHECK_INTERVAL_MS);
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(f.closes, []);
    allowed = false;
    t.mock.timers.tick(CHECK_INTERVAL_MS);
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(f.closes, [ACCESS_REVOKED_CODE]);
    assert.equal(f.guard.isAllowed(f.client), false);
    f.guard.dispose();
});

test('only one validation per seat runs at once and late failure cannot close its replacement', async () => {
    let reject;
    let calls = 0;
    const f = fixture(() => { calls++; return new Promise((_, fail) => { reject = fail; }); });
    const first = f.guard.check();
    await f.guard.check();
    assert.equal(calls, 1);
    f.room.identityBySessionId.set(f.client.sessionId, { ...f.identity, authToken: 'new-token' });
    reject(new Error('old-session-revoked'));
    await first;
    assert.deepEqual(f.closes, []);
    assert.equal(f.guard.isAllowed(f.client), true);
});

test('disposal cancels checks and an in-flight failure cannot disconnect during shutdown', async t => {
    t.mock.timers.enable({ apis: ['setInterval'] });
    let reject;
    let calls = 0;
    const f = fixture(() => { calls++; return new Promise((_, fail) => { reject = fail; }); });
    f.guard.start();
    const pending = f.guard.check();
    f.guard.dispose();
    reject(new Error('API unavailable'));
    await pending;
    t.mock.timers.tick(CHECK_INTERVAL_MS * 4);
    assert.equal(calls, 1);
    assert.deepEqual(f.closes, []);
});

test('revocation closes only the affected seat and never settles a wallet directly', async () => {
    const f = fixture(async identity => { if (identity.userId === 'synthetic-u') throw new Error('revoked'); });
    const other = { sessionId: 'other-seat', leave: () => assert.fail('healthy seat must remain connected') };
    f.room.clients.push(other);
    f.room.identityBySessionId.set(other.sessionId, { ...f.identity, userId: 'other-u' });
    f.room.settleEconomyRound = () => assert.fail('normal onLeave/forfeit path owns settlement');
    await f.guard.check();
    assert.deepEqual(f.closes, [ACCESS_REVOKED_CODE]);
    await f.guard.check();
    assert.deepEqual(f.closes, [ACCESS_REVOKED_CODE]);
});

test('a synchronous validation failure releases the probe slot for a restored seat', async () => {
    let calls = 0;
    const f = fixture(() => { if (++calls === 1) throw Error('revoked'); });
    await f.guard.check();
    f.guard.restore(f.client.sessionId);
    await f.guard.check();
    assert.equal(calls, 2);
    assert.equal(f.guard.pending.size, 0);
});

test('real room message dispatcher blocks revoked actions without an API request on every move', async () => {
    const DominoRoom = require('../DominoRoom');
    let validations = 0;
    const f = fixture(async () => { validations++; throw new Error('revoked'); });
    const handlers = new Map();
    const room = Object.create(DominoRoom.prototype);
    room.sessionAccess = f.guard;
    room.onMessage = (type, callback) => handlers.set(type, callback);
    let moves = 0;
    room.onGameMessage('play', () => { moves++; });
    handlers.get('play')(f.client, {});
    assert.equal(validations, 0);
    await f.guard.check();
    handlers.get('play')(f.client, {});
    assert.equal(moves, 1);
    assert.equal(validations, 1);
});

for (const source of ['js/network.js', 'www/js/network.js']) {
    test(`${source}: server revocation stops reconnect and retains multiplayer mode to prevent local play`, () => {
        const fs = require('node:fs');
        const vm = require('node:vm');
        const storage = new Map([['dominoRoomReconnectionToken', 'expired-seat-token']]);
        const window = { addEventListener() {}, localStorage: { getItem: key => storage.get(key), removeItem: key => storage.delete(key) } };
        const { NetworkManager } = vm.runInNewContext(fs.readFileSync(require('node:path').resolve(__dirname, '../..', source), 'utf8') + '\n({NetworkManager})', { window, console: { log() {}, warn() {} }, clearTimeout });
        let disconnected;
        const network = new NetworkManager({ onNetworkDisconnected: payload => { disconnected = payload; }, t: () => 'Session ended', renderer: { showMessage() {} } });
        let onLeave;
        network.room = { onMessage() {}, onError() {}, onStateChange() {}, onLeave: callback => { onLeave = callback; } };
        network.isMultiplayer = true;
        network.scheduleReconnect = () => assert.fail('revoked connection must not retry its token');
        network.setupListeners();
        onLeave(ACCESS_REVOKED_CODE);
        assert.equal(storage.has('dominoRoomReconnectionToken'), false);
        assert.equal(network.isMultiplayer, true);
        assert.equal(network.room, null);
        assert.equal(disconnected.reconnecting, false);
    });
}
