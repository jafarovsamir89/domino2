const MAX_ROOMS_TO_INSPECT = 10000;
const ROOM_CALL_TIMEOUT_MS = 3000;
const MAX_REDIS_SCAN_KEYS = 100000;
const MAX_JSON_BYTES = 8 * 1024 * 1024;
const ERASURE_WAIT_MS = 30 * 86400000;
const { verifyDominoPayload } = require('./dominoProof');
const { DISCONNECT_GRACE_SECONDS } = require('./roomConfig');

function validateTarget(target) {
    if (!target || typeof target !== 'object'
        || typeof target.userId !== 'string' || !target.userId || target.userId.length > 256
        || typeof target.playerId !== 'string' || !target.playerId || target.playerId.length > 256
        || !Array.isArray(target.relatedMatchIds) || target.relatedMatchIds.length > 10000
        || target.relatedMatchIds.some(id => typeof id !== 'string' || !id || id.length > 256)) {
        throw new Error('invalid_account_erasure_target');
    }
}

function verifyAccountErasureRequest(body, now = new Date()) {
    if (!body || typeof body !== 'object' || Array.isArray(body) || !(now instanceof Date) || !Number.isFinite(now.getTime())) {
        throw new Error('invalid_internal_proof');
    }
    const { proof, ...payload } = body;
    const expectedKeys = ['deleteAfter', 'integrityScope', 'issuedAt', 'nonce', 'playerId', 'relatedMatchIds', 'requestId', 'requestedAt', 'userId'];
    if (Object.keys(payload).sort().join(',') !== expectedKeys.join(',')
        || payload.integrityScope !== 'account.deletion.prepare'
        || !verifyDominoPayload(payload, proof)
        || !Number.isSafeInteger(payload.issuedAt) || now.getTime() - payload.issuedAt < 0 || now.getTime() - payload.issuedAt > 60000
        || typeof payload.nonce !== 'string' || !/^[a-f0-9]{32}$/.test(payload.nonce)
        || typeof payload.requestId !== 'string' || !/^[a-zA-Z0-9_-]{12,128}$/.test(payload.requestId)
        || typeof payload.userId !== 'string' || !payload.userId || payload.userId.length > 256
        || typeof payload.playerId !== 'string' || !payload.playerId || payload.playerId.length > 256
        || !Array.isArray(payload.relatedMatchIds) || payload.relatedMatchIds.length > 10000
        || payload.relatedMatchIds.some(id => typeof id !== 'string' || !id || id.length > 256)
        || typeof payload.requestedAt !== 'string' || typeof payload.deleteAfter !== 'string') {
        throw new Error('invalid_internal_proof');
    }
    const requestedAt = new Date(payload.requestedAt);
    const deleteAfter = new Date(payload.deleteAfter);
    if (!Number.isFinite(requestedAt.getTime()) || !Number.isFinite(deleteAfter.getTime())
        || requestedAt.toISOString() !== payload.requestedAt || deleteAfter.toISOString() !== payload.deleteAfter
        || deleteAfter.getTime() !== requestedAt.getTime() + ERASURE_WAIT_MS || now < deleteAfter) {
        throw new Error('invalid_erasure_window');
    }
    const target = { requestId: payload.requestId, userId: payload.userId, playerId: payload.playerId,
        requestedAt, deleteAfter, relatedMatchIds: payload.relatedMatchIds };
    validateTarget(target);
    return { target, nonce: payload.nonce };
}

/** Inspect every Colyseus room through the matchmaker, including rooms on peers.
 * Any unavailable or malformed room response aborts the deletion attempt.
 */
