const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { buildSignedRequestBody } = require('./signedRequest');
const { postEconomyRequest } = require('./economyClient');
const { stableStringify } = require('./dominoProof');
const { reportOperationalEvent } = require('./operationalEvents');

// Small synchronous writes are intentional: no HTTP/room disposal may precede fsync.
// The directory MUST live on a persistent local filesystem, shared by this server's restarts.
class SettlementOutbox {
    constructor(directory, { report = reportOperationalEvent } = {}) {
        this.directory = path.resolve(directory);
        this.inflight = new Map();
        this.report = report;
    }

    initialize() {
        fs.mkdirSync(this.directory, { recursive: true, mode: 0o700 });
        this.syncDirectory();
        // Persist a newly created directory's entry as well.
        const parent = fs.openSync(path.dirname(this.directory), 'r');
        try { fs.fsyncSync(parent); } finally { fs.closeSync(parent); }
    }

    syncDirectory() {
        const fd = fs.openSync(this.directory, 'r');
        try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    }

    key(payload) {
        return createHash('sha256').update(JSON.stringify([payload.roomId, payload.matchId, payload.stakeKey])).digest('hex');
    }

    read(name) {
        try { return JSON.parse(fs.readFileSync(path.join(this.directory, name), 'utf8')); }
        catch (error) { if (error.code === 'ENOENT') return null; throw error; }
    }

    writeOnce(name, value) {
        const temp = path.join(this.directory, `.${randomUUID()}.tmp`);
        const fd = fs.openSync(temp, 'wx', 0o600);
        try { fs.writeFileSync(fd, JSON.stringify(value)); fs.fsyncSync(fd); }
        finally { fs.closeSync(fd); }
        try {
            // Hard link publishes an entire fsynced file without replacing a competing intent.
            fs.linkSync(temp, path.join(this.directory, name));
        } catch (error) { if (error.code !== 'EEXIST') throw error; }
        finally { fs.unlinkSync(temp); }
        this.syncDirectory();
        return this.read(name);
    }

    enqueue(payload) {
        if (!payload.roomId || !payload.matchId || !payload.stakeKey || payload.stakeKey === 'free'
            || !['win', 'loss', 'draw', 'refund'].includes(payload.result)
            || !Array.isArray(payload.winnerUserIds)) throw new Error('invalid_settlement_intent');
        this.initialize();
        const key = this.key(payload);
        // No player/session bearer token is persisted.
        const saved = this.writeOnce(`${key}.intent.json`, { version: 1, createdAt: Date.now(), payload });
        if (saved.version !== 1 || stableStringify(saved.payload) !== stableStringify(payload)) {
            throw new Error('settlement_intent_conflict');
        }
        return key;
    }

    deliver(key, transport) {
        if (this.inflight.has(key)) return this.inflight.get(key);
        const pending = (async () => {
            const intent = this.read(`${key}.intent.json`);
            if (!intent || intent.version !== 1 || this.key(intent.payload) !== key) throw new Error('invalid_outbox_record');
            const ack = this.read(`${key}.receipt.json`);
            if (ack) {
                if (ack.version !== 1 || ack.key !== key || ack.response?.ok !== true) throw new Error('invalid_outbox_receipt');
                return ack.response;
            }
            const response = await transport(intent.payload);
            if (response?.ok !== true) throw new Error('settlement_not_acknowledged');
            // Keep immutable intent + receipt for recovery/audit; do not age out unresolved results.
            this.writeOnce(`${key}.receipt.json`, { version: 1, key, acknowledgedAt: Date.now(), response });
            try { this.report('settlement_acknowledged', intent.payload); } catch { /* never fail settlement for telemetry */ }
            return response;
        })();
        this.inflight.set(key, pending);
        pending.finally(() => this.inflight.delete(key)).catch(() => {});
        return pending;
    }

    submit(payload, transport) {
        const key = this.enqueue(payload);
        return this.deliver(key, transport);
    }

    async reconcile({ limit = 32, transport = deliverReconciliation } = {}) {
        this.initialize();
        const files = fs.readdirSync(this.directory).filter(n => /^[a-f0-9]{64}\.intent\.json$/.test(n));
        let attempted = 0, acknowledged = 0, failed = 0;
        // Sequential bounded batch. A rejection must not starve later entries.
        const pending = files.filter(name => {
            try {
                const ack = this.read(name.replace('.intent.', '.receipt.'));
                return !ack || ack.version !== 1 || ack.key !== name.slice(0, 64) || ack.response?.ok !== true;
            } catch { return true; } // Corrupt receipts must surface as failures, never silently disappear.
        });
        this.cursor = (this.cursor || 0) % Math.max(1, pending.length);
        const selected = pending.slice(this.cursor).concat(pending.slice(0, this.cursor)).slice(0, limit);
        this.cursor += selected.length;
        for (const name of selected) {
            attempted++;
            try { await this.deliver(name.slice(0, 64), transport); acknowledged++; }
            catch { failed++; }
        }
        return { attempted, acknowledged, failed, pending: pending.length - acknowledged };
    }
}

async function deliverReconciliation(payload) {
    const response = await postEconomyRequest({
        baseUrl: process.env.PLATFORM_API_URL,
        path: '/api/economy/matches/reconcile',
        body: buildSignedRequestBody('economy.reconcile', payload)
    });
    const data = await response.json();
    if (!response.ok || data?.ok !== true) throw new Error('reconciliation_not_acknowledged');
    return data;
}

const stores = new Map();
function getSettlementOutbox() {
    const configured = String(process.env.ECONOMY_OUTBOX_DIR || '').trim();
    if (process.env.NODE_ENV === 'production' && !path.isAbsolute(configured)) {
        throw new Error('ECONOMY_OUTBOX_DIR must be an absolute persistent-volume path in production');
    }
    const directory = path.resolve(configured || path.join(__dirname, 'data/economy-outbox'));
    if (!stores.has(directory)) stores.set(directory, new SettlementOutbox(directory));
    return stores.get(directory);
}

function startSettlementReconciler() {
    const store = getSettlementOutbox();
    store.initialize(); // Fail startup instead of accepting paid games with unwritable storage.
    let stopped = false, running = null;
    const tick = () => {
        if (stopped || running) return;
        running = store.reconcile().then(result => {
            if (result.failed) console.warn('[EconomyOutbox] Results still pending:', result.failed);
            if (result.failed) reportOperationalEvent('settlement_backlog', result);
        }).catch(error => console.error('[EconomyOutbox] Reconciliation failed:', error.message)).finally(() => { running = null; });
    };
    const timer = setInterval(tick, 5000);
    timer.unref();
    tick();
    return () => { stopped = true; clearInterval(timer); };
}

module.exports = { SettlementOutbox, getSettlementOutbox, startSettlementReconciler };
