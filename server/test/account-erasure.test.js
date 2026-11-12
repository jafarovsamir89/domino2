const test = require('node:test');
const assert = require('node:assert/strict');
const { inspectAccountRooms, prepareGameAccountErasure, verifyAccountErasureRequest } = require('../accountErasure');
const DominoRoom = require('../DominoRoom');
const { signDominoPayload } = require('../dominoProof');

const target = { userId: 'owner-user', playerId: 'owner-player', relatedMatchIds: ['match-1'] };
const room = { roomId: 'room-1', name: 'domino' };
const clear = { version: 1, ownerPresent: false, roomActive: true, pendingSettlement: false,
    pendingMatchRecording: false, relatedPendingWork: false, matchIds: [] };

test('account erasure queries distributed domino rooms and allows only an exact clear response', async () => {
    let query;
    let call;
    const result = await inspectAccountRooms(target, {
        queryRooms: async filter => { query = filter; return [room]; },
        remoteRoomCall: async (...args) => { call = args; return clear; }
    });
    assert.deepEqual(query, { name: 'domino' });
    assert.deepEqual(call, ['room-1', 'inspectAccountErasure', ['owner-user', 'owner-player', ['match-1']], 3000]);
    assert.deepEqual(result, { relatedMatchIds: ['match-1'] });
});

test('account erasure blocks a player still present in a live owner room, including remote rooms', async () => {
    await assert.rejects(inspectAccountRooms(target, {
        queryRooms: async () => [room],
        remoteRoomCall: async () => ({ ...clear, ownerPresent: true })
    }), /owner_room_blocks_erasure/);
});

test('account erasure blocks unresolved settlement or match recording associated with the owner', async () => {
    for (const field of ['pendingSettlement', 'pendingMatchRecording', 'relatedPendingWork']) {
        await assert.rejects(inspectAccountRooms(target, {
            queryRooms: async () => [room],
            remoteRoomCall: async () => ({ ...clear, [field]: true })
        }), /room_settlement_blocks_erasure/);
    }
});

test('account erasure blocks a failed or ambiguous matchmaker RPC instead of assuming no room', async () => {
    await assert.rejects(inspectAccountRooms(target, {
        queryRooms: async () => [room],
        remoteRoomCall: async () => { throw new Error('ipc_timeout'); }
    }), /ipc_timeout/);
    await assert.rejects(inspectAccountRooms(target, {
        queryRooms: async () => [room],
        remoteRoomCall: async () => ({ ...clear, ownerPresent: 'false' })
    }), /invalid_account_erasure_room_response/);
    await assert.rejects(inspectAccountRooms(target, {
        queryRooms: async () => { throw new Error('redis_unavailable'); },
        remoteRoomCall: async () => clear
    }), /redis_unavailable/);
});

test('account erasure rejects malformed listings and targets before issuing remote calls', async () => {
    let calls = 0;
    const options = { queryRooms: async () => [{ roomId: 'room-1', name: 'other' }], remoteRoomCall: async () => { calls++; return clear; } };
    await assert.rejects(inspectAccountRooms(target, options), /invalid_account_erasure_room/);
    await assert.rejects(inspectAccountRooms({ ...target, relatedMatchIds: [null] }, options), /invalid_account_erasure_target/);
    assert.equal(calls, 0);
});

test('game erasure endpoint accepts only a recent signed exact-scope request for a due 30-day target', () => {
    const prior = process.env.DOMINO_SERVER_SECRET;
    process.env.DOMINO_SERVER_SECRET = 'synthetic-game-erasure-secret';
    try {
        const now = new Date('2026-11-12T20:00:00.000Z');
        const payload = {
            integrityScope: 'account.deletion.prepare', requestId: 'synthetic-request-005',
            userId: 'synthetic-owner-005', playerId: 'synthetic-player-005',
            requestedAt: '2026-10-01T20:00:00.000Z', deleteAfter: '2026-10-31T20:00:00.000Z',
            relatedMatchIds: ['match-5'], issuedAt: now.getTime(), nonce: '5'.repeat(32)
        };
        const request = { ...payload, proof: signDominoPayload(payload) };
        assert.deepEqual(verifyAccountErasureRequest(request, now), {
            target: { requestId: payload.requestId, userId: payload.userId, playerId: payload.playerId,
                requestedAt: new Date(payload.requestedAt), deleteAfter: new Date(payload.deleteAfter), relatedMatchIds: ['match-5'] },
            nonce: payload.nonce
        });
        assert.throws(() => verifyAccountErasureRequest({ ...request, userId: 'different-owner' }, now), /invalid_internal_proof/);
        assert.throws(() => verifyAccountErasureRequest(request, new Date(now.getTime() + 60001)), /invalid_internal_proof/);
        assert.throws(() => verifyAccountErasureRequest({ ...request, extra: 'field' }, now), /invalid_internal_proof/);
    } finally {
        if (prior === undefined) delete process.env.DOMINO_SERVER_SECRET; else process.env.DOMINO_SERVER_SECRET = prior;
    }
});