async function inspectAccountRooms(target, { queryRooms, remoteRoomCall } = {}) {
    validateTarget(target);
    if (typeof queryRooms !== 'function' || typeof remoteRoomCall !== 'function') {
        throw new Error('account_erasure_room_adapter_unavailable');
    }
    const rooms = await queryRooms({ name: 'domino' });
    if (!Array.isArray(rooms) || rooms.length > MAX_ROOMS_TO_INSPECT) {
        throw new Error('invalid_account_erasure_room_list');
    }
    const findings = await Promise.all(rooms.map(async room => {
        if (!room || typeof room.roomId !== 'string' || !room.roomId || room.name !== 'domino') {
            throw new Error('invalid_account_erasure_room');
        }
        const result = await remoteRoomCall(
            room.roomId,
            'inspectAccountErasure',
            [target.userId, target.playerId, target.relatedMatchIds],
            ROOM_CALL_TIMEOUT_MS
        );
        if (!result || result.version !== 1
            || typeof result.ownerPresent !== 'boolean'
            || typeof result.roomActive !== 'boolean'
            || typeof result.pendingSettlement !== 'boolean'
            || typeof result.pendingMatchRecording !== 'boolean'
            || typeof result.relatedPendingWork !== 'boolean'
            || !Array.isArray(result.matchIds)
            || result.matchIds.some(id => typeof id !== 'string' || !id)) {
            throw new Error('invalid_account_erasure_room_response');
        }
        return result;
    }));

    const ownerRoom = findings.some(result => result.ownerPresent);
    const pendingRoomWork = findings.some(result =>
        result.pendingSettlement || result.pendingMatchRecording || result.relatedPendingWork
    );
    const relatedMatchIds = new Set(target.relatedMatchIds);
    for (const finding of findings) for (const id of finding.matchIds) relatedMatchIds.add(id);
    if (ownerRoom) throw new Error('owner_room_blocks_erasure');
    if (pendingRoomWork) throw new Error('room_settlement_blocks_erasure');
    return { relatedMatchIds: Array.from(relatedMatchIds) };
}

async function scanKeys(redis, pattern) {
    const keys = new Set();
    let cursor = '0';
    let pages = 0;
    do {
        const response = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', '200');
        if (!Array.isArray(response) || response.length !== 2 || typeof response[0] !== 'string' || !Array.isArray(response[1])) {
            throw new Error('invalid_account_erasure_redis_scan');
        }
        cursor = response[0];
        for (const key of response[1]) {
            if (typeof key !== 'string' || !key) throw new Error('invalid_account_erasure_redis_key');
            keys.add(key);
            if (keys.size > MAX_REDIS_SCAN_KEYS) throw new Error('account_erasure_redis_scan_too_large');
        }
        if (++pages > MAX_REDIS_SCAN_KEYS) throw new Error('account_erasure_redis_scan_did_not_finish');
    } while (cursor !== '0');
    return Array.from(keys);
}

function parseJsonRecord(raw, kind) {
    if (typeof raw !== 'string' || Buffer.byteLength(raw) > MAX_JSON_BYTES) throw new Error(`invalid_${kind}_record`);
    let value;
    try { value = JSON.parse(raw); } catch { throw new Error(`invalid_${kind}_record`); }
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`invalid_${kind}_record`);
    return value;
}

function ownerIdentity(value, userId, playerId) {
    return String(value?.userId || '') === userId || String(value?.playerId || '') === playerId;
}

