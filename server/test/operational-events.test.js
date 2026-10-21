const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createOperationalReporter, sanitizeOperationalSentryEvent } = require('../operationalEvents');
const { buildInfo } = require('../buildInfo');
const { SettlementOutbox } = require('../settlementOutbox');

test('build identity accepts only a commit SHA and marks missing identity explicitly', () => {
    assert.equal(buildInfo({ DEPLOY_SHA: 'ABCDEF012345' }).deploySha, 'abcdef012345');
    assert.equal(buildInfo({ DEPLOY_SHA: 'token-or-branch-name' }).deploySha, 'unknown');
    assert.equal(buildInfo({}).release, 'domino-server@unknown');
});

test('operational payload is allowlisted, correlated without identities and delivered to both local sinks', () => {
    const lines = [], captured = [];
    const report = createOperationalReporter({ env: { DEPLOY_SHA: 'abcdef012345' }, write: line => lines.push(JSON.parse(line)), capture: (data, level) => captured.push({ data, level }) });
    assert.equal(report('arbitrary-event', { token: 'secret' }), false);
    report('match_recorded', { roomId: 'synthetic-room', matchId: 'synthetic-match', mode: 'classic101', outcome: 'normal', participants: 4, token: 'secret', userId: 'private', roomCode: 'private', body: 'private' });
    report('settlement_acknowledged', { roomId: 'synthetic-room', matchId: 'synthetic-match', result: 'win' });
    report('settlement_backlog', { failed: 2, pending: 3, error: new Error('private') });
    assert.equal(lines.length, 3);
    assert.equal(lines[0].matchRef, lines[1].matchRef);
    assert.equal(lines[0].deploySha, 'abcdef012345');
    assert.ok(!JSON.stringify(lines).match(/secret|private|synthetic-room|synthetic-match|userId|roomCode/));
    assert.equal(captured[2].level, 'warning');
    assert.deepEqual(captured.map(x => x.data), lines);
});

test('outbox final event is emitted after durable receipt, never on failure or cached acknowledgement', async t => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'domino-event-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const events = [];
    const payload = { roomId: 'synthetic-room', matchId: 'synthetic-match', stakeKey: 'stake_50', result: 'win', winnerUserIds: ['synthetic-user'] };
    const store = new SettlementOutbox(dir, { report: (event, data) => {
        assert.equal(store.read(`${store.key(payload)}.receipt.json`).response.ok, true);
        events.push(event);
    } });
    await assert.rejects(store.submit(payload, async () => { throw Error('local transport failed'); }));
    assert.deepEqual(events, []);
    await store.submit(payload, async () => ({ ok: true }));
    await store.submit(payload, () => assert.fail('cached receipt'));
    assert.deepEqual(events, ['settlement_acknowledged']);
});

test('telemetry failures do not change delivery acknowledgement', async t => {
    const report = createOperationalReporter({ write() { throw Error('disk unavailable'); }, capture() { throw Error('sink unavailable'); } });
    assert.equal(report('reconnect_completed', { source: 'join' }), true);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'domino-event-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const store = new SettlementOutbox(dir, { report() { throw Error('sink unavailable'); } });
    assert.deepEqual(await store.submit({ roomId: 'r', matchId: 'm', stakeKey: 'stake_50', result: 'refund', winnerUserIds: [] }, async () => ({ ok: true })), { ok: true });
});

test('Sentry SDK delivers a synthetic backlog alert to a loopback envelope sink', async t => {
    const http = require('node:http');
    const sentry = require('@sentry/node');
    const bodies = [];
    const sink = http.createServer((req, res) => {
        let body = ''; req.on('data', chunk => { body += chunk; });
        req.on('end', () => { bodies.push(body); res.writeHead(200); res.end('{}'); });
    });
    await new Promise(resolve => sink.listen(0, '127.0.0.1', resolve));
    t.after(async () => { await sentry.close(1000); await new Promise(resolve => sink.close(resolve)); });
    sentry.init({ dsn: `http://synthetic@127.0.0.1:${sink.address().port}/1`, defaultIntegrations: false, sendDefaultPii: false, release: 'domino-server@abcdef012345', beforeSend:sanitizeOperationalSentryEvent });
    sentry.setUser({id:'must-not-leak'});
    sentry.setExtra('unrelatedSecret','must-not-leak');
    sentry.setTag('privateRoomCode','must-not-leak');
    sentry.addBreadcrumb({message:'must-not-leak'});
    const report = createOperationalReporter({ env: { DEPLOY_SHA:'abcdef012345' }, write() {}, capture: (payload, level) => sentry.captureMessage(`domino.${payload.event}`, { level, extra:payload }) });
    report('settlement_backlog', { failed:1, pending:2, token:'must-not-leak' });
    assert.equal(await sentry.flush(2000), true);
    const event = bodies.flatMap(body => body.split('\n')).map(line => { try { return JSON.parse(line); } catch { return {}; } }).find(row => row.message === 'domino.settlement_backlog');
    assert.ok(event, 'actual SDK transport must reach the local receiver');
    assert.equal(event.level, 'warning');
    assert.equal(event.extra.deploySha, 'abcdef012345');
    assert.equal(event.user, undefined);
    assert.equal(event.breadcrumbs, undefined);
    assert.equal(JSON.stringify(bodies).includes('must-not-leak'), false);
});
