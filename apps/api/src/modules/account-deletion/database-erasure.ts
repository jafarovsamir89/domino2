import { Prisma, type PrismaClient } from '@prisma/client';
import type { ErasureExecutor, ErasureTarget } from './account-deletion.service.js';

export type ErasureStores = {
  prepare(target: ErasureTarget, now: Date): Promise<{
    gameStateErased: true;
    pendingSettlements: 0;
    processorsErasedOrNoData: true;
    restoreMarkerDurable: true;
  }>;
  // Must verify that no covered backup can resurrect this account before removing
  // its marker. A mere timer or an unavailable backup service is not confirmation.
  forgetAfterBackupsExpire(requestId: string, now: Date): Promise<void>;
};

/** Remove identifiers from retained shared payloads without changing amounts,
 * match IDs or the other participant's wallet. Keys can contain identifiers too.
 */
export function redactReferences(value: unknown, identifiers: readonly string[]): unknown {
  const needles = identifiers.filter(Boolean).sort((a, b) => b.length - a.length);
  const text = (s: string) => needles.reduce((next, needle) => next.split(needle).join('—'), s);
  const visit = (v: unknown): unknown => {
    if (typeof v === 'string') return text(v);
    if (Array.isArray(v)) return v.map(visit);
    if (v && typeof v === 'object') {
      const entries: Array<[string, unknown]> = [], seen = new Set<string>();
      for (const [key, val] of Object.entries(v)) {
        const base = text(key); let next = base, index = 1;
        while (seen.has(next)) next = `${base}#${++index}`;
        seen.add(next); entries.push([next, visit(val)]);
      }
      return Object.fromEntries(entries);
    }
    return v;
  };
  return visit(value);
}

