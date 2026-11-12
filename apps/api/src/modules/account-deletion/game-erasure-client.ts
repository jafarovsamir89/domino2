import { randomBytes } from 'node:crypto';
import { signDominoPayload, verifyDominoPayload } from '../security/domino-proof.js';
import { DELETION_WAIT_MS, type GameErasureTarget } from './account-deletion.service.js';
import type { AccountErasureJournal } from './restore-journal.js';

export type GameErasureReceipt = {
  gameStateErased: true;
  pendingSettlements: 0;
  cleanedSnapshots: number;
  removedPresence: number;
};

/** Signed, bounded call to the game process. No public account or room data is
 * returned; outages and invalid signatures stop erasure instead of assuming empty stores.
 */
export class GameErasureClient {
  constructor(
    private journal: Pick<AccountErasureJournal, 'ensure'>,
    private endpoint = process.env.DOMINO_GAME_ERASURE_URL || '',
    private request: typeof fetch = fetch,
    private clock: () => number = Date.now
  ) {}

  private url() {
    let parsed: URL;
    try { parsed = new URL(this.endpoint); } catch { throw new Error('game_erasure_endpoint_unavailable'); }
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
    if (parsed.username || parsed.password || parsed.search || parsed.hash || !['', '/'].includes(parsed.pathname)
      || parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && loopback)
      || process.env.NODE_ENV === 'production' && parsed.protocol !== 'https:') {
      throw new Error('invalid_game_erasure_endpoint');
    }
    return new URL('/internal/account-erasure/prepare', parsed.origin).toString();
  }

  async prepare(target: GameErasureTarget, now: Date): Promise<GameErasureReceipt> {
    const url = this.url();
    if (!target || !/^[a-zA-Z0-9_-]{12,128}$/.test(target.requestId)
      || typeof target.userId !== 'string' || !target.userId || target.userId.length > 256
      || typeof target.playerId !== 'string' || !target.playerId || target.playerId.length > 256
      || !(target.requestedAt instanceof Date) || !Number.isFinite(target.requestedAt.getTime())
      || !(target.deleteAfter instanceof Date) || !Number.isFinite(target.deleteAfter.getTime())
      || !Array.isArray(target.relatedMatchIds) || target.relatedMatchIds.length > 10000
      || target.relatedMatchIds.some(id => typeof id !== 'string' || !id || id.length > 256)
      || !(now instanceof Date) || !Number.isFinite(now.getTime())) {
      throw new Error('invalid_game_erasure_target');
    }
    if (target.deleteAfter.getTime() !== target.requestedAt.getTime() + DELETION_WAIT_MS || now < target.deleteAfter) {
      throw new Error('account_erasure_not_due');
    }
    if (!this.journal || typeof this.journal.ensure !== 'function') throw new Error('restore_marker_adapter_required');
    this.journal.ensure(target);
    const body = {
      integrityScope: 'account.deletion.prepare',
      requestId: target.requestId,
      userId: target.userId,
      playerId: target.playerId,
      requestedAt: target.requestedAt.toISOString(),
      deleteAfter: target.deleteAfter.toISOString(),
      relatedMatchIds: Array.from(new Set(target.relatedMatchIds)),
      issuedAt: this.clock(),
      nonce: randomBytes(16).toString('hex')
    };
    const signedBody = { ...body, proof: signDominoPayload(body) };
    let response: Response;
    try {
      response = await this.request(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(signedBody),
        signal: AbortSignal.timeout(5000)
      });
    } catch {
      throw new Error('game_erasure_endpoint_unavailable');
    }
    if (!response.ok || !String(response.headers.get('content-type') || '').toLowerCase().includes('application/json')) {
      throw new Error('game_erasure_endpoint_blocked');
    }
    let result: Record<string, unknown>;
    try { result = await response.json() as Record<string, unknown>; }
    catch { throw new Error('invalid_game_erasure_receipt'); }
    const { proof, ...payload } = result;
    if (!verifyDominoPayload(payload, typeof proof === 'string' ? proof : '')
      || payload.integrityScope !== 'account.deletion.prepare.result'
      || payload.requestId !== target.requestId || payload.nonce !== body.nonce
      || payload.gameStateErased !== true || payload.pendingSettlements !== 0
      || !Number.isSafeInteger(payload.cleanedSnapshots) || Number(payload.cleanedSnapshots) < 0
      || !Number.isSafeInteger(payload.removedPresence) || Number(payload.removedPresence) < 0) {
      throw new Error('invalid_game_erasure_receipt');
    }
    return {
      gameStateErased: true,
      pendingSettlements: 0,
      cleanedSnapshots: Number(payload.cleanedSnapshots),
      removedPresence: Number(payload.removedPresence)
    };
  }
}