test('room erasure probe reports owner presence and pending related match without exposing credentials', () => {
    const room = Object.create(DominoRoom.prototype);
    room.currentDealMatchId = 'match-1';
    room.matchRecordId = '';
    room.matchRecorded = false;
    room.identityBySessionId = new Map([['owner-session', { userId: 'owner-user', playerId: 'owner-player', authToken: 'never-return-this' }]]);
    room.state = { gameActive: true, players: new Map() };
    room.pendingEconomySettlementState = null;
    room.pendingMatchRecording = null;
    const owner = room.inspectAccountErasure('owner-user', 'owner-player', ['match-1']);
    assert.equal(owner.ownerPresent, true);
    assert.equal(owner.roomActive, true);
    assert.deepEqual(owner.matchIds, ['match-1']);
    assert.equal(JSON.stringify(owner).includes('never-return-this'), false);

    room.identityBySessionId.clear();
    room.state.gameActive = false;
    room.pendingEconomySettlementState = { matchId: 'match-1' };
    const pending = room.inspectAccountErasure('owner-user', 'owner-player', ['match-1']);
    assert.equal(pending.ownerPresent, false);
    assert.equal(pending.relatedPendingWork, true);
    assert.equal(pending.pendingSettlement, true);
});

function fakeRedis(seed = {}) {
    const values = new Map(Object.entries(seed));
    const ttls = new Map(Array.from(values.keys(), key => [key, 86400000]));
    const removals = [];
    return {
        values, ttls, removals,
        async scan(cursor, _match, pattern) {
            const prefix = pattern.replace('*', '');
            const keys = Array.from(values.keys()).filter(key => key.startsWith(prefix));
            return ['0', keys];
        },
        async get(key) { return values.get(key) ?? null; },
        async pttl(key) { return ttls.get(key) ?? -2; },
        async eval(script, numKeys, key, otherKey, before, after, ttlOrRoomId) {
            if (script.includes("local ttl = tonumber(ARGV[3])")) {
                const expected = otherKey;
                const replacement = before;
                const ttl = Number(after);
                if (!values.has(key)) return 0;
                if (values.get(key) !== expected) return -1;
                if (ttl === 0 || ttl === -2) { values.delete(key); ttls.delete(key); }
                else { values.set(key, replacement); ttls.set(key, ttl > 0 ? ttl : -1); }
                return 1;
            }
            assert.equal(numKeys, 2);
            const expected = before;
            const roomId = after;
            if (!values.has(key)) return 0;
            if (values.get(key) !== expected) return -1;
            values.delete(key); ttls.delete(key);
            removals.push([key, roomId]);
            return 1;
        }
    };
}

function snapshot(overrides = {}) {
    return {
        snapshotVersion: 1, roomId: 'room-stale', matchRecorded: true,
        state: { gameActive: false, playerOrder: ['owner-session', 'other-session'], players: [
            { sessionId: 'owner-session', userId: 'owner-user', playerId: 'owner-player', name: 'Owner Name', avatarUrl: 'https://avatar.invalid/owner' },
            { sessionId: 'other-session', userId: 'other-user', playerId: 'other-player', name: 'Other Name', avatarUrl: 'https://avatar.invalid/other' }
        ] },
        identityBySessionId: [
            ['owner-session', { userId: 'owner-user', playerId: 'owner-player', displayName: 'Owner Name', avatarUrl: 'https://avatar.invalid/owner' }],
            ['other-session', { userId: 'other-user', playerId: 'other-player', displayName: 'Other Name', avatarUrl: 'https://avatar.invalid/other' }]
        ],
        ...overrides
    };
}

function targetDue(now = new Date()) {
    return { ...target, requestedAt: new Date(now.getTime() - 31 * 86400000), deleteAfter: new Date(now.getTime() - 86400000) };
}

function gameOptions(redis, overrides = {}) {
    return { redis, outbox: { inspectAccountSettlements: () => ({ pendingSettlements: 0 }) },
        queryRooms: async () => [], remoteRoomCall: async () => clear, ...overrides };
}

test('game erasure removes owner identity from an inactive snapshot while preserving other players and TTL', async () => {
    const key = 'domino:custom:room-stale';
    const redis = fakeRedis({ [key]: JSON.stringify(snapshot()) });
    const result = await prepareGameAccountErasure(targetDue(), gameOptions(redis));
    const saved = JSON.parse(redis.values.get(key));
    assert.equal(result.gameStateErased, true);
    assert.equal(result.cleanedSnapshots, 1);
    assert.equal(redis.ttls.get(key), 86400000);
    assert.equal(JSON.stringify(saved).includes('owner-user'), false);
    assert.equal(JSON.stringify(saved).includes('owner-player'), false);
    assert.equal(JSON.stringify(saved).includes('owner-session'), false);
    assert.equal(JSON.stringify(saved).includes('Owner Name'), false);
    assert.equal(JSON.stringify(saved).includes('avatar.invalid/owner'), false);
    assert.equal(JSON.stringify(saved).includes('other-user'), true);
    assert.equal(JSON.stringify(saved).includes('other-session'), true);
    assert.equal(JSON.stringify(saved).includes('Other Name'), true);
});