function snapshotReferences(snapshot, userId, playerId, relatedMatchIds, knownSessionIds = []) {
    const identityEntries = snapshot.identityBySessionId;
    if (!Array.isArray(identityEntries)) throw new Error('invalid_account_erasure_snapshot');
    const sessionIds = new Set(knownSessionIds);
    const names = new Set();
    const avatars = new Set();
    for (const entry of identityEntries) {
        if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== 'string' || !entry[0]
            || !entry[1] || typeof entry[1] !== 'object' || Array.isArray(entry[1])) {
            throw new Error('invalid_account_erasure_snapshot_identity');
        }
        if (!ownerIdentity(entry[1], userId, playerId)) continue;
        sessionIds.add(entry[0]);
        if (typeof entry[1].displayName === 'string' && entry[1].displayName) names.add(entry[1].displayName);
        if (typeof entry[1].avatarUrl === 'string' && entry[1].avatarUrl) avatars.add(entry[1].avatarUrl);
    }
    const statePlayers = snapshot.state?.players;
    if (statePlayers && typeof statePlayers === 'object') {
        const players = Array.isArray(statePlayers) ? statePlayers : Object.values(statePlayers);
        for (const player of players) {
            if (!player || typeof player !== 'object' || Array.isArray(player)) continue;
            if (!ownerIdentity(player, userId, playerId)) continue;
            if (typeof player.sessionId === 'string' && player.sessionId) sessionIds.add(player.sessionId);
            if (typeof player.name === 'string' && player.name) names.add(player.name);
            if (typeof player.displayName === 'string' && player.displayName) names.add(player.displayName);
            if (typeof player.avatarUrl === 'string' && player.avatarUrl) avatars.add(player.avatarUrl);
        }
    }
    const identifiers = [userId, playerId, ...sessionIds];
    const matchIds = new Set(relatedMatchIds);
    let hasRelatedMatch = false;
    const collectMatchIds = value => {
        if (Array.isArray(value)) { for (const item of value) collectMatchIds(item); return; }
        if (!value || typeof value !== 'object') return;
        for (const [key, child] of Object.entries(value)) {
            if (/matchId$/i.test(key) && typeof child === 'string' && child) matchIds.add(child);
            collectMatchIds(child);
        }
    };
    collectMatchIds(snapshot);
    const visit = value => {
        if (typeof value === 'string') {
            if (matchIds.has(value)) hasRelatedMatch = true;
            return identifiers.some(id => value.includes(id));
        }
        if (Array.isArray(value)) {
            let found = false;
            for (const item of value) if (visit(item)) found = true;
            return found;
        }
        if (value && typeof value === 'object') {
            let found = false;
            for (const [key, child] of Object.entries(value)) {
                if (matchIds.has(key)) hasRelatedMatch = true;
                if (identifiers.some(id => key.includes(id)) || visit(child)) found = true;
            }
            return found;
        }
        return false;
    };
    const hasOwnerReference = visit(snapshot);
    const pendingSettlement = Boolean(snapshot.pendingEconomySettlementState);
    const pendingRecording = Boolean(snapshot.pendingMatchRecording && !snapshot.matchRecorded);
    const pendingMatchId = String(snapshot.pendingEconomySettlementState?.matchId
        || snapshot.pendingMatchRecording?.sourceMatchId || '').trim();
    const relatedPendingWork = (pendingSettlement || pendingRecording)
        && (hasOwnerReference || matchIds.has(pendingMatchId));
    if ((hasOwnerReference || hasRelatedMatch) && (snapshot.state?.gameActive === true || relatedPendingWork)) {
        throw new Error('restorable_game_state_blocks_erasure');
    }
    return { hasOwnerReference, hasRelatedMatch, sessionIds, names, avatars,
        relatedMatchIds: hasOwnerReference ? Array.from(matchIds) : Array.from(relatedMatchIds) };
}

