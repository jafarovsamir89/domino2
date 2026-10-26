import fs from 'node:fs';
import path from 'node:path';
import type { PrismaClient } from '@prisma/client';
import { DELETION_BACKUP_MS, DELETION_WAIT_MS, type ErasureExecutor, type ErasureTarget } from './account-deletion.service.js';

type Marker = { version: 1; requestId: string; userId: string; playerId: string; requestedAt: string; deleteAfter: string; forgetAfter: string };

/** A separate persistent volume, never included in www or ordinary DB restores.
 * Contains only bounded erasure identifiers/dates, no email/name/credential.
 */
export class AccountErasureJournal {
  constructor(private directory: string) {
    if (!path.isAbsolute(directory)) throw Error('absolute_restore_journal_required');
    // The persistent-volume parent must already exist: recursively creating an
    // un-fsynced ancestor can lose every marker after a host crash.
    const parent = path.dirname(directory);
    let parentStat: fs.Stats;
    try { parentStat = fs.lstatSync(parent); } catch { throw Error('restore_journal_parent_required'); }
    if (!parentStat.isDirectory() || parentStat.isSymbolicLink()) throw Error('restore_journal_parent_required');
    try { fs.mkdirSync(directory, { mode: 0o700 }); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
    const stat = fs.lstatSync(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0) throw Error('private_restore_journal_required');
    const parentFd = fs.openSync(parent, fs.constants.O_RDONLY);
    try { fs.fsyncSync(parentFd); } finally { fs.closeSync(parentFd); }
  }
  private file(id: string) {
    if (!/^[a-zA-Z0-9_-]{12,128}$/.test(id)) throw Error('invalid_erasure_request');
    return path.join(this.directory, id + '.json');
  }
  private syncDirectory() { const fd = fs.openSync(this.directory, fs.constants.O_RDONLY); try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); } }
  private read(id: string): Marker {
    const file = this.file(id), stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 4096 || (stat.mode & 0o077) !== 0) throw Error('invalid_restore_marker');
    const marker = JSON.parse(fs.readFileSync(file, 'utf8')) as Marker;
    if (Object.keys(marker).length !== 7 || marker.version !== 1 || marker.requestId !== id || typeof marker.userId !== 'string' || !marker.userId || typeof marker.playerId !== 'string' || !marker.playerId
      || !Number.isFinite(Date.parse(marker.requestedAt)) || !Number.isFinite(Date.parse(marker.deleteAfter))
      || Date.parse(marker.deleteAfter) !== Date.parse(marker.requestedAt) + DELETION_WAIT_MS
      || Date.parse(marker.forgetAfter) !== Date.parse(marker.deleteAfter) + DELETION_BACKUP_MS) throw Error('invalid_restore_marker');
    return marker;
  }
  ensure(target: ErasureTarget): Marker {
    if (![target.userId, target.playerId].every(id => typeof id === 'string' && id.length > 0 && id.length <= 256)) throw Error('invalid_erasure_identity');
    if (target.deleteAfter.getTime() !== target.requestedAt.getTime() + DELETION_WAIT_MS) throw Error('invalid_erasure_window');
    const marker: Marker = { version: 1, requestId: target.requestId, userId: target.userId, playerId: target.playerId, requestedAt: target.requestedAt.toISOString(), deleteAfter: target.deleteAfter.toISOString(), forgetAfter: new Date(target.deleteAfter.getTime() + DELETION_BACKUP_MS).toISOString() };
    const file = this.file(target.requestId);
    try {
      const fd = fs.openSync(file, fs.constants.O_WRONLY | fs.constants.O_CREAT | fs.constants.O_EXCL | fs.constants.O_NOFOLLOW, 0o600);
      try { fs.writeFileSync(fd, JSON.stringify(marker) + '\n'); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      if (JSON.stringify(this.read(target.requestId)) !== JSON.stringify(marker)) throw Error('restore_marker_conflict');
      const fd = fs.openSync(file, fs.constants.O_RDWR | fs.constants.O_NOFOLLOW);
      try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    }
    this.syncDirectory();
    return marker;
  }
  list(): Marker[] {
    const names = fs.readdirSync(this.directory);
    if (names.some(name => !/^[a-zA-Z0-9_-]{12,128}\.json$/.test(name))) throw Error('unexpected_restore_journal_file');
    return names.sort().map(name => this.read(name.slice(0, -5)));
  }
  forget(id: string, now: Date, confirmation: { allCoveredBackupsRemoved: true }) {
    const marker = this.read(id);
    if (confirmation?.allCoveredBackupsRemoved !== true || !Number.isFinite(now.getTime()) || now.getTime() < Date.parse(marker.forgetAfter)) throw Error('backup_erasure_not_confirmed');
    fs.unlinkSync(this.file(id)); this.syncDirectory();
  }
  async assertRestoredAccountsAbsent(db: PrismaClient) {
    for (const marker of this.list()) {
      const [user, player] = await Promise.all([db.user.findUnique({ where: { id: marker.userId }, select: { id: true } }), db.player.findUnique({ where: { id: marker.playerId }, select: { id: true } })]);
      if (user || player) throw Error('account_erasure_restore_required');
    }
  }
  async reapplyBeforeAdmission(db: PrismaClient, executor: ErasureExecutor, now = new Date()) {
    let reapplied = 0;
    for (const marker of this.list()) {
      if (now.getTime() < Date.parse(marker.deleteAfter)) throw Error('restore_clock_precedes_erasure');
      const [user, player] = await Promise.all([db.user.findUnique({ where: { id: marker.userId }, select: { id: true } }), db.player.findUnique({ where: { id: marker.playerId }, select: { id: true, userId: true } })]);
      if (!user && !player) continue;
      if (!user || !player || player.userId !== marker.userId) throw Error('restore_identity_conflict');
      const target = { requestId: marker.requestId, userId: marker.userId, playerId: marker.playerId, requestedAt: new Date(marker.requestedAt), deleteAfter: new Date(marker.deleteAfter) };
      await db.$transaction(async tx => {
        await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(1464091702, hashtext(${target.playerId}))`;
        await tx.player.update({ where: { id: target.playerId }, data: { deletionRequestedAt: target.requestedAt, deletionVersion: { increment: 1 } } });
        await tx.session.deleteMany({ where: { userId: target.userId } });
        await tx.accountDeletion.upsert({ where: { id: target.requestId }, create: { id: target.requestId, userId: target.userId, playerId: target.playerId, requestedAt: target.requestedAt, deleteAfter: target.deleteAfter, state: 'erasing' }, update: { state: 'erasing' } });
      });
      const receipt = await executor.erase(target, now);
      if (receipt.completed !== true || receipt.restoreMarkerDurable !== true) throw Error('incomplete_erasure');
      await db.accountDeletion.update({ where: { id: target.requestId }, data: { state: 'completed', userId: null, playerId: null, finalizedAt: now, forgetAfter: new Date(marker.forgetAfter) } });
      reapplied++;
    }
    await this.assertRestoredAccountsAbsent(db);
    return { reapplied, admissionAllowed: true };
  }
}
