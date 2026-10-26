import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { redactReferences, DatabaseAccountErasure } from '../src/modules/account-deletion/database-erasure.js';
import { AccountDeletionService } from '../src/modules/account-deletion/account-deletion.service.js';
import { AccountErasureJournal } from '../src/modules/account-deletion/restore-journal.js';

test('erasure redacts nested identifiers and object keys without losing colliding financial entries', () => {
  const original = { 'synthetic-user': { amount: 25, name: 'Synthetic private' }, 'synthetic-player': { amount: 70 }, other: ['synthetic-user', null, 0, false, { email: 'synthetic@example.invalid' }] };
  const clean = redactReferences(original, ['synthetic-user', 'synthetic-player', 'Synthetic private', 'synthetic@example.invalid']) as any;
  assert.equal(Object.keys(clean).length, 3);
  assert.equal(clean['—'].amount, 25);
  assert.equal(clean['—#2'].amount, 70);
  assert.deepEqual(clean.other.slice(1, 4), [null, 0, false]);
  assert.equal(JSON.stringify(clean).includes('synthetic'), false);
  assert.equal(original['synthetic-user'].name, 'Synthetic private', 'No mutation of the source object');
});

test('deletion never runs a due sweep without all erasure and restore interfaces', async () => {
  let reads = 0;
  const db = { accountDeletion: { findMany: () => { reads++; return []; } } } as any;
  const service = new AccountDeletionService(db, {} as any, { enabled: true, trustedOrigins: [] });
  await assert.rejects(service.processDue({} as any), /complete_erasure_executor_required/);
  assert.equal(reads, 0);
  const executor = new DatabaseAccountErasure({} as any, {} as any);
  await assert.rejects(executor.erase({} as any, new Date()), /all_erasure_surfaces_required/);
});

test('disabled account deletion rejects credential-derived requests and workers before any DB access', async () => {
  const db = new Proxy({}, { get() { throw Error('unexpected-db-access'); } }) as any;
  const service = new AccountDeletionService(db, {} as any, { enabled: false, trustedOrigins: [] });
  await assert.rejects(service.status({}), (error: any) => error.getStatus() === 403);
  await assert.rejects(service.request({}, { confirm: 'DELETE' }), (error: any) => error.getStatus() === 403);
  await assert.rejects(service.processDue({} as any), (error: any) => error.getStatus() === 403);
});

test('restore journal survives restart, rejects identity conflicts and forgets only after confirmed backup expiry', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'domino-erasure-journal-'));
  try {
    fs.chmodSync(dir, 0o700);
    const target = { requestId: 'synthetic-request-001', userId: 'synthetic-owner-001', playerId: 'synthetic-player-001', requestedAt: new Date('2026-10-01T12:00:00Z'), deleteAfter: new Date('2026-10-31T12:00:00Z') };
    const journal = new AccountErasureJournal(dir), first = journal.ensure(target);
    assert.deepEqual(new AccountErasureJournal(dir).list(), [first]);
    assert.deepEqual(journal.ensure(target), first, 'Idempotent durable write');
    assert.equal(fs.statSync(path.join(dir, target.requestId + '.json')).mode & 0o777, 0o600);
    assert.throws(() => journal.ensure({ ...target, userId: 'different-owner' }), /restore_marker_conflict/);
    assert.throws(() => journal.ensure({ ...target, userId: '' }), /invalid_erasure_identity/);
    assert.throws(() => new AccountErasureJournal(path.join(dir, 'missing-parent', 'journal')), /restore_journal_parent_required/);
    assert.throws(() => journal.ensure({ ...target, requestId: '../../escape' }), /invalid_erasure_request/);
    assert.throws(() => journal.forget(target.requestId, new Date('2026-11-30T11:59:59Z'), { allCoveredBackupsRemoved: true }), /backup_erasure_not_confirmed/);
    assert.throws(() => journal.forget(target.requestId, new Date('2026-11-30T12:00:00Z'), {} as any), /backup_erasure_not_confirmed/);
    journal.forget(target.requestId, new Date('2026-11-30T12:00:00Z'), { allCoveredBackupsRemoved: true });
    assert.equal(journal.list().length, 0);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('restore gate refuses a resurrected owner or player before admission', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'domino-erasure-gate-'));
  try {
    fs.chmodSync(dir, 0o700); const journal = new AccountErasureJournal(dir);
    journal.ensure({ requestId: 'synthetic-request-002', userId: 'synthetic-owner-002', playerId: 'synthetic-player-002', requestedAt: new Date('2026-10-01T12:00:00Z'), deleteAfter: new Date('2026-10-31T12:00:00Z') });
    let owner: any = { id: 'synthetic-owner-002' }, player: any = null;
    const db = { user: { findUnique: async () => owner }, player: { findUnique: async () => player } } as any;
    await assert.rejects(journal.assertRestoredAccountsAbsent(db), /account_erasure_restore_required/);
    owner = null; player = { id: 'synthetic-player-002' };
    await assert.rejects(journal.assertRestoredAccountsAbsent(db), /account_erasure_restore_required/);
    player = null; await journal.assertRestoredAccountsAbsent(db);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