test('game erasure blocks active or unsettled snapshots before changing Redis', async () => {
    for (const overrides of [
        { state: { gameActive: true } },
        { pendingEconomySettlementState: { matchId: 'match-1' } },
        { pendingMatchRecording: { sourceMatchId: 'match-1' }, matchRecorded: false }
    ]) {
        const key = 'domino:custom:room-stale';
        const before = JSON.stringify(snapshot(overrides));
        const redis = fakeRedis({ [key]: before });
        await assert.rejects(prepareGameAccountErasure(targetDue(), gameOptions(redis)), /blocks_erasure/);
        assert.equal(redis.values.get(key), before);
    }
});

test('game erasure blocks pending settlement, live presence and fresh owner presence', async () => {
    const redis = fakeRedis();
    await assert.rejects(prepareGameAccountErasure(targetDue(), gameOptions(redis, {
        outbox: { inspectAccountSettlements: () => ({ pendingSettlements: 1 }) }
    })), /pending_settlement_blocks_erasure/);

    const now = new Date();
    const liveRoom = fakeRedis({});
    await assert.rejects(prepareGameAccountErasure(targetDue(now), gameOptions(liveRoom, {
        queryRooms: async () => [room],
        remoteRoomCall: async () => ({ ...clear, ownerPresent: true })
    })), /owner_room_blocks_erasure/);

    const presenceKey = 'domino:presence:session:owner-session';
    const presence = { sessionId: 'owner-session', userId: 'owner-user', playerId: 'owner-player', roomId: 'room-stale', updatedAt: now.toISOString(), isConnected: false };
    const presenceRedis = fakeRedis({ [presenceKey]: JSON.stringify(presence) });
    await assert.rejects(prepareGameAccountErasure(targetDue(now), gameOptions(presenceRedis)), /owner_presence_blocks_erasure/);
    assert.equal(presenceRedis.values.has(presenceKey), true);
});

test('game erasure checks outbox match ids recovered from the owner snapshot, even when the owner lost', async () => {
    const key = 'domino:custom:room-stale';
    const before = JSON.stringify(snapshot({ currentDealMatchId: 'match-missing-from-db' }));
    const redis = fakeRedis({ [key]: before });
    let checked;
    await assert.rejects(prepareGameAccountErasure({ ...targetDue(), relatedMatchIds: [] }, gameOptions(redis, {
        outbox: { inspectAccountSettlements: query => { checked = query; return { pendingSettlements: query.relatedMatchIds.includes('match-missing-from-db') ? 1 : 0 }; } }
    })), /pending_settlement_blocks_erasure/);
    assert.deepEqual(checked, { userId: 'owner-user', relatedMatchIds: ['match-missing-from-db'] });
    assert.equal(redis.values.get(key), before, 'No snapshot mutation occurs while a settlement is unresolved');
});

test('game erasure deletes stale owner presence and removes its room index entry', async () => {
    const now = new Date();
    const key = 'domino:presence:session:owner-session';
    const entry = { sessionId: 'owner-session', userId: 'owner-user', playerId: 'owner-player', roomId: 'room-stale', updatedAt: new Date(now.getTime() - 121000).toISOString() };
    const redis = fakeRedis({ [key]: JSON.stringify(entry) });
    const forgotten = [];
    const result = await prepareGameAccountErasure(targetDue(now), gameOptions(redis, { forgetLocalPresence: sessionId => forgotten.push(sessionId) }));
    assert.equal(result.removedPresence, 1);
    assert.deepEqual(forgotten, ['owner-session']);
    assert.equal(redis.values.has(key), false);
    assert.deepEqual(redis.removals, [[key, 'room-stale']]);
});

test('stale owner presence also identifies a snapshot that only retains the old session id', async () => {
    const now = new Date();
    const snapshotKey = 'domino:custom:room-stale';
    const presenceKey = 'domino:presence:session:owner-session';
    const stalePresence = { sessionId: 'owner-session', userId: 'owner-user', playerId: 'owner-player', roomId: 'room-stale',
        updatedAt: new Date(now.getTime() - 121000).toISOString() };
    const staleSnapshot = snapshot({ identityBySessionId: [], state: { gameActive: false, playerOrder: ['owner-session'], players: [] } });
    const redis = fakeRedis({ [snapshotKey]: JSON.stringify(staleSnapshot), [presenceKey]: JSON.stringify(stalePresence) });
    await prepareGameAccountErasure(targetDue(now), gameOptions(redis));
    assert.equal(redis.values.get(snapshotKey).includes('owner-session'), false);
    assert.equal(redis.values.has(presenceKey), false);
});