function scrubSnapshot(value, identifiers, names, avatars, ownerNode = false) {
    const ids = Array.from(identifiers).filter(Boolean).sort((a, b) => b.length - a.length);
    const ownerNames = Array.from(names).filter(Boolean).sort((a, b) => b.length - a.length);
    const ownerAvatars = Array.from(avatars).filter(Boolean).sort((a, b) => b.length - a.length);
    const ownerNameSet = new Set(ownerNames);
    const ownerAvatarSet = new Set(ownerAvatars);
    const replace = (text, needles, replacement) => needles.reduce((next, needle) => next.split(needle).join(replacement), text);
    if (Array.isArray(value)) {
        return value.map(item => scrubSnapshot(item, identifiers, names, avatars, ownerNode));
    }
    if (!value || typeof value !== 'object') {
        if (typeof value !== 'string') return value;
        return replace(replace(value, ids, 'deleted-player'), ownerAvatars, '');
    }
    const matches = ownerNode || ownerIdentity(value, ids[0] || '', ids[1] || '');
    const output = {};
    const seen = new Set();
    for (const [key, child] of Object.entries(value)) {
        if (key === 'identityBySessionId' && Array.isArray(child)) {
            output[key] = child.filter(entry => !ownerIdentity(entry?.[1], ids[0] || '', ids[1] || ''))
                .map(entry => scrubSnapshot(entry, identifiers, names, avatars, false));
            continue;
        }
        let nextKey = replace(key, ids, 'deleted-player');
        if (seen.has(nextKey)) nextKey = `${nextKey}#${seen.size + 1}`;
        seen.add(nextKey);
        if (matches && ['displayName', 'name', 'hostName'].includes(key) && typeof child === 'string') {
            output[nextKey] = 'Deleted player';
        } else if (matches && ['avatarUrl', 'image'].includes(key) && typeof child === 'string') {
            output[nextKey] = '';
        } else if (key === 'hostName' && typeof child === 'string' && ownerNameSet.has(child)) {
            output[nextKey] = 'Deleted player';
        } else if (['hostAvatarUrl', 'avatarUrl'].includes(key) && typeof child === 'string' && ownerAvatarSet.has(child)) {
            output[nextKey] = '';
        } else if (matches && ['userId', 'playerId', 'sessionId'].includes(key)) {
            output[nextKey] = '';
        } else {
            output[nextKey] = scrubSnapshot(child, identifiers, names, avatars, matches);
        }
    }
    return output;
}

const REPLACE_SNAPSHOT_IF_UNCHANGED = `
local current = redis.call('GET', KEYS[1])
if not current then return 0 end
if current ~= ARGV[1] then return -1 end
local ttl = tonumber(ARGV[3])
if ttl > 0 then
  redis.call('SET', KEYS[1], ARGV[2], 'PX', ttl)
elseif ttl == -1 then
  redis.call('SET', KEYS[1], ARGV[2])
  redis.call('PERSIST', KEYS[1])
else
  redis.call('DEL', KEYS[1])
end
return 1
`;

const DELETE_PRESENCE_IF_UNCHANGED = `
local current = redis.call('GET', KEYS[1])
if not current then return 0 end
if current ~= ARGV[1] then return -1 end
redis.call('DEL', KEYS[1])
if ARGV[2] ~= '' then redis.call('SREM', KEYS[2], ARGV[2]) end
return 1
`;

/** Scrub only inactive snapshots and stale owner presence, after checking every
 * live Colyseus room and durable settlement. Redis races/errors fail the attempt.
 */
