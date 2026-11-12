import type { IncomingHttpHeaders } from 'node:http';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { BadRequestException, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import type { Prisma, PrismaClient } from '@prisma/client';
import type { AuthService } from '../auth/auth.service.js';
import { verifyGameToken } from '../auth/game-token.js';
import { getBetterAuthConfig } from '../auth/better-auth.config.js';

export const DELETION_WAIT_MS = 30 * 86400000;
export const DELETION_BACKUP_MS = 30 * 86400000;
const RECENT_LOGIN_MS = 10 * 60000;
type Options = { enabled: boolean; trustedOrigins: readonly string[] };
type Identity = { userId: string; playerId: string; sessionId: string; sessionCreatedAt: Date; deletionVersion: number; accountLabel: string };
export type ErasureTarget = { requestId: string; userId: string; playerId: string; requestedAt: Date; deleteAfter: Date };
export type GameErasureTarget = ErasureTarget & { relatedMatchIds: string[] };
export type ErasureExecutor = {
  // Must durably erase the approved surfaces and retain a restore marker outside
  // the restored DB. No default/no-op executor: unavailable surfaces block completion.
  erase(target: ErasureTarget, now: Date): Promise<{ completed: true; restoreMarkerDurable: true }>;
  forgetRestoreMarker(requestId: string, now: Date): Promise<void>;
};

/** Scheduling and cancellation use real credentials, not a client-supplied target.
 * The worker is explicit: production must supply the reviewed full erasure executor.
 */
export class AccountDeletionService {
  constructor(private db: PrismaClient, private auth: Pick<AuthService, 'getSession'>, private options: Options) {}
  capabilities() { return { available: this.options.enabled === true, policyVersion: 'owner30_v1', confirmation: 'session-version-v1', waitingDays: 30, backupDaysAfterDeletion: 30, cancellation: 'explicit' }; }
  private enabled() { if (!this.options.enabled) throw new ForbiddenException('account_deletion_unavailable'); }
  private async identity(headers: IncomingHttpHeaders, write: boolean, now: Date): Promise<Identity> {
    this.enabled();
    if (!Number.isFinite(now.getTime())) throw new BadRequestException('invalid_time');
    const { authorization, cookie, origin } = headers;
    if (authorization !== undefined && (typeof authorization !== 'string' || !/^Bearer [^\s,]+$/i.test(authorization) || authorization.length > 8192)) throw new UnauthorizedException();
    if (cookie !== undefined && (typeof cookie !== 'string' || cookie.length > 8192)) throw new UnauthorizedException();
    if (write && cookie && (!origin || !this.options.trustedOrigins.includes(origin))) throw new ForbiddenException('untrusted_origin');
    if (!authorization && !cookie) throw new UnauthorizedException();
    const token = authorization?.slice(7), claims = token ? verifyGameToken(token) : null;
    let userId: string | undefined, sessionId: string | undefined, claimedPlayerId: string | undefined;
    if (claims) {
      if (token!.split('.').length !== 2 || claims.provider !== 'better-auth') throw new UnauthorizedException();
      userId = claims.userId; sessionId = claims.sessionId; claimedPlayerId = claims.playerId;
    } else {
      const session = await this.auth.getSession(authorization ? { authorization } : { cookie });
      userId = session?.user?.id; sessionId = session?.session?.id;
    }
    if (!userId || !sessionId) throw new UnauthorizedException();
    const [session, user, player] = await Promise.all([
      this.db.session.findUnique({ where: { id: sessionId } }),
      this.db.user.findUnique({ where: { id: userId }, select: { id: true, role: true, email: true } }),
      this.db.player.findUnique({ where: { userId }, select: { id: true, userId: true, deletionVersion: true } })
    ]);
    if (!session || session.userId !== userId || session.expiresAt <= now || !user || !player || claimedPlayerId && claimedPlayerId !== player.id) throw new UnauthorizedException();
    // Staff accounts need a separate role-transfer/audit-preservation process.
    if (user.role && user.role !== 'player') throw new ForbiddenException('staff_account_requires_operator');
    return { userId, playerId: player.id, sessionId, sessionCreatedAt: session.createdAt, deletionVersion: player.deletionVersion, accountLabel: user.email };
  }
  private recent(identity: Identity, now: Date) {
    const age = now.getTime() - identity.sessionCreatedAt.getTime();
    if (age < 0 || age > RECENT_LOGIN_MS) throw new ForbiddenException('recent_login_required');
  }
  private confirmation(identity: Identity, action: string, timestamp: number) {
    const payload = JSON.stringify(['account.deletion', action, identity.userId, identity.sessionId, identity.deletionVersion, timestamp]);
    return `${timestamp}.${createHmac('sha256', getBetterAuthConfig().secret).update(payload).digest('base64url')}`;
  }
  private confirmBody(body: unknown, identity: Identity, action: 'request' | 'cancel', now: Date) {
    if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length !== 2) throw new BadRequestException('explicit_confirmation_required');
    const value = body as Record<string, unknown>, expected = action === 'request' ? 'DELETE' : 'CANCEL_DELETION';
    if (value.confirm !== expected || typeof value.confirmationToken !== 'string' || !/^\d{13}\.[A-Za-z0-9_-]{43}$/.test(value.confirmationToken)) throw new BadRequestException('explicit_confirmation_required');
    const timestamp = Number(value.confirmationToken.split('.')[0]), age = now.getTime() - timestamp;
    if (age < 0 || age > RECENT_LOGIN_MS) throw new ForbiddenException('confirmation_expired');
    const supplied = Buffer.from(value.confirmationToken), valid = Buffer.from(this.confirmation(identity, action, timestamp));
    if (supplied.length !== valid.length || !timingSafeEqual(supplied, valid)) throw new ForbiddenException('account_changed_refresh_required');
  }
  private async lock(tx: Prisma.TransactionClient, identity: Pick<Identity, 'userId' | 'playerId'>) {
    // Same economy lock as daily grants; revoke and marker change commit together.
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(1464091702, hashtext(${identity.playerId}))`;
    const player = await tx.player.findUnique({ where: { id: identity.playerId } });
    if (!player || player.userId !== identity.userId) throw new UnauthorizedException();
    if ('deletionVersion' in identity && player.deletionVersion !== (identity as Identity).deletionVersion) throw new ForbiddenException('account_changed_refresh_required');
    return player;
  }
  private view(row: { id: string; requestedAt: Date; deleteAfter: Date; state: string } | null) {
    return row ? { state: row.state, requestId: row.id, requestedAt: row.requestedAt.toISOString(), deleteAfter: row.deleteAfter.toISOString() }
      : { state: 'none', canCancel: false };
  }
  async status(headers: IncomingHttpHeaders, now = new Date()) {
    const identity = await this.identity(headers, false, now);
    const row = await this.db.accountDeletion.findUnique({ where: { userId: identity.userId } });
    return { ...this.view(row), accountLabel: identity.accountLabel, confirmationToken: this.confirmation(identity, 'request', now.getTime()), cancelConfirmationToken: this.confirmation(identity, 'cancel', now.getTime()), canCancel: Boolean(row?.state === 'pending' && row.deleteAfter > now) };
  }
  async request(headers: IncomingHttpHeaders, body: unknown, now = new Date()) {
    const identity = await this.identity(headers, true, now); this.recent(identity, now); this.confirmBody(body, identity, 'request', now);
    const row = await this.db.$transaction(async tx => {
      await this.lock(tx, identity);
      const session = await tx.session.findUnique({ where: { id: identity.sessionId } });
      if (!session || session.userId !== identity.userId || session.expiresAt <= now) throw new UnauthorizedException();
      const existing = await tx.accountDeletion.findUnique({ where: { userId: identity.userId } });
      if (existing) return existing; // Retry/login never extends the original deadline.
      const created = await tx.accountDeletion.create({ data: { userId: identity.userId, playerId: identity.playerId, requestedAt: now, deleteAfter: new Date(now.getTime() + DELETION_WAIT_MS) } });
      await tx.player.update({ where: { id: identity.playerId }, data: { deletionRequestedAt: now, deletionVersion: { increment: 1 } } });
      await tx.session.deleteMany({ where: { userId: identity.userId } });
      return created;
    });
    return { ...this.view(row), accountLabel: identity.accountLabel, canCancel: false }; // All sessions were revoked; fresh login is needed for cancellation.
  }
  async cancel(headers: IncomingHttpHeaders, body: unknown, now = new Date()) {
    const identity = await this.identity(headers, true, now); this.recent(identity, now); this.confirmBody(body, identity, 'cancel', now);
    await this.db.$transaction(async tx => {
      await this.lock(tx, identity);
      const session = await tx.session.findUnique({ where: { id: identity.sessionId } });
      if (!session || session.userId !== identity.userId || session.expiresAt <= now) throw new UnauthorizedException();
      const existing = await tx.accountDeletion.findUnique({ where: { userId: identity.userId } });
      if (!existing) return;
      if (existing.state !== 'pending' || existing.deleteAfter <= now) throw new ForbiddenException('deletion_already_due');
      await tx.accountDeletion.delete({ where: { id: existing.id } });
      await tx.player.update({ where: { id: identity.playerId }, data: { deletionRequestedAt: null, deletionVersion: { increment: 1 } } });
      // Fresh login proves ownership; normal login itself never clears this marker.
    });
    return { state: 'none', canCancel: false };
  }
  async processDue(executor: ErasureExecutor, now = new Date(), limit = 10) {
    this.enabled();
    if (!executor?.erase || !executor?.forgetRestoreMarker || !Number.isFinite(now.getTime())) throw new Error('complete_erasure_executor_required');
    const rows = await this.db.accountDeletion.findMany({ where: { state: { in: ['pending', 'erasing'] }, deleteAfter: { lte: now } }, orderBy: { deleteAfter: 'asc' }, take: Math.max(1, Math.min(100, Math.trunc(limit) || 10)) });
    const result = { completed: 0, blocked: 0, forgotten: 0 };
    for (const row of rows) {
      if (!row.userId || !row.playerId) { result.blocked++; continue; }
      try {
        const target: ErasureTarget = { requestId: row.id, userId: row.userId, playerId: row.playerId, requestedAt: row.requestedAt, deleteAfter: row.deleteAfter };
        await this.db.$transaction(async tx => {
          await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(1464091702, hashtext(${target.playerId}))`;
          const current = await tx.accountDeletion.findUnique({ where: { id: row.id } });
          if (!current || !['pending', 'erasing'].includes(current.state) || current.deleteAfter > now) throw Error('request_changed');
          await tx.accountDeletion.update({ where: { id: row.id }, data: { state: 'erasing' } });
        });
        const receipt = await executor.erase(target, now);
        if (receipt?.completed !== true || receipt.restoreMarkerDurable !== true) throw Error('incomplete_erasure');
        // Executor retries are idempotent. A crash before this receipt never claims success.
        await this.db.accountDeletion.update({ where: { id: row.id }, data: { state: 'completed', userId: null, playerId: null, finalizedAt: now, forgetAfter: new Date(row.deleteAfter.getTime() + DELETION_BACKUP_MS) } });
        result.completed++;
      } catch { result.blocked++; } // No PII/credentials/provider payloads in worker logs.
    }
    const expired = await this.db.accountDeletion.findMany({ where: { state: 'completed', forgetAfter: { lte: now } }, take: 100 });
    for (const row of expired) {
      try {
        await executor.forgetRestoreMarker(row.id, now);
        await this.db.accountDeletion.delete({ where: { id: row.id } });
        result.forgotten++;
      } catch { result.blocked++; }
    }
    return result;
  }
}
