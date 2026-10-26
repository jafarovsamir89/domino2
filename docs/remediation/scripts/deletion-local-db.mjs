// Fresh loopback DB and synthetic identities only. This is not a live erasure command.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { PrismaClient, Prisma } from '@prisma/client';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AuthService } from '../../../apps/api/dist/src/modules/auth/auth.service.js';
import { AccountDeletionService, DELETION_WAIT_MS, DELETION_BACKUP_MS } from '../../../apps/api/dist/src/modules/account-deletion/account-deletion.service.js';
import { AccountDeletionController } from '../../../apps/api/dist/src/modules/account-deletion/account-deletion.controller.js';
import { DatabaseAccountErasure } from '../../../apps/api/dist/src/modules/account-deletion/database-erasure.js';
import { AccountErasureJournal } from '../../../apps/api/dist/src/modules/account-deletion/restore-journal.js';
import { createGameToken } from '../../../apps/api/dist/src/modules/auth/game-token.js';
import { grantStarterCoins } from '../../../apps/api/dist/src/modules/economy/economy-starter.js';
const [database, output] = process.argv.slice(2);
assert.match(database || '', /^domino_remediation_s054_deletion_[a-z0-9_]+$/);
assert.ok(output?.endsWith('.json') && !fs.existsSync(output));
const url = `postgresql://domino_remediation@127.0.0.1:55439/${database}?schema=public`;
assert.equal(process.env.DATABASE_URL, url, 'Actual AuthService must also use this explicitly local DB');
const db = new PrismaClient({ datasources: { db: { url } } }), auth = new AuthService(db);
const owner = { userId: 's054-synthetic-deletion-owner', playerId: 's054-synthetic-deletion-player', email: 's054-private-owner@example.invalid', name: 'PRIVATE_S054_OWNER_NAME' };
const other = { userId: 's054-synthetic-other-owner', playerId: 's054-synthetic-other-player', email: 's054-other@example.invalid', name: 'Synthetic Other' };
const now = new Date(), origin = 'http://127.0.0.1:4173';
const service = new AccountDeletionService(db, auth, { enabled: true, trustedOrigins: [origin] });
const work = path.resolve('.tmp/s054-deletion', database); fs.mkdirSync(work, { recursive: true, mode: 0o700 });
assert.equal(fs.existsSync(path.join(work, 'result.json')), false, 'Never reuse a completed fixture directory');
let app, restoredDb;
const login = async (who, time = new Date()) => {
  const session = await db.session.create({ data: { id: randomUUID(), token: randomUUID(), userId: who.userId, createdAt: time, updatedAt: time, expiresAt: new Date(time.getTime() + 90 * 86400000) } });
  return { authorization: `Bearer ${session.token}` };
};
try {
  assert.equal(await db.user.count(), 0, 'Fresh DB required; never reset existing accounts');
  for (const who of [owner, other]) {
    await db.user.create({ data: { id: who.userId, email: who.email, name: who.name, role: 'player' } });
    await db.player.create({ data: { id: who.playerId, userId: who.userId, displayName: who.name, avatarUrl: `data:image/png;base64,U1lOVEhFVElDX09OTFk=`, stats: { create: {} }, wallet: { create: {} } } });
    await grantStarterCoins(db, who.playerId, who.userId, who.name, 's054_deletion_fixture');
  }
  const h1 = await login(owner), h2 = await login(owner), foreign = await login(other);
  class ReviewModule {}
  Module({ controllers: [AccountDeletionController], providers: [{ provide: AccountDeletionService, useValue: service }] })(ReviewModule);
  app = await NestFactory.create(ReviewModule, { logger: false, abortOnError: false });
  app.setGlobalPrefix('api'); await app.listen(0, '127.0.0.1');
  const base = await app.getUrl();
  const http = async (suffix = '', headers = h1, body) => {
    const r = await fetch(`${base}/api/account/deletion${suffix}`, { method: body ? 'POST' : 'GET', headers: { ...headers, ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    return { status: r.status, body: await r.json() };
  };
  const firstStatus = (await http('', h1)).body;
  const deleteBody = { confirm: 'DELETE', confirmationToken: firstStatus.confirmationToken };
  assert.equal(firstStatus.accountLabel, owner.email);
  assert.equal((await http('', {}, deleteBody)).status, 401);
  assert.equal((await http('', h1, { ...deleteBody, userId: other.userId })).status, 400);
  assert.equal((await http('', { ...h1, cookie: 'synthetic-noncredential' }, deleteBody)).status, 403);
  assert.equal((await http('', foreign, deleteBody)).status, 403, 'Account switch cannot apply old confirmation to a new owner');
  assert.equal((await http('', h2, deleteBody)).status, 403, 'Confirmation belongs to the observed session');
  const stale = await login(owner, new Date(now.getTime() - 11 * 60000));
  assert.equal((await http('', stale, deleteBody)).status, 403);
  const requested = await http('', h1, deleteBody);
  assert.equal(requested.status, 201);
  const row = await db.accountDeletion.findUniqueOrThrow({ where: { userId: owner.userId } });
  assert.equal(row.deleteAfter - row.requestedAt, DELETION_WAIT_MS);
  assert.equal(await db.session.count({ where: { userId: owner.userId } }), 0, 'ALL original sessions revoked');
  assert.equal((await http('', h2)).status, 401);
  assert.equal((await http('', foreign)).body.state, 'none');
  const fresh = await login(owner);
  const pendingStatus = (await http('', fresh)).body;
  assert.equal(pendingStatus.requestId, row.id);
  await assert.rejects(auth.getCurrentProfile(fresh), e => e.getStatus?.() === 403 && e.message === 'account_deletion_pending');
  const token = createGameToken({ userId: owner.userId, playerId: owner.playerId, sessionId: (await db.session.findFirstOrThrow({ where: { userId: owner.userId } })).id, displayName: owner.name, role: 'player', provider: 'better-auth', issuedAt: Date.now(), expiresAt: Date.now() + 300000 });
  await assert.rejects(auth.validateGameToken(token), e => e.getStatus?.() === 401);
  const retryBody = { confirm: 'DELETE', confirmationToken: pendingStatus.confirmationToken };
  assert.equal((await http('', fresh, retryBody)).body.requestId, row.id, 'Retry never extends deadline');
  assert.equal((await db.accountDeletion.findUniqueOrThrow({ where: { id: row.id } })).deleteAfter.getTime(), row.deleteAfter.getTime());
  assert.equal((await http('/cancel', fresh, { confirm: 'CANCEL_DELETION', confirmationToken: pendingStatus.cancelConfirmationToken })).status, 201);
  assert.equal(await db.accountDeletion.count(), 0);
  assert.equal((await db.player.findUniqueOrThrow({ where: { id: owner.playerId } })).deletionRequestedAt, null);
  assert.equal((await auth.getCurrentProfile(fresh)).wallet.balance, 1000, 'Cancel restores access, not starter grant');
  assert.equal((await http('', fresh, retryBody)).status, 403, 'Late request after explicit cancellation cannot reschedule deletion');

  // Start again, then populate every relevant private/shared surface using synthetic data.
  const freshStatus = (await http('', fresh)).body;
  assert.equal((await http('', fresh, { confirm: 'DELETE', confirmationToken: freshStatus.confirmationToken })).status, 201);
  const scheduled = await db.accountDeletion.findUniqueOrThrow({ where: { userId: owner.userId } });
  const due = scheduled.deleteAfter;
  await db.account.create({ data: { id: randomUUID(), userId: owner.userId, accountId: 'PRIVATE_S054_PROVIDER_ID', providerId: 'synthetic', accessToken: 'PRIVATE_S054_ACCESS_TOKEN', refreshToken: 'PRIVATE_S054_REFRESH_TOKEN' } });
  await db.verification.create({ data: { id: randomUUID(), identifier: 'synthetic-reset-token', value: owner.userId, expiresAt: new Date(due.getTime() + 86400000) } });
  const message = await db.directMessage.create({ data: { senderPlayerId: owner.playerId, receiverPlayerId: other.playerId, text: 'PRIVATE_S054_ATTACHMENT data:audio/ogg;base64,U1lOVEhFVElD', clientMessageId: 'synthetic-dm' } });
  await db.directMessageThread.create({ data: { playerAId: owner.playerId, playerBId: other.playerId, lastMessageId: message.id } });
  await db.fcmToken.create({ data: { playerId: owner.playerId, token: 'PRIVATE_S054_PUSH_TOKEN' } });
  await db.feedback.create({ data: { playerId: owner.playerId, contactEmail: owner.email, message: 'PRIVATE_S054_FEEDBACK' } });
  await db.inboxMessage.create({ data: { playerId: other.playerId, type: 'synthetic', title: 'Synthetic gift', body: owner.name, payloadJson: { senderId: owner.playerId, email: owner.email, senderName: owner.name } } });
  await db.systemAuditLog.create({ data: { actorUserId: owner.userId, actorPlayerId: owner.playerId, action: 'synthetic', entityType: 'player', entityId: owner.playerId, payloadJson: { name: owner.name, email: owner.email } } });
  await db.paymentEvent.create({ data: { provider: 'synthetic', providerEventId: 'synthetic-no-payment', type: 'diagnostic', payloadJson: { userId: owner.userId, email: owner.email } } });
  const match = await db.match.create({ data: { mode: 'online', winnerKey: `player:${owner.userId}`, participants: { create: [{ playerId: owner.playerId, displayNameSnapshot: owner.name, winnerKey: `player:${owner.userId}`, result: 'win' }, { playerId: other.playerId, displayNameSnapshot: other.name, winnerKey: `player:${owner.userId}`, result: 'loss' }] } } });
  const otherWalletBefore = await db.coinWallet.findUniqueOrThrow({ where: { playerId: other.playerId } });
  const storesCalls = { prepare: 0, forget: 0 };
  let processorMode = 'ready';
  const journal = new AccountErasureJournal(path.join(work, 'restore-journal'));
  const backupPath = path.join(work, 'synthetic-before-erasure.sql');
  const stores = {
    async prepare(target) {
      storesCalls.prepare++;
      assert.equal(target.userId, owner.userId);
      if (processorMode === 'unavailable') throw Error('synthetic_processor_unavailable');
      if (processorMode === 'incomplete') return { gameStateErased: true, pendingSettlements: 0, processorsErasedOrNoData: false, restoreMarkerDurable: false };
      // This is a synthetic processor/game-store fixture, not real Sentry/TURN/provider acceptance.
      journal.ensure(target);
      return { gameStateErased: true, pendingSettlements: 0, processorsErasedOrNoData: true, restoreMarkerDurable: true };
    },
    async forgetAfterBackupsExpire(id, time) {
      storesCalls.forget++;
      if (fs.existsSync(backupPath)) throw Error('covered_backup_still_present');
      journal.forget(id, time, { allCoveredBackupsRemoved: true });
    }
  };
  const executor = new DatabaseAccountErasure(db, stores);
  assert.deepEqual(await service.processDue(executor, new Date(due.getTime() - 1)), { completed: 0, blocked: 0, forgotten: 0 });
  await db.coinWallet.update({ where: { playerId: owner.playerId }, data: { reserved: 50 } });
  assert.equal((await service.processDue(executor, due)).blocked, 1);
  assert.equal(storesCalls.prepare, 0, 'Pending money blocks before external erasure');
  assert.ok(await db.user.findUnique({ where: { id: owner.userId } }));
  await db.coinWallet.update({ where: { playerId: owner.playerId }, data: { reserved: 0 } });
  for (processorMode of ['unavailable', 'incomplete']) {
    const blocked = await service.processDue(executor, due);
    assert.equal(blocked.completed, 0); assert.equal(blocked.blocked, 1);
    assert.ok(await db.user.findUnique({ where: { id: owner.userId } }), 'External failure must preserve the closed account for retry');
    const queue = await db.accountDeletion.findUniqueOrThrow({ where: { userId: owner.userId } });
    assert.equal(queue.state, 'erasing'); assert.equal(queue.deleteAfter.getTime(), due.getTime());
    assert.ok((await db.player.findUniqueOrThrow({ where: { id: owner.playerId } })).deletionRequestedAt);
  }
  processorMode = 'ready';

  const dump = execFileSync('pg_dump', ['-h', '127.0.0.1', '-p', '55439', '-U', 'domino_remediation', '--no-owner', '--no-acl', database]);
  fs.writeFileSync(backupPath, dump, { mode: 0o600 });
  const complete = await service.processDue(executor, due);
  assert.equal(complete.completed, 1);
  assert.equal(await db.user.count({ where: { id: owner.userId } }), 0);
  assert.equal(await db.player.count({ where: { id: owner.playerId } }), 0);
  assert.equal(await db.directMessage.count(), 0);
  assert.equal(await db.directMessageThread.count(), 0);
  assert.equal(await db.fcmToken.count(), 0);
  assert.deepEqual(await db.coinWallet.findUnique({ where: { playerId: other.playerId } }), otherWalletBefore);
  const participants = await db.matchParticipant.findMany({ where: { matchId: match.id } });
  assert.equal(participants.length, 2);
  assert.equal(JSON.stringify(participants).includes(owner.userId), false, 'Shared winner metadata must not retain the deleted owner');
  assert.equal((await db.match.findUniqueOrThrow({ where: { id: match.id } })).winnerKey, 'deleted-player');
  assert.equal(participants.find(p => p.playerId === other.playerId).displayNameSnapshot, other.name);
  assert.equal(participants.filter(p => p.playerId === null).length, 1);
  await journal.assertRestoredAccountsAbsent(db);
  const restoreDatabase = database.replace('_deletion_', '_restore_');
  assert.match(restoreDatabase, /^domino_remediation_s054_restore_[a-z0-9_]+$/);
  execFileSync('createdb', ['-h', '127.0.0.1', '-p', '55439', '-U', 'domino_remediation', restoreDatabase]);
  execFileSync('psql', ['-h', '127.0.0.1', '-p', '55439', '-U', 'domino_remediation', '--dbname', restoreDatabase, '--set', 'ON_ERROR_STOP=1', '--single-transaction', '--file', backupPath], { stdio: ['ignore', 'ignore', 'pipe'] });
  restoredDb = new PrismaClient({ datasources: { db: { url: `postgresql://domino_remediation@127.0.0.1:55439/${restoreDatabase}?schema=public` } } });
  await assert.rejects(journal.assertRestoredAccountsAbsent(restoredDb), /account_erasure_restore_required/);
  const reapplied = await journal.reapplyBeforeAdmission(restoredDb, new DatabaseAccountErasure(restoredDb, stores), due);
  assert.deepEqual(reapplied, { reapplied: 1, admissionAllowed: true });
  assert.equal(await restoredDb.user.count({ where: { id: owner.userId } }), 0);
  assert.deepEqual(await restoredDb.coinWallet.findUnique({ where: { playerId: other.playerId } }), otherWalletBefore);
  const forbidden = [owner.email, owner.name, 'PRIVATE_S054_ACCESS_TOKEN', 'PRIVATE_S054_REFRESH_TOKEN', 'PRIVATE_S054_PROVIDER_ID', 'PRIVATE_S054_ATTACHMENT', 'PRIVATE_S054_PUSH_TOKEN', 'PRIVATE_S054_FEEDBACK'];
  const retained = [];
  for (const model of Prisma.dmmf.datamodel.models) {
    const delegate = model.name[0].toLowerCase() + model.name.slice(1), rows = await db[delegate].findMany();
    const serialized = JSON.stringify(rows);
    for (const value of forbidden) assert.equal(serialized.includes(value), false, `Private fixture leaked in ${model.name}`);
    retained.push({ model: model.name, rows: rows.length });
  }
  const receiptRow = await db.accountDeletion.findUniqueOrThrow({ where: { id: scheduled.id } });
  assert.equal(receiptRow.state, 'completed');
  assert.equal(receiptRow.userId, null);
  assert.equal(receiptRow.playerId, null);
  assert.equal(receiptRow.forgetAfter.getTime(), scheduled.requestedAt.getTime() + DELETION_WAIT_MS + DELETION_BACKUP_MS);
  assert.equal((await service.processDue(executor, due)).completed, 0, 'No repeated DB deletion');
  const held = await service.processDue(executor, receiptRow.forgetAfter);
  assert.equal(held.forgotten, 0); assert.equal(held.blocked, 1, 'A timer alone cannot confirm backup erasure');
  assert.equal(journal.list().length, 1);
  fs.unlinkSync(backupPath); // Explicitly disposable synthetic backup in this fixture.
  const forgotten = await service.processDue(executor, receiptRow.forgetAfter);
  assert.equal(forgotten.forgotten, 1);
  assert.equal(await db.accountDeletion.count(), 0);
  const result = { scope: 'Actual Nest HTTP + AuthService + real local PostgreSQL, fsynced private journal, real pg_dump/psql into a separate fresh DB. Game/processor cleanup remains a synthetic fixture; no production configuration accepted.', database, restoreDatabase, credentialDerivedTarget: true, missingAuth: 401, bodyTargetInjection: 400, cookieOrigin: 403, recentLogin: 403, accountAndSessionConfirmationBound: true, lateRequestAfterCancelRejected: true, originalSessionsRevoked: true, newLoginDoesNotCancel: true, explicitCancel: true, cycleRestartDoesNotChangeStarter: true, pendingProfileAndGameTokenRejected: true, exactThirtyDayBoundary: true, reservedCoinsBlockBeforeExternalErasure: true, externalProcessorFailurePreservesClosedAccount: true, incompleteExternalReceiptBlocksPurge: true, sharedWinnerIdentifiersErased: true, privateFixtureScanModels: retained.length, privateFixtureMatches: 0, otherWalletUnchanged: true, sharedMatchParticipantsRetained: 2, ownerParticipantAnonymized: true, actualBackupRestoreBlockedThenReapplied: true, coveredBackupPresenceBlocksMarkerExpiry: true, boundedJournalDaysFromRequest: 60, storesCalls, productionAcceptance: 'Real game/processor/backup-retention adapters and startup registration remain release prerequisites' };
  fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n'); fs.writeFileSync(path.join(work, 'result.json'), JSON.stringify(result)); console.log(JSON.stringify(result));
} finally { await app?.close(); await restoredDb?.$disconnect(); await db.$disconnect(); }