async function prepareGameAccountErasure(target, { redis, queryRooms, remoteRoomCall, outbox, forgetLocalPresence, now = new Date() } = {}) {
    validateTarget(target);
    if (!redis || typeof redis.scan !== 'function' || typeof redis.eval !== 'function'
        || typeof redis.get !== 'function' || typeof redis.pttl !== 'function'
        || !outbox || typeof outbox.inspectAccountSettlements !== 'function') {
        throw new Error('account_erasure_game_adapter_unavailable');
    }
    if (!(now instanceof Date) || !Number.isFinite(now.getTime())
        || !(target.deleteAfter instanceof Date) || now < target.deleteAfter) {
        throw new Error('account_erasure_not_due');
    }
    const roomResult = await inspectAccountRooms(target, { queryRooms, remoteRoomCall });
    const relatedMatchIds = new Set(roomResult.relatedMatchIds);
    const snapshotKeys = await scanKeys(redis, 'domino:custom:*');
    const presenceKeys = await scanKeys(redis, 'domino:presence:session:*');
    const snapshotUpdates = [];
    const presenceDeletes = [];
    const ownerSessionIds = new Set();
    for (const key of presenceKeys) {
        const raw = await redis.get(key);
        if (raw === null) continue;
        const entry = parseJsonRecord(raw, 'account_erasure_presence');
        const sessionId = key.slice('domino:presence:session:'.length);
        if (!sessionId || entry.sessionId !== sessionId
            || entry.userId !== undefined && typeof entry.userId !== 'string'
            || entry.playerId !== undefined && typeof entry.playerId !== 'string') {
            throw new Error('invalid_account_erasure_presence');
        }
        if (!ownerIdentity(entry, target.userId, target.playerId)) continue;
        const updatedAt = Date.parse(entry.updatedAt || '');
        if (!Number.isFinite(updatedAt)) throw new Error('invalid_owner_presence_timestamp');
        if (now.getTime() - updatedAt <= DISCONNECT_GRACE_SECONDS * 1000) throw new Error('owner_presence_blocks_erasure');
        const roomId = entry.roomId === undefined || entry.roomId === null ? '' : entry.roomId;
        if (typeof roomId !== 'string') throw new Error('invalid_owner_presence_room');
        ownerSessionIds.add(sessionId);
        presenceDeletes.push({ key, before: raw, sessionId, roomId });
    }
    for (const key of snapshotKeys) {
        const raw = await redis.get(key);
        if (raw === null) continue;
        const snapshot = parseJsonRecord(raw, 'account_erasure_snapshot');
        if (snapshot.snapshotVersion !== 1 || typeof snapshot.roomId !== 'string' || !snapshot.roomId) {
            throw new Error('invalid_account_erasure_snapshot');
        }
        const found = snapshotReferences(snapshot, target.userId, target.playerId, roomResult.relatedMatchIds, ownerSessionIds);
        for (const matchId of found.relatedMatchIds) relatedMatchIds.add(matchId);
        if (!found.hasOwnerReference && !found.hasRelatedMatch) continue;
        const identifiers = new Set([target.userId, target.playerId, ...found.sessionIds]);
        const scrubbed = scrubSnapshot(snapshot, identifiers, found.names, found.avatars);
        const output = JSON.stringify(scrubbed);
        if (output.includes(target.userId) || output.includes(target.playerId)
            || Array.from(found.sessionIds).some(id => output.includes(id))) {
            throw new Error('account_erasure_snapshot_redaction_incomplete');
        }
        const ttl = await redis.pttl(key);
        if (!Number.isInteger(ttl) || ttl < -2) throw new Error('invalid_account_erasure_snapshot_ttl');
        snapshotUpdates.push({ key, before: raw, after: output, ttl });
    }
    const settlementResult = outbox.inspectAccountSettlements({ userId: target.userId, relatedMatchIds: Array.from(relatedMatchIds) });
    if (!settlementResult || !Number.isInteger(settlementResult.pendingSettlements) || settlementResult.pendingSettlements !== 0) {
        throw new Error('pending_settlement_blocks_erasure');
    }

    let removedPresence = 0;
    for (const entry of presenceDeletes) {
        const result = await redis.eval(DELETE_PRESENCE_IF_UNCHANGED, 2, entry.key,
            `domino:presence:room:${entry.roomId || '__none__'}`, entry.before, entry.roomId);
        if (result === -1) throw new Error('account_erasure_presence_changed_retry');
        if (result === 1) {
            removedPresence++;
            if (typeof forgetLocalPresence === 'function') forgetLocalPresence(entry.sessionId);
        }
    }
    let cleanedSnapshots = 0;
    for (const update of snapshotUpdates) {
        const result = await redis.eval(REPLACE_SNAPSHOT_IF_UNCHANGED, 1, update.key, update.before, update.after, String(update.ttl));
        if (result === -1) throw new Error('account_erasure_snapshot_changed_retry');
        if (result === 1) cleanedSnapshots++;
    }
    return { gameStateErased: true, pendingSettlements: 0, cleanedSnapshots, removedPresence };
}

module.exports = { inspectAccountRooms, prepareGameAccountErasure, validateTarget, verifyAccountErasureRequest };
