import type { IncomingHttpHeaders } from "node:http";
import { EventEmitter } from "node:events";
import { Observable, Subject } from "rxjs";

import { BadRequestException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import type { MessageEvent } from "@nestjs/common";
import { Prisma, type CoinLedgerType } from "@prisma/client";

import { AuthService } from "../auth/auth.service.js";
import { PrismaService } from "../prisma/prisma.service.js";

type PlayerSummary = {
  id: string;
  displayName: string;
  avatarSeed: string | null;
  avatarUrl: string | null;
  isGuest: boolean;
  createdAt?: Date | string | null;
};

type FriendRow = {
  id: string;
  status: string;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  respondedAt: string | null;
  relation: "incoming" | "outgoing" | "accepted";
  friend: PlayerSummary;
};

type RoomInviteRow = {
  id: string;
  status: string;
  roomId: string;
  roomCode: string | null;
  roomMode: string;
  stakeKey: string | null;
  stakeAmount: number;
  humanSeats: number;
  totalPlayers: number;
  isTeamMode: boolean;
  note: string | null;
  createdAt: string;
  updatedAt: string;
  respondedAt: string | null;
  expiresAt: string | null;
  inviter: PlayerSummary;
  invitee: PlayerSummary;
};

type PlayInviteRow = {
  id: string;
  roomId: string | null;
  roomCode: string | null;
  status: string;
  kind: "play";
  note: string | null;
  createdAt: string;
  updatedAt: string;
  respondedAt: string | null;
  expiresAt: string | null;
  inviter: PlayerSummary;
  invitee: PlayerSummary;
};

type GiftCatalogRow = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  assetKey: string;
  coinCost: number;
  exchangeRateBps: number;
  rarity: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type GiftInventoryRow = {
  id: string;
  playerId: string;
  giftCatalogId: string;
  quantity: number;
  receivedCount: number;
  sentCount: number;
  exchangedCount: number;
  lastReceivedAt: Date | null;
  lastSentAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  catalog: GiftCatalogRow;
};

type GiftTransactionRow = {
  id: string;
  senderPlayerId: string;
  recipientPlayerId: string;
  giftCatalogId: string;
  giftKeySnapshot: string;
  giftNameSnapshot: string;
  assetKeySnapshot: string;
  coinCost: number;
  exchangeValue: number;
  contextType: string;
  contextId: string | null;
  note: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  sender: PlayerSummary;
  recipient: PlayerSummary;
};

type DirectMessageRow = {
  id: string;
  senderPlayerId: string;
  receiverPlayerId: string;
  text: string;
  createdAt: Date;
  readAt: Date | null;
  sender: PlayerSummary;
  receiver: PlayerSummary;
};

type MessageThreadRow = {
  player: PlayerSummary;
  lastMessage: any;
  unreadCount: number;
  messageCount: number;
};

type InboxMessageRow = {
  id: string;
  playerId: string;
  type: string;
  title: string;
  body: string | null;
  status: string;
  payloadJson: Prisma.JsonValue | null;
  rewardJson: Prisma.JsonValue | null;
  createdAt: Date;
  readAt: Date | null;
  claimedAt: Date | null;
  expiresAt: Date | null;
};

type SocialSummaryRow = {
  inboxUnreadCount: number;
  chatUnreadCount: number;
  inviteUnreadCount: number;
  friendRequestCount: number;
  totalUnreadCount: number;
};

type SocialLiveEvent = {
  playerId: string;
  type: string;
  data: any;
};

type SocialRealtimeEmitOptions = {
  emitEvents?: boolean;
};

const DEFAULT_GIFT_CATALOG = [
  { key: "gift_001", name: "Gift 001", assetKey: "gift_001", rarity: "common", sortOrder: 1 },
  { key: "gift_002", name: "Gift 002", assetKey: "gift_002", rarity: "common", sortOrder: 2 },
  { key: "gift_003", name: "Gift 003", assetKey: "gift_003", rarity: "common", sortOrder: 3 },
  { key: "gift_004", name: "Gift 004", assetKey: "gift_004", rarity: "common", sortOrder: 4 },
  { key: "gift_005", name: "Gift 005", assetKey: "gift_005", rarity: "common", sortOrder: 5 },
  { key: "gift_006", name: "Gift 006", assetKey: "gift_006", rarity: "common", sortOrder: 6 },
  { key: "gift_007", name: "Gift 007", assetKey: "gift_007", rarity: "rare", sortOrder: 7 },
  { key: "gift_008", name: "Gift 008", assetKey: "gift_008", rarity: "rare", sortOrder: 8 },
  { key: "gift_009", name: "Gift 009", assetKey: "gift_009", rarity: "rare", sortOrder: 9 },
  { key: "gift_010", name: "Gift 010", assetKey: "gift_010", rarity: "rare", sortOrder: 10 },
  { key: "gift_011", name: "Gift 011", assetKey: "gift_011", rarity: "epic", sortOrder: 11 },
  { key: "gift_012", name: "Gift 012", assetKey: "gift_012", rarity: "epic", sortOrder: 12 }
] as const;

@Injectable()
export class SocialService {
  private readonly sseEmitter = new EventEmitter();
  private readonly liveEmitter = new EventEmitter();
  private readonly socialRateLimits = {
    directMessage: new Map<string, number[]>(),
    friendRequest: new Map<string, number[]>(),
    roomInvite: new Map<string, number[]>(),
    playInvite: new Map<string, number[]>()
  };

  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService
  ) {
    // Run initial sweep
    this.purgeExpiredSocialData().catch((err) => {
      console.error("[SocialService] Initial purge sweep error:", err);
    });

    // Schedule hourly sweep
    const intervalId = setInterval(() => {
      this.purgeExpiredSocialData().catch((err) => {
        console.error("[SocialService] Scheduled purge sweep error:", err);
      });
    }, 1000 * 60 * 60);

    // Call unref so Node event loop doesn't hang in tests or during shutdown
    if (typeof intervalId.unref === "function") {
      intervalId.unref();
    }
  }

  subscribeToLiveEvents(listener: (event: SocialLiveEvent) => void) {
    this.liveEmitter.on("event", listener);
    return () => {
      this.liveEmitter.off("event", listener);
    };
  }

  private emitSseEvent(playerId: string, type: string, data: any) {
    const payload: SocialLiveEvent = {
      playerId: String(playerId || "").trim(),
      type,
      data
    };
    this.sseEmitter.emit(`player:${playerId}`, { type, data });
    this.liveEmitter.emit("event", payload);
  }

  subscribeToSocialEvents(headers: IncomingHttpHeaders): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      let active = true;
      let listener: ((event: { type: string; data: any }) => void) | null = null;
      let eventName = "";
      let heartbeat: NodeJS.Timeout | null = null;

      const cleanup = () => {
        if (listener && eventName) {
          this.sseEmitter.off(eventName, listener);
        }
        listener = null;
        eventName = "";
        if (heartbeat) {
          clearInterval(heartbeat);
          heartbeat = null;
        }
      };

      this.getCurrentPlayer(headers)
        .then((player) => {
          if (!active) return;
          const playerId = player.id;
          eventName = `player:${playerId}`;

          listener = (event: { type: string; data: any }) => {
            subscriber.next({
              data: event.data,
              type: event.type
            });
          };

          this.sseEmitter.on(eventName, listener);

          // Send initial connection event
          subscriber.next({ data: { status: "connected" }, type: "connection" });

          heartbeat = setInterval(() => {
            if (!active) return;
            subscriber.next({
              data: { ts: Date.now() },
              type: "heartbeat"
            });
          }, 20000);

          if (typeof heartbeat.unref === "function") {
            heartbeat.unref();
          }
        })
        .catch((err) => {
          active = false;
          cleanup();
          subscriber.error(err);
        });

      return () => {
        active = false;
        cleanup();
      };
    });
  }

  async purgeExpiredSocialData() {
    try {
      if (!this.prisma?.roomInvitation?.deleteMany || !this.prisma?.playInvite?.deleteMany || !this.prisma?.inboxMessage?.deleteMany) {
        return;
      }
      const now = new Date();
      const threeDaysAgo = new Date(now.getTime() - 1000 * 60 * 60 * 24 * 3);
      const sevenDaysAgo = new Date(now.getTime() - 1000 * 60 * 60 * 24 * 7);

      const invitePurgeResult = await this.prisma.roomInvitation.deleteMany({
        where: {
          status: { in: ["expired", "declined", "revoked"] },
          updatedAt: { lt: threeDaysAgo }
        }
      });

      const playInvitePurgeResult = await this.prisma.playInvite.deleteMany({
        where: {
          status: { in: ["expired", "declined", "cancelled"] },
          updatedAt: { lt: threeDaysAgo }
        }
      });

      const inboxPurgeResult = await this.prisma.inboxMessage.deleteMany({
        where: {
          status: { in: ["read", "claimed", "deleted"] },
          createdAt: { lt: sevenDaysAgo }
        }
      });

      const hiddenThreadPurgeResult = await this.prisma.inboxMessage.deleteMany({
        where: {
          type: "direct_message_thread_hidden",
          createdAt: { lt: new Date(now.getTime() - 1000 * 60 * 60 * 24 * 30) }
        }
      });

      console.log(`[SocialService Purge] Purged ${invitePurgeResult.count} room invitations, ${playInvitePurgeResult.count} play invites, ${inboxPurgeResult.count} inbox notifications and ${hiddenThreadPurgeResult.count} hidden chat markers.`);
    } catch (error) {
      console.error("[SocialService Purge] Error running hourly sweep:", error);
    }
  }

  private async getCurrentPlayer(headers: IncomingHttpHeaders) {
    const profile = await this.authService.getCurrentProfile(headers);
    if (!profile?.player?.id) {
      throw new UnauthorizedException("Sign in required");
    }

    return profile.player;
  }

  private async getInboxMessageForCurrentPlayer(headers: IncomingHttpHeaders, id: string) {
    const currentPlayer = await this.getCurrentPlayer(headers);
    const messageId = String(id || "").trim();
    if (!messageId) {
      throw new NotFoundException("Inbox message not found");
    }

    const row = await this.prisma.inboxMessage.findUnique({
      where: { id: messageId }
    });
    if (!row || row.playerId !== currentPlayer.id) {
      throw new NotFoundException("Inbox message not found");
    }

    return { currentPlayer, row };
  }

  private playerSelect() {
    return {
      id: true,
      displayName: true,
      avatarSeed: true,
      avatarUrl: true,
      isGuest: true,
      createdAt: true
    } as const;
  }

  private playerProfileSelect() {
    return {
      id: true,
      displayName: true,
      avatarSeed: true,
      avatarUrl: true,
      isGuest: true,
      createdAt: true,
      stats: {
        select: {
          rating: true,
          matchesPlayed: true,
          wins: true,
          losses: true
        }
      }
    } as const;
  }

  private summarizePlayer(player: { id: string; displayName: string; avatarSeed?: string | null; avatarUrl?: string | null; isGuest?: boolean; createdAt?: Date | string | null }): PlayerSummary {
    return {
      id: player.id,
      displayName: player.displayName,
      avatarSeed: player.avatarSeed ?? null,
      avatarUrl: player.avatarUrl ?? null,
      isGuest: Boolean(player.isGuest),
      createdAt: player.createdAt ?? null
    };
  }

  private giftCostBps(exchangeRateBps: number) {
    const rate = Math.max(0, Math.min(10_000, Math.trunc(exchangeRateBps || 0)));
    return rate || 7_000;
  }

  private giftExchangeValue(coinCost: number, exchangeRateBps: number) {
    return Math.max(0, Math.floor((Math.max(0, Math.trunc(coinCost)) * this.giftCostBps(exchangeRateBps)) / 10_000));
  }

  private isUniqueConstraintError(error: unknown) {
    return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "P2002");
  }

  private enforceRateLimit(bucket: Map<string, number[]>, key: string, limit: number, windowMs: number) {
    const cleanKey = String(key || "").trim();
    if (!cleanKey) return;
    const now = Date.now();
    const values = Array.isArray(bucket.get(cleanKey)) ? bucket.get(cleanKey)! : [];
    const nextValues = values.filter((ts) => Number(ts || 0) > now - windowMs);
    if (nextValues.length >= limit) {
      throw new BadRequestException("Too many requests");
    }
    nextValues.push(now);
    bucket.set(cleanKey, nextValues);
  }

  private async clearHiddenDirectMessageThreadMarkers(playerIds: string[], relatedPlayerId: string) {
    const cleanRelatedPlayerId = String(relatedPlayerId || "").trim();
    const cleanPlayerIds = Array.from(new Set((Array.isArray(playerIds) ? playerIds : []).map((value) => String(value || "").trim()).filter(Boolean)));
    if (!cleanRelatedPlayerId || !cleanPlayerIds.length) return 0;

    const rows = await this.prisma.inboxMessage.findMany({
      where: {
        playerId: { in: cleanPlayerIds },
        type: "direct_message_thread_hidden"
      },
      select: {
        id: true,
        payloadJson: true
      }
    });

    const ids = rows
      .filter((row) => {
        const payload = row.payloadJson && typeof row.payloadJson === "object" && !Array.isArray(row.payloadJson)
          ? row.payloadJson as Record<string, unknown>
          : null;
        const hiddenPlayerId = String(payload?.relatedPlayerId || payload?.playerId || "").trim();
        return hiddenPlayerId === cleanRelatedPlayerId;
      })
      .map((row) => row.id);

    if (!ids.length) return 0;

    const result = await this.prisma.inboxMessage.deleteMany({
      where: {
        id: { in: ids }
      }
    });
    return result.count;
  }

  private giftSeedRows() {
    return DEFAULT_GIFT_CATALOG.map((gift) => ({
      key: gift.key,
      name: gift.name,
      description: `Gift asset ${gift.assetKey}`,
      assetKey: gift.assetKey,
      coinCost: 100,
      exchangeRateBps: 7000,
      rarity: gift.rarity,
      sortOrder: gift.sortOrder,
      isActive: true
    }));
  }

  private async ensureWallet(db: Prisma.TransactionClient | PrismaService, playerId: string) {
    return db.coinWallet.upsert({
      where: { playerId },
      update: {},
      create: { playerId }
    });
  }

  private async getLockedWallet(db: Prisma.TransactionClient | PrismaService, playerId: string) {
    await this.ensureWallet(db, playerId);
    const rows = await db.$queryRaw<Array<{
      id: string;
      playerId: string;
      balance: number;
      reserved: number;
      lifetimeEarned: number;
      lifetimeSpent: number;
    }>>(Prisma.sql`
      SELECT
        "id",
        "playerId",
        "balance",
        "reserved",
        "lifetimeEarned",
        "lifetimeSpent"
      FROM "CoinWallet"
      WHERE "playerId" = ${playerId}
      FOR UPDATE
    `);

    const wallet = rows[0];
    if (!wallet) {
      throw new BadRequestException("Wallet not found");
    }

    return wallet;
  }

  private async debitWallet(
    db: Prisma.TransactionClient | PrismaService,
    playerId: string,
    amount: number,
    type: CoinLedgerType,
    referenceType: string,
    referenceId: string,
    extras: { idempotencyKey?: string | null; note?: string | null; payloadJson?: Prisma.InputJsonValue; createdByUserId?: string | null } = {}
  ) {
    const nextAmount = Math.max(0, Math.trunc(amount));
    if (!nextAmount) {
      return this.ensureWallet(db, playerId);
    }

    const wallet = await this.getLockedWallet(db, playerId);
    if (wallet.balance < nextAmount) {
      throw new BadRequestException("Insufficient balance");
    }

    const updated = await db.coinWallet.update({
      where: { playerId },
      data: {
        balance: { decrement: nextAmount },
        lifetimeSpent: { increment: nextAmount }
      }
    });

    await db.coinLedgerEntry.create({
      data: {
        playerId,
        type,
        amount: -nextAmount,
        balanceBefore: wallet.balance,
        balanceAfter: updated.balance,
        reservedBefore: wallet.reserved,
        reservedAfter: updated.reserved,
        referenceType,
        referenceId,
        idempotencyKey: extras.idempotencyKey ?? undefined,
        note: extras.note ?? undefined,
        payloadJson: extras.payloadJson ?? undefined,
        createdByUserId: extras.createdByUserId ?? undefined
      }
    });

    return updated;
  }

  private async creditWallet(
    db: Prisma.TransactionClient | PrismaService,
    playerId: string,
    amount: number,
    type: CoinLedgerType,
    referenceType: string,
    referenceId: string,
    extras: { idempotencyKey?: string | null; note?: string | null; payloadJson?: Prisma.InputJsonValue; createdByUserId?: string | null } = {}
  ) {
    const nextAmount = Math.max(0, Math.trunc(amount));
    if (!nextAmount) {
      return this.ensureWallet(db, playerId);
    }

    const wallet = await this.getLockedWallet(db, playerId);
    const updated = await db.coinWallet.update({
      where: { playerId },
      data: {
        balance: { increment: nextAmount },
        lifetimeEarned: { increment: nextAmount }
      }
    });

    await db.coinLedgerEntry.create({
      data: {
        playerId,
        type,
        amount: nextAmount,
        balanceBefore: wallet.balance,
        balanceAfter: updated.balance,
        reservedBefore: wallet.reserved,
        reservedAfter: updated.reserved,
        referenceType,
        referenceId,
        idempotencyKey: extras.idempotencyKey ?? undefined,
        note: extras.note ?? undefined,
        payloadJson: extras.payloadJson ?? undefined,
        createdByUserId: extras.createdByUserId ?? undefined
      }
    });

    return updated;
  }

  private async ensureGiftCatalog(db: Prisma.TransactionClient | PrismaService = this.prisma) {
    for (const gift of this.giftSeedRows()) {
      await db.giftCatalog.upsert({
        where: { key: gift.key },
        update: {
          name: gift.name,
          description: gift.description,
          assetKey: gift.assetKey,
          coinCost: gift.coinCost,
          exchangeRateBps: gift.exchangeRateBps,
          rarity: gift.rarity,
          sortOrder: gift.sortOrder,
          isActive: true
        },
        create: gift
      });
    }
  }

  private async getGiftCatalogByKey(db: Prisma.TransactionClient | PrismaService, key: string) {
    return db.giftCatalog.findUnique({
      where: { key }
    });
  }

  private summarizeGiftCatalog(row: GiftCatalogRow) {
    return {
      id: row.id,
      key: row.key,
      name: row.name,
      description: row.description,
      assetKey: row.assetKey,
      coinCost: row.coinCost,
      exchangeRateBps: row.exchangeRateBps,
      exchangeValue: this.giftExchangeValue(row.coinCost, row.exchangeRateBps),
      rarity: row.rarity,
      sortOrder: row.sortOrder,
      isActive: row.isActive,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString()
    };
  }

  private summarizeGiftInventory(row: GiftInventoryRow) {
    return {
      id: row.id,
      playerId: row.playerId,
      giftCatalogId: row.giftCatalogId,
      quantity: row.quantity,
      receivedCount: row.receivedCount,
      sentCount: row.sentCount,
      exchangedCount: row.exchangedCount,
      lastReceivedAt: row.lastReceivedAt ? row.lastReceivedAt.toISOString() : null,
      lastSentAt: row.lastSentAt ? row.lastSentAt.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      catalog: this.summarizeGiftCatalog(row.catalog)
    };
  }

  private summarizeGiftTransaction(row: GiftTransactionRow) {
    return {
      id: row.id,
      senderPlayerId: row.senderPlayerId,
      recipientPlayerId: row.recipientPlayerId,
      giftCatalogId: row.giftCatalogId,
      giftKey: row.giftKeySnapshot,
      giftName: row.giftNameSnapshot,
      assetKey: row.assetKeySnapshot,
      coinCost: row.coinCost,
      exchangeValue: row.exchangeValue,
      contextType: row.contextType,
      contextId: row.contextId,
      note: row.note,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      sender: row.sender,
      recipient: row.recipient
    };
  }

  private summarizeDirectMessage(row: DirectMessageRow) {
    return {
      id: row.id,
      senderPlayerId: row.senderPlayerId,
      receiverPlayerId: row.receiverPlayerId,
      text: row.text,
      createdAt: row.createdAt.toISOString(),
      readAt: row.readAt ? row.readAt.toISOString() : null,
      sender: row.sender,
      receiver: row.receiver
    };
  }

  private summarizeInboxMessage(row: InboxMessageRow) {
    const payload = row.payloadJson && typeof row.payloadJson === "object" && !Array.isArray(row.payloadJson)
      ? row.payloadJson as Record<string, unknown>
      : null;
    const relatedPlayerId = typeof payload?.senderPlayerId === "string"
      ? String(payload.senderPlayerId || "").trim()
      : typeof payload?.relatedPlayerId === "string"
        ? String(payload.relatedPlayerId || "").trim()
        : typeof payload?.receiverPlayerId === "string"
          ? String(payload.receiverPlayerId || "").trim()
          : "";
    return {
      id: row.id,
      playerId: row.playerId,
      type: row.type,
      title: row.title,
      body: row.body ?? null,
      status: row.status,
      payloadJson: row.payloadJson ?? null,
      rewardJson: row.rewardJson ?? null,
      createdAt: row.createdAt.toISOString(),
      readAt: row.readAt ? row.readAt.toISOString() : null,
      claimedAt: row.claimedAt ? row.claimedAt.toISOString() : null,
      expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
      isUnread: row.status === "unread",
      isClaimable: this.isInboxClaimable(row),
      relatedPlayerId: relatedPlayerId || null,
      relatedMessageId: typeof payload?.messageId === "string" ? String(payload.messageId || "").trim() || null : null,
      threadKey: typeof payload?.threadKey === "string" ? String(payload.threadKey || "").trim() || null : null
    };
  }

  private async getHiddenDirectMessageThreadPlayerIds(headers: IncomingHttpHeaders) {
    const currentPlayer = await this.getCurrentPlayer(headers);
    const rows = await this.prisma.inboxMessage.findMany({
      where: {
        playerId: currentPlayer.id,
        type: "direct_message_thread_hidden"
      },
      select: {
        payloadJson: true
      }
    });
    const hiddenPlayerIds = new Set<string>();
    rows.forEach((row) => {
      const payload = row.payloadJson && typeof row.payloadJson === "object" && !Array.isArray(row.payloadJson)
        ? row.payloadJson as Record<string, unknown>
        : null;
      const relatedPlayerId = String(payload?.relatedPlayerId || payload?.playerId || "").trim();
      if (relatedPlayerId) hiddenPlayerIds.add(relatedPlayerId);
    });
    return { currentPlayer, hiddenPlayerIds };
  }

  private isInboxClaimable(row: Pick<InboxMessageRow, "type" | "rewardJson" | "status">) {
    if (row.status === "deleted" || row.status === "expired") {
      return false;
    }
    if (row.rewardJson && typeof row.rewardJson === "object") {
      return true;
    }
    return ["gift_received", "reward", "compensation", "daily_bonus", "tournament"].includes(String(row.type || ""));
  }

  private summarizeMessageThread(currentPlayerId: string, rows: DirectMessageRow[]): MessageThreadRow {
    const sortedRows = Array.isArray(rows) ? rows : [];
    const lastMessage = sortedRows[0];
    const partnerRow = lastMessage?.senderPlayerId === currentPlayerId ? lastMessage.receiver : lastMessage?.sender;
    return {
      player: this.summarizePlayer(partnerRow || { id: "", displayName: "Player", isGuest: false, avatarSeed: null, avatarUrl: null }),
      lastMessage: lastMessage ? this.summarizeDirectMessage(lastMessage) : null,
      unreadCount: sortedRows.filter((row) => row.receiverPlayerId === currentPlayerId && !row.readAt).length,
      messageCount: sortedRows.length
    };
  }

  private summarizeFriend(
    currentPlayerId: string,
    row: {
      id: string;
      requesterPlayerId: string;
      addresseePlayerId: string;
      status: string;
      note: string | null;
      createdAt: Date;
      updatedAt: Date;
      respondedAt: Date | null;
      requester: { id: string; displayName: string; avatarSeed: string | null; isGuest: boolean };
      addressee: { id: string; displayName: string; avatarSeed: string | null; isGuest: boolean };
    }
  ): FriendRow {
    const isRequester = row.requesterPlayerId === currentPlayerId;
    const friend = isRequester ? row.addressee : row.requester;
    const relation = row.status === "accepted"
      ? "accepted"
      : isRequester
        ? "outgoing"
        : "incoming";

    return {
      id: row.id,
      status: row.status,
      note: row.note ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      respondedAt: row.respondedAt ? row.respondedAt.toISOString() : null,
      relation,
      friend: this.summarizePlayer(friend)
    };
  }

  private summarizeInvite(
    row: {
      id: string;
      roomId: string;
      roomCode: string | null;
      roomMode: string;
      stakeKey: string | null;
      stakeAmount: number;
      humanSeats: number;
      totalPlayers: number;
      isTeamMode: boolean;
      status: string;
      note: string | null;
      createdAt: Date;
      updatedAt: Date;
      respondedAt: Date | null;
      expiresAt: Date | null;
      inviter: { id: string; displayName: string; avatarSeed: string | null; isGuest: boolean };
      invitee: { id: string; displayName: string; avatarSeed: string | null; isGuest: boolean };
    }
  ): RoomInviteRow {
    return {
      id: row.id,
      status: row.status,
      roomId: row.roomId,
      roomCode: row.roomCode,
      roomMode: row.roomMode,
      stakeKey: row.stakeKey ?? null,
      stakeAmount: row.stakeAmount,
      humanSeats: row.humanSeats,
      totalPlayers: row.totalPlayers,
      isTeamMode: row.isTeamMode,
      note: row.note ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      respondedAt: row.respondedAt ? row.respondedAt.toISOString() : null,
      expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
      inviter: this.summarizePlayer(row.inviter),
      invitee: this.summarizePlayer(row.invitee)
    };
  }

  private summarizePlayInvite(
    row: {
      id: string;
      roomId: string | null;
      roomCode: string | null;
      status: string;
      note: string | null;
      createdAt: Date;
      updatedAt: Date;
      respondedAt: Date | null;
      expiresAt: Date | null;
      inviter: { id: string; displayName: string; avatarSeed: string | null; isGuest: boolean };
      invitee: { id: string; displayName: string; avatarSeed: string | null; isGuest: boolean };
    }
  ): PlayInviteRow {
    return {
      id: row.id,
      roomId: row.roomId ? String(row.roomId).trim() : null,
      roomCode: row.roomCode ? String(row.roomCode).trim() : null,
      status: row.status,
      kind: "play",
      note: row.note ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      respondedAt: row.respondedAt ? row.respondedAt.toISOString() : null,
      expiresAt: row.expiresAt ? row.expiresAt.toISOString() : null,
      inviter: this.summarizePlayer(row.inviter),
      invitee: this.summarizePlayer(row.invitee)
    };
  }

  async getFriends(headers: IncomingHttpHeaders) {
    const currentPlayer = await this.getCurrentPlayer(headers);
    const currentPlayerId = currentPlayer.id;
    const rows = await this.prisma.friendConnection.findMany({
      where: {
        OR: [
          { requesterPlayerId: currentPlayerId },
          { addresseePlayerId: currentPlayerId }
        ]
      },
      include: {
        requester: { select: this.playerSelect() },
        addressee: { select: this.playerSelect() }
      },
      orderBy: [
        { updatedAt: "desc" },
        { createdAt: "desc" }
      ]
    });

    const accepted = rows
      .filter((row) => row.status === "accepted")
      .map((row) => this.summarizeFriend(currentPlayerId, row));
    const incoming = rows
      .filter((row) => row.status === "pending" && row.addresseePlayerId === currentPlayerId)
      .map((row) => this.summarizeFriend(currentPlayerId, row));
    const outgoing = rows
      .filter((row) => row.status === "pending" && row.requesterPlayerId === currentPlayerId)
      .map((row) => this.summarizeFriend(currentPlayerId, row));

    return {
      accepted,
      incoming,
      outgoing,
      items: rows.map((row) => this.summarizeFriend(currentPlayerId, row))
    };
  }

  async getInbox(
    headers: IncomingHttpHeaders,
    query: { status?: string | null; limit?: string | number | null } = {}
  ) {
    const currentPlayer = await this.getCurrentPlayer(headers);
    const status = String(query?.status || "").trim().toLowerCase();
    const limit = Math.max(1, Math.min(100, Math.trunc(Number(query?.limit ?? 30)) || 30));
    const where: Prisma.InboxMessageWhereInput = {
      playerId: currentPlayer.id,
      type: {
        not: "direct_message"
      }
    };
    if (status && status !== "all") {
      where.status = status;
    } else {
      where.status = {
        not: "deleted"
      };
    }

    const [rows, unreadCount] = await Promise.all([
      this.prisma.inboxMessage.findMany({
        where,
        orderBy: [{ createdAt: "desc" }],
        take: limit
      }),
      this.prisma.inboxMessage.count({
        where: {
          playerId: currentPlayer.id,
          status: "unread",
          type: {
            not: "direct_message"
          }
        }
      })
    ]);

    return {
      items: rows.map((row) => this.summarizeInboxMessage(row as unknown as InboxMessageRow)),
      unreadCount
    };
  }

  async markInboxRead(headers: IncomingHttpHeaders, id: string) {
    const { row } = await this.getInboxMessageForCurrentPlayer(headers, id);
    if (row.status === "deleted") {
      throw new NotFoundException("Inbox message not found");
    }
    if (row.status === "read" || row.status === "claimed" || row.status === "expired") {
      return { item: this.summarizeInboxMessage(row as InboxMessageRow) };
    }

    const updated = await this.prisma.inboxMessage.update({
      where: { id: row.id },
      data: {
        status: "read",
        readAt: row.readAt || new Date()
      }
    });

    if (row.type === "direct_message" && row.payloadJson && typeof row.payloadJson === "object" && !Array.isArray(row.payloadJson)) {
      const messageId = typeof (row.payloadJson as Record<string, unknown>).messageId === "string"
        ? String((row.payloadJson as Record<string, unknown>).messageId || "").trim()
        : "";
      if (messageId) {
        await this.prisma.directMessage.updateMany({
          where: {
            id: messageId,
            receiverPlayerId: updated.playerId,
            readAt: null
          },
          data: {
            readAt: new Date()
          }
        });
      }
    }

    return { item: this.summarizeInboxMessage(updated as unknown as InboxMessageRow) };
  }

  async markDirectMessageThreadRead(headers: IncomingHttpHeaders, playerId: string) {
    const currentPlayer = await this.getCurrentPlayer(headers);
    return this.markDirectMessageThreadReadForPlayer(currentPlayer, playerId);
  }

  async markDirectMessageThreadReadForPlayer(
    currentPlayer: { id: string; displayName?: string },
    playerId: string
  ) {
    const targetPlayerId = String(playerId || "").trim();
    if (!targetPlayerId || targetPlayerId === currentPlayer.id) {
      return { ok: true };
    }

    const now = new Date();
    await this.prisma.directMessage.updateMany({
      where: {
        OR: [
          {
            senderPlayerId: targetPlayerId,
            receiverPlayerId: currentPlayer.id
          },
          {
            senderPlayerId: currentPlayer.id,
            receiverPlayerId: targetPlayerId
          }
        ],
        readAt: null
      },
      data: {
        readAt: now
      }
    });

    return { ok: true };
  }

  async claimInboxMessage(headers: IncomingHttpHeaders, id: string) {
    const { row } = await this.getInboxMessageForCurrentPlayer(headers, id);
    if (row.status === "deleted") {
      throw new NotFoundException("Inbox message not found");
    }
    if (!this.isInboxClaimable(row as InboxMessageRow)) {
      return { ok: false, reason: "claim_not_available" };
    }
    if (row.status === "claimed") {
      return { item: this.summarizeInboxMessage(row as InboxMessageRow) };
    }

    const updated = await this.prisma.inboxMessage.update({
      where: { id: row.id },
      data: {
        status: "claimed",
        claimedAt: row.claimedAt || new Date(),
        readAt: row.readAt || new Date()
      }
    });

    return { item: this.summarizeInboxMessage(updated as unknown as InboxMessageRow) };
  }

  async deleteInboxMessage(headers: IncomingHttpHeaders, id: string) {
    const { row } = await this.getInboxMessageForCurrentPlayer(headers, id);
    if (row.status === "deleted") {
      return { item: this.summarizeInboxMessage(row as InboxMessageRow) };
    }

    const updated = await this.prisma.inboxMessage.update({
      where: { id: row.id },
      data: {
        status: "deleted",
        readAt: row.readAt || new Date()
      }
    });

    return { item: this.summarizeInboxMessage(updated as unknown as InboxMessageRow) };
  }

  async getSocialSummary(headers: IncomingHttpHeaders) {
    const { currentPlayer, hiddenPlayerIds } = await this.getHiddenDirectMessageThreadPlayerIds(headers);
    const [inboxUnreadCount, directMessageUnreadCount, roomInviteUnreadCount, playInviteUnreadCount, friendRequestCount] = await Promise.all([
      this.prisma.inboxMessage.count({
        where: {
          playerId: currentPlayer.id,
          status: "unread",
          type: {
            not: "direct_message"
          }
        }
      }),
      this.prisma.directMessage.count({
        where: {
          receiverPlayerId: currentPlayer.id,
          readAt: null,
          ...(hiddenPlayerIds.size
            ? {
              senderPlayerId: {
                notIn: Array.from(hiddenPlayerIds)
              }
            }
            : {})
        }
      }),
      this.prisma.roomInvitation.count({
        where: {
          inviteePlayerId: currentPlayer.id,
          status: "pending"
        }
      }),
      this.prisma.playInvite.count({
        where: {
          inviteePlayerId: currentPlayer.id,
          status: "pending"
        }
      }),
      this.prisma.friendConnection.count({
        where: {
          addresseePlayerId: currentPlayer.id,
          status: "pending"
        }
      })
    ]);

    return {
      inboxUnreadCount,
      chatUnreadCount: directMessageUnreadCount,
      inviteUnreadCount: roomInviteUnreadCount + playInviteUnreadCount,
      friendRequestCount,
      totalUnreadCount: inboxUnreadCount + directMessageUnreadCount + roomInviteUnreadCount + playInviteUnreadCount + friendRequestCount
    } satisfies SocialSummaryRow;
  }

  async searchPlayers(headers: IncomingHttpHeaders, query?: string) {
    const currentPlayer = await this.getCurrentPlayer(headers);
    const search = String(query || "").trim();
    if (!search) {
      return { items: [] };
    }

    const players = await this.prisma.player.findMany({
      where: {
        isGuest: false,
        displayName: {
          contains: search,
          mode: "insensitive"
        }
      },
      select: this.playerSelect(),
      orderBy: [
        { displayName: "asc" }
      ],
      take: 12
    });

    const playerIds = players.map((player) => String(player.id || "").trim()).filter(Boolean);
    const friendshipRows = playerIds.length
      ? await this.prisma.friendConnection.findMany({
          where: {
            OR: [
              {
                requesterPlayerId: currentPlayer.id,
                addresseePlayerId: { in: playerIds }
              },
              {
                requesterPlayerId: { in: playerIds },
                addresseePlayerId: currentPlayer.id
              }
            ]
          },
          select: {
            id: true,
            requesterPlayerId: true,
            addresseePlayerId: true,
            status: true
          }
        })
      : [];
    const friendshipByPlayerId = new Map<string, { id: string; requesterPlayerId: string; addresseePlayerId: string; status: string }>();
    friendshipRows.forEach((row) => {
      const partnerId = row.requesterPlayerId === currentPlayer.id ? row.addresseePlayerId : row.requesterPlayerId;
      if (partnerId) {
        friendshipByPlayerId.set(partnerId, row);
      }
    });

    return {
      items: players.map((player) => {
        const playerId = String(player.id || "").trim();
        const friendship = friendshipByPlayerId.get(playerId) || null;
        let friendshipStatus: "self" | "none" | "pending_incoming" | "pending_outgoing" | "accepted" = "none";
        if (playerId === currentPlayer.id) {
          friendshipStatus = "self";
        } else {
          if (friendship?.status === "accepted") {
            friendshipStatus = "accepted";
          } else if (friendship?.status === "pending") {
            friendshipStatus = friendship.requesterPlayerId === currentPlayer.id ? "pending_outgoing" : "pending_incoming";
          }
        }

        return {
          ...this.summarizePlayer(player),
          friendshipId: friendship?.id || null,
          friendshipStatus
        };
      })
    };
  }

  async getPlayerProfile(headers: IncomingHttpHeaders, id: string) {
    const currentPlayer = await this.getCurrentPlayer(headers);
    const playerId = String(id || "").trim();
    if (!playerId) {
      throw new NotFoundException("Player not found");
    }

    const player = await this.prisma.player.findFirst({
      where: {
        OR: [
          { id: playerId },
          { userId: playerId }
        ]
      },
      select: this.playerProfileSelect()
    });
    if (!player) {
      throw new NotFoundException("Player not found");
    }

    const stats = player.stats || { rating: 1000, matchesPlayed: 0, wins: 0, losses: 0 };
    const friendship = await this.prisma.friendConnection.findFirst({
      where: {
        OR: [
          { requesterPlayerId: currentPlayer.id, addresseePlayerId: playerId },
          { requesterPlayerId: playerId, addresseePlayerId: currentPlayer.id }
        ]
      },
      select: {
        id: true,
        requesterPlayerId: true,
        addresseePlayerId: true,
        status: true
      }
    });

    let friendshipStatus: "self" | "none" | "pending_incoming" | "pending_outgoing" | "accepted" = "none";
    if (playerId === currentPlayer.id) {
      friendshipStatus = "self";
    } else if (friendship?.status === "accepted") {
      friendshipStatus = "accepted";
    } else if (friendship?.status === "pending") {
      friendshipStatus = friendship.requesterPlayerId === currentPlayer.id ? "pending_outgoing" : "pending_incoming";
    }

    return {
      item: {
        id: player.id,
        displayName: player.displayName,
        avatarSeed: player.avatarSeed ?? null,
        avatarUrl: player.avatarUrl ?? null,
        friendshipId: friendship?.id || null,
        stats: {
          rating: Number(stats.rating ?? 1000),
          matchesPlayed: Number(stats.matchesPlayed ?? 0),
          wins: Number(stats.wins ?? 0),
          losses: Number(stats.losses ?? 0)
        },
        friendshipStatus
      }
    };
  }

  async getMessageThreads(headers: IncomingHttpHeaders) {
    const { currentPlayer, hiddenPlayerIds } = await this.getHiddenDirectMessageThreadPlayerIds(headers);
    const rows = await this.prisma.directMessage.findMany({
      where: {
        OR: [
          { senderPlayerId: currentPlayer.id },
          { receiverPlayerId: currentPlayer.id }
        ]
      },
      include: {
        sender: { select: this.playerSelect() },
        receiver: { select: this.playerSelect() }
      },
      orderBy: { createdAt: "desc" },
      take: 200
    });

    const grouped = new Map<string, DirectMessageRow[]>();
    rows.forEach((row) => {
      const partnerId = row.senderPlayerId === currentPlayer.id ? row.receiverPlayerId : row.senderPlayerId;
      if (!partnerId) return;
      if (hiddenPlayerIds.has(partnerId)) return;
      const normalized = row as unknown as DirectMessageRow;
      const list = grouped.get(partnerId) || [];
      list.push(normalized);
      grouped.set(partnerId, list);
    });

    const items = Array.from(grouped.values())
      .map((group) => this.summarizeMessageThread(currentPlayer.id, group))
      .sort((left, right) => {
        const leftAt = new Date(left.lastMessage?.createdAt || 0).getTime();
        const rightAt = new Date(right.lastMessage?.createdAt || 0).getTime();
        return rightAt - leftAt;
      });

    return { items };
  }

  async deleteMessageThread(headers: IncomingHttpHeaders, playerId: string) {
    const currentPlayer = await this.getCurrentPlayer(headers);
    const targetPlayerId = String(playerId || "").trim();
    if (!targetPlayerId) {
      throw new NotFoundException("Player not found");
    }
    if (targetPlayerId === currentPlayer.id) {
      return { ok: true };
    }

    const targetPlayer = await this.prisma.player.findUnique({
      where: { id: targetPlayerId },
      select: this.playerSelect()
    });
    if (!targetPlayer) {
      throw new NotFoundException("Player not found");
    }

    const now = new Date();
    await this.clearHiddenDirectMessageThreadMarkers([currentPlayer.id], targetPlayerId);
    await this.prisma.inboxMessage.create({
      data: {
        playerId: currentPlayer.id,
        type: "direct_message_thread_hidden",
        title: `Thread hidden with ${targetPlayer.displayName}`,
        body: null,
        status: "deleted",
        payloadJson: {
          relatedPlayerId: targetPlayerId
        },
        readAt: now
      }
    });

    return { ok: true };
  }

  async requestFriend(headers: IncomingHttpHeaders, body: { playerId?: string; note?: string }) {
    const currentPlayer = await this.getCurrentPlayer(headers);
    const targetPlayerId = String(body?.playerId || "").trim();
    const note = String(body?.note || "").trim() || null;
    if (!targetPlayerId) {
      throw new NotFoundException("Player not found");
    }
    if (targetPlayerId === currentPlayer.id) {
      throw new ForbiddenException("You cannot add yourself");
    }

    const targetPlayer = await this.prisma.player.findUnique({
      where: { id: targetPlayerId },
      select: this.playerSelect()
    });
    if (!targetPlayer) {
      throw new NotFoundException("Player not found");
    }
    if (targetPlayer.isGuest) {
      throw new ForbiddenException("Guest players cannot be added as friends");
    }

    const acceptedFriendship = await this.prisma.friendConnection.findFirst({
      where: {
        status: "accepted",
        OR: [
          { requesterPlayerId: currentPlayer.id, addresseePlayerId: targetPlayerId },
          { requesterPlayerId: targetPlayerId, addresseePlayerId: currentPlayer.id }
        ]
      },
      include: {
        requester: { select: this.playerSelect() },
        addressee: { select: this.playerSelect() }
      }
    });
    if (acceptedFriendship) {
      return {
        item: this.summarizeFriend(currentPlayer.id, acceptedFriendship)
      };
    }

    const reversePending = await this.prisma.friendConnection.findFirst({
      where: {
        status: "pending",
        requesterPlayerId: targetPlayerId,
        addresseePlayerId: currentPlayer.id
      },
      include: {
        requester: { select: this.playerSelect() },
        addressee: { select: this.playerSelect() }
      }
    });
    if (reversePending) {
      const accepted = await this.prisma.friendConnection.update({
        where: { id: reversePending.id },
        data: {
          status: "accepted",
          respondedAt: new Date(),
          note
        },
        include: {
          requester: { select: this.playerSelect() },
          addressee: { select: this.playerSelect() }
        }
      });
      this.emitSseEvent(targetPlayerId, "friend_update", { type: "friend_accepted", id: accepted.id });
      this.emitSseEvent(currentPlayer.id, "friend_update", { type: "friend_accepted", id: accepted.id });
      return {
        item: this.summarizeFriend(currentPlayer.id, accepted)
      };
    }

    const pending = await this.prisma.friendConnection.upsert({
      where: {
        requesterPlayerId_addresseePlayerId: {
          requesterPlayerId: currentPlayer.id,
          addresseePlayerId: targetPlayerId
        }
      },
      create: {
        requesterPlayerId: currentPlayer.id,
        addresseePlayerId: targetPlayerId,
        status: "pending",
        note
      },
      update: {
        status: "pending",
        note
      },
      include: {
        requester: { select: this.playerSelect() },
        addressee: { select: this.playerSelect() }
      }
    });

    this.emitSseEvent(targetPlayerId, "friend_update", { type: "friend_request", id: pending.id });

    return {
      item: this.summarizeFriend(currentPlayer.id, pending)
    };
  }

  async getDirectMessages(headers: IncomingHttpHeaders, playerId: string, options: { limit?: string | number; before?: string | null } = {}) {
    const currentPlayer = await this.getCurrentPlayer(headers);
    const targetPlayerId = String(playerId || "").trim();
    if (!targetPlayerId) {
      throw new NotFoundException("Player not found");
    }
    if (targetPlayerId === currentPlayer.id) {
      return { items: [] };
    }

    const cleanLimit = Math.max(1, Math.min(100, Math.trunc(Number(options?.limit || 50) || 50)));
    const before = String(options?.before || "").trim();
    let beforeCreatedAt: Date | null = null;
    if (before) {
      const byId = await this.prisma.directMessage.findUnique({
        where: { id: before },
        select: { createdAt: true }
      }).catch(() => null);
      if (byId?.createdAt instanceof Date) {
        beforeCreatedAt = byId.createdAt;
      } else {
        const parsed = new Date(before);
        if (!Number.isNaN(parsed.getTime())) {
          beforeCreatedAt = parsed;
        }
      }
    }

    const rows = await this.prisma.directMessage.findMany({
      where: {
        ...(beforeCreatedAt ? { createdAt: { lt: beforeCreatedAt } } : {}),
        OR: [
          { senderPlayerId: currentPlayer.id, receiverPlayerId: targetPlayerId },
          { senderPlayerId: targetPlayerId, receiverPlayerId: currentPlayer.id }
        ]
      },
      include: {
        sender: { select: this.playerSelect() },
        receiver: { select: this.playerSelect() }
      },
      orderBy: { createdAt: "desc" },
      take: cleanLimit + 1
    });

    const hasMore = rows.length > cleanLimit;
    const sliced = hasMore ? rows.slice(0, cleanLimit) : rows;
    const ordered = [...sliced].reverse();
    const nextCursorRow = hasMore ? sliced[sliced.length - 1] || null : null;
    const nextCursor = hasMore && nextCursorRow?.createdAt ? nextCursorRow.createdAt.toISOString() : null;

    return {
      items: ordered.map((row) => this.summarizeDirectMessage(row as unknown as DirectMessageRow)),
      nextCursor,
      hasMore
    };
  }

  async sendDirectMessage(headers: IncomingHttpHeaders, playerId: string, body: { text?: string }) {
    const currentPlayer = await this.getCurrentPlayer(headers);
    return this.sendDirectMessageForPlayer(currentPlayer, playerId, body);
  }

  async sendDirectMessageForPlayer(
    currentPlayer: { id: string; displayName?: string },
    playerId: string,
    body: { text?: string },
    options: SocialRealtimeEmitOptions = {}
  ) {
    const targetPlayerId = String(playerId || "").trim();
    if (!targetPlayerId) {
      throw new NotFoundException("Player not found");
    }
    if (targetPlayerId === currentPlayer.id) {
      throw new BadRequestException("You cannot message yourself");
    }

    const targetPlayer = await this.prisma.player.findUnique({
      where: { id: targetPlayerId },
      select: this.playerSelect()
    });
    if (!targetPlayer) {
      throw new NotFoundException("Player not found");
    }

    const text = String(body?.text || "").trim();
    if (!text) {
      throw new BadRequestException("Message cannot be empty");
    }
    if (text.length > 500) {
      throw new BadRequestException("Message is too long");
    }

    this.enforceRateLimit(this.socialRateLimits.directMessage, `${currentPlayer.id}:1s`, 1, 1000);
    this.enforceRateLimit(this.socialRateLimits.directMessage, `${currentPlayer.id}:1m`, 30, 60_000);

    await this.clearHiddenDirectMessageThreadMarkers([currentPlayer.id], targetPlayerId);
    await this.clearHiddenDirectMessageThreadMarkers([targetPlayerId], currentPlayer.id);

    const messageRow = await this.prisma.directMessage.create({
      data: {
        senderPlayerId: currentPlayer.id,
        receiverPlayerId: targetPlayerId,
        text
      },
      include: {
        sender: { select: this.playerSelect() },
        receiver: { select: this.playerSelect() }
      }
    });

    const message = this.summarizeDirectMessage(messageRow as unknown as DirectMessageRow);
    if (options.emitEvents !== false) {
      this.emitSseEvent(targetPlayerId, "message", {
        type: "direct_message_created",
        message,
        threadPlayerId: currentPlayer.id
      });
      this.emitSseEvent(currentPlayer.id, "message_sent", {
        type: "direct_message_created",
        message,
        threadPlayerId: targetPlayerId
      });
    }

    return {
      item: message
    };
  }

  async acceptFriend(headers: IncomingHttpHeaders, id: string) {
    const currentPlayer = await this.getCurrentPlayer(headers);
    const row = await this.prisma.friendConnection.findUnique({
      where: { id },
      include: {
        requester: { select: this.playerSelect() },
        addressee: { select: this.playerSelect() }
      }
    });
    if (!row) {
      throw new NotFoundException("Friend request not found");
    }
    if (row.addresseePlayerId !== currentPlayer.id) {
      throw new ForbiddenException("Friend request not found");
    }

    const accepted = await this.prisma.friendConnection.update({
      where: { id },
      data: {
        status: "accepted",
        respondedAt: new Date()
      },
      include: {
        requester: { select: this.playerSelect() },
        addressee: { select: this.playerSelect() }
      }
    });

    this.emitSseEvent(accepted.requesterPlayerId, "friend_update", { type: "friend_accepted", id: accepted.id });
    this.emitSseEvent(accepted.addresseePlayerId, "friend_update", { type: "friend_accepted", id: accepted.id });

    return { item: this.summarizeFriend(currentPlayer.id, accepted) };
  }

  async declineFriend(headers: IncomingHttpHeaders, id: string) {
    const currentPlayer = await this.getCurrentPlayer(headers);
    const row = await this.prisma.friendConnection.findUnique({ where: { id } });
    if (!row) {
      throw new NotFoundException("Friend request not found");
    }
    if (row.addresseePlayerId !== currentPlayer.id) {
      throw new ForbiddenException("Friend request not found");
    }

    const declined = await this.prisma.friendConnection.update({
      where: { id },
      data: {
        status: "rejected",
        respondedAt: new Date()
      },
      include: {
        requester: { select: this.playerSelect() },
        addressee: { select: this.playerSelect() }
      }
    });

    this.emitSseEvent(declined.requesterPlayerId, "friend_update", { type: "friend_declined", friend: this.summarizeFriend(declined.requesterPlayerId, declined) });
    this.emitSseEvent(declined.addresseePlayerId, "friend_update", { type: "friend_declined", friend: this.summarizeFriend(declined.addresseePlayerId, declined) });

    return { item: this.summarizeFriend(currentPlayer.id, declined) };
  }

  async cancelFriendRequest(headers: IncomingHttpHeaders, id: string) {
    const currentPlayer = await this.getCurrentPlayer(headers);
    const row = await this.prisma.friendConnection.findUnique({
      where: { id },
      include: {
        requester: { select: this.playerSelect() },
        addressee: { select: this.playerSelect() }
      }
    });
    if (!row) {
      throw new NotFoundException("Friend request not found");
    }
    if (row.requesterPlayerId !== currentPlayer.id) {
      throw new ForbiddenException("Friend request not found");
    }
    if (row.status === "rejected") {
      return { item: this.summarizeFriend(currentPlayer.id, row) };
    }
    if (row.status !== "pending") {
      throw new BadRequestException("Friend request already responded");
    }

    const cancelled = await this.prisma.friendConnection.update({
      where: { id },
      data: {
        status: "rejected",
        respondedAt: new Date()
      },
      include: {
        requester: { select: this.playerSelect() },
        addressee: { select: this.playerSelect() }
      }
    });

    this.emitSseEvent(cancelled.requesterPlayerId, "friend_update", { type: "friend_cancelled", friend: this.summarizeFriend(cancelled.requesterPlayerId, cancelled) });
    this.emitSseEvent(cancelled.addresseePlayerId, "friend_update", { type: "friend_cancelled", friend: this.summarizeFriend(cancelled.addresseePlayerId, cancelled) });

    return { item: this.summarizeFriend(currentPlayer.id, cancelled) };
  }

  async removeFriend(headers: IncomingHttpHeaders, id: string) {
    const currentPlayer = await this.getCurrentPlayer(headers);
    const row = await this.prisma.friendConnection.findUnique({ where: { id } });
    if (!row) {
      throw new NotFoundException("Friend relationship not found");
    }
    if (row.addresseePlayerId !== currentPlayer.id && row.requesterPlayerId !== currentPlayer.id) {
      throw new ForbiddenException("Friend relationship not found");
    }

    const partnerId = row.requesterPlayerId === currentPlayer.id ? row.addresseePlayerId : row.requesterPlayerId;

    await this.prisma.friendConnection.delete({ where: { id } });

    this.emitSseEvent(partnerId, "friend_update", { type: "friend_removed", id });
    this.emitSseEvent(currentPlayer.id, "friend_update", { type: "friend_removed", id });

    return { ok: true };
  }

  async getRoomInvitations(headers: IncomingHttpHeaders) {
    const currentPlayer = await this.getCurrentPlayer(headers);
    const now = new Date();
    await this.prisma.roomInvitation.updateMany({
      where: {
        status: "pending",
        expiresAt: { lt: now }
      },
      data: {
        status: "expired",
        respondedAt: now
      }
    });

    const rows = await this.prisma.roomInvitation.findMany({
      where: {
        OR: [
          { inviterPlayerId: currentPlayer.id },
          { inviteePlayerId: currentPlayer.id }
        ]
      },
      include: {
        inviter: { select: this.playerSelect() },
        invitee: { select: this.playerSelect() }
      },
      orderBy: [
        { updatedAt: "desc" },
        { createdAt: "desc" }
      ]
    });

    const incoming = rows
      .filter((row) => row.inviteePlayerId === currentPlayer.id)
      .map((row) => this.summarizeInvite(row));
    const sent = rows
      .filter((row) => row.inviterPlayerId === currentPlayer.id)
      .map((row) => this.summarizeInvite(row));

    return { incoming, sent, items: rows.map((row) => this.summarizeInvite(row)) };
  }

  async getPlayInvites(headers: IncomingHttpHeaders) {
    const currentPlayer = await this.getCurrentPlayer(headers);
    const now = new Date();
    await this.prisma.playInvite.updateMany({
      where: {
        status: "pending",
        expiresAt: { lt: now }
      },
      data: {
        status: "expired",
        respondedAt: now
      }
    });

    const rows = await this.prisma.playInvite.findMany({
      where: {
        OR: [
          { inviterPlayerId: currentPlayer.id },
          { inviteePlayerId: currentPlayer.id }
        ]
      },
      include: {
        inviter: { select: this.playerSelect() },
        invitee: { select: this.playerSelect() }
      },
      orderBy: [
        { updatedAt: "desc" },
        { createdAt: "desc" }
      ]
    });

    const incoming = rows
      .filter((row) => row.inviteePlayerId === currentPlayer.id)
      .map((row) => this.summarizePlayInvite(row as any));
    const outgoing = rows
      .filter((row) => row.inviterPlayerId === currentPlayer.id)
      .map((row) => this.summarizePlayInvite(row as any));
    const waiting = rows
      .filter((row) => row.status === "accepted" && !String(row.roomId || "").trim())
      .map((row) => this.summarizePlayInvite(row as any));
    const acceptedWaiting = waiting;

    return { incoming, outgoing, waiting, acceptedWaiting, items: rows.map((row) => this.summarizePlayInvite(row as any)) };
  }

  async attachPlayInviteRoom(headers: IncomingHttpHeaders, body: {
    roomId?: string;
    roomCode?: string | null;
    inviteIds?: string[];
    roomSettings?: Record<string, unknown> | null;
  }) {
    const currentPlayer = await this.getCurrentPlayer(headers);
    return this.attachPlayInviteRoomForPlayer(currentPlayer, body);
  }

  async attachPlayInviteRoomForPlayer(
    currentPlayer: { id: string; displayName?: string },
    body: {
      roomId?: string;
      roomCode?: string | null;
      inviteIds?: string[];
      roomSettings?: Record<string, unknown> | null;
    },
    options: SocialRealtimeEmitOptions = {}
  ) {
    const roomId = String(body?.roomId || "").trim();
    const roomCode = String(body?.roomCode || "").trim().toUpperCase() || null;
    const inviteIds = Array.from(new Set((Array.isArray(body?.inviteIds) ? body.inviteIds : [])
      .map((value) => String(value || "").trim())
      .filter(Boolean)));
    const roomSettings = body?.roomSettings && typeof body.roomSettings === "object" && !Array.isArray(body.roomSettings)
      ? body.roomSettings
      : null;

    if (!roomId) {
      throw new BadRequestException("roomId is required");
    }

    const include = {
      inviter: { select: this.playerSelect() },
      invitee: { select: this.playerSelect() }
    } as const;

    const candidateRows = await this.prisma.playInvite.findMany({
      where: inviteIds.length > 0
        ? {
            id: { in: inviteIds },
            inviterPlayerId: currentPlayer.id
          }
        : {
            inviterPlayerId: currentPlayer.id,
            status: { in: ["accepted", "room_created"] }
          },
      include,
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }]
    });

    if (!candidateRows.length) {
      return { items: [], item: null, count: 0 };
    }

    const now = new Date();
    const roomCreatedRows = candidateRows.filter((row) => String(row.status || "").trim().toLowerCase() === "room_created");
    const readyRows = candidateRows.filter((row) => {
      const status = String(row.status || "").trim().toLowerCase();
      const currentRoomId = String(row.roomId || "").trim();
      if (status !== "accepted") {
        return false;
      }
      if (currentRoomId && currentRoomId !== roomId) {
        throw new BadRequestException("Invite already attached to another room");
      }
      return true;
    });

    const parsedMaxPlayers = Number(roomSettings?.maxPlayers || 0);
    const maxPlayers = Number.isFinite(parsedMaxPlayers) && parsedMaxPlayers > 0 ? Math.trunc(parsedMaxPlayers) : 4;
    const inviterSeats = 1;
    if (readyRows.length + inviterSeats > maxPlayers) {
      throw new BadRequestException("Room capacity is too small for accepted invites");
    }

    const updatedRows = await this.prisma.$transaction(async (tx) => {
      const rows: any[] = [];
      for (const row of readyRows) {
        const nextPayload = {
          ...(row.payloadJson && typeof row.payloadJson === "object" && !Array.isArray(row.payloadJson) ? row.payloadJson : {}),
          roomAttach: {
            roomId,
            roomCode,
            attachedAt: now.toISOString(),
            roomSettings
          }
        } as Prisma.InputJsonValue;
        const updated = await tx.playInvite.update({
          where: { id: row.id },
          data: {
            roomId,
            roomCode,
            status: "room_created",
            payloadJson: nextPayload
          },
          include
        });
        rows.push(updated);
      }
      return rows;
    });

    const roomReadyItems = updatedRows.map((row) => this.summarizePlayInvite(row as any));
    const existingRoomCreatedItems = roomCreatedRows.map((row) => this.summarizePlayInvite(row as any));
    const items = [...roomReadyItems, ...existingRoomCreatedItems];

    if (options.emitEvents !== false) {
      roomReadyItems.forEach((invite) => {
        const inviteePlayerId = String(invite.invitee?.id || "").trim();
        if (inviteePlayerId) {
          this.emitSseEvent(inviteePlayerId, "play_invite_update", {
            type: "play_invite_room_ready",
            invite,
            roomId,
            roomCode
          });
        }
      });
      this.emitSseEvent(currentPlayer.id, "play_invite_update", {
        type: "play_invite_room_created",
        invite: roomReadyItems[0] || existingRoomCreatedItems[0] || null,
        items,
        roomId,
        roomCode
      });
    }

    return {
      item: roomReadyItems[0] || existingRoomCreatedItems[0] || null,
      items,
      count: items.length
    };
  }

  async markPlayInviteJoined(headers: IncomingHttpHeaders, id: string, body: {
    roomId?: string | null;
    roomCode?: string | null;
    reason?: string | null;
  }) {
    const currentPlayer = await this.getCurrentPlayer(headers);
    return this.markPlayInviteJoinedForPlayer(currentPlayer, id, body);
  }

  async markPlayInviteJoinedForPlayer(
    currentPlayer: { id: string; displayName?: string },
    id: string,
    body: {
      roomId?: string | null;
      roomCode?: string | null;
      reason?: string | null;
    },
    options: SocialRealtimeEmitOptions = {}
  ) {
    const row = await this.prisma.playInvite.findUnique({
      where: { id },
      include: {
        inviter: { select: this.playerSelect() },
        invitee: { select: this.playerSelect() }
      }
    });
    if (!row) {
      throw new NotFoundException("Invitation not found");
    }
    if (row.inviteePlayerId !== currentPlayer.id) {
      throw new ForbiddenException("Invitation not found");
    }
    const currentStatus = String(row.status || "").trim().toLowerCase();
    if (!["accepted", "room_created", "joined"].includes(currentStatus)) {
      throw new BadRequestException("Invitation already responded");
    }
    const roomId = String(body?.roomId || row.roomId || "").trim() || null;
    const roomCode = String(body?.roomCode || row.roomCode || "").trim().toUpperCase() || null;
    if (!roomId && !roomCode) {
      throw new BadRequestException("roomId or roomCode is required");
    }

    const joined = currentStatus === "joined"
      ? row
      : await this.prisma.playInvite.update({
          where: { id },
          data: {
            roomId,
            roomCode,
            status: "joined"
          },
          include: {
            inviter: { select: this.playerSelect() },
            invitee: { select: this.playerSelect() }
          }
        });

    const invite = this.summarizePlayInvite(joined as any);
    if (options.emitEvents !== false) {
      this.emitSseEvent(joined.inviterPlayerId, "play_invite_update", {
        type: "play_invite_joined",
        invite,
        roomId,
        roomCode,
        reason: String(body?.reason || "").trim() || null
      });
      this.emitSseEvent(joined.inviteePlayerId, "play_invite_update", {
        type: "play_invite_joined",
        invite,
        roomId,
        roomCode,
        reason: String(body?.reason || "").trim() || null
      });
    }

    return { item: invite };
  }

  async markPlayInviteFailedToJoin(headers: IncomingHttpHeaders, id: string, body: {
    roomId?: string | null;
    roomCode?: string | null;
    reason?: string | null;
  }) {
    const currentPlayer = await this.getCurrentPlayer(headers);
    return this.markPlayInviteFailedToJoinForPlayer(currentPlayer, id, body);
  }

  async markPlayInviteFailedToJoinForPlayer(
    currentPlayer: { id: string; displayName?: string },
    id: string,
    body: {
      roomId?: string | null;
      roomCode?: string | null;
      reason?: string | null;
    },
    options: SocialRealtimeEmitOptions = {}
  ) {
    const row = await this.prisma.playInvite.findUnique({
      where: { id },
      include: {
        inviter: { select: this.playerSelect() },
        invitee: { select: this.playerSelect() }
      }
    });
    if (!row) {
      throw new NotFoundException("Invitation not found");
    }
    if (row.inviteePlayerId !== currentPlayer.id) {
      throw new ForbiddenException("Invitation not found");
    }
    const currentStatus = String(row.status || "").trim().toLowerCase();
    if (!["accepted", "room_created", "failed_to_join"].includes(currentStatus)) {
      throw new BadRequestException("Invitation already responded");
    }
    const roomId = String(body?.roomId || row.roomId || "").trim() || null;
    const roomCode = String(body?.roomCode || row.roomCode || "").trim().toUpperCase() || null;

    const failed = currentStatus === "failed_to_join"
      ? row
      : await this.prisma.playInvite.update({
          where: { id },
          data: {
            roomId,
            roomCode,
            status: "failed_to_join"
          },
          include: {
            inviter: { select: this.playerSelect() },
            invitee: { select: this.playerSelect() }
          }
        });

    const invite = this.summarizePlayInvite(failed as any);
    if (options.emitEvents !== false) {
      this.emitSseEvent(failed.inviterPlayerId, "play_invite_update", {
        type: "play_invite_failed_to_join",
        invite,
        roomId,
        roomCode,
        reason: String(body?.reason || "").trim() || null
      });
      this.emitSseEvent(failed.inviteePlayerId, "play_invite_update", {
        type: "play_invite_failed_to_join",
        invite,
        roomId,
        roomCode,
        reason: String(body?.reason || "").trim() || null
      });
    }

    return { item: invite };
  }

  async getGiftCatalog(headers: IncomingHttpHeaders) {
    await this.getCurrentPlayer(headers);
    await this.ensureGiftCatalog();
    const rows = await this.prisma.giftCatalog.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { coinCost: "asc" }, { name: "asc" }]
    });

    return {
      items: rows.map((row) => this.summarizeGiftCatalog(row as GiftCatalogRow))
    };
  }

  async getGiftInventory(headers: IncomingHttpHeaders) {
    const currentPlayer = await this.getCurrentPlayer(headers);
    await this.ensureGiftCatalog();
    const rows = await this.prisma.playerGiftInventory.findMany({
      where: { playerId: currentPlayer.id },
      include: {
        catalog: true
      },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }]
    });

    const items = rows
      .map((row) => this.summarizeGiftInventory(row as unknown as GiftInventoryRow))
      .filter((item) => Number(item.quantity || 0) > 0);
    const quantity = items.reduce((sum, item) => sum + Math.max(0, Number(item.quantity || 0)), 0);
    const totalValue = items.reduce((sum, item) => sum + Math.max(0, Number(item.quantity || 0)) * Math.max(0, Number(item.catalog.exchangeValue || 0)), 0);

    return {
      items,
      summary: {
        unique: items.length,
        quantity,
        exchangeValue: totalValue
      }
    };
  }

  async getGiftHistory(headers: IncomingHttpHeaders) {
    const currentPlayer = await this.getCurrentPlayer(headers);
    await this.ensureGiftCatalog();
    const [sent, received] = await Promise.all([
      this.prisma.giftTransaction.findMany({
        where: { senderPlayerId: currentPlayer.id },
        include: {
          sender: { select: this.playerSelect() },
          recipient: { select: this.playerSelect() }
        },
        orderBy: { createdAt: "desc" },
        take: 30
      }),
      this.prisma.giftTransaction.findMany({
        where: { recipientPlayerId: currentPlayer.id },
        include: {
          sender: { select: this.playerSelect() },
          recipient: { select: this.playerSelect() }
        },
        orderBy: { createdAt: "desc" },
        take: 30
      })
    ]);

    return {
      sent: sent.map((row) => this.summarizeGiftTransaction(row as unknown as GiftTransactionRow)),
      received: received.map((row) => this.summarizeGiftTransaction(row as unknown as GiftTransactionRow)),
      items: [...sent, ...received]
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, 30)
        .map((row) => this.summarizeGiftTransaction(row as unknown as GiftTransactionRow))
    };
  }

  async sendGift(
    headers: IncomingHttpHeaders,
    body: {
      recipientPlayerId?: string;
      giftKey?: string;
      contextType?: string;
      contextId?: string;
      note?: string;
    }
  ) {
    const currentPlayer = await this.getCurrentPlayer(headers);
    const recipientPlayerId = String(body?.recipientPlayerId || "").trim();
    const giftKey = String(body?.giftKey || "").trim();
    const contextType = String(body?.contextType || "match").trim() || "match";
    const contextId = String(body?.contextId || "").trim() || null;
    const note = String(body?.note || "").trim() || null;

    if (!recipientPlayerId) {
      throw new BadRequestException("Recipient is required");
    }
    if (!giftKey) {
      throw new BadRequestException("Gift is required");
    }
    if (recipientPlayerId === currentPlayer.id) {
      throw new ForbiddenException("You cannot send a gift to yourself");
    }

    const [recipient, catalog] = await Promise.all([
      this.prisma.player.findUnique({
        where: { id: recipientPlayerId },
        select: this.playerSelect()
      }),
      this.prisma.giftCatalog.findUnique({
        where: { key: giftKey }
      })
    ]);

    if (!recipient) {
      throw new NotFoundException("Recipient not found");
    }
    if (recipient.isGuest) {
      throw new ForbiddenException("Guest players cannot receive gifts");
    }
    if (!catalog || !catalog.isActive) {
      throw new NotFoundException("Gift not found");
    }

    const exchangeValue = this.giftExchangeValue(catalog.coinCost, catalog.exchangeRateBps);

    const transaction = await this.prisma.$transaction(async (tx) => {
      await this.ensureGiftCatalog(tx);
      const nextCatalog = await tx.giftCatalog.findUnique({ where: { key: giftKey } });
      if (!nextCatalog || !nextCatalog.isActive) {
        throw new NotFoundException("Gift not found");
      }

      const wallet = await this.debitWallet(
        tx,
        currentPlayer.id,
        nextCatalog.coinCost,
        "gift_send" as CoinLedgerType,
        "gift_send",
        nextCatalog.id,
        {
          note: note || `Gift ${nextCatalog.name}`,
          payloadJson: {
            recipientPlayerId,
            giftKey: nextCatalog.key,
            contextType,
            contextId
          }
        }
      );

      const inventory = await tx.playerGiftInventory.upsert({
        where: {
          playerId_giftCatalogId: {
            playerId: recipientPlayerId,
            giftCatalogId: nextCatalog.id
          }
        },
        update: {
          quantity: { increment: 1 },
          receivedCount: { increment: 1 },
          lastReceivedAt: new Date()
        },
        create: {
          playerId: recipientPlayerId,
          giftCatalogId: nextCatalog.id,
          quantity: 1,
          receivedCount: 1,
          lastReceivedAt: new Date()
        },
        include: {
          catalog: true
        }
      });

      const gift = await tx.giftTransaction.create({
        data: {
          senderPlayerId: currentPlayer.id,
          recipientPlayerId,
          giftCatalogId: nextCatalog.id,
          giftKeySnapshot: nextCatalog.key,
          giftNameSnapshot: nextCatalog.name,
          assetKeySnapshot: nextCatalog.assetKey,
          coinCost: nextCatalog.coinCost,
          exchangeValue,
          contextType,
          contextId,
          note,
          status: "sent"
        },
        include: {
          sender: { select: this.playerSelect() },
          recipient: { select: this.playerSelect() }
        }
      });

      const inbox = await tx.inboxMessage.create({
        data: {
          playerId: recipientPlayerId,
          type: "gift_received",
          title: `Gift from ${currentPlayer.displayName}`,
          body: `You received ${nextCatalog.name}`,
          status: "unread",
          payloadJson: {
            senderPlayerId: currentPlayer.id,
            giftKey: nextCatalog.key,
            giftName: nextCatalog.name,
            assetKey: nextCatalog.assetKey,
            transactionId: gift.id
          },
          rewardJson: {
            type: "gift",
            giftKey: nextCatalog.key,
            giftName: nextCatalog.name,
            assetKey: nextCatalog.assetKey,
            transactionId: gift.id
          }
        }
      });

      return {
        wallet,
        gift: this.summarizeGiftTransaction(gift as unknown as GiftTransactionRow),
        inventory: this.summarizeGiftInventory(inventory as unknown as GiftInventoryRow),
        inbox: this.summarizeInboxMessage(inbox as unknown as InboxMessageRow)
      };
    });

    return {
      ok: true,
      ...transaction
    };
  }

  async exchangeGift(
    headers: IncomingHttpHeaders,
    body: {
      giftKey?: string;
      quantity?: number;
      note?: string;
    }
  ) {
    const currentPlayer = await this.getCurrentPlayer(headers);
    const giftKey = String(body?.giftKey || "").trim();
    const quantity = Math.max(1, Math.trunc(Number(body?.quantity || 1)));
    const note = String(body?.note || "").trim() || null;

    if (!giftKey) {
      throw new BadRequestException("Gift is required");
    }

    const result = await this.prisma.$transaction(async (tx) => {
      await this.ensureGiftCatalog(tx);
      const catalog = await tx.giftCatalog.findUnique({ where: { key: giftKey } });
      if (!catalog || !catalog.isActive) {
        throw new NotFoundException("Gift not found");
      }

      const inventory = await tx.playerGiftInventory.findUnique({
        where: {
          playerId_giftCatalogId: {
            playerId: currentPlayer.id,
            giftCatalogId: catalog.id
          }
        },
        include: {
          catalog: true
        }
      });

      if (!inventory || inventory.quantity < quantity) {
        throw new BadRequestException("Not enough gifts");
      }

      const exchangeValue = this.giftExchangeValue(catalog.coinCost, catalog.exchangeRateBps) * quantity;
      const updatedInventory = await tx.playerGiftInventory.update({
        where: {
          playerId_giftCatalogId: {
            playerId: currentPlayer.id,
            giftCatalogId: catalog.id
          }
        },
        data: {
          quantity: {
            decrement: quantity
          },
          exchangedCount: {
            increment: quantity
          }
        },
        include: {
          catalog: true
        }
      });

      if (updatedInventory.quantity <= 0) {
        await tx.playerGiftInventory.delete({
          where: {
            playerId_giftCatalogId: {
              playerId: currentPlayer.id,
              giftCatalogId: catalog.id
            }
          }
        });
      }

      const wallet = await this.creditWallet(
        tx,
        currentPlayer.id,
        exchangeValue,
        "gift_exchange" as CoinLedgerType,
        "gift_exchange",
        catalog.id,
        {
          note: note || `Exchange ${catalog.name}`,
          payloadJson: {
            giftKey: catalog.key,
            quantity,
            exchangeValue
          }
        }
      );

      const gift = await tx.giftTransaction.create({
        data: {
          senderPlayerId: currentPlayer.id,
          recipientPlayerId: currentPlayer.id,
          giftCatalogId: catalog.id,
          giftKeySnapshot: catalog.key,
          giftNameSnapshot: catalog.name,
          assetKeySnapshot: catalog.assetKey,
          coinCost: catalog.coinCost * quantity,
          exchangeValue,
          contextType: "exchange",
          contextId: updatedInventory.id,
          note,
          status: "exchanged"
        },
        include: {
          sender: { select: this.playerSelect() },
          recipient: { select: this.playerSelect() }
        }
      });

      return {
        wallet,
        gift: this.summarizeGiftTransaction(gift as unknown as GiftTransactionRow),
        inventory: this.summarizeGiftInventory(updatedInventory as unknown as GiftInventoryRow)
      };
    });

    return {
      ok: true,
      ...result
    };
  }

  async createPlayInvite(
    headers: IncomingHttpHeaders,
    body: {
      inviteePlayerId?: string;
      note?: string;
      payloadJson?: unknown;
      expiresAt?: string | null;
    }
  ) {
    const currentPlayer = await this.getCurrentPlayer(headers);
    return this.createPlayInviteForPlayer(currentPlayer, body);
  }

  async createPlayInviteForPlayer(
    currentPlayer: { id: string; displayName?: string },
    body: {
      inviteePlayerId?: string;
      note?: string;
      payloadJson?: unknown;
      expiresAt?: string | null;
    },
    options: SocialRealtimeEmitOptions = {}
  ) {
    const inviteePlayerId = String(body?.inviteePlayerId || "").trim();
    if (!inviteePlayerId) {
      throw new NotFoundException("Invitee not found");
    }
    if (inviteePlayerId === currentPlayer.id) {
      throw new ForbiddenException("You cannot invite yourself");
    }

    const invitee = await this.prisma.player.findUnique({
      where: { id: inviteePlayerId },
      select: this.playerSelect()
    });
    if (!invitee) {
      throw new NotFoundException("Invitee not found");
    }
    if (invitee.isGuest) {
      throw new ForbiddenException("Guest players cannot receive play invitations");
    }

    const isFriend = await this.prisma.friendConnection.findFirst({
      where: {
        status: "accepted",
        OR: [
          { requesterPlayerId: currentPlayer.id, addresseePlayerId: inviteePlayerId },
          { requesterPlayerId: inviteePlayerId, addresseePlayerId: currentPlayer.id }
        ]
      }
    });
    if (!isFriend) {
      throw new ForbiddenException("Invitee must be your friend");
    }

    this.enforceRateLimit(this.socialRateLimits.playInvite, `${currentPlayer.id}:${inviteePlayerId}:15s`, 1, 15_000);
    this.enforceRateLimit(this.socialRateLimits.playInvite, `${currentPlayer.id}:1h`, 20, 60 * 60_000);

    const expiresAt = body?.expiresAt ? new Date(body.expiresAt) : new Date(Date.now() + 1000 * 60 * 5);
    const note = String(body?.note || "").trim() || null;
    const payloadJson = body?.payloadJson === undefined ? null : body.payloadJson;
    const invitationInclude = {
      inviter: { select: this.playerSelect() },
      invitee: { select: this.playerSelect() }
    } as const;

    const row = await this.prisma
      .$transaction(async (tx) => {
        const data = {
          roomId: null,
          inviteePlayerId,
          inviterPlayerId: currentPlayer.id,
          status: "pending",
          note,
          expiresAt,
          ...(payloadJson === null ? {} : { payloadJson: payloadJson as Prisma.InputJsonValue })
        } satisfies Prisma.PlayInviteUncheckedCreateInput;

        const existing = await tx.playInvite.findFirst({
          where: {
            roomId: null,
            inviterPlayerId: currentPlayer.id,
            inviteePlayerId,
            status: {
              in: ["pending", "accepted"]
            }
          },
          orderBy: { updatedAt: "desc" }
        });

        if (existing) {
          const nextExpiresAt = body?.expiresAt ? expiresAt : existing.expiresAt || expiresAt;
          return tx.playInvite.update({
            where: { id: existing.id },
            data: {
              ...data,
              status: existing.status,
              expiresAt: nextExpiresAt,
              note: note ?? existing.note ?? null,
              ...(payloadJson === null ? {} : { payloadJson: payloadJson as Prisma.InputJsonValue })
            },
            include: invitationInclude
          });
        }

        return tx.playInvite.create({
          data,
          include: invitationInclude
        });
      })
      .catch(async (error) => {
        if (!this.isUniqueConstraintError(error)) {
          throw error;
        }

        const fallback = await this.prisma.playInvite.findFirst({
          where: {
            roomId: null,
            inviterPlayerId: currentPlayer.id,
            inviteePlayerId,
            status: {
              in: ["pending", "accepted"]
            }
          },
          orderBy: { updatedAt: "desc" }
        });

        if (!fallback) {
          throw error;
        }

        return this.prisma.playInvite.update({
          where: { id: fallback.id },
          data: {
            roomId: null,
            inviteePlayerId,
            inviterPlayerId: currentPlayer.id,
            status: "pending",
            note,
            expiresAt,
            ...(payloadJson === null ? {} : { payloadJson: payloadJson as Prisma.InputJsonValue })
          },
          include: invitationInclude
        });
      });

    const invite = this.summarizePlayInvite(row as any);
    if (options.emitEvents !== false) {
      this.emitSseEvent(inviteePlayerId, "play_invite_update", { type: "play_invite_created", invite });
    }
    return { item: invite };
  }

  async acceptPlayInvite(headers: IncomingHttpHeaders, id: string) {
    const currentPlayer = await this.getCurrentPlayer(headers);
    return this.acceptPlayInviteForPlayer(currentPlayer, id);
  }

  async acceptPlayInviteForPlayer(
    currentPlayer: { id: string; displayName?: string },
    id: string,
    options: SocialRealtimeEmitOptions = {}
  ) {
    const row = await this.prisma.playInvite.findUnique({
      where: { id },
      include: {
        inviter: { select: this.playerSelect() },
        invitee: { select: this.playerSelect() }
      }
    });
    if (!row) {
      throw new NotFoundException("Invitation not found");
    }
    if (row.inviteePlayerId !== currentPlayer.id) {
      throw new ForbiddenException("Invitation not found");
    }
    if (row.status === "expired") {
      return { ok: false, reason: "invite_not_available" };
    }
    if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) {
      await this.prisma.playInvite.update({
        where: { id },
        data: {
          status: "expired",
          respondedAt: new Date()
        },
        include: {
          inviter: { select: this.playerSelect() },
          invitee: { select: this.playerSelect() }
        }
      });
      return { ok: false, reason: "invite_not_available" };
    }
    if (row.status === "accepted") {
      return { item: this.summarizePlayInvite(row as any) };
    }
    if (row.status !== "pending") {
      throw new BadRequestException("Invitation already responded");
    }

    const accepted = await this.prisma.playInvite.update({
      where: { id },
      data: {
        status: "accepted",
        respondedAt: new Date()
      },
      include: {
        inviter: { select: this.playerSelect() },
        invitee: { select: this.playerSelect() }
      }
    });

    const invite = this.summarizePlayInvite(accepted as any);
    if (options.emitEvents !== false) {
      this.emitSseEvent(accepted.inviterPlayerId, "play_invite_update", { type: "play_invite_accepted", invite });
      this.emitSseEvent(accepted.inviteePlayerId, "play_invite_update", { type: "play_invite_accepted", invite });
    }

    return { item: invite };
  }

  async declinePlayInvite(headers: IncomingHttpHeaders, id: string) {
    const currentPlayer = await this.getCurrentPlayer(headers);
    return this.declinePlayInviteForPlayer(currentPlayer, id);
  }

  async declinePlayInviteForPlayer(
    currentPlayer: { id: string; displayName?: string },
    id: string,
    options: SocialRealtimeEmitOptions = {}
  ) {
    const row = await this.prisma.playInvite.findUnique({
      where: { id },
      include: {
        inviter: { select: this.playerSelect() },
        invitee: { select: this.playerSelect() }
      }
    });
    if (!row) {
      throw new NotFoundException("Invitation not found");
    }
    if (row.inviteePlayerId !== currentPlayer.id) {
      throw new ForbiddenException("Invitation not found");
    }
    if (row.status === "expired") {
      throw new BadRequestException("Invitation expired");
    }
    if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) {
      await this.prisma.playInvite.update({
        where: { id },
        data: {
          status: "expired",
          respondedAt: new Date()
        },
        include: {
          inviter: { select: this.playerSelect() },
          invitee: { select: this.playerSelect() }
        }
      });
      throw new BadRequestException(`Invitation expired`);
    }
    if (row.status === "declined") {
      return { item: this.summarizePlayInvite(row as any) };
    }
    if (row.status !== "pending") {
      throw new BadRequestException("Invitation already responded");
    }

    const declined = await this.prisma.playInvite.update({
      where: { id },
      data: {
        status: "declined",
        respondedAt: new Date()
      },
      include: {
        inviter: { select: this.playerSelect() },
        invitee: { select: this.playerSelect() }
      }
    });

    const invite = this.summarizePlayInvite(declined as any);
    if (options.emitEvents !== false) {
      this.emitSseEvent(declined.inviterPlayerId, "play_invite_update", { type: "play_invite_declined", invite });
      this.emitSseEvent(declined.inviteePlayerId, "play_invite_update", { type: "play_invite_declined", invite });
    }

    return { item: invite };
  }

  async cancelPlayInvite(headers: IncomingHttpHeaders, id: string) {
    const currentPlayer = await this.getCurrentPlayer(headers);
    return this.cancelPlayInviteForPlayer(currentPlayer, id);
  }

  async cancelPlayInviteForPlayer(
    currentPlayer: { id: string; displayName?: string },
    id: string,
    options: SocialRealtimeEmitOptions = {}
  ) {
    const row = await this.prisma.playInvite.findUnique({
      where: { id },
      include: {
        inviter: { select: this.playerSelect() },
        invitee: { select: this.playerSelect() }
      }
    });
    if (!row) {
      throw new NotFoundException("Invitation not found");
    }
    if (row.inviterPlayerId !== currentPlayer.id) {
      throw new ForbiddenException("Invitation not found");
    }
    if (row.status === "cancelled") {
      return { item: this.summarizePlayInvite(row as any) };
    }
    if (row.status === "expired") {
      throw new BadRequestException("Invitation expired");
    }
    if (row.status !== "pending") {
      throw new BadRequestException("Invitation already responded");
    }

    const cancelled = await this.prisma.playInvite.update({
      where: { id },
      data: {
        status: "cancelled",
        respondedAt: new Date()
      },
      include: {
        inviter: { select: this.playerSelect() },
        invitee: { select: this.playerSelect() }
      }
    });

    const invite = this.summarizePlayInvite(cancelled as any);
    if (options.emitEvents !== false) {
      this.emitSseEvent(cancelled.inviteePlayerId, "play_invite_update", { type: "play_invite_cancelled", invite });
      this.emitSseEvent(cancelled.inviterPlayerId, "play_invite_update", { type: "play_invite_cancelled", invite });
    }

    return { item: invite };
  }

  async inviteFriendToRoom(
    headers: IncomingHttpHeaders,
    roomId: string,
    body: {
      inviteePlayerId?: string;
      roomCode?: string | null;
      roomMode?: string;
      stakeKey?: string;
      stakeAmount?: number;
      humanSeats?: number;
      totalPlayers?: number;
      isTeamMode?: boolean;
      note?: string;
      payloadJson?: unknown;
      expiresAt?: string | null;
    }
  ) {
    const currentPlayer = await this.getCurrentPlayer(headers);
    return this.inviteFriendToRoomForPlayer(currentPlayer, roomId, body);
  }

  async inviteFriendToRoomForPlayer(
    currentPlayer: { id: string; displayName?: string },
    roomId: string,
    body: {
      inviteePlayerId?: string;
      roomCode?: string | null;
      roomMode?: string;
      stakeKey?: string;
      stakeAmount?: number;
      humanSeats?: number;
      totalPlayers?: number;
      isTeamMode?: boolean;
      note?: string;
      payloadJson?: unknown;
      expiresAt?: string | null;
    },
    options: SocialRealtimeEmitOptions = {}
  ) {
    const cleanRoomId = String(roomId || "").trim();
    if (!cleanRoomId) {
      throw new NotFoundException("Room not found");
    }
    const inviteePlayerId = String(body?.inviteePlayerId || "").trim();
    if (!inviteePlayerId) {
      throw new NotFoundException("Invitee not found");
    }
    if (inviteePlayerId === currentPlayer.id) {
      throw new ForbiddenException("You cannot invite yourself");
    }

    const invitee = await this.prisma.player.findUnique({
      where: { id: inviteePlayerId },
      select: this.playerSelect()
    });
    if (!invitee) {
      throw new NotFoundException("Invitee not found");
    }
    if (invitee.isGuest) {
      throw new ForbiddenException("Guest players cannot receive room invitations");
    }

    const isFriend = await this.prisma.friendConnection.findFirst({
      where: {
        status: "accepted",
        OR: [
          { requesterPlayerId: currentPlayer.id, addresseePlayerId: inviteePlayerId },
          { requesterPlayerId: inviteePlayerId, addresseePlayerId: currentPlayer.id }
        ]
      }
    });
    if (!isFriend) {
      throw new ForbiddenException("Invitee must be your friend");
    }

    this.enforceRateLimit(this.socialRateLimits.roomInvite, `${currentPlayer.id}:${inviteePlayerId}:15s`, 1, 15_000);
    this.enforceRateLimit(this.socialRateLimits.roomInvite, `${currentPlayer.id}:1h`, 20, 60 * 60_000);

    const expiresAt = body?.expiresAt ? new Date(body.expiresAt) : new Date(Date.now() + 1000 * 60 * 5);
    const payloadJson = body?.payloadJson === undefined ? null : body.payloadJson;
    const payloadJsonData = payloadJson === null ? {} : { payloadJson: payloadJson as Prisma.InputJsonValue };
    const roomCode = String(body?.roomCode || "").trim() || null;
    const roomMode = String(body?.roomMode || (body?.isTeamMode ? "team" : "ffa") || "ffa").trim();
    const note = String(body?.note || "").trim() || null;
    const invitationData = {
      roomId: cleanRoomId,
      roomCode,
      roomMode,
      stakeKey: String(body?.stakeKey || "").trim() || null,
      stakeAmount: Math.max(0, Number(body?.stakeAmount || 0)),
      humanSeats: Math.max(0, Number(body?.humanSeats || 0)),
      totalPlayers: Math.max(0, Number(body?.totalPlayers || 0)),
      isTeamMode: Boolean(body?.isTeamMode),
      inviterPlayerId: currentPlayer.id,
      inviteePlayerId,
      note,
      ...payloadJsonData,
      expiresAt
    };

    const invitationInclude = {
      inviter: { select: this.playerSelect() },
      invitee: { select: this.playerSelect() }
    } as const;

    const row = await this.prisma
      .$transaction(async (tx) => {
        const existing = await tx.roomInvitation.findFirst({
          where: {
            roomId: cleanRoomId,
            inviterPlayerId: currentPlayer.id,
            inviteePlayerId,
            status: {
              in: ["pending", "accepted"]
            }
          },
          orderBy: { updatedAt: "desc" }
        });

        if (existing) {
          const nextRoomCode = roomCode || existing.roomCode || null;
          const nextRoomMode = roomMode || existing.roomMode || "ffa";
          const nextStakeKey = String(body?.stakeKey || "").trim() || existing.stakeKey || null;
          const nextStakeAmount = Math.max(0, Number(body?.stakeAmount ?? existing.stakeAmount ?? 0));
          const nextHumanSeats = Math.max(0, Number(body?.humanSeats ?? existing.humanSeats ?? 0));
          const nextTotalPlayers = Math.max(0, Number(body?.totalPlayers ?? existing.totalPlayers ?? 0));
          const nextIsTeamMode = body?.isTeamMode === undefined ? existing.isTeamMode : Boolean(body?.isTeamMode);
          const nextExpiresAt = body?.expiresAt ? expiresAt : existing.expiresAt || expiresAt;
          return tx.roomInvitation.update({
            where: { id: existing.id },
            data: {
              ...invitationData,
              roomCode: nextRoomCode,
              roomMode: nextRoomMode,
              stakeKey: nextStakeKey,
              stakeAmount: nextStakeAmount,
              humanSeats: nextHumanSeats,
              totalPlayers: nextTotalPlayers,
              isTeamMode: nextIsTeamMode,
              expiresAt: nextExpiresAt,
              note: note ?? existing.note ?? null
            },
            include: invitationInclude
          });
        }

        return tx.roomInvitation.create({
          data: invitationData,
          include: invitationInclude
        });
      })
      .catch(async (error) => {
        if (!this.isUniqueConstraintError(error)) {
          throw error;
        }

        const fallback = await this.prisma.roomInvitation.findFirst({
          where: {
            roomId: cleanRoomId,
            inviterPlayerId: currentPlayer.id,
            inviteePlayerId,
            status: {
              in: ["pending", "accepted"]
            }
          },
          orderBy: { updatedAt: "desc" }
        });

        if (!fallback) {
          throw error;
        }

        return this.prisma.roomInvitation.update({
          where: { id: fallback.id },
          data: invitationData,
          include: invitationInclude
        });
      });

    const invite = this.summarizeInvite(row as any);
    if (options.emitEvents !== false) {
      this.emitSseEvent(inviteePlayerId, "invite_update", { type: "invite_created", invite });
      this.emitSseEvent(currentPlayer.id, "invite_update", { type: "invite_created", invite });
    }

    return { item: invite };
  }

  async acceptRoomInvitation(headers: IncomingHttpHeaders, id: string) {
    const currentPlayer = await this.getCurrentPlayer(headers);
    return this.acceptRoomInvitationForPlayer(currentPlayer, id);
  }

  async acceptRoomInvitationForPlayer(
    currentPlayer: { id: string; displayName?: string },
    id: string,
    options: SocialRealtimeEmitOptions = {}
  ) {
    const row = await this.prisma.roomInvitation.findUnique({
      where: { id },
      include: {
        inviter: { select: this.playerSelect() },
        invitee: { select: this.playerSelect() }
      }
    });
    if (!row) {
      throw new NotFoundException("Invitation not found");
    }
    if (row.inviteePlayerId !== currentPlayer.id) {
      throw new ForbiddenException("Invitation not found");
    }
    const isExpired = row.status === "expired" || (row.expiresAt && row.expiresAt.getTime() <= Date.now());
    if (isExpired) {
      const expired = row.status === "expired"
        ? row
        : await this.prisma.roomInvitation.update({
            where: { id },
            data: {
              status: "expired",
              respondedAt: new Date()
            },
            include: {
              inviter: { select: this.playerSelect() },
              invitee: { select: this.playerSelect() }
            }
          });
      return {
        ok: false,
        reason: "room_not_available",
        item: this.summarizeInvite(expired as any)
      };
    }
    if (row.status === "accepted") {
      const accepted = this.summarizeInvite(row);
      const roomCode = String(accepted.roomCode || "").trim();
      if (!roomCode) {
        return {
          ok: false,
          reason: "room_not_available",
          item: accepted
        };
      }
      return {
        ok: true,
        item: accepted,
        join: {
          roomCode,
          roomId: String(accepted.roomId || "").trim(),
          roomMode: String(accepted.roomMode || "ffa").trim(),
          stakeKey: String(accepted.stakeKey || "").trim() || null,
          expiresAt: accepted.expiresAt
        }
      };
    }
    if (row.status !== "pending") {
      throw new BadRequestException("Invitation already responded");
    }

    const accepted = await this.prisma.roomInvitation.update({
      where: { id },
      data: {
        status: "accepted",
        respondedAt: new Date()
      },
      include: {
        inviter: { select: this.playerSelect() },
        invitee: { select: this.playerSelect() }
      }
    });

    const invite = this.summarizeInvite(accepted);
    if (options.emitEvents !== false) {
      this.emitSseEvent(accepted.inviterPlayerId, "invite_update", { type: "invite_accepted", invite });
      this.emitSseEvent(accepted.inviteePlayerId, "invite_update", { type: "invite_accepted", invite });
    }

    const roomCode = String(invite.roomCode || "").trim();
    if (!roomCode) {
      return {
        ok: false,
        reason: "room_not_available",
        item: invite
      };
    }

    return {
      ok: true,
      item: invite,
      join: {
        roomCode,
        roomId: String(invite.roomId || "").trim(),
        roomMode: String(invite.roomMode || "ffa").trim(),
        stakeKey: String(invite.stakeKey || "").trim() || null,
        expiresAt: invite.expiresAt
      }
    };
  }

  async declineRoomInvitation(headers: IncomingHttpHeaders, id: string) {
    const currentPlayer = await this.getCurrentPlayer(headers);
    return this.declineRoomInvitationForPlayer(currentPlayer, id);
  }

  async declineRoomInvitationForPlayer(
    currentPlayer: { id: string; displayName?: string },
    id: string,
    options: SocialRealtimeEmitOptions = {}
  ) {
    const row = await this.prisma.roomInvitation.findUnique({ where: { id } });
    if (!row) {
      throw new NotFoundException("Invitation not found");
    }
    if (row.inviteePlayerId !== currentPlayer.id) {
      throw new ForbiddenException("Invitation not found");
    }
    if (row.status === "expired") {
      throw new BadRequestException("Invitation expired");
    }
    if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) {
      await this.prisma.roomInvitation.update({
        where: { id },
        data: {
          status: "expired",
          respondedAt: new Date()
        },
        include: {
          inviter: { select: this.playerSelect() },
          invitee: { select: this.playerSelect() }
        }
      });
      throw new BadRequestException(`Invitation expired`);
    }
    if (row.status === "declined") {
      return { item: this.summarizeInvite(row as any) };
    }
    if (row.status !== "pending") {
      throw new BadRequestException("Invitation already responded");
    }

    const declined = await this.prisma.roomInvitation.update({
      where: { id },
      data: {
        status: "declined",
        respondedAt: new Date()
      },
      include: {
        inviter: { select: this.playerSelect() },
        invitee: { select: this.playerSelect() }
      }
    });

    const invite = this.summarizeInvite(declined);
    if (options.emitEvents !== false) {
      this.emitSseEvent(declined.inviterPlayerId, "invite_update", { type: "invite_declined", invite });
      this.emitSseEvent(declined.inviteePlayerId, "invite_update", { type: "invite_declined", invite });
    }

    return { item: invite };
  }

  async cancelRoomInvitation(headers: IncomingHttpHeaders, id: string) {
    const currentPlayer = await this.getCurrentPlayer(headers);
    return this.cancelRoomInvitationForPlayer(currentPlayer, id);
  }

  async cancelRoomInvitationForPlayer(
    currentPlayer: { id: string; displayName?: string },
    id: string,
    options: SocialRealtimeEmitOptions = {}
  ) {
    const row = await this.prisma.roomInvitation.findUnique({
      where: { id },
      include: {
        inviter: { select: this.playerSelect() },
        invitee: { select: this.playerSelect() }
      }
    });
    if (!row) {
      throw new NotFoundException("Invitation not found");
    }
    if (row.inviterPlayerId !== currentPlayer.id) {
      throw new ForbiddenException("Invitation not found");
    }
    if (row.status === "revoked") {
      return { item: this.summarizeInvite(row) };
    }
    if (row.status === "expired") {
      throw new BadRequestException("Invitation expired");
    }
    if (row.status !== "pending") {
      throw new BadRequestException("Invitation already responded");
    }

    const cancelled = await this.prisma.roomInvitation.update({
      where: { id },
      data: {
        status: "revoked",
        respondedAt: new Date()
      },
      include: {
        inviter: { select: this.playerSelect() },
        invitee: { select: this.playerSelect() }
      }
    });

    const invite = this.summarizeInvite(cancelled);
    if (options.emitEvents !== false) {
      this.emitSseEvent(cancelled.inviteePlayerId, "invite_update", { type: "invite_cancelled", invite });
      this.emitSseEvent(cancelled.inviterPlayerId, "invite_update", { type: "invite_cancelled", invite });
    }

    return { item: invite };
  }
}
