const { ServerError } = require('colyseus');
const { verifyGameToken } = require('./platformAuth');
const { resolvePlatformApiUrl } = require('./economyConfig');
const { buildSignedRequestBody } = require('./signedRequest');

const CHECK_INTERVAL_MS = 20_000;
const VALIDATION_TIMEOUT_MS = 3_000;
const ACCESS_REVOKED_CODE = 4003;

async function requestValidation(path, body) {
    let response;
    try {
        response = await fetch(`${resolvePlatformApiUrl()}/api/platform/${path}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(VALIDATION_TIMEOUT_MS)
        });
    } catch {
        throw new ServerError(503, 'auth_validation_unavailable');
    }
    if (response.status >= 500 || response.status === 429) {
        throw new ServerError(503, 'auth_validation_unavailable');
    }
    if (!response.ok) throw new ServerError(401, 'auth_required');
}

function validatePlatformGameToken(token) {
    return requestValidation('game-token/validate', { token });
}

async function validateActivePlatformSession(identity = {}) {
    // An existing connection may outlive its admission token. Only this signed,
    // server-to-server check accepts it; new joins/reconnects still require an
    // unexpired token and API confirmation.
    const token = String(identity.authToken || '').trim();
    const claims = verifyGameToken(token, { allowExpired: true });
    if (!claims?.sessionId || claims.userId !== identity.userId || claims.playerId !== identity.playerId) {
        throw new ServerError(401, 'auth_required');
    }
    return requestValidation('game-session/validate', buildSignedRequestBody('game.session.validate', {
        token, checkedAt: Date.now()
    }));
}

class RoomSessionAccess {
    constructor(room, { validate = validateActivePlatformSession } = {}) {
        this.room = room;
        this.validate = validate;
        this.pending = new Map();
        this.revoked = new Map();
        this.disposed = false;
    }

    start() {
        if (this.timer || this.disposed) return;
        this.timer = setInterval(() => { void this.check(); }, CHECK_INTERVAL_MS);
        this.timer.unref?.();
    }

    isAllowed(client) {
        return !this.revoked.has(client?.sessionId)
            || this.revoked.get(client.sessionId) !== this.room.identityBySessionId?.get(client.sessionId);
    }

    restore(sessionId) {
        this.revoked.delete(sessionId);
    }

    async check() {
        if (this.disposed || this.room.shuttingDown) return;
        const work = [];
        for (const client of Array.from(this.room.clients || [])) {
            if (this.pending.has(client) || !this.isAllowed(client)) continue;
            const identity = this.room.identityBySessionId?.get(client.sessionId);
            // Register before invoking the validator: it may throw synchronously.
            this.pending.set(client, true);
            const pending = (async () => {
                try {
                    await this.validate(identity);
                } catch {
                    if (this.disposed || this.room.shuttingDown
                        || this.room.identityBySessionId?.get(client.sessionId) !== identity
                        || !Array.from(this.room.clients || []).includes(client)) return;
                    this.revoked.set(client.sessionId, identity);
                    // Keep the existing onLeave -> reconnect grace -> forfeit
                    // path as the sole owner of gameplay and wallet changes.
                    try { client.leave(ACCESS_REVOKED_CODE); } catch { /* already closed */ }
                } finally {
                    this.pending.delete(client);
                }
            })();
            work.push(pending);
        }
        await Promise.all(work);
    }

    dispose() {
        this.disposed = true;
        clearInterval(this.timer);
        this.timer = null;
        this.revoked.clear();
    }
}

module.exports = { RoomSessionAccess, validatePlatformGameToken, validateActivePlatformSession, CHECK_INTERVAL_MS, ACCESS_REVOKED_CODE };