export class DatabaseAccountErasure implements ErasureExecutor {
  constructor(private db: PrismaClient, private stores: ErasureStores) {}
  async erase(target: ErasureTarget, now: Date): Promise<{ completed: true; restoreMarkerDurable: true }> {
    if (!this.stores?.prepare || !this.stores?.forgetAfterBackupsExpire) throw Error('all_erasure_surfaces_required');
    const row = await this.db.accountDeletion.findUnique({ where: { id: target.requestId } });
    if (!row || row.state !== 'erasing' || row.userId !== target.userId || row.playerId !== target.playerId || row.deleteAfter > now) throw Error('erasure_not_authorized');
    const [user, player, wallet, reserved, activeEntries, payments, staffLogs] = await Promise.all([
      this.db.user.findUnique({ where: { id: target.userId } }),
      this.db.player.findUnique({ where: { id: target.playerId } }),
      this.db.coinWallet.findUnique({ where: { playerId: target.playerId } }),
      this.db.coinMatchStake.count({ where: { playerId: target.playerId, status: 'reserved' } }),
      this.db.coinTournamentEntry.count({ where: { playerId: target.playerId, status: { in: ['registered', 'active'] } } }),
      this.db.payment.count({ where: { order: { playerId: target.playerId } } }),
      this.db.adminAuditLog.count({ where: { adminUserId: target.userId } })
    ]);
    if (user && user.role && user.role !== 'player' || staffLogs) throw Error('staff_account_requires_operator');
    if (player && (player.userId !== target.userId || !player.deletionRequestedAt)) throw Error('request_owner_changed');
    if (wallet?.reserved || reserved || activeEntries) throw Error('unsettled_economy_blocks_erasure');
    // Owner has not approved a legal/payment retention schedule. Do not silently
    // destroy real payment evidence or claim that this branch has been accepted.
    if (payments) throw Error('payment_retention_requires_operator');
    const receipt = await this.stores.prepare(target, now);
    if (receipt?.gameStateErased !== true || receipt.pendingSettlements !== 0 || receipt.processorsErasedOrNoData !== true || receipt.restoreMarkerDurable !== true) throw Error('incomplete_external_erasure');
    await this.db.$transaction(async tx => {
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(1464091702, hashtext(${target.playerId}))`;
      const current = await tx.accountDeletion.findUnique({ where: { id: target.requestId } });
      if (!current || current.state !== 'erasing' || current.userId !== target.userId || current.playerId !== target.playerId || current.deleteAfter > now) throw Error('request_changed');
      const currentPlayer = await tx.player.findUnique({ where: { id: target.playerId } });
      const currentUser = await tx.user.findUnique({ where: { id: target.userId } });
      if (!currentPlayer && !currentUser) return; // Crash after DB commit: durable marker permits idempotent ACK.
      if (!currentPlayer || currentPlayer.userId !== target.userId || !currentPlayer.deletionRequestedAt) throw Error('request_owner_changed');
      if (currentUser?.role && currentUser.role !== 'player' || await tx.adminAuditLog.count({ where: { adminUserId: target.userId } })) throw Error('staff_account_requires_operator');
      if ((await tx.coinWallet.findUnique({ where: { playerId: target.playerId } }))?.reserved
        || await tx.coinMatchStake.count({ where: { playerId: target.playerId, status: 'reserved' } })
        || await tx.coinTournamentEntry.count({ where: { playerId: target.playerId, status: { in: ['registered', 'active'] } } })
        || await tx.payment.count({ where: { order: { playerId: target.playerId } } })) throw Error('economy_changed_during_erasure');

      const identifiers = [target.userId, target.playerId, currentUser?.email || '', currentUser?.image || '', currentPlayer.legacyUserId || '', currentPlayer.avatarUrl || ''].filter(Boolean);
      const references = (value: unknown) => identifiers.some(id => JSON.stringify(value ?? '').includes(id));
      const scrub = (value: unknown) => redactReferences(value, [...identifiers, currentUser?.name || '', currentPlayer.displayName].filter(s => s.length >= 3));
      const ownParticipants = await tx.matchParticipant.findMany({ where: { playerId: target.playerId }, select: { matchId: true } });
      await tx.matchParticipant.updateMany({ where: { playerId: target.playerId }, data: { displayNameSnapshot: '—', winnerKey: null, playerId: null } });
      // Other participants can also carry the winner's identity, even when the
      // deleted player is no longer linked to that historical match.
      const sharedParticipants = await tx.matchParticipant.findMany({ where: { OR: identifiers.map(id => ({ winnerKey: { contains: id } })) } });
      for (const participant of sharedParticipants) if (references(participant.winnerKey)) await tx.matchParticipant.update({ where: { id: participant.id }, data: { winnerKey: 'deleted-player' } });
      const matches = await tx.match.findMany({ where: { OR: [{ id: { in: ownParticipants.map(p => p.matchId) } }, ...identifiers.map(id => ({ winnerKey: { contains: id } }))] } });
      for (const match of matches) if (references(match.winnerKey)) await tx.match.update({ where: { id: match.id }, data: { winnerKey: 'deleted-player' } });

      // These rows belong to other players and survive cascades. Redact identifying
      // payload/notes only: their balances, reserves, ledger keys and amounts stay.
      const ledger = await tx.coinLedgerEntry.findMany({ where: { playerId: { not: target.playerId } } });
      for (const entry of ledger) if (references([entry.payloadJson, entry.note, entry.referenceId, entry.createdByUserId])) {
        await tx.coinLedgerEntry.update({ where: { id: entry.id }, data: {
          note: entry.note ? String(scrub(entry.note)) : null,
          payloadJson: entry.payloadJson == null ? Prisma.JsonNull : scrub(entry.payloadJson) as Prisma.InputJsonValue,
          createdByUserId: entry.createdByUserId === target.userId ? null : entry.createdByUserId
        } });
      }
      const inbox = await tx.inboxMessage.findMany({ where: { playerId: { not: target.playerId } } });
      for (const entry of inbox) if (references([entry.payloadJson, entry.rewardJson, entry.title, entry.body])) await tx.inboxMessage.update({ where: { id: entry.id }, data: {
        title: String(scrub(entry.title)), body: entry.body == null ? null : String(scrub(entry.body)),
        payloadJson: entry.payloadJson == null ? Prisma.JsonNull : scrub(entry.payloadJson) as Prisma.InputJsonValue,
        rewardJson: entry.rewardJson == null ? Prisma.JsonNull : scrub(entry.rewardJson) as Prisma.InputJsonValue
      } });
      const audit = await tx.systemAuditLog.findMany();
      for (const entry of audit) if (entry.actorUserId === target.userId || entry.actorPlayerId === target.playerId || references([entry.entityId, entry.payloadJson])) await tx.systemAuditLog.update({ where: { id: entry.id }, data: {
        actorUserId: entry.actorUserId === target.userId ? null : entry.actorUserId,
        actorPlayerId: entry.actorPlayerId === target.playerId ? null : entry.actorPlayerId,
        entityId: String(scrub(entry.entityId)), payloadJson: entry.payloadJson == null ? Prisma.JsonNull : scrub(entry.payloadJson) as Prisma.InputJsonValue
      } });
      const paymentEvents = await tx.paymentEvent.findMany();
      for (const event of paymentEvents) if (references(event.payloadJson)) await tx.paymentEvent.update({ where: { id: event.id }, data: { payloadJson: scrub(event.payloadJson) as Prisma.InputJsonValue } });
      await tx.feedback.deleteMany({ where: { OR: [{ playerId: target.playerId }, ...(currentUser?.email ? [{ contactEmail: currentUser.email }] : [])] } });
      await tx.verification.deleteMany({ where: { OR: [{ identifier: { in: identifiers } }, { value: { in: identifiers } }] } });
      // Delete Player explicitly: User->Player is SetNull, which is not erasure.
      // Its cascades cover private messages/threads, friends, invites, push tokens,
      // wallet/own ledger/claims, inventory, orders and the disabled review attempts.
      await tx.player.delete({ where: { id: target.playerId } });
      await tx.user.deleteMany({ where: { id: target.userId } });
    }, { timeout: 60000 });
    return { completed: true, restoreMarkerDurable: true };
  }
  async forgetRestoreMarker(requestId: string, now: Date) { await this.stores.forgetAfterBackupsExpire(requestId, now); }
}
