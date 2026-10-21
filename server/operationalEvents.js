const { createHash } = require('node:crypto');
const { buildInfo } = require('./buildInfo');

const schemas = {
    match_recorded: { mode: ['telefon', 'classic101'], outcome: ['normal', 'all_absent', 'draw', 'refund'], participants: [0, 4] },
    settlement_acknowledged: { result: ['win', 'loss', 'draw', 'refund'] },
    reconnect_completed: { source: ['join', 'allowReconnection', 'reconnect'] },
    settlement_backlog: { failed: [0, 1_000_000], pending: [0, 1_000_000] }
};

function sanitizeOperationalSentryEvent(event) {
    const name = typeof event.message === 'string' ? event.message.replace(/^domino\./, '') : '';
    if (event.message !== `domino.${name}` || !schemas[name]) return event;
    // Sentry merges ambient scope before beforeSend. Strip user/request/breadcrumb
    // context and unrelated scope extras from these deliberately minimal events.
    const keys = new Set(['schemaVersion', 'event', 'service', 'deploySha', 'at', 'matchRef', ...Object.keys(schemas[name])]);
    const extra = Object.fromEntries(Object.entries(event.extra || {}).filter(([key]) => keys.has(key)));
    const result = { extra, tags: { service:'game', deploySha:extra.deploySha || 'unknown' } };
    for (const key of ['event_id', 'timestamp', 'level', 'message', 'platform', 'release', 'environment', 'sdk']) {
        if (event[key] !== undefined) result[key] = event[key];
    }
    return result;
}

function createOperationalReporter({ env = process.env, write = line => console.info(line), capture } = {}) {
    return (event, input = {}) => {
        const schema = schemas[event];
        if (!schema) return false;
        const payload = { schemaVersion: 1, event, service: 'game', deploySha: buildInfo(env).deploySha, at: new Date().toISOString() };
        // Explicit allowlist: never copy identities, bearer tokens, names, messages,
        // room codes, API bodies or error objects into analytics.
        for (const [key, allowed] of Object.entries(schema)) {
            const value = input[key];
            if (typeof allowed[0] === 'number') {
                if (Number.isInteger(value) && value >= allowed[0] && value <= allowed[1]) payload[key] = value;
            } else if (allowed.includes(value)) payload[key] = value;
        }
        if (input.roomId && input.matchId) {
            payload.matchRef = createHash('sha256').update(JSON.stringify([String(input.roomId), String(input.matchId)])).digest('hex').slice(0, 24);
        }
        try { write(JSON.stringify(payload)); } catch { /* monitoring must not change gameplay */ }
        try { capture?.(payload, event === 'settlement_backlog' ? 'warning' : 'info'); } catch { /* same boundary */ }
        return true;
    };
}

const reportOperationalEvent = createOperationalReporter({
    capture: (payload, level) => {
        if (!(process.env.SENTRY_DSN_GAME || process.env.SENTRY_DSN)) return;
        require('@sentry/node').captureMessage(`domino.${payload.event}`, {
            level, tags: { service: 'game', deploySha: payload.deploySha }, extra: payload
        });
    }
});
module.exports = { createOperationalReporter, reportOperationalEvent, sanitizeOperationalSentryEvent };
