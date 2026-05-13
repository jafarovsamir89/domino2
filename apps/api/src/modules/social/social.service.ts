import type { IncomingHttpHeaders } from "node:http";

import { BadRequestException, ForbiddenException, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { Prisma } from "@prisma/client";

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
  constructor(
    private readonly prisma: PrismaService,
    private readonly authService: AuthService
  ) {}

  private async getCurrentPlayer(headers: IncomingHttpHeaders) {
    const profile = await this.authService.getCurrentProfile(headers);
    if (!profile?.player?.id) {
      throw new UnauthorizedException("Sign in required");
    }

    return profile.player;
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
        type: "shop_purchase",
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
        type: "refund",
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

  async searchPlayers(headers: IncomingHttpHeaders, query?: string) {
    const currentPlayer = await this.getCurrentPlayer(headers);
    const search = String(query || "").trim();
    if (!search) {
      return { items: [] };
    }

    const players = await this.prisma.player.findMany({
      where: {
        id: { not: currentPlayer.id },
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

    return {
      items: players.map((player) => this.summarizePlayer(player))
    };
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

    return {
      item: this.summarizeFriend(currentPlayer.id, pending)
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
    if (row.addresseePlayerId !== currentPlayer.id && row.requesterPlayerId !== currentPlayer.id) {
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

    return { item: this.summarizeFriend(currentPlayer.id, accepted) };
  }

  async declineFriend(headers: IncomingHttpHeaders, id: string) {
    const currentPlayer = await this.getCurrentPlayer(headers);
    const row = await this.prisma.friendConnection.findUnique({ where: { id } });
    if (!row) {
      throw new NotFoundException("Friend request not found");
    }
    if (row.addresseePlayerId !== currentPlayer.id && row.requesterPlayerId !== currentPlayer.id) {
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

    return { item: this.summarizeFriend(currentPlayer.id, declined) };
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

    await this.prisma.friendConnection.delete({ where: { id } });
    return { ok: true };
  }

  async getRoomInvitations(headers: IncomingHttpHeaders) {
    const currentPlayer = await this.getCurrentPlayer(headers);
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

    const items = rows.map((row) => this.summarizeGiftInventory(row as unknown as GiftInventoryRow));
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

      return {
        wallet,
        gift: this.summarizeGiftTransaction(gift as unknown as GiftTransactionRow),
        inventory: this.summarizeGiftInventory(inventory as unknown as GiftInventoryRow)
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

      const wallet = await this.creditWallet(
        tx,
        currentPlayer.id,
        exchangeValue,
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

    const expiresAt = body?.expiresAt ? new Date(body.expiresAt) : new Date(Date.now() + 1000 * 60 * 60 * 24);
    const payloadJson = body?.payloadJson === undefined ? null : body.payloadJson;
    const payloadJsonData = payloadJson === null ? {} : { payloadJson: payloadJson as Prisma.InputJsonValue };
    const roomCode = String(body?.roomCode || "").trim() || null;
    const roomMode = String(body?.roomMode || (body?.isTeamMode ? "team" : "ffa") || "ffa").trim();
    const note = String(body?.note || "").trim() || null;

    const existing = await this.prisma.roomInvitation.findFirst({
      where: {
        roomId: cleanRoomId,
        inviterPlayerId: currentPlayer.id,
        inviteePlayerId,
        status: "pending"
      },
      orderBy: { createdAt: "desc" }
    });

    const row = existing
      ? await this.prisma.roomInvitation.update({
          where: { id: existing.id },
          data: {
            roomCode,
            roomMode,
            stakeKey: String(body?.stakeKey || "").trim() || null,
            stakeAmount: Math.max(0, Number(body?.stakeAmount || 0)),
            humanSeats: Math.max(0, Number(body?.humanSeats || 0)),
            totalPlayers: Math.max(0, Number(body?.totalPlayers || 0)),
            isTeamMode: Boolean(body?.isTeamMode),
            note,
            ...payloadJsonData,
            expiresAt
          },
          include: {
            inviter: { select: this.playerSelect() },
            invitee: { select: this.playerSelect() }
          }
        })
      : await this.prisma.roomInvitation.create({
          data: {
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
          },
          include: {
            inviter: { select: this.playerSelect() },
            invitee: { select: this.playerSelect() }
          }
        });

    return { item: this.summarizeInvite(row as any) };
  }

  async acceptRoomInvitation(headers: IncomingHttpHeaders, id: string) {
    const currentPlayer = await this.getCurrentPlayer(headers);
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

    return { item: this.summarizeInvite(accepted) };
  }

  async declineRoomInvitation(headers: IncomingHttpHeaders, id: string) {
    const currentPlayer = await this.getCurrentPlayer(headers);
    const row = await this.prisma.roomInvitation.findUnique({ where: { id } });
    if (!row) {
      throw new NotFoundException("Invitation not found");
    }
    if (row.inviteePlayerId !== currentPlayer.id) {
      throw new ForbiddenException("Invitation not found");
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

    return { item: this.summarizeInvite(declined) };
  }
}
